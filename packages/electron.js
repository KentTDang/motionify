// electron.js
const {
  app,
  BrowserWindow,
  session,
  systemPreferences,
  BrowserWindowConstructorOptions,
} = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // Keep the renderer like a normal browser page:
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // If you use a preload, do NOT leak process/require to window
      // preload: path.join(__dirname, "preload.js"),
    },
  });

  // (Optional) ask for camera access on macOS
  if (process.platform === "darwin") {
    try {
      systemPreferences.askForMediaAccess("camera");
    } catch {}

    // On macOS 10.14+, you can also ask for 'microphone' if needed
    // systemPreferences.askForMediaAccess("microphone");
  }

  // Allow camera permission prompts in the renderer
  session.defaultSession.setPermissionRequestHandler(
    (wc, permission, callback) => {
      if (permission === "media") return callback(true);
      callback(false);
    }
  );

  const startURL = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../build/index.html")}`;

  win.loadURL(startURL);

  if (isDev) win.webContents.openDevTools({ mode: "undocked" });

  win.on("closed", () => {});
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
