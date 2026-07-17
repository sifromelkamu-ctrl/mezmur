import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function BackButton({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const goBack = () => {
    // React Router's history state carries an `idx` that's 0 only for the
    // very first entry of this browsing session. When a page is opened
    // directly — a shared link, a bookmark, or (very common on mobile
    // Safari) the tab getting reloaded in the background — there's no prior
    // in-app entry for navigate(-1) to land on, and it exits the app to
    // about:blank instead of going "one step back". Falling back to Home
    // keeps that always inside the app.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/", { replace: true });
  };
  return (
    <button
      onClick={goBack}
      className={`absolute top-4 left-4 w-11 h-11 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors z-10 ${className}`}
      aria-label="Go back"
    >
      <ChevronLeft size={22} />
    </button>
  );
}
