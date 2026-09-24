import { activeEndpoint } from "./auth-store";

export function endpointStorageKey(
  baseKey: string,
  endpointId = activeEndpoint().id,
): string {
  return `${baseKey}:${encodeURIComponent(endpointId)}`;
}

export function loadEndpointPreference<T>(baseKey: string, fallback: T): T {
  try {
    const scopedKey = endpointStorageKey(baseKey);
    let stored = localStorage.getItem(scopedKey);

    // Move the old global preference to the endpoint that was active during
    // migration. Removing it prevents subsequently selected endpoints from
    // inheriting the same plugin preferences.
    if (stored === null) {
      stored = localStorage.getItem(baseKey);
      if (stored !== null) {
        localStorage.setItem(scopedKey, stored);
        localStorage.removeItem(baseKey);
      }
    }

    return stored === null ? fallback : (JSON.parse(stored) as T);
  } catch {
    return fallback;
  }
}

export function saveEndpointPreference<T>(baseKey: string, value: T): void {
  try {
    localStorage.setItem(endpointStorageKey(baseKey), JSON.stringify(value));
  } catch {}
}
