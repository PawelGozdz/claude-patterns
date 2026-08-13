# Pattern: Resilient Collection (pobieranie z wielu źródeł naraz)

**Tags**: "data:app:ingestion", "data:observability"

**Layer**: Application
**Status**: production
**Scope**: project-specific (my-intelligence) — single-project derivation, not yet validated
in a second codebase. Excluded from `retrieve_patterns` by default; pass
`project: "my-intelligence"` to include it. Promote to universal once a second project adopts
this shape.

## What This Is

Pipeline pobiera z wielu niezależnych źródeł (SENTINEL: 231), z których w każdej chwili
któreś jest zepsute: padł serwer, zmienił się format, wygasł token, ktoś dorzucił limit
zapytań. Wzorzec odpowiada na jedno pytanie: **jak sprawić, żeby awaria jednego źródła nie
była awarią przebiegu**.

Trzy mechanizmy, każdy na inny rodzaj porażki:

1. **Bezpiecznik per źródło** — źródło, które sypie błędami, zostaje wyłączone na jakiś czas.
   Kluczowe słowo to *per źródło*: bezpiecznik globalny przy 231 źródłach oznacza, że jedno
   zepsute zatrzymuje 230 działających.
2. **Checkpoint per źródło** — przebieg zaczyna się tam, gdzie skończył się poprzedni.
   Bez tego każde wznowienie to pobieranie wszystkiego od nowa, a przy źródłach z historią
   liczoną w latach to różnica między minutami a dobą.
3. **Definicja źródła jako dane, nie kod** — kolektor dostaje `SourceDefinition` i nie wie,
   które konkretne źródło obsługuje. Dodanie źródła to wpis w konfiguracji, nie nowa klasa.

Rozdzielenie tych trzech rzeczy jest istotne: otwarty bezpiecznik to stan **przejściowy**
(źródło wróci), a wyłączenie w konfiguracji to decyzja **człowieka**. Sklejenie ich w jedną
flagę sprawia, że nikt nie wie, czy źródło milczy, bo padło, czy dlatego, że ktoś je wyłączył.

## When to Use

**Use this pattern for:**
- ✅ Pobieranie z kilkunastu lub więcej niezależnych źródeł, gdzie awaria pojedynczego jest
  normą, a nie wyjątkiem
- ✅ Źródła z historią do nadrobienia — przebieg musi umieć zacząć od miejsca zatrzymania
- ✅ Zewnętrzne API z limitami zapytań, gdzie uparte ponawianie pogarsza sprawę
- ✅ Długie przebiegi (godziny), które muszą przetrwać restart procesu

**Do NOT use for:**
- ❌ Kilka źródeł — pojedynczy `try/except` z ponowieniem jest uczciwszy niż trzy mechanizmy
  do utrzymania. Wzorzec zaczyna się opłacać tam, gdzie awarie są ciągłym tłem
- ❌ Jedno źródło, jedno wywołanie, wynik potrzebny natychmiast — to zwykły klient HTTP,
  ewentualnie z ponowieniem; patrz `python/async-patterns.md`
- ❌ Pobieranie w odpowiedzi na żądanie użytkownika — bezpiecznik z godzinnym oknem zwróci
  pustkę komuś, kto czeka na ekranie. Ten wzorzec zakłada przebieg wsadowy
- ❌ Źródła transakcyjne, gdzie pominięcie rekordu jest niedopuszczalne — tu potrzebna jest
  kolejka z potwierdzeniami, nie bezpiecznik przepuszczający braki

## Implementation

### Bezpiecznik per źródło

`processing/collectors/circuit_breaker.py` — cały mechanizm mieści się w 82 liniach:

```python
@dataclass
class _BreakerState:
    consecutive_failures: int = 0
    open_until: float = 0.0


class PerSourceCircuitBreaker:
    """Per-source circuit breaker with auto-reset after timeout."""

    def __init__(self, failure_threshold: int = 10, timeout_seconds: int = 3600) -> None:
        ...

    def is_open(self, source_id: str) -> bool:
        state = self._state.get(source_id)
        if state is None:
            return False
        return state.open_until > time.time()

    def record_failure(self, source_id: str) -> None:
        state = self._state.setdefault(source_id, _BreakerState())
        state.consecutive_failures += 1
        if state.consecutive_failures >= self.failure_threshold:
            state.open_until = time.time() + self.timeout_seconds
            logger.warning("circuit_breaker: opened for source=%s ...", source_id)
```

Dwie rzeczy warte uwagi:

- **`consecutive_failures`, nie `total_failures`.** Jeden sukces zeruje licznik
  (`record_success`). Źródło, które psuje się raz na sto pobrań, nigdy nie powinno zostać
  wyłączone — przy liczniku sumarycznym zostałoby, tylko później.
- **Otwarcie i reset są logowane**, a `stats(source_id)` zwraca stan do diagnostyki.
  Bezpiecznik, który wycisza źródło bez śladu, wygląda dokładnie jak źródło, które nic nie
  publikuje — a to dwie zupełnie inne sytuacje.

### Checkpoint per źródło

`AdvancedCheckpointManager` trzyma stan w SQLite (`init_database`), osobno dla każdego
źródła (`get_checkpoint(source_name)` / `save_checkpoint`), i oddziela trzy pojęcia:

- `CheckpointData` — dokąd doszliśmy,
- `HistoricalFetchConfig` — jak głęboko wolno sięgnąć wstecz przy pierwszym przebiegu,
- `is_source_enabled(source_name)` — czy człowiek w ogóle chce z tego źródła korzystać.

Trzecie jest osobno właśnie dlatego, że nie jest awarią.

### Kolektor sterowany definicją źródła

```python
class SourceDrivenCollector(ABC):
    def __init__(self, source: SourceDefinition):
        ...

    @property
    def source_id(self) -> str: ...

    @property
    def collector_type(self) -> str: ...
```

Wynik ujednolica `CollectorResult.to_document_dict()` — dalsza część potoku nie wie i nie
musi wiedzieć, czy dane przyszły z RSS, przeglądarki czy zrzutu masowego.

## Anti-Patterns

### ❌ Bezpiecznik globalny zamiast per źródło

```python
if self.failures > 10:        # ← czyje?
    raise CollectionAborted()
```

Przy 231 źródłach dziesięć błędów zbierze się w pierwszej minucie z kilku niezależnych,
niezwiązanych ze sobą powodów. Przebieg pada, a 220 sprawnych źródeł nie zostaje odpytanych.
Stan bezpiecznika musi być kluczowany `source_id`.

### ❌ Checkpoint zapisywany na końcu przebiegu

Zapis po zakończeniu wszystkich źródeł oznacza, że przerwanie w 90% traci cały postęp.
Checkpoint należy do źródła i zapisuje się po jego zakończeniu, nie po zakończeniu potoku.

### ❌ Wyłączenie źródła jako trwały skutek awarii

Ustawienie `enabled = false`, gdy bezpiecznik się otworzył, zamienia usterkę przejściową
w decyzję trwałą — źródło nie wróci samo, a nikt nie pamięta, dlaczego zamilkło. Bezpiecznik
ma własne okno czasowe i sam się resetuje; konfiguracja jest od decyzji człowieka.

### ❌ Ponawianie w pętli bez oglądania się na przyczynę

`429 Too Many Requests` i `500 Internal Server Error` wymagają różnych reakcji: pierwsze —
odczekania, drugie — ponowienia. Ponawianie wszystkiego z tym samym opóźnieniem zamienia
limit zapytań w blokadę adresu IP.

### ❌ Nowa klasa kolektora na każde źródło

231 klas różniących się adresem URL i selektorem to 231 miejsc do poprawienia, gdy zmieni się
obsługa błędów. Różnice między źródłami należą do danych (`SourceDefinition`), nie do
hierarchii klas — kolektorów jest tyle, ile **rodzajów** pobierania.
