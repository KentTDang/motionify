const { app, BrowserWindow, Tray, nativeImage, Notification } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let stretchIntervalId = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL('http://localhost:3000');
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-good-Template.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16, quality: 'best' });
  tray = new Tray(icon);
  tray.setToolTip('Stretch reminders active');
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.motionify.stretchreminder');
  }

  createWindow();
  createTray();

  // 🔔 Fire one right away to confirm

  // 🔔 Notify every 2 minutes
  const TWO_MIN = 60 * 1000;
  if (!stretchIntervalId) {
    stretchIntervalId = setInterval(() => {
      new Notification({
        title: "Time to Stretch!",
        body: "Stand up, move around, and reset your posture.",
        silent: false
      }).show();
    }, TWO_MIN);
  }
  const { ipcMain } = require('electron');

// 🟢 Update tray + notification based on posture
ipcMain.on("posture-status", (event, status) => {
  console.log("📩 posture-status:", status);

  if (!tray) return;

  let iconFile = "tray-good-Template.png";
  let tooltip = "Good Posture";

  if (status === "Bad Posture") {
    iconFile = "tray-bad-Template.png";
    tooltip = "Bad Posture";

    
  }

  const newIcon = nativeImage
    .createFromPath(path.join(__dirname, "assets", iconFile))
    .resize({ width: 16, height: 16, quality: "best" });

  tray.setImage(newIcon);
  tray.setToolTip(`Posture Status: ${tooltip}`);
});

});


app.on('window-all-closed', () => {
  if (stretchIntervalId) {
    clearInterval(stretchIntervalId);
    stretchIntervalId = null;
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
