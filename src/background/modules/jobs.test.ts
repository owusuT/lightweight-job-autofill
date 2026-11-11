import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobsModule } from "./jobs";

type Store = Record<string, unknown>;

function installChrome(store: Store = {}) {
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

  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { local: area, sync: area },
  };

  return store;
}

function rawJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "1",
    title: "Senior Engineer",
    company_name: "Acme",
    location: "Berlin",
    remote: true,
    visa_sponsorship: true,
    description: "Build things",
    url: "https://example.com/jobs/1",
    created_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function respond(payload: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  });
}

function send(mod: JobsModule, value: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    mod.processMessage(
      { type: "GET_JOBS", value },
      {} as chrome.runtime.MessageSender,
      (response) => resolve(response as Record<string, unknown>),
    );
  });
}

describe("JobsModule", () => {
  beforeEach(() => {
    installChrome();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("rejects a request without a query", async () => {
    const res = await send(new JobsModule(), {});
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid request");
  });

  it("normalizes fields and maps the Arbeitnow payload", async () => {
    vi.stubGlobal("fetch", respond({ data: [rawJob()] }));
    const res = await send(new JobsModule(), { query: "engineer" });
    const jobs = res.jobs as Array<Record<string, unknown>>;
    expect(res.success).toBe(true);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: "1",
      title: "Senior Engineer",
      company: "Acme",
      location: "Berlin",
      remote: true,
      visaSponsorship: true,
      tags: [],
    });
    expect(jobs[0].postedAt).toBe(new Date("2026-10-01T00:00:00Z").getTime());
  });

  it("treats a numeric created_at as Unix seconds, not milliseconds", async () => {
    const seconds = Math.floor(new Date("2026-10-01T00:00:00Z").getTime() / 1000);
    vi.stubGlobal("fetch", respond({ data: [rawJob({ created_at: seconds })] }));
    const res = await send(new JobsModule(), { query: "engineer" });
    const jobs = res.jobs as Array<Record<string, unknown>>;
    expect(jobs[0].postedAt).toBe(new Date("2026-10-01T00:00:00Z").getTime());
  });

  it("passes filters to the API", async () => {
    const fetchMock = respond({ data: [] });
    vi.stubGlobal("fetch", fetchMock);
    await send(new JobsModule(), { query: "react dev", remote: true, visa: true, limit: 25 });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("search=react+dev");
    expect(url).toContain("remote=true");
    expect(url).toContain("visa_sponsorship=true");
    expect(url).toContain("limit=25");
  });

  it("drops jobs without a title or url and dedupes by url", async () => {
    vi.stubGlobal(
      "fetch",
      respond({
        data: [
          rawJob({ id: "a" }),
          rawJob({ id: "b" }),
          rawJob({ id: "c", title: "" }),
          rawJob({ id: "d", url: "" }),
        ],
      }),
    );
    const res = await send(new JobsModule(), { query: "x" });
    expect((res.jobs as unknown[]).length).toBe(1);
  });

  it("caps results at 100", async () => {
    const data = Array.from({ length: 105 }, (_, i) =>
      rawJob({ id: String(i), url: `https://example.com/jobs/${i}` }),
    );
    vi.stubGlobal("fetch", respond({ data }));
    const res = await send(new JobsModule(), { query: "x" });
    expect((res.jobs as unknown[]).length).toBe(100);
  });

  it("returns an error on HTTP failure", async () => {
    vi.stubGlobal("fetch", respond({}, 503));
    const res = await send(new JobsModule(), { query: "x" });
    expect(res.success).toBe(false);
    expect(res.error).toBe("HTTP 503");
  });

  it("surfaces network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const res = await send(new JobsModule(), { query: "x" });
    expect(res.success).toBe(false);
    expect(res.error).toBe("offline");
  });

  it("serves the second identical request from cache", async () => {
    const fetchMock = respond({ data: [rawJob()] });
    vi.stubGlobal("fetch", fetchMock);
    const mod = new JobsModule();

    const first = await send(mod, { query: "engineer", remote: true });
    const second = await send(mod, { query: "engineer", remote: true });

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((second.jobs as unknown[]).length).toBe(1);
  });

  it("keys the cache by query, remote, visa, and limit", async () => {
    const fetchMock = respond({ data: [rawJob()] });
    vi.stubGlobal("fetch", fetchMock);
    const mod = new JobsModule();
    await send(mod, { query: "engineer" });
    await send(mod, { query: "engineer", remote: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refetches once the TTL expires", async () => {
    vi.useFakeTimers();
    const fetchMock = respond({ data: [rawJob()] });
    vi.stubGlobal("fetch", fetchMock);
    const mod = new JobsModule();

    await send(mod, { query: "engineer" });
    vi.advanceTimersByTime(16 * 60 * 1000);
    const second = await send(mod, { query: "engineer" });

    expect(second.cached).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
