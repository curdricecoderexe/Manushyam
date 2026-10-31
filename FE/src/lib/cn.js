import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Merge conditional class names and let later Tailwind classes override earlier ones.
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatINR(value) {
  return `₹${Number(value).toLocaleString("en-IN")}`;
}

// The API sends money as integer paise (₹499 → 49900). Paise are shown only when non-zero.
export function formatPaise(paise) {
  const rupees = Number(paise) / 100;
  return `₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2, maximumFractionDigits: 2 })}`;
}
