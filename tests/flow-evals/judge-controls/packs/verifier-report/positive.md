# Raport weryfikatora — warstwa application (TASK-DEMO-001)

📚 Patterns read: command-handler-pattern_summary.md (CH1-CH11), aggregate-pattern_summary.md (A1-A6, N1-N6)

## Zakres

LAYER_SCOPE: application · dirs: src/contexts/demo/application/

## Werdykt per plik

| file | rules_checked (IDs) | violations (ruleID @ file:line) | verdict (PASS/WARN/VETO) |
| --- | --- | --- | --- |
| create-demo.handler.ts | CH1,CH2,CH8,CH11 | CH8 @ create-demo.handler.ts:41 (brak @Transactional na zapisie agregatu) | VETO |
| create-demo.command.ts | CH1 | — | PASS |
| demo.aggregate.ts | A1,A3,N1,N6 | — | PASS |

## Werdykt końcowy

VETO — 1 naruszenie: CH8 @ create-demo.handler.ts:41.

## Pokrycie

Sprawdzone pliki: 3/3 w LAYER_SCOPE. Nie sprawdzono: warstwy infrastructure (poza zakresem tej weryfikacji).
