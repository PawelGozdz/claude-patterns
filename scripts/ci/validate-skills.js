#!/usr/bin/env node
/**
 * Validate skill directories have SKILL.md with required structure
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '../../skills');

/**
 * Recursively find all SKILL.md files under a directory
 */
function findSkillFiles(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findSkillFiles(fullPath, results);
    } else if (entry.name === 'SKILL.md') {
      results.push(fullPath);
    }
  }
  return results;
}

function validateSkills() {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.log('No skills directory found, skipping validation');
    process.exit(0);
  }

  // Verify each category directory has at least one SKILL.md in its subtree
  const categories = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  let hasErrors = false;
  let validCount = 0;

  for (const category of categories) {
    const categoryDir = path.join(SKILLS_DIR, category);
    const skillFiles = findSkillFiles(categoryDir);

    if (skillFiles.length === 0) {
      console.error(`ERROR: ${category}/ - No SKILL.md found in any subdirectory`);
      hasErrors = true;
      continue;
    }

    for (const skillFile of skillFiles) {
      const relPath = path.relative(SKILLS_DIR, skillFile);
      let content;
      try {
        content = fs.readFileSync(skillFile, 'utf-8');
      } catch (err) {
        console.error(`ERROR: ${relPath} - ${err.message}`);
        hasErrors = true;
        continue;
      }
      if (content.trim().length === 0) {
        console.error(`ERROR: ${relPath} - Empty file`);
        hasErrors = true;
        continue;
      }
      validCount++;
    }
  }

  if (hasErrors) {
    process.exit(1);
  }

  console.log(`Validated ${validCount} skill files across ${categories.length} categories`);
}

validateSkills();
