import { cva } from "class-variance-authority";

// The 11 button styles from getdesign.md §5.
export const buttonVariants = cva(
  "group inline-flex items-center justify-center gap-3 rounded-md text-center transition-all duration-200 ease-brand disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45",
  {
    variants: {
      variant: {
        // 1 · Primary gold CTA ("SHOP THERAPY →")
        gold: "bg-grad-gold font-sans font-medium uppercase tracking-[0.16em] text-white shadow-btn hover:text-white hover:brightness-95 active:translate-y-px",
        // 2 · Gold small ("Shop Men →")
        goldSm: "bg-gold-600 font-sans font-medium text-white hover:bg-gold-700 hover:text-white",
        // 3 · Brown solid — commerce actions (Add to Cart, Subscribe, Send Message)
        brown: "bg-brown-700 font-serif text-white hover:bg-brown-800 hover:text-white",
        // 4 · Green — Buy Now / final payment only
        green: "bg-leaf-800 font-serif text-white hover:bg-leaf-900 hover:text-white",
        // 5 · Text link with underline ("OUR PHILOSOPHY")
        link: "rounded-none border-b border-current px-0 pb-2 font-sans font-medium uppercase tracking-[0.18em] text-gold-700 hover:text-brown-700",
        linkLight: "rounded-none border-b border-current px-0 pb-2 font-sans font-medium uppercase tracking-[0.18em] text-ivory hover:text-gold-400",
        // 6 · Gold text + arrow ("SHOP NOW →")
        arrow: "px-0 font-sans font-semibold uppercase tracking-[0.2em] text-gold-700 hover:text-brown-700",
        // 7 · Outline ("Read More →")
        outline: "border border-sand-500 bg-transparent font-serif text-cocoa-900 hover:border-gold-600 hover:bg-cream-200 hover:text-cocoa-900",
        // 8 · Icon circle (carousel arrows)
        icon: "rounded-full bg-brown-700 p-0 text-white hover:scale-105 hover:text-white",
        // 9 · Chip ("Orders & Shipping ›")
        chip: "justify-between rounded-lg border border-sand-400 bg-cream-50 font-sans text-cocoa-900 hover:border-gold-600 hover:text-cocoa-900",
        // 10 · Ghost icon (header search/account/cart)
        ghost: "bg-transparent p-0 text-cocoa-900 hover:text-gold-700",
        danger: "border border-danger-600 bg-transparent font-sans font-medium text-danger-600 hover:bg-danger-50 hover:text-danger-600",
      },
      size: {
        sm: "min-h-[40px] px-4 text-sm",
        md: "min-h-[48px] px-6 text-base",
        lg: "min-h-[56px] px-8 text-[17px]",
        icon: "h-11 w-11",
      },
    },
    compoundVariants: [
      { variant: ["link", "linkLight", "arrow"], className: "min-h-0 px-0" },
      { variant: "gold", size: "lg", className: "text-[15px]" },
    ],
    defaultVariants: { variant: "brown", size: "md" },
  }
);
