# Jak używać ECC + nasz setup (claude-patterns)

> Status: ECC zainstalowany globalnie jako plugin (2026-06). To przewodnik „jak tego używać".
> Tło decyzji: `docs/REFACTOR-ANALYSIS.md`. Docelowy dyrygent: `docs/orchestrate-ddd-design.md`.

## Co jest zainstalowane
- **ECC plugin** (`ecc@ecc`, v2.0.0) — globalnie w `~/.claude`. 363 skille, 67 agentów, 7 hooków,
  1 MCP (chrome-devtools). Wszystko namespaced `ecc:*`.
- **Nasz claude-patterns** — bez zmian, działa obok (nasze `/orchestrate`, `/threat-model`,
  DDD agenci, patterns, hooki groundingu).

## ⚠️ Dwie rzeczy do zapamiętania
1. **Nowa sesja** — pluginy ładują się przy starcie. Po instalacji/zmianach odpal nowy `claude`.
2. **Koszt ~33k tokenów always-on / sesję** — ECC dokłada tyle samą obecnością (metadane 363 skilli).
   Skille są on-invoke (tanie gdy nieużywane). Jeśli za drogo → selektywna instalacja (profile/moduły ECC).

## Wyłączniki hooków (gdy ECC za bardzo przeszkadza)
ECC hooki działają teraz globalnie (m.in. gateguard „present facts before first Bash").
```bash
export ECC_GATEGUARD=off            # tylko gateguard
export ECC_HOOK_PROFILE=minimal     # lekki zestaw (minimal|standard|strict)
export ECC_DISABLED_HOOKS=pre:bash:gateguard-fact-force,pre:edit-write:gateguard-fact-force
```
Można wrzucić do `~/.claude/settings.json` → `"env": { ... }`, albo do shella.

## Jak używać — codzienne komendy
```
# NASZE (claude-patterns) — bez zmian:
/threat-model <funkcja>             # STRIDE/DREAD/LINDDUN
/orchestrate <mały prompt>          # implement→verify→review, grunduje w NASZYCH patterns
@code-quality-verifier ...          # nasz VETO verifier (bezpośrednio)
@security-e2e-verifier ...

# ECC (nowe, namespaced):
@ecc:architect <plan>               # agent ECC
@ecc:code-reviewer ...
/ecc:tdd-workflow                   # skill ECC
/ecc:loop-start sequential          # pętla ECC
/ecc:loop-status                    # status pętli

# NATYWNE Claude Code (pętle):
/loop /verify                       # cyklicznie (pamiętaj: "stop the loop" by zakończyć)
/goal wszystkie testy zielone       # pracuj aż warunek spełniony
```
`/agents`, `/help` pokażą i nasze, i `ecc:*`.

## W projektach DDD (juz-ide-api-*) — co działa OD RĘKI
Te projekty mają już (przez nasz setup-project.sh): nasze **patterns** (symlink), **DDD agentów**
(implementery + VETO verifiers), **hooki groundingu** (check-patterns-read, check-ddd-patterns,
check-domain-purity, check-context-isolation, security-impl-feedback). Plus teraz **wszystkie ecc:***.
- `/orchestrate <mały prompt>` → **już** grunduje w naszych patterns + odpala naszych implementerów
  i VETO verifiers (jeden przebieg).
- Możesz dowolnie wołać `@ecc:*` i `/loop` / `/goal` w tych projektach.

## Czego jeszcze NIE ma (Faza 1)
„Jeden mały prompt → pełna AUTOMATYCZNA pętla po warstwach z naszymi standardami aż verifier GO"
= `/orchestrate-ddd` (jeszcze nie zbudowany). Projekt: `docs/orchestrate-ddd-design.md`.
Most ręczny do tego czasu: patrz niżej.

## Most ręczny: automatyczna pętla standardów JUŻ TERAZ
W projekcie DDD odpal pełny flow pod natywną pętlą — wszystkie klocki (agenci, patterns, verifiers)
są obecne:
```
/goal Zaimplementuj <feature> warstwami (domena→aplikacja→infra). Po każdej warstwie uruchom
      @code-quality-verifier i napraw aż przejdzie. Na końcu @security-e2e-verifier. Grunduj w
      .claude/knowledge/patterns. Done gdy oba verifiery dają PASS i testy zielone.
```
Działa, bo /goal iteruje aż warunek (verifiery PASS) spełniony. Faza 1 zamieni to w jeden `/orchestrate-ddd`.

## Wycofanie
```
claude plugin disable ecc@ecc       # wyłącz (zostaje)
claude plugin uninstall ecc@ecc     # usuń
claude plugin update ecc@ecc        # aktualizuj (restart wymagany)
```
