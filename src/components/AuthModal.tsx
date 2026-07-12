import { X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import TextField from "./form/TextField";
import { useAuth } from "../context/useAuth";

interface AuthModalProps {
  onClose: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const { login, register, error, clearError } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, name || undefined);
      }
      onClose();
    } catch {
      // error surfaced via useAuth().error
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

        <h2 className="text-xl font-bold mb-1">{mode === "login" ? "Log in to Mezmur" : "Sign up for Mezmur"}</h2>
        <p className="text-sm text-fg-muted mb-6">
          {mode === "login" ? "Welcome back." : "Create an account to add your own artists."}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "register" && (
            <TextField
              type="text"
              required
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="px-4 py-2.5 text-base"
            />
          )}
          <TextField
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="px-4 py-2.5 text-base"
          />
          <TextField
            type="password"
            required
            minLength={8}
            placeholder="Password (min. 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="px-4 py-2.5 text-base"
          />

          {error && <p className="text-sm text-accent-red">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 bg-brand text-black font-bold rounded-full py-2.5 text-sm hover:scale-[1.02] transition-transform disabled:opacity-50"
          >
            {submitting ? "Please wait..." : mode === "login" ? "Log In" : "Sign Up"}
          </button>
        </form>

        <button
          onClick={() => {
            clearError();
            setMode(mode === "login" ? "register" : "login");
          }}
          className="mt-4 text-sm text-fg-muted hover:text-fg transition-colors w-full text-center"
        >
          {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Log in"}
        </button>
      </div>
    </div>,
    document.body
  );
}
