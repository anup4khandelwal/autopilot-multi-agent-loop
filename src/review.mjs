import fs from "node:fs";

const MARKER = "<!-- review-os:pr-review -->";

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function containsAny(text, needles) {
  const lower = (text || "").toLowerCase();
  return needles.some((n) => lower.includes(n));
}

function scoreProduct(body) {
  let score = 100;
  const findings = [];

  const hasProblem = containsAny(body, ["problem", "pain", "why", "context"]);
  const hasImpact = containsAny(body, ["user impact", "customer", "who is affected", "persona"]);
  const hasAcceptance = containsAny(body, ["acceptance criteria", "definition of done", "success metric", "done when"]);

  if (!hasProblem) {
    score -= 25;
    findings.push({ severity: "warning", lens: "Product", message: "PR description lacks a clear problem/context statement." });
  }
  if (!hasImpact) {
    score -= 25;
    findings.push({ severity: "warning", lens: "Product", message: "PR description lacks explicit user/business impact." });
  }
  if (!hasAcceptance) {
    score -= 20;
    findings.push({ severity: "warning", lens: "Product", message: "PR description lacks acceptance criteria or success metrics." });
  }

  return { score: clamp(score), findings };
}

function scoreDesign(body, files) {
  let score = 100;
  const findings = [];
  const frontendTouched = files.some((f) => /(^|\/)(src|app|web|frontend|ui|components|pages)\//i.test(f.filename) || /\.(tsx|jsx|css|scss|vue)$/.test(f.filename));

  if (frontendTouched) {
    const hasEvidence = containsAny(body, ["screenshot", "recording", "figma", "ux", "ui", ".png", ".jpg", ".gif"]);
    if (!hasEvidence) {
      score -= 30;
      findings.push({ severity: "warning", lens: "Design", message: "Frontend changes detected without UI evidence (screenshots/UX notes)." });
    }
  }

  return { score: clamp(score), findings };
}

function scoreEngineering(files, additions, deletions) {
  let score = 100;
  const findings = [];
  const changed = files.length;
  const delta = additions + deletions;

  if (changed > 30) {
    score -= 25;
    findings.push({ severity: "warning", lens: "Engineering", message: `Large PR: ${changed} files changed.` });
  } else if (changed > 15) {
    score -= 12;
    findings.push({ severity: "info", lens: "Engineering", message: `Moderate-large PR: ${changed} files changed.` });
  }

  if (delta > 1200) {
    score -= 20;
    findings.push({ severity: "warning", lens: "Engineering", message: `High diff volume: ${delta} lines changed.` });
  }

  const riskyPatterns = [
    /migrations?\//i,
    /schema/i,
    /auth|oauth|jwt|session|permission/i,
    /payment|billing|invoice/i,
    /\.github\/workflows\//i,
    /dockerfile|k8s|terraform|helm/i,
  ];

  const risky = files.filter((f) => riskyPatterns.some((r) => r.test(f.filename)));
  if (risky.length > 0) {
    score -= Math.min(20, risky.length * 4);
    findings.push({ severity: "info", lens: "Engineering", message: `Risk-sensitive files touched (${risky.length}). Ensure focused reviewer coverage.` });
  }

  const hasTests = files.some((f) => /(test|spec)\.(ts|tsx|js|jsx|py|go|rb)$/.test(f.filename) || /(^|\/)(tests?|__tests__)\//.test(f.filename));
  if (!hasTests) {
    score -= 15;
    findings.push({ severity: "warning", lens: "Engineering", message: "No test file changes detected." });
  } else {
    score += 5;
  }

  return { score: clamp(score), findings, riskyCount: risky.length, hasTests };
}

function scoreSecurity(files, engineering) {
  let score = 100;
  const findings = [];

  const sensitive = files.filter((f) => /auth|oauth|jwt|session|permission|secret|token|payment|billing|infra|k8s|terraform|workflow/i.test(f.filename));

  if (sensitive.length > 0) {
    score -= Math.min(35, sensitive.length * 6);
    findings.push({ severity: "warning", lens: "Security", message: `Sensitive domain changes detected (${sensitive.length} file(s)).` });
  }

  if (sensitive.length > 0 && !engineering.hasTests) {
    findings.push({ severity: "critical", lens: "Security", message: "Sensitive changes detected without test updates." });
    score -= 20;
  }

  return { score: clamp(score), findings };
}

function summarizeFindings(findings) {
  const bySeverity = {
    critical: findings.filter((f) => f.severity === "critical"),
    warning: findings.filter((f) => f.severity === "warning"),
    info: findings.filter((f) => f.severity === "info"),
  };
  return bySeverity;
}

function buildComment({ pr, scores, mergeReadiness, grouped, nextSteps }) {
  const fmt = (items, icon) =>
    items.length
      ? items.map((f) => `- ${icon} **${f.lens}**: ${f.message}`).join("\n")
      : "- None";

  return `${MARKER}
## ReviewOS Copilot Report

**PR:** #${pr.number} - ${pr.title}

### Merge Readiness: **${mergeReadiness}/100**

| Lens | Score |
|---|---:|
| Engineering | ${scores.engineering} |
| Product | ${scores.product} |
| Design | ${scores.design} |
| Security | ${scores.security} |

### Findings

**Critical**
${fmt(grouped.critical, "🚨")}

**Warnings**
${fmt(grouped.warning, "⚠️")}

**Info**
${fmt(grouped.info, "ℹ️")}

### Recommended Next Steps
${nextSteps.map((s) => `- ${s}`).join("\n")}

---
Generated by **review-os**`;
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

async function getAllFiles(owner, repo, pullNumber, token) {
  let page = 1;
  const all = [];
  while (true) {
    const batch = await ghRequest(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100&page=${page}`, token);
    all.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return all;
}

async function upsertComment(owner, repo, issueNumber, token, body) {
  const comments = await ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`, token);
  const existing = comments.find((c) => c.body && c.body.includes(MARKER));

  if (existing) {
    await ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/comments/${existing.id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
    return { mode: "updated", id: existing.id };
  }

  const created = await ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`, token, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  return { mode: "created", id: created.id };
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repoSlug = process.env.GITHUB_REPOSITORY;
  const failOnCritical = (process.env.FAIL_ON_CRITICAL || "false").toLowerCase() === "true";

  if (!token) throw new Error("Missing GITHUB_TOKEN");
  if (!eventPath) throw new Error("Missing GITHUB_EVENT_PATH");
  if (!repoSlug) throw new Error("Missing GITHUB_REPOSITORY");

  const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  const pull = event.pull_request;
  if (!pull) {
    console.log("No pull_request payload. Exiting.");
    return;
  }

  const [owner, repo] = repoSlug.split("/");
  const pullNumber = pull.number;

  const pr = await ghRequest(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`, token);
  const files = await getAllFiles(owner, repo, pullNumber, token);
  const body = pr.body || "";

  const eng = scoreEngineering(files, pr.additions || 0, pr.deletions || 0);
  const prod = scoreProduct(body);
  const des = scoreDesign(body, files);
  const sec = scoreSecurity(files, eng);

  const findings = [...eng.findings, ...prod.findings, ...des.findings, ...sec.findings];
  const grouped = summarizeFindings(findings);

  const mergeReadiness = Math.round(
    eng.score * 0.35 +
      prod.score * 0.25 +
      des.score * 0.15 +
      sec.score * 0.25
  );

  const nextSteps = [];
  if (grouped.critical.length) nextSteps.push("Resolve all critical findings before merge.");
  if (eng.score < 70) nextSteps.push("Reduce PR scope or split changes for faster, higher-quality review.");
  if (prod.score < 70) nextSteps.push("Update PR description with problem statement, user impact, and acceptance criteria.");
  if (des.score < 75) nextSteps.push("Attach screenshots/UX notes for frontend-impacting changes.");
  if (sec.score < 75) nextSteps.push("Request focused security review for sensitive changes.");
  if (nextSteps.length === 0) nextSteps.push("PR quality signals look healthy. Proceed with standard reviewer assignment.");

  const comment = buildComment({
    pr,
    scores: {
      engineering: eng.score,
      product: prod.score,
      design: des.score,
      security: sec.score,
    },
    mergeReadiness,
    grouped,
    nextSteps,
  });

  const upsert = await upsertComment(owner, repo, pullNumber, token, comment);
  console.log(`Review comment ${upsert.mode}: ${upsert.id}`);
  console.log(`Merge readiness: ${mergeReadiness}`);

  if (failOnCritical && grouped.critical.length > 0) {
    console.error(`Critical findings present (${grouped.critical.length}). Failing job.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
