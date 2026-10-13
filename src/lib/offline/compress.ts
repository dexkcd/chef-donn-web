/**
 * Shrink a receipt photo before it's queued: long edge 1600px, JPEG q0.8 (~300 KB).
 * Re-encoding through a canvas also drops EXIF (GPS, phone model). PDFs pass through.
 */
const MAX_EDGE = 1600;

export async function compressForUpload(file: File): Promise<{ blob: Blob; mime: string; name: string }> {
  if (file.type === "application/pdf") return { blob: file, mime: file.type, name: file.name };
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.8));
    if (!blob) throw new Error("encode failed");
    return { blob, mime: "image/jpeg", name: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
  } catch {
    // Browser can't decode it (e.g. HEIC on some Androids): send the original if the server accepts it.
    if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { blob: file, mime: file.type, name: file.name };
    throw new Error("This photo format isn't supported. Take the photo with the camera button instead.");
  }
}
