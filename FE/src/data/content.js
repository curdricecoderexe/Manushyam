import { ICONS } from "../components/ui/icon-paths";

// Storefront copy from the design canvas. Catalogue data (products, FAQs, policies, hero slides)
// comes from the API; this file holds the fixed marketing content around it.

export const AUDIENCE_LABELS = { men: "For Men", women: "For Women", unisex: "For Everyone" };
export const TYPE_LABELS = { therapy: "Therapy (single)", combo: "Combo kits", oil: "Hair oil", shampoo: "Shampoo" };
export const CONCERN_LABELS = {
  "hair-fall": "Hair fall",
  "weak-roots": "Weak roots",
  thinning: "Thinning hair",
  dandruff: "Dandruff & itchy scalp",
  dht: "DHT-related hair loss",
};
export const SORT_OPTIONS = [
  ["recommended", "Recommended"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["newest", "Newest"],
  ["popular", "Best sellers"],
];
export const FREE_FROM_LABELS = {
  ayurvedic: "Ayurvedic & Natural",
  paraben: "Paraben Free",
  sulfate: "Sulfate Free",
  silicone: "Silicone Free",
  cruelty: "Cruelty Free",
  "all-hair-types": "For All Hair Types",
};

export const HOME_FEATURES = [
  { title: "8 Medicinal Herbs", sub: "Potent & Pure", icon: ICONS.herbs },
  { title: "4 Nourishing Oils", sub: "Deeply Restorative", icon: ICONS.drop },
  { title: "Chemical Free", sub: "Safe & Gentle", icon: ICONS.leafSprig },
  { title: "100% Ayurvedic", sub: "Rooted in Tradition", icon: ICONS.mortar },
];

export const RITUAL_STEPS = [
  { n: 1, title: "Apply", sub: "Massage gently into scalp & roots.", icon: "M24 6s4 5 4 8a4 4 0 0 1-8 0c0-3 4-8 4-8zM6 34c6-6 12-6 18-4l10 3c2 .6 2 3 0 3.5L24 38M6 34l6 8M14 40l20-2c3 0 6-2 8-4" },
  { n: 2, title: "Nourish", sub: "Leave on for 30–60 minutes.", icon: "M24 6s3 4 3 6a3 3 0 0 1-6 0c0-2 3-6 3-6zM8 26h32c0 9-7 14-16 14S8 35 8 26zM16 44h16" },
  { n: 3, title: "Rinse", sub: "Wash with a mild, natural cleanser.", icon: "M14 42V14a8 8 0 0 1 16 0v4M24 18h12v4H24zM26 28v2M30 28v2M34 28v2M26 34v2M30 34v2M34 34v2" },
];

export const TESTIMONIAL = { quote: "After just a few weeks, my hair feels stronger, fall has reduced and the shine is incredible.", name: "Ananya S." };

export const PRODUCT_TRUST = [
  { label: "Razorpay Secure Payments", icon: ICONS.lock },
  { label: "COD Available", icon: ICONS.cash },
  { label: "Shiprocket Shipping", icon: ICONS.truck },
  { label: "GST Invoice Available", icon: ICONS.invoice },
];

export const WHY_MANUSHYAM = [
  { title: "Rooted in Ayurveda", sub: "Inspired by ancient wisdom, proven by time.", icon: ICONS.mortar },
  { title: "Pure Ingredients", sub: "Handpicked herbs and nourishing oils of the highest quality.", icon: ICONS.sprout },
  { title: "Mindful Formulation", sub: "Crafted in small batches with care and intention.", icon: ICONS.drop },
  { title: "Scalp & Hair Wellbeing", sub: "Therapies that nurture balance, strength and natural beauty.", icon: ICONS.hairStrand },
  { title: "Conscious & Caring", sub: "We blend tradition with thoughtful innovation.", icon: ICONS.globe },
];

export const PROMISES = ["Ethically sourced ingredients", "Sustainable & eco-friendly practices", "Transparent & honest formulations", "Care — for you, your hair and our planet"];

// How it Works & Ingredients page (slide 4).
export const HOW_IT_WORKS_STEPS = [
  { n: 1, title: "Healthy Hair", sub: "Strong hair with optimal nutrition at the root.", ring: "#C9944A", dot: "#E9B860" },
  { n: 2, title: "Weak Hair Shaft", sub: "Nutrients deplete over time, leading to weak, brittle hair.", ring: "#8E5A1C", dot: "#7A5A30" },
  { n: 3, title: "Replenished with ManushyaM™", sub: "Bio-actives nourish deeply and help reduce hair fall.", ring: "#C9944A", dot: "#8BC34A" },
];

export const HOW_IT_WORKS_BENEFITS = [
  { title: "Deep Nourishment", sub: "Nourishes the root where it matters most.", icon: ICONS.drop },
  { title: "Strengthens from Within", sub: "Strengthens hair from the root to the shaft.", icon: ICONS.shield },
  { title: "Reduces Hair Fall", sub: "Helps reduce hair fall from the 3rd application.", icon: ICONS.fallingHair },
  { title: "Powered by Nature", sub: "Unique blend of Ayurvedic bio-actives & natural oils.", icon: ICONS.leafSprig },
];

export const DHT_FEATURES = [
  { title: "Helps reduce DHT stress on follicles", sub: "Supports the scalp’s natural defence.", icon: ICONS.shieldPlus },
  { title: "Supports stronger-looking roots", sub: "Nourishes roots for resilience.", icon: ICONS.roots },
  { title: "Promotes a healthier scalp", sub: "Helps maintain scalp balance.", icon: ICONS.scalp },
  { title: "Adaptogenic botanical support", sub: "Helps the scalp adapt to daily stressors.", icon: ICONS.herbs },
];

export const SHOP_BY_CONCERN = [
  { title: "Hair Fall\nFor Men", sub: "Reduce hair fall & boost strength with Ayurvedic care for men.", to: "/solutions?for=men&concern=hair-fall", icon: "M12 3a5 5 0 0 1 5 5v1a5 5 0 0 1-10 0V8a5 5 0 0 1 5-5zM7 7c2-2 8-2 10 0M4 22c1-4 4-7 8-7s7 3 8 7" },
  { title: "Hair Fall\nFor Women", sub: "Control hair fall & nourish naturally for stronger hair.", to: "/solutions?for=women&concern=hair-fall", icon: "M12 3a5 5 0 0 1 5 5v2a5 5 0 0 1-10 0V8a5 5 0 0 1 5-5zM7 8c-1 6-2 9-3 12M17 8c1 6 2 9 3 12" },
  { title: "Weak\nRoots", sub: "Strengthen roots & improve scalp health from within.", to: "/solutions?concern=weak-roots", icon: "M12 2v9M12 11l-6 9M12 11l6 9M12 14l-2 8M12 14l2 8M8 6l4 2 4-2" },
  { title: "Thinning\nHair", sub: "Improve density & reduce thinning with herbal actives.", to: "/solutions?concern=thinning", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 8v8M12 7v10M15 8v8" },
  { title: "Dandruff &\nItchy Scalp", sub: "Soothe scalp irritation & fight dandruff effectively.", to: "/solutions?concern=dandruff", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 10h.01M12 8h.01M16 11h.01M10 14h.01M14 15h.01M12 12v8" },
  { title: "Complete Hair\nFall Routine", sub: "Complete Ayurvedic routine for total hair care.", to: "/solutions?type=combo", icon: "M6 8h4v13H6zM7 4h2v4H7zM13 11h5v10h-5zM14 8h3v3h-3z" },
];

const LEAF = "M12 2c5 3 7 8 5 13-1 3-3 5-5 7-2-2-4-4-5-7-2-5 0-10 5-13zM12 6v16";
export const EXTRACTS = [
  { name: "Korean Ginseng Extract", sub: "The best alternative to DHT blocker comes from Ginseng.", fill: "#E8C99A", stroke: "#8E5A1C", icon: "M12 3c2 3 2 6 0 9-1 3 1 6 3 9M12 12c-2 2-4 4-6 9M12 12c-1 3-1 6 0 9" },
  { name: "Indian Bhringaraj Extract", sub: "Eclipta improves circulation to the scalp, with anti-inflammatory properties.", fill: "#7CB342", stroke: "#2F5A2A", icon: LEAF },
  { name: "Curcumin Extract", sub: "Turmeric extract nourishes hair and acts as a synergistic booster.", fill: "#F5A623", stroke: "#B8650F", icon: "M4 17c3-6 6-9 9-10s5 0 6 2-1 4-4 5-7 2-11 3zM9 13l3-3M13 12l2-2" },
];
export const OILS = [
  { name: "Jojoba Oil", fill: "#6FA84A", icon: LEAF },
  { name: "Tea Tree Oil", fill: "#4E8A3A", icon: "M12 22V3M12 7l-5-3M12 7l5-3M12 11l-6-3M12 11l6-3M12 15l-6-3M12 15l6-3" },
  { name: "Peppermint Oil", fill: "#7CB342", icon: "M12 3c4 2 6 6 4 10-1 2-2 3-4 4-2-1-3-2-4-4-2-4 0-8 4-10zM12 7v14M5 10c2 0 4 2 5 5M19 10c-2 0-4 2-5 5" },
  { name: "Sesame Seed Oil", fill: "#E8D3A8", icon: "M7 8a2 3 0 1 0 0 .1zM12 6a2 3 0 1 0 0 .1zM17 9a2 3 0 1 0 0 .1zM9 15a2 3 0 1 0 0 .1zM15 16a2 3 0 1 0 0 .1z" },
];
export const SUPPORT_INGREDIENTS = [
  { k: "On", name: "Onion Seed", sub: "Rich in sulphur & flavonoids; helps strengthen roots.", tint: "#F3D9D3" },
  { k: "Bk", name: "Bakuchiol", sub: "Retinol alternative that supports stronger roots.", tint: "#E3DAF2" },
  { k: "B7", name: "Biotin", sub: "Supports keratin production for stronger hair.", tint: "#EFE3D1" },
  { k: "D", name: "Vitamin D", sub: "Supports healthy hair follicles & the hair cycle.", tint: "#FBE7B5" },
  { k: "Pk", name: "Pumpkin Seed Extract", sub: "Rich in nutrients that support scalp health.", tint: "#DDE8C8" },
  { k: "Fa", name: "Folic Acid & Pygeum", sub: "Supports healthy cell turnover and scalp vitality.", tint: "#EAD3C0" },
];

export const FAQ_TOPICS = [
  ["product", "Product & Results"],
  ["orders", "Orders & Shipping"],
  ["payments", "Payments & COD"],
  ["returns", "Returns & Refunds"],
  ["account", "Account"],
];
