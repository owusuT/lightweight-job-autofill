// CSV export utilities

import type { ApplicationEntry } from "./types";

export function buildHistoryCSV(history: ApplicationEntry[]): string {
  if (!history.length) return "";

  const headers = ["Date", "Title", "URL", "ATS", "Fields Filled"];

  const rows = history.map((app) => [
    new Date(app.timestamp).toLocaleDateString(),
    `"${(app.title || "").replace(/"/g, '""')}"`,
    `"${(app.url || "").replace(/"/g, '""')}"`,
    app.atsName || "",
    app.fieldsFilled || 0,
  ]);

  return [headers, ...rows].map((r) => r.join(",")).join("\n");
}
