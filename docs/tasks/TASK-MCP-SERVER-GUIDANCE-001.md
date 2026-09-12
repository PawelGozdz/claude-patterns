---
id: TASK-MCP-SERVER-GUIDANCE-001
title: 'Wzorzec/wskazówki: jak budować własny serwer MCP wewnątrz repo konsumenckiego (przykład: grant-flow)'
type: task
status: todo
created_date: 2026-09-09
---

# TASK-MCP-SERVER-GUIDANCE-001 — serwer MCP jako część repo produktowego

**Kontekst zewnętrzny:** `grant-flow`'s `TS-MCP-001`
(`/opt/projects/grant-flow/project-orchestration/analysis/TS-MCP-001-grant-flow-api-server.analysis.md`,
`status: approved`). Zgłoszenie stąd, nie od razu implementacja tam — właściciel poprosił
o spisanie potrzeby w `claude-patterns`, bo to repo ma już własny serwer MCP i doświadczenie
w budowaniu takich narzędzi.

## Czego potrzebuje grant-flow

Serwer MCP eksponujący WŁASNE, read-only API grant-flow (projekty, wpisy czasu, wydatki,
raporty) dla innych instancji Claude Code. Zatwierdzone decyzje z analizy TS-MCP-001:

- **Lokalizacja**: `tools/mcp-server/` przy korzeniu repo `grant-flow` — osobny
  pakiet/proces, POZA `src/` (DDD contexts). Poprawka po pierwszym podejściu: pierwotna
  rekomendacja (kod w `claude-patterns`, obok `pat-login-cli`) była błędna — `claude-patterns`
  to lokalne narzędzia deweloperskie z własnym serwerem MCP, nie miejsce na produkcyjny
  serwer MCP konkretnej usługi firmowej. MCP dla API grant-flow ma być częścią repo
  grant-flow.
- **Transport**: stdio, jeden proces per instancja Claude Code — wymóg: wiele instancji
  (różne projekty) równolegle, każda z WŁASNYM PAT-em w pamięci procesu, zero
  współdzielonego stanu logowania.
- **Autoryzacja**: PAT wydany przez `iam` (ADR-0009 w repo `iam`), ten sam mechanizm co
  dzisiejszy `grantflow-log-time` — logowanie przez `pat-login-cli` (kopiowany z `iam`,
  wzorzec `cross-layer/temporary-copy-to-consumer-pattern.md` w tym repo). Serwer MCP nie
  ma własnej logiki autoryzacji — każde narzędzie woła realny endpoint HTTP grant-flow z
  `Authorization: Bearer <PAT>`, przechodząc przez te same guardy co dziś (rate-limit,
  sprawdzanie uprawnień, walidacja Zod) — **nigdy** wywołanie handlera in-process.
- **Zakres**: wyłącznie odczyt (read-only), na stałe — decyzja właściciela, nie faza
  przejściowa. Powód: zapis i tak byłby bramkowany realnymi uprawnieniami wywołującego, ale
  po drugiej stronie narzędzia jest model językowy, nie człowiek klikający „zapisz" — model
  może zostać wprowadzony w błąd treścią danych i wykonać niezamierzony zapis. Sam odczyt w
  pełni realizuje cel (koniec pisania klienta HTTP od zera) bez tego ryzyka.
- **Zestaw narzędzi**: ręczny, kuratorski, 8-12 na start — NIE automatyczny generator ze
  spec OpenAPI. Powód: spec grant-flow dziś nie wyklucza żadnego endpointu i nie jest
  serwowany na produkcji (`SwaggerModule` włączony tylko poza produkcją) — auto-generowanie
  byłoby fail-open. Generator OpenAPI można użyć jednorazowo tylko do typów klienta HTTP.

Pełny kontekst (threat model, alternatywy odrzucone, uzasadnienia) w artefakcie analizy
wymienionym wyżej.

## O co proszę `claude-patterns`

1. **Doradztwo projektowe**: jak najlepiej ustrukturyzować `tools/mcp-server/` w repo
   konsumenckim (NestJS/TS) — jaki SDK (`@modelcontextprotocol/sdk`, `McpServer` +
   `registerTool` + `StdioServerTransport` był rekomendowany w panelu analizy grant-flow),
   jak trzymać PAT poza repo (nie w `.mcp.json`, nie plaintext), jak wersjonować/testować
   ten pakiet niezależnie od głównego builda NestJS.
2. **Sprawdzenie własnego doświadczenia**: `claude-patterns` ma skonfigurowany serwer MCP
   (`.mcp.json` w wielu repo-konsumentach wskazuje na
   `/opt/projects/claude-patterns/mcp-server/server.py`) — **UWAGA, znalezione przy okazji**:
   ten plik dziś nie istnieje (`find mcp-server/` zwraca tylko katalog `knowledge-retriever/`,
   serwer HTTP, inny transport). Połączenie z tym serwerem faktycznie failuje w bieżącej
   sesji (`CONNECTION_CLOSED`). Jeśli to ma być punkt odniesienia „jak my to robimy" —
   warto to najpierw naprawić albo jawnie odnotować, że referencyjny jest tylko
   `knowledge-retriever` (HTTP), nie żaden istniejący stdio-server w tym repo.
3. **Ewentualnie**: czy `/orchestrate`'s silnik (`orchestrate.layers` w blokach) powinien
   dostać nowy typ warstwy dla samodzielnych pakietów narzędziowych żyjących poza
   strukturą bounded-context (`domain/`/`application/`/`infrastructure/`/`__tests__/`) —
   dziś żadna z tych czterech nie pasuje do katalogu w rodzaju `tools/mcp-server/`, więc
   uruchomienie `Workflow` dla takiego taska kończy się pustym przebiegiem (każda warstwa
   poprawnie zgłasza „nic w moim zakresie", ale nic się nie buduje). To osobna, głębsza
   zmiana (dotyka bloków + `setup-project.sh`) — nie blokuje punktów 1-2 powyżej.

## Nie w zakresie

- Implementacja `tools/mcp-server/` w grant-flow — to dzieje się w repo grant-flow, po
  otrzymaniu wskazówek stąd (albo równolegle, jeśli wskazówki nie są blokujące).
- Naprawa `contexts/authorization/` w grant-flow (poza zakresem oryginalnego taska).

## Odpowiedź z claude-patterns (2026-09-10)

### Ad 1. Struktura `tools/mcp-server/`

Rekomendacja z analizy TS-MCP-001 (`@modelcontextprotocol/sdk`, `McpServer` + `registerTool`
+ `StdioServerTransport`) jest trafna, potwierdzona.

- **Pakiet**: osobny `package.json` (private, niepublikowany) obok `src/` — `grant-flow` nie
  ma `pnpm-workspace.yaml` (sprawdzone), więc to zwykły katalog-sąsiad z własnym
  `tsconfig.json` i własnym skryptem builda (tsc/tsup), niezależny od grafu builda Nesta.
- **Testy**: osobny suite Vitest, osobny skrypt (`test:mcp`) — nie mieszać z e2e harnessem
  Nesta pod `test/`.
- **PAT — nie wymyślać od nowa**: mechanizm już jest napisany —
  `tools/integrations/grant-flow/pat-login-cli/{token-cache.ts, cache-paths.ts,
  crypto-utils.ts}` (cache plikowy 0600/0700, atomowy zapis przez `rename`, fallback na
  `null` przy braku/uszkodzeniu pliku). Dziś leży w `claude-patterns` jako gotowa kopia
  czekająca na przeniesienie do `grant-flow` (widoczne w stage'u innej aktywnej sesji w
  chwili pisania tej odpowiedzi) — jeszcze nie wylądowała fizycznie w repo `grant-flow`.
  Gdy wyląduje: serwer MCP powinien importować z niej `readCachedToken`/`writeCachedToken`,
  NIE trzymać PAT-a w `.mcp.json` ani w env. `.mcp.json` niesie wyłącznie komendę
  uruchomienia procesu, zero sekretu.

### Ad 2. Własne doświadczenie MCP w claude-patterns — korekta założenia z sekcji "Czego potrzebuje grant-flow"

`.mcp.json` wskazujący na `mcp-server/server.py` to **martwy wpis**, nie żywy wzorzec do
naśladowania. Ten serwer Python został świadomie usunięty 2026-09-07 (K100,
`docs/tasks/TASK-KAIZEN-002.md`) — czyste sprzątanie po migracji na `knowledge-retriever`,
nie lekcja projektowa o tym, że stdio jest złym wyborem transportu. `scripts/setup-project.sh`
krok `[6/8]` już sam wycina ten wpis z `.mcp.json` u każdego satelity przy najbliższym
uruchomieniu (18 satelitów je miało w momencie audytu K100).

Żyje dziś `mcp-server/knowledge-retriever/` — ale to HTTP, jeden **współdzielony** demon
(`http://localhost:6403/mcp`, ta sama instancja dla wszystkich projektów-konsumentów) —
dokładne przeciwieństwo wymogu grant-flow "zero współdzielonego stanu logowania per
instancja". Nie traktować go jako wzorca strukturalnego dla tego zadania — inny transport,
inny model cyklu życia procesu.

Przy okazji, znalezione ale NIEBLOKUJĄCE dla grant-flow: `templates/mcp.json.template` w
tym repo samo jest sierotą — dalej twardo koduje martwy wpis `server.py` i nie jest już
nawet czytany przez `setup-project.sh` (ten generuje `.mcp.json` inline w JS, krok `[6/8]`).
Osobne, drobne sprzątanie do zrobienia w `claude-patterns` kiedy indziej.

### Ad 3. Nowy typ warstwy w `/orchestrate` dla samodzielnych pakietów narzędziowych

Zgłoszenie zasadne — dotyczy silnika (`materialize-runtime.mjs` + `setup-project.sh`), nie
tylko tego taska: każde repo z samodzielnym pakietem narzędziowym poza
`domain/`/`application/`/`infrastructure/`/`__tests__/` trafi na ten sam objaw (pusty
przebieg Workflow). Nie blokuje TS-MCP-001 — zasługuje na własny task, kiedy pojawi się
drugi taki przypadek poza `grant-flow` (ta sama zasada co przy promocji wzorców/taksonomii
w tym repo).

**Pragmatyczny odblokowywacz na już, bez zmiany silnika**: lokalny blok
(`.claude/blocks/<nazwa>.yml` w `grant-flow`, ten sam mechanizm co `iam-security.yml` w
`iam`) dopisujący własny wpis `orchestrate.layers` zeskopowany do `tools/mcp-server/`, z
własnymi `checks` (lint/build/test tego pakietu). Czysto lokalna kompozycja, zero zmian w
`claude-patterns`.

### Korekta (2026-09-10, sesja grant-flow) — powyższy odblokowywacz NIE działa

Zweryfikowane wprost w kodzie `scripts/materialize-runtime.mjs` przed próbą wdrożenia:

1. `orchestrate.layers` może zdefiniować dokładnie JEDEN blok w całej kompozycji, i musi
   mieć `axis: architecture` (linie ~416-428) — w `grant-flow` ten slot zajmuje już blok
   `ddd/layers`. Drugi blok z własnym `orchestrate.layers` kończy się twardym `fail()`
   („orchestrate.layers definiują dwa bloki... dozwolony jeden"), nie cichym scaleniem.
2. `layer_contributions` (linie ~668-745) dokłada WYŁĄCZNIE `patterns`/`checks` do
   warstwy już istniejącej, trafionej po tagu (`match: "*:app"` itp.) — nie potrafi dodać
   nowej warstwy ani rozszerzyć jej `dirs`.

Wniosek: nie da się tego zrobić czysto lokalną kompozycją bez zmiany silnika. Realny nowy
typ warstwy dla samodzielnych pakietów poza `domain/`/`application/`/`infrastructure/`/
`__tests__/` wymaga zmiany w `materialize-runtime.mjs` (punkt 3 wyżej), nie w blokach
projektu. Do czasu tej zmiany: implementacja `tools/mcp-server/` w grant-flow idzie poza
`/orchestrate`'s `Workflow` — bezpośrednie delegowanie do pojedynczego agenta
implementującego + weryfikatora, ręcznie odtwarzający cykl implement→verify.
