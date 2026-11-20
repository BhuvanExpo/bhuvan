import io
import os
import uuid
import logging
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
from fastapi import UploadFile, HTTPException, status
from PIL import Image, ImageOps

from app.config import settings

logger = logging.getLogger("broadcast.storage")

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Maximum file size: 15MB
MAX_FILE_SIZE = 15 * 1024 * 1024
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}

def sanitize_and_verify_image(content: bytes) -> Tuple[bytes, str]:
    """
    Verifies that the uploaded bytes are a genuine image (not an executable or polyglot script).
    Strips EXIF data and re-encodes clean image bytes to eliminate hidden payloads.
    Returns (cleaned_bytes, extension).
    """
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds maximum allowed limit of 15MB."
        )

    try:
        with Image.open(io.BytesIO(content)) as img:
            img_format = img.format.upper() if img.format else "UNKNOWN"
            if img_format not in ALLOWED_IMAGE_FORMATS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unsupported image format: {img_format}. Allowed: JPEG, PNG, WEBP, GIF."
                )

            # Auto-orient based on EXIF before stripping
            img = ImageOps.exif_transpose(img)

            # Format-specific clean re-encoding
            output = io.BytesIO()
            if img_format == "PNG":
                # Convert palette to RGBA if necessary
                if img.mode in ("P", "1"):
                    img = img.convert("RGBA")
                img.save(output, format="PNG", optimize=True)
                ext = ".png"
            elif img_format == "WEBP":
                img.save(output, format="WEBP", quality=88, method=6)
                ext = ".webp"
            elif img_format == "GIF":
                # Save first frame or animated gif
                img.save(output, format="GIF")
                ext = ".gif"
            else:  # JPEG
                if img.mode != "RGB":
                    img = img.convert("RGB")
                img.save(output, format="JPEG", quality=88, optimize=True)
                ext = ".jpg"

            cleaned_bytes = output.getvalue()
            return cleaned_bytes, ext
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Image verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is not a valid or readable image."
        )

async def upload_file_to_storage(
    file: UploadFile,
    base_url: str
) -> Dict[str, Any]:
    """
    Validates, sanitizes, and persists an uploaded media file.
    Supports either Local disk or S3-compatible cloud storage (AWS S3, Cloudflare R2, Supabase).
    """
    content = await file.read()
    cleaned_bytes, ext = sanitize_and_verify_image(content)
    unique_filename = f"{uuid.uuid4().hex}{ext}"

    # 1. S3 Cloud Object Storage
    if settings.STORAGE_BACKEND == "s3" and settings.S3_BUCKET:
        try:
            import boto3
            from botocore.config import Config

            s3_client = boto3.client(
                "s3",
                endpoint_url=settings.S3_ENDPOINT_URL,
                aws_access_key_id=settings.S3_ACCESS_KEY_ID,
                aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
                region_name=settings.S3_REGION,
                config=Config(signature_version="s3v4")
            )

            content_type = f"image/{ext.replace('.', '')}"
            if ext == ".jpg":
                content_type = "image/jpeg"

            s3_client.put_object(
                Bucket=settings.S3_BUCKET,
                Key=f"broadcasts/{unique_filename}",
                Body=cleaned_bytes,
                ContentType=content_type,
                CacheControl="public, max-age=31536000, immutable"
            )

            if settings.S3_PUBLIC_URL_PREFIX:
                public_url = f"{settings.S3_PUBLIC_URL_PREFIX.rstrip('/')}/broadcasts/{unique_filename}"
            elif settings.S3_ENDPOINT_URL:
                public_url = f"{settings.S3_ENDPOINT_URL.rstrip('/')}/{settings.S3_BUCKET}/broadcasts/{unique_filename}"
            else:
                public_url = f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com/broadcasts/{unique_filename}"

            return {
                "url": public_url,
                "filename": unique_filename,
                "size": len(cleaned_bytes),
                "storage": "s3"
            }
        except Exception as e:
            logger.error(f"S3 upload error: {e}. Falling back to local storage.")

    # 2. Local Disk Storage (Default / Fallback)
    dest_path = UPLOAD_DIR / unique_filename
    with open(dest_path, "wb") as f:
        f.write(cleaned_bytes)

    clean_base = base_url.rstrip("/")
    public_url = f"{clean_base}/uploads/{unique_filename}"

    return {
        "url": public_url,
        "relative_path": f"/uploads/{unique_filename}",
        "filename": unique_filename,
        "size": len(cleaned_bytes),
        "storage": "local"
    }
