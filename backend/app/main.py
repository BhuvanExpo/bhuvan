import asyncio
import json
import logging
import os
import uuid
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Request, Response, status, Query, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.config import settings
from app.db import (
    init_db_pool,
    close_db_pool,
    get_slot,
    get_all_slots,
    get_slot_10_last_broadcast_time,
    insert_broadcast,
    get_recent_broadcasts,
    update_slot_profile,
    check_db_health,
    get_admin_stats,
    admin_create_or_assign_slot,
    admin_update_slot,
    admin_rotate_slot_key,
    admin_delete_slot,
    admin_get_all_broadcasts,
    admin_delete_broadcast,
    admin_reset_slot_10_cooldown,
)
from app.redis_client import (
    init_redis,
    close_redis,
    get_cached_feed,
    set_cached_feed,
    write_through_broadcast,
    register_listener,
    unregister_listener,
    check_redis_health,
)
from app.security import (
    validate_replay_window,
    construct_canonical_message,
    construct_canonical_profile_message,
    verify_signature,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("broadcast.api")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize connection pools
    logger.info("Starting up BHUVAN Global Broadcast backend...")
    await init_db_pool()
    await init_redis()
    yield
    # Shutdown: clean up connections
    logger.info("Shutting down backend services...")
    await close_redis()
    await close_db_pool()

app = FastAPI(
    title="BHUVAN Global Broadcast API",
    description="BHUVAN — Ultra-exclusive, read-only 10-Voice immutable broadcast system with Ed25519 verification.",
    version="1.0.0",
    lifespan=lifespan
)

# Apply CORS middleware for spectator & admin access
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Uploads directory and static file mounting
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# ==============================================================================
# PYDANTIC SCHEMAS
# ==============================================================================

class BroadcastRequest(BaseModel):
    slot_number: int = Field(..., ge=1, description="Slot index")
    body: str = Field(..., min_length=1, max_length=4000, description="Broadcast message text")
    media_url: Optional[str] = Field(None, description="Optional image/media link")
    timestamp: str = Field(..., description="UTC ISO-8601 or epoch timestamp (strict 5-minute replay window)")
    signature: str = Field(..., description="Base64-encoded Ed25519 signature of canonical payload")

class BroadcastResponse(BaseModel):
    id: int
    slot_number: int
    real_name: Optional[str] = None
    category_label: str
    avatar_url: Optional[str] = None
    body: str
    media_url: Optional[str] = None
    signature_b64: str
    created_at: str
    verified: bool = True

class SlotStatus(BaseModel):
    slot_number: int
    real_name: Optional[str] = None
    category_label: str
    avatar_url: Optional[str] = None
    cover_url: Optional[str] = None
    bio: Optional[str] = None
    links: Optional[List[Any]] = None
    followers_count: Optional[int] = 0
    public_key_hex: str
    last_broadcast_at: Optional[str] = None
    total_broadcasts: int = 0

class UpdateProfileRequest(BaseModel):
    real_name: Optional[str] = Field(None, max_length=100)
    category_label: Optional[str] = Field(None, max_length=150)
    avatar_url: Optional[str] = Field(None, max_length=1000)
    cover_url: Optional[str] = Field(None, max_length=1000)
    bio: Optional[str] = Field(None, max_length=1000)
    links: Optional[List[Any]] = None
    timestamp: str = Field(..., description="UTC ISO-8601 or epoch timestamp (strict 5-minute replay window)")
    signature: str = Field(..., description="Base64-encoded Ed25519 signature of canonical profile payload")

class Slot10CooldownInfo(BaseModel):
    is_locked: bool
    last_broadcast_at: Optional[str] = None
    next_eligible_at: Optional[str] = None
    cooldown_seconds_remaining: int = 0
    cooldown_total_hours: int = 168

class SlotsMatrixResponse(BaseModel):
    slots: List[SlotStatus]
    slot_10_cooldown: Slot10CooldownInfo

# Admin Command Center Schemas
class AdminSlotCreateRequest(BaseModel):
    slot_number: Optional[int] = Field(None, ge=1, description="Specific slot number, or omit to auto-assign")
    real_name: str = Field(..., min_length=1, max_length=100)
    category_label: str = Field(..., min_length=1, max_length=150)
    avatar_url: Optional[str] = Field(None, max_length=1000)
    cover_url: Optional[str] = Field(None, max_length=1000)
    bio: Optional[str] = Field(None, max_length=1000)
    links: Optional[List[Any]] = None
    followers_count: Optional[int] = 0
    custom_private_key: Optional[str] = Field(None, description="Optional 64-char hex seed, otherwise auto-generated")

class AdminSlotUpdateRequest(BaseModel):
    real_name: Optional[str] = Field(None, max_length=100)
    category_label: Optional[str] = Field(None, max_length=150)
    avatar_url: Optional[str] = Field(None, max_length=1000)
    cover_url: Optional[str] = Field(None, max_length=1000)
    bio: Optional[str] = Field(None, max_length=1000)
    links: Optional[List[Any]] = None
    followers_count: Optional[int] = None

class AdminBroadcastItem(BaseModel):
    id: int
    slot_number: int
    real_name: Optional[str] = None
    category_label: Optional[str] = None
    avatar_url: Optional[str] = None
    public_key_hex: Optional[str] = None
    body: str
    media_url: Optional[str] = None
    signature_b64: str
    created_at: str

# ==============================================================================
# CORE BROADCAST INGESTION (SLOT HOLDERS ONLY)
# ==============================================================================

@app.post(
    "/api/v1/broadcast",
    status_code=status.HTTP_201_CREATED,
    response_model=BroadcastResponse,
    summary="Publish an immutable broadcast (Strictly Slot Holders 1-10)"
)
async def post_broadcast(payload: BroadcastRequest, response: Response):
    """
    Ingest a new immutable broadcast from one of the 10 Genesis slots:
    1. Replay attack guard (must be within +/- 5 minutes of server UTC time)
    2. Titan Rule: Slot #10 rate limit check (168-hour / 7-day cooldown)
    3. Ed25519 digital signature cryptographic verification
    4. Immutable insert into PostgreSQL
    5. Write-through to Redis memory cache and SSE distribution
    """
    # 1. Replay Attack Guard
    is_valid_time, replay_error, parsed_time = validate_replay_window(
        payload.timestamp,
        tolerance_seconds=settings.REPLAY_TOLERANCE_SECONDS
    )
    if not is_valid_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Replay attack guard triggered: {replay_error}"
        )

    # 2. Genesis Slot Registry Check
    try:
        slot_info = await get_slot(payload.slot_number)
    except Exception as e:
        logger.error(f"Database error checking slot: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve slot cryptographic keys from database."
        )

    if not slot_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Slot #{payload.slot_number:02d} is not configured or uninitialized in the Genesis Registry."
        )

    # 3. Slot #10 Rate-Limit Enforcement (The Titan Rule)
    if payload.slot_number == 10:
        last_broadcast_time = await get_slot_10_last_broadcast_time()
        if last_broadcast_time is not None:
            cooldown_delta = timedelta(hours=settings.SLOT_10_COOLDOWN_HOURS)
            next_allowed = last_broadcast_time + cooldown_delta
            now_utc = datetime.now(timezone.utc)
            if now_utc < next_allowed:
                remaining_seconds = int((next_allowed - now_utc).total_seconds())
                response.headers["Retry-After"] = str(remaining_seconds)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "error": "The Titan Rule Enforced: Slot #10 is on 7-day (168-hour) cooldown.",
                        "last_broadcast_at": last_broadcast_time.isoformat(),
                        "next_eligible_at": next_allowed.isoformat(),
                        "seconds_remaining": remaining_seconds,
                        "cooldown_hours": settings.SLOT_10_COOLDOWN_HOURS
                    }
                )

    # 4. Signature Verification (PyNaCl)
    canonical_payload = construct_canonical_message(
        payload.slot_number,
        payload.body,
        payload.timestamp
    )
    is_signature_valid = verify_signature(
        public_key_hex=slot_info["public_key_hex"],
        canonical_bytes=canonical_payload,
        signature_b64=payload.signature
    )

    if not is_signature_valid:
        logger.warning(f"Signature verification FAILED for slot {payload.slot_number}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Cryptographic authentication failed. Signature does not match public key for Slot #{payload.slot_number:02d}."
        )

    # 5. Immutable Database Insert
    try:
        inserted_record = await insert_broadcast(
            slot_number=payload.slot_number,
            body=payload.body,
            media_url=payload.media_url,
            signature_b64=payload.signature,
            created_at=parsed_time
        )
    except Exception as e:
        logger.error(f"Error persisting broadcast: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist broadcast to immutable ledger."
        )

    # 6. Write-Through to Redis Cache & SSE Fanout
    await write_through_broadcast(inserted_record)

    logger.info(f"Broadcast from Slot #{payload.slot_number:02d} verified and published: ID {inserted_record['id']}")
    return inserted_record

# ==============================================================================
# DIRECT DEVICE MEDIA UPLOAD (CAMERA & STORAGE)
# ==============================================================================

@app.post(
    "/api/v1/upload",
    summary="Upload image media directly from device camera or storage"
)
async def upload_media(request: Request, file: UploadFile = File(...)):
    """
    Accepts an image directly from device storage or camera capture.
    Stores securely in the local uploads directory and returns its accessible public URL.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format. Please upload an image (JPEG, PNG, WebP, GIF, AVIF, HEIC)."
        )

    # 15MB file size ceiling
    MAX_FILE_SIZE = 15 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds maximum allowed limit of 15MB."
        )

    orig_ext = Path(file.filename).suffix.lower() if file.filename else ".jpg"
    if orig_ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic"]:
        orig_ext = ".jpg"

    unique_filename = f"{uuid.uuid4().hex}{orig_ext}"
    dest_path = UPLOAD_DIR / unique_filename

    with open(dest_path, "wb") as f:
        f.write(content)

    base_url = str(request.base_url).rstrip("/")
    public_url = f"{base_url}/uploads/{unique_filename}"

    return {
        "url": public_url,
        "relative_path": f"/uploads/{unique_filename}",
        "filename": unique_filename,
        "size": len(content),
        "content_type": file.content_type
    }

# ==============================================================================
# READ-ONLY SPECTATOR FEED & STREAM (100k+ CONCURRENT CAPACITY)
# ==============================================================================

@app.get(
    "/api/v1/feed",
    response_model=List[BroadcastResponse],
    summary="Read-only chronological broadcast feed (Cache-first)"
)
async def get_feed(
    slot_number: Optional[int] = Query(None, ge=1, description="Filter by Slot #"),
    limit: int = Query(50, ge=1, le=100, description="Max broadcasts to retrieve")
):
    """
    Returns the immutable chronological feed.
    Zero-mock architecture: returns only genuine verified broadcasts.
    Reads from Redis in-memory cache first to shield PostgreSQL.
    """
    # 1. Try Redis cache
    cached = await get_cached_feed(slot_number=slot_number)
    if cached is not None:
        return cached[:limit]

    # 2. Cache miss -> query PostgreSQL
    try:
        db_records = await get_recent_broadcasts(slot_number=slot_number, limit=limit)
        # Update cache asynchronously
        await set_cached_feed(db_records, slot_number=slot_number)
        return db_records
    except Exception as e:
        logger.error(f"Database query error in /feed: {e}")
        return []

@app.get(
    "/api/v1/stream",
    summary="Real-time Server-Sent Events (SSE) live push stream"
)
async def stream_live_broadcasts(request: Request):
    """
    SSE stream for spectators. Subscribes to real-time broadcasts
    so 100,000+ concurrent spectators receive instant push updates
    the exact moment a post is published, with zero page reloads.
    """
    async def event_generator():
        # Yield initial connection confirmation
        yield "event: connected\ndata: {\"status\": \"connected\"}\n\n"

        q = register_listener()
        keepalive_interval = 15  # seconds
        last_keepalive = asyncio.get_event_loop().time()

        try:
            while True:
                # Check for client disconnect
                if await request.is_disconnected():
                    break

                try:
                    # Wait for message with short timeout to allow keepalive and disconnect check
                    broadcast = await asyncio.wait_for(q.get(), timeout=2.0)
                    event_data = f"event: broadcast\ndata: {json.dumps(broadcast)}\n\n"
                    yield event_data
                    last_keepalive = asyncio.get_event_loop().time()
                except asyncio.TimeoutError:
                    pass

                # Send keepalive comment to avoid proxy/browser timeouts
                now = asyncio.get_event_loop().time()
                if now - last_keepalive >= keepalive_interval:
                    yield ": keepalive\n\n"
                    last_keepalive = now

        except asyncio.CancelledError:
            pass
        finally:
            unregister_listener(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disables nginx proxy buffering
        }
    )

@app.get(
    "/api/v1/slots",
    response_model=SlotsMatrixResponse,
    summary="10-Slot Status Matrix & Slot #10 Cooldown Matrix"
)
async def get_slots_status():
    """
    Returns the real-time status of all 10 slots and the active cooldown
    timer for Slot #10 (The Titan Rule).
    """
    slots_list: List[Dict[str, Any]] = []
    try:
        slots_list = await get_all_slots()
    except Exception as e:
        logger.warning(f"Could not load slots from DB: {e}")

    # Calculate Slot #10 Cooldown
    last_10_time = await get_slot_10_last_broadcast_time()
    cooldown_info = Slot10CooldownInfo(is_locked=False, cooldown_total_hours=settings.SLOT_10_COOLDOWN_HOURS)

    if last_10_time is not None:
        cooldown_delta = timedelta(hours=settings.SLOT_10_COOLDOWN_HOURS)
        next_eligible = last_10_time + cooldown_delta
        now_utc = datetime.now(timezone.utc)
        cooldown_info.last_broadcast_at = last_10_time.isoformat()
        cooldown_info.next_eligible_at = next_eligible.isoformat()

        if now_utc < next_eligible:
            remaining_seconds = int((next_eligible - now_utc).total_seconds())
            cooldown_info.is_locked = True
            cooldown_info.cooldown_seconds_remaining = remaining_seconds

    # Build slot statuses dynamically
    final_slots: List[SlotStatus] = []
    if slots_list:
        for data in slots_list:
            final_slots.append(SlotStatus(
                slot_number=data["slot_number"],
                real_name=data.get("real_name"),
                category_label=data.get("category_label", f"Slot #{data['slot_number']:02d}"),
                avatar_url=data.get("avatar_url"),
                cover_url=data.get("cover_url"),
                bio=data.get("bio"),
                links=data.get("links", []),
                followers_count=data.get("followers_count", 0),
                public_key_hex=data.get("public_key_hex", ""),
                last_broadcast_at=data.get("last_broadcast_at"),
                total_broadcasts=data.get("total_broadcasts", 0)
            ))
    else:
        for i in range(1, 11):
            final_slots.append(SlotStatus(
                slot_number=i,
                real_name=None,
                category_label=f"Slot #{i:02d} (Uninitialized)",
                avatar_url=None,
                cover_url=None,
                bio=None,
                links=[],
                followers_count=0,
                public_key_hex="",
                last_broadcast_at=None,
                total_broadcasts=0
            ))

    return SlotsMatrixResponse(
        slots=final_slots,
        slot_10_cooldown=cooldown_info
    )

@app.post(
    "/api/v1/slots/{slot_number}/profile",
    response_model=SlotStatus,
    summary="Update Slot Voice Profile (Strictly Authenticated Slot Holder)"
)
async def update_profile(slot_number: int, payload: UpdateProfileRequest):
    """
    Allows a verified Slot voice member to update their profile picture, cover photo, bio,
    real-world name, and spot name. Cryptographically authenticated using their Ed25519 private key.
    """
    if slot_number < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slot number must be at least 1."
        )

    # 1. Replay attack guard
    is_valid_time, replay_error, _ = validate_replay_window(
        payload.timestamp,
        tolerance_seconds=settings.REPLAY_TOLERANCE_SECONDS
    )
    if not is_valid_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Replay attack guard triggered: {replay_error}"
        )

    # 2. Get registered slot details
    slot_info = await get_slot(slot_number)
    if not slot_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Slot #{slot_number:02d} is uninitialized in the Genesis Registry."
        )

    # 3. Canonical signature check (supports both v2 with cover_url and v1 fallback)
    target_real_name = payload.real_name.strip() if payload.real_name else (slot_info.get("real_name") or "")
    target_label = payload.category_label.strip() if payload.category_label else (slot_info.get("category_label") or "")
    target_avatar = payload.avatar_url.strip() if payload.avatar_url else (slot_info.get("avatar_url") or "")
    target_cover = payload.cover_url.strip() if payload.cover_url else (slot_info.get("cover_url") or "")
    target_bio = payload.bio.strip() if payload.bio else (slot_info.get("bio") or "")

    canonical_payload_v2 = construct_canonical_profile_message(
        slot_number=slot_number,
        real_name=target_real_name,
        category_label=target_label,
        avatar_url=target_avatar,
        cover_url=target_cover,
        bio=target_bio,
        timestamp_str=payload.timestamp
    )

    canonical_payload_v1 = f"profile:{slot_number}:{target_real_name}:{target_label}:{target_avatar}:{target_bio}:{payload.timestamp}".encode("utf-8")

    is_valid_sig = verify_signature(
        public_key_hex=slot_info["public_key_hex"],
        canonical_bytes=canonical_payload_v2,
        signature_b64=payload.signature
    ) or verify_signature(
        public_key_hex=slot_info["public_key_hex"],
        canonical_bytes=canonical_payload_v1,
        signature_b64=payload.signature
    )

    if not is_valid_sig:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cryptographic authentication failed. Signature does not match private key for this Slot."
        )

    # 4. Perform database update
    try:
        updated = await update_slot_profile(
            slot_number=slot_number,
            real_name=payload.real_name,
            category_label=payload.category_label,
            avatar_url=payload.avatar_url,
            cover_url=payload.cover_url,
            bio=payload.bio,
            links=payload.links
        )
    except Exception as e:
        logger.error(f"Failed to update slot profile in DB: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update slot profile in database."
        )

    # 5. Invalidate cached feed so feed and UI reflect profile changes
    try:
        from app.redis_client import get_redis, FEED_CACHE_KEY
        r = await get_redis()
        if r:
            await r.delete(FEED_CACHE_KEY)
            await r.delete(f"feed:slot:{slot_number}")
            await r.delete("slots:matrix")
    except Exception as e:
        logger.warning(f"Could not invalidate redis feed cache: {e}")

    return SlotStatus(
        slot_number=updated["slot_number"],
        real_name=updated.get("real_name"),
        category_label=updated["category_label"],
        avatar_url=updated.get("avatar_url"),
        cover_url=updated.get("cover_url"),
        bio=updated.get("bio"),
        links=updated.get("links", []),
        followers_count=updated.get("followers_count", 0),
        public_key_hex=updated["public_key_hex"]
    )

class FollowRequest(BaseModel):
    delta: int = Field(1, ge=-1, le=1)

@app.post(
    "/api/v1/slots/{slot_number}/follow",
    summary="Toggle follow for a Sovereign Voice"
)
async def follow_slot_endpoint(slot_number: int, payload: FollowRequest):
    if slot_number < 1:
        raise HTTPException(status_code=400, detail="Invalid slot number (must be >= 1)")
    from app.db import toggle_follow_slot
    new_count = await toggle_follow_slot(slot_number, delta=payload.delta)
    try:
        from app.redis_client import get_redis
        r = await get_redis()
        if r:
            await r.delete("slots:matrix")
    except Exception:
        pass
    return {"slot_number": slot_number, "followers_count": new_count}

@app.get("/api/v1/health", summary="Health check for DB and Redis connections")
async def health_check():
    db_ok = await check_db_health()
    redis_ok = await check_redis_health()
    status_code = status.HTTP_200_OK if (db_ok and redis_ok) else status.HTTP_503_SERVICE_UNAVAILABLE
    return Response(
        content=json.dumps({
            "status": "healthy" if (db_ok and redis_ok) else "degraded",
            "database": "connected" if db_ok else "disconnected",
            "redis": "connected" if redis_ok else "disconnected",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }),
        status_code=status_code,
        media_type="application/json"
    )

# ==============================================================================
# ADMIN COMMAND CENTER ENDPOINTS
# ==============================================================================

async def _invalidate_admin_caches(slot_number: Optional[int] = None):
    try:
        from app.redis_client import get_redis, FEED_CACHE_KEY
        r = await get_redis()
        if r:
            await r.delete(FEED_CACHE_KEY)
            await r.delete("slots:matrix")
            if slot_number is not None:
                await r.delete(f"feed:slot:{slot_number}")
    except Exception as e:
        logger.warning(f"Could not invalidate redis cache: {e}")

@app.get("/api/v1/admin/stats", summary="Command Center system & network telemetry")
async def get_command_center_stats():
    stats = await get_admin_stats()
    db_ok = await check_db_health()
    redis_ok = await check_redis_health()
    last_10_time = await get_slot_10_last_broadcast_time()
    
    titan_locked = False
    titan_remaining = 0
    next_eligible_at = None
    if last_10_time:
        cooldown_delta = timedelta(hours=settings.SLOT_10_COOLDOWN_HOURS)
        next_eligible = last_10_time + cooldown_delta
        next_eligible_at = next_eligible.isoformat()
        now_utc = datetime.now(timezone.utc)
        if now_utc < next_eligible:
            titan_locked = True
            titan_remaining = int((next_eligible - now_utc).total_seconds())

    return {
        **stats,
        "database_connected": db_ok,
        "redis_connected": redis_ok,
        "titan_cooldown": {
            "is_locked": titan_locked,
            "seconds_remaining": titan_remaining,
            "next_eligible_at": next_eligible_at,
            "last_broadcast_at": last_10_time.isoformat() if last_10_time else None
        }
    }

@app.post("/api/v1/admin/slots", summary="Create or assign a new Sovereign Voice user")
async def admin_create_slot_endpoint(payload: AdminSlotCreateRequest):
    try:
        res = await admin_create_or_assign_slot(
            slot_number=payload.slot_number,
            real_name=payload.real_name,
            category_label=payload.category_label,
            avatar_url=payload.avatar_url,
            cover_url=payload.cover_url,
            bio=payload.bio,
            links=payload.links,
            followers_count=payload.followers_count or 0,
            custom_private_key=payload.custom_private_key
        )
        await _invalidate_admin_caches(res["slot_number"])
        return res
    except Exception as e:
        logger.error(f"Error creating voice slot: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/v1/admin/slots/{slot_number}", summary="Update Sovereign Voice details")
async def admin_update_slot_endpoint(slot_number: int, payload: AdminSlotUpdateRequest):
    try:
        updated = await admin_update_slot(
            slot_number=slot_number,
            real_name=payload.real_name,
            category_label=payload.category_label,
            avatar_url=payload.avatar_url,
            cover_url=payload.cover_url,
            bio=payload.bio,
            links=payload.links,
            followers_count=payload.followers_count
        )
        await _invalidate_admin_caches(slot_number)
        return updated
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        logger.error(f"Error updating slot #{slot_number}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/admin/slots/{slot_number}/rotate-key", summary="Rotate keypair for a slot")
async def admin_rotate_key_endpoint(slot_number: int):
    try:
        res = await admin_rotate_slot_key(slot_number)
        await _invalidate_admin_caches(slot_number)
        return res
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        logger.error(f"Error rotating key for slot #{slot_number}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/v1/admin/slots/{slot_number}", summary="Remove or vacate a Sovereign Voice")
async def admin_delete_slot_endpoint(
    slot_number: int,
    mode: str = Query("vacate", pattern="^(vacate|delete)$", description="Mode: 'vacate' to clear user and revoke key, 'delete' to remove slot entirely")
):
    try:
        res = await admin_delete_slot(slot_number, mode=mode)
        await _invalidate_admin_caches(slot_number)
        return res
    except Exception as e:
        logger.error(f"Error removing voice for slot #{slot_number}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/admin/broadcasts", summary="List broadcasts across all voices")
async def admin_get_broadcasts_endpoint(
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0)
):
    try:
        broadcasts = await admin_get_all_broadcasts(limit=limit, offset=offset)
        return broadcasts
    except Exception as e:
        logger.error(f"Error fetching admin broadcasts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/v1/admin/broadcasts/{broadcast_id}", summary="Delete an individual broadcast")
async def admin_delete_broadcast_endpoint(broadcast_id: int):
    try:
        slot_number = await admin_delete_broadcast(broadcast_id)
        if slot_number is None:
            raise HTTPException(status_code=404, detail="Broadcast not found")
        await _invalidate_admin_caches(slot_number)
        return {"deleted": True, "id": broadcast_id, "slot_number": slot_number}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting broadcast #{broadcast_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/admin/slots/10/reset-cooldown", summary="Emergency unlock/reset for Titan Slot 10 7-day cooldown")
async def admin_reset_cooldown_endpoint():
    try:
        await admin_reset_slot_10_cooldown()
        await _invalidate_admin_caches(10)
        return {"status": "cooldown_reset", "slot_number": 10, "message": "Titan 7-day cooldown successfully unlocked."}
    except Exception as e:
        logger.error(f"Error resetting Titan cooldown: {e}")
        raise HTTPException(status_code=500, detail=str(e))
