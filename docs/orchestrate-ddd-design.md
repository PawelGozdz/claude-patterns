# Design: /orchestrate-ddd — dyrygent na ECC (1D)

> Źródło ustaleń: claude-code-guide (mechanika CC, czerwiec 2026) + audyt ECC. Status: DESIGN.

## Cel
Jeden punkt wejścia `/orchestrate-ddd <task>`, który **automatycznie** rozwija się w wieloagentową
pracę w tle (loops + ecc:* agenci + nasze bramki), bez ręcznego wołania `/loop`, `/ecc:loop-start`,
`@ecc:architect` przez użytkownika.

## Mechanika (KLUCZOWE — z dokumentacji CC)
- Skill/komenda **NIE** może programowo wołać `/loop`/`/goal`/innych skilli — tylko instruować Claude'a.
- Prawdziwe silniki „jeden wpis → wielu agentów w tle":
  - **Workflow** (JS, do 16 równoległych agentów, runs w tle, zwraca jeden wynik; można zapisać jako `/orchestrate-ddd`).
  - **/goal** (autonomiczna pętla „pracuj aż warunek", Stop-hook + evaluator).
- Agent tool `subagent_type` przyjmuje namespaced agentów pluginu (np. `ecc:architect`).
- Hooki NIE wyzwalają nowej iteracji — tylko przedłużają turę (`decision: block` + `additionalContext`).
- Zagnieżdżanie subagentów: do ~5 poziomów.
- „W tle" = w obrębie otwartej sesji (cross-restart = scheduled tasks, później).

## Architektura
```
/orchestrate-ddd <task>   (skill = nasz dyrygent)
   ↓ instruuje Claude'a, by uruchomił Workflow (i/lub /goal)
   ↓ Workflow script orkiestruje stage'e:
        research   → ecc:architect / code-architect (grounded w Rule Cards)
        implement  → subagent implementer (gated: check-delegation)
        verify     → verification-loop (build→type→lint→test)
        review     → NASZE VETO verifiers (per stack)  ← bramka
        eval/stop  → /security-review PASS + acceptance evals  ← META pętli
   ↓ praca na branchu/worktree; commit per-iteracja na branchu roboczym
   ↓ KONIEC → użytkownik robi code-review + merge do main  (zasada commit-review)
```

## Wspólne vs per-stack
- **Silnik wspólny** (ddd/python/flutter): orch-pipeline (klasyfikator + bramki),
  continuous-agent-loop (router), autonomous-loops (szablony), loop-operator (monitoring).
- **Bramki per-preset** (to nasz moat = sensowna meta): VETO verifiers danego stacku + Rule Cards
  + security-review. Preset YAML (`presets/<stack>.yml`) deklaruje `loop.stages` i `loop.gate`.

## Elementy ECC do reużycia (nie reimplementować)
| Element | Ścieżka ECC | Rola |
|---|---|---|
| orch-pipeline | skills/orch-pipeline | klasyfikator rozmiaru + 2 bramki |
| continuous-agent-loop | skills/continuous-agent-loop | router wzorca pętli na starcie |
| autonomous-loops | skills/autonomous-loops | szablony (sequential, de-sloppify, RFC-DAG) |
| loop-operator | agents/loop-operator | stall detection + eskalacja |
| verification-loop | skills/verification-loop | CI gates (build/type/lint/test) |
| eval-harness + agent-evaluator | skills/eval-harness, agents/agent-evaluator | acceptance + ocena per-faza |
| worktree-lifecycle.js + orchestrate-worktrees.js | scripts/ | izolacja równoległa (Ralphinho, etap 2) |

## Droga prosty → Ralphinho (jeden silnik, dodawane warstwy)
- **Etap 1 (teraz):** liniowy Workflow / `/goal` — jedno zadanie, stage'e jw., stop na acceptance.
- **Etap 2 (Ralphinho):** Workflow z pipeline()+parallel() + worktree isolation + merge-queue
  (reużyć orchestrate-worktrees.js). RFC → dekompozycja → DAG → równolegle.

## Zgodność z preferencją commitów
Workflow/loop pracuje na branchu/worktree (commity = rollback points), ale **finalny merge do main
robi użytkownik po review**. Na starcie loop pyta: commity w międzyczasie tak/nie. (Patrz memory:
commit-review-workflow-preference.)

## Worked example — pełny flow DDD warstwowy (kanoniczny use-case)
Sekwencja po warstwach z wewnętrzną pętlą napraw, stop = werdykt VETO:
```
0 threat-model (jeśli auth/PII/cross-context)
1 analiza techniczna (architect → plan + wzorce)
2 DOMENA:        implement→verify→fix ⟲ aż code-quality-verifier GO
3 APLIKACJA:     implement→verify→fix ⟲ aż GO   (zależy od domeny)
4 INFRA+testy:   implement→verify→fix ⟲ aż GO   (implementuje porty domeny)
5 akceptacja:    security-e2e-verifier potwierdza całość → DONE
```
Mechanika (Workflow): pętla `do{ implement; verdict=verify; if(!pass) fix }while(!verdict.pass && tries<MAX)`
per warstwa; warunek stopu = `verdict.pass` naszego VETO verifiera. Kolejność warstw wymuszona
zależnościami DDD (domena→aplikacja→infra). Wewnątrz warstwy pliki mogą iść równolegle (Ralphinho, etap 2).

User wpisuje jedno: `/orchestrate-ddd implement <Context> wg <TASK>` → leci w tle → review+merge na końcu.

Most ręczny (przed Fazą 1, z ECC zainstalowanym): /threat-model → @ecc:architect → /orchestrate per
warstwa (implement→validate→fix) → /security-review. Działa, ale user jest pętlą. Faza 1 to automatyzuje.

## Decyzje otwarte
1. `/orchestrate-ddd` jako zapisany Workflow vs skill instruujący Workflow ad-hoc (skłaniam się: skill
   generujący/uruchamiający Workflow z presetu — elastyczniejsze).
2. Czy zostawić stary `/orchestrate` (jeden-przebieg) jako fallback do czasu walidacji (tak).
