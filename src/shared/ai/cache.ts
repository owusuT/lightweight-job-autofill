// AI response cache with SHA-256 keys

import { getLocal, setLocal, removeLocal } from '../storage';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 50;

interface CacheEntry {
  text: string;
  timestamp: number;
  usage?: { promptTokens: number; completionTokens: number };
}

interface CacheData {
  entries: Record<string, CacheEntry>;
}

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getCache(key: string): Promise<CacheEntry | null> {
  const result = await getLocal<CacheData>({ aiCache: { entries: {} } });
  const cache: CacheData = result.aiCache || { entries: {} };
  const entry = cache.entries[key];

  if (!entry) return null;

  const age = Date.now() - entry.timestamp;
  if (age > CACHE_TTL_MS) {
    // Stale entry, remove it
    delete cache.entries[key];
    await setLocal({ aiCache: cache });
    return null;
  }

  return entry;
}

export async function setCache(key: string, value: CacheEntry): Promise<void> {
  const result = await getLocal<CacheData>({ aiCache: { entries: {} } });
  const cache: CacheData = result.aiCache || { entries: {} };

  // Evict oldest if over limit
  const entries = Object.entries(cache.entries);
  if (entries.length >= MAX_CACHE_ENTRIES) {
    const oldestKey = entries.sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
    delete cache.entries[oldestKey];
  }

  cache.entries[key] = value;
  await setLocal({ aiCache: cache });
}

export async function buildCacheKey(
  task: string,
  provider: string,
  model: string,
  profileFingerprint: string,
  payload: string,
): Promise<string> {
  const input = `${task}|${provider}|${model}|${profileFingerprint}|${payload}`;
  return await sha256(input);
}

export async function buildProfileFingerprint(profile: object): Promise<string> {
  const relevantFields = Object.entries(profile)
    .filter(([_, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${String(value)}`)
    .join('|');

  return await sha256(relevantFields);
}

export async function clearCache(): Promise<void> {
  await removeLocal('aiCache');
}
