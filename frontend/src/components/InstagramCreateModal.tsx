"use client";

import React, { useState, useRef, useEffect } from "react";
import nacl from "tweetnacl";
import {
  X,
  ArrowLeft,
  Camera,
  Image as ImageIcon,
  Check,
  Crop,
  Smile,
  Shield,
  Clock,
  AlertTriangle,
  Loader2,
  Trash2,
  RefreshCw,
  Sliders,
} from "lucide-react";
import { uploadImageDirectly, resolveMediaUrl } from "@/utils/imageUpload";
import { Broadcast } from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface InstagramCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (broadcast: Broadcast) => void;
  slotNumber: number;
  privateKeyHex: string;
  author: {
    originalName: string;
    spotName: string;
    avatarUrl?: string | null;
  };
  isSlot10Locked?: boolean;
}

type AspectRatio = "original" | "1:1" | "4:5" | "16:9";

export default function InstagramCreateModal({
  isOpen,
  onClose,
  onSuccess,
  slotNumber,
  privateKeyHex,
  author,
  isSlot10Locked = false,
}: InstagramCreateModalProps) {
  // Modal Stages: "select" -> "composer" -> "sharing"
  const [stage, setStage] = useState<"select" | "composer" | "sharing">("select");

  // Media state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [uploadedUrl, setUploadedUrl] = useState<string>("");
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Aspect ratio state (Instagram style: Original, 1:1, 4:5, 16:9)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("original");
  const [showAspectMenu, setShowAspectMenu] = useState<boolean>(false);

  // Post Content
  const [caption, setCaption] = useState<string>("");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [showDiscardDialog, setShowDiscardDialog] = useState<boolean>(false);

  // Hidden File Inputs (Storage & Camera)
  const storageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset modal on open/close
  useEffect(() => {
    if (isOpen) {
      setStage("select");
      setSelectedFile(null);
      setPreviewUrl("");
      setUploadedUrl("");
      setCaption("");
      setAspectRatio("original");
      setPublishError(null);
      setShowDiscardDialog(false);
      setIsUploading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Process chosen or captured file
  const handleProcessFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setPublishError("Please choose an image file (JPEG, PNG, WebP, etc.)");
      return;
    }

    setPublishError(null);
    setSelectedFile(file);

    // Instant local object URL for preview
    const localObjUrl = URL.createObjectURL(file);
    setPreviewUrl(localObjUrl);
    setStage("composer");

    // Upload directly in background while user writes caption
    setIsUploading(true);
    try {
      const res = await uploadImageDirectly(file, (msg) => setUploadStatus(msg));
      setUploadedUrl(res.url);
    } catch (err: any) {
      console.error("Direct upload failed:", err);
      setPublishError(err.message || "Failed to upload image. You can still publish or re-select.");
    } finally {
      setIsUploading(false);
      setUploadStatus("");
    }
  };

  // Drag and drop handlers
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

  // Close attempt with Instagram-style discard check
  const handleAttemptClose = () => {
    if (previewUrl || caption.trim()) {
      setShowDiscardDialog(true);
    } else {
      onClose();
    }
  };

  // Utility to convert hex string to Uint8Array
  const hexToUint8 = (hex: string): Uint8Array => {
    const cleaned = hex.trim();
    if (cleaned.length !== 64) {
      throw new Error(`Private key must be exactly 64 hex characters. Found ${cleaned.length}.`);
    }
    const matches = cleaned.match(/.{1,2}/g);
    if (!matches) throw new Error("Invalid hex characters in private key.");
    return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
  };

  // Share / Publish broadcast with Ed25519 signature
  const handleShare = async () => {
    if (!caption.trim()) {
      setPublishError("Please write a transmission caption before sharing.");
      return;
    }

    if (isSlot10Locked) {
      setPublishError("The Titan Rule: 7-Day cooldown is active on Slot 10.");
      return;
    }

    setStage("sharing");
    setPublishError(null);

    try {
      // 1. Ensure media is uploaded if a file was selected
      let finalMediaUrl: string | null = uploadedUrl || null;
      if (selectedFile && !finalMediaUrl) {
        try {
          const uploadRes = await uploadImageDirectly(selectedFile);
          finalMediaUrl = uploadRes.url;
          setUploadedUrl(uploadRes.url);
        } catch (uploadErr) {
          console.warn("Direct upload during share fallback:", uploadErr);
        }
      }

      // 2. Digital Signature: canonical = f"{slot_number}:{body}:{timestamp}"
      const nowUtc = new Date().toISOString();
      const canonical = `${slotNumber}:${caption.trim()}:${nowUtc}`;
      const canonicalBytes = new TextEncoder().encode(canonical);

      const seedBytes = hexToUint8(privateKeyHex);
      const keyPair = nacl.sign.keyPair.fromSeed(seedBytes);
      const signatureBytes = nacl.sign.detached(canonicalBytes, keyPair.secretKey);

      let binary = "";
      for (let i = 0; i < signatureBytes.length; i++) {
        binary += String.fromCharCode(signatureBytes[i]);
      }
      const signatureB64 = btoa(binary);

      // 3. Submit to API
      const res = await fetch(`${API_BASE_URL}/api/v1/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot_number: slotNumber,
          body: caption.trim(),
          media_url: finalMediaUrl || (previewUrl.startsWith("http") ? previewUrl : null),
          timestamp: nowUtc,
          signature: signatureB64,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail?.error || errorData.detail || `Server error (${res.status})`);
      }

      const newBroadcast: Broadcast = await res.json();
      onSuccess(newBroadcast);
      onClose();
    } catch (err: any) {
      console.error("Publishing error:", err);
      setPublishError(err.message || "Failed to publish broadcast.");
      setStage("composer");
    }
  };

  // Helper for aspect ratio classnames
  const getAspectClass = () => {
    switch (aspectRatio) {
      case "1:1":
        return "aspect-square object-cover";
      case "4:5":
        return "aspect-[4/5] object-cover";
      case "16:9":
        return "aspect-[16/9] object-cover";
      case "original":
      default:
        return "w-full h-full object-contain";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      {/* Hidden File Inputs */}
      <input
        type="file"
        accept="image/*"
        ref={storageInputRef}
        onChange={(e) => e.target.files?.[0] && handleProcessFile(e.target.files[0])}
        className="hidden"
      />
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={cameraInputRef}
        onChange={(e) => e.target.files?.[0] && handleProcessFile(e.target.files[0])}
        className="hidden"
      />

      {/* Main Instagram Dialog Container */}
      <div
        className={`bg-[#262626] border border-[#363636] rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300 ${
          stage === "composer"
            ? "w-full max-w-4xl h-[88vh] max-h-[640px]"
            : "w-full max-w-[480px] h-[520px]"
        }`}
      >
        {/* ===================================================================== */}
        {/* INSTAGRAM HEADER BAR */}
        {/* ===================================================================== */}
        <header className="h-11 border-b border-[#363636] px-4 flex items-center justify-between shrink-0 bg-[#262626] select-none">
          {/* Left Button */}
          {stage === "composer" ? (
            <button
              type="button"
              onClick={() => setShowDiscardDialog(true)}
              className="text-white hover:text-[#b0b3b8] transition-colors p-1 -ml-1 cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
          ) : (
            <div className="w-6" />
          )}

          {/* Center Title */}
          <h2 className="text-sm font-semibold text-white tracking-normal font-sans">
            {stage === "sharing"
              ? "Sharing transmission..."
              : stage === "composer"
              ? "Create new post"
              : "Create new post"}
          </h2>

          {/* Right Action Button */}
          {stage === "composer" ? (
            <button
              type="button"
              onClick={handleShare}
              disabled={!caption.trim() || isUploading || isSlot10Locked}
              className="text-sm font-bold text-[#0095f6] hover:text-[#1877f2] disabled:opacity-40 disabled:hover:text-[#0095f6] transition-colors cursor-pointer select-none font-sans"
            >
              Share
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAttemptClose}
              className="text-[#a8a8a8] hover:text-white transition-colors p-1 -mr-1 cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </header>

        {/* ===================================================================== */}
        {/* STAGE 1: INSTAGRAM MEDIA UPLOAD DROPZONE */}
        {/* ===================================================================== */}
        {stage === "select" && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex-1 flex flex-col items-center justify-center p-8 text-center transition-colors select-none ${
              isDragOver ? "bg-[#303030]" : "bg-[#262626]"
            }`}
          >
            {/* Instagram Signature Media Icon (Overlapping photo outline) */}
            <div className="mb-4 text-white">
              <svg
                aria-label="Media icon"
                className="w-20 h-20 mx-auto text-white fill-none stroke-current stroke-[1.4]"
                viewBox="0 0 97.6 77.3"
              >
                <path
                  d="M16.3 24h.03c2.8-.2 5.5 1.5 6.5 4l3.8 9.5c1.2 3 4.1 5 7.3 5h29c3.2 0 6.1-2 7.3-5l3.8-9.5c1-2.5 3.7-4.2 6.5-4h.03c4.5 0 8.2 3.7 8.2 8.2v39.9c0 4.5-3.7 8.2-8.2 8.2H16.3c-4.5 0-8.2-3.7-8.2-8.2V32.2c0-4.5 3.7-8.2 8.2-8.2z"
                  fill="none"
                />
                <circle cx="48.8" cy="51.8" r="14.8" fill="none" />
                <path
                  d="M31.2 12.5h35.2"
                  strokeLinecap="round"
                />
                <path
                  d="M38.2 6.5h21.2"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <p className="text-xl font-normal text-white font-sans mb-5">
              Drag photos and videos here
            </p>

            {/* Direct Device Storage Button (Instagram Blue Button) */}
            <button
              type="button"
              onClick={() => storageInputRef.current?.click()}
              className="bg-[#0095f6] hover:bg-[#1877f2] active:scale-95 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-all shadow-md cursor-pointer mb-3"
            >
              Select from computer / device
            </button>

            {/* Direct Device Camera Button */}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center space-x-2 text-xs font-semibold text-[#b0b3b8] hover:text-white transition-colors cursor-pointer py-1.5 px-3 rounded-lg hover:bg-white/5 active:scale-95"
            >
              <Camera className="w-4 h-4 text-white" />
              <span>Or take photo with camera</span>
            </button>

            {/* Optional: Text-only post */}
            <div className="mt-8 pt-4 border-t border-[#363636] w-full max-w-[280px]">
              <button
                type="button"
                onClick={() => {
                  setPreviewUrl("");
                  setSelectedFile(null);
                  setStage("composer");
                }}
                className="text-xs font-mono text-[#71767B] hover:text-[#b0b3b8] transition-colors cursor-pointer"
              >
                Write text-only broadcast →
              </button>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* STAGE 2: INSTAGRAM 2-PANEL COMPOSER (PREVIEW + CAPTION) */}
        {/* ===================================================================== */}
        {stage === "composer" && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-black">
            {/* ----------------------------------------------------------------- */}
            {/* LEFT PANEL: INSTAGRAM MEDIA PREVIEW & CONTROLS */}
            {/* ----------------------------------------------------------------- */}
            <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden min-h-[260px] md:min-h-0 border-b md:border-b-0 md:border-r border-[#363636]">
              {previewUrl ? (
                <div className="w-full h-full flex items-center justify-center relative select-none">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Media preview"
                    className={`max-h-full max-w-full transition-all duration-200 ${getAspectClass()}`}
                  />

                  {/* Uploading progress indicator overlay */}
                  {isUploading && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center space-y-2 z-20">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                      <span className="text-xs font-mono text-white">
                        {uploadStatus || "Optimizing & uploading..."}
                      </span>
                    </div>
                  )}

                  {/* INSTAGRAM BOTTOM CONTROLS OVERLAY */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-10 select-none">
                    {/* Aspect Ratio Selector Button */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowAspectMenu(!showAspectMenu)}
                        title="Select aspect ratio"
                        className="w-8 h-8 rounded-full bg-black/75 hover:bg-black/90 backdrop-blur text-white flex items-center justify-center transition-all cursor-pointer border border-white/10 active:scale-95 shadow-md"
                      >
                        <Crop className="w-4 h-4 text-white" />
                      </button>

                      {/* Aspect Ratio Menu (Instagram style: Original, 1:1, 4:5, 16:9) */}
                      {showAspectMenu && (
                        <div className="absolute bottom-10 left-0 bg-[#262626]/95 backdrop-blur border border-[#363636] rounded-xl shadow-2xl p-1.5 flex flex-col space-y-1 w-32 z-30 font-sans text-xs">
                          {(
                            [
                              { key: "original", label: "Original" },
                              { key: "1:1", label: "1:1 Square" },
                              { key: "4:5", label: "4:5 Portrait" },
                              { key: "16:9", label: "16:9 Wide" },
                            ] as const
                          ).map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => {
                                setAspectRatio(item.key);
                                setShowAspectMenu(false);
                              }}
                              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                                aspectRatio === item.key
                                  ? "bg-[#363636] text-white font-bold"
                                  : "text-[#a8a8a8] hover:text-white hover:bg-white/5"
                              }`}
                            >
                              <span>{item.label}</span>
                              {aspectRatio === item.key && (
                                <Check className="w-3.5 h-3.5 text-white" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Change / Replace / Remove Image Actions */}
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        title="Retake with camera"
                        className="w-8 h-8 rounded-full bg-black/75 hover:bg-black/90 backdrop-blur text-white flex items-center justify-center transition-all cursor-pointer border border-white/10 active:scale-95 shadow-md"
                      >
                        <Camera className="w-4 h-4 text-white" />
                      </button>

                      <button
                        type="button"
                        onClick={() => storageInputRef.current?.click()}
                        title="Replace from device"
                        className="w-8 h-8 rounded-full bg-black/75 hover:bg-black/90 backdrop-blur text-white flex items-center justify-center transition-all cursor-pointer border border-white/10 active:scale-95 shadow-md"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-white" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPreviewUrl("");
                          setSelectedFile(null);
                          setUploadedUrl("");
                        }}
                        title="Remove image"
                        className="w-8 h-8 rounded-full bg-black/75 hover:bg-red-600 backdrop-blur text-white flex items-center justify-center transition-all cursor-pointer border border-white/10 active:scale-95 shadow-md"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Text-only empty media state */
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-[#71767B] bg-[#1a1a1a]">
                  <ImageIcon className="w-12 h-12 mb-3 text-[#404040]" />
                  <p className="text-xs font-mono mb-3">No image attached (Text-only broadcast)</p>
                  <button
                    type="button"
                    onClick={() => storageInputRef.current?.click()}
                    className="text-xs font-semibold text-[#0095f6] hover:underline cursor-pointer"
                  >
                    + Add photo from device
                  </button>
                </div>
              )}
            </div>

            {/* ----------------------------------------------------------------- */}
            {/* RIGHT PANEL: CAPTION, AUTHOR IDENTITY & VERIFICATION */}
            {/* ----------------------------------------------------------------- */}
            <div className="w-full md:w-[360px] bg-[#262626] flex flex-col justify-between overflow-y-auto">
              <div>
                {/* Author Identity Row (Instagram style) */}
                <div className="p-4 flex items-center space-x-3 border-b border-[#363636]">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-black border border-white/20 shrink-0">
                    {author.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveMediaUrl(author.avatarUrl)}
                        alt={author.originalName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-xs text-white">
                        {author.originalName.charAt(0) || "V"}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-sm text-white truncate leading-tight">
                      {author.originalName}
                    </span>
                    <span className="text-[11px] text-[#a8a8a8] font-normal truncate">
                      {author.spotName}
                    </span>
                  </div>
                </div>

                {/* Error Banner if any */}
                {publishError && (
                  <div className="m-3 p-3 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-300 font-mono flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{publishError}</span>
                  </div>
                )}

                {/* Caption Textarea (Instagram borderless style) */}
                <div className="p-4 space-y-2">
                  <textarea
                    ref={textareaRef}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Write a caption..."
                    rows={7}
                    maxLength={4000}
                    autoFocus
                    className="w-full bg-transparent text-white text-sm font-sans placeholder-[#71767B] outline-none border-none resize-none leading-relaxed selection:bg-white selection:text-black"
                  />

                  {/* Bottom toolbar inside caption area: Emoji & Character counter */}
                  <div className="flex items-center justify-between pt-2 border-t border-[#363636] text-[#71767B]">
                    <button
                      type="button"
                      onClick={() => setCaption((prev) => prev + " 📡")}
                      className="text-[#a8a8a8] hover:text-white transition-colors cursor-pointer"
                      title="Add signal icon"
                    >
                      <Smile className="w-4 h-4" />
                    </button>
                    <span className="text-[11px] font-mono">
                      {caption.length} / 4,000
                    </span>
                  </div>
                </div>

                {/* Slot #10 Cooldown Warning if active */}
                {isSlot10Locked && (
                  <div className="mx-4 p-3 bg-neutral-900 border border-amber-500/30 rounded-xl flex items-start space-x-2 text-xs text-amber-300 font-mono">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>The Titan Rule: 7-Day Lock active. Transmission prohibited.</span>
                  </div>
                )}
              </div>

              {/* Cryptographic Authenticity Accordion / Footer (Instagram Advanced Settings feel) */}
              <div className="p-4 border-t border-[#363636] bg-[#222222] space-y-2">
                <div className="flex items-center justify-between text-xs font-mono text-[#a8a8a8]">
                  <span className="flex items-center space-x-1.5 text-white font-semibold">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Ed25519 Cryptographic Proof</span>
                  </span>
                  <span className="text-emerald-400 text-[11px]">Ready to sign</span>
                </div>
                <p className="text-[11px] text-[#71767B] font-mono leading-relaxed">
                  Payload will be digitally signed using the hardware key for {author.originalName} upon clicking Share.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* STAGE 3: SHARING / SIGNING PROGRESS */}
        {/* ===================================================================== */}
        {stage === "sharing" && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#262626] space-y-4">
            <Loader2 className="w-10 h-10 text-[#0095f6] animate-spin" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">
                Digitally Signing & Broadcasting...
              </h3>
              <p className="text-xs text-[#a8a8a8] font-mono">
                Attaching Ed25519 signature to the immutable ledger.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* INSTAGRAM DISCARD POST CONFIRMATION DIALOG */}
      {/* ===================================================================== */}
      {showDiscardDialog && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-100">
          <div className="bg-[#262626] border border-[#363636] w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-100 flex flex-col text-center">
            <div className="p-6 space-y-2">
              <h3 className="text-lg font-bold text-white tracking-tight">Discard post?</h3>
              <p className="text-xs text-[#a8a8a8] leading-relaxed">
                If you leave, your edits won&apos;t be saved.
              </p>
            </div>

            <div className="border-t border-[#363636] flex flex-col">
              <button
                type="button"
                onClick={() => {
                  setShowDiscardDialog(false);
                  onClose();
                }}
                className="py-3 text-sm font-bold text-[#ed4956] hover:bg-white/5 transition-colors cursor-pointer border-b border-[#363636]"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => setShowDiscardDialog(false)}
                className="py-3 text-sm font-normal text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
