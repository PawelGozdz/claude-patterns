---
id: TASK-COLLECTOR-003
title: 'grantflow spool show — lokalny podgląd dnia z bufora sygnałów (kontrola sensu danych przed ingestem)'
type: task
status: todo
priority: P1
created_date: 2026-09-12
updated_date: 2026-09-12
epic_id: EP-COLLECTOR-0
story_points: 2
dependencies: [TASK-COLLECTOR-001]
blocks: []
---

# TASK-COLLECTOR-003 — Podgląd dnia z bufora

**Epik:** [EP-COLLECTOR-0](./EP-COLLECTOR-0.md). **Kanon:** `/opt/projects/grant-flow/docs/product/work-ledger-canon.md` §3.2 (kalibracja, D1).

## Cel

Zanim grant-flow zacznie liczyć, właściciel musi zobaczyć na oko, czy sygnały mają sens:
które repo, kiedy, ile tur agenta, ile promptów, ile commitów, gdzie brakuje `taskKey`.
To narzędzie **nie liczy godzin** i niczego nie wysyła.

## Zakres

1. `grantflow spool show [YYYY-MM-DD]` (domyślnie dziś): czyta wszystkie pliki dnia z bufora,
   scala i sortuje po `ts`, drukuje:
   - oś czasu per repozytorium (pierwszy/ostatni sygnał, liczba promptów, tur, commitów,
     liczba okien `tool`),
   - tury agenta (`prompt → session.stop`) z długością i tym, czy w trakcie był `waiting`,
   - sygnały bez `repositoryRef` i bez `taskKey` (kandydaci do wiadra „nieprzypisane"),
   - obecność z `presence` (jeśli jest): łączny czas nieidle, luki > 15 min.
2. `--json` do dalszej obróbki; `--validate` sprawdza każdą linię wobec JSON Schema
   z TASK-COLLECTOR-001 i wypisuje błędy.
3. Bez interpretacji „godzin człowieka" — tylko surowe liczby i przedziały. Jeśli ktoś chce
   liczbę godzin, odsyła do kanonu §2.11 (silnik w grant-flow).

## Kryteria akceptacji

- [ ] Działa na przykładowym dniu z `examples/` i na realnym buforze właściciela
- [ ] 4 równoległe sesje tego samego repo pokazane jako jedno repo z 4 sesjami
- [ ] `--validate` wykrywa linię niezgodną ze schematem (test)
- [ ] Czas działania < 2 s dla 50 k linii

## Pliki (planowane)

- `tools/integrations/grant-flow/grantflow-spool` (+ `lib/spool-reader.js`)
- `skills/integrations/grantflow/SKILL.md` — sub-komenda `spool show`
