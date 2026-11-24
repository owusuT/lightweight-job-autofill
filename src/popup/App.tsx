import { useEffect, useRef, useState } from "react";
import type { Profile } from "../shared/types";
import { getAtsStatus, getProfile, saveProfile } from "./api";
import { ProfileTab } from "./components/ProfileTab";
import { ApplyTab } from "./components/ApplyTab";
import { HistoryTab } from "./components/HistoryTab";
import { ToolsTab } from "./components/ToolsTab";
import BestJobs from "../sidepanel/App";

type Tab = "profile" | "application" | "jobs" | "history" | "tools";

const TABS: { id: Tab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "application", label: "Apply" },
  { id: "jobs", label: "Best Jobs" },
  { id: "history", label: "History" },
  { id: "tools", label: "Tools" },
];

type StatusType = "info" | "success" | "error";

export default function App() {
  const [tab, setTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState<Profile>({});
  const [status, setStatusState] = useState<{ message: string; type: StatusType }>({
    message: "Ready",
    type: "info",
  });
  const [tabUrl, setTabUrl] = useState("");
  const [atsName, setAtsName] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const setStatus = (message: string, type: StatusType = "info") => {
    setStatusState({ message, type });
    if (timer.current) window.clearTimeout(timer.current);
    if (type !== "info") {
      timer.current = window.setTimeout(() => setStatusState({ message: "Ready", type: "info" }), 3000);
    }
  };

  useEffect(() => {
    let disposed = false;
    const refreshPage = async () => {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      const ats = await getAtsStatus(active?.id);
      if (disposed) return;
      setTabUrl(active?.url || "");
      setAtsName(ats.atsName || null);
    };
    void (async () => {
      const resp = await getProfile();
      if (!disposed && resp.profile) setProfile(resp.profile);
    })();
    const onActivated = () => { void refreshPage(); };
    const onUpdated = (_id: number, change: chrome.tabs.TabChangeInfo) => {
      if (change.status === "complete" || change.url) void refreshPage();
    };
    void refreshPage();
    chrome.tabs.onActivated?.addListener(onActivated);
    chrome.tabs.onUpdated?.addListener(onUpdated);
    return () => {
      disposed = true;
      chrome.tabs.onActivated?.removeListener(onActivated);
      chrome.tabs.onUpdated?.removeListener(onUpdated);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const onChange = (key: keyof Profile, value: string) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const onToggle = (key: keyof Profile, value: boolean) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const onSave = async () => {
    if (!profile.firstName && !profile.email) {
      setStatus("Please fill in at least a name or email.", "error");
      return;
    }
    const resp = await saveProfile(profile);
    setStatus(resp.success ? "Profile saved ✓" : "Failed to save profile.", resp.success ? "success" : "error");
  };

  const onClear = () => {
    setProfile({});
    setStatus("Profile cleared.");
  };

  const onTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    setTab(next.id);
    document.getElementById(`tab-btn-${next.id}`)?.focus();
  };

  const version = chrome.runtime.getManifest().version;

  return (
    <>
      <header className="header">
        <div className="header-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="11" fill="rgba(255,255,255,0.25)" />
            <path d="M7 12l3 3 7-7" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          jolly R
        </div>
        <span className="header-version">v{version}</span>
      </header>

      <nav className="tabs" role="tablist" aria-label="jolly R sections">
        {TABS.map((item, index) => (
          <button
            key={item.id}
            id={`tab-btn-${item.id}`}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`tab-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={`tab ${tab === item.id ? "active" : ""}`}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="content">
        <div id={`tab-${tab}`} role="tabpanel" aria-labelledby={`tab-btn-${tab}`}>
          {tab === "profile" && (
            <ProfileTab
              profile={profile}
              onChange={onChange}
              onToggle={onToggle}
              onSave={onSave}
              onClear={onClear}
            />
          )}
          {tab === "application" && (
            <ApplyTab profile={profile} atsName={atsName} setStatus={setStatus} />
          )}
          {tab === "history" && <HistoryTab setStatus={setStatus} />}
          {tab === "tools" && <ToolsTab tabUrl={tabUrl} setStatus={setStatus} />}
          {tab === "jobs" && <BestJobs />}
        </div>
      </div>

      <footer className="footer">
        <div className={`status-msg ${status.type}`}>{status.message}</div>
      </footer>
    </>
  );
}
