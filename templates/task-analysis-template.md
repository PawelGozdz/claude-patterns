---
# Artefakt analizy — kontrakt handoff research → implementacja (ADR 0002).
# Pisany przez /analyze, edytowany przez CZŁOWIEKA, czytany przez /orchestrate.
# Lokalizacja: project-orchestration/analysis/{TASK-ID}.analysis.md  (NIE tasks/ — tam tylko taski)
task: TS-XXX-000
telemetry_run: null             # runId z `telemetry-emit run-start` (ANL-041); null gdy telemetria nie ruszyła
status: awaiting-human          # draft | awaiting-human | approved  ← BRAMKA MASZYNOWA
# /orchestrate ODMÓWI startu dopóki status != approved LUB jakiekolwiek answer == null.

threat_model: null              # link do docs/security/threat-models/TM-{TASK-ID}.md (lub null jeśli nie-security)
# Security (STRIDE/DREAD/LINDDUN) NIE tutaj — żyje w threat-models/. Tu tylko link + krótkie "Ryzyka".

open_questions:                 # człowiek wypełnia answer; null = blokuje implementację
  # `ask` czyta CZŁOWIEK, `q` czytają agenci i audyt. Oba obowiązkowe.
  # Rejestr `ask` bierze się z runtime.yml `human_voice` (domyślnie: polski, biznesowy,
  # max 2 zdania, bez nazw klas, ścieżek i numerów ADR). Bez tego rozdziału pytanie
  # opisuje problem językiem, którym go znaleziono — i człowiek musi poprosić
  # o tłumaczenie, zanim odpowie „tak/nie".
  - id: Q1
    ask: >-
      Czy potwierdzenie rejestracji ma dotrzeć do użytkownika natychmiast, czy może
      przyjść z opóźnieniem? Natychmiast znaczy drożej i bardziej awaryjnie.
    q: "np. rejestracja confirmation email — sync czy async?"
    answer: null
  - id: Q2
    ask: "..."
    q: "..."
    # Klasyfikacja (ANL-047/048) — pola OPCJONALNE, starsze artefakty ich nie mają i przechodzą bramkę bez zmian.
    # Nie kopiuj wartości z przykładu: klasę i typ drzwi ustala treść pytania, nie szablon.
    class: <MECHANICAL|TASTE|USER_CHALLENGE>
    door_type: <one-way|two-way>   # one-way = trudne do cofnięcia; one-way ZAWSZE trafia do człowieka
    decision: D2                   # id decyzji z `decisions`, której to pytanie dotyczy (gdy dotyczy)
    options: ["<opcja A> (recommended)", "<opcja B>"]   # JEDNA linia (flow), nie lista blokowa; dokładnie jedna opcja z (recommended)
    answer: null

decisions:                      # propozycje z analizy; człowiek weryfikuje/poprawia
  # `means` = co ta decyzja zmienia dla produktu albo użytkownika, tym samym rejestrem
  # co `ask`. `rationale` zostaje techniczne — to ono uzasadnia wybór przed agentem.
  - id: D1
    topic: "np. komunikacja cross-context"
    choice: "ACL Registry (getGlobalRequired)"
    means: "Dwa obszary systemu przestają zależeć od siebie wprost, więc awaria jednego nie zatrzymuje drugiego."
    rationale: "..."
    # Klasyfikacja (ANL-047/048), opcjonalna. MECHANICAL rozstrzygasz sam i cytujesz w `rationale` regułę/wzorzec/kartę;
    # TASTE, USER_CHALLENGE i każde one-way mają parę w `open_questions` (pole `decision: <id>`), a `choice` jest wtedy tylko propozycją.
    # class: <MECHANICAL|TASTE|USER_CHALLENGE>
    # door_type: <one-way|two-way>
    # Kontrola decyzji przed zapisem (ANL-049/050) — FAKTY o decyzji; zgodę wyraża człowiek odpowiedzią na sparowane pytanie.
    # premises: [{ claim: "handler nie pisze do bazy", evidence: "src/.../handler.ts:94", holds: false }]   # przesłanki o kodzie, sprawdzone w źródle
    # premise_failed: true          # którakolwiek przesłanka ma holds: false → decyzja NIE jest rozstrzygnięta
    # card_conflict: [CH5, QP1]     # choice przeczy regułom kart (ID reguł)
    # Decyzja z premise_failed / card_conflict wymaga pytania z `decision: <id>`; odpowiedź zatwierdzająca zaczyna się od „Zatwierdzam".

patterns:                       # grounding (z Pattern Discovery) — to samo w research i impl
  - domain/aggregate-pattern.md
  - application/command-handler-pattern.md

patterns_exclude: []            # fałszywe trafienia keywordów (np. wzorzec web na „dashboard")
  # — ścieżki z doboru, których NIE wstrzykiwać. Wpis, który niczego nie wykluczył = ostrzeżenie.

final_checks: []                # skrypty/komendy, które decyzje analizy każą uruchomić w bramce końcowej
  # (np. [test:l3, test:gateway] po zmianie konfiguracji e2e) — dopisywane do checks z bloków (ORC-121).

# bundle_ack: "<dlaczego jeden przebieg>"   # ORC-142: pakiet kilku zadań (dwa sygnały: ponad 20 jednostek, ponad 4 konteksty; samo „PRn" nie zatrzymuje) startuje tylko z tą zgodą
units: []                       # podział warstwy na jednostki — każda to osobny przebieg
  # implement→verify (pod-warstwa <layer>:<id>). Pusty = warstwy z runtime.yml bez podziału.
  # Warstwa z jednostkami NIE może być w layers_skip ani layers_scope. W dirs dopisz też
  # pliki towarzyszące spoza katalogu (setup testów, .env.example, compose); test obok
  # zmienianego pliku z tym samym rdzeniem nazwy (x.map.ts → x.adapter.spec.ts) wchodzi sam.
  # - { id: audience, layer: infrastructure, dirs: ["src/contexts/audience/infrastructure/"], reason: "D3: repozytorium + kontroler" }
  # - { id: campaigns, layer: infrastructure, dirs: ["src/contexts/campaigns/infrastructure/", "test/setup/env.ts"], checks: ["typecheck", "lint:check"] }

layers_skip: []                 # warstwy z runtime.yml, których ten task NIE dotyka — z powodem.
  # Bez tego wpisu silnik odpala implementera na każdej warstwie i po 3 próbach „zero zmian"
  # eskaluje, bo nie odróżnia „nic do zrobienia" od „nie wykonał pracy". Typowo: task
  # infrastrukturalny → domain i application pominięte. `id` = id warstwy z runtime.yml.
  # - { id: domain, reason: "task nie zmienia modelu domenowego (D2)" }
  # Skip jest CAŁKOWITY — implementer tej warstwy nie startuje. Powód mówiący „częściowo",
  # „wyjątek", „7 z 8", „tylko dla …" zatrzymuje bramkę: to jest zawężenie, nie pominięcie.

layers_scope: []                # warstwy dotknięte CZĘŚCIOWO — wchodzą, ale tylko wskazane ścieżki.
  # Implementer, weryfikator i sonda widzą wyłącznie `dirs` (katalogi albo pojedyncze pliki,
  # ścieżki od korzenia repo); reszta katalogów warstwy jest dla tego tasku poza zakresem.
  # Warstwa nie może być jednocześnie w layers_skip i layers_scope.
  # - { id: application, dirs: ["src/contexts/shares/application/"], reason: "Q2: 6 handlerów kopiuje error.message z obcej domeny; pozostałe konteksty nietknięte" }
---

# Analiza: {TASK-ID}

## Synteza (tech-lead)
<co robić, w jakiej kolejności, kluczowe ryzyka — wypełnia panel /analyze>

## Otwarte pytania (DO DYSKUSJI — odpowiedz w frontmatter `answer:`)
<!-- Kolejność dla człowieka (ANL-047): najpierw USER_CHALLENGE i one-way, każde osobno; potem wszystkie TASTE razem. -->
- **Q1**: ...
- **Q2** [klasa, drzwi]: ...

## Decyzje (proponowane — zweryfikuj)
<!-- MECHANICAL: rozstrzygnięte bez pytania, z uzasadnieniem. Reszta czeka na odpowiedź z sekcji wyżej. -->
- **D1**: ...

## Ryzyka / uwagi
- ...

---
> Po wypełnieniu odpowiedzi i zatwierdzeniu decyzji: ustaw `status: approved`,
> potem uruchom `/orchestrate {TASK-ID}`.
