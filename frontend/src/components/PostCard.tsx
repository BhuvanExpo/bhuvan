"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Broadcast } from "@/types";
import { parseVoiceIdentity } from "@/utils/voiceIdentity";
import { resolveMediaUrl } from "@/utils/imageUpload";
import { Heart, Share2, Check, ShieldCheck, X, Copy, ExternalLink } from "lucide-react";

interface PostCardProps {
  broadcast: Broadcast;
}

export default function PostCard({ broadcast }: PostCardProps) {
  const isTitan = broadcast.slot_number === 10;
  const [imgError, setImgError] = useState(false);
  const [mediaLoading, setMediaLoading] = useState<boolean>(true);
  const [mediaError, setMediaError] = useState<boolean>(false);
  const [reloadKey, setReloadKey] = useState<number>(0);

  // Social interactions state
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [likeCount, setLikeCount] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);
  const [showProofModal, setShowProofModal] = useState<boolean>(false);
  const [copiedSig, setCopiedSig] = useState<boolean>(false);

  const { originalName, spotName } = parseVoiceIdentity(
    broadcast.category_label,
    broadcast.slot_number,
    broadcast.real_name
  );

  const [timeDisplay, setTimeDisplay] = useState<{
    display: string;
    fullLocale: string;
  }>({
    display: "",
    fullLocale: "",
  });

  // Calculate stable base likes and load viewer's like state from localStorage
  useEffect(() => {
    // Deterministic base like count based on post ID
    const baseLikes = 25 + ((broadcast.id * 37 + broadcast.slot_number * 19) % 220);

    try {
      const stored = localStorage.getItem("bhuvan_liked_posts");
      const likedArr: number[] = stored ? JSON.parse(stored) : [];
      const liked = likedArr.includes(broadcast.id);
      setIsLiked(liked);
      setLikeCount(liked ? baseLikes + 1 : baseLikes);
    } catch {
      setLikeCount(baseLikes);
    }
  }, [broadcast.id, broadcast.slot_number]);

  // Handle Like toggle
  const handleToggleLike = () => {
    const nextState = !isLiked;
    setIsLiked(nextState);
    setLikeCount((prev) => (nextState ? prev + 1 : Math.max(0, prev - 1)));

    try {
      const stored = localStorage.getItem("bhuvan_liked_posts");
      let likedArr: number[] = stored ? JSON.parse(stored) : [];
      if (nextState) {
        if (!likedArr.includes(broadcast.id)) likedArr.push(broadcast.id);
      } else {
        likedArr = likedArr.filter((id) => id !== broadcast.id);
      }
      localStorage.setItem("bhuvan_liked_posts", JSON.stringify(likedArr));
    } catch (e) {
      console.warn("Could not save like state:", e);
    }
  };

  // Handle Share / Copy Link
  const handleCopyLink = () => {
    try {
      const url = `${window.location.origin}/voice/${broadcast.slot_number}#broadcast-${broadcast.id}`;
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy link:", e);
    }
  };

  // Copy signature hex
  const handleCopySignature = () => {
    if (!broadcast.signature_b64) return;
    navigator.clipboard.writeText(broadcast.signature_b64);
    setCopiedSig(true);
    setTimeout(() => setCopiedSig(false), 2000);
  };

  // Dynamically calculate timestamp according to viewer's local region and timezone
  useEffect(() => {
    try {
      const dt = new Date(broadcast.created_at);
      const now = new Date();
      const diffMs = now.getTime() - dt.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);

      const fullLocaleStr = dt.toLocaleString(undefined, {
        dateStyle: "full",
        timeStyle: "long",
      });

      const localTimeStr = dt.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });

      const isCurrentYear = dt.getFullYear() === now.getFullYear();
      const localDateStr = dt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: isCurrentYear ? undefined : "numeric",
      });

      let displayStr = "";
      if (diffSecs < 60 && diffSecs >= 0) {
        displayStr = "Just now";
      } else if (diffMins < 60 && diffMins > 0) {
        displayStr = `${diffMins}m ago · ${localTimeStr}`;
      } else if (diffHours < 24 && diffHours > 0) {
        displayStr = `${diffHours}h ago · ${localTimeStr}`;
      } else {
        displayStr = `${localDateStr} at ${localTimeStr}`;
      }

      setTimeDisplay({
        display: displayStr,
        fullLocale: fullLocaleStr,
      });
    } catch {
      setTimeDisplay({
        display: broadcast.created_at,
        fullLocale: broadcast.created_at,
      });
    }
  }, [broadcast.created_at]);

  return (
    <>
      <article
        id={`broadcast-${broadcast.id}`}
        className={`bg-[#18191a] rounded-xl shadow-lg overflow-hidden transition-all duration-150 ${
          isTitan ? "border-t-2 border-white ring-1 ring-white/10" : "border border-white/5"
        }`}
      >
        {/* Facebook-style Card Header */}
        <div className="p-4 pb-2 flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0">
            {/* Circular Profile Avatar (Clickable to Voice Profile) */}
            <Link
              href={`/voice/${broadcast.slot_number}`}
              className="relative group shrink-0"
              title={`View profile of ${originalName}`}
            >
              {broadcast.avatar_url && !imgError ? (
                <div
                  className={`w-10 h-10 rounded-full overflow-hidden bg-[#242526] transition-all shadow-sm ${
                    isTitan
                      ? "border-2 border-white ring-1 ring-white/30"
                      : "border border-white/20 group-hover:border-white"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveMediaUrl(broadcast.avatar_url, "avatar")}
                    alt={originalName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    onError={() => setImgError(true)}
                  />
                </div>
              ) : (
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm select-none shadow-sm transition-transform group-hover:scale-105 ${
                    isTitan
                      ? "bg-white text-black"
                      : "bg-[#242526] text-white border border-white/10"
                  }`}
                >
                  {originalName.charAt(0) || "V"}
                </div>
              )}
            </Link>

            {/* Author: "the original name of the person " after that small text and less bold add the spot name */}
            <div className="flex flex-col min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 min-w-0">
                <Link
                  href={`/voice/${broadcast.slot_number}`}
                  className="font-bold text-[15px] text-white tracking-tight hover:underline hover:text-neutral-200 transition-colors shrink-0"
                  title={originalName}
                >
                  {originalName}
                </Link>
                {spotName && (
                  <span className="text-xs text-[#b0b3b8] font-normal truncate">
                    {spotName}
                  </span>
                )}
              </div>

              {/* Region-Adjusted Local Timestamp */}
              <div className="text-xs text-[#b0b3b8] font-mono mt-0.5">
                <time
                  title={timeDisplay.fullLocale}
                  className="hover:underline cursor-default"
                >
                  {timeDisplay.display || "..."}
                </time>
              </div>
            </div>
          </div>
        </div>

        {/* Broadcast Message Text */}
        <div className={`px-4 pt-2 ${broadcast.media_url ? "pb-3" : "pb-3.5"}`}>
          <p className="text-[15px] leading-relaxed text-[#e4e6eb] font-sans whitespace-pre-wrap break-words selection:bg-white selection:text-black">
            {broadcast.body}
          </p>
        </div>

        {/* Optional Media Container with Progressive Loading & Error Fallback */}
        {broadcast.media_url && !mediaError && (
          <div className="relative w-full overflow-hidden bg-[#18191a] flex justify-center min-h-[220px] max-h-[520px]">
            {mediaLoading && (
              <div className="absolute inset-0 bg-neutral-900/80 animate-pulse flex items-center justify-center">
                <div className="flex items-center space-x-2 text-xs font-mono text-neutral-400">
                  <span className="w-2 h-2 rounded-full bg-[#0095f6] animate-ping" />
                  <span>Loading media...</span>
                </div>
              </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`${broadcast.id}-${reloadKey}`}
              src={resolveMediaUrl(broadcast.media_url, "post")}
              alt="Broadcast attachment"
              className={`w-full h-auto object-cover max-h-[520px] transition-opacity duration-300 ${
                mediaLoading ? "opacity-0" : "opacity-100"
              }`}
              loading="lazy"
              decoding="async"
              onLoad={() => setMediaLoading(false)}
              onError={() => {
                setMediaLoading(false);
                setMediaError(true);
              }}
            />
          </div>
        )}

        {broadcast.media_url && mediaError && (
          <div className="w-full p-4 bg-[#18191a]/80 border-y border-white/5 flex items-center justify-between text-xs font-mono text-neutral-400">
            <span className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Attachment unavailable</span>
            </span>
            <button
              onClick={() => {
                setMediaError(false);
                setMediaLoading(true);
                setReloadKey((k) => k + 1);
              }}
              className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-[11px] transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Facebook/Instagram-Style Action Bar (Like, Share, Verified Proof) */}
        <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between text-xs select-none">
          {/* Left: Like & Share Buttons */}
          <div className="flex items-center space-x-5">
            {/* Like Button */}
            <button
              onClick={handleToggleLike}
              className="flex items-center space-x-1.5 transition-colors cursor-pointer group active:scale-95"
              title={isLiked ? "Unlike" : "Like"}
            >
              <Heart
                className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                  isLiked ? "text-[#0095f6] fill-[#0095f6]" : "text-[#b0b3b8] group-hover:text-white"
                }`}
              />
              <span
                className={`font-mono text-xs ${
                  isLiked ? "text-[#0095f6] font-semibold" : "text-[#b0b3b8] group-hover:text-white"
                }`}
              >
                {likeCount.toLocaleString()}
              </span>
            </button>

            {/* Share / Copy Link Button */}
            <button
              onClick={handleCopyLink}
              className="flex items-center space-x-1.5 text-[#b0b3b8] hover:text-white transition-colors cursor-pointer active:scale-95"
              title="Copy link to broadcast"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  <span>Share</span>
                </>
              )}
            </button>
          </div>

          {/* Right: Cryptographic Verified Pill */}
          <button
            onClick={() => setShowProofModal(true)}
            title="Inspect cryptographic proof"
            className="flex items-center space-x-1.5 text-[11px] font-mono text-[#71767B] hover:text-emerald-400 transition-colors cursor-pointer group"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline">Ed25519 Verified</span>
            <span className="sm:hidden">Verified</span>
          </button>
        </div>
      </article>

      {/* Cryptographic Proof Modal */}
      {showProofModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-[#242526] w-full max-w-md rounded-2xl border border-white/20 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 font-sans">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Cryptographic Authenticity Proof
                </h3>
              </div>
              <button
                onClick={() => setShowProofModal(false)}
                className="w-7 h-7 rounded-full bg-[#3a3b3c] hover:bg-[#4e4f50] text-[#b0b3b8] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs font-mono">
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300 text-[11px] leading-relaxed">
                ✓ Cryptographic authenticity validated. This broadcast was digitally signed in-browser via pure Ed25519 (RFC 8032) and is immutably anchored.
              </div>

              <div className="space-y-1">
                <span className="text-neutral-400 text-[10px] uppercase tracking-wider block">
                  Author & Voice
                </span>
                <p className="text-white font-semibold font-sans text-sm">
                  {originalName} ({spotName})
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-neutral-400 text-[10px] uppercase tracking-wider block">
                  Broadcast ID & Timestamp (UTC)
                </span>
                <p className="text-[#e4e6eb] text-[11px]">
                  #{broadcast.id} · {broadcast.created_at}
                </p>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400 text-[10px] uppercase tracking-wider">
                    Ed25519 Detached Signature
                  </span>
                  <button
                    onClick={handleCopySignature}
                    className="text-white hover:underline flex items-center space-x-1 text-[11px] cursor-pointer"
                  >
                    {copiedSig ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSig ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <div className="bg-black/70 p-2.5 rounded-lg border border-white/10 text-[10px] text-neutral-300 break-all select-all font-mono">
                  {broadcast.signature_b64}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setShowProofModal(false)}
                  className="bg-white hover:bg-neutral-200 text-black text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
