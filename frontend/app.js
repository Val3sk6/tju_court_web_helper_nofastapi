const $ = (id) => document.getElementById(id);

const fieldsBox = $('fields');
const fieldTemplate = $('fieldTemplate');
const logs = $('logs');
const statusPill = $('statusPill');
const logFilter = $('logFilter');
const logMeta = $('logMeta');
const autoScroll = $('autoScroll');
const presetSelect = $('presetSelect');
const importConfigFile = $('importConfigFile');

const STORAGE_KEY = 'tju-helper-config-v1';
const PRESETS_KEY = 'tju-helper-presets-v1';
const CONFIG_VERSION = 1;
const BUILTIN_PRESETS = [
  {
    id: 'builtin-morning',
    name: '内置：上午 09-10 点',
    config: { fields: [
      { FieldNo: 'YMQX007', FieldName: '羽毛球07', BeginTime: '09:00', Endtime: '10:00' },
      { FieldNo: 'YMQX008', FieldName: '羽毛球08', BeginTime: '09:00', Endtime: '10:00' },
      { FieldNo: 'YMQX009', FieldName: '羽毛球09', BeginTime: '09:00', Endtime: '10:00' }
    ] }
  },
  {
    id: 'builtin-evening',
    name: '内置：晚上 20-21 点',
    config: { fields: [
      { FieldNo: 'YMQX007', FieldName: '羽毛球07', BeginTime: '20:00', Endtime: '21:00' },
      { FieldNo: 'YMQX008', FieldName: '羽毛球08', BeginTime: '20:00', Endtime: '21:00' },
      { FieldNo: 'YMQX009', FieldName: '羽毛球09', BeginTime: '20:00', Endtime: '21:00' }
    ] }
  }
];

let currentJobId = null;
let eventSource = null;
let logItems = [];
let configSaveTimer = null;
let isRestoringConfig = false;

function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}


function defaultFields() {
  return [
    { FieldNo: 'YMQX007', FieldName: '羽毛球07', BeginTime: '09:00', Endtime: '10:00' },
    { FieldNo: 'YMQX008', FieldName: '羽毛球08', BeginTime: '09:00', Endtime: '10:00' },
    { FieldNo: 'YMQX009', FieldName: '羽毛球09', BeginTime: '09:00', Endtime: '10:00' }
  ];
}

function defaultConfig() {
  return {
    mode: 'stable',
    open_time: '21:00:00',
    target_date: todayPlus(7),
    threads: '',
    attempts: '',
    timeout: '10',
    venue_no: '005',
    field_type_no: '017',
    dry_run: false,
    fields: defaultFields()
  };
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
  scheduleConfigSave();
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

function allFieldRows() {
  return [...fieldsBox.querySelectorAll('.field-row')].map(row => ({
    ...fieldDataFromRow(row),
    Price: '0'
  }));
}

function collectFields() {
  return allFieldRows().filter(f => f.FieldNo && f.FieldName && f.BeginTime && f.Endtime);
}


function configFromForm() {
  return {
    version: CONFIG_VERSION,
    mode: $('mode').value,
    open_time: $('openTime').value.trim(),
    target_date: $('targetDate').value,
    threads: $('threads').value.trim(),
    attempts: $('attempts').value.trim(),
    timeout: $('timeout').value.trim() || '10',
    venue_no: $('venueNo').value.trim(),
    field_type_no: $('fieldTypeNo').value.trim(),
    dry_run: $('dryRun').checked,
    fields: allFieldRows()
  };
}

function applyConfig(config = {}, options = {}) {
  const base = { ...defaultConfig(), ...config };
  isRestoringConfig = true;
  $('mode').value = base.mode || 'stable';
  $('openTime').value = base.open_time || '21:00:00';
  $('targetDate').value = base.target_date || todayPlus(7);
  $('threads').value = base.threads ?? '';
  $('attempts').value = base.attempts ?? '';
  $('timeout').value = base.timeout || '10';
  $('venueNo').value = base.venue_no || '005';
  $('fieldTypeNo').value = base.field_type_no || '017';
  $('dryRun').checked = Boolean(base.dry_run);
  if (options.includeCookie) $('cookie').value = base.cookie || '';
  fieldsBox.textContent = '';
  const fields = Array.isArray(base.fields) && base.fields.length ? base.fields : defaultFields();
  fields.forEach(field => addField(field));
  updateFieldOrder();
  isRestoringConfig = false;
  if (options.save !== false) saveConfig();
}

function saveConfig() {
  if (isRestoringConfig) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configFromForm()));
}

function scheduleConfigSave() {
  if (isRestoringConfig) return;
  clearTimeout(configSaveTimer);
  configSaveTimer = setTimeout(saveConfig, 180);
}

function loadSavedConfig() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

function userPresets() {
  const raw = localStorage.getItem(PRESETS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveUserPresets(presets) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

function renderPresetOptions() {
  const presets = userPresets();
  presetSelect.textContent = '';
  for (const preset of BUILTIN_PRESETS) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.name;
    presetSelect.appendChild(option);
  }
  for (const preset of presets) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = `我的：${preset.name}`;
    presetSelect.appendChild(option);
  }
}

function selectedPreset() {
  const id = presetSelect.value;
  return BUILTIN_PRESETS.find(preset => preset.id === id) || userPresets().find(preset => preset.id === id);
}

function loadPreset() {
  const preset = selectedPreset();
  if (!preset) return appendLog('请选择一个可加载的预设。', 'warn');
  applyConfig({ ...configFromForm(), ...preset.config, fields: preset.config.fields }, { save: true });
  appendLog(`已加载预设：${preset.name}`, 'success');
}

function savePreset() {
  const name = window.prompt('请输入预设名称（不会保存 Cookie）：');
  if (!name || !name.trim()) return;
  const presets = userPresets();
  const preset = {
    id: `user-${Date.now()}`,
    name: name.trim(),
    config: configFromForm()
  };
  presets.push(preset);
  saveUserPresets(presets);
  renderPresetOptions();
  presetSelect.value = preset.id;
  appendLog(`已保存预设：${preset.name}`, 'success');
}

function deletePreset() {
  const id = presetSelect.value;
  if (!id || id.startsWith('builtin-')) return appendLog('内置预设不能删除。', 'warn');
  const presets = userPresets();
  const preset = presets.find(item => item.id === id);
  if (!preset) return;
  if (!window.confirm(`删除预设“${preset.name}”？`)) return;
  saveUserPresets(presets.filter(item => item.id !== id));
  renderPresetOptions();
  appendLog(`已删除预设：${preset.name}`, 'warn');
}

function exportConfig() {
  const data = {
    exported_at: new Date().toISOString(),
    app: 'tju-court-web-helper',
    config: configFromForm()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `tju-helper-config-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  appendLog('已导出配置（不包含 Cookie）。', 'success');
}

function importConfig(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || '{}'));
      const imported = data.config || data;
      applyConfig(imported, { save: true });
      appendLog('配置导入成功（Cookie 未导入）。', 'success');
    } catch (e) {
      appendLog(`❌ 配置导入失败：${e.message}`, 'error');
    } finally {
      importConfigFile.value = '';
    }
  };
  reader.readAsText(file, 'utf-8');
}

function resetConfig() {
  if (!window.confirm('恢复默认配置？当前非敏感配置会被覆盖，Cookie 不会清空。')) return;
  localStorage.removeItem(STORAGE_KEY);
  applyConfig(defaultConfig(), { save: true });
  appendLog('已恢复默认配置。', 'warn');
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

function statusTextFromJob(data) {
  const status = data.status || (data.result && data.result.status);
  if (status === 'success') return ['抢场成功', 'success'];
  if (status === 'login' || status === 'cookie_invalid') return ['Cookie 异常', 'error'];
  if (status === 'invalid') return ['配置无效', 'error'];
  if (status === 'stopped') return ['已停止', 'stopped'];
  if (status === 'failed') return ['未成功', 'error'];
  if (data.alive || data.phase === 'running') return ['运行中', 'running'];
  return ['已结束', 'info'];
}

async function refreshFinalStatus() {
  if (!currentJobId) return;
  try {
    const data = await getJson(`/api/status/${currentJobId}`);
    setStatus(...statusTextFromJob(data));
  } catch (e) {
    setStatus('已结束', 'info');
  }
}

function applyPrecheckStatus(data) {
  const status = data.status || (data.ok ? 'valid' : 'invalid_cookie');
  if (status === 'valid') setStatus('Cookie 可用', 'success');
  else if (status === 'network_unknown') setStatus('预检未知', 'running');
  else if (status === 'config_invalid') setStatus('配置无效', 'error');
  else setStatus('Cookie 异常', 'error');
  if (data.reason) appendLog(`预检结果：${data.reason}`, status === 'valid' ? 'success' : status === 'network_unknown' ? 'warn' : 'error');
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
$('loadPresetBtn').addEventListener('click', loadPreset);
$('savePresetBtn').addEventListener('click', savePreset);
$('deletePresetBtn').addEventListener('click', deletePreset);
$('exportConfigBtn').addEventListener('click', exportConfig);
$('importConfigBtn').addEventListener('click', () => importConfigFile.click());
$('resetConfigBtn').addEventListener('click', resetConfig);
importConfigFile.addEventListener('change', () => importConfig(importConfigFile.files[0]));
logFilter.addEventListener('change', applyLogFilter);
document.getElementById('configForm').addEventListener('input', scheduleConfigSave);
document.getElementById('configForm').addEventListener('change', scheduleConfigSave);

$('checkBtn').addEventListener('click', async () => {
  $('checkBtn').disabled = true;
  try {
    const p = payload();
    validatePayload(p);
    setStatus('预检中', 'running');
    appendLog('开始 Cookie 预检...', 'info');
    const data = await postJson('/api/check-cookie', p);
    for (const item of data.messages || []) appendLog(item.message, item.level);
    applyPrecheckStatus(data);
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
    if (data.job) appendLog(`任务状态：${data.job.status} / ${data.job.phase}`, 'info');

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
    const data = await postJson(`/api/stop/${currentJobId}`, {});
    appendLog('已发送停止指令。', 'warn');
    if (data.job) setStatus(...statusTextFromJob(data.job));
    else setStatus('停止中', 'running');
  } catch (e) {
    appendLog(`❌ 停止失败：${e.message}`, 'error');
    $('stopBtn').disabled = false;
  }
});

// Defaults
setStatus('未启动', 'info');
updateLogMeta();
renderPresetOptions();
try {
  applyConfig(loadSavedConfig() || defaultConfig(), { save: false });
} catch (e) {
  applyConfig(defaultConfig(), { save: false });
  appendLog('本地保存的配置无法读取，已恢复默认配置。', 'warn');
}
appendLog('页面已就绪。非敏感配置会自动保存；建议先勾选“测试模式”跑一遍流程。', 'info');
