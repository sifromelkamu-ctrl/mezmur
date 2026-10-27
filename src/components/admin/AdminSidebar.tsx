import {
  Activity,
  BarChart3,
  Disc3,
  Image,
  LayoutDashboard,
  ListMusic,
  Settings,
  ShieldCheck,
  Ticket,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router-dom";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  // true when the destination is today's best real match (an existing page
  // that actually covers this, even if not purpose-built for it — e.g.
  // Artists/Albums & Singles/Concerts all point at the one Library
  // Management page today). false/omitted for a genuinely new page this
  // admin shell introduces, or a coming-soon explainer.
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Every entry here resolves to something real — either a page that already
// existed (Library Management, Submissions, User Access, Youtube Catalog
// Import), a new page this admin shell adds (Overview, Audit Log), or a
// coming-soon explainer that's honest about what's missing rather than a
// dead link or a fake interactive screen. Several Workspace items share one
// destination (Library Management) on purpose — that page already covers
// catalog/artists/albums/concerts in one place, so pointing each at its own
// not-yet-built page would be pretending they're more separate than they are.
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", to: "/admin", icon: LayoutDashboard },
      { label: "Music Catalog", to: "/admin/library", icon: ListMusic },
      { label: "Artists", to: "/admin/library", icon: Users },
      { label: "Albums & Singles", to: "/admin/library", icon: Disc3 },
      { label: "Concerts", to: "/admin/library", icon: Ticket },
      { label: "Artwork Studio", to: "/admin/artwork-studio", icon: Image },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Import Center", to: "/admin/youtube-catalog-import", icon: Upload },
      { label: "Review & Publishing", to: "/admin/submissions", icon: ShieldCheck },
      { label: "Users & Roles", to: "/admin/user-access", icon: Users },
      { label: "Analytics", to: "/admin/analytics", icon: BarChart3 },
      { label: "System Health", to: "/admin/system-health", icon: Activity },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Audit Log", to: "/admin/audit-log", icon: ListMusic },
      { label: "Settings", to: "/settings", icon: Settings },
    ],
  },
];

interface AdminSidebarProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

export default function AdminSidebar({ collapsed, onNavigate }: AdminSidebarProps) {
  return (
    <nav className="flex flex-col gap-5 py-5 overflow-y-auto h-full">
      <div className={`px-4 ${collapsed ? "px-0 flex justify-center" : ""}`}>
        <div className="flex items-center gap-2.5">
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm"
            style={{ background: "var(--color-brand)", color: "#fff" }}
          >
            M
          </span>
          {!collapsed && (
            <span className="font-semibold text-[15px] tracking-tight text-fg">Mezmur Admin</span>
          )}
        </div>
      </div>

      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="px-2.5">
          {!collapsed && (
            <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
              {group.label}
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.to === "/admin"}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                    collapsed ? "justify-center" : ""
                  } ${isActive ? "bg-brand/12 text-brand" : "text-fg-muted hover:text-fg hover:bg-hover"}`
                }
              >
                <item.icon size={17} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
