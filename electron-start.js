const { app, BrowserWindow } = require('electron');
const path = require('path');
const url = require('url');

function createWindow () {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      contextIsolation: true,
    }
  });

  win.loadURL(
    url.format({
      pathname: path.join(__dirname, 'dist/StellerPhoneNotesApp/index.html'),
      protocol: 'file:',
      slashes: true
    })
  );

  // debug
  // win.webContents.openDevTools();
}

app.on('ready', createWindow);
