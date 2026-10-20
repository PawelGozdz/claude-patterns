# ADR 0013 — Zalążki wpisów blogowych z przebiegów /analyze i /orchestrate

**Status**: accepted (2026-10-12). Etapy 1–4 (MVP) są wdrożone w trybie dry-run, etapy 5–9 czekają.
**Rozszerza**: [ADR 0012](0012-metryki-przebiegow-zdarzenia-v1.md): schemat zdarzeń dostaje `kind: seed`.
**Context source**: decyzja użytkownika z 2026-10-12: agenci w trakcie pracy nad taskiem sami
oceniają, czy temat jest wart wpisu, działa to w tle jak zgłoszenia do `_inbox`, a zalążek ma
być bogaty w kontekst. Kształt został uzgodniony z sesją repo bloga produktowego (wymagania strony
piszącej).

---

## Kontekst

Ciekawe tematy powstają przy pracy: decyzja z odrzuconą alternatywą, ADR, halt, który czegoś
uczy. Po tygodniu nikt już nie pamięta, dlaczego wybrano X. Ślad zostaje w artefaktach
(`decisions[]`, uzasadnienia, odpowiedzi autora), ale nikt go nie zbiera pod kątem bloga.
Są dwa blogi i każdy ma innego czytelnika:

- `personal` to droga programisty, który zostaje założycielem;
- `product` opisuje produkt.

Oba repo są prywatne i każde ma własną deny-listę wydawniczą.

## Decyzja

### D1. Temat ocenia agent prowadzący przebieg, a nie osobny model w tle

Agent `/analyze` i `/orchestrate` ma już pełny kontekst taska. Osobny model w tle musiałby ten
kontekst odtworzyć, dużo by to kosztowało i nie dałoby się go wywołać z promptu komendy. Agent
dostaje checklistę podpowiedzi zamiast sztywnych reguł (napięcie, dowód, przenośna lekcja,
nie rutyna) i buduje payload `schemas/blog-seed-payload-v1.schema.json`.

### D2. Skrypt jest deterministyczny i stanowi twardą bramkę

`scripts/blog-seed-emit.mjs` działa bez LLM. Kolejno:

1. waliduje payload;
2. czyści identyfikatory: wbudowane wzorce, deny-listę bloga i nazwę projektu zamienianą na `public_alias`;
3. stosuje bramki;
4. robi dedup i scalanie;
5. wybiera blog;
6. pilnuje limitu;
7. zapisuje plik atomowo pod lockiem;
8. zapisuje zdarzenie telemetrii.

Czyszczenie i odrzucanie to dwie różne operacje:
- identyfikator (ścieżka, hash, ID, nazwa repo, adres, token) jest **redagowany**, a zalążek zostaje;
- zakazany temat (`absolute_bans`, `topic_bans` bloga, `exclude.topics` projektu) **odrzuca**
  zalążek, bo skrypt nie umie bezpiecznie przepisać tematu na ogólnik.

Na koniec gotowe ciało jest skanowane drugi raz tymi samymi regułami.

### D3. Best-effort dla przebiegu, fail-closed dla publikacji

Kod wyjścia emittera nigdy nie zmienia wyniku `/analyze` ani `/orchestrate`. Kod ≠ 0 daje jedno
zdanie uwagi. Odwrotnie po stronie bloga: brak configu, brak `stage/`, brak lub błąd deny-listy
albo błędny regex oznaczają, że ten blog nie dostaje zalążka. Emitter nigdy sam nie tworzy
`stage/` ani configu.

### D4. Trzy warstwy konfiguracji; domyślne w kodzie, nie w bloku

| Warstwa | Gdzie | Co |
|---|---|---|
| A. projekt | `blog_seeds:` w `.claude/config/project.yml` | opt-in, `public_alias`, `targets`, `routing_hint`, `exclude.{project,topics,artifact_globs}`, `triggers`, `embargo_until`, `third_parties`, `mode` |
| B. mechanizm | `DEFAULTS` w `scripts/lib/blog-seed/config.mjs` | `mode: dry-run`, limit payloadu 64 KB, 3 zalążki na tydzień, wszystkie wyzwalacze |
| C. blog | `blog-seed.config.yml` + deny-lista (repo bloga) | `role`, `post_guide`, `deny_list_file`, progi, limit, opcjonalnie `mode: dry-run` |

Zasady rozstrzygania:
- zakazy się sumują;
- z limitów obowiązuje mniejszy;
- `live` działa tylko wtedy, gdy pozwalają na to projekt **i** blog;
- wyłączenie projektu wygrywa ze wszystkim.

Sekcja `blog_seeds:` nie trafia do CLAUDE.md, bo `generate-claude-md.sh` czyta tylko znane
klucze. Pilnuje tego test `blog-seeds-section-never-reaches-claude-md`.

Pierwotny plan zakładał domyślne w nowym bloku materializowanym do `runtime.yml`. Odrzucamy go,
bo emitter jest wołany z claude-patterns i czyta `project.yml` bezpośrednio. Blok wymagałby
dopisania go do `stack_blocks` i ponownej materializacji każdego projektu, a nie dałby niczego
ponad sekcję `blog_seeds:`.

### D5. Wybór bloga według pewności agenta (uzgodnione z blogami)

| `confidence` | Wynik |
|---|---|
| `high` | jeden zalążek na jeden blog |
| `medium` + `alt_angle` | dwa zalążki z różnym kątem, powiązane przez `target.sibling_seed` |
| `low` | live: brak pliku, zdarzenie `suppressed: routing`; dry-run: plik z `suppressed.reason` |

`routing_hint: personal|product` w projekcie zawęża wybór do jednego bloga.

### D6. Bramki twarde: tylko cztery

1. Bezpieczeństwo: deny-lista bloga czytana przy każdym zapisie oraz wzorce identyfikatorów.
2. Dowód: co najmniej jedno twierdzenie z dowodem.
3. Zgoda osób trzecich.
4. Duplikat: od statusu `picked` w górę plik jest nietykalny.

Punktacja (wagi 3/3/2/2/2/1/1/1, maksimum 45) i progi to **podpowiedzi** do kalibracji. Warunkiem
zapisu stają się dopiero po `enforce_thresholds: true`. Dry-run zapisuje też odrzuconych
kandydatów (routing, dowód, limit, punktacja) z powodem, bo to materiał do kalibracji. Nie zapisuje
odrzuconych za bezpieczeństwo, brak zgody i konfigurację.

### D7. Dedup bez ujawniania źródła

`dedup_key` i `ref_private` to HMAC-SHA256 z lokalnym kluczem
(`~/.claude/blog-seeds/key`, nadpisywany przez `BLOG_SEEDS_HOME`). ID w rodzaju `TASK-123` mają małą
entropię, więc zwykły hash dałoby się odwrócić zgadywaniem. Mapa `ref_private → źródło` leży
w lokalnym `index.jsonl`, poza gitem i poza repo blogów.

Ponowne trafienie scala plik:
- sekcje generatora są podmieniane;
- `## Pytania do autora`, `status`, `created`, `draft_path` i linki zostają;
- jedyny awans, jaki robi generator, to `new → candidate`.

### D8. Telemetria zawiera tylko kody

`kind: seed`, `process: blog-seed`, pole `seed`: `{event, seedId, dedup, blog, reason, confidence,
mode, status}`. Brak tematu, sluga i uzasadnienia, bo zdarzenia i agregaty dzienne są
w claude-patterns (repo wspólne). Agregat liczy lejek per blog: `emitted`, `updated`,
`suppressed:<powód>`. Pełne uzasadnienia są tylko w `stage/dry-run/` repo bloga.

Aneks 2026-10-18: od włączenia zalążków (14–17.10) w ai-gateway, iam, grant-flow i juz-ide-api-1 było
około 23 przebiegów `/analyze` i `/orchestrate`, a w całej telemetrii tylko 3 zdarzenia `seed`. Nie dało się powiedzieć, czy agenci oceniali i nie znajdowali tematu, czy pomijali krok.
Dlatego `--check --run-id` zapisuje teraz `checked` albo `skipped:<disabled|embargo|config>`, a brak
tematu agent zgłasza przez `--no-topic --run-id` (`skipped:no_topic`, bez pliku). Te zdarzenia nie mają
bloga, więc agregat liczy je pod `unknown`. Bez `--run-id` skrypt nic nie zapisuje, żeby ręczny audyt nie
mieszał się z przebiegami.

## Format pliku

`<repo-bloga>/stage/{inbox|dry-run}/RRRR-MM-DD/<slug>.seed.md`. Frontmatter jest zgodny ze schematem
`schemas/blog-seed-v1.schema.json`. Ciało ma stałą kolejność sekcji:

> Kontekst · Fakty · Decyzja i alternatywy · Co poszło nie tak · Dowody · Liczby · Hipoteza
> (agent) · Czego nie wiem · Pytania do autora · Proponowany kształt

Każda pozycja ma etykietę `[FAKT]`, `[HIPOTEZA]` albo `[WNIOSEK]`. Sekcja „Czego nie wiem” nie
może być pusta. Przykład: `templates/blog-seed-template.md`. Walidator
`scripts/blog-seed-validate.mjs <plik|katalog> [--blog <repo>]` działa także w repo blogów.

## Etapy

| # | Etap | Stan |
|---|---|---|
| 1 | ADR, schematy, szablon, walidator | ✅ |
| 2 | emitter: bramki, czyszczenie, dedup, routing, limit, zapis, dry-run | ✅ `tests/flow-evals/blog-seeds` |
| 3 | trzy warstwy konfiguracji i reguły rozstrzygania | ✅ |
| 4 | krok 5 w `/analyze`, krok 6 w `/orchestrate`, telemetria | ✅ (start w dry-run) |
| 5 | kalibracja na ok. 10–15 zalążkach, potem `mode: live` | czeka na dane |
| 6 | wnioskowanie `author_input` z odpowiedzi w artefaktach | payload już przyjmuje `author_input.inferred` |
| 7 | `/seeds`: przegląd, zbiorcze pytania, `status-changed`, raport kalibracji, miesięczny zalążek `numbers` | — |
| 8 | etap pisania (szkic `draft: true`, `status: drafted`) | — |
| 9 | dokumentacja: README systemu | ten ADR + szablony |

## Dołączenie nowego bloga (checklista)

1. W repo bloga: `blog-seed.config.yml` w korzeniu z polami `role`, `post_guide` i `deny_list_file`,
   do tego `stage/inbox/`, `stage/dry-run/` i deny-lista z polem `version`. Szablon przewodnika
   jest w `templates/blog-post-guide-template.md`.
2. W projekcie źródłowym: wpis w `blog_seeds.targets`.
3. Kontrola: `node scripts/blog-seed-emit.mjs --project <projekt> --check`, a po pierwszym zalążku
   `node scripts/blog-seed-validate.mjs <repo>/stage --blog <repo>`.

## Konsekwencje

- (+) Tematy nie giną. Zalążek powstaje w chwili, gdy kontekst jest najświeższy, bez pytania człowieka.
- (+) Bezpieczeństwo nie zależy od dyscypliny agenta, bo skrypt i deny-lista bloga są ostatnim słowem.
- (−) Ocenę tematu robi agent przy okazji innej pracy. Jakość zależy od promptu komendy, więc
  kalibracja w dry-run jest obowiązkowa przed przejściem na `live`.
- (−) Deterministyczny skan może dać fałszywe trafienia, np. wzorzec hasha łapie same cyfry.
  W dry-run widać to w `security.redactions`, a poprawki należą do deny-listy bloga.
