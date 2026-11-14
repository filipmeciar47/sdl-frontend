// MySDL perzistencia: localStorage (vždy) + Supabase `mysdl_state` (keď je prihlásený).
// Vzor "hydratácia": pri otvorení MySDL sa DB dáta načítajú do localStorage a až potom
// sa vykreslí obsah — synchrónne initializery komponentov tak čítajú už hydratovaný
// localStorage a nemusia sa prerábať. Zápisy idú do localStorage aj do DB (upsert).
//
// Hodnota sa v DB ukladá ako opaquený string: data = { v: "<presný localStorage string>" },
// takže funguje uniformne pre JSON kľúče aj pre "1"/"0" (showprofile).
import { supabase, supabaseReady } from "../lib/supabaseClient";

// Kľúče, ktoré sa synchronizujú s účtom.
const KEYS = [
  "mysdl:v1",
  "mysdl:diag:v1",
  "mysdl:env:v1",
  "mysdl:plan:v1",
  "mysdl:showprofile:v1",
];

let currentUserId = null;

export function setUserId(id) {
  currentUserId = id || null;
}

// Načíta DB → localStorage; anonymné dáta (v localStorage, nie v DB) nahrá do DB.
// Vždy dobehne (aj pri chybe) — appka potom beží aspoň na localStorage.
export async function hydrate() {
  if (!currentUserId || !supabaseReady) return;
  try {
    const { data, error } = await supabase
      .from("mysdl_state")
      .select("key,data")
      .eq("user_id", currentUserId);
    if (error) throw error;

    const inDb = new Set();
    for (const row of data || []) {
      inDb.add(row.key);
      const v = row.data && typeof row.data.v === "string" ? row.data.v : null;
      if (v != null) {
        try { localStorage.setItem(row.key, v); } catch (e) { /* ignoruj */ }
      }
    }
    // migrácia anonymných localStorage dát do DB pri prvom prihlásení
    const uploads = [];
    for (const key of KEYS) {
      if (inDb.has(key)) continue;
      let local = null;
      try { local = localStorage.getItem(key); } catch (e) { /* ignoruj */ }
      if (local != null) uploads.push({ user_id: currentUserId, key, data: { v: local } });
    }
    if (uploads.length) {
      await supabase.from("mysdl_state").upsert(uploads, { onConflict: "user_id,key" });
    }
  } catch (e) {
    // ticho — pokračujeme s localStorage
    if (typeof console !== "undefined") console.warn("MySDL hydrate zlyhala, používam localStorage:", e.message);
  }
}

// Zápis: localStorage + (ak prihlásený) upsert do DB (fire-and-forget).
export function persist(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* ignoruj */ }
  if (currentUserId && supabaseReady) {
    supabase
      .from("mysdl_state")
      .upsert({ user_id: currentUserId, key, data: { v: value } }, { onConflict: "user_id,key" })
      .then(({ error }) => { if (error && typeof console !== "undefined") console.warn("MySDL persist:", error.message); });
  }
}

// Zmazanie: localStorage + (ak prihlásený) delete z DB.
export function removeKey(key) {
  try { localStorage.removeItem(key); } catch (e) { /* ignoruj */ }
  if (currentUserId && supabaseReady) {
    supabase.from("mysdl_state").delete().eq("user_id", currentUserId).eq("key", key)
      .then(({ error }) => { if (error && typeof console !== "undefined") console.warn("MySDL remove:", error.message); });
  }
}
