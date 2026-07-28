const STORAGE_KEY = "mezmur:device-id";

// A stable per-device anonymous id for logged-out listeners — used as a
// salt anywhere a pick needs to vary "per person" without requiring an
// account (e.g. NotificationsPanel's "Picked For You" rotation). Prefer
// user.id when logged in; fall back to this.
export function getDeviceId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
