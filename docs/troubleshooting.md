# Troubleshooting Guide

Common issues and solutions for global Claude patterns repository.

---

## Table of Contents

- [Symlink Issues](#symlink-issues)
- [Pattern Not Loading](#pattern-not-loading)
- [Windows Compatibility](#windows-compatibility)
- [Git Issues](#git-issues)
- [METADATA Validation Errors](#metadata-validation-errors)
- [Test Failures](#test-failures)

---

## Symlink Issues

### Problem: Symlink appears broken

**Symptoms**:
```bash
$ ls -la .claude/knowledge/patterns
lrwxrwxrwx 1 user user 45 Feb  5 16:11 patterns -> /home/user/.claude-patterns/patterns (broken)
```

**Solution 1**: Verify global patterns exist
```bash
# Check if global repo exists
ls ~/.claude-patterns/patterns/

# If not found, extract patterns first
cd ~/.claude-patterns
./scripts/extract-patterns.sh
```

**Solution 2**: Re-create symlink
```bash
cd ~/my-project/.claude/knowledge
rm patterns
ln -sf ~/.claude-patterns/patterns patterns
```

### Problem: Permission denied when creating symlink

**Symptoms**:
```bash
$ ln -sf ~/.claude-patterns/patterns patterns
ln: failed to create symbolic link 'patterns': Permission denied
```

**Solution**:
```bash
# Check directory ownership
ls -la .claude/knowledge/

# Fix ownership if needed
sudo chown -R $USER:$USER .claude/

# Try again
ln -sf ~/.claude-patterns/patterns patterns
```

---

## Pattern Not Loading

### Problem: Claude doesn't see patterns

**Symptoms**:
- Claude responses don't reference patterns
- Agent mentions pattern not found

**Solution 1**: Verify symlink exists and is correct
```bash
# Check symlink
ls -la .claude/knowledge/patterns

# Verify target exists
ls ~/.claude-patterns/patterns/domain/

# Count accessible patterns
find .claude/knowledge/patterns -name "*.md" -not -name "README.md" | wc -l
# Should show 13+ patterns
```

**Solution 2**: Check METADATA.yml validity
```bash
cd ~/.claude-patterns
./scripts/validate-metadata.sh
```

**Solution 3**: Verify Claude Code settings
```bash
# Check Claude settings
cat .claude/settings.json | grep patterns

# Restart Claude Code
# (exit and re-enter project)
```

---

## Windows Compatibility

### Problem: Symlinks don't work on Windows native

**Symptoms**:
- `ln -sf` command not found (CMD/PowerShell)
- Symlink created but doesn't work

**Solution 1**: Use WSL2 (Recommended)
```bash
# Install WSL2 if not already installed
wsl --install

# Clone project in WSL2 filesystem
cd ~
git clone <your-project-url>

# Setup patterns (works like Linux)
~/.claude-patterns/scripts/setup-project.sh ~/my-project
```

**Solution 2**: Use junction points (Windows native)
```cmd
# CMD (Run as Administrator)
mklink /J .claude\knowledge\patterns %USERPROFILE%\.claude-patterns\patterns

# Verify
dir .claude\knowledge\patterns
```

**Solution 3**: Use hardlinks (Windows fallback)
```powershell
# PowerShell (Run as Administrator)
New-Item -ItemType Junction -Path .\.claude\knowledge\patterns -Target $env:USERPROFILE\.claude-patterns\patterns

# Verify
Get-ChildItem .\.claude\knowledge\patterns
```

**Note**: Junction points work similarly to symlinks but are Windows-specific.

---

## Git Issues

### Problem: Git shows patterns as modified after symlink

**Symptoms**:
```bash
$ git status
typechange: .claude/knowledge/patterns/domain/aggregate-pattern.md
```

**Solution**: This is expected
```bash
# This is NORMAL behavior when converting files to symlinks
# Git sees: file (mode 100644) → symlink (mode 120000)

# Commit the typechange
git add .claude/knowledge/patterns/
git commit -m "Convert patterns to symlinks"
```

### Problem: Git clone doesn't preserve symlinks

**Symptoms**:
- After `git clone`, patterns/ is empty or broken

**Solution**: Re-run setup script
```bash
# After cloning project
git clone <project-url>
cd <project>

# Setup symlinks (they're not stored in git)
~/.claude-patterns/scripts/setup-project.sh .

# Verify
ls -la .claude/knowledge/patterns
```

### Problem: .gitignore excludes symlinks

**Symptoms**:
- Symlinks not tracked by git

**Solution**: Ensure .gitignore doesn't exclude symlinks
```bash
# Check .gitignore
cat .gitignore | grep patterns

# If patterns/ is ignored, add exception
echo "!.claude/knowledge/patterns" >> .gitignore

# Commit
git add .gitignore
git commit -m "Allow patterns symlink in git"
```

---

## METADATA Validation Errors

### Problem: "Invalid YAML syntax" error

**Symptoms**:
```bash
$ ./scripts/validate-metadata.sh
❌ Invalid YAML syntax: patterns/domain/METADATA.yml
```

**Solution**: Fix YAML formatting
```bash
# Check YAML syntax manually
cat patterns/domain/METADATA.yml

# Common issues:
# - Missing colon after key
# - Incorrect indentation (use spaces, not tabs)
# - Unquoted strings with special characters
# - Missing quotes around dates

# Use online YAML validator if needed
# https://www.yamllint.com/

# Re-validate
./scripts/validate-metadata.sh
```

### Problem: "Missing required fields" error

**Symptoms**:
```bash
$ ./scripts/validate-metadata.sh
❌ Missing fields: version stack_support
```

**Solution**: Add required fields
```yaml
# METADATA.yml must have these fields:
version: "1.0"
layer: "domain"  # or "application", "architecture"
stack_support:
  - typescript
  - python
patterns:
  - name: aggregate-pattern.md
    stacks: [typescript]
    maturity: production
    last_verified: 2026-02-05
```

---

## Test Failures

### Problem: Tests fail after adding symlinks

**Symptoms**:
```bash
$ npm run test
FAIL  src/...
Error: Pattern not found
```

**Solution 1**: Verify symlinks exist
```bash
# Check patterns are accessible
ls .claude/knowledge/patterns/domain/

# If broken, re-create symlinks
~/.claude-patterns/scripts/setup-project.sh .
```

**Solution 2**: Run baseline test comparison
```bash
# 1. Remove symlinks temporarily
cd .claude/knowledge
rm patterns
cp -r patterns.backup patterns

# 2. Run tests (baseline)
npm run test
# Note the results (e.g., "171 failed, 16239 passed")

# 3. Restore symlinks
rm -rf patterns
ln -sf ~/.claude-patterns/patterns patterns

# 4. Run tests again
npm run test
# Should have IDENTICAL results

# If results differ, symlinks may be broken
```

**Solution 3**: Check for LocalHero-specific patterns
```bash
# Ensure LocalHero-specific patterns remain local
# (infrastructure/, testing/, cross-layer/, and 5 architecture/ patterns)

ls .claude/knowledge/patterns/infrastructure/
# Should show files, NOT symlinks

ls .claude/knowledge/patterns/architecture/
# Should show BOTH symlinks (3) and local files (5)
```

---

## Performance Issues

### Problem: Slow pattern loading

**Symptoms**:
- Claude Code takes long to start
- Pattern loading timeout

**Solution 1**: Reduce pattern count (selective symlink)
```bash
# Instead of symlinking all patterns, symlink only needed ones
cd .claude/knowledge/patterns/domain
rm *.md
ln -sf ~/.claude-patterns/patterns/domain/aggregate-pattern.md .
ln -sf ~/.claude-patterns/patterns/domain/value-object-pattern.md .
# (only link patterns you use)
```

**Solution 2**: Use patterns-local/ for project
```bash
# Copy frequently-used patterns to patterns-local/
# (faster than symlink traversal in some cases)
cp ~/.claude-patterns/patterns/domain/aggregate-pattern.md .claude/knowledge/patterns-local/domain/
```

---

## Stack Tag Issues

### Problem: Pattern shown in wrong stack project

**Symptoms**:
- Python project loads TypeScript-specific patterns
- Generic patterns excluded

**Solution**: Check METADATA.yml stack tags
```yaml
# patterns/domain/METADATA.yml
patterns:
  - name: aggregate-pattern.md
    stacks: [typescript]  # Only for TypeScript projects
  - name: value-object-pattern.md
    stacks: [typescript, python]  # For both
  - name: domain-event-pattern.md
    stacks: [generic]  # For all languages
```

---

## Getting Help

If you encounter issues not covered here:

1. **Check git history**: See what changed
   ```bash
   cd ~/.claude-patterns
   git log --oneline
   git show <commit-hash>
   ```

2. **Validate setup**: Re-run setup script
   ```bash
   ~/.claude-patterns/scripts/setup-project.sh ~/my-project
   ```

3. **Test global patterns**: Verify extraction worked
   ```bash
   cd ~/.claude-patterns
   ./scripts/validate-metadata.sh
   ls -lh patterns/*/*.md
   ```

4. **Reset to backup**: If all else fails
   ```bash
   cd ~/my-project/.claude/knowledge
   rm patterns
   cp -r patterns.backup patterns
   # (back to original state)
   ```

---

**Last Updated**: 2026-02-05
**Version**: 1.0
**Task**: TS-INFRA-002 (Global Patterns Repository)
