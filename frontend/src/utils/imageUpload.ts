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
    relativePath: data.relative_path,
  };
}

/**
 * Resolves any relative media URL (like /uploads/xyz.jpg) to a fully qualified URL
 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  if (url.startsWith("/")) {
    return `${API_BASE_URL}${url}`;
  }
  return `${API_BASE_URL}/${url}`;
}
