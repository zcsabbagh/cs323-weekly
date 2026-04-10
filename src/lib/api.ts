// Use same-origin relative URLs by default. Override with NEXT_PUBLIC_API_URL
// for local development pointing at a different backend.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export function api(path: string, init?: RequestInit) {
  return fetch(`${API_BASE}${path}`, init);
}
