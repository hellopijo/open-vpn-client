const { ipcRenderer } = require('electron');

const connectBtn = document.getElementById('connectBtn');
const statusDiv = document.getElementById('status');
const statusDetailsDiv = document.getElementById('statusDetails');

let isConnecting = false;
let isConnected = false;

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  console.log('VPN Client initialized');
  // Request current status on startup
  ipcRenderer.send('get-vpn-status');
});

// Handle connect button click
connectBtn.addEventListener('click', () => {
  if (isConnecting) {
    console.log('Connection in progress, ignoring click');
    return;
  }
  
  console.log('Connect button clicked');
  ipcRenderer.send('vpn-connect');
});

// Listen for status updates from main process
ipcRenderer.on('vpn-status', (event, status) => {
  console.log('Received status update:', status);
  updateUI(status);
});

function updateUI(status) {
  const indicator = statusDiv.querySelector('.status-indicator');
  
  // Remove existing status classes
  indicator.classList.remove('status-disconnected', 'status-connecting', 'status-connected', 'status-error');
  
  // Remove loading animation if present
  const existingLoader = connectBtn.querySelector('.loading');
  if (existingLoader) {
    existingLoader.remove();
  }
  
  if (status === 'Connected') {
    // Connected state
    isConnected = true;
    isConnecting = false;
    
    statusDiv.innerHTML = '<span class="status-indicator status-connected"></span>Connected';
    statusDetailsDiv.textContent = 'VPN connection established. Your IP is now masked.';
    
    connectBtn.textContent = 'Disconnect VPN';
    connectBtn.classList.add('disconnect');
    connectBtn.disabled = false;
    
  } else if (status === 'Disconnected') {
    // Disconnected state
    isConnected = false;
    isConnecting = false;
    
    statusDiv.innerHTML = '<span class="status-indicator status-disconnected"></span>Disconnected';
    statusDetailsDiv.textContent = 'Click the button below to connect to VPN';
    
    connectBtn.textContent = 'Connect VPN';
    connectBtn.classList.remove('disconnect');
    connectBtn.disabled = false;
    
  } else if (status === 'Connecting...' || status === 'Authenticating...') {
    // Connecting state
    isConnecting = true;
    isConnected = false;
    
    statusDiv.innerHTML = '<span class="status-indicator status-connecting"></span>' + status;
    statusDetailsDiv.textContent = 'Please wait while establishing VPN connection...';
    
    connectBtn.innerHTML = 'Connecting<span class="loading"></span>';
    connectBtn.classList.remove('disconnect');
    connectBtn.disabled = true;
    
  } else if (status.startsWith('Error:')) {
    // Error state
    isConnecting = false;
    isConnected = false;
    
    statusDiv.innerHTML = '<span class="status-indicator status-error"></span>Error';
    statusDetailsDiv.textContent = status;
    
    connectBtn.textContent = 'Retry Connection';
    connectBtn.classList.remove('disconnect');
    connectBtn.disabled = false;
    
    // Auto-retry after 3 seconds for certain errors
    if (status.includes('Cannot reach server') || status.includes('Connection refused')) {
      setTimeout(() => {
        if (!isConnected && !isConnecting) {
          console.log('Auto-retrying connection...');
          statusDetailsDiv.textContent = 'Auto-retrying connection...';
          setTimeout(() => {
            ipcRenderer.send('vpn-connect');
          }, 1000);
        }
      }, 3000);
    }
  } else {
    // Unknown status
    statusDiv.innerHTML = '<span class="status-indicator status-error"></span>' + status;
    statusDetailsDiv.textContent = 'Unknown status received';
    connectBtn.disabled = false;
  }
}

// Handle app focus/blur for status updates
window.addEventListener('focus', () => {
  // Request status update when window gains focus
  ipcRenderer.send('get-vpn-status');
});

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
  // Space or Enter to toggle connection
  if (event.code === 'Space' || event.code === 'Enter') {
    event.preventDefault();
    if (!connectBtn.disabled) {
      connectBtn.click();
    }
  }
  
  // Escape to disconnect if connected
  if (event.code === 'Escape' && isConnected) {
    connectBtn.click();
  }
});

// Prevent context menu
document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

// Handle unload - cleanup
window.addEventListener('beforeunload', () => {
  console.log('Window closing, cleaning up...');
});
