import { fieldsBox, fieldTemplate } from './dom.js';

let onFieldsChange = () => {};

export function setFieldChangeHandler(handler) {
  onFieldsChange = handler;
}

export function fieldDataFromRow(row) {
  return {
    FieldNo: row.querySelector('.field-no').value.trim(),
    FieldName: row.querySelector('.field-name').value.trim(),
    BeginTime: row.querySelector('.begin-time').value.trim(),
    Endtime: row.querySelector('.end-time').value.trim(),
  };
}

export function updateFieldOrder() {
  const rows = [...fieldsBox.querySelectorAll('.field-row')];
  rows.forEach((row, index) => {
    row.querySelector('.field-index').textContent = `#${index + 1}`;
    row.querySelector('.move-up').disabled = index === 0;
    row.querySelector('.move-down').disabled = index === rows.length - 1;
  });
  onFieldsChange();
}

export function addField(data = {}, afterRow = null) {
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

export function resetFields(fields) {
  fieldsBox.textContent = '';
  fields.forEach(field => addField(field));
  updateFieldOrder();
}

export function allFieldRows() {
  return [...fieldsBox.querySelectorAll('.field-row')].map(row => ({
    ...fieldDataFromRow(row),
    Price: '0'
  }));
}

export function collectFields() {
  return allFieldRows().filter(f => f.FieldNo && f.FieldName && f.BeginTime && f.Endtime);
}
