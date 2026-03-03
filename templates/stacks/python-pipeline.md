## Agent Ecosystem

**3 tiers** (all auto-discovered via symlinks):

| Tier | Agents | Model |
|------|--------|-------|
| Implementation | python-implementer, pipeline-designer | Sonnet |
| Verification | code-quality-verifier (Sonnet), security-verifier (Opus) | Mixed |
| Utility | codebase-explorer, test-generator | Haiku |

**Cost targets**:

| Model | Target |
|-------|--------|
| Opus | %%COST_OPUS%% |
| Sonnet | %%COST_SONNET%% |
| Haiku | %%COST_HAIKU%% |

---

## Architecture: Functional Modules

Pipeline projects organize by **function**, not by layers:

```
collectors/     →  processing/     →  storage/      →  access/
(data ingest)     (transform/ML)     (databases)      (API/MCP/CLI)
```

No `domain/services/api` layering — each module owns its full stack.

**Hook enforcement**: Typing checks only (no layer purity). Configured via `python-hooks.json`.

---

## Processing Pipeline

```python
# Single processing path — ALL data through one orchestrator
class DocumentOrchestrator:
    """Multi-stage pipeline. Every document passes through all stages."""

    async def process(self, raw: RawDocument) -> ProcessedDocument:
        doc = self.extract_content(raw)
        doc = self.extract_entities(doc)
        doc = self.classify_domain(doc)
        doc = self.extract_keywords(doc)
        doc = self.detect_language(doc)
        doc = self.generate_embeddings(doc)
        return doc
```

**Key principle**: Single processing path, no exceptions. All documents go through the same pipeline.

---

## Type Safety

```python
# ALWAYS: Type annotations on all public functions (enforced by hooks)
def process_batch(items: list[RawDocument]) -> list[ProcessedDocument]:
    ...

async def collect_source(source: SourceConfig) -> list[RawArtifact]:
    ...

# Use Protocol for interfaces
class Collector(Protocol):
    async def collect(self) -> list[RawArtifact]: ...
```

**Enforced by**: `check-python-typing.js` hook — flags missing return type annotations.

---

## Data Models

```python
# Frozen dataclasses for internal models
@dataclass(frozen=True)
class RawArtifact:
    source_id: str
    content: str
    metadata: dict[str, Any]
    collected_at: datetime

# Pydantic for config / external boundaries
class SourceConfig(BaseModel):
    id: str
    name: str
    collector_type: str  # rss | rest_api | browser | ...
    url: str
    rate_limit: RateLimitConfig
    enabled: bool = True
```

---

## Multi-Database Patterns

```python
# Each database stores what it's best at — zero duplication
class StorageRouter:
    """Route processed data to appropriate databases."""

    async def store(self, doc: ProcessedDocument) -> None:
        await self.postgres.store_metadata(doc)      # Structured metadata
        await self.vector_db.store_embedding(doc)     # Semantic search
        await self.graph_db.store_relationships(doc)  # Entity graph
        await self.cache.invalidate(doc.source_id)    # Cache bust
```

---

## Configuration: YAML-Driven

```yaml
# Source definitions (config/sources/*.yaml)
- id: source_name
  name: "Human-readable name"
  collector:
    type: rss           # rss | rest_api | browser | grant | sparql | bulk
    url: https://...
    rate_limit:
      requests_per_second: 0.5
      max_items_per_session: 100
  schedule: "0 */6 * * *"
  metadata:
    enabled: true
    tags: [topic1, topic2]
```

---

## Error Handling & Resilience

```python
# Circuit breaker for external sources
class CollectorEngine:
    async def collect(self, source: SourceConfig) -> list[RawArtifact]:
        if self.circuit_breaker.is_open(source.id):
            logger.warning(f"Circuit open for {source.id}, skipping")
            return []
        try:
            return await self._do_collect(source)
        except CollectionError as e:
            self.circuit_breaker.record_failure(source.id)
            raise

# Rate limiting — NEVER scrape aggressively
class RateLimiter:
    async def wait(self, source_id: str) -> None:
        """Respect per-source rate limits."""
        ...
```

---

## Testing Strategy

| Type | Coverage | What to Test |
|------|----------|-------------|
| **Unit** | ~50% | Processing stages, parsers, transformers |
| **Integration** | ~30% | Database storage, collector → DB flow |
| **System** | ~20% | End-to-end pipeline, MCP tools |

```python
@pytest.mark.unit
def test_entity_extraction(sample_document: RawDocument) -> None:
    extractor = EntityExtractor()
    result = extractor.extract(sample_document)
    assert len(result.entities) > 0
    assert any(e.type == "ORGANIZATION" for e in result.entities)

@pytest.mark.integration
async def test_full_pipeline(orchestrator: DocumentOrchestrator) -> None:
    raw = RawDocument(content="...", source_id="test")
    processed = await orchestrator.process(raw)
    assert processed.embeddings is not None
    assert processed.domain_classification is not None
```

Use **pytest** + **pytest-asyncio** + **pytest-cov**. Coverage target: 80%+.
