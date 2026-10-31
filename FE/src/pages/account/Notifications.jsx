import { useNavigate } from "react-router";
import { Card, Skeleton } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { useNotifications } from "../../components/notifications/useNotifications";
import { formatDateTime } from "../../lib/orders";
import { cn } from "../../lib/cn";

export default function Notifications() {
  const { notifications, unreadCount, loaded, error, markRead, markAllRead } = useNotifications({ limit: 50 });
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[26px]">Notifications</h2>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            Mark all as read
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-danger-600">
          {error}
        </p>
      )}
      {!loaded && !error ? (
        <Skeleton className="h-48" />
      ) : notifications.length === 0 ? (
        <Card className="p-8 text-center">You’re all caught up. Order, payment and support updates will appear here.</Card>
      ) : (
        <Card as="ul" className="divide-y divide-sand-400 p-0">
          {notifications.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  markRead(n.id);
                  if (n.link) navigate(n.link);
                }}
                className={cn("flex w-full gap-3 px-5 py-4 text-left hover:bg-cream-200", !n.read && "bg-[#FBF3E6]")}
              >
                <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-gold-600")} aria-hidden="true" />
                <span className="flex flex-col gap-0.5">
                  <span className={cn(n.read ? "text-ink-700" : "font-semibold text-cocoa-900")}>
                    {n.title}
                    {!n.read && <span className="sr-only"> (unread)</span>}
                  </span>
                  {n.body && <span className="text-sm text-ink-500">{n.body}</span>}
                  <span className="text-xs text-ink-500">{formatDateTime(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </Card>
      )}
    </div>
  );
}
