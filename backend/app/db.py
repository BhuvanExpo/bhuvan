import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
import asyncpg
import nacl.signing
from app.config import settings

logger = logging.getLogger("broadcast.db")

_pool: Optional[asyncpg.Pool] = None

def get_clean_dsn(dsn: str) -> str:
    """Normalize postgres URL for asyncpg compatibility."""
    if dsn.startswith("postgres://"):
        return "postgresql://" + dsn[len("postgres://"):]
    return dsn

async def init_db_pool() -> Optional[asyncpg.Pool]:
    global _pool
    try:
        dsn = get_clean_dsn(settings.DATABASE_URL)
        # Check if SSL is required (Supabase standard)
        ssl_mode = "require" if "supabase" in dsn or "sslmode=require" in dsn else None
        
        # Strip query parameters if any for asyncpg compatibility
        base_dsn = dsn.split("?")[0]
        
        _pool = await asyncpg.create_pool(
            dsn=base_dsn,
            min_size=1,
            max_size=10,
            command_timeout=15,
            ssl=ssl_mode
        )
        logger.info("PostgreSQL connection pool initialized successfully.")
        return _pool
    except Exception as e:
        logger.warning(f"Could not connect to database on startup: {e}. (Will retry on requests)")
        _pool = None
        return None

async def close_db_pool():
    global _pool
    if _pool is not None:
        await _pool.close()
        logger.info("PostgreSQL connection pool closed.")
        _pool = None

async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await init_db_pool()
    if _pool is None:
        raise RuntimeError("Database connection pool is uninitialized or unavailable. Check DATABASE_URL.")
    return _pool

async def get_slot(slot_number: int) -> Optional[Dict[str, Any]]:
    pool = await get_pool()
    query = """
        SELECT slot_number, real_name, category_label, avatar_url, cover_url, bio, links, followers_count, public_key_hex, created_at
        FROM slots
        WHERE slot_number = $1
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, slot_number)
        if not row:
            return None
        d = dict(row)
        if isinstance(d.get("links"), str):
            try:
                import json
                d["links"] = json.loads(d["links"])
            except Exception:
                d["links"] = []
        elif d.get("links") is None:
            d["links"] = []
        return d

async def get_all_slots() -> List[Dict[str, Any]]:
    pool = await get_pool()
    query = """
        SELECT 
            s.slot_number, 
            s.real_name,
            s.category_label, 
            s.avatar_url,
            s.cover_url,
            s.bio,
            s.links,
            s.followers_count,
            s.public_key_hex,
            MAX(b.created_at) as last_broadcast_at,
            COUNT(b.id) as total_broadcasts
        FROM slots s
        LEFT JOIN broadcasts b ON s.slot_number = b.slot_number
        GROUP BY s.slot_number, s.real_name, s.category_label, s.avatar_url, s.cover_url, s.bio, s.links, s.followers_count, s.public_key_hex
        ORDER BY s.slot_number ASC
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(query)
        result = []
        for r in rows:
            d = dict(r)
            if d.get("last_broadcast_at"):
                d["last_broadcast_at"] = d["last_broadcast_at"].isoformat()
            if isinstance(d.get("links"), str):
                try:
                    import json
                    d["links"] = json.loads(d["links"])
                except Exception:
                    d["links"] = []
            elif d.get("links") is None:
                d["links"] = []
            result.append(d)
        return result

async def get_slot_10_last_broadcast_time() -> Optional[datetime]:
    pool = await get_pool()
    query = """
        SELECT created_at
        FROM broadcasts
        WHERE slot_number = 10
        ORDER BY created_at DESC
        LIMIT 1
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query)
        if row and row["created_at"]:
            dt = row["created_at"]
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        return None

async def insert_broadcast(
    slot_number: int,
    body: str,
    media_url: Optional[str],
    signature_b64: str,
    created_at: datetime
) -> Dict[str, Any]:
    pool = await get_pool()
    # Immutability: Pure INSERT operation
    query = """
        INSERT INTO broadcasts (slot_number, body, media_url, signature_b64, created_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, slot_number, body, media_url, signature_b64, created_at
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, slot_number, body, media_url, signature_b64, created_at)
        slot_query = "SELECT real_name, category_label, avatar_url FROM slots WHERE slot_number = $1"
        slot_row = await conn.fetchrow(slot_query, slot_number)
        
        result = dict(row)
        result["real_name"] = slot_row["real_name"] if slot_row else None
        result["category_label"] = slot_row["category_label"] if slot_row else f"Slot #{slot_number:02d}"
        result["avatar_url"] = slot_row["avatar_url"] if slot_row else None
        if isinstance(result["created_at"], datetime):
            result["created_at"] = result["created_at"].isoformat()
        return result

async def get_recent_broadcasts(
    slot_number: Optional[int] = None,
    limit: int = 50
) -> List[Dict[str, Any]]:
    pool = await get_pool()
    safe_limit = max(1, min(limit, 100))
    if slot_number is not None:
        query = """
            SELECT 
                b.id,
                b.slot_number,
                s.real_name,
                s.category_label,
                s.avatar_url,
                b.body,
                b.media_url,
                b.signature_b64,
                b.created_at
            FROM broadcasts b
            JOIN slots s ON b.slot_number = s.slot_number
            WHERE b.slot_number = $1
            ORDER BY b.created_at DESC
            LIMIT $2
        """
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, slot_number, safe_limit)
    else:
        query = """
            SELECT 
                b.id,
                b.slot_number,
                s.real_name,
                s.category_label,
                s.avatar_url,
                b.body,
                b.media_url,
                b.signature_b64,
                b.created_at
            FROM broadcasts b
            JOIN slots s ON b.slot_number = s.slot_number
            ORDER BY b.created_at DESC
            LIMIT $1
        """
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, safe_limit)

    results = []
    for r in rows:
        d = dict(r)
        if isinstance(d.get("created_at"), datetime):
            d["created_at"] = d["created_at"].isoformat()
        results.append(d)
    return results

async def update_slot_profile(
    slot_number: int,
    real_name: Optional[str] = None,
    category_label: Optional[str] = None,
    avatar_url: Optional[str] = None,
    cover_url: Optional[str] = None,
    bio: Optional[str] = None,
    links: Optional[Any] = None
) -> Dict[str, Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT real_name, category_label, avatar_url, cover_url, bio, links, followers_count FROM slots WHERE slot_number = $1",
            slot_number
        )
        if not existing:
            raise ValueError(f"Slot #{slot_number} not found.")

        new_real = real_name.strip() if real_name and real_name.strip() else existing["real_name"]
        new_label = category_label.strip() if category_label and category_label.strip() else existing["category_label"]
        new_avatar = avatar_url.strip() if avatar_url and avatar_url.strip() else existing["avatar_url"]
        new_cover = cover_url.strip() if cover_url and cover_url.strip() else existing.get("cover_url")
        new_bio = bio.strip() if bio and bio.strip() else existing["bio"]

        # Handle links (ensure max 3 links as requested)
        if links is not None:
            import json
            if isinstance(links, list):
                # Clamp to 3 links max
                cleaned_links = links[:3]
                new_links_json = json.dumps(cleaned_links)
            elif isinstance(links, str):
                try:
                    parsed = json.loads(links)
                    cleaned_links = parsed[:3] if isinstance(parsed, list) else []
                    new_links_json = json.dumps(cleaned_links)
                except Exception:
                    new_links_json = json.dumps([])
            else:
                new_links_json = json.dumps([])
        else:
            new_links_json = existing["links"] if existing["links"] else "[]"

        updated = await conn.fetchrow(
            """
            UPDATE slots
            SET real_name = $1, category_label = $2, avatar_url = $3, cover_url = $4, bio = $5, links = $6
            WHERE slot_number = $7
            RETURNING slot_number, real_name, category_label, avatar_url, cover_url, bio, links, followers_count, public_key_hex
            """,
            new_real, new_label, new_avatar, new_cover, new_bio, new_links_json, slot_number
        )
        d = dict(updated)
        if isinstance(d.get("links"), str):
            try:
                import json
                d["links"] = json.loads(d["links"])
            except Exception:
                d["links"] = []
        return d

async def toggle_follow_slot(slot_number: int, delta: int = 1) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE slots
            SET followers_count = GREATEST(0, COALESCE(followers_count, 0) + $1)
            WHERE slot_number = $2
            RETURNING followers_count
            """,
            delta,
            slot_number
        )
        return row["followers_count"] if row else 0

async def check_db_health() -> bool:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            val = await conn.fetchval("SELECT 1")
            return val == 1
    except Exception:
        return False

# ==============================================================================
# ADMIN COMMAND CENTER HELPERS
# ==============================================================================

def generate_keypair() -> Tuple[str, str]:
    """Generates an Ed25519 keypair, returning (private_key_seed_hex, public_key_hex)."""
    signing_key = nacl.signing.SigningKey.generate()
    seed_hex = bytes(signing_key).hex()
    pub_hex = signing_key.verify_key.encode().hex()
    return seed_hex, pub_hex

async def get_admin_stats() -> Dict[str, Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        stats = await conn.fetchrow("""
            SELECT 
                (SELECT COUNT(*) FROM broadcasts) as total_broadcasts,
                (SELECT COALESCE(SUM(followers_count), 0) FROM slots) as total_followers,
                (SELECT COUNT(*) FROM slots WHERE real_name IS NOT NULL AND real_name != '') as active_slots,
                (SELECT COUNT(*) FROM slots WHERE real_name IS NULL OR real_name = '') as vacant_slots,
                (SELECT COUNT(*) FROM broadcasts WHERE created_at >= NOW() - INTERVAL '24 hours') as broadcasts_last_24h,
                (SELECT COUNT(*) FROM slots) as total_slots
        """)
        return dict(stats) if stats else {}

async def admin_get_next_available_slot() -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        vacant = await conn.fetchval("""
            SELECT slot_number FROM slots 
            WHERE (real_name IS NULL OR real_name = '')
            ORDER BY slot_number ASC LIMIT 1
        """)
        if vacant:
            return vacant
        max_slot = await conn.fetchval("SELECT COALESCE(MAX(slot_number), 0) FROM slots")
        return max_slot + 1

async def admin_create_or_assign_slot(
    slot_number: Optional[int],
    real_name: str,
    category_label: str,
    avatar_url: Optional[str] = None,
    cover_url: Optional[str] = None,
    bio: Optional[str] = None,
    links: Optional[List[Any]] = None,
    followers_count: int = 0,
    custom_private_key: Optional[str] = None
) -> Dict[str, Any]:
    pool = await get_pool()
    import json
    
    if not slot_number or slot_number < 1:
        slot_number = await admin_get_next_available_slot()

    if custom_private_key and custom_private_key.strip():
        seed_bytes = bytes.fromhex(custom_private_key.strip())
        signing_key = nacl.signing.SigningKey(seed_bytes)
        priv_key_hex = custom_private_key.strip()
        pub_key_hex = signing_key.verify_key.encode().hex()
    else:
        priv_key_hex, pub_key_hex = generate_keypair()

    links_json = json.dumps(links[:3] if links else [])

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO slots (slot_number, real_name, category_label, avatar_url, cover_url, bio, links, followers_count, public_key_hex)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (slot_number) DO UPDATE
            SET real_name = EXCLUDED.real_name,
                category_label = EXCLUDED.category_label,
                avatar_url = EXCLUDED.avatar_url,
                cover_url = EXCLUDED.cover_url,
                bio = EXCLUDED.bio,
                links = EXCLUDED.links,
                followers_count = EXCLUDED.followers_count,
                public_key_hex = EXCLUDED.public_key_hex
            RETURNING slot_number, real_name, category_label, avatar_url, cover_url, bio, links, followers_count, public_key_hex
            """,
            slot_number, real_name, category_label, avatar_url, cover_url, bio, links_json, followers_count, pub_key_hex
        )
        res = dict(row)
        res["private_key_hex"] = priv_key_hex
        if isinstance(res.get("links"), str):
            try:
                res["links"] = json.loads(res["links"])
            except Exception:
                res["links"] = []
        return res

async def admin_update_slot(
    slot_number: int,
    real_name: Optional[str] = None,
    category_label: Optional[str] = None,
    avatar_url: Optional[str] = None,
    cover_url: Optional[str] = None,
    bio: Optional[str] = None,
    links: Optional[List[Any]] = None,
    followers_count: Optional[int] = None
) -> Dict[str, Any]:
    pool = await get_pool()
    import json
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM slots WHERE slot_number = $1", slot_number)
        if not existing:
            raise ValueError(f"Slot #{slot_number} not found.")

        new_real = real_name if real_name is not None else existing["real_name"]
        new_label = category_label if category_label is not None else existing["category_label"]
        new_avatar = avatar_url if avatar_url is not None else existing["avatar_url"]
        new_cover = cover_url if cover_url is not None else existing.get("cover_url")
        new_bio = bio if bio is not None else existing["bio"]
        new_followers = followers_count if followers_count is not None else existing.get("followers_count", 0)

        if links is not None:
            new_links = json.dumps(links[:3])
        else:
            new_links = existing.get("links", "[]")

        updated = await conn.fetchrow(
            """
            UPDATE slots
            SET real_name = $1, category_label = $2, avatar_url = $3, cover_url = $4, bio = $5, links = $6, followers_count = $7
            WHERE slot_number = $8
            RETURNING slot_number, real_name, category_label, avatar_url, cover_url, bio, links, followers_count, public_key_hex
            """,
            new_real, new_label, new_avatar, new_cover, new_bio, new_links, new_followers, slot_number
        )
        d = dict(updated)
        if isinstance(d.get("links"), str):
            try:
                d["links"] = json.loads(d["links"])
            except Exception:
                d["links"] = []
        return d

async def admin_rotate_slot_key(slot_number: int) -> Dict[str, Any]:
    pool = await get_pool()
    priv_key_hex, pub_key_hex = generate_keypair()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE slots
            SET public_key_hex = $1
            WHERE slot_number = $2
            RETURNING slot_number, real_name, category_label, public_key_hex
            """,
            pub_key_hex, slot_number
        )
        if not row:
            raise ValueError(f"Slot #{slot_number} not found.")
        d = dict(row)
        d["private_key_hex"] = priv_key_hex
        return d

async def admin_delete_slot(slot_number: int, mode: str = "vacate") -> Dict[str, Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if mode == "delete":
            deleted = await conn.fetchrow(
                "DELETE FROM slots WHERE slot_number = $1 RETURNING slot_number, real_name",
                slot_number
            )
            return {"action": "deleted", "slot_number": slot_number}
        else:
            _, pub_key_hex = generate_keypair()
            vacated = await conn.fetchrow(
                """
                UPDATE slots
                SET real_name = NULL,
                    category_label = $1,
                    avatar_url = NULL,
                    cover_url = NULL,
                    bio = NULL,
                    links = '[]',
                    followers_count = 0,
                    public_key_hex = $2
                WHERE slot_number = $3
                RETURNING slot_number, category_label
                """,
                f"Slot #{slot_number:02d} (Vacant)",
                pub_key_hex,
                slot_number
            )
            return {"action": "vacated", "slot_number": slot_number}

async def admin_get_all_broadcasts(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    pool = await get_pool()
    safe_limit = max(1, min(limit, 200))
    query = """
        SELECT 
            b.id,
            b.slot_number,
            s.real_name,
            s.category_label,
            s.avatar_url,
            s.public_key_hex,
            b.body,
            b.media_url,
            b.signature_b64,
            b.created_at
        FROM broadcasts b
        LEFT JOIN slots s ON b.slot_number = s.slot_number
        ORDER BY b.created_at DESC
        LIMIT $1 OFFSET $2
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, safe_limit, offset)
        results = []
        for r in rows:
            d = dict(r)
            if isinstance(d.get("created_at"), datetime):
                d["created_at"] = d["created_at"].isoformat()
            results.append(d)
        return results

async def admin_delete_broadcast(broadcast_id: int) -> Optional[int]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "DELETE FROM broadcasts WHERE id = $1 RETURNING slot_number",
            broadcast_id
        )
        return row["slot_number"] if row else None

async def admin_reset_slot_10_cooldown() -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE broadcasts 
            SET created_at = created_at - INTERVAL '8 days'
            WHERE id = (
                SELECT id FROM broadcasts 
                WHERE slot_number = 10 
                ORDER BY created_at DESC 
                LIMIT 1
            )
        """)
        return True
