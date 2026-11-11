import { useState } from "react";
import type { ScoredJob } from "../../shared/types";
import { timeAgo } from "../../shared/format";
import { Stars } from "./Stars";

interface JobCardProps {
  job: ScoredJob;
  onOpen: (url: string) => void;
  onOpenAndFill: (job: ScoredJob) => void;
  onDraft: (job: ScoredJob) => void;
  onTailor: (job: ScoredJob) => void;
  drafting: boolean;
}

export function JobCard({ job, onOpen, onOpenAndFill, onDraft, onTailor, drafting }: JobCardProps) {
  const [expanded, setExpanded] = useState(false);
  const reasons = job.breakdown
    .filter((part) => part.score > 0)
    .sort((a, b) => b.score / Math.max(b.weight, 1) - a.score / Math.max(a.weight, 1))
    .slice(0, 2);

  return (
    <article className="job-card">
      <header className="job-head">
        <div className="job-title-block">
          <h3 className="job-title">{job.title}</h3>
          <p className="job-meta">
            {job.company}
            <span className="dot" aria-hidden="true">·</span>
            {job.location || "Location not listed"}
          </p>
        </div>
        <div className="job-score">
          <span className="job-total">{job.score}</span>
          <Stars value={job.stars} score={job.score} />
        </div>
      </header>

      <div className="chip-row">
        {job.remote && <span className="chip">Remote</span>}
        {job.visaSponsorship && <span className="chip">Visa</span>}
        <span className="chip">{timeAgo(job.postedAt || Date.now())}</span>
        {reasons.map((part) => (
          <span className="chip chip-reason" key={part.name}>{part.reason}</span>
        ))}
        {job.tags?.slice(0, 2).map((tag) => (
          <span className="chip" key={tag}>{tag}</span>
        ))}
      </div>

      <div className="job-actions">
        <button className="btn btn-primary" onClick={() => onOpen(job.url)}>Open</button>
        <button className="btn btn-ghost" onClick={() => onOpenAndFill(job)}>Open + Autofill</button>
        <button className="btn btn-ghost" onClick={() => onDraft(job)} disabled={drafting}>
          {drafting ? "Drafting…" : "Draft letter"}
        </button>
        <button className="btn btn-ghost" onClick={() => onTailor(job)} disabled={drafting}>
          Tailor profile
        </button>
        <button
          className="btn btn-text"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide match" : "Why this match"}
        </button>
      </div>

      {expanded && (
        <ul className="breakdown">
          {job.breakdown.map((part) => (
            <li key={part.name} className="breakdown-row">
              <span className="breakdown-label">{part.name}</span>
              <span className="breakdown-bar">
                <span
                  className="breakdown-fill"
                  style={{ width: `${Math.round((part.score / Math.max(part.weight, 1)) * 100)}%` }}
                />
              </span>
              <span className="breakdown-points">{part.score}/{part.weight}</span>
              <span className="breakdown-reason">{part.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
