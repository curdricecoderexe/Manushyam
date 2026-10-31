import { useQuery } from "./query";
import { SLOT_BY_KEY } from "../data/appearanceSlots";

// Image for an appearance slot: the admin's override when set, otherwise the bundled image.
// The bundled image renders immediately and while the request is in flight, so nothing jumps
// unless an override exists.
export function useAppearance(key) {
  const { data } = useQuery("/api/appearance");
  const slot = SLOT_BY_KEY[key];
  const override = data?.slots?.[key];
  if (override?.url) return { src: override.url, alt: override.alt || slot.fallback.alt };
  return slot.fallback;
}
