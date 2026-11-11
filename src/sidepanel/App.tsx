import { useEffect, useMemo, useRef, useState } from "react";
import type { Job, Profile, ScoredJob } from "../shared/types";
import { scoreJob, sortJobs, withResumeInfo, type ResumeInfoLike } from "../shared/score";
import { mergeCapturedJobs, normalizeJobUrl, rawPageJobToJob } from "../shared/jobCapture";
import { parseTailorJson } from "../shared/ai/prompts";
import { providers } from "../shared/ai/providers";
import {
  fillApplicationTab,
  getJobs,
  getProfile,
  captureCurrentJob,
  findApplyUrl,
  clickContinue,
  getAiSettings,
  aiChat,
  listQuestionFields,
  applyAnswer,
  type AiQuestionCandidate,
} from "./api";
import { FilterBar, type Prefs } from "./components/FilterBar";
import { JobCard } from "./components/JobCard";
import { AiSettings } from "./components/AiSettings";
import "./sidepanel.css";

const DEFAULT_PREFS: Prefs = {
  query: "",
  remote: false,
  visa: false,
  minStars: 1,
  maxAgeDays: 30,
};

type Tab = "jobs" | "ai";

type DraftState =
  | { task: "cover_letter"; job: ScoredJob; text: string }
  | { task: "tailor"; job: ScoredJob; summary: string; skills: string; raw?: string };

function waitForTabComplete(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 12000);
  });
}

export default function App() {
  const [tab, setTab] = useState<Tab>("jobs");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<ScoredJob[]>([]);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [picker, setPicker] = useState<AiQuestionCandidate[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [aiBadge, setAiBadge] = useState<string | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [capturedScored, setCapturedScored] = useState<ScoredJob[]>([]);
  const [capturedUrls, setCapturedUrls] = useState<Set<string>>(new Set());
  const [addingJob, setAddingJob] = useState(false);
  const [fillingPage, setFillingPage] = useState(false);
  const [resumeInfo, setResumeInfo] = useState<ResumeInfoLike | null>(null);
  const toastTimer = useRef<number | null>(null);

  const scoringProfile = useMemo(() => withResumeInfo(profile || {}, resumeInfo), [profile, resumeInfo]);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  };

  const refreshAiBadge = async () => {
    const res = await getAiSettings();
    if (res.success && res.config) {
      const id = res.config.activeProvider;
      const model = res.config.providers[id]?.model;
      setAiBadge(`${providers[id].label} · ${model}`);
    }
  };

  useEffect(() => {
    void (async () => {
      const stored = await chrome.storage.local.get(["jobPrefs"]);
      const saved = stored.jobPrefs as Partial<Prefs> | undefined;
      const merged = { ...DEFAULT_PREFS, ...(saved || {}) };
      setPrefs(merged);
      setPrefsLoaded(true);

      const profileRes = await getProfile();
      const p = profileRes.profile || null;
      setProfile(p);

      const storedResume = await chrome.storage.local.get(["sharedPDFData"]);
      const info = (storedResume.sharedPDFData as { resumeInfo?: ResumeInfoLike } | undefined)?.resumeInfo || null;
      setResumeInfo(info);
      const initialScoringProfile = withResumeInfo(p || {}, info);

      const storedCaptured = await chrome.storage.local.get(["capturedJobs"]);
      const rawCaptured = Array.isArray(storedCaptured.capturedJobs)
        ? (storedCaptured.capturedJobs as Job[]).map((job) => ({ ...job, url: normalizeJobUrl(job.url) }))
        : [];
      if (rawCaptured.length) {
        setCapturedScored(sortJobs(rawCaptured.map((j) => scoreJob(j, initialScoringProfile))));
        setCapturedUrls(new Set(rawCaptured.map((j) => j.url)));
      }

      const initialQuery = merged.query.trim() || initialScoringProfile.position?.trim() || "";
      if (initialQuery) {
        setPrefs((prev) => ({ ...prev, query: initialQuery }));
        void runSearch(initialQuery, merged, initialScoringProfile);
      }

      void refreshAiBadge();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    const id = window.setTimeout(() => {
      void chrome.storage.local.set({ jobPrefs: prefs });
    }, 250);
    return () => window.clearTimeout(id);
  }, [prefs, prefsLoaded]);

  useEffect(() => {
    if (tab === "jobs") void refreshAiBadge();
  }, [tab]);

  const runSearch = async (query: string, p: Prefs, currentProfile: Profile | null) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    const res = await getJobs(trimmed, p.remote, p.visa);
    setLoading(false);

    if (!res.success || !res.jobs) {
      setError(res.error || "Could not reach the job board.");
      setJobs([]);
      return;
    }

    const scored = res.jobs.map((job) => scoreJob(job, currentProfile || {}));
    setJobs(sortJobs(scored));
    setFetchedAt(res.fetchedAt || Date.now());
    setCached(Boolean(res.cached));
  };

  const search = () => runSearch(prefs.query, prefs, scoringProfile);

  const merged = useMemo(() => {
    const byUrl = new Map<string, ScoredJob>();
    for (const job of [...capturedScored, ...jobs]) {
      if (!byUrl.has(job.url)) byUrl.set(job.url, job);
    }
    return sortJobs([...byUrl.values()]);
  }, [capturedScored, jobs]);

  const visible = useMemo(() => {
    const now = Date.now();
    return merged.filter((job) => {
      // Jobs the user captured with "Add page" bypass every filter: hiding
      // something they explicitly added reads as a broken capture.
      if (capturedUrls.has(job.url)) return true;
      if (job.stars < prefs.minStars) return false;
      const postedAt = job.postedAt || now;
      return now - postedAt <= prefs.maxAgeDays * 86400000;
    });
  }, [merged, prefs.minStars, prefs.maxAgeDays, capturedUrls]);

  const addCurrentJob = async () => {
    setAddingJob(true);
    const res = await captureCurrentJob();
    setAddingJob(false);
    if (!res.success || (!res.job && !res.jobs?.length)) {
      notify(res.error || "No job found on this page.");
      return;
    }
    const raws = res.jobs?.length ? res.jobs : [res.job!];
    const jobs = raws.map(rawPageJobToJob).filter((job): job is Job => Boolean(job));
    if (!jobs.length) {
      notify("Could not read the job on this page.");
      return;
    }
    const scored = jobs.map((job) => scoreJob(job, scoringProfile));
    const urls = new Set(jobs.map((job) => job.url));
    const freshCount = jobs.filter((job) => !capturedUrls.has(job.url)).length;
    setCapturedScored((prev) => sortJobs([...scored, ...prev.filter((j) => !urls.has(j.url))]));
    setCapturedUrls((prev) => new Set([...prev, ...urls]));
    const stored = await chrome.storage.local.get(["capturedJobs"]);
    const current = Array.isArray(stored.capturedJobs) ? (stored.capturedJobs as Job[]) : [];
    await chrome.storage.local.set({ capturedJobs: mergeCapturedJobs(current, jobs) });
    if (jobs.length === 1) {
      const [job] = jobs;
      notify(`${freshCount ? "Added" : "Updated"} “${job.title}” — ${scored[0].score}/100, ${scored[0].stars}★`);
    } else {
      notify(`Captured ${jobs.length} jobs from this page (${freshCount} new).`);
    }
  };

  const openJob = (url: string) => {
    void chrome.tabs.create({ url });
  };

  const clearAddedJobs = async () => {
    await chrome.storage.local.remove("capturedJobs");
    setCapturedScored([]);
    setCapturedUrls(new Set());
    notify("Cleared jobs added from pages.");
  };

  const fillCurrentPage = async () => {
    setFillingPage(true);
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id === undefined) {
        notify("No active tab to autofill.");
        return;
      }

      const result = await fillApplicationTab(activeTab.id);
      const count = result.fieldsFilled || 0;
      if (count > 0) {
        notify(`Filled ${count} ${count === 1 ? "field" : "fields"}. Review before submitting.`);
      } else {
        notify(result.error || (result.framesReached === 0
          ? "Could not scan this page. Reload the application tab and try again."
          : "No fields matched your saved profile on this page."));
      }
    } catch {
      notify("Could not access the current tab. Try again from the application page.");
    } finally {
      setFillingPage(false);
    }
  };

  const openAndFill = async (job: ScoredJob) => {
    const tabRef = await chrome.tabs.create({ url: job.url, active: true });
    if (!tabRef.id) return;
    await waitForTabComplete(tabRef.id);
    await new Promise((r) => setTimeout(r, 1200));

    // The listing page is not the application form: follow the "Apply now"
    // link (e.g. Indeed smartapply) when one exists before filling. The button
    // hydrates after load on slow pages, so retry briefly.
    let applyUrl = "";
    for (let attempt = 0; attempt < 3 && !applyUrl; attempt += 1) {
      const apply = await findApplyUrl(tabRef.id);
      applyUrl = apply?.url || "";
      if (!applyUrl) await new Promise((r) => setTimeout(r, 1000));
    }
    if (applyUrl) {
      await chrome.tabs.update(tabRef.id, { url: applyUrl });
      await waitForTabComplete(tabRef.id);
      await new Promise((r) => setTimeout(r, 1200));
    }

    // Wizard pages (Indeed smartapply) fill step by step: fill the current
    // step; if it has no fields, click Continue and retry on the next one.
    // Stops as soon as a step gets filled so the user reviews before submit.
    for (let step = 0; step < 6; step += 1) {
      const res = await fillApplicationTab(tabRef.id);
      if (res?.fieldsFilled) {
        notify(`Filled ${res.fieldsFilled} field(s). Review them, then Continue to the next step.`);
        return;
      }
      if (res.error && res.fieldsFilled === undefined) {
        notify(res.error);
        return;
      }
      const cont = await clickContinue(tabRef.id);
      if (!cont?.clicked) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    notify("No fields found on this step — advance the wizard manually.");
  };

  const runAi = async (task: "cover_letter" | "tailor", job: ScoredJob, bypassCache: boolean) => {
    if (!profile) {
      notify("Add a profile in the popup before drafting.");
      return;
    }
    setBusyJob(job.url);
    const res = await aiChat({
      task,
      profile,
      job: {
        title: job.title,
        company: job.company,
        description: (job.description || "").slice(0, 6000),
      },
      requestId: crypto.randomUUID(),
      bypassCache,
    });
    setBusyJob(null);

    if (!res.success || !res.text) {
      notify(res.error || "AI request failed. Check provider settings.");
      return;
    }

    if (task === "cover_letter") {
      setDraft({ task: "cover_letter", job, text: res.text });
      return;
    }

    const parsed = parseTailorJson(res.text);
    if (parsed) {
      setDraft({ task: "tailor", job, summary: parsed.summary, skills: parsed.skills.join(", ") });
    } else {
      setDraft({ task: "tailor", job, summary: "", skills: "", raw: res.text });
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    const entry =
      draft.task === "cover_letter"
        ? {
            id: crypto.randomUUID(),
            task: draft.task,
            jobTitle: draft.job.title,
            company: draft.job.company,
            url: draft.job.url,
            createdAt: Date.now(),
            text: draft.text,
          }
        : {
            id: crypto.randomUUID(),
            task: draft.task,
            jobTitle: draft.job.title,
            company: draft.job.company,
            url: draft.job.url,
            createdAt: Date.now(),
            summary: draft.summary,
            skills: draft.skills,
          };

    const stored = await chrome.storage.local.get(["aiDrafts"]);
    const drafts = Array.isArray(stored.aiDrafts) ? stored.aiDrafts : [];
    drafts.unshift(entry);
    await chrome.storage.local.set({ aiDrafts: drafts.slice(0, 50) });
    notify("Draft saved locally.");
  };

  const draftToText = (value: DraftState): string =>
    value.task === "cover_letter"
      ? value.text
      : value.raw || [value.summary, value.skills].filter(Boolean).join("\n\n");

  const openPicker = async () => {
    setPicking(true);
    const res = await listQuestionFields();
    setPicking(false);
    if (!res.success || !res.candidates?.length) {
      notify(res.error || "No fillable text fields found on this page.");
      return;
    }
    setPicker(res.candidates);
  };

  const insertInto = async (candidate: AiQuestionCandidate) => {
    if (!draft) return;
    let text = draftToText(draft);
    if (candidate.maxLength && text.length > candidate.maxLength) {
      text = text.slice(0, candidate.maxLength);
      notify(`Trimmed to the field limit (${candidate.maxLength} characters).`);
    }
    const res = await applyAnswer(candidate, text);
    if (res.success) {
      setPicker(null);
      setDraft(null);
      notify(`Inserted into “${candidate.label}”. Review it before submitting.`);
    } else {
      notify(res.error || "Could not insert into that field.");
    }
  };

  const closeDraft = () => {
    setDraft(null);
    setPicker(null);
  };

  const closeSidePanel = () => {
    setDraft(null);
    setPicker(null);
    setToast(null);
    setError(null);
    // Close the side panel window
    window.close();
  };

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">jolly R</p>
          <h1 className="brand">Best Jobs</h1>
        </div>
        <div className="header-actions">
          <button className="badge-btn" onClick={() => setTab("ai")} title="AI settings">
            {aiBadge || "AI settings"}
          </button>
          <button className="close-btn" onClick={closeSidePanel} title="Close side panel" aria-label="Close side panel">
            ×
          </button>
          <nav className="tabs" role="tablist" aria-label="Side panel sections">
            <button
              role="tab"
              aria-selected={tab === "jobs"}
              className={`tab ${tab === "jobs" ? "tab-active" : ""}`}
              onClick={() => setTab("jobs")}
            >
              Jobs
            </button>
            <button
              role="tab"
              aria-selected={tab === "ai"}
              className={`tab ${tab === "ai" ? "tab-active" : ""}`}
              onClick={() => setTab("ai")}
            >
              AI
            </button>
          </nav>
        </div>
      </header>

      {tab === "jobs" ? (
        <>
          <FilterBar
            prefs={prefs}
            loading={loading}
            onChange={(patch) => setPrefs((p) => ({ ...p, ...patch }))}
            onSearch={search}
            onAddPage={addCurrentJob}
            adding={addingJob}
            onAutofill={fillCurrentPage}
            filling={fillingPage}
            onClearAdded={clearAddedJobs}
            addedCount={capturedScored.length}
            onClose={closeSidePanel}
          />

          {!profile?.position && !profile?.skills && (
            <p className="banner">
              Add your role and skills in the popup to rank jobs more accurately.
            </p>
          )}

          {cached && fetchedAt && (
            <p className="banner">Showing cached results from {new Date(fetchedAt).toLocaleTimeString()}.</p>
          )}

          {error && (
            <div className="banner banner-error">
              {error}
              <button className="btn btn-text" onClick={search}>Retry</button>
            </div>
          )}

          {loading && (
            <div className="skeletons" aria-hidden="true">
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          )}

          {!loading && !error && (
            <p className="result-count">
              {visible.length} job{visible.length === 1 ? "" : "s"} · sorted by match
            </p>
          )}

          {!loading && !error && visible.length === 0 && (
            <p className="empty">
              {merged.length > 0
                ? "No jobs matched. Try fewer filters."
                : "No jobs yet. Search a role to get started. Results are Europe-weighted."}
            </p>
          )}

          <div className="job-list">
            {!loading &&
              visible.map((job) => (
                <JobCard
                  key={job.url}
                  job={job}
                  onOpen={openJob}
                  onOpenAndFill={openAndFill}
                  onDraft={(j) => runAi("cover_letter", j, false)}
                  onTailor={(j) => runAi("tailor", j, false)}
                  drafting={busyJob === job.url}
                />
              ))}
          </div>
        </>
      ) : (
        <AiSettings />
      )}

      {toast && (
        <div className="toast" role="status">{toast}</div>
      )}

      {draft && (
        <div className="modal-backdrop" onClick={() => setDraft(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={draft.task === "cover_letter" ? "Cover letter draft" : "Tailored profile"}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="section-title">
              {draft.task === "cover_letter" ? "Cover letter draft" : "Tailored profile"}
            </h2>
            <p className="muted small">{draft.job.title} · {draft.job.company}</p>

            {draft.task === "cover_letter" ? (
              <textarea
                className="draft-text"
                value={draft.text}
                rows={14}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              />
            ) : draft.raw ? (
              <>
                <p className="banner banner-error">Could not parse structured JSON. Raw output shown.</p>
                <textarea className="draft-text" value={draft.raw} rows={12} readOnly />
              </>
            ) : (
              <>
                <label className="field">
                  Summary
                  <textarea
                    className="draft-text"
                    value={draft.summary}
                    rows={7}
                    onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                  />
                </label>
                <label className="field">
                  Skills
                  <textarea
                    className="draft-text"
                    value={draft.skills}
                    rows={3}
                    onChange={(e) => setDraft({ ...draft, skills: e.target.value })}
                  />
                </label>
              </>
            )}

            {picker ? (
              <div className="field-picker">
                <p className="muted small">
                  Pick the field to insert into. Nothing is written until you choose one.
                </p>
                <ul className="field-list">
                  {picker.map((candidate) => (
                    <li key={`${candidate.frameId}:${candidate.token}`}>
                      <button className="field-item" onClick={() => insertInto(candidate)}>
                        <span className="field-name">{candidate.label}</span>
                        <span className="field-meta">
                          {candidate.tag}
                          {candidate.required ? " · required" : ""}
                          {candidate.maxLength ? ` · max ${candidate.maxLength}` : ""}
                          {candidate.currentValue ? " · has text" : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="row-actions">
                  <button className="btn btn-text" onClick={() => setPicker(null)}>Back</button>
                </div>
              </div>
            ) : (
              <div className="row-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    navigator.clipboard.writeText(draftToText(draft)).then(() => notify("Copied."));
                  }}
                >
                  Copy
                </button>
                <button className="btn btn-ghost" onClick={saveDraft}>Save draft</button>
                <button className="btn btn-ghost" onClick={() => runAi(draft.task, draft.job, true)}>
                  Regenerate
                </button>
                <button className="btn btn-ghost" onClick={openPicker} disabled={picking}>
                  {picking ? "Scanning page…" : "Insert into page"}
                </button>
                <button className="btn btn-text" onClick={closeDraft}>Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
