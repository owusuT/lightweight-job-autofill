import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCacheKey,
  buildProfileFingerprint,
  clearCache,
  getCache,
  setCache,
} from "./cache";

type Store = Record<string, unknown>;
let store: Store = {};

function installChrome() {
  store = {};
  const area = {
    get(keys: string | string[] | Record<string, unknown>, cb: (result: Store) => void) {
      if (typeof keys === "string") {
        cb(keys in store ? { [keys]: store[keys] } : {});
        return;
      }
      if (Array.isArray(keys)) {
        const out: Store = {};
        for (const key of keys) if (key in store) out[key] = store[key];
        cb(out);
        return;
      }
      const out: Store = { ...keys };
      for (const [key, fallback] of Object.entries(keys)) {
        out[key] = key in store ? store[key] : fallback;
      }
      cb(out);
    },
    set(data: Store, cb?: () => void) {
      Object.assign(store, data);
      cb?.();
    },
    remove(keys: string | string[], cb?: () => void) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
      cb?.();
    },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local: area, sync: area } };
}

const entry = (text: string, timestamp = Date.now()) => ({ text, timestamp });

describe("profile fingerprint", () => {
  it("is stable regardless of key order", async () => {
    const a = await buildProfileFingerprint({ firstName: "Ada", email: "a@x.com", skills: "TS" });
    const b = await buildProfileFingerprint({ skills: "TS", email: "a@x.com", firstName: "Ada" });
    expect(a).toBe(b);
  });

  it("changes when a value changes", async () => {
    const a = await buildProfileFingerprint({ firstName: "Ada" });
    const b = await buildProfileFingerprint({ firstName: "Grace" });
    expect(a).not.toBe(b);
  });

  it("ignores empty, null, and undefined values", async () => {
    const base = await buildProfileFingerprint({ firstName: "Ada" });
    const padded = await buildProfileFingerprint({
      firstName: "Ada",
      middleName: "",
      phone: null,
      website: undefined,
    });
    expect(padded).toBe(base);
  });

  it("returns a 64-character hex sha256", async () => {
    const fp = await buildProfileFingerprint({ firstName: "Ada" });
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("cache keys", () => {
  it("is deterministic for identical input", async () => {
    const a = await buildCacheKey("cover_letter", "openai", "gpt", "fp", "payload");
    const b = await buildCacheKey("cover_letter", "openai", "gpt", "fp", "payload");
    expect(a).toBe(b);
  });

  it("changes when any component changes", async () => {
    const base = await buildCacheKey("cover_letter", "openai", "gpt", "fp", "payload");
    const variants = await Promise.all([
      buildCacheKey("tailor", "openai", "gpt", "fp", "payload"),
      buildCacheKey("cover_letter", "anthropic", "gpt", "fp", "payload"),
      buildCacheKey("cover_letter", "openai", "gpt-2", "fp", "payload"),
      buildCacheKey("cover_letter", "openai", "gpt", "fp2", "payload"),
      buildCacheKey("cover_letter", "openai", "gpt", "fp", "payload2"),
    ]);
    for (const variant of variants) expect(variant).not.toBe(base);
  });
});

describe("cache storage", () => {
  beforeEach(() => {
    installChrome();
  });

  it("round-trips an entry", async () => {
    await setCache("k1", entry("hello"));
    expect(await getCache("k1")).toMatchObject({ text: "hello" });
  });

  it("returns null for a missing key", async () => {
    expect(await getCache("nope")).toBeNull();
  });

  it("expires entries older than 24 hours and deletes them", async () => {
    vi.useFakeTimers();
    await setCache("old", entry("stale", Date.now()));
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    expect(await getCache("old")).toBeNull();
    const stored = store.aiCache as { entries: Record<string, unknown> };
    expect(stored.entries.old).toBeUndefined();
    vi.useRealTimers();
  });

  it("evicts the oldest entry above 50", async () => {
    for (let i = 0; i < 50; i++) {
      await setCache(`k${i}`, entry(`t${i}`, 1000 + i));
    }
    await setCache("new", entry("t-new", 99999));
    const stored = store.aiCache as { entries: Record<string, unknown> };
    expect(Object.keys(stored.entries)).toHaveLength(50);
    expect(stored.entries.k0).toBeUndefined();
    expect(stored.entries.new).toBeDefined();
  });

  it("clears the cache", async () => {
    await setCache("k1", entry("hello"));
    await clearCache();
    expect(await getCache("k1")).toBeNull();
  });
});
