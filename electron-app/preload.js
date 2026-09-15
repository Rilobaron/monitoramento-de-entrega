const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  selectWorkbook: () => ipcRenderer.invoke('select-workbook'),
  loadWorkbookPath: file => ipcRenderer.invoke('load-workbook-path', webUtils.getPathForFile(file)),
  loadLatestWorkbook: () => ipcRenderer.invoke('load-latest-workbook'),
  captureReport: options => ipcRenderer.invoke('capture-report', options)
});
