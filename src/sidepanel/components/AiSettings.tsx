import { useEffect, useState } from "react";
import type { AiConfig, TaskId, TaskModelSetting } from "../../shared/ai/tasks";
import { DEFAULT_CONFIG } from "../../shared/ai/tasks";
import type { ProviderId } from "../../shared/ai/providers";
import { providers } from "../../shared/ai/providers";
import {
  clearAiKeys,
  getAiSettings,
  listModels,
  saveAiSettings,
  testConnection,
  usageTotals,
} from "../api";

const PROVIDER_IDS: ProviderId[] = ["openai", "anthropic", "openrouter", "custom"];

const TASKS: Array<{ id: TaskId; label: string }> = [
  { id: "cover_letter", label: "Cover letter" },
  { id: "answers", label: "Short answers" },
  { id: "tailor", label: "Tailor profile" },
  { id: "form_question", label: "Form questions" },
];

type Status = { kind: "idle" | "ok" | "error"; message: string };
type Dot = "idle" | "testing" | "ok" | "error";

export function AiSettings() {
  const [config, setConfig] = useState<AiConfig>(DEFAULT_CONFIG);
  const [hasKeys, setHasKeys] = useState<Record<string, boolean>>({});
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [dots, setDots] = useState<Record<string, Dot>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle", message: "" });
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    void (async () => {
      const res = await getAiSettings();
      if (res.success && res.config) setConfig({ ...DEFAULT_CONFIG, ...res.config });
      if (res.hasKeys) setHasKeys(res.hasKeys);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      for (const id of PROVIDER_IDS) {
        const res = await listModels(id);
        if (res.success && res.models) {
          setModels((prev) => ({ ...prev, [id]: res.models || [] }));
        }
      }
    })();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const setDot = (id: ProviderId, dot: Dot) => {
    setDots((prev) => ({ ...prev, [id]: dot }));
  };

  const updateProviderModel = (id: ProviderId, model: string) => {
    setConfig((prev) => ({
      ...prev,
      providers: { ...prev.providers, [id]: { ...prev.providers[id], model } },
    }));
  };

  const save = async () => {
    setBusy(true);
    setStatus({ kind: "idle", message: "" });
    const keys: Record<string, string> = {};
    for (const [id, value] of Object.entries(keyDraft)) {
      if (value.trim()) keys[id] = value.trim();
    }
    const res = await saveAiSettings(config, keys);
    setBusy(false);
    if (res.success) {
      setKeyDraft({});
      const fresh = await getAiSettings();
      if (fresh.hasKeys) setHasKeys(fresh.hasKeys);
      setStatus({ kind: "ok", message: "Settings saved." });
    } else {
      setStatus({ kind: "error", message: "Could not save settings." });
    }
  };

  const test = async (id: ProviderId) => {
    setBusy(true);
    setDot(id, "testing");
    setStatus({ kind: "idle", message: "" });
    if (keyDraft[id]?.trim()) await saveAiSettings({}, { [id]: keyDraft[id].trim() });
    const res = await testConnection(id);
    setBusy(false);
    if (res.success) {
      setDot(id, "ok");
      setStatus({ kind: "ok", message: `${providers[id].label} OK — ${res.model} in ${res.latencyMs}ms.` });
    } else {
      setDot(id, "error");
      setStatus({ kind: "error", message: `${providers[id].label}: ${res.error}` });
    }
  };

  const removeKey = async (id: ProviderId) => {
    await clearAiKeys(id);
    setHasKeys((prev) => ({ ...prev, [id]: false }));
    setStatus({ kind: "ok", message: `${providers[id].label} key removed.` });
  };

  const clearAll = async () => {
    if (!window.confirm("Remove every saved AI key from this device?")) return;
    await clearAiKeys();
    setHasKeys({});
    setStatus({ kind: "ok", message: "All keys removed." });
  };

  const setTask = (task: TaskId, setting: TaskModelSetting) => {
    setConfig((prev) => ({ ...prev, taskModels: { ...prev.taskModels, [task]: setting } }));
  };

  if (!loaded) return <p className="muted">Loading settings…</p>;

  return (
    <div className="settings">
      <section className="panel">
        <h2 className="section-title">Provider</h2>
        <label className="field">
          Active provider
          <select
            className="select select-wide"
            value={config.activeProvider}
            onChange={(e) => setConfig((prev) => ({ ...prev, activeProvider: e.target.value as ProviderId }))}
          >
            {PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>{providers[id].label}</option>
            ))}
          </select>
        </label>

        <div className="field-row">
          <label className="field">
            Max tokens
            <input
              className="input"
              type="number"
              min={64}
              max={4096}
              value={config.maxTokens}
              onChange={(e) => setConfig((prev) => ({ ...prev, maxTokens: Number(e.target.value) }))}
            />
          </label>
          <label className="field">
            Temperature
            <input
              className="input"
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={config.temperature}
              onChange={(e) => setConfig((prev) => ({ ...prev, temperature: Number(e.target.value) }))}
            />
          </label>
        </div>
      </section>

      {PROVIDER_IDS.map((id) => (
        <section className="panel" key={id}>
          <h2 className="section-title">
            <span className={`dot-status dot-${dots[id] || "idle"}`} aria-hidden="true" />
            {providers[id].label}
            {hasKeys[id] && <span className="chip chip-ok">key saved</span>}
          </h2>

          {id === "custom" && (
            <label className="field">
              Base URL
              <input
                className="input"
                type="url"
                placeholder="http://192.168.0.102:11434"
                value={config.providers.custom.baseUrl}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    providers: { ...prev.providers, custom: { ...prev.providers.custom, baseUrl: e.target.value } },
                  }))
                }
              />
            </label>
          )}

          <label className="field">
            Model
            <select
              className="select select-wide"
              value={config.providers[id].model}
              onChange={(e) => updateProviderModel(id, e.target.value)}
            >
              {(models[id] || []).includes(config.providers[id].model) || !models[id]?.length ? (
                <option value={config.providers[id].model}>{config.providers[id].model}</option>
              ) : null}
              {(models[id] || [])
                .filter((m) => m !== config.providers[id].model)
                .map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
            </select>
          </label>

          <label className="field">
            Model id override
            <input
              className="input"
              value={config.providers[id].model}
              onChange={(e) => updateProviderModel(id, e.target.value)}
              placeholder="Type any model id"
            />
          </label>

          <label className="field">
            API key
            <div className="key-row">
              <input
                className="input"
                type={reveal[id] ? "text" : "password"}
                autoComplete="off"
                placeholder={hasKeys[id] ? "•••••••• saved — type to replace" : "Paste key"}
                value={keyDraft[id] || ""}
                onChange={(e) => setKeyDraft((prev) => ({ ...prev, [id]: e.target.value }))}
              />
              <button
                type="button"
                className="btn btn-text"
                aria-label={reveal[id] ? "Hide key" : "Reveal key"}
                onClick={() => setReveal((prev) => ({ ...prev, [id]: !prev[id] }))}
              >
                {reveal[id] ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <div className="row-actions">
            <button className="btn btn-ghost" onClick={() => test(id)} disabled={busy}>
              Test
            </button>
            {hasKeys[id] && (
              <button className="btn btn-text" onClick={() => removeKey(id)} disabled={busy}>
                Remove key
              </button>
            )}
          </div>
        </section>
      ))}

      <section className="panel">
        <h2 className="section-title">Per-task models</h2>
        <p className="muted small">Leave on “Inherit” to use the active provider.</p>
        {TASKS.map(({ id, label }) => {
          const setting = config.taskModels[id];
          const custom = setting && setting !== "inherit" ? setting : null;
          return (
            <div className="task-row" key={id}>
              <span className="task-label">{label}</span>
              <select
                className="select"
                value={custom ? custom.provider : "inherit"}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "inherit") setTask(id, "inherit");
                  else setTask(id, { provider: value as ProviderId, model: config.providers[value as ProviderId].model });
                }}
              >
                <option value="inherit">Inherit</option>
                {PROVIDER_IDS.map((pid) => (
                  <option key={pid} value={pid}>{providers[pid].label}</option>
                ))}
              </select>
              {custom && (
                <input
                  className="input"
                  value={custom.model}
                  onChange={(e) => setTask(id, { provider: custom.provider, model: e.target.value })}
                  aria-label={`${label} model`}
                />
              )}
            </div>
          );
        })}
      </section>

      <section className="panel">
        <h2 className="section-title">Privacy</h2>
        <p className="muted small">
          Sent per request: name, contact details, summary, skills, education, experience, links, and work preferences.
          Never sent: EEO answers, consent flags, API keys, saved credentials. Job descriptions are capped at 4,000 characters.
        </p>
        <p className="muted small">
          Keys are stored locally on this device only (<code>storage.local</code>) and are never synced.
        </p>
        <p className="muted small">
          Session: {usageTotals.calls} call{usageTotals.calls === 1 ? "" : "s"} · {usageTotals.promptTokens} prompt tokens · {usageTotals.completionTokens} completion tokens
        </p>
        <div className="row-actions">
          <button className="btn btn-text" onClick={clearAll}>Clear all keys</button>
        </div>
      </section>

      <div className="settings-footer">
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </button>
        {status.kind !== "idle" && (
          <p className={`status status-${status.kind}`} role="status">{status.message}</p>
        )}
      </div>
    </div>
  );
}
