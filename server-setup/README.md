# OpenVPN AWS EC2 Server Setup Guide

This guide will help you set up an OpenVPN server on your AWS EC2 instance to work with the Simple VPN client application.

## Prerequisites

### AWS EC2 Instance Requirements
- **Operating System**: Ubuntu 20.04 LTS or newer
- **Instance Type**: t2.micro or larger (t2.micro is sufficient for personal use)
- **Storage**: At least 8GB (default is fine)
- **Key Pair**: Make sure you have SSH access to your instance

### Security Group Configuration
Your EC2 instance must have the following ports open in the Security Group:

| Type | Protocol | Port Range | Source | Description |
|------|----------|------------|--------|-------------|
| SSH | TCP | 22 | Your IP | For server management |
| Custom UDP | UDP | 1194 | 0.0.0.0/0 | OpenVPN traffic |

**To configure Security Group:**
1. Go to AWS EC2 Console
2. Select your instance
3. Click on the Security Group
4. Add the inbound rules above

## Server Setup Instructions

### Step 1: Connect to Your EC2 Instance
```bash
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

### Step 2: Upload the Setup Script
You can either:

**Option A: Copy the script content**
```bash
sudo nano openvpn-setup.sh
# Paste the content from openvpn-aws-setup.sh
# Save and exit (Ctrl+X, Y, Enter)
```

**Option B: Download from your repository**
```bash
wget https://raw.githubusercontent.com/yourusername/simple-vpn/main/server-setup/openvpn-aws-setup.sh
```

### Step 3: Make Script Executable and Run
```bash
chmod +x openvpn-aws-setup.sh
sudo ./openvpn-aws-setup.sh
```

The script will:
- Update your system
- Install OpenVPN and Easy-RSA
- Generate all necessary certificates and keys
- Configure the OpenVPN server
- Set up firewall rules and IP forwarding
- Create a client configuration file
- Start the OpenVPN service

### Step 4: Download Client Configuration
After the script completes, download the client configuration:

```bash
scp -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP:/etc/openvpn/client-template.ovpn ./config.ovpn
```

### Step 5: Update Your VPN Client
Replace the contents of your local `config.ovpn` file with the downloaded configuration.

## Verification and Testing

### Check Server Status
```bash
# On your EC2 instance
sudo systemctl status openvpn@server

# Or use the provided status script
vpn-status
```

### View Server Logs
```bash
sudo journalctl -u openvpn@server -f
```

### Test Connection
1. Start your Simple VPN client application
2. Click "Connect VPN"
3. Check the status - it should show "Connected"
4. Verify your IP has changed by visiting https://whatismyipaddress.com

## Troubleshooting

### Common Issues and Solutions

#### 1. Connection Timeout
**Problem**: Client shows "Cannot reach server" or connection timeout
**Solutions**:
- Verify Security Group allows UDP port 1194
- Check if OpenVPN service is running: `sudo systemctl status openvpn@server`
- Verify public IP in client config matches your EC2 public IP

#### 2. Authentication Failed
**Problem**: Client shows "Authentication failed"
**Solutions**:
- Regenerate client certificates:
  ```bash
  cd /etc/openvpn/easy-rsa
  source vars
  ./build-key --batch client2
  ```
- Update client configuration with new certificates

#### 3. DNS Resolution Issues
**Problem**: Connected but can't browse websites
**Solutions**:
- Check if IP forwarding is enabled: `cat /proc/sys/net/ipv4/ip_forward` (should return 1)
- Verify iptables rules: `sudo iptables -t nat -L`
- Restart OpenVPN: `sudo systemctl restart openvpn@server`

#### 4. Service Won't Start
**Problem**: OpenVPN service fails to start
**Solutions**:
- Check configuration syntax: `sudo openvpn --config /etc/openvpn/server.conf --verb 4`
- View detailed logs: `sudo journalctl -u openvpn@server -n 50`
- Verify all certificate files exist in `/etc/openvpn/`

### Log Files Locations
- OpenVPN logs: `/var/log/openvpn/`
- System logs: `journalctl -u openvpn@server`
- Connection status: `/var/log/openvpn/openvpn-status.log`

### Useful Commands
```bash
# Restart OpenVPN service
sudo systemctl restart openvpn@server

# Check connected clients
sudo cat /var/log/openvpn/openvpn-status.log

# Monitor real-time logs
sudo tail -f /var/log/openvpn/openvpn.log

# Check server configuration
sudo cat /etc/openvpn/server.conf

# Test configuration
sudo openvpn --config /etc/openvpn/server.conf --verb 4
```

## Security Considerations

### Production Recommendations
1. **Change default certificates**: Generate new certificates with your organization details
2. **Use strong passwords**: If using password authentication
3. **Limit client connections**: Adjust `max-clients` in server.conf
4. **Regular updates**: Keep your system and OpenVPN updated
5. **Monitor logs**: Regularly check for suspicious activity
6. **Backup certificates**: Store certificates securely

### Certificate Management
```bash
# Generate new client certificate
cd /etc/openvpn/easy-rsa
source vars
./build-key client-name

# Revoke client certificate
./revoke-full client-name
```

## Performance Optimization

### For High Traffic Usage
1. **Increase instance size**: Use t3.small or larger
2. **Optimize network settings**:
   ```bash
   # Add to /etc/sysctl.conf
   net.core.rmem_default = 262144
   net.core.rmem_max = 16777216
   net.core.wmem_default = 262144
   net.core.wmem_max = 16777216
   ```
3. **Use TCP instead of UDP** for better reliability (modify server.conf)

## Maintenance

### Regular Maintenance Tasks
1. **Update system packages**: `sudo apt update && sudo apt upgrade`
2. **Monitor disk space**: `df -h`
3. **Check service status**: `vpn-status`
4. **Review logs**: Look for errors or suspicious activity
5. **Backup configuration**: Backup `/etc/openvpn/` directory

### Backup Important Files
```bash
# Create backup
sudo tar -czf openvpn-backup-$(date +%Y%m%d).tar.gz /etc/openvpn/

# Restore from backup
sudo tar -xzf openvpn-backup-YYYYMMDD.tar.gz -C /
```

## Cost Optimization

### AWS Cost Tips
1. **Use t2.micro**: Eligible for free tier
2. **Monitor data transfer**: VPN traffic counts toward data transfer limits
3. **Stop instance when not needed**: For personal use, stop when not using VPN
4. **Use Elastic IP**: Prevents IP changes when stopping/starting instance

## Support

If you encounter issues not covered in this guide:

1. Check the OpenVPN community forums
2. Review AWS EC2 documentation
3. Examine system logs thoroughly
4. Consider using OpenVPN Access Server for enterprise features

## Additional Resources

- [OpenVPN Official Documentation](https://openvpn.net/community-resources/)
- [AWS EC2 User Guide](https://docs.aws.amazon.com/ec2/)
- [Ubuntu Server Guide](https://ubuntu.com/server/docs)

---

**Note**: This setup is designed for personal use. For production environments, consider additional security measures and monitoring solutions.
