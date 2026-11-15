"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import nacl from "tweetnacl";
import PostCard from "@/components/PostCard";
import PostSkeleton from "@/components/PostSkeleton";
import InstagramCreateModal from "@/components/InstagramCreateModal";
import VoicesStoriesCarousel from "@/components/VoicesStoriesCarousel";
import { Broadcast, SlotStatus, Slot10Cooldown, SlotsMatrixResponse } from "@/types";
import { parseVoiceIdentity } from "@/utils/voiceIdentity";
import { resolveMediaUrl } from "@/utils/imageUpload";
import {
  Lock,
  Key,
  Send,
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Eye,
  EyeOff,
  Clock,
  X,
  Plus,
  ChevronDown,
} from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface VoiceSession {
  slotNumber: number;
  privateKeyHex: string;
  categoryLabel: string;
  publicKeyHex: string;
}

export default function MemberPortalPage() {
  // Session State
  const [session, setSession] = useState<VoiceSession | null>(null);

  // Login Form State
  const [loginSlot, setLoginSlot] = useState<number>(1);
  const [loginKey, setLoginKey] = useState<string>("");
  const [showKey, setShowKey] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);

  // Post Composer State (Instagram Style Modal)
  const [isComposerOpen, setIsComposerOpen] = useState<boolean>(false);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);

  // Feed & Slots State
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(true);
  const [slotsList, setSlotsList] = useState<SlotStatus[]>([]);
  const [cooldown10, setCooldown10] = useState<Slot10Cooldown | null>(null);
  const [liveToast, setLiveToast] = useState<{ id: number; title: string; snippet: string } | null>(null);

  // Load existing session from sessionStorage on mount
  useEffect(() => {
    try {
      const isExplicitLogin =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("login") === "true";

      if (isExplicitLogin) {
        // User explicitly clicked the login key button: show clean login screen
        sessionStorage.removeItem("voice_member_session");
        setSession(null);
      } else {
        const saved = sessionStorage.getItem("voice_member_session");
        if (saved) {
          setSession(JSON.parse(saved));
        }
      }
    } catch (e) {
      console.warn("Could not read session:", e);
    }
  }, []);

  // Fetch slots metadata and cooldown info
  const fetchSlotsMetadata = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/slots`, { cache: "no-store" });
      if (res.ok) {
        const data: SlotsMatrixResponse = await res.json();
        setSlotsList(data.slots || []);
        setCooldown10(data.slot_10_cooldown || null);
      }
    } catch (err) {
      console.warn("Could not fetch slots metadata:", err);
    }
  }, []);

  // Fetch Feed
  const fetchFeed = useCallback(async () => {
    try {
      setIsLoadingFeed(true);
      const res = await fetch(`${API_BASE_URL}/api/v1/feed?limit=50`, { cache: "no-store" });
      if (res.ok) {
        const data: Broadcast[] = await res.json();
        setBroadcasts(data);
      }
    } catch (err) {
      console.warn("Could not fetch feed:", err);
    } finally {
      setIsLoadingFeed(false);
    }
  }, []);

  useEffect(() => {
    fetchSlotsMetadata();
    fetchFeed();
  }, [fetchSlotsMetadata, fetchFeed]);

  // Connect to SSE stream for live updates
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource(`${API_BASE_URL}/api/v1/stream`);
        eventSource.addEventListener("broadcast", (event: MessageEvent) => {
          try {
            const newBroadcast: Broadcast = JSON.parse(event.data);
            setBroadcasts((prev) => {
              if (prev.some((b) => b.id === newBroadcast.id)) return prev;
              return [newBroadcast, ...prev];
            });

            const parsed = parseVoiceIdentity(newBroadcast.category_label, newBroadcast.slot_number, newBroadcast.real_name);
            setLiveToast({
              id: newBroadcast.id,
              title: parsed.originalName + (parsed.spotName ? ` · ${parsed.spotName}` : ""),
              snippet: newBroadcast.body.length > 70 ? `${newBroadcast.body.slice(0, 70)}...` : newBroadcast.body,
            });

            setTimeout(() => {
              setLiveToast((curr) => (curr?.id === newBroadcast.id ? null : curr));
            }, 5000);

            if (newBroadcast.slot_number === 10) {
              fetchSlotsMetadata();
            }
          } catch (e) {
            console.error("SSE parse error:", e);
          }
        });

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          reconnectTimeout = setTimeout(connectSSE, 5000);
        };
      } catch (err) {
        // Handle reconnect
      }
    };

    connectSSE();
    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [fetchSlotsMetadata]);

  // Utility to convert hex string to Uint8Array
  const hexToUint8 = (hex: string): Uint8Array => {
    const cleaned = hex.trim();
    if (cleaned.length !== 64) {
      throw new Error(`Private key must be exactly 64 hex characters (32 bytes). Found ${cleaned.length}.`);
    }
    const matches = cleaned.match(/.{1,2}/g);
    if (!matches) throw new Error("Invalid hex characters in private key.");
    return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
  };

  // Login Authentication Handler (Zero-Trust Key Check)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsAuthenticating(true);

    try {
      const seedBytes = hexToUint8(loginKey);
      const keyPair = nacl.sign.keyPair.fromSeed(seedBytes);
      const derivedPubHex = Array.from(keyPair.publicKey)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const res = await fetch(`${API_BASE_URL}/api/v1/slots`);
      if (!res.ok) throw new Error("Failed to reach server to verify slot public key.");
      const data: SlotsMatrixResponse = await res.json();

      const targetSlot = data.slots.find((s) => s.slot_number === loginSlot);
      if (!targetSlot || !targetSlot.public_key_hex) {
        throw new Error("This Voice identity is uninitialized.");
      }

      if (derivedPubHex.toLowerCase() !== targetSlot.public_key_hex.toLowerCase()) {
        const parsed = parseVoiceIdentity(targetSlot.category_label, loginSlot, targetSlot.real_name);
        throw new Error(`Cryptographic Mismatch: The provided private key does not belong to ${parsed.originalName}.`);
      }

      const newSession: VoiceSession = {
        slotNumber: loginSlot,
        privateKeyHex: loginKey.trim(),
        categoryLabel: targetSlot.category_label,
        publicKeyHex: targetSlot.public_key_hex,
      };

      sessionStorage.setItem("voice_member_session", JSON.stringify(newSession));
      setSession(newSession);
      setLoginKey("");
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/portal");
      }
    } catch (err: any) {
      console.error(err);
      setLoginError(err.message || "Failed to authenticate.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Logout Handler
  const handleLogout = () => {
    sessionStorage.removeItem("voice_member_session");
    setSession(null);
    setPublishSuccess(null);
  };

  const currentSlotInfo = session ? slotsList.find((s) => s.slot_number === session.slotNumber) : null;
  const memberIdentity = session
    ? parseVoiceIdentity(currentSlotInfo?.category_label || session.categoryLabel, session.slotNumber, currentSlotInfo?.real_name)
    : { originalName: "", spotName: "" };

  const isSlot10Locked = session?.slotNumber === 10 && cooldown10?.is_locked;

  // ============================================================================
  // 1. UNLOGGED VIEW: DRIBBBLE-STYLE MODERN 2-COLUMN LOGIN SCREEN
  // ============================================================================
  if (!session) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4 sm:p-6 selection:bg-white selection:text-black">
        {/* Main Dribbble-Style Card Container */}
        <div className="w-full max-w-4xl bg-[#18191a] border border-white/10 rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col md:flex-row gap-6 md:gap-8 items-stretch">
          
          {/* Left Visual / Brand Card */}
          <div className="md:w-1/2 rounded-2xl p-7 sm:p-9 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-[#0c1929] via-[#09111c] to-[#05080e] border border-white/10 shadow-lg min-h-[340px] md:min-h-[480px]">
            {/* Subtle atmospheric glow behind */}
            <div className="absolute -top-24 -left-24 w-64 h-64 bg-[#0095f6]/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-[#1877f2]/15 rounded-full blur-3xl pointer-events-none" />

            {/* Top Headline Section */}
            <div className="space-y-4 relative z-10">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#0095f6]/10 border border-[#0095f6]/30 text-[11px] font-mono text-[#0095f6]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0095f6] animate-pulse" />
                <span>Sovereign Voice Network</span>
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
                Broadcast to the planet with immutable truth.
              </h2>
            </div>

            {/* Bottom Visual Element: Stacked Avatar Circles of the Voices */}
            <div className="pt-6 relative z-10">
              <div className="flex items-center -space-x-2">
                {slotsList.slice(0, 5).map((s) => (
                  <div
                    key={s.slot_number}
                    className="w-10 h-10 rounded-full border-2 border-black overflow-hidden bg-[#242526] shadow-md"
                  >
                    {s.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveMediaUrl(s.avatar_url)}
                        alt={s.real_name || "Voice"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-xs text-white">
                        {s.real_name?.charAt(0) || "V"}
                      </div>
                    )}
                  </div>
                ))}
                <div className="w-10 h-10 rounded-full border-2 border-black bg-[#242526] text-white flex items-center justify-center text-xs font-mono font-bold shadow-md">
                  +5
                </div>
              </div>
            </div>
          </div>

          {/* Right Form Card */}
          <div className="md:w-1/2 p-2 sm:p-4 flex flex-col justify-center font-sans">
            {/* Logo & Heading */}
            <div className="mb-6">
              <div className="flex items-center space-x-2.5 mb-3">
                <div className="w-8 h-8 rounded-full bg-white text-black font-bitroad text-sm flex items-center justify-center shadow-md select-none">
                  B
                </div>
                <span className="font-bitroad text-xl text-white tracking-widest uppercase">
                  BHUVAN
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Welcome Back
              </h1>
              <p className="text-xs text-[#b0b3b8] mt-1">
                Please login to your account.
              </p>
            </div>

            {/* Error Message */}
            {loginError && (
              <div className="mb-4 bg-red-500/10 border-l-4 border-red-500 p-3 rounded-xl flex items-start space-x-2.5 text-xs font-mono text-red-400">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{loginError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              {/* 1. Identity Selector */}
              <div className="relative">
                <select
                  value={loginSlot}
                  onChange={(e) => setLoginSlot(Number(e.target.value))}
                  className="w-full bg-[#242526] text-white rounded-xl px-4 py-3.5 text-xs sm:text-sm font-sans outline-none border border-white/10 focus:border-[#0095f6] transition-colors appearance-none pr-10 cursor-pointer"
                >
                  {(slotsList.length > 0 ? slotsList : Array.from({ length: 10 }, (_, i) => ({ slot_number: i + 1, category_label: "", real_name: "" } as SlotStatus))).map((slotObj) => {
                    const parsed = parseVoiceIdentity(slotObj.category_label || "", slotObj.slot_number, slotObj.real_name);
                    return (
                      <option key={slotObj.slot_number} value={slotObj.slot_number} className="bg-[#242526] text-white py-1">
                        {parsed.originalName} — {parsed.spotName}
                      </option>
                    );
                  })}
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#b0b3b8]">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>

              {/* 2. Private Key Input */}
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={loginKey}
                  onChange={(e) => setLoginKey(e.target.value)}
                  placeholder="Private Key"
                  className="w-full bg-[#242526] text-white rounded-xl px-4 py-3.5 text-xs sm:text-sm font-mono outline-none border border-white/10 focus:border-[#0095f6] transition-colors pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#b0b3b8] hover:text-white p-1 transition-colors cursor-pointer"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* 3. Submit Button */}
              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full py-3.5 px-4 rounded-xl bg-[#0095f6] hover:bg-[#1877f2] active:scale-[0.99] text-white font-semibold text-sm transition-all flex items-center justify-center space-x-2 shadow-lg disabled:opacity-50 mt-2 cursor-pointer"
              >
                {isAuthenticating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Login</span>
                )}
              </button>
            </form>

            {/* Back Link */}
            <div className="mt-6 text-center">
              <Link
                href="/"
                className="text-xs text-[#71767B] hover:text-white transition-colors"
              >
                ← Back to Feed
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 2. LOGGED IN VIEW: CLEAN 10 PEOPLE FEED PAGE
  // ============================================================================
  return (
    <div className="min-h-screen bg-black text-white flex justify-center py-6 px-3 sm:px-4 selection:bg-white selection:text-black relative pb-28">
      {/* Real-time incoming broadcast toast (Zero Numbers) */}
      {liveToast && (
        <div className="fixed top-5 right-5 z-50 max-w-sm bg-[#18191a] border border-white/20 rounded-xl p-3.5 shadow-2xl space-y-1 select-none animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between space-x-2">
            <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>{liveToast.title}</span>
            </div>
            <button onClick={() => setLiveToast(null)} className="text-[#71767B] hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-[#b0b3b8] font-sans truncate pl-3.5">
            {liveToast.snippet}
          </p>
        </div>
      )}

      {/* FLOATING PLUS ICON AT BOTTOM CENTER */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <button
          onClick={() => setIsComposerOpen(true)}
          title="Create Broadcast"
          className="w-14 h-14 rounded-full bg-white text-black shadow-2xl hover:bg-neutral-200 active:scale-95 transition-all flex items-center justify-center cursor-pointer border border-neutral-300 group"
        >
          <Plus className="w-7 h-7 stroke-[2.5] text-black group-hover:rotate-90 transition-transform duration-200" />
        </button>
      </div>

      <main className="w-full max-w-[620px] flex flex-col space-y-4">
        {/* Clean Top Header: BHUVAN on Left, Profile Icon on Top Right */}
        <header className="pt-1 pb-2 px-1 flex items-center justify-between relative">
          <Link
            href="/"
            className="font-bitroad text-2xl sm:text-3xl tracking-wider text-white select-none hover:opacity-90 transition-opacity"
          >
            BHUVAN
          </Link>

          {/* Profile Icon on Top Right -> Directly links to their profile page */}
          <Link
            href={`/voice/${session.slotNumber}`}
            title={`View profile of ${memberIdentity.originalName}`}
            aria-label={`View profile of ${memberIdentity.originalName}`}
            className="w-10 h-10 rounded-full overflow-hidden bg-[#242526] border border-white/20 hover:border-white transition-all shadow-md flex items-center justify-center cursor-pointer active:scale-95 group shrink-0"
          >
            {currentSlotInfo?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveMediaUrl(currentSlotInfo.avatar_url)}
                alt={memberIdentity.originalName}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            ) : (
              <span className="font-bold text-sm text-white">
                {memberIdentity.originalName.charAt(0) || "V"}
              </span>
            )}
          </Link>
        </header>

        {/* Top Instagram-Style Stories / Voices Carousel */}
        <VoicesStoriesCarousel currentSlot={session?.slotNumber} />

        {/* Success Alert */}
        {publishSuccess && (
          <div className="bg-[#18191a] border-l-4 border-emerald-400 rounded-xl p-4 shadow-md flex items-center space-x-2.5 text-xs font-mono text-emerald-400">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{publishSuccess}</span>
          </div>
        )}

        {/* FEED STREAM */}
        {isLoadingFeed && broadcasts.length === 0 ? (
          <PostSkeleton />
        ) : broadcasts.length === 0 ? (
          <div className="bg-[#18191a] rounded-xl py-20 px-6 text-center space-y-4 font-mono select-none shadow-md">
            <div className="w-12 h-12 rounded-full bg-[#242526] mx-auto flex items-center justify-center text-white text-lg">
              ☵
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold tracking-widest uppercase text-white">
                Awaiting Broadcasts
              </h3>
              <p className="text-xs text-[#b0b3b8] max-w-sm mx-auto leading-relaxed">
                Click the + icon at the bottom center to publish a broadcast.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {broadcasts.map((broadcast) => (
              <PostCard key={broadcast.id} broadcast={broadcast} />
            ))}
          </div>
        )}
      </main>

      {/* INSTAGRAM-STYLE MEDIA UPLOAD & COMPOSER MODAL */}
      {session && (
        <InstagramCreateModal
          isOpen={isComposerOpen}
          onClose={() => setIsComposerOpen(false)}
          onSuccess={(newBroadcast) => {
            setBroadcasts((prev) => [newBroadcast, ...prev]);
            setPublishSuccess("Broadcast published and verified live!");
            setTimeout(() => setPublishSuccess(null), 4000);
          }}
          slotNumber={session.slotNumber}
          privateKeyHex={session.privateKeyHex}
          author={{
            originalName: memberIdentity.originalName,
            spotName: memberIdentity.spotName,
            avatarUrl: currentSlotInfo?.avatar_url,
          }}
          isSlot10Locked={isSlot10Locked}
        />
      )}
    </div>
  );
}
