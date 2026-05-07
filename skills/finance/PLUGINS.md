# Finance Skills — Plugin Map & Dependencies

84 skills organized into 7 plugins with explicit dependency graph.

## Dependency Graph

```
core (3 skills, math/stats foundations)
   │
   ├─→ wealth-management (32) — investment, portfolio, personal finance
   │     │
   │     └─→ advisory-practice (12) — client-facing systems
   │
   ├─→ compliance (16) — SEC/FINRA, KYC, AML, Reg BI, fiduciary
   ├─→ trading-operations (9) — order lifecycle, execution, settlement
   ├─→ client-operations (8) — account opening, transfers, reconciliation
   └─→ data-integration (4) — reference data, market data, integration
```

## Plugin Catalog

| Plugin | Skills | Depends on | What it covers |
|---|---|---|---|
| **core/** | 3 | — | Math/stats foundations (return calc, TVM, statistics). Always required. |
| **wealth-management/** | 32 | core | Risk measurement, asset classes, valuation, portfolio construction, policy, personal finance, behavioral finance, reporting. |
| **compliance/** | 16 | core | US securities regulatory guidance: suitability, KYC/AML, Reg BI, fiduciary standards, conflicts of interest, examination readiness. |
| **advisory-practice/** | 12 | core, wealth-management | Advisor-facing workflows: client onboarding, CRM, portfolio systems, reporting, review prep. |
| **trading-operations/** | 9 | core | Order lifecycle, execution, settlement, margin, trade compliance. |
| **client-operations/** | 8 | core | Account lifecycle, transfers, reconciliation, corporate actions. |
| **data-integration/** | 4 | core | Reference data, market data, integration patterns, data quality. |

## How dependencies work

When the user enables a plugin in `project.yml`, **all dependencies are
implicitly required**. The `@finance-strategist` agent enforces this — if a
project enables `advisory-practice` but not `core`, the agent reports a
configuration error before doing analysis.

Practical config in `project.yml`:

```yaml
skills:
  - finance/core
  - finance/wealth-management   # for any investment context
  - finance/compliance          # for any regulated US/SEC context
  # advisory-practice, trading-operations, client-operations,
  # data-integration — opt-in based on what the project actually does
```

Or all-or-nothing:

```yaml
skills:
  - finance   # all 7 plugins, all 84 skills
```

## Layer Architecture

Independent of plugin grouping, every SKILL.md declares a `## Layer N`
header. Layers describe **knowledge depth**, plugins describe **functional
domain**:

| Layer | Topic |
|---|---|
| **0** | Mathematical foundations (returns, statistics, TVM) — in `core/` |
| **1a** | Historical risk measurement |
| **1b** | Forward-looking risk modeling |
| **2** | Asset classes (equities, fixed income, FX, real assets, alternatives) |
| **3** | Valuation (DCF, relative, multiples) |
| **4** | Portfolio construction (allocation, rebalancing, optimization) |
| **5** | Policy & planning (IPS, tax efficiency, distributions) |
| **6** | Personal finance (savings, debt, emergency fund, retirement) |
| **7** | Behavioral finance, reporting, communication |

Skills in `wealth-management/` span layers 1-7. Skills in other plugins
operate at the workflow level (no explicit layer; they apply concepts
from `core/` and `wealth-management/`).

## Reading Order for New Projects

1. **Always**: `core/return-calculations`, `core/time-value-of-money`,
   `core/statistics-fundamentals`
2. **For investment work**: `wealth-management/historical-risk`,
   `wealth-management/asset-allocation`, `wealth-management/rebalancing`
3. **For US regulated context**: `compliance/suitability-and-best-interest`,
   `compliance/kyc-and-customer-identification`, `compliance/reg-bi-overview`
4. **For advisor workflows**: `advisory-practice/client-onboarding`,
   `advisory-practice/crm-client-lifecycle`

## See Also

- [`README.md`](README.md) — overview and attribution
- [`agents/universal/finance-strategist.md`](../../agents/universal/finance-strategist.md) — coordinator agent
- [`commands/finance.md`](../../commands/finance.md) — `/finance` slash command
- [`patterns/finance/`](../../patterns/finance/) — architectural patterns (layered knowledge, regulatory disclaimer)
