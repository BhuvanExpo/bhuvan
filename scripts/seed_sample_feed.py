import asyncio
import base64
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add backend directory to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "backend"))

import asyncpg
import nacl.signing
import redis.asyncio as aioredis
from dotenv import load_dotenv

load_dotenv(BASE_DIR / "backend" / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL")

SAMPLE_POSTS = [
    {
        "slot_number": 1,
        "offset_minutes": 10,
        "body": "We crossed 10 billion connected sentient devices today, yet the loneliest metric on earth remains unchanged. I spent this morning walking through the old quarter of Varanasi—where centuries of human devotion meet modern optical lines. The algorithms can optimize every supply chain and trade route, but they will never comprehend the warmth of shared bread or the silence between two people who understand each other without words. Humanity is not an optimization problem to be solved.",
        "media_url": "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 7,
        "offset_minutes": 35,
        "body": "The Stellarator containment magnetic field sustained steady-state plasma ignition at 120 million Kelvin for 48 consecutive hours. Net energy gain Q achieved 2.4. We are standing on the precipice of unlimited, clean, decentralized fusion power. The fire that powers the stars is now domesticated for humanity.",
        "media_url": "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 2,
        "offset_minutes": 65,
        "body": "Phase IV of the Trans-Oceanic Subsea Optical Mesh is now synchronized. We have routed 42 petabits per second across the Indian Ocean basin with zero packet collision and 1.8ms nominal latency. Infrastructure is invisible when it works, but every civilization is only as resilient as the copper, glass, and code underneath its feet. Planetary compute grid stability holding at 99.999%.",
        "media_url": "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 3,
        "offset_minutes": 110,
        "body": "Deep telemetry from the Southern Ocean bio-buoys: Phytoplankton density has rebounded by 14.2% across the sub-Antarctic convergence zone following the marine sanctuary expansion. The biosphere is fighting back, but sea surface thermal anomalies in the Western Pacific still demand emergency cooling deployments. Nature does not negotiate; we must adapt to her cadence.",
        "media_url": "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 4,
        "offset_minutes": 160,
        "body": "Sovereign liquidity rebalancing update: Real-time settlement rails cleared $4.8 trillion in bilateral commodity trades today without reliance on legacy correspondent banking networks. Capital flows are shifting rapidly toward real-economy physical assets—clean energy grids, rare mineral reserves, and automated agricultural hubs. Sound money is the bedrock of sovereign peace.",
        "media_url": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 6,
        "offset_minutes": 220,
        "body": "Global grain reserve parity reached for Q4. Autonomous vertical agricultural hubs across 18 arid climate zones produced 320,000 metric tons of drought-resistant protein crops this month, reducing freshwater irrigation footprint by 91%. No child should sleep hungry under a sky filled with satellites. Sustenance is a universal birthright.",
        "media_url": "https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 5,
        "offset_minutes": 290,
        "body": "Milestone achieved: Clinical trials for the pan-coronavirus mucosal prophylaxis have concluded Phase 2 with 99.4% efficacy across 45,000 participants in 12 sovereign nations. Disease does not recognize borders or passports. When we heal the most vulnerable corner of the world, we fortify the entire species against existential contagion.",
        "media_url": "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 8,
        "offset_minutes": 380,
        "body": "The Universal Heritage Archive has permanently preserved 80 million historical manuscripts and endangered oral languages on synthetic quartz glass, guaranteed readable for the next 10,000 years. Knowledge must not perish with civilizations. What we preserve today will be the foundation upon which future millennia build.",
        "media_url": "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 9,
        "offset_minutes": 480,
        "body": "The Supreme Jurisprudence Council has ratified the Universal Algorithmic Accountability Accord. No automated intelligence may execute lethal force, arbitrary asset seizure, or civil disenfranchisement without verifiable human due process and cryptographically public audit trails. Power without accountability is tyranny; truth is our only compass.",
        "media_url": "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 10,
        "offset_minutes": 600,
        "body": "PERIMETER REPORT: The orbital kinetic shield array has neutralized a 12-meter near-Earth asteroid fragment in high apogee with zero debris scatter into commercial launch corridors. The 7-day sovereign lock remains active. Vigilance never rests; our silence is humanity's shield.",
        "media_url": "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 1,
        "offset_minutes": 720,
        "body": "Technology is the lever, but human dignity must always remain the fulcrum. Never mistake efficiency for wisdom.",
        "media_url": None
    },
    {
        "slot_number": 3,
        "offset_minutes": 840,
        "body": "Sensors in the Sundarbans mangrove belt recorded the lowest saline stress in seven years following the regulated upstream freshwater discharge. Small victories for the delta ecosystem.",
        "media_url": None
    },
    {
        "slot_number": 7,
        "offset_minutes": 960,
        "body": "Grid frequency holding at exactly 50.000 Hz across all interconnected zones. Clean baseload power is no longer an aspiration; it is running right now.",
        "media_url": None
    }
]

async def seed_feed():
    print(f"Connecting to database...")
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=3)
    
    # Load genesis keys
    keys_path = BASE_DIR / "scripts" / "genesis_keys_offline.json"
    with open(keys_path, "r") as f:
        keys_data = json.load(f)
    
    slot_privkeys = {}
    for slot in keys_data["slots"]:
        slot_privkeys[slot["slot_number"]] = slot["private_key_hex"]

    now_utc = datetime.now(timezone.utc)

    async with pool.acquire() as conn:
        # Delete temporary test debug rows (IDs 23-29)
        deleted = await conn.execute("DELETE FROM broadcasts WHERE id >= 23 AND id <= 29")
        print(f"Cleaned debug test posts: {deleted}")

        for post in SAMPLE_POSTS:
            slot_num = post["slot_number"]
            privkey_hex = slot_privkeys[slot_num]
            sk = nacl.signing.SigningKey(bytes.fromhex(privkey_hex))

            post_time = now_utc - timedelta(minutes=post["offset_minutes"])
            timestamp_str = post_time.isoformat()

            canonical_msg = f"{slot_num}:{post['body']}:{timestamp_str}".encode("utf-8")
            signed = sk.sign(canonical_msg)
            sig_b64 = base64.b64encode(signed.signature).decode("ascii")

            insert_query = """
                INSERT INTO broadcasts (slot_number, body, media_url, signature_b64, created_at)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            """
            row = await conn.fetchrow(
                insert_query,
                slot_num,
                post["body"],
                post["media_url"],
                sig_b64,
                post_time
            )
            print(f"Inserted post ID {row['id']} for Slot #{slot_num} ({post_time.strftime('%H:%M UTC')})")

    await pool.close()

    # Invalidate Redis cache
    if REDIS_URL:
        try:
            print("Flushing Redis feed caches...")
            redis = aioredis.from_url(REDIS_URL, decode_responses=True)
            keys = await redis.keys("feed:*")
            if keys:
                await redis.delete(*keys)
                print(f"Deleted Redis keys: {keys}")
            await redis.close()
        except Exception as e:
            print(f"Redis cache flush warning: {e}")

    print("\nFeed seeding completed successfully!")

if __name__ == "__main__":
    asyncio.run(seed_feed())
