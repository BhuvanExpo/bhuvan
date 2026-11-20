"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { resolveMediaUrl } from "@/utils/imageUpload";
import { parseVoiceIdentity } from "@/utils/voiceIdentity";
import { SlotStatus, SlotsMatrixResponse } from "@/types";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface VoicesStoriesCarouselProps {
  currentSlot?: number;
}

export default function VoicesStoriesCarousel({ currentSlot }: VoicesStoriesCarouselProps) {
  const [slots, setSlots] = useState<SlotStatus[]>([]);
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(true);
  const [failedAvatarSlots, setFailedAvatarSlots] = useState<Set<number>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadSlots() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/slots`, { cache: "no-store" });
        if (res.ok) {
          const data: SlotsMatrixResponse = await res.json();
          if (isMounted && data.slots) {
            setSlots(data.slots);
          }
        }
      } catch (err) {
        console.warn("Could not load slots for carousel:", err);
      }
    }
    loadSlots();
    return () => {
      isMounted = false;
    };
  }, []);

  const checkScroll = () => {
    const el = scrollContainerRef.current;
    if (el) {
      setCanScrollLeft(el.scrollLeft > 10);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
    }
  };

  useEffect(() => {
    checkScroll();
    const el = scrollContainerRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll, { passive: true });
      window.addEventListener("resize", checkScroll);
      return () => {
        el.removeEventListener("scroll", checkScroll);
        window.removeEventListener("resize", checkScroll);
      };
    }
  }, [slots]);

  const handleScroll = (direction: "left" | "right") => {
    const el = scrollContainerRef.current;
    if (el) {
      const scrollAmount = direction === "left" ? -240 : 240;
      el.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  if (slots.length === 0) return null;

  return (
    <div className="relative bg-[#18191a] border border-white/10 rounded-2xl p-3 sm:p-4 shadow-lg group select-none">
      {/* Left Scroll Button */}
      {canScrollLeft && (
        <button
          onClick={() => handleScroll("left")}
          aria-label="Scroll left"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-black/80 hover:bg-black border border-white/20 text-white flex items-center justify-center transition-all shadow-md active:scale-90"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      {/* Right Scroll Button */}
      {canScrollRight && (
        <button
          onClick={() => handleScroll("right")}
          aria-label="Scroll right"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-black/80 hover:bg-black border border-white/20 text-white flex items-center justify-center transition-all shadow-md active:scale-90"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* Horizontal Stories Tray */}
      <div
        ref={scrollContainerRef}
        className="flex items-center space-x-3.5 sm:space-x-4 overflow-x-auto no-scrollbar scroll-smooth px-1"
      >
        {slots.map((slot) => {
          const isTitan = slot.slot_number === 10;
          const isCurrent = currentSlot === slot.slot_number;
          const { originalName, spotName } = parseVoiceIdentity(
            slot.category_label,
            slot.slot_number,
            slot.real_name
          );

          // Get first name or display name for compact story label
          const firstName = originalName.split(" ")[0];

          return (
            <Link
              key={slot.slot_number}
              href={`/voice/${slot.slot_number}`}
              className="flex flex-col items-center shrink-0 group/item cursor-pointer focus:outline-none"
              title={`${originalName} — ${spotName}`}
            >
              {/* Instagram-Style Gradient Story Ring */}
              <div
                className={`relative rounded-full transition-transform duration-200 group-hover/item:scale-105 active:scale-95 ${
                  isTitan
                    ? "p-[2.5px] bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-300 shadow-[0_0_12px_rgba(245,158,11,0.35)]"
                    : isCurrent
                    ? "p-[2px] bg-white ring-2 ring-[#0095f6]/50"
                    : "p-[2px] bg-gradient-to-tr from-[#0095f6] via-[#1877f2] to-[#00d2ff] hover:shadow-[0_0_12px_rgba(24,119,242,0.5)]"
                }`}
              >
                {/* Black Ring Spacer */}
                <div className="rounded-full bg-black p-[2px]">
                  {/* Inner Circular Avatar */}
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden bg-[#242526] flex items-center justify-center">
                    {slot.avatar_url && !failedAvatarSlots.has(slot.slot_number) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveMediaUrl(slot.avatar_url, "avatar")}
                        alt={originalName}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover/item:scale-110"
                        onError={() => setFailedAvatarSlots((prev) => new Set(prev).add(slot.slot_number))}
                      />
                    ) : (
                      <span className="font-bold text-base sm:text-lg text-white">
                        {originalName.charAt(0) || "V"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Titan Lock Badge for Slot 10 */}
                {isTitan && (
                  <div
                    title="The Titan Rule: 7-Day Lock"
                    className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-amber-500 text-black flex items-center justify-center border-2 border-black shadow-md"
                  >
                    <Lock className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                )}
              </div>

              {/* Real Name */}
              <span className="text-[11px] sm:text-xs text-white font-medium text-center truncate max-w-[68px] sm:max-w-[76px] mt-1.5 leading-tight group-hover/item:text-[#0095f6] transition-colors">
                {firstName}
              </span>

              {/* Spot Name */}
              <span className="text-[9px] font-mono text-[#b0b3b8] text-center truncate max-w-[68px] sm:max-w-[76px] leading-tight">
                {spotName.split("—")[0].trim()}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
