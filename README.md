# BHUVAN — 10-Voice Global Broadcast Architecture

An ultra-exclusive, read-only 10-Voice global broadcast application engineered to scale to 100,000+ concurrent spectators on a free-tier cloud stack.

---

## 1. Architectural Highlights

1. **The Genesis Lock (10 Hardcoded Slots):**
   - Strictly 10 immutable slots (`slot_number` 1 through 10).
   - Zero public sign-up, zero user registration, zero passwords.
2. **Read-Only Spectator Architecture:**
   - 100,000+ concurrent spectators access read-only streams.
   - Zero likes, zero comments, zero reposts, zero algorithmic feed manipulation.
3. **Pure Immutability:**
   - Broadcasts are permanent (`INSERT` and `SELECT` only).
   - No `PUT`, `PATCH`, or `DELETE` endpoints exist.
4. **Slot #10 Rate-Limit Enforcement (The Titan Rule):**
   - Strictly 168-hour (7-day) cooldown enforced in backend middleware on `slot_number == 10`.
   - Returns `429 Too Many Requests` with `Retry-After` if attempted before elapsed time.
5. **Zero-Trust Asymmetric Cryptography:**
   - Every broadcast is authenticated offline via Ed25519 digital signatures (`PyNaCl`).
   - Server holds only the 10 Public Keys. Private keys remain exclusively with slot holders.
6. **Zero Mock Content Policy:**
   - No placeholder or dummy posts.
   - UI structural containers transition seamlessly when signed broadcasts are published.
7. **Cache-First 100k Concurrent Delivery:**
   - Redis (`feed:latest`) memory caching shields PostgreSQL from spectator read traffic.
   - Server-Sent Events (`SSE`) via Redis Pub/Sub push updates in real time to connected spectators.

---

## 2. Monorepo Layout

```
.
├── backend/
│   ├── app/
│   │   ├── config.py           # Pydantic environment configuration
│   │   ├── db.py               # Async PostgreSQL connection pool (asyncpg)
│   │   ├── redis_client.py     # Upstash/Redis cache & Pub/Sub broker
│   │   ├── security.py         # Ed25519 signature & 5-minute replay window validation
│   │   └── main.py             # FastAPI API endpoints & SSE streaming
│   ├── schema.sql              # PostgreSQL schema with Genesis constraints & indexes
│   ├── requirements.txt        # Python backend dependencies
│   └── .env.example            # Environment variable template
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx      # Root layout
│   │   │   ├── page.tsx        # Pure monochrome 3-column feed & tabs
│   │   │   └── globals.css     # Monochrome Tailwind styling
│   │   ├── components/
│   │   │   ├── LeftSidebar.tsx # Brand mark + slots 01-10 navigation filter
│   │   │   ├── PostCard.tsx    # X-style post card with Ed25519 proof line
│   │   │   ├── RightSidebar.tsx# Live stream indicator & modules
│   │   │   ├── CooldownTimer.tsx# Live 00D:00H:00M:00S Slot #10 countdown
│   │   │   └── SlotMatrix.tsx  # 10-slot active/standby status matrix
│   │   └── types/
│   │       └── index.ts        # TypeScript interfaces
│   ├── package.json            # Next.js 14, Tailwind CSS, Lucide
│   ├── tailwind.config.ts      # Pure black/white design system (#000000, #FFFFFF)
│   ├── tsconfig.json
│   └── .env.example
└── scripts/
    ├── generate_keys.py        # Generates 10 Ed25519 keypairs + SQL seed script
    └── sign_and_post.py        # Offline interactive CLI for slot holders to broadcast
```

---

## 3. Cryptographic Verification Specification

The canonical signing payload is constructed as:
```
{slot_number}:{body}:{timestamp}
```
Where:
- `slot_number`: Integer between 1 and 10.
- `body`: UTF-8 broadcast text.
- `timestamp`: UTC ISO-8601 string within +/- 5 minutes of server UTC clock (anti-replay).
- `signature`: 64-byte Ed25519 signature, Base64-encoded.
