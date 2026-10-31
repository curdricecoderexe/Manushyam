import { useEffect, useState } from "react";
import { useCart } from "../../cart/context";
import { useToast } from "../../toast/context";
import { cn } from "../../lib/cn";
import { buttonVariants } from "../ui/button-variants";
import { PathIcon } from "../ui/icons";
import { ICONS } from "../ui/icon-paths";

// Brown "Add to Cart" (button variant 3). Confirms in place for two seconds; the header count updates too.
export function AddToCartButton({ product, sku = product.defaultSku, qty = 1, size = "sm", showIcon = false, className, onAdded }) {
  const { addItem } = useCart();
  const { toast } = useToast();
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return undefined;
    const t = setTimeout(() => setAdded(false), 2000);
    return () => clearTimeout(t);
  }, [added]);

  const disabled = !product.inStock || !sku;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={async () => {
        try {
          await addItem({ sku, qty });
          setAdded(true);
          onAdded?.();
        } catch (err) {
          toast({ message: err.message, tone: "error" });
        }
      }}
      className={cn(buttonVariants({ variant: "brown", size }), "whitespace-nowrap", className)}
    >
      {showIcon && <PathIcon d={ICONS.bag} size={size === "lg" ? 22 : 17} strokeWidth={1.6} />}
      <span aria-live="polite">{disabled ? "Out of stock" : added ? "Added to cart ✓" : "Add to Cart"}</span>
    </button>
  );
}
