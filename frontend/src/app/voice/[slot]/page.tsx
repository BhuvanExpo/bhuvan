"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import nacl from "tweetnacl";
import PostCard from "@/components/PostCard";
import PostSkeleton from "@/components/PostSkeleton";
import MediaUploadField from "@/components/MediaUploadField";
import { resolveMediaUrl } from "@/utils/imageUpload";
import { Broadcast, SlotStatus, Slot10Cooldown, SlotsMatrixResponse, VoiceLink } from "@/types";
import { parseVoiceIdentity } from "@/utils/voiceIdentity";
import {
  ArrowLeft,
  Shield,
  Key,
  Check,
  Edit3,
  Radio,
  Clock,
  X,
  Menu,
  Settings,
  LogOut,
  Sliders,
  Volume2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Layers,
  RotateCcw,
  Link as LinkIcon,
  ExternalLink,
  Plus,
  Trash2,
} from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface VoiceSession {
  slotNumber: number;
  privateKeyHex: string;
  categoryLabel: string;
  publicKeyHex: string;
  realName?: string;
}

interface UserSettings {
  liveStream: boolean;
  audioChime: boolean;
  relativeTimes: boolean;
  highContrast: boolean;
  compactView: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  liveStream: true,
  audioChime: false,
  relativeTimes: true,
  highContrast: false,
  compactView: false,
};

export default function VoiceProfilePage() {
  const params = useParams();
  const router = useRouter();
  const rawSlot = params?.slot as string;
  const slotNumber = parseInt(rawSlot, 10);

  // Data states
  const [slotData, setSlotData] = useState<SlotStatus | null>(null);
  const [cooldown10, setCooldown10] = useState<Slot10Cooldown | null>(null);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<boolean>(false);
  const [coverError, setCoverError] = useState<boolean>(false);

  // Follow state for viewers
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [followersCount, setFollowersCount] = useState<number>(0);

  // Active user session (if logged in as a voice member)
  const [session, setSession] = useState<VoiceSession | null>(null);
  const isOwner = session !== null && session.slotNumber === slotNumber;

  // Three-line top-right menu state
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Settings Modal states
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [cacheClearedToast, setCacheClearedToast] = useState<boolean>(false);

  // Edit Profile Modal states
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [editRealName, setEditRealName] = useState<string>("");
  const [editLabel, setEditLabel] = useState<string>("");
  const [editAvatar, setEditAvatar] = useState<string>("");
  const [editCover, setEditCover] = useState<string>("");
  const [editBio, setEditBio] = useState<string>("");
  const [editLinks, setEditLinks] = useState<VoiceLink[]>([]);
  const [privateKeyInput, setPrivateKeyInput] = useState<string>("");
  const [showPrivateKey, setShowPrivateKey] = useState<boolean>(false);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load session and settings from storage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("voice_member_session");
      if (saved) {
        setSession(JSON.parse(saved));
      }
    } catch (e) {
      console.warn("Could not load session:", e);
    }

    try {
      const savedSettings = localStorage.getItem("bhuvan_user_settings");
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }
    } catch (e) {
      console.warn("Could not load settings:", e);
    }

    try {
      const storedFollows = localStorage.getItem("bhuvan_followed_slots");
      if (storedFollows) {
        const arr: number[] = JSON.parse(storedFollows);
        setIsFollowing(arr.includes(slotNumber));
      }
    } catch (e) {
      console.warn("Could not load followed slots:", e);
    }
  }, [slotNumber]);

  const updateSetting = (key: keyof UserSettings, value: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem("bhuvan_user_settings", JSON.stringify(next));
      } catch (e) {
        console.error("Failed to save settings:", e);
      }
      return next;
    });
  };

  const handleLogout = () => {
    try {
      sessionStorage.removeItem("voice_member_session");
    } catch (e) {
      console.error(e);
    }
    setSession(null);
    router.push("/");
  };

  const voiceIdentity = parseVoiceIdentity(
    slotData?.category_label,
    slotNumber,
    slotData?.real_name
  );

  // Fetch slot details & member's broadcasts
  const fetchData = useCallback(async () => {
    if (isNaN(slotNumber) || slotNumber < 1 || slotNumber > 10) {
      setErrorMsg("Invalid Voice index. Valid Genesis voices are 1 through 10.");
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);

      // 1. Fetch slots matrix
      const slotsRes = await fetch(`${API_BASE_URL}/api/v1/slots`, { cache: "no-store" });
      if (!slotsRes.ok) throw new Error("Could not load voice metadata.");
      const matrix: SlotsMatrixResponse = await slotsRes.json();
      const current = matrix.slots.find((s) => s.slot_number === slotNumber);
      if (current) {
        setSlotData(current);
        setFollowersCount(current.followers_count || 0);
        const parsed = parseVoiceIdentity(current.category_label, slotNumber, current.real_name);
        setEditRealName(current.real_name || parsed.originalName);
        setEditLabel(current.category_label || parsed.spotName);
        setEditAvatar(current.avatar_url || "");
        setEditCover(current.cover_url || "");
        setEditBio(current.bio || "");
        setEditLinks(current.links && Array.isArray(current.links) ? current.links.slice(0, 3) : []);
      }
      setCooldown10(matrix.slot_10_cooldown);

      // 2. Fetch all broadcasts from this slot
      const feedRes = await fetch(`${API_BASE_URL}/api/v1/feed?slot_number=${slotNumber}&limit=100`, {
        cache: "no-store",
      });
      if (feedRes.ok) {
        const feedData: Broadcast[] = await feedRes.json();
        setBroadcasts(feedData);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to load profile.");
    } finally {
      setIsLoading(false);
    }
  }, [slotNumber]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle follow / unfollow toggle
  const handleToggleFollow = async () => {
    const nextState = !isFollowing;
    setIsFollowing(nextState);
    const delta = nextState ? 1 : -1;
    setFollowersCount((prev) => Math.max(0, prev + delta));

    try {
      const stored = localStorage.getItem("bhuvan_followed_slots");
      let arr: number[] = stored ? JSON.parse(stored) : [];
      if (nextState) {
        if (!arr.includes(slotNumber)) arr.push(slotNumber);
      } else {
        arr = arr.filter((num) => num !== slotNumber);
      }
      localStorage.setItem("bhuvan_followed_slots", JSON.stringify(arr));

      await fetch(`${API_BASE_URL}/api/v1/slots/${slotNumber}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta }),
      });
    } catch (e) {
      console.error("Failed to toggle follow status:", e);
    }
  };

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

  // Open Edit Modal with current values
  const handleOpenEdit = () => {
    if (slotData) {
      const parsed = parseVoiceIdentity(slotData.category_label, slotNumber, slotData.real_name);
      setEditRealName(slotData.real_name || parsed.originalName);
      setEditLabel(slotData.category_label || parsed.spotName);
      setEditAvatar(slotData.avatar_url || "");
      setEditCover(slotData.cover_url || "");
      setEditBio(slotData.bio || "");
      setEditLinks(slotData.links && Array.isArray(slotData.links) ? [...slotData.links].slice(0, 3) : []);
    }
    if (isOwner && session) {
      setPrivateKeyInput(session.privateKeyHex);
    } else {
      setPrivateKeyInput("");
    }
    setEditError(null);
    setEditSuccess(null);
    setIsEditOpen(true);
  };

  // Link modification handlers (up to 3 links)
  const handleAddLink = () => {
    if (editLinks.length >= 3) return;
    setEditLinks([...editLinks, { title: "", url: "" }]);
  };

  const handleRemoveLink = (index: number) => {
    setEditLinks(editLinks.filter((_, idx) => idx !== index));
  };

  const handleLinkChange = (index: number, field: "title" | "url", value: string) => {
    const updated = [...editLinks];
    updated[index] = { ...updated[index], [field]: value };
    setEditLinks(updated);
  };

  // Submit profile edit with cryptographic signature
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    const activeKey = isOwner && session ? session.privateKeyHex : privateKeyInput.trim();
    if (!activeKey) {
      setEditError(`Please provide the private key for ${voiceIdentity.originalName} to authorize this update.`);
      return;
    }

    setIsSavingProfile(true);
    setEditError(null);
    setEditSuccess(null);

    try {
      // 1. Verify key format and derive public key client-side
      const seedBytes = hexToUint8(activeKey);
      const keyPair = nacl.sign.keyPair.fromSeed(seedBytes);
      const derivedPubHex = Array.from(keyPair.publicKey)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (slotData && derivedPubHex.toLowerCase() !== slotData.public_key_hex.toLowerCase()) {
        throw new Error(
          `Cryptographic Mismatch: The provided private key does not belong to ${voiceIdentity.originalName}.`
        );
      }

      // 2. Canonical payload signing: profile:{slot_number}:{real_name}:{category_label}:{avatar_url}:{cover_url}:{bio}:{timestamp}
      const nowUtc = new Date().toISOString();
      const targetRealName = editRealName.trim() || voiceIdentity.originalName;
      const targetLabel = editLabel.trim() || voiceIdentity.spotName;
      const targetAvatar = editAvatar.trim();
      const targetCover = editCover.trim();
      const targetBio = editBio.trim();

      // Clean links (clamped to 3, skip empty urls)
      const cleanedLinks = editLinks
        .filter((link) => link.url && link.url.trim().length > 0)
        .slice(0, 3)
        .map((link) => ({
          title: link.title?.trim() || "",
          url: link.url.trim(),
        }));

      const canonical = `profile:${slotNumber}:${targetRealName}:${targetLabel}:${targetAvatar}:${targetCover}:${targetBio}:${nowUtc}`;
      const msgBytes = new TextEncoder().encode(canonical);

      const signatureBytes = nacl.sign.detached(msgBytes, keyPair.secretKey);
      let binary = "";
      for (let i = 0; i < signatureBytes.length; i++) {
        binary += String.fromCharCode(signatureBytes[i]);
      }
      const signatureB64 = btoa(binary);

      // 3. POST to backend API
      const res = await fetch(`${API_BASE_URL}/api/v1/slots/${slotNumber}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          real_name: targetRealName,
          category_label: targetLabel,
          avatar_url: targetAvatar,
          cover_url: targetCover,
          bio: targetBio,
          links: cleanedLinks,
          timestamp: nowUtc,
          signature: signatureB64,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server responded with ${res.status}`);
      }

      const updatedSlot: SlotStatus = await res.json();
      setSlotData((prev) => (prev ? { ...prev, ...updatedSlot } : updatedSlot));
      if (typeof updatedSlot.followers_count === "number") {
        setFollowersCount(updatedSlot.followers_count);
      }

      // Save authenticated session in browser sessionStorage
      const newSession: VoiceSession = {
        slotNumber: slotNumber,
        privateKeyHex: activeKey,
        categoryLabel: updatedSlot.category_label,
        publicKeyHex: updatedSlot.public_key_hex,
        realName: updatedSlot.real_name || targetRealName,
      };
      sessionStorage.setItem("voice_member_session", JSON.stringify(newSession));
      setSession(newSession);

      setEditSuccess("Profile updated and cryptographically verified!");
      setTimeout(() => {
        setIsEditOpen(false);
        setEditSuccess(null);
        fetchData();
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setEditError(err.message || "Failed to update profile.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const isTitan = slotNumber === 10;

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black">
      {/* Top Facebook-Style Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#18191a]/95 backdrop-blur-md border-b border-[#242526] px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {/* Top Left: Just Arrow is enough (feed text removed) */}
          <Link
            href="/"
            aria-label="Back to feed"
            title="Back to feed"
            className="w-9 h-9 rounded-full bg-[#242526] hover:bg-[#3a3b3c] border border-white/10 flex items-center justify-center text-white transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <Link href="/" className="font-bitroad text-xl sm:text-2xl text-white tracking-wider hover:opacity-90">
            BHUVAN
          </Link>
        </div>

        {/* Top Right: Three-Line Menu (Edit, Settings, Logout) */}
        <div className="flex items-center space-x-3">
          {isOwner && (
            <span className="hidden sm:flex bg-emerald-500/20 text-emerald-300 text-xs font-mono px-3 py-1 rounded-full border border-emerald-500/30 items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>You own this Voice</span>
            </span>
          )}

          {/* Three-Line Menu Button & Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-label="Open menu"
              title="Menu"
              className="w-9 h-9 rounded-full bg-[#242526] hover:bg-[#3a3b3c] border border-white/15 flex items-center justify-center text-white transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <Menu className="w-4 h-4 text-white" />
            </button>

            {/* Dropdown Menu */}
            {isMenuOpen && (
              <div className="absolute right-0 top-11 w-60 bg-[#242526] border border-white/15 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 font-sans">
                {/* User Status preview */}
                <div className="px-4 py-2 border-b border-white/10 mb-1">
                  <p className="text-xs font-bold text-white truncate">{voiceIdentity.originalName}</p>
                  <p className="text-[11px] text-[#b0b3b8] truncate font-normal">{voiceIdentity.spotName}</p>
                </div>

                {/* 1. Edit Option */}
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleOpenEdit();
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-semibold text-white hover:bg-white/10 flex items-center space-x-3 transition-colors cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-full bg-[#3a3b3c] flex items-center justify-center shrink-0">
                    <Edit3 className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-white">Edit Profile</span>
                    <span className="text-[11px] text-[#b0b3b8] font-normal truncate">
                      Edit details, bio & links
                    </span>
                  </div>
                </button>

                {/* 2. Settings Option */}
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsSettingsOpen(true);
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-semibold text-white hover:bg-white/10 flex items-center space-x-3 transition-colors cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-full bg-[#3a3b3c] flex items-center justify-center shrink-0">
                    <Settings className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-white">Settings</span>
                    <span className="text-[11px] text-[#b0b3b8] font-normal truncate">
                      Essential app preferences
                    </span>
                  </div>
                </button>

                <div className="my-1 border-t border-white/10" />

                {/* 3. Logout Option */}
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-semibold text-red-400 hover:bg-red-500/10 flex items-center space-x-3 transition-colors cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-full bg-red-950/50 flex items-center justify-center shrink-0 border border-red-500/30">
                    <LogOut className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-red-400">Log Out</span>
                    <span className="text-[11px] text-red-300/70 font-normal truncate">
                      Disconnect session
                    </span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Profile Container */}
      <div className="max-w-[800px] mx-auto pb-16">
        {/* Cover Banner (Zero sovereign voice tag) */}
        <div className="relative w-full h-44 sm:h-64 rounded-b-2xl overflow-hidden bg-gradient-to-r from-neutral-900 via-[#1c1d1f] to-neutral-900 border-x border-b border-white/10 shadow-2xl">
          {slotData?.cover_url && !coverError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveMediaUrl(slotData.cover_url, "cover")}
              alt="Cover banner"
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
              onError={() => setCoverError(true)}
            />
          ) : (
            <>
              {/* Subtle matrix / planetary pattern background */}
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            </>
          )}
        </div>

        {/* Profile Header Info Section */}
        <div className="px-4 sm:px-6 relative -mt-16 sm:-mt-20 pb-6 border-b border-white/10">
          <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4">
            {/* Avatar, Name, Spot Title */}
            <div className="flex flex-col sm:flex-row items-center sm:items-end space-y-3 sm:space-y-0 sm:space-x-5 text-center sm:text-left w-full sm:w-auto">
              {/* Large Circular Avatar */}
              <div
                className={`w-28 h-28 sm:w-36 sm:h-36 rounded-full overflow-hidden bg-[#242526] border-4 border-black shadow-2xl shrink-0 transition-all ${
                  isTitan ? "ring-2 ring-white" : "ring-2 ring-white/20"
                }`}
              >
                {slotData?.avatar_url && !avatarError ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveMediaUrl(slotData.avatar_url, "avatar")}
                    alt={voiceIdentity.originalName}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-3xl text-white bg-[#242526]">
                    {voiceIdentity.originalName.charAt(0) || "V"}
                  </div>
                )}
              </div>

              {/* Name & Spot Title presentation: "the original name of the person " after that small text and less bold add the spot name */}
              <div className="space-y-1 w-full sm:w-auto">
                <div className="flex flex-wrap items-baseline justify-center sm:justify-start gap-2">
                  <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                    {voiceIdentity.originalName}
                  </h1>
                  {voiceIdentity.spotName && (
                    <span className="text-sm font-normal text-[#b0b3b8]">
                      {voiceIdentity.spotName}
                    </span>
                  )}
                </div>

                {/* Titan Rule Status if Slot #10 */}
                {isTitan && (
                  <div className="inline-flex items-center space-x-1.5 bg-neutral-900/80 px-2.5 py-1 rounded-full border border-amber-500/30 text-[11px] font-mono text-amber-300">
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span>
                      {cooldown10?.is_locked
                        ? `Titan Lock: ~${Math.ceil((cooldown10?.cooldown_seconds_remaining || 0) / 3600)}h left`
                        : "Titan Lock: Ready to transmit"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Profile Action: Post Transmission button only for owners (completely removed for viewers) */}
            <div className="flex items-center space-x-3 pt-2 sm:pt-0 shrink-0">
              {isOwner ? (
                <Link
                  href="/portal"
                  className="bg-white hover:bg-neutral-200 text-black text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 shadow-sm cursor-pointer active:scale-95"
                >
                  <Radio className="w-4 h-4" />
                  <span>Post Transmission</span>
                </Link>
              ) : (
                <button
                  onClick={handleToggleFollow}
                  className={`text-xs font-bold px-5 py-2 rounded-lg transition-all flex items-center space-x-1.5 shadow-sm cursor-pointer active:scale-95 ${
                    isFollowing
                      ? "bg-[#242526] hover:bg-[#3a3b3c] text-white border border-white/20"
                      : "bg-white hover:bg-neutral-200 text-black"
                  }`}
                >
                  {isFollowing ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Following</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Follow</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Bio Description (Editable by the 10 people) */}
          {slotData?.bio && (
            <p className="text-sm text-[#e4e6eb] max-w-2xl leading-relaxed whitespace-pre-wrap mt-3 text-center sm:text-left">
              {slotData.bio}
            </p>
          )}

          {/* Up to 3 Links (Editable by the 10 people) */}
          {slotData?.links && slotData.links.length > 0 && (
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-3">
              {slotData.links.slice(0, 3).map((link, idx) => (
                <a
                  key={idx}
                  href={link.url.startsWith("http") ? link.url : `https://${link.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#242526] hover:bg-[#3a3b3c] border border-white/10 hover:border-white/25 text-xs text-[#58a6ff] hover:text-white transition-all group cursor-pointer"
                >
                  <LinkIcon className="w-3 h-3 text-[#b0b3b8] group-hover:text-white" />
                  <span className="font-medium text-white truncate max-w-[160px] sm:max-w-[220px]">
                    {link.title?.trim() || link.url.replace(/^https?:\/\//, "")}
                  </span>
                  <ExternalLink className="w-3 h-3 text-[#b0b3b8] group-hover:text-white shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Centered Stats Block: side by side center in between the profile and posts */}
        <div className="my-6 flex items-center justify-center">
          <div className="flex items-center space-x-12 sm:space-x-20 py-3.5 px-10 rounded-2xl bg-[#18191a] border border-white/10 shadow-lg">
            {/* Posts Column: posts on top, under that count of posts */}
            <div className="flex flex-col items-center">
              <span className="text-xs sm:text-sm font-semibold text-[#b0b3b8] uppercase tracking-wider">
                posts
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono mt-0.5">
                {broadcasts.length}
              </span>
            </div>

            {/* Divider */}
            <div className="h-10 w-px bg-white/10" />

            {/* Followers Column: followers on top, under that count of followers */}
            <div className="flex flex-col items-center">
              <span className="text-xs sm:text-sm font-semibold text-[#b0b3b8] uppercase tracking-wider">
                followers
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono mt-0.5">
                {followersCount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Clean Centered Posts Stream (Zero left intro card, zero timeline header, zero post count on right top) */}
        <div className="max-w-[620px] mx-auto px-4 space-y-4">
          {isLoading && broadcasts.length === 0 ? (
            <PostSkeleton />
          ) : broadcasts.length === 0 ? (
            <div className="bg-[#18191a] rounded-xl py-16 px-6 text-center space-y-3 font-mono border border-white/10 shadow-md">
              <div className="w-12 h-12 rounded-full bg-[#242526] mx-auto flex items-center justify-center text-white text-lg">
                ☵
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold tracking-widest uppercase text-white">
                  No Broadcasts Yet
                </h3>
                <p className="text-xs text-[#b0b3b8] max-w-sm mx-auto leading-relaxed">
                  {voiceIdentity.originalName} has not published any broadcasts to the ledger yet.
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
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. EDIT PROFILE MODAL (Allows editing Real Name, Spot, Avatar, Cover, Bio & Up to 3 Links) */}
      {/* ========================================================================= */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#242526] w-full max-w-lg rounded-2xl border border-white/20 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col font-sans">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Edit3 className="w-4 h-4 text-white" />
                <h3 className="text-base font-bold text-white tracking-tight">
                  Edit Profile: {voiceIdentity.originalName}
                </h3>
              </div>
              <button
                onClick={() => setIsEditOpen(false)}
                className="w-8 h-8 rounded-full bg-[#3a3b3c] hover:bg-[#4e4f50] text-[#b0b3b8] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveProfile} className="p-5 space-y-4 overflow-y-auto">
              {editError && (
                <div className="p-3 bg-red-950/50 border border-red-800 rounded-xl text-xs text-red-300 font-mono flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{editError}</span>
                </div>
              )}
              {editSuccess && (
                <div className="p-3 bg-emerald-950/50 border border-emerald-800 rounded-xl text-xs text-emerald-300 font-mono flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{editSuccess}</span>
                </div>
              )}

              {/* 1. Real World Person Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-neutral-300 uppercase tracking-wider font-mono">
                  Original Real-World Name
                </label>
                <input
                  type="text"
                  value={editRealName}
                  onChange={(e) => setEditRealName(e.target.value)}
                  placeholder="e.g. Aarav Sharma"
                  className="w-full bg-[#18191a] border border-white/20 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white transition-colors font-sans"
                />
              </div>

              {/* 2. Spot Name / Designation */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-neutral-300 uppercase tracking-wider font-mono">
                  Spot Designation / Mandate
                </label>
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder="e.g. MANAV — The Human Witness"
                  className="w-full bg-[#18191a] border border-white/20 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white transition-colors font-sans"
                />
              </div>

              {/* 3. Profile Avatar Photo */}
              <div className="pt-1">
                <MediaUploadField
                  label="Profile Avatar Photo (Camera / Device Storage)"
                  value={editAvatar}
                  onChange={(url) => setEditAvatar(url)}
                  aspect="avatar"
                  compact
                />
              </div>

              {/* 4. Cover Banner Photo */}
              <div className="pt-1">
                <MediaUploadField
                  label="Cover Banner Photo (Camera / Device Storage)"
                  value={editCover}
                  onChange={(url) => setEditCover(url)}
                  aspect="cover"
                  compact
                />
              </div>

              {/* 5. Bio Description (Editable) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-neutral-300 uppercase tracking-wider font-mono">
                    Bio Description
                  </label>
                  <span className="text-[10px] font-mono text-neutral-500">{editBio.length} / 500</span>
                </div>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Describe your domain, perspective, and mandate..."
                  className="w-full bg-[#18191a] border border-white/20 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white transition-colors resize-none leading-relaxed"
                />
              </div>

              {/* 6. Up to 3 Links (Editable) */}
              <div className="space-y-2 pt-1 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-neutral-300 uppercase tracking-wider font-mono">
                    Links ({editLinks.length} / 3)
                  </label>
                  {editLinks.length < 3 && (
                    <button
                      type="button"
                      onClick={handleAddLink}
                      className="text-xs text-white hover:text-neutral-300 flex items-center space-x-1 cursor-pointer font-semibold py-1 px-2.5 rounded-lg bg-[#3a3b3c] hover:bg-[#4e4f50] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Link</span>
                    </button>
                  )}
                </div>

                {editLinks.length === 0 ? (
                  <p className="text-xs text-[#b0b3b8] italic py-1">
                    No custom links added yet. You can add up to 3 links (e.g. portfolio, Twitter, dispatch).
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {editLinks.map((link, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-[#18191a] rounded-xl border border-white/10 space-y-2 relative"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono text-[#b0b3b8] font-bold">
                            Link #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveLink(idx)}
                            title="Remove Link"
                            className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-500/10 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={link.title || ""}
                            onChange={(e) => handleLinkChange(idx, "title", e.target.value)}
                            placeholder="Title (e.g. Dispatch)"
                            className="bg-[#242526] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white transition-colors"
                          />
                          <input
                            type="url"
                            value={link.url}
                            onChange={(e) => handleLinkChange(idx, "url", e.target.value)}
                            placeholder="URL (https://...)"
                            className="bg-[#242526] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white transition-colors"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cryptographic Ownership Verification */}
              {isOwner ? (
                <div className="p-3 bg-black/60 rounded-xl border border-emerald-500/30 flex items-start space-x-2.5 text-[11px] font-mono text-emerald-300">
                  <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    Authenticated as {voiceIdentity.originalName}. Updates will be auto-signed using your active session key.
                  </span>
                </div>
              ) : (
                <div className="space-y-2 p-3.5 bg-black/60 rounded-xl border border-white/10">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono uppercase tracking-wider text-neutral-300 flex items-center space-x-1.5 font-bold">
                      <Key className="w-3.5 h-3.5 text-white" />
                      <span>{voiceIdentity.originalName} Private Key</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPrivateKey(!showPrivateKey)}
                      className="text-[11px] font-mono text-[#b0b3b8] hover:text-white flex items-center space-x-1 cursor-pointer"
                    >
                      {showPrivateKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showPrivateKey ? "Hide" : "Show"}</span>
                    </button>
                  </div>
                  <input
                    type={showPrivateKey ? "text" : "password"}
                    value={privateKeyInput}
                    onChange={(e) => setPrivateKeyInput(e.target.value)}
                    placeholder="Enter 64-hex char Ed25519 private key to authorize..."
                    className="w-full bg-[#18191a] text-white rounded-lg px-3 py-2 text-xs font-mono outline-none border border-white/20 focus:border-white transition-colors"
                  />
                  <p className="text-[10px] font-mono text-neutral-400 leading-relaxed">
                    Zero-Trust Security: Your private key signs this profile update in-browser and is never transmitted over the wire.
                  </p>
                </div>
              )}

              {/* Modal Footer Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="bg-[#3a3b3c] hover:bg-[#4e4f50] text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="bg-white hover:bg-neutral-200 text-black text-xs font-bold px-5 py-2 rounded-lg transition-all disabled:opacity-50 flex items-center space-x-2 cursor-pointer active:scale-95"
                >
                  {isSavingProfile ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span>Signing & Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SETTINGS MODAL (Triggered via Top-Right Three-Line Menu -> Settings) */}
      {/* ========================================================================= */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#242526] w-full max-w-lg rounded-2xl border border-white/20 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col font-sans">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <Settings className="w-4 h-4 text-white" />
                <h3 className="text-base font-bold text-white tracking-tight">
                  Essential Settings
                </h3>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="w-8 h-8 rounded-full bg-[#3a3b3c] hover:bg-[#4e4f50] text-[#b0b3b8] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5 overflow-y-auto">
              {/* Section 1: Live Stream & Feed Preferences */}
              <div className="space-y-3">
                <h4 className="text-xs font-mono uppercase tracking-wider text-[#b0b3b8] font-bold">
                  Feed & Live Stream
                </h4>

                {/* Live Stream SSE Toggle */}
                <div className="flex items-center justify-between p-3 bg-[#18191a] rounded-xl border border-white/10">
                  <div className="flex items-start space-x-3">
                    <Activity className="w-4 h-4 text-white mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-white block">Real-time Push Stream</span>
                      <span className="text-[11px] text-[#b0b3b8] block">
                        Receive instant broadcasts via SSE without reloading the page.
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSetting("liveStream", !settings.liveStream)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      settings.liveStream ? "bg-white" : "bg-[#3a3b3c]"
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full transition-transform transform ${
                        settings.liveStream ? "translate-x-6 bg-black" : "translate-x-1 bg-white"
                      }`}
                    />
                  </button>
                </div>

                {/* Audio Alert Chime */}
                <div className="flex items-center justify-between p-3 bg-[#18191a] rounded-xl border border-white/10">
                  <div className="flex items-start space-x-3">
                    <Volume2 className="w-4 h-4 text-white mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-white block">Transmission Alert Chime</span>
                      <span className="text-[11px] text-[#b0b3b8] block">
                        Play an audio cue when a new broadcast is received.
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSetting("audioChime", !settings.audioChime)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      settings.audioChime ? "bg-white" : "bg-[#3a3b3c]"
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full transition-transform transform ${
                        settings.audioChime ? "translate-x-6 bg-black" : "translate-x-1 bg-white"
                      }`}
                    />
                  </button>
                </div>

                {/* Relative vs UTC Timestamps */}
                <div className="flex items-center justify-between p-3 bg-[#18191a] rounded-xl border border-white/10">
                  <div className="flex items-start space-x-3">
                    <Clock className="w-4 h-4 text-white mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-white block">Relative Timestamps</span>
                      <span className="text-[11px] text-[#b0b3b8] block">
                        Show &quot;15m ago&quot; instead of full calendar dates.
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSetting("relativeTimes", !settings.relativeTimes)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      settings.relativeTimes ? "bg-white" : "bg-[#3a3b3c]"
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full transition-transform transform ${
                        settings.relativeTimes ? "translate-x-6 bg-black" : "translate-x-1 bg-white"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Section 2: Display & Typography */}
              <div className="space-y-3">
                <h4 className="text-xs font-mono uppercase tracking-wider text-[#b0b3b8] font-bold">
                  Display & Layout
                </h4>

                {/* High Contrast Mode */}
                <div className="flex items-center justify-between p-3 bg-[#18191a] rounded-xl border border-white/10">
                  <div className="flex items-start space-x-3">
                    <Sliders className="w-4 h-4 text-white mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-white block">High Contrast Typography</span>
                      <span className="text-[11px] text-[#b0b3b8] block">
                        Enhance brightness of subtle texts for OLED and bright screens.
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSetting("highContrast", !settings.highContrast)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      settings.highContrast ? "bg-white" : "bg-[#3a3b3c]"
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full transition-transform transform ${
                        settings.highContrast ? "translate-x-6 bg-black" : "translate-x-1 bg-white"
                      }`}
                    />
                  </button>
                </div>

                {/* Compact Density Mode */}
                <div className="flex items-center justify-between p-3 bg-[#18191a] rounded-xl border border-white/10">
                  <div className="flex items-start space-x-3">
                    <Layers className="w-4 h-4 text-white mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-white block">Compact Feed Density</span>
                      <span className="text-[11px] text-[#b0b3b8] block">
                        Tighten padding and card margins for maximum information density.
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSetting("compactView", !settings.compactView)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      settings.compactView ? "bg-white" : "bg-[#3a3b3c]"
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full transition-transform transform ${
                        settings.compactView ? "translate-x-6 bg-black" : "translate-x-1 bg-white"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Section 3: Cryptography & Node Network Info */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono uppercase tracking-wider text-[#b0b3b8] font-bold">
                  Network & Cryptography
                </h4>
                <div className="p-3 bg-[#18191a] rounded-xl border border-white/10 text-xs font-mono space-y-1.5 text-[#b0b3b8]">
                  <div className="flex justify-between">
                    <span>Algorithm:</span>
                    <span className="text-white">Pure Ed25519 (RFC 8032)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Replay Window:</span>
                    <span className="text-white">300 seconds (Strict)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Active Session:</span>
                    <span className="text-white">
                      {isOwner ? `${voiceIdentity.originalName} (Authenticated)` : "Spectator Mode"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 4: Storage & Reset */}
              <div className="pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      sessionStorage.removeItem("voice_member_session");
                      localStorage.removeItem("bhuvan_user_settings");
                      localStorage.removeItem("bhuvan_followed_slots");
                    } catch (e) {
                      console.error(e);
                    }
                    setSettings(DEFAULT_SETTINGS);
                    setIsFollowing(false);
                    setCacheClearedToast(true);
                    setTimeout(() => setCacheClearedToast(false), 2000);
                  }}
                  className="w-full bg-[#18191a] hover:bg-[#28292a] text-[#b0b3b8] hover:text-white text-xs font-mono py-2.5 px-3 rounded-xl border border-white/10 flex items-center justify-center space-x-2 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Local Settings & Keys</span>
                </button>
                {cacheClearedToast && (
                  <p className="text-[11px] font-mono text-emerald-400 text-center mt-1.5">
                    Local settings and session cleared!
                  </p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-white/10 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="bg-white hover:bg-neutral-200 text-black text-xs font-bold px-5 py-2 rounded-lg transition-colors cursor-pointer active:scale-95"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
