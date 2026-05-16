import { $, statusPill } from './dom.js';

const STATUS_TONES = ['state-info', 'state-running', 'state-success', 'state-error', 'state-stopped'];

const ERROR_ADVICES = {
  config_invalid: '请补全 Cookie、目标日期、放场时间和至少一个候补场地。',
  invalid_integer: '请检查线程数、尝试次数、超时等数字输入框，只填写整数或留空。',
  invalid_json: '页面请求体异常，请刷新页面后重试。',
  job_not_found: '任务可能已经结束并被清理，请重新启动一次。',
  network_unknown: '预检网络异常不一定代表 Cookie 失效；请确认校园网/代理后，建议先用测试模式演练。',
};

const STATUS_ADVICES = {
  success: '请立即打开微信或预约系统完成支付/确认，避免订单超时被回收。',
  failed: '本轮未成功。建议增加候补场地，确认 Cookie、网络、时间和场地顺序后再试。',
  login: '预约系统要求重新登录，请重新抓取 Cookie 后先执行预检。',
  cookie_invalid: 'Cookie 疑似失效，请重新登录预约系统并复制完整 Cookie。',
  invalid: '配置未通过校验，请按提示补全后再启动。',
  stopped: '任务已停止；如需重试，可确认配置后重新启动。',
  running: '任务运行中，请保持本窗口和网络连接。',
  idle: '建议先勾选测试模式并执行 Cookie 预检。'
};

function valueOrDash(value) {
  return value === undefined || value === null || value === '' ? '—' : String(value);
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = valueOrDash(value);
}

export function setStatus(text, tone = 'info') {
  statusPill.textContent = text;
  document.body.classList.remove(...STATUS_TONES);
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

export function updateStatusPanel(data = {}) {
  const result = data.result || {};
  const stats = result.stats || {};
  setText('jobIdValue', data.job_id);
  setText('phaseValue', data.phase_label || data.phase);
  setText('statusValue', data.status_label || data.status || result.status);
  setText('durationValue', typeof data.duration_seconds === 'number' ? `${data.duration_seconds.toFixed(1)} 秒` : '—');
  setText('attemptsValue', stats.attempts ?? 0);
  setText('fieldValue', result.field);
  setText('successTimeValue', result.time);
  setText('lastCodeValue', result.last_code);
  setAdvice(data.next_step || STATUS_ADVICES[data.status || result.status] || STATUS_ADVICES.idle, 'info');
}

export function resetStatusPanel() {
  updateStatusPanel({
    job_id: null,
    phase_label: '待命',
    status_label: '未启动',
    duration_seconds: null,
    result: { stats: { attempts: 0 } },
    next_step: STATUS_ADVICES.idle
  });
}

export function setAdvice(message, tone = 'info') {
  const box = $('adviceBox');
  if (!box) return;
  box.textContent = message || STATUS_ADVICES.idle;
  box.dataset.tone = tone;
}

export function adviceFromError(error) {
  return error.hint || ERROR_ADVICES[error.code] || error.message || '操作失败，请查看实时日志。';
}

export function adviceFromPrecheck(data) {
  if (data.hint) return data.hint;
  if (data.status === 'valid') return 'Cookie 预检通过。建议先使用测试模式演练，再切换正式模式。';
  return ERROR_ADVICES[data.status] || data.reason || '预检完成，请根据日志判断下一步。';
}
