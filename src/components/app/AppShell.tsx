import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CandlestickChart, Sparkles, Wallet, GraduationCap, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/nexxtrade-logo.png.asset.json";

const NAV = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/trades", label: "Trades", icon: CandlestickChart },
  { to: "/ai", label: "AI", icon: Sparkles },
  { to: "/assets", label: "Assets", icon: Wallet },
  { to: "/resources", label: "Resources", icon: GraduationCap },
] as const;

export function AppShell({
  children,
  title,
  subtitle,
  action,
}: {
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto min-h-screen max-w-xl bg-background pb-28 sm:border-x sm:border-border">
        <header className="glass sticky top-0 z-30 border-b border-border/70 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {title ? (
                <h1 className="truncate text-[28px] font-bold leading-tight tracking-tight">{title}</h1>
              ) : (
                <Link to="/dashboard" className="flex items-center gap-2">
                  <img src={logo.url} alt="NexxTrade" className="h-7 w-7" />
                  <span className="font-display text-lg font-bold">NexxTrade</span>
                </Link>
              )}
              {subtitle && (
                <p className="mt-1 text-sm leading-snug text-muted-foreground">{subtitle}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {action}
              <Link
                to="/profile"
                aria-label="Notifications and profile"
                className="relative grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-foreground transition hover:bg-muted"
              >
                <Bell className="h-4.5 w-4.5" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
              </Link>
            </div>
          </div>
        </header>

        <main className="space-y-4 px-5 py-5">{children}</main>

        <nav className="glass fixed bottom-0 left-1/2 z-40 w-full max-w-xl -translate-x-1/2 border-t border-border pb-[env(safe-area-inset-bottom)]">
          <ul className="grid grid-cols-5">
            {NAV.map((item) => {
              const active = pathname === item.to || pathname.startsWith(item.to + "/");
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition",
                      active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_var(--primary)]")} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

export function Panel({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("card-soft rounded-[20px] border border-border bg-card p-5", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-bold tracking-tight">{children}</h2>;
}

export function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "up" | "down";
}) {
  return (
    <div className="text-center">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-base font-semibold text-tabular",
          tone === "up" && "text-primary",
          tone === "down" && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function Sparkline({
  points,
  className,
  tone = "up",
}: {
  points: number[];
  className?: string;
  tone?: "up" | "down";
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 100;
  const h = 40;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p - min) / span) * (h - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const stroke = tone === "up" ? "var(--primary)" : "var(--destructive)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-16 w-full", className)}>
      <defs>
        <linearGradient id={`spark-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${coords.join(" ")} ${w},${h}`} fill={`url(#spark-${tone})`} />
      <polyline points={coords.join(" ")} fill="none" stroke={stroke} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
