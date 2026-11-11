import { afterEach, describe, expect, it, vi } from "vitest";
import { AllFramesModule } from "./allFrames";

type FrameResponder = (frameId: number, message: { type: string; value?: unknown }) => unknown;

function installChrome(frameIds: number[], respond: FrameResponder) {
  const sent: Array<{ frameId: number; type: string; value?: unknown }> = [];

  (globalThis as unknown as { chrome: unknown }).chrome = {
    webNavigation: {
      getAllFrames: (_opts: unknown, cb: (frames: Array<{ frameId: number }>) => void) => {
        cb(frameIds.map((frameId) => ({ frameId })));
      },
    },
    tabs: {
      query: async (_q: unknown) => [{ id: 7 }],
      sendMessage: (
        _tabId: number,
        message: { type: string; value?: unknown },
        opts: { frameId: number },
        cb: (response?: unknown) => void,
      ) => {
        sent.push({ frameId: opts.frameId, type: message.type, value: message.value });
        cb(respond(opts.frameId, message));
      },
    },
    runtime: { lastError: undefined },
  };

  return sent;
}

function call(mod: AllFramesModule, type: string, value?: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    mod.processMessage({ type, value }, {}, (response) => resolve(response as Record<string, unknown>));
  });
}

const userData = { getProfile: async () => ({ firstName: "Ada" }) } as never;

it("fills the requested application tab even when another tab is active", async () => {
  installChrome([0, 3], () => ({ success: true, fieldsFilled: 1 }));
  const sendMessage = vi.spyOn(chrome.tabs, "sendMessage");
  const module = new AllFramesModule(userData);
  const response = await new Promise((resolve) => {
    module.processMessage({ type: "ALL_FRAMES_FILL", tabId: 12 }, {}, resolve);
  });

  expect(response).toMatchObject({ success: true, fieldsFilled: 2 });
  expect(sendMessage.mock.calls.map(([tabId]) => tabId)).toEqual([12, 12]);
});

describe("AllFramesModule question candidates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tags every candidate with its frame id", async () => {
    installChrome([0, 3], (frameId) => ({
      success: true,
      fields: [{ token: `t${frameId}`, label: `Q in ${frameId}` }],
    }));
    const res = await call(new AllFramesModule(userData), "ALL_FRAMES_QUESTION_CANDIDATES");
    const candidates = res.candidates as Array<Record<string, unknown>>;
    expect(res.success).toBe(true);
    expect(res.framesReached).toBe(2);
    expect(candidates).toEqual([
      { token: "t0", label: "Q in 0", frameId: 0 },
      { token: "t3", label: "Q in 3", frameId: 3 },
    ]);
  });

  it("skips frames with no receiver", async () => {
    installChrome([0, 5], (frameId) => (frameId === 5 ? null : { success: true, fields: [{ token: "a" }] }));
    const res = await call(new AllFramesModule(userData), "ALL_FRAMES_QUESTION_CANDIDATES");
    expect((res.candidates as unknown[]).length).toBe(1);
    expect(res.framesReached).toBe(1);
  });

  it("returns an empty list when nothing is fillable", async () => {
    installChrome([0], () => ({ success: true, fields: [] }));
    const res = await call(new AllFramesModule(userData), "ALL_FRAMES_QUESTION_CANDIDATES");
    expect(res.candidates).toEqual([]);
  });
});

describe("AllFramesModule apply answer", () => {
  it("targets only the requested frame", async () => {
    const sent = installChrome([0, 2], () => ({ success: true }));
    const res = await call(new AllFramesModule(userData), "ALL_FRAMES_APPLY_ANSWER", {
      token: "abc",
      frameId: 2,
      text: "hello",
    });
    expect(res.success).toBe(true);
    expect(sent).toEqual([{ frameId: 2, type: "AI_APPLY_ANSWER", value: { token: "abc", text: "hello" } }]);
  });

  it("defaults to the top frame", async () => {
    const sent = installChrome([0, 2], () => ({ success: true }));
    await call(new AllFramesModule(userData), "ALL_FRAMES_APPLY_ANSWER", { token: "abc", text: "hi" });
    expect(sent[0].frameId).toBe(0);
  });

  it("rejects a missing token without messaging a frame", async () => {
    const sent = installChrome([0], () => ({ success: true }));
    const res = await call(new AllFramesModule(userData), "ALL_FRAMES_APPLY_ANSWER", { text: "hi" });
    expect(res.success).toBe(false);
    expect(String(res.error)).toContain("Missing");
    expect(sent).toHaveLength(0);
  });

  it("propagates a content-script failure", async () => {
    installChrome([0], () => ({ success: false, error: "Read-only field." }));
    const res = await call(new AllFramesModule(userData), "ALL_FRAMES_APPLY_ANSWER", { token: "abc", text: "hi" });
    expect(res.success).toBe(false);
    expect(res.error).toBe("Read-only field.");
  });
});
