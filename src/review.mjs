import fs from "node:fs";
import path from "node:path";

const MARKER = "<!-- review-os:pr-review -->";
const HISTORY_DIR = ".reviewos/history";

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function containsAny(text, needles) {
  const lower = (text || "").toLowerCase();
  return needles.some((n) => lower.includes(n));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (!Number.isNaN(Number(trimmed)) && trimmed !== "") return Number(trimmed);
  return trimmed;
}

function loadConfig(configPath = ".reviewos.yml") {
  const defaults = {
    weights: { engineering: 0.35, product: 0.25, design: 0.15, security: 0.25 },
    thresholds: {
      engineering_warning: 70,
      product_warning: 70,
      design_warning: 75,
      security_warning: 75,
    },
    max_iterations: 3,
    fail_on_critical: true,
    reviewer_routing: {
      enabled: true,
      auto_request: false,
      max_reviewers: 3,
    },
  };

  if (!fs.existsSync(configPath)) return defaults;

  const data = fs.readFileSync(configPath, "utf8").split(/\r?\n/);
  const parsed = {
    ...defaults,
    weights: { ...defaults.weights },
    thresholds: { ...defaults.thresholds },
    reviewer_routing: { ...defaults.reviewer_routing },
  };

  let section = null;
  for (const rawLine of data) {
    const line = rawLine.replace(/\t/g, "  ");
    if (!line.trim() || line.trim().startsWith("#")) continue;

    if (!line.startsWith("  ")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (value === "") {
        section = key;
      } else {
        parsed[key] = parseScalar(value);
        section = null;
      }
      continue;
    }

    if (!section) continue;
    const child = line.trim();
    const idx = child.indexOf(":");
    if (idx === -1) continue;
    const key = child.slice(0, idx).trim();
    const value = parseScalar(child.slice(idx + 1).trim());
    if (typeof parsed[section] !== "object" || parsed[section] === null) parsed[section] = {};
    parsed[section][key] = value;
  }

  return parsed;
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
  const frontendTouched = files.some(
    (f) => /(^|\/)(src|app|web|frontend|ui|components|pages)\//i.test(f.filename) || /\.(tsx|jsx|css|scss|vue)$/.test(f.filename)
  );

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

  const riskyPatterns = [/migrations?\//i, /schema/i, /auth|oauth|jwt|session|permission/i, /payment|billing|invoice/i, /\.github\/workflows\//i, /dockerfile|k8s|terraform|helm/i];
  const risky = files.filter((f) => riskyPatterns.some((r) => r.test(f.filename)));

  if (risky.length > 0) {
    score -= Math.min(20, risky.length * 4);
    findings.push({ severity: "info", lens: "Engineering", message: `Risk-sensitive files touched (${risky.length}). Ensure focused reviewer coverage.` });
  }

  const hasTests = files.some(
    (f) => /(test|spec)\.(ts|tsx|js|jsx|py|go|rb)$/.test(f.filename) || /(^|\/)(tests?|__tests__)\//.test(f.filename)
  );

  if (!hasTests) {
    score -= 15;
    findings.push({ severity: "warning", lens: "Engineering", message: "No test file changes detected." });
  } else {
    score += 5;
  }

  return { score: clamp(score), findings, hasTests, riskyCount: risky.length };
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
    score -= 20;
    findings.push({ severity: "critical", lens: "Security", message: "Sensitive changes detected without test updates." });
  }

  return { score: clamp(score), findings };
}

function dedupeFindings(findings) {
  const seen = new Set();
  const out = [];
  for (const f of findings) {
    const key = `${f.severity}|${f.lens}|${f.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(f);
    }
  }
  return out;
}

function summarizeFindings(findings) {
  return {
    critical: findings.filter((f) => f.severity === "critical"),
    warning: findings.filter((f) => f.severity === "warning"),
    info: findings.filter((f) => f.severity === "info"),
  };
}

function historyFile(repoSlug, prNumber) {
  const safeRepo = repoSlug.replace(/\//g, "__");
  return path.join(HISTORY_DIR, `${safeRepo}__pr-${prNumber}.json`);
}

function loadHistory(repoSlug, prNumber) {
  const file = historyFile(repoSlug, prNumber);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function saveHistory(repoSlug, prNumber, entry) {
  ensureDir(HISTORY_DIR);
  const file = historyFile(repoSlug, prNumber);
  const prev = loadHistory(repoSlug, prNumber);
  const next = [...prev.slice(-9), entry];
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  return file;
}

function addRecurringSignals(findings, history) {
  if (history.length < 1) return findings;
  const prev = history.at(-1);
  if (!prev || !Array.isArray(prev.findings)) return findings;

  const prevSet = new Set(prev.findings.map((f) => `${f.lens}|${f.message}`));
  let recurringCount = 0;
  for (const f of findings) {
    if (prevSet.has(`${f.lens}|${f.message}`)) recurringCount += 1;
  }

  if (recurringCount > 0) {
    return [
      ...findings,
      {
        severity: "info",
        lens: "Memory",
        message: `Detected ${recurringCount} recurring finding(s) from previous review cycle.`,
      },
    ];
  }

  return findings;
}

function runAgentLoop({ pr, files, config, repoSlug }) {
  const body = pr.body || "";
  const history = loadHistory(repoSlug, pr.number);
  const iterations = Math.max(1, Number(config.max_iterations) || 3);

  let previousSignature = "";
  let final = null;

  for (let i = 1; i <= iterations; i += 1) {
    const eng = scoreEngineering(files, pr.additions || 0, pr.deletions || 0);
    const product = scoreProduct(body);
    const design = scoreDesign(body, files);
    const security = scoreSecurity(files, eng);

    let findings = dedupeFindings([...eng.findings, ...product.findings, ...design.findings, ...security.findings]);
    findings = addRecurringSignals(findings, history);

    const grouped = summarizeFindings(findings);

    const mergeReadiness = Math.round(
      eng.score * Number(config.weights.engineering) +
        product.score * Number(config.weights.product) +
        design.score * Number(config.weights.design) +
        security.score * Number(config.weights.security)
    );

    const signature = JSON.stringify({
      findings: findings.map((f) => `${f.severity}|${f.lens}|${f.message}`).sort(),
      scores: [eng.score, product.score, design.score, security.score],
    });

    final = {
      iteration: i,
      scores: { engineering: eng.score, product: product.score, design: design.score, security: security.score },
      grouped,
      findings,
      mergeReadiness,
      history,
    };

    if (signature === previousSignature) break;
    previousSignature = signature;

    if (grouped.critical.length === 0 && mergeReadiness >= 90) break;
  }

  return final;
}

function loadCodeowners(codeownersPath = ".github/CODEOWNERS") {
  if (!fs.existsSync(codeownersPath)) return [];
  const lines = fs.readFileSync(codeownersPath, "utf8").split(/\r?\n/);
  const rules = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;
    const pattern = parts[0];
    const owners = parts.slice(1);
    rules.push({ pattern, owners });
  }

  return rules;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patternToRegex(pattern) {
  let p = pattern.trim();
  if (p.startsWith("/")) p = p.slice(1);
  if (p.endsWith("/")) p += "**";

  const hasSlash = p.includes("/");
  const placeholder = "__DS__";
  let rx = escapeRegex(p).replace(/\*\*/g, placeholder).replace(/\*/g, "[^/]*").replace(new RegExp(placeholder, "g"), ".*");

  if (!hasSlash) {
    rx = `(?:^|.*/)${rx}$`;
  } else {
    rx = `^${rx}$`;
  }

  return new RegExp(rx);
}

function resolveReviewers(files, prAuthor, codeownerRules, maxReviewers = 3) {
  if (codeownerRules.length === 0) return { users: [], teams: [] };

  const users = new Set();
  const teams = new Set();

  for (const file of files) {
    let matchedOwners = [];
    for (const rule of codeownerRules) {
      const regex = patternToRegex(rule.pattern);
      if (regex.test(file.filename)) matchedOwners = rule.owners;
    }

    for (const owner of matchedOwners) {
      if (!owner.startsWith("@")) continue;
      const normalized = owner.slice(1);
      if (!normalized) continue;
      if (normalized.includes("/")) {
        teams.add(normalized);
      } else if (normalized !== prAuthor) {
        users.add(normalized);
      }
    }
  }

  const sortedUsers = [...users].sort().slice(0, Math.max(0, maxReviewers));
  const sortedTeams = [...teams].sort().slice(0, Math.max(0, maxReviewers));
  return { users: sortedUsers, teams: sortedTeams };
}

function buildNextSteps(result, config) {
  const nextSteps = [];
  const { grouped, scores } = result;
  const t = config.thresholds;

  if (grouped.critical.length) nextSteps.push("Resolve all critical findings before merge.");
  if (scores.engineering < t.engineering_warning) nextSteps.push("Reduce PR scope or split changes for faster, higher-quality review.");
  if (scores.product < t.product_warning) nextSteps.push("Update PR description with problem statement, user impact, and acceptance criteria.");
  if (scores.design < t.design_warning) nextSteps.push("Attach screenshots/UX notes for frontend-impacting changes.");
  if (scores.security < t.security_warning) nextSteps.push("Request focused security review for sensitive changes.");
  if (nextSteps.length === 0) nextSteps.push("PR quality signals look healthy. Proceed with standard reviewer assignment.");

  return nextSteps;
}

function buildComment({ pr, result, nextSteps, reviewerRouting }) {
  const fmt = (items, icon) => (items.length ? items.map((f) => `- ${icon} **${f.lens}**: ${f.message}`).join("\n") : "- None");

  const reviewersSection = reviewerRouting.enabled
    ? `### Suggested Reviewers (CODEOWNERS)\n- Users: ${reviewerRouting.users.length ? reviewerRouting.users.map((u) => `@${u}`).join(", ") : "None"}\n- Teams: ${reviewerRouting.teams.length ? reviewerRouting.teams.map((t) => `@${t}`).join(", ") : "None"}`
    : "### Suggested Reviewers (CODEOWNERS)\n- Reviewer routing disabled by config.";

  return `${MARKER}
## ReviewOS Copilot Report

**PR:** #${pr.number} - ${pr.title}
**Loop iterations:** ${result.iteration}

### Merge Readiness: **${result.mergeReadiness}/100**

| Lens | Score |
|---|---:|
| Engineering | ${result.scores.engineering} |
| Product | ${result.scores.product} |
| Design | ${result.scores.design} |
| Security | ${result.scores.security} |

${reviewersSection}

### Findings

**Critical**
${fmt(result.grouped.critical, "🚨")}

**Warnings**
${fmt(result.grouped.warning, "⚠️")}

**Info**
${fmt(result.grouped.info, "ℹ️")}

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

async function requestReviewers(owner, repo, pullNumber, token, reviewerRouting) {
  if (reviewerRouting.users.length === 0 && reviewerRouting.teams.length === 0) return null;

  return ghRequest(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`, token, {
    method: "POST",
    body: JSON.stringify({
      reviewers: reviewerRouting.users,
      team_reviewers: reviewerRouting.teams,
    }),
  });
}

function readMock(pathVar) {
  if (!process.env[pathVar]) return null;
  return JSON.parse(fs.readFileSync(process.env[pathVar], "utf8"));
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repoSlug = process.env.GITHUB_REPOSITORY || "local/review-os";
  const token = process.env.GITHUB_TOKEN;
  const config = loadConfig();

  const failOnCriticalEnv = process.env.FAIL_ON_CRITICAL;
  const failOnCritical = failOnCriticalEnv ? failOnCriticalEnv.toLowerCase() === "true" : Boolean(config.fail_on_critical);

  const mockPr = readMock("MOCK_PR_PATH");
  const mockFiles = readMock("MOCK_FILES_PATH");

  let pr;
  let files;

  if (mockPr && mockFiles) {
    pr = mockPr;
    files = mockFiles;
  } else {
    if (!token) throw new Error("Missing GITHUB_TOKEN");
    if (!eventPath) throw new Error("Missing GITHUB_EVENT_PATH");

    const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    const pull = event.pull_request;
    if (!pull) {
      console.log("No pull_request payload. Exiting.");
      return;
    }

    const [owner, repo] = repoSlug.split("/");
    pr = await ghRequest(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull.number}`, token);
    files = await getAllFiles(owner, repo, pull.number, token);
  }

  const result = runAgentLoop({ pr, files, config, repoSlug });
  const nextSteps = buildNextSteps(result, config);

  const codeownerRules = loadCodeowners();
  const reviewerRouting = {
    enabled: Boolean(config.reviewer_routing?.enabled),
    autoRequest: Boolean(config.reviewer_routing?.auto_request),
    ...resolveReviewers(files, pr.user?.login || "", codeownerRules, Number(config.reviewer_routing?.max_reviewers) || 3),
  };

  const comment = buildComment({ pr, result, nextSteps, reviewerRouting });

  const historyEntry = {
    timestamp: new Date().toISOString(),
    pr: pr.number,
    mergeReadiness: result.mergeReadiness,
    scores: result.scores,
    findings: result.findings,
  };
  const historyFilePath = saveHistory(repoSlug, pr.number, historyEntry);

  if (process.env.DRY_RUN_COMMENT === "1" || mockPr) {
    console.log(comment);
    console.log(`History updated: ${historyFilePath}`);
    console.log(`Suggested users: ${reviewerRouting.users.join(",") || "none"}`);
    console.log(`Suggested teams: ${reviewerRouting.teams.join(",") || "none"}`);
  } else {
    const [owner, repo] = repoSlug.split("/");
    const upsert = await upsertComment(owner, repo, pr.number, token, comment);
    console.log(`Review comment ${upsert.mode}: ${upsert.id}`);

    if (reviewerRouting.enabled && reviewerRouting.autoRequest) {
      await requestReviewers(owner, repo, pr.number, token, reviewerRouting);
      console.log("Requested reviewers via GitHub API.");
    }

    console.log(`History updated: ${historyFilePath}`);
  }

  if (failOnCritical && result.grouped.critical.length > 0) {
    console.error(`Critical findings present (${result.grouped.critical.length}). Failing job.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
