#!/usr/bin/env python3
"""
Seed 20 cryptographically signed sample broadcasts across Slots 1-9.
Mix of text-only and text-with-media posts.
"""

import time
import json
import base64
import urllib.request
from datetime import datetime, timezone
import nacl.signing

# Load slot private keys
with open("scripts/genesis_keys_offline.json", "r") as f:
    key_data = json.load(f)

SLOT_KEYS = {s["slot_number"]: s["private_key_hex"] for s in key_data["slots"]}

SAMPLE_POSTS = [
    {
        "slot_number": 1,
        "body": "Global sovereign yield curves continue their inversion across 14 major central jurisdictions. Capital flows are realigning toward hard settlement assets as foreign exchange reserves report their steepest quarterly redistribution in three decades.",
        "media_url": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 3,
        "body": "Major threshold reached in topological quantum error correction. Coherence times have scaled beyond 2,400 microseconds under passive braided gate topologies without observable phase drift.",
        "media_url": None
    },
    {
        "slot_number": 8,
        "body": "First deep telemetry returned from the outer solar reconnaissance array. High-resolution optical interferometry confirms subsurface hydrothermal vent signatures on Enceladus.",
        "media_url": "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 4,
        "body": "Coordinated zero-day exploitation targeting core BGP transit points mitigated in 14ms across sovereign autonomous systems. All critical cryptographic rotators shifted to post-quantum Dilithium signatures.",
        "media_url": None
    },
    {
        "slot_number": 5,
        "body": "Maritime tracking confirms the redirection of 42 ultralarge container vessels bypassing the Malacca Strait. Real-time freight throughput metrics indicate a 19% tightening across Pacific maritime corridors.",
        "media_url": "https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 7,
        "body": "Phase III multi-center longevity trial yields statistically significant reversal in biological epigenetic methylation age (-3.8 years over 180 days) utilizing targeted senolytic peptide conjugations.",
        "media_url": None
    },
    {
        "slot_number": 6,
        "body": "Commercial high-temperature superconducting tokamak achieves plasma equilibrium exceeding 120 million Kelvin for 22 consecutive minutes. Net thermal positive gain verified at Q = 1.48.",
        "media_url": "https://images.unsplash.com/photo-1466611653911-95081537e5b7?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 9,
        "body": "Inter-exchange microwave arbitrage latency compressed from 3.1 microseconds to 840 nanoseconds following the activation of the direct trans-alpine wireless relay network.",
        "media_url": None
    },
    {
        "slot_number": 2,
        "body": "Emergency bilateral summit in Geneva concludes with an enforceable framework governing autonomous subsea fiber infrastructure protection and orbital exclusion zones.",
        "media_url": "https://images.unsplash.com/photo-1516849841032-87cbac4d88f7?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 1,
        "body": "Cross-border bilateral clearing mechanisms denominated in local currencies now account for 38% of global energy settlements, bypassing traditional SWIFT clearing correspondent networks.",
        "media_url": None
    },
    {
        "slot_number": 3,
        "body": "128,000-core neuromorphic analog processor enters wafer-scale pilot fabrication. Power envelope reduction verified at 94.2% compared to contemporary dense systolic matrix architectures.",
        "media_url": "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 4,
        "body": "Air-gapped verification nodes report complete containment of polymorphic firmware injections across regional power telemetry sensors. Cryptographic integrity restored across 100% of grid nodes.",
        "media_url": "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 6,
        "body": "Solid-state sulfur-selenium battery chemistry achieves 680 Wh/kg volumetric energy density across 2,000 continuous fast-charge cycles with zero dendrite formation.",
        "media_url": None
    },
    {
        "slot_number": 7,
        "body": "In-vivo synthetic mRNA transcription vectors successfully restore endogenous telomerase synthesis in cardiovascular endothelial tissue cultures.",
        "media_url": "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 8,
        "body": "Lunar South Pole permanent water-ice extraction facility initiates automated regolith electrolysis processing. First production batch of liquid cryogenic propellant confirmed.",
        "media_url": None
    },
    {
        "slot_number": 9,
        "body": "Sub-millisecond optical switching fabric deployed across Singapore and Tokyo datacenters, handling 800 Terabits per second of non-blocking synthetic asset quote flow.",
        "media_url": "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80"
    },
    {
        "slot_number": 2,
        "body": "Joint memorandum signed by 18 sovereign nations allocating dedicated satellite spectrum for civil emergency mesh infrastructure during geomagnetic solar events.",
        "media_url": None
    },
    {
        "slot_number": 5,
        "body": "Strategic rare-earth permanent magnet stockpiles reach critical 180-day operational buffers. Heavy rare earth refining capacity outside restricted zones has doubled year-over-year.",
        "media_url": None
    },
    {
        "slot_number": 1,
        "body": "Physical gold delivery volumes through primary eastern exchanges hit historic daily volume highs as fractional bullion contracts face mandatory physical settlement clauses.",
        "media_url": None
    },
    {
        "slot_number": 3,
        "body": "Autonomous theorem-prover verifies 14 previously open conjectures in non-abelian gauge theory, generating mathematical proofs validated by independent zero-knowledge verifiers.",
        "media_url": None
    }
]

def sign(slot_number: int, body: str, timestamp_str: str, priv_key_hex: str) -> str:
    canonical = f"{slot_number}:{body}:{timestamp_str}".encode("utf-8")
    signing_key = nacl.signing.SigningKey(bytes.fromhex(priv_key_hex))
    signed = signing_key.sign(canonical)
    return base64.b64encode(signed.signature).decode("utf-8")

def post_broadcast(payload: dict):
    req = urllib.request.Request(
        "http://localhost:8000/api/v1/broadcast",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

def main():
    print(f"Publishing {len(SAMPLE_POSTS)} cryptographically verified sample broadcasts...")
    for idx, post in enumerate(SAMPLE_POSTS, 1):
        slot = post["slot_number"]
        priv_key = SLOT_KEYS[slot]
        now_utc = datetime.now(timezone.utc).isoformat()
        
        signature = sign(slot, post["body"], now_utc, priv_key)
        
        payload = {
            "slot_number": slot,
            "body": post["body"],
            "media_url": post["media_url"],
            "timestamp": now_utc,
            "signature": signature
        }
        
        try:
            status_code, resp = post_broadcast(payload)
            has_media = "[PHOTO]" if post["media_url"] else "[TEXT]"
            print(f"[{idx:02d}/20] Status {status_code} | Slot #{slot:02d} {has_media} | ID {resp.get('id')}")
        except Exception as e:
            print(f"[{idx:02d}/20] Failed: {e}")
        
        time.sleep(0.1)

    print("\nAll 20 sample broadcasts published successfully!")

if __name__ == "__main__":
    main()
