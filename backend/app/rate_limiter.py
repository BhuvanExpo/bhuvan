import time
import logging
from typing import Tuple, Optional
from app.redis_client import get_redis

logger = logging.getLogger("broadcast.rate_limiter")

# In-memory sliding window fallback if Redis is temporarily unreachable
_memory_rate_cache = {}

async def is_rate_limited(
    key: str,
    max_requests: int,
    window_seconds: int = 60
) -> Tuple[bool, int]:
    """
    Sliding window rate limit checker.
    Returns (is_limited, retry_after_seconds).
    Uses Redis sorted set if available, falls back to memory.
    """
    now = time.time()
    cutoff = now - window_seconds
    redis_key = f"ratelimit:{key}"

    try:
        r = await get_redis()
        if r is not None:
            pipe = r.pipeline()
            # Remove timestamps outside window
            pipe.zremrangebyscore(redis_key, 0, cutoff)
            # Count remaining timestamps
            pipe.zcard(redis_key)
            # Add current timestamp
            pipe.zadd(redis_key, {str(now): now})
            # Set key expiration
            pipe.expire(redis_key, window_seconds + 5)
            _, current_count, _, _ = await pipe.execute()

            if current_count >= max_requests:
                return True, int(window_seconds)
            return False, 0
    except Exception as e:
        logger.warning(f"Redis rate limiter exception, falling back to local memory: {e}")

    # In-memory sliding window fallback
    history = _memory_rate_cache.get(key, [])
    # Filter out entries older than cutoff
    history = [ts for ts in history if ts > cutoff]
    if len(history) >= max_requests:
        oldest = history[0]
        retry_after = max(1, int(oldest + window_seconds - now))
        _memory_rate_cache[key] = history
        return True, retry_after

    history.append(now)
    _memory_rate_cache[key] = history
    return False, 0
