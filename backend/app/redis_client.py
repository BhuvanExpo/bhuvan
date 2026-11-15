import json
import logging
import asyncio
from typing import Optional, List, Dict, Any, Set
import redis.asyncio as aioredis
from app.config import settings

logger = logging.getLogger("broadcast.redis")

_redis: Optional[aioredis.Redis] = None
FEED_CACHE_KEY = "feed:latest"
BROADCAST_CHANNEL = "channel:broadcasts"
CACHE_TTL_SECONDS = 3600  # 1 hour rolling cache

# In-memory fanout queues for connected SSE spectators
_local_listeners: Set[asyncio.Queue] = set()

def register_listener() -> asyncio.Queue:
    """Registers a new spectator SSE queue."""
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _local_listeners.add(q)
    return q

def unregister_listener(q: asyncio.Queue):
    """Unregisters an SSE queue on client disconnect."""
    _local_listeners.discard(q)

def dispatch_local(broadcast: Dict[str, Any]):
    """Instantly dispatches a broadcast to all locally connected SSE spectator queues."""
    for q in list(_local_listeners):
        try:
            q.put_nowait(broadcast)
        except asyncio.QueueFull:
            pass

async def init_redis() -> Optional[aioredis.Redis]:
    global _redis
    try:
        _redis = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=10.0,
            retry_on_timeout=True
        )
        await _redis.ping()
        logger.info("Redis client connected successfully.")
        return _redis
    except Exception as e:
        logger.warning(f"Could not connect to Redis on startup: {e}. (Will retry on requests)")
        _redis = None
        return None

async def close_redis():
    global _redis
    if _redis is not None:
        await _redis.close()
        logger.info("Redis connection closed.")
        _redis = None

async def get_redis() -> Optional[aioredis.Redis]:
    global _redis
    if _redis is None:
        _redis = await init_redis()
    return _redis

async def get_cached_feed(slot_number: Optional[int] = None) -> Optional[List[Dict[str, Any]]]:
    """Retrieve pre-cached feed from Redis memory."""
    r = await get_redis()
    if r is None:
        return None
    try:
        cache_key = f"feed:slot:{slot_number}" if slot_number is not None else FEED_CACHE_KEY
        raw = await r.get(cache_key)
        if raw:
            return json.loads(raw)
    except Exception as e:
        logger.warning(f"Redis get_cached_feed error: {e}")
    return None

async def set_cached_feed(feed: List[Dict[str, Any]], slot_number: Optional[int] = None):
    """Store pre-computed feed in Redis with TTL."""
    r = await get_redis()
    if r is None:
        return
    try:
        cache_key = f"feed:slot:{slot_number}" if slot_number is not None else FEED_CACHE_KEY
        await r.set(cache_key, json.dumps(feed), ex=CACHE_TTL_SECONDS)
    except Exception as e:
        logger.warning(f"Redis set_cached_feed error: {e}")

async def write_through_broadcast(broadcast: Dict[str, Any]):
    """
    1. Instantly fans out to all connected SSE clients on this instance.
    2. Prepends the new broadcast to the cached feed in Redis.
    3. Publishes to Redis pub/sub channel for other instances.
    """
    # 1. Instant local memory fanout (zero latency)
    dispatch_local(broadcast)

    r = await get_redis()
    if r is None:
        return
    try:
        # 2. Update global feed:latest cache
        raw = await r.get(FEED_CACHE_KEY)
        feed = json.loads(raw) if raw else []
        feed.insert(0, broadcast)
        feed = feed[:100]  # Retain latest 100 in memory
        await r.set(FEED_CACHE_KEY, json.dumps(feed), ex=CACHE_TTL_SECONDS)

        # 3. Update slot-specific cache
        slot_key = f"feed:slot:{broadcast['slot_number']}"
        raw_slot = await r.get(slot_key)
        slot_feed = json.loads(raw_slot) if raw_slot else []
        slot_feed.insert(0, broadcast)
        slot_feed = slot_feed[:100]
        await r.set(slot_key, json.dumps(slot_feed), ex=CACHE_TTL_SECONDS)

        # 4. Multi-instance Pub/Sub publish
        await r.publish(BROADCAST_CHANNEL, json.dumps(broadcast))
    except Exception as e:
        logger.error(f"Redis write_through_broadcast error: {e}")

async def check_redis_health() -> bool:
    try:
        r = await get_redis()
        if r is None:
            return False
        return await r.ping()
    except Exception:
        return False
