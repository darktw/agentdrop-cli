import { getApiKey } from './config.js';

const API = 'https://api.agentdrop.net';

export async function request(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const key = getApiKey();
  if (key) headers['X-API-Key'] = key;

  const res = await fetch(API + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export async function get(path) {
  return request(path);
}

export async function post(path, body) {
  return request(path, { method: 'POST', body });
}

export async function put(path, body) {
  return request(path, { method: 'PUT', body });
}

export async function del(path) {
  return request(path, { method: 'DELETE' });
}
