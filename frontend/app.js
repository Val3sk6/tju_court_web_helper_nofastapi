const $ = (id) => document.getElementById(id);

const fieldsBox = $('fields');
const fieldTemplate = $('fieldTemplate');
const logs = $('logs');
const statusPill = $('statusPill');
const logFilter = $('logFilter');
const logMeta = $('logMeta');
const autoScroll = $('autoScroll');

let currentJobId = null;
let eventSource = null;
let logItems = [];

function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function setStatus(text, tone = 'info') {
  statusPill.textContent = text;
  document.body.classList.remove('state-info', 'state-running', 'state-success', 'state-error', 'state-stopped');
  document.body.classList.add(`state-${tone}`);
}

function updateLogMeta() {
  const total = logItems.length;
  const visible = logs.querySelectorAll('.log-line:not(.is-hidden)').length;
  const suffix = logFilter.value === 'all' ? '' : `，显示 ${visible} 条`;
  logMeta.textContent = `${total} 条日志${suffix}`;
}

function applyLogFilter() {
  const filter = logFilter.value;
  logs.querySelectorAll('.log-line').forEach((node) => {
    node.classList.toggle('is-hidden', filter !== 'all' && node.dataset.level !== filter);
  });
  updateLogMeta();
}

function appendLog(message, level = 'info') {
  const normalizedLevel = ['success', 'error', 'warn', 'info', 'done'].includes(level) ? level : 'info';
  const span = document.createElement('span');
  span.className = `log-line log-${normalizedLevel}`;
  span.dataset.level = normalizedLevel;
  span.textContent = message + '\n';
  logs.appendChild(span);
  logItems.push({ level: normalizedLevel, message });
  applyLogFilter();
  if (autoScroll.checked) logs.scrollTop = logs.scrollHeight;
}

function resetLogs() {
  logs.textContent = '';
  logItems = [];
  updateLogMeta();
}

function fieldDataFromRow(row) {
  return {
    FieldNo: row.querySelector('.field-no').value.trim(),
    FieldName: row.querySelector('.field-name').value.trim(),
    BeginTime: row.querySelector('.begin-time').value.trim(),
    Endtime: row.querySelector('.end-time').value.trim(),
  };
}

function updateFieldOrder() {
  const rows = [...fieldsBox.querySelectorAll('.field-row')];
  rows.forEach((row, index) => {
    row.querySelector('.field-index').textContent = `#${index + 1}`;
    row.querySelector('.move-up').disabled = index === 0;
    row.querySelector('.move-down').disabled = index === rows.length - 1;
  });
}

function addField(data = {}, afterRow = null) {
  const node = fieldTemplate.content.cloneNode(true);
  const row = node.querySelector('.field-row');
  row.querySelector('.field-no').value = data.FieldNo || '';
  row.querySelector('.field-name').value = data.FieldName || '';
  row.querySelector('.begin-time').value = data.BeginTime || '09:00';
  row.querySelector('.end-time').value = data.Endtime || '10:00';
  row.querySelector('.move-up').addEventListener('click', () => {
    const previous = row.previousElementSibling;
    if (previous) fieldsBox.insertBefore(row, previous);
    updateFieldOrder();
  });
  row.querySelector('.move-down').addEventListener('click', () => {
    const next = row.nextElementSibling;
    if (next) fieldsBox.insertBefore(next, row);
    updateFieldOrder();
  });
  row.querySelector('.duplicate').addEventListener('click', () => addField(fieldDataFromRow(row), row));
  row.querySelector('.remove').addEventListener('click', () => {
    row.remove();
    updateFieldOrder();
  });
  if (afterRow) afterRow.insertAdjacentElement('afterend', row);
  else fieldsBox.appendChild(row);
  updateFieldOrder();
}

function collectFields() {
  return [...fieldsBox.querySelectorAll('.field-row')].map(row => ({
    FieldNo: row.querySelector('.field-no').value.trim(),
    FieldName: row.querySelector('.field-name').value.trim(),
    BeginTime: row.querySelector('.begin-time').value.trim(),
    Endtime: row.querySelector('.end-time').value.trim(),
    Price: '0'
  })).filter(f => f.FieldNo && f.FieldName && f.BeginTime && f.Endtime);
}

function payload() {
  const threads = $('threads').value.trim();
  const attempts = $('attempts').value.trim();
  return {
    cookie: $('cookie').value.trim(),
    mode: $('mode').value,
    open_time: $('openTime').value.trim(),
    target_date: $('targetDate').value,
    fields: collectFields(),
    venue_no: $('venueNo').value.trim(),
    field_type_no: $('fieldTypeNo').value.trim(),
    timeout: Number($('timeout').value || 10),
    threads: threads ? Number(threads) : null,
    attempts: attempts ? Number(attempts) : null,
    dry_run: $('dryRun').checked
  };
}

function validatePayload(p) {
  if (!p.cookie) throw new Error('请先粘贴 Cookie。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.target_date)) throw new Error('请选择有效目标日期。');
  if (!/^\d{2}:\d{2}:\d{2}$/.test(p.open_time)) throw new Error('放场时间格式应为 HH:MM:SS。');
  if (!p.fields.length) throw new Error('至少添加一个候补场地。');
}

function closeLogStream() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

async function readJsonResponse(res) {
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

async function postJson(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return readJsonResponse(res);
}

async function getJson(url) {
  const res = await fetch(url);
  return readJsonResponse(res);
}

async function refreshFinalStatus() {
  if (!currentJobId) return;
  try {
    const data = await getJson(`/api/status/${currentJobId}`);
    const status = data.result && data.result.status;
    if (status === 'success') setStatus('抢场成功', 'success');
    else if (status === 'login' || status === 'cookie_invalid') setStatus('Cookie 异常', 'error');
    else if (status === 'stopped') setStatus('已停止', 'stopped');
    else if (status === 'failed') setStatus('未成功', 'error');
    else setStatus('已结束', 'info');
  } catch (e) {
    setStatus('已结束', 'info');
  }
}

async function copyLogs() {
  const text = logItems.map(item => item.message).join('\n');
  if (!text) return appendLog('暂无日志可复制。', 'warn');
  try {
    await navigator.clipboard.writeText(text);
    appendLog('日志已复制到剪贴板。', 'success');
  } catch (e) {
    appendLog('复制失败，请手动选择日志内容复制。', 'error');
  }
}

function downloadLogs() {
  const text = logItems.map(item => `[${item.level}] ${item.message}`).join('\n');
  if (!text) return appendLog('暂无日志可下载。', 'warn');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `tju-helper-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
  link.click();
  URL.revokeObjectURL(url);
}

$('addFieldBtn').addEventListener('click', () => addField());
$('clearLogsBtn').addEventListener('click', resetLogs);
$('copyLogsBtn').addEventListener('click', copyLogs);
$('downloadLogsBtn').addEventListener('click', downloadLogs);
logFilter.addEventListener('change', applyLogFilter);

$('checkBtn').addEventListener('click', async () => {
  $('checkBtn').disabled = true;
  try {
    const p = payload();
    validatePayload(p);
    setStatus('预检中', 'running');
    appendLog('开始 Cookie 预检...', 'info');
    const data = await postJson('/api/check-cookie', p);
    for (const item of data.messages || []) appendLog(item.message, item.level);
    setStatus(data.ok ? 'Cookie 可用' : 'Cookie 异常', data.ok ? 'success' : 'error');
  } catch (e) {
    appendLog(`❌ ${e.message}`, 'error');
    setStatus('预检失败', 'error');
  } finally {
    $('checkBtn').disabled = false;
  }
});

$('startBtn').addEventListener('click', async () => {
  try {
    const p = payload();
    validatePayload(p);
    closeLogStream();
    resetLogs();
    setStatus('运行中', 'running');
    $('startBtn').disabled = true;
    $('stopBtn').disabled = false;

    const data = await postJson('/api/start', p);
    currentJobId = data.job_id;
    appendLog(`任务已启动：${currentJobId}`, 'info');

    eventSource = new EventSource(`/api/logs/${currentJobId}`);
    eventSource.onmessage = (event) => {
      const item = JSON.parse(event.data);
      if (item.level === 'done') {
        appendLog('任务结束', 'info');
        refreshFinalStatus();
        $('startBtn').disabled = false;
        $('stopBtn').disabled = true;
        closeLogStream();
        return;
      }
      appendLog(item.message, item.level);
      if (item.message.includes('成功抢到')) setStatus('抢场成功', 'success');
      if (item.message.includes('Cookie 失效')) setStatus('Cookie 异常', 'error');
    };
    eventSource.onerror = () => {
      appendLog('日志连接中断，可查看后端终端窗口。', 'warn');
      $('startBtn').disabled = false;
      $('stopBtn').disabled = true;
      setStatus('连接中断', 'error');
      closeLogStream();
    };
  } catch (e) {
    appendLog(`❌ ${e.message}`, 'error');
    $('startBtn').disabled = false;
    $('stopBtn').disabled = true;
    setStatus('启动失败', 'error');
  }
});

$('stopBtn').addEventListener('click', async () => {
  if (!currentJobId) return;
  try {
    $('stopBtn').disabled = true;
    await postJson(`/api/stop/${currentJobId}`, {});
    appendLog('已发送停止指令。', 'warn');
    setStatus('停止中', 'running');
  } catch (e) {
    appendLog(`❌ 停止失败：${e.message}`, 'error');
    $('stopBtn').disabled = false;
  }
});

// Defaults
setStatus('未启动', 'info');
updateLogMeta();
$('targetDate').value = todayPlus(7);
addField({ FieldNo: 'YMQX007', FieldName: '羽毛球07', BeginTime: '09:00', Endtime: '10:00' });
addField({ FieldNo: 'YMQX008', FieldName: '羽毛球08', BeginTime: '09:00', Endtime: '10:00' });
addField({ FieldNo: 'YMQX009', FieldName: '羽毛球09', BeginTime: '09:00', Endtime: '10:00' });
appendLog('页面已就绪。建议先勾选“测试模式”跑一遍流程，再取消测试模式实战。', 'info');
