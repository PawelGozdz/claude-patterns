# Faza 0 — Spike Plan: ECC-base + DDD-overlay (walidacja przed refaktorem)

> Status: PLAN (do wykonania, nie zaimplementowany). Powiązane: `docs/REFACTOR-ANALYSIS.md`.
> Time-box: ~1 dzień focused. Charakter: read-mostly + jeden end-to-end test. **Zero zmian w
> produkcyjnym claude-patterns.** Wszystko w izolowanym sandboxie.

---

## Cel

Zamienić założenia z analizy na **fakty**, zanim cokolwiek skasujemy/przepniemy. Spike kończy
się **decyzją GO / NO-GO / GO-z-modyfikacjami** + trzema artefaktami (overlap matrix, hook
collision report, decision record).

## Pytania badawcze (na każde spike musi dać odpowiedź TAK/NIE + dowód)

1. **Q1 Instalacja:** Czy `ecc@ecc` instaluje się czysto jako plugin i NIE rusza naszych plików?
2. **Q2 Overlap:** Co realnie pokrywają agenci/skille/komendy/rules/hooki ECC vs nasze? →
   zamyka kolumny RETIRE/KEEP/AUDIT z §8 analizy.
3. **Q3 Kolizje hooków:** Które hooki ECC double-firują z naszymi (zwł. `gateguard-fact-force`
   vs `check-delegation`)? Jak je rozbroić (`ECC_DISABLED_HOOKS`)?
4. **Q4 Overlay E2E:** Czy da się dopiąć preset `nestjs-ddd` na ECC i przejść JEDNO realne
   zadanie DDD end-to-end (implement → nasze VETO verifiers → security-review)?
5. **Q5 Loops:** Czy `/loop` / `loop-operator` działa i czy nasze verifiery wpinają się jako
   stage'e pętli?
6. **Q6 Koszt/UX:** Czy złożoność/koszt są akceptowalne (subiektywna ocena + log kosztu).

---

## S0 — Izolacja sandboxa (NAJPIERW, inaczej zaśmiecimy globalny ~/.claude)

Pluginy instalują się do **globalnego** `~/.claude/plugins/`. Żeby nie ruszać realnego setupu:

**Opcja A (preferowana) — osobny katalog konfiguracji:**
```bash
export CLAUDE_CONFIG_DIR=/opt/projects/_spike/.claude-sandbox   # izoluje CAŁY config CC
mkdir -p "$CLAUDE_CONFIG_DIR"
# (potwierdzić, że ta wersja CC honoruje CLAUDE_CONFIG_DIR — jeśli nie → Opcja B)
```
**Opcja B (fallback) — akceptuj globalny plugin, sprzątnij na końcu:**
```bash
# instaluj normalnie, na końcu: /plugin uninstall ecc@ecc
```

**Sandbox-projekt** (mały, realny DDD do testu E2E):
```bash
mkdir -p /opt/projects/_spike && cd /opt/projects/_spike
# skopiuj NAJMNIEJSZY istniejący projekt nestjs-ddd (np. fragment vytches-ddd) jako repo testowe
git init ecc-ddd-test && cd ecc-ddd-test
# wrzuć 1 prawdziwy bounded-context + 1 zadanie do zaimplementowania (np. mały aggregate)
```

**Artefakt S0:** `notes/00-sandbox.md` — jak izolowano, ścieżki, jak posprzątać.

---

## S1 — Instalacja ECC (Q1)

```bash
# w Claude Code (sandbox config):
/plugin marketplace add affaan-m/ECC
/plugin install ecc@ecc
/plugin                       # potwierdź że ecc aktywny, wylistuj co wniósł
```
Sprawdź ślad na dysku:
```bash
ls -la "$CLAUDE_CONFIG_DIR/plugins/"          # ecc obecny
find "$CLAUDE_CONFIG_DIR" -maxdepth 2 -newer /tmp/_t0  # co install dotknął (zrób touch /tmp/_t0 przed)
cat "$CLAUDE_CONFIG_DIR/ecc-install-state.json" 2>/dev/null | head   # jeśli użyto installera npm
```
**Sukces Q1:** ECC żyje w `plugins/ecc/`, namespaced `ecc:*`; żaden nasz plik nie ruszony.
**Artefakt S1:** `notes/01-install.md` — komendy, co się pojawiło, lista `ecc:*` zasobów.

---

## S2 — Overlap audit (Q2) — DELEGOWALNE do subagentów

Najcięższa część (67 agentów + 271 skilli ECC vs nasze). Zrównoleglić przez Explore/Haiku
agentów, po jednej kategorii. Dla KAŻDEJ naszej pozycji z §8: czy ECC ma odpowiednik?
(`COVERED` / `PARTIAL` / `NONE`) + nazwa odpowiednika ECC.

Plan per kategoria (osobny agent czyta ECC + nasze, zwraca tabelę):
- **S2a Agents:** zmapuj 25 naszych → ECC. Cel: potwierdzić RETIRE (5 generyków) + KEEP (stacks).
- **S2b Commands:** 25 naszych → ECC `/tdd /plan /code-review /e2e /build-fix /learn …`.
- **S2c Skills:** nasze kategorie → 271 ECC. **Szczególnie** marketing(41)/finance(84)/legal(12)
  — czy ECC je pokrywa? To największy AUDIT.
- **S2d Rules:** common/ + per-language → `rules/ecc/common`, `rules/ecc/typescript|python`.
- **S2e Hooks:** nasze hooki → ECC (potwierdź, że check-delegation/rule-cards NIE mają odpowiednika).

**Sukces Q2:** każda pozycja §8 ma werdykt z dowodem (nazwa odpowiednika ECC lub „brak").
**Artefakt S2:** `notes/02-overlap-matrix.md` — pełna tabela COVERED/PARTIAL/NONE. To zamyka §8.

---

## S3 — Kolizje hooków (Q3)

```bash
# wylistuj hooki ECC (matcher + id) z plugin hooks.json:
node -e "const h=require('$CLAUDE_CONFIG_DIR/plugins/ecc/hooks/hooks.json');console.log(JSON.stringify(Object.keys(h.hooks),null,2))"
grep -o '\"id\": *\"[^\"]*\"' "$CLAUDE_CONFIG_DIR/plugins/ecc/hooks/hooks.json"
```
Zestaw z naszymi (PreToolUse Write/Edit). Dla każdej pary o tym samym matcherze: czy oba odpalą?
co robią? Test na żywo w sandboxie: spróbuj edytować plik wzorcowy i obserwuj, ile bramek staje.
Zweryfikuj rozbrojenie:
```bash
export ECC_DISABLED_HOOKS="pre:edit-write:gateguard-fact-force"   # wyłącz kolidujący gate ECC
export ECC_HOOK_PROFILE=standard                                  # sprawdź wpływ profilu
```
**Sukces Q3:** lista kolizji + sprawdzona recepta (które ECC wyłączyć, które nasze zostają).
**Artefakt S3:** `notes/03-hook-collisions.md`.

---

## S4 — Overlay E2E na jednym presecie (Q4)

Ręcznie (bez budowania installera!) dopnij minimalny `nestjs-ddd` overlay w sandbox-projekcie:
```bash
cd /opt/projects/_spike/ecc-ddd-test
mkdir -p .claude/{agents/ddd,knowledge/patterns,rules/nestjs-ddd}
# symlinkuj RĘCZNIE minimalny zestaw z claude-patterns:
ln -s /opt/projects/claude-patterns/agents/stacks/nestjs-ddd/code-quality-verifier.md .claude/agents/ddd/
ln -s /opt/projects/claude-patterns/agents/stacks/nestjs-ddd/security-e2e-verifier.md .claude/agents/ddd/
ln -s /opt/projects/claude-patterns/patterns/domain .claude/knowledge/patterns/domain
# project settings.json: wpnij nasze 2-3 hooki (check-delegation, check-subagent-pattern-reads)
```
Przejdź JEDNO realne zadanie DDD (mały aggregate) ręcznie sterując: implement (ECC agent lub nasz
implementer) → nasze VETO verifiers → `/security-review` jako bramka. Obserwuj czy:
- grounding (Rule Cards) działa obok ECC,
- VETO verifier potrafi zablokować,
- ECC agenci współgrają z naszymi patterns.

**Sukces Q4:** zadanie przechodzi end-to-end; konflikty (jeśli) udokumentowane.
**Artefakt S4:** `notes/04-overlay-e2e.md` — co zadziałało, co wymagało obejścia.

---

## S5 — Loops (Q5)

```bash
/loop /verify                         # natywny, na sandbox-zadaniu (nadzór)
/loop-start sequential --mode safe    # ECC loop-operator, najprostszy wzorzec
/loop-status --watch                  # obserwuj checkpointy / stall detection
```
Następnie spróbuj wpiąć NASZ verifier jako stage (przez `Task(ecc:loop-operator…)` lub `/goal`
z acceptance = security-review-pass). Cel: potwierdzić feasibility „loops × domena", nie zbudować
finalny `/orchestrate-ddd`.
**Sukces Q5:** pętla iteruje, stall-detection działa, nasz verifier da się ustawić jako bramka stopu.
**Artefakt S5:** `notes/05-loops.md` — co działa out-of-the-box, co wymaga glue-code.

---

## S6 — Decyzja (GO / NO-GO / GO-z-modyfikacjami)

Zbierz artefakty S1–S5. Wypełnij decision record.

**Kryteria GO (wszystkie muszą być spełnione):**
- [ ] Q1: ECC instaluje się czysto, nie rusza naszych plików.
- [ ] Q2: overlap matrix kompletny; RETIRE-list ma potwierdzone odpowiedniki ECC (zero dziur).
- [ ] Q3: kolizje hooków rozbrajalne deterministycznie (`ECC_DISABLED_HOOKS`).
- [ ] Q4: jedno zadanie DDD przeszło E2E na overlayu; moat (grounding+VETO) działa obok ECC.
- [ ] Q5: loops działają i nasze verifiery da się wpiąć jako stage.
- [ ] Q6: koszt/złożoność akceptowalne.

**NO-GO jeśli:** ECC nadpisuje nasze pliki / brak czystego rozbrojenia hooków / overlay łamie
grounding / loops nie pozwalają wpiąć custom-stage. → wtedy wracamy do wariantu „cherry-pick
in-place" z §5 (odrzuconego, ale jako plan B).

**Artefakt S6:** `notes/06-decision.md` + ADR (`docs/adr/`) z wynikiem i listą KEEP/RETIRE/AUDIT
zamkniętą faktami. To wejście do Fazy 1 (właściwy refaktor).

---

## Sprzątanie po spike'u
```bash
/plugin uninstall ecc@ecc            # jeśli Opcja B
rm -rf /opt/projects/_spike          # sandbox + config
unset CLAUDE_CONFIG_DIR ECC_DISABLED_HOOKS ECC_HOOK_PROFILE
```

## Deliverables (do `docs/spike-results/` lub jako jeden raport)
`00-sandbox` · `01-install` · `02-overlap-matrix` · `03-hook-collisions` · `04-overlay-e2e`
· `05-loops` · `06-decision` (+ ADR). Po nich: zamknięta §8 i gotowy plan Fazy 1.
