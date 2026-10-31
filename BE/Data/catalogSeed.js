// Launch catalogue and storefront content, taken from the design deck/canvas copy.
// Images are served by the storefront from FE/public/images until Cloudinary uploads replace them.
// Policy wording is a starting point — have it reviewed before go-live (PLAN.md go-live checklist).

const ALL_FREE_FROM = ["ayurvedic", "paraben", "sulfate", "silicone", "cruelty", "all-hair-types"];
const INGREDIENTS = {
  extracts: ["Korean Ginseng", "Indian Bhringaraj", "Curcumin"],
  oils: ["Jojoba", "Tea Tree", "Peppermint", "Sesame Seed"],
  support: ["Onion Seed", "Bakuchiol", "Biotin", "Vitamin D", "Pumpkin Seed Extract", "Folic Acid & Pygeum Extract"],
};
const HOW_TO_USE = [
  "Apply — part your hair and massage the oil gently into the scalp and roots.",
  "Nourish — leave it on for 30–60 minutes, or overnight.",
  "Rinse — wash with ManushyaM Anti-Hairfall Shampoo or a mild, natural cleanser. Use 2–3 times a week.",
];
const COMMON_FAQS = [
  { q: "When will I see results?", a: "Most customers notice reduced hair fall after the 3rd application. For best results, follow the ritual 2–3 times a week for at least 8 weeks." },
  { q: "Is it safe for coloured hair?", a: "Yes. The formula is paraben, sulfate and silicone free. Do a patch test if your scalp is sensitive." },
];
const img = (file, alt) => ({ url: `/images/products/${file}`, alt });

const products = [
  {
    slug: "men-anti-hairfall-therapy",
    name: "Men Anti-Hairfall Therapy",
    tagline: "Natural DHT blocker",
    summary: "Shampoo + Men Hair Oil · 100 ml each",
    description: [
      "The Men Anti-Hairfall Therapy by ManushyaM includes Anti-Hairfall Shampoo (100 ml) and Men Hair Oil (100 ml), formulated with powerful Ayurvedic herbs and natural actives.",
      "This potent combination helps reduce hair fall, strengthens roots, nourishes the scalp, and promotes healthy hair growth.",
      "Regular use leads to visibly stronger, thicker, and healthier hair.",
    ],
    audience: "men",
    type: "therapy",
    concerns: ["hair-fall", "dht", "weak-roots"],
    badges: ["Bestseller"],
    images: [
      img("pdp-men-therapy.jpg", "Men Anti-Hairfall Shampoo and Men Hair Oil with hibiscus on a stone"),
      img("bestseller-pack.jpg", "ManushyaM Anti-Hairfall Shampoo, therapy kit box and two oil bottles"),
      img("lineup-plinth.jpg", "ManushyaM shampoo, therapy box and oil bottles on a stone plinth"),
    ],
    variants: [{ sku: "MM-MEN-THERAPY", label: "Shampoo 100 ml + Men Hair Oil 100 ml", price: 49900, stock: 120, isDefault: true, weightGrams: 260 }],
    benefits: ["Strengthens hair roots", "Reduces hair fall & breakage", "Nourishes scalp & prevents dandruff", "Made with Ayurvedic actives", "Suitable for all hair types"],
    ingredients: INGREDIENTS,
    howToUse: HOW_TO_USE,
    freeFrom: ALL_FREE_FROM,
    faqs: [...COMMON_FAQS, { q: "Can women use the men’s therapy?", a: "We recommend the Women range, which is tuned for women’s scalps." }],
    keywords: ["shampoo", "hair oil", "ginseng", "dht blocker", "hairfall", "men"],
    sortOrder: 1,
    popularity: 100,
  },
  {
    slug: "women-anti-hairfall-therapy",
    name: "Women Anti-Hairfall Therapy",
    tagline: "Scalp nourishment",
    summary: "Women Hair Oil · 100 ml",
    description: [
      "The Women Anti-Hairfall Therapy by ManushyaM is a Women Hair Oil (100 ml) prepared with the KASHAYAM Ayurvedic process.",
      "It nourishes the scalp, strengthens roots and improves hair texture, helping reduce hair fall naturally.",
    ],
    audience: "women",
    type: "therapy",
    concerns: ["hair-fall", "thinning", "dandruff"],
    badges: [],
    images: [
      img("pdp-women-therapy.jpg", "ManushyaM Women Hair Oil bottle with flowers"),
      img("lineup-plinth.jpg", "ManushyaM shampoo, therapy box and oil bottles on a stone plinth"),
    ],
    variants: [{ sku: "MM-WOMEN-THERAPY", label: "Women Hair Oil 100 ml", price: 59900, stock: 120, isDefault: true, weightGrams: 140 }],
    benefits: ["Nourishes the scalp", "Reduces hair fall", "Improves hair texture", "Made with Ayurvedic actives", "Suitable for all hair types"],
    ingredients: INGREDIENTS,
    howToUse: HOW_TO_USE,
    freeFrom: ALL_FREE_FROM,
    faqs: COMMON_FAQS,
    keywords: ["hair oil", "bhringaraj", "hairfall", "women", "scalp"],
    sortOrder: 2,
    popularity: 80,
  },
  {
    slug: "men-anti-hairfall-combo",
    name: "Men Anti-Hairfall Combo",
    tagline: "Complete men’s routine",
    summary: "Shampoo + Oil + Jute pouch",
    description: [
      "The complete men’s ritual: ManushyaM Anti-Hairfall Shampoo and Men Hair Oil, packed in a reusable jute pouch.",
      "Cleanse, nourish and strengthen from the root with the KASHAYAM Ayurvedic process.",
    ],
    audience: "men",
    type: "combo",
    concerns: ["hair-fall", "dht", "weak-roots", "thinning"],
    badges: ["Combo"],
    images: [
      img("pdp-men-combo.jpg", "Men Anti-Hairfall Combo with shampoo, oil and jute pouch"),
      img("bestseller-pack.jpg", "ManushyaM Anti-Hairfall Shampoo, therapy kit box and two oil bottles"),
    ],
    variants: [{ sku: "MM-MEN-COMBO", label: "Shampoo + Men Hair Oil + Jute pouch", price: 79900, stock: 80, isDefault: true, weightGrams: 420 }],
    benefits: ["Complete cleanse-and-nourish routine", "Natural DHT blocker with Ginseng", "Strengthens roots", "Reusable jute pouch", "Suitable for all hair types"],
    ingredients: INGREDIENTS,
    howToUse: HOW_TO_USE,
    freeFrom: ALL_FREE_FROM,
    faqs: COMMON_FAQS,
    keywords: ["combo", "kit", "shampoo", "hair oil", "ginseng", "men"],
    sortOrder: 3,
    popularity: 60,
  },
  {
    slug: "women-anti-hairfall-combo",
    name: "Women Anti-Hairfall Combo",
    tagline: "Complete women’s routine",
    summary: "Therapy kit + Oils + Jute pouch",
    description: [
      "The complete women’s ritual: the therapy kit with nourishing oils, packed in a reusable jute pouch.",
      "Nourish the scalp, strengthen roots and improve texture with the KASHAYAM Ayurvedic process.",
    ],
    audience: "women",
    type: "combo",
    concerns: ["hair-fall", "thinning", "dandruff", "weak-roots"],
    badges: ["Combo"],
    images: [
      img("pdp-women-combo.jpg", "Women Anti-Hairfall Combo with oils and jute pouch"),
      img("lineup-plinth.jpg", "ManushyaM shampoo, therapy box and oil bottles on a stone plinth"),
    ],
    variants: [{ sku: "MM-WOMEN-COMBO", label: "Therapy kit + Oils + Jute pouch", price: 89900, stock: 80, isDefault: true, weightGrams: 460 }],
    benefits: ["Complete scalp-care routine", "Reduces hair fall", "Improves hair texture", "Reusable jute pouch", "Suitable for all hair types"],
    ingredients: INGREDIENTS,
    howToUse: HOW_TO_USE,
    freeFrom: ALL_FREE_FROM,
    faqs: COMMON_FAQS,
    keywords: ["combo", "kit", "hair oil", "women", "scalp"],
    sortOrder: 4,
    popularity: 50,
  },
].map((p) => ({ ...p, status: "published" }));

const heroSlides = [
  {
    eyebrow: "Fix falling hairs after 3rd application",
    title: "Rooted in\nRitual.",
    subtitle: "Ayurvedic anti-hair-fall therapy for stronger, healthier hair.",
    image: { url: "/images/content/hero-woman-hair.jpg", alt: "Smiling woman with thick, glossy dark hair" },
    cta: { label: "Shop Therapy", href: "/solutions" },
    secondaryCta: { label: "Our Philosophy", href: "/about" },
    sortOrder: 1,
  },
  {
    eyebrow: "Fix falling hairs after 3rd application",
    title: "Rooted in\nRitual.",
    subtitle: "Natural DHT Blocker — Ginseng-powered therapy for men.",
    image: { url: "/images/content/hero-man.jpg", alt: "Smiling man with full, thick hair" },
    cta: { label: "Shop Men", href: "/solutions?for=men" },
    secondaryCta: { label: "Our Philosophy", href: "/about" },
    sortOrder: 2,
  },
  {
    eyebrow: "Fix falling hairs after 3rd application",
    title: "Stronger Roots.\nHappier You.",
    subtitle: "Ayurvedic anti-hair-fall therapy for healthier, fuller-looking hair.",
    image: { url: "/images/content/hero-woman-scalp.jpg", alt: "Woman massaging oil into her scalp" },
    imagePosition: "center top",
    cta: { label: "Shop Women", href: "/solutions?for=women" },
    secondaryCta: { label: "Our Philosophy", href: "/about" },
    sortOrder: 3,
  },
];

const faqs = [
  ["product", "When will I see results?", "Most customers notice reduced hair fall after the 3rd application. For best results, follow the ritual 2–3 times a week for at least 8 weeks."],
  ["product", "Is it suitable for all hair types?", "Yes. The therapies are formulated for all hair types and are paraben, sulfate and silicone free."],
  ["product", "Can I use it on coloured or chemically treated hair?", "Yes. The formula is gentle and free from harsh chemicals. Do a patch test if your scalp is sensitive."],
  ["product", "What is the KASHAYAM process?", "A 5000-year-old Ayurvedic decoction method where herbs are slow-simmered in oils so their actives are carried deep into the scalp."],
  ["product", "What is the difference between Men and Women therapies?", "The Men range adds Ginseng as a natural DHT blocker; the Women range focuses on scalp nourishment and texture."],
  ["orders", "How long does delivery take?", "Orders ship within 24 hours via Shiprocket. Metro cities usually receive them in 2–4 days, other locations in 4–7 days."],
  ["orders", "Is shipping free?", "Yes, shipping is free on all orders."],
  ["orders", "How do I track my order?", "Use Track Order in the footer or open My Account › Orders. You will also get tracking links by email."],
  ["payments", "Is Cash on Delivery available?", "Yes, on serviceable PIN codes. We confirm COD orders with a one-time code to prevent fake orders."],
  ["payments", "Which payment methods do you accept?", "UPI, cards, net banking and wallets through Razorpay, plus Cash on Delivery."],
  ["payments", "Will I get a GST invoice?", "Yes. A GST invoice is emailed when your order is delivered and is available in My Account."],
  ["returns", "Can I cancel my order?", "You can cancel from My Account until the order is packed."],
  ["returns", "What if my product arrives damaged?", "Contact us within 48 hours of delivery with photos and we will replace it or refund you."],
  ["returns", "How long do refunds take?", "Prepaid refunds go back to the original method in 5–7 working days. COD refunds are sent to your UPI or bank account."],
  ["account", "Why do I get a code when I sign in?", "Every sign-in can be protected with a one-time code sent to your email, for your security."],
  ["account", "How do I delete my account?", "Go to My Account › Privacy and choose Delete account. Order records required for GST are anonymised."],
].map(([topic, question, answer], i) => ({ topic, question, answer, sortOrder: i }));

const pages = [
  {
    slug: "shipping",
    title: "Shipping & Delivery",
    sections: [
      { heading: "Dispatch", body: "Orders are packed and handed to our Shiprocket courier partners within 24 hours on working days." },
      { heading: "Delivery timelines", body: "Metro cities: 2–4 working days. Rest of India: 4–7 working days. Remote PIN codes may take longer." },
      { heading: "Shipping charges", body: "Shipping is free on all orders. Any Cash on Delivery handling fee is shown at checkout before you place your order." },
      { heading: "Tracking", body: "You will receive a tracking link by email and can follow every step in My Account › Orders." },
    ],
  },
  {
    slug: "returns",
    title: "Returns & Refunds",
    sections: [
      { heading: "Damaged or wrong items", body: "Report within 48 hours of delivery with photos of the package and product. We will replace or refund." },
      { heading: "Opened products", body: "For hygiene reasons, opened personal-care products cannot be returned unless defective." },
      { heading: "Refund timelines", body: "Prepaid: 5–7 working days to the original method. COD: to your UPI ID or bank account within 7 working days." },
    ],
  },
  {
    slug: "cancellation",
    title: "Cancellation Policy",
    sections: [
      { heading: "Before packing", body: "Cancel instantly from My Account until your order is marked Packed." },
      { heading: "After dispatch", body: "Once shipped, refuse the delivery or contact support; refunds follow the Returns policy." },
    ],
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    summary: "How ManushyaM collects, uses and protects your personal data under India’s Digital Personal Data Protection Act, 2023.",
    sections: [
      { heading: "Who we are", body: "ManushyaM Wellness Pvt. Ltd. (“ManushyaM”, “we”) runs manushyam.com and is the Data Fiduciary for the personal data described here. Questions or requests: care@manushyam.com." },
      { heading: "What we collect", body: "Account details (name, email, mobile number, password stored only as a secure hash); delivery addresses; orders, invoices and payment status; reviews, support chats and messages you send us; newsletter preference. If you allow analytics cookies, we also record pages viewed, clicks, approximate device type, browser, traffic source and page-speed measurements, linked to a random browser ID — not to your name or account." },
      { heading: "Why we use it", body: "To create and secure your account, deliver and support your orders, issue GST invoices, answer your messages, send emails you asked for, prevent fraud, and — only with your consent — understand how the site is used so we can improve it. We never sell your data." },
      { heading: "Who we share it with", body: "Only what each partner needs: Razorpay (payments — we never see your full card or UPI details), Shiprocket and its courier partners (delivery name, phone and address), our email provider (transactional emails) and our cloud hosting providers in India. Authorities only where the law requires it." },
      { heading: "Cookies & analytics", body: "Essential cookies keep you signed in, protect forms and remember your cart; they are always on. Analytics cookies are optional and off until you accept them. Change your choice anytime with “Cookie settings” at the bottom of every page — withdrawing consent is as easy as giving it." },
      { heading: "How long we keep it", body: "Account data: until you delete your account. Orders and invoices: 8 years, as GST law requires (anonymised if you delete your account). Raw analytics: 90 days, after which only daily totals remain. Records of your cookie choices: 13 months." },
      { heading: "Your rights (DPDP Act 2023)", body: "You can access and download your data, correct it, withdraw consent, and erase your account from My Account › Privacy & data, or by emailing care@manushyam.com. You may also nominate someone to exercise these rights for you, and raise a grievance with us; if it isn’t resolved, you can complain to the Data Protection Board of India." },
      { heading: "Security", body: "Data is encrypted in transit, passwords are hashed, staff access is role-based and every staff change is audit-logged. If a breach affects you, we will tell you and the Data Protection Board as the law requires." },
      { heading: "Grievance officer", body: "Email care@manushyam.com with the subject “Privacy”. We reply within 7 days and resolve requests within 30 days." },
      { heading: "Changes", body: "We will post any change here with a new date, and ask for your cookie consent again if what we collect changes. Last updated: October 2026." },
    ],
  },
  {
    slug: "terms",
    title: "Terms & Conditions",
    sections: [
      { heading: "Use of the site", body: "By using manushyam.com you agree to these terms and to our policies." },
      { heading: "Pricing", body: "Prices are in INR and inclusive of GST. We may correct pricing errors before dispatch." },
      { heading: "Product information", body: "Our products are Ayurvedic cosmetics and are not intended to diagnose or treat any disease." },
    ],
  },
].map((p, i) => ({ ...p, kind: "policy", sortOrder: i }));

const settings = {
  announcements: ["Free Shipping on all orders", "COD Available", "Razorpay Secure Payments", "Shiprocket Shipping"],
  heroSubline: "Fix falling hairs after 3rd application",
  rating: { value: 4.8, source: "on Amazon & Flipkart" },
  trustedBy: "Trusted by 10,000+ customers across India",
};

module.exports = { products, heroSlides, faqs, pages, settings };
