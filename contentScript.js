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
  FORM_FILLED: "FORM_FILLED",
  APPLICATION_SUBMITTED: "APPLICATION_SUBMITTED",
  GET_USER_PROFILE:         "GET_USER_PROFILE",
  SAVE_USER_PROFILE:        "SAVE_USER_PROFILE",
  GET_APP_HISTORY:          "GET_APP_HISTORY",
  GET_ATS_STATUS:           "GET_ATS_STATUS",
  CAPTURE_JOB:              "CAPTURE_JOB",
  FIND_APPLY_URL:           "FIND_APPLY_URL",
  CLICK_CONTINUE:           "CLICK_CONTINUE",
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

// React/Vue-controlled inputs ignore a plain `.value = ...` assignment. Go
// through the prototype setter and fire the events frameworks listen for.
function setNativeValue(el, value) {
  if (!el) return;
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input",  { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

// Honeypot / hidden / unrendered fields must never be filled.
function isFillable(el) {
  if (!el || el.type === "hidden" || el.hidden || el.disabled || el.readOnly) return false;
  if (el.closest('[hidden], [aria-hidden="true"], [inert]') || el.matches(':disabled')) return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;

  // Radios and checkboxes are often visually hidden and replaced by a styled
  // label, so geometry and opacity checks would reject valid controls.
  if (el.type === "radio" || el.type === "checkbox") return true;

  if (!el.getClientRects().length || Number(style.opacity) === 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1 && rect.right > 0 && rect.bottom > 0;
}

function base64ToFile(b64, name, type) {
  const match = /^data:([^;]+);base64,(.*)$/.exec(b64 || "");
  const base64 = match ? match[2] : b64;
  const mime = type || (match ? match[1] : "application/octet-stream");
  const bin = atob(base64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new File([bytes], name || "file", { type: mime });
}

// ─── AI ANSWER TARGETS ───────────────────────────────────────────────────────
// Fields that can receive an AI-generated answer. Each target gets a stable
// token attribute so the side panel can apply text without guessing by index.

const AI_TARGET_ATTR = "data-jollyr-ai-target";
const AI_TARGET_SELECTOR = [
  "textarea",
  "input:not([type='hidden']):not([type='submit']):not([type='button'])" +
    ":not([type='reset']):not([type='file']):not([type='checkbox'])" +
    ":not([type='radio']):not([type='password']):not([type='image'])",
  "[contenteditable='true']",
].join(", ");

const AI_SENSITIVE = /password|passwd|ssn|social security|card number|credit card|cvv|cvc|security code|routing number|bank account/i;

function aiTargetToken(el) {
  let token = el.getAttribute(AI_TARGET_ATTR);
  if (!token) {
    token =
      (window.crypto && typeof window.crypto.randomUUID === "function" && window.crypto.randomUUID()) ||
      `t${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    el.setAttribute(AI_TARGET_ATTR, token);
  }
  return token;
}

function collectAiTargets() {
  const targets = [];
  document.querySelectorAll(AI_TARGET_SELECTOR).forEach(el => {
    if (!isFillable(el)) return;

    const label = (state.detector?._getLabel(el) || "").trim();
    const question = (state.detector?._getQuestionLabel(el) || "").trim();
    const name = el.getAttribute("name") || "";
    const id = el.getAttribute("id") || "";
    const descriptor = `${label} ${question} ${name} ${id} ${el.getAttribute("placeholder") || ""}`;

    if (AI_SENSITIVE.test(descriptor)) return;

    const display = label || question || el.getAttribute("placeholder") || name || id;
    if (!display || display.length < 3) return;

    targets.push({
      token: aiTargetToken(el),
      label: display.slice(0, 200),
      question: question ? question.slice(0, 400) : "",
      tag: el.tagName.toLowerCase(),
      maxLength: el.maxLength && el.maxLength > 0 ? el.maxLength : null,
      currentValue: typeof el.value === "string" ? el.value.slice(0, 200) : "",
      required: Boolean(el.required),
    });
  });
  return targets;
}

function applyAiAnswer(token, text) {
  if (!token || typeof text !== "string") return false;
  const el = document.querySelector(`[${AI_TARGET_ATTR}="${CSS.escape(token)}"]`);
  if (!el || !state.filler) return false;

  if (el.matches("[contenteditable='true']")) {
    el.focus();
    el.textContent = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  el.focus();
  return state.filler.fillElement(el, text);
}

// ─── ATS FIELD DETECTOR ──────────────────────────────────────────────────────

// Standard autocomplete tokens are stronger than visible text: they are
// machine-readable and identical across form builders.
const AUTOCOMPLETE_FIELDS = [
  ["organization title", "position"],
  ["address line1", "address"],
  ["address line2", "address_line2"],
  ["address level1", "state"],
  ["address level2", "city"],
  ["street address", "address"],
  ["country name", "country"],
  ["postal code", "zip"],
  ["given name", "first_name"],
  ["family name", "last_name"],
  ["name", "full_name"],
  ["tel national", "phone"],
  ["organization", "company"],
  ["email", "email"],
  ["tel", "phone"],
  ["url", "website"],
];

class AtsFieldDetector {
  constructor() {
    // fieldType -> [{ element, label, value }]
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
      if (!isFillable(el)) return;
      const fieldType = this._classify(el);
      if (!fieldType) return;
      const entries = this.detectedFields.get(fieldType) || [];
      entries.push({ element: el, label: this._getLabel(el), value: "" });
      this.detectedFields.set(fieldType, entries);
    });

    // File upload fields
    document.querySelectorAll('input[type="file"]').forEach(el => {
      if (el.matches(':disabled') || el.closest('[inert]')) return;
      const label = this._getLabel(el);
      const context = `${label} ${el.id} ${el.name}`.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
      if (/\bcover[-_ ]?letter\b/i.test(context)) {
        this.coverLetterUploadFields.push({ element: el, label });
      } else if (/\b(?:r[eé]sum[eé]|cv)(?![a-z])/i.test(context)) {
        this.resumeUploadFields.push({ element: el, label });
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
    const autocompleteTokens = (el.getAttribute("autocomplete") || "").toLowerCase().trim().split(/\s+/);
    if (autocompleteTokens.at(-1) === "webauthn") autocompleteTokens.pop();
    const autocomplete = (autocompleteTokens.at(-1) || "").replace(/-/g, " ");
    const attrText = `${el.getAttribute("data-automation-id") || ""} ${el.getAttribute("data-testid") || ""}`
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase();
    const all   = `${id} ${name} ${ph} ${label} ${aria} ${qLabel} ${autocomplete} ${attrText}`;

    if (type === "file") return null;
    if (/\breferences?[^a-z].{0,20}\b(?:e[-_ ]?mail|phone|contact|number)\b|\b(?:e[-_ ]?mail|phone|contact)\b.{0,20}\breferences?\b/.test(all)) {
      return "reference_contact";
    }
    if (/\blinked[-_ ]?in\b/.test(all) && (type === "url" || autocomplete === "url")) return "linkedin";

    // Confirmation fields must be classified before the type checks, otherwise
    // `type="email"` wins and the field never gets the `_confirm` treatment.
    const confirmWord = /\b(confirm|re[-_ ]?enter|repeat|verify|again)\b/;
    if (/email|e[-_ ]?mail/.test(all) && confirmWord.test(all)) return "email_confirm";
    if (/phone|mobile|telephone|tel/.test(all) && confirmWord.test(all)) return "phone_confirm";

    // Priority type-based checks
    if (type === "email") return "email";
    if (type === "tel")   return "phone";

    const autocompleteToken = AUTOCOMPLETE_FIELDS.find(([token]) => token === autocomplete);
    if (autocompleteToken) return autocompleteToken[1];

    // "Email Address" matches both rules; email is the specific intent.
    if (/\be[-_ ]?mail\b/.test(all)) return "email";

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
      { field: "years_experience",   patterns: /\byears.{0,12}experience|yrs.{0,12}experience/ },
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
      { field: "full_name",  patterns: /\bfull[-_ ]?name\b/ },
      { field: "email",      patterns: /\b(email|e[-]?mail)\b/ },
      { field: "phone",      patterns: /\b(phone|mobile|telephone|cell|tel)\b/ },
      { field: "address_line2", patterns: /\b(address|street|addr)[-_ ]?(line[-_ ]?)?2\b|\baddress2\b|\b(apt|apartment|suite|unit)[-_ ]?(number|no|#)?\b/ },
      { field: "address",    patterns: /\b(address|street|addr)\b/ },
      { field: "city",       patterns: /\b(city|town|locality)\b/ },
      { field: "state",      patterns: /\b(state|province|region)\b/ },
      { field: "zip",        patterns: /\b(zip|postal|post ?code)\b/ },
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
        const cap = field.startsWith("consent") ? 1 : m[0].length;
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
    const labelledBy = (el.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .filter(Boolean)
      .map(id => document.getElementById(id)?.textContent || "")
      .join(" ")
      .trim();
    if (labelledBy) return labelledBy;

    const ariaLabel = (el.getAttribute("aria-label") || "").trim();
    if (ariaLabel) return ariaLabel;

    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) return lbl.textContent.trim();
    }
    const parentLbl = el.closest("label");
    if (parentLbl) return parentLbl.textContent.trim();
    if (el.placeholder) return el.placeholder;

    const legend = el.closest("fieldset")?.querySelector("legend");
    if (legend?.textContent.trim()) return legend.textContent.trim();

    return this._getNearbyText(el);
  }

  _getNearbyText(el) {
    let node = el.previousElementSibling;
    for (let i = 0; node && i < 3; i++, node = node.previousElementSibling) {
      if (node.matches("script, style, input, select, textarea, button")) continue;
      if (node.querySelector("input, select, textarea, button")) continue;
      const text = (node.textContent || "").trim();
      if (text && text.length <= 120) return text;
    }
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
      setNativeValue(element, str);
      element.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    } catch (e) {
      console.warn("[jolly R] fillElement error:", e);
      return false;
    }
  }

  _fillSelect(el, value) {
    const opts = Array.from(el.options).filter(option => !option.disabled && !option.closest('optgroup[disabled]'));
    const target = this._normOptionText(value);
    const match = opts.find(option => [option.label, option.value].some(text => this._normOptionText(text) === target))
      || opts.find(option => this._matchesOption(option, value));
    if (match) {
      setNativeValue(el, match.value);
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

    const controlledRoots = () => {
      const ids = `${element.getAttribute("aria-controls") || ""} ${element.getAttribute("aria-owns") || ""}`
        .trim().split(/\s+/).filter(Boolean);
      return ids.map(id => document.getElementById(id)).filter(Boolean);
    };

    const roots = () => {
      const list = controlledRoots();
      if (widgetRoot) list.push(widgetRoot);
      return list;
    };

    const pickFrom = (root) =>
      Array.from((root || document).querySelectorAll('[role="option"], .select__option'))
        .find(o => isGoodOption(o) && isVisible(o)) || null;

    const pickOption = () => {
      // Scoped lookup only. A document-wide fallback is what let the intl-tel
      // country decoy win over the real Greenhouse combobox.
      for (const root of roots()) {
        const hit = pickFrom(root);
        if (hit) return hit;
      }
      // If the widget exposes no root at all, an open listbox is the only
      // reasonable fallback. Prefer the most recently opened visible listbox.
      const visibleListboxes = Array.from(document.querySelectorAll('[role="listbox"]'))
        .filter(isVisible);
      for (const box of visibleListboxes.reverse()) {
        const hit = pickFrom(box);
        if (hit) return hit;
      }
      return null;
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
      setNativeValue(element, valueStr);
      element.focus();
      opt = await waitForOption(12, 200);
      if (opt) { clickOption(opt); return true; }

      // Attempt 3: press Enter to commit the typed value, then look once more.
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      element.dispatchEvent(new KeyboardEvent("keyup",   { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      opt = await waitForOption(3, 100);
      if (opt) { clickOption(opt); return true; }

      // No option was ever selected: close the menu and clear the typed text so
      // we do not report a fill that the widget did not accept.
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true }));
      setNativeValue(element, "");
      return false;
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
    if (opt.tagName === "OPTION") return opt.label;
    if (opt.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(opt.id)}"]`);
      if (lbl) return lbl.textContent.trim();
    }
    const parentLbl = opt.closest("label");
    if (parentLbl) return parentLbl.textContent.trim();
    return opt.value || "";
  }

  // Match whole words ("black african american" vs
  // "Black/African American") against both the visible label and option value.
  _matchesOption(opt, valueStr) {
    if (!valueStr) return false;
    const target = this._normOptionText(valueStr);
    const tokens = target.match(/[\p{L}\p{N}]+/gu) || [];
    if (!tokens.length) return false;
    const text = this._normOptionText(this._getOptionLabel(opt));
    const val = this._normOptionText(opt.value);
    return [text, val].some(candidate => {
      const words = candidate.match(/[\p{L}\p{N}]+/gu) || [];
      return tokens.every(token => words.includes(token));
    });
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
    this._watchedForms = new WeakSet();
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
      const hasFields = () => fields.size || this.detector.resumeUploadFields.length || this.detector.coverLetterUploadFields.length;
      for (let attempt = 0; attempt < 10 && !hasFields(); attempt++) {
        await pause(500);
        fields = this.detector.scan();
      }
      if (!hasFields()) {
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
      const fieldCount = Array.from(fields.values()).reduce((total, entries) => total + entries.length, 0);
      const filledForms = new Set();
      for (const [fieldType, entries] of fields) {
        const value = valueMap[fieldType];
        if (value === undefined || value === null || value === "") continue;

        for (const fieldData of entries) {
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
            const form = el.form || el.closest("form");
            if (form) filledForms.add(form);
            this.ui.highlightField(fieldType, "filled", value);
          }
          await pause(60);
        }
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

      // Record a submission only if the user actually submits one of the forms
      // we filled. Filling alone is not a submission.
      this._watchSubmission(filledForms, filled);

      this.ui.setFillStatus(FILL_STATUS.COMPLETE);
      this.ui.showComplete(
        filled,
        fieldCount +
          (resumeCount && resumeFile ? resumeCount : 0) +
          (coverCount && coverFile ? coverCount : 0)
      );

      // Log to background only when something was actually filled.
      if (filled > 0) {
        await sendMessage(MESSAGE_TYPE.FORM_FILLED, {
          url:          window.location.href,
          title:        document.title,
          fieldsFilled: filled,
        });
      }

      return { fieldsFilled: filled, totalFields: fieldCount };
    } catch (err) {
      console.error("[jolly R] autofill error:", err);
      this.ui.setFillStatus(FILL_STATUS.ERROR);
      this.ui.showToast("AutoFill encountered an error.", "error");
      return { fieldsFilled: 0 };
    } finally {
      this.isRunning = false;
    }
  }

  _watchSubmission(forms, fieldsFilled) {
    for (const form of forms) {
      if (this._watchedForms.has(form)) continue;
      this._watchedForms.add(form);
      form.addEventListener("submit", () => {
        sendMessage(MESSAGE_TYPE.APPLICATION_SUBMITTED, {
          url: window.location.href,
          title: document.title,
          fieldsFilled,
        });
      }, { once: true });
    }
  }

  async _handleAccountFields(profile) {
    // Account creation is opt-in and signup-only. Login forms are never touched.
    const config = (await chrome.storage.local.get(["config"])).config || {};
    if (config.autoCreateAccounts !== true) return 0;

    const passwordFields = Array.from(document.querySelectorAll('input[type="password"]'))
      .filter(isFillable);
    if (passwordFields.length === 0) return 0;

    const signupForms = new Set();
    for (const el of passwordFields) {
      const form = el.form || el.closest("form");
      if (!form) continue;
      const fields = Array.from(form.querySelectorAll('input[type="password"]'));
      const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase();
      const formText = `${form.id} ${form.className} ${form.innerText || ""}`.toLowerCase();
      const hasConfirm = fields.some((f, i) =>
        i > 0 || /confirm|repeat|verify|re[-_ ]?enter|again/i.test(`${f.name} ${f.id} ${f.placeholder || ""}`)
      );
      const isSignup = autocomplete === "new-password" || fields.length >= 2 || hasConfirm;
      const isLogin = autocomplete === "current-password" || /\b(login|log in|sign in|signin)\b/.test(formText);
      if (isSignup && !isLogin) signupForms.add(form);
    }
    if (signupForms.size === 0) return 0;

    // Do not create a second account for a site we already have credentials for.
    if (await hasStoredCredential(window.location.hostname)) return 0;

    const password = generatePassword();
    let filled = 0;

    for (const form of signupForms) {
      form.querySelectorAll('input[type="email"], input[name*="email"], input[id*="email"]')
        .forEach(el => {
          if (isFillable(el) && !el.value && profile.email) {
            if (this.filler.fillElement(el, profile.email)) filled++;
          }
        });
      form.querySelectorAll('input[type="password"]').forEach(el => {
        if (isFillable(el) && !el.value) {
          if (this.filler.fillElement(el, password)) filled++;
        }
      });
    }

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
    full_name:    [profile.firstName, profile.lastName].filter(Boolean).join(" "),
    email:        profile.email     || "",
    email_confirm: profile.email    || "",
    phone:        profile.phone     || "",
    phone_confirm: profile.phone    || "",
    address:      profile.address   || "",
    address_line2: profile.address2 || "",
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
    availability: profile.availability || "",
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
    if (el.value) setNativeValue(el, "");
  });
}

async function loadStoredFile(key, fallbackName) {
  try {
    const data = (await chrome.storage.local.get(key))[key];
    if (!data?.base64) return null;
    return base64ToFile(data.base64, data.name || fallbackName, data.type);
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

async function hasStoredCredential(hostname) {
  try {
    const result = await chrome.storage.local.get(["savedCreds"]);
    return !!(result.savedCreds && result.savedCreds[hostname]);
  } catch (e) {
    return false;
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
    this._fieldRows = null;
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
    this._fieldRows = null;
    this._update();
  }

  highlightField(fieldType, status, value = "") {
    if (this._fieldStates.has(fieldType)) {
      this._fieldStates.set(fieldType, { status, value });
    }
    // Update just this row; a full panel rebuild on every field is needless
    // work and causes visible flicker in long forms.
    if (!this._updateFieldRow(fieldType)) this._update();
  }

  _updateFieldRow(fieldType) {
    const row = this._fieldRows?.get(fieldType);
    if (!row) return false;
    const state = this._fieldStates.get(fieldType) || { status: "pending" };
    row.className = `jR-field-item ${state.status}`;
    const icon = row.querySelector(".jR-field-icon");
    if (icon) icon.innerHTML = this._statusIcon(state.status);
    let val = row.querySelector(".jR-field-value");
    if (state.value) {
      if (!val) {
        val = this._el("span", "jR-field-value");
        row.appendChild(val);
      }
      val.textContent = this._truncate(String(state.value), 18);
    } else if (val) {
      val.remove();
    }
    return true;
  }

  showComplete(filled, total) {
    this._completeFilled = filled;
    this._completeTotal  = total;
    this._update();
  }

  showToast(message, type = "info") {
    const icons = { success: "✅", error: "❌", info: "ℹ️" };
    const toast = this._el("div", `jR-toast ${type}`);
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    const icon = this._el("span", "jR-toast-icon");
    icon.textContent = icons[type] || "ℹ️";
    const text = this._el("span");
    text.textContent = message;
    toast.appendChild(icon);
    toast.appendChild(text);
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
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "jolly R autofill");
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
    btn.setAttribute("aria-label", "Open jolly R");
    btn.setAttribute("aria-expanded", "false");
    btn.title = "Open jolly R";
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
    closeBtn.title = "Close";
    closeBtn.setAttribute("aria-label", "Close jolly R");
    closeBtn.addEventListener("click", () => {
      this.popupMode = POPUP_MODE.HIDDEN;
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

  _statusIcon(status) {
    const statusIcons = {
      pending: `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" stroke="#d1d5db" stroke-width="1.5" fill="none"/></svg>`,
      filling: `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" stroke="#e1a5f0" stroke-width="1.5" fill="none"/><circle cx="7" cy="7" r="3" fill="#e1a5f0"/></svg>`,
      filled:  `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="#10b981"/><path d="M4 7l2 2 4-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
    };
    return statusIcons[status] || statusIcons.pending;
  }

  _renderFieldList() {
    const list = this._el("ul", "jR-field-list");
    this._fieldRows = new Map();

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

      const icon = this._el("span", "jR-field-icon");
      icon.innerHTML = this._statusIcon(state.status);
      item.appendChild(icon);

      const name = this._el("span", "jR-field-name");
      name.textContent = friendlyNames[type] || type.replace(/_/g, " ");
      item.appendChild(name);

      if (state.value) {
        const val = this._el("span", "jR-field-value");
        val.textContent = this._truncate(String(state.value), 18);
        item.appendChild(val);
      }

      this._fieldRows.set(type, item);
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

    // Append to body if available, otherwise documentElement
    (document.body || document.documentElement).appendChild(host);
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

  // ── Job page capture ───────────────────────────────────────────────────────
  // Works on job detail pages and on search-result cards. Class names on
  // LinkedIn, Glassdoor, and Indeed are hashed, so every lookup keys off
  // JSON-LD, data-test/data-testid, aria-labels, ids, or href patterns.

  // Multi-step application wizards (Indeed smartapply) put Continue/Next
  // buttons on every step. Advance one step, but never a submit-type action:
  // the final submit stays manual.
  function clickContinue() {
    const isVisible = (el) => {
      if (el.disabled || el.hidden) return false;
      if (el.getAttribute("aria-disabled") === "true") return false;
      if (el.closest('[aria-hidden="true"]')) return false;
      return el.getClientRects().length > 0;
    };
    const candidates = [...document.querySelectorAll("button, [role='button']")].filter((el) => {
      if (!isVisible(el)) return false;
      const label = (el.textContent || "").trim().toLowerCase();
      const testId = (el.getAttribute("data-testid") || "").toLowerCase();
      if (/submit|finish|complete|apply/.test(label)) return false;
      return /^(continue|next|save and continue)$/.test(label) || /^(continue-button|hp-continue-button)/.test(testId);
    });
    const primary =
      candidates.find((el) => (el.getAttribute("data-testid") || "") === "continue-button") || candidates[0];
    if (!primary) return false;
    primary.click();
    return true;
  }

  // The application form usually lives behind a "Apply now" link (e.g. Indeed's
  // smartapply host), not on the listing page itself. Resolve it so Open +
  // Autofill can navigate there before filling.
  function findApplyUrl() {
    const absolute = (href) => {
      try { return new URL(href || "", window.location.href).href; } catch { return ""; }
    };
    const direct = document.querySelector(
      'a[data-testid="viewjob-indeed-apply"], [data-testid="primary-apply-action"] a[href*="indeedapply"], a[href*="smartapply.indeed.com"], a[href*="indeedapply/"]'
    );
    const directHref = direct?.getAttribute("href");
    if (directHref) return absolute(directHref);

    const generic = [...document.querySelectorAll("a[href]")].find((a) => {
      const label = (a.textContent || "").trim().toLowerCase();
      if (!/^(apply( now)?|apply for (this )?job|apply on (company|employer)( site| website)?)$/.test(label)) return false;
      return /^https?:/i.test(absolute(a.getAttribute("href")));
    });
    return generic ? absolute(generic.getAttribute("href")) : "";
  }

  function captureCurrentJob() {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
    const text = (el) => clean(el?.textContent);
    const pick = (root, selectors) => {
      for (const sel of selectors) {
        let el = null;
        try { el = root.querySelector(sel); } catch { el = null; }
        if (el) return el;
      }
      return null;
    };
    const pickAll = (root, selectors) => {
      const found = [];
      for (const sel of selectors) {
        try { found.push(...root.querySelectorAll(sel)); } catch { /* malformed selector */ }
      }
      return [...new Set(found)];
    };
    const absolute = (href) => {
      try { return new URL(href || "", window.location.href).href; } catch { return window.location.href; }
    };
    const canonicalUrl = () => {
      const link = document.querySelector('link[rel="canonical"]');
      return absolute(link?.getAttribute("href") || window.location.href);
    };
    const stripBadges = (value) =>
      clean(value).replace(/\s*\((?:verified job|verified)\)\s*$/i, "");

    // LinkedIn renders titles twice (visible span + aria-hidden copy).
    const titleText = (el) => {
      if (!el) return "";
      const spans = [...el.querySelectorAll("span")].filter(
        (span) => !span.closest('[aria-hidden="true"]') && clean(span.textContent)
      );
      return stripBadges(text(spans[0] || el));
    };

    const cardRootFor = (el) => {
      let node = el?.parentElement;
      for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
        const hasLink = !!node.querySelector('a[href*="/jobs/view/"], a[data-jk], a[href*="viewjob"]');
        const hasAge = /(posted|just posted|today|yesterday)\b|\b\d+\s*(?:h|d|w|mo|y)\b/i.test(text(node));
        if (hasLink || hasAge) return node;
      }
      return el.closest?.("li") || el;
    };

    const htmlToText = (html) => {
      if (!html) return "";
      try {
        return clean(new DOMParser().parseFromString(String(html), "text/html").body?.textContent);
      } catch {
        return clean(String(html));
      }
    };

    // Score expects "50k"-style amounts or a currency symbol.
    const money = (value) => {
      const amount = Number(value);
      if (!Number.isFinite(amount)) return clean(String(value));
      return Math.abs(amount) >= 1000 ? `${Math.round(amount / 100) / 10}k` : String(amount);
    };

    const jsonLdPosting = () => {
      const found = [];
      const visit = (value) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) { value.forEach(visit); return; }
        const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
        if (types.some((type) => typeof type === "string" && type.toLowerCase() === "jobposting")) {
          found.push(value);
          return;
        }
        if (Array.isArray(value["@graph"])) value["@graph"].forEach(visit);
      };
      for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        try { visit(JSON.parse(script.textContent || "null")); } catch { /* malformed JSON-LD */ }
      }
      return found[0] || null;
    };

    const jsonLdJob = () => {
      const posting = jsonLdPosting();
      const title = clean(posting?.title);
      if (!title) return null;

      const locations = [];
      for (const place of [].concat(posting.jobLocation || [])) {
        const address = place?.address || place;
        if (typeof address === "string") { locations.push(clean(address)); continue; }
        const line = [clean(address?.addressLocality), clean(address?.addressRegion)]
          .filter(Boolean)
          .join(", ") || clean(address?.addressCountry?.name || address?.addressCountry);
        if (line) locations.push(line);
      }
      const location = locations.filter(Boolean).join(" | ");

      let salary = "";
      const salaryValue = posting.baseSalary?.value || posting.baseSalary || [];
      for (const value of [].concat(salaryValue)) {
        if (value == null) continue;
        if (typeof value !== "object") { salary = money(value); break; }
        const low = value.minValue ?? value.value;
        const high = value.maxValue ?? value.value;
        if (low == null && high == null) continue;
        const amount = low != null && high != null && low !== high
          ? `${money(low)}-${money(high)}`
          : money(low ?? high);
        const currency = clean(value.currency || posting.baseSalary?.currency);
        const unit = clean(value.unitText || posting.baseSalary?.unitText).toLowerCase();
        const period = /year|annual/.test(unit) ? "/yr" : /hour/.test(unit) ? "/hr" : /month/.test(unit) ? "/mo" : unit;
        salary = clean([currency, amount, period].filter(Boolean).join(" "));
        break;
      }

      const posted = posting.datePosted ? Date.parse(posting.datePosted) : NaN;
      const mode = String(posting.jobLocationType || "");
      return {
        title,
        company: clean(posting.hiringOrganization?.name || posting.hiringOrganization),
        location: location || undefined,
        url: absolute(posting.url || canonicalUrl()),
        salary: salary || undefined,
        description: htmlToText(posting.description).slice(0, 8000) || undefined,
        postedAt: Number.isFinite(posted) ? posted : undefined,
        remote: /telecommute|remote/i.test(mode) || /remote/i.test(location),
      };
    };

    const host = window.location.hostname.replace(/^www\./, "");
    const params = new URLSearchParams(window.location.search);
    const isDetail =
      host === "linkedin.com" || host.endsWith(".linkedin.com")
        ? /\/jobs\/view\/[^/]*\d/.test(window.location.pathname) || params.has("currentJobId")
        : host === "indeed.com" || host.endsWith(".indeed.com")
          ? /\/viewjob/.test(window.location.pathname) || params.has("jk") || params.has("vjk")
          : host.includes("glassdoor.")
            ? /\/job-listing\//.test(window.location.pathname) || params.has("jl")
            : !!(document.querySelector("#jobDescriptionText, #job-details"));
    const isLinkedInSearch =
      (host === "linkedin.com" || host.endsWith(".linkedin.com")) &&
      /\/jobs\/search(?:-results)?\//.test(window.location.pathname);

    const linkedInTitle = (button) =>
      stripBadges(
        clean(button?.getAttribute("aria-label"))
          .replace(/^dismiss\s+/i, "")
          .replace(/\s+job$/i, "")
      );

    const linkedInDetail = () => {
      const title =
        titleText(pick(document, [
          '[class*="job-details-jobs-unified-top-card"] h1',
          '[class*="job-details"] h1',
          "h1",
        ])) || linkedInTitle(pickAll(document, ['button[aria-label^="Dismiss "][aria-label$=" job"]'])[0]);
      if (!title) return null;

      const company =
        text(pick(document, [
          '[class*="job-details-jobs-unified-top-card"] a[href*="/company/"]',
          '[class*="topcard"] a[href*="/company/"]',
          'a[href*="/company/"]',
        ])) || clean(pick(document, ['a[href*="/company/"] img'])?.getAttribute("alt"));

      const description = text(pick(document, [
        "#job-details",
        '[class*="jobs-description"]',
        ".show-more-less-html__markup",
        ".description__text",
        "section.description",
      ])).slice(0, 8000);
      // A search page with currentJobId but no open detail pane must not match.
      if (!company && !description) return null;

      const header = text(pick(document, [
        '[class*="primary-description-container"]',
        '[class*="primary-description"]',
        ".top-card-layout__second-subline",
        '[class*="topcard__flavor"]',
      ]));
      const parts = header.split(/[·•|]/).map(clean).filter(Boolean);
      const location =
        parts.find((part) => part !== company && !/\b(ago|posted|applicants?)\b/i.test(part) && /area|remote|hybrid|on-site|,|\b[A-Z]{2}\b/i.test(part)) ||
        parts.find((part) => part !== company && !/\b(ago|posted|applicants?)\b/i.test(part)) ||
        "";

      const time = pick(document, ["time[datetime]", "time"]);
      const postedAt = Date.parse(time?.getAttribute("datetime") || "");

      return {
        title,
        company,
        location: location.replace(/^[·•\s]+/, ""),
        url: canonicalUrl(),
        ageLabel: time?.getAttribute("datetime") ? "" : text(time),
        description,
        postedAt: Number.isFinite(postedAt) ? postedAt : undefined,
        remote: /remote/i.test(location),
      };
    };

    const linkedInCardFrom = (root, button, anchor) => {
      const title = linkedInTitle(button) || titleText(anchor);
      if (!title) return null;

      const lines = [...root.querySelectorAll("p")]
        .filter((p) => !p.closest('[aria-hidden="true"]'))
        .map(text)
        .filter((line) => line && !line.toLowerCase().includes(title.toLowerCase()));

      const company =
        lines.find((line) => !/posted|ago|applicant|benefit|alumni|easy apply|apply now/i.test(line) && !/[()]|remote|hybrid|on-site/i.test(line)) ||
        "";
      const location =
        lines.find((line) => line !== company && /area|remote|hybrid|on-site|\(|,\s*[A-Z]{2}\b/i.test(line)) ||
        lines.find((line) => line !== company) ||
        "";
      const ageLabel = (lines.find((line) => /posted|just posted|today|yesterday|\bago\b/i.test(line)) || "")
        .replace(/^posted\s+/i, "");
      const link = root.querySelector('a[href*="/jobs/view/"]');

      let url = link ? absolute(link.getAttribute("href")) : "";
      if (!url) {
        let node = button || anchor;
        for (let depth = 0; node && depth < 6 && !url; depth += 1, node = node.parentElement) {
          const key = node.getAttribute("data-job-id") || node.getAttribute("data-occludable-job-id") || node.getAttribute("componentkey") || "";
          const id = /(\d{6,})/.exec(key);
          if (id) url = `https://www.linkedin.com/jobs/view/${id[1]}/`;
        }
      }

      return {
        title,
        company,
        location,
        ageLabel,
        url: url || canonicalUrl(),
        remote: /remote/i.test(location),
      };
    };

    // Every visible card, not just the first. Dismiss buttons are the reliable
    // seed; bare /jobs/view/ links are the fallback for layouts without them.
    const linkedInCards = () => {
      const buttons = pickAll(document, ['button[aria-label^="Dismiss "][aria-label$=" job"]']);
      const seeds = buttons.length ? buttons : pickAll(document, ['a[href*="/jobs/view/"]']);
      const roots = new Set();
      for (const seed of seeds) {
        const root = cardRootFor(seed);
        if (root) roots.add(root);
      }
      const jobs = [];
      for (const root of roots) {
        const job = linkedInCardFrom(
          root,
          pick(root, ['button[aria-label^="Dismiss "][aria-label$=" job"]']),
          pick(root, ['a[href*="/jobs/view/"]'])
        );
        if (job) jobs.push(job);
      }
      return jobs;
    };

    const indeedDetail = () => {
      const title = titleText(pick(document, [
        '[data-testid="jobsearch-JobInfoHeader-title"]',
        "h1.jobsearch-JobInfoHeader-title",
        'h1[class*="JobInfoHeader"]',
      ]));
      if (!title) return null;

      const time = pick(document, ['[data-testid="myJobsStateDate"]', "time", 'span[class*="date"]']);
      const postedAt = Date.parse(time?.getAttribute("datetime") || "");
      const location = text(pick(document, [
        '[data-testid="inlineHeader-companyLocation"]',
        '[data-testid="jobsearch-JobInfoHeader-companyLocation"]',
        "#jobLocationText",
      ]));

      return {
        title,
        company: text(pick(document, [
          '[data-testid="inlineHeader-companyName"]',
          '[data-company-name="true"]',
          '[data-testid="company-name"]',
        ])),
        location,
        url: canonicalUrl(),
        ageLabel: text(time),
        salary: text(pick(document, ["#salaryInfoAndJobType", '[data-testid="jobsearch-SalaryInfoAndJobType"]'])),
        description: text(pick(document, ["#jobDescriptionText", ".jobsearch-JobComponent-description"])).slice(0, 8000),
        postedAt: Number.isFinite(postedAt) ? postedAt : undefined,
        remote: /remote/i.test(location),
      };
    };

    const indeedCardFrom = (root) => {
      const titleEl = pick(root, [
        "h3.jobTitle span[title]",
        "h2.jobTitle span[title]",
        ".jobTitle span[title]",
        "a[data-jk] span[title]",
        "h3.jobTitle a",
        "h2.jobTitle a",
      ]);
      const title = clean(titleEl?.getAttribute("title")) || titleText(titleEl);
      if (!title) return null;

      const link = pick(root, ["h3.jobTitle a", "h2.jobTitle a", "a[data-jk]", 'a[href*="viewjob"]', 'a[href*="/rc/clk"]']);
      let jk = root.getAttribute("data-jk") || link?.getAttribute("data-jk") || "";
      if (!jk && link) {
        try { jk = new URL(link.getAttribute("href"), window.location.href).searchParams.get("jk") || ""; } catch { jk = ""; }
      }
      const posted = pick(root, ["span.date", '[data-testid="myJobsStateDate"]']);
      const locationEl = pick(root, ['[data-testid="text-location"]', '[data-testid="jobsearch-JobInfoHeader-companyLocation"]']);
      let location = text(locationEl);
      const commute = locationEl && text(pick(locationEl, ['[data-testid="jcs-commute-snippet"]']));
      if (commute) location = clean(location.replace(commute, "").replace(/^[\s·]+/, ""));

      return {
        title,
        company: text(pick(root, ['[data-testid="company-name"]', '[data-company-name="true"]'])),
        location,
        url: jk ? `https://www.indeed.com/viewjob?jk=${encodeURIComponent(jk)}` : (link ? absolute(link.getAttribute("href")) : canonicalUrl()),
        ageLabel: text(posted),
        salary: text(pick(root, ['[data-testid="attribute_snippet_testid"]', ".salary-snippet-container"])),
        description: text(pick(root, ['[data-testid="jobsnippet_footer"]', ".job-snippet"])).slice(0, 8000),
        postedAt: Date.parse(posted?.getAttribute("datetime") || "") || undefined,
        remote: /remote/i.test(location),
      };
    };

    // `data-jk` lives on the title link in current markup and on
    // `.job_seen_beacon` in older markup; seeds map back to the beacon root.
    const indeedCards = () => {
      const seeds = pickAll(document, ["div.job_seen_beacon", "a[data-jk]", '[data-testid="slider_item"]']);
      const roots = new Set();
      for (const seed of seeds) {
        const root = seed.closest("div.job_seen_beacon") || seed.closest('[data-testid="slider_item"]') || seed;
        if (root) roots.add(root);
      }
      const jobs = [];
      for (const root of roots) {
        const job = indeedCardFrom(root);
        if (job) jobs.push(job);
      }
      return jobs;
    };

    const genericJobs = () => {
      const titleEls = pickAll(document, ['[data-test="job-title"]', '[data-test="jobTitle"]']);
      // No list markup: treat the page itself as a single job (detail pages).
      const seeds = titleEls.length ? titleEls : pickAll(document, ["h1"]).slice(0, 1);
      const seenCards = new Set();
      const jobs = [];
      for (const titleEl of seeds) {
        const title = text(titleEl);
        if (!title) continue;

        const card = titleEl.parentElement?.closest('[class*="JobCard"]') || (seeds.length === 1 ? document : titleEl);
        if (seenCards.has(card)) continue;
        seenCards.add(card);
      let company = text(pick(card, [
        '[data-test="employer-name"]',
        '[data-test="employerName"]',
        '[class*="compactEmployerName"]',
        '[class*="EmployerProfile_employerName"]',
      ]));
      if (!company) {
        const logo = card.querySelector('img[alt$=" Logo"]');
        company = (logo?.getAttribute("alt") || "").replace(/\s*Logo$/, "").trim();
      }

      const location = text(pick(card, [
        '[data-test="emp-location"]',
        '[data-test="location"]',
        '[class*="JobDetails_location"]',
      ]));

      let salary = "";
      const salaryBox = pick(card, ['[class*="SalaryEstimate_salaryEstimateNumber"]', '[data-test="detailSalary"]']);
      if (salaryBox) {
        const median = salaryBox.querySelector('[class*="SalaryEstimate_medianEstimate"]');
        const period = salaryBox.querySelector('[class*="SalaryEstimate_payPeriod"]');
        salary = [text(median) || text(salaryBox), text(period)].filter(Boolean).join(" ");
      }

        const titleHref = titleEl.getAttribute("href") || titleEl.closest("a")?.getAttribute("href");
        const linkHref = titleHref || card.querySelector('[data-test="job-link"]')?.getAttribute("href");

        jobs.push({
          title,
          company,
          location,
          url: linkHref ? absolute(linkHref) : absolute(window.location.href),
          ageLabel: text(pick(card, ['[data-test="job-age"]'])),
          salary,
          description: text(pick(card, [
            '[data-test="jobDescriptionContent"]',
            '[class*="JobDetails_jobDescription"]',
            "#JobDescriptionContainer",
            '[class*="jobDescription"]',
          ])),
          remote: /remote/i.test(location),
        });
      }
      return jobs;
    };

    let jobs = [];
    try {
      if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
        if (isLinkedInSearch) {
          jobs = linkedInCards();
          if (!jobs.length) {
            const detail = linkedInDetail();
            if (detail) jobs = [detail];
          }
        } else if (isDetail) {
          const detail = linkedInDetail();
          jobs = detail ? [detail] : linkedInCards();
        } else {
          jobs = linkedInCards();
          if (!jobs.length) {
            const detail = linkedInDetail();
            if (detail) jobs = [detail];
          }
        }
      } else if (host === "indeed.com" || host.endsWith(".indeed.com")) {
        if (isDetail) {
          const detail = indeedDetail();
          jobs = detail ? [detail] : indeedCards();
        } else {
          jobs = indeedCards();
        }
      } else {
        jobs = genericJobs();
      }
    } catch (e) {
      return { success: false, error: String((e && e.message) || e) };
    }

    // JSON-LD describes one posting; only merge it into a single captured job.
    const ld = isDetail && jobs.length <= 1 ? jsonLdJob() : null;
    if (!jobs.length && ld) {
      jobs = [ld];
    } else if (jobs.length === 1 && ld) {
      const merged = jobs[0];
      for (const [key, value] of Object.entries(ld)) {
        if (value === undefined || value === "") continue;
        if (key === "remote" && !value) continue;
        merged[key] = value;
      }
    }

    jobs = jobs.filter((job) => job && job.title);
    if (!jobs.length) {
      return { success: false, error: "No job found on this page. Open a job listing or a job card and try again." };
    }
    if (isDetail && !isLinkedInSearch && jobs.length === 1) jobs[0].url = canonicalUrl();

    const cleaned = [];
    const seenUrls = new Set();
    for (const job of jobs) {
      const url = job.url || window.location.href;
      if (!/^https?:/i.test(url)) continue;
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      cleaned.push({
        title: clean(job.title),
        company: clean(job.company) || undefined,
        location: clean(job.location) || undefined,
        url,
        ageLabel: clean(job.ageLabel) || undefined,
        salary: clean(job.salary) || undefined,
        description: clean(job.description)?.slice(0, 8000) || undefined,
        postedAt: job.postedAt,
        remote: job.remote ?? /remote/i.test(job.location || ""),
      });
    }
    if (!cleaned.length) {
      return { success: false, error: "This page is not a job listing." };
    }

    return { success: true, job: cleaned[0], jobs: cleaned };
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
          for (const [fieldType, entries] of fields) {
            for (const fd of entries) {
              forms.push({
                type: fieldType,
                label: fd.label || "",
                id: fd.element?.id || "",
                name: fd.element?.name || "",
              });
            }
          }
          state.uiService?.showFieldList(fields, state.profile || {});
          sendResponse({ success: true, forms });
        })();
        return true; // keep channel open for async sendResponse
      }

      case MESSAGE_TYPE.CLICK_CONTINUE: {
        try {
          sendResponse({ success: true, clicked: clickContinue() });
        } catch (e) {
          sendResponse({ success: false, error: String((e && e.message) || e) });
        }
        break;
      }

      case MESSAGE_TYPE.FIND_APPLY_URL: {
        try {
          sendResponse({ success: true, url: findApplyUrl() });
        } catch (e) {
          sendResponse({ success: false, error: String((e && e.message) || e) });
        }
        break;
      }

      case "CAPTURE_JOB": {
        try {
          sendResponse(captureCurrentJob());
        } catch (e) {
          sendResponse({ success: false, error: String((e && e.message) || e) });
        }
        break;
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
          for (const [fieldType, entries] of fields) {
            if (!allowed.has(fieldType)) continue;
            const value = valueMap[fieldType];
            if (value === undefined || value === null || value === "") continue;
            for (const fd of entries) {
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

      // ── AI answer flow (side panel) ──────────────────────────────────────
      case "AI_QUESTION_CANDIDATES": {
        try {
          sendResponse({ success: true, fields: collectAiTargets() });
        } catch (e) {
          sendResponse({ success: false, fields: [], error: String(e && e.message || e) });
        }
        break;
      }

      case "AI_APPLY_ANSWER": {
        const { token, text } = message.value || {};
        if (!applyAiAnswer(token, text)) {
          sendResponse({ success: false, error: "Could not write to that field. It may be gone or read-only." });
          break;
        }
        state.uiService?.showToast("Answer inserted. Review before submitting.", "info");
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
