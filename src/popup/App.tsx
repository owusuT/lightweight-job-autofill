import { useEffect, useRef, useState } from "react";
import type { Profile } from "../shared/types";
import { getAtsStatus, getProfile, saveProfile } from "./api";
import { ProfileTab } from "./components/ProfileTab";
import { ApplyTab } from "./components/ApplyTab";
import { HistoryTab } from "./components/HistoryTab";
import { ToolsTab } from "./components/ToolsTab";

type Tab = "profile" | "application" | "history" | "tools";

const TABS: { id: Tab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "application", label: "Apply" },
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
    void (async () => {
      const resp = await getProfile();
      if (resp.profile) setProfile(resp.profile);

      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      setTabUrl(active?.url || "");
      const ats = await getAtsStatus(active?.id);
      if (ats.atsName) setAtsName(ats.atsName);
    })();
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

  const openSidePanel = async () => {
    try {
      const win = await chrome.windows.getCurrent();
      if (win.id === undefined) throw new Error("no window id");
      await chrome.sidePanel.open({ windowId: win.id });
      window.close();
    } catch {
      setStatus("Could not open the side panel. Use the Chrome side panel menu.", "error");
    }
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
        <button type="button" className="header-jobs" onClick={openSidePanel} title="Open Best Jobs side panel">
          Best Jobs
        </button>
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
        </div>
      </div>

      <footer className="footer">
        <div className={`status-msg ${status.type}`}>{status.message}</div>
      </footer>
    </>
  );
}
