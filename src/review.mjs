import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MARKER = "<!-- review-os:pr-review -->";
const SLA_MARKER = "<!-- review-os:sla-reminder -->";
const HISTORY_DIR = ".reviewos/history";
const REPORT_PATH = ".reviewos/last-report.json";
const TRACE_DIR = ".reviewos/traces";

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
      risk_based: true,
    },
    labels: {
      enabled: false,
      critical_label: "reviewos:critical",
      security_label: "reviewos:security",
      ready_label: "reviewos:ready",
    },
    fix_suggestions: {
      enabled: true,
      max_items: 3,
    },
    reviewer_sla: {
      enabled: false,
      threshold_hours: 24,
      cooldown_hours: 12,
    },
    incident_safe: {
      enabled: false,
      security_penalty_multiplier: 1.4,
      require_tests_on_sensitive: true,
      min_approvals: 1,
    },
    finding_ownership: {
      default_owner: "unassigned",
      rules: {},
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
    prompt_trace: {
      enabled: true,
      output_dir: TRACE_DIR,
    },
    release_gate: {
      enabled: true,
      title_regex: "^release[:\\s]|^chore\\(release\\):",
      base_branch_regex: "^main$|^release\\/.*$",
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
    labels: { ...defaults.labels },
    fix_suggestions: { ...defaults.fix_suggestions },
    reviewer_sla: { ...defaults.reviewer_sla },
    incident_safe: { ...defaults.incident_safe },
    alerts: { ...defaults.alerts },
    prompt_trace: { ...defaults.prompt_trace },
    release_gate: { ...defaults.release_gate },
    finding_ownership: { ...defaults.finding_ownership },
    path_overrides: { ...defaults.path_overrides },
  };

  let section = null;
  let subsection = null;
  let subsubsection = null;
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
        subsubsection = null;
      } else {
        parsed[key] = parseScalar(value);
        section = null;
        subsection = null;
        subsubsection = null;
      }
      continue;
    }

    if (line.startsWith("      ")) {
      if (!section || !subsection || !subsubsection) continue;
      const child = line.trim();
      const idx = child.indexOf(":");
      if (idx === -1) continue;
      const key = child.slice(0, idx).trim();
      const value = parseScalar(child.slice(idx + 1).trim());
      if (typeof parsed[section] !== "object" || parsed[section] === null) parsed[section] = {};
      if (typeof parsed[section][subsection] !== "object" || parsed[section][subsection] === null) parsed[section][subsection] = {};
      if (
        typeof parsed[section][subsection][subsubsection] !== "object" ||
        parsed[section][subsection][subsubsection] === null
      ) {
        parsed[section][subsection][subsubsection] = {};
      }
      parsed[section][subsection][subsubsection][key] = value;
      continue;
    }

    if (line.startsWith("    ")) {
      if (!section || !subsection) continue;
      const child = line.trim();
      const idx = child.indexOf(":");
      if (idx === -1) continue;
      const key = child.slice(0, idx).trim();
      const rawValue = child.slice(idx + 1).trim();
      if (typeof parsed[section] !== "object" || parsed[section] === null) parsed[section] = {};
      if (typeof parsed[section][subsection] !== "object" || parsed[section][subsection] === null) parsed[section][subsection] = {};
      if (rawValue === "") {
        subsubsection = key;
        if (
          typeof parsed[section][subsection][subsubsection] !== "object" ||
          parsed[section][subsection][subsubsection] === null
        ) {
          parsed[section][subsection][subsubsection] = {};
        }
      } else {
        parsed[section][subsection][key] = parseScalar(rawValue);
        subsubsection = null;
      }
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
      subsubsection = null;
      if (typeof parsed[section][subsection] !== "object" || parsed[section][subsection] === null) parsed[section][subsection] = {};
    } else {
      parsed[section][key] = parseScalar(rawValue);
      subsection = null;
      subsubsection = null;
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
  const trace = [];
  const hasProblem = containsAny(body, ["problem", "pain", "why", "context"]);
  const hasImpact = containsAny(body, ["user impact", "customer", "who is affected", "persona"]);
  const hasAcceptance = containsAny(body, ["acceptance criteria", "definition of done", "success metric", "done when"]);
  trace.push({ check: "problem_context", pass: hasProblem, detail: "PR includes problem/context statement." });
  trace.push({ check: "user_impact", pass: hasImpact, detail: "PR includes user/business impact." });
  trace.push({ check: "acceptance_criteria", pass: hasAcceptance, detail: "PR includes acceptance criteria or success metric." });

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

  return { score: clamp(score), findings, trace };
}

function scoreDesign(body, files) {
  let score = 100;
  const findings = [];
  const trace = [];
  const frontendTouched = files.some(
    (f) => /(^|\/)(src|app|web|frontend|ui|components|pages)\//i.test(f.filename) || /\.(tsx|jsx|css|scss|vue)$/.test(f.filename)
  );

  if (frontendTouched) {
    const hasEvidence = containsAny(body, ["screenshot", "recording", "figma", "ux", "ui", ".png", ".jpg", ".gif"]);
    trace.push({ check: "frontend_ui_evidence", pass: hasEvidence, detail: "Frontend changes include screenshot/UX evidence." });
    if (!hasEvidence) {
      score -= 30;
      findings.push({ severity: "warning", lens: "Design", message: "Frontend changes detected without UI evidence (screenshots/UX notes)." });
    }
  }

  return { score: clamp(score), findings, trace };
}

function scoreEngineering(files, additions, deletions) {
  let score = 100;
  const findings = [];
  const trace = [];
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
  trace.push({ check: "pr_size", pass: changed <= 30, detail: `Files changed: ${changed}` });
  trace.push({ check: "diff_volume", pass: delta <= 1200, detail: `Line delta: ${delta}` });
  trace.push({ check: "risk_sensitive_files", pass: risky.length === 0, detail: `Risk-sensitive files: ${risky.length}` });

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
  trace.push({ check: "test_updates_present", pass: hasTests, detail: "PR includes test changes." });

  return { score: clamp(score), findings, hasTests, riskyCount: risky.length, trace };
}

function scoreSecurity(files, engineering) {
  let score = 100;
  const findings = [];
  const trace = [];

  const sensitive = files.filter((f) => /auth|oauth|jwt|session|permission|secret|token|payment|billing|infra|k8s|terraform|workflow/i.test(f.filename));
  trace.push({ check: "sensitive_domain_changes", pass: sensitive.length === 0, detail: `Sensitive files touched: ${sensitive.length}` });
  trace.push({ check: "tests_with_sensitive_changes", pass: sensitive.length === 0 || engineering.hasTests, detail: `Tests present: ${engineering.hasTests}` });

  if (sensitive.length > 0) {
    score -= Math.min(35, sensitive.length * 6);
    findings.push({ severity: "warning", lens: "Security", message: `Sensitive domain changes detected (${sensitive.length} file(s)).` });
  }

  if (sensitive.length > 0 && !engineering.hasTests) {
    score -= 20;
    findings.push({ severity: "critical", lens: "Security", message: "Sensitive changes detected without test updates." });
  }

  return { score: clamp(score), findings, trace };
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

function computeFindingDelta(history, findings) {
  if (!history.length) return { added: findings, resolved: [] };
  const prev = history.at(-1);
  const prevFindings = Array.isArray(prev?.findings) ? prev.findings : [];
  const prevSet = new Set(prevFindings.map((f) => `${f.severity}|${f.lens}|${f.message}`));
  const nextSet = new Set(findings.map((f) => `${f.severity}|${f.lens}|${f.message}`));
  const added = findings.filter((f) => !prevSet.has(`${f.severity}|${f.lens}|${f.message}`));
  const resolved = prevFindings.filter((f) => !nextSet.has(`${f.severity}|${f.lens}|${f.message}`));
  return { added, resolved };
}

function detectReadinessAnomaly(history, currentReadiness) {
  const prev = history
    .map((h) => Number(h.mergeReadiness || 0))
    .filter((x) => Number.isFinite(x))
    .slice(-5);
  if (prev.length < 3) return null;
  const baseline = prev.reduce((a, b) => a + b, 0) / prev.length;
  const drop = baseline - Number(currentReadiness || 0);
  if (drop < 20) return null;
  return {
    severity: "warning",
    lens: "Trend",
    message: `Merge readiness anomaly detected: current ${currentReadiness} is ${drop.toFixed(1)} below recent baseline ${baseline.toFixed(1)}.`,
  };
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
    const baseScores = {
      engineering: clamp(eng.score - override.adjustments.engineering),
      product: clamp(product.score - override.adjustments.product),
      design: clamp(design.score - override.adjustments.design),
      security: clamp(security.score - override.adjustments.security),
    };
    const incidentAdjust = applyIncidentMode({
      config,
      securityScore: baseScores.security,
      securitySensitiveCount: security.sensitiveCount || 0,
      hasTests: eng.hasTests,
    });
    const scores = {
      ...baseScores,
      security: incidentAdjust.securityScore,
    };

    let findings = dedupeFindings([
      ...eng.findings,
      ...product.findings,
      ...design.findings,
      ...security.findings,
      ...override.findings,
      ...incidentAdjust.findings,
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

    const anomaly = detectReadinessAnomaly(history, mergeReadiness);
    if (anomaly) {
      findings = dedupeFindings([...findings, anomaly]);
    }
    const delta = computeFindingDelta(history, findings);
    const groupedWithSignals = summarizeFindings(findings);

    final = {
      iteration: i,
      scores,
      grouped: groupedWithSignals,
      findings,
      mergeReadiness,
      history,
      requiredReviewers: override.required,
      matchedPathRules: override.matchedRules,
      delta,
      traces: {
        engineering: eng.trace || [],
        product: product.trace || [],
        design: design.trace || [],
        security: security.trace || [],
        pathPolicy: (override.matchedRules || []).map((r) => ({ check: "matched_path_rule", pass: false, detail: `${r.name} (${r.count})` })),
      },
    };

    if (signature === previousSignature) break;
    previousSignature = signature;

    if (groupedWithSignals.critical.length === 0 && mergeReadiness >= 90) break;
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

function resolveReviewers(files, prAuthor, codeownerRules, options = {}) {
  const maxReviewers = Number(options.maxReviewers || 3);
  const riskBased = Boolean(options.riskBased);
  if (codeownerRules.length === 0) return { users: [], teams: [] };

  const users = new Map();
  const teams = new Map();
  const riskyFilePattern = /auth|oauth|jwt|session|permission|payment|billing|invoice|secret|token|workflow|k8s|terraform|helm/i;
  let riskFileCount = 0;

  for (const file of files) {
    let matchedOwners = [];
    for (const rule of codeownerRules) {
      const regex = patternToRegex(rule.pattern);
      if (regex.test(file.filename)) matchedOwners = rule.owners;
    }
    const ownerWeight = riskyFilePattern.test(file.filename) ? 2 : 1;
    if (ownerWeight > 1) riskFileCount += 1;

    for (const owner of matchedOwners) {
      if (!owner.startsWith("@")) continue;
      const normalized = owner.slice(1);
      if (!normalized) continue;
      if (normalized.includes("/")) {
        teams.set(normalized, (teams.get(normalized) || 0) + ownerWeight);
      } else if (normalized !== prAuthor) {
        users.set(normalized, (users.get(normalized) || 0) + ownerWeight);
      }
    }
  }

  const cap = riskBased && riskFileCount > 0 ? Math.max(1, maxReviewers + 1) : Math.max(1, maxReviewers);
  const sortedUsers = [...users.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name)
    .slice(0, cap);
  const sortedTeams = [...teams.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name)
    .slice(0, cap);
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

function applyIncidentMode({ config, securityScore, securitySensitiveCount, hasTests }) {
  if (!config.incident_safe?.enabled) {
    return { securityScore, findings: [] };
  }

  const findings = [];
  const multiplier = Math.max(1, Number(config.incident_safe?.security_penalty_multiplier || 1.4));
  const penaltyBase = 100 - securityScore;
  const extraPenalty = Math.round(penaltyBase * (multiplier - 1));
  let nextScore = clamp(securityScore - extraPenalty);

  findings.push({
    severity: "warning",
    lens: "IncidentMode",
    message: `Incident-safe mode enabled. Security penalties multiplied by ${multiplier.toFixed(2)}x.`,
  });

  if (securitySensitiveCount > 0 && config.incident_safe?.require_tests_on_sensitive && !hasTests) {
    nextScore = clamp(nextScore - 10);
    findings.push({
      severity: "critical",
      lens: "IncidentMode",
      message: "Sensitive changes during incident mode require test updates.",
    });
  }

  return { securityScore: nextScore, findings };
}

function resolveFindingOwner(finding, files, config) {
  const ownership = config.finding_ownership || {};
  const rules = ownership.rules || {};
  const fileNames = files.map((f) => String(f.filename || "").toLowerCase());

  for (const [, rule] of Object.entries(rules)) {
    if (!rule || typeof rule !== "object") continue;
    const owner = String(rule.owner || "").trim();
    if (!owner) continue;

    const lensContains = splitList(rule.lens_contains).map((s) => s.toLowerCase());
    const messageContains = String(rule.message_contains || "").toLowerCase();
    const pathContains = splitList(rule.path_contains).map((s) => s.toLowerCase());

    const lensOk =
      lensContains.length === 0 || lensContains.some((needle) => String(finding.lens || "").toLowerCase().includes(needle));
    const messageOk = !messageContains || String(finding.message || "").toLowerCase().includes(messageContains);
    const pathOk =
      pathContains.length === 0 || pathContains.some((needle) => fileNames.some((name) => name.includes(needle)));

    if (lensOk && messageOk && pathOk) return owner;
  }

  return String(ownership.default_owner || "unassigned");
}

function applyFindingOwnership(findings, files, config) {
  return findings.map((f) => ({ ...f, owner: resolveFindingOwner(f, files, config) }));
}

function buildPreMergeChecklist({ result, files, requiredCoverage, config, approvalCount }) {
  const items = [];
  const hasSensitiveFiles = files.some((f) => /auth|oauth|jwt|session|permission|secret|token|payment|billing|workflow|terraform|k8s/i.test(f.filename));
  const hasTests = !result.findings.some((f) => /No test file changes detected|require test updates/i.test(f.message));
  const hasUiWarning = result.findings.some((f) => f.lens === "Design" && /without UI evidence/i.test(f.message));

  items.push({ done: result.grouped.critical.length === 0, text: "All critical findings resolved." });
  items.push({
    done: requiredCoverage.missing.users.length + requiredCoverage.missing.teams.length === 0,
    text: "Required users/teams are assigned for review.",
  });
  items.push({ done: !hasSensitiveFiles || hasTests, text: "Sensitive changes include test updates." });
  items.push({ done: !hasUiWarning, text: "UI-impacting changes include screenshot/UX evidence." });

  if (config.incident_safe?.enabled) {
    const minApprovals = Math.max(1, Number(config.incident_safe?.min_approvals || 1));
    items.push({
      done: approvalCount >= minApprovals,
      text: `Incident mode requires at least ${minApprovals} approval(s).`,
    });
  }

  return items;
}

function isReleasePr(pr, config) {
  const title = String(pr.title || "");
  const baseRef = String(pr.base?.ref || "");
  const titleRegex = new RegExp(String(config.release_gate?.title_regex || "^release[:\\s]|^chore\\(release\\):"), "i");
  const baseRegex = new RegExp(String(config.release_gate?.base_branch_regex || "^main$|^release\\/.*$"), "i");
  return titleRegex.test(title) || baseRegex.test(baseRef);
}

function buildFixSuggestions(result, files, config) {
  if (!config.fix_suggestions?.enabled) return [];
  const maxItems = Math.max(1, Number(config.fix_suggestions?.max_items || 3));
  const suggestions = [];
  const critical = result.grouped?.critical || [];
  const warnings = result.grouped?.warning || [];
  const pool = [...critical, ...warnings];

  for (const finding of pool) {
    if (suggestions.length >= maxItems) break;
    if (/without test updates|No test file changes detected|requires test updates/i.test(finding.message)) {
      suggestions.push({
        title: "Add focused tests",
        patch: "diff --git a/src/module.test.ts b/src/module.test.ts\n+it('covers the changed path', async () => {\n+  // Arrange, Act, Assert\n+});",
      });
      continue;
    }
    if (/lacks a clear problem|lacks explicit user\/business impact|acceptance criteria/i.test(finding.message)) {
      suggestions.push({
        title: "Improve PR description quality",
        patch: "### Problem\n- What user pain is solved?\n\n### Impact\n- Who is affected and expected outcome\n\n### Acceptance Criteria\n- [ ] measurable done condition",
      });
      continue;
    }
    if (/Frontend changes detected without UI evidence/i.test(finding.message)) {
      suggestions.push({
        title: "Attach UI proof",
        patch: "Add screenshots or short recording to PR body:\n- Before\n- After\n- Edge-case states",
      });
      continue;
    }
    if (/Missing required reviewer coverage/i.test(finding.message)) {
      suggestions.push({
        title: "Add required reviewers",
        patch: "Use PR sidebar -> Reviewers and add required users/teams from path policy rules.",
      });
    }
  }

  if (suggestions.length === 0 && files.some((f) => /auth|payment|workflow/i.test(f.filename))) {
    suggestions.push({
      title: "Harden sensitive-path changes",
      patch: "Add tests + explicit risk notes in PR body for auth/payment/workflow changes.",
    });
  }

  return suggestions.slice(0, maxItems);
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

function buildComment({ pr, result, nextSteps, reviewerRouting, requiredCoverage, fixSuggestions = [], checklist = [] }) {
  const fmt = (items, icon) => (items.length ? items.map((f) => `- ${icon} **${f.lens}**: ${f.message}`).join("\n") : "- None");

  const reviewersSection = reviewerRouting.enabled
    ? `### Suggested Reviewers (CODEOWNERS)\n- Users: ${reviewerRouting.users.length ? reviewerRouting.users.map((u) => `@${u}`).join(", ") : "None"}\n- Teams: ${reviewerRouting.teams.length ? reviewerRouting.teams.map((t) => `@${t}`).join(", ") : "None"}`
    : "### Suggested Reviewers (CODEOWNERS)\n- Reviewer routing disabled by config.";

  const requiredSection = requiredCoverage
    ? `### Required Reviewer Coverage (Path Policies)\n- Required users: ${requiredCoverage.required.users.length ? requiredCoverage.required.users.map((u) => `@${u}`).join(", ") : "None"}\n- Required teams: ${requiredCoverage.required.teams.length ? requiredCoverage.required.teams.map((t) => `@${t}`).join(", ") : "None"}\n- Missing users: ${requiredCoverage.missing.users.length ? requiredCoverage.missing.users.map((u) => `@${u}`).join(", ") : "None"}\n- Missing teams: ${requiredCoverage.missing.teams.length ? requiredCoverage.missing.teams.map((t) => `@${t}`).join(", ") : "None"}`
    : "";

  const deltaSection = result.delta
    ? `### Delta Since Previous Run\n- Added findings: ${result.delta.added.length}\n- Resolved findings: ${result.delta.resolved.length}`
    : "";
  const fixSection = fixSuggestions.length
    ? `### Actionable Fix Suggestions\n${fixSuggestions.map((s) => `- **${s.title}**\n\n\`\`\`text\n${s.patch}\n\`\`\``).join("\n")}`
    : "";
  const checklistSection = checklist.length
    ? `### Pre-Merge Checklist\n${checklist.map((c) => `- [${c.done ? "x" : " "}] ${c.text}`).join("\n")}`
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

${deltaSection}

${fixSection}

${checklistSection}

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

async function upsertSlaReminderComment(owner, repo, issueNumber, token, body, cooldownHours = 12) {
  const comments = await ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`, token);
  const existing = comments.find((c) => c.body && c.body.includes(SLA_MARKER));
  if (!existing) {
    const created = await ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`, token, {
      method: "POST",
      body: JSON.stringify({ body: `${SLA_MARKER}\n${body}` }),
    });
    return { mode: "created", id: created.id };
  }

  const updatedAt = new Date(existing.updated_at || existing.created_at || 0).getTime();
  const ageMs = Date.now() - updatedAt;
  const cooldownMs = Math.max(0, Number(cooldownHours || 12)) * 60 * 60 * 1000;
  if (ageMs < cooldownMs) return { mode: "cooldown", id: existing.id };

  await ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/comments/${existing.id}`, token, {
    method: "PATCH",
    body: JSON.stringify({ body: `${SLA_MARKER}\n${body}` }),
  });
  return { mode: "updated", id: existing.id };
}

async function getPullReviews(owner, repo, pullNumber, token) {
  return ghRequest(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews?per_page=100`, token);
}

async function syncManagedLabels(owner, repo, issueNumber, token, desiredLabels, managedLabels) {
  const current = await ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels`, token);
  const currentNames = new Set((current || []).map((l) => l.name));
  const desired = new Set(desiredLabels);

  for (const label of managedLabels) {
    if (currentNames.has(label) && !desired.has(label)) {
      await ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`, token, {
        method: "DELETE",
      });
    }
  }

  const toAdd = [...desired].filter((l) => !currentNames.has(l));
  if (toAdd.length) {
    await ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels`, token, {
      method: "POST",
      body: JSON.stringify({ labels: toAdd }),
    });
  }
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

function writeSarifReport(repoSlug, pr, result) {
  const findings = (result.findings || []).filter((f) => ["Security", "PathPolicy", "ReviewerPolicy"].includes(f.lens));
  const sarif = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "review-os",
            version: "0.1.5",
            informationUri: "https://github.com/anup4khandelwal/autopilot-multi-agent-loop",
            rules: findings.map((f, idx) => ({
              id: `reviewos-${idx + 1}`,
              shortDescription: { text: `${f.lens} ${f.severity}` },
              fullDescription: { text: f.message },
              defaultConfiguration: { level: f.severity === "critical" ? "error" : f.severity === "warning" ? "warning" : "note" },
            })),
          },
        },
        results: findings.map((f, idx) => ({
          ruleId: `reviewos-${idx + 1}`,
          level: f.severity === "critical" ? "error" : f.severity === "warning" ? "warning" : "note",
          message: { text: f.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: `${repoSlug}/pull/${pr.number}` },
              },
            },
          ],
        })),
      },
    ],
  };
  const out = ".reviewos/security-findings.sarif";
  ensureDir(path.dirname(out));
  fs.writeFileSync(out, JSON.stringify(sarif, null, 2));
  return out;
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

function writeStepSummary({ pr, result, nextSteps, reviewerRouting, requiredCoverage, matchedRules, checklist = [] }) {
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
    `- Reviewer routing mode: ${reviewerRouting.riskBased ? "risk-based" : "standard"}`,
    `- Delta added findings: ${result.delta?.added?.length || 0}`,
    `- Delta resolved findings: ${result.delta?.resolved?.length || 0}`,
    `- Missing required users: ${requiredCoverage.missing.users.join(", ") || "none"}`,
    `- Missing required teams: ${requiredCoverage.missing.teams.join(", ") || "none"}`,
    `- Matched path rules: ${matchedRules.map((r) => `${r.name}(${r.count})`).join(", ") || "none"}`,
    "",
    "### Next Steps",
    ...nextSteps.map((s) => `- ${s}`),
    "",
    "### Pre-Merge Checklist",
    ...(checklist.length ? checklist.map((c) => `- [${c.done ? "x" : " "}] ${c.text}`) : ["- None"]),
    "",
  ];

  fs.appendFileSync(summaryPath, `${lines.join("\n")}\n`);
}

function writePromptTrace({ config, repoSlug, pr, traces, result }) {
  if (!config.prompt_trace?.enabled) return null;
  const dir = String(config.prompt_trace?.output_dir || TRACE_DIR);
  ensureDir(dir);
  const safeRepo = repoSlug.replace(/\//g, "__");
  const out = path.join(dir, `${safeRepo}__pr-${pr.number}.json`);
  const payload = {
    timestamp: new Date().toISOString(),
    repository: repoSlug,
    pr: { number: pr.number, title: pr.title },
    mergeReadiness: result.mergeReadiness,
    traces,
  };
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  return out;
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
  let reviews = [];

  if (mockPr && mockFiles) {
    pr = mockPr;
    files = mockFiles;
    reviews = Array.isArray(pr.reviews) ? pr.reviews : [];
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
    reviews = await getPullReviews(owner, repo, pull.number, token);
  }

  const result = runAgentLoop({ pr, files, config, repoSlug });
  const nextSteps = buildNextSteps(result, config);
  const fixSuggestions = buildFixSuggestions(result, files, config);

  const codeownerRules = loadCodeowners();
  const prAuthor = pr.user?.login || "";
  const reviewerRouting = {
    enabled: Boolean(config.reviewer_routing?.enabled),
    autoRequest: Boolean(config.reviewer_routing?.auto_request),
    riskBased: Boolean(config.reviewer_routing?.risk_based),
    ...resolveReviewers(files, prAuthor, codeownerRules, {
      maxReviewers: Number(config.reviewer_routing?.max_reviewers) || 3,
      riskBased: Boolean(config.reviewer_routing?.risk_based),
    }),
  };

  const required = result.requiredReviewers || { users: [], teams: [] };
  let currentCoverage = collectCurrentReviewers(pr);
  let requestedViaRequired = false;
  const approvalCount = (reviews || []).filter((r) => String(r.state || "").toUpperCase() === "APPROVED").length;

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

  if (config.incident_safe?.enabled) {
    const minApprovals = Math.max(1, Number(config.incident_safe?.min_approvals || 1));
    if (approvalCount < minApprovals) {
      result.findings = dedupeFindings([
        ...result.findings,
        {
          severity: "critical",
          lens: "IncidentMode",
          message: `Incident-safe mode requires ${minApprovals} approval(s); current approvals: ${approvalCount}.`,
        },
      ]);
      result.grouped = summarizeFindings(result.findings);
      result.scores.security = clamp(result.scores.security - 10);
      result.mergeReadiness = Math.round(
        result.scores.engineering * Number(config.weights.engineering) +
          result.scores.product * Number(config.weights.product) +
          result.scores.design * Number(config.weights.design) +
          result.scores.security * Number(config.weights.security)
      );
      nextSteps.unshift("Add required approvals to satisfy incident-safe mode.");
    }
  }

  result.findings = applyFindingOwnership(result.findings, files, config);
  result.grouped = summarizeFindings(result.findings);

  const requiredCoverage = {
    required,
    missing: missingRequired,
  };
  const checklist = buildPreMergeChecklist({
    result,
    files,
    requiredCoverage,
    config,
    approvalCount,
  });

  const comment = buildComment({
    pr,
    result,
    nextSteps,
    reviewerRouting,
    requiredCoverage,
    fixSuggestions,
    checklist,
  });
  const autoRequestAttempted = reviewerRouting.enabled && reviewerRouting.autoRequest;
  const approvedByReviewer = (reviews || []).some((r) => String(r.state || "").toUpperCase() === "APPROVED");
  const prAgeHours = pr.created_at ? Math.max(0, (Date.now() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60)) : 0;
  const slaExceeded = config.reviewer_sla?.enabled && !approvedByReviewer && prAgeHours >= Number(config.reviewer_sla?.threshold_hours || 24);

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
    delta: result.delta || { added: [], resolved: [] },
    promptTracePath: "",
    checklist,
    approvalCount,
    sla: {
      enabled: Boolean(config.reviewer_sla?.enabled),
      approvedByReviewer,
      prAgeHours: Number(prAgeHours.toFixed(2)),
      exceeded: Boolean(slaExceeded),
    },
  };
  if (result.traces) {
    const tracePath = writePromptTrace({
      config,
      repoSlug,
      pr,
      traces: result.traces,
      result,
    });
    historyEntry.promptTracePath = tracePath || "";
  }

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
        fixSuggestions,
        promptTracePath: historyEntry.promptTracePath,
        checklist,
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

    if (slaExceeded) {
      const [owner, repo] = repoSlug.split("/");
      const slaBody = [
        "## Review SLA Reminder",
        "",
        `- PR has been waiting **${prAgeHours.toFixed(1)}h** without approval.`,
        `- Threshold: **${Number(config.reviewer_sla?.threshold_hours || 24)}h**`,
        "- Please assign/reassign reviewers or request help from maintainers.",
      ].join("\n");
      const reminder = await upsertSlaReminderComment(
        owner,
        repo,
        pr.number,
        token,
        slaBody,
        Number(config.reviewer_sla?.cooldown_hours || 12)
      );
      console.log(`SLA reminder comment: ${reminder.mode}`);
    }

    if (config.labels?.enabled) {
      const managedLabels = [
        String(config.labels.critical_label || "reviewos:critical"),
        String(config.labels.security_label || "reviewos:security"),
        String(config.labels.ready_label || "reviewos:ready"),
      ];
      const desiredLabels = [];
      if (result.grouped.critical.length > 0) desiredLabels.push(managedLabels[0]);
      if (result.scores.security < Number(config.thresholds.security_warning || 75)) desiredLabels.push(managedLabels[1]);
      if (result.grouped.critical.length === 0 && result.mergeReadiness >= 90) desiredLabels.push(managedLabels[2]);
      await syncManagedLabels(owner, repo, pr.number, token, desiredLabels, managedLabels);
      console.log(`Labels synced: ${desiredLabels.join(",") || "none"}`);
    }

    const alertResult = await sendCriticalAlerts({ config, repoSlug, pr, result });
    if (alertResult.sent.length) {
      console.log(`Alerts sent: ${alertResult.sent.join(",")}`);
    }
  }

  const sarifPath = writeSarifReport(repoSlug, pr, result);
  console.log(`SARIF written: ${sarifPath}`);
  if (historyEntry.promptTracePath) {
    console.log(`Prompt trace written: ${historyEntry.promptTracePath}`);
  }

  writeStepSummary({
    pr,
    result,
    nextSteps,
    reviewerRouting,
    requiredCoverage,
    matchedRules: result.matchedPathRules || [],
    checklist,
  });

  if (failOnCritical && result.grouped.critical.length > 0) {
    console.error(`Critical findings present (${result.grouped.critical.length}). Failing job.`);
    process.exit(1);
  }

  if (config.release_gate?.enabled && isReleasePr(pr, config) && result.grouped.critical.length > 0) {
    console.error("Release gate blocked: unresolved critical findings on release PR.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
