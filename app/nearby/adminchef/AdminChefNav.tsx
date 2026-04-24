"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { label: "Dashboard", href: "/nearby/adminchef" },
  { label: "Groups", href: "/nearby/adminchef/groups" },
  { label: "Users", href: "/nearby/adminchef/users" },
  { label: "Spots", href: "/nearby/adminchef/spots" },
];

export default function AdminChefNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-2 border-b border-gray-200">
      {nav.map((item) => {
        const active = pathname === item.href || (item.href !== "/nearby/adminchef" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${active ? "bg-white border-x border-t border-gray-200 -mb-px" : "text-gray-500 hover:text-black"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
