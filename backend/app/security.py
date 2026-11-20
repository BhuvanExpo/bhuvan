import base64
import secrets
from datetime import datetime, timezone
from typing import Tuple, Optional
import nacl.signing
import nacl.exceptions
from fastapi import Header, HTTPException, status
from app.config import settings

def parse_iso_or_epoch(timestamp_str: str) -> datetime:
    """
    Parses timestamp from either ISO 8601 string or Unix epoch string.
    Always returns UTC datetime.
    """
    try:
        # Check if numeric epoch timestamp
        epoch_val = float(timestamp_str)
        return datetime.fromtimestamp(epoch_val, tz=timezone.utc)
    except ValueError:
        pass

    # Parse ISO format
    try:
        cleaned = timestamp_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt
    except Exception as e:
        raise ValueError(f"Invalid timestamp format: '{timestamp_str}'. Expected ISO-8601 or epoch timestamp.") from e

def validate_replay_window(timestamp_str: str, tolerance_seconds: int = 300) -> Tuple[bool, str, datetime]:
    """
    Replay Attack Guard:
    Verifies that the provided timestamp is within tolerance_seconds of the server's current UTC time.
    Returns (is_valid, reason, parsed_dt).
    """
    try:
        parsed_dt = parse_iso_or_epoch(timestamp_str)
    except ValueError as e:
        return False, str(e), datetime.now(timezone.utc)

    now_utc = datetime.now(timezone.utc)
    drift = (now_utc - parsed_dt).total_seconds()

    if abs(drift) > tolerance_seconds:
        direction = "in the past" if drift > 0 else "in the future"
        return (
            False,
            f"Timestamp is {abs(drift):.1f}s {direction}. Maximum allowed drift is {tolerance_seconds}s.",
            parsed_dt
        )

    return True, "", parsed_dt

def construct_canonical_message(slot_number: int, body: str, timestamp_str: str) -> bytes:
    """
    Reconstructs the strictly canonical payload used for Ed25519 signing:
    f"{slot_number}:{body}:{timestamp}"
    """
    canonical_str = f"{slot_number}:{body}:{timestamp_str}"
    return canonical_str.encode("utf-8")

def construct_canonical_profile_message(
    slot_number: int,
    real_name: str,
    category_label: str,
    avatar_url: str,
    cover_url: str,
    bio: str,
    timestamp_str: str
) -> bytes:
    """
    Reconstructs the strictly canonical payload used for Ed25519 profile update signing:
    f"profile:{slot_number}:{real_name}:{category_label}:{avatar_url}:{cover_url}:{bio}:{timestamp}"
    """
    canonical_str = f"profile:{slot_number}:{real_name}:{category_label}:{avatar_url}:{cover_url}:{bio}:{timestamp_str}"
    return canonical_str.encode("utf-8")

def verify_signature(public_key_hex: str, canonical_bytes: bytes, signature_b64: str) -> bool:
    """
    Verifies Ed25519 asymmetric signature via PyNaCl.
    public_key_hex: 64-character hex string representing the 32-byte Ed25519 public key.
    canonical_bytes: raw UTF-8 bytes of canonical message.
    signature_b64: base64-encoded 64-byte Ed25519 signature.
    """
    try:
        pub_bytes = bytes.fromhex(public_key_hex)
        verify_key = nacl.signing.VerifyKey(pub_bytes)
        sig_bytes = base64.b64decode(signature_b64)
        
        # verify_key.verify raises BadSignatureError if signature is invalid
        verify_key.verify(canonical_bytes, sig_bytes)
        return True
    except (nacl.exceptions.BadSignatureError, nacl.exceptions.CryptoError, ValueError, Exception):
        return False

def verify_admin_auth(
    authorization: Optional[str] = Header(None),
    x_admin_key: Optional[str] = Header(None)
) -> bool:
    """
    Validates that incoming admin command center requests provide the correct ADMIN_SECRET_KEY.
    Accepts either:
      - Header 'Authorization: Bearer <ADMIN_SECRET_KEY>'
      - Header 'X-Admin-Key: <ADMIN_SECRET_KEY>'
    Uses constant-time comparison to prevent timing side-channel attacks.
    """
    expected = settings.ADMIN_SECRET_KEY
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ADMIN_SECRET_KEY is not configured on the server."
        )

    provided = None
    if isinstance(x_admin_key, str) and x_admin_key.strip():
        provided = x_admin_key.strip()
    elif isinstance(authorization, str) and authorization.strip():
        parts = authorization.strip().split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            provided = parts[1]
        elif len(parts) == 1:
            provided = parts[0]

    if not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Command Center Access Denied. Valid Admin Secret Key required.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return True
