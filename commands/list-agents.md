# List Agents Command

Show all available agents from YAML registry with their specializations.

---

Please execute the following bash script to list all agents:

```bash
./.claude/scripts/view-agent-knowledge.sh
```

This will display:
- All implementer agents (domain, application, infrastructure, testing)
- All verifier agents (domain, application, security, e2e)
- Pattern counts per agent
- Last update timestamps

For detailed information about a specific agent, use the bash script directly:

```bash
./.claude/scripts/view-agent-knowledge.sh <agent-type>
```

Where `<agent-type>` can be:
- `domain-layer`
- `application-layer`
- `infrastructure-api`
- `testing`
- `verification`
