// ─── jolly R Content Script v2.0 ─────────────────────────────────────────────
// Architecture: Shadow DOM isolation, module system, tab state, keep-alive port

(() => {
"use strict";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const MESSAGE_TYPE = {
  CONTENT_SCRIPT_LOAD:      "CONTENT_SCRIPT_LOAD",
  TAB_ACTIVATED:            "TAB_ACTIVATED",
  USER_DATA_UPDATE:         "USER_DATA_UPDATE",
  ATS_ENABLE:               "ATS_ENABLE",
  ATS_START_APPLY_FLOW:     "ATS_START_APPLY_FLOW",
  ATS_AUTO_FILL_STATUS:     "ATS_AUTO_FILL_STATUS",
  ATS_POPUP_MODE_SET:       "ATS_POPUP_MODE_SET",
  ATS_APPLICATION_COMPLETE: "ATS_APPLICATION_COMPLETE",
  GET_USER_PROFILE:         "GET_USER_PROFILE",
  SAVE_USER_PROFILE:        "SAVE_USER_PROFILE",
  GET_APP_HISTORY:          "GET_APP_HISTORY",
  GET_ATS_STATUS:           "GET_ATS_STATUS",
};

const FILL_STATUS = {
  IDLE:      "IDLE",
  DETECTING: "DETECTING",
  FILLING:   "FILLING",
  COMPLETE:  "COMPLETE",
  ERROR:     "ERROR",
};

const POPUP_MODE = {
  HIDDEN:   "HIDDEN",
  TUCKED:   "TUCKED",
  EXPANDED: "EXPANDED",
};

// Whether this window is embedded in a frame
const isFrameWindow = window !== window.parent;

// ─── MODULE STATE (shared across init / UI re-creation) ───────────────────────

const state = {
  initialized: false,
  detector: null,
  filler: null,
  uiService: null,
  autofill: null,
  profile: null,
};

// Field groups used by the popup's MANUAL_FILL_FORM options
const FIELD_GROUPS = {
  personal:     ["first_name", "last_name", "email", "phone"],
  address:      ["address", "city", "state", "zip", "country", "location"],
  professional: ["summary", "skills", "education", "experience", "company", "position", "linkedin", "website", "availability", "work_type", "salary", "industry", "years_experience", "certifications", "cover_letter"],
  legal:        ["work_authorization", "sponsorship", "age_confirmation"],
  position:     ["employment_type", "start_date", "relocate", "travel", "salary"],
  eeo:          ["gender", "race", "veteran_status", "disability_status"],
  application:  ["referral_source", "referred_by", "why_interested", "references", "reference_name", "reference_relationship", "reference_contact"],
  consent:      ["consent_background", "consent_drug", "consent_signature", "consent_terms"],
};

// ─── KEEP-ALIVE PORT ──────────────────────────────────────────────────────────

function initKeepAlivePort() {
  if (isFrameWindow) return;
  let port;
  let bfcached = false;

  const connect = () => {
    if (bfcached) return;
    try {
      port = chrome.runtime.connect({ name: "KEEP_ALIVE_PORT" });
      port.onDisconnect.addListener(() => {
        // Consume the error so Chrome doesn't log "Unchecked runtime.lastError"
        // when the page is moved into the back/forward cache and the channel closes.
        void chrome.runtime.lastError;
        void port.error;
        // Reconnect after short delay to keep service worker alive
        if (!bfcached) setTimeout(connect, 250);
      });
    } catch (e) { /* Extension may be reloading */ }
  };

  connect();

  // Back/forward cache handling: pause reconnects while the page is frozen and
  // re-establish the port once the page is restored from the cache.
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) bfcached = true;
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      bfcached = false;
      connect();
    }
  });
}

// ─── MESSAGE SERVICE ──────────────────────────────────────────────────────────

function sendMessage(type, value) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, value }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch (e) {
      resolve(null);
    }
  });
}

// ─── ATS FIELD DETECTOR ──────────────────────────────────────────────────────

class AtsFieldDetector {
  constructor() {
    // fieldType -> { element, label, value }
    this.detectedFields = new Map();
    this.resumeUploadFields = [];
    this.coverLetterUploadFields = [];
  }

  scan() {
    this.detectedFields.clear();
    this.resumeUploadFields = [];
    this.coverLetterUploadFields = [];

    const inputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select'
    );

    inputs.forEach(el => {
      const fieldType = this._classify(el);
      if (fieldType && !this.detectedFields.has(fieldType)) {
        this.detectedFields.set(fieldType, {
          element: el,
          label: this._getLabel(el),
          value: "",
        });
      }
    });

    // File upload fields
    document.querySelectorAll('input[type="file"]').forEach(el => {
      const label = this._getLabel(el).toLowerCase();
      const id    = (el.id || "").toLowerCase();
      const name  = (el.name || "").toLowerCase();
      const accept= (el.accept || "").toLowerCase();
      if (
        label.includes("resume") || label.includes("cv") ||
        id.includes("resume")   || id.includes("cv") ||
        name.includes("resume") || name.includes("cv") ||
        accept.includes("pdf")
      ) {
        this.resumeUploadFields.push({ element: el, label: this._getLabel(el) });
      } else if (
        label.includes("cover") || id.includes("cover") || name.includes("cover")
      ) {
        this.coverLetterUploadFields.push({ element: el, label: this._getLabel(el) });
      }
    });

    return this.detectedFields;
  }

  _classify(el) {
    const id    = (el.id || "").toLowerCase();
    const name  = (el.name || "").toLowerCase();
    const ph    = (el.placeholder || "").toLowerCase();
    const label = this._getLabel(el).toLowerCase();
    const aria  = (el.getAttribute("aria-label") || "").toLowerCase();
    const qLabel= this._getQuestionLabel(el).toLowerCase();
    const type  = (el.type || el.tagName || "").toLowerCase();
    const all   = `${id} ${name} ${ph} ${label} ${aria} ${qLabel}`;

    // Priority type-based checks
    if (type === "email") return "email";
    if (type === "tel")   return "phone";
    if (type === "file")  return null; // handled separately

    const rules = [
      // Legal & eligibility (specific first)
      { field: "work_authorization", patterns: /\bwork[-_ ]?author|authori[sz]ed to work|right to work|legally authori[sz]ed|eligible to work|work permit/ },
      { field: "sponsorship",        patterns: /\bsponsor/ },
      { field: "age_confirmation",   patterns: /\bare you (over )?18|at least 18|over 18|18\+|years of age|age 18|18 years|minimum age/ },
      // EEO / diversity
      { field: "gender",             patterns: /\b(gender|sex)\b/ },
      { field: "race",               patterns: /\b(race|ethnic|ethnicity)\b/ },
      { field: "veteran_status",     patterns: /\b(veteran|military|armed forces)\b/ },
      { field: "disability_status",  patterns: /\bdisabilit/ },
      // Experience & education extras
      { field: "years_experience",   patterns: /\byears.{0,12}experience|yrs.{0,12}experience|professional experience/ },
      { field: "certifications",     patterns: /\b(certificat|licens)/ },
      { field: "cover_letter",       patterns: /\bcover[-_ ]?letter/ },
      // Application-specific
      { field: "reference_name",         patterns: /\breference.{0,20}name|name.{0,20}reference/ },
      { field: "reference_relationship", patterns: /\brelationship/ },
      { field: "reference_contact",      patterns: /\breference.{0,20}(email|phone|contact|number)|contact.{0,20}reference/ },
      { field: "references",             patterns: /\breferences?\b/ },
      { field: "referred_by",        patterns: /\breferred by|referring employee|employee referral/ },
      { field: "referral_source",    patterns: /\bhow did you hear|referral source|source of|referral/ },
      { field: "why_interested",     patterns: /\bwhy.{0,20}(interest|apply|join|want)|interest.{0,20}(role|position|company)|motivation|tell us (about|why)/ },
      // Position details
      { field: "employment_type",    patterns: /\bemployment[-_ ]?type|job type|full[- ]?time|part[- ]?time|contract|work arrangement/ },
      { field: "relocate",           patterns: /\brelocat/ },
      { field: "travel",             patterns: /\btravel/ },
      // Base fields
      { field: "first_name", patterns: /\b(first|fname|given|forename|firstname|first[-_]name)\b/ },
      { field: "last_name",  patterns: /\b(last|lname|surname|family|lastname|last[-_]name)\b/ },
      { field: "email",      patterns: /\b(email|e[-]?mail)\b/ },
      { field: "phone",      patterns: /\b(phone|mobile|telephone|cell|tel)\b/ },
      { field: "address",    patterns: /\b(address|street|addr)\b/ },
      { field: "city",       patterns: /\b(city|town|locality)\b/ },
      { field: "state",      patterns: /\b(state|province|region)\b/ },
      { field: "zip",        patterns: /\b(zip|postal|postcode)\b/ },
      { field: "country",    patterns: /\b(country|nation)\b/ },
      { field: "location",   patterns: /\b(location|where are you based|work location|located)\b/ },
      { field: "linkedin",   patterns: /\b(linkedin|linked[-_]?in)\b/ },
      { field: "website",    patterns: /\b(website|portfolio|url)\b/ },
      { field: "salary",     patterns: /\b(salary|compensation|wage|pay)\b/ },
      { field: "summary",    patterns: /\b(summary|objective|profile|about|bio|introduction)\b/ },
      { field: "skills",     patterns: /\b(skills|competenc|technologies|tech)\b/ },
      { field: "education",  patterns: /\b(education|degree|university|college|school)\b/ },
      { field: "experience", patterns: /\b(experience|employment|work[-_]history|career)\b/ },
      { field: "company",    patterns: /\b(company|employer|organization|firm)\b/ },
      { field: "position",   patterns: /\b(position|title|job[-_]title|role)\b/ },
      { field: "start_date", patterns: /\b(start[-_]?date|begin[-_]?date)\b/ },
      { field: "end_date",   patterns: /\b(end[-_]?date|finish[-_]?date)\b/ },
      { field: "industry",   patterns: /\b(industry|sector|domain|field)\b/ },
      { field: "username",   patterns: /\b(username|user[-_]?name|login)\b/ },
      { field: "password",   patterns: /\b(password|passwd)\b/ },
      { field: "availability", patterns: /\b(availability|start|available|notice)\b/ },
      { field: "work_type",  patterns: /\b(work[-_]type|remote|hybrid)\b/ },
      // Consent (last — most generic; specific matches win ties above)
      { field: "consent_background", patterns: /\b(background check|background)\b/ },
      { field: "consent_drug",       patterns: /\b(drug (screen|test|testing)|drug)\b/ },
      { field: "consent_signature",  patterns: /\b(e[- ]?signature|signature|sign|electronic signature)\b/ },
      { field: "consent_terms",      patterns: /\b(terms|privacy|conditions|agree|accept|acknowledg|disclosure)\b/ },
      { field: "consent",            patterns: /\b(consent|authori[sz]ation|acknowledg|agree|accept)\b/ },
    ];

    let best = null, bestScore = 0;
    for (const { field, patterns } of rules) {
      const m = all.match(patterns);
      if (m) {
        // Consent rules are the most generic; cap their base score so wording
        // like "voluntary self-identification of disability" (or "EEO
        // disclosure") can't outrank the specific disability/veteran/legal
        // rules and hijack the field.
        const cap = field.startsWith("consent") ? 1 : m.length;
        const score = cap * 50 + (id.match(patterns) ? 30 : 0) + (name.match(patterns) ? 20 : 0);
        if (score > bestScore) { bestScore = score; best = field; }
      }
    }
    return bestScore >= 50 ? best : null;
  }

  // For radio/checkbox groups, resolve the enclosing QUESTION label (fieldset
  // legend or a descriptive option label) instead of the bare option label.
  _getQuestionLabel(el) {
    if (el.type === "radio" && el.name) {
      const group = Array.from(document.getElementsByName(el.name));
      const fs = group[0]?.closest("fieldset");
      if (fs) {
        const legend = fs.querySelector("legend");
        if (legend) return legend.textContent.trim();
      }
      for (const member of group) {
        const lbl = this._getLabel(member).trim();
        if (lbl && !/^(yes|no|y|n|none|n\/a|prefer not to (say|answer))$/i.test(lbl) && lbl.length > 8) {
          return lbl;
        }
      }
    }
    return "";
  }

  _getLabel(el) {
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) return lbl.textContent.trim();
    }
    const parentLbl = el.closest("label");
    if (parentLbl) return parentLbl.textContent.trim();
    if (el.placeholder) return el.placeholder;
    const prev = el.previousElementSibling;
    if (prev && prev.textContent.trim()) return prev.textContent.trim();
    return "";
  }
}

// ─── FORM FILLER ──────────────────────────────────────────────────────────────

class FormFiller {
  fillElement(element, value) {
    if (!element || value === undefined || value === null || value === "") return false;
    const str = String(value);
    try {
      if (element.tagName === "SELECT") {
        return this._fillSelect(element, str);
      }
      // INPUT or TEXTAREA
      element.focus();
      // Native setter trick for React/Vue controlled inputs
      const proto = element.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value");
      if (setter && setter.set) {
        setter.set.call(element, str);
      } else {
        element.value = str;
      }
      element.dispatchEvent(new Event("input",  { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur",   { bubbles: true }));
      return true;
    } catch (e) {
      console.warn("[jolly R] fillElement error:", e);
      return false;
    }
  }

  _fillSelect(el, value) {
    const opts = Array.from(el.options);
    const match = opts.find(o => this._matchesOption(o, value));
    if (match) {
      el.value = match.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }

  // Custom select widgets (React-Select / Remix select, Greenhouse, etc.) render
  // as an <input role="combobox"> whose value is owned by React state — writing
  // to the input directly never registers. Instead we open the flyout, find the
  // matching option (role="option"), and click it; if no options render yet we
  // type the value first (native setter + input event) so the widget can filter.
  async fillCombobox(element, value) {
    if (!element || value === undefined || value === null || value === "") return false;
    const valueStr = String(value);
    const target = this._normOptionText(valueStr);
    const tokens = target.split(" ").filter(Boolean);
    if (!target) return false;

    const isGoodOption = (opt) => {
      const t = (opt.textContent || "").trim();
      if (!t || /^(select[.]{0,3}|choose[.]{0,3}|…)$/i.test(t)) return false;
      const c = this._normOptionText(t);
      return c.includes(target) || (tokens.length > 1 && tokens.every(tk => c.includes(tk)));
    };

    // Only consider options that are actually rendered/visible. Pages that mix
    // widgets (e.g. Greenhouse: a React-Select country field + an intl-tel
    // phone widget whose hidden country list also has [role="option"]) would
    // otherwise make us "fill" the wrong widget.
    const isVisible = (opt) => {
      try {
        if (opt.getAttribute("aria-hidden") === "true") return false;
        return opt.offsetParent !== null || opt.getClientRects().length > 0;
      } catch (e) {
        return true;
      }
    };

    // Prefer the widget's own flyout over the whole document, so a matching
    // option in an unrelated widget (phone country list, etc.) never wins.
    const controlBox = element.closest(".select__control");
    const widgetRoot = (controlBox && controlBox.parentElement) || element.parentElement;

    const pickFrom = (root) =>
      Array.from((root || document).querySelectorAll('[role="option"], .select__option'))
        .find(o => isGoodOption(o) && isVisible(o)) || null;

    const pickOption = () => {
      const local = widgetRoot ? pickFrom(widgetRoot) : null;
      if (local) return local;
      // Fallback: any matching VISIBLE option anywhere in the document.
      return Array.from(document.querySelectorAll('[role="option"], .select__option'))
        .find(o => isGoodOption(o) && isVisible(o)) || null;
    };

    const clickOption = (opt) => {
      opt.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      opt.dispatchEvent(new MouseEvent("mouseup",   { bubbles: true, cancelable: true, view: window }));
      opt.dispatchEvent(new MouseEvent("click",     { bubbles: true, cancelable: true, view: window }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur",   { bubbles: true }));
    };

    const waitForOption = async (attempts, delay) => {
      for (let i = 0; i < attempts; i++) {
        const opt = pickOption();
        if (opt) return opt;
        await new Promise(r => setTimeout(r, delay));
      }
      return null;
    };

    const openMenu = () => {
      const control = element.closest(".select__control") || element.parentElement;
      (control || element).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      (control || element).dispatchEvent(new MouseEvent("click",     { bubbles: true, cancelable: true, view: window }));
      element.focus();
    };

    try {
      // Attempt 1: open the menu and click the matching option
      openMenu();
      let opt = await waitForOption(5, 100);
      if (opt) { clickOption(opt); return true; }

      // Attempt 2: type the value (native setter + events), then click the option.
      // Search-driven widgets (e.g. Greenhouse location) return options from the
      // server after we type, so wait longer for them to appear.
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      if (setter && setter.set) setter.set.call(element, valueStr);
      else element.value = valueStr;
      element.dispatchEvent(new Event("input",  { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.focus();
      opt = await waitForOption(12, 200);
      if (opt) { clickOption(opt); return true; }

      // Attempt 3: press Enter to commit the typed value
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      element.dispatchEvent(new KeyboardEvent("keyup",   { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 60));
      return true;
    } catch (e) {
      console.warn("[jolly R] fillCombobox error:", e);
      return false;
    }
  }

  fillFileUpload(element, file) {
    if (!element || !file) return false;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      element.files = dt.files;
      element.dispatchEvent(new Event("input",  { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur",   { bubbles: true }));
      return true;
    } catch (e) {
      console.warn("[jolly R] fillFileUpload error:", e);
      return false;
    }
  }

  fillResumeFile(element, file) {
    return this.fillFileUpload(element, file);
  }

  fillCheckbox(element, shouldCheck) {
    // Accepts checkboxes AND radios (radios are "checked" in the same way)
    if (!element || (element.type !== "checkbox" && element.type !== "radio")) return false;
    try {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "checked");
      if (setter && setter.set) setter.set.call(element, !!shouldCheck);
      else element.checked = !!shouldCheck;
      element.dispatchEvent(new Event("click",  { bubbles: true }));
      element.dispatchEvent(new Event("input",  { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur",   { bubbles: true }));
      return true;
    } catch (e) {
      console.warn("[jolly R] fillCheckbox error:", e);
      return false;
    }
  }

  // Normalize option text for comparison: lowercase, collapse separators so
  // "Hispanic/Latino" matches "Hispanic or Latino" etc.
  _normOptionText(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[\/_]+/g, " ")
      .replace(/\s+or\s+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Resolve an option's visible label, handling BOTH:
  //   <label><input> Option text</label>          (label wraps the input)
  //   <label for="x">Option text</label><input id="x">
  _getOptionLabel(opt) {
    if (opt.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(opt.id)}"]`);
      if (lbl) return lbl.textContent.trim();
    }
    const parentLbl = opt.closest("label");
    if (parentLbl) return parentLbl.textContent.trim();
    return opt.value || "";
  }

  // Substring match plus a token fallback ("black african american" vs
  // "Black/African American") against both the visible label and option value.
  _matchesOption(opt, valueStr) {
    if (!valueStr) return false;
    const target = this._normOptionText(valueStr);
    const tokens = target.split(" ").filter(Boolean);
    const text = this._normOptionText(this._getOptionLabel(opt));
    if (text && (text.includes(target) || (tokens.length > 1 && tokens.every(t => text.includes(t))))) return true;
    const val = this._normOptionText(opt.value);
    if (val && (val.includes(target) || (tokens.length > 1 && tokens.every(t => val.includes(t))))) return true;
    return false;
  }

  fillRadioGroup(element, value) {
    if (!element || element.type !== "radio" || !element.name) return false;
    const valueStr = String(value ?? "").toLowerCase().trim();
    const options = Array.from(document.getElementsByName(element.name));
    if (!options.length) return false;

    let pick = null;
    if (valueStr && !/prefer not|decline|do not wish|rather not|choose not|wish not/i.test(valueStr)) {
      // 1) Exact / substring / token match on label or option value
      pick = options.find(o => this._matchesOption(o, valueStr));
    } else {
      // 2) "Prefer not to say" / decline handling
      pick = options.find(o => /prefer not|decline|do not wish|rather not|choose not|wish not/i.test(this._getOptionLabel(o)));
    }

    if (!pick) {
      // 3) Polarity match for literal Yes/No questions
      const positive = /^(yes|true|y)$|^i (am|have|do|will) |authorized|eligible|willing|^can /.test(valueStr);
      const negative = /^(no|false|n)$|not |never|decline|unable/.test(valueStr);
      pick = options.find(o => {
        const t = ` ${this._getOptionLabel(o)} ${o.value} `.toLowerCase();
        if (positive && !/not /.test(t)) return /yes|^i (am|have|do|will) |authorized|eligible|willing|^can /.test(t);
        if (negative) return /no|not |never|decline|unable/.test(t);
        return false;
      });
    }

    if (!pick) return false;
    return this.fillCheckbox(pick, true);
  }

  fillCheckboxGroup(element, value) {
    if (!element || element.type !== "checkbox") return false;
    const valueStr = String(value ?? "").toLowerCase().trim();

    // Resolve the group: shared name first; otherwise widen to the nearest
    // container holding several checkboxes (multi-select groups often use
    // distinct per-option names instead of a shared name/fieldset).
    let candidates = element.name
      ? Array.from(document.getElementsByName(element.name))
      : [];
    if (candidates.length <= 1) {
      let scope = element.parentElement;
      while (scope && scope !== document.body) {
        const cbs = Array.from(scope.querySelectorAll('input[type="checkbox"]'));
        if (cbs.length > 1) { candidates = cbs; break; }
        scope = scope.parentElement;
      }
      if (candidates.length <= 1) candidates = [element];
    }

    let pick = null;
    if (valueStr && !/prefer not|decline|do not wish|rather not|choose not|wish not/i.test(valueStr)) {
      pick = candidates.find(o => this._matchesOption(o, valueStr));
    } else {
      pick = candidates.find(o => /prefer not|decline|do not wish|rather not|choose not|wish not/i.test(this._getOptionLabel(o)));
    }
    if (!pick) return false;
    return this.fillCheckbox(pick, true);
  }
}

// ─── NETWORK IDLE MONITOR ─────────────────────────────────────────────────────
// Waits for network to go quiet before starting autofill

class NetworkIdleMonitor {
  constructor() {
    this._pending = 0;
    this._lastActivity = Date.now();
    this._observer = null;
  }

  waitForIdle(timeoutMs = 3000, idleMs = 400) {
    return new Promise(resolve => {
      const timeout = setTimeout(resolve, timeoutMs);
      const check = () => {
        if (document.readyState === "complete") {
          clearTimeout(timeout);
          setTimeout(resolve, idleMs);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
}

// ─── AUTOFILL ORCHESTRATOR ───────────────────────────────────────────────────

class AutofillOrchestrator {
  constructor(detector, filler, uiService) {
    this.detector = detector;
    this.filler   = filler;
    this.ui       = uiService;
    this.isRunning = false;
    this.networkMonitor = new NetworkIdleMonitor();
  }

  async run(profile) {
    if (this.isRunning) return { fieldsFilled: 0, skipped: true };
    if (!profile) {
      this.ui.showToast("No profile found. Please set up your profile in jolly R.", "error");
      return { fieldsFilled: 0 };
    }
    this.isRunning = true;
    this.ui.setFillStatus(FILL_STATUS.DETECTING);

    try {
      // Wait for network to settle
      await this.networkMonitor.waitForIdle(2000);

      // Scan forms — SPA forms (e.g. Greenhouse embed) render after the network
      // settles, so retry several times before giving up.
      let fields = this.detector.scan();
      if (fields.size === 0) {
        for (let attempt = 0; attempt < 10 && fields.size === 0; attempt++) {
          await pause(500);
          fields = this.detector.scan();
        }
      }
      if (fields.size === 0) {
        this.ui.setFillStatus(FILL_STATUS.IDLE);
        this.ui.showToast("No form fields detected on this page.", "info");
        this.isRunning = false;
        return { fieldsFilled: 0 };
      }

      this.ui.setFillStatus(FILL_STATUS.FILLING);
      this.ui.showFieldList(fields, profile);

      // Build value map from profile
      const valueMap = buildValueMap(profile);

      let filled = 0;
      for (const [fieldType, fieldData] of fields) {
        const value = valueMap[fieldType];
        if (!value) continue;

        // Animate: highlight current field
        this.ui.highlightField(fieldType, "filling");
        await pause(80);

        const el = fieldData.element;
        let success = false;
        if (el.type === "checkbox") {
          success = typeof value === "boolean"
            ? this.filler.fillCheckbox(el, value)
            : this.filler.fillCheckboxGroup(el, value);
        } else if (el.type === "radio") {
          success = this.filler.fillRadioGroup(el, value);
        } else if (el.getAttribute && (el.getAttribute("role") === "combobox" || el.getAttribute("aria-haspopup") === "true")) {
          // Custom select widgets (React-Select / Greenhouse): open the flyout
          // and click the matching option instead of writing to the input.
          success = await this.filler.fillCombobox(el, value);
        } else {
          success = this.filler.fillElement(el, value);
        }
        if (success) {
          filled++;
          fieldData.value = value;
          this.ui.highlightField(fieldType, "filled", value);
        }
        await pause(60);
      }

      // Attach stored resume to resume/CV upload fields
      const resumeFile = await loadStoredResume();
      const resumeCount = this.detector.resumeUploadFields.length;
      if (resumeCount && resumeFile) {
        for (const rf of this.detector.resumeUploadFields) {
          if (await this.filler.fillResumeFile(rf.element, resumeFile)) {
            filled++;
          }
        }
      } else if (resumeCount) {
        this.ui.showToast("No resume on file — upload one in the jolly R popup.", "info");
      }

      // Attach stored cover letter to cover-letter upload fields
      const coverFile = await loadStoredCoverLetter();
      const coverCount = this.detector.coverLetterUploadFields.length;
      if (coverCount && coverFile) {
        for (const cf of this.detector.coverLetterUploadFields) {
          if (await this.filler.fillFileUpload(cf.element, coverFile)) {
            filled++;
          }
        }
      }

      // Handle account creation fields
      filled += await this._handleAccountFields(profile);

      this.ui.setFillStatus(FILL_STATUS.COMPLETE);
      this.ui.showComplete(
        filled,
        fields.size +
          (resumeCount && resumeFile ? resumeCount : 0) +
          (coverCount && coverFile ? coverCount : 0)
      );

      // Log to background
      await sendMessage(MESSAGE_TYPE.ATS_APPLICATION_COMPLETE, {
        url:          window.location.href,
        title:        document.title,
        fieldsFilled: filled,
      });

      return { fieldsFilled: filled, totalFields: fields.size };
    } catch (err) {
      console.error("[jolly R] autofill error:", err);
      this.ui.setFillStatus(FILL_STATUS.ERROR);
      this.ui.showToast("AutoFill encountered an error.", "error");
      return { fieldsFilled: 0 };
    } finally {
      this.isRunning = false;
    }
  }

  async _handleAccountFields(profile) {
    let filled = 0;
    const passwordFields = document.querySelectorAll('input[type="password"]');
    if (passwordFields.length === 0) return 0;

    const password = generatePassword();

    // Fill email in login form if not already filled
    const emailFields = document.querySelectorAll('input[type="email"], input[name*="email"], input[id*="email"]');
    emailFields.forEach(el => {
      if (!el.value && profile.email) {
        this.filler.fillElement(el, profile.email);
        filled++;
      }
    });

    // Fill password fields
    passwordFields.forEach(el => {
      if (!el.value) {
        this.filler.fillElement(el, password);
        filled++;
      }
    });

    if (filled > 0) {
      await saveCredentials(profile.email, password);
    }

    return filled;
  }
}

// ─── VALUE MAP & FIELD HELPERS ────────────────────────────────────────────────

function buildValueMap(profile) {
  if (!profile) return {};
  const skills = Array.isArray(profile.skills)
    ? profile.skills.join(", ")
    : (profile.skills || "");

  return {
    first_name:   profile.firstName || "",
    last_name:    profile.lastName  || "",
    email:        profile.email     || "",
    phone:        profile.phone     || "",
    address:      profile.address   || "",
    city:         profile.city      || "",
    state:        profile.state     || "",
    zip:          profile.zip       || "",
    country:      profile.country   || "",
    // "Location" fields (Greenhouse-style) get the address, falling back to "city, state"
    location:     profile.address || [profile.city, profile.state].filter(Boolean).join(", ") || "",
    linkedin:     profile.linkedin  || "",
    website:      profile.website   || "",
    summary:      profile.summary   || "",
    skills:       skills,
    education:    profile.education || "",
    experience:   profile.experience || profile.summary || "",
    company:      profile.company   || "",
    position:     profile.position  || "",
    salary:       profile.salary    || "",
    availability: profile.availability || "Immediate",
    work_type:    profile.workType  || "",
    industry:     profile.industry  || "",
    // Legal & eligibility
    work_authorization: profile.workAuthorization || "",
    sponsorship:        profile.sponsorshipNeeded || "",
    age_confirmation:   profile.ageConfirmed || "",
    // EEO (voluntary)
    gender:            profile.gender || "",
    race:              profile.race || "",
    veteran_status:    profile.veteranStatus || "",
    disability_status: profile.disabilityStatus || "",
    // Position details
    employment_type: profile.employmentType || "",
    start_date:      profile.startDate || "",
    relocate:        profile.relocate || "",
    travel:          profile.travel || "",
    // Experience & education extras
    years_experience: profile.yearsExperience || "",
    certifications:   profile.certifications || "",
    cover_letter:     profile.coverLetter || "",
    // Application-specific
    referral_source:         profile.referralSource || "",
    referred_by:             profile.referredBy || "",
    why_interested:          profile.whyInterested || "",
    references:              profile.references || "",
    reference_name:          profile.referenceName || "",
    reference_relationship:  profile.referenceRelationship || "",
    reference_contact:       profile.referenceContact || "",
    // Consent (per-item, only when the matching profile toggle is ON)
    consent_background: !!profile.consentBackgroundCheck,
    consent_drug:       !!profile.consentDrugScreening,
    consent_signature:  !!profile.consentSignature,
    consent_terms:      !!profile.consentTerms,
  };
}

function clearFormFields() {
  document.querySelectorAll(
    'input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]), textarea'
  ).forEach(el => {
    if (el.value) {
      el.value = "";
      el.dispatchEvent(new Event("input",  { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}

async function loadStoredFile(key, fallbackName) {
  try {
    const data = (await chrome.storage.local.get(key))[key];
    if (!data?.base64) return null;
    const blob = await (await fetch(data.base64)).blob();
    return new File([blob], data.name || fallbackName || "file", {
      type: data.type || blob.type,
    });
  } catch (e) {
    return null;
  }
}

async function loadStoredResume() {
  return loadStoredFile("sharedPDFData", "resume");
}

async function loadStoredCoverLetter() {
  return loadStoredFile("coverLetterFile", "cover-letter");
}

// ─── CREDENTIAL MANAGER ──────────────────────────────────────────────────────

async function saveCredentials(id, password) {
  try {
    if (window.PasswordCredential) {
      const cred = new PasswordCredential({ id, password });
      await navigator.credentials.store(cred);
    } else {
      // Fallback: store only the account id (never the raw password in plaintext).
      const result = await chrome.storage.local.get(["savedCreds"]);
      const creds = result.savedCreds || {};
      creds[window.location.hostname] = { id, savedAt: Date.now() };
      await chrome.storage.local.set({ savedCreds: creds });
    }
  } catch (e) {
    // Silently fail — credential saving is best-effort
  }
}

function generatePassword() {
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
  // Fisher-Yates shuffle (crypto-secure)
  for (let i = pass.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [pass[i], pass[j]] = [pass[j], pass[i]];
  }
  return pass.join("");
}

// ─── UI SERVICE (renders into Shadow DOM) ─────────────────────────────────────

class UIService {
  constructor(shadowRoot) {
    this.shadow = shadowRoot;
    this.popupMode = POPUP_MODE.TUCKED;
    this.fillStatus = FILL_STATUS.IDLE;
    this._fieldStates = new Map();
    this._stats = null;
    this._profile = null;
    this._atsName = null;
    this._render();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  setProfile(profile) {
    this._profile = profile;
    this._update();
  }

  setStats(stats) {
    this._stats = stats;
    this._update();
  }

  setAtsName(name) {
    this._atsName = name;
    this._update();
  }

  setFillStatus(status) {
    this.fillStatus = status;
    this._update();
  }

  showFieldList(fields, profile) {
    this._fieldStates = new Map();
    for (const [type] of fields) {
      this._fieldStates.set(type, { status: "pending" });
    }
    this._update();
  }

  highlightField(fieldType, status, value = "") {
    if (this._fieldStates.has(fieldType)) {
      this._fieldStates.set(fieldType, { status, value });
    }
    this._update();
  }

  showComplete(filled, total) {
    this._completeFilled = filled;
    this._completeTotal  = total;
    this._update();
  }

  showToast(message, type = "info") {
    const icons = { success: "✅", error: "❌", info: "ℹ️" };
    const toast = this._el("div", `jR-toast ${type}`);
    toast.innerHTML = `<span class="jR-toast-icon">${icons[type] || "ℹ️"}</span><span>${message}</span>`;
    this.shadow.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("exit");
      setTimeout(() => toast.remove(), 320);
    }, 3500);
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  _render() {
    // Root wrapper
    this._root = this._el("div", "jR-root");
    this.shadow.appendChild(this._root);
    this._update();
  }

  _update() {
    const prevMode = this._prevMode;
    this._prevMode = this.popupMode;

    // Clear root and re-render current state
    this._root.innerHTML = "";

    if (this.popupMode === POPUP_MODE.HIDDEN) {
      return;
    }

    if (this.popupMode === POPUP_MODE.TUCKED) {
      this._root.appendChild(this._renderTab());
      return;
    }

    // EXPANDED mode
    const panel = this._el("div", "jR-panel");
    if (prevMode === POPUP_MODE.TUCKED) panel.classList.add("open");
    panel.appendChild(this._renderHeader());

    const body = this._el("div", "jR-body");

    if (!this._profile) {
      body.appendChild(this._renderNoProfile());
    } else if (this.fillStatus === FILL_STATUS.COMPLETE && this._completeFilled !== undefined) {
      body.appendChild(this._renderComplete());
    } else {
      if (this._stats) body.appendChild(this._renderStats());
      body.appendChild(this._renderStatusBar());
      if (this._fieldStates.size > 0) body.appendChild(this._renderFieldList());
      body.appendChild(this._renderActions());
    }

    panel.appendChild(body);
    this._root.appendChild(panel);
  }

  _renderTab() {
    const btn = this._el("button", "jR-trigger");
    btn.innerHTML = `
      <svg class="jR-trigger-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      ${this._logoSvg(20)}
      <span class="jR-trigger-label">jolly R</span>
    `;
    btn.addEventListener("click", () => {
      this.popupMode = POPUP_MODE.EXPANDED;
      this._update();
    });
    return btn;
  }

  _renderHeader() {
    const header = this._el("div", "jR-header");

    const logo = this._el("div", "jR-header-logo");
    logo.innerHTML = `${this._logoSvg(20)}<span>jolly R</span>`;
    header.appendChild(logo);

    if (this._atsName) {
      const badge = this._el("span", "jR-header-ats");
      badge.textContent = this._atsName;
      header.appendChild(badge);
    }

    const closeBtn = this._el("button", "jR-header-close");
    closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`;
    closeBtn.title = "Minimize";
    closeBtn.addEventListener("click", () => {
      this.popupMode = POPUP_MODE.TUCKED;
      this._update();
    });
    header.appendChild(closeBtn);
    return header;
  }

  _renderStats() {
    const s = this._stats;
    const row = this._el("div", "jR-stats");
    const items = [
      { num: s.today,     label: "Today" },
      { num: s.thisWeek,  label: "Week" },
      { num: s.thisMonth, label: "Month" },
    ];
    items.forEach(({ num, label }) => {
      const stat = this._el("div", "jR-stat");
      stat.innerHTML = `<div class="jR-stat-num">${num}</div><div class="jR-stat-label">${label}</div>`;
      row.appendChild(stat);
    });
    return row;
  }

  _renderStatusBar() {
    const bar = this._el("div", "jR-status-bar");
    const dot = this._el("span", `jR-status-dot ${this.fillStatus.toLowerCase()}`);
    const label = this._el("span");

    const labels = {
      [FILL_STATUS.IDLE]:      "Ready to fill",
      [FILL_STATUS.DETECTING]: "Scanning form fields…",
      [FILL_STATUS.FILLING]:   "Filling fields…",
      [FILL_STATUS.COMPLETE]:  "All done!",
      [FILL_STATUS.ERROR]:     "Something went wrong",
    };
    label.textContent = labels[this.fillStatus] || "Ready";

    if (this.fillStatus === FILL_STATUS.FILLING) {
      const spinner = this._el("span", "jR-spinner");
      spinner.style.cssText = "width:14px;height:14px;border-width:2px;border-color:rgba(225,165,240,.3);border-top-color:var(--jR-primary)";
      bar.appendChild(spinner);
    } else {
      bar.appendChild(dot);
    }
    bar.appendChild(label);
    return bar;
  }

  _renderFieldList() {
    const list = this._el("ul", "jR-field-list");
    const statusIcons = {
      pending: `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" stroke="#d1d5db" stroke-width="1.5" fill="none"/></svg>`,
      filling: `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" stroke="#e1a5f0" stroke-width="1.5" fill="none"/><circle cx="7" cy="7" r="3" fill="#e1a5f0"/></svg>`,
      filled:  `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="#10b981"/><path d="M4 7l2 2 4-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
    };

    const friendlyNames = {
      first_name: "First Name", last_name: "Last Name", email: "Email",
      phone: "Phone", address: "Address", city: "City", state: "State",
      zip: "ZIP Code", country: "Country", linkedin: "LinkedIn", website: "Website",
      summary: "Summary", skills: "Skills", education: "Education",
      experience: "Experience", company: "Company", position: "Position",
      salary: "Salary", availability: "Availability", work_type: "Work Type",
      industry: "Industry", username: "Username", password: "Password",
      start_date: "Start Date", end_date: "End Date",
    };

    for (const [type, state] of this._fieldStates) {
      const item = this._el("li", `jR-field-item ${state.status}`);
      item.innerHTML = `
        <span class="jR-field-icon">${statusIcons[state.status] || statusIcons.pending}</span>
        <span class="jR-field-name">${friendlyNames[type] || type.replace(/_/g, " ")}</span>
        ${state.value ? `<span class="jR-field-value">${this._truncate(state.value, 18)}</span>` : ""}
      `;
      list.appendChild(item);
    }
    return list;
  }

  _renderActions() {
    const frag = document.createDocumentFragment();

    if (this.fillStatus === FILL_STATUS.FILLING) {
      const btn = this._el("button", "jR-btn jR-btn-primary");
      btn.disabled = true;
      btn.innerHTML = `<span class="jR-spinner"></span><span>Filling…</span>`;
      frag.appendChild(btn);
    } else {
      const fillBtn = this._el("button", "jR-btn jR-btn-primary");
      fillBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M8 2l6 6-6 6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>Fill Application</span>
      `;
      fillBtn.addEventListener("click", () => {
        // Signal autofill start
        document.dispatchEvent(new CustomEvent("jollyR:triggerFill"));
      });
      frag.appendChild(fillBtn);

      const row = this._el("div", "jR-btn-row");
      const detectBtn = this._el("button", "jR-btn jR-btn-secondary");
      detectBtn.textContent = "Scan Fields";
      detectBtn.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("jollyR:scanFields"));
      });

      const clearBtn = this._el("button", "jR-btn jR-btn-secondary");
      clearBtn.textContent = "Clear";
      clearBtn.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("jollyR:clearForms"));
      });

      row.appendChild(detectBtn);
      row.appendChild(clearBtn);
      frag.appendChild(row);
    }
    return frag;
  }

  _renderNoProfile() {
    const frag = document.createDocumentFragment();
    const empty = this._el("div", "jR-empty");
    empty.innerHTML = `
      <div class="jR-empty-icon">📝</div>
      <div class="jR-empty-title">Set Up Your Profile</div>
      <div class="jR-empty-sub">Add your info in the jolly R popup to start filling applications instantly.</div>
    `;
    const btn = this._el("button", "jR-btn jR-btn-primary");
    btn.textContent = "Open jolly R";
    btn.addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_POPUP" }));
    frag.appendChild(empty);
    frag.appendChild(btn);
    return frag;
  }

  _renderComplete() {
    const frag = document.createDocumentFragment();
    const badge = this._el("div", "jR-complete-badge");
    badge.innerHTML = `
      <div class="jR-complete-icon">✅</div>
      <div class="jR-complete-title">Application Filled!</div>
      <div class="jR-complete-sub">${this._completeFilled} of ${this._completeTotal} fields completed</div>
    `;

    const div = this._el("div", "jR-divider");
    const row = this._el("div", "jR-btn-row");

    const refillBtn = this._el("button", "jR-btn jR-btn-secondary");
    refillBtn.textContent = "Fill Again";
    refillBtn.addEventListener("click", () => {
      this.fillStatus = FILL_STATUS.IDLE;
      this._completeFilled = undefined;
      this._fieldStates = new Map();
      this._update();
    });

    row.appendChild(refillBtn);
    frag.appendChild(badge);
    frag.appendChild(div);
    frag.appendChild(row);
    return frag;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _el(tag, cls = "") {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }

  _truncate(str, max) {
    return str.length > max ? str.slice(0, max) + "…" : str;
  }

  _logoSvg(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" fill="rgba(255,255,255,0.22)"/>
      <path d="M7 12l3 3 7-7" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
}

// ─── CONTENT SCRIPT MAIN ──────────────────────────────────────────────────────

function pause(ms) { return new Promise(r => setTimeout(r, ms)); }

// Check if this frame should be excluded (tracking frames, captcha, etc.)
function isExcludedFrame() {
  if (!isFrameWindow) return false;
  const src = window.location.href.toLowerCase();
  const excluded = ["captcha", "recaptcha", "google-analytics", "googletagmanager",
                    "facebook.com/tr", "doubleclick", "hotjar"];
  return excluded.some(e => src.includes(e));
}

// No-op UI for subframes: the fill pipeline needs a ui object, but we never
// render the dock inside an embedded frame — only the top-level page gets it.
function createFrameUiStub() {
  return {
    setFillStatus:    () => {},
    showToast:        () => {},
    highlightField:   () => {},
    showFieldList:    () => {},
    showComplete:     () => {},
    setProfile:       () => {},
    setStats:         () => {},
    setAtsName:       () => {},
    _atsName: null,
  };
}

function ensureUi() {
  // In frames we still need the detector/filler/autofill pipeline, but the
  // visual UI (dock, toasts, highlights) only ever lives in the top frame.
  if (isFrameWindow) {
    if (state.autofill) return;
    state.autofill = new AutofillOrchestrator(state.detector, state.filler, createFrameUiStub());
    return;
  }
  if (state.uiService) return;
  const rootId = "jolly-r-root";
  let host = document.getElementById(rootId);
  if (!host) {
    host = document.createElement("div");
    host.id = rootId;
    Object.assign(host.style, {
      position: "fixed",
      bottom: "8px",
      right: "0",
      zIndex: "2147483647",
      border: "none",
      outline: "none",
      padding: "0",
      margin: "0",
      height: "0",
      width: "0",
      overflow: "visible",
    });
    const shadowRoot = host.attachShadow({ mode: "open" });

    // Inject styles into Shadow DOM
    const styleLink = document.createElement("link");
    styleLink.rel  = "stylesheet";
    styleLink.href = chrome.runtime.getURL("contentScript.css");
    shadowRoot.appendChild(styleLink);

    document.body.appendChild(host);
  }

  // Reuse an existing instance if the host survived, otherwise rebuild it
  if (host.__jollyR) {
    state.uiService = host.__jollyR.uiService;
    state.autofill  = host.__jollyR.autofill;
    return;
  }

  const uiService = new UIService(host.shadowRoot);
  const autofill  = new AutofillOrchestrator(state.detector, state.filler, uiService);
  host.__jollyR = { uiService, autofill };
  state.uiService = uiService;
  state.autofill  = autofill;
}

async function init() {
  if (isFrameWindow && isExcludedFrame()) return;
  if (state.initialized) return;
  state.initialized = true;

  // Assign window ID for frame tracking
  window.jollyRWindowId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Initialize keep-alive port (main frame only)
  if (!isFrameWindow) {
    initKeepAlivePort();
  }

  // Set up services
  state.detector = new AtsFieldDetector();
  state.filler   = new FormFiller();
  ensureUi();

  // Monitor: re-create the UI if the page removes our element (no full re-init)
  if (!isFrameWindow) {
    let checkCount = 0;
    const monitor = setInterval(() => {
      ensureUi();
      if (++checkCount >= 10) clearInterval(monitor);
    }, 1000);
  }

  // ── Notify background that content script loaded ───────────────────────────
  const bgResponse = await sendMessage(MESSAGE_TYPE.CONTENT_SCRIPT_LOAD, {
    windowUrl: window.location.href,
  });

  if (bgResponse?.atsInfo) {
    state.uiService?.setAtsName(bgResponse.atsInfo.name);
  }

  // Load profile and stats
  const profileResp = await sendMessage(MESSAGE_TYPE.GET_USER_PROFILE);
  if (profileResp?.profile) {
    state.profile = profileResp.profile;
    state.uiService?.setProfile(state.profile);
  }

  const historyResp = await sendMessage(MESSAGE_TYPE.GET_APP_HISTORY);
  if (historyResp?.stats) {
    state.uiService?.setStats(historyResp.stats);
  }

  // ── Internal event bus (for UI → autofill communication) ─────────────────
  // Fills/clears are routed through the background's all-frames service so an
  // embedded application form (e.g. Greenhouse iframe) is reached from the
  // in-page dock too — not just the popup.

  if (!isFrameWindow) {
    document.addEventListener("jollyR:triggerFill", async () => {
      const ui = state.uiService;
      ui?.setFillStatus(FILL_STATUS.FILLING);
      const resp = await sendMessage("ALL_FRAMES_FILL");
      if (resp?.success) {
        ui?.setFillStatus(FILL_STATUS.COMPLETE);
        const note = resp.framesReached > 1 ? ` across ${resp.framesReached} frames` : "";
        ui?.showToast(`Filled ${resp.fieldsFilled || 0} fields${note}`, "success");
      } else if (resp?.fieldsFilled === 0 && resp?.framesReached === 0) {
        ui?.setFillStatus(FILL_STATUS.IDLE);
        ui?.showToast("No form found yet — the page may still be loading. Try again shortly.", "info");
      } else {
        ui?.setFillStatus(FILL_STATUS.ERROR);
        const msg = /profile/i.test(resp?.error || "") ? "Please set up your profile first." : (resp?.error || "Fill failed. Refresh and try again.");
        ui?.showToast(msg, "error");
      }
    });

    document.addEventListener("jollyR:scanFields", async () => {
      const resp = await sendMessage("ALL_FRAMES_DETECT");
      const count = (resp?.forms || []).length;
      state.uiService?.showToast(
        count > 0
          ? `Detected ${count} fields across ${resp.framesReached || 1} frame(s).`
          : "No recognizable fields found on this page.",
        count > 0 ? "info" : "info"
      );
    });

    document.addEventListener("jollyR:clearForms", async () => {
      const resp = await sendMessage("ALL_FRAMES_CLEAR");
      state.uiService?.setFillStatus(FILL_STATUS.IDLE);
      state.uiService?.showToast(resp?.success ? "Forms cleared." : "Could not clear forms.", resp?.success ? "info" : "error");
    });
  }

  // ── Background message listener ────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {

      case MESSAGE_TYPE.USER_DATA_UPDATE: {
        state.profile = message.value;
        state.uiService?.setProfile(message.value);
        break;
      }

      case MESSAGE_TYPE.ATS_START_APPLY_FLOW: {
        if (message.value?.prefill && state.autofill && state.profile) {
          state.autofill.run(state.profile);
        }
        break;
      }

      case MESSAGE_TYPE.TAB_ACTIVATED: {
        // Refresh stats on tab switch
        sendMessage(MESSAGE_TYPE.GET_APP_HISTORY).then(r => {
          if (r?.stats) state.uiService?.setStats(r.stats);
        });
        break;
      }

      // ── Popup-driven actions (matches the popup.js protocol) ─────────────
      case "DETECT_FORMS": {
        (async () => {
          let fields = state.detector.scan();
          // SPA forms (Greenhouse embed) render late — retry briefly.
          for (let attempt = 0; attempt < 10 && fields.size === 0; attempt++) {
            await pause(500);
            fields = state.detector.scan();
          }
          const forms = [];
          for (const [fieldType, fd] of fields) {
            forms.push({
              type: fieldType,
              label: fd.label || "",
              id: fd.element?.id || "",
              name: fd.element?.name || "",
            });
          }
          state.uiService?.showFieldList(fields, state.profile || {});
          sendResponse({ success: true, forms });
        })();
        return true; // keep channel open for async sendResponse
      }

      case "GET_ATS_STATUS": {
        sendResponse({
          success: true,
          hasProfile: !!state.profile,
          atsName: state.uiService?._atsName || null,
          isApplying: state.autofill?.isRunning || false,
        });
        break;
      }

      case "MANUAL_FILL_FORM": {
        (async () => {
          const options = message.value || {};
          const allowed = new Set();
          if (options.fillPersonal)     FIELD_GROUPS.personal.forEach(f => allowed.add(f));
          if (options.fillAddress)      FIELD_GROUPS.address.forEach(f => allowed.add(f));
          if (options.fillProfessional) FIELD_GROUPS.professional.forEach(f => allowed.add(f));
          if (options.fillLegal)        FIELD_GROUPS.legal.forEach(f => allowed.add(f));
          if (options.fillPosition)     FIELD_GROUPS.position.forEach(f => allowed.add(f));
          if (options.fillEeo)          FIELD_GROUPS.eeo.forEach(f => allowed.add(f));
          if (options.fillApplication)  FIELD_GROUPS.application.forEach(f => allowed.add(f));
          if (options.fillConsent)      FIELD_GROUPS.consent.forEach(f => allowed.add(f));

          const fields = state.detector.scan();
          const valueMap = buildValueMap(state.profile || {});
          let filled = 0;
          for (const [fieldType, fd] of fields) {
            if (!allowed.has(fieldType)) continue;
            const value = valueMap[fieldType];
            if (!value) continue;
            state.uiService?.highlightField(fieldType, "filling");
            const el = fd.element;
            let success = false;
            if (el.type === "checkbox") {
              success = typeof value === "boolean"
                ? state.filler.fillCheckbox(el, value)
                : state.filler.fillCheckboxGroup(el, value);
            } else if (el.type === "radio") {
              success = state.filler.fillRadioGroup(el, value);
            } else if (el.getAttribute && (el.getAttribute("role") === "combobox" || el.getAttribute("aria-haspopup") === "true")) {
              success = await state.filler.fillCombobox(el, value);
            } else {
              success = state.filler.fillElement(el, value);
            }
            if (success) {
              filled++;
              fd.value = value;
              state.uiService?.highlightField(fieldType, "filled", value);
            }
          }

          // Attach stored resume to resume/CV upload fields
          const resumeFile = await loadStoredResume();
          const resumeFields = state.detector.resumeUploadFields;
          if (resumeFields.length && resumeFile) {
            for (const rf of resumeFields) {
              if (await state.filler.fillResumeFile(rf.element, resumeFile)) {
                filled++;
              }
            }
          }

          // Attach stored cover letter to cover-letter upload fields
          const coverFile = await loadStoredCoverLetter();
          const coverFields = state.detector.coverLetterUploadFields;
          if (coverFields.length && coverFile) {
            for (const cf of coverFields) {
              if (await state.filler.fillFileUpload(cf.element, coverFile)) {
                filled++;
              }
            }
          }

          state.uiService?.setFillStatus(FILL_STATUS.COMPLETE);
          state.uiService?.showComplete(
            filled,
            fields.size +
              (resumeFields.length && resumeFile ? resumeFields.length : 0) +
              (coverFields.length && coverFile ? coverFields.length : 0)
          );
          sendResponse({ success: true, fieldsFilled: filled });
        })();
        return true; // keep the channel open for the async response
      }

      case "FILL_JOB_APPLICATION": {
        if (message.value && typeof message.value === "object") {
          state.profile = message.value;
          state.uiService?.setProfile(state.profile);
        }
        if (!state.autofill) {
          sendResponse({ success: false, error: "Page not ready. Try refreshing." });
          break;
        }
        if (!state.profile) {
          sendResponse({ success: false, error: "No profile found. Save your profile first." });
          break;
        }
        state.autofill.run(state.profile).then(result => {
          sendResponse({ success: true, fieldsFilled: result?.fieldsFilled || 0 });
        });
        return true; // keep the channel open for the async response
      }

      case "CLEAR_ALL_FORMS": {
        clearFormFields();
        state.uiService?.setFillStatus(FILL_STATUS.IDLE);
        state.uiService?.showToast("Forms cleared.", "info");
        sendResponse({ success: true });
        break;
      }
    }
  });

  // ── DOM mutation observer (re-scan on form changes) ────────────────────────

  if (!isFrameWindow) {
    const observer = new MutationObserver(() => {
      // Debounce
      clearTimeout(observer._timer);
      observer._timer = setTimeout(() => {
        if (state.autofill && !state.autofill.isRunning) {
          state.detector.scan();
        }
      }, 800);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

// ── Start ────────────────────────────────────────────────────────────────────

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

})();
