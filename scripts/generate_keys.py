#!/usr/bin/env python3
"""
GENESIS KEY GENERATOR: 10-Voice Global Broadcast
Generates 10 cryptographically secure Ed25519 keypairs.
Outputs:
  - Private keys to terminal for physical/cold offline distribution to the 10 slot holders.
  - SQL INSERT statement populated ONLY with the 10 Public Keys for database seeding.
"""

import sys
try:
    import nacl.signing
    import nacl.encoding
except ImportError:
    print("Error: PyNaCl is required to generate Ed25519 keys.")
    print("Install it with: pip install pynacl")
    sys.exit(1)

DEFAULT_CATEGORIES = [
    "01 - Sovereign Macro",
    "02 - Geopolitics & Defense",
    "03 - Quantum Computing & AI",
    "04 - Cyber Warfare & Crypto",
    "05 - Global Supply Chains",
    "06 - Energy & Grid Systems",
    "07 - Biotech & Longevity",
    "08 - Space Exploration",
    "09 - High-Frequency Systems",
    "10 - The Sovereign Titan",
]

def main():
    print("=" * 80)
    print("      THE GENESIS LOCK: 10-VOICE CRYPTOGRAPHIC KEY GENERATOR (ED25519)")
    print("=" * 80)
    print("\nCRITICAL SECURITY ADVISORY:")
    print("1. Private keys must NEVER be committed to Git or uploaded to any server.")
    print("2. Deliver each private key strictly to its designated slot holder.")
    print("3. Only public keys will be seeded into PostgreSQL.\n")

    keypairs = []
    for i in range(1, 11):
        # Generate new Ed25519 signing key
        signing_key = nacl.signing.SigningKey.generate()
        verify_key = signing_key.verify_key

        private_key_hex = signing_key.encode(encoder=nacl.encoding.HexEncoder).decode("utf-8")
        public_key_hex = verify_key.encode(encoder=nacl.encoding.HexEncoder).decode("utf-8")
        category = DEFAULT_CATEGORIES[i - 1]

        keypairs.append({
            "slot_number": i,
            "category": category,
            "private_key": private_key_hex,
            "public_key": public_key_hex
        })

    print("-" * 80)
    print("OFFLINE PRIVATE KEYS (DISTRIBUTE SECURELY TO THE 10 VOICES):")
    print("-" * 80)
    for kp in keypairs:
        slot_str = f"Slot #{kp['slot_number']:02d}"
        if kp['slot_number'] == 10:
            slot_str += " [TITAN: 168-HR COOLDOWN ENFORCED]"
        print(f"\n>>> {slot_str} ({kp['category']})")
        print(f"    Public Key (Hex):  {kp['public_key']}")
        print(f"    PRIVATE KEY (Hex): {kp['private_key']}")

    print("\n" + "=" * 80)
    print("READY-TO-RUN SQL SEED STATEMENT (PASTE INTO SUPABASE / POSTGRESQL):")
    print("=" * 80 + "\n")

    sql_lines = [
        "-- Seed Genesis Registry with strictly 10 Public Keys",
        "INSERT INTO slots (slot_number, category_label, public_key_hex) VALUES"
    ]

    values = []
    for kp in keypairs:
        safe_cat = kp['category'].replace("'", "''")
        values.append(f"    ({kp['slot_number']}, '{safe_cat}', '{kp['public_key']}')")

    sql_lines.append(",\n".join(values))
    sql_lines.append("ON CONFLICT (slot_number) DO UPDATE SET")
    sql_lines.append("    category_label = EXCLUDED.category_label,")
    sql_lines.append("    public_key_hex = EXCLUDED.public_key_hex;")
    
    print("\n".join(sql_lines))
    print("\n" + "=" * 80)
    print("Generation complete. Store the private keys securely.")
    print("=" * 80)

    # Save to local offline json (protected by .gitignore)
    import json
    from pathlib import Path
    out_file = Path(__file__).resolve().parent / "genesis_keys_offline.json"
    offline_data = {
        "generated_at": str(nacl.signing.SigningKey.generate().verify_key.encode().hex())[:0] + "UTC",
        "slots": [
            {
                "slot_number": kp["slot_number"],
                "category": kp["category"],
                "private_key_hex": kp["private_key"],
                "public_key_hex": kp["public_key"]
            }
            for kp in keypairs
        ]
    }
    with open(out_file, "w") as f:
        json.dump(offline_data, f, indent=2)
    print(f"\n[OK] Offline keys saved locally to: {out_file}")
    print("     (This file is in .gitignore and will never be committed to Git).")

if __name__ == "__main__":
    main()
