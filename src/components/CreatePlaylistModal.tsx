import { X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import TextField from "./form/TextField";
import { useLanguage } from "../context/LanguageContext";
import { playlistsApi } from "../lib/api";

interface CreatePlaylistModalProps {
  onClose: () => void;
}

export default function CreatePlaylistModal({ onClose }: CreatePlaylistModalProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const playlist = await playlistsApi.create(title.trim());
      onClose();
      navigate(`/playlist/${playlist.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create playlist");
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-panel rounded-xl w-full max-w-sm p-6 relative shadow-2xl my-8 max-h-[calc(100vh-4rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-fg-muted hover:text-fg transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold mb-1">{t("createPersonalizedPlaylist")}</h2>
        <p className="text-sm text-fg-muted mb-6">Give it a name — you can add songs once it's created.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <TextField
            autoFocus
            type="text"
            required
            placeholder={t("playlistName")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="px-4 py-2.5 text-sm"
          />

          {error && <p className="text-sm text-accent-red">{error}</p>}

          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-elevated-hover hover:bg-hover-strong transition-colors font-semibold rounded-full py-2.5 text-sm"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={!title.trim() || submitting}
              className="flex-1 bg-brand text-black font-bold rounded-full py-2.5 text-sm hover:scale-[1.02] transition-transform disabled:opacity-50"
            >
              {submitting ? "..." : t("create")}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
