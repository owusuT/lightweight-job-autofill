import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveTaskModel, type AiConfig } from "./tasks";

describe("resolveTaskModel", () => {
  it("inherits the active provider and its model when the task is unset", () => {
    const config: AiConfig = { ...DEFAULT_CONFIG, activeProvider: "anthropic" };
    expect(resolveTaskModel("cover_letter", config)).toEqual({
      provider: "anthropic",
      model: DEFAULT_CONFIG.providers.anthropic.model,
    });
  });

  it("inherits when the task is explicitly set to inherit", () => {
    const config: AiConfig = {
      ...DEFAULT_CONFIG,
      activeProvider: "openai",
      taskModels: { cover_letter: "inherit" },
    };
    expect(resolveTaskModel("cover_letter", config).provider).toBe("openai");
  });

  it("uses an explicit per-task override", () => {
    const config: AiConfig = {
      ...DEFAULT_CONFIG,
      taskModels: { tailor: { provider: "openrouter", model: "custom/model-x" } },
    };
    expect(resolveTaskModel("tailor", config)).toEqual({
      provider: "openrouter",
      model: "custom/model-x",
    });
  });

  it("keeps per-task overrides independent", () => {
    const config: AiConfig = {
      ...DEFAULT_CONFIG,
      activeProvider: "openai",
      taskModels: { answers: { provider: "anthropic", model: "claude-x" } },
    };
    expect(resolveTaskModel("answers", config).provider).toBe("anthropic");
    expect(resolveTaskModel("cover_letter", config).provider).toBe("openai");
  });

  it("ships the documented defaults", () => {
    expect(DEFAULT_CONFIG.maxTokens).toBe(800);
    expect(DEFAULT_CONFIG.temperature).toBe(0.4);
    expect(DEFAULT_CONFIG.activeProvider).toBe("openai");
  });
});
