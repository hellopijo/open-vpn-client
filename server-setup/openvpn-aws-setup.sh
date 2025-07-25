#!/bin/bash

# OpenVPN Server Setup Script for AWS EC2 (Ubuntu)
# This script automates the installation and configuration of OpenVPN server
# Run with: sudo bash openvpn-aws-setup.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    error "Please run as root (use sudo)"
fi

# Get server's public IP
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || curl -s https://ipinfo.io/ip)
if [ -z "$PUBLIC_IP" ]; then
    warn "Could not automatically detect public IP. Please enter it manually:"
    read -p "Enter your server's public IP: " PUBLIC_IP
fi

log "Detected public IP: $PUBLIC_IP"

# Update system
log "Updating system packages..."
apt-get update && apt-get upgrade -y

# Install required packages
log "Installing OpenVPN and Easy-RSA..."
apt-get install -y openvpn easy-rsa iptables-persistent

# Create Easy-RSA directory
log "Setting up Easy-RSA..."
make-cadir /etc/openvpn/easy-rsa
cd /etc/openvpn/easy-rsa

# Create vars file with default values
log "Creating Easy-RSA configuration..."
cat > vars <<EOF
export KEY_COUNTRY="US"
export KEY_PROVINCE="CA"
export KEY_CITY="San Francisco"
export KEY_ORG="SimpleVPN"
export KEY_EMAIL="admin@simplevpn.com"
export KEY_OU="SimpleVPN-Unit"
export KEY_NAME="server"
export KEY_CN="SimpleVPN-Server"
EOF

# Source vars and initialize PKI
source vars
./clean-all

# Build CA
log "Building Certificate Authority..."
./build-ca --batch

# Build server certificate and key
log "Building server certificate and key..."
./build-key-server --batch server

# Generate Diffie-Hellman parameters
log "Generating Diffie-Hellman parameters (this may take a while)..."
./build-dh

# Generate TLS auth key
log "Generating TLS authentication key..."
openvpn --genkey --secret keys/ta.key

# Build client certificate and key
log "Building client certificate and key..."
./build-key --batch client

# Copy keys to OpenVPN directory
log "Copying certificates and keys..."
cd /etc/openvpn
cp easy-rsa/keys/{server.crt,server.key,ca.crt,ta.key,dh2048.pem,client.crt,client.key} .

# Create server configuration
log "Creating OpenVPN server configuration..."
cat > /etc/openvpn/server.conf <<EOF
# OpenVPN Server Configuration
port 1194
proto udp
dev tun

# SSL/TLS root certificate (ca), certificate (cert), and private key (key)
ca ca.crt
cert server.crt
key server.key

# Diffie hellman parameters
dh dh2048.pem

# Network topology
topology subnet

# Configure server mode and supply a VPN subnet
server 10.8.0.0 255.255.255.0

# Maintain a record of client <-> virtual IP address associations
ifconfig-pool-persist /var/log/openvpn/ipp.txt

# Configure server mode for ethernet bridging
;server-bridge 10.8.0.4 255.255.255.0 10.8.0.50 10.8.0.100

# Push routes to the client to allow it to reach other private subnets
;push "route 192.168.10.0 255.255.255.0"
;push "route 192.168.20.0 255.255.255.0"

# To assign specific IP addresses to specific clients
;client-config-dir ccd
;route 192.168.40.128 255.255.255.248

# Push DNS servers to clients
push "dhcp-option DNS 8.8.8.8"
push "dhcp-option DNS 8.8.4.4"

# Redirect all client traffic through VPN
push "redirect-gateway def1 bypass-dhcp"

# Allow client-to-client communication
client-to-client

# Keep connections alive
keepalive 10 120

# TLS authentication
tls-auth ta.key 0

# Cipher and authentication
cipher AES-256-CBC
auth SHA256

# Enable compression
comp-lzo

# Maximum number of concurrently connected clients
max-clients 100

# Run OpenVPN as unprivileged user
user nobody
group nogroup

# Persist certain options that may no longer be available
persist-key
persist-tun

# Output a short status file
status /var/log/openvpn/openvpn-status.log

# Log verbosity level
verb 3

# Silence repeating messages
mute 20

# Notify the client when the server restarts
explicit-exit-notify 1
EOF

# Create log directory
mkdir -p /var/log/openvpn

# Enable IP forwarding
log "Enabling IP forwarding..."
echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
sysctl -p

# Configure firewall rules
log "Configuring firewall rules..."

# Get the network interface name
INTERFACE=$(ip route | grep default | awk '{print $5}' | head -n1)
log "Detected network interface: $INTERFACE"

# Configure iptables for NAT
iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o $INTERFACE -j MASQUERADE
iptables -A INPUT -i tun+ -j ACCEPT
iptables -A FORWARD -i tun+ -j ACCEPT
iptables -A FORWARD -i tun+ -o $INTERFACE -m state --state RELATED,ESTABLISHED -j ACCEPT
iptables -A FORWARD -i $INTERFACE -o tun+ -m state --state RELATED,ESTABLISHED -j ACCEPT
iptables -A INPUT -i $INTERFACE -p udp --dport 1194 -j ACCEPT

# Save iptables rules
iptables-save > /etc/iptables/rules.v4

# Enable and start OpenVPN service
log "Starting OpenVPN service..."
systemctl enable openvpn@server
systemctl start openvpn@server

# Wait a moment for service to start
sleep 3

# Check service status
if systemctl is-active --quiet openvpn@server; then
    log "OpenVPN server started successfully!"
else
    error "Failed to start OpenVPN server. Check logs with: journalctl -u openvpn@server"
fi

# Create client configuration file
log "Creating client configuration template..."
cat > /etc/openvpn/client-template.ovpn <<EOF
client
dev tun
proto udp
remote $PUBLIC_IP 1194
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-CBC
auth SHA256
key-direction 1
comp-lzo
verb 3
mute 20

# DNS settings
dhcp-option DNS 8.8.8.8
dhcp-option DNS 8.8.4.4

# Redirect all traffic through VPN
redirect-gateway def1 bypass-dhcp

# Keep connection alive
keepalive 10 120
ping-timer-rem
persist-tun
persist-key

<ca>
$(cat /etc/openvpn/ca.crt)
</ca>

<cert>
$(cat /etc/openvpn/client.crt)
</cert>

<key>
$(cat /etc/openvpn/client.key)
</key>

<tls-auth>
$(cat /etc/openvpn/ta.key)
</tls-auth>
EOF

# Set proper permissions
chmod 600 /etc/openvpn/client-template.ovpn
chmod 600 /etc/openvpn/*.key
chmod 644 /etc/openvpn/*.crt

# Display completion message
log "========================================="
log "OpenVPN Server Setup Complete!"
log "========================================="
log "Server IP: $PUBLIC_IP"
log "Port: 1194 (UDP)"
log "Client config: /etc/openvpn/client-template.ovpn"
log ""
log "Next steps:"
log "1. Download the client config file:"
log "   scp root@$PUBLIC_IP:/etc/openvpn/client-template.ovpn ./config.ovpn"
log ""
log "2. Replace the contents of your local config.ovpn with the downloaded file"
log ""
log "3. Make sure your AWS Security Group allows UDP traffic on port 1194"
log ""
log "4. Test the connection with your VPN client"
log ""
log "To check server status: systemctl status openvpn@server"
log "To view logs: journalctl -u openvpn@server -f"
log "To restart server: systemctl restart openvpn@server"
log "========================================="

# Create a simple status check script
cat > /usr/local/bin/vpn-status <<'EOF'
#!/bin/bash
echo "=== OpenVPN Server Status ==="
systemctl status openvpn@server --no-pager
echo ""
echo "=== Connected Clients ==="
if [ -f /var/log/openvpn/openvpn-status.log ]; then
    cat /var/log/openvpn/openvpn-status.log | grep "^CLIENT_LIST" | awk -F',' '{print "Client: " $2 " | Virtual IP: " $3 " | Connected: " $4}'
else
    echo "No status log found"
fi
echo ""
echo "=== Server Configuration ==="
echo "Public IP: $(curl -s https://ipinfo.io/ip)"
echo "Port: 1194 (UDP)"
echo "Network: 10.8.0.0/24"
EOF

chmod +x /usr/local/bin/vpn-status

log "Setup complete! Run 'vpn-status' to check server status anytime."
