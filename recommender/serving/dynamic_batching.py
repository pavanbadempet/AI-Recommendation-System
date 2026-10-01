"""
Adaptive sliding-window request batching for FastAPI recommendation serving.
"""
import asyncio
from typing import Any, List, Tuple

class AdaptiveRequestBatcher:
    """Aggregates concurrent incoming ranking requests into optimal batch tensor sizes."""

    def __init__(self, max_batch_size: int = 64, max_wait_ms: float = 5.0) -> None:
        self.max_batch_size = max_batch_size
        self.max_wait_ms = max_wait_ms
        self._queue: List[Tuple[Any, asyncio.Future]] = []

    async def enqueue(self, item: Any) -> Any:
        loop = asyncio.get_running_loop()
        fut = loop.create_future()
        self._queue.append((item, fut))
        return await fut
