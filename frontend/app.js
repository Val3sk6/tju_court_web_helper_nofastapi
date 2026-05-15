import { getJson, postJson } from './api.js';
import { $, importConfigFile, logFilter } from './dom.js';
import {
  addField,
  applyConfig,
  deletePreset,
  exportConfig,
  importConfig,
  loadPreset,
  loadSavedConfig,
  payload,
  renderPresetOptions,
  resetConfig,
  savePreset,
  scheduleConfigSave,
  validatePayload
} from './config.js';
import { defaultConfig } from './defaults.js';
import { setFieldChangeHandler } from './fields.js';
import { appendLog, applyLogFilter, copyLogs, downloadLogs, resetLogs, updateLogMeta } from './logs.js';
import { setStatus, statusTextFromJob } from './status.js';

let currentJobId = null;
let eventSource = null;

function closeLogStream() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
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

function bindConfigToolbar() {
  $('addFieldBtn').addEventListener('click', () => addField());
  $('loadPresetBtn').addEventListener('click', loadPreset);
  $('savePresetBtn').addEventListener('click', savePreset);
  $('deletePresetBtn').addEventListener('click', deletePreset);
  $('exportConfigBtn').addEventListener('click', exportConfig);
  $('importConfigBtn').addEventListener('click', () => importConfigFile.click());
  $('resetConfigBtn').addEventListener('click', resetConfig);
  importConfigFile.addEventListener('change', () => importConfig(importConfigFile.files[0]));
  document.getElementById('configForm').addEventListener('input', scheduleConfigSave);
  document.getElementById('configForm').addEventListener('change', scheduleConfigSave);
}

function bindLogToolbar() {
  $('clearLogsBtn').addEventListener('click', resetLogs);
  $('copyLogsBtn').addEventListener('click', copyLogs);
  $('downloadLogsBtn').addEventListener('click', downloadLogs);
  logFilter.addEventListener('change', applyLogFilter);
}

function bindApiActions() {
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
}

function init() {
  setFieldChangeHandler(scheduleConfigSave);
  bindConfigToolbar();
  bindLogToolbar();
  bindApiActions();

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
}

init();
