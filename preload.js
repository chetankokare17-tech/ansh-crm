'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mis', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: s => ipcRenderer.invoke('settings:save', s),
  refresh: () => ipcRenderer.invoke('tally:refresh'),
  onStatus: cb => ipcRenderer.on('status', (_e, p) => cb(p)),
});
