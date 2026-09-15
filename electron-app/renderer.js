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

async function capture(mode) {
  const rect = $('#report').getBoundingClientRect();
  const result = await window.desktop.captureReport({ mode, date:state.date, rect:{ x:Math.round(rect.x), y:Math.round(rect.y), width:Math.round(rect.width), height:Math.round(rect.height) } });
  if (result?.copied) toast('Imagem copiada. Cole no WhatsApp.');
  if (result?.saved) toast('Imagem salva com sucesso.');
}
$('#copy').addEventListener('click', () => capture('copy'));
$('#save').addEventListener('click', () => capture('save'));
$('#csv').addEventListener('click', () => {
  const rows = state.records.filter(row => row.dispatch === state.date), drivers = summarize(rows);
  const content = ['Motorista;Baixa pendente;Entregue;Insucesso;Total expedido;SLA', ...drivers.map(x => `"${x.driver.replaceAll('"','""')}";${x.pending};${x.delivered};${x.failed};${x.total};${pct(x.sla)}`)].join('\r\n');
  const blob = new Blob(['\ufeff' + content], { type:'text/csv;charset=utf-8' }); const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=`SLA_${state.date}.csv`; link.click(); URL.revokeObjectURL(link.href);
});
