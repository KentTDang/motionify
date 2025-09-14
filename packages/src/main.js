// main.js
const { app, BrowserWindow, Tray, nativeImage, Notification, ipcMain } = require('electron');
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
      backgroundThrottling: false, // keep timers/camera logic alive when hidden/minimized
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL('http://localhost:3000');

  // Optional: minimize-to-tray
  mainWindow.on('minimize', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-good-Template.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16, quality: 'best' });
  tray = new Tray(icon);
  tray.setToolTip('Stretch reminders active');

  // Show on double-click
  tray.on('double-click', () => {
    if (mainWindow) mainWindow.show();
  });
}

function setTray(kind /* 'good' | 'bad' */) {
  if (!tray) return;
  const iconFile = kind === 'bad' ? 'tray-bad-Template.png' : 'tray-good-Template.png';
  const tooltip  = kind === 'bad' ? 'Bad Posture' : 'Good Posture';

  const newIcon = nativeImage
    .createFromPath(path.join(__dirname, 'assets', iconFile))
    .resize({ width: 16, height: 16, quality: 'best' });

  tray.setImage(newIcon);
  tray.setToolTip(`Posture Status: ${tooltip}`);
}

// ---- posture → tray mapping with stickiness ----
const BAD_STATUS = new Set([
  'Bad Posture',
  'Bad Posture Alert',
  'Posture Needs Attention',
  'Poor Posture Detected Over Time'
  // add any other renderer strings you consider "bad"
]);

let trayIsBad = false;         // what the tray is currently showing
let lastAppliedAt = 0;         // when we last changed the tray
const STICK_MS = 4000;         // don’t flip again within 4s

ipcMain.on("posture-status", (event, status) => {
  if (!tray) return;

  let iconFile = status === "Bad Posture"
    ? "tray-bad-Template.png"
    : "tray-good-Template.png";

  const newIcon = nativeImage
    .createFromPath(path.join(__dirname, "assets", iconFile))
    .resize({ width: 16, height: 16, quality: "best" });

  tray.setImage(newIcon);
  tray.setToolTip(`Posture Status: ${status}`);
});


app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.motionify.stretchreminder');
  }

  createWindow();
  createTray();

  // 🔔 Periodic stretch reminder (change interval to taste)
  const TWO_MIN = 60 * 1000;
  if (!stretchIntervalId) {
    stretchIntervalId = setInterval(() => {
      new Notification({
        title: 'Time to Stretch!',
        body: 'Stand up, move around, and reset your posture.',
        silent: false
      }).show();
    }, TWO_MIN);
  }
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
