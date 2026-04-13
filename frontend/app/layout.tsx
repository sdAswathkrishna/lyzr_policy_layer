"use client";

import "./globals.css";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  GitBranch,
  LayoutGrid,
  MessageSquare,
  Moon,
  ScrollText,
  Sun,
  Shield,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/flow", label: "Flow", icon: GitBranch },
  { href: "/policies", label: "Policies", icon: FileText },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/audit", label: "Audit Log", icon: ScrollText },
];

type ThemeMode = "light" | "dark";

function Sidebar({
  collapsed,
  onToggle,
  theme,
  onThemeToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
  theme: ThemeMode;
  onThemeToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className={`app-sidebar ${collapsed ? "collapsed" : ""}`}>
      {/* Top — workspace + collapse toggle */}
      <div className="sidebar-top">
        <div className="workspace-chip">
          <div className="workspace-avatar">
            <Shield size={13} strokeWidth={2} />
          </div>
          {!collapsed && (
            <div className="workspace-copy">
              <p className="workspace-title">Lyzr Policy</p>
              <p className="workspace-subtitle">Governance Gateway</p>
            </div>
          )}
        </div>
        <button
          className="icon-button"
          onClick={onToggle}
          title={collapsed ? "Expand" : "Collapse"}
          style={{ flexShrink: 0 }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {!collapsed && (
          <p
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              padding: "10px 10px 4px",
              margin: 0,
            }}
          >
            Navigation
          </p>
        )}
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${active ? "active" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                size={16}
                strokeWidth={active ? 2.2 : 1.8}
                style={{ flexShrink: 0, color: active ? "var(--text-primary)" : "var(--text-muted)" }}
              />
              {!collapsed && (
                <span style={{ color: active ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer — theme toggle */}
      <div className="sidebar-footer">
        <button
          className="theme-switch"
          onClick={onThemeToggle}
          title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          {theme === "light" ? (
            <Moon size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          ) : (
            <Sun size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          )}
          {!collapsed && (
            <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
          )}
        </button>
      </div>
    </aside>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("lyzr-theme");
    const storedSidebar = window.localStorage.getItem("lyzr-sidebar-collapsed");
    const nextTheme: ThemeMode = storedTheme === "dark" ? "dark" : "light";
    setTheme(nextTheme);
    setCollapsed(storedSidebar === "true");
    document.documentElement.dataset.theme = nextTheme;
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("lyzr-theme", theme);
  }, [theme, mounted]);

  useEffect(() => {
    window.localStorage.setItem("lyzr-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  const isFlowPage = pathname === "/flow";

  return (
    <html lang="en" data-theme={theme}>
      <head>
        <title>Lyzr Policy Gateway</title>
        <meta name="description" content="Governed access control for Lyzr agents" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bentham&family=Roboto:ital,wght@0,100..900;1,100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="app-shell" style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.1s" }}>
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          theme={theme}
          onThemeToggle={() => setTheme((v) => (v === "light" ? "dark" : "light"))}
        />
        <main className={`app-main ${isFlowPage ? "flow-main" : ""}`}>
          {children}
        </main>
      </body>
    </html>
  );
}
