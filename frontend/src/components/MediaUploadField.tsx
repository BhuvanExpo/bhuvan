"use client";

import React, { useRef, useState } from "react";
import { Camera, Image as ImageIcon, X, Loader2, Link2, CheckCircle2, RefreshCw } from "lucide-react";
import { uploadImageDirectly, resolveMediaUrl } from "@/utils/imageUpload";

interface MediaUploadFieldProps {
  label?: string;
  value: string;
  onChange: (url: string) => void;
  aspect?: "card" | "avatar" | "cover";
  compact?: boolean;
}

export default function MediaUploadField({
  label = "Attach Media",
  value,
  onChange,
  aspect = "card",
  compact = false,
}: MediaUploadFieldProps) {
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUrlFallback, setShowUrlFallback] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const storageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleProcessFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setUploadError("Please choose an image file (JPEG, PNG, WebP, etc.)");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const result = await uploadImageDirectly(file, (status) => {
        setUploadStatus(status);
      });
      onChange(result.url);
      setUploadStatus("");
    } catch (err: any) {
      console.error("Upload error:", err);
      setUploadError(err.message || "Failed to upload image. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    handleProcessFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleRemove = () => {
    onChange("");
    setUploadError(null);
    setUploadStatus("");
  };

  const resolvedUrl = resolveMediaUrl(value);

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-xs font-mono font-bold uppercase tracking-wider text-[#b0b3b8]">
          {label}
        </label>
      )}

      {/* Hidden file inputs for Camera and Storage */}
      <input
        type="file"
        accept="image/*"
        ref={storageInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={cameraInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Uploading state banner */}
      {isUploading && (
        <div className="flex items-center space-x-2.5 p-3 rounded-xl bg-[#262626] border border-[#363636] text-xs font-mono text-white animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin text-[#0095f6]" />
          <span>{uploadStatus || "Processing device image..."}</span>
        </div>
      )}

      {/* Error display */}
      {uploadError && (
        <div className="p-2.5 bg-red-950/50 border border-red-800 rounded-xl text-xs text-red-300 font-mono flex items-center justify-between">
          <span>{uploadError}</span>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="text-red-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* When media is attached: rich Instagram preview with quick remove */}
      {value && !isUploading ? (
        <div className="relative group rounded-xl overflow-hidden border border-[#363636] bg-black">
          {aspect === "avatar" ? (
            <div className="w-20 h-20 rounded-full overflow-hidden mx-auto my-2 border-2 border-white/40 shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolvedUrl}
                alt="Avatar preview"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className={`w-full ${aspect === "cover" ? "h-28" : "max-h-60"} overflow-hidden flex items-center justify-center bg-black`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolvedUrl}
                alt="Media preview"
                className="w-full h-auto object-cover max-h-60"
              />
            </div>
          )}

          {/* Top-right Remove Button */}
          <button
            type="button"
            onClick={handleRemove}
            title="Remove media"
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/80 hover:bg-[#ed4956] text-white flex items-center justify-center shadow-lg transition-colors cursor-pointer border border-white/20"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Change photo action footer (Instagram style) */}
          <div className="px-3 py-2 bg-[#262626] border-t border-[#363636] flex items-center justify-between text-xs font-sans text-[#a8a8a8]">
            <span className="flex items-center space-x-1.5 text-white font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Image attached</span>
            </span>
            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="hover:text-white cursor-pointer font-semibold text-[#0095f6]"
              >
                Retake
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => storageInputRef.current?.click()}
                className="hover:text-white cursor-pointer font-semibold text-[#0095f6]"
              >
                Change
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Action Area: Instagram Drag & Drop / Device Selector */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`space-y-2.5 rounded-xl border border-dashed transition-all p-3 text-center ${
            isDragOver
              ? "border-[#0095f6] bg-[#303030]"
              : "border-[#363636] bg-[#262626]"
          }`}
        >
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
            {/* 1. Device Storage Button (Instagram Blue) */}
            <button
              type="button"
              onClick={() => storageInputRef.current?.click()}
              disabled={isUploading}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 rounded-lg bg-[#0095f6] hover:bg-[#1877f2] text-white font-sans font-semibold text-xs py-2 px-3.5 transition-all cursor-pointer active:scale-95 shadow-sm disabled:opacity-50"
            >
              <ImageIcon className="w-4 h-4 text-white" />
              <span>Select from device</span>
            </button>

            {/* 2. Device Camera Button */}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isUploading}
              className="w-full sm:w-auto flex items-center justify-center space-x-1.5 rounded-lg border border-[#404040] hover:border-white/30 hover:bg-white/5 text-white font-sans text-xs py-2 px-3 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <Camera className="w-4 h-4 text-[#a8a8a8]" />
              <span>Camera</span>
            </button>
          </div>

          <p className="text-[11px] text-[#71767B] font-sans">
            Drag and drop photo here or choose from your files
          </p>

          {/* Collapsible URL fallback option */}
          <div className="text-right pt-1 border-t border-[#363636]">
            <button
              type="button"
              onClick={() => setShowUrlFallback(!showUrlFallback)}
              className="text-[11px] font-sans text-[#71767B] hover:text-[#b0b3b8] inline-flex items-center space-x-1 cursor-pointer transition-colors"
            >
              <Link2 className="w-3 h-3" />
              <span>{showUrlFallback ? "Hide URL input" : "Or enter link"}</span>
            </button>
          </div>

          {showUrlFallback && (
            <input
              type="url"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="w-full bg-[#18191a] text-white rounded-lg px-3 py-2 text-xs font-mono outline-none border border-[#363636] focus:border-white transition-colors"
            />
          )}
        </div>
      )}
    </div>
  );
}
