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
  onFocus: (cb) => on('win:focus', cb), // foco da janela (modo econômico)
  readFile: (name) => ipcRenderer.invoke('fs:read', String(name)),
  pdf: {
    bounds: (rect) => ipcRenderer.send('pdf:bounds', rect),
    front: () => ipcRenderer.send('pdf:front'),
    close: () => ipcRenderer.send('pdf:close'),
  },
  staticInfo: () => ipcRenderer.invoke('sys:static'),
  web: {
    open: (url) => ipcRenderer.send('web:open', String(url)),
    bounds: (rect) => ipcRenderer.send('web:bounds', rect),
    nav: (action) => ipcRenderer.send('web:nav', String(action)),
    front: () => ipcRenderer.send('web:front'),
    close: () => ipcRenderer.send('web:close'),
    focus: () => ipcRenderer.send('web:focus'),
    key: (seq) => ipcRenderer.send('web:key', String(seq)),
    adblock: (on) => ipcRenderer.send('web:adblock', Boolean(on)),
    onState: (cb) => on('web:state', cb),
    onSnapshot: (cb) => on('web:snapshot', cb), // só no modo de capturas
    onHubKey: (cb) => on('web:hubkey', cb), // atalho do hub apertado com o foco na página
  },
  music: {
    open: () => ipcRenderer.send('music:open'),
    bounds: (rect) => ipcRenderer.send('music:bounds', rect),
    front: () => ipcRenderer.send('music:front'),
    control: (action) => ipcRenderer.send('music:control', String(action)),
    seek: (fraction) => ipcRenderer.send('music:seek', Number(fraction)),
    nav: (action) => ipcRenderer.send('music:nav', String(action)),
    quit: () => ipcRenderer.send('music:quit'),
    forget: () => ipcRenderer.invoke('music:forget'),
    onState: (cb) => on('music:state', cb),
  },
});
