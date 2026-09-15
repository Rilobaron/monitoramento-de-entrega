const { app, BrowserWindow, dialog, ipcMain, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#f4f6f8',
    title: 'Monitoramento de Entregas - ITU',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.removeMenu();
  mainWindow.loadFile('index.html');
}

function normalize(text) {
  return String(text || '').trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
}

function findHeader(headers, alternatives) {
  const normalized = headers.map(normalize);
  for (const name of alternatives) {
    const index = normalized.indexOf(normalize(name));
    if (index >= 0) return index;
  }
  throw new Error(`Coluna obrigatória não encontrada: ${alternatives[0]}`);
}

function excelDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.round(parsed.S));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function readWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false, raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  if (!rows.length) throw new Error('A planilha está vazia.');
  const headers = rows[0];
  const columns = {
    tracking: findHeader(headers, ['Número de pedido JMS', '运单编号']),
    base: findHeader(headers, ['Base de entrega', '派件网点']),
    dispatch: findHeader(headers, ['Tempo de entrega', '派件时间']),
    driver: findHeader(headers, ['Entregador', '派件员']),
    problem: findHeader(headers, ['Horário Registro Pacote Problemático', '问题件时间']),
    delivery: findHeader(headers, ['Horário da entrega', '签收时间'])
  };
  return rows.slice(1).map(row => {
    const dispatch = excelDate(row[columns.dispatch]);
    if (!row[columns.tracking] || !dispatch) return null;
    const delivery = excelDate(row[columns.delivery]);
    const problem = excelDate(row[columns.problem]);
    return {
      tracking: String(row[columns.tracking]),
      base: String(row[columns.base] || 'ITU-SP').trim(),
      dispatch: dateKey(dispatch),
      driver: String(row[columns.driver] || 'SEM MOTORISTA').trim(),
      status: delivery ? 'ENTREGUE' : problem ? 'INSUCESSO' : 'BAIXA PENDENTE'
    };
  }).filter(Boolean);
}

function loadResult(filePath) {
  const records = readWorkbook(filePath);
  if (!records.length) throw new Error('Nenhum registro válido foi encontrado no arquivo.');
  return { filePath, fileName: path.basename(filePath), records };
}

ipcMain.handle('select-workbook', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecione a planilha de monitoramento de bipagem',
    filters: [{ name: 'Planilhas Excel', extensions: ['xlsx'] }],
    properties: ['openFile']
  });
  if (result.canceled) return null;
  const filePath = result.filePaths[0];
  return loadResult(filePath);
});

ipcMain.handle('load-workbook-path', async (_event, filePath) => loadResult(filePath));

ipcMain.handle('load-latest-workbook', async () => {
  const downloads = app.getPath('downloads');
  const candidates = fs.readdirSync(downloads)
    .filter(name => /^Monitoramento de bipagem de entrega.*\.xlsx$/i.test(name))
    .map(name => ({ path:path.join(downloads, name), time:fs.statSync(path.join(downloads, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  if (!candidates.length) throw new Error('Nenhuma planilha de monitoramento foi encontrada na pasta Downloads.');
  return loadResult(candidates[0].path);
});

ipcMain.handle('capture-report', async (_event, options) => {
  const image = await mainWindow.webContents.capturePage(options.rect);
  if (options.mode === 'copy') {
    clipboard.writeImage(image);
    return { copied: true };
  }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Salvar imagem para WhatsApp',
    defaultPath: `Monitoramento_${options.date}.png`,
    filters: [{ name: 'Imagem PNG', extensions: ['png'] }]
  });
  if (result.canceled) return null;
  fs.writeFileSync(result.filePath, image.toPNG());
  return { saved: true, filePath: result.filePath };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
