-- ==============================================================================
-- 10-VOICE GLOBAL BROADCAST: PRODUCTION DATABASE SCHEMA (POSTGRESQL / SUPABASE)
-- Immutability: INSERT & SELECT only for spectator roles.
-- Genesis Lock: Strictly 10 slots (1-10).
-- ==============================================================================

-- 1. Slots Registry (Genesis Lock: Exactly 10 hardcoded slots)
CREATE TABLE IF NOT EXISTS slots (
    slot_number INT PRIMARY KEY CHECK (slot_number >= 1 AND slot_number <= 10),
    real_name VARCHAR(100) NULL,
    category_label VARCHAR(150) NOT NULL,
    avatar_url TEXT NULL,
    cover_url TEXT NULL,
    bio TEXT NULL,
    links JSONB NOT NULL DEFAULT '[]'::jsonb,
    followers_count INT NOT NULL DEFAULT 0,
    public_key_hex VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Broadcasts (Immutable append-only ledger)
CREATE TABLE IF NOT EXISTS broadcasts (
    id BIGSERIAL PRIMARY KEY,
    slot_number INT NOT NULL REFERENCES slots(slot_number),
    body TEXT NOT NULL,
    media_url TEXT NULL,
    signature_b64 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for high-throughput query performance
CREATE INDEX IF NOT EXISTS idx_broadcasts_created_at_desc ON broadcasts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcasts_slot_created ON broadcasts (slot_number, created_at DESC);

-- View for latest broadcasts with full author metadata
CREATE OR REPLACE VIEW view_broadcasts_detailed AS
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
ORDER BY b.created_at DESC;
