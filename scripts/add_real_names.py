#!/usr/bin/env python3
"""
Add real_name column to slots table and seed the 10 real-world example names.
"""

import asyncio
from app.db import init_db_pool, close_db_pool

MEMBERS = [
    (1, "Aarav Sharma", "MANAV — The Human Witness"),
    (2, "Devraj Patel", "TVASHTA — The System Builder"),
    (3, "Dr. Tara Vasudev", "PRITHVI — The Biosphere"),
    (4, "Vikramaditya Singhania", "KUBERA — The Treasury"),
    (5, "Dr. Siddharth Menon", "ASHWIN — The Healer"),
    (6, "Ananya Iyer", "ANNAPURNA — The Sustainer"),
    (7, "Aditya Vardhan", "AGNI — The Grid & Spark"),
    (8, "Prof. Vidya Narayanan", "VEDA — The Knowledge"),
    (9, "Justice Raghavan Bose", "RITAM — The Truth & Order"),
    (10, "Commander Rudra Sen", "RUDRA — The Sovereign Force (7-Day Lock)")
]

async def main():
    pool = await init_db_pool()
    if not pool:
        print("Failed to initialize database pool.")
        return

    async with pool.acquire() as conn:
        # Add real_name column if not exist
        await conn.execute("""
            ALTER TABLE slots ADD COLUMN IF NOT EXISTS real_name TEXT;
        """)

        for num, real_name, spot_name in MEMBERS:
            await conn.execute(
                """
                UPDATE slots
                SET real_name = $1, category_label = $2
                WHERE slot_number = $3
                """,
                real_name, spot_name, num
            )
            print(f"Updated Slot #{num:02d}: Real Name = '{real_name}', Spot Name = '{spot_name}'")

        rows = await conn.fetch("SELECT slot_number, real_name, category_label FROM slots ORDER BY slot_number")
        print("\nVerified in PostgreSQL:")
        for r in rows:
            print(f"  Slot #{r['slot_number']:02d}: {r['real_name']} ({r['category_label']})")

    await close_db_pool()

if __name__ == "__main__":
    asyncio.run(main())
