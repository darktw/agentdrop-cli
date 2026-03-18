import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.agentdrop');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function load() {
  try {
    if (existsSync(CONFIG_FILE)) return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {}
  return {};
}

export function save(data) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  const existing = load();
  const merged = { ...existing, ...data };
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

export function getApiKey() {
  return load().api_key || null;
}

export function clear() {
  if (existsSync(CONFIG_FILE)) writeFileSync(CONFIG_FILE, '{}');
}
