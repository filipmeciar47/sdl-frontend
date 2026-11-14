// AI adaptér pre MySDL — nahrádza window.claude.complete z Design Component
// prostredia. Volá backend (/api/chat) v MySDL režime: backend grounduje
// systémový prompt na KB-kvadrant-sebaanalyza a JSON výstup overí (produkcia: Anthropic
// Sonnet; prevzaté zo sdl2, kde to bol Gemini).
//
// Kontrakt volajúceho (zachovaný 1:1 z mysdl-app.jsx):
//   const text = await aiComplete({ system, messages, max_tokens });
//   const parsed = JSON.parse(text...)   // volajúci si sám odstráni ```json fences
//
// Auth gating: MySDL AI funkcie vyžadujú prihlásenie. Bez session sa API nevolá —
// vyšle sa event "sdl:auth-required" (App.jsx naň otvorí prihlasovací modal).
//
// Rozlišujú sa DVA stavy, ktoré sa predtým zlievali do jedného:
//   AUTH_REQUIRED    — nie si prihlásený, ale služba žije → modal má zmysel
//   AUTH_UNAVAILABLE — auth služba je mimo → modal NEMÁ zmysel, prihlásiť sa nedá
// Druhý stav nastal, keď bol Supabase projekt pozastavený: appka hlásila
// „prihlás sa" a prihlásenie šlo na ten istý mŕtvy hostname.

import { supabase, supabaseReady, authReachable } from "../lib/supabaseClient";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

const LANG =
  (typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("lang")) ||
  "sk";

function authRequiredError() {
  try { window.dispatchEvent(new CustomEvent("sdl:auth-required")); } catch (e) { /* noop */ }
  const err = new Error(
    LANG === "en"
      ? "Sign in to use MySDL features."
      : "Na používanie MySDL funkcií sa prihlás alebo zaregistruj."
  );
  err.code = "AUTH_REQUIRED";
  return err;
}

// Auth služba je mimo — iný stav než „neprihlásený". Zámerne BEZ eventu
// "sdl:auth-required": otvárať registráciu nemá zmysel, keď sa prihlásiť nedá
// (prihlásenie ide na ten istý nedostupný hostname). Hlášku zobrazí volajúci.
function authUnavailableError() {
  const err = new Error(
    LANG === "en"
      ? "The sign-in service is temporarily unavailable — this isn't your fault. Please try again later."
      : "Prihlasovacia služba je teraz nedostupná — nie je to chyba u teba. Skús to prosím neskôr."
  );
  err.code = "AUTH_UNAVAILABLE";
  return err;
}

async function getAccessToken() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return (data && data.session && data.session.access_token) || null;
  } catch (e) { return null; }
}

// Prihlasovanie ešte nie je spustené (produkcia zatiaľ bez Supabase — rozhodnutie
// 14. 11. 2026). Iný stav než „služba je mimo": nič sa nepokazilo, funkcia len
// ešte nie je zapnutá. Bez eventu "sdl:auth-required" — modal by nemal čo ponúknuť.
function authNotConfiguredError() {
  const err = new Error(
    LANG === "en"
      ? "MySDL AI features will be available once signing in is launched. For now you can explore MySDL in preview."
      : "AI funkcie MySDL budú dostupné po spustení prihlasovania. Zatiaľ si MySDL môžeš prezrieť v náhľade."
  );
  err.code = "AUTH_NOT_CONFIGURED";
  return err;
}

export async function aiComplete({ system, messages, max_tokens, chat }) {
  // Bez nastaveného Supabase sa backend nevolá vôbec — žiadna požiadavka, žiadne tokeny.
  if (!supabaseReady) throw authNotConfiguredError();
  const token = await getAccessToken();
  if (!token) {
    // Chýbajúci token môže znamenať „neprihlásený" ALEBO „auth služba je mimo" —
    // getAccessToken() čita localStorage, takže sám to nerozlíši. Preto sonda.
    if (!(await authReachable())) throw authUnavailableError();
    throw authRequiredError(); // anonym = len náhľad; AI akcia → registrácia
  }

  const res = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mysdl: true, // MySDL režim: KB grounding na backende
      chat: !!chat, // chat=true → voľná konzultácia (Dynamika zmeny), inak JSON diagnostika
      system,
      messages,
      max_tokens,
      lang: LANG,
    }),
  });

  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    /* prázdna / nevalidná odpoveď */
  }

  if (!res.ok) {
    // 503 AUTH_UNAVAILABLE = backend nedosiahol auth službu pri overovaní tokenu.
    // Musí byť pred vetvou 401, aby sa nezlialo s „neplatný token".
    if (res.status === 503 && data.code === "AUTH_UNAVAILABLE") throw authUnavailableError();
    if (res.status === 401) throw authRequiredError(); // expirovaný/nevalidný token
    const msg = LANG === "en"
      ? (data.error || data.error_sk)
      : (data.error_sk || data.error);
    const err = new Error(msg || (LANG === "en" ? `Server error (${res.status})` : `Chyba servera (${res.status})`));
    // Kód z backendu (LIMIT, SAFETY, QUOTA, UPSTREAM, SERVER) prenesieme na chybu.
    // Volajúci podľa neho vie, že hláška je už správna a nemá si vymýšľať vlastnú.
    if (data && data.code) err.code = data.code;
    throw err;
  }
  return data.content || "";
}
