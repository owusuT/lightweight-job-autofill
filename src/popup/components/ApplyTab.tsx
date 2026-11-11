import { useState } from "react";
import type { Profile } from "../../shared/types";
import { generateStrongPassword } from "../../shared/password";
import { clearForms, detectForms, fillApplication } from "../api";

declare global {
  interface Window {
    RealPDFProcessor: new () => {
      processPDF(file: File): Promise<string>;
      extractPersonalInfo(text: string): { email?: string };
    };
  }
}

interface Props {
  profile: Profile;
  atsName: string | null;
  setStatus: (message: string, type?: "info" | "success" | "error") => void;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ApplyTab({ profile, atsName, setStatus }: Props) {
  const [resumeName, setResumeName] = useState("");
  const [coverName, setCoverName] = useState("");
  const [targetPosition, setTargetPosition] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [password, setPassword] = useState("");

  const onResume = async (file: File | undefined) => {
    if (!file) return;
    setResumeName(file.name);
    const base64 = await readAsDataUrl(file);
    const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";

    if (!isPdf) {
      await chrome.storage.local.set({ sharedPDFData: { base64, name: file.name, type: file.type } });
      setStatus(`Resume saved: ${file.name}`, "success");
      return;
    }

    try {
      const processor = new window.RealPDFProcessor();
      const fullText = await processor.processPDF(file);
      const info = processor.extractPersonalInfo(fullText);
      await chrome.storage.local.set({
        sharedPDFData: {
          base64,
          name: file.name,
          type: file.type,
          resumeText: fullText,
          resumeInfo: info,
          processedAt: Date.now(),
        },
      });
      const words = fullText.split(/\s+/).length;
      setStatus(`PDF processed: ${words} words extracted${info.email ? ` · found ${info.email}` : ""}`, "success");
    } catch (err) {
      setResumeName("");
      setStatus(err instanceof Error ? err.message : "Failed to process PDF.", "error");
    }
  };

  const onCoverLetter = async (file: File | undefined) => {
    if (!file) return;
    setCoverName(file.name);
    const base64 = await readAsDataUrl(file);
    await chrome.storage.local.set({ coverLetterFile: { base64, name: file.name, type: file.type } });
    setStatus(`Cover letter saved: ${file.name}`, "success");
  };

  const fill = async () => {
    setStatus("Filling application…");
    const merged: Profile = { ...profile };
    if (targetPosition.trim()) merged.position = targetPosition.trim();
    if (targetCompany.trim()) merged.company = targetCompany.trim();

    const resp = await fillApplication(merged);
    if (resp.success) {
      const framesNote = (resp.framesReached || 1) > 1 ? ` across ${resp.framesReached} frames` : "";
      setStatus(`Filled ${resp.fieldsFilled || 0} fields${framesNote} ✓`, "success");
    } else if (resp.fieldsFilled === 0 && resp.framesReached === 0) {
      setStatus("No form found — page may still be loading. Try again in a few seconds.", "error");
    } else {
      setStatus(resp.error || "Fill failed. Try refreshing.", "error");
    }
  };

  const scan = async () => {
    const resp = await detectForms();
    if (!resp.success && !(resp.forms || []).length) {
      setStatus(resp.error || "Could not detect forms. Try refreshing the page.", "error");
      return;
    }
    const count = (resp.forms || []).length;
    setStatus(
      count ? `Found ${count} fields across ${resp.framesReached || 1} frame(s).` : "No fields found.",
      count ? "success" : "info",
    );
  };

  const clear = async () => {
    const resp = await clearForms();
    setStatus(resp.success ? "Forms cleared." : "Could not clear forms.", resp.success ? "success" : "error");
  };

  const copyPassword = () => {
    if (!password) {
      setStatus("Generate a password first.", "error");
      return;
    }
    navigator.clipboard.writeText(password).then(() => setStatus("Copied!", "success"));
  };

  return (
    <div>
      {atsName && (
        <div className="ats-bar">
          <span className="ats-dot" />
          <span className="ats-label">Job site detected</span>
          <span className="ats-name">{atsName}</span>
        </div>
      )}

      <div className="section-title">Resume</div>
      <label className={`file-drop ${resumeName ? "has-file" : ""}`}>
        <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => void onResume(e.target.files?.[0])} />
        <div className="file-drop-icon">📄</div>
        <div className="file-drop-title">{resumeName || "Upload Resume"}</div>
        <div className="file-drop-sub">PDF, DOC, or DOCX</div>
      </label>

      <div className="section-title">Cover Letter</div>
      <label className={`file-drop ${coverName ? "has-file" : ""}`}>
        <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={(e) => void onCoverLetter(e.target.files?.[0])} />
        <div className="file-drop-icon">✉️</div>
        <div className="file-drop-title">{coverName || "Upload Cover Letter"}</div>
        <div className="file-drop-sub">Optional — used for cover letter upload fields</div>
      </label>

      <div className="section-title">Quick Fill Options</div>
      <div className="form-group full">
        <label htmlFor="target-position">Target Position</label>
        <input
          id="target-position"
          placeholder="e.g. Software Engineer"
          value={targetPosition}
          onChange={(e) => setTargetPosition(e.target.value)}
        />
      </div>
      <div className="form-group full">
        <label htmlFor="target-company">Target Company</label>
        <input
          id="target-company"
          placeholder="e.g. Google"
          value={targetCompany}
          onChange={(e) => setTargetCompany(e.target.value)}
        />
      </div>

      <div className="btn-row">
        <button className="btn btn-primary" onClick={fill}>Fill Application</button>
        <button className="btn btn-secondary btn-sm" onClick={scan}>Scan</button>
        <button className="btn btn-secondary btn-sm" onClick={clear}>Clear</button>
      </div>

      <hr />

      <div className="section-title">Password Generator</div>
      <div className="password-row">
        <div className="form-group">
          <label htmlFor="generated-password">Generated Password</label>
          <input
            id="generated-password"
            readOnly
            placeholder="Click Generate"
            value={password}
          />
        </div>
        <button className="btn btn-secondary" onClick={() => setPassword(generateStrongPassword())}>🔑 Gen</button>
        <button className="btn btn-secondary" onClick={copyPassword}>Copy</button>
      </div>
    </div>
  );
}
