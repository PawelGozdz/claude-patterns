# Python Async Patterns

## When to Use

- Any I/O-bound Python service: database queries, HTTP calls, file operations
- When handling hundreds of concurrent connections with FastAPI or aiohttp
- When background tasks must not block request handling
- When managing shared resources like connection pools or rate limiters

**Do NOT use** async for CPU-bound work (number crunching, image processing). Use `concurrent.futures.ProcessPoolExecutor` or Celery workers instead.

---

## Implementation

### asyncio Fundamentals: gather, create_task, TaskGroup

```python
# src/services/enrichment_service.py
from __future__ import annotations

import asyncio
from dataclasses import dataclass


@dataclass
class EnrichedProfile:
    user_id: str
    credit_score: int | None
    social_data: dict | None
    compliance_status: str | None


async def fetch_credit_score(user_id: str) -> int:
    """Simulates external API call."""
    await asyncio.sleep(0.5)
    return 750


async def fetch_social_data(user_id: str) -> dict:
    await asyncio.sleep(0.3)
    return {"followers": 1200, "verified": True}


async def fetch_compliance_status(user_id: str) -> str:
    await asyncio.sleep(0.4)
    return "cleared"


async def enrich_profile_gather(user_id: str) -> EnrichedProfile:
    """asyncio.gather — run independent coroutines concurrently."""
    credit, social, compliance = await asyncio.gather(
        fetch_credit_score(user_id),
        fetch_social_data(user_id),
        fetch_compliance_status(user_id),
    )
    return EnrichedProfile(
        user_id=user_id,
        credit_score=credit,
        social_data=social,
        compliance_status=compliance,
    )


async def enrich_profile_taskgroup(user_id: str) -> EnrichedProfile:
    """TaskGroup (Python 3.11+) — structured concurrency with proper error handling.
    If any task fails, all others are cancelled automatically."""
    results: dict[str, object] = {}

    async with asyncio.TaskGroup() as tg:
        async def _fetch(key: str, coro):
            results[key] = await coro

        tg.create_task(_fetch("credit", fetch_credit_score(user_id)))
        tg.create_task(_fetch("social", fetch_social_data(user_id)))
        tg.create_task(_fetch("compliance", fetch_compliance_status(user_id)))

    return EnrichedProfile(
        user_id=user_id,
        credit_score=results["credit"],
        social_data=results["social"],
        compliance_status=results["compliance"],
    )
```

### Async Context Managers for Resource Management

```python
# src/repositories/connection_pool.py
from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import asyncpg

logger = logging.getLogger(__name__)


class DatabasePool:
    """Manages asyncpg connection pool lifecycle."""

    def __init__(self, dsn: str, min_size: int = 5, max_size: int = 20) -> None:
        self._dsn = dsn
        self._min_size = min_size
        self._max_size = max_size
        self._pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        self._pool = await asyncpg.create_pool(
            self._dsn,
            min_size=self._min_size,
            max_size=self._max_size,
        )
        logger.info("Database pool created (min=%d, max=%d)", self._min_size, self._max_size)

    async def disconnect(self) -> None:
        if self._pool:
            await self._pool.close()
            logger.info("Database pool closed")

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[asyncpg.Connection]:
        """Acquire a connection from the pool. Automatically returns it on exit."""
        if self._pool is None:
            raise RuntimeError("Pool not initialized. Call connect() first.")
        async with self._pool.acquire() as conn:
            yield conn

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[asyncpg.Connection]:
        """Acquire a connection with an active transaction."""
        async with self.acquire() as conn:
            async with conn.transaction():
                yield conn


# Usage in FastAPI lifespan:
#
# @asynccontextmanager
# async def lifespan(app: FastAPI) -> AsyncIterator[None]:
#     pool = DatabasePool(dsn=settings.database_url)
#     await pool.connect()
#     app.state.db_pool = pool
#     yield
#     await pool.disconnect()
```

### HTTP Connection Pool with aiohttp

```python
# src/services/external_api_client.py
from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)


class ExternalApiClient:
    """Reusable HTTP client with connection pooling and retry logic."""

    def __init__(
        self,
        base_url: str,
        timeout: float = 30.0,
        max_connections: int = 100,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = aiohttp.ClientTimeout(total=timeout)
        self._connector = aiohttp.TCPConnector(limit=max_connections)
        self._session: aiohttp.ClientSession | None = None

    async def start(self) -> None:
        self._session = aiohttp.ClientSession(
            base_url=self._base_url,
            timeout=self._timeout,
            connector=self._connector,
        )

    async def close(self) -> None:
        if self._session:
            await self._session.close()

    async def get(self, path: str, **kwargs: Any) -> dict[str, Any]:
        return await self._request("GET", path, **kwargs)

    async def post(self, path: str, **kwargs: Any) -> dict[str, Any]:
        return await self._request("POST", path, **kwargs)

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        if self._session is None:
            raise RuntimeError("Client not started. Call start() first.")
        async with self._session.request(method, path, **kwargs) as resp:
            resp.raise_for_status()
            return await resp.json()
```

### Semaphore for Rate Limiting

```python
# src/services/rate_limited_client.py
from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

logger = logging.getLogger(__name__)
T = TypeVar("T")


class RateLimiter:
    """Token bucket rate limiter using asyncio.Semaphore."""

    def __init__(self, max_concurrent: int = 10, requests_per_second: float = 50.0) -> None:
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._rate = requests_per_second
        self._min_interval = 1.0 / requests_per_second
        self._last_request_time: float = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_request_time
            if elapsed < self._min_interval:
                await asyncio.sleep(self._min_interval - elapsed)
            self._last_request_time = time.monotonic()

    async def execute(self, coro: Awaitable[T]) -> T:
        """Execute a coroutine within rate limits."""
        async with self._semaphore:
            await self.acquire()
            return await coro


class RateLimitedBatchProcessor:
    """Process a batch of items with rate limiting."""

    def __init__(self, rate_limiter: RateLimiter) -> None:
        self._limiter = rate_limiter

    async def process_batch(
        self,
        items: list[Any],
        handler: Callable[[Any], Awaitable[Any]],
    ) -> list[Any]:
        """Process items concurrently within rate limits."""
        tasks = [self._limiter.execute(handler(item)) for item in items]
        return await asyncio.gather(*tasks, return_exceptions=True)


# Usage:
# limiter = RateLimiter(max_concurrent=5, requests_per_second=10.0)
# processor = RateLimitedBatchProcessor(limiter)
# results = await processor.process_batch(
#     items=user_ids,
#     handler=lambda uid: api_client.get(f"/users/{uid}"),
# )
```

### Background Tasks with FastAPI

```python
# src/api/routes/grant_routes.py (background task example)
from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends

from api.dependencies import UserServiceDep
from services.notification_service import NotificationHandler

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/grants", tags=["grants"])


async def send_award_notification(grant_id: UUID, recipient_email: str) -> None:
    """Background task — runs after response is sent to client."""
    logger.info("Sending award notification for grant %s to %s", grant_id, recipient_email)
    # Simulate email sending
    handler = NotificationHandler()
    await handler.on_grant_awarded(
        grant_id=str(grant_id),
        recipient_email=recipient_email,
    )


@router.post("/{grant_id}/award")
async def award_grant(
    grant_id: UUID,
    background_tasks: BackgroundTasks,
    user_service: UserServiceDep,
) -> dict:
    grant = await user_service.award_grant(grant_id)

    # Fire-and-forget notification — doesn't block the response
    background_tasks.add_task(
        send_award_notification,
        grant_id=grant.id,
        recipient_email=grant.applicant_email,
    )

    return {"status": "awarded", "grant_id": str(grant.id)}
```

### Graceful Shutdown

```python
# src/main.py
from __future__ import annotations

import asyncio
import logging
import signal
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

logger = logging.getLogger(__name__)


class GracefulShutdown:
    """Manages graceful shutdown of background workers and connections."""

    def __init__(self) -> None:
        self._shutdown_event = asyncio.Event()
        self._background_tasks: set[asyncio.Task] = set()

    def request_shutdown(self) -> None:
        logger.info("Shutdown requested")
        self._shutdown_event.set()

    @property
    def is_shutting_down(self) -> bool:
        return self._shutdown_event.is_set()

    async def wait_for_shutdown(self) -> None:
        await self._shutdown_event.wait()

    def create_task(self, coro: Any, *, name: str | None = None) -> asyncio.Task:
        """Track a background task for graceful cleanup."""
        task = asyncio.create_task(coro, name=name)
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)
        return task

    async def shutdown(self, timeout: float = 30.0) -> None:
        """Cancel all tracked tasks and wait for completion."""
        logger.info("Shutting down %d background tasks...", len(self._background_tasks))
        for task in self._background_tasks:
            task.cancel()

        if self._background_tasks:
            done, pending = await asyncio.wait(
                self._background_tasks, timeout=timeout
            )
            if pending:
                logger.warning("%d tasks did not complete within timeout", len(pending))

        logger.info("Shutdown complete")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    shutdown_manager = GracefulShutdown()
    app.state.shutdown = shutdown_manager

    # Register signal handlers
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, shutdown_manager.request_shutdown)

    # Start background workers
    shutdown_manager.create_task(
        background_worker(shutdown_manager), name="background-worker"
    )

    yield

    # Cleanup on shutdown
    await shutdown_manager.shutdown(timeout=30.0)


async def background_worker(shutdown: GracefulShutdown) -> None:
    """Example background worker that respects shutdown signals."""
    logger.info("Background worker started")
    while not shutdown.is_shutting_down:
        try:
            # Do periodic work
            await process_pending_notifications()
            await asyncio.sleep(5.0)
        except asyncio.CancelledError:
            logger.info("Background worker cancelled")
            break
        except Exception:
            logger.exception("Background worker error")
            await asyncio.sleep(1.0)


async def process_pending_notifications() -> None:
    """Stub for actual work."""
    pass
```

### Error Handling in Async Code

```python
# src/services/resilient_service.py
from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)


async def fetch_with_fallback(
    primary: asyncio.coroutine,
    fallback: asyncio.coroutine,
    timeout: float = 5.0,
) -> Any:
    """Try primary with timeout, fall back on failure."""
    try:
        return await asyncio.wait_for(primary, timeout=timeout)
    except asyncio.TimeoutError:
        logger.warning("Primary timed out after %.1fs, using fallback", timeout)
        return await fallback
    except Exception as exc:
        logger.warning("Primary failed (%s), using fallback", exc)
        return await fallback


async def gather_with_errors(
    *coros: asyncio.coroutine,
    return_exceptions: bool = False,
) -> list[Any]:
    """gather that logs individual failures instead of crashing everything."""
    results = await asyncio.gather(*coros, return_exceptions=True)
    processed = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.error("Task %d failed: %s", i, result)
            if not return_exceptions:
                raise result
        processed.append(result)
    return processed
```

---

## Key Rules

1. **Use `asyncio.TaskGroup` (3.11+) over `gather`** when you need structured concurrency — automatic cancellation on failure
2. **Always use async context managers for resources** — connection pools, sessions, HTTP clients must clean up
3. **Semaphore for concurrency limiting** — never fire unlimited concurrent requests to external services
4. **Background tasks for fire-and-forget work** — `BackgroundTasks` for simple cases, `create_task` for long-running workers
5. **Handle `CancelledError` in workers** — always have a clean exit path when shutdown is requested
6. **Set timeouts on all external calls** — `asyncio.wait_for()` or client-level timeouts; never wait indefinitely
7. **Never call blocking I/O in async code** — use `asyncio.to_thread()` to offload sync operations to a thread pool

---

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|---|---|---|
| `time.sleep()` in async code | Blocks the entire event loop | `await asyncio.sleep()` |
| `requests.get()` in async handler | Blocks the event loop; defeats async | `aiohttp` or `httpx.AsyncClient` |
| `asyncio.gather()` without `return_exceptions` | One failure crashes all tasks | Set `return_exceptions=True` or use `TaskGroup` |
| Creating `aiohttp.ClientSession` per request | Connection pool overhead on every call | Shared session on `app.state`, created at startup |
| Ignoring `CancelledError` | Worker never stops, shutdown hangs | Catch `CancelledError`, clean up, re-raise or break |
| Fire-and-forget `create_task` without tracking | Lost tasks, no cleanup on shutdown | Track in a set, cancel all during shutdown |
| `async def` on a CPU-bound function | Starves event loop, no concurrency gain | Use `ProcessPoolExecutor` via `asyncio.to_thread()` |
