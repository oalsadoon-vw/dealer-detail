"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const TABS = [
  { href: "/settings/organization", label: "Organization" },
  { href: "/settings/stores", label: "Stores" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/invites", label: "Invites" },
];

/**
 * Linear-style underline tabs for the Settings layout. Matches the visual
 * language of `<Tabs variant="underline">` but uses Next `<Link>` so each
 * tab is a real navigation target (preserves browser history + middle-
 * click behavior).
 */
export default function SettingsTabs() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="border-b border-line -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
      <div className="flex w-max sm:w-auto items-end gap-1 -mb-px">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                active
                  ? "text-fg-strong border-accent"
                  : "text-fg-muted hover:text-fg-strong border-transparent"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
