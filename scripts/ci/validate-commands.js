#!/usr/bin/env node
/**
 * Validate command markdown files are non-empty, readable,
 * and have valid cross-references to other commands, agents, and skills.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '../..');
const COMMANDS_DIR = path.join(ROOT_DIR, 'commands');
const AGENTS_DIR = path.join(ROOT_DIR, 'agents');
const SKILLS_DIR = path.join(ROOT_DIR, 'skills');

// Claude Code built-ins — not files in this repo, but valid `/name` references.
const BUILTIN_COMMANDS = new Set([
  'help', 'clear', 'compact', 'config', 'cost', 'model', 'review',
  'workflows', 'agents', 'init', 'resume', 'status', 'doctor',
  'memory', 'permissions', 'hooks', 'mcp', 'vim', 'terminal-setup',
]);

function validateCommands() {
  if (!fs.existsSync(COMMANDS_DIR)) {
    console.log('No commands directory found, skipping validation');
    process.exit(0);
  }

  const files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.md') && f !== 'README.md');
  let hasErrors = false;
  let warnCount = 0;

  // Build set of valid command names (without .md extension)
  const validCommands = new Set(files.map(f => f.replace(/\.md$/, '')));

  // Build set of valid agent names (without .md extension) — recursive search
  const validAgents = new Set();
  function findAgentNames(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        findAgentNames(path.join(dir, entry.name));
      } else if (entry.name.endsWith('.md') && entry.name !== 'README.md') {
        validAgents.add(entry.name.replace(/\.md$/, ''));
      }
    }
  }
  findAgentNames(AGENTS_DIR);

  // Build two sets:
  //   validSkills     — every directory name, for path refs like "skills/testing/"
  //                     (that segment is a category, not a skill)
  //   invocableSkills — only directories holding a SKILL.md, i.e. the ones a user
  //                     can actually invoke as /<skill-name>. Kept separate so a
  //                     typo like /references is not silently accepted.
  const validSkills = new Set();
  const invocableSkills = new Set();
  function findSkillNames(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        validSkills.add(entry.name);
        if (fs.existsSync(path.join(fullPath, 'SKILL.md'))) {
          invocableSkills.add(entry.name);
        }
        findSkillNames(fullPath);
      }
    }
  }
  findSkillNames(SKILLS_DIR);

  for (const file of files) {
    const filePath = path.join(COMMANDS_DIR, file);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      console.error(`ERROR: ${file} - ${err.message}`);
      hasErrors = true;
      continue;
    }

    // Validate the file is non-empty readable markdown
    if (content.trim().length === 0) {
      console.error(`ERROR: ${file} - Empty command file`);
      hasErrors = true;
      continue;
    }

    // Strip fenced code blocks before checking cross-references.
    // Examples/templates inside ``` blocks are not real references.
    const contentNoCodeBlocks = content.replace(/```[\s\S]*?```/g, '');

    // Check cross-references to other commands (e.g., `/build-fix`)
    // Skip lines that describe hypothetical output (e.g., "→ Creates: `/new-table`")
    // Process line-by-line so ALL command refs per line are captured
    // (previous anchored regex /^.*`\/...`.*$/gm only matched the last ref per line)
    for (const line of contentNoCodeBlocks.split('\n')) {
      if (/creates:|would create:/i.test(line)) continue;
      const lineRefs = line.matchAll(/`\/([a-z][-a-z0-9]*)`/g);
      for (const match of lineRefs) {
        const refName = match[1];
        // A `/name` reference resolves to a command, a skill (skills are invoked
        // as /<skill-name> too), or a Claude Code built-in.
        if (!validCommands.has(refName) && !invocableSkills.has(refName) && !BUILTIN_COMMANDS.has(refName)) {
          console.error(`ERROR: ${file} - references non-existent command /${refName}`);
          hasErrors = true;
        }
      }
    }

    // Check agent references (e.g., "agents/planner.md" or "`planner` agent").
    // The negative lookbehind excludes `.agents/foo.md` — that is the per-project
    // context-file convention, not a reference to an agent in this repo.
    const agentPathRefs = contentNoCodeBlocks.matchAll(/(?<![.\w-])agents\/([a-z][-a-z0-9]*)\.md/g);
    for (const match of agentPathRefs) {
      const refName = match[1];
      if (!validAgents.has(refName)) {
        console.error(`ERROR: ${file} - references non-existent agent agents/${refName}.md`);
        hasErrors = true;
      }
    }

    // Check skill directory references (e.g., "skills/tdd-workflow/")
    const skillRefs = contentNoCodeBlocks.matchAll(/skills\/([a-z][-a-z0-9]*)\//g);
    for (const match of skillRefs) {
      const refName = match[1];
      if (!validSkills.has(refName)) {
        console.warn(`WARN: ${file} - references skill directory skills/${refName}/ (not found locally)`);
        warnCount++;
      }
    }

    // Check agent name references in workflow diagrams (e.g., "planner -> tdd-guide")
    const workflowLines = contentNoCodeBlocks.matchAll(/^([a-z][-a-z0-9]*(?:\s*->\s*[a-z][-a-z0-9]*)+)$/gm);
    for (const match of workflowLines) {
      const agents = match[1].split(/\s*->\s*/);
      for (const agent of agents) {
        if (!validAgents.has(agent)) {
          console.error(`ERROR: ${file} - workflow references non-existent agent "${agent}"`);
          hasErrors = true;
        }
      }
    }
  }

  if (hasErrors) {
    process.exit(1);
  }

  let msg = `Validated ${files.length} command files`;
  if (warnCount > 0) {
    msg += ` (${warnCount} warnings)`;
  }
  console.log(msg);
}

validateCommands();
