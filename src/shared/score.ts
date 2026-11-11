// Job scoring model - seven-part deterministic scoring

import type { Profile, Job, ScoredJob, ScorePart } from "./types";

interface ScoreInput {
  job: Job;
  profile: Profile;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[,;\s/]+/)
    .filter((t) => t.length >= 2);
}

function scoreTitle({ job, profile }: ScoreInput): ScorePart {
  const points = 30;
  const titleTokens = tokenize(job.title.toLowerCase());
  const positionTokens = tokenize(profile.position || "");
  const skillTokens = tokenize(profile.skills || "");
  const allProfileTokens = [...positionTokens, ...skillTokens];

  const overlap = titleTokens.filter((t) => allProfileTokens.includes(t)).length;
  const ratio = overlap / Math.max(titleTokens.length, 1);
  const score = Math.round(ratio * points);

  return {
    name: "title",
    score,
    weight: points,
    reason: overlap > 0 ? `${overlap} matching terms in title` : "No matching terms",
  };
}

function scoreSkills({ job, profile }: ScoreInput): ScorePart {
  const points = 25;
  const skillTokens = tokenize(profile.skills || "");
  const jobText = `${job.description || ""} ${(job.tags || []).join(" ")}`.toLowerCase();
  const matched = skillTokens.filter((s) => jobText.includes(s)).length;
  const ratio = matched / Math.max(skillTokens.length, 1);
  const score = Math.round(ratio * points);

  return {
    name: "skills",
    score,
    weight: points,
    reason: matched > 0 ? `${matched} of ${skillTokens.length} skills found` : "No skills matched",
  };
}

function scoreLocation({ job, profile }: ScoreInput): ScorePart {
  const points = 15;
  const profileCity = (profile.city || "").toLowerCase();
  const profileCountry = (profile.country || "").toLowerCase();
  const workType = (profile.workType || "").toLowerCase();

  const locationParts = job.location.toLowerCase().split(",").map((p) => p.trim());
  const jobCity = locationParts[0] || "";
  const jobCountry = locationParts[locationParts.length - 1] || "";

  if (job.remote && (workType === "remote" || workType === "hybrid")) {
    return { name: "location", score: points, weight: points, reason: "Remote job matches remote preference" };
  }

  if (jobCity === profileCity && jobCountry === profileCountry) {
    return { name: "location", score: points, weight: points, reason: "Same city and country" };
  }

  if (jobCountry === profileCountry) {
    return { name: "location", score: 10, weight: points, reason: "Same country" };
  }

  return { name: "location", score: 3, weight: points, reason: "Different location" };
}

function scoreRemote({ job, profile }: ScoreInput): ScorePart {
  const points = 10;
  const workType = (profile.workType || "").toLowerCase();

  if (job.remote && (workType === "remote" || workType === "hybrid")) {
    return { name: "remote", score: points, weight: points, reason: "Remote job with remote preference" };
  }

  if (job.remote && workType === "onsite") {
    return { name: "remote", score: 4, weight: points, reason: "Remote job with on-site preference" };
  }

  if (!job.remote && workType === "remote") {
    return { name: "remote", score: 0, weight: points, reason: "On-site job with remote preference" };
  }

  return { name: "remote", score: 5, weight: points, reason: "Neutral remote match" };
}

function scoreRecency({ job }: ScoreInput): ScorePart {
  const points = 10;
  const now = Date.now();
  const postedAt = job.postedAt || now;
  const days = (now - postedAt) / (1000 * 60 * 60 * 24);

  if (days < 3) return { name: "recency", score: points, weight: points, reason: "Posted within 3 days" };
  if (days < 7) return { name: "recency", score: 7, weight: points, reason: "Posted within 7 days" };
  if (days < 14) return { name: "recency", score: 4, weight: points, reason: "Posted within 14 days" };
  if (days < 30) return { name: "recency", score: 2, weight: points, reason: "Posted within 30 days" };

  return { name: "recency", score: 0, weight: points, reason: "Posted over 30 days ago" };
}

function scoreVisa({ job, profile }: ScoreInput): ScorePart {
  const points = 5;
  const needsSponsorship = profile.sponsorshipNeeded?.toLowerCase() === "yes";
  const offersSponsorship = job.visaSponsorship === true;

  if (needsSponsorship && offersSponsorship) {
    return { name: "visa", score: points, weight: points, reason: "Visa sponsorship offered" };
  }

  if (needsSponsorship && !offersSponsorship) {
    return { name: "visa", score: 0, weight: points, reason: "Visa sponsorship not offered" };
  }

  return { name: "visa", score: points, weight: points, reason: "Visa not required" };
}

function scoreSalary({ job }: ScoreInput): ScorePart {
  const points = 5;
  const text = `${job.description || ""} ${job.salary || ""}`.toLowerCase();
  const hasSalary = /salary|compensation|[£$€]\s?\d|\d+k|\d+k-\d+k/.test(text);

  return {
    name: "salary",
    score: hasSalary ? points : 0,
    weight: points,
    reason: hasSalary ? "Salary mentioned" : "No salary info",
  };
}

function calculateStars(total: number): number {
  const raw = total / 20;
  const rounded = Math.round(raw * 2) / 2;
  return Math.max(1, Math.min(5, rounded));
}

export function scoreJob(job: Job, profile: Profile): ScoredJob {
  const input = { job, profile };

  const breakdown: ScorePart[] = [
    scoreTitle(input),
    scoreSkills(input),
    scoreLocation(input),
    scoreRemote(input),
    scoreRecency(input),
    scoreVisa(input),
    scoreSalary(input),
  ];

  const total = breakdown.reduce((sum, part) => sum + part.score, 0);
  const stars = calculateStars(total);

  return {
    ...job,
    score: total,
    stars,
    breakdown,
  };
}

export function sortJobs(jobs: ScoredJob[]): ScoredJob[] {
  return [...jobs].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.postedAt || 0) !== (a.postedAt || 0)) return (b.postedAt || 0) - (a.postedAt || 0);
    const titleScore = a.breakdown.find((p) => p.name === "title")?.score || 0;
    const bTitleScore = b.breakdown.find((p) => p.name === "title")?.score || 0;
    if (bTitleScore !== titleScore) return bTitleScore - titleScore;
    return a.title.localeCompare(b.title);
  });
}

export interface ResumeInfoLike {
  skills?: unknown;
  position?: unknown;
  positions?: unknown;
}

/**
 * Merge the uploaded resume's extracted skills and title into the profile so
 * job ranking reflects the resume, not just manually typed profile fields.
 * Manually entered profile values win on conflict.
 */
export function withResumeInfo(profile: Profile, resumeInfo?: ResumeInfoLike | null): Profile {
  if (!resumeInfo) return profile;

  const resumeSkills = Array.isArray(resumeInfo.skills)
    ? resumeInfo.skills.filter((s): s is string => typeof s === "string").map((s) => s.trim()).filter(Boolean)
    : [];
  const profileSkills = (profile.skills || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const mergedSkills = [...new Set([...profileSkills, ...resumeSkills])];

  const resumePosition =
    typeof resumeInfo.position === "string" && resumeInfo.position.trim()
      ? resumeInfo.position.trim()
      : Array.isArray(resumeInfo.positions) && typeof resumeInfo.positions[0] === "string"
        ? resumeInfo.positions[0].trim()
        : "";

  return {
    ...profile,
    skills: mergedSkills.join(", "),
    position: profile.position || resumePosition,
  };
}
