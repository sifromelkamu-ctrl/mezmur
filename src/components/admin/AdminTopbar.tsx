import { ExternalLink, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import type { ApiUser } from "../../lib/api";

interface AdminTopbarProps {
  title: string;
  user: ApiUser | null;
  onToggleMobileSidebar: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export default function AdminTopbar({ title, user, onToggleMobileSidebar, collapsed, onToggleCollapsed }: AdminTopbarProps) {
  const { mode, setMode } = useTheme();

  return (
    <header className="h-14 shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 border-b border-border bg-elevated/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onToggleMobileSidebar}
          className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-colors shrink-0"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
        <button
          onClick={onToggleCollapsed}
          className="hidden lg:flex w-8 h-8 rounded-lg items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-colors shrink-0"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
        <h1 className="text-[15px] font-semibold text-fg truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* On the shared listener-app domain (no VITE_LISTENER_APP_URL set),
            "/#/" is the listener app's own Home — same origin, same tab
            state. On the standalone admin site, there is no listener app on
            this origin, so that build sets VITE_LISTENER_APP_URL to its
            full external URL instead. */}
        <a
          href={import.meta.env.VITE_LISTENER_APP_URL || "/#/"}
          className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-fg-muted hover:text-fg px-2.5 py-1.5 rounded-lg hover:bg-hover transition-colors"
        >
          Back to app
          <ExternalLink size={12} />
        </a>
        <button
          onClick={() => setMode(mode === "dark" ? "light" : "dark")}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-colors"
          aria-label="Toggle theme"
        >
          {mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <div className="flex items-center gap-2 pl-2 border-l border-border">
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
            style={{ background: "var(--color-brand)", color: "#fff" }}
          >
            {(user?.name || user?.email || "A").charAt(0).toUpperCase()}
          </span>
          <span className="hidden sm:block text-xs font-medium text-fg truncate max-w-[140px]">
            {user?.name || user?.email || "Admin"}
          </span>
        </div>
      </div>
    </header>
  );
}
