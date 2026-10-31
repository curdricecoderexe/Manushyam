import heroMan from "../assets/content/hero-man.jpg";
import packShot from "../assets/products/bestseller-pack.jpg";
import potPour from "../assets/content/pot-pour.jpg";
import copperPot from "../assets/content/copper-pot.jpg";
import jutePouch from "../assets/content/jute-pouch.jpg";
import lineup from "../assets/products/lineup-plinth.jpg";
import blogHero from "../assets/content/blog-hero.jpg";
import contactLineup from "../assets/content/contact-lineup.jpg";

// Storefront images an admin can replace (keys mirror APPEARANCE_SLOTS in BE/Models/Content.js).
// `fallback` is the bundled image shown until an override is set, and again after a reset.
export const APPEARANCE_SLOTS = [
  { key: "authPanel", group: "Sign-in", label: "Sign-in & register panel", hint: "Tall, dark image; text sits on top", aspect: "3/4", fallback: { src: heroMan, alt: "" } },
  { key: "homeBestseller", group: "Home", label: "Bestseller card", hint: "Square-ish product shot", aspect: "1/1", fallback: { src: packShot, alt: "ManushyaM Anti-Hairfall Shampoo, therapy kit box and two oil bottles" } },
  { key: "homeRitual", group: "Home", label: "Ritual section", hint: "Portrait", aspect: "4/5", fallback: { src: potPour, alt: "Herbal oils pouring into a carved copper pot" } },
  { key: "aboutHero", group: "About", label: "About hero", hint: "Near square", aspect: "1/0.92", fallback: { src: copperPot, alt: "Herbal oils being poured into an engraved copper pot for the KASHAYAM process" } },
  { key: "aboutPouch", group: "About", label: "Jute pouch", hint: "Near square", aspect: "1.06/1", fallback: { src: jutePouch, alt: "ManushyaM jute pouch with daisies and sandalwood" } },
  { key: "aboutLineup", group: "About", label: "Product lineup", hint: "Wide", aspect: "16/9", fallback: { src: lineup, alt: "ManushyaM shampoo, therapy box and three oil bottles on a stone plinth with flowers" } },
  { key: "solutionsKit", group: "Solutions", label: "Combo kit banner", hint: "Wide", aspect: "16/9", fallback: { src: lineup, alt: "ManushyaM shampoo, therapy box and oil bottles on a stone plinth" } },
  { key: "blogHero", group: "Blog", label: "Blog hero", hint: "3:2 landscape", aspect: "3/2", fallback: { src: blogHero, alt: "ManushyaM shampoo and hair oil with a towel, flowers and a candle" } },
  { key: "contactHero", group: "Contact", label: "Contact hero", hint: "Wide landscape", aspect: "1.6/1", fallback: { src: contactLineup, alt: "ManushyaM shampoo, hair oil, jute pouch and therapy kit" } },
  { key: "contactPouch", group: "Contact", label: "Gift pouch", hint: "Landscape", aspect: "4/3", fallback: { src: jutePouch, alt: "" } },
];

export const SLOT_BY_KEY = Object.fromEntries(APPEARANCE_SLOTS.map((s) => [s.key, s]));
