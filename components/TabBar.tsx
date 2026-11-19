"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBulb, IconClasses, IconMoments, IconProfile } from "./icons";

const TABS = [
  { href: "/app", label: "Classes", icon: <IconClasses />, match: (p: string) => p === "/app" || p.startsWith("/app/class") || p.startsWith("/app/lecture") },
  { href: "/app/moments", label: "My moments", icon: <IconMoments />, match: (p: string) => p.startsWith("/app/moments") },
  { href: "/app/study", label: "Study", icon: <IconBulb />, match: (p: string) => p.startsWith("/app/study") },
  { href: "/app/profile", label: "Profile", icon: <IconProfile />, match: (p: string) => p.startsWith("/app/profile") },
];

export default function TabBar() {
  const path = usePathname();
  return (
    <div className="tabbar">
      <nav aria-label="Main">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={t.match(path) ? "on" : ""} aria-current={t.match(path) ? "page" : undefined}>
            {t.icon}
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
