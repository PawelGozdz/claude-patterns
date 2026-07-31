# TASK-ACL-PORT-001 — reguła ACL: port vs inline, stałe kluczy, synchronizacja rule card

> **STATUS: BLOCKED** — czeka na `ADR-0108` w `juz-ide-api-2`. Nie edytować plików
> reguł/wzorców przed zatwierdzeniem ADR-a. Task-owner po stronie konsumenta:
> `juz-ide-api-2/project-orchestration/tasks/TS-ARCH-ACL-PORT-001-acl-port-boundary-policy.md`

**Kontekst:** sesja 2026-07-20, analiza `juz-ide-api-2`. Pytanie wyjściowe: czy przenieść
wstrzykiwanie ACL z handlerów do portów domenowych (przykład:
`neighborhood-economy/application/shares/commands/approve-claim/handler.ts`).
Analiza wykazała, że blokadą **nie** jest kod aplikacji, tylko **treść reguły w tym repo**.

## 1. Problem: reguła w tym repo zakazuje wzorca, który jest już w produkcji

`rules/nestjs-ddd/acl-registry.md` mówi w sekcji ALWAYS:

> Define the adapter interface inline at the call site
> (`getGlobalRequired<{ method(...): ... }>(key)`) — no class imports from the provider context.

Tymczasem w `juz-ide-api-2` istnieje **40 plików `*.port.ts`**, a handler `approve-claim`
używa **obu wzorców naraz** — portu `SP_BLOCK_CHECK_PORT` dla block-check i inline ACL dla
capability-check (linie 83-84 i 137-140 tego samego pliku).

Czyli: wzorzec portowy jest formalnie niezgodny z regułą, którą czyta
`code-quality-verifier`. Każda migracja do portów wygeneruje **fałszywe VETO**, a implementer
dostanie sprzeczne instrukcje (task każe port, reguła każe inline).

## 2. Dane z konsumenta (pomiar `juz-ide-api-2`, 2026-07-20)

| Metryka | Wartość |
| --- | --- |
| Realne wywołania `getGlobalRequired` (bez testów i JSDoc) | 139 |
| Distinct kluczy-stringów | 24 |
| Istniejące pliki `*.port.ts` | 40 |
| Pliki duplikujące inline interfejs `getUserCapabilities` | 22 |
| Testy stubujące ACL registry / mockujące port | 57 / 18 |
| Stałe dla kluczy ACL | 1 na 24 |

Erozja kluczy przy braku hamulca kompilatora — cztery konwencje naraz:
płaskie (`'auth'`, `'trust'`), z sufiksem (`'auth-api'`, `'organization-api'`),
namespace'owane (`'reputation:suspension-check'`), plus `'geographicAuth'` w JSDoc vs
faktyczne `'geographic-auth'`. Do tego `'some-context-api'` — placeholder z przykładu
w tym repo, skopiowany do produkcyjnego pliku konsumenta
(`discussions/domain/ports/thread-participation.acl.port.ts`).

**Ostatni punkt dotyczy nas bezpośrednio**: przykład z dokumentacji wzorca trafił do kodu
jako literał. Wzorzec powinien używać oczywistego placeholdera (`'<provider-context>'`),
nie stringa wyglądającego na prawdziwy klucz.

### Hipoteza obalona — nie powtarzać w uzasadnieniach

„Inline ACL w handlerze brudzi domenę" jest **nieprawdą**. Zweryfikowane grepem: żaden plik
w `contexts/*/domain/` ani `shared/domain/` nie importuje `@shared/infrastructure/acl`
(5 trafień to wyłącznie JSDoc). Czystość warstw jest identyczna w obu wariantach.
Realne zyski portu są węższe: jeden kontrakt zamiast 22 kopii, klucz sprawdzany przez `tsc`,
mock jednopoziomowy w testach, „find references" w IDE.

## 3. Zakres w TYM repo

Wyłącznie treść reguł i wzorców. **Kodu konsumentów nie dotykamy z tego repo.**

| Plik | Co zmienić |
| --- | --- |
| `rules/nestjs-ddd/acl-registry.md` | sekcja „ALWAYS: define the adapter interface inline at the call site" → reguła **progowa** wg ADR-0108 |
| `patterns/architecture/acl-registry-pattern.md` | dodać wariant portowy jako równoprawny + kryterium wyboru; podmienić `'some-context-api'` na jawny placeholder |
| `patterns/architecture/acl-registry-pattern_summary.md` | rule card — zsynchronizować ID reguł ze zmienioną treścią |

**Wszystkie trzy w jednym commicie.** Rozjazd między `acl-registry.md` a `_summary.md` to
najgorszy możliwy stan: `code-quality-verifier` czyta rule card, więc reguła mówiłaby jedno,
a egzekucja robiła drugie. To dokładnie ta klasa problemu, którą opisuje
`TASK-AGENT-CONFORMANCE-001` §1.1 (luka w Rule Cardzie mylona z błędem implementera).

Propozycja reguły progowej do zatwierdzenia w ADR:

- kontrakt cross-context używany w **≥3 call-sites** → port domenowy + adapter
- **1-2 call-sites** → inline dozwolony
- klucze ACL **zawsze** jako stałe, nigdy literały — bezwyjątkowo
- jedna konwencja nazewnicza (płaska vs `kontekst:zdolność` — do rozstrzygnięcia)
- ustalić kanoniczną lokalizację portu: `domain/ports/` vs `application/ports/`
  (dziś oba warianty są w użyciu u konsumenta — `reputation/domain/ports/`
  vs `auth/application/ports/`)

## 4. Propagacja — automatyczna, ale to nie znaczy „bezpieczna"

`rules/nestjs-ddd/` jest podlinkowane symlinkiem przez **4 repo `juz-ide-api`** (1-4)
oraz częściowo przez pozostałe projekty w `/opt/projects/`. Zmiana propaguje się
**natychmiast i wszędzie, bez żadnej pracy per-repo** — nie ma tu nic do zrobienia
po stronie konsumentów.

Konsekwencja, o której trzeba pamiętać przy pisaniu nowej reguły: **propaguje się
reguła, nie kod**. W momencie merge'a `api-1`, `api-3` i `api-4` dostają nowy kontrakt,
którego ich istniejący kod nie spełnia — bez ostrzeżenia i bez review w tamtych repo.
Dlatego reguła progowa musi być sformułowana tak, żeby **istniejący inline poniżej progu
pozostał legalny** (nie „inline jest zakazany", tylko „≥3 call-sites wymaga portu").
Inaczej trzy repo z dnia na dzień stają się niezgodne z własnym rule cardem.

## 5. Kolejność (nie odwracać)

1. `ADR-0108` w `juz-ide-api-2` — decyzja i review lokalnie, tam gdzie są dane.
2. Commit w tym repo (3 pliki naraz), z referencją do ADR-0108 w treści commita.
3. Konsumenci migrują kod we własnym tempie — `TS-ARCH-ACL-PORT-001` w `juz-ide-api-2`
   opisuje kroki (stałe kluczy → port dla `getUserCapabilities` → reguła dla nowego kodu).

## Kryteria akceptacji

- [ ] `ADR-0108` zatwierdzony w `juz-ide-api-2` (bramka — nic wcześniej)
- [ ] `acl-registry.md` bez zdania „define the adapter interface inline at the call site";
      w zamian reguła progowa
- [ ] `acl-registry-pattern.md` opisuje oba warianty + kryterium wyboru
- [ ] `acl-registry-pattern_summary.md` zsynchronizowany, ID reguł zgodne z nową treścią
- [ ] `'some-context-api'` zastąpione jawnym placeholderem we wzorcu
- [ ] Reguła sformułowana tak, że inline poniżej progu **pozostaje legalny**
      (weryfikacja: czy `api-1`/`api-3`/`api-4` nie stają się masowo niezgodne)
- [ ] Wszystkie 3 pliki w jednym commicie
