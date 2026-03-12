import fs from "node:fs";

const CONFIG = ".reviewos.yml";
const STATE = ".reviewos/reviewer-load.json";
const OUT_MD = "docs/reviewer-queue.md";
const OUT_CSV = "docs/reviewer-queue.csv";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function parseNumericConfig(key, fallback) {
  const text = readText(CONFIG);
  const match = text.match(new RegExp(`^\\s*${key}:\\s*([0-9]+)\\s*$`, "m"));
  if (!match) return fallback;
  return Number(match[1]);
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, "utf8"));
  } catch {
    return { users: {}, teams: {} };
  }
}

async function ghRequest(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res.json();
}

function latestReviewMap(reviews) {
  const out = new Map();
  for (const review of reviews || []) {
    const login = review?.user?.login;
    if (!login) continue;
    const existing = out.get(login);
    const submitted = String(review.submitted_at || "");
    if (!existing || submitted > existing.submitted_at) {
      out.set(login, { state: String(review.state || ""), submitted_at: submitted });
    }
  }
  return out;
}

async function fetchLiveQueue(token, repoSlug) {
  if (!token || !repoSlug) return { users: new Map(), teams: new Map(), prs: [] };
  const [owner, repo] = repoSlug.split("/");
  const pulls = await ghRequest(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=100`, token);
  const users = new Map();
  const teams = new Map();
  const prs = [];

  for (const pull of pulls || []) {
    const detail = await ghRequest(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull.number}`, token);
    const reviews = await ghRequest(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull.number}/reviews?per_page=100`, token);
    const reviewMap = latestReviewMap(reviews);

    const requestedUsers = (detail.requested_reviewers || []).map((u) => u.login).filter(Boolean);
    const requestedTeams = (detail.requested_teams || []).map((t) => `${owner}/${t.slug}`).filter(Boolean);

    prs.push({
      number: pull.number,
      title: pull.title,
      users: requestedUsers,
      teams: requestedTeams,
    });

    for (const login of requestedUsers) {
      if (!users.has(login)) users.set(login, { reviewer: login, assigned: 0, pending: 0, prs: [] });
      const row = users.get(login);
      row.assigned += 1;
      row.prs.push(`#${pull.number}`);
      if (!reviewMap.has(login)) row.pending += 1;
    }

    for (const team of requestedTeams) {
      if (!teams.has(team)) teams.set(team, { reviewer: team, assigned: 0, pending: 0, prs: [] });
      const row = teams.get(team);
      row.assigned += 1;
      row.prs.push(`#${pull.number}`);
      row.pending += 1;
    }
  }

  return { users, teams, prs };
}

function mergeRows(kind, liveMap, stateMap, weeklyCap) {
  const keys = new Set([...Object.keys(stateMap || {}), ...liveMap.keys()]);
  const rows = [];
  for (const key of keys) {
    const live = liveMap.get(key) || { reviewer: key, assigned: 0, pending: 0, prs: [] };
    const state = stateMap?.[key] || {};
    const weeklyCount = Number(state.weekly_count || 0);
    const totalCount = Number(state.count || 0);
    const utilization = weeklyCap > 0 ? Math.min(100, Math.round((weeklyCount / weeklyCap) * 100)) : 0;
    rows.push({
      kind,
      reviewer: key,
      assigned: Number(live.assigned || 0),
      pending: Number(live.pending || 0),
      weeklyCount,
      weeklyCap,
      utilization,
      totalCount,
      prs: live.prs || [],
    });
  }
  return rows.sort((a, b) => b.pending - a.pending || b.assigned - a.assigned || a.reviewer.localeCompare(b.reviewer));
}

function buildTable(rows) {
  if (!rows.length) return "No live reviewer queue data available.";
  const head = "| Kind | Reviewer | Assigned PRs | Pending Reviews | Weekly Load | Weekly Cap | Utilization | Total Historical Assignments |";
  const sep = "|---|---|---:|---:|---:|---:|---:|---:|";
  const body = rows
    .map((r) => `| ${r.kind} | ${r.reviewer} | ${r.assigned} | ${r.pending} | ${r.weeklyCount} | ${r.weeklyCap} | ${r.utilization}% | ${r.totalCount} |`)
    .join("\n");
  return `${head}\n${sep}\n${body}`;
}

async function main() {
  ensureDir("docs");
  const state = loadState();
  const userCap = parseNumericConfig("weekly_capacity_per_user", 10);
  const teamCap = parseNumericConfig("weekly_capacity_per_team", 20);
  const live = await fetchLiveQueue(process.env.GITHUB_TOKEN, process.env.GITHUB_REPOSITORY);
  const userRows = mergeRows("user", live.users, state.users || {}, userCap);
  const teamRows = mergeRows("team", live.teams, state.teams || {}, teamCap);
  const rows = [...userRows, ...teamRows];

  const md = `# Reviewer Queue Board\n\nGenerated: ${new Date().toISOString()}\n\n## Queue\n\n${buildTable(rows)}\n\n## Open PR Assignments\n\n${
    live.prs.length
      ? live.prs
          .map((pr) => `- #${pr.number} ${pr.title}\n  users: ${pr.users.join(", ") || "none"}\n  teams: ${pr.teams.join(", ") || "none"}`)
          .join("\n")
      : "No open PR assignment data available."
  }\n`;
  const csvLines = [
    "kind,reviewer,assigned_prs,pending_reviews,weekly_load,weekly_cap,utilization,total_historical_assignments,prs",
    ...rows.map((r) => `${r.kind},${r.reviewer},${r.assigned},${r.pending},${r.weeklyCount},${r.weeklyCap},${r.utilization},${r.totalCount},"${r.prs.join(" ")}"`),
  ];

  fs.writeFileSync(OUT_MD, md);
  fs.writeFileSync(OUT_CSV, `${csvLines.join("\n")}\n`);
  console.log(`Reviewer queue board written: ${OUT_MD}`);
  console.log(`Reviewer queue CSV written: ${OUT_CSV}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
