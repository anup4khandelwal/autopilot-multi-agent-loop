#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

const member = readJson('.codex-stack/fleet-member.json');
assert.equal(member.repo, 'anup4khandelwal/autopilot-multi-agent-loop');
assert.equal(member.policyPack, 'review-only');
assert.deepEqual(member.requiredChecks, ['fleet-status', 'review']);
assert.equal(member.qa.mode, 'diff-aware');
assert.equal(member.qa.a11y, false);
assert.equal(member.qa.perf, false);
assert.deepEqual(member.preview.paths, []);
assert.deepEqual(member.preview.devices, []);
assert.equal(member.status.requiresLatestReport, false);

const workflow = readText('.github/workflows/codex-stack-fleet-status.yml');
assert.match(workflow, /name:\s+codex-stack fleet status/);
assert.match(workflow, /uses:\s+actions\/checkout@v6\.0\.2/);
assert.match(workflow, /uses:\s+actions\/upload-artifact@v7\.0\.0/);
assert.match(workflow, /node \.github\/codex-stack\/fleet-status\.js/);

const script = readText('.github/codex-stack/fleet-status.js');
assert.match(script, /marker:\s+'<!-- codex-stack:fleet-status -->'/);
assert.match(script, /requiredChecks/);
assert.match(script, /visualRiskScore/);
assert.match(script, /riskScore/);

console.log('Fleet rollout test passed.');
