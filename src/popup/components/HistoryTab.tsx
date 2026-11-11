import { useEffect, useState } from "react";
import type { ApplicationEntry } from "../../shared/types";
import { buildHistoryCSV } from "../../shared/csv";
import { domainFromUrl, timeAgo } from "../../shared/format";
import { getHistory } from "../api";

interface Props {
  setStatus: (message: string, type?: "info" | "success" | "error") => void;
}

export function HistoryTab({ setStatus }: Props) {
  const [applications, setApplications] = useState<ApplicationEntry[]>([]);
  const [stats, setStats] = useState({ total: 0, today: 0, thisWeek: 0 });

  useEffect(() => {
    void (async () => {
      const resp = await getHistory();
      const submitted = (resp.history || []).filter((app) => app.status !== "filled");
      setApplications(submitted);
      setStats({
        total: resp.stats?.total || 0,
        today: resp.stats?.today || 0,
        thisWeek: resp.stats?.thisWeek || 0,
      });
    })();
  }, []);

  const exportCsv = () => {
    if (!applications.length) {
      setStatus("No history to export.", "error");
      return;
    }
    const blob = new Blob([buildHistoryCSV(applications)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jollyR-applications-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-num">{stats.total}</div><div className="stat-label">Total</div></div>
        <div className="stat-card"><div className="stat-num">{stats.thisWeek}</div><div className="stat-label">This Week</div></div>
        <div className="stat-card"><div className="stat-num">{stats.today}</div><div className="stat-label">Today</div></div>
      </div>

      <div className="section-title">Recent Applications</div>
      <div className="history-list">
        {applications.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">No applications yet</div>
            <div className="empty-state-sub">Applications you fill will appear here.</div>
          </div>
        ) : (
          applications.slice(0, 30).map((app) => (
            <div className="history-item" key={app.id}>
              <div className="history-main">
                <div className="history-title">{app.title || domainFromUrl(app.url) || "Unknown"}</div>
                <div className="history-sub">{domainFromUrl(app.url)}</div>
              </div>
              <div className="history-meta">
                {app.atsName && <span className="history-badge badge-blue">{app.atsName}</span>}
                <span className="history-time">{timeAgo(app.timestamp)}</span>
                <span className="history-badge badge-green">{app.fieldsFilled || 0} fields</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="spaced">
        <button className="btn btn-secondary btn-full btn-sm" onClick={exportCsv}>⬇ Export CSV</button>
      </div>
    </div>
  );
}
