const state = { records: [], date: '', fileName: '' };
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const pct = value => value.toLocaleString('pt-BR', { style:'percent', minimumFractionDigits:2, maximumFractionDigits:2 });
const count = (rows, status) => rows.filter(row => row.status === status).length;
const light = value => value >= .98 ? 'green' : value >= .95 ? 'yellow' : 'red';
const traffic = value => `<span class="traffic ${light(value)}"></span>${pct(value)}`;

function summarize(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.driver.toLocaleUpperCase('pt-BR');
    if (!map.has(key)) map.set(key, { driver:row.driver, pending:0, delivered:0, failed:0, total:0 });
    const item = map.get(key); item.total++;
    if (row.status === 'ENTREGUE') item.delivered++;
    else if (row.status === 'INSUCESSO') item.failed++;
    else item.pending++;
  }
  return [...map.values()].sort((a,b) => a.driver.localeCompare(b.driver, 'pt-BR'))
    .map(item => ({ ...item, sla:item.total ? item.delivered / item.total : 0 }));
}

function render() {
  const rows = state.records.filter(row => row.dispatch === state.date);
  const drivers = summarize(rows);
  const total = rows.length, delivered = count(rows, 'ENTREGUE'), failed = count(rows, 'INSUCESSO'), pending = count(rows, 'BAIXA PENDENTE');
  const sla = total ? delivered / total : 0;
  const base = rows.find(row => row.base)?.base || 'ITU-SP';
  const [year, month, day] = state.date.split('-');
  const time = new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  state.time = time;
  const numberCell = number => number ? number : '';
  const driverRows = drivers.map(item => `<tr><td class="driver-name">${escapeHtml(item.driver)}</td><td>${numberCell(item.pending)}</td><td>${numberCell(item.delivered)}</td><td>${numberCell(item.failed)}</td><td>${item.total}</td></tr>`).join('');
  const slaRows = drivers.map(item => `<tr><td>${traffic(item.sla)}</td></tr>`).join('');
  $('#report').innerHTML = `
    <div class="top">
      <div class="brand"><img class="report-logo" src="assets/report-logo.png" alt="J&amp;T Express"></div>
      <div class="top-right">
        <div class="top-info"><div class="cell head info-head">DATA:</div><div class="cell info-value">${day}/${month}</div><div class="cell head info-head">Horário</div><div class="cell info-value">${time}</div></div>
        <div class="top-metrics"><div class="cell head metric-head">BAIXA PENDENTE</div><div class="cell head metric-head">ENTREGUE</div><div class="cell head metric-head">INSUCESSO</div><div class="cell head metric-head">EXPEDIDO</div><div class="cell head metric-head">TAXA BAIXA DE<br>ENTREGA</div></div>
        <div class="top-values"><div class="cell metric-value">${pending}</div><div class="cell metric-value">${delivered}</div><div class="cell metric-value">${failed}</div><div class="cell metric-value">${total}</div><div class="cell metric-value">${traffic(sla)}</div></div>
      </div>
    </div>
    <div class="detail">
      <table><colgroup><col style="width:500px"><col style="width:155px"><col style="width:100px"><col style="width:105px"><col style="width:100px"></colgroup>
        <thead><tr><th>MOTORISTA</th><th>BAIXA PENDENTE</th><th>ENTREGUE</th><th>INSUCESSO</th><th>Total geral</th></tr></thead>
        <tbody><tr class="base-row"><td>${escapeHtml(base)}</td><td>${pending}</td><td>${delivered}</td><td>${failed}</td><td>${total}</td></tr>${driverRows}<tr class="total-row"><td>Total geral</td><td>${pending}</td><td>${delivered}</td><td>${failed}</td><td>${total}</td></tr></tbody>
      </table><div></div>
      <table class="sla-table"><thead><tr><th>TAXA BAIXA DE<br>ENTREGA</th></tr></thead><tbody><tr><td>${traffic(sla)}</td></tr>${slaRows}<tr><td>${traffic(sla)}</td></tr></tbody></table>
    </div>`;
}

function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2200); }

function applyWorkbook(result) {
  if (!result) return;
  state.records = result.records; state.fileName = result.fileName;
  const dates = [...new Set(state.records.map(row => row.dispatch))].sort();
  state.date = dates.at(-1); $('#date').min = dates[0]; $('#date').max = state.date; $('#date').value = state.date;
  $('#file').textContent = state.fileName; $('#empty').hidden = true; $('#reportFrame').hidden = false; $('#status').textContent = '';
  ['date','copy','save','csv'].forEach(id => $('#' + id).disabled = false); render();
}

async function load(action) {
  try {
    $('#status').textContent = 'Carregando planilha...'; applyWorkbook(await action());
  } catch (error) { $('#status').textContent = `Não foi possível carregar: ${error.message}`; }
}

$('#open').addEventListener('click', () => load(() => window.desktop.selectWorkbook()));
$('#latest').addEventListener('click', () => load(() => window.desktop.loadLatestWorkbook()));
const drop = $('#empty');
['dragenter','dragover'].forEach(name => drop.addEventListener(name, event => { event.preventDefault(); drop.classList.add('dragging'); }));
['dragleave','drop'].forEach(name => drop.addEventListener(name, event => { event.preventDefault(); drop.classList.remove('dragging'); }));
drop.addEventListener('drop', event => {
  const file = [...event.dataTransfer.files].find(item => item.name.toLowerCase().endsWith('.xlsx'));
  if (!file) { $('#status').textContent = 'Arraste um arquivo no formato XLSX.'; return; }
  load(() => window.desktop.loadWorkbookPath(file));
});
$('#date').addEventListener('change', event => { state.date = event.target.value; render(); });

let reportLogo = null;
function loadReportLogo() {
  if (reportLogo && reportLogo.complete && reportLogo.naturalWidth > 0) {
    return Promise.resolve(reportLogo);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { reportLogo = img; resolve(img); };
    img.onerror = () => { reportLogo = null; resolve(null); };
    img.src = 'assets/report-logo.png';
  });
}

function fitText(context, text, maxWidth) {
  if (context.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 0 && context.measureText(trimmed + '...').width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed + '...';
}

async function generateReportCanvas() {
  const rows = state.records.filter(row => row.dispatch === state.date);
  const drivers = summarize(rows);
  const total = rows.length;
  const delivered = count(rows, 'ENTREGUE');
  const failed = count(rows, 'INSUCESSO');
  const pending = count(rows, 'BAIXA PENDENTE');
  const sla = total ? delivered / total : 0;
  const baseName = rows.find(row => row.base)?.base || 'ITU-SP';
  const [year, month, day] = state.date.split('-');
  const time = state.time || new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });

  const RED = '#eb0018';
  const GRID = '#c9c9c9';
  const PINK = '#ffdede';
  const SMOKE = '#f4f4f4';

  const detailTop = 162;
  const headerHeight = 35;
  const rowHeight = 30;
  const totalHeight = detailTop + headerHeight + (drivers.length + 2) * rowHeight + 1;

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1200, totalHeight);

  // Top Red Box
  ctx.fillStyle = RED;
  ctx.fillRect(0, 0, 500, 145);

  const logo = await loadReportLogo();
  if (logo && logo.naturalWidth > 0) {
    const aspect = logo.naturalWidth / logo.naturalHeight;
    const targetH = 46;
    const targetW = targetH * aspect;
    ctx.drawImage(logo, (500 - targetW) / 2, (145 - targetH) / 2, targetW, targetH);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold italic 36px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('J&T EXPRESS', 250, 72);
  }

  function drawCell(x, y, w, h, bg, text, font, textColor, align = 'center') {
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    if (text !== undefined && text !== null && text !== '') {
      ctx.fillStyle = textColor;
      ctx.font = font;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      let tx = x + w / 2;
      if (align === 'left') tx = x + 10;
      else if (align === 'right') tx = x + w - 10;

      const lines = String(text).split('\n');
      if (lines.length === 1) {
        const str = align === 'left' ? fitText(ctx, lines[0], w - 20) : lines[0];
        ctx.fillText(str, tx, y + h / 2);
      } else {
        const lineHeight = 14;
        const startY = y + (h - (lines.length - 1) * lineHeight) / 2;
        lines.forEach((line, idx) => {
          ctx.fillText(line, tx, startY + idx * lineHeight);
        });
      }
    }
  }

  function drawTraffic(x, y, w, h, value, font = 'bold 15px Arial') {
    const color = value >= 0.98 ? '#63a994' : value >= 0.95 ? '#edc470' : '#d34d2c';
    const cy = y + h / 2;
    const cx = x + 18;
    const radius = 8;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#000000';
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(pct(value), cx + 16, cy);
  }

  // Top Info
  drawCell(500, 0, 155, 54, RED, 'DATA:', 'bold 20px Arial', '#ffffff', 'center');
  drawCell(655, 0, 205, 54, SMOKE, `${day}/${month}`, 'bold 20px Arial', '#000000', 'center');
  drawCell(860, 0, 190, 54, RED, 'Horário', 'bold 20px Arial', '#ffffff', 'center');
  drawCell(1050, 0, 150, 54, SMOKE, time, 'bold 20px Arial', '#000000', 'center');

  // Top Metrics Headers
  drawCell(500, 54, 155, 52, RED, 'BAIXA PENDENTE', 'bold 14px Arial', '#ffffff', 'center');
  drawCell(655, 54, 100, 52, RED, 'ENTREGUE', 'bold 14px Arial', '#ffffff', 'center');
  drawCell(755, 54, 105, 52, RED, 'INSUCESSO', 'bold 14px Arial', '#ffffff', 'center');
  drawCell(860, 54, 100, 52, RED, 'EXPEDIDO', 'bold 14px Arial', '#ffffff', 'center');
  drawCell(960, 54, 240, 52, RED, 'TAXA BAIXA DE\nENTREGA', 'bold 14px Arial', '#ffffff', 'center');

  // Top Values
  drawCell(500, 106, 155, 39, '#ffffff', pending, '15px Arial', '#000000', 'center');
  drawCell(655, 106, 100, 39, '#ffffff', delivered, '15px Arial', '#000000', 'center');
  drawCell(755, 106, 105, 39, '#ffffff', failed, '15px Arial', '#000000', 'center');
  drawCell(860, 106, 100, 39, '#ffffff', total, '15px Arial', '#000000', 'center');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(960, 106, 240, 39);
  ctx.strokeStyle = GRID;
  ctx.strokeRect(960, 106, 240, 39);
  drawTraffic(1010, 106, 240, 39, sla, 'bold 15px Arial');

  // Detail Headers
  const colX = [0, 500, 655, 755, 860];
  const colW = [500, 155, 100, 105, 100];
  drawCell(colX[0], detailTop, colW[0], headerHeight, RED, 'MOTORISTA', 'bold 15px Arial', '#ffffff', 'center');
  drawCell(colX[1], detailTop, colW[1], headerHeight, RED, 'BAIXA PENDENTE', 'bold 14px Arial', '#ffffff', 'center');
  drawCell(colX[2], detailTop, colW[2], headerHeight, RED, 'ENTREGUE', 'bold 14px Arial', '#ffffff', 'center');
  drawCell(colX[3], detailTop, colW[3], headerHeight, RED, 'INSUCESSO', 'bold 14px Arial', '#ffffff', 'center');
  drawCell(colX[4], detailTop, colW[4], headerHeight, RED, 'Total geral', 'bold 14px Arial', '#ffffff', 'center');
  drawCell(1035, detailTop, 165, headerHeight, RED, 'TAXA BAIXA DE\nENTREGA', 'bold 13px Arial', '#ffffff', 'center');

  let y = detailTop + headerHeight;

  // Base Row
  drawCell(colX[0], y, colW[0], rowHeight, PINK, baseName, 'bold 14px Arial', '#000000', 'left');
  drawCell(colX[1], y, colW[1], rowHeight, PINK, pending, 'bold 14px Arial', '#000000', 'right');
  drawCell(colX[2], y, colW[2], rowHeight, PINK, delivered, 'bold 14px Arial', '#000000', 'right');
  drawCell(colX[3], y, colW[3], rowHeight, PINK, failed, 'bold 14px Arial', '#000000', 'right');
  drawCell(colX[4], y, colW[4], rowHeight, PINK, total, 'bold 14px Arial', '#000000', 'right');
  drawTraffic(1035, y, 165, rowHeight, sla, 'bold 14px Arial');
  y += rowHeight;

  // Driver Rows
  for (const d of drivers) {
    drawCell(colX[0], y, colW[0], rowHeight, '#ffffff', '     ' + d.driver, '14px Arial', '#000000', 'left');
    drawCell(colX[1], y, colW[1], rowHeight, '#ffffff', d.pending ? d.pending : '', '14px Arial', '#000000', 'right');
    drawCell(colX[2], y, colW[2], rowHeight, '#ffffff', d.delivered ? d.delivered : '', '14px Arial', '#000000', 'right');
    drawCell(colX[3], y, colW[3], rowHeight, '#ffffff', d.failed ? d.failed : '', '14px Arial', '#000000', 'right');
    drawCell(colX[4], y, colW[4], rowHeight, '#ffffff', d.total, '14px Arial', '#000000', 'right');
    drawTraffic(1035, y, 165, rowHeight, d.sla, '600 14px Arial');
    y += rowHeight;
  }

  // Total Row
  drawCell(colX[0], y, colW[0], rowHeight, RED, 'Total geral', 'bold 14px Arial', '#ffffff', 'left');
  drawCell(colX[1], y, colW[1], rowHeight, RED, pending, 'bold 14px Arial', '#ffffff', 'right');
  drawCell(colX[2], y, colW[2], rowHeight, RED, delivered, 'bold 14px Arial', '#ffffff', 'right');
  drawCell(colX[3], y, colW[3], rowHeight, RED, failed, 'bold 14px Arial', '#ffffff', 'right');
  drawCell(colX[4], y, colW[4], rowHeight, RED, total, 'bold 14px Arial', '#ffffff', 'right');
  drawTraffic(1035, y, 165, rowHeight, sla, 'bold 14px Arial');

  return canvas.toDataURL('image/png');
}

async function capture(mode) {
  try {
    $('#status').textContent = 'Gerando imagem completa...';
    const dataUrl = await generateReportCanvas();
    const result = await window.desktop.captureReport({ mode, date: state.date, dataUrl });
    $('#status').textContent = '';
    if (result?.copied) toast('Imagem copiada com todos os motoristas e SLA. Cole no WhatsApp.');
    if (result?.saved) toast('Imagem salva com sucesso.');
  } catch (error) {
    $('#status').textContent = `Erro ao gerar imagem: ${error.message}`;
  }
}
$('#copy').addEventListener('click', () => capture('copy'));
$('#save').addEventListener('click', () => capture('save'));
$('#csv').addEventListener('click', () => {
  const rows = state.records.filter(row => row.dispatch === state.date), drivers = summarize(rows);
  const content = ['Motorista;Baixa pendente;Entregue;Insucesso;Total expedido;SLA', ...drivers.map(x => `"${x.driver.replaceAll('"','""')}";${x.pending};${x.delivered};${x.failed};${x.total};${pct(x.sla)}`)].join('\r\n');
  const blob = new Blob(['\ufeff' + content], { type:'text/csv;charset=utf-8' }); const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=`SLA_${state.date}.csv`; link.click(); URL.revokeObjectURL(link.href);
});
