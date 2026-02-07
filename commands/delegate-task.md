# Delegate Task Command

Explicitly delegate a task to a specific agent with proper context loading.

---

## Usage

Use this command when you want to:
- Route work to a specific specialized agent
- Ensure proper agent context is loaded
- Track which agent is working on what

**Syntax:**
```
/delegate-task <agent-name> <task-description>
```

---

## Available Agents for Delegation

### Implementers (Code Creation)

**@domain-layer-implementer**
- Aggregates, entities, value objects
- Domain events, policies, services
- Pure business logic

**@application-layer-implementer**
- Command and query handlers
- Application services
- DTOs and mappers

**@infrastructure-api-implementer**
- REST API controllers
- Repositories (Kysely)
- Validation schemas (Zod)
- Rate limiting

**@testing-implementer**
- Unit tests (@vytches/ddd-testing)
- Integration tests
- E2E tests (TestContainers)

### Verifiers (Quality Assurance)

**@domain-verifier**
- Result pattern validation
- No exceptions in domain
- Value object correctness

**@application-verifier**
- CQRS structure validation
- BaseHandler usage
- Hybrid error handling

**@security-verifier**
- OWASP compliance
- Rate limiting presence
- PII handling validation

**@e2e-verifier** (VETO POWER)
- Acceptance criteria validation
- Integration testing
- Can block task completion

---

## Examples

### Delegate domain implementation:
```
/delegate-task domain-layer-implementer Create UserProfile aggregate with email change functionality
```

### Delegate testing:
```
/delegate-task testing-implementer Create comprehensive tests for UserProfile aggregate
```

### Delegate verification:
```
/delegate-task e2e-verifier Verify user-profile-update feature meets all acceptance criteria
```

---

## What Happens Under the Hood

When you delegate a task:

1. **Agent Selection**: Specified agent is activated
2. **Context Loading**:
   - ENV config with agent preferences
   - Agent-specific knowledge patterns
   - Global patterns library
   - Relevant ADRs
   - Reference implementations
3. **Hooks Activation**:
   - Pre-edit hooks load context
   - Post-edit hooks validate output
4. **Memory Update**:
   - Task history recorded
   - Patterns captured
   - Metrics logged

---

## Orchestrator vs Direct Delegation

**Use Orchestrator** (default):
- For complete features requiring multiple agents
- When you want automatic phase management
- For optimal context efficiency

**Use Direct Delegation** (this command):
- For single-layer work
- When you know exactly which agent you need
- For quick iterations on specific code

---

## Verification Note

Even with direct delegation, verifiers will still run:
- Pre-edit hooks validate against anti-patterns
- Post-edit hooks check compliance
- Final verification before task completion

The VETO power of @e2e-verifier is always respected.
