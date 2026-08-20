import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface BackButtonProps {
  className?: string;
  // "dark": flat black circle, the original look, used across plain page
  // backgrounds. "glass": frosted/blurred over a hero photo — reads the
  // photo through it instead of sitting on top as a flat dot, for the
  // detail pages whose hero fills the whole top of the screen.
  variant?: "dark" | "glass";
}

export default function BackButton({ className = "", variant = "dark" }: BackButtonProps) {
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
      className={`absolute top-4 left-4 w-11 h-11 rounded-full flex items-center justify-center text-white transition-colors z-10 ${
        variant === "glass"
          ? "bg-white/10 backdrop-blur-xl ring-1 ring-white/15 shadow-lg hover:bg-white/20"
          : "bg-black/50 hover:bg-black/70"
      } ${className}`}
      aria-label="Go back"
    >
      <ChevronLeft size={22} />
    </button>
  );
}
