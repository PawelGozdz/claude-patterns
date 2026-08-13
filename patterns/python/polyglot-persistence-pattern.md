# Pattern: Polyglot Persistence (jeden dokument, kilka silników)

**Tags**: "data:data-access:polyglot", "data:app"

**Layer**: Infrastructure
**Status**: production
**Scope**: project-specific (my-intelligence) — single-project derivation, not yet validated
in a second codebase. Excluded from `retrieve_patterns` by default; pass
`project: "my-intelligence"` to include it. Promote to universal once a second project adopts
this shape.

## What This Is

Jeden rekord wejściowy trafia do kilku silników bazodanowych, bo każdy odpowiada na inne
pytanie. W SENTINEL: PostgreSQL trzyma dokument i jest źródłem prawdy, Qdrant trzyma jego
embeddingi i odpowiada na „co jest podobne", Neo4j trzyma encje i relacje i odpowiada na
„co się z czym łączy". Redis i Elasticsearch dochodzą jako cache i wyszukiwanie pełnotekstowe.

To nie to samo, co „mamy kilka baz". Wzorzec zaczyna się tam, gdzie **ten sam fakt** żyje
w więcej niż jednym miejscu — i trzeba rozstrzygnąć, które z nich kłamie, gdy się rozjadą.

Trzy rozstrzygnięcia, które trzeba podjąć świadomie, bo domyślnej odpowiedzi nie ma:

1. **Kto jest źródłem prawdy.** Dokładnie jeden silnik. Reszta to projekcje, które wolno
   odtworzyć od zera. W SENTINEL to PostgreSQL — Qdrant i Neo4j da się przebudować
   z dokumentów, odwrotnie już nie.
2. **Co się dzieje, gdy zapis do projekcji padnie.** Rekord jest już w źródle prawdy, więc
   porażka Neo4j nie może wycofać PostgreSQL — to byłaby transakcja rozproszona przez
   przypadek. Projekcja ma być odtwarzalna, a jej porażka policzalna.
3. **Jak wygląda wspólne wejście.** Jeden model (`BatchDocument`), z którego każdy writer
   bierze swój podzbiór pól. Bez tego każdy silnik dostaje własny kształt danych i po pół roku
   nikt nie wie, czy `author` w grafie znaczy to samo, co `author` w tabeli.

## When to Use

**Use this pattern for:**
- ✅ Ten sam byt musi być odpytywany na sposoby, których jeden silnik nie obsłuży sensownie
  (podobieństwo wektorowe + trawersowanie grafu + zapytania relacyjne)
- ✅ Pipeline zapisuje hurtowo (setki–tysiące rekordów na przebieg), więc koszt zapisu do
  N silników jest realną pozycją, nie szumem
- ✅ Projekcje wolno przebudować z materiału źródłowego — masz skąd je odtworzyć
- ✅ Silniki mają różne charakterystyki awarii i padnięcie jednego nie ma zatrzymywać przebiegu

**Do NOT use for:**
- ❌ „Bo Neo4j dobrze wygląda na diagramie" — jeden silnik z rozszerzeniem (PostGIS, pgvector,
  JSONB) obsługuje zaskakująco dużo. Dokładaj bazę, gdy masz zapytanie, którego obecna nie
  umie, a nie gdy przewidujesz, że kiedyś będziesz je mieć
- ❌ Dane transakcyjne wymagające atomowości między silnikami (salda, rezerwacje) — tu
  potrzebna jest jedna baza albo outbox, patrz `architecture/transactional-outbox-pattern.md`
- ❌ Sytuacja, w której każdy silnik ma **własne** dane, niepowielone nigdzie indziej — to
  po prostu kilka baz, nie polyglot persistence, i nie potrzebuje tego wzorca
- ❌ Projekcja, której nie da się odtworzyć ze źródła prawdy — wtedy nie jest projekcją,
  tylko drugim źródłem prawdy, i wzorzec przestaje się bronić

## Implementation

### Wspólny model wejściowy

`processing/batch_writer.py` — jeden dataclass, z którego korzystają wszystkie writery:

```python
@dataclass
class BatchDocument:
    """Minimal document record for batch insert."""
    url: str
    title: str
    content: str
    source_id: str
    domain: str
    published: str | None = None
    author: str | None = None
    language: str | None = None
    tags: list[str] | None = None
    metadata: dict[str, Any] | None = None
```

Każdy writer bierze podzbiór: Postgres wszystko, Neo4j `url/title/source_id/domain/published`
(treść w grafie nie ma po co siedzieć), Qdrant `content` plus metadane do filtrowania.

### Writer per silnik, batch jako tryb domyślny

```python
class PostgresBatchWriter:
    """
    Batch writer using PostgreSQL COPY protocol.

    COPY is 3-5x faster than individual INSERT statements for bulk data.
    """
```

Każdy silnik ma własną drogę na skróty przy zapisie hurtowym — COPY w PostgreSQL,
`UNWIND` w Neo4j, wsadowy `upsert` w Qdrant. Zapis rekord po rekordzie przy tej skali to nie
„prostsza wersja", tylko inna klasa kosztu.

### Degradacja zamiast wywrotki

Neo4j writer, gdy wsad się nie powiedzie, schodzi na pojedyncze `MERGE` i **liczy**, ile
rekordów przeszło:

```python
def _fallback_merge(self, batch: list[Dict], driver) -> int:
    """Fallback: individual MERGE statements."""
    count = 0
    with driver.session() as session:
        for doc in batch:
            ...
    logger.info(f"BatchWriter Neo4j fallback: merged {count}/{len(batch)} nodes")
    return count
```

Zwrócona liczba jest tu istotna: `count < len(batch)` to sygnał do przebudowy projekcji,
nie do zatrzymania przebiegu. Źródło prawdy ma już swoje.

## Anti-Patterns

### ❌ Ciche połykanie porażki pojedynczego rekordu

Prawdziwy kod z `_fallback_merge`:

```python
try:
    session.run("MERGE (d:Document {url: $url}) ...", **doc)
    count += 1
except Exception:
    pass          # ← ile rekordów i dlaczego przepadło? nie wiadomo
```

`count` mówi, ILE przeszło, ale nic nie mówi, **co** i **dlaczego** nie przeszło. Jeden
dokument z polem łamiącym zapytanie znika bez śladu i wraca dopiero jako „graf nie ma tego
węzła" pół roku później. Minimalna poprawka: zaloguj `url` i wyjątek na `debug`, a łączną
liczbę porażek na `warning`. Przy 231 źródłach różnica między „padło 3" a „padło 3000" to
różnica między szumem a incydentem.

### ❌ Zapis do projekcji w tej samej transakcji co źródło prawdy

Rollback PostgreSQL przez błąd Neo4j oznacza, że najsłabszy silnik dyktuje dostępność całego
zapisu. Projekcje zapisuj **po** commicie źródła prawdy i traktuj ich porażkę jako dług do
nadrobienia, nie jako powód wycofania.

### ❌ Brak drogi odtworzenia projekcji

Bez polecenia „przebuduj Qdrant z dokumentów" pierwsza rozbieżność kończy się ręcznym
dłubaniem w produkcyjnej bazie. Odtwarzalność projekcji należy do tego wzorca, nie do
osobnego zadania na potem.

### ❌ Rozjazd nazw i semantyki pól między silnikami

`published` jako `date` w PostgreSQL, string w Neo4j i timestamp w Qdrant to trzy różne
odpowiedzi na to samo pytanie. Wspólny `BatchDocument` istnieje właśnie po to — konwersja
należy do writera, nie do wywołującego.
