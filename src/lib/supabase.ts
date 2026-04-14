import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazy client: resolving env vars at module load time caused build-time
// "supabaseUrl is required" failures during Next.js page-data collection
// when the Vercel env was incomplete. Creating on first use keeps the
// module graph importable even if env is missing — the throw still fires
// at actual DB call time with a clear message, so silent misconfiguration
// isn't possible.

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env missing: set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and a key (SUPABASE_SERVICE_ROLE_KEY preferred, NEXT_PUBLIC_SUPABASE_ANON_KEY fallback)"
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

// Proxy so existing `supabase.from(...)` call sites keep working verbatim
// while initialization is deferred until first access.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
