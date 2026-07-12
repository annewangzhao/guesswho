// Turn a user-picked photo into a small square-ish JPEG thumbnail encoded as a
// data URL, so it can live directly in the Realtime Database (no Firebase
// Storage needed). We resize + re-encode entirely in the browser and shrink
// under a byte budget so the DB stays small and syncs fast.

const MAX_DIM = 320; // longest edge, px
const TARGET_BYTES = 40_000; // aim under ~40KB before base64
const MIN_QUALITY = 0.4;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

// Rough byte size of a base64 data URL's payload.
function approxBytes(dataUrl) {
  const comma = dataUrl.indexOf(",");
  return Math.floor(((dataUrl.length - comma - 1) * 3) / 4);
}

// Returns a JPEG data URL thumbnail. Throws on non-images / read failure.
export async function fileToThumbnail(file) {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  const img = await loadImage(file);

  // Scale so the longest edge is at most MAX_DIM.
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  // Step quality down until the encoded image fits the byte budget.
  let quality = 0.8;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (approxBytes(dataUrl) > TARGET_BYTES && quality > MIN_QUALITY) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}
