import fs from "node:fs";

const MARKER = "<!-- review-os:sla-reminder -->";
const REVIEW_MARKER = "<!-- review-os:pr-review -->";

function parseThresholdHours() {
  const v = Number(process.env.REVIEW_SLA_HOURS || 24);
  return Number.isFinite(v) ? Math.max(1, v) : 24;
}

function parseCooldownHours() {
  const v = Number(process.env.REVIEW_SLA_COOLDOWN_HOURS || 12);
  return Number.isFinite(v) ? Math.max(1, v) : 12;
}

function parseSlaPolicyFromComment(body) {
  const text = String(body || "");
  const match = text.match(/<!-- review-os:sla threshold=([0-9]+) cooldown=([0-9]+) escalation=([0-9]+) owners=([^>]*) -->/);
  if (!match) return null;
  return {
    thresholdHours: Number(match[1]),
    cooldownHours: Number(match[2]),
    escalationAfterHours: Number(match[3]),
    owners: String(match[4] || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

async function ghRequest(url, token, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status} ${res.statusText}: ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

async function upsertReminder(owner, repo, issueNumber, token, body, cooldownHours) {
  const comments = await ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`, token);
  const existing = (comments || []).find((c) => String(c.body || "").includes(MARKER));
  if (!existing) {
    await ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`, token, {
      method: "POST",
      body: JSON.stringify({ body: `${MARKER}\n${body}` }),
    });
    return "created";
  }

  const updatedAt = new Date(existing.updated_at || existing.created_at || 0).getTime();
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  if (Date.now() - updatedAt < cooldownMs) return "cooldown";

  await ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/comments/${existing.id}`, token, {
    method: "PATCH",
    body: JSON.stringify({ body: `${MARKER}\n${body}` }),
  });
  return "updated";
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repoSlug = process.env.GITHUB_REPOSITORY;
  if (!token || !repoSlug) {
    console.log("Missing GITHUB_TOKEN or GITHUB_REPOSITORY; exiting.");
    return;
  }

  const [owner, repo] = repoSlug.split("/");
  const thresholdHours = parseThresholdHours();
  const cooldownHours = parseCooldownHours();

  const pulls = await ghRequest(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=100`, token);
  let reminded = 0;

  for (const pr of pulls || []) {
    if (pr.draft) continue;
    const createdAt = new Date(pr.created_at || 0).getTime();
    if (!createdAt) continue;
    const ageHours = (Date.now() - createdAt) / (1000 * 60 * 60);
    const comments = await ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${pr.number}/comments?per_page=100`, token);
    const reviewComment = (comments || []).find((c) => String(c.body || "").includes(REVIEW_MARKER));
    const commentPolicy = parseSlaPolicyFromComment(reviewComment?.body || "");
    const effectiveThreshold = commentPolicy?.thresholdHours || thresholdHours;
    const effectiveCooldown = commentPolicy?.cooldownHours || cooldownHours;
    const effectiveEscalation = commentPolicy?.escalationAfterHours || Math.max(effectiveThreshold * 2, thresholdHours);
    if (ageHours < effectiveThreshold) continue;

    const reviews = await ghRequest(`https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}/reviews?per_page=100`, token);
    const approved = (reviews || []).some((r) => String(r.state || "").toUpperCase() === "APPROVED");
    if (approved) continue;

    const body = [
      "## Review SLA Reminder",
      "",
      `- PR has been open for **${ageHours.toFixed(1)}h** without approval.`,
      `- SLA threshold: **${effectiveThreshold}h**`,
      `- Escalation after: **${effectiveEscalation}h**`,
      `- Owners: **${commentPolicy?.owners?.length ? commentPolicy.owners.join(", ") : "none"}**`,
      "- Please request/assign reviewers to unblock merge.",
    ].join("\n");

    const mode = await upsertReminder(owner, repo, pr.number, token, body, effectiveCooldown);
    if (mode !== "cooldown") reminded += 1;
  }

  console.log(`SLA reminder run complete. Reminders posted/updated: ${reminded}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
