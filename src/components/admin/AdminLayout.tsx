import { useState, type ReactNode } from "react";
import { useAuth } from "../../context/useAuth";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";

interface AdminLayoutProps {
  title: string;
  children: ReactNode;
}

// Shared shell for every /admin/* page — admin-role gate (same check every
// existing admin page already does, user?.role === "admin", just centralized
// once here instead of re-implemented per page), sidebar + topbar, and the
// .admin-scope wrapper that gives this whole section its own design tokens
// (see index.css) distinct from the listener app. Not a router-level layout
// route (this codebase's routes are flat, not nested — see App.tsx) — each
// admin page just renders <AdminLayout title="...">...</AdminLayout> around
// its own content, same shape as every other page in this app.
export default function AdminLayout({ title, children }: AdminLayoutProps) {
  const { user, loading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="admin-scope fixed inset-0 bg-base flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="admin-scope fixed inset-0 bg-base flex items-center justify-center px-6">
        <p className="text-fg-muted text-sm">You don't have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="admin-scope fixed inset-0 bg-base flex text-fg">
      {/* Desktop sidebar — a fixed-width column that pushes content over,
          collapsing to icon-only rather than disappearing. */}
      <aside
        className={`hidden lg:block shrink-0 border-r border-border bg-panel transition-[width] duration-200 ${
          collapsed ? "w-[68px]" : "w-60"
        }`}
      >
        <AdminSidebar collapsed={collapsed} />
      </aside>

      {/* Mobile sidebar — off-canvas overlay, full nav (never collapsed),
          since there's no room to permanently reserve on a phone screen. */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 max-w-[80vw] h-full bg-panel border-r border-border">
            <AdminSidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <AdminTopbar
          title={title}
          user={user}
          onToggleMobileSidebar={() => setMobileOpen(true)}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((v) => !v)}
        />
        <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
