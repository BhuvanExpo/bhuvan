"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import PostCard from "@/components/PostCard";
import PostSkeleton from "@/components/PostSkeleton";
import VoicesStoriesCarousel from "@/components/VoicesStoriesCarousel";
import { Broadcast } from "@/types";
import { parseVoiceIdentity } from "@/utils/voiceIdentity";
import { AlertCircle, ArrowUp, X, Key, Shield } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface LiveToast {
  id: number;
  slotNumber: number;
  categoryLabel: string;
  snippet: string;
}

export default function HomePage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live in-place notification state
  const [newPostsCount, setNewPostsCount] = useState<number>(0);
  const [liveToast, setLiveToast] = useState<LiveToast | null>(null);
  const isScrolledRef = useRef<boolean>(false);

  // Authenticated voice member session (if logged in)
  const [session, setSession] = useState<{
    slotNumber: number;
    realName?: string;
    categoryLabel?: string;
  } | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("voice_member_session");
      if (saved) {
        setSession(JSON.parse(saved));
      }
    } catch (e) {
      console.warn("Could not read session:", e);
    }
  }, []);

  // Track window scroll to determine whether to auto-scroll or show floating pill
  useEffect(() => {
    const handleScroll = () => {
      isScrolledRef.current = window.scrollY > 250;
      if (window.scrollY < 80) {
        setNewPostsCount(0);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch initial feed from API (reads directly from Redis cache)
  const fetchFeed = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const url = new URL(`${API_BASE_URL}/api/v1/feed`);
      url.searchParams.set("limit", "50");

      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Feed error: ${res.status} ${res.statusText}`);
      }
      const data: Broadcast[] = await res.json();
      setBroadcasts(data);
    } catch (err: any) {
      console.warn("Could not fetch feed:", err);
      setErrorMsg(
        err.message?.includes("Failed to fetch")
          ? "Backend API is currently offline. Awaiting connection."
          : err.message
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // Connect to SSE stream for zero-latency live push
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource(`${API_BASE_URL}/api/v1/stream`);

        eventSource.addEventListener("broadcast", (event: MessageEvent) => {
          try {
            const newBroadcast: Broadcast = JSON.parse(event.data);

            // 1. Prepend to live broadcast feed in real-time (No reload!)
            setBroadcasts((prev) => {
              if (prev.some((b) => b.id === newBroadcast.id)) return prev;
              return [newBroadcast, ...prev];
            });

            // 2. Display live toast banner
            const snippet =
              newBroadcast.body.length > 70
                ? `${newBroadcast.body.slice(0, 70)}...`
                : newBroadcast.body;

            setLiveToast({
              id: newBroadcast.id,
              slotNumber: newBroadcast.slot_number,
              categoryLabel: newBroadcast.category_label || `Slot #${newBroadcast.slot_number}`,
              snippet: snippet,
            });

            // Auto-hide toast after 5 seconds
            setTimeout(() => {
              setLiveToast((current) => (current?.id === newBroadcast.id ? null : current));
            }, 5000);

            // 3. If user is scrolled down, increment unread floating pill count
            if (isScrolledRef.current) {
              setNewPostsCount((prev) => prev + 1);
            }
          } catch (e) {
            console.error("Failed to parse SSE broadcast payload:", e);
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
        // Handle reconnection
      }
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // Scroll to top when floating pill clicked
  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setNewPostsCount(0);
  };

  return (
    <div className="min-h-screen bg-black text-white flex justify-center py-6 px-3 sm:px-4 selection:bg-white selection:text-black relative">
      {/* FLOATING IN-PLACE NOTIFICATION PILL (Like Twitter/Facebook) */}
      {newPostsCount > 0 && (
        <div className="fixed top-5 z-50 flex justify-center w-full max-w-[620px] pointer-events-none px-4">
          <button
            onClick={handleScrollToTop}
            className="pointer-events-auto bg-white text-black font-mono font-bold text-xs py-2 px-4 rounded-full shadow-2xl hover:bg-neutral-200 transition-all flex items-center space-x-2 animate-bounce border border-neutral-300 select-none cursor-pointer"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            <span>
              {newPostsCount} New {newPostsCount === 1 ? "Broadcast" : "Broadcasts"} Available
            </span>
          </button>
        </div>
      )}

      {/* DISCREET TOAST NOTIFICATION (When a post arrives in real-time) */}
      {liveToast && (
        <div
          onClick={handleScrollToTop}
          className="fixed top-5 right-5 z-50 max-w-sm bg-[#18191a] border border-white/20 rounded-xl p-3.5 shadow-2xl cursor-pointer hover:border-white transition-all space-y-1 select-none animate-in fade-in slide-in-from-top-4 duration-300"
        >
          <div className="flex items-center justify-between space-x-2">
            <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>
                New Broadcast: {parseVoiceIdentity(liveToast.categoryLabel, liveToast.slotNumber).originalName}
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLiveToast(null);
              }}
              className="text-[#71767B] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-[#b0b3b8] font-sans truncate pl-3.5">
            {liveToast.snippet}
          </p>
        </div>
      )}

      <main className="w-full max-w-[620px] flex flex-col space-y-4">
        {/* Facebook-style Top Header Wordmark in Bitroad Font */}
        <div className="pt-1 pb-1 px-1 flex items-center justify-between">
          <h1
            onClick={handleScrollToTop}
            className="font-bitroad text-2xl sm:text-3xl tracking-wider text-white select-none cursor-pointer hover:opacity-90 transition-opacity"
          >
            BHUVAN
          </h1>

          {/* Navigation Icons on Top Right */}
          <div className="flex items-center space-x-2">
            <Link
              href="/admin"
              title="Command Center & User Management"
              aria-label="Command Center & User Management"
              className="w-9 h-9 rounded-full bg-[#18191a] hover:bg-[#242526] border border-white/10 hover:border-white/25 flex items-center justify-center text-[#71767B] hover:text-[#0095f6] transition-all shadow-sm cursor-pointer active:scale-95 group"
            >
              <Shield className="w-4 h-4 text-[#b0b3b8] group-hover:text-[#0095f6] transition-colors" />
            </Link>

            {/* Key Icon to Log In to Member Portal */}
            <Link
              href="/portal?login=true"
              title="Voice Member Login"
              aria-label="Voice Member Login"
              className="w-9 h-9 rounded-full bg-[#18191a] hover:bg-[#242526] border border-white/10 hover:border-white/25 flex items-center justify-center text-[#71767B] hover:text-white transition-all shadow-sm cursor-pointer active:scale-95 group"
            >
              <Key className="w-4 h-4 text-[#b0b3b8] group-hover:text-white transition-colors" />
            </Link>
          </div>
        </div>

        {/* Top Instagram-Style Stories / Voices Carousel */}
        <VoicesStoriesCarousel currentSlot={session?.slotNumber} />

        {/* Network / Connection Alert */}
        {errorMsg && (
          <div className="p-4 bg-[#18191a] rounded-xl flex items-center space-x-3 text-xs font-mono text-[#b0b3b8] shadow-md">
            <AlertCircle className="w-4 h-4 text-white shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Feed Content */}
        {isLoading && broadcasts.length === 0 ? (
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
                The Genesis slots are initialized and awaiting offline signed transmissions via Ed25519.
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
    </div>
  );
}
