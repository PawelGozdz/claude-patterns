# Agent Info Command

Show detailed information about a specific agent including responsibilities, patterns, and statistics.

---

Please provide the agent name you want to get information about.

**Available agents:**

**Implementers:**
- `domain-layer-implementer` - Domain aggregates, events, value objects
- `application-layer-implementer` - CQRS handlers, commands, queries
- `infrastructure-api-implementer` - Controllers, repositories, API schemas
- `testing-implementer` - Unit, integration, and E2E tests

**Verifiers:**
- `domain-verifier` - Domain layer validation
- `application-verifier` - Application layer validation
- `security-verifier` - Security and OWASP compliance
- `e2e-verifier` - End-to-end validation (VETO POWER)

---

## Usage Examples

To get information about domain layer implementer:
```bash
/agent-info domain-layer-implementer
```

To view agent patterns and knowledge:
```bash
./.claude/scripts/view-agent-knowledge.sh domain-layer
```

To see agent details from YAML registry:
```bash
cat .claude/agents/registry/implementers.yaml | grep -A 20 "domain-layer-implementer"
```

---

## Agent Information Includes

- **Type**: Implementer or Verifier
- **Layer**: Domain, Application, Infrastructure, or Cross-cutting
- **Responsibilities**: What this agent does
- **Auto-trigger keywords**: File patterns that activate this agent
- **Patterns discovered**: Number of patterns in knowledge base
- **Last activity**: When this agent last contributed
- **VETO power**: Whether agent can block task completion
