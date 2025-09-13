const { app, BrowserWindow, Tray, ipcMain, nativeImage } = require('electron');
const path = require('path');

// Keep references to prevent garbage collection
let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,        // Set your preferred width
    height: 768,        // Set your preferred height
    minWidth: 800,      // Minimum window size
    minHeight: 600,     // Minimum window size
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL('http://localhost:3000');
  
  // Uncomment to remember window size and position
  // mainWindow.on('close', () => {
  //   const bounds = mainWindow.getBounds();
  //   storage.set('windowBounds', bounds);
  // });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-good-Template.png');
  
  // Create a native image and resize it with specific options
  const icon = nativeImage.createFromPath(iconPath).resize({
    width: 16,
    height: 16,
    quality: 'best'
  });
  
  tray = new Tray(icon);
  tray.setToolTip('Posture Status: Good');
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Listen for posture updates from renderer
  ipcMain.on('posture-status', (event, status) => {
    if (!tray) return;
    
    const isGoodPosture = status === 'Good Posture';
    const iconName = isGoodPosture ? 'tray-good-Template.png' : 'tray-bad-Template.png';
    const newIconPath = path.join(__dirname, 'assets', iconName);
    
    // Resize the new icon consistently
    const newIcon = nativeImage.createFromPath(newIconPath).resize({
      width: 16,
      height: 16,
      quality: 'best'
    });
    
    tray.setImage(newIcon);
    tray.setToolTip(`Posture Status: ${status}`);
  });
});

// Prevent window from being garbage collected
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});