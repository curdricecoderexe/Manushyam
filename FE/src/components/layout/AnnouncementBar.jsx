import { Truck, Banknote, Lock, Package } from "lucide-react";
import { ANNOUNCEMENTS } from "../../data/site";

const ICONS = { truck: Truck, cash: Banknote, lock: Lock, box: Package };

export function AnnouncementBar() {
  return (
    <div className="bg-cocoa-800 px-4 py-2.5 text-[13px] font-medium text-cream-200">
      <ul className="flex flex-wrap items-center justify-center gap-x-7 gap-y-1.5">
        {ANNOUNCEMENTS.map(({ icon, text }, i) => {
          const Icon = ICONS[icon];
          return (
            <li key={text} className="flex items-center gap-2">
              {i > 0 && <span className="mr-5 hidden opacity-35 sm:inline" aria-hidden="true">|</span>}
              <Icon className="h-4 w-4 text-gold-400" strokeWidth={1.7} aria-hidden="true" />
              {text}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
