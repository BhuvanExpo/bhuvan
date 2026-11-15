-- ==============================================================================
-- 10-VOICE GLOBAL BROADCAST: DATABASE SCHEMA (POSTGRESQL / SUPABASE)
-- Immutability: INSERT & SELECT only. No UPDATE/DELETE grants to spectator roles.
-- Genesis Lock: Strictly 10 slots (1-10).
-- ==============================================================================

-- 1. Slots Registry (Genesis Lock: Exactly 10 hardcoded slots)
CREATE TABLE IF NOT EXISTS slots (
    slot_number INT PRIMARY KEY CHECK (slot_number >= 1 AND slot_number <= 10),
    category_label VARCHAR(100) NOT NULL,
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

-- Indexes for ultra-fast query performance
CREATE INDEX IF NOT EXISTS idx_broadcasts_created_at_desc ON broadcasts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcasts_slot_created ON broadcasts (slot_number, created_at DESC);

-- View for latest broadcasts with category labels
CREATE OR REPLACE VIEW view_broadcasts_detailed AS
SELECT 
    b.id,
    b.slot_number,
    s.category_label,
    b.body,
    b.media_url,
    b.signature_b64,
    b.created_at
FROM broadcasts b
JOIN slots s ON b.slot_number = s.slot_number
ORDER BY b.created_at DESC;
