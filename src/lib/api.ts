const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://cs323-weekly-production.up.railway.app";

export function api(path: string, init?: RequestInit) {
  return fetch(`${API_BASE}${path}`, init);
}
