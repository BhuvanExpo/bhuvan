import io
import time
import base64
from datetime import datetime, timezone, timedelta
import pytest
import nacl.signing
from PIL import Image
from fastapi import HTTPException

from app.security import (
    parse_iso_or_epoch,
    validate_replay_window,
    construct_canonical_message,
    construct_canonical_profile_message,
    verify_signature,
    verify_admin_auth,
)
from app.storage import sanitize_and_verify_image
from app.config import settings

def test_ed25519_signature_verification_success():
    """Verify authentic Ed25519 signature passes verification."""
    signing_key = nacl.signing.SigningKey.generate()
    pub_hex = signing_key.verify_key.encode().hex()

    slot_number = 1
    body = "Test broadcast transmission on the sovereign ledger."
    timestamp = datetime.now(timezone.utc).isoformat()

    canonical = construct_canonical_message(slot_number, body, timestamp)
    signed = signing_key.sign(canonical)
    sig_b64 = base64.b64encode(signed.signature).decode("utf-8")

    assert verify_signature(pub_hex, canonical, sig_b64) is True

def test_ed25519_signature_tampered_payload_fails():
    """Verify tampering with message body fails cryptographic verification."""
    signing_key = nacl.signing.SigningKey.generate()
    pub_hex = signing_key.verify_key.encode().hex()

    canonical_orig = construct_canonical_message(1, "Original broadcast", "2026-11-20T12:00:00+00:00")
    signed = signing_key.sign(canonical_orig)
    sig_b64 = base64.b64encode(signed.signature).decode("utf-8")

    canonical_tampered = construct_canonical_message(1, "Tampered broadcast", "2026-11-20T12:00:00+00:00")
    assert verify_signature(pub_hex, canonical_tampered, sig_b64) is False

def test_ed25519_wrong_key_fails():
    """Verify signature fails when checked against another slot's public key."""
    key1 = nacl.signing.SigningKey.generate()
    key2 = nacl.signing.SigningKey.generate()

    canonical = construct_canonical_message(2, "Test message", "2026-11-20T12:00:00+00:00")
    signed = key1.sign(canonical)
    sig_b64 = base64.b64encode(signed.signature).decode("utf-8")

    pub_hex2 = key2.verify_key.encode().hex()
    assert verify_signature(pub_hex2, canonical, sig_b64) is False

def test_replay_window_current_timestamp():
    """Timestamps within 5 minutes of server time must pass."""
    now_iso = datetime.now(timezone.utc).isoformat()
    is_valid, reason, _ = validate_replay_window(now_iso, tolerance_seconds=300)
    assert is_valid is True
    assert reason == ""

def test_replay_window_stale_timestamp_fails():
    """Timestamps older than 5 minutes must be rejected as replay attacks."""
    stale = (datetime.now(timezone.utc) - timedelta(minutes=6)).isoformat()
    is_valid, reason, _ = validate_replay_window(stale, tolerance_seconds=300)
    assert is_valid is False
    assert "in the past" in reason

def test_replay_window_future_timestamp_fails():
    """Timestamps drifted >5 minutes into the future must be rejected."""
    future = (datetime.now(timezone.utc) + timedelta(minutes=6)).isoformat()
    is_valid, reason, _ = validate_replay_window(future, tolerance_seconds=300)
    assert is_valid is False
    assert "in the future" in reason

def test_admin_auth_success():
    """Admin endpoints must authenticate with correct key in Bearer or X-Admin-Key header."""
    valid_key = settings.ADMIN_SECRET_KEY
    assert verify_admin_auth(authorization=f"Bearer {valid_key}") is True
    assert verify_admin_auth(x_admin_key=valid_key) is True

def test_admin_auth_missing_or_invalid_fails():
    """Admin endpoints must reject missing or incorrect keys with HTTP 401."""
    with pytest.raises(HTTPException) as exc1:
        verify_admin_auth(authorization="Bearer wrong-key")
    assert exc1.value.status_code == 401

    with pytest.raises(HTTPException) as exc2:
        verify_admin_auth(authorization=None, x_admin_key=None)
    assert exc2.value.status_code == 401

def test_image_sanitization_valid():
    """Valid image bytes are accepted and re-encoded cleanly."""
    img = Image.new("RGB", (100, 100), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    raw_bytes = buf.getvalue()

    cleaned, ext = sanitize_and_verify_image(raw_bytes)
    assert len(cleaned) > 0
    assert ext == ".jpg"

def test_image_sanitization_malicious_non_image_fails():
    """Non-image / executable bytes disguised as images must be rejected."""
    bad_bytes = b"<script>alert('xss')</script>"
    with pytest.raises(HTTPException) as exc:
        sanitize_and_verify_image(bad_bytes)
    assert exc.value.status_code == 400
