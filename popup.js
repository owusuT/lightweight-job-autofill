// jolly R Popup v2.0

const MESSAGE_TYPE = {
  GET_USER_PROFILE:   "GET_USER_PROFILE",
  SAVE_USER_PROFILE:  "SAVE_USER_PROFILE",
  GET_APP_HISTORY:    "GET_APP_HISTORY",
  GET_ATS_STATUS:     "GET_ATS_STATUS",
  MANUAL_FILL_FORM:   "MANUAL_FILL_FORM",
  DETECT_FORMS:       "DETECT_FORMS",
  CLEAR_ALL_FORMS:    "CLEAR_ALL_FORMS",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sendToBackground(type, value) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, value }, (response) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(response);
    });
  });
}

// Fill / Detect / Clear go through the background's all-frames service, which
// messages every frame of the active tab (forms live in embedded iframes, e.g.
// Greenhouse job_app embeds) and retries while the SPA form is still rendering.
// Responses come back pre-merged: { success, fieldsFilled, framesReached, perFrame }.

function setStatus(msg, type = "info") {
  const el = document.getElementById("status-msg");
  el.textContent = msg;
  el.className = `status-msg ${type}`;
  if (type !== "info") {
    setTimeout(() => { el.textContent = "Ready"; el.className = "status-msg"; }, 3000);
  }
}

function generateStrongPassword() {
  const upper   = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower   = "abcdefghijklmnopqrstuvwxyz";
  const digits  = "0123456789";
  const special = "!@#$%^&*_+-=";
  const all = upper + lower + digits + special;
  const len = 16;
  // Cryptographically secure pick (Math.random is not safe for passwords)
  const securePick = (set) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return set[buf[0] % set.length];
  };
  const pass = [upper, lower, digits, special].map(securePick);
  for (let i = 4; i < len; i++) pass.push(securePick(all));
  for (let i = pass.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [pass[i], pass[j]] = [pass[j], pass[i]];
  }
  return pass.join("");
}

function timeAgo(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60)   return "just now";
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
  if (sec < 86400)return `${Math.floor(sec/3600)}h ago`;
  return `${Math.floor(sec/86400)}d ago`;
}

function domainFromUrl(url) {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

// ─── Profile ─────────────────────────────────────────────────────────────────

const PROFILE_FIELDS = [
  "firstName","lastName","email","phone","address","city","state","zip","country",
  "summary","skills","position","company","linkedin","website","education",
  "availability","workType",
  "workAuthorization","sponsorshipNeeded","ageConfirmed",
  "employmentType","startDate","relocate","travel","yearsExperience","certifications",
  "gender","race","veteranStatus","disabilityStatus",
  "coverLetter","whyInterested","referralSource","referredBy",
  "references","referenceName","referenceRelationship","referenceContact",
];

const PROFILE_CHECKBOXES = [
  "consentBackgroundCheck","consentDrugScreening","consentSignature","consentTerms",
];

function readProfileForm() {
  const p = {};
  PROFILE_FIELDS.forEach(f => { p[f] = (document.getElementById(f)?.value || "").trim(); });
  PROFILE_CHECKBOXES.forEach(f => {
    const el = document.getElementById(f);
    if (el) p[f] = !!el.checked;
  });
  return p;
}

function fillProfileForm(profile) {
  if (!profile) return;
  PROFILE_FIELDS.forEach(f => {
    const el = document.getElementById(f);
    if (el) el.value = profile[f] || "";
  });
  PROFILE_CHECKBOXES.forEach(f => {
    const el = document.getElementById(f);
    if (el) el.checked = !!profile[f];
  });
}

async function saveProfile() {
  const profile = readProfileForm();
  if (!profile.firstName && !profile.email) {
    setStatus("Please fill in at least a name or email.", "error");
    return;
  }
  const resp = await sendToBackground(MESSAGE_TYPE.SAVE_USER_PROFILE, profile);
  if (resp?.success) {
    setStatus("Profile saved ✓", "success");
  } else {
    setStatus("Failed to save profile.", "error");
  }
}

async function loadProfile() {
  const resp = await sendToBackground(MESSAGE_TYPE.GET_USER_PROFILE);
  if (resp?.profile) fillProfileForm(resp.profile);
}

// ─── History ──────────────────────────────────────────────────────────────────

async function loadHistory() {
  const resp = await sendToBackground(MESSAGE_TYPE.GET_APP_HISTORY);
  if (!resp) return;

  const { history = [], stats = {} } = resp;

  // Stats
  document.getElementById("stat-total").textContent = stats.total || 0;
  document.getElementById("stat-week").textContent  = stats.thisWeek || 0;
  document.getElementById("stat-today").textContent = stats.today || 0;

  // History list
  const container = document.getElementById("history-list");
  if (!history.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-title">No applications yet</div>
        <div class="empty-state-sub">Applications you fill will appear here.</div>
      </div>`;
    return;
  }

  container.innerHTML = "";
  history.slice(0, 30).forEach(app => {
    const item = document.createElement("div");
    item.className = "history-item";
    const domain = domainFromUrl(app.url || "");
    const ats = app.atsName ? `<span class="history-badge badge-blue">${escapeHtml(app.atsName)}</span>` : "";
    item.innerHTML = `
      <div style="min-width:0;flex:1;">
        <div class="history-title">${escapeHtml(app.title || domain || "Unknown")}</div>
        <div class="history-sub">${escapeHtml(domain)}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
        ${ats}
        <span style="font-size:10.5px;color:var(--text-sub);">${timeAgo(app.timestamp)}</span>
        <span class="history-badge badge-green">${app.fieldsFilled || 0} fields</span>
      </div>`;
    container.appendChild(item);
  });
}

function exportHistoryCSV(history) {
  if (!history.length) { setStatus("No history to export.", "error"); return; }
  const headers = ["Date","Title","URL","ATS","Fields Filled"];
  const rows = history.map(a => [
    new Date(a.timestamp).toLocaleDateString(),
    `"${(a.title || "").replace(/"/g, '""')}"`,
    `"${(a.url || "").replace(/"/g, '""')}"`,
    a.atsName || "",
    a.fieldsFilled || 0,
  ]);
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `jollyR-applications-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Tools / Detection ───────────────────────────────────────────────────────

async function detectFormsOnPage() {
  const resp = await sendToBackground("ALL_FRAMES_DETECT");
  const el = document.getElementById("detection-results");
  if (!resp?.success && !(resp?.forms || []).length) {
    el.textContent = resp?.error || "Could not detect forms. Try refreshing the page.";
    setStatus("Detection failed.", "error");
    return;
  }
  const forms = resp.forms || [];
  if (!forms.length) {
    el.textContent = "No recognizable fields found on this page.";
    setStatus("No fields found.");
    return;
  }
  el.innerHTML = forms.map(f => `
    <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--divider);">
      <span style="font-weight:600;color:var(--text-80);">${escapeHtml(f.type?.replace(/_/g," ") || "unknown")}</span>
      <span style="color:var(--text-sub);">${escapeHtml(f.label || f.id || f.name || "—")}</span>
    </div>`).join("");
  setStatus(`Found ${forms.length} fields across ${resp.framesReached || 1} frame(s).`, "success");
}

async function loadCredentials() {
  const result = await chrome.storage.local.get(["savedCreds"]);
  const creds = result.savedCreds || {};
  const el = document.getElementById("credentials-list");
  const entries = Object.entries(creds);
  if (!entries.length) { el.textContent = "None saved."; return; }
  el.innerHTML = entries.map(([domain, { id, savedAt }]) => `
    <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--divider);">
      <span style="font-weight:600;color:var(--text-80);">${escapeHtml(domain)}</span>
      <span style="color:var(--text-sub);">${escapeHtml(id)} · ${timeAgo(savedAt)}</span>
    </div>`).join("");
}

// ─── ATS Detection ───────────────────────────────────────────────────────────

async function checkAtsStatus() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) return;

  document.getElementById("current-url").value = tabs[0].url || "";

  const resp = await sendToBackground("GET_ATS_STATUS");
  if (resp?.atsName) {
    const bar = document.getElementById("ats-detection-bar");
    const label = document.getElementById("ats-name-label");
    bar.style.display = "flex";
    label.textContent = resp.atsName;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  // ── Tab navigation ───────────────────────────────────────────────────────
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");

      // Lazy-load tab data
      if (btn.dataset.tab === "history") loadHistory();
      if (btn.dataset.tab === "tools")   { checkAtsStatus(); loadCredentials(); }
    });
  });

  // ── Profile ──────────────────────────────────────────────────────────────
  await loadProfile();

  document.getElementById("btn-save-profile").addEventListener("click", saveProfile);
  document.getElementById("btn-clear-profile").addEventListener("click", () => {
    PROFILE_FIELDS.forEach(f => { const el = document.getElementById(f); if (el) el.value = ""; });
    PROFILE_CHECKBOXES.forEach(f => {
      const el = document.getElementById(f);
      if (el) el.checked = false;
    });
    setStatus("Profile cleared.");
  });

  // ── Application tab ──────────────────────────────────────────────────────
  checkAtsStatus();

  // Resume file upload
  const resumeInput = document.getElementById("resume-file-input");
  const resumeDrop  = document.getElementById("resume-drop");
  const resumeTitle = document.getElementById("resume-drop-title");

  resumeInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    resumeTitle.textContent = file.name;
    resumeDrop.classList.add("has-file");

    const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    if (!isPdf) {
      // Non-PDF resumes: store as-is (base64) for future use
      const reader = new FileReader();
      reader.onload = async (ev) => {
        await chrome.storage.local.set({
          sharedPDFData: { base64: ev.target.result, name: file.name, type: file.type },
        });
        setStatus(`Resume saved: ${file.name}`, "success");
      };
      reader.readAsDataURL(file);
      return;
    }

    // PDF resumes: extract text so it can be used for smart filling
    try {
      const processor = new window.RealPDFProcessor();
      const fullText = await processor.processPDF(file);
      const info = processor.extractPersonalInfo(fullText);

      const reader = new FileReader();
      reader.onload = async (ev) => {
        await chrome.storage.local.set({
          sharedPDFData: {
            base64: ev.target.result,
            name: file.name,
            type: file.type,
            resumeText: fullText,
            resumeInfo: info,
            processedAt: Date.now(),
          },
        });
        const words = fullText.split(/\s+/).length;
        setStatus(
          `PDF processed: ${words} words extracted${info.email ? ` · found ${info.email}` : ""}`,
          "success"
        );
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("[jolly R] PDF processing failed:", err);
      resumeDrop.classList.remove("has-file");
      resumeTitle.textContent = "Upload Resume";
      setStatus(err.message || "Failed to process PDF.", "error");
    }
  });

  // Cover letter file upload (stored as-is for attachment to upload fields)
  const coverInput  = document.getElementById("cover-letter-file-input");
  const coverDrop   = document.getElementById("cover-letter-drop");
  const coverTitle  = document.getElementById("cover-letter-drop-title");

  coverInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    coverTitle.textContent = file.name;
    coverDrop.classList.add("has-file");

    const reader = new FileReader();
    reader.onload = async (ev) => {
      await chrome.storage.local.set({
        coverLetterFile: { base64: ev.target.result, name: file.name, type: file.type },
      });
      setStatus(`Cover letter saved: ${file.name}`, "success");
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("btn-fill-app").addEventListener("click", async () => {
    setStatus("Filling application…", "info");
    const profile = readProfileForm();
    // Merge target position/company overrides
    const targetPos = document.getElementById("app-target-position").value.trim();
    const targetCo  = document.getElementById("app-target-company").value.trim();
    if (targetPos) profile.position = targetPos;
    if (targetCo)  profile.company  = targetCo;

    const resp = await sendToBackground("ALL_FRAMES_FILL", profile);
    if (resp?.success) {
      const framesNote = resp.framesReached > 1 ? ` across ${resp.framesReached} frames` : "";
      setStatus(`Filled ${resp.fieldsFilled || 0} fields${framesNote} ✓`, "success");
    } else if (resp?.fieldsFilled === 0 && resp?.framesReached === 0) {
      setStatus("No form found — page may still be loading. Try again in a few seconds.", "error");
    } else {
      setStatus(resp?.error || "Fill failed. Try refreshing.", "error");
    }
  });

  document.getElementById("btn-detect-forms").addEventListener("click", async () => {
    await detectFormsOnPage();
  });

  document.getElementById("btn-clear-forms").addEventListener("click", async () => {
    const resp = await sendToBackground("ALL_FRAMES_CLEAR");
    setStatus(resp?.success ? "Forms cleared." : "Could not clear forms.", resp?.success ? "success" : "error");
  });

  // Password generator
  document.getElementById("btn-gen-password").addEventListener("click", () => {
    const pw = generateStrongPassword();
    document.getElementById("generated-password").value = pw;
  });
  document.getElementById("btn-copy-password").addEventListener("click", () => {
    const pw = document.getElementById("generated-password").value;
    if (!pw) { setStatus("Generate a password first.", "error"); return; }
    navigator.clipboard.writeText(pw).then(() => setStatus("Copied!", "success"));
  });

  // ── History tab ──────────────────────────────────────────────────────────
  document.getElementById("btn-export-history").addEventListener("click", async () => {
    const resp = await sendToBackground(MESSAGE_TYPE.GET_APP_HISTORY);
    exportHistoryCSV(resp?.history || []);
  });

  // ── Tools tab ────────────────────────────────────────────────────────────
  document.getElementById("btn-manual-fill").addEventListener("click", async () => {
    const resp = await sendToBackground("ALL_FRAMES_MANUAL", {
      fillPersonal: true, fillAddress: true, fillProfessional: true,
    });
    if (resp?.success) setStatus(`Filled ${resp.fieldsFilled || 0} fields`, "success");
    else setStatus(resp?.error || "Fill failed. Refresh and try again.", "error");
  });

  document.getElementById("btn-detect-forms-2").addEventListener("click", detectFormsOnPage);

  document.getElementById("btn-clear-forms-2").addEventListener("click", async () => {
    const resp = await sendToBackground("ALL_FRAMES_CLEAR");
    setStatus(resp?.success ? "Forms cleared." : "Could not clear.", resp?.success ? "success" : "error");
  });

  document.getElementById("btn-clear-creds").addEventListener("click", async () => {
    await chrome.storage.local.remove(["savedCreds"]);
    loadCredentials();
    setStatus("Credentials cleared.", "success");
  });
});
