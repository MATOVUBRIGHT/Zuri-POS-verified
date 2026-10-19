const DEFAULT_MAX_BYTES = 420 * 1024;
const DEFAULT_MAX_DIMENSION = 1440;

const loadImage = (file: File): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The selected image could not be read.")); };
  image.src = url;
});

const canvasBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** Compress camera/uploaded images before storage while keeping product-card detail sharp. */
export async function compressImage(file: File, options?: { maxBytes?: number; maxDimension?: number }): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 120 * 1024) return file;

  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDimension = options?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const image = await loadImage(file);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return file;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  // WebP gives the best quality/size for product photos. JPEG is the fallback
  // for older browsers and for images with a transparent source background.
  const candidates: Array<{ type: string; extension: string }> = [
    { type: "image/webp", extension: "webp" },
    { type: "image/jpeg", extension: "jpg" },
  ];
  for (const candidate of candidates) {
    for (const quality of [0.86, 0.78, 0.7]) {
      const blob = await canvasBlob(canvas, candidate.type, quality);
      if (!blob) continue;
      if (blob.size <= maxBytes || quality === 0.7) {
        if (blob.size >= file.size && scale === 1) return file;
        const baseName = file.name.replace(/\.[^.]+$/, "") || "product-image";
        return new File([blob], `${baseName}.${candidate.extension}`, { type: candidate.type, lastModified: Date.now() });
      }
    }
  }
  return file;
}
