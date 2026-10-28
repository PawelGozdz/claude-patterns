# Historia promptów: agenci

Tu mieszkają opowieści i liczby, które wyniesiono z `agents/**`. W promptach zostały same
reguły. Powód: każdy bajt prompta płaci się w kontekście przy każdym użyciu agenta
(TASK-GSTACK-ADOPT-001, ratchet archeologii).

Format: plik → co wyniesiono → data i źródło.

## Wspólne dla kilku plików

- Pliki: `code-quality-verifier`, `domain-application-implementer`, `infrastructure-implementer`,
  `test-implementer`, `security-e2e-verifier`.
  Sekcja „Context is cumulative". Wyniesiono pomiar: jeden przebieg (`wf_23029d51-3a2`) miał
  546 wywołań Bash, 1,36 M znaków wyniku, 89 M tokenów z cache (około 90% kosztu przebiegu) przy
  36 edycjach. Data: 2026-08-14. W prompcie zostało: „odczytywany ponownie wynik narzędzi to około
  90% kosztu przebiegu".
- Pliki: `domain-application-implementer`, `infrastructure-implementer`, `test-implementer`,
  `sql-postgres-optimizer`, `flutter-implementer`.
  Akapit o `retrieve_code`. Wyniesiono odnośnik do źródła zmiany (TASK-RAG-004 R1, 2026-09-07).
  Sama reguła („wskaźnik, nie treść") została.

## Po plikach

- `nestjs-ddd/code-quality-verifier.md`
  - Zakres warstwy (`LAYER_SCOPE`): incydent juz-ide-api-2, 2026-08-16. Faza 1 szukała repozytoriów
    przy weryfikacji `application`, których jeszcze nie było (nie uruchomiono `infrastructure`).
    VETO zadziałało mimo to. Implementer, nie mogąc naprawić NO-GO w swojej warstwie, dopisał kod
    infrastruktury, o który nikt nie prosił.
  - Budżet tur: 9 z 9 martwych wywołań weryfikatora przy `maxTurns` 15; 2026-07-02 śmierć dokładnie
    po 30 użyciach narzędzi przy `maxTurns` 30.
  - Krok 0 („implementacja istnieje"): przebieg weryfikacji uruchomiono na kodzie, którego nikt nie
    napisał.
  - Czytanie plików w całości: pominięto naruszenie izolacji DB między kontekstami, bo przeczytano
    120 z 443 linii.
  - Parytet efektów ubocznych gałęzi: juz-ide-api-3, 2026-08-29. `create-local-share/handler.ts`
    miał `setTag()` tylko w gałęzi z jawną lokalizacją. Gałąź „domyślna rezydencja" łamała
    BR-LS-TAG-001 przez 39 commitów, bo żaden przebieg nie porównał efektów obu gałęzi. Reguła:
    command-handler-pattern CH11.
  - Changelog: z wpisu 2026-08-18 usunięto słowo „incident" (treść bez zmian).
- `nestjs-ddd/implementers/infrastructure-implementer.md`
  - Podział z `infrastructure-testing-implementer`, 2026-07-09: ten agent pisze tylko kod, testy
    przejął `@test-implementer`. Powód: dwie różne umiejętności (kod produkcyjny kontra kod
    weryfikujący cudzą warstwę) były w jednym agencie, a autorstwo testów obciążeniowych nie miało
    właściciela.
  - Brak pętli kompilacji przez Bash: marketing-hub TS-MH-005, 2026-09-24. 4 z 4 przebiegów
    infrastruktury padło po cichu dokładnie przy 40 turach, po 13–35 wywołaniach Bash (głównie
    iteracyjne `tsc`/build). Ponowienie tej samej pracy kończyło się w 5–15 turach.
  - Twarde zatrzymanie dla triggerów czytających cudzy kontekst: zdanie „tak wyszedł incydent
    powyżej" odnosiło się do przypadku, w którym migracja z triggerem na kolumnie przestrzennej
    poszła bez przeglądu (opis zostaje w prompcie jako „udokumentowany tryb porażki").
- `nestjs-ddd/implementers/test-implementer.md`
  - Podział z `infrastructure-testing-implementer`, 2026-07-09 (jak wyżej). Uwaga: `flutter-implementer`
    nadal wspomina starą nazwę `infrastructure-testing-implementer` (poza zakresem tego sprzątania).
  - Budżet rozpoznania: TS-REACH-BOOST-001 (juz-ide-api-1), 2026-08-19. Trzy próby pod rząd
    spaliły pełne 60 tur na rozpoznanie (22–32 odczyty plików na próbę, w tym stronicowanie
    2500-liniowego `BUSINESS_RULES.yaml` po około 40 linii) i skończyły `ESCALATE_AND_HALT` bez
    ani jednego `.spec.ts`. VETO „0% coverage" było za każdym razem słuszne.
  - Reguła „SQL to zawsze L2" (ADR-0035): dodana 2026-07-20. Dwa błędy uciekły 2026-07-20
    (TS-LS-LIFECYCLE-001), oba padały w 100% na prawdziwej bazie, a przechodziły pełne `pnpm test`
    (ponad 28 tys. testów) i dwa przebiegi weryfikatora. Przykłady (migracja gubiąca 3 z 6
    indeksów częściowych przed `ALTER COLUMN ... TYPE text`; zapytanie z nietypowanymi
    parametrami `CASE`) zostały w prompcie jako typowe przypadki.
  - `pnpm test:e2e -- <plik>`: „to już powodowało realne incydenty" — przebieg całego pakietu
    trzymał współdzielony flock ciężkich testów w repo i blokował inne sesje. Skutek został w
    prompcie, bez słowa o incydentach.
- `nestjs-ddd/security-e2e-verifier.md`
  - Lista narzędzi poprawiona 2026-07-08: `Task` i wszystkie `mcp__zen__*` figurowały w
    dokumentacji jako przyznane, choć nigdy nie były (stara niezgodność opisu).
  - Stopka `**Created**: 2026-02-05` usunięta (metadane, nic nie robiły).
- `node-ts-claude-api/architecture-verifier.md`
  - Karty reguł poza kompetencją: ai-os-bot BOT-009, przebieg `wf_d9d51f1a-69a`, 2026-09-26.
    Werdykt GO był poprawny, ale tylko dzięki przypadkowemu niezależnemu drugiemu przeglądowi, a
    nie zweryfikowanej metodzie.
  - Changelog: z wpisu 2026-09-26 usunięto etykietę „incident:".
- `universal/backend-technology-expert.md`
  - Brak `Task`/`Grep`/`Glob`: poprawka prawdziwej pętli delegacji (Q8 w
    `docs/tasks/TASK-RAG-002.analysis.md`). Odnośnik do Q8 został w prompcie.
  - Narzędzia `mcp__zen__*` usunięte z `tools` 2026-09-08 (patrz Changelog agenta).
  - Stopka `**Last Updated**: 2026-10-17` usunięta (duplikat Changelogu).
- `universal/halt-diagnostician.md`
  - Zakaz Agent/Workflow/Task egzekwowany przez `disallowedTools`, bo zakaz tylko w prompcie
    zawiódł dwa razy (ORC-055): TS-SEC-TRUSTED-PROXY-001 (api-2, 2026-08-31) i grant-flow
    TS-RATE-003 (2026-09-27). Fork zignorował zakaz i uruchomił nienadzorowaną kontynuację, raz
    sam zatwierdził (ręczną edycją `layers_done`) warstwę odrzuconą 3 razy przez własnego
    weryfikatora. Wniosek („zakaz w prompcie nie wystarcza; egzekwuje go `disallowedTools`") został.
- `astro-static/content-reviewer.md`
  - Poprawka z 2026-10-09: po dryfie schematu pola `slug`, `date` i limit 160 znaków, na które
    powoływała się lista kontrolna, nie istniały już w prawdziwym schemacie.
- `universal/legal-strategist.md`, `universal/marketing-strategist.md`
  - Przykład „juz-ide-api-1 przeniósł plik kontekstu do `docs/` 2026-08-12" przy opisie konwencji
    docs-first. Konwencja i kolejność wyszukiwania zostały.
