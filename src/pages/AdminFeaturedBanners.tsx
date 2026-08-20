import {
  ChevronLeft,
  GripVertical,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Search as SearchIcon,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import TextField from "../components/form/TextField";
import { useAuth } from "../context/useAuth";
import { adminFeaturedBannersApi, albumsApi, type ApiAlbum, type ApiFeaturedBannerAdmin } from "../lib/api";

// Settings -> Home Featured Banner. Reached only via that admin-gated link
// and enforced again server-side by /api/admin/featured-banners/* — see
// server/src/routes/adminFeaturedBanners.ts. This screen only ever creates
// FeaturedBanner rows that *reference* an existing album; it never creates,
// edits, or deletes the album itself (see AdminLibraryManagement for that).

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto overscroll-y-contain p-4"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-elevated rounded-2xl p-5 w-full max-w-md my-auto max-h-[85vh] overflow-y-auto overscroll-y-contain shadow-2xl">
        {children}
      </div>
    </div>,
    document.body
  );
}

function BannerThumb({ imageUrl, gradient }: { imageUrl?: string; gradient: [string, string] }) {
  return (
    <div
      className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-cover bg-center"
      style={{
        backgroundImage: imageUrl ? `url(${imageUrl})` : `linear-gradient(150deg, ${gradient[0]}, ${gradient[1]})`,
      }}
    />
  );
}

function AddBannerModal({ onClose, onAdded }: { onClose: () => void; onAdded: (banner: ApiFeaturedBannerAdmin) => void }) {
  const [albums, setAlbums] = useState<ApiAlbum[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    albumsApi
      .list()
      .then(setAlbums)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return albums;
    return albums.filter(
      (a) => a.title.toLowerCase().includes(q) || (a.artistName ?? "").toLowerCase().includes(q)
    );
  }, [albums, query]);

  const handlePick = async (album: ApiAlbum) => {
    setAddingId(album.id);
    try {
      const banner = await adminFeaturedBannersApi.create("album", album.id);
      onAdded(banner);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-fg">Feature an album</h3>
        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-hover" aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div className="relative mb-4">
        <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <TextField
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search albums"
          className="w-full pl-10 pr-4 py-2.5 text-sm"
        />
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-10 text-fg-muted">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-fg-muted text-center py-10">No albums found.</p>
      ) : (
        <div className="flex flex-col gap-1 max-h-80 overflow-y-auto overscroll-y-contain -mx-1 px-1">
          {filtered.map((album) => (
            <button
              key={album.id}
              onClick={() => handlePick(album)}
              disabled={addingId !== null}
              className="flex items-center gap-3 p-2 rounded-xl hover:bg-hover transition-colors text-left disabled:opacity-50"
            >
              <BannerThumb imageUrl={album.coverUrl} gradient={album.gradient} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{album.title}</p>
                <p className="text-xs text-fg-muted truncate">{album.artistName}</p>
              </div>
              {addingId === album.id && <Loader2 size={16} className="animate-spin shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </ModalShell>
  );
}

function EditBannerModal({
  banner,
  onClose,
  onSaved,
  onDeleted,
}: {
  banner: ApiFeaturedBannerAdmin;
  onClose: () => void;
  onSaved: (banner: ApiFeaturedBannerAdmin) => void;
  onDeleted: (id: string) => void;
}) {
  const [title, setTitle] = useState(banner.title ?? "");
  const [subtitle, setSubtitle] = useState(banner.subtitle ?? "");
  const [badgeText, setBadgeText] = useState(banner.badgeText ?? "");
  const [buttonText, setButtonText] = useState(banner.buttonText ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [current, setCurrent] = useState(banner);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await adminFeaturedBannersApi.update(banner.id, {
        title: title || null,
        subtitle: subtitle || null,
        badgeText: badgeText || null,
        buttonText: buttonText || null,
      });
      onSaved(updated);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleImagePick = async (file: File) => {
    setUploadingImage(true);
    try {
      const updated = await adminFeaturedBannersApi.uploadImage(banner.id, file);
      setCurrent(updated);
      onSaved(updated);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = async () => {
    setUploadingImage(true);
    try {
      const updated = await adminFeaturedBannersApi.removeImage(banner.id);
      setCurrent(updated);
      onSaved(updated);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await adminFeaturedBannersApi.remove(banner.id);
      onDeleted(banner.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (confirmDelete) {
    return (
      <ModalShell onClose={() => setConfirmDelete(false)}>
        <h3 className="text-base font-bold text-fg mb-1.5">Remove this banner?</h3>
        <p className="text-sm text-fg-muted mb-5">
          This only removes it from the Home carousel — the album itself is not affected.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirmDelete(false)}
            className="flex-1 py-2.5 rounded-full bg-elevated-hover text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={saving}
            className="flex-1 py-2.5 rounded-full bg-accent-red text-white text-sm font-semibold disabled:opacity-60"
          >
            {saving ? "Removing…" : "Remove"}
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-fg">Edit banner</h3>
        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-hover" aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="relative shrink-0">
          <BannerThumb imageUrl={current.resolvedImageUrl} gradient={current.gradient} />
          {uploadingImage && (
            <div className="absolute inset-0 rounded-xl bg-black/60 flex items-center justify-center">
              <Loader2 size={16} className="animate-spin text-white" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-glow"
          >
            <ImagePlus size={14} />
            {current.bannerImageUrl ? "Replace banner image" : "Upload banner image"}
          </button>
          {current.bannerImageUrl && (
            <button onClick={handleRemoveImage} className="text-xs font-semibold text-fg-muted hover:text-fg text-left">
              Remove (use album cover)
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImagePick(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <label className="block">
          <span className="text-xs font-semibold text-fg-muted">Banner Title</span>
          <TextField
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={current.resolvedTitle}
            className="w-full mt-1 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-fg-muted">Banner Subtitle</span>
          <TextField
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder={current.resolvedSubtitle}
            className="w-full mt-1 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-fg-muted">Badge Text</span>
          <TextField
            type="text"
            value={badgeText}
            onChange={(e) => setBadgeText(e.target.value)}
            placeholder="Featured"
            className="w-full mt-1 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-fg-muted">Button Text</span>
          <TextField
            type="text"
            value={buttonText}
            onChange={(e) => setButtonText(e.target.value)}
            placeholder="Play Now"
            className="w-full mt-1 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="flex gap-2 mt-5">
        <button
          onClick={() => setConfirmDelete(true)}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-elevated-hover text-accent-red shrink-0"
          aria-label="Remove banner"
        >
          <Trash2 size={16} />
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-2.5 rounded-full bg-brand text-black text-sm font-bold disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}

export default function AdminFeaturedBanners() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [banners, setBanners] = useState<ApiFeaturedBannerAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    adminFeaturedBannersApi
      .list()
      .then(setBanners)
      .finally(() => setLoading(false));
  }, [isAdmin]);

  const editingBanner = banners.find((b) => b.id === editingId) ?? null;

  const handleToggleEnabled = async (banner: ApiFeaturedBannerAdmin) => {
    setBusyId(banner.id);
    try {
      const updated = await adminFeaturedBannersApi.update(banner.id, { enabled: !banner.enabled });
      setBanners((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    } finally {
      setBusyId(null);
    }
  };

  const handleDrop = async (targetId: string) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    const fromIndex = banners.findIndex((b) => b.id === draggedId);
    const toIndex = banners.findIndex((b) => b.id === targetId);
    if (fromIndex === -1 || toIndex === -1) {
      setDraggedId(null);
      return;
    }
    const reordered = [...banners];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setBanners(reordered);
    setDraggedId(null);
    await adminFeaturedBannersApi.reorder(reordered.map((b) => b.id));
  };

  if (!isAdmin) {
    return (
      <div className="px-6 py-10 max-w-lg">
        <p className="text-fg-muted">You don't have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-2xl pb-24">
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => navigate("/settings")}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5 shrink-0"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">Home Featured Banner</h1>
          <p className="text-sm text-fg-muted mt-0.5">Controls only the Home screen's top carousel</p>
        </div>
      </div>

      <p className="text-xs text-fg-muted mb-6 leading-relaxed">
        The Home carousel shows only what's featured here — never the newest or most recently
        imported albums automatically. Drag to reorder.
      </p>

      <button
        onClick={() => setShowAdd(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-brand/15 text-brand font-semibold text-sm mb-5 hover:bg-brand/25 transition-colors"
      >
        <Plus size={16} />
        Add Banner
      </button>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-fg-muted">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : banners.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center rounded-3xl bg-elevated py-16 px-6">
          <p className="text-sm text-fg-muted">
            No banners yet. The Home hero carousel stays empty until you feature something here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {banners.map((banner) => (
            <div
              key={banner.id}
              draggable
              onDragStart={() => setDraggedId(banner.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(banner.id)}
              className={`flex items-center gap-3 bg-elevated rounded-2xl p-3 transition-opacity ${
                draggedId === banner.id ? "opacity-40" : "opacity-100"
              } ${!banner.enabled ? "opacity-60" : ""}`}
            >
              <GripVertical size={16} className="text-fg-subtle cursor-grab shrink-0" />
              <BannerThumb imageUrl={banner.resolvedImageUrl} gradient={banner.gradient} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{banner.resolvedTitle}</p>
                <p className="text-xs text-fg-muted truncate">{banner.resolvedSubtitle}</p>
                {banner.entityMissing && (
                  <p className="text-xs text-accent-red mt-0.5">Referenced album no longer exists</p>
                )}
              </div>
              <button
                onClick={() => handleToggleEnabled(banner)}
                disabled={busyId === banner.id}
                aria-label={banner.enabled ? "Disable banner" : "Enable banner"}
                className={`relative w-10 h-6 rounded-full shrink-0 transition-colors disabled:opacity-50 ${
                  banner.enabled ? "bg-brand" : "bg-elevated-hover"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    banner.enabled ? "translate-x-[18px]" : "translate-x-0.5"
                  }`}
                />
              </button>
              <button
                onClick={() => setEditingId(banner.id)}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-elevated-hover text-fg-muted hover:text-fg shrink-0"
                aria-label="Edit banner"
              >
                <Pencil size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddBannerModal
          onClose={() => setShowAdd(false)}
          onAdded={(banner) => {
            setBanners((prev) => [...prev, banner]);
            setShowAdd(false);
            setEditingId(banner.id);
          }}
        />
      )}

      {editingBanner && (
        <EditBannerModal
          banner={editingBanner}
          onClose={() => setEditingId(null)}
          onSaved={(updated) => setBanners((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))}
          onDeleted={(id) => setBanners((prev) => prev.filter((b) => b.id !== id))}
        />
      )}
    </div>
  );
}
