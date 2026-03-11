import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MARKER = "<!-- review-os:pr-review -->";
const HISTORY_DIR = ".reviewos/history";
const REPORT_PATH = ".reviewos/last-report.json";

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
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (!Number.isNaN(Number(trimmed)) && trimmed !== "") return Number(trimmed);
  return trimmed;
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function deepMerge(base, ext) {
  if (Array.isArray(base) || Array.isArray(ext)) return ext ?? base;
  if (!base || typeof base !== "object") return ext;
  if (!ext || typeof ext !== "object") return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(ext)) {
    if (value && typeof value === "object" && !Array.isArray(value) && out[key] && typeof out[key] === "object" && !Array.isArray(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

const POLICY_PRESETS = {
  startup: {
    max_iterations: 2,
    fail_on_critical: false,
    thresholds: {
      engineering_warning: 65,
      product_warning: 65,
      design_warning: 70,
      security_warning: 70,
    },
  },
  fintech: {
    max_iterations: 4,
    fail_on_critical: true,
    thresholds: {
      engineering_warning: 75,
      product_warning: 75,
      design_warning: 78,
      security_warning: 85,
    },
    path_overrides: {
      payments:
        {
          pattern: "src/payments/*",
          engineering_penalty: 8,
          security_penalty: 12,
          require_tests: true,
          missing_tests_security_penalty: 30,
          require_tests_message: "Payments changes must include tests.",
        },
    },
  },
  enterprise: {
    max_iterations: 4,
    fail_on_critical: true,
    thresholds: {
      engineering_warning: 72,
      product_warning: 72,
      design_warning: 76,
      security_warning: 82,
    },
    reviewer_routing: {
      enabled: true,
      auto_request: true,
      max_reviewers: 4,
    },
  },
};

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
    alerts: {
      enabled: false,
      slack_webhook_env: "SLACK_WEBHOOK_URL",
      discord_webhook_env: "DISCORD_WEBHOOK_URL",
      dedupe_window_minutes: 60,
      dedupe_state_file: ".reviewos/alerts-state.json",
      routes: {},
    },
    policy_preset: "",
    governance: {
      policy_lock: false,
      expected_sha256: "",
      signature: "",
      signature_secret_env: "REVIEW_OS_SIGNATURE_SECRET",
    },
    path_overrides: {},
  };

  if (!fs.existsSync(configPath)) return defaults;

  const data = fs.readFileSync(configPath, "utf8").split(/\r?\n/);
  const parsed = {
    ...defaults,
    weights: { ...defaults.weights },
    thresholds: { ...defaults.thresholds },
    reviewer_routing: { ...defaults.reviewer_routing },
    alerts: { ...defaults.alerts },
    path_overrides: { ...defaults.path_overrides },
  };

  let section = null;
  let subsection = null;
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
        subsection = null;
      } else {
        parsed[key] = parseScalar(value);
        section = null;
        subsection = null;
      }
      continue;
    }

    if (line.startsWith("    ")) {
      if (!section || !subsection) continue;
      const child = line.trim();
      const idx = child.indexOf(":");
      if (idx === -1) continue;
      const key = child.slice(0, idx).trim();
      const value = parseScalar(child.slice(idx + 1).trim());
      if (typeof parsed[section] !== "object" || parsed[section] === null) parsed[section] = {};
      if (typeof parsed[section][subsection] !== "object" || parsed[section][subsection] === null) parsed[section][subsection] = {};
      parsed[section][subsection][key] = value;
      continue;
    }

    if (!section) continue;
    const child = line.trim();
    const idx = child.indexOf(":");
    if (idx === -1) continue;
    const key = child.slice(0, idx).trim();
    const rawValue = child.slice(idx + 1).trim();
    if (typeof parsed[section] !== "object" || parsed[section] === null) parsed[section] = {};
    if (rawValue === "") {
      subsection = key;
      if (typeof parsed[section][subsection] !== "object" || parsed[section][subsection] === null) parsed[section][subsection] = {};
    } else {
      parsed[section][key] = parseScalar(rawValue);
      subsection = null;
    }
  }

  const presetName = String(process.env.REVIEW_OS_POLICY_PRESET || parsed.policy_preset || "").trim().toLowerCase();
  if (presetName && POLICY_PRESETS[presetName]) {
    return deepMerge(parsed, POLICY_PRESETS[presetName]);
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

function hashConfigFile(configPath) {
  const content = fs.readFileSync(configPath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function verifyConfigGovernance(configPath, config) {
  const governance = config.governance || {};
  const policyLockEnabled = governance.policy_lock || String(process.env.REVIEW_OS_POLICY_LOCK || "").toLowerCase() === "true";
  if (!policyLockEnabled && !governance.signature && !process.env.REVIEW_OS_CONFIG_SIGNATURE) return;

  if (!fs.existsSync(configPath)) throw new Error(`Config file not found for governance check: ${configPath}`);
  const actualHash = hashConfigFile(configPath);

  if (policyLockEnabled) {
    const configuredHash = typeof governance.expected_sha256 === "string" ? governance.expected_sha256 : "";
    const expectedHash = String(process.env.REVIEW_OS_POLICY_SHA256 || configuredHash || "").trim().toLowerCase();
    if (!expectedHash) throw new Error("Policy lock enabled but expected hash is missing (REVIEW_OS_POLICY_SHA256 or governance.expected_sha256).");
    if (actualHash !== expectedHash) {
      throw new Error(`Policy lock failed: config hash mismatch. expected=${expectedHash} actual=${actualHash}`);
    }
  }

  const configuredSig = typeof governance.signature === "string" ? governance.signature : "";
  const signature = String(process.env.REVIEW_OS_CONFIG_SIGNATURE || configuredSig || "").trim().toLowerCase();
  if (!signature) return;
  const secretEnv = String(governance.signature_secret_env || "REVIEW_OS_SIGNATURE_SECRET");
  const secret = process.env[secretEnv];
  if (!secret) throw new Error(`Config signature present but secret is missing in env '${secretEnv}'.`);
  const content = fs.readFileSync(configPath);
  const expectedSig = crypto.createHmac("sha256", secret).update(content).digest("hex");
  if (expectedSig !== signature) throw new Error("Config signature verification failed.");
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
    const override = applyPathOverrides({ files, config, hasTests: eng.hasTests });
    const scores = {
      engineering: clamp(eng.score - override.adjustments.engineering),
      product: clamp(product.score - override.adjustments.product),
      design: clamp(design.score - override.adjustments.design),
      security: clamp(security.score - override.adjustments.security),
    };

    let findings = dedupeFindings([
      ...eng.findings,
      ...product.findings,
      ...design.findings,
      ...security.findings,
      ...override.findings,
    ]);
    findings = addRecurringSignals(findings, history);

    const grouped = summarizeFindings(findings);

    const mergeReadiness = Math.round(
      scores.engineering * Number(config.weights.engineering) +
        scores.product * Number(config.weights.product) +
        scores.design * Number(config.weights.design) +
        scores.security * Number(config.weights.security)
    );

    const signature = JSON.stringify({
      findings: findings.map((f) => `${f.severity}|${f.lens}|${f.message}`).sort(),
      scores: [scores.engineering, scores.product, scores.design, scores.security],
    });

    final = {
      iteration: i,
      scores,
      grouped,
      findings,
      mergeReadiness,
      history,
      requiredReviewers: override.required,
      matchedPathRules: override.matchedRules,
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
  let rx = "";
  for (let i = 0; i < p.length; i += 1) {
    const ch = p[i];
    if (ch === "*") {
      if (p[i + 1] === "*") {
        rx += ".*";
        i += 1;
      } else {
        rx += "[^/]*";
      }
    } else {
      rx += escapeRegex(ch);
    }
  }

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

function applyPathOverrides({ files, config, hasTests }) {
  const adjustments = { engineering: 0, product: 0, design: 0, security: 0 };
  const findings = [];
  const required = { users: new Set(), teams: new Set() };
  const matchedRules = [];
  const rules = Object.entries(config.path_overrides || {});

  for (const [name, rule] of rules) {
    if (!rule || typeof rule !== "object" || !rule.pattern) continue;
    const regex = patternToRegex(String(rule.pattern));
    const matched = files.filter((f) => regex.test(f.filename));
    if (matched.length === 0) continue;
    matchedRules.push({ name, count: matched.length });

    const matchedCount = matched.length;
    const engPenalty = Number(rule.engineering_penalty || 0);
    const productPenalty = Number(rule.product_penalty || 0);
    const designPenalty = Number(rule.design_penalty || 0);
    const securityPenalty = Number(rule.security_penalty || 0);

    adjustments.engineering += engPenalty;
    adjustments.product += productPenalty;
    adjustments.design += designPenalty;
    adjustments.security += securityPenalty;

    if (engPenalty || productPenalty || designPenalty || securityPenalty) {
      findings.push({
        severity: "warning",
        lens: "PathPolicy",
        message: `Rule '${name}' matched ${matchedCount} file(s); penalties applied (eng:${engPenalty}, product:${productPenalty}, design:${designPenalty}, sec:${securityPenalty}).`,
      });
    }

    const requireTests = Boolean(rule.require_tests);
    if (requireTests && !hasTests) {
      const missingPenalty = Number(rule.missing_tests_security_penalty || 20);
      adjustments.security += missingPenalty;
      findings.push({
        severity: "critical",
        lens: "PathPolicy",
        message: rule.require_tests_message
          ? `Rule '${name}': ${rule.require_tests_message}`
          : `Rule '${name}' requires test updates for matched files.`,
      });
    }

    const requiredUsers = String(rule.required_users || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const requiredTeams = String(rule.required_teams || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const u of requiredUsers) required.users.add(u.replace(/^@/, ""));
    for (const t of requiredTeams) required.teams.add(t.replace(/^@/, ""));
  }

  return { adjustments, findings, required: { users: [...required.users], teams: [...required.teams] }, matchedRules };
}

function collectCurrentReviewers(pr) {
  const users = new Set();
  const teams = new Set();

  for (const u of pr.requested_reviewers || []) {
    if (u?.login) users.add(u.login);
  }
  for (const t of pr.requested_teams || []) {
    if (t?.slug && pr.base?.repo?.owner?.login) {
      teams.add(`${pr.base.repo.owner.login}/${t.slug}`);
    } else if (t?.slug) {
      teams.add(t.slug);
    }
  }

  return { users, teams };
}

function computeMissingRequired(required, current, prAuthor = "") {
  const missingUsers = required.users.filter((u) => u !== prAuthor && !current.users.has(u));
  const missingTeams = required.teams.filter((t) => {
    if (current.teams.has(t)) return false;
    const short = t.includes("/") ? t.split("/").at(-1) : t;
    return !current.teams.has(short);
  });
  return { users: missingUsers, teams: missingTeams };
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

function buildComment({ pr, result, nextSteps, reviewerRouting, requiredCoverage }) {
  const fmt = (items, icon) => (items.length ? items.map((f) => `- ${icon} **${f.lens}**: ${f.message}`).join("\n") : "- None");

  const reviewersSection = reviewerRouting.enabled
    ? `### Suggested Reviewers (CODEOWNERS)\n- Users: ${reviewerRouting.users.length ? reviewerRouting.users.map((u) => `@${u}`).join(", ") : "None"}\n- Teams: ${reviewerRouting.teams.length ? reviewerRouting.teams.map((t) => `@${t}`).join(", ") : "None"}`
    : "### Suggested Reviewers (CODEOWNERS)\n- Reviewer routing disabled by config.";

  const requiredSection = requiredCoverage
    ? `### Required Reviewer Coverage (Path Policies)\n- Required users: ${requiredCoverage.required.users.length ? requiredCoverage.required.users.map((u) => `@${u}`).join(", ") : "None"}\n- Required teams: ${requiredCoverage.required.teams.length ? requiredCoverage.required.teams.map((t) => `@${t}`).join(", ") : "None"}\n- Missing users: ${requiredCoverage.missing.users.length ? requiredCoverage.missing.users.map((u) => `@${u}`).join(", ") : "None"}\n- Missing teams: ${requiredCoverage.missing.teams.length ? requiredCoverage.missing.teams.map((t) => `@${t}`).join(", ") : "None"}`
    : "";

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

${requiredSection}

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

async function sendCriticalAlerts({ config, repoSlug, pr, result }) {
  if (!config.alerts?.enabled) return { sent: [] };
  if (!result.grouped?.critical?.length) return { sent: [] };

  const title = `review-os critical findings in ${repoSlug}#${pr.number}`;
  const summaryLines = result.grouped.critical.map((f) => `- ${f.lens}: ${f.message}`).join("\n");
  const prUrl = pr.html_url || `https://github.com/${repoSlug}/pull/${pr.number}`;
  const sent = [];
  const statePath = String(config.alerts.dedupe_state_file || ".reviewos/alerts-state.json");
  const dedupeWindowMs = Math.max(0, Number(config.alerts.dedupe_window_minutes || 60)) * 60 * 1000;
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8") || "{}") : {};
  const criticalSignature = crypto.createHash("sha1").update(summaryLines).digest("hex").slice(0, 12);

  function shouldSend(channel, route = "default") {
    const now = Date.now();
    const key = `${channel}|${route}|${repoSlug}|pr-${pr.number}|${criticalSignature}`;
    const lastTs = Number(state[key] || 0);
    if (dedupeWindowMs > 0 && now - lastTs < dedupeWindowMs) return false;
    state[key] = now;
    return true;
  }

  function matchedChannels() {
    const routes = config.alerts?.routes || {};
    const out = new Set();
    const critical = result.grouped.critical || [];
    for (const [routeName, route] of Object.entries(routes)) {
      const routeSeverity = String(route.severity || "critical").toLowerCase();
      const routeLenses = splitList(route.lens_contains).map((s) => s.toLowerCase());
      const routeMessage = String(route.message_contains || "").toLowerCase();
      const routeChannels = splitList(route.channels).map((s) => s.toLowerCase());
      const hit = critical.some((f) => {
        const sevOk = !routeSeverity || String(f.severity || "").toLowerCase() === routeSeverity;
        const lensOk = routeLenses.length === 0 || routeLenses.some((x) => String(f.lens || "").toLowerCase().includes(x));
        const msgOk = !routeMessage || String(f.message || "").toLowerCase().includes(routeMessage);
        return sevOk && lensOk && msgOk;
      });
      if (hit) {
        for (const c of routeChannels) out.add(`${c}:${routeName}`);
      }
    }

    if (out.size === 0) {
      if (process.env[String(config.alerts.slack_webhook_env || "SLACK_WEBHOOK_URL")]) out.add("slack:default");
      if (process.env[String(config.alerts.discord_webhook_env || "DISCORD_WEBHOOK_URL")]) out.add("discord:default");
    }
    return [...out];
  }

  const channels = matchedChannels();

  const slackEnv = String(config.alerts.slack_webhook_env || "SLACK_WEBHOOK_URL");
  const slackUrl = process.env[slackEnv];
  if (slackUrl && channels.some((c) => c.startsWith("slack:"))) {
    const route = (channels.find((c) => c.startsWith("slack:")) || "slack:default").split(":")[1];
    if (shouldSend("slack", route)) {
    await fetch(slackUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: `${title}\nMerge readiness: ${result.mergeReadiness}/100\n${prUrl}\n${summaryLines}`,
      }),
    });
    sent.push("slack");
    }
  }

  const discordEnv = String(config.alerts.discord_webhook_env || "DISCORD_WEBHOOK_URL");
  const discordUrl = process.env[discordEnv];
  if (discordUrl && channels.some((c) => c.startsWith("discord:"))) {
    const route = (channels.find((c) => c.startsWith("discord:")) || "discord:default").split(":")[1];
    if (shouldSend("discord", route)) {
    await fetch(discordUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: `**${title}**\\nMerge readiness: ${result.mergeReadiness}/100\\n${prUrl}\\n${summaryLines}`,
      }),
    });
    sent.push("discord");
    }
  }

  ensureDir(path.dirname(statePath));
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  return { sent };
}

function writeStepSummary({ pr, result, nextSteps, reviewerRouting, requiredCoverage, matchedRules }) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const lines = [
    "## ReviewOS Summary",
    "",
    `- PR: #${pr.number} ${pr.title}`,
    `- Merge readiness: **${result.mergeReadiness}/100**`,
    `- Loop iterations: ${result.iteration}`,
    "",
    "| Lens | Score |",
    "|---|---:|",
    `| Engineering | ${result.scores.engineering} |`,
    `| Product | ${result.scores.product} |`,
    `| Design | ${result.scores.design} |`,
    `| Security | ${result.scores.security} |`,
    "",
    `- Critical findings: ${result.grouped.critical.length}`,
    `- Warning findings: ${result.grouped.warning.length}`,
    `- Info findings: ${result.grouped.info.length}`,
    `- Suggested reviewers (users): ${reviewerRouting.users.join(", ") || "none"}`,
    `- Suggested reviewers (teams): ${reviewerRouting.teams.join(", ") || "none"}`,
    `- Missing required users: ${requiredCoverage.missing.users.join(", ") || "none"}`,
    `- Missing required teams: ${requiredCoverage.missing.teams.join(", ") || "none"}`,
    `- Matched path rules: ${matchedRules.map((r) => `${r.name}(${r.count})`).join(", ") || "none"}`,
    "",
    "### Next Steps",
    ...nextSteps.map((s) => `- ${s}`),
    "",
  ];

  fs.appendFileSync(summaryPath, `${lines.join("\n")}\n`);
}

function readMock(pathVar) {
  if (!process.env[pathVar]) return null;
  return JSON.parse(fs.readFileSync(process.env[pathVar], "utf8"));
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repoSlug = process.env.GITHUB_REPOSITORY || "local/review-os";
  const token = process.env.GITHUB_TOKEN;
  const configPath = process.env.REVIEW_OS_CONFIG || ".reviewos.yml";
  const config = loadConfig(configPath);
  if (fs.existsSync(configPath)) verifyConfigGovernance(configPath, config);

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
  const prAuthor = pr.user?.login || "";
  const reviewerRouting = {
    enabled: Boolean(config.reviewer_routing?.enabled),
    autoRequest: Boolean(config.reviewer_routing?.auto_request),
    ...resolveReviewers(files, prAuthor, codeownerRules, Number(config.reviewer_routing?.max_reviewers) || 3),
  };

  const required = result.requiredReviewers || { users: [], teams: [] };
  let currentCoverage = collectCurrentReviewers(pr);
  let requestedViaRequired = false;

  let missingRequired = computeMissingRequired(required, currentCoverage, prAuthor);
  const shouldRequest = reviewerRouting.enabled && reviewerRouting.autoRequest && !mockPr;
  if (shouldRequest && (missingRequired.users.length || missingRequired.teams.length)) {
    const requestPayload = {
      users: [...new Set([...reviewerRouting.users, ...missingRequired.users])].filter((u) => u && u !== prAuthor),
      teams: [...new Set([...reviewerRouting.teams, ...missingRequired.teams])],
    };
    if (requestPayload.users.length || requestPayload.teams.length) {
      const [owner, repo] = repoSlug.split("/");
      await requestReviewers(owner, repo, pr.number, token, requestPayload);
      requestedViaRequired = true;
      currentCoverage = {
        users: new Set([...currentCoverage.users, ...requestPayload.users]),
        teams: new Set([...currentCoverage.teams, ...requestPayload.teams]),
      };
    }
    missingRequired = computeMissingRequired(required, currentCoverage, prAuthor);
  }

  if (missingRequired.users.length || missingRequired.teams.length) {
    result.findings = [
      ...result.findings,
      {
        severity: "critical",
        lens: "ReviewerPolicy",
        message: `Missing required reviewer coverage. Users: ${missingRequired.users.join(",") || "none"}; Teams: ${missingRequired.teams.join(",") || "none"}.`,
      },
    ];
    result.grouped = summarizeFindings(result.findings);
    result.scores.security = clamp(result.scores.security - 10);
    result.mergeReadiness = Math.round(
      result.scores.engineering * Number(config.weights.engineering) +
        result.scores.product * Number(config.weights.product) +
        result.scores.design * Number(config.weights.design) +
        result.scores.security * Number(config.weights.security)
    );
    nextSteps.unshift("Add missing required reviewers from path policy rules.");
  }

  const requiredCoverage = {
    required,
    missing: missingRequired,
  };

  const comment = buildComment({ pr, result, nextSteps, reviewerRouting, requiredCoverage });
  const autoRequestAttempted = reviewerRouting.enabled && reviewerRouting.autoRequest;

  const historyEntry = {
    timestamp: new Date().toISOString(),
    pr: pr.number,
    mergeReadiness: result.mergeReadiness,
    scores: result.scores,
    findings: result.findings,
    requiredCoverage,
    reviewerRouting: {
      suggestedUsers: reviewerRouting.users,
      suggestedTeams: reviewerRouting.teams,
      autoRequestAttempted,
      requestedViaRequired,
    },
    pathPolicy: {
      matchedRules: result.matchedPathRules || [],
    },
  };

  ensureDir(path.dirname(REPORT_PATH));
  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        repository: repoSlug,
        pr: { number: pr.number, title: pr.title, url: pr.html_url || "" },
        mergeReadiness: result.mergeReadiness,
        scores: result.scores,
        grouped: result.grouped,
        nextSteps,
        reviewerRouting: {
          enabled: reviewerRouting.enabled,
          users: reviewerRouting.users,
          teams: reviewerRouting.teams,
          autoRequest: reviewerRouting.autoRequest,
          requestedViaRequired,
        },
        requiredCoverage,
        matchedPathRules: result.matchedPathRules || [],
      },
      null,
      2
    )
  );
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

    if (
      reviewerRouting.enabled &&
      reviewerRouting.autoRequest &&
      !requestedViaRequired &&
      (reviewerRouting.users.length || reviewerRouting.teams.length)
    ) {
      await requestReviewers(owner, repo, pr.number, token, reviewerRouting);
      console.log("Requested reviewers via GitHub API.");
    }

    console.log(`History updated: ${historyFilePath}`);

    const alertResult = await sendCriticalAlerts({ config, repoSlug, pr, result });
    if (alertResult.sent.length) {
      console.log(`Alerts sent: ${alertResult.sent.join(",")}`);
    }
  }

  writeStepSummary({
    pr,
    result,
    nextSteps,
    reviewerRouting,
    requiredCoverage,
    matchedRules: result.matchedPathRules || [],
  });

  if (failOnCritical && result.grouped.critical.length > 0) {
    console.error(`Critical findings present (${result.grouped.critical.length}). Failing job.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
