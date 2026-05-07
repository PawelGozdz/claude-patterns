# Finance Skills Eval Framework

Vendored from `finance-skills-workspace/` in
[JoelLewis/finance_skills](https://github.com/JoelLewis/finance_skills) (MIT).

## What's Here

```
tests/finance-evals/
├── evals.json              # eval cases (questions + expected reasoning)
├── grade_responses.py      # automated grading harness
├── iteration-1/            # first round of test responses + grades
└── iteration-2/            # second round (improved skills)
```

## Purpose

Validate that finance skills produce **accurate, properly-hedged, citation-rich**
analysis — not hallucinated numbers or dangerously confident regulatory claims.

The grading harness reads questions from `evals.json`, compares model
output against expected reasoning patterns, and produces per-skill scores.

## Running

This is a **reference framework**, not auto-wired into our CI. To use:

```bash
cd tests/finance-evals
python grade_responses.py --iteration 2 --skill return-calculations
```

Specific usage depends on upstream's harness — see comments in
`grade_responses.py`. Re-syncing from upstream via
`scripts/sync-finance-skills.sh` will refresh this folder.

## Adding to Project CI (optional)

If a project wants to validate its finance-related outputs:

1. Pin a specific iteration as the baseline
2. Wire `python grade_responses.py` into project's test job
3. Add threshold gates (e.g., minimum score per critical skill)

We don't enforce this from claude-patterns — it's opt-in per project.

## License

MIT — see [upstream LICENSE](https://github.com/JoelLewis/finance_skills/blob/main/LICENSE).
