import { Activity } from "lucide-react";
import AdminComingSoon from "../../components/admin/AdminComingSoon";
import AdminLayout from "../../components/admin/AdminLayout";

export default function AdminSystemHealth() {
  return (
    <AdminLayout title="System Health">
      <AdminComingSoon
        icon={Activity}
        title="System Health"
        today="The API has a live /api/health endpoint, and a background job (jobs/youtubeCookieHealth.ts) already probes YouTube import health every 6 hours and pushes you a notification the moment it breaks or recovers — you don't need this page to find out something's wrong today."
        needed="A dedicated page here would poll /api/health and expose that same cookie-health state (last check time, ok/blocked) visually instead of only via push notification — straightforward, just not built yet."
      />
    </AdminLayout>
  );
}
