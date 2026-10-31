// Main navigation. "Solutions" replaces "Shop for the Pain" per the design deck.
export const NAV_ITEMS = [
  { key: "home", label: "Home", to: "/" },
  { key: "about", label: "About ManushyaM", to: "/about" },
  { key: "solutions", label: "Solutions", to: "/solutions", hasMenu: true },
  { key: "ingredients", label: "Ingredients", to: "/ingredients" },
  { key: "blog", label: "Blogs & Reviews", to: "/blog" },
  { key: "faq", label: "FAQ", to: "/faq" },
  { key: "contact", label: "Contact Us", to: "/contact" },
];

export const ANNOUNCEMENTS = [
  { icon: "truck", text: "Free Shipping on all orders" },
  { icon: "cash", text: "COD Available" },
  { icon: "lock", text: "Razorpay Secure Payments" },
  { icon: "box", text: "Shiprocket Shipping" },
];

export const CONTACT = {
  whatsapp: "917829600018",
  whatsappDisplay: "+91 78296 00018",
  careEmail: "care@manushyam.com",
  helloEmail: "hello@manushyam.com",
};

export const FOOTER_LINKS = [
  {
    title: "Shop",
    links: [
      { label: "All Products", to: "/solutions" },
      { label: "Men’s Range", to: "/solutions?for=men" },
      { label: "Women’s Range", to: "/solutions?for=women" },
      { label: "Combos", to: "/solutions?type=combo" },
      { label: "Best Sellers", to: "/solutions?sort=popular" },
    ],
  },
  {
    title: "Customer Care",
    links: [
      { label: "FAQ", to: "/faq" },
      { label: "Shipping & Delivery", to: "/policies/shipping" },
      { label: "Returns & Refunds", to: "/policies/returns" },
      { label: "Track Order", to: "/track-order" },
      { label: "Contact Us", to: "/contact" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About ManushyaM", to: "/about" },
      { label: "Our Ingredients", to: "/ingredients" },
      { label: "Blogs & Reviews", to: "/blog" },
      { label: "Privacy Policy", to: "/policies/privacy" },
      { label: "Terms & Conditions", to: "/policies/terms" },
    ],
  },
];
