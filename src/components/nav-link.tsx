"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui";

export function NavLink({
  href,
  children,
  badge,
  compact,
}: {
  href: string;
  children: ReactNode;
  badge?: number;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center justify-between gap-2 rounded-sm text-sm transition-colors",
        compact ? "shrink-0 px-3 py-1.5" : "px-3 py-1.5",
        active ? "bg-stamp-wash font-medium text-stamp" : "text-ink-soft hover:bg-paper hover:text-ink",
      )}
    >
      <span>{children}</span>
      {badge ? (
        <span className="num rounded-sm bg-amber-wash px-1.5 text-xs font-medium text-amber">{badge}</span>
      ) : null}
    </Link>
  );
}
