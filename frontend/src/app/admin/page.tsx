"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Shield,
  Key,
  Users,
  Radio,
  Trash2,
  Edit3,
  Plus,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Lock,
  Unlock,
  AlertCircle,
  ArrowLeft,
  Upload,
  Image as ImageIcon,
  X,
  Download,
  Search,
  Database,
  Flame,
  UserPlus,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import { SlotStatus, AdminStats, AdminBroadcastItem } from "@/types";
import { parseVoiceIdentity } from "@/utils/voiceIdentity";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function AdminDashboardPage() {
  const [mounted, setMounted] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"voices" | "broadcasts">("voices");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [slots, setSlots] = useState<SlotStatus[]>([]);
  const [broadcasts, setBroadcasts] = useState<AdminBroadcastItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Slide-out Drawer state ("add" | "edit" | null)
  const [drawerMode, setDrawerMode] = useState<"add" | "edit" | null>(null);
  const [editingSlot, setEditingSlot] = useState<SlotStatus | null>(null);

  // Modals state
  const [isKeyModalOpen, setIsKeyModalOpen] = useState<boolean>(false);
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState<boolean>(false);
  const [removingSlot, setRemovingSlot] = useState<SlotStatus | null>(null);

  // Form states for Add / Edit
  const [formSlotNumber, setFormSlotNumber] = useState<number | "">("");
  const [formRealName, setFormRealName] = useState<string>("");
  const [formCategoryLabel, setFormCategoryLabel] = useState<string>("");
  const [formAvatarUrl, setFormAvatarUrl] = useState<string>("");
  const [formCoverUrl, setFormCoverUrl] = useState<string>("");
  const [formBio, setFormBio] = useState<string>("");
  const [formFollowersCount, setFormFollowersCount] = useState<number>(10000);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Generated Key Information
  const [generatedKeyInfo, setGeneratedKeyInfo] = useState<{
    slot_number: number;
    real_name: string;
    public_key_hex: string;
    private_key_hex: string;
    wasAutoCopied: boolean;
  } | null>(null);

  // Copy feedback state
  const [copiedKey, setCopiedKey] = useState<boolean>(false);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    setMounted(true);
    loadDashboardData();
  }, []);

  // Fetch all admin data
  const loadDashboardData = async () => {
    try {
      setIsRefreshing(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const [statsRes, slotsRes, bcastsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/admin/stats`, { cache: "no-store", signal: controller.signal }),
        fetch(`${API_BASE_URL}/api/v1/slots`, { cache: "no-store", signal: controller.signal }),
        fetch(`${API_BASE_URL}/api/v1/admin/broadcasts?limit=100`, { cache: "no-store", signal: controller.signal }),
      ]);
      clearTimeout(timeoutId);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      if (slotsRes.ok) {
        const slotsData = await slotsRes.json();
        setSlots(slotsData.slots || []);
      }
      if (bcastsRes.ok) {
        const bcastsData = await bcastsRes.json();
        setBroadcasts(bcastsData || []);
      }
    } catch (err: any) {
      console.error("Failed to load command center data:", err);
      showToast("Error connecting to backend services.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Direct Device Media Upload
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingAvatar(true);
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE_URL}/api/v1/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(err.detail || "Upload failed");
      }

      const data = await res.json();
      setFormAvatarUrl(data.url);
      showToast("Avatar image uploaded successfully!");
    } catch (err: any) {
      showToast(err.message || "Failed to upload image.");
    } finally {
      setIsUploadingAvatar(false);
      if (e.target) e.target.value = "";
    }
  };

  // Open Drawer: Add Mode
  const handleOpenAddDrawer = () => {
    const existingNums = new Set(slots.map((s) => s.slot_number));
    let nextNum = 1;
    while (existingNums.has(nextNum)) {
      nextNum++;
    }
    setEditingSlot(null);
    setFormSlotNumber(nextNum);
    setFormRealName("");
    setFormCategoryLabel("");
    setFormAvatarUrl("");
    setFormCoverUrl("");
    setFormBio("");
    setFormFollowersCount(10000);
    setFormError(null);
    setDrawerMode("add");
  };

  // Open Drawer: Edit Mode
  const handleOpenEditDrawer = (slot: SlotStatus) => {
    setEditingSlot(slot);
    setFormSlotNumber(slot.slot_number);
    setFormRealName(slot.real_name || "");
    setFormCategoryLabel(slot.category_label || "");
    setFormAvatarUrl(slot.avatar_url || "");
    setFormCoverUrl(slot.cover_url || "");
    setFormBio(slot.bio || "");
    setFormFollowersCount(slot.followers_count || 0);
    setFormError(null);
    setDrawerMode("edit");
  };

  // Submit Drawer Form (Add or Edit)
  const handleSubmitDrawer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRealName.trim() || !formCategoryLabel.trim()) {
      setFormError("Real Name and Spot Mandate are required.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (drawerMode === "add") {
        // Create new voice
        const payload = {
          slot_number: formSlotNumber ? Number(formSlotNumber) : undefined,
          real_name: formRealName.trim(),
          category_label: formCategoryLabel.trim(),
          avatar_url: formAvatarUrl.trim() || null,
          cover_url: formCoverUrl.trim() || null,
          bio: formBio.trim() || null,
          followers_count: Number(formFollowersCount) || 0,
        };

        const res = await fetch(`${API_BASE_URL}/api/v1/admin/slots`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "Failed to create voice seat" }));
          throw new Error(err.detail || "Failed to create voice seat");
        }

        const data = await res.json();
        setDrawerMode(null);

        // Auto-copy private key seed directly to clipboard
        let copied = false;
        try {
          await navigator.clipboard.writeText(data.private_key_hex);
          copied = true;
        } catch (_) {}

        setGeneratedKeyInfo({
          slot_number: data.slot_number,
          real_name: data.real_name,
          public_key_hex: data.public_key_hex,
          private_key_hex: data.private_key_hex,
          wasAutoCopied: copied,
        });
        setIsKeyModalOpen(true);

        showToast(`Voice #${data.slot_number} provisioned! Private key copied.`);
        loadDashboardData();
      } else if (drawerMode === "edit" && editingSlot) {
        // Update existing voice
        const payload = {
          real_name: formRealName.trim() || null,
          category_label: formCategoryLabel.trim() || null,
          avatar_url: formAvatarUrl.trim() || null,
          cover_url: formCoverUrl.trim() || null,
          bio: formBio.trim() || null,
          followers_count: Number(formFollowersCount),
        };

        const res = await fetch(`${API_BASE_URL}/api/v1/admin/slots/${editingSlot.slot_number}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "Failed to update voice" }));
          throw new Error(err.detail || "Failed to update voice");
        }

        setDrawerMode(null);
        setEditingSlot(null);
        showToast(`Voice #${editingSlot.slot_number} updated.`);
        loadDashboardData();
      }
    } catch (err: any) {
      setFormError(err.message || "Failed to process request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Rotate Keypair (Instant 1-Click with Auto-Copy)
  const handleRotateKey = async (slot: SlotStatus) => {
    if (
      !confirm(
        `Regenerate cryptographic keys for ${slot.real_name || `Slot #${slot.slot_number}`}? The previous private key will immediately cease to function.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/slots/${slot.slot_number}/rotate-key`, {
        method: "POST",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to rotate key" }));
        throw new Error(err.detail || "Failed to rotate key");
      }

      const data = await res.json();

      let copied = false;
      try {
        await navigator.clipboard.writeText(data.private_key_hex);
        copied = true;
      } catch (_) {}

      setGeneratedKeyInfo({
        slot_number: data.slot_number,
        real_name: data.real_name || `Slot #${data.slot_number}`,
        public_key_hex: data.public_key_hex,
        private_key_hex: data.private_key_hex,
        wasAutoCopied: copied,
      });
      setIsKeyModalOpen(true);
      showToast(`Keypair rotated! New private key copied.`);
      loadDashboardData();
    } catch (err: any) {
      showToast(err.message || "Failed to rotate keys.");
    }
  };

  // Remove or Vacate Voice
  const handleRemoveVoice = async (mode: "vacate" | "delete") => {
    if (!removingSlot) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/admin/slots/${removingSlot.slot_number}?mode=${mode}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to remove voice" }));
        throw new Error(err.detail || "Failed to remove voice");
      }

      setIsRemoveModalOpen(false);
      setRemovingSlot(null);
      showToast(
        mode === "vacate"
          ? `Seat #${removingSlot.slot_number} vacated & keys revoked.`
          : `Slot #${removingSlot.slot_number} removed from ledger.`
      );
      loadDashboardData();
    } catch (err: any) {
      showToast(err.message || "Error removing voice.");
    }
  };

  // Delete Individual Broadcast (1-Click with confirm)
  const handleDeleteBroadcast = async (postId: number) => {
    if (!confirm(`Delete transmission #${postId} from the immutable ledger?`)) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/broadcasts/${postId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to delete transmission" }));
        throw new Error(err.detail || "Failed to delete transmission");
      }

      showToast(`Transmission #${postId} deleted from ledger.`);
      loadDashboardData();
    } catch (err: any) {
      showToast(err.message || "Failed to delete transmission.");
    }
  };

  // Emergency Unlock Titan Cooldown (Slot 10)
  const handleResetTitanCooldown = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/slots/10/reset-cooldown`, {
        method: "POST",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to reset cooldown" }));
        throw new Error(err.detail || "Failed to reset cooldown");
      }

      showToast("Titan 7-Day Cooldown has been unlocked!");
      loadDashboardData();
    } catch (err: any) {
      showToast(err.message || "Failed to reset cooldown.");
    }
  };

  // Copy to clipboard helper
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
    showToast("Copied to clipboard!");
  };

  // Download Credentials file
  const downloadKeyFile = () => {
    if (!generatedKeyInfo) return;
    const content = `BHUVAN SOVEREIGN IDENTITY CREDENTIALS
==================================================
Slot Number: #${generatedKeyInfo.slot_number}
Identity Name: ${generatedKeyInfo.real_name}
Timestamp: ${new Date().toISOString()}

PUBLIC KEY (Ed25519 Hex):
${generatedKeyInfo.public_key_hex}

PRIVATE KEY SEED (32-byte / 64-character Hex):
${generatedKeyInfo.private_key_hex}

AUTHENTICATION:
1. Navigate to: ${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/portal?login=true
2. Select identity: ${generatedKeyInfo.real_name}
3. Enter your 64-character Private Key to sign transmissions.
==================================================`;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bhuvan-key-slot-${generatedKeyInfo.slot_number}-${generatedKeyInfo.real_name.replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter voices by search query
  const filteredSlots = slots.filter((slot) => {
    const q = searchQuery.toLowerCase();
    const nameMatch = (slot.real_name || "").toLowerCase().includes(q);
    const catMatch = (slot.category_label || "").toLowerCase().includes(q);
    const slotMatch = `slot ${slot.slot_number}`.includes(q) || `#${slot.slot_number}`.includes(q);
    return nameMatch || catMatch || slotMatch;
  });

  // Format seconds to human time
  const formatSeconds = (sec: number) => {
    if (sec <= 0) return "Ready";
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h left`;
    return `${hours}h left`;
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-[#0095f6] selection:text-white pb-20">
      {/* ===================================================================== */}
      {/* 1. SLEEK LINEAR / VERCEL TOP NAVBAR                                   */}
      {/* ===================================================================== */}
      <header className="sticky top-0 z-40 bg-black/95 backdrop-blur-md border-b border-white/[0.08] px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3 sm:space-x-4">
          <Link
            href="/"
            title="Return to Public Feed"
            className="w-8 h-8 rounded-lg bg-[#18191a] hover:bg-[#242526] border border-white/10 flex items-center justify-center text-[#71767b] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div className="flex items-center space-x-2.5">
            <h1 className="font-bitroad text-xl sm:text-2xl tracking-wider text-white">
              BHUVAN
            </h1>
            <span className="text-[#3f3f46]">/</span>
            <span className="text-xs font-mono tracking-widest text-[#a1a1aa] uppercase font-semibold">
              Console
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-1" />
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={loadDashboardData}
            disabled={isRefreshing}
            className="h-8 px-2.5 rounded-lg bg-[#18191a] hover:bg-[#242526] border border-white/10 text-xs font-mono text-[#a1a1aa] hover:text-white transition-colors flex items-center space-x-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-[#0095f6]" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <Link
            href="/portal?login=true"
            className="h-8 px-3 rounded-lg bg-[#18191a] hover:bg-[#242526] border border-white/10 text-xs text-[#e4e6eb] font-medium transition-colors flex items-center space-x-1.5"
          >
            <Key className="w-3.5 h-3.5 text-[#0095f6]" />
            <span className="hidden sm:inline">Voice Portal</span>
          </Link>

          {/* Prominent High-Contrast + Add Voice Member Button */}
          <button
            onClick={handleOpenAddDrawer}
            className="h-8 px-3.5 rounded-lg bg-[#0095f6] hover:bg-[#1877f2] text-white text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-[0_0_15px_rgba(0,149,246,0.3)] active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Member</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* ===================================================================== */}
        {/* 2. COMPACT KPI STRIP (MINIMALIST LINEAR STYLE)                        */}
        {/* ===================================================================== */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
          {/* Metric 1: Active Voices */}
          <div className="bg-[#121214] border border-white/[0.08] rounded-xl p-3.5 flex flex-col justify-between">
            <span className="text-[11px] font-mono text-[#71767b] uppercase tracking-wider">
              Sovereign Voices
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-bold font-mono text-white">
                {stats ? `${stats.active_slots} / ${stats.total_slots}` : "--"}
              </span>
              <span className="text-[11px] font-mono text-emerald-400 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Active</span>
              </span>
            </div>
          </div>

          {/* Metric 2: Network Audience */}
          <div className="bg-[#121214] border border-white/[0.08] rounded-xl p-3.5 flex flex-col justify-between">
            <span className="text-[11px] font-mono text-[#71767b] uppercase tracking-wider">
              Network Followers
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-bold font-mono text-white">
                {stats ? stats.total_followers.toLocaleString() : "--"}
              </span>
              <span className="text-[11px] font-mono text-[#71767b]">Audience</span>
            </div>
          </div>

          {/* Metric 3: Transmissions */}
          <div className="bg-[#121214] border border-white/[0.08] rounded-xl p-3.5 flex flex-col justify-between">
            <span className="text-[11px] font-mono text-[#71767b] uppercase tracking-wider">
              Ledger Broadcasts
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-bold font-mono text-white">
                {stats ? stats.total_broadcasts : "--"}
              </span>
              <span className="text-[11px] font-mono text-[#0095f6]">
                +{stats?.broadcasts_last_24h || 0} 24h
              </span>
            </div>
          </div>

          {/* Metric 4: Titan Protocol (Slot 10) */}
          <div className="bg-[#121214] border border-white/[0.08] rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-[#71767b] uppercase tracking-wider">
                Titan 7-Day Lock
              </span>
              {stats?.titan_cooldown.is_locked ? (
                <Lock className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Unlock className="w-3.5 h-3.5 text-emerald-400" />
              )}
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-lg sm:text-xl font-bold font-mono text-amber-400 truncate">
                {stats?.titan_cooldown.is_locked
                  ? formatSeconds(stats.titan_cooldown.seconds_remaining)
                  : "Ready"}
              </span>
              {stats?.titan_cooldown.is_locked && (
                <button
                  onClick={handleResetTitanCooldown}
                  className="text-[11px] font-mono text-amber-400 hover:text-amber-300 underline cursor-pointer"
                >
                  Unlock
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* 3. TABS & SEARCH BAR                                                  */}
        {/* ===================================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          {/* Clean Text Tabs */}
          <div className="flex items-center space-x-1 bg-[#121214] p-1 rounded-xl border border-white/[0.08] w-fit">
            <button
              onClick={() => setActiveTab("voices")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center space-x-2 ${
                activeTab === "voices"
                  ? "bg-[#242526] text-white shadow-sm"
                  : "text-[#71767b] hover:text-white"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Voice Members ({slots.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("broadcasts")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center space-x-2 ${
                activeTab === "broadcasts"
                  ? "bg-[#242526] text-white shadow-sm"
                  : "text-[#71767b] hover:text-white"
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Broadcast Ledger ({broadcasts.length})</span>
            </button>
          </div>

          {/* Quick Search */}
          {activeTab === "voices" && (
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-[#71767b] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter voices or seat..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#121214] text-white rounded-xl pl-9 pr-3 py-1.5 text-xs border border-white/[0.08] focus:border-[#0095f6] outline-none transition-colors placeholder:text-[#52525b]"
              />
            </div>
          )}
        </div>

        {/* ===================================================================== */}
        {/* 4. TAB 1: SLEEK LINEAR / VERCEL DATA TABLE FOR VOICES                 */}
        {/* ===================================================================== */}
        {activeTab === "voices" && (
          <div className="bg-[#121214] border border-white/[0.08] rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[11px] font-mono text-[#71767b] uppercase tracking-wider bg-white/[0.01]">
                    <th className="py-3 px-4 font-medium">Voice Identity</th>
                    <th className="py-3 px-3 font-medium">Seat</th>
                    <th className="py-3 px-3 font-medium">Followers</th>
                    <th className="py-3 px-3 font-medium">Broadcasts</th>
                    <th className="py-3 px-3 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05] text-xs">
                  {filteredSlots.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[#71767b] font-mono text-xs">
                        No voices matched your search.
                      </td>
                    </tr>
                  ) : (
                    filteredSlots.map((slot) => {
                      const parsed = parseVoiceIdentity(slot.category_label, slot.slot_number, slot.real_name);
                      const isTitan = slot.slot_number === 10;
                      const isVacant = !slot.real_name;

                      return (
                        <tr
                          key={slot.slot_number}
                          className="hover:bg-white/[0.02] transition-colors group"
                        >
                          {/* Col 1: Voice Identity */}
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-3">
                              <div className="relative shrink-0">
                                <div
                                  className={`w-9 h-9 rounded-full overflow-hidden bg-neutral-900 border flex items-center justify-center ${
                                    isTitan ? "border-amber-400" : "border-white/10"
                                  }`}
                                >
                                  {slot.avatar_url ? (
                                    <img
                                      src={slot.avatar_url}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <span className="font-mono text-xs text-[#71767b]">
                                      #{slot.slot_number}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="min-w-0">
                                <div className="font-semibold text-white truncate text-xs sm:text-sm">
                                  {parsed.originalName}
                                </div>
                                <div className="text-[11px] text-[#71767b] truncate mt-0.5">
                                  {parsed.spotName}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Col 2: Seat */}
                          <td className="py-3 px-3">
                            <span
                              className={`font-mono text-[11px] px-2 py-0.5 rounded-md border font-semibold ${
                                isTitan
                                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                  : "bg-[#242526] text-[#e4e6eb] border-white/5"
                              }`}
                            >
                              Slot #{slot.slot_number}
                            </span>
                          </td>

                          {/* Col 3: Followers */}
                          <td className="py-3 px-3 font-mono text-[#a1a1aa]">
                            {(slot.followers_count || 0).toLocaleString()}
                          </td>

                          {/* Col 4: Broadcasts */}
                          <td className="py-3 px-3 font-mono text-[#a1a1aa]">
                            {slot.total_broadcasts}
                          </td>

                          {/* Col 5: Status */}
                          <td className="py-3 px-3">
                            {isVacant ? (
                              <span className="inline-flex items-center space-x-1.5 text-[11px] font-mono text-zinc-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                                <span>Vacant</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1.5 text-[11px] font-mono text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                <span>Active</span>
                              </span>
                            )}
                          </td>

                          {/* Col 6: Actions (Quick & Prominent) */}
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center space-x-1.5">
                              {/* View Profile */}
                              <Link
                                href={`/voice/${slot.slot_number}`}
                                target="_blank"
                                title="View Public Profile"
                                className="w-7 h-7 rounded-lg bg-transparent hover:bg-[#242526] text-[#71767b] hover:text-white flex items-center justify-center transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Link>

                              {/* Edit Drawer Button */}
                              <button
                                onClick={() => handleOpenEditDrawer(slot)}
                                title="Edit Voice Identity"
                                className="h-7 px-2.5 rounded-lg bg-[#242526] hover:bg-[#3a3b3c] text-[#e4e6eb] hover:text-white text-xs font-medium flex items-center space-x-1 transition-colors"
                              >
                                <Edit3 className="w-3 h-3 text-[#0095f6]" />
                                <span>Edit</span>
                              </button>

                              {/* Rotate Key Button */}
                              <button
                                onClick={() => handleRotateKey(slot)}
                                title="Rotate Ed25519 Keypair"
                                className="h-7 px-2.5 rounded-lg bg-[#242526] hover:bg-[#3a3b3c] text-[#e4e6eb] hover:text-white text-xs font-medium flex items-center space-x-1 transition-colors"
                              >
                                <Key className="w-3 h-3 text-amber-400" />
                                <span className="hidden sm:inline">Rotate</span>
                              </button>

                              {/* Remove / Vacate Button */}
                              <button
                                onClick={() => {
                                  setRemovingSlot(slot);
                                  setIsRemoveModalOpen(true);
                                }}
                                title="Remove or Vacate Seat"
                                className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* 5. TAB 2: BROADCAST LEDGER                                            */}
        {/* ===================================================================== */}
        {activeTab === "broadcasts" && (
          <div className="bg-[#121214] border border-white/[0.08] rounded-2xl overflow-hidden shadow-sm">
            <div className="p-3.5 border-b border-white/[0.08] flex items-center justify-between text-xs font-mono text-[#71767b]">
              <span>Cryptographically Verified Transmissions</span>
              <span>Total: {broadcasts.length}</span>
            </div>

            {broadcasts.length === 0 ? (
              <div className="py-16 text-center text-[#71767b] font-mono text-xs">
                No transmissions found in the ledger.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {broadcasts.map((post) => {
                  const parsed = parseVoiceIdentity(post.category_label || "", post.slot_number, post.real_name);
                  return (
                    <div
                      key={post.id}
                      className="p-3.5 sm:p-4 hover:bg-white/[0.02] transition-colors flex items-start justify-between space-x-4"
                    >
                      <div className="flex items-start space-x-3 min-w-0 flex-1">
                        <img
                          src={post.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150"}
                          alt=""
                          className="w-9 h-9 rounded-full object-cover shrink-0 border border-white/10"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center space-x-2 flex-wrap">
                            <span className="font-semibold text-xs sm:text-sm text-white">
                              {parsed.originalName}
                            </span>
                            <span className="text-[11px] text-[#0095f6] font-medium">
                              {parsed.spotName}
                            </span>
                            <span className="text-[10px] font-mono text-[#71767b]">
                              Slot #{post.slot_number}
                            </span>
                            <span
                              className="text-[10px] font-mono text-[#71767b]"
                              suppressHydrationWarning
                            >
                              · {new Date(post.created_at).toLocaleString()}
                            </span>
                          </div>

                          <p className="text-xs sm:text-sm text-[#e4e6eb] break-words">
                            {post.body}
                          </p>

                          {post.media_url && (
                            <div className="mt-2 max-w-xs rounded-xl overflow-hidden border border-white/10">
                              <img src={post.media_url} alt="" className="w-full max-h-40 object-cover" />
                            </div>
                          )}

                          <div className="flex items-center space-x-2 text-[10px] font-mono text-emerald-400 pt-0.5">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Ed25519 Verified</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteBroadcast(post.id)}
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors shrink-0 cursor-pointer"
                        title="Delete transmission"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ===================================================================== */}
      {/* 6. SLIDE-OUT DRAWER FOR ADD & EDIT (LINEAR / VERCEL STYLE)             */}
      {/* ===================================================================== */}
      {drawerMode && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={() => setDrawerMode(null)}
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-md bg-[#121214] border-l border-white/[0.08] shadow-2xl h-full flex flex-col justify-between z-10 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-white">
                  {drawerMode === "add" ? "Provision Sovereign Voice" : `Edit Voice #${editingSlot?.slot_number}`}
                </h3>
                <p className="text-[11px] text-[#71767b] font-mono mt-0.5">
                  {drawerMode === "add"
                    ? "Generate Ed25519 cryptographic credentials and assign seat."
                    : "Update voice details and network followers."}
                </p>
              </div>
              <button
                onClick={() => setDrawerMode(null)}
                className="w-8 h-8 rounded-lg bg-[#18191a] hover:bg-[#242526] text-[#71767b] hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Form Body */}
            <form id="drawer-form" onSubmit={handleSubmitDrawer} className="p-5 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs font-mono text-red-400">
                  {formError}
                </div>
              )}

              {/* Slot Number & Real Name */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-mono text-[#a1a1aa] mb-1">
                    Slot #
                  </label>
                  <input
                    type="number"
                    min="1"
                    disabled={drawerMode === "edit"}
                    value={formSlotNumber}
                    onChange={(e) => setFormSlotNumber(e.target.value ? Number(e.target.value) : "")}
                    placeholder="Auto"
                    className="w-full bg-[#18191a] text-white rounded-xl px-3 py-2 text-xs border border-white/10 focus:border-[#0095f6] outline-none disabled:opacity-50"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-mono text-[#a1a1aa] mb-1">
                    Real Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Aarav Sharma"
                    value={formRealName}
                    onChange={(e) => setFormRealName(e.target.value)}
                    className="w-full bg-[#18191a] text-white rounded-xl px-3 py-2 text-xs border border-white/10 focus:border-[#0095f6] outline-none"
                  />
                </div>
              </div>

              {/* Spot Mandate */}
              <div>
                <label className="block text-[11px] font-mono text-[#a1a1aa] mb-1">
                  Spot Mandate / Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ORACLE — The Deep Observer"
                  value={formCategoryLabel}
                  onChange={(e) => setFormCategoryLabel(e.target.value)}
                  className="w-full bg-[#18191a] text-white rounded-xl px-3 py-2 text-xs border border-white/10 focus:border-[#0095f6] outline-none"
                />
              </div>

              {/* Avatar Direct Upload & URL */}
              <div>
                <label className="block text-[11px] font-mono text-[#a1a1aa] mb-1">
                  Avatar Picture
                </label>
                <div className="flex items-center space-x-3">
                  <div className="w-11 h-11 rounded-full overflow-hidden bg-black border border-white/15 shrink-0 flex items-center justify-center">
                    {formAvatarUrl ? (
                      <img src={formAvatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-[#71767b]" />
                    )}
                  </div>

                  <input
                    type="text"
                    placeholder="Image URL or upload"
                    value={formAvatarUrl}
                    onChange={(e) => setFormAvatarUrl(e.target.value)}
                    className="flex-1 bg-[#18191a] text-white rounded-xl px-3 py-2 text-xs border border-white/10 focus:border-[#0095f6] outline-none"
                  />

                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    className="h-8 px-2.5 bg-[#242526] hover:bg-[#3a3b3c] border border-white/10 rounded-xl text-xs font-mono text-[#a1a1aa] hover:text-white flex items-center space-x-1 shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploadingAvatar ? "..." : "Device"}</span>
                  </button>
                </div>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-[11px] font-mono text-[#a1a1aa] mb-1">
                  Bio / Mandate Scope
                </label>
                <textarea
                  rows={3}
                  placeholder="Brief description of this sovereign voice..."
                  value={formBio}
                  onChange={(e) => setFormBio(e.target.value)}
                  className="w-full bg-[#18191a] text-white rounded-xl px-3 py-2 text-xs border border-white/10 focus:border-[#0095f6] outline-none resize-none"
                />
              </div>

              {/* Follower Count */}
              <div>
                <label className="block text-[11px] font-mono text-[#a1a1aa] mb-1">
                  Followers Count
                </label>
                <input
                  type="number"
                  min="0"
                  value={formFollowersCount}
                  onChange={(e) => setFormFollowersCount(Number(e.target.value))}
                  className="w-full bg-[#18191a] text-white rounded-xl px-3 py-2 text-xs border border-white/10 focus:border-[#0095f6] outline-none"
                />
              </div>
            </form>

            {/* Drawer Footer Actions */}
            <div className="p-4 border-t border-white/[0.08] flex items-center justify-end space-x-2.5 bg-black/40">
              <button
                type="button"
                onClick={() => setDrawerMode(null)}
                className="px-4 py-2 rounded-xl text-xs font-mono text-[#71767b] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                form="drawer-form"
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-[#0095f6] hover:bg-[#1877f2] text-white text-xs font-semibold shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting
                  ? "Saving..."
                  : drawerMode === "add"
                  ? "Provision Voice & Keys"
                  : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 7. CREDENTIALS POPUP (AUTO-COPIED TO CLIPBOARD)                        */}
      {/* ===================================================================== */}
      {isKeyModalOpen && generatedKeyInfo && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121214] border border-[#0095f6]/40 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#0095f6]/15 border border-[#0095f6]/30 flex items-center justify-center text-[#0095f6]">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">
                  Credentials Ready · Slot #{generatedKeyInfo.slot_number}
                </h3>
                <p className="text-xs text-[#71767b]">
                  {generatedKeyInfo.real_name}
                </p>
              </div>
            </div>

            {/* Auto-Copied Banner */}
            {generatedKeyInfo.wasAutoCopied && (
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-xs font-mono text-emerald-400 flex items-center space-x-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>Private key seed automatically copied to your clipboard!</span>
              </div>
            )}

            {/* Private Key Monospace Card */}
            <div>
              <label className="block text-[11px] font-mono text-[#a1a1aa] mb-1">
                Private Key Seed (Ed25519)
              </label>
              <div className="bg-black border border-white/10 rounded-xl p-3 select-all">
                <p className="font-mono text-xs text-white break-all select-all">
                  {generatedKeyInfo.private_key_hex}
                </p>
              </div>
            </div>

            <p className="text-xs text-[#71767b]">
              Hand this key to the voice member. They will paste it on the login screen to broadcast.
            </p>

            {/* Actions */}
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => copyToClipboard(generatedKeyInfo.private_key_hex)}
                className="flex-1 py-2 px-3 rounded-xl bg-[#242526] hover:bg-[#3a3b3c] text-white text-xs font-mono font-medium flex items-center justify-center space-x-1.5 transition-colors"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#0095f6]" />}
                <span>{copiedKey ? "Copied" : "Copy Key"}</span>
              </button>

              <button
                type="button"
                onClick={downloadKeyFile}
                className="flex-1 py-2 px-3 rounded-xl bg-[#242526] hover:bg-[#3a3b3c] text-white text-xs font-mono font-medium flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>Download .txt</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsKeyModalOpen(false);
                  setGeneratedKeyInfo(null);
                }}
                className="py-2 px-4 rounded-xl bg-[#0095f6] hover:bg-[#1877f2] text-white text-xs font-semibold shadow-md"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 8. REMOVE / VACATE CONFIRMATION MODAL                                 */}
      {/* ===================================================================== */}
      {isRemoveModalOpen && removingSlot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121214] border border-red-500/30 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-2.5 text-red-400">
              <Trash2 className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-base text-white">
                Remove Voice #{removingSlot.slot_number}?
              </h3>
            </div>

            <p className="text-xs text-[#a1a1aa]">
              Modifying identity for <span className="text-white font-semibold">{removingSlot.real_name || `Slot #${removingSlot.slot_number}`}</span>. Choose an action:
            </p>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => handleRemoveVoice("vacate")}
                className="w-full text-left p-3 rounded-xl bg-[#18191a] hover:bg-[#242526] border border-white/10 transition-colors"
              >
                <div className="font-semibold text-xs text-white">Vacate Seat (Recommended)</div>
                <div className="text-[11px] text-[#71767b] mt-0.5">
                  Revokes keys, clears profile, leaves Slot #{removingSlot.slot_number} vacant for reassignment.
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleRemoveVoice("delete")}
                className="w-full text-left p-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors"
              >
                <div className="font-semibold text-xs text-red-400">Delete Slot Completely</div>
                <div className="text-[11px] text-[#71767b] mt-0.5">
                  Deletes Slot #{removingSlot.slot_number} and removes its broadcasts from the ledger.
                </div>
              </button>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setIsRemoveModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-mono text-[#71767b] hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISCREET TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#18191a] border border-white/20 text-white text-xs font-mono py-2.5 px-4 rounded-xl shadow-2xl flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <span className="w-2 h-2 rounded-full bg-[#0095f6]" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
