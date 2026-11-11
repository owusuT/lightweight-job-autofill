// Typed Chrome storage helpers

import type { StorageArea } from "./types";

// Sync storage (synced across devices)
export async function getSync<T>(keys: string | string[] | Record<string, unknown>): Promise<{ [key: string]: T }> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, (result) => {
      resolve(result as { [key: string]: T });
    });
  });
}

export async function setSync(data: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set(data, () => {
      resolve();
    });
  });
}

// Local storage (device-only)
export async function getLocal<T>(keys: string | string[] | Record<string, unknown>): Promise<{ [key: string]: T }> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result as { [key: string]: T });
    });
  });
}

export async function setLocal(data: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, () => {
      resolve();
    });
  });
}

export async function removeLocal(keys: string | string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => {
      resolve();
    });
  });
}

// Generic helper
export async function getStorage<T>(area: StorageArea, keys: string | string[] | Record<string, unknown>): Promise<{ [key: string]: T }> {
  return new Promise((resolve) => {
    chrome.storage[area].get(keys, (result) => {
      resolve(result as { [key: string]: T });
    });
  });
}

export async function setStorage(area: StorageArea, data: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage[area].set(data, () => {
      resolve();
    });
  });
}
