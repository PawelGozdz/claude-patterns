# Verify Agent Command

Check if an agent exists in the registry and validate its configuration.

---

## Usage

This command helps you:
- Verify agent exists before delegation
- Check agent configuration
- Validate YAML registry integrity

**Syntax:**
```
/verify-agent <agent-name>
```

---

## Verification Checks

When you run this command, it performs:

### 1. Registry Existence Check
```bash
# Checks if agent exists in YAML registry
yq eval '.agents | has("agent-name")' .claude/agents/registry/implementers.yaml
yq eval '.agents | has("agent-name")' .claude/agents/registry/verifiers.yaml
```

### 2. Configuration Validation
- Agent type (implementer/verifier)
- Layer assignment
- Responsibilities defined
- Auto-trigger keywords present
- VETO power flag (verifiers only)

### 3. Knowledge Base Check
- Agent knowledge file exists
- Pattern count
- Last update timestamp

### 4. ENV Configuration Check
- Agent preferences in env-config.json
- Preferred environment
- Auto-migration setting
- Log level

### 5. Hook Integration Check
- Pre-edit hooks configured
- Post-edit hooks configured
- Verification hooks (verifiers only)

---

## Example Usage

### Verify domain implementer:
```
/verify-agent domain-layer-implementer
```

**Expected Output:**
```
✅ Agent Verification: domain-layer-implementer

Registry Status: ✅ FOUND
  Type: implementer
  Layer: domain
  File: .claude/agents/registry/implementers.yaml

Responsibilities: ✅ DEFINED
  • Aggregates and entities
  • Domain events
  • Value objects
  • Domain services
  • Policies

Auto-Triggers: ✅ CONFIGURED
  • domain/aggregates/
  • *Aggregate.ts
  • *Event.ts
  • implement aggregate

Knowledge Base: ✅ EXISTS
  File: .claude/memory/agent-knowledge/domain-layer-patterns.md
  Patterns: 5
  Last Updated: 2025-10-11

ENV Configuration: ✅ CONFIGURED
  Preferred Env: development
  Auto-migrate: false
  Log Level: debug

Hooks: ✅ INTEGRATED
  Pre-edit: context-aware.sh --scope=domain
  Post-edit: post-edit-consistency.sh --check=ddd-patterns

Status: ✅ READY FOR DELEGATION
```

### Verify verifier with VETO power:
```
/verify-agent e2e-verifier
```

**Expected Output:**
```
✅ Agent Verification: e2e-verifier

Registry Status: ✅ FOUND
  Type: verifier
  Layer: cross-cutting
  File: .claude/agents/registry/verifiers.yaml
  ⚠️  VETO POWER: YES (can block task completion)

Responsibilities: ✅ DEFINED
  • E2E test validation
  • Acceptance criteria verification
  • Integration testing
  • Quality gates enforcement

Knowledge Base: ✅ EXISTS
  File: .claude/memory/agent-knowledge/verification-patterns.md
  Patterns: 3
  Last Updated: 2025-10-11

ENV Configuration: ✅ CONFIGURED
  Preferred Env: test
  Auto-migrate: true
  Log Level: error

Hooks: ✅ INTEGRATED
  Pre-verification: quality-gates.sh
  Post-verification: final-verification-audit.sh

Status: ✅ READY FOR VERIFICATION
VETO Authority: ACTIVE ⚠️
```

---

## Error Cases

### Agent Not Found:
```
❌ Agent Verification Failed: non-existent-agent

Registry Status: ❌ NOT FOUND
  Checked: implementers.yaml
  Checked: verifiers.yaml

Suggestion: Use /list-agents to see available agents
```

### Configuration Issues:
```
⚠️  Agent Verification: domain-layer-implementer

Registry Status: ✅ FOUND
Knowledge Base: ❌ MISSING
  Expected: .claude/memory/agent-knowledge/domain-layer-patterns.md
  Action: Run ./claude/scripts/update-agent-knowledge.sh to initialize

Status: ⚠️  INCOMPLETE - needs knowledge base setup
```

---

## Manual Verification Script

For command-line validation:

```bash
# Check if agent exists
yq eval '.agents | keys | .[]' .claude/agents/registry/implementers.yaml | grep "agent-name"

# View full agent configuration
yq eval '.agents["agent-name"]' .claude/agents/registry/implementers.yaml

# Check knowledge base
cat .claude/memory/agent-knowledge/domain-layer-patterns.md | head -10

# Validate ENV config
jq '.agent_environment_preferences["agent-name"]' .claude/env/env-config.json
```

---

## When to Use This Command

**Before delegation:**
- Verify agent exists
- Check if properly configured
- Ensure knowledge base is set up

**After registry changes:**
- Validate YAML syntax
- Confirm hooks integration
- Test agent availability

**Debugging:**
- Agent not responding as expected
- Hook failures
- Context loading issues
