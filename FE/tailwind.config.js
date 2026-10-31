const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;
const shades = (name, steps) => Object.fromEntries(steps.map((n) => [n, v(`${name}-${n}`)]));

/** @type {import('tailwindcss').Config} */
// Tokens mirror getdesign.md §1–3 and §12. Change colours here, not in components.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    container: { center: true, padding: { DEFAULT: "16px", md: "20px", lg: "24px" }, screens: { xl: "1240px" } },
    extend: {
      // Every palette colour reads an RGB-channel CSS variable (defaults in index.css :root), so the admin's
      // dark theme can remap the whole palette in one place and opacity modifiers (bg-sand-400/70) keep working.
      colors: {
        cocoa: shades("cocoa", [800, 900, 950]),
        brown: shades("brown", [600, 700, 800]),
        gold: shades("gold", [50, 100, 300, 400, 500, 600, 700]),
        leaf: shades("leaf", [50, 800, 900]),
        cream: shades("cream", [50, 100, 200, 300]),
        sand: shades("sand", [400, 500]),
        ink: shades("ink", [500, 700]),
        ivory: "#FAF3E3",
        danger: shades("danger", [50, 600]),
        // Status tones (StatusPill) and admin surfaces.
        warn: shades("warn", [50, 800]),
        info: shades("info", [50, 800]),
        plum: shades("plum", [50, 800]),
        mute: shades("mute", [50, 800]),
        canvas: v("canvas"),
        panel: { DEFAULT: v("panel"), muted: v("panel-muted"), sunken: v("panel-sunken") },
        whatsapp: "#25D366",
      },
      fontFamily: {
        display: ['"Libre Caslon Display"', '"Libre Caslon Text"', "Georgia", "serif"],
        serif: ['"Libre Caslon Text"', '"Cormorant Garamond"', "Georgia", "serif"],
        sans: ['"DM Sans"', '"Hanken Grotesk"', "system-ui", "sans-serif"],
        poster: ["Oswald", '"Bebas Neue"', "Impact", "sans-serif"],
      },
      fontSize: {
        "display-xl": ["clamp(3rem, 6.4vw, 5.75rem)", { lineHeight: "1.02", letterSpacing: "-0.01em" }],
        "display-lg": ["clamp(2.5rem, 4.8vw, 4rem)", { lineHeight: "1.05", letterSpacing: "-0.01em" }],
        eyebrow: ["0.8125rem", { lineHeight: "1", letterSpacing: "0.18em", fontWeight: "600" }],
      },
      borderRadius: { sm: "4px", md: "6px", lg: "12px", xl: "20px" },
      boxShadow: {
        xs: "0 1px 2px rgba(74,44,12,.06)",
        sm: "0 2px 8px rgba(74,44,12,.06), 0 1px 2px rgba(74,44,12,.04)",
        md: "0 8px 24px rgba(74,44,12,.08), 0 2px 6px rgba(74,44,12,.05)",
        lg: "0 20px 48px rgba(42,22,8,.14)",
        btn: "0 6px 16px rgba(142,90,28,.28), inset 0 1px 0 rgba(255,255,255,.25)",
      },
      backgroundImage: {
        "grad-gold": "linear-gradient(180deg,#C9944A 0%,#A8722A 55%,#8E5A1C 100%)",
        "grad-hero": "radial-gradient(120% 90% at 75% 40%,#3A2414 0%,#140D07 60%)",
        "grad-cream": "linear-gradient(180deg,#FBF3E6 0%,#F1E2CA 100%)",
      },
      transitionTimingFunction: { brand: "cubic-bezier(.2,.7,.2,1)" },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(24px)" }, to: { opacity: "1", transform: "none" } },
        "gold-pulse": { "0%,100%": { opacity: ".45", transform: "scale(.92)" }, "50%": { opacity: "1", transform: "scale(1.08)" } },
        "progress": { from: { width: "0" }, to: { width: "100%" } },
        kenburns: { from: { transform: "scale(1.04)" }, to: { transform: "scale(1)" } },
      },
      animation: {
        "fade-up": "fade-up .6s cubic-bezier(.2,.7,.2,1) both",
        "gold-pulse": "gold-pulse 1.6s ease-in-out infinite",
        progress: "progress 2.6s cubic-bezier(.2,.7,.2,1) forwards",
        kenburns: "kenburns 6s ease-out both",
      },
    },
  },
  plugins: [],
};
