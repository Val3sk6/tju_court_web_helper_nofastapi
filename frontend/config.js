import { $, importConfigFile, presetSelect } from './dom.js';
import { BUILTIN_PRESETS, CONFIG_VERSION, defaultConfig, defaultFields, todayPlus } from './defaults.js';
import { addField, allFieldRows, collectFields, resetFields } from './fields.js';
import { appendLog } from './logs.js';

const STORAGE_KEY = 'tju-helper-config-v1';
const PRESETS_KEY = 'tju-helper-presets-v1';

let configSaveTimer = null;
let isRestoringConfig = false;

export function configFromForm() {
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

export function applyConfig(config = {}, options = {}) {
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
  const fields = Array.isArray(base.fields) && base.fields.length ? base.fields : defaultFields();
  resetFields(fields);
  isRestoringConfig = false;
  if (options.save !== false) saveConfig();
}

export function saveConfig() {
  if (isRestoringConfig) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configFromForm()));
}

export function scheduleConfigSave() {
  if (isRestoringConfig) return;
  clearTimeout(configSaveTimer);
  configSaveTimer = setTimeout(saveConfig, 180);
}

export function loadSavedConfig() {
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

export function renderPresetOptions() {
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

export function loadPreset() {
  const preset = selectedPreset();
  if (!preset) return appendLog('请选择一个可加载的预设。', 'warn');
  applyConfig({ ...configFromForm(), ...preset.config, fields: preset.config.fields }, { save: true });
  appendLog(`已加载预设：${preset.name}`, 'success');
}

export function savePreset() {
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

export function deletePreset() {
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

export function exportConfig() {
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

export function importConfig(file) {
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

export function resetConfig() {
  if (!window.confirm('恢复默认配置？当前非敏感配置会被覆盖，Cookie 不会清空。')) return;
  localStorage.removeItem(STORAGE_KEY);
  applyConfig(defaultConfig(), { save: true });
  appendLog('已恢复默认配置。', 'warn');
}

export function payload() {
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

export function validatePayload(p) {
  if (!p.cookie) throw new Error('请先粘贴 Cookie。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.target_date)) throw new Error('请选择有效目标日期。');
  if (!/^\d{2}:\d{2}:\d{2}$/.test(p.open_time)) throw new Error('放场时间格式应为 HH:MM:SS。');
  if (!p.fields.length) throw new Error('至少添加一个候补场地。');
}

export { addField };
