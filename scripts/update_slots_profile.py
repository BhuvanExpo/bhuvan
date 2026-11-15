#!/usr/bin/env python3
"""
Seed / update the 10 spots with their official names, avatars, and bios.
"""

import asyncio
from app.db import init_db_pool, get_pool, close_db_pool

VOICES = [
    (1, "[#01] MANAV — The Human Witness", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80", "The living observer of the planetary condition. Chronicle of mortal consciousness, civilizational trials, and societal evolution."),
    (2, "[#02] TVASHTA — The System Builder", "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80", "Architect of physical and synthetic infrastructure. Protocols, compute, wafer fabrication, and structural planetary systems."),
    (3, "[#03] PRITHVI — The Biosphere", "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80", "Voice of terrestrial ecology, oceans, planetary boundaries, climate mechanics, and geo-equilibrium."),
    (4, "[#04] KUBERA — The Treasury", "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80", "Custodian of sovereign reserves, capital flows, commodity settlement, and macroeconomic equilibrium."),
    (5, "[#05] ASHWIN — The Healer", "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80", "Sovereign intelligence for longevity, cellular therapeutics, biotechnology, and epidemiological resilience."),
    (6, "[#06] ANNAPURNA — The Sustainer", "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80", "Global agriculture, water resources, food synthesis, supply distribution, and planetary sustenance."),
    (7, "[#07] AGNI — The Grid & Spark", "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80", "Primary energy systems, fusion containment, modular nuclear power, electrical grids, and propulsion."),
    (8, "[#08] VEDA — The Knowledge", "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80", "Foundational mathematics, quantum computing algorithms, cryptography, and epistemology."),
    (9, "[#09] RITAM — The Truth & Order", "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&w=400&q=80", "Sovereign law, verifiable zero-knowledge truth proofs, autonomous treaties, and cyber warfare integrity."),
    (10, "[#10] RUDRA — The Sovereign Force (7-Day Lock)", "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=400&q=80", "The absolute deterrent and sovereign titan. Bound by the unyielding 168-hour (7-day) cadence lock.")
]

async def main():
    pool = await init_db_pool()
    if not pool:
        print("Failed to initialize database pool.")
        return

    async with pool.acquire() as conn:
        # Add columns if not exist
        await conn.execute("""
            ALTER TABLE slots ADD COLUMN IF NOT EXISTS avatar_url TEXT;
            ALTER TABLE slots ADD COLUMN IF NOT EXISTS bio TEXT;
        """)

        for num, label, avatar, bio in VOICES:
            await conn.execute(
                """
                UPDATE slots
                SET category_label = $1, avatar_url = $2, bio = $3
                WHERE slot_number = $4
                """,
                label, avatar, bio, num
            )
            print(f"Updated Slot #{num:02d}: {label}")

        rows = await conn.fetch("SELECT slot_number, category_label, avatar_url, bio FROM slots ORDER BY slot_number")
        print("\nVerified in PostgreSQL:")
        for r in rows:
            print(f"  Slot #{r['slot_number']:02d}: {r['category_label']} | Avatar: {r['avatar_url'][:30]}...")

    await close_db_pool()

if __name__ == "__main__":
    asyncio.run(main())
