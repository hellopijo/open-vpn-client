const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let vpnProcess = null;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 400,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets/icon.png'), // Optional icon
    titleBarStyle: 'default',
    show: false
  });

  mainWindow.loadFile('index.html');
  
  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
    // Kill VPN process if running
    if (vpnProcess) {
      vpnProcess.kill('SIGTERM');
      vpnProcess = null;
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Kill VPN process before quitting
  if (vpnProcess) {
    vpnProcess.kill('SIGTERM');
    vpnProcess = null;
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle VPN connection/disconnection
ipcMain.on('vpn-connect', (event, args) => {
  console.log('VPN connect request received');
  
  // If VPN is active, clicking the button will disconnect it
  if (vpnProcess) {
    console.log('Disconnecting VPN...');
    vpnProcess.kill('SIGTERM');
    vpnProcess = null;
    mainWindow.webContents.send('vpn-status', 'Disconnected');
    return;
  }

  // Check if config file exists
  const ovpnPath = path.join(__dirname, 'config.ovpn');
  const fs = require('fs');
  
  if (!fs.existsSync(ovpnPath)) {
    console.error('OpenVPN config file not found:', ovpnPath);
    mainWindow.webContents.send('vpn-status', 'Error: Config file not found');
    return;
  }

  console.log('Starting VPN connection...');
  mainWindow.webContents.send('vpn-status', 'Connecting...');

  // Spawn the OpenVPN process with the config file
  try {
    vpnProcess = spawn('openvpn', ['--config', ovpnPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    vpnProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`OpenVPN stdout: ${output}`);
      
      // Check for successful connection indicators
      if (output.includes("Initialization Sequence Completed") || 
          output.includes("CONNECTED,SUCCESS")) {
        console.log('VPN Connected Successfully');
        mainWindow.webContents.send('vpn-status', 'Connected');
      }
      
      // Check for authentication success
      if (output.includes("AUTH: Received control message")) {
        mainWindow.webContents.send('vpn-status', 'Authenticating...');
      }
    });

    vpnProcess.stderr.on('data', (data) => {
      const error = data.toString();
      console.error(`OpenVPN stderr: ${error}`);
      
      // Handle common errors
      if (error.includes("AUTH_FAILED")) {
        mainWindow.webContents.send('vpn-status', 'Error: Authentication failed');
      } else if (error.includes("RESOLVE: Cannot resolve host")) {
        mainWindow.webContents.send('vpn-status', 'Error: Cannot reach server');
      } else if (error.includes("Connection refused")) {
        mainWindow.webContents.send('vpn-status', 'Error: Connection refused');
      } else {
        mainWindow.webContents.send('vpn-status', `Error: ${error.substring(0, 100)}`);
      }
    });

    vpnProcess.on('close', (code) => {
      console.log(`VPN process exited with code ${code}`);
      vpnProcess = null;
      
      if (code === 0) {
        mainWindow.webContents.send('vpn-status', 'Disconnected');
      } else {
        mainWindow.webContents.send('vpn-status', `Error: Process exited with code ${code}`);
      }
    });

    vpnProcess.on('error', (error) => {
      console.error('Failed to start VPN process:', error);
      vpnProcess = null;
      
      if (error.code === 'ENOENT') {
        mainWindow.webContents.send('vpn-status', 'Error: OpenVPN not installed');
      } else {
        mainWindow.webContents.send('vpn-status', `Error: ${error.message}`);
      }
    });

  } catch (error) {
    console.error('Error spawning VPN process:', error);
    mainWindow.webContents.send('vpn-status', `Error: ${error.message}`);
  }
});

// Handle getting current VPN status
ipcMain.on('get-vpn-status', (event) => {
  const status = vpnProcess ? 'Connected' : 'Disconnected';
  mainWindow.webContents.send('vpn-status', status);
});
