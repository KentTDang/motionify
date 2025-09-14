const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  sendPostureStatus: (status) => ipcRenderer.send('posture-status', status)
})