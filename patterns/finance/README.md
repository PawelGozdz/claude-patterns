# Finance Patterns

Architectural patterns specific to finance workflows. These describe **how
finance skills are structured, layered, and disclaimed** — not the
tactical content of the skills themselves (which lives in
[`skills/finance/`](../../skills/finance/)).

## Patterns

| Pattern | Status | Description |
|---|---|---|
| [layered-knowledge-pattern.md](layered-knowledge-pattern.md) | Production | 8-layer knowledge architecture (Layer 0 math foundations → Layer 7 reporting/behavioral) crossed with 7 functional plugins. Tools for navigating 84 interrelated skills. |
| [regulatory-disclaimer-pattern.md](regulatory-disclaimer-pattern.md) | Production | Contextual disclaimer system — 6 categories with specific phrasing, applied selectively based on question type. Replaces boilerplate "consult an advisor" deflections. |

## Why a Separate Layer

Finance tasks have constraints other domains don't:

- **Regulatory exposure**: Reg BI, KYC, AML, fiduciary standards have
  specific requirements that can't be summarized casually
- **Numerical precision**: 0.5% rounding error on a return calculation
  matters; agents need to call vetted scripts, not improvise math
- **Layered knowledge**: portfolio construction (Layer 4) depends on risk
  measurement (Layer 1) which depends on returns (Layer 0) — knowledge
  paths must be respected
- **Hedged communication**: overconfident finance advice creates legal
  risk; refusing-to-engage finance advice creates user frustration. The
  pattern prescribes the calibration.

## Related

- Skills: [`skills/finance/`](../../skills/finance/) — 84 vendored skills
- Plugin map: [`skills/finance/PLUGINS.md`](../../skills/finance/PLUGINS.md)
- Agent: [`agents/universal/finance-strategist.md`](../../agents/universal/finance-strategist.md)
- Command: [`commands/finance.md`](../../commands/finance.md)
- Tests: [`tests/finance-evals/`](../../tests/finance-evals/)
