<!--
  Przykład zalążka (ADR 0013) — wygenerowany przez scripts/blog-seed-emit.mjs z syntetycznego payloadu.
  Plików zalążków NIE pisze się ręcznie: powstają w <repo-bloga>/stage/{inbox,dry-run}/RRRR-MM-DD/.
  Człowiek edytuje tylko: status, odpowiedzi w "Pytania do autora", links.
  Walidacja: node <claude-patterns>/scripts/blog-seed-validate.mjs <plik> --blog <repo-bloga>
-->
---
schema: blog-seed-v1
seed_id: c1d4f952-f58f-4917-bcc5-2d76f2b65df6
created: 2026-10-12
updated: 2026-10-12
mode: dry-run
status: new
source:
  kind: analyze
  trigger: decision
  ref_private: bsr_c51065905cc392bb
  area: platforma diagnostyczna — walidacja zakresu
target:
  blog: product
  confidence: high
  test_answer: nie, dotyczy produktu
  reason: opis działania funkcji
  angle: null
  sibling_seed: null
suggested:
  format: decision
  pillar: decisions
  length: 600-1200
score:
  total: null
  breakdown: {}
gates:
  security: pass
  evidence: pass
  consent: pass
  duplicate: pass
security:
  tier: green
  deny_list_version: 2026-10-12
  redactions:
    - kind: commit_hash
      count: 1
    - kind: project_name
      count: 1
    - kind: rel_path
      count: 1
    - kind: repo_name
      count: 1
    - kind: source_ref
      count: 1
suppressed: null
dedup_key: 6b8cac45de1f4abcd576830cb2b10f06
links:
  related_seeds: []
  related_posts: []
author_input:
  status: none
  inferred: []
draft_path: null
---

# Dlaczego odrzuciliśmy ostrzeżenia na rzecz twardej odmowy

## Kontekst

_brak_

## Fakty

- [FAKT] W [usunięto: identyfikator] zmieniono tryb z ostrzeżenia na odmowę w pliku [usunięto: rel_path] (commit [usunięto: commit_hash]).
- [FAKT] Projekt platforma diagnostyczna używa [usunięto: nazwa repo].

## Decyzja i alternatywy

- [FAKT] Wybór: twarda odmowa
- [FAKT] Odrzucone: ostrzeżenie — powód: użytkownicy je ignorowali

## Co poszło nie tak

_brak_

## Dowody

| Twierdzenie | Typ | Pochodzenie | Forma publiczna |
|---|---|---|---|
| decyzja zapisana w artefakcie analizy | decision | zmierzone | decyzja zapisana w artefakcie analizy |

## Liczby

_brak_

## Hipoteza (agent)

_brak_

## Czego nie wiem

- ile fałszywych odmów pojawi się w praktyce

## Pytania do autora

- question: "Co przesądziło o odmowie?"
  answer: null

## Proponowany kształt

- Format: decision; filar: decisions; długość: 600-1200 słów
