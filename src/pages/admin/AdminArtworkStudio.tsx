import { Image } from "lucide-react";
import AdminComingSoon from "../../components/admin/AdminComingSoon";
import AdminLayout from "../../components/admin/AdminLayout";

export default function AdminArtworkStudio() {
  return (
    <AdminLayout title="Artwork Studio">
      <AdminComingSoon
        icon={Image}
        title="Artwork Studio"
        today="Zoom, pan, crop, rotate, and flip already work — src/components/ArtworkEditor.tsx is a full editor with undo/redo and smart-crop, opened today from Library Management and the concert editor whenever you change an album, artist, or concert's cover."
        needed="A dedicated browsing page here would just need a catalog grid wired to that same editor — no new editing logic, only a new page that lists everything with an art-change button."
      />
    </AdminLayout>
  );
}
