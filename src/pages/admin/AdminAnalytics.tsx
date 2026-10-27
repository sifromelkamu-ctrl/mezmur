import { BarChart3 } from "lucide-react";
import AdminComingSoon from "../../components/admin/AdminComingSoon";
import AdminLayout from "../../components/admin/AdminLayout";

export default function AdminAnalytics() {
  return (
    <AdminLayout title="Analytics">
      <AdminComingSoon
        icon={BarChart3}
        title="Analytics"
        today="Each track has a running playCount — the Overview dashboard's Popular Songs tile already ranks by it today."
        needed="Trends over time (plays per day, listener growth, skip rate) need a real event table — one row per play with a timestamp — which doesn't exist yet. playCount is just a counter, it doesn't say when those plays happened."
      />
    </AdminLayout>
  );
}
