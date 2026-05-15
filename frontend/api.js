async function readJsonResponse(res) {
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

export async function postJson(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return readJsonResponse(res);
}

export async function getJson(url) {
  const res = await fetch(url);
  return readJsonResponse(res);
}
