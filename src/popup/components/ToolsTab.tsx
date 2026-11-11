import { useEffect, useState } from "react";
import { timeAgo } from "../../shared/format";
import { clearForms, detectForms, manualFill, type DetectedField } from "../api";

interface Props {
  tabUrl: string;
  setStatus: (message: string, type?: "info" | "success" | "error") => void;
}

interface SavedCredential {
  id?: string;
  savedAt?: number;
}

export function ToolsTab({ tabUrl, setStatus }: Props) {
  const [forms, setForms] = useState<DetectedField[] | null>(null);
  const [credentials, setCredentials] = useState<[string, SavedCredential][]>([]);
  const [autoCreate, setAutoCreate] = useState(false);

  const loadCredentials = async () => {
    const result = await chrome.storage.local.get(["savedCreds"]);
    setCredentials(Object.entries((result.savedCreds as Record<string, SavedCredential>) || {}));
  };

  useEffect(() => {
    void loadCredentials();
    void (async () => {
      const stored = await chrome.storage.local.get(["config"]);
      const config = stored.config as { autoCreateAccounts?: boolean } | undefined;
      setAutoCreate(config?.autoCreateAccounts === true);
    })();
  }, []);

  const detect = async () => {
    const resp = await detectForms();
    if (!resp.success && !(resp.forms || []).length) {
      setForms(null);
      setStatus(resp.error || "Could not detect forms. Try refreshing the page.", "error");
      return;
    }
    const found = resp.forms || [];
    setForms(found);
    setStatus(
      found.length
        ? `Found ${found.length} fields across ${resp.framesReached || 1} frame(s).`
        : "No fields found.",
      found.length ? "success" : "info",
    );
  };

  const fillForms = async () => {
    const resp = await manualFill({ fillPersonal: true, fillAddress: true, fillProfessional: true });
    if (resp.success) setStatus(`Filled ${resp.fieldsFilled || 0} fields`, "success");
    else setStatus(resp.error || "Fill failed. Refresh and try again.", "error");
  };

  const clear = async () => {
    const resp = await clearForms();
    setStatus(resp.success ? "Forms cleared." : "Could not clear.", resp.success ? "success" : "error");
  };

  const toggleAutoCreate = async (checked: boolean) => {
    setAutoCreate(checked);
    const current = (await chrome.storage.local.get(["config"])).config || {};
    await chrome.storage.local.set({ config: { ...(current as object), autoCreateAccounts: checked } });
    setStatus(checked ? "Account creation enabled." : "Account creation disabled.", "success");
  };

  const clearCredentials = async () => {
    await chrome.storage.local.remove(["savedCreds"]);
    await loadCredentials();
    setStatus("Credentials cleared.", "success");
  };

  return (
    <div>
      <div className="section-title">Manual Tools</div>
      <div className="form-group full">
        <label htmlFor="current-url">Current Page URL</label>
        <input id="current-url" readOnly value={tabUrl} />
      </div>

      <div className="btn-row">
        <button className="btn btn-primary" onClick={fillForms}>Fill Forms</button>
        <button className="btn btn-secondary" onClick={detect}>Detect</button>
        <button className="btn btn-danger" onClick={clear}>Clear</button>
      </div>

      <hr />

      <div className="section-title">Detection Results</div>
      <div className="result-box">
        {forms === null ? (
          "No scan run yet."
        ) : forms.length === 0 ? (
          "No recognizable fields found on this page."
        ) : (
          forms.map((field, index) => (
            <div className="result-row" key={index}>
              <span className="result-name">{field.type?.replace(/_/g, " ") || "unknown"}</span>
              <span className="result-label">{field.label || field.id || field.name || "—"}</span>
            </div>
          ))
        )}
      </div>

      <hr />

      <div className="section-title">Saved Credentials</div>
      <div className="result-box">
        {credentials.length === 0
          ? "None saved."
          : credentials.map(([domain, cred]) => (
              <div className="result-row" key={domain}>
                <span className="result-name">{domain}</span>
                <span className="result-label">{cred.id} · {timeAgo(cred.savedAt || 0)}</span>
              </div>
            ))}
      </div>

      <div className="spaced">
        <button className="btn btn-danger btn-full btn-sm" onClick={clearCredentials}>Clear Saved Credentials</button>
      </div>

      <hr />

      <div className="section-title">Account Creation</div>
      <label className="checkbox-label">
        <input type="checkbox" checked={autoCreate} onChange={(e) => void toggleAutoCreate(e.target.checked)} />
        <span>Allow generating a password on signup forms. Login forms are never touched.</span>
      </label>
    </div>
  );
}
