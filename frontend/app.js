const $ = (id) => document.getElementById(id);

const fieldsBox = $('fields');
const fieldTemplate = $('fieldTemplate');
const logs = $('logs');
const statusPill = $('statusPill');

let currentJobId = null;
let eventSource = null;

function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function appendLog(message, level = 'info') {
  const span = document.createElement('span');
  span.className = `log-${level}`;
  span.textContent = message + '\n';
  logs.appendChild(span);
  logs.scrollTop = logs.scrollHeight;
}

function setStatus(text, tone = 'info') {
  statusPill.textContent = text;
  const colors = {
    info: 'rgba(102,227,255,.12)',
    running: 'rgba(255,209,102,.13)',
    success: 'rgba(141,247,199,.14)',
    error: 'rgba(255,107,122,.15)'
  };
  statusPill.style.background = colors[tone] || colors.info;
}

function addField(data = {}) {
  const node = fieldTemplate.content.cloneNode(true);
  const row = node.querySelector('.field-row');
  row.querySelector('.field-no').value = data.FieldNo || '';
  row.querySelector('.field-name').value = data.FieldName || '';
  row.querySelector('.begin-time').value = data.BeginTime || '09:00';
  row.querySelector('.end-time').value = data.Endtime || '10:00';
  row.querySelector('.remove').addEventListener('click', () => row.remove());
  fieldsBox.appendChild(row);
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
    else if (status === 'stopped') setStatus('已停止', 'info');
    else if (status === 'failed') setStatus('未成功', 'error');
    else setStatus('已结束', 'info');
  } catch (e) {
    setStatus('已结束', 'info');
  }
}

$('addFieldBtn').addEventListener('click', () => addField());
$('clearLogsBtn').addEventListener('click', () => { logs.textContent = ''; });

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
    logs.textContent = '';
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
    await postJson(`/api/stop/${currentJobId}`, {});
    appendLog('已发送停止指令。', 'warn');
    setStatus('停止中', 'running');
  } catch (e) {
    appendLog(`❌ 停止失败：${e.message}`, 'error');
  }
});

// Defaults
$('targetDate').value = todayPlus(7);
addField({ FieldNo: 'YMQX007', FieldName: '羽毛球07', BeginTime: '09:00', Endtime: '10:00' });
addField({ FieldNo: 'YMQX008', FieldName: '羽毛球08', BeginTime: '09:00', Endtime: '10:00' });
addField({ FieldNo: 'YMQX009', FieldName: '羽毛球09', BeginTime: '09:00', Endtime: '10:00' });
appendLog('页面已就绪。建议先勾选“测试模式”跑一遍流程，再取消测试模式实战。', 'info');
