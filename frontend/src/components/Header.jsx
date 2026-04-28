import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../context/useAuth";

const USER_NAV_ITEMS = [
  { path: "/", label: "训练" },
  { path: "/profile", label: "画像" },
  { path: "/knowledge", label: "知识库" },
  { path: "/graph", label: "图谱" },
  { path: "/history", label: "历史" },
];

const ADMIN_NAV_ITEMS = [
  { path: "/admin/users", label: "用户" },
  { path: "/admin/content", label: "内容" },
  { path: "/admin/settings", label: "设置" },
];

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, isAuthenticated, logout } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((current) => (current === "dark" ? "light" : "dark"));
  const isActive = (path) => location.pathname === path;
  const navItems = isAuthenticated
    ? [
        ...USER_NAV_ITEMS,
        ...(currentUser?.role === "admin" ? ADMIN_NAV_ITEMS : []),
      ]
    : [];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-bg/70 backdrop-blur-2xl supports-[backdrop-filter]:bg-bg/58">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
        <button
          className="group flex items-center gap-3 rounded-full bg-transparent text-left"
          onClick={() => navigate(isAuthenticated ? "/" : "/login")}
          type="button"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-surface shadow-[0_10px_30px_rgba(2,8,23,0.16)] group-hover:-translate-y-0.5">
            <img src="/logo.png" alt="TechSpar" className="h-6 w-6 object-contain" />
          </span>
          <span className="leading-none">
            <span className="block text-base font-bold tracking-tight text-text">TechSpar</span>
            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Interview OS</span>
          </span>
        </button>

        <nav className="hidden items-center gap-1 rounded-full border border-border bg-surface/72 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:flex">
          {navItems.map(({ path, label }) => (
            <button
              key={path}
              className={`rounded-full px-3.5 py-2 text-sm font-medium ${
                isActive(path)
                  ? "bg-card text-text shadow-[0_10px_24px_rgba(2,8,23,0.14)]"
                  : "bg-transparent text-dim hover:bg-hover hover:text-text"
              }`}
              onClick={() => navigate(path)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {isAuthenticated ? (
            <>
              <button
                className="flex items-center gap-3 rounded-full border border-border bg-surface px-3 py-2 text-left hover:bg-hover"
                onClick={() => navigate("/profile")}
                type="button"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/12 text-xs font-bold text-accent-light">
                  {(currentUser?.display_name || currentUser?.username || "U").slice(0, 1).toUpperCase()}
                </span>
                <span className="max-w-[140px] leading-tight">
                  <span className="block truncate text-sm font-semibold text-text">{currentUser?.display_name || currentUser?.username}</span>
                  <span className="block text-xs text-muted">{currentUser?.role === "admin" ? "管理员" : "学习者"}</span>
                </span>
              </button>
              <button className="ts-btn ts-btn-secondary min-h-10 px-4 py-2 text-sm" onClick={handleLogout} type="button">
                退出
              </button>
            </>
          ) : location.pathname !== "/login" ? (
            <button className="ts-btn ts-btn-primary min-h-10 px-5 py-2 text-sm" onClick={() => navigate("/login")} type="button">
              登录
            </button>
          ) : null}
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-base hover:bg-hover"
            onClick={toggleTheme}
            title={theme === "dark" ? "切换亮色" : "切换暗色"}
            type="button"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <button className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface" onClick={toggleTheme} type="button">
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="菜单"
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="absolute left-3 right-3 top-[calc(100%+8px)] z-50 flex flex-col overflow-hidden rounded-3xl border border-border bg-card/96 py-2 shadow-[0_24px_60px_rgba(2,8,23,0.30)] backdrop-blur-2xl md:hidden">
          {navItems.map(({ path, label }) => (
            <button
              key={path}
              className={`mx-2 rounded-2xl px-4 py-3 text-left text-sm font-medium ${
                isActive(path) ? "bg-hover text-text" : "text-dim hover:bg-hover hover:text-text"
              }`}
              onClick={() => navigate(path)}
              type="button"
            >
              {label}
            </button>
          ))}
          <div className="mx-4 my-2 h-px bg-border" />
          {isAuthenticated ? (
            <button className="mx-2 rounded-2xl px-4 py-3 text-left text-sm text-dim hover:bg-hover hover:text-text" onClick={handleLogout} type="button">
              退出登录
            </button>
          ) : (
            <button className="mx-2 rounded-2xl px-4 py-3 text-left text-sm text-dim hover:bg-hover hover:text-text" onClick={() => navigate("/login")} type="button">
              去登录
            </button>
          )}
        </nav>
      )}
    </header>
  );
}
