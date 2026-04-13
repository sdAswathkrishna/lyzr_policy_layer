import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lyzr Policy Layer",
  description: "IAM-style policy enforcement for Lyzr agents",
};

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/flow", label: "Agent Flow" },
  { href: "/policies", label: "Policies" },
  { href: "/chat", label: "Chat" },
  { href: "/audit", label: "Audit Log" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-8 shadow-sm">
          <span className="font-bold text-lg text-indigo-700">Lyzr Policy Layer</span>
          <span className="text-xs text-gray-400 border border-gray-200 rounded px-2 py-0.5">
            POC — integrated with Lyzr APIs
          </span>
          <div className="flex gap-6 ml-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-gray-600 hover:text-indigo-700 font-medium transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
        <main className="px-8 py-6 max-w-7xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
