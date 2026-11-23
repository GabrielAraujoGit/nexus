'use strict';
// Ponte mínima entre a interface e o processo principal.
const { contextBridge, ipcRenderer } = require('electron');

function on(channel, cb) {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('nexus', {
  spawn: (cols, rows) => ipcRenderer.send('pty:spawn', { cols, rows }),
  write: (data) => ipcRenderer.send('pty:write', String(data)),
  resize: (cols, rows) => ipcRenderer.send('pty:resize', { cols, rows }),
  onData: (cb) => on('pty:data', cb),
  onTick: (cb) => on('sys:tick', cb),
  onSlow: (cb) => on('sys:slow', cb),
  onFiles: (cb) => on('fs:list', cb),
  staticInfo: () => ipcRenderer.invoke('sys:static'),
  web: {
    open: (url) => ipcRenderer.send('web:open', String(url)),
    bounds: (rect) => ipcRenderer.send('web:bounds', rect),
    nav: (action) => ipcRenderer.send('web:nav', String(action)),
    close: () => ipcRenderer.send('web:close'),
    onState: (cb) => on('web:state', cb),
  },
});
