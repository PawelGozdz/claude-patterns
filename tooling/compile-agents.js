#!/usr/bin/env node

/**
 * Claude Patterns Agent Compilation Tool
 *
 * Compiles universal agent templates with project-specific configuration.
 *
 * Usage:
 *   compile-agents <template> <config> <output>
 *   compile-agents --template agents-universal.yml --config project.yml --output ./roles
 *
 * @version 1.0.0
 * @author LocalHero Team
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import YAML from 'yaml';
import chalk from 'chalk';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import ora from 'ora';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CLI Configuration
// ============================================================================

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .option('template', {
    alias: 't',
    describe: 'Path to universal agent template (YAML)',
    type: 'string',
    demandOption: false,
  })
  .option('config', {
    alias: 'c',
    describe: 'Path to project configuration (YAML)',
    type: 'string',
    demandOption: false,
  })
  .option('output', {
    alias: 'o',
    describe: 'Output directory for compiled agents',
    type: 'string',
    demandOption: false,
  })
  .option('verify', {
    alias: 'v',
    describe: 'Verify compiled agents (no compilation)',
    type: 'boolean',
    default: false,
  })
  .option('verbose', {
    describe: 'Verbose output',
    type: 'boolean',
    default: false,
  })
  .example('$0 -t agents-universal.yml -c project.yml -o ./roles', 'Compile agents')
  .example('$0 --verify ./roles', 'Verify compiled agents')
  .help('h')
  .alias('h', 'help')
  .parse();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Load and parse YAML file
 */
async function loadYAML(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return YAML.parse(content);
  } catch (error) {
    throw new Error(`Failed to load YAML file ${filePath}: ${error.message}`);
  }
}

/**
 * Write YAML file
 */
async function writeYAML(filePath, data) {
  try {
    const content = YAML.stringify(data, { indent: 2 });
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf8');
  } catch (error) {
    throw new Error(`Failed to write YAML file ${filePath}: ${error.message}`);
  }
}

/**
 * Write Markdown file
 */
async function writeMarkdown(filePath, content) {
  try {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf8');
  } catch (error) {
    throw new Error(`Failed to write Markdown file ${filePath}: ${error.message}`);
  }
}

/**
 * Compile Handlebars template with data
 */
function compileTemplate(template, data) {
  try {
    const compiledTemplate = Handlebars.compile(template);
    return compiledTemplate(data);
  } catch (error) {
    throw new Error(`Template compilation failed: ${error.message}`);
  }
}

/**
 * Register Handlebars helpers
 */
function registerHelpers() {
  // Join array with delimiter
  Handlebars.registerHelper('join', function(array, delimiter) {
    if (!Array.isArray(array)) return '';
    return array.join(delimiter || ', ');
  });

  // Uppercase first letter
  Handlebars.registerHelper('capitalize', function(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  });

  // Convert to kebab-case
  Handlebars.registerHelper('kebabCase', function(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/\s+/g, '-');
  });

  // Convert to PascalCase
  Handlebars.registerHelper('pascalCase', function(str) {
    if (!str) return '';
    return str
      .split(/[-_\s]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  });

  // Conditional equality
  Handlebars.registerHelper('eq', function(a, b) {
    return a === b;
  });

  // Array length
  Handlebars.registerHelper('length', function(array) {
    return Array.isArray(array) ? array.length : 0;
  });
}

/**
 * Validate project configuration
 */
function validateProjectConfig(config) {
  const required = ['name', 'slug', 'contexts'];
  const missing = required.filter(field => !config[field]);

  if (missing.length > 0) {
    throw new Error(`Missing required fields in project config: ${missing.join(', ')}`);
  }

  if (!Array.isArray(config.contexts) || config.contexts.length === 0) {
    throw new Error('Project config must have at least one context');
  }

  return true;
}

/**
 * Verify compiled output (no {{...}} placeholders)
 */
function verifyCompiled(content, filePath) {
  const placeholderRegex = /\{\{[^}]+\}\}/g;
  const matches = content.match(placeholderRegex);

  if (matches && matches.length > 0) {
    console.warn(chalk.yellow(`⚠️  Unresolved placeholders in ${filePath}:`));
    matches.forEach(match => console.warn(chalk.yellow(`   - ${match}`)));
    return false;
  }

  return true;
}

// ============================================================================
// Main Compilation Logic
// ============================================================================

/**
 * Compile single agent definition
 */
async function compileAgent(agentDef, context, verbose = false) {
  const agentYAML = YAML.stringify(agentDef, { indent: 2 });
  const compiled = compileTemplate(agentYAML, context);

  if (verbose) {
    console.log(chalk.gray(`   Compiled YAML (${Object.keys(agentDef).length} fields)`));
  }

  // Verify no placeholders remain
  if (!verifyCompiled(compiled, 'agent')) {
    throw new Error('Compilation incomplete: unresolved placeholders found');
  }

  return YAML.parse(compiled);
}

/**
 * Compile markdown agent file
 */
async function compileMarkdownAgent(template, context, verbose = false) {
  const compiled = compileTemplate(template, context);

  if (verbose) {
    console.log(chalk.gray(`   Compiled Markdown (${compiled.length} chars)`));
  }

  // Verify no placeholders remain
  if (!verifyCompiled(compiled, 'markdown')) {
    throw new Error('Compilation incomplete: unresolved placeholders found');
  }

  return compiled;
}

/**
 * Compile all agents from universal template
 */
async function compileAgents(templatePath, configPath, outputPath, verbose = false) {
  const spinner = ora('Loading configuration...').start();

  try {
    // Register Handlebars helpers
    registerHelpers();

    // Load config
    const config = await loadYAML(configPath);

    spinner.succeed('Configuration loaded');

    // Validate config
    spinner.start('Validating configuration...');
    validateProjectConfig(config);
    spinner.succeed('Configuration valid');

    // Prepare compilation context
    const context = {
      PROJECT_NAME: config.name,
      PROJECT_SLUG: config.slug,
      CONTEXTS: config.contexts,
      TECH_STACK: config.tech_stack || {},
      ...config,
    };

    // Load template as STRING (not YAML), compile with Handlebars, then parse
    spinner.start('Compiling template...');
    const templateString = await fs.readFile(templatePath, 'utf8');
    const compiledString = compileTemplate(templateString, context);
    const template = YAML.parse(compiledString);
    spinner.succeed('Template compiled');

    if (verbose) {
      console.log(chalk.blue('\n📋 Compilation Context:'));
      console.log(chalk.gray(`   Project: ${context.PROJECT_NAME} (${context.PROJECT_SLUG})`));
      console.log(chalk.gray(`   Contexts: ${context.CONTEXTS.join(', ')}`));
      console.log(chalk.gray(`   Tech Stack: ${context.TECH_STACK.framework || 'N/A'}`));
      console.log('');
    }

    // Compile each agent category
    const stats = {
      specialists: 0,
      implementers: 0,
      verifiers: 0,
      utilities: 0,
    };

    // Compile specialists
    if (template.agents?.specialists) {
      spinner.start('Compiling specialists...');
      const compiled = {};
      for (const [name, def] of Object.entries(template.agents.specialists)) {
        compiled[name] = await compileAgent(def, context, verbose);
        stats.specialists++;
      }
      await writeYAML(path.join(outputPath, 'specialists.yml'), { specialists: compiled });
      spinner.succeed(`Compiled ${stats.specialists} specialists`);
    }

    // Compile implementers
    if (template.agents?.implementers) {
      spinner.start('Compiling implementers...');
      const compiled = {};
      for (const [name, def] of Object.entries(template.agents.implementers)) {
        compiled[name] = await compileAgent(def, context, verbose);
        stats.implementers++;
      }
      await writeYAML(path.join(outputPath, 'implementers.yml'), { implementers: compiled });
      spinner.succeed(`Compiled ${stats.implementers} implementers`);
    }

    // Compile verifiers
    if (template.agents?.verifiers) {
      spinner.start('Compiling verifiers...');
      const compiled = {};
      for (const [name, def] of Object.entries(template.agents.verifiers)) {
        compiled[name] = await compileAgent(def, context, verbose);
        stats.verifiers++;
      }
      await writeYAML(path.join(outputPath, 'verifiers.yml'), { verifiers: compiled });
      spinner.succeed(`Compiled ${stats.verifiers} verifiers`);
    }

    // Compile utilities
    if (template.agents?.utilities) {
      spinner.start('Compiling utilities...');
      const compiled = {};
      for (const [name, def] of Object.entries(template.agents.utilities)) {
        compiled[name] = await compileAgent(def, context, verbose);
        stats.utilities++;
      }
      await writeYAML(path.join(outputPath, 'utilities.yml'), { utilities: compiled });
      spinner.succeed(`Compiled ${stats.utilities} utilities`);
    }

    // Summary
    const total = Object.values(stats).reduce((sum, count) => sum + count, 0);
    console.log('');
    console.log(chalk.green('✅ Compilation complete!'));
    console.log('');
    console.log(chalk.blue('📊 Summary:'));
    console.log(chalk.gray(`   Specialists: ${stats.specialists}`));
    console.log(chalk.gray(`   Implementers: ${stats.implementers}`));
    console.log(chalk.gray(`   Verifiers: ${stats.verifiers}`));
    console.log(chalk.gray(`   Utilities: ${stats.utilities}`));
    console.log(chalk.gray(`   Total: ${total} agents`));
    console.log('');
    console.log(chalk.gray(`   Output: ${outputPath}`));
    console.log('');

    return { success: true, stats, total };

  } catch (error) {
    spinner.fail('Compilation failed');
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    if (verbose) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

/**
 * Verify compiled agents
 */
async function verifyAgents(outputPath, verbose = false) {
  const spinner = ora('Verifying agents...').start();

  try {
    const errors = [];
    const warnings = [];

    // Check if output directory exists
    if (!await fs.pathExists(outputPath)) {
      throw new Error(`Output directory does not exist: ${outputPath}`);
    }

    // Expected files
    const expectedFiles = [
      'specialists.yml',
      'implementers.yml',
      'verifiers.yml',
      'utilities.yml',
    ];

    // Verify each file
    for (const file of expectedFiles) {
      const filePath = path.join(outputPath, file);

      if (!await fs.pathExists(filePath)) {
        errors.push(`Missing file: ${file}`);
        continue;
      }

      // Load and verify YAML
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const data = YAML.parse(content);

        // Check for unresolved placeholders
        if (!verifyCompiled(content, file)) {
          warnings.push(`Unresolved placeholders in ${file}`);
        }

        // Verify structure
        const category = file.replace('.yml', '');
        if (!data[category] || typeof data[category] !== 'object') {
          errors.push(`Invalid structure in ${file}: missing ${category} object`);
        }

        if (verbose) {
          console.log(chalk.gray(`   ✓ ${file} (${Object.keys(data[category] || {}).length} agents)`));
        }

      } catch (error) {
        errors.push(`Invalid YAML in ${file}: ${error.message}`);
      }
    }

    spinner.stop();

    // Report results
    console.log('');
    if (errors.length === 0 && warnings.length === 0) {
      console.log(chalk.green('✅ Verification passed!'));
      console.log(chalk.gray(`   All ${expectedFiles.length} files are valid`));
    } else {
      if (errors.length > 0) {
        console.log(chalk.red(`\n❌ Errors (${errors.length}):`));
        errors.forEach(err => console.log(chalk.red(`   - ${err}`)));
      }
      if (warnings.length > 0) {
        console.log(chalk.yellow(`\n⚠️  Warnings (${warnings.length}):`));
        warnings.forEach(warn => console.log(chalk.yellow(`   - ${warn}`)));
      }

      if (errors.length > 0) {
        process.exit(1);
      }
    }
    console.log('');

  } catch (error) {
    spinner.fail('Verification failed');
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    if (verbose) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  console.log(chalk.bold.blue('\n🔧 Claude Patterns Agent Compilation Tool\n'));

  if (argv.verify) {
    // Verification mode
    const outputPath = argv.verify === true ? (argv.output || './roles') : argv.verify;
    await verifyAgents(outputPath, argv.verbose);
  } else {
    // Compilation mode
    const templatePath = argv.template || path.join(__dirname, '../agents/agents-universal.yml');
    const configPath = argv.config || './.claude/config/project.yml';
    const outputPath = argv.output || './.claude/roles';

    if (argv.verbose) {
      console.log(chalk.blue('📁 Paths:'));
      console.log(chalk.gray(`   Template: ${templatePath}`));
      console.log(chalk.gray(`   Config: ${configPath}`));
      console.log(chalk.gray(`   Output: ${outputPath}\n`));
    }

    await compileAgents(templatePath, configPath, outputPath, argv.verbose);
  }
}

// Run
main().catch(error => {
  console.error(chalk.red(`\n❌ Fatal error: ${error.message}`));
  process.exit(1);
});
