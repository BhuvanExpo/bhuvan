import json
import logging
import asyncio
import uuid
from typing import Optional, List, Dict, Any, Set
import redis.asyncio as aioredis
from app.config import settings

logger = logging.getLogger("broadcast.redis")

_redis: Optional[aioredis.Redis] = None
FEED_CACHE_KEY = "feed:latest"
BROADCAST_CHANNEL = "channel:broadcasts"
CACHE_TTL_SECONDS = 3600  # 1 hour rolling cache

# Unique identifier for this process instance to avoid duplicate local fanout
_INSTANCE_ID = uuid.uuid4().hex

# In-memory fanout queues for connected SSE spectators on this instance
_local_listeners: Set[asyncio.Queue] = set()
_subscriber_task: Optional[asyncio.Task] = None

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
    await stop_redis_subscriber()
    if _redis is not None:
        await _redis.close()
        logger.info("Redis connection closed.")
        _redis = None

async def get_redis() -> Optional[aioredis.Redis]:
    global _redis
    if _redis is None:
        _redis = await init_redis()
    return _redis

async def start_redis_subscriber():
    """Starts the multi-instance Redis Pub/Sub subscriber background task."""
    global _subscriber_task
    if _subscriber_task is None or _subscriber_task.done():
        _subscriber_task = asyncio.create_task(_redis_subscriber_loop())
        logger.info("Redis subscriber background task initiated.")

async def stop_redis_subscriber():
    """Stops the multi-instance Redis Pub/Sub subscriber."""
    global _subscriber_task
    if _subscriber_task and not _subscriber_task.done():
        _subscriber_task.cancel()
        try:
            await _subscriber_task
        except asyncio.CancelledError:
            pass
        _subscriber_task = None
        logger.info("Redis subscriber background task stopped.")

async def _redis_subscriber_loop():
    """
    Subscribes to Redis Pub/Sub channel to fan out broadcasts received from
    other backend worker/container instances across the cluster.
    """
    while True:
        try:
            r = await get_redis()
            if r is None:
                await asyncio.sleep(2)
                continue

            pubsub = r.pubsub()
            await pubsub.subscribe(BROADCAST_CHANNEL)
            logger.info("Subscribed to Redis broadcast channel for cluster-wide SSE distribution.")

            async for message in pubsub.listen():
                if message and message.get("type") == "message":
                    raw_data = message.get("data")
                    if raw_data:
                        try:
                            payload = json.loads(raw_data)
                            origin_instance = payload.get("_origin_id")
                            # Only fan out if this message was published by a DIFFERENT instance
                            if origin_instance != _INSTANCE_ID:
                                clean_broadcast = {k: v for k, v in payload.items() if not k.startswith("_")}
                                dispatch_local(clean_broadcast)
                        except Exception as e:
                            logger.error(f"Error handling pubsub broadcast: {e}")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"Redis subscriber connection lost: {e}. Retrying in 3s...")
            await asyncio.sleep(3)

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
    1. Instantly fans out to all connected SSE clients on THIS local instance.
    2. Prepends the new broadcast to the cached feed in Redis.
    3. Publishes to Redis pub/sub channel for all other instances in the cluster.
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

        # 4. Multi-instance Pub/Sub publish with origin instance tag
        payload = dict(broadcast)
        payload["_origin_id"] = _INSTANCE_ID
        await r.publish(BROADCAST_CHANNEL, json.dumps(payload))
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
