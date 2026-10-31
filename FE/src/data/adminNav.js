import { LayoutGrid, ShoppingBag, Package, Users, Ticket, Truck, Image, PenLine, Star, BarChart3, Activity, MessageSquare, Inbox, Settings } from "lucide-react";

// `staff: true` items are visible to the staff role; everything else is admin-only (also enforced on the server).
export const ADMIN_NAV = [
  { group: "Overview", items: [{ to: "/admin", label: "Dashboard", icon: LayoutGrid, staff: true, end: true }] },
  {
    group: "Commerce",
    items: [
      { to: "/admin/orders", label: "Orders", icon: ShoppingBag, staff: true },
      { to: "/admin/products", label: "Inventory", icon: Package, staff: true },
      { to: "/admin/users", label: "Users", icon: Users },
      { to: "/admin/coupons", label: "Coupons", icon: Ticket },
      { to: "/admin/delivery", label: "Delivery & PIN codes", icon: Truck },
    ],
  },
  {
    group: "Content",
    items: [
      { to: "/admin/content", label: "Homepage & FAQ", icon: Image },
      { to: "/admin/blog", label: "Blog", icon: PenLine },
      { to: "/admin/reviews", label: "Reviews", icon: Star },
    ],
  },
  {
    group: "Insights",
    items: [
      { to: "/admin/analytics", label: "Sales analytics", icon: BarChart3 },
      { to: "/admin/web-analytics", label: "Web analytics & cookies", icon: Activity },
    ],
  },
  {
    group: "Support",
    items: [
      { to: "/admin/support", label: "Support desk", icon: MessageSquare, staff: true },
      { to: "/admin/inbox", label: "Inbox", icon: Inbox, staff: true },
    ],
  },
  { group: "System", items: [{ to: "/admin/settings", label: "Settings & audit log", icon: Settings }] },
];

export function navForRole(role) {
  return ADMIN_NAV.map((g) => ({ ...g, items: g.items.filter((i) => role === "admin" || i.staff) })).filter((g) => g.items.length);
}
