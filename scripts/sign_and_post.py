#!/usr/bin/env python3
"""
SIGN AND POST CLI: 10-Voice Global Broadcast
Interactive and headless tool for slot holders to cryptographically sign
their broadcast message locally with Ed25519 and publish to the network.
"""

import sys
import base64
import argparse
import getpass
from datetime import datetime, timezone
import json

try:
    import nacl.signing
    import nacl.encoding
except ImportError:
    print("Error: PyNaCl is required. Run: pip install pynacl")
    sys.exit(1)

try:
    import urllib.request
    import urllib.error
except ImportError:
    pass

def sign_payload(slot_number: int, body: str, timestamp_str: str, private_key_hex: str) -> str:
    """Signs canonical payload: f"{slot_number}:{body}:{timestamp}" using Ed25519."""
    canonical_payload = f"{slot_number}:{body}:{timestamp_str}".encode("utf-8")
    key_bytes = bytes.fromhex(private_key_hex.strip())
    signing_key = nacl.signing.SigningKey(key_bytes)
    signed = signing_key.sign(canonical_payload)
    # The signature is 64 bytes
    signature_bytes = signed.signature
    return base64.b64encode(signature_bytes).decode("utf-8")

def post_broadcast(api_url: str, payload: dict):
    target = f"{api_url.rstrip('/')}/api/v1/broadcast"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        target,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "10Voice-CLI/1.0"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            parsed = json.loads(err_body)
        except Exception:
            parsed = {"error": err_body}
        return e.code, parsed
    except Exception as e:
        return 0, {"error": str(e)}

def main():
    parser = argparse.ArgumentParser(description="Sign and publish a verified broadcast.")
    parser.add_argument("--slot", type=int, choices=range(1, 11), help="Slot number (1-10)")
    parser.add_argument("--key", type=str, help="64-character private key in hex")
    parser.add_argument("--body", type=str, help="Broadcast message body")
    parser.add_argument("--media-url", type=str, default=None, help="Optional image or media URL")
    parser.add_argument("--api-url", type=str, default="http://localhost:8000", help="Broadcast API endpoint URL")
    args = parser.parse_args()

    print("=" * 70)
    print("           10-VOICE BROADCAST CLIENT (ED25519 SIGNING)")
    print("=" * 70)

    # 1. Slot Number
    slot_num = args.slot
    if not slot_num:
        while True:
            try:
                val = int(input("\nEnter Slot Number [1-10]: ").strip())
                if 1 <= val <= 10:
                    slot_num = val
                    break
                print("Slot must be between 1 and 10.")
            except ValueError:
                print("Please enter a valid integer.")

    if slot_num == 10:
        print("\n[!] WARNING: Slot #10 (The Titan Rule) enforces a strict 168-hour (7-day)")
        print("    cooldown. Submitting before the window ends will return 429 Too Many Requests.")

    # 2. Private Key
    priv_key = args.key
    if not priv_key:
        priv_key = getpass.getpass("\nEnter Private Key Hex (hidden from terminal): ").strip()

    if len(priv_key) != 64:
        print(f"Error: Invalid private key length ({len(priv_key)} chars). Expected 64 hex characters.")
        sys.exit(1)

    # 3. Message Body
    body = args.body
    if not body:
        print("\nEnter Broadcast Message (Press Enter when finished):")
        body = input("> ").strip()

    if not body:
        print("Error: Broadcast message cannot be empty.")
        sys.exit(1)

    media_url = args.media_url
    if media_url is None and not args.body:
        media_input = input("\nOptional Media URL (or press Enter to skip): ").strip()
        media_url = media_input if media_input else None

    # 4. Generate timestamp and sign
    now_utc = datetime.now(timezone.utc).isoformat()
    print(f"\n[*] Generating timestamp (UTC): {now_utc}")
    print("[*] Reconstructing canonical payload...")
    
    try:
        signature_b64 = sign_payload(slot_num, body, now_utc, priv_key)
        print(f"[*] Ed25519 Signature generated: {signature_b64[:20]}...{signature_b64[-10:]}")
    except Exception as e:
        print(f"Error signing payload: {e}")
        sys.exit(1)

    payload = {
        "slot_number": slot_num,
        "body": body,
        "media_url": media_url,
        "timestamp": now_utc,
        "signature": signature_b64
    }

    # 5. Broadcast to API
    api_url = args.api_url or "http://localhost:8000"
    print(f"\n[*] Transmitting payload to {api_url}/api/v1/broadcast ...")
    status_code, response_data = post_broadcast(api_url, payload)

    print("\n" + "=" * 70)
    if status_code == 201:
        print(f"SUCCESS (HTTP 201 CREATED)")
        print(f"Broadcast ID:    {response_data.get('id')}")
        print(f"Slot:            #{response_data.get('slot_number'):02d} ({response_data.get('category_label')})")
        print(f"Created At:      {response_data.get('created_at')}")
        print(f"Signature Proof: {response_data.get('signature_b64')}")
        print(f"Live Status:     Pushed to Redis and broadcast to all connected spectators.")
    elif status_code == 429:
        print("RATE LIMIT BLOCKED (HTTP 429 TOO MANY REQUESTS - THE TITAN RULE)")
        print(json.dumps(response_data, indent=2))
    elif status_code == 401:
        print("UNAUTHORIZED (HTTP 401 - CRYPTOGRAPHIC VERIFICATION FAILED)")
        print(json.dumps(response_data, indent=2))
    elif status_code == 400:
        print("BAD REQUEST (HTTP 400 - REPLAY ATTACK GUARD)")
        print(json.dumps(response_data, indent=2))
    else:
        print(f"ERROR (HTTP {status_code})")
        print(json.dumps(response_data, indent=2))
    print("=" * 70)

if __name__ == "__main__":
    main()
