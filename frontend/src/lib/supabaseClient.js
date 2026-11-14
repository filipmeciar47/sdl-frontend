// Supabase klient pre SDL2 (frontend). Používa LEN verejný anon/publishable kľúč
// — service_role je server-side a sem NIKDY nepatrí. Dáta chráni RLS na Supabase.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Ak nie sú nastavené env premenné, appka nespadne — auth sa len nezapne.
export const supabaseReady = Boolean(url && anonKey);

export const supabase = supabaseReady
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // spracuje návrat z Google OAuth redirectu
      },
    })
  : null;

// ─── Dosiahnuteľnosť auth služby ─────────────────────────────────────────────
// Na odlíšenie „nie si prihlásený" od „služba je mimo". Bez toho appka hlási
// v oboch prípadoch „prihlás sa" — a pri pozastavenom Supabase projekte je to
// pokyn, ktorý sa nedá splniť, lebo prihlásenie ide na ten istý mŕtvy hostname.
//
// `getSession()` číta localStorage, takže chýbajúci token sám o sebe nič
// nepovie o tom, či služba žije. Preto táto sonda.
//
// Dôležité: za dosiahnuteľné sa považuje AKÁKOĽVEK HTTP odpoveď — aj 401 alebo
// 404. Zisťujeme len to, či sa dá spojiť. Nedostupnosť = vyhodená výnimka
// (DNS, sieť, timeout). Trvať na 200 by bolo krehké.
const REACH_TTL_MS = 30_000;
let reachCache = { at: 0, ok: null };

export async function authReachable() {
  if (!supabaseReady) return false;
  const now = Date.now();
  if (reachCache.ok !== null && now - reachCache.at < REACH_TTL_MS) return reachCache.ok;

  let ok = false;
  try {
    await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      // AbortSignal.timeout nemusí byť v starších prehliadačoch; undefined je platné
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined,
    });
    ok = true;
  } catch (e) {
    ok = false;
  }
  reachCache = { at: now, ok };
  return ok;
}
