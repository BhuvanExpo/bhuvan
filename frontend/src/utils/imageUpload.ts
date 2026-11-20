const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Compresses an image in-browser using HTML5 Canvas to prevent multi-megabyte
 * raw camera images from lagging network uploads.
 */
export async function compressImage(
  file: File,
  maxDimension = 1920,
  quality = 0.85
): Promise<Blob> {
  // If not in a browser environment or not an image, return raw file
  if (typeof window === "undefined" || !file.type.startsWith("image/")) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }

        // Draw image onto canvas with high quality smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          quality
        );
      };

      img.onerror = () => resolve(file);
      img.src = event.target?.result as string;
    };

    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads an image directly to the backend storage endpoint.
 * Returns the accessible public URL.
 */
export async function uploadImageDirectly(
  file: File,
  onProgress?: (status: string) => void
): Promise<{ url: string; relativePath: string }> {
  onProgress?.("Optimizing image...");
  
  // Compress large camera photos in browser first
  let uploadBlob: Blob;
  try {
    uploadBlob = await compressImage(file, 1920, 0.85);
  } catch (err) {
    console.warn("Client-side compression skipped, uploading original:", err);
    uploadBlob = file;
  }

  onProgress?.("Uploading to storage...");
  const formData = new FormData();
  const safeFilename = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
  formData.append("file", uploadBlob, safeFilename);

  const res = await fetch(`${API_BASE_URL}/api/v1/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Upload failed with status ${res.status}`);
  }

  const data = await res.json();
  return {
    url: data.url,
    relativePath: data.relative_path || data.url,
  };
}

/**
 * Resolves and optimizes any media URL (local uploads, S3, or external CDNs like Unsplash).
 * Handles:
 * 1. Rewriting obsolete/local development URLs (e.g. localhost:8000/uploads/...) to the live backend API.
 * 2. Mixed content auto-upgrade (http -> https).
 * 3. Dynamic image compression & dimension clamping for Unsplash/external images (down from 4MB to ~80KB).
 */
export function resolveMediaUrl(
  url?: string | null,
  variant: "post" | "avatar" | "cover" | "thumb" = "post"
): string {
  if (!url || typeof url !== "string") return "";

  let cleaned = url.trim();

  // 1. Rewrite obsolete localhost / internal host references to the active production backend
  if (
    cleaned.includes("localhost:8000/uploads/") ||
    cleaned.includes("127.0.0.1:8000/uploads/") ||
    cleaned.includes("0.0.0.0:8000/uploads/")
  ) {
    const filename = cleaned.split("/uploads/")[1];
    cleaned = `${API_BASE_URL.replace(/\/$/, "")}/uploads/${filename}`;
  } else if (cleaned.startsWith("/uploads/")) {
    cleaned = `${API_BASE_URL.replace(/\/$/, "")}${cleaned}`;
  } else if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://") && !cleaned.startsWith("data:")) {
    cleaned = `${API_BASE_URL.replace(/\/$/, "")}/${cleaned.replace(/^\//, "")}`;
  }

  // 2. Mixed content security: upgrade http:// to https:// in production
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    cleaned.startsWith("http://") &&
    !cleaned.includes("localhost") &&
    !cleaned.includes("127.0.0.1")
  ) {
    cleaned = cleaned.replace(/^http:\/\//i, "https://");
  }

  // 3. Ultra-fast compression for Unsplash images (prevents downloading 4MB 4K originals)
  if (cleaned.includes("images.unsplash.com")) {
    try {
      const u = new URL(cleaned);
      u.searchParams.set("auto", "format");
      if (variant === "avatar" || variant === "thumb") {
        u.searchParams.set("w", "200");
        u.searchParams.set("h", "200");
        u.searchParams.set("fit", "crop");
        u.searchParams.set("crop", "faces");
        u.searchParams.set("q", "80");
      } else if (variant === "cover") {
        u.searchParams.set("w", "1080");
        u.searchParams.set("fit", "crop");
        u.searchParams.set("q", "75");
      } else {
        // "post"
        u.searchParams.set("w", "800");
        u.searchParams.set("fit", "crop");
        u.searchParams.set("q", "75");
      }
      return u.toString();
    } catch {
      return cleaned;
    }
  }

  return cleaned;
}
