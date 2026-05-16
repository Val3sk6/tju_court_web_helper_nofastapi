import { autoScroll, logFilter, logMeta, logs } from './dom.js';

const LOG_LEVELS = ['success', 'error', 'warn', 'info', 'done'];
let logItems = [];

export function updateLogMeta() {
  const total = logItems.length;
  const visible = logs.querySelectorAll('.log-line:not(.is-hidden)').length;
  const suffix = logFilter.value === 'all' ? '' : `，显示 ${visible} 条`;
  logMeta.textContent = `${total} 条日志${suffix}`;
}

export function applyLogFilter() {
  const filter = logFilter.value;
  logs.querySelectorAll('.log-line').forEach((node) => {
    node.classList.toggle('is-hidden', filter !== 'all' && node.dataset.level !== filter);
  });
  updateLogMeta();
}

export function appendLog(message, level = 'info') {
  const normalizedLevel = LOG_LEVELS.includes(level) ? level : 'info';
  const span = document.createElement('span');
  span.className = `log-line log-${normalizedLevel}`;
  span.dataset.level = normalizedLevel;
  span.textContent = message + '\n';
  logs.appendChild(span);
  logItems.push({ level: normalizedLevel, message });
  applyLogFilter();
  if (autoScroll.checked) logs.scrollTop = logs.scrollHeight;
}

export function resetLogs() {
  logs.textContent = '';
  logItems = [];
  updateLogMeta();
}

export async function copyLogs() {
  const text = logItems.map(item => item.message).join('\n');
  if (!text) return appendLog('暂无日志可复制。', 'warn');
  try {
    await navigator.clipboard.writeText(text);
    appendLog('日志已复制到剪贴板。', 'success');
  } catch (e) {
    appendLog('复制失败，请手动选择日志内容复制。', 'error');
  }
}

export function downloadLogs() {
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
