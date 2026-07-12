import { useEffect, useRef, useState } from "react";
import { authApi } from "../lib/api";
import { validateUsername } from "../utils/authValidation";

export type UsernameCheckStatus = "idle" | "checking" | "available" | "taken" | "invalid";

interface UsernameCheckResult {
  status: UsernameCheckStatus;
  suggestions: string[];
}

const DEBOUNCE_MS = 400;

// Live-typing availability check for the username field, debounced so it
// doesn't fire a request per keystroke. `available`/`taken` only ever
// reflect the *last* username the user had typed when a response comes
// back — a request loop guard (via requestId) discards stale responses
// from an earlier keystroke that resolves after a newer one.
export function useUsernameAvailability(username: string): UsernameCheckResult {
  const [result, setResult] = useState<UsernameCheckResult>({ status: "idle", suggestions: [] });
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setResult({ status: "idle", suggestions: [] });
      return;
    }
    if (validateUsername(trimmed)) {
      setResult({ status: "invalid", suggestions: [] });
      return;
    }

    setResult((r) => ({ ...r, status: "checking" }));
    const requestId = ++requestIdRef.current;

    const timer = setTimeout(async () => {
      try {
        const { available, suggestions } = await authApi.usernameAvailability(trimmed);
        if (requestIdRef.current !== requestId) return;
        setResult({ status: available ? "available" : "taken", suggestions: suggestions ?? [] });
      } catch {
        if (requestIdRef.current !== requestId) return;
        setResult({ status: "idle", suggestions: [] });
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [username]);

  return result;
}
