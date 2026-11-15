"use client";

import React from "react";

export default function PostSkeleton() {
  return (
    <div className="space-y-4">
      {/* Skeleton Card 1 (Text + Media) */}
      <div className="bg-[#18191a] rounded-xl shadow-lg p-4 space-y-3.5 animate-pulse">
        {/* Header */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-[#242526] shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-3.5 bg-[#242526] rounded w-36" />
            <div className="h-2.5 bg-[#242526] rounded w-24" />
          </div>
        </div>
        {/* Text lines */}
        <div className="space-y-2 pt-1">
          <div className="h-3 bg-[#242526] rounded w-full" />
          <div className="h-3 bg-[#242526] rounded w-4/5" />
        </div>
        {/* Media Placeholder */}
        <div className="w-full h-64 bg-[#242526] rounded-lg mt-2" />
      </div>

      {/* Skeleton Card 2 (Text Only) */}
      <div className="bg-[#18191a] rounded-xl shadow-lg p-4 space-y-3.5 animate-pulse">
        {/* Header */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-[#242526] shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-3.5 bg-[#242526] rounded w-44" />
            <div className="h-2.5 bg-[#242526] rounded w-20" />
          </div>
        </div>
        {/* Text lines */}
        <div className="space-y-2 pt-1 pb-1">
          <div className="h-3 bg-[#242526] rounded w-full" />
          <div className="h-3 bg-[#242526] rounded w-11/12" />
          <div className="h-3 bg-[#242526] rounded w-2/3" />
        </div>
      </div>

      {/* Skeleton Card 3 (Text + Media) */}
      <div className="bg-[#18191a] rounded-xl shadow-lg p-4 space-y-3.5 animate-pulse">
        {/* Header */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-[#242526] shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-3.5 bg-[#242526] rounded w-40" />
            <div className="h-2.5 bg-[#242526] rounded w-28" />
          </div>
        </div>
        {/* Text lines */}
        <div className="space-y-2 pt-1">
          <div className="h-3 bg-[#242526] rounded w-full" />
          <div className="h-3 bg-[#242526] rounded w-3/4" />
        </div>
        {/* Media Placeholder */}
        <div className="w-full h-56 bg-[#242526] rounded-lg mt-2" />
      </div>
    </div>
  );
}
