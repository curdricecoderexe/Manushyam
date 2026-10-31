const crypto = require("crypto");
const { getEnv } = require("../Config/runtime");
const { AppError } = require("../Utils/AppError");

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Identify the real file type from its first bytes; the client-sent MIME type is only a hint.
// SVG and GIF are deliberately not accepted (SVG can carry script).
function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  const brand = buf.toString("ascii", 4, 12);
  if (brand === "ftypavif" || brand === "ftypavis") return "image/avif";
  return null;
}

function cloudinaryConfigured(env = getEnv()) {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

// Cloudinary signature: sha1 of the alphabetically sorted params joined with &, then the API secret.
function signParams(params, secret) {
  const payload = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(payload + secret).digest("hex");
}

async function uploadImage({ buffer, declaredType, folder = "products" }) {
  if (!buffer?.length) throw AppError.badRequest("Choose an image to upload");
  if (buffer.length > MAX_IMAGE_BYTES) throw new AppError(413, "PAYLOAD_TOO_LARGE", "Images must be 5 MB or smaller");
  const type = sniffImageType(buffer);
  if (!type) throw AppError.badRequest("Upload a JPEG, PNG, WebP or AVIF image");
  if (declaredType && declaredType !== type) throw AppError.badRequest("The file’s contents don’t match its type");

  const env = getEnv();
  if (!cloudinaryConfigured(env)) throw new AppError(503, "UPLOADS_UNAVAILABLE", "Image uploads aren’t configured yet");

  const params = { folder: `manushyam/${folder}`, timestamp: Math.floor(Date.now() / 1000) };
  const form = new FormData();
  form.append("file", new Blob([buffer], { type }), "upload");
  form.append("api_key", env.CLOUDINARY_API_KEY);
  for (const [k, v] of Object.entries(params)) form.append(k, String(v));
  form.append("signature", signParams(params, env.CLOUDINARY_API_SECRET));

  let res;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/upload`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new AppError(502, "UPLOAD_FAILED", "The image service didn’t respond. Please try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.secure_url) throw new AppError(502, "UPLOAD_FAILED", "The image couldn’t be uploaded. Please try again.");
  return { url: data.secure_url, width: data.width, height: data.height, bytes: data.bytes, format: data.format, publicId: data.public_id };
}

module.exports = { uploadImage, sniffImageType, signParams, cloudinaryConfigured, MAX_IMAGE_BYTES };
