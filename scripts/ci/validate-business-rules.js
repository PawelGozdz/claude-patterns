#!/usr/bin/env node
/**
 * Validate BUSINESS_RULES.yaml files against business-rules.schema.json (v2.1)
 *
 * Usage:
 *   node validate-business-rules.js /path/to/project
 *   node validate-business-rules.js              # uses cwd
 *
 * Requires js-yaml from the target project's node_modules.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_FILE = path.join(__dirname, '../../schemas/business-rules.schema.json');
const BR_PATTERN = /^BR-[A-Z]{2,5}(-[A-Z]{2,6})?-\d{3}$/;
const VALID_CATEGORIES = ['validation', 'authorization', 'invariant', 'policy', 'guard'];
const VALID_LAYERS = ['domain', 'application', 'infrastructure', 'framework', 'api'];
const VALID_STEP_FAILURES = ['rollback', 'continue', 'retry'];
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]+$/;

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'volumes', 'postgres-data', 'coverage', '.nx', '.cache']);

function findYamlFiles(dir, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results; // skip inaccessible directories
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      findYamlFiles(fullPath, results);
    } else if (entry.name === 'BUSINESS_RULES.yaml') {
      results.push(fullPath);
    }
  }
  return results;
}

function loadYaml(projectDir) {
  // Try project's node_modules first (npm/yarn)
  try { return require(path.join(projectDir, 'node_modules', 'js-yaml')); } catch {}
  // Try pnpm flat structure
  try {
    const pnpmDir = path.join(projectDir, 'node_modules', '.pnpm');
    if (fs.existsSync(pnpmDir)) {
      const match = fs.readdirSync(pnpmDir).find(d => d.startsWith('js-yaml@'));
      if (match) return require(path.join(pnpmDir, match, 'node_modules', 'js-yaml'));
    }
  } catch {}
  // Try global
  try { return require('js-yaml'); } catch {}
  return null;
}

function validateMetadata(metadata, filePath, errors) {
  const prefix = `${filePath}: metadata`;
  if (!metadata || typeof metadata !== 'object') {
    errors.push(`${prefix} — missing or not an object`);
    return;
  }
  for (const field of ['context', 'version', 'created', 'last_updated', 'maintainer']) {
    if (!metadata[field]) {
      errors.push(`${prefix} — missing required field '${field}'`);
    }
  }
  if (metadata.version && !/^2\.\d+$/.test(String(metadata.version))) {
    errors.push(`${prefix}.version — must match 2.x (got '${metadata.version}')`);
  }
  for (const dateField of ['created', 'last_updated']) {
    let val = metadata[dateField];
    // js-yaml 3.x auto-converts YYYY-MM-DD to Date objects
    if (val instanceof Date) val = val.toISOString().split('T')[0];
    if (val && !/^\d{4}-\d{2}-\d{2}$/.test(String(val))) {
      errors.push(`${prefix}.${dateField} — must be YYYY-MM-DD (got '${val}')`);
    }
  }
}

function validateEnforcement(enforcement, ruleId, filePath, errors) {
  const prefix = `${filePath}: ${ruleId}.enforcement`;
  if (!enforcement || typeof enforcement !== 'object') {
    errors.push(`${prefix} — must be an object with 'primary' field`);
    return;
  }
  if (!enforcement.primary) {
    errors.push(`${prefix} — missing required 'primary' field`);
    return;
  }
  if (!enforcement.primary.class) {
    errors.push(`${prefix}.primary — missing required 'class' field`);
  }
  if (enforcement.primary.layer && !VALID_LAYERS.includes(enforcement.primary.layer)) {
    errors.push(`${prefix}.primary.layer — invalid '${enforcement.primary.layer}', must be one of: ${VALID_LAYERS.join(', ')}`);
  }
  if (enforcement.secondary) {
    if (!enforcement.secondary.class) {
      errors.push(`${prefix}.secondary — missing required 'class' field`);
    }
    if (enforcement.secondary.layer && !VALID_LAYERS.includes(enforcement.secondary.layer)) {
      errors.push(`${prefix}.secondary.layer — invalid '${enforcement.secondary.layer}'`);
    }
  }
}

function validateOnFailure(onFailure, ruleId, filePath, errors) {
  const prefix = `${filePath}: ${ruleId}.on_failure`;
  if (onFailure === null || onFailure === undefined) return; // null is valid
  if (typeof onFailure !== 'object') {
    errors.push(`${prefix} — must be null or an object`);
    return;
  }
  if (!('error_code' in onFailure)) {
    errors.push(`${prefix} — missing required 'error_code' field`);
  }
  if (onFailure.error_code !== null && onFailure.error_code !== undefined) {
    if (!ERROR_CODE_PATTERN.test(String(onFailure.error_code))) {
      errors.push(`${prefix}.error_code — must match ^[A-Z][A-Z0-9_]+$ (got '${onFailure.error_code}')`);
    }
  }
  if (onFailure.http_status !== undefined) {
    const s = Number(onFailure.http_status);
    if (!Number.isInteger(s) || s < 400 || s > 599) {
      errors.push(`${prefix}.http_status — must be integer 400-599 (got '${onFailure.http_status}')`);
    }
  }
}

function validateRule(rule, ruleId, filePath, errors) {
  const prefix = `${filePath}: ${ruleId}`;
  if (!rule || typeof rule !== 'object') {
    errors.push(`${prefix} — not an object`);
    return;
  }
  for (const field of ['title', 'description', 'rationale', 'enforcement', 'category', 'on_failure']) {
    if (!(field in rule)) {
      errors.push(`${prefix} — missing required field '${field}'`);
    }
  }
  if (rule.title && String(rule.title).length > 80) {
    errors.push(`${prefix}.title — exceeds 80 chars (${String(rule.title).length})`);
  }
  if (rule.category && !VALID_CATEGORIES.includes(rule.category)) {
    errors.push(`${prefix}.category — invalid '${rule.category}', must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }
  if (rule.enforcement) {
    validateEnforcement(rule.enforcement, ruleId, filePath, errors);
  }
  if ('on_failure' in rule) {
    validateOnFailure(rule.on_failure, ruleId, filePath, errors);
  }
  if (rule.requires) {
    if (!Array.isArray(rule.requires)) {
      errors.push(`${prefix}.requires — must be an array`);
    } else {
      for (const dep of rule.requires) {
        if (!BR_PATTERN.test(dep)) {
          errors.push(`${prefix}.requires — invalid BR reference '${dep}'`);
        }
      }
    }
  }
}

function validateFlowStep(step, flowName, idx, filePath, errors, knownRules) {
  const prefix = `${filePath}: flows.${flowName}.steps[${idx}]`;
  if (!step.step || !/^[a-z][a-z0-9-]+$/.test(step.step)) {
    errors.push(`${prefix}.step — must be lowercase-kebab (got '${step.step}')`);
  }
  if (step.rule) {
    if (!BR_PATTERN.test(step.rule)) {
      errors.push(`${prefix}.rule — invalid BR reference '${step.rule}'`);
    } else if (knownRules.size > 0 && !knownRules.has(step.rule)) {
      errors.push(`${prefix}.rule — references non-existent rule '${step.rule}'`);
    }
  }
  if (step.on_failure && !VALID_STEP_FAILURES.includes(step.on_failure)) {
    errors.push(`${prefix}.on_failure — must be rollback/continue/retry (got '${step.on_failure}')`);
  }
}

function validateFlow(flow, flowName, filePath, errors, knownRules) {
  const prefix = `${filePath}: flows.${flowName}`;
  if (!flow || typeof flow !== 'object') {
    errors.push(`${prefix} — not an object`);
    return;
  }
  for (const field of ['description', 'endpoint', 'handler', 'steps']) {
    if (!flow[field]) {
      errors.push(`${prefix} — missing required field '${field}'`);
    }
  }
  if (flow.steps) {
    if (!Array.isArray(flow.steps) || flow.steps.length === 0) {
      errors.push(`${prefix}.steps — must be non-empty array`);
    } else {
      for (let i = 0; i < flow.steps.length; i++) {
        validateFlowStep(flow.steps[i], flowName, i, filePath, errors, knownRules);
      }
    }
  }
  if (flow.errors) {
    if (!Array.isArray(flow.errors)) {
      errors.push(`${prefix}.errors — must be an array`);
    } else {
      for (let i = 0; i < flow.errors.length; i++) {
        const err = flow.errors[i];
        if (!err.error_code) errors.push(`${prefix}.errors[${i}] — missing error_code`);
        if (!err.from) errors.push(`${prefix}.errors[${i}] — missing from`);
        if (err.http_status === undefined) errors.push(`${prefix}.errors[${i}] — missing http_status`);
        if (err.http_status !== undefined) {
          const s = Number(err.http_status);
          if (!Number.isInteger(s) || s < 400 || s > 599) {
            errors.push(`${prefix}.errors[${i}].http_status — must be 400-599 (got '${err.http_status}')`);
          }
        }
      }
    }
  }
}

function validateFile(data, filePath) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== 'object') {
    errors.push(`${filePath}: file is empty or not a YAML object`);
    return { errors, warnings };
  }

  // Top-level required fields
  if (!data.metadata) errors.push(`${filePath}: missing required 'metadata' section`);
  if (!data.business_rules) errors.push(`${filePath}: missing required 'business_rules' section`);

  // Validate metadata
  if (data.metadata) {
    validateMetadata(data.metadata, filePath, errors);
  }

  // Validate business rules
  const knownRules = new Set();
  if (data.business_rules && typeof data.business_rules === 'object') {
    const ruleIds = Object.keys(data.business_rules);
    if (ruleIds.length === 0) {
      errors.push(`${filePath}: business_rules must have at least 1 rule`);
    }
    for (const ruleId of ruleIds) {
      if (!BR_PATTERN.test(ruleId)) {
        errors.push(`${filePath}: invalid rule ID '${ruleId}' — must match BR-XX-### or BR-XX-YYYY-###`);
      }
      knownRules.add(ruleId);
      validateRule(data.business_rules[ruleId], ruleId, filePath, errors);
    }
  }

  // Validate flows (optional)
  if (data.flows && typeof data.flows === 'object') {
    for (const flowName of Object.keys(data.flows)) {
      if (!/^[a-z][a-z0-9-]+$/.test(flowName)) {
        errors.push(`${filePath}: invalid flow name '${flowName}' — must be lowercase-kebab`);
      }
      validateFlow(data.flows[flowName], flowName, filePath, errors, knownRules);
    }
  }

  return { errors, warnings };
}

function main() {
  const projectDir = process.argv[2] || process.cwd();

  if (!fs.existsSync(projectDir)) {
    console.error(`ERROR: Directory not found: ${projectDir}`);
    process.exit(1);
  }

  // Verify schema exists
  if (!fs.existsSync(SCHEMA_FILE)) {
    console.error(`ERROR: Schema not found: ${SCHEMA_FILE}`);
    process.exit(1);
  }

  // Find YAML files
  const yamlFiles = findYamlFiles(projectDir);
  if (yamlFiles.length === 0) {
    console.log(`No BUSINESS_RULES.yaml files found in ${projectDir}`);
    process.exit(0);
  }

  // Load YAML parser
  const yaml = loadYaml(projectDir);
  if (!yaml) {
    console.error('ERROR: js-yaml not found. Install it in the project: npm i -D js-yaml');
    console.error('       Or run from a project directory that has it in node_modules.');
    process.exit(1);
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  let validCount = 0;

  for (const filePath of yamlFiles) {
    const relPath = path.relative(projectDir, filePath);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      console.error(`ERROR: ${relPath} — ${err.message}`);
      totalErrors++;
      continue;
    }

    let data;
    try {
      data = yaml.load(content);
    } catch (err) {
      console.error(`ERROR: ${relPath} — YAML parse error: ${err.message}`);
      totalErrors++;
      continue;
    }

    const { errors, warnings } = validateFile(data, relPath);
    totalErrors += errors.length;
    totalWarnings += warnings.length;

    for (const err of errors) console.error(`ERROR: ${err}`);
    for (const warn of warnings) console.warn(`WARN: ${warn}`);

    if (errors.length === 0) validCount++;
  }

  if (totalErrors > 0) {
    console.error(`\n${totalErrors} errors in ${yamlFiles.length} files (${validCount} valid)`);
    process.exit(1);
  }

  console.log(`Validated ${validCount} BUSINESS_RULES.yaml files (${totalWarnings} warnings)`);
}

main();
