import { statusPill } from './dom.js';

export function setStatus(text, tone = 'info') {
  statusPill.textContent = text;
  document.body.classList.remove('state-info', 'state-running', 'state-success', 'state-error', 'state-stopped');
  document.body.classList.add(`state-${tone}`);
}

export function statusTextFromJob(data) {
  const status = data.status || (data.result && data.result.status);
  if (status === 'success') return ['抢场成功', 'success'];
  if (status === 'login' || status === 'cookie_invalid') return ['Cookie 异常', 'error'];
  if (status === 'invalid') return ['配置无效', 'error'];
  if (status === 'stopped') return ['已停止', 'stopped'];
  if (status === 'failed') return ['未成功', 'error'];
  if (data.alive || data.phase === 'running') return ['运行中', 'running'];
  return ['已结束', 'info'];
}
