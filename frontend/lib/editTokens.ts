// Edit tokens live only in the creator's browser. Storage can be blocked (private windows, strict settings),
// so every access is wrapped in try/catch and the app still works view-only without it.

const PREFIX = "streamwatch:edit:";
const listeners = new Set<() => void>();

export function getEditToken(dashboardId: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + dashboardId);
  } catch {
    return null;
  }
}

export function saveEditToken(dashboardId: string, token: string): void {
  try {
    window.localStorage.setItem(PREFIX + dashboardId, token);
  } catch {
    // storage blocked: the private edit link is the only way back in
  }
  listeners.forEach((l) => l());
}

export function subscribeEditTokens(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function privateEditLink(dashboardId: string, token: string): string {
  // the token goes after "#", which browsers never send to the server
  return `${window.location.origin}/create?edit=${dashboardId}#token=${encodeURIComponent(token)}`;
}
