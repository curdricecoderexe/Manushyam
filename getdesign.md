# ManushyaM — Website Design System (`getdesign.md`)

> Source of truth: `designs/Manushyam Website.pptx` (10 slides, A3 portrait, full-page mockups).
> Every token below was sampled from those mockups. When a mockup and this file disagree, raise it —
> don't guess. Annotated decisions from the deck are called out as **[Deck note]**.

---

## 0. Brand essence

| | |
|---|---|
| **Brand** | ManushyaM (always written with capital **M** at both ends: `ManushyaM`) |
| **Category** | Ayurvedic anti-hair-fall therapy for men & women (KASHAYAM process) |
| **Tagline** | *Rooted in Ritual.* · *Rooted in nature. Backed by science.* |
| **Mood** | Premium, warm, ritualistic, earthy-luxury. Think candle-lit apothecary: deep cocoa darks, antique gold, parchment creams, botanical line-art. |
| **Voice** | Calm, confident, short sentences. Headlines end with a full stop ("Rooted in Ritual.", "Stronger Roots. Happier You."). |
| **Never** | Bright/saturated blues or purples, pure white page backgrounds, pure black text, hard drop shadows, playful rounded "app" UI. |

---

## 1. Color system

### 1.1 Core palette

| Token | Hex | Where it is used in the mockups |
|---|---|---|
| `--cocoa-950` | `#140D07` | Hero backgrounds, dark "How it works" panel, legacy band |
| `--cocoa-900` | `#2A1608` | Headings on cream, announcement bar (darkest), footer copyright bar (dark variant) |
| `--cocoa-800` | `#4E2C0C` | **Announcement bar** background |
| `--brown-700` | `#7A3A12` | **Solid brown buttons** (Add to Cart, Subscribe, Send Message, Read More, carousel arrows), active category pill, active tab underline |
| `--brown-600` | `#8A481E` | Brown button hover-lighter / secondary brown |
| `--gold-500` | `#C9944A` | Gold gradient highlight, star ratings, carousel active dot |
| `--gold-600` | `#A8722A` | **Primary gold button** base, ornament line-art, icons, active nav underline |
| `--gold-700` | `#8E5A1C` | Gold **text** on cream (eyebrows "OUR STORY", "SHOP NOW →", gold sub-headings) — AA compliant |
| `--gold-300` | `#E3C9A0` | Thin gold borders on dark hero frames, hairline dividers on cream |
| `--green-800` | `#1E5C36` | **Buy Now** button, logo wordmark green (`#016133` in logo file) |
| `--cream-50` | `#FDF9F3` | Page background (product / listing pages) |
| `--cream-100` | `#FBF6EE` | Default page background |
| `--cream-200` | `#F7EFE3` | Cards, section panels, footer background |
| `--cream-300` | `#F1E4D0` | Card hover / inset panels, about-hero parchment, badge fills |
| `--sand-400` | `#E6D5BD` | Card borders, input borders, dividers |
| `--ink-700` | `#4A3F36` | Body copy |
| `--ink-500` | `#7A6C60` | Muted copy, captions, footer links, meta (dates, "6 min read") |
| `--white` | `#FFFFFF` | Text on dark/brown/gold/green, product image tiles |

### 1.2 Semantic tokens

```css
:root {
  /* surfaces */
  --bg:            #FBF6EE;   /* page */
  --bg-soft:       #FDF9F3;
  --surface:       #F7EFE3;   /* cards, footer */
  --surface-2:     #F1E4D0;   /* inset / hover */
  --surface-dark:  #140D07;   /* hero, dark panels */
  --announce-bg:   #4E2C0C;

  /* text */
  --text-strong:   #2A1608;   /* headings */
  --text:          #4A3F36;   /* body */
  --text-muted:    #7A6C60;
  --text-on-dark:  #FAF3E3;   /* headings on dark: warm ivory, never pure white */
  --text-gold:     #8E5A1C;   /* gold text on light surfaces */
  --text-gold-on-dark: #D9B57A;

  /* brand / actions */
  --primary:       #A8722A;   /* gold CTA */
  --primary-hi:    #C9944A;   /* gold gradient top */
  --primary-lo:    #8E5A1C;   /* gold gradient bottom / hover */
  --secondary:     #7A3A12;   /* brown solid */
  --secondary-hover:#62290A;
  --success:       #1E5C36;   /* Buy Now, in-stock */
  --success-hover: #164A2B;
  --star:          #C9944A;
  --danger:        #A3341F;   /* form errors, required asterisk */

  /* lines */
  --border:        #E6D5BD;
  --border-strong: #D6BE98;
  --border-gold:   #C9A063;   /* frames on dark hero, card hover */
}
```

### 1.3 Usage ratio
- **60%** cream surfaces (`--bg`, `--surface`) · **25%** cocoa darks (hero, dark panels, announce bar, text) · **10%** gold (CTAs, ornaments, icons) · **5%** brown/green (commerce buttons).
- Green is **only** for "Buy Now" / success states and the logo wordmark. Do not use it decoratively.
- Gold text on cream must use `--text-gold` (#8E5A1C, 5.4:1). `--primary` (#A8722A) as text is 3.8:1 — use it only for ≥24px headings or icons.

### 1.4 Gradients & textures
```css
--grad-gold:   linear-gradient(180deg, #C9944A 0%, #A8722A 55%, #8E5A1C 100%);  /* primary buttons */
--grad-hero:   radial-gradient(120% 90% at 75% 40%, #3A2414 0%, #140D07 60%);   /* dark hero vignette */
--grad-cream:  linear-gradient(180deg, #FBF6EE 0%, #F4E8D6 100%);               /* about hero, promo panels */
```
- Cream sections carry a **very faint botanical line-art** (leaf sprigs / wheat) in corners at 8–12% opacity, color `--gold-300`. Use SVG, `pointer-events:none`.
- Optional paper-grain noise overlay on cream: 3% opacity PNG.

---

## 2. Typography

The mockups pair a **high-contrast book serif** (headings, nav, product titles, serif buttons) with a **clean geometric sans** (body, uppercase CTAs, labels).

| Role | Font (Google Fonts) | Fallback |
|---|---|---|
| Display / headings / nav / product titles | **Libre Caslon Text** (400, 500, 600) | `"Cormorant Garamond", Georgia, "Times New Roman", serif` |
| Hero display (≥48px) | **Libre Caslon Display** (400) | same as above |
| Body, labels, uppercase CTAs, inputs | **DM Sans** (400, 500, 600) | `"Hanken Grotesk", system-ui, sans-serif` |
| Condensed poster heading (only "DHT BLOCKER") | **Oswald** (600) | `"Bebas Neue", Impact, sans-serif` |

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=Libre+Caslon+Display&family=Libre+Caslon+Text:wght@400;500;600&family=Oswald:wght@600&display=swap" rel="stylesheet">
```

### 2.1 Type scale (desktop → mobile)

| Token | Font | Size / line-height | Weight | Tracking | Example |
|---|---|---|---|---|---|
| `display-xl` | Caslon Display | 88 / 1.0 → 48 / 1.05 | 400 | -0.01em | "Rooted in Ritual." |
| `display-lg` | Caslon Display | 64 / 1.05 → 40 | 400 | -0.01em | "Blogs & Reviews", "Contact Us", "About Manushyam" |
| `h1` | Caslon Text | 44 / 1.15 → 32 | 500 | 0 | Product title "Men Anti-Hairfall Therapy" |
| `h2` | Caslon Text | 36 / 1.2 → 28 | 500 | 0 | "Conscious. Creative. Caring.", "Featured Article" |
| `h3` | Caslon Text | 28 / 1.25 → 24 | 500 | 0 | Section titles with ornaments ("You May Also Like") |
| `h4` | Caslon Text | 20 / 1.3 → 18 | 500 | 0 | Card titles, feature titles ("Rooted in Ayurveda") |
| `price` | Caslon Text | 40 / 1 → 32 | 600 | 0 | "₹499" — color `--secondary` |
| `body-lg` | DM Sans | 18 / 1.6 | 400 | 0 | Hero subcopy, product description |
| `body` | DM Sans | 16 / 1.65 | 400 | 0 | Paragraphs |
| `body-sm` | DM Sans | 14 / 1.55 | 400 | 0 | Card descriptions, footer links |
| `caption` | DM Sans | 12 / 1.4 | 400 | 0.01em | Meta, "Based on 10,000+ reviews" |
| `eyebrow` | DM Sans | 13 / 1 | 600 | **0.18em, UPPERCASE** | "OUR PHILOSOPHY", "OUR STORY" — `--text-gold` |
| `cta` | DM Sans | 16 / 1 | 500 | **0.16em, UPPERCASE** | "SHOP THERAPY →" |
| `nav` | Caslon Text | 15 / 1 | 400 | 0 | Header links |
| `badge` | DM Sans | 11 / 1 | 600 | 0.12em, UPPERCASE | "BESTSELLER", "HAIR FALL GUIDE" |

Rules:
- Headings on cream: `--text-strong`. Headings on dark: `--text-on-dark`.
- Gold sub-headline under a heading uses Caslon Text italic-free, `--text-gold` (e.g. "Adaptogenic support from Ginseng Root Extract").
- Rupee symbol `₹` must render in the price font; test Caslon (falls back fine).
- Max line length for body: 60–70ch.

---

## 3. Layout, spacing & grid

| Token | Value |
|---|---|
| Container max-width | **1240px** content; 1320px for hero/full-bleed frames |
| Gutters | 24px desktop · 20px tablet · 16px mobile |
| Grid | 12-col, 24px gap |
| Spacing scale (px) | 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128 |
| Section vertical padding | 96px desktop · 64px tablet · 48px mobile |
| Card internal padding | 24–32px |
| Breakpoints | `sm 640` · `md 768` · `lg 1024` · `xl 1280` · `2xl 1440` |

### 3.1 Radius
| Token | Value | Use |
|---|---|---|
| `--r-sm` | 4px | Badges, tags, tiny buttons |
| `--r-md` | 6px | **Buttons**, inputs, quantity stepper |
| `--r-lg` | 12px | Cards, product gallery, panels |
| `--r-xl` | 20px | Hero frame, large feature panels, dark "How it works" panel |
| `--r-full` | 9999px | Icon circles, carousel arrows, dots, social icons, "Zoom" chip |

### 3.2 Elevation (soft, warm — never grey)
```css
--shadow-xs:  0 1px 2px rgba(74, 44, 12, .06);
--shadow-sm:  0 2px 8px rgba(74, 44, 12, .06), 0 1px 2px rgba(74, 44, 12, .04);
--shadow-md:  0 8px 24px rgba(74, 44, 12, .08), 0 2px 6px rgba(74, 44, 12, .05);
--shadow-lg:  0 20px 48px rgba(42, 22, 8, .14);
--shadow-btn: 0 6px 16px rgba(142, 90, 28, .28);   /* gold CTA */
--shadow-inset-gold: inset 0 0 0 1px rgba(201, 160, 99, .55);
```
Cards: `1px solid var(--border)` + `--shadow-sm`. On hover: border → `--border-gold`, shadow → `--shadow-md`, `translateY(-2px)`.

---

## 4. Ornaments & motifs (signature details — use consistently)

1. **Wheat-arrow section title** — `»—  Title  —«` : a gold fletched arrow on each side of centered `h3` titles ("Shop by Concern", "You May Also Like", "Featured Article", "Send Us a Message", "Quick Answers"). SVG ~40×12, `--gold-600`, 16px gap to text.
2. **Lotus/sprout divider** — a thin gold rule (`1px --gold-300`, 80px each side) with the ManushyaM sprout mark centered (16px). Used under left-aligned headings on About page.
3. **Line-and-label title** — `—— THE MANUSHYAM RITUAL ——` eyebrow with hairlines left/right.
4. **Gold hairline frame on dark** — hero images sit inside a 1px `--border-gold` rounded frame (`--r-xl`) inset 24px, with tiny 4-point star sparkles at two corners.
5. **Icon-in-circle** — line icons (1.5px stroke, `--gold-600`) inside a 56–64px circle with `1px --border-strong` border and `--surface` fill.
6. **Vertical hairline separators** between feature columns (`1px --border`, 60% height).
7. **Botanical corner art** — faint leaf sprigs on cream heroes and promo panels.
8. **Checkmark list** — gold circled check icon + body-sm text ("Ethically sourced ingredients"). Product benefits use a small gold **leaf** bullet instead.

---

## 5. Buttons

All buttons: `min-height 44px`, `border-radius var(--r-md)`, `transition: all .25s cubic-bezier(.2,.7,.2,1)`, `:focus-visible { outline: 2px solid var(--gold-500); outline-offset: 3px; }`, disabled = 45% opacity + `cursor:not-allowed`. Arrow icons are thin long arrows (`→`, Lucide `MoveRight`, 1.5px stroke) that slide `+4px` on hover.

| Variant | Spec | Used for |
|---|---|---|
| **1. Primary Gold (CTA)** | bg `--grad-gold`; text `#FFFFFF` DM Sans 16/500 UPPERCASE tracking .16em; padding `18px 32px`; `--shadow-btn`; subtle inner top highlight `inset 0 1px 0 rgba(255,255,255,.25)`. Hover: gradient shifts darker (`--primary-lo`), shadow grows. Active: `translateY(1px)`. | "SHOP THERAPY →", "EXPLORE THE SCIENCE →" |
| **2. Gold Small** | flat bg `--primary`; white DM Sans 14/500 sentence case; padding `10px 20px`. Hover `--primary-lo`. | "Shop Men →", "Shop Women →" |
| **3. Brown Solid (commerce)** | bg `--secondary`; white **Caslon Text 18/500** sentence case; padding `14px 28px`; leading icon (cart / send / WhatsApp) 20px. Hover `--secondary-hover`. | "Add to Cart", "Send Message", "Subscribe", "See All Reviews →", "Chat on WhatsApp", card "SHOP NOW →" (here DM Sans 12 uppercase) |
| **4. Green Solid** | bg `--success`; white Caslon Text 18/500; leading ⚡ bolt icon (gold-500 fill). Hover `--success-hover`. | "Buy Now" only |
| **5. Text-Link Underline** | no bg; DM Sans 16/500 UPPERCASE tracking .18em; 1px underline offset 10px, full width. On dark: ivory text + ivory line (or gold variant `--text-gold-on-dark`). On cream: `--text-gold` + gold line. Hover: underline animates from 100% → 0 → 100% (or color to `--primary-hi`). | "OUR PHILOSOPHY", "LEARN MORE →" |
| **6. Gold Text + Arrow** | DM Sans 15/600 UPPERCASE tracking .2em `--text-gold`, trailing long arrow. | "SHOP NOW →" in product cards on home |
| **7. Outline** | bg transparent → `--surface` on hover; `1px solid --border-strong`; text `--text-strong` Caslon 16; padding `12px 24px`. | "Read More →" (article cards), "Load More Articles ↓" |
| **8. Icon Circle** | 40px circle, bg `--secondary`, white chevron. Hover scale 1.05. | Carousel prev/next |
| **9. Chip / Pill (selectable)** | `1px --border`, bg `--bg-soft`, radius `--r-md`, padding `14px 20px`, leading gold icon, trailing chevron. Hover border gold. | "Orders & Shipping >" quick answers |
| **10. Ghost Icon** | 40px hit area, 24px line icon `--text-strong`. Cart badge: 18px circle `--secondary` white 11px numeral, offset top-right. | Header search / account / cart |
| **11. Floating WhatsApp** | 60px circle, `#25D366`, white glyph, `--shadow-lg`, fixed `right 24px bottom 24px`, z 50. | All pages |

Quantity stepper: three joined boxes `[ – | 1 | + ]`, 36px tall, `1px --border-strong`, radius `--r-md` on outer corners, centered DM Sans 16.

---

## 6. Form elements

| Element | Spec |
|---|---|
| Input / select / textarea | height 52px (textarea 120px min); bg `#FFFFFF` at 70% (`rgba(255,255,255,.7)`); `1px solid --border`; radius `--r-md`; padding `0 16px`; DM Sans 15 `--text`; placeholder `--text-muted`. Focus: border `--gold-600` + `0 0 0 3px rgba(201,148,74,.18)`. Error: border `--danger`, helper text 12px `--danger`. |
| Label | DM Sans 14/500 `--text-strong`, 8px above field; required `*` in `--danger`. Contact page uses floating-placeholder style for first row ("Full Name*") — either is OK, be consistent per form. |
| Phone | Country prefix segment `+91 ▾` fused to input (shared border, divider line). |
| Select | Custom chevron (Lucide `ChevronDown`, `--text-muted`). |
| Newsletter combo | Input + brown button joined: input left radius only, button right radius only, same height (48px). |
| Privacy note | 12px `--text-muted` with lock icon: "We respect your privacy. Your information is safe with us." |

---

## 7. Components

### 7.1 Announcement bar
- Height 40px, bg `--announce-bg`, text `#F7EFE3` DM Sans 13/500.
- 4 items with small gold icons, separated by `|` (40% opacity): **Free Shipping on all orders · COD Available · Razorpay Secure Payments · Shiprocket Shipping** (About page variant uses "Ships within 24 hours").
- Mobile: auto-scrolling marquee (pause on hover / `prefers-reduced-motion`).

### 7.2 Header / navigation
- Height 96px desktop (72px sticky-compact on scroll), bg `--bg-soft` with `--shadow-xs` once scrolled.
- Left: logo (height 52px). Center: nav links Caslon Text 15 `--text-strong`, 40px gap. Right: search, account, cart icons (24px, 24px gap).
- **Nav items (canonical):** Home · About ManushyaM · **Solutions ▾** · Ingredients · Blogs & Reviews · FAQ · Contact Us
  - **[Deck note]** Every slide overlays "Solutions" on the dropdown — it **replaces "Shop for the Pain"**.
  - Solutions dropdown: Men Anti-Hairfall Therapy · Women Anti-Hairfall Therapy · Men Anti-Hairfall Combo · Women Anti-Hairfall Combo (+ "Shop by Concern" list).
- Active link: color `--text-gold` + 2px underline `--gold-600`, 8px below text, full text width.
- Hover: color `--text-gold`, underline grows from center.
- Dropdown panel: `--surface`, `--r-lg`, `--shadow-md`, 8px item padding, items Caslon 15.
- Mobile (<1024): hamburger left, logo center, cart right; full-height drawer on `--bg` with nav in Caslon 22 and gold hairline separators.

### 7.3 Footer (product/blog/contact variant — canonical)
- bg `--surface` (#F7EFE3) with botanical sprig bottom-right.
- 5 columns: **Brand** (logo, 3-line blurb "Ayurvedic anti-hairfall therapy for men and women. Rooted in ancient wisdom. Powered by nature.", social icons as 36px brown circles with white glyphs: Instagram, Facebook, YouTube, Pinterest) · **Shop** (All Products, Men's Range, Women's Range, Combos, Best Sellers) · **Customer Care** (FAQ, Shipping & Delivery, Returns & Refunds, Track Order, Contact Us) · **Company** (About ManushyaM, Our Ingredients, Blogs & Reviews, Privacy Policy, Terms & Conditions) · **Stay Connected** (input+Subscribe, then trust pill box: 100% Ayurvedic · Made in India · Cruelty Free).
- Column titles Caslon 16/500 `--text-strong`; links DM Sans 14 `--text-muted`, hover `--text-gold`; active link `--primary`.
- Bottom bar (hairline top border): © 2025 ManushyaM Wellness Pvt. Ltd. All rights reserved. · payment logos (VISA, Mastercard, RuPay, UPI in white 40×26 rounded tiles) · "Secure payments powered by Razorpay".
- Home page uses a compact variant: "STAY CONNECTED" eyebrow + input + gold "JOIN" button + social icons, then single-row links.

### 7.4 Product card (listing / "You May Also Like")
- bg `--bg-soft`, `1px --border`, `--r-lg`, overflow hidden.
- Image area 4:3 on cream, product photographed on cream/stone with botanicals.
- Title Caslon 18/500 centered, price Caslon 18/600 `--text-strong`, small brown "Add to Cart" button (variant 3, 14px, padding 8px 24px) centered, 16px bottom padding.
- Carousel: 3-up desktop, 2-up tablet, 1.2-up mobile (peek), brown circle arrows outside edges.

### 7.5 Bestseller feature card (home)
- Split card overlapping the hero bottom by ~120px: image left (55%), content right on `--surface`.
- Badge "BESTSELLER" (badge style, `1px --border-strong`, `--r-sm`), title h2, body, price (Caslon 28), gold text-arrow CTA.

### 7.6 Feature / trust strip
- One rounded card (`--r-lg`) containing 4–5 columns with vertical hairlines: icon-in-circle, title (DM Sans 15/500 or Caslon 18), subtitle (body-sm muted).
- Home: 8 Medicinal Herbs · 4 Nourishing Oils · Chemical Free · 100% Ayurvedic.
- Product page trust row: Razorpay Secure Payments · COD Available · Shiprocket Shipping · GST Invoice Available + "✓ Trusted by 10,000+ customers across India".

### 7.7 Rating badge
- Inline pill: `4.8 ★ | on Amazon & Flipkart [a] [F]`, `1px --border-gold`, `--r-md`, 8px 16px, DM Sans 18 for number, star `--star`.

### 7.8 Tabs (product detail)
- Row of tabs with leading line icons: Description · Benefits · Ingredients · How to Use · Shipping & COD · FAQ.
- Caslon 16; inactive `--text-muted`; active `--text-strong` + 3px bottom bar `--secondary`; full-width hairline under row.
- Tab panel inside `--r-lg` card. Description tab has right-side "free-from" grid (3×2): Ayurvedic & Natural, Paraben Free, Sulfate Free, Silicone Free, Cruelty Free, For All Hair Types — icon circles + 12px labels.

### 7.9 Product gallery
- Vertical thumbnail rail (5 visible, 88×96, `--r-md`, active `2px --primary` border) with chevron up/down; main image `--r-lg` with "🔍 Zoom" chip bottom-right (white pill, `--shadow-sm`).
- Mobile: main image swiper with dots, thumbnails hidden.

### 7.10 Blog components
- **Category sidebar**: card with "Categories" heading; items Caslon 15 with hairline separators; active item = brown filled pill (`--secondary`, white text, `--r-md`).
- **Featured article**: split card, image left, right: tag badge, h2 title, excerpt, author avatar + name, meta "May 20, 2025 • 6 min read", brown "Read More →".
- **Article card**: image top (4:3), tag badge, Caslon 20 title, 3-line excerpt, meta, outline "Read More →" full width.
- **Reviews sidebar**: "What People Love About ManushyaM", big "4.8 ★" (Caslon 48), marketplace logos, review snippets (gold 5-stars, italic-free quote 14px, "— Priya S."), "See All Reviews →".
- "Reviews Coming Soon" band with wheat ornaments.

### 7.11 Contact cards
- 2×N grid of `--r-lg` cards: icon (gold line, WhatsApp in brand green), title Caslon 17, subtitle muted, value DM Sans 15 `--text-strong`, trailing gold chevron. Whole card is a link.

### 7.12 Testimonial strip (home)
- Large gold `“` glyph (Caslon 96, `--primary`), quote Caslon 20 `--text-strong`, right side 5 gold stars, name eyebrow ("ANANYA S."), "Verified Customer" caption.

### 7.13 Ritual steps
- 3 steps in one card: numbered circle (32px, `1px --primary`, Caslon 16 gold) + gold line illustration + uppercase step name (DM Sans 15/600 .14em) + 2-line description. APPLY → NOURISH → RINSE.

### 7.14 Dark "How it works" panel
- `--surface-dark` panel, `--r-xl`, inner 1px gold glow border. 3 numbered (gold circle badges) follicle illustrations joined by gold arrows; right column of 4 benefit rows (gold icon circle, gold Caslon 16 title, ivory 13 description).

### 7.15 Badges / tags
- `--r-sm`, `1px --border-strong`, bg `--bg-soft`, DM Sans 11/600 UPPERCASE .12em, `--text-strong`. Examples: BESTSELLER, HAIR FALL GUIDE, PRODUCT EDUCATION.

### 7.16 Hero carousel dots
- 8px dots, 12px gap; active `--gold-500`, inactive `#FFFFFF` 85%. Bottom-right inside hero frame.

---

## 8. Page-by-page blueprint

### 8.0 Intro loader (Slide 1) — **[Deck note]**
- Page takes ~3s to load; during that time show a full-screen `--bg` (or cocoa) splash with the **ManushyaM logo animation** (reference: dribbble "maxew logo animation").
- The **"S/h" (H) of ManushyaM must be prominent** in the loop — e.g. sprout mark draws in (stroke-dashoffset), letters fade up staggered, the gold H/sprout pulses/glows.
- At ~3–4s the logo **scales down and travels to the header logo position (top-left)** while the home page fades in (FLIP / shared-layout animation).
- Show once per session (`sessionStorage`), skip with `prefers-reduced-motion` (simple fade).

### 8.1 Home (Slide 2)
1. Announcement bar → Header.
2. **Hero carousel** (dark, ~720px desktop, full-bleed inside gold hairline frame, `--r-xl`): 3 slides — woman with hair (“Rooted in Ritual.”), man (“Rooted in Ritual.” / "Natural DHT Blocker"), woman scalp-massage (“Stronger Roots. Happier You.”). Left: display-xl ivory headline, body-lg subcopy, Primary Gold CTA "SHOP THERAPY →", underline link "OUR PHILOSOPHY". Right: portrait photography on dark warm vignette. Dots bottom-right. Autoplay 6s, crossfade + slight Ken Burns.
   - **[Deck note]** Hero subline: **"Fix falling hairs after 3rd application"** (overlaid on slides as the replacement subcopy).
3. Bestseller split card (overlaps hero).
4. Feature strip (4 items).
5. Philosophy split: copper-pot image left, "OUR PHILOSOPHY" eyebrow, h2 "Conscious. Creative. Caring.", body, "LEARN MORE →".
6. The ManushyaM Ritual (3 steps).
7. Testimonial strip.
8. Footer.

### 8.2 About ManushyaM (Slide 3)
1. Parchment hero panel (`--grad-cream`, `--r-xl`, botanical corners): sprout ornament, eyebrow "OUR PHILOSOPHY", display-lg "About Manushyam", lotus divider, body ("ManushyaM is curatively prepared using a 5000-year-old KASHAYAM Ayurvedic process…"), buttons "Shop Men →" "Shop Women →" (Gold Small). Right: copper-pot image in arched frame with gold border.
2. Our Story: image left (jute pouch), eyebrow "OUR STORY", h2 "Rooted in Ayurveda. Inspired by Nature.", divider, two paragraphs.
3. Why ManushyaM: 5 icon columns with hairlines (Rooted in Ayurveda, Pure Ingredients, Mindful Formulation, Scalp & Hair Wellbeing, Conscious & Caring).
4. Our Promise panel: eyebrow, h2 "Conscious. Creative. Caring.", check list (4), product lineup image on stone plinth right.
5. Legacy band: `--cocoa-950` with gold botanical line art, centered Caslon quote "At ManushyaM, we don't just create therapies. We preserve a legacy of healing, and share it with you."

### 8.3 How it Works & Ingredients (Slide 4)
1. Dark "How ManushyaM™ Works" panel ("For reduced hair fall in just 1 oil shot.", "EXPLORE THE SCIENCE →").
2. DHT BLOCKER section: Oswald heading, gold Caslon subtitle, body, 4 icon features; right card "HOW DHT AFFECTS HAIR FOLLICLES" before/after illustrations.
3. Shop by Concern: 6 cards (Hair Fall For Men, Hair Fall For Women, Weak Roots, Thinning Hair, Dandruff & Itchy Scalp, Complete Hair Fall Routine) — line illustration, Caslon title, muted 3-line text, brown "SHOP NOW →".
4. Ingredients for Reduced Hair Fall: "3 Powerful Extracts" (Korean Ginseng, Indian Bhringaraj, Curcumin) | "4 Nourishing Oils" (Jojoba, Tea Tree, Peppermint, Sesame Seed) in circular cream image wells; "Key Support Ingredients" row (Onion Seed, Bakuchiol, Biotin, Vitamin D, Pumpkin Seed Extract, Folic Acid & Pygeum Extract).
5. Footer (this slide shows a 4-col variant + dark copyright bar "Rooted in Nature. Backed by Science." — use the canonical footer from 7.3, keep the dark bar as an option).
- **[Deck note]** This slide's header uses an older nav (Shop/Science/Concerns/About) — **use the canonical nav** in 7.2.

### 8.4 Product Detail Pages (Slides 5–8)
Same template for: **Men Anti-Hairfall Therapy ₹499**, **Women Anti-Hairfall Therapy ₹599**, **Men Anti-Hairfall Combo ₹799**, **Women Anti-Hairfall Combo ₹899**.
1. Breadcrumb (DM Sans 14, `>` separators, current page muted).
2. Two columns (gallery 55% / info 45%): thumbnail rail + main image | h1 title, price, rating badge, description, 5 leaf-bullet benefits, hairline, Quantity stepper, **Add to Cart (brown) + Buy Now (green)** side by side equal width, trust row, trusted-by line.
3. Tabs card (7.8).
4. "You May Also Like" carousel (other 3 products).
5. Footer + floating WhatsApp.
- Mobile: sticky bottom bar with price + Add to Cart + Buy Now.

### 8.5 Blogs & Reviews (Slide 9)
1. Cream hero: display-lg "Blogs & Reviews", subtitle "Ayurvedic wisdom, real results.", body, rating badge, 4 small icon badges (Ayurvedic Time-Tested, Backed by Ayurveda, Real People Real Results, Honest & Helpful); product still-life right.
2. 3-column body: left sidebar (Categories, Stay Updated newsletter, trust icons) · center (Featured Article, All Articles 4-up grid, Load More) · right sidebar (reviews summary).
3. "Reviews Coming Soon" band. Footer.

### 8.6 Contact Us / Payment (Slide 10)
- **[Deck note]** Slide is titled "Payment page" but the mockup shows **Contact Us**. Build Contact Us from it and confirm the payment/checkout design with the owner (until then, style checkout with these same tokens: form 7.x left, order summary card right, Razorpay trust row).
- Contact layout: cream hero ("Contact Us" + product lineup), two cards side-by-side — "Send Us a Message" form (Full Name, Email, Phone +91, Subject select, Message, brown "Send Message ✈", privacy note) and "We're Here to Help" contact grid (WhatsApp Support, Email Support care@manushyam.com, Business Address, Order Support, Collaboration Queries hello@manushyam.com); logistics trust strip (Shiprocket, Razorpay, COD, GST Invoice); "Quick Answers" chips; "Still have questions?" promo panel with "Chat on WhatsApp".

---

## 9. Imagery & iconography

- **Photography**: warm, low-key studio light; deep brown/black backdrops for people (hero); cream/stone/jute/botanical props for products (hibiscus, daisy, coffee-like seeds, wooden pieces, stone plinth). Color-grade toward amber; never cool/blue.
- Product images: transparent or cream background, consistent 3/4 light from left.
- Formats: AVIF/WebP with JPEG fallback; hero ≤ 250KB; `loading="lazy"` except hero LCP image (`fetchpriority="high"`).
- **Icons**: thin line icons, 1.5px stroke, rounded caps, color `--gold-600` (on cream) or `--gold-500` (on dark). Lucide is the base set (`Search`, `User`, `ShoppingBag`/`ShoppingCart`, `Leaf`, `Droplet`, `Sprout`, `ShieldCheck`, `Truck`, `Lock`, `ChevronDown`, `MoveRight`). Custom SVGs for Ayurvedic illustrations (mortar & pestle, copper pot, follicle, oil drop with hand).
- Logo: `ManushyaM` wordmark green `#016133` + gold sprout mark `#BA932D`. On dark backgrounds use an all-ivory or gold+ivory version. Minimum width 120px; clear space = height of the sprout mark.

---

## 10. Motion

| Pattern | Spec |
|---|---|
| Easing | `--ease-out: cubic-bezier(.2,.7,.2,1)`; `--ease-in-out: cubic-bezier(.65,0,.35,1)` |
| Durations | micro 150ms · UI 250ms · reveal 600ms · hero 900ms |
| Scroll reveal | fade-up 24px, 600ms, stagger 80ms per child; once only |
| Hero | crossfade 900ms + scale 1.04→1 over 6s |
| Buttons | arrow nudge 4px; gold CTA shadow grow |
| Cards | lift 2px + border to gold |
| Nav underline | scaleX 0→1 from center, 250ms |
| Loader | see 8.0 |
| Reduced motion | respect `prefers-reduced-motion: reduce` → disable parallax, autoplay, Ken Burns, loader animation |

---

## 11. Accessibility

- Body text contrast ≥ 4.5:1 (all tokens above pass on `--bg`); gold text only via `--text-gold`.
- White on `--primary` gold = 4.1:1 → the CTA text is uppercase 16px/500 with gradient darkening toward `#8E5A1C`; **do not** go lighter than `--primary` for button backgrounds.
- Focus ring on every interactive element (gold, 2px, offset 3px).
- Carousel: pause button / pause on hover & focus, `aria-roledescription="carousel"`, labelled dots.
- Hit targets ≥ 44×44 (icon buttons padded).
- All decorative ornaments `aria-hidden="true"`.
- Form fields have visible labels (placeholder alone is not a label).

---

## 12. Implementation tokens

### 12.1 CSS variables (drop into `FE/src/index.css`)
```css
:root {
  --font-display: "Libre Caslon Display", "Libre Caslon Text", Georgia, serif;
  --font-serif:   "Libre Caslon Text", "Cormorant Garamond", Georgia, serif;
  --font-sans:    "DM Sans", "Hanken Grotesk", system-ui, sans-serif;
  --font-poster:  "Oswald", "Bebas Neue", Impact, sans-serif;

  --cocoa-950:#140D07; --cocoa-900:#2A1608; --cocoa-800:#4E2C0C;
  --brown-700:#7A3A12; --brown-600:#8A481E;
  --gold-300:#E3C9A0; --gold-500:#C9944A; --gold-600:#A8722A; --gold-700:#8E5A1C;
  --green-800:#1E5C36;
  --cream-50:#FDF9F3; --cream-100:#FBF6EE; --cream-200:#F7EFE3; --cream-300:#F1E4D0;
  --sand-400:#E6D5BD; --ink-700:#4A3F36; --ink-500:#7A6C60;

  --r-sm:4px; --r-md:6px; --r-lg:12px; --r-xl:20px;
  --container:1240px;
  /* + semantic tokens from §1.2, shadows §3.2, gradients §1.4 */
}
body {
  background: var(--bg);
  color: var(--text);
  font: 400 16px/1.65 var(--font-sans);
  -webkit-font-smoothing: antialiased;
}
h1,h2,h3,h4 { font-family: var(--font-serif); color: var(--text-strong); font-weight: 500; }
```

### 12.2 Tailwind config (the stack in `features.txt` uses Tailwind 3)
```js
// tailwind.config.js
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    container: { center: true, padding: { DEFAULT: "16px", md: "20px", lg: "24px" }, screens: { xl: "1240px" } },
    extend: {
      colors: {
        cocoa: { 800: "#4E2C0C", 900: "#2A1608", 950: "#140D07" },
        brown: { 600: "#8A481E", 700: "#7A3A12", 800: "#62290A" },
        gold:  { 300: "#E3C9A0", 500: "#C9944A", 600: "#A8722A", 700: "#8E5A1C" },
        leaf:  { 800: "#1E5C36", 900: "#164A2B" },
        cream: { 50: "#FDF9F3", 100: "#FBF6EE", 200: "#F7EFE3", 300: "#F1E4D0" },
        sand:  { 400: "#E6D5BD", 500: "#D6BE98" },
        ink:   { 500: "#7A6C60", 700: "#4A3F36" },
        whatsapp: "#25D366",
      },
      fontFamily: {
        display: ['"Libre Caslon Display"', '"Libre Caslon Text"', "Georgia", "serif"],
        serif:   ['"Libre Caslon Text"', '"Cormorant Garamond"', "Georgia", "serif"],
        sans:    ['"DM Sans"', '"Hanken Grotesk"', "system-ui", "sans-serif"],
        poster:  ["Oswald", '"Bebas Neue"', "Impact", "sans-serif"],
      },
      fontSize: {
        "display-xl": ["5.5rem", { lineHeight: "1", letterSpacing: "-0.01em" }],
        "display-lg": ["4rem", { lineHeight: "1.05", letterSpacing: "-0.01em" }],
        eyebrow: ["0.8125rem", { lineHeight: "1", letterSpacing: "0.18em", fontWeight: "600" }],
      },
      borderRadius: { sm: "4px", md: "6px", lg: "12px", xl: "20px" },
      boxShadow: {
        xs: "0 1px 2px rgba(74,44,12,.06)",
        sm: "0 2px 8px rgba(74,44,12,.06), 0 1px 2px rgba(74,44,12,.04)",
        md: "0 8px 24px rgba(74,44,12,.08), 0 2px 6px rgba(74,44,12,.05)",
        lg: "0 20px 48px rgba(42,22,8,.14)",
        btn: "0 6px 16px rgba(142,90,28,.28)",
      },
      backgroundImage: {
        "grad-gold": "linear-gradient(180deg,#C9944A 0%,#A8722A 55%,#8E5A1C 100%)",
        "grad-hero": "radial-gradient(120% 90% at 75% 40%,#3A2414 0%,#140D07 60%)",
        "grad-cream": "linear-gradient(180deg,#FBF6EE 0%,#F4E8D6 100%)",
      },
      transitionTimingFunction: { brand: "cubic-bezier(.2,.7,.2,1)" },
    },
  },
};
```

### 12.3 Button classes (cva-ready)
```js
const button = cva(
  "inline-flex items-center justify-center gap-3 rounded-md min-h-[44px] transition-all duration-200 ease-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-gold-500 disabled:opacity-45 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        gold:    "bg-grad-gold text-white font-sans font-medium uppercase tracking-[0.16em] shadow-btn hover:brightness-95 active:translate-y-px",
        goldSm:  "bg-gold-600 text-white font-sans text-sm hover:bg-gold-700",
        brown:   "bg-brown-700 text-white font-serif text-lg hover:bg-brown-800",
        green:   "bg-leaf-800 text-white font-serif text-lg hover:bg-leaf-900",
        outline: "border border-sand-500 text-cocoa-900 font-serif hover:bg-cream-200 hover:border-gold-600",
        link:    "rounded-none min-h-0 px-0 pb-2 border-b border-current font-sans font-medium uppercase tracking-[0.18em] text-gold-700",
        icon:    "rounded-full w-10 h-10 min-h-0 bg-brown-700 text-white hover:scale-105",
      },
      size: { sm: "px-5 py-2.5 text-sm", md: "px-7 py-3.5", lg: "px-8 py-[18px] text-base" },
    },
    defaultVariants: { variant: "gold", size: "lg" },
  }
);
```

---

## 13. Open questions for the owner
1. **Payment / checkout page** — slide 10 is labelled "Payment page" but shows Contact Us. Need the real checkout mockup.
2. Confirm the exact heading font (mockup serif is closest to Libre Caslon; alternative: a licensed Canela/Ivy Presto).
3. Confirm hero subcopy: "Fix falling hairs after 3rd application" vs the per-slide sublines in the mockups.
4. FAQ and Ingredients pages exist in the nav but only the combined "How it works & Ingredients" mockup is provided — build FAQ from these tokens (accordion in `--r-lg` cards, Caslon questions, gold `+` icons).
