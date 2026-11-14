import React, { useState, useEffect, useCallback, useRef } from "react";
import { SDL_ASSETS } from "./sdlAssets";
import { aiComplete } from "./mysdlAI";
import { setUserId, hydrate, persist, removeKey } from "./mysdlStore";

// AI volanie s 1× automatickým zopakovaním (ošetruje prechodné výpadky/timeouty backendu).
// Chyby, ktoré nesú `code`, už majú správnu lokalizovanú hlášku — buď z backendu
// (LIMIT, SAFETY, QUOTA, UPSTREAM, SERVER), alebo z mysdlAI (AUTH_REQUIRED,
// AUTH_UNAVAILABLE). Vymýšľať namiesto nich vlastnú znamená klamať: práve tak
// vznikla hláška „server je možno preťažený" v čase, keď bol server v poriadku
// a chýbala len auth služba. Vlastná hláška preto zostáva len pre chyby bez kódu
// (sieť, rozpadnutý JSON, neznáme 500).
function aiMsg(e, fallback) {
  return e && e.code && e.message ? e.message : fallback;
}

// Tieto kódy sa opakovaním nespravia — retry len zdrží užívateľa.
// AUTH_NOT_CONFIGURED = prihlasovanie ešte nie je spustené (produkcia bez Supabase).
const NO_RETRY = ["AUTH_REQUIRED", "AUTH_UNAVAILABLE", "AUTH_NOT_CONFIGURED", "LIMIT", "SAFETY"];

async function aiRetry(opts, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await aiComplete(opts); }
    catch (e) {
      lastErr = e;
      if (e && NO_RETRY.includes(e.code)) break; // neopraviteľné → von hneď, bez čakania
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastErr;
}

/* ================================================================== *
 *  MySDL — osobný priestor pre Spiral Dynamics Lens (SDL 2.0)
 *  Dlhodobé sledovanie kvadrantov + hodnotových systémov v čase.
 *  Tri optiky analýzy: Seba · Prostredie · Téma.
 *  Rámec: Wilberove 4 kvadranty + Špirálová dynamika.
 *  Vizuál zladený s hlavnou appkou (DM Sans / Playfair / Georgia,
 *  paleta SD úrovní, eye-emblem špirála, purpurovo-tyrkysový akcent).
 * ================================================================== */


// --- Špirálová dynamika: 8 úrovní (názov = presný kľúč pre AI) ---
const SD = {
  Beige:     { hex: "#C4A882", sk: "Prežitie" },
  Purple:    { hex: "#A78BFA", sk: "Kmeň, bezpečie" },
  Red:       { hex: "#F87171", sk: "Moc, impulz" },
  Blue:      { hex: "#60A5FA", sk: "Poriadok, pravidlá" },
  Orange:    { hex: "#FB923C", sk: "Úspech, výkon" },
  Green:     { hex: "#4ADE80", sk: "Spoločenstvo, ľudia" },
  Yellow:    { hex: "#FACC15", sk: "Integrácia, systém" },
  Turquoise: { hex: "#2DD4BF", sk: "Celostnosť" },
};

const ORDER = ["UL", "UR", "LL", "LR"];
const QUADS = {
  UL: { name: "Ja", code: "UL", en: "I", sub: "Intencionálne · subjektívne", dims: ["vedomie", "svetonázory", "zmysel", "poznanie"] },
  UR: { name: "To", code: "UR", en: "IT", sub: "Behaviorálne · objektívne", dims: ["správanie", "zvyky", "schopnosti", "komunikácia", "zdravie"] },
  LL: { name: "My", code: "LL", en: "WE", sub: "Kultúrne · intersubjektívne", dims: ["kultúra", "zdieľané hodnoty", "zdieľaný zmysel", "sociálne normy", "história"] },
  LR: { name: "Ono", code: "LR", en: "ITS", sub: "Sociálne · interobjektívne", dims: ["systémy", "štruktúra", "procesy", "zhody/súhlasy", "metriky"] },
};

// --- Tri optiky (lenses) ---
const LENSES = {
  kvadranty: {
    label: "Kvadranty", full: "Kvadranty Ken Wilbera", accent: "#A78BFA",
    desc: "Rozlož tému cez štyri kvadranty — Ja, To, My, Ono.",
    primary: ["UL", "UR", "LL", "LR"],
  },
  prostredie: {
    label: "Prostredie", full: "Prostredie", accent: "#60A5FA",
    desc: "Súlad medzi mojimi úrovňami a životnými podmienkami.",
    primary: ["LL", "LR"],
  },
  tema: {
    label: "Témy", full: "Téma alebo problém", accent: "#FACC15",
    desc: "Moje minúlé témy a rozbory cez štyri kvadranty.",
    primary: ["UL", "UR", "LL", "LR"],
  },
};
const LENS_ICON = { kvadranty: "/mysdl/icons/kvadranty.png", prostredie: "/mysdl/icons/prostredie.png", tema: "/mysdl/icons/temy.png" };

// --- Navádzajúce otázky podľa optiky ---
const QQ = {
  kvadranty: {
    UL: { q: "JA (I) — aké presvedčenia, emócie a motívy sú vnútri?", ph: "Myšlienky, emócie, hodnoty…" },
    UR: { q: "TO (IT) — aké konkrétne správanie a činy sú viditeľné?", ph: "Návyky, konania, výkon…" },
    LL: { q: "MY (WE) — aká kultúra a zdieľané hodnoty to obklopujú?", ph: "Normy, „tak sa to u nás robí“…" },
    LR: { q: "ONO (ITS) — aké systémy a štruktúry to vytvárajú?", ph: "Pravidlá, procesy, odmeny…" },
  },
  prostredie: {
    UL: { q: "Ako toto prostredie vnútorne prežívam?", ph: "Čo vo mne vyvoláva…" },
    UR: { q: "Ako sa v tomto prostredí správam?", ph: "Moje konanie v ňom…" },
    LL: { q: "Aká je kultúra a nehovorené pravidlá tohto prostredia?", ph: "„Tak sa to u nás robí“…" },
    LR: { q: "Aké štruktúry, procesy a odmeny prostredie formujú?", ph: "Systémy, procesy, odmeňovanie…" },
  },
  tema: {
    UL: { q: "Aké vnútorné presvedčenia a hodnoty sú v hre?", ph: "Presvedčenia, motívy…" },
    UR: { q: "Aké konkrétne správanie a činy sú viditeľné?", ph: "Pozorovateľné konanie…" },
    LL: { q: "Aká kultúra a zdieľané hodnoty tému obklopujú?", ph: "Kultúra okolo témy…" },
    LR: { q: "Aké systémy a štruktúry tému vytvárajú?", ph: "Pravidlá, procesy, štruktúry…" },
  },
};

const EXAMPLES = {
  kvadranty: ["Som vyhorený v práci", "Mám zmeniť kariéru?", "Cítim stagnáciu v raste", "Prokrastinujem"],
  prostredie: ["Náš tím sa vyhýba konfliktom", "Rigidná firemná kultúra", "Nízka dôvera v tíme", "Rodinná dynamika"],
  tema: ["Zavádzanie remote práce", "Konflikt dvoch oddelení", "Odpor voči zmene", "Ako motivovať dobrovoľníkov"],
};

/* ---------------- pomocné výpočty ---------------- */
const dominant = (farby) =>
  farby && farby[0] && SD[farby[0].nazov] ? SD[farby[0].nazov].hex : "#5B5B66";

function analysisColors(a) {
  const m = {};
  const kv = (a.result && a.result.kvadranty) || {};
  for (const k of ORDER)
    for (const f of (kv[k] && kv[k].farby) || [])
      m[f.nazov] = Math.max(m[f.nazov] || 0, f.sila === "silná" ? 2 : 1);
  return Object.entries(m).sort((x, y) => y[1] - x[1]).map(([n]) => n);
}

function computeProfile(analyses) {
  const total = {};
  const perQuad = { UL: {}, UR: {}, LL: {}, LR: {} };
  for (const a of analyses) {
    const kv = (a.result && a.result.kvadranty) || {};
    for (const k of ORDER)
      for (const f of (kv[k] && kv[k].farby) || []) {
        const w = f.sila === "silná" ? 2 : 1;
        total[f.nazov] = (total[f.nazov] || 0) + w;
        perQuad[k][f.nazov] = (perQuad[k][f.nazov] || 0) + w;
      }
  }
  return { total, perQuad };
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.getDate() + ". " + (d.getMonth() + 1) + ". " + d.getFullYear();
}

/* ---------------- malé prvky ---------------- */
// Eye-emblem špirála zladená s hlavnou appkou
function Spiral({ size = 26, className }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}
      aria-hidden="true" fill="none" strokeLinecap="round" strokeWidth={1.7}>
      <circle cx="12" cy="12" r="9" stroke="#A78BFA" strokeOpacity="0.9" strokeDasharray="40 16" />
      <circle cx="12" cy="12" r="5.2" stroke="#2DD4BF" strokeOpacity="0.95" strokeDasharray="22 10" />
      <circle cx="12" cy="12" r="1.8" fill="#FACC15" stroke="none" />
    </svg>
  );
}

/* ---------------- 8 úrovní vývoja — ikony hlavného rozhrania appky ----------------
 * Presne to isté usporiadanie ako v analytickom režime: Express Self (Ja) hore,
 * Deny Self (My) dole; k plnej ikone patrí protipólová „osová" ikona na opačnom rade.
 * Interakcie: hover = zosilnenie žiary, klik = vyber úroveň a ukáž jej popis. */
const SPIRAL_LEVELS = [
  { key: "beige",     name: "BÉŽOVÁ",    motto: "Prežitie",           axis: "express", clr: "#C4A882", glow: "rgba(196,168,130,0.55)", desc: "Najprv prežiť. Čo v tejto téme ohrozuje tvoj základný pokoj a bezpečie?" },
  { key: "purple",    name: "PURPUROVÁ", motto: "Bezpečie klanu",     axis: "deny",    clr: "#A78BFA", glow: "rgba(167,139,250,0.55)", desc: "Kmeň a rituál. Komu v tejto téme patríš — a čie nevyslovené pravidlá ťa držia?" },
  { key: "red",       name: "ČERVENÁ",   motto: "Moc a vôľa",         axis: "express", clr: "#F87171", glow: "rgba(248,113,113,0.55)", desc: "Vôľa a moc. Kde sa v tejto téme krčíš — a kde by si mal prevziať silu späť?" },
  { key: "blue",      name: "MODRÁ",     motto: "Poriadok a zmysel",  axis: "deny",    clr: "#60A5FA", glow: "rgba(96,165,250,0.55)",  desc: "Poriadok a zmysel. Aký princíp alebo pravidlo ti v tejto téme dáva pevnú pôdu?" },
  { key: "orange",    name: "ORANŽOVÁ",  motto: "Úspech a výkon",     axis: "express", clr: "#FB923C", glow: "rgba(251,146,60,0.55)",  desc: "Úspech a stratégia. Čo chceš v tejto téme dosiahnuť — a akú cenu za to platíš?" },
  { key: "green",     name: "ZELENÁ",    motto: "Harmónia a rovnosť", axis: "deny",    clr: "#4ADE80", glow: "rgba(74,222,128,0.55)",  desc: "Vzťahy a rovnosť. Čie hlasy v tejto téme nepočuješ — vrátane toho vlastného?" },
  { key: "yellow",    name: "ŽLTÁ",      motto: "Systémová integrácia", axis: "express", clr: "#FACC15", glow: "rgba(250,204,21,0.6)",  desc: "Systém a integrácia. Ako do seba zapadajú všetky predošlé pohľady na túto tému?" },
  { key: "turquoise", name: "TYRKYSOVÁ", motto: "Celostné vedomie",   axis: "deny",    clr: "#2DD4BF", glow: "rgba(45,212,191,0.6)",   desc: "Celok. Čím táto téma slúži niečomu väčšiemu než tebe samému?" },
];

/* ================= KB — Špirálová dynamika (z nahraných dokumentov) =================
 * Zdroje: „Princípy integrácie", „Dynamika prechodu medzi SD úrovňami", „Integrálny rámec (AQAL)".
 * Podklad pre štruktúrované okná v Progrese a pre AI návrh plánu rastu. */
const SD_KB = {
  levels: {
    beige: {
      podmienky: "Základné prežitie, telesné potreby a bezprostredné ohrozenie.",
      silne: "Inštinkt pre prežitie, kontakt s telom a schopnosť reagovať na základné potreby.",
      prejavy: "V kríze sa sústredíš na to najzákladnejšie; telo reaguje skôr než myseľ.",
      slepe: "Prehliadanie telesných signálov a odpájanie sa od potrieb tela pri strese.",
      tiene: "Panika, zamrznutie, prežívanie „z ruky do úst\" bez výhľadu.",
    },
    purple: {
      podmienky: "Potreba bezpečia, príslušnosti, rituálu a spoločenstva.",
      silne: "Spolupatričnosť, intuícia a rešpekt k tradícii a rodine.",
      prejavy: "Bezpečie hľadáš v blízkych a známom; dôležité sú rituály a „naši ľudia\".",
      slepe: "Strach z vylúčenia brzdí samostatnosť; poverčivosť namiesto overenia.",
      tiene: "Uzavretosť voči cudziemu, závislosť na skupine, magické vyhýbanie sa zodpovednosti.",
    },
    red: {
      podmienky: "Potreba presadiť sa, mať moc a okamžitý dopad.",
      silne: "Sebaafirmácia, odvaha, akčnosť a schopnosť chrániť hranice.",
      prejavy: "Ideš si za svojím, nebojíš sa konfliktu a rýchlo konáš.",
      slepe: "Dopad na druhých a dlhodobé následky impulzívnych činov.",
      tiene: "Dominancia, výbuchy hnevu, manipulácia, bezohľadnosť.",
    },
    blue: {
      podmienky: "Potreba poriadku, istoty, jasných pravidiel a zmyslu.",
      silne: "Zmysel pre poriadok, morálku, disciplínu a službu vyššiemu princípu.",
      prejavy: "Držíš sa pravidiel a záväzkov a hľadáš „správny\" spôsob.",
      slepe: "Rigidita voči zmene a súdenie tých, čo pravidlá nedodržiavajú.",
      tiene: "Dogmatizmus, vina a trest, potláčanie vlastných potrieb v mene povinnosti.",
    },
    orange: {
      podmienky: "Príležitosti, súťaž, merateľný úspech a individuálny rast.",
      silne: "Kritické myslenie, efektivita, inovácie a dosahovanie cieľov.",
      prejavy: "Staviaš si ciele a stratégie, meriaš výsledky a optimalizuješ.",
      slepe: "Cena úspechu pre vzťahy a zmysel; „viac\" ako automatická odpoveď.",
      tiene: "Workoholizmus, používanie ľudí ako nástrojov, prázdnota po výkone.",
    },
    green: {
      podmienky: "Potreba spojenia, rovnosti, zmieru a zdieľaného významu.",
      silne: "Empatia, komunita, rovnosť a vnútorný súcit.",
      prejavy: "Dbáš, aby mal každý hlas, a úprimne cítiš s druhými.",
      slepe: "Rozhodnosť a hierarchia keď treba; nekonečné hľadanie konsenzu.",
      tiene: "Vyhýbanie sa konfliktu, moralizovanie, relativizmus bez smeru.",
    },
    yellow: {
      podmienky: "Komplexita a potreba systémového, flexibilného pohľadu.",
      silne: "Systémové chápanie, flexibilita a tolerancia k rôznorodosti.",
      prejavy: "Vidíš vzorce a súvislosti a prispôsobuješ prístup kontextu.",
      slepe: "Netrpezlivosť voči „nižším\" úrovniam a odpojenie od emócií.",
      tiene: "Intelektuálny odstup, arogancia „už vidím viac\", nečinné pozorovanie.",
    },
    turquoise: {
      podmienky: "Potreba celostnosti, zmyslu presahujúceho jednotlivca a planetárneho vedomia.",
      silne: "Celostné vedomie, planetárna identita a hlboká spiritualita.",
      prejavy: "Vnímaš prepojenie celku a konáš v službe niečomu väčšiemu.",
      slepe: "Uzemnenie v každodennosti a prehliadanie konkrétnych krokov.",
      tiene: "Spiritual bypassing, odpojenie od reality, vznešenosť bez činu.",
    },
  },
  fazy: [
    { t: "Zmena životných podmienok", d: "Nové výzvy sa už nedajú riešiť zo starej úrovne." },
    { t: "Nespokojnosť a rozpor", d: "Cítiš, že doterajšie presvedčenia nestačia." },
    { t: "Rozklad a chaos", d: "Stará úroveň sa stáva nestabilnou a otvára priestor novému." },
    { t: "Insight a prerod", d: "Objavuje sa vyššia úroveň s novými riešeniami." },
    { t: "Stabilizácia", d: "Integruješ nové hodnoty a správanie do každodennosti." },
  ],
  prechody: [
    { from: "beige", to: "purple", spustace: "Potreba bezpečia, vznik spoločenstiev.", most: "Vzťahová väzba, magické myslenie." },
    { from: "purple", to: "red", spustace: "Potlačenie individuality, potreba moci.", most: "Objavenie ega, asertivita." },
    { from: "red", to: "blue", spustace: "Chaos, strata kontroly, potreba poriadku.", most: "Prijatie autority, disciplína." },
    { from: "blue", to: "orange", spustace: "Frustrácia z dogiem, túžba po výsledkoch.", most: "Racionálne myslenie, zameranie na cieľ." },
    { from: "orange", to: "green", spustace: "Odcudzenie, sociálna a ekologická kríza.", most: "Empatia, rovnosť, komunita." },
    { from: "green", to: "yellow", spustace: "Relativistický chaos, potreba systému.", most: "Integrácia protikladov, systémové myslenie." },
    { from: "yellow", to: "turquoise", spustace: "Potreba celostnosti a planetárneho vedomia.", most: "Spirituálna integrácia, koherencia." },
  ],
  stagnacia: [
    { t: "Stagnácia", d: "Prevláda komfort v starej úrovni, aj keď už nefunguje." },
    { t: "Regresia", d: "Pod tlakom alebo strachom sa vraciaš k známejšej nižšej úrovni." },
    { t: "Disonancia", d: "Konflikt medzi hlavou (vyššia úroveň) a správaním (nižšia)." },
  ],
  faktory: [
    "Kríza identity alebo zmyslu",
    "Mentorstvo, koučing, terapia",
    "Expozícia vyšším hodnotám (literatúra, rozhovory, prostredie)",
    "Zvedavosť a otvorenosť",
    "Sebareflexia a introspekcia",
  ],
  principy: [
    "Transcenduj a zahrň — vyššia úroveň nižšiu nepopiera, ale rozširuje.",
    "Každá úroveň má zdravé aj nezdravé prejavy — integruj zdravé jadro.",
    "Vývoj je asymetrický — v jednej oblasti môžeš byť vyššie než v inej.",
    "Regresia nie je zlyhanie, ale volanie po liečení.",
    "Integrácia vyžaduje bezpečie a kontext.",
  ],
};

/* Zdieľané plátno 8 úrovní — rovnaký interaktívny vizuál v Prehľade aj v Progrese.
   scored=true → priehľadnosť ikon + prúžok podľa skóre z diagnostiky. */
function LevelIconCanvas({ selected, onSelect, diag, scored }) {
  const [hover, setHover] = useState(null);
  const A = (typeof window !== "undefined" && SDL_ASSETS) || {};
  const IC = A.ICONS || {};
  const AX = A.AXIS_ICONS || {};
  const W = 792, slot = W / 8;
  const ROW_TOP = 104, ROW_BOT = 292, ICO = 62, AXICO = 40;
  return (
    <div className="sa-levels-scroll">
      <div className="sa-levels-canvas" style={{ width: W, height: 380 }}>
        <div className="sa-zone" style={{ top: 168, color: "rgba(255,180,100,0.45)" }}>Express Self · JA</div>
        <div className="sa-zone" style={{ top: 208, color: "rgba(96,165,250,0.45)" }}>Deny Self · MY</div>
        {SPIRAL_LEVELS.map((d, i) => {
          const cx = (i + 0.5) * slot;
          const iconsY = d.axis === "express" ? ROW_TOP : ROW_BOT;
          const axisY = d.axis === "express" ? ROW_BOT : ROW_TOP;
          const isHover = hover === d.key;
          const active = selected === d.key;
          const hot = isHover || active;
          const dg = scored && diag && diag.urovne && diag.urovne[d.key];
          const skore = dg ? Math.max(0, Math.min(100, dg.skore || 0)) : null;
          const glowOp = isHover ? 0.72 : active ? 0.9 : (skore != null ? 0.16 + skore / 100 * 0.4 : 0.26);
          const imgOp = hot ? 1 : (skore != null ? 0.42 + skore / 100 * 0.58 : 0.8);
          const gBlur = isHover ? 9 : active ? 13 : 4;
          const axOp = isHover ? 0.95 : active ? 0.85 : (skore != null ? 0.3 + skore / 100 * 0.45 : 0.5);
          const axBlur = hot ? 8 : 2;
          return (
            <React.Fragment key={d.key}>
              <div className="sa-lvwrap" style={{ left: cx - ICO / 2 - 16, top: iconsY - ICO / 2 - 4, width: ICO + 32, zIndex: isHover ? 50 : 10 }}
                onMouseEnter={() => setHover(d.key)} onMouseLeave={() => setHover(null)}
                onClick={() => onSelect(active ? null : d.key)}>
                <div style={{ position: "relative", width: ICO, height: ICO }}>
                  <div style={{ position: "absolute", inset: -14, background: "radial-gradient(circle, " + d.clr + "99 0%, " + d.glow + " 30%, transparent 65%)", opacity: glowOp, transition: "opacity .22s", pointerEvents: "none" }} />
                  <img src={IC[d.key] || ""} alt={d.name} style={{ position: "relative", width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", filter: "drop-shadow(0 0 " + gBlur + "px " + d.glow + ")", opacity: imgOp, transition: "filter .22s, opacity .22s" }} />
                  {active && <div style={{ position: "absolute", inset: -6, borderRadius: "50%", border: "2px solid " + d.clr, boxShadow: "0 0 12px " + d.glow }} />}
                </div>
                <div style={{ marginTop: 6, textAlign: "center" }}>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, letterSpacing: "0.14em", fontWeight: 600, textTransform: "uppercase", color: hot ? d.clr : "rgba(200,190,178,0.7)", textShadow: hot ? "0 0 8px " + d.glow : "none", transition: "color .2s" }}>{d.name}</div>
                  <div style={{ marginTop: 2, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontSize: 9.5, color: hot ? "rgba(220,210,200,0.92)" : "rgba(200,190,178,0.5)", whiteSpace: "nowrap" }}>{d.motto}</div>
                  {skore != null && (<span className="sa-canvasbar" title={skore + " %"}><span style={{ display: "block", height: "100%", width: Math.max(4, skore) + "%", background: d.clr, boxShadow: "0 0 6px " + d.glow }} /></span>)}
                </div>
              </div>
              <div className="sa-lvaxis" style={{ left: cx - AXICO / 2, top: axisY - AXICO / 2, width: AXICO, height: AXICO, zIndex: isHover ? 50 : 10 }}
                onMouseEnter={() => setHover(d.key)} onMouseLeave={() => setHover(null)}
                onClick={() => onSelect(active ? null : d.key)}>
                <img src={AX[d.key] || ""} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", filter: "drop-shadow(0 0 " + axBlur + "px " + d.glow + ")", opacity: axOp, transition: "filter .22s, opacity .22s" }} />
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function LevelStrip({ onStartDiag }) {
  const [hover, setHover] = useState(null);
  const [selected, setSelected] = useState(null);
  const A = (typeof window !== "undefined" && SDL_ASSETS) || {};
  const IC = A.ICONS || {};
  const AX = A.AXIS_ICONS || {};
  const [dtext, setDtext] = useState("");
  const [pdiag] = useState(() => { try { const r = localStorage.getItem("mysdl:diag:v1"); return r ? JSON.parse(r) : null; } catch (e) { return null; } });

  const sel = SPIRAL_LEVELS.find((d) => d.key === selected);

  return (
    <section className="sa-panel sa-levels">
      <div className="sa-levels-head">
        <h2 className="sa-heroh">Osem úrovní vývoja</h2>
        <p className="sa-herosub">Klikni na úroveň a spoznaj jej otázku · hover ukáže žiaru</p>
      </div>

      <LevelIconCanvas selected={selected} onSelect={setSelected} />

      {/* Diagnostika mojej úrovne */}
      <div className="sa-diag">
        <div className="sa-diag-label">Diagnostika mojej úrovne</div>
        <p className="sa-diag-hint">Zadaj tému, ktorej sa má diagnostika týkať — alebo nechaj prázdne pre všeobecnú. Položím ti niekoľko otvorených otázok a ukážem, ako sú u teba zastúpené jednotlivé úrovne.</p>
        <textarea className="sa-area sa-diag-area" rows={3} value={dtext}
          placeholder="Napr. „V práci ma najviac ženie dokázať, že na to mám, a frustruje ma, keď pravidlá spomaľujú výsledok.“"
          onChange={(e) => setDtext(e.target.value)} />
        <div className="sa-diag-actions">
          <span className="sa-diag-count">{dtext.trim().length > 0 ? "Otázky sa prispôsobia tvojej téme" : "Bez témy bude diagnostika všeobecná"}</span>
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => onStartDiag && onStartDiag(dtext.trim())}>
            Spustiť diagnostiku
          </button>
        </div>
      </div>

      {sel && (
        <div className="sa-lvcard" style={{ background: "linear-gradient(135deg," + sel.clr + "12,rgba(10,10,18,0.82))", borderColor: sel.clr + "30", borderLeftColor: sel.clr + "66" }}>
          <img src={IC[sel.key] || ""} alt="" style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover", flex: "none", boxShadow: "0 0 12px " + sel.glow }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: sel.clr }}>{sel.name}</span>
              <span style={{ fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{sel.motto}</span>
            </div>
            <p style={{ fontFamily: "Georgia,serif", fontSize: 14, fontWeight: 300, lineHeight: 1.65, color: "rgba(221,221,221,0.85)", margin: 0 }}>{sel.desc}</p>
            {pdiag && pdiag.urovne && pdiag.urovne[sel.key] && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "#A78BFA", whiteSpace: "nowrap" }}>U teba</span>
                  <span style={{ flex: 1, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: Math.max(4, Math.min(100, pdiag.urovne[sel.key].skore || 0)) + "%", background: sel.clr }} /></span>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10.5, color: "rgba(255,255,255,0.6)" }}>{pdiag.urovne[sel.key].skore || 0}%</span>
                </div>
                <p style={{ fontFamily: "Georgia,serif", fontSize: 13, fontWeight: 300, lineHeight: 1.6, color: "rgba(221,221,221,0.8)", margin: 0 }}>{pdiag.urovne[sel.key].text}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function LensIcon({ lens, size = 22, color }) {
  const c = color || LENSES[lens].accent;
  const common = { fill: "none", stroke: c, strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  if (lens === "kvadranty")
    return <svg viewBox="0 0 24 24" width={size} height={size}><circle cx="12" cy="12" r="9" {...common} /><line x1="12" y1="3" x2="12" y2="21" {...common} /><line x1="3" y1="12" x2="21" y2="12" {...common} /><circle cx="12" cy="12" r="2.4" {...common} /></svg>;
  if (lens === "prostredie")
    return <svg viewBox="0 0 24 24" width={size} height={size}><circle cx="6" cy="7.5" r="2.2" {...common} /><circle cx="18" cy="7.5" r="2.2" {...common} /><circle cx="12" cy="16.5" r="2.2" {...common} /><path d="M7.7 8.9 10.3 15.1M16.3 8.9 13.7 15.1M8.2 7.5h7.6" {...common} /></svg>;
  return <svg viewBox="0 0 24 24" width={size} height={size}><circle cx="12" cy="12" r="8" {...common} /><circle cx="12" cy="12" r="3.4" {...common} /></svg>;
}

function Chip({ name }) {
  const c = SD[name] || { hex: "#9AA0A6", sk: name };
  return (
    <span className="sa-chip">
      <span className="sa-dot" style={{ background: c.hex, boxShadow: "0 0 7px " + c.hex + "66" }} />
      <span className="sa-chip-name">{name}</span>
      <span className="sa-chip-sk">{c.sk}</span>
    </span>
  );
}

function Spectrum({ map, height = 12 }) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  if (!sum) return <div className="sa-specempty" style={{ height }} />;
  return (
    <div className="sa-spec" style={{ height }}>
      {entries.map(([name, w]) => (
        <span key={name} className="sa-specseg" title={name}
          style={{ width: (w / sum) * 100 + "%", background: (SD[name] || {}).hex || "#555" }} />
      ))}
    </div>
  );
}

function QuadrantFrame({ children }) {
  return (
    <div className="sa-map">
      <div className="sa-axis sa-axis-top">individuálne</div>
      <div className="sa-maprow">
        <div className="sa-axis sa-axis-side">vnútro</div>
        <div className="sa-grid">{children}</div>
        <div className="sa-axis sa-axis-side">vonkajšie</div>
      </div>
      <div className="sa-axis sa-axis-bottom">kolektívne</div>
    </div>
  );
}

/* ---------------- telo výsledku (zdieľané flow + detail) ---------------- */
function ResultBody({ result }) {
  const kv = result.kvadranty || {};
  const napatia = result.napatia || [];
  const rast = result.rast || {};
  return (
    <>
      <h2 className="sa-h2">Mapa kvadrantov</h2>
      <QuadrantFrame>
        {ORDER.map((k) => {
          const cell = kv[k] || {};
          const farby = cell.farby || [];
          const dom = dominant(farby);
          return (
            <div key={k} className="sa-rescell" style={{ borderLeftColor: dom, background: dom + "1E" }}>
              <div className="sa-cellhead">
                <span className="sa-cellname">{QUADS[k].name}</span>
                <span className="sa-cellcode">{QUADS[k].code}</span>
              </div>
              <div className="sa-chips">
                {farby.length ? farby.map((f, i) => <Chip key={i} name={f.nazov} />)
                  : <span className="sa-chip-empty">bez signálu</span>}
              </div>
              {cell.zhrnutie && <p className="sa-cellsum">{cell.zhrnutie}</p>}
            </div>
          );
        })}
      </QuadrantFrame>

      {napatia.length > 0 && (
        <>
          <h2 className="sa-h2">Napätia a konflikty</h2>
          <div className="sa-tensions">
            {napatia.map((t, i) => (
              <div key={i} className="sa-tension">
                <div className="sa-tensiontop">
                  <div className="sa-tensiondots">
                    {(t.farby || []).map((name, j) => {
                      const hex = (SD[name] || {}).hex || "#9AA0A6";
                      return <span key={j} className="sa-dot sa-dot-lg" style={{ background: hex, boxShadow: "0 0 8px " + hex + "66" }} />;
                    })}
                  </div>
                  <span className="sa-tensionbadge">{(t.medzi || []).join(" ↔ ")}</span>
                </div>
                <p className="sa-tensiontext">{t.popis}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {result.sebareflexia && (
        <>
          <h2 className="sa-h2">Sebareflexia</h2>
          <blockquote className="sa-reflect">{result.sebareflexia}</blockquote>
        </>
      )}

      <h2 className="sa-h2">Rast — všetky kvadranty</h2>
      <div className="sa-growth">
        {ORDER.map((k) => {
          const dom = dominant((kv[k] || {}).farby);
          return (
            <div key={k} className="sa-grow">
              <div className="sa-growhead">
                <span className="sa-dot" style={{ background: dom, boxShadow: "0 0 7px " + dom + "66" }} />
                <span className="sa-growname">{QUADS[k].name}</span>
                <span className="sa-growcode">{QUADS[k].code}</span>
              </div>
              <p className="sa-growtext">{rast[k] || "—"}</p>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- Wilberova mandala štyroch kvadrantov ----------------
 * Naša mandala + označenia kvadrantov podľa dokumentu (I/IT/WE/ITS). */
function QuadrantMandala({ size = 340 }) {
  return (
    <svg viewBox="0 0 520 520" width={size} height={size} style={{ display: "block", overflow: "visible", maxWidth: "100%" }}>
      <defs><clipPath id="qm-circ"><circle cx="260" cy="260" r="205" /></clipPath></defs>
      <g clipPath="url(#qm-circ)">
        <rect x="0" y="0" width="260" height="260" fill="rgba(250,204,21,0.06)" />
        <rect x="260" y="0" width="260" height="260" fill="rgba(96,165,250,0.06)" />
        <rect x="0" y="260" width="260" height="260" fill="rgba(74,222,128,0.06)" />
        <rect x="260" y="260" width="260" height="260" fill="rgba(167,139,250,0.06)" />
      </g>
      <circle cx="260" cy="260" r="205" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      <line x1="260" y1="55" x2="260" y2="465" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeDasharray="2 6" />
      <line x1="55" y1="260" x2="465" y2="260" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeDasharray="2 6" />
      {/* osi */}
      <text x="260" y="26" textAnchor="middle" fill="rgba(255,255,255,0.42)" fontFamily="'DM Sans',sans-serif" fontSize="10" letterSpacing="3" fontWeight="600">INDIVIDUÁLNE</text>
      <text x="260" y="506" textAnchor="middle" fill="rgba(255,255,255,0.42)" fontFamily="'DM Sans',sans-serif" fontSize="10" letterSpacing="3" fontWeight="600">KOLEKTÍVNE</text>
      <text x="16" y="264" textAnchor="middle" fill="rgba(255,255,255,0.36)" fontFamily="'DM Sans',sans-serif" fontSize="9" letterSpacing="2" fontWeight="600" transform="rotate(-90 16 260)">INTERIÉR</text>
      <text x="504" y="264" textAnchor="middle" fill="rgba(255,255,255,0.36)" fontFamily="'DM Sans',sans-serif" fontSize="9" letterSpacing="2" fontWeight="600" transform="rotate(90 504 260)">EXTERIÉR</text>
      {/* UL — JA / I */}
      <text x="150" y="150" textAnchor="middle" fill="#FACC15" fontFamily="'Playfair Display',serif" fontSize="30">JA</text>
      <text x="150" y="172" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontFamily="'DM Sans',sans-serif" fontSize="10.5" letterSpacing="0.5">I · Intencionálne</text>
      <text x="150" y="188" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontFamily="'DM Sans',sans-serif" fontSize="9.5">(subjektívne)</text>
      {/* UR — TO / IT */}
      <text x="370" y="150" textAnchor="middle" fill="#60A5FA" fontFamily="'Playfair Display',serif" fontSize="30">TO</text>
      <text x="370" y="172" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontFamily="'DM Sans',sans-serif" fontSize="10.5" letterSpacing="0.5">IT · Behaviorálne</text>
      <text x="370" y="188" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontFamily="'DM Sans',sans-serif" fontSize="9.5">(objektívne)</text>
      {/* LL — MY / WE */}
      <text x="150" y="346" textAnchor="middle" fill="#4ADE80" fontFamily="'Playfair Display',serif" fontSize="30">MY</text>
      <text x="150" y="368" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontFamily="'DM Sans',sans-serif" fontSize="10.5" letterSpacing="0.5">WE · Kultúrne</text>
      <text x="150" y="384" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontFamily="'DM Sans',sans-serif" fontSize="9.5">(intersubjektívne)</text>
      {/* LR — ONO / ITS */}
      <text x="370" y="346" textAnchor="middle" fill="#A78BFA" fontFamily="'Playfair Display',serif" fontSize="30">ONO</text>
      <text x="370" y="368" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontFamily="'DM Sans',sans-serif" fontSize="10.5" letterSpacing="0.5">ITS · Sociálne</text>
      <text x="370" y="384" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontFamily="'DM Sans',sans-serif" fontSize="9.5">(interobjektívne)</text>
    </svg>
  );
}

/* ============================ APP ============================ */
function App({ access: accessProp, userId } = {}) {
  const [view, setView] = useState("dashboard"); // dashboard | flow | detail
  const [flowStep, setFlowStep] = useState("quadrants"); // quadrants | result
  const [lens, setLens] = useState("kvadranty");
  const [topic, setTopic] = useState("");
  const [q, setQ] = useState({ UL: "", UR: "", LL: "", LR: "" });
  const [flowHoverQuad, setFlowHoverQuad] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [diagInit, setDiagInit] = useState("");

  // úroveň prístupu: prop (overlay mount z App.jsx) má prednosť pred URL (?access=once|full)
  const access = accessProp ||
    (typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("access")) || "full";
  const accessLabel = access === "once" ? "Jednorazový vstup" : "Účet MySDL";

  // načítanie z lokálneho úložiska
  useEffect(() => {
    try {
      const raw = localStorage.getItem("mysdl:v1");
      if (raw) { const d = JSON.parse(raw); if (d.analyses) setAnalyses(d.analyses); }
    } catch (e) { /* zatiaľ prázdne */ }
    setLoaded(true);
  }, []);

  // hlboké odkazy: MySDL.dc.html?view=...&topic=...
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const v = p.get("view");
      const t = (p.get("topic") || "").trim();
      if (!v) return;
      if (v === "kvadranty" || v === "tema") {
        setLens(v); setTopic(t); setQ({ UL: "", UR: "", LL: "", LR: "" });
        setResult(null); setError(null);
        setFlowStep("quadrants"); setView("flow");
      } else if (v === "prostredie") setView("prostredie");
      else if (v === "temy") setView("temy");
      else if (v === "progres") setView("progres");
      else if (v === "diag") { setDiagInit(t); setView("diag"); }
    } catch (e) { /* ignoruj */ }
    // eslint-disable-next-line
  }, []);

  function persistAnalyses(next) {
    setAnalyses(next);
    try { persist("mysdl:v1", JSON.stringify({ analyses: next })); } catch (e) { /* ignoruj */ }
  }

  const L = LENSES[lens];
  const canAnalyze = L.primary.some((k) => q[k].trim());

  function startFlow(lensKey) {
    setLens(lensKey); setTopic(""); setQ({ UL: "", UR: "", LL: "", LR: "" });
    setResult(null); setError(null); setFlowStep("quadrants"); setView("flow");
  }
  function openDetail(id) { setDetailId(id); setView("detail"); }
  function saveCurrent() {
    const rec = {
      id: "a_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      createdAt: new Date().toISOString(), lens, topic, inputs: { ...q }, result,
    };
    persistAnalyses([rec, ...analyses]);
    setView("dashboard");
  }
  function deleteAnalysis(id) {
    persistAnalyses(analyses.filter((a) => a.id !== id));
    setView("dashboard");
  }

  async function analyze() {
    setLoading(true); setError(null);
    const zameranie = {
      kvadranty: "Používateľ rozkladá tému cez všetky štyri Wilberove kvadranty (Ja/To/My/Ono). Vyváž ich rovnomerne; reflexiu aj rast píš osobne v druhej osobe.",
      prostredie: "Používateľ analyzuje SVOJE PROSTREDIE (tím, rodinu, organizáciu). Ťažisko daj na LL a LR (kultúra a systémy); rast smeruj k tomu, ako môže prostredie zmeniť.",
      tema: "Používateľ analyzuje TÉMU alebo PROBLÉM zoširoka. Vyváž všetky štyri kvadranty rovnomerne.",
    }[lens];

    const SYSTEM = `Si láskavý sprievodca reflexiou. Spájaš Wilberove štyri kvadranty so Špirálovou dynamikou (SD).

Kvadranty:
- UL "Ja" = vnútro jednotlivca (presvedčenia, emócie, motívy, hodnoty)
- UR "To" = správanie jednotlivca (návyky, konania, telo, výkon)
- LL "My" = kultúra skupiny (zdieľané hodnoty, normy, "tak sa to u nás robí")
- LR "Ono" = systémy (pravidlá, procesy, odmeny, štruktúry)

Zameranie tejto analýzy: ${zameranie}

SD úrovne (názov musí byť presne jedno z týchto slov): Beige, Purple, Red, Blue, Orange, Green, Yellow, Turquoise.

Postup:
1. Pre každý kvadrant urči 1-2 najpravdepodobnejšie SD úrovne. Každá má "sila": "silná" alebo "prítomná". Pridaj 1 vetu zhrnutia. Ak je kvadrant nevyplnený, daj opatrný odhad; pole farieb môže byť prázdne.
2. Nájdi 1-3 kľúčové napätia — medzi kvadrantmi alebo medzi úrovňami (napr. Orange vs Blue). Každé: "medzi" (kvadranty), "farby", "popis" (1 veta).
3. "sebareflexia": 2-3 vety, čo mapa odhaľuje. Konkrétne, bez hodnotenia.
4. "rast": pre každý kvadrant 1 konkrétny malý krok, max 1 veta.

Buď stručný. Píš po slovensky. Vráť IBA platný JSON, bez markdownu, presne v tvare:
{"kvadranty":{"UL":{"farby":[{"nazov":"Orange","sila":"silná"}],"zhrnutie":"..."},"UR":{"farby":[],"zhrnutie":"..."},"LL":{"farby":[],"zhrnutie":"..."},"LR":{"farby":[],"zhrnutie":"..."}},"napatia":[{"medzi":["UL","LR"],"farby":["Orange","Blue"],"popis":"..."}],"sebareflexia":"...","rast":{"UL":"...","UR":"...","LL":"...","LR":"..."}}`;

    const userMsg =
`TÉMA: ${topic.trim() || "(nezadaná — analyzuj všeobecne podľa vyplnených kvadrantov)"}
OPTIKA: ${L.full}

JA (UL): ${q.UL.trim() || "(nevyplnené)"}
TO (UR): ${q.UR.trim() || "(nevyplnené)"}
MY (LL): ${q.LL.trim() || "(nevyplnené)"}
ONO (LR): ${q.LR.trim() || "(nevyplnené)"}`;

    try {
      const text = await aiComplete({
        model: "claude-sonnet-4-5",
        max_tokens: 1200,
        system: SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      });
      const parsed = JSON.parse(String(text).replace(/```json/g, "").replace(/```/g, "").trim());
      setResult(parsed); setFlowStep("result");
    } catch (e) {
      setError(aiMsg(e, "Analýzu sa teraz nepodarilo dokončiť. Skús to prosím znova."));
    } finally { setLoading(false); }
  }

  const detail = analyses.find((a) => a.id === detailId);

  // Perzistencia: pri prihlásení načítaj dáta z DB do localStorage, až potom vykresli obsah.
  const [hydrated, setHydrated] = useState(!userId);
  useEffect(() => {
    setUserId(userId || null);
    if (!userId) { setHydrated(true); return; }
    let alive = true;
    setHydrated(false);
    hydrate().finally(() => { if (alive) setHydrated(true); });
    return () => { alive = false; };
  }, [userId]);

  if (!hydrated) {
    return (
      <div className="sa-root">
        <style>{CSS}</style>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, color: "rgba(255,255,255,0.6)", fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
          <Spiral size={28} className="sa-spin" /> Načítavam tvoj priestor…
        </div>
      </div>
    );
  }

  return (
    <div className="sa-root">
      <style>{CSS}</style>
      <div className="sa-shell">

        {/* ---------- Horná lišta ---------- */}
        <header className="sa-topbar">
          <button type="button" className="sa-brand"
            onClick={() => setView("dashboard")} aria-label="MySDL prehľad">
            <img src="/mysdl/mysdl-logo.png" alt="MySDL — Spiral Dynamics Lens" className="sa-brandlogo" />
            <div className="sa-brandtext">
              {view === "dashboard" && <span className="sa-brandsub">Tvoje kvadranty a hodnoty v čase</span>}
              {view === "flow" && (
                <span className="sa-brandsub" style={{ color: L.accent }}>{L.full}</span>
              )}
              {view === "detail" && <span className="sa-brandsub">Uložená analýza</span>}
              {view === "temy" && <span className="sa-brandsub" style={{ color: LENSES.tema.accent }}>Moje témy</span>}
              {view === "progres" && <span className="sa-brandsub" style={{ color: "#2DD4BF" }}>Sledovanie progresu</span>}
              {view === "diag" && <span className="sa-brandsub" style={{ color: "#A78BFA" }}>Diagnostika mojej úrovne</span>}
              {view === "prostredie" && <span className="sa-brandsub" style={{ color: LENSES.prostredie.accent }}>Prostredie · súlad</span>}
            </div>
          </button>

          <div className="sa-topright">
            {(view === "detail" || view === "temy" || view === "progres" || view === "diag" || view === "prostredie") && (
              <button type="button" className="sa-backlink" onClick={() => setView("dashboard")}>← Prehľad</button>
            )}
            {view === "dashboard" && (
              <span className="sa-accesspill"><Spiral size={13} />{accessLabel}</span>
            )}
            <a className="sa-backlink" href="Vstup%20V%C3%BDber%20Re%C5%BEimu.dc.html" title="Späť na výber režimu">Zavrieť</a>
          </div>
        </header>

        {/* ---------- NAVIGÁCIA — prekliky medzi funkciami ---------- */}
        <nav className="sa-nav">
          {[
            { id: "dashboard", label: "Prehľad" },
            { id: "diag", label: "Diagnostika", icon: "/mysdl/icons/diagnostika.png" },
            { id: "kvadranty", label: "Kvadranty", icon: "/mysdl/icons/kvadranty.png" },
            { id: "prostredie", label: "Prostredie", icon: "/mysdl/icons/prostredie.png" },
            { id: "temy", label: "Témy", icon: "/mysdl/icons/temy.png" },
            { id: "progres", label: "Progres a zmena", feature: true, icon: "/mysdl/icons/progres.png" },
          ].map((t) => {
            const activeId = view === "flow" ? (lens === "tema" ? "temy" : lens) : view;
            const on = activeId === t.id;
            return (
              <button key={t.id} type="button" className={"sa-navtab" + (t.icon ? " sa-navtab-icon" : "") + (on ? " is-on" : "") + (t.feature ? " sa-navtab-feature" : "")}
                onClick={() => {
                  if (t.id === "dashboard") setView("dashboard");
                  else if (t.id === "diag") setView("diag");
                  else if (t.id === "kvadranty") startFlow(t.id);
                  else setView(t.id);
                }}>
                {t.icon && <img src={t.icon} alt="" className="sa-navicon" />}
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* ---------- DASHBOARD ---------- */}
        {view === "dashboard" && (
          <Dashboard analyses={analyses} loaded={loaded}
            onStart={startFlow} onOpen={openDetail}
            onOpenTemy={() => setView("temy")} onOpenProgres={() => setView("progres")} onOpenProstredie={() => setView("prostredie")}
            onStartDiag={(txt) => { setDiagInit(txt || ""); setView("diag"); }} />
        )}

        {/* ---------- TÉMY (moje minúlé témy) ---------- */}
        {view === "temy" && (
          <ThemesView analyses={analyses} onOpen={openDetail} onStart={startFlow} />
        )}

        {/* ---------- SLEDOVANIE PROGRESU ---------- */}
        {view === "progres" && (
          <ProgresView analyses={analyses} />
        )}

        {/* ---------- DIAGNOSTIKA MOJEJ ÚROVNE ---------- */}
        {view === "diag" && (
          <DiagView key={diagInit || "g"} initialInput={diagInit} />
        )}

        {/* ---------- PROSTREDIE (súlad úrovne s prostredím) ---------- */}
        {view === "prostredie" && (
          <EnvironmentView onOpenDiag={() => { setDiagInit(""); setView("diag"); }} />
        )}

        {/* ---------- FLOW ---------- */}
        {view === "flow" && flowStep === "quadrants" && (
          <section className="sa-panel">
            <div className="sa-lensline">
              <img src={LENS_ICON[lens]} alt="" className="sa-lenslineicon" />
              <span className="sa-lenslabel" style={{ color: L.accent }}>{L.full}</span>
            </div>

            <label className="sa-lead" htmlFor="topic">Akú tému chceš preskúmať?</label>
            <input id="topic" className="sa-input" value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Zadajte tému, problém, otázku alebo situáciu… (nepovinné)" />
            <div className="sa-examples">
              {EXAMPLES[lens].map((ex) => (
                <button key={ex} type="button" className="sa-ex" onClick={() => setTopic(ex)}>{ex}</button>
              ))}
            </div>

            <div className="sa-quad-layout" style={{ marginTop: 24 }}>
            {lens === "kvadranty" && (
              <div className="sa-mandala-center">
                <QuadrantMandalaKW size="min(94vw, 600px)" src="/mysdl/assets/mandala-cut.png"
                  hoverQuad={flowHoverQuad} onHoverQuad={setFlowHoverQuad}
                  renderQuadPanel={(qi) => { const kk = (KW_QUADS.find((x) => x.q === qi) || {}).code; return kk ? <QuadCellInner k={kk} lens={lens} L={L} q={q} setQ={setQ} /> : null; }} />
              </div>
            )}
            <div style={{minWidth:0}}>
            {lens === "kvadranty" && (
              <p className="sa-diag-hint" style={{ marginTop: 0, marginBottom: 12, textAlign: "center" }}>Prejdi kurzorom po kvadrante nižšie — rozsvieti sa v mandale · v mandale klik označí vrstvu-štvrtinu</p>
            )}
            <QuadrantFrame>
              {ORDER.map((k) => {
                const isPrimary = L.primary.includes(k);
                const isKW = lens === "kvadranty";
                const qhover = isKW && flowHoverQuad === KEY_TO_Q[k];
                return (
                  <div key={k} className={"sa-cell" + (isPrimary ? " is-primary" : "") + (qhover ? " is-qhover" : "")}
                    onMouseEnter={() => { if (isKW) setFlowHoverQuad(KEY_TO_Q[k]); }}
                    onMouseLeave={() => { if (isKW) setFlowHoverQuad(null); }}>
                    <QuadCellInner k={k} lens={lens} L={L} q={q} setQ={setQ} />
                  </div>
                );
              })}
            </QuadrantFrame>
            </div>
            </div>
            {error && <div className="sa-error">{error}</div>}
            <div className="sa-actions sa-actions-split">
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setView("dashboard")}>Zrušiť</button>
              <div className="sa-actions-right">
                {!canAnalyze && <span className="sa-hint">Vyplň aspoň jeden hlavný kvadrant</span>}
                <button type="button" className="sa-btn sa-btn-primary" disabled={!canAnalyze || loading} onClick={analyze}>
                  {loading ? "Analyzujem…" : "Analyzuj"}
                </button>
              </div>
            </div>
            {loading && (
              <div className="sa-loading"><Spiral size={30} className="sa-spin" />
                <span>Čítam tvoje kvadranty a hľadám vzorce…</span></div>
            )}
          </section>
        )}

        {view === "flow" && flowStep === "result" && result && (
          <section className="sa-panel">
            <div className="sa-topicline">
              <span className="sa-topiclabel">Téma</span>
              <span className="sa-topicval">{topic.trim() || "Bez zadanej témy"}</span>
              <span className="sa-lenspill" style={{ color: L.accent, borderColor: L.accent + "66", background: L.accent + "14" }}>{L.label}</span>
            </div>
            <ResultBody result={result} />
            <div className="sa-actions sa-actions-split">
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setFlowStep("quadrants")}>Späť k úprave</button>
              <button type="button" className="sa-btn sa-btn-primary" onClick={saveCurrent}>Uložiť do MySDL</button>
            </div>
          </section>
        )}

        {/* ---------- DETAIL ---------- */}
        {view === "detail" && detail && (
          <DetailView analysis={detail} onDelete={deleteAnalysis} />
        )}
        {view === "detail" && !detail && (
          <section className="sa-panel"><p className="sa-empty-text">Analýza sa nenašla.</p></section>
        )}

      </div>
    </div>
  );
}

/* ---------------- Profil / tracking (voliteľné súhrnné ukazovatele) ---------------- */
function ProfileBody({ analyses }) {
  const { total } = computeProfile(analyses);
  const totalEntries = Object.entries(total).sort((a, b) => b[1] - a[1]);
  const totalSum = totalEntries.reduce((s, [, w]) => s + w, 0);
  const lensCounts = { kvadranty: 0, prostredie: 0, tema: 0 };
  analyses.forEach((a) => { if (lensCounts[a.lens] != null) lensCounts[a.lens]++; });
  return (
    <>
      <Spectrum map={total} height={16} />
      {totalSum > 0 && (
        <div className="sa-toplist">
          {totalEntries.slice(0, 4).map(([name, w]) => (
            <span key={name} className="sa-topitem">
              <span className="sa-dot" style={{ background: SD[name].hex, boxShadow: "0 0 7px " + SD[name].hex + "66" }} />
              <span className="sa-topname">{name}</span>
              <span className="sa-toppct">{Math.round((w / totalSum) * 100)}%</span>
            </span>
          ))}
        </div>
      )}
      <div className="sa-lensmini">
        {Object.keys(LENSES).map((lk) => (
          <span key={lk} className="sa-lensminichip">
            <LensIcon lens={lk} size={13} />
            <span>{LENSES[lk].label}</span>
            <b>{lensCounts[lk]}</b>
          </span>
        ))}
      </div>
    </>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard({ analyses, loaded, onStart, onOpen, onOpenTemy, onOpenProgres, onOpenProstredie, onStartDiag }) {
  const empty = loaded && analyses.length === 0;
  const [showProfile, setShowProfile] = useState(() => { try { return localStorage.getItem("mysdl:showprofile:v1") === "1"; } catch (e) { return false; } });
  function toggleProfile() { setShowProfile((v) => { const nv = !v; try { persist("mysdl:showprofile:v1", nv ? "1" : "0"); } catch (e) { /* ignoruj */ } return nv; }); }

  return (
    <>
      {/* Hodnotový profil — voliteľné súhrnné ukazovatele (skryté, kým ich používateľ nezobrazí) */}
      {!empty && (
        <section className="sa-panel sa-profiledisc">
          <button type="button" className="sa-profiletoggle" onClick={toggleProfile} aria-expanded={showProfile}>
            <span className="sa-persphead-l">
              <span className="sa-persptitle">Tvoj hodnotový profil</span>
              <span className="sa-perspcur">{showProfile ? "Súhrnné ukazovatele naprieč " + analyses.length + " " + (analyses.length === 1 ? "analýzou" : "analýzami") : "Zobraziť súhrnné ukazovatele"}</span>
            </span>
            <span className={"sa-perspchev" + (showProfile ? " is-open" : "")}>▾</span>
          </button>
          {showProfile && <div className="sa-profilebody"><ProfileBody analyses={analyses} /></div>}
        </section>
      )}

      {/* Uvítanie pri prázdnom stave */}
      {empty && (
        <section className="sa-panel sa-welcome">
          <img src="/mysdl/mysdl-logo.png" alt="MySDL" className="sa-welcomelogo" />
          <h2 className="sa-welcomeh">Vitaj v MySDL</h2>
          <p className="sa-welcometext">
            Tvoj osobný priestor pre Špirálovú dynamiku. Analyzuj seba, svoje prostredie
            alebo akúkoľvek tému cez štyri kvadranty — a sleduj, ako sa tvoj hodnotový profil
            skladá v čase. Začni prvou analýzou nižšie.
          </p>
        </section>
      )}

      {/* Osem úrovní vývoja — ikony hlavného rozhrania */}
      <LevelStrip onStartDiag={onStartDiag} />

      {/* Funkcie */}
      <div className="sa-sectionlabel">Funkcie</div>
      <div className="sa-funcs">
        {/* Diagnostika mojej úrovne — hlavná funkcia */}
        <button type="button" className="sa-lens sa-lenswide" style={{ "--acc": "#A78BFA" }} onClick={() => onStartDiag("")}>
          <img src="/mysdl/icons/diagnostika.png" alt="" className="sa-lensicon" />
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4, textAlign: "left" }}>
            <span className="sa-lenstitle">Diagnostika mojej úrovne</span>
            <span className="sa-lensdesc">Cielené otvorené otázky — k tvojej téme alebo všeobecne. Zisti, ako sú u teba zastúpené úrovne vedomia.</span>
          </span>
          <span className="sa-lensgo" style={{ color: "#A78BFA", whiteSpace: "nowrap" }}>Spustiť →</span>
        </button>

        {/* Kvadranty — nový rozbor */}
        <button type="button" className="sa-lens" style={{ "--acc": LENSES.kvadranty.accent }} onClick={() => onStart("kvadranty")}>
          <img src="/mysdl/icons/kvadranty.png" alt="" className="sa-lensicon" />
          <span className="sa-lenstitle">Kvadranty</span>
          <span className="sa-lensdesc">{LENSES.kvadranty.desc}</span>
          <span className="sa-lensgo" style={{ color: LENSES.kvadranty.accent }}>Spustiť →</span>
        </button>

        {/* Prostredie — nový rozbor */}
        <button type="button" className="sa-lens" style={{ "--acc": LENSES.prostredie.accent }} onClick={onOpenProstredie}>
          <img src="/mysdl/icons/prostredie.png" alt="" className="sa-lensicon" />
          <span className="sa-lenstitle">Prostredie</span>
          <span className="sa-lensdesc">{LENSES.prostredie.desc}</span>
          <span className="sa-lensgo" style={{ color: LENSES.prostredie.accent }}>Spustiť →</span>
        </button>

        {/* Témy — moje minúlé témy */}
        <button type="button" className="sa-lens" style={{ "--acc": LENSES.tema.accent }} onClick={onOpenTemy}>
          <img src="/mysdl/icons/temy.png" alt="" className="sa-lensicon" />
          <span className="sa-lenstitle">Témy</span>
          <span className="sa-lensdesc">{LENSES.tema.desc}</span>
          <span className="sa-lensgo" style={{ color: LENSES.tema.accent }}>Otvoriť →</span>
        </button>

        {/* Sledovanie progresu */}
        <button type="button" className="sa-lens" style={{ "--acc": "#2DD4BF" }} onClick={onOpenProgres}>
          <img src="/mysdl/icons/progres.png" alt="" className="sa-lensicon" />
          <span className="sa-lenstitle">Sledovanie progresu</span>
          <span className="sa-lensdesc">Ako sa tvoj hodnotový profil vyvíja v čase.</span>
          <span className="sa-lensgo" style={{ color: "#2DD4BF" }}>Zobraziť →</span>
        </button>
      </div>

      {/* Nedávne analýzy */}
      {!empty && (
        <>
          <div className="sa-sectionlabel">Nedávne analýzy</div>
          <div className="sa-recent">
            {analyses.map((a) => {
              const cols = analysisColors(a).slice(0, 5);
              const Ln = LENSES[a.lens] || LENSES.tema;
              const tn = (a.result && a.result.napatia && a.result.napatia.length) || 0;
              return (
                <button key={a.id} type="button" className="sa-reccard" onClick={() => onOpen(a.id)}>
                  <span className="sa-recicon"><LensIcon lens={a.lens} size={18} color={Ln.accent} /></span>
                  <span className="sa-recmain">
                    <span className="sa-rectopic">{a.topic || "Bez názvu"}</span>
                    <span className="sa-recmeta">
                      <span style={{ color: Ln.accent }}>{Ln.label}</span>
                      <span className="sa-recsep">·</span>
                      <span>{fmtDate(a.createdAt)}</span>
                      {tn > 0 && <><span className="sa-recsep">·</span><span>{tn} napätí</span></>}
                    </span>
                  </span>
                  <span className="sa-recdots">
                    {cols.map((n) => (
                      <span key={n} className="sa-dot" style={{ background: (SD[n] || {}).hex, boxShadow: "0 0 6px " + ((SD[n] || {}).hex || "#555") + "66" }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/* ---------------- Detail uloženej analýzy ---------------- */
function DetailView({ analysis, onDelete }) {
  const [confirm, setConfirm] = useState(false);
  const Ln = LENSES[analysis.lens] || LENSES.tema;
  return (
    <section className="sa-panel">
      <div className="sa-topicline">
        <span className="sa-topiclabel">Téma</span>
        <span className="sa-topicval">{analysis.topic || "Bez zadanej témy"}</span>
        <span className="sa-lenspill" style={{ color: Ln.accent, borderColor: Ln.accent + "66", background: Ln.accent + "14" }}>{Ln.label}</span>
        <span className="sa-detaildate">{fmtDate(analysis.createdAt)}</span>
      </div>
      <ResultBody result={analysis.result} />
      <div className="sa-actions">
        {!confirm ? (
          <button type="button" className="sa-btn sa-btn-danger" onClick={() => setConfirm(true)}>Vymazať</button>
        ) : (
          <div className="sa-actions-right">
            <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setConfirm(false)}>Zrušiť</button>
            <button type="button" className="sa-btn sa-btn-danger" onClick={() => onDelete(analysis.id)}>Potvrdiť vymazanie</button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ============================ ŠTÝL ============================ */
/* ---------------- Témy — moje minulé témy ---------------- */
/* ---------------- Diagnostika mojej úrovne — otvorené otázky ---------------- */
/* ---------------- Prostredie — diagnostika súladu úrovne s prostredím ---------------- */
function EnvironmentView({ onOpenDiag }) {
  const diagRef = useRef(undefined);
  if (diagRef.current === undefined) {
    try { const r = localStorage.getItem("mysdl:diag:v1"); diagRef.current = r ? JSON.parse(r) : null; } catch (e) { diagRef.current = null; }
  }
  const diag = diagRef.current;

  const [topic, setTopic] = useState("");
  const [envText, setEnvText] = useState("");
  const [showQuads, setShowQuads] = useState(false);
  const [quads, setQuads] = useState({ UL: "", UR: "", LL: "", LR: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(() => { try { const r = localStorage.getItem("mysdl:env:v1"); return r ? JSON.parse(r) : null; } catch (e) { return null; } });

  const userTop = diag && diag.urovne
    ? Object.entries(diag.urovne).map(([k, v]) => ({ k, skore: (v && v.skore) || 0 })).sort((a, b) => b.skore - a.skore).filter((x) => x.skore > 0).slice(0, 3)
    : [];

  async function diagnose() {
    if (loading || envText.trim().length < 8) return;
    setLoading(true); setError(null);
    const kbLC = SPIRAL_LEVELS.map((l) => "- " + l.name + " (" + l.key + "): " + SD_KB.levels[l.key].podmienky).join("\n");
    const userTxt = userTop.length
      ? userTop.map((x) => { const L = SPIRAL_LEVELS.find((l) => l.key === x.k); return L.name + " " + x.skore + "%"; }).join(", ")
      : "(diagnostika úrovne zaťaľ nebola vykonaná)";
    const quadTxt = showQuads && Object.values(quads).some((v) => v.trim())
      ? "\n\nKONTEXT CEZ KW KVADRANTY:\nJA (UL): " + (quads.UL.trim() || "-") + "\nTO (UR): " + (quads.UR.trim() || "-") + "\nMY (LL): " + (quads.LL.trim() || "-") + "\nONO (LR): " + (quads.LR.trim() || "-")
      : "";
    const SYSTEM = `Si sprievodca Špirálovou dynamikou (SD). Diagnostikuj SÚLAD medzi úrovňou používateľa a jeho PROSTREDÍM (životnými podmienkami).
Životné podmienky, na ktoré reaguje každá úroveň:
${kbLC}
Kľúče úrovní (názov presne jedno z): Beige, Purple, Red, Blue, Orange, Green, Yellow, Turquoise.
Postup:
1. Z opisu prostredia odhadni, ktoré úrovne prostredie VYŽADUJE a ODMEŇUJE ("prostredieUrovne": 1-3 položky {"nazov":"<Názov>","sila":"silná|prítomná"}).
2. Porovnaj s úrovňou používateľa a urči "suladSkore" 0-100 (ako veľmi si úroveň používateľa a nároky prostredia sadnú).
3. "zhrnutie": 2 vety o celkovom súlade.
4. "sedia": 1-2 vety — kde je súlad, čo funguje.
5. "trenie": 1-2 vety — kde vzniká trenie / nesúlad.
6. "tipy": 2-3 konkrétne kroky (adaptovať seba alebo formovať prostredie).
Píš po slovensky, tykaj, konkrétne, bez hodnotenia. Vráť IBA platný JSON bez markdownu:
{"prostredieUrovne":[{"nazov":"Orange","sila":"silná"}],"suladSkore":62,"zhrnutie":"...","sedia":"...","trenie":"...","tipy":["...","..."]}`;
    const userMsg = (topic.trim() ? "TÉMA: " + topic.trim() + "\n\n" : "") + "ÚROVEŇ POUŽÍVATEĽA (z diagnostiky): " + userTxt + "\n\nOPIS PROSTREDIA:\n" + envText.trim() + quadTxt;
    try {
      const text = await aiComplete({ model: "claude-sonnet-4-5", max_tokens: 1200, system: SYSTEM, messages: [{ role: "user", content: userMsg }] });
      const parsed = JSON.parse(String(text).replace(/```json/g, "").replace(/```/g, "").trim());
      const rec = { topic: topic.trim() || null, createdAt: new Date().toISOString(), userTop: userTop.map((x) => ({ k: x.k, skore: x.skore })), ...parsed };
      setResult(rec);
      try { persist("mysdl:env:v1", JSON.stringify(rec)); } catch (e) { /* ignoruj */ }
    } catch (e) { setError(aiMsg(e, "Diagnostiku súladu sa teraz nepodarilo dokončiť. Skús to prosím znova.")); }
    finally { setLoading(false); }
  }

  const canDiag = envText.trim().length >= 8;
  const sk = result ? Math.max(0, Math.min(100, result.suladSkore || 0)) : 0;
  const skColor = sk >= 66 ? "#4ADE80" : sk >= 40 ? "#FACC15" : "#F87171";

  return (
    <section className="sa-panel">
      <div className="sa-viewhead">
        <div className="sa-viewheadmain">
          <img src="/mysdl/icons/prostredie.png" alt="" className="sa-heroicon" />
          <div>
            <h2 className="sa-heroh">Prostredie</h2>
            <p className="sa-herosub">Súlad medzi tvojou úrovňou a životnými podmienkami</p>
          </div>
        </div>
        {result && <button type="button" className="sa-btn sa-btn-ghost" onClick={() => { setResult(null); setError(null); }}>Nová diagnostika</button>}
      </div>

      {!result && (
        <>
          <label className="sa-lead" htmlFor="env-topic">Téma (nepovinné)</label>
          <input id="env-topic" className="sa-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Napr. Náš tím, Rodinná dynamika, Firemná kultúra…" />
          <div className="sa-examples">
            {EXAMPLES.prostredie.map((ex) => (<button key={ex} type="button" className="sa-ex" onClick={() => setTopic(ex)}>{ex}</button>))}
          </div>

          <label className="sa-lead" htmlFor="env-desc" style={{ marginTop: 18 }}>Opíš svoje prostredie</label>
          <p className="sa-diag-hint" style={{ marginTop: 4 }}>Čo sa v ňom cení a odmeňuje, aké sú nehovorené pravidlá, čo sa od teba očakáva. Z toho odhadnem, aké úrovne prostredie vyžaduje — a ako sadnú s tvojou úrovňou.</p>
          <textarea id="env-desc" className="sa-area" rows={5} value={envText} onChange={(e) => setEnvText(e.target.value)} placeholder="Napr. V práci sa cení hlavne výkon a čísla — kto dodá výsledok. Pravidlá sú vágne a mení sa podľa toho, kto má navrch." />

          <button type="button" className="sa-quadtoggle" onClick={() => setShowQuads((v) => !v)} aria-expanded={showQuads}>
            <LensIcon lens="kvadranty" size={15} />
            <span>{showQuads ? "Skryť kvadranty Ken Wilbera" : "Zobraziť kvadranty Ken Wilbera"}</span>
            <span className="sa-hintmuted">volitelné</span>
            <span className={"sa-perspchev" + (showQuads ? " is-open" : "")} style={{ marginLeft: "auto" }}>▾</span>
          </button>
          {showQuads && (
            <div style={{ marginTop: 14 }}>
              <p className="sa-diag-hint" style={{ marginTop: 0, marginBottom: 12 }}>Nepovinný kontext cez štyri Wilberove kvadranty — ak vyplníš, spresní diagnostiku súladu.</p>
              <QuadrantFrame>
                {ORDER.map((k) => (
                  <div key={k} className="sa-cell">
                    <div className="sa-cellhead">
                      <span className="sa-cellname">{QUADS[k].name}</span>
                      <span className="sa-cellcode">{QUADS[k].en || QUADS[k].code}</span>
                    </div>
                    <p className="sa-cellq">{QQ.prostredie[k].q}</p>
                    <textarea className="sa-area" rows={3} value={quads[k]} placeholder={QQ.prostredie[k].ph} onChange={(e) => setQuads({ ...quads, [k]: e.target.value })} />
                  </div>
                ))}
              </QuadrantFrame>
            </div>
          )}

          {!diag && (
            <div className="sa-envnote">Pre presný súlad najprv spusti <button type="button" className="sa-linklike" onClick={() => onOpenDiag && onOpenDiag()}>Diagnostiku mojej úrovne</button>. Bez nej odhadnem hlavne nároky prostredia.</div>
          )}
          {error && <div className="sa-error">{error}</div>}
          <div className="sa-actions sa-actions-split" style={{ marginTop: 16 }}>
            <span className="sa-hint">{canDiag ? (diag ? "Porovnám s tvojou úrovňou" : "Opíš prostredie čo najkonkrétnejšie") : "Opíš prostredie (aspoň pár viet)"}</span>
            <button type="button" className="sa-btn sa-btn-primary" disabled={!canDiag || loading} onClick={diagnose}>{loading ? "Diagnostikujem…" : "Diagnostikovať súlad"}</button>
          </div>
          {loading && <div className="sa-loading"><Spiral size={28} className="sa-spin" /><span>Porovnávam nároky prostredia s tvojou úrovňou…</span></div>}
        </>
      )}

      {result && (
        <>
          <div className="sa-topicline">
            <span className="sa-topiclabel">Téma</span>
            <span className="sa-topicval">{result.topic || "Bez zadanej témy"}</span>
            <span className="sa-lenspill" style={{ color: LENSES.prostredie.accent, borderColor: LENSES.prostredie.accent + "66", background: LENSES.prostredie.accent + "14" }}>Prostredie</span>
          </div>

          <div className="sa-suladbox">
            <div className="sa-suladring" style={{ background: "conic-gradient(" + skColor + " " + (sk * 3.6) + "deg, rgba(255,255,255,0.08) 0deg)" }}>
              <div className="sa-suladinner"><span style={{ color: skColor }}>{sk}%</span><em>súlad</em></div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sa-suladlabel">Súlad úrovne s prostredím</div>
              {result.zhrnutie && <p className="sa-lvrowbody" style={{ marginTop: 4 }}>{result.zhrnutie}</p>}
            </div>
          </div>

          <div className="sa-quadtrack-title" style={{ marginTop: 18, marginBottom: 8 }}>Prostredie vyžaduje úrovne</div>
          <div className="sa-chipwrap">
            {(result.prostredieUrovne || []).map((r, i) => (<Chip key={i} name={r.nazov} />))}
          </div>
          {(result.userTop || userTop).length > 0 && (
            <>
              <div className="sa-quadtrack-title" style={{ marginTop: 14, marginBottom: 8 }}>Tvoja úroveň (z diagnostiky)</div>
              <div className="sa-chipwrap">
                {(result.userTop || userTop).map((x, i) => { const en = x.k.charAt(0).toUpperCase() + x.k.slice(1); return <Chip key={i} name={en} />; })}
              </div>
            </>
          )}

          {result.sedia && (<div className="sa-lvrow" style={{ marginTop: 14 }}><span className="sa-lvrowtitle" style={{ color: "#4ADE80" }}>Kde ste v súlade</span><p className="sa-lvrowbody">{result.sedia}</p></div>)}
          {result.trenie && (<div className="sa-lvrow"><span className="sa-lvrowtitle" style={{ color: "#F87171" }}>Kde vzniká trenie</span><p className="sa-lvrowbody">{result.trenie}</p></div>)}
          {result.tipy && result.tipy.length > 0 && (
            <>
              <div className="sa-quadtrack-title" style={{ marginTop: 14, marginBottom: 6 }}>Ako zlepšiť súlad</div>
              <ul className="sa-planlist">{result.tipy.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </>
          )}
          <p className="sa-diag-hint" style={{ marginTop: 16, marginBottom: 0 }}>Diagnostika súladu je uložená. Kvadranty Ken Wilbera si môžeš pri novej diagnostike voliteľne zobraziť pod textovým oknom.</p>
        </>
      )}
    </section>
  );
}

/* Holistický, na komplexitu kalibrovaný pohľad na jednu bunku (úroveň × kvadrant) mandaly.
   Profil (skóre+relevancia všetkých 8 úrovní) dáva modelu kontext na kalibráciu jazyka a na
   previazanie s ostatnými kvadrantmi/úrovňami — bez toho, aby sme čokoľvek posielali navyše
   z pôvodných otvorených odpovedí (tie sa ani nepersistujú).

   Referenčný vzor "lazy per-cell enrichment" (pozri roadmapu v pláne
   ideme-vylep-i-a-za-a-harmonic-penguin.md) — pri ďalšom mieste, ktoré potrebuje to isté
   (napr. Prostredie kvadrant upgrade), kopírovať tento tvar, nie vymýšľať nový:
   1. cache kľúč = `<os1>:<os2>` (tu levelKey:quadCode),
   2. efekt viazaný na vybranú položku (tu qseg) je no-op, ak je už v cache,
   3. fetch vracia tvar `{ text, relevant }`,
   4. merge do vnoreného `<x>Detail` objektu a re-perzistovať CELÝ top-level záznam pod tým
      istým kľúčom (pozri useEffect v DiagView, ktorý toto volá).
   Hook/abstrakciu z toho extrahovať až pri 2. reálnom konzumentovi, nie skôr. */
async function fetchQuadCellDetail({ tema, urovne, levelKey, quadCode }) {
  const levelName = (SPIRAL_LEVELS.find((l) => l.key === levelKey) || {}).name || levelKey;
  const quadMeta = KW_QUADS.find((x) => x.code === quadCode) || {};
  const profileLines = KW_LEVEL_KEYS.map((k) => {
    const u = (urovne && urovne[k]) || {};
    const nm = (SPIRAL_LEVELS.find((l) => l.key === k) || {}).name || k;
    return "- " + nm + ": " + Math.round(u.skore || 0) + "%" + (u.relevant === false ? " (nepodstatné pre túto tému)" : "");
  }).join("\n");

  const SYSTEM = `Si integratívny sprievodca Špirálovou dynamikou (SD) a Wilberovými kvadrantami.
Dostaneš celkový profil zastúpenia 8 úrovní SD u človeka a jednu konkrétnu bunku (úroveň × kvadrant), ktorú si vybral na detailný pohľad.

Kvadranty: UL "Ja" = vnútro (hodnoty, presvedčenia, motívy) · UR "To" = správanie (činy, výkon) · LL "My" = kultúra (normy, vzťahy) · LR "Ono" = systémy (štruktúry, pravidlá).

PROFIL POUŽÍVATEĽA (orientačné zastúpenie úrovní):
${profileLines}
${tema ? "TÉMA: " + tema : "Diagnostika je všeobecná (bez konkrétnej témy)."}

VYBRANÁ BUNKA: úroveň "${levelName}" × kvadrant "${quadMeta.name}" (${quadMeta.dim}).

Úloha:
1. 2-4 vety o tom, ako sa TÁTO úroveň prejavuje KONKRÉTNE cez optiku "${quadMeta.dim}" (nie všeobecný opis úrovne).
2. Podaj to HOLISTICKY — naznač prepojenie/napätie s ostatnými kvadrantmi tej istej úrovne, alebo s úrovňami, ktoré v profile prevažujú.
3. KALIBRUJ zložitosť jazyka podľa profilu: ak prevažujú beige/purple/red/blue/orange, píš prakticky, konkrétne, krátke vety. Ak sú v profile silné yellow/turquoise, môžeš použiť systémový/paradoxný jazyk (viac platných pohľadov naraz).
4. NIKDY nepomenuj používateľovi jeho úroveň nálepkou ("si oranžový" a pod.).
5. Ak táto úroveň v tomto kvadrante nie je pre človeka/tému podstatná, "relevant": false a text nechaj stručný.
Píš po slovensky, tykaj, bez markdownu. Vráť IBA platný JSON: {"text":"...","relevant":true}`;

  const text = await aiRetry({ max_tokens: 400, system: SYSTEM, messages: [{ role: "user", content: "Vyhodnoť bunku " + levelName + " × " + quadMeta.name + "." }] });
  const parsed = JSON.parse(String(text).replace(/```json/g, "").replace(/```/g, "").trim());
  return { text: parsed.text || "", relevant: parsed.relevant !== false };
}

function QuadLevelDetail({ qseg, result, cellLoadingKey, cellError, onRetryCell }) {
  const A = (typeof window !== "undefined" && SDL_ASSETS) || {};
  const IC = A.ICONS || {};
  const lk = KW_LEVEL_KEYS[qseg.r - 1];
  const L = SPIRAL_LEVELS.find((x) => x.key === lk);
  const Q = KW_QUADS.find((x) => x.q === qseg.q);
  const kb = SD_KB.levels[lk] || {};
  const dd = result && result.urovne ? result.urovne[lk] : null;
  const skore = dd ? Math.max(0, Math.min(100, dd.skore || 0)) : 0;
  const cellKey = lk + ":" + Q.code;
  const isLoadingThis = cellLoadingKey === cellKey;
  const errThis = cellError && cellError.key === cellKey ? cellError.msg : null;
  const kvadDetail = dd && dd.kvadDetail ? dd.kvadDetail[Q.code] : null;
  const lensTxt = {
    2: "Vnútorne (Ja) — v hodnotách, presvedčeniach a motívoch",
    3: "V správaní (To) — v činoch a tom, čo je vidieť navonok",
    1: "Vo vzťahoch (My) — v kultúre, jazyku a spolupatričnosti",
    0: "V systémoch (Ono) — v štruktúrach, procesoch a prostredí",
  }[qseg.q];
  const ctx = result && result.tema ? "V téme „" + result.tema + "“" : "V celkovej diagnostike";
  const body = kvadDetail && kvadDetail.text ? kvadDetail.text : (dd && dd.text ? dd.text : (kb.prejavy || ""));
  const bodyLabel = kvadDetail && kvadDetail.text ? "Integratívny pohľad na tento kvadrant" : "Ako sa prejavuje v tomto kvadrante";
  const rows = [
    [bodyLabel, body],
    ["Silné stránky", kb.silne],
    ["Priestor pre integráciu", kb.slepe],
    ["Tiene", kb.tiene],
  ];
  return (
    <div className="sa-lvdetail" style={{ borderColor: L.clr + "33", borderLeftColor: L.clr + "88" }}>
      <div className="sa-lvdetail-head">
        <img src={IC[lk] || ""} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", boxShadow: "0 0 10px " + L.glow }} />
        <div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: L.clr }}>{Q.name} · {L.name}</div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{kvadDetail && kvadDetail.text ? "" : lensTxt}</div>
        </div>
        <span style={{ marginLeft: "auto", fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{skore}%</span>
      </div>
      <p className="sa-diag-hint" style={{ margin: "0 0 8px" }}>{ctx} · kvadrant {Q.name} ({Q.dim}).</p>
      {isLoadingThis && (
        <div className="sa-loading"><Spiral size={24} className="sa-spin" /><span>Pripravujem integratívny pohľad…</span></div>
      )}
      {errThis && (
        <div className="sa-error">{errThis} <button type="button" className="sa-btn sa-btn-ghost" onClick={onRetryCell}>Skúsiť znova</button></div>
      )}
      {!isLoadingThis && rows.map(([t, b]) => b ? (
        <div key={t} className="sa-lvrow"><span className="sa-lvrowtitle" style={{ color: L.clr }}>{t}</span><p className="sa-lvrowbody">{b}</p></div>
      ) : null)}
    </div>
  );
}

function DiagView({ initialInput }) {
  const A = (typeof window !== "undefined" && SDL_ASSETS) || {};
  const IC = A.ICONS || {};
  const AX = A.AXIS_ICONS || {};
  const storedRef = useRef(undefined);
  if (storedRef.current === undefined) {
    try { const r = localStorage.getItem("mysdl:diag:v1"); storedRef.current = r ? JSON.parse(r) : null; } catch (e) { storedRef.current = null; }
  }
  const [dstep, setDstep] = useState(() => (initialInput ? "input" : (storedRef.current ? "vysledok" : "input")));
  const [dinput, setDinput] = useState(initialInput || "");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(storedRef.current);
  const [selKey, setSelKey] = useState(null);
  const [showQuadView, setShowQuadView] = useState(false);
  const [qseg, setQseg] = useState(null);
  const [cellLoadingKey, setCellLoadingKey] = useState(null); // "beige:UL" kým beží fetch
  const [cellError, setCellError] = useState(null); // { key, msg } | null
  const [retryTick, setRetryTick] = useState(0);

  const hasTopic = dinput.trim().length > 0;
  const answered = answers.filter((a) => a.trim().length > 0).length;

  async function genQuestions() {
    if (loading) return;
    setLoading(true); setError(null);
    const tema = dinput.trim();
    const SYSTEM = `Si skúsený sprievodca sebapoznávaním vychádzajúci zo Špirálovej dynamiky. Navrhni 4 OTVORENÉ diagnostické otázky.
Prísne pravidlá:
- Otázky NESMÚ byť sugestívne — nenaznačuj želanú odpoveď, nepomenúvaj úrovne, farby ani teóriu.
- Každá otázka skúma iný aspekt: hodnoty a motivácia; reakcia na tlak alebo konflikt; vzťah k pravidlám a autorite; vzťahy a spolupatričnosť; zmysel a smerovanie.
- Pýtaj sa na konkrétne prežívanie a správanie („Opíš situáciu…“, „Čo robíš, keď…“), nie na abstraktné názory.
- Píš po slovensky, tykaj, každá otázka max 2 vety.
${tema ? '- Otázky viaž na tému používateľa: „' + tema + '“.' : '- Téma nie je zadaná — otázky smeruj všeobecne na život, prácu a rozhodovanie.'}
Vráť IBA platný JSON bez markdownu: {"otazky":["...","...","...","..."]}`;
    try {
      const text = await aiRetry({ model: "claude-sonnet-4-5", max_tokens: 600, system: SYSTEM, messages: [{ role: "user", content: tema || "(všeobecná diagnostika)" }] });
      const parsed = JSON.parse(String(text).replace(/```json/g, "").replace(/```/g, "").trim());
      const qs = (parsed.otazky || []).slice(0, 5);
      if (!qs.length) throw new Error("empty");
      setQuestions(qs); setAnswers(qs.map(() => "")); setDstep("questions");
    } catch (e) { setError(aiMsg(e, "Otázky sa nepodarilo pripraviť — server je možno chvíľu preťažený. Skús to prosím o chvíľu znova.")); }
    finally { setLoading(false); }
  }

  async function evaluate() {
    if (loading || answered < 2) return;
    setLoading(true); setError(null);
    const tema = dinput.trim();
    const SYSTEM = `Si diagnostik Špirálovej dynamiky (SD). Dostaneš otvorené otázky a odpovede používateľa. Odhadni zastúpenie hodnotových úrovní.
Kľúče úrovní (presne): beige, purple, red, blue, orange, green, yellow, turquoise.
Pre KAŽDÚ z 8 úrovní vráť: "skore" 0-100 (miera zastúpenia v odpovediach), "text" 1-2 vety po slovensky — konkrétne z odpovedí, bez hodnotenia a diagnóz, tykaj, a "relevant" (true/false) — či je paradigma tejto úrovne PODSTATNÁ pre tému${tema ? '' : ' (téma nie je zadaná → daj vždy true)'}. relevant=false znamená, že úroveň sa v odpovediach objavila, ale pre túto tému nie je nosná. Ak sa úroveň neprejavila, daj nízke skore a opatrný text.
Navyše pre každú úroveň priraď "kvadranty": {"UL":bool,"UR":bool,"LL":bool,"LR":bool} — či sa daná úroveň v odpovediach prejavuje práve v tomto rozmere (UL=hodnoty/motívy, UR=správanie/činy, LL=kultúra/vzťahy, LR=systémy/pravidlá). Ak si neistý, nechaj všetky 4 rovnaké ako "relevant".
Pridaj "zhrnutie" (2-3 vety o ťažisku${tema ? ' vo vzťahu k téme' : ''}).
Vráť IBA platný JSON bez markdownu: {"urovne":{"beige":{"skore":35,"text":"...","relevant":true,"kvadranty":{"UL":true,"UR":true,"LL":true,"LR":true}},"purple":{"skore":0,"text":"...","relevant":true,"kvadranty":{"UL":true,"UR":true,"LL":true,"LR":true}},"red":{"skore":0,"text":"...","relevant":true,"kvadranty":{"UL":true,"UR":true,"LL":true,"LR":true}},"blue":{"skore":0,"text":"...","relevant":true,"kvadranty":{"UL":true,"UR":true,"LL":true,"LR":true}},"orange":{"skore":0,"text":"...","relevant":true,"kvadranty":{"UL":true,"UR":true,"LL":true,"LR":true}},"green":{"skore":0,"text":"...","relevant":true,"kvadranty":{"UL":true,"UR":true,"LL":true,"LR":true}},"yellow":{"skore":0,"text":"...","relevant":true,"kvadranty":{"UL":true,"UR":true,"LL":true,"LR":true}},"turquoise":{"skore":0,"text":"...","relevant":true,"kvadranty":{"UL":true,"UR":true,"LL":true,"LR":true}}},"zhrnutie":"..."}`;
    const lines = questions.map((q, i) => "OTÁZKA " + (i + 1) + ": " + q + "\nODPOVEĎ: " + (answers[i].trim() || "(bez odpovede)")).join("\n\n");
    const userMsg = (tema ? "TÉMA: " + tema + "\n\n" : "") + lines;
    try {
      const text = await aiRetry({ model: "claude-sonnet-4-5", max_tokens: 1800, system: SYSTEM, messages: [{ role: "user", content: userMsg }] });
      const parsed = JSON.parse(String(text).replace(/```json/g, "").replace(/```/g, "").trim());
      const rec = { tema: tema || null, createdAt: new Date().toISOString(), urovne: parsed.urovne || {}, zhrnutie: parsed.zhrnutie || "" };
      setResult(rec); setSelKey(null); setDstep("vysledok");
      try { persist("mysdl:diag:v1", JSON.stringify(rec)); } catch (e) { /* ignoruj */ }
    } catch (e) { setError(aiMsg(e, "Vyhodnotenie sa nepodarilo — server je možno chvíľu preťažený. Skús to prosím o chvíľu znova.")); }
    finally { setLoading(false); }
  }

  const selLvl = selKey ? SPIRAL_LEVELS.find((l) => l.key === selKey) : null;
  const selData = selLvl && result && result.urovne ? result.urovne[selLvl.key] : null;
  const diagScores = {};
  if (result && result.urovne) SPIRAL_LEVELS.forEach((l) => { diagScores[l.key] = (result.urovne[l.key] && result.urovne[l.key].skore) || 0; });
  // relevancia úrovní k téme → stav "absent" na KW mandale (per kvadrant, s fallbackom na per-úroveň relevant pre staré záznamy)
  const segRelevant = (result && result.urovne)
    ? ((q, r) => {
        const u = result.urovne[KW_LEVEL_KEYS[r - 1]];
        if (!u) return true;
        const code = (KW_QUADS.find((x) => x.q === q) || {}).code;
        if (u.kvadranty && code && u.kvadranty[code] != null) return u.kvadranty[code] !== false;
        return u.relevant !== false;
      })
    : null;

  // Lazy holistický pohľad na vybranú bunku (level×kvadrant): fetchne sa len raz na bunku,
  // výsledok sa cachuje do result.urovne[lk].kvadDetail[code] a re-perzistuje do mysdl:diag:v1.
  useEffect(() => {
    if (!qseg || !result || !result.urovne) return;
    const lk = KW_LEVEL_KEYS[qseg.r - 1];
    const quadCode = (KW_QUADS.find((x) => x.q === qseg.q) || {}).code;
    const dd = result.urovne[lk];
    if (!dd || !quadCode) return;
    if (dd.kvadDetail && dd.kvadDetail[quadCode]) return; // už cachované
    const cellKey = lk + ":" + quadCode;
    if (cellLoadingKey === cellKey) return; // už beží
    setCellLoadingKey(cellKey); setCellError(null);
    fetchQuadCellDetail({ tema: result.tema, urovne: result.urovne, levelKey: lk, quadCode })
      .then((data) => {
        setResult((prev) => {
          if (!prev || !prev.urovne || !prev.urovne[lk]) return prev;
          const nextLvl = { ...prev.urovne[lk], kvadDetail: { ...(prev.urovne[lk].kvadDetail || {}), [quadCode]: data } };
          const next = { ...prev, urovne: { ...prev.urovne, [lk]: nextLvl } };
          try { persist("mysdl:diag:v1", JSON.stringify(next)); } catch (e) { /* ignoruj */ }
          return next;
        });
      })
      .catch((e) => setCellError({ key: cellKey, msg: aiMsg(e, "Integratívny pohľad sa nepodarilo pripraviť. Skús to znova.") }))
      .finally(() => setCellLoadingKey((k) => (k === cellKey ? null : k)));
    // eslint-disable-next-line
  }, [qseg, result, retryTick]);

  function retryCell() { setCellError(null); setRetryTick((t) => t + 1); }

  return (
    <section className="sa-panel">
      <div className="sa-viewhead">
        <div className="sa-viewheadmain">
          <img src="/mysdl/icons/diagnostika.png" alt="" className="sa-heroicon" />
          <div>
            <h2 className="sa-heroh">Diagnostika mojej úrovne</h2>
            <p className="sa-herosub">
              {dstep === "input" && "Otvorené otázky — bez návodných odpovedí"}
              {dstep === "questions" && (hasTopic ? "Otázky k téme „" + dinput.trim() + "“" : "Všeobecné otázky")}
              {dstep === "vysledok" && result && (result.tema ? "Téma „" + result.tema + "“ · " + fmtDate(result.createdAt) : "Všeobecná diagnostika" + (result.createdAt ? " · " + fmtDate(result.createdAt) : ""))}
            </p>
          </div>
        </div>
        {dstep === "vysledok" && (
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => { setDstep("input"); setError(null); }}>Nová diagnostika</button>
        )}
      </div>

      {dstep === "input" && (
        <>
          <label className="sa-lead" htmlFor="diag-tema">Čoho sa má diagnostika týkať?</label>
          <input id="diag-tema" className="sa-input" value={dinput} autoFocus
            onChange={(e) => setDinput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") genQuestions(); }}
            placeholder="Zadaj tému — alebo nechaj prázdne pre všeobecnú diagnostiku…" />
          <p className="sa-diag-hint" style={{ marginTop: 12 }}>
            Pripravím štyri otvorené otázky {hasTopic ? "k tvojej téme" : "o tvojom živote a rozhodovaní"}. Nebudú sugestívne — neexistujú správne odpovede. Z tvojich odpovedí potom odhadnem, ako sú u teba zastúpené jednotlivé úrovne.
          </p>
          {error && <div className="sa-error">{error}</div>}
          <div className="sa-actions">
            <button type="button" className="sa-btn sa-btn-primary" disabled={loading} onClick={genQuestions}>
              {loading ? "Pripravujem otázky…" : (hasTopic ? "Pripraviť otázky k téme" : "Pripraviť všeobecné otázky")}
            </button>
          </div>
          {loading && <div className="sa-loading"><Spiral size={28} className="sa-spin" /><span>Zostavujem nesugestívne otázky…</span></div>}
        </>
      )}

      {dstep === "questions" && (
        <>
          {questions.map((q, i) => (
            <div key={i} className="sa-qcard">
              <div className="sa-qnum">Otázka {i + 1} / {questions.length}</div>
              <p className="sa-qtext">{q}</p>
              <textarea className="sa-area" rows={3} value={answers[i]}
                placeholder="Píš voľne — konkrétne situácie povedia najviac…"
                onChange={(e) => { const next = answers.slice(); next[i] = e.target.value; setAnswers(next); }} />
            </div>
          ))}
          {error && <div className="sa-error">{error}</div>}
          <div className="sa-actions sa-actions-split">
            <button type="button" className="sa-btn sa-btn-ghost" onClick={() => { setDstep("input"); setError(null); }}>Späť</button>
            <div className="sa-actions-right">
              {answered < 2 && <span className="sa-hint">Odpovedz aspoň na dve otázky</span>}
              <button type="button" className="sa-btn sa-btn-primary" disabled={answered < 2 || loading} onClick={evaluate}>
                {loading ? "Vyhodnocujem…" : "Vyhodnotiť (" + answered + "/" + questions.length + ")"}
              </button>
            </div>
          </div>
          {loading && <div className="sa-loading"><Spiral size={28} className="sa-spin" /><span>Čítam tvoje odpovede a hľadám vzorce…</span></div>}
        </>
      )}

      {dstep === "vysledok" && result && (
        <>
          {result.zhrnutie && <blockquote className="sa-reflect" style={{ marginBottom: 18 }}>{result.zhrnutie}</blockquote>}
          <div className="sa-h2" style={{ marginTop: 0 }}>Zastúpenie úrovní · klikni na úroveň</div>
          <p className="sa-diag-hint" style={{ marginTop: 0, marginBottom: 14 }}>Vrchný rad — Express (JA) · spodný rad — Deny (MY), v pároch ako v „Osem úrovní vývoja". Výška stĺpca = zastúpenie úrovne.</p>
          <div className="sa-dgridscroll">
            <div className="sa-dgrid">
              {SPIRAL_LEVELS.map((l, i) => {
                const d = (result.urovne && result.urovne[l.key]) || { skore: 0, text: "" };
                const on = selKey === l.key;
                const skore = Math.max(0, Math.min(100, d.skore || 0));
                const isExp = l.axis === "express";
                const topSrc = isExp ? (IC[l.key] || "") : (AX[l.key] || "");
                const botSrc = isExp ? (AX[l.key] || "") : (IC[l.key] || "");
                const topSize = isExp ? 40 : 28, botSize = isExp ? 28 : 40;
                const topOp = (isExp ? 0.45 : 0.32) + skore / 100 * (isExp ? 0.55 : 0.4);
                const botOp = (isExp ? 0.32 : 0.45) + skore / 100 * (isExp ? 0.4 : 0.55);
                return (
                  <React.Fragment key={l.key}>
                    <button type="button" className={"sa-dcell" + (on ? " is-sel" : "")} style={{ gridColumn: i + 1, gridRow: 1, "--lvl": l.clr }} onClick={() => setSelKey(on ? null : l.key)} title={l.name}>
                      <img src={topSrc} alt="" style={{ width: topSize, height: topSize, borderRadius: "50%", objectFit: "cover", opacity: topOp, filter: "drop-shadow(0 0 " + (2 + skore / 14) + "px " + l.glow + ")" }} />
                    </button>
                    <button type="button" className={"sa-dcell" + (on ? " is-sel" : "")} style={{ gridColumn: i + 1, gridRow: 2, "--lvl": l.clr }} onClick={() => setSelKey(on ? null : l.key)} title={l.name}>
                      <img src={botSrc} alt="" style={{ width: botSize, height: botSize, borderRadius: "50%", objectFit: "cover", opacity: botOp, filter: "drop-shadow(0 0 " + (2 + skore / 14) + "px " + l.glow + ")" }} />
                    </button>
                    <div className="sa-dcellname" style={{ gridColumn: i + 1, gridRow: 3, color: on ? l.clr : "rgba(200,190,178,0.72)" }}>{l.name}</div>
                    <button type="button" className={"sa-dvbar" + (on ? " is-sel" : "")} style={{ gridColumn: i + 1, gridRow: 4 }} onClick={() => setSelKey(on ? null : l.key)} title={l.name + " · " + skore + " %"}>
                      <span className="sa-dvbar-track" style={{ boxShadow: on ? "0 0 0 2px " + l.clr + "88" : "none" }}><span className="sa-dvbar-fill" style={{ height: Math.max(4, skore) + "%", background: l.clr, boxShadow: "0 -2px 8px " + l.glow }} /></span>
                      <span className="sa-dvbar-pct" style={{ color: on ? l.clr : "rgba(255,255,255,0.6)" }}>{skore}%</span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
          {selLvl && selData && (
            <div className="sa-lvcard" style={{ marginTop: 14, background: "linear-gradient(135deg," + selLvl.clr + "12,rgba(10,10,18,0.82))", borderColor: selLvl.clr + "30", borderLeftColor: selLvl.clr + "66" }}>
              <img src={IC[selLvl.key] || ""} alt="" style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover", flex: "none", boxShadow: "0 0 12px " + selLvl.glow }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: selLvl.clr }}>{selLvl.name}</span>
                  <span style={{ fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{selLvl.motto}</span>
                  <span style={{ marginLeft: "auto", fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{Math.max(0, Math.min(100, selData.skore || 0))}%</span>
                </div>
                <p style={{ fontFamily: "Georgia,serif", fontSize: 14, fontWeight: 300, lineHeight: 1.65, color: "rgba(221,221,221,0.85)", margin: 0 }}>{selData.text}</p>
              </div>
            </div>
          )}

          <button type="button" className="sa-quadtoggle" style={{ marginTop: 18 }} onClick={() => setShowQuadView((v) => !v)} aria-expanded={showQuadView}>
            <LensIcon lens="kvadranty" size={15} />
            <span>{showQuadView ? "Skryť kvadranty Ken Wilbera" : "Zobraziť v kvadrantoch Ken Wilbera"}</span>
            <span className="sa-hintmuted">volitelné</span>
            <span className={"sa-perspchev" + (showQuadView ? " is-open" : "")} style={{ marginLeft: "auto" }}>▾</span>
          </button>
          {showQuadView && (
            <div style={{ marginTop: 14 }}>
              <p className="sa-diag-hint" style={{ marginTop: 0, marginBottom: 10, textAlign: "center" }}>Zastúpené časti sú svetelne zvýraznené. Klikni na štvrtinu-úroveň pre popis {result.tema ? "v téme „" + result.tema + "“" : "v tvojej diagnostike"}.</p>
              <div className="sa-mandala-center">
                <QuadrantMandalaKW mode="diagnose" size="min(94vw, 560px)" src="/mysdl/assets/mandala-cut.png"
                  levelScores={diagScores} segRelevant={segRelevant} selectedSeg={qseg} onSelectSegment={setQseg} />
              </div>
              {qseg && <QuadLevelDetail qseg={qseg} result={result} cellLoadingKey={cellLoadingKey} cellError={cellError} onRetryCell={retryCell} />}
            </div>
          )}

          <p className="sa-diag-hint" style={{ marginTop: 16, marginBottom: 0 }}>
            Tvoja diagnostika je uložená — na Prehľade sa pri kliknutí na ikony úrovní zobrazí, ako sú zastúpené u teba. Pokračuj funkciami Kvadranty, Prostredie, Témy a Progres.
          </p>
        </>
      )}
    </section>
  );
}

function ThemesView({ analyses, onOpen, onStart }) {
  const temy = analyses.filter((a) => a.lens === "tema");
  return (
    <section className="sa-panel">
      <div className="sa-viewhead">
        <div className="sa-viewheadmain">
          <img src="/mysdl/icons/temy.png" alt="" className="sa-heroicon" />
          <div>
            <h2 className="sa-heroh">Moje témy</h2>
            <p className="sa-herosub">{temy.length ? temy.length + (temy.length === 1 ? " uložená téma" : temy.length < 5 ? " uložené témy" : " uložených tém") : "Zatiaľ žiadne témy"}</p>
          </div>
        </div>
        <button type="button" className="sa-btn sa-btn-primary" onClick={() => onStart("tema")}>Nová téma</button>
      </div>
      {temy.length === 0 ? (
        <p className="sa-empty-text" style={{ padding: "26px 0" }}>Keď rozoberáš svoju prvú tému, objaví sa tu — a bude sa dať k nej kedykoľvek vrátiť.</p>
      ) : (
        <div className="sa-recent" style={{ marginTop: 4 }}>
          {temy.map((a) => {
            const cols = analysisColors(a).slice(0, 5);
            const tn = (a.result && a.result.napatia && a.result.napatia.length) || 0;
            return (
              <button key={a.id} type="button" className="sa-reccard" onClick={() => onOpen(a.id)}>
                <span className="sa-recicon"><LensIcon lens="tema" size={18} color={LENSES.tema.accent} /></span>
                <span className="sa-recmain">
                  <span className="sa-rectopic">{a.topic || "Bez názvu"}</span>
                  <span className="sa-recmeta">
                    <span>{fmtDate(a.createdAt)}</span>
                    {tn > 0 && <><span className="sa-recsep">·</span><span>{tn} napätí</span></>}
                  </span>
                </span>
                <span className="sa-recdots">
                  {cols.map((n) => (
                    <span key={n} className="sa-dot" style={{ background: (SD[n] || {}).hex, boxShadow: "0 0 6px " + ((SD[n] || {}).hex || "#555") + "66" }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---------------- Sledovanie progresu ---------------- */
function ProgresView({ analyses }) {
  const A = (typeof window !== "undefined" && SDL_ASSETS) || {};
  const IC = A.ICONS || {};
  const AX = A.AXIS_ICONS || {};
  const empty = analyses.length === 0;
  const sorted = [...analyses].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const [sub, setSub] = useState("progres");        // progres | dynamika
  const [area, setArea] = useState("__all__");        // téma alebo všeobecne
  const [openLvl, setOpenLvl] = useState(null);       // rozbalená úroveň
  const [marked, setMarked] = useState([]);           // úrovne pre plán
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState(null);
  const [plan, setPlan] = useState(() => { try { const r = localStorage.getItem("mysdl:plan:v1"); return r ? JSON.parse(r) : null; } catch (e) { return null; } });
  const [diag] = useState(() => { try { const r = localStorage.getItem("mysdl:diag:v1"); return r ? JSON.parse(r) : null; } catch (e) { return null; } });

  const themes = [...new Set(analyses.filter((a) => a.topic && a.topic.trim()).map((a) => a.topic.trim()))];

  function toggleMark(key) { setMarked((m) => (m.includes(key) ? m.filter((x) => x !== key) : [...m, key])); }

  async function makePlan() {
    if (planLoading || marked.length === 0) return;
    setPlanLoading(true); setPlanError(null);
    const areaTxt = area === "__all__" ? "všeobecný rozvoj naprieč témami používateľa" : "oblasť/téma: " + area;
    const lvlList = marked.map((k) => {
      const L = SPIRAL_LEVELS.find((x) => x.key === k); const kb = SD_KB.levels[k];
      return "- " + L.name + " (" + k + "): silné = " + kb.silne + " | tiene = " + kb.tiene + " | slepé miesta = " + kb.slepe;
    }).join("\n");
    const diagTxt = diag && diag.urovne ? marked.map((k) => { const d = diag.urovne[k]; return d ? k + "=" + (d.skore || 0) + "%" : null; }).filter(Boolean).join(", ") : "";
    const SYSTEM = `Si sprievodca rozvojom podľa Špirálovej dynamiky a integrálnej teórie (Wilber, AQAL). Navrhni konkrétny plán práce s vybranými úrovňami vedomia.
Riaď sa princípmi integrácie:
- Transcenduj a zahrň: vyššia úroveň nižšiu nepopiera, ale rozširuje.
- Integruj zdravé jadro každej úrovne a uvoľni nezrelé obrany; regresia je volanie po liečení, nie zlyhanie.
- Integrácia vyžaduje bezpečie a kontext; vývoj je asymetrický.
Metódy, z ktorých čerpaj: tieňová práca, somatické prežívanie, dialóg medzi úrovňami, rozpoznanie polarity, archetypálna práca.
Vyhni sa spiritual bypassingu a moralizovaniu nižších úrovní.
Pre KAŽDÚ vybranú úroveň vráť: "preco" (1-2 vety, prečo s ňou pracovať v danom zameraní), "cinnosti" (2-3 konkrétne aktivity), "prvyKrok" (1 malý krok na dnes). Pridaj "zhrnutie" (2-3 vety o celkovom smerovaní). Píš po slovensky, tykaj, konkrétne a bez hodnotenia.
Vráť IBA platný JSON bez markdownu v tvare: {"zhrnutie":"...","urovne":{"<kluc>":{"preco":"...","cinnosti":["...","..."],"prvyKrok":"..."}}} kde <kluc> je jeden z: ${marked.join(", ")}.`;
    const userMsg = "ZAMERANIE: " + areaTxt + "\n\nVYBRANÉ ÚROVNE:\n" + lvlList + (diagTxt ? "\n\nDIAGNOSTIKA (skóre zastúpenia): " + diagTxt : "");
    try {
      const text = await aiComplete({ model: "claude-sonnet-4-5", max_tokens: 1800, system: SYSTEM, messages: [{ role: "user", content: userMsg }] });
      const parsed = JSON.parse(String(text).replace(/```json/g, "").replace(/```/g, "").trim());
      const rec = { area: area === "__all__" ? null : area, createdAt: new Date().toISOString(), levels: marked.slice(), zhrnutie: parsed.zhrnutie || "", urovne: parsed.urovne || {} };
      setPlan(rec);
      try { persist("mysdl:plan:v1", JSON.stringify(rec)); } catch (e) { /* ignoruj */ }
    } catch (e) { setPlanError(aiMsg(e, "Plán sa teraz nepodarilo vytvoriť. Skús to prosím znova.")); }
    finally { setPlanLoading(false); }
  }

  return (
    <section className="sa-panel">
      <div className="sa-viewhead">
        <div className="sa-viewheadmain">
          <img src="/mysdl/icons/progres.png" alt="" className="sa-heroicon" />
          <div>
            <h2 className="sa-heroh">Sledovanie progresu</h2>
            <p className="sa-herosub">Ako sa tvoj hodnotový profil vyvíja v čase</p>
          </div>
        </div>
        <div className="sa-herostat">
          <span className="sa-heronum">{analyses.length}</span>
          <span className="sa-heronumlabel">analýz</span>
        </div>
      </div>

      {/* Podkategórie progresu */}
      <div className="sa-subnav">
        <button type="button" className={"sa-subtab" + (sub === "progres" ? " is-on" : "")} onClick={() => setSub("progres")}>Prehľad progresu</button>
        <button type="button" className={"sa-subtab sa-subtab-feature" + (sub === "dynamika" ? " is-on" : "")} onClick={() => setSub("dynamika")}>Dynamika zmeny<span className="sa-subtab-badge">rozšírená funkcia</span></button>
      </div>

      {sub === "dynamika" ? (
        <ChangeDynamics />
      ) : empty ? (
        <p className="sa-empty-text" style={{ padding: "26px 0" }}>Začni prvou analýzou — tvoj profil a jeho vývoj sa začnú skladať tu.</p>
      ) : (
        <>
          {/* Oblasť */}
          <div className="sa-arealabel">Zobraziť pre oblasť</div>
          <div className="sa-areachips">
            <button type="button" className={"sa-areachip" + (area === "__all__" ? " is-on" : "")} onClick={() => { setArea("__all__"); setOpenLvl(null); }}>Všeobecne</button>
            {themes.map((t) => (
              <button key={t} type="button" className={"sa-areachip" + (area === t ? " is-on" : "")} onClick={() => { setArea(t); setOpenLvl(null); }} title={t}>{t}</button>
            ))}
          </div>
          <p className="sa-areahint">
            {area === "__all__"
              ? "Všeobecné zobrazenie spája významné a relevantné informácie naprieč tvojimi témami. (Presnejšie ho vyladí rozsiahla KB, na ktorej pracujeme.)"
              : "Zobrazuješ progres pre oblasť „" + area + "\"."}
          </p>

          {/* Úrovne — rovnaké interaktívne plátno ako v Prehľade */}
          <div className="sa-quadtrack-title" style={{ marginTop: 4, marginBottom: 4 }}>Úrovne · klikni na ikonu a rozbaľ detail</div>
          <p className="sa-areahint" style={{ marginTop: 0, marginBottom: 4 }}>
            {area === "__all__"
              ? "Klikni na úroveň — ukáže sa všeobecný stav tejto paradigmy u teba (napínač kvadrantov nižšie)."
              : "Klikni na úroveň — detail sa viaže na tému „" + area + "“."}
          </p>
          <LevelIconCanvas selected={openLvl} onSelect={setOpenLvl} diag={diag} scored />

          {openLvl && <LevelWindow levelKey={openLvl} diag={diag} area={area} />}

          {/* Prepojenie na kvadranty namiesto perspektívy/hodnotového profilu */}
          <button type="button" className="sa-gokvadbtn" onClick={() => { const b = [...document.querySelectorAll(".sa-lens")].find((x) => /Kvadranty/i.test(x.textContent)); if (b) b.click(); }}>
            Zobraziť progres v súvislosti s kvadrantmi →
          </button>

          {/* Plán rastu */}
          <div className="sa-plan">
            <div className="sa-quadtrack-title" style={{ marginBottom: 6 }}>Plán rastu · označ úrovne, s ktorými chceš pracovať</div>
            <p className="sa-areahint" style={{ marginTop: 0 }}>Vyber úrovne a nechaj AI navrhnúť konkrétny plán — činnosti a prvé kroky podľa princípov integrácie.</p>
            <div className="sa-planpick">
              {SPIRAL_LEVELS.map((L) => {
                const on = marked.includes(L.key);
                return (
                  <button key={L.key} type="button" className={"sa-planchip" + (on ? " is-on" : "")} style={{ "--lvl": L.clr }} onClick={() => toggleMark(L.key)}>
                    <span className="sa-dot" style={{ background: L.clr, boxShadow: on ? "0 0 8px " + L.glow : "none" }} />
                    {L.name}
                  </button>
                );
              })}
            </div>
            <div className="sa-actions sa-actions-split" style={{ marginTop: 14 }}>
              <span className="sa-hint">{marked.length === 0 ? "Označ aspoň jednu úroveň" : marked.length + " označených"}</span>
              <button type="button" className="sa-btn sa-btn-primary" disabled={marked.length === 0 || planLoading} onClick={makePlan}>{planLoading ? "Navrhujem plán…" : "Navrhni plán s AI"}</button>
            </div>
            {planError && <div className="sa-error">{planError}</div>}
            {planLoading && <div className="sa-loading"><Spiral size={26} className="sa-spin" /><span>Zostavujem plán podľa princípov integrácie…</span></div>}
            {plan && !planLoading && (
              <div className="sa-planout">
                <div className="sa-planouthead">
                  <span className="sa-planarea">{plan.area ? "Oblasť: " + plan.area : "Všeobecný plán"}{plan.createdAt ? " · " + fmtDate(plan.createdAt) : ""}</span>
                  <button type="button" className="sa-planclear" onClick={() => { setPlan(null); try { removeKey("mysdl:plan:v1"); } catch (e) { /* ignoruj */ } }}>Vymazať</button>
                </div>
                {plan.zhrnutie && <blockquote className="sa-reflect" style={{ marginTop: 6 }}>{plan.zhrnutie}</blockquote>}
                {(plan.levels || []).map((k) => {
                  const L = SPIRAL_LEVELS.find((x) => x.key === k); if (!L) return null;
                  const p = plan.urovne && plan.urovne[k]; if (!p) return null;
                  return (
                    <div key={k} className="sa-plancard" style={{ borderLeftColor: L.clr }}>
                      <div className="sa-plancard-head" style={{ color: L.clr }}>{L.name}</div>
                      {p.preco && <p className="sa-lvrowbody">{p.preco}</p>}
                      {p.cinnosti && p.cinnosti.length > 0 && (
                        <ul className="sa-planlist">{p.cinnosti.map((c, i) => <li key={i}>{c}</li>)}</ul>
                      )}
                      {p.prvyKrok && <div className="sa-planstep"><span>Prvý krok</span>{p.prvyKrok}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Časová os */}
          <div className="sa-timeline">
            <div className="sa-quadtrack-title" style={{ marginBottom: 14 }}>Časová os</div>
            {sorted.map((a) => {
              const Ln = LENSES[a.lens] || LENSES.tema;
              const cols = analysisColors(a).slice(0, 5);
              return (
                <div key={a.id} className="sa-tlrow">
                  <span className="sa-tldate">{fmtDate(a.createdAt)}</span>
                  <span className="sa-tldot" style={{ background: Ln.accent, boxShadow: "0 0 8px " + Ln.accent + "88" }} />
                  <span className="sa-tlmain">
                    <span className="sa-tltopic">{a.topic || "Bez názvu"}</span>
                    <span className="sa-tllens" style={{ color: Ln.accent }}>{Ln.label}</span>
                  </span>
                  <span className="sa-recdots">
                    {cols.map((n) => (
                      <span key={n} className="sa-dot" style={{ background: (SD[n] || {}).hex, boxShadow: "0 0 6px " + ((SD[n] || {}).hex || "#555") + "66" }} />
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

/* Rozbaľovacie okno úrovne — 5 sekcií (KB + diagnostika) */
function LevelWindow({ levelKey, diag }) {
  const A = (typeof window !== "undefined" && SDL_ASSETS) || {};
  const IC = A.ICONS || {};
  const L = SPIRAL_LEVELS.find((x) => x.key === levelKey);
  const kb = SD_KB.levels[levelKey];
  const d = diag && diag.urovne && diag.urovne[levelKey];
  const skore = d ? Math.max(0, Math.min(100, d.skore || 0)) : null;
  const prejavy = d && d.text ? d.text : kb.prejavy;
  const sulad = skore == null
    ? "Podmienky, na ktoré táto úroveň reaguje: " + kb.podmienky.charAt(0).toLowerCase() + kb.podmienky.slice(1)
    : skore >= 60
      ? "Úroveň je u teba silná (" + skore + " %) a dobre zodpovedá podmienkam: " + kb.podmienky.charAt(0).toLowerCase() + kb.podmienky.slice(1)
      : skore >= 25
        ? "Úroveň je prítomná (" + skore + " %). Reaguje na: " + kb.podmienky.charAt(0).toLowerCase() + kb.podmienky.slice(1)
        : "Úroveň je zatiaľ slabo zastúpená (" + skore + " %). Aktivuje ju: " + kb.podmienky.charAt(0).toLowerCase() + kb.podmienky.slice(1);
  const rows = [
    ["Prejavy u teba", prejavy, "#A78BFA"],
    ["Priestor pre integráciu slepých miest", kb.slepe, "#60A5FA"],
    ["Súlad so životnými podmienkami", sulad, "#2DD4BF"],
    ["Silné stránky úrovne", kb.silne, "#4ADE80"],
    ["Tiene", kb.tiene, "#F87171"],
  ];
  return (
    <div className="sa-lvdetail" style={{ borderColor: L.clr + "33", borderLeftColor: L.clr + "88" }}>
      <div className="sa-lvdetail-head">
        <img src={IC[levelKey] || ""} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", boxShadow: "0 0 10px " + L.glow }} />
        <div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: L.clr }}>{L.name}</div>
          <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{L.motto}</div>
        </div>
        {skore != null && <span style={{ marginLeft: "auto", fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{skore} %</span>}
      </div>
      {rows.map(([title, body, clr]) => (
        <div key={title} className="sa-lvrow">
          <span className="sa-lvrowtitle" style={{ color: clr }}>{title}</span>
          <p className="sa-lvrowbody">{body}</p>
        </div>
      ))}
    </div>
  );
}

/* Hodnotový profil — voľba perspektívy cez optiku ŠD (rozkliknuteľné pod ikonami) */
function ProfilePerspective({ analyses }) {
  const [persp, setPersp] = useState("total");
  const [open, setOpen] = useState(true);
  const { total, perQuad } = computeProfile(analyses);
  const PERSPS = [
    { k: "total", label: "Celkovo", sub: "naprieč kvadrantmi" },
    { k: "UL", label: "Ja", sub: "vnútro jednotlivca" },
    { k: "UR", label: "To", sub: "správanie a činy" },
    { k: "LL", label: "My", sub: "kultúra a vzťahy" },
    { k: "LR", label: "Ono", sub: "systémy a procesy" },
  ];
  const map = persp === "total" ? total : (perQuad[persp] || {});
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  const cur = PERSPS.find((p) => p.k === persp);
  return (
    <div className="sa-persp">
      <button type="button" className="sa-persphead" onClick={() => setOpen((o) => !o)}>
        <span className="sa-persphead-l">
          <span className="sa-persptitle">Hodnotový profil · perspektíva</span>
          <span className="sa-perspcur">Cez optiku ŠD z perspektívy: {cur.label}</span>
        </span>
        <span className={"sa-perspchev" + (open ? " is-open" : "")}>▾</span>
      </button>
      {open && (
        <div className="sa-perspbody">
          <div className="sa-perspchips">
            {PERSPS.map((p) => (
              <button key={p.k} type="button" className={"sa-perspchip" + (persp === p.k ? " is-on" : "")} onClick={() => setPersp(p.k)}>
                <span>{p.label}</span><em>{p.sub}</em>
              </button>
            ))}
          </div>
          <Spectrum map={map} height={16} />
          {sum > 0 ? (
            <div className="sa-toplist">
              {entries.slice(0, 5).map(([name, w]) => (
                <span key={name} className="sa-topitem">
                  <span className="sa-dot" style={{ background: (SD[name] || {}).hex, boxShadow: "0 0 7px " + ((SD[name] || {}).hex || "#555") + "66" }} />
                  <span className="sa-topname">{name}</span>
                  <span className="sa-toppct">{Math.round((w / sum) * 100)}%</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="sa-areahint" style={{ margin: "12px 0 0" }}>Z tejto perspektívy zatiaľ nie sú dáta — vyplň zodpovedajúci kvadrant v niektorej analýze.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* Dynamika zmeny — podkategória progresu (z KB Dynamika prechodu) */
/* ================================================================== *
 *  Dynamika zmeny — SDi Change Profile (Beck & Cowan)
 *  Portované 1:1 z referenčného artefaktu (geometria/dej nemenené).
 *  Prefarbený je iba chróm: Playfair Display / DM Sans, MySDL tokeny.
 *  Fázové farby (alpha..barrier) sú sémantické, NIE vMeme paleta — nemenené.
 * ================================================================== */
const DZ_W_TL = [412, 208], DZ_W_TR = [462, 182], DZ_W_BR = [462, 496], DZ_W_BL = [412, 490];
const DZ_W_SNT = [486, 196], DZ_W_SNB = [486, 486];
const DZ_W_ROWS = 9, DZ_W_COLS = 3;
const dzLerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dzWpt = (u, v) => dzLerp(dzLerp(DZ_W_TL, DZ_W_TR, u), dzLerp(DZ_W_BL, DZ_W_BR, u), v);
const dzFmt = (p) => p[0].toFixed(1) + "," + p[1].toFixed(1);
const DZ_WALL = {
  front: [DZ_W_TL, DZ_W_TR, DZ_W_BR, DZ_W_BL].map(dzFmt).join(" "),
  side: [DZ_W_TR, DZ_W_SNT, DZ_W_SNB, DZ_W_BR].map(dzFmt).join(" "),
  courses: Array.from({ length: DZ_W_ROWS - 1 }, (_, i) => { const v = (i + 1) / DZ_W_ROWS; return { a: dzWpt(0, v), b: dzWpt(1, v), s: dzLerp(DZ_W_SNT, DZ_W_SNB, v) }; }),
  joints: Array.from({ length: DZ_W_COLS - 1 }, (_, i) => { const u = (i + 1) / DZ_W_COLS; return { a: dzWpt(u, 0), b: dzWpt(u, 1) }; }),
};
const DZ_CRASH = { x: 406, y: 462 };
const DZ_BOUNCE = [[372, 388], [356, 406], [334, 432], [328, 462], [336, 488]];
const DZ_TRIALS = [[426, 408], [446, 400], [471, 398], [498, 416], [532, 424], [562, 444], [576, 470]];
const DZ_BREACH = "408,475 439,461 458,438 486,430 502,414 490,394 459,408 441,431 412,439 396,455";
const DZ_CRACKS = ["M 437,462 L 429,470 L 433,480", "M 459,437 L 466,429 L 464,418", "M 442,430 L 434,423 L 437,412", "M 487,432 L 493,440 L 491,450"];
const DZ_RUBBLE = [
  { p: "508,410 515,413 510,419", o: 0.75 }, { p: "522,396 528,399 523,405", o: 0.6 },
  { p: "497,391 503,394 499,399", o: 0.5 }, { p: "536,404 541,407 537,412", o: 0.45 },
  { p: "516,381 521,384 517,389", o: 0.4 },
];
const DZ_STATES = [
  { id: "alpha", name: "ALPHA", sk: "Stabilita", color: "#2dd4bf", x: 200, y: 274, fig: "runner", figAt: [150, 218], figScale: 1.15,
    desc: "Systém funguje. Človek, tím alebo organizácia má nastavené stratégie, ktoré prinášajú výsledky. Identita je jasná, pravidlá známe, realita predvídateľná. Tento stav je komfortný — no zároveň podmienený tým, že prostredie sa nemení rýchlejšie než naše schopnosti reagovať.",
    priklad: "Máš osvedčený spôsob práce, ktorý ti roky funguje.",
    position: "Vysoký súlad, krivka stúpa a drží sa hore.",
    risks: ["Sebauspokojenie", "Slepé škvrny", "Ignorovanie raných signálov napätia"],
    focus: "Vedome si všímať prvé jemné signály disonancie skôr, než prerastú do krízy." },
  { id: "beta", name: "BETA", sk: "Napätie", color: "#f59e0b", x: 325, y: 316, fig: "bomb", figAt: [256, 402], figScale: 1.1,
    desc: "Objavuje sa prvý nesúlad. Realita sa mení, požiadavky rastú, staré stratégie začínajú byť neefektívne. Objavuje sa frustrácia, tlak, neistota. Systém sa snaží „zlepšiť výkon“, ale ešte nemení samotný rámec myslenia.",
    priklad: "Zistíš, že to, čo ti kedysi stačilo, už neprináša rovnaké výsledky.",
    position: "Krivka sa láme nadol — súlad klesá, no trajektória pokračuje po starom, priamo do steny.",
    risks: ["Chronické váhanie", "Nadmerná analýza", "Odkladanie rozhodnutí"],
    focus: "Pomenovať zdroje napätia nahlas — presnosť pomenovania je prvý krok k jasnosti (C4)." },
  { id: "gamma", name: "GAMMA", sk: "Kolaps · kríza", color: "#ef4444", x: DZ_CRASH.x, y: DZ_CRASH.y, labelBelow: true, fig: "crash", figAt: [296, 494], figScale: 1.1,
    desc: "Dochádza k destabilizácii. Starý spôsob fungovania sa rozpadá. Môže sa objaviť chaos, pochybnosti, strata istoty. Subjektívne ide o náročnú fázu, no objektívne sa uvoľňuje priestor pre reorganizáciu systému.",
    priklad: "Vyhorenie, konflikt, rozpad projektu, osobná kríza.",
    position: "Červená šípka padá kolmo po stene až na jej pätu. Pokusy o návrat späť sa odtiaľ len odrážajú.",
    risks: ["Vyhorenie", "Deštruktívne konanie", "Regres na nižšie hodnotové systémy"],
    focus: "Stabilizovať základy — bezpečie, vzťahy, telo (C2). Nerobiť nevratné rozhodnutia v najhlbšom bode." },
  { id: "delta", name: "DELTA", sk: "Experimentovanie", color: "#d946ef", x: 600, y: 420, fig: "experiment", figAt: [696, 490], figScale: 1.1,
    desc: "Po rozpade sa energia uvoľňuje do hľadania. Objavuje sa skúšanie, tvorivosť, nové perspektívy. Nie všetky pokusy budú úspešné, ale bez tejto fázy nevznikne transformácia.",
    priklad: "Skúšaš nový prístup, nový štýl komunikácie, nový spôsob práce.",
    position: "Vejár pokusov priamo v zóne bariéry. Strmé narážajú do muriva, ploché ju obídu — ale ďaleko nedôjdu.",
    risks: ["Nerealistický optimizmus", "Predčasný skok bez základov", "Rozptýlenie do priveľa smerov naraz"],
    focus: "Skúšať vedome a v malom. Neúspešný pokus nie je zlyhanie — je to dáta o tvare bariéry." },
  { id: "flex", name: "FLEX", sk: "Nové riešenie · integrácia", color: "#3b82f6", x: 672, y: 286, fig: "idea", figAt: [672, 234], figScale: 1.1,
    desc: "Z množstva možností sa začína formovať nový rámec. Dochádza k zmene perspektívy, reorganizácii identity alebo štruktúry fungovania. Systém sa nastavuje na vyššiu úroveň komplexity.",
    priklad: "Objavíš nový spôsob fungovania, ktorý lepšie zodpovedá realite.",
    position: "Jediná šípka, ktorá bariéru skutočne prerazí — kvalitatívna zmena, nie väčšie úsilie.",
    risks: ["Fragmentácia", "Priveľa experimentov naraz", "Chýbajúca konsolidácia"],
    focus: "Vybrať to, čo obstálo, a ukotviť to. Prielom sa musí premeniť na štruktúru." },
  { id: "newalpha", name: "NEW ALPHA", sk: "Nová stabilita", color: "#d4af37", x: 858, y: 210, fig: "triumph", figAt: [856, 158], figScale: 1.15,
    desc: "Vzniká nová rovnováha. Systém je flexibilnejší, odolnejší a lepšie adaptovaný. Energia sa môže opäť investovať do rastu, nie do riešenia krízy. Tento stav však nie je konečný — pri ďalšej zmene prostredia sa cyklus zopakuje na vyššej úrovni.",
    priklad: "Po kríze funguješ inak — vedomejšie, efektívnejšie, pokojnejšie.",
    position: "Krivka sa vracia nahor, vyššie než na začiatku. Špirála sa posunula o jednu úroveň.",
    risks: ["Rigidita nového vzorca", "Ignorovanie budúcich napätí"],
    focus: "Pamätať, že aj nový súlad je dočasný. Špirála pokračuje ďalším cyklom." },
];
const DZ_BARRIER = {
  id: "barrier", name: "PREKÁŽKA", sk: "Bariéra zmeny", color: "#c9a961",
  desc: "Staré riešenia prestávajú fungovať. Systém narazí na limit svojej aktuálnej komplexity. Pokusy o návrat späť zlyhávajú. Je to bod, kde kvantitatívne zlepšenie nestačí — je potrebná kvalitatívna zmena.",
  priklad: "Snažíš sa viac snažiť, viac kontrolovať, viac tlačiť — no výsledok sa nezlepšuje.",
  position: "Úzka, ale masívna stena kolmo naprieč osou času. Trajektória do nej narazí a zošmykne sa po nej až na dno.",
  risks: ["Neviditeľné bariéry pôsobia najsilnejšie", "Bariéra sa často mylne považuje za vlastné zlyhanie", "Viac úsilia v starom rámci ju len spevňuje"],
  focus: "Pomenovať bariéru presne (C5): čo konkrétne stojí medzi mnou a novou konfiguráciou — strach, norma, limit, identita?",
};
const DZ_ORDER = ["alpha", "beta", "gamma", "delta", "flex", "newalpha"];

function DZFigureArt({ kind, color }) {
  const S = { stroke: color, strokeWidth: 1.6, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
  const T = { stroke: color, strokeWidth: 1.2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
  const dots = (pts) => pts.map(([a, b], i) => <circle key={i} cx={a} cy={b} r="1.7" fill={color} />);
  const star = (cx, cy, r) => "M " + cx + "," + (cy - r) + " L " + (cx + r * 0.3) + "," + (cy - r * 0.3) + " L " + (cx + r) + "," + cy + " L " + (cx + r * 0.3) + "," + (cy + r * 0.3) + " L " + cx + "," + (cy + r) + " L " + (cx - r * 0.3) + "," + (cy + r * 0.3) + " L " + (cx - r) + "," + cy + " L " + (cx - r * 0.3) + "," + (cy - r * 0.3) + " Z";
  switch (kind) {
    case "runner": return (<>
      <path d="M -26,0 Q -27,-6 -24,-11" {...T} opacity="0.75" /><circle cx="-24" cy="-12" r="2" fill={color} opacity="0.75" />
      <path d="M -19,0 Q -20,-5 -17,-9" {...T} opacity="0.55" /><circle cx="-17" cy="-10" r="1.6" fill={color} opacity="0.55" />
      <path d="M 22,0 Q 23,-6 26,-11" {...T} opacity="0.75" /><circle cx="26" cy="-12" r="2" fill={color} opacity="0.75" />
      <path d="M 29,0 Q 30,-4 32,-8" {...T} opacity="0.55" /><circle cx="32" cy="-9" r="1.5" fill={color} opacity="0.55" />
      <circle cx="1" cy="-36" r="5" {...S} /><path d="M -1,-31 L -3,-18" {...S} />
      <path d="M -1.5,-28 L 5,-30 L 12,-35" {...S} /><path d="M -1.5,-28 L -8,-25 L -13,-21" {...S} />
      <path d="M -3,-18 L 5,-11 L 10,-2" {...S} /><path d="M -3,-18 L -10,-12 L -16,-5" {...S} />
      {dots([[-1, -31], [-3, -18], [5, -30], [-8, -25], [5, -11], [-10, -12]])}
      <path d="M 7,-48 L 18,-48 L 16,-41 L 9,-41 Z" {...T} /><path d="M 7,-47 Q 2,-44 7,-41.5" {...T} /><path d="M 18,-47 Q 23,-44 18,-41.5" {...T} />
      <path d="M 12.5,-41 L 12.5,-38" {...T} /><path d="M 9,-37.5 L 16,-37.5" {...T} />
      <path d={star(-22, -44, 3)} fill={color} opacity="0.85" /><path d={star(24, -50, 2.4)} fill={color} opacity="0.6" />
      <path d={star(-30, -28, 2)} fill={color} opacity="0.5" /><path d={star(-12, -54, 2.2)} fill={color} opacity="0.6" />
    </>);
    case "bomb": return (<>
      <circle cx="-16" cy="-9" r="8.5" {...S} /><path d="M -12,-16 Q -10,-22 -5,-23" {...T} />
      <g stroke={color} strokeWidth="1.3" strokeLinecap="round">
        <line x1="-2" y1="-23" x2="1" y2="-23" /><line x1="-3.5" y1="-20.5" x2="-2" y2="-18" /><line x1="-6.5" y1="-20.5" x2="-8" y2="-18" />
        <line x1="-8" y1="-23" x2="-11" y2="-23" /><line x1="-6.5" y1="-25.5" x2="-8" y2="-28" /><line x1="-3.5" y1="-25.5" x2="-2" y2="-28" />
      </g>
      <circle cx="-5" cy="-23" r="1.8" fill={color} />
      <circle cx="10" cy="-34" r="5" {...S} /><path d="M 10,-29 L 10,-16" {...S} />
      <path d="M 10,-27 L 4,-30 L 6,-36" {...S} /><path d="M 10,-27 L 16,-30 L 14,-36" {...S} />
      <path d="M 10,-16 L 5,-8 L 3,-1" {...S} /><path d="M 10,-16 L 15,-8 L 18,-1" {...S} />
      {dots([[10, -29], [10, -16], [4, -30], [16, -30], [5, -8], [15, -8]])}
      <path d="M 0,-45 L -3,-40 L 0,-40 L -3,-35" {...S} strokeWidth="1.4" /><path d="M 20,-45 L 23,-40 L 20,-40 L 23,-35" {...S} strokeWidth="1.4" />
    </>);
    case "crash": return (<>
      <path d="M -16,-42 Q -21,-50 -12,-52 Q -10,-59 -1,-57 Q 6,-61 11,-53 Q 18,-50 13,-42 Z" {...T} opacity="0.85" />
      <path d="M 0,-41 L -4,-35 L 1,-34 L -3,-28" {...S} strokeWidth="1.4" />
      <circle cx="3" cy="-24" r="5" {...S} /><path d="M 1,-19 L -2,-10" {...S} />
      <path d="M 1,-18.5 L 6,-16 L 8,-21" {...S} /><path d="M 1,-18.5 L -4,-15 L -2,-20" {...S} />
      <path d="M -2,-10 L 6,-8 L 12,-3" {...S} /><path d="M -2,-10 L -9,-6 L -15,-2" {...S} />
      {dots([[1, -19], [-2, -10], [6, -16], [-4, -15], [6, -8], [-9, -6]])}
      <path d="M -20,1 L -13,-2 L -7,0" {...T} opacity="0.55" /><path d="M 20,1 L 13,-2 L 7,0" {...T} opacity="0.55" /><path d="M -2,2 L 0,-2" {...T} opacity="0.45" />
    </>);
    case "experiment": return (<>
      <path d="M -28,-14 L 4,-14" {...S} /><path d="M -24,-14 L -24,-1" {...T} /><path d="M 0,-14 L 0,-1" {...T} />
      <path d="M -21,-14 L -18,-24 L -16,-24 L -13,-14 Z" {...T} /><path d="M -18.6,-21.5 L -15.4,-21.5" {...T} opacity="0.6" />
      <path d="M -9,-24 L -9,-17 Q -9,-14 -6.5,-14 Q -4,-14 -4,-17 L -4,-24" {...T} />
      <circle cx="-17" cy="-28" r="1.7" fill={color} opacity="0.85" /><circle cx="-14" cy="-32" r="1.2" fill={color} opacity="0.6" /><circle cx="-18" cy="-35" r="1" fill={color} opacity="0.45" />
      <circle cx="16" cy="-34" r="5" {...S} /><path d="M 16,-29 L 16,-16" {...S} />
      <path d="M 16,-27 L 8,-25 L 1,-21" {...S} /><path d="M 16,-27 L 22,-24 L 21,-17" {...S} />
      <path d="M 16,-16 L 12,-8 L 10,-1" {...S} /><path d="M 16,-16 L 21,-8 L 24,-1" {...S} />
      {dots([[16, -29], [16, -16], [8, -25], [22, -24], [12, -8], [21, -8]])}
      <text x="16" y="-43" fill={color} fontSize="10" letterSpacing="1.5" textAnchor="middle" fontFamily="'DM Sans',sans-serif" opacity="0.9">???</text>
    </>);
    case "idea": return (<>
      <circle cx="8" cy="-49" r="6" {...S} /><path d="M 5.5,-49.5 Q 8,-45 10.5,-49.5" {...T} />
      <path d="M 4.5,-44 L 11.5,-44" {...T} /><path d="M 5,-41.8 L 11,-41.8" {...T} /><path d="M 5.8,-39.6 L 10.2,-39.6" {...T} />
      <g stroke={color} strokeWidth="1.3" strokeLinecap="round" opacity="0.85">
        <line x1="8" y1="-58" x2="8" y2="-63" /><line x1="1.5" y1="-55" x2="-2" y2="-59" /><line x1="14.5" y1="-55" x2="18" y2="-59" />
        <line x1="0" y1="-49" x2="-5" y2="-49" /><line x1="16" y1="-49" x2="21" y2="-49" />
      </g>
      <circle cx="-2" cy="-31" r="5" {...S} /><path d="M -2,-26 L -1,-14" {...S} />
      <path d="M -2,-25 L 5,-31 L 7,-41" {...S} /><path d="M -2,-25 L -9,-22 L -12,-15" {...S} />
      <path d="M -1,-14 L -6,-8 L -9,-1" {...S} /><path d="M -1,-14 L 5,-7 L 9,-1" {...S} />
      {dots([[-2, -26], [-1, -14], [5, -31], [-9, -22], [-6, -8], [5, -7]])}
      <path d="M -21,0 Q -22,-5 -19,-9" {...T} opacity="0.7" /><circle cx="-19" cy="-10" r="1.8" fill={color} opacity="0.7" />
      <path d="M -15,0 Q -16,-4 -13,-7" {...T} opacity="0.5" /><circle cx="-13" cy="-8" r="1.4" fill={color} opacity="0.5" />
      <path d="M 16,0 Q 17,-5 20,-9" {...T} opacity="0.7" /><circle cx="20" cy="-10" r="1.8" fill={color} opacity="0.7" />
      <path d="M 22,0 Q 23,-4 25,-7" {...T} opacity="0.5" /><circle cx="25" cy="-8" r="1.4" fill={color} opacity="0.5" />
    </>);
    case "triumph": return (<>
      <path d="M -17,0 L 17,0 L 13,-7 L -13,-7 Z" {...S} /><path d="M -13,-7 L 13,-7" {...T} opacity="0.5" /><ellipse cx="0" cy="-45" rx="10" ry="2.8" {...T} />
      <circle cx="0" cy="-36" r="5.5" {...S} /><path d="M 0,-30.5 L 0,-18" {...S} />
      <path d="M 0,-29 L -11,-32 L -21,-34" {...S} /><path d="M 0,-29 L 11,-32 L 21,-34" {...S} />
      <path d="M 0,-18 L -6,-13 L -8,-7" {...S} /><path d="M 0,-18 L 6,-13 L 8,-7" {...S} />
      {dots([[0, -30.5], [0, -18], [-11, -32], [11, -32], [-6, -13], [6, -13]])}
      <path d={star(-26, -44, 2.6)} fill={color} opacity="0.7" /><path d={star(26, -44, 2.6)} fill={color} opacity="0.7" />
      <path d={star(0, -56, 3)} fill={color} opacity="0.85" /><path d={star(-19, -54, 2)} fill={color} opacity="0.45" /><path d={star(19, -54, 2)} fill={color} opacity="0.45" />
    </>);
    default: return null;
  }
}

function DZWall({ masked, hot, onClick }) {
  const g = "#d4af37";
  const o = hot ? 1 : 0.66;
  return (
    <g mask={masked ? "url(#dzBreachMask)" : undefined} onClick={onClick} style={{ cursor: "pointer" }}>
      <polygon points={DZ_WALL.side} fill="#08080d" stroke={g} strokeWidth="1.3" strokeOpacity={o * 0.7} />
      {DZ_WALL.courses.map((c, i) => (<line key={"sc" + i} x1={c.b[0]} y1={c.b[1]} x2={c.s[0]} y2={c.s[1]} stroke={g} strokeWidth="0.9" strokeOpacity={o * 0.35} />))}
      <polygon points={DZ_WALL.front} fill="url(#dzWallFace)" stroke={g} strokeWidth="2" strokeOpacity={o} />
      {DZ_WALL.joints.map((j, i) => (<line key={"j" + i} x1={j.a[0]} y1={j.a[1]} x2={j.b[0]} y2={j.b[1]} stroke={g} strokeWidth="1" strokeOpacity={o * 0.45} />))}
      {DZ_WALL.courses.map((c, i) => (<line key={"c" + i} x1={c.a[0]} y1={c.a[1]} x2={c.b[0]} y2={c.b[1]} stroke={g} strokeWidth="1.6" strokeOpacity={o * 0.75} />))}
    </g>
  );
}

function DynamikaZmenyGraf() {
  const [active, setActive] = useState("alpha");
  const [playing, setPlaying] = useState(false);
  const [mounted, setMounted] = useState(false);
  const timer = useRef(null);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => { setActive((p) => DZ_ORDER[(DZ_ORDER.indexOf(p) + 1) % DZ_ORDER.length]); }, 2800);
    return () => clearInterval(timer.current);
  }, [playing]);
  const sel = active === "barrier" ? DZ_BARRIER : DZ_STATES.find((s) => s.id === active);
  const pick = (id) => { setPlaying(false); setActive(id); };
  const hot = active === "barrier";

  return (
    <div className="sa-dzgraf" style={{ opacity: mounted ? 1 : 0, animation: mounted ? "dzUp .8s ease both" : "none" }}>
      <style>{`
        @keyframes dzDraw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
        @keyframes dzFadeIn{from{opacity:0}to{opacity:1}}
        @keyframes dzFadeOut{from{opacity:1}to{opacity:0}}
        @keyframes dzUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        @keyframes dzPulse{0%,100%{filter:drop-shadow(0 0 4px var(--glow))}50%{filter:drop-shadow(0 0 16px var(--glow))}}
        @keyframes dzEmber{0%,100%{opacity:.45}50%{opacity:1}}
        .dz-node{cursor:pointer;transform-box:fill-box;transform-origin:center;transition:transform .35s cubic-bezier(.2,.8,.2,1)}
        .dz-node:hover{transform:scale(1.18)}
        .dz-node.on{animation:dzPulse 2.4s ease-in-out infinite}
        .dz-fig{cursor:pointer;transition:opacity .45s ease,filter .45s ease}
        .dz-chip{font-family:'DM Sans',sans-serif;background:transparent;color:var(--muted);border:1px solid var(--line);padding:8px 15px;letter-spacing:.16em;font-size:10.5px;text-transform:uppercase;cursor:pointer;border-radius:999px;transition:all .3s ease}
        .dz-chip:hover{border-color:rgba(212,175,55,0.5);color:var(--text)}
        .dz-chip.on{color:#07070c;font-weight:600}
        .dz-chip.wall{border-color:rgba(201,169,97,0.4);color:#c9a961}
        .dz-chip.wall.on{background:#c9a961;border-color:#c9a961;color:#07070c}
        .dz-play{font-family:'DM Sans',sans-serif;background:transparent;color:#d4af37;border:1px solid rgba(212,175,55,0.55);padding:10px 22px;letter-spacing:.22em;font-size:11px;text-transform:uppercase;cursor:pointer;border-radius:999px;transition:all .3s ease}
        .dz-play:hover{background:rgba(212,175,55,0.12);box-shadow:0 0 24px rgba(212,175,55,0.15)}
      `}</style>

      <div style={{ border: "1px solid var(--line)", borderRadius: 18, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0))", padding: "clamp(6px, 1.6vw, 18px)" }}>
        <svg viewBox="0 0 960 580" style={{ width: "100%", height: "auto", display: "block" }}>
          <defs>
            <linearGradient id="dzDescentGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#2dd4bf" /><stop offset="55%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#f97316" /></linearGradient>
            <linearGradient id="dzSuccessGrad" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor="#10b981" /><stop offset="52%" stopColor="#22d3ee" /><stop offset="100%" stopColor="#3b82f6" /></linearGradient>
            <linearGradient id="dzFinalGrad" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor="#60a5fa" /><stop offset="100%" stopColor="#d4af37" /></linearGradient>
            <linearGradient id="dzWallFace" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0%" stopColor="#191509" /><stop offset="55%" stopColor="#100e14" /><stop offset="100%" stopColor="#08080e" /></linearGradient>
            <radialGradient id="dzWallAura" cx="0.5" cy="0.5" r="0.5"><stop offset="0%" stopColor="#d4af37" stopOpacity="0.15" /><stop offset="100%" stopColor="#d4af37" stopOpacity="0" /></radialGradient>
            <filter id="dzSoft" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            <mask id="dzBreachMask"><rect x="390" y="172" width="120" height="336" fill="#fff" /><polygon points={DZ_BREACH} fill="#000" /></mask>
            <marker id="dzALight" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11 L3.5 6 Z" fill="#e7e3d8" /></marker>
            <marker id="dzAWarm" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11 L3.5 6 Z" fill="#f97316" /></marker>
            <marker id="dzARed" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="24" markerHeight="24" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11 L3.5 6 Z" fill="#ef4444" /></marker>
            <marker id="dzARedSm" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11 L3.5 6 Z" fill="#ef4444" /></marker>
            <marker id="dzAMag" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11 L3.5 6 Z" fill="#d946ef" /></marker>
            <marker id="dzABlue" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="26" markerHeight="26" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11 L3.5 6 Z" fill="#3b82f6" /></marker>
            <marker id="dzAGold" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11 L3.5 6 Z" fill="#d4af37" /></marker>
          </defs>

          {[150, 235, 320, 405].map((y) => (<line key={y} x1="70" y1={y} x2="930" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />))}
          <line x1="70" y1="496" x2="70" y2="52" stroke="rgba(255,255,255,0.4)" strokeWidth="1.4" markerEnd="url(#dzALight)" />
          <line x1="70" y1="496" x2="936" y2="496" stroke="rgba(255,255,255,0.4)" strokeWidth="1.4" markerEnd="url(#dzALight)" />
          <text x="52" y="272" fill="var(--muted)" fontSize="12" letterSpacing="5" transform="rotate(-90 52 272)" textAnchor="middle" fontFamily="'DM Sans',sans-serif">SÚLAD</text>
          <text x="886" y="522" fill="var(--muted)" fontSize="12" letterSpacing="5" fontFamily="'DM Sans',sans-serif">ČAS</text>

          <path d="M 78 358 Q 136 314, 200 274" fill="none" stroke="url(#dzDescentGrad)" strokeWidth="3" strokeLinecap="round" pathLength="1" strokeDasharray="1" style={{ animation: "dzDraw .8s .25s cubic-bezier(.4,0,.2,1) both" }} />
          <path d="M 200 274 Q 302 300, 412 356" fill="none" stroke="url(#dzDescentGrad)" strokeWidth="3" strokeLinecap="round" markerEnd="url(#dzAWarm)" pathLength="1" strokeDasharray="1" style={{ animation: "dzDraw .95s .95s cubic-bezier(.4,0,.2,1) both" }} />

          <ellipse cx="448" cy="336" rx="100" ry="180" fill="url(#dzWallAura)" style={{ animation: "dzFadeIn 1.2s 1.2s ease both", opacity: hot ? 1 : 0.5, transition: "opacity .4s ease" }} />

          <g style={{ animation: "dzFadeIn .7s 1.3s ease both" }}><DZWall masked hot={hot} onClick={() => pick("barrier")} /></g>
          <g style={{ animation: "dzFadeIn .7s 1.3s ease both" }}><g style={{ animation: "dzFadeOut .7s 3.75s ease both" }}><DZWall hot={hot} onClick={() => pick("barrier")} /></g></g>

          <text x="408" y="196" textAnchor="end" transform="rotate(-27 408 196)" fill="#c9a961" fontSize="13" letterSpacing="5" fontFamily="'DM Sans',sans-serif" fontWeight={hot ? 600 : 400} style={{ animation: "dzFadeIn .7s 1.5s ease both", cursor: "pointer" }} onClick={() => pick("barrier")}>PREKÁŽKA</text>

          <line x1="416" y1="360" x2="410" y2="452" stroke="#ef4444" strokeWidth="8.5" strokeLinecap="round" markerEnd="url(#dzARed)" pathLength="1" strokeDasharray="1" style={{ animation: "dzDraw .7s 1.9s cubic-bezier(.4,0,.2,1) both" }} />

          {DZ_BOUNCE.map(([x, y], i) => (<line key={"b" + i} x1={DZ_CRASH.x} y1={DZ_CRASH.y} x2={x} y2={y} stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" markerEnd="url(#dzARedSm)" opacity="0.7" style={{ animation: "dzFadeIn .45s " + (2.6 + i * 0.1) + "s ease both" }} />))}
          {DZ_TRIALS.map(([x, y], i) => (<line key={"t" + i} x1={DZ_CRASH.x} y1={DZ_CRASH.y} x2={x} y2={y} stroke="#d946ef" strokeWidth="2.4" strokeLinecap="round" markerEnd="url(#dzAMag)" opacity="0.8" style={{ animation: "dzFadeIn .5s " + (3.0 + i * 0.1) + "s ease both" }} />))}

          <g style={{ animation: "dzFadeIn .6s 3.9s ease both" }}>
            <polygon points={DZ_BREACH} fill="none" stroke="#d4af37" strokeWidth="1.7" strokeOpacity="0.9" filter="url(#dzSoft)" />
            {DZ_CRACKS.map((d, i) => (<path key={i} d={d} fill="none" stroke="#d4af37" strokeWidth="1.1" strokeOpacity="0.45" strokeLinecap="round" strokeLinejoin="round" />))}
            {DZ_RUBBLE.map((r, i) => (<polygon key={i} points={r.p} fill="#d4af37" opacity={r.o} style={{ animation: "dzEmber " + (2 + i * 0.4) + "s ease-in-out infinite" }} />))}
          </g>

          <line x1={DZ_CRASH.x} y1="460" x2="654" y2="300" stroke="url(#dzSuccessGrad)" strokeWidth="9" strokeLinecap="round" markerEnd="url(#dzABlue)" pathLength="1" strokeDasharray="1" style={{ animation: "dzDraw 1s 3.75s cubic-bezier(.4,0,.2,1) both" }} />
          <line x1="696" y1="272" x2="842" y2="218" stroke="url(#dzFinalGrad)" strokeWidth="2.8" strokeLinecap="round" markerEnd="url(#dzAGold)" pathLength="1" strokeDasharray="1" style={{ animation: "dzDraw .8s 4.7s ease both" }} />

          {DZ_STATES.map((s, i) => {
            const on = active === s.id;
            return (
              <g key={"f-" + s.id} className="dz-fig" transform={"translate(" + s.figAt[0] + ", " + s.figAt[1] + ") scale(" + s.figScale + ")"} onClick={() => pick(s.id)}
                style={{ opacity: on ? 1 : 0.5, filter: on ? "drop-shadow(0 0 7px " + s.color + ")" : "none", animation: "dzFadeIn .7s " + [1.0, 1.7, 2.7, 3.6, 4.8, 5.4][i] + "s ease both" }}>
                <DZFigureArt kind={s.fig} color={s.color} />
              </g>
            );
          })}

          {DZ_STATES.map((s, i) => {
            const on = active === s.id;
            const y1 = s.labelBelow ? s.y + 44 : s.y - 34;
            const y2 = s.labelBelow ? s.y + 60 : s.y - 19;
            return (
              <g key={s.id} className={"dz-node" + (on ? " on" : "")} style={{ "--glow": s.color, animation: "dzFadeIn .5s " + [0.9, 1.6, 2.5, 3.4, 4.4, 5.1][i] + "s ease both" }} onClick={() => pick(s.id)}>
                <circle cx={s.x} cy={s.y} r="22" fill={s.color} opacity={on ? 0.18 : 0.07} />
                <circle cx={s.x} cy={s.y} r={on ? 9 : 7} fill="#07070c" stroke={s.color} strokeWidth={on ? 3 : 2} filter="url(#dzSoft)" />
                <circle cx={s.x} cy={s.y} r="2.6" fill={s.color} />
                <text x={s.x} y={y1} textAnchor="middle" fill={on ? s.color : "var(--muted)"} fontSize="13" letterSpacing="3" fontFamily="'DM Sans',sans-serif" fontWeight={on ? 600 : 400}>{s.name}</text>
                <text x={s.x} y={y2} textAnchor="middle" fill="var(--faint-txt)" fontSize="10.5" letterSpacing="1.5" fontFamily="'DM Sans',sans-serif">{s.sk}</text>
              </g>
            );
          })}
          <text x="934" y="568" textAnchor="end" fill="var(--faint-txt)" fontSize="10" letterSpacing="1.5" fontFamily="'DM Sans',sans-serif">zdroj: Spiral Dynamics · Beck &amp; Cowan</text>
        </svg>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 9, alignItems: "center", margin: "18px 0 22px" }}>
        <button type="button" className="dz-play" onClick={() => setPlaying((p) => !p)}>{playing ? "❚❚  Zastaviť" : "▶  Prehrať cyklus zmeny"}</button>
        <div style={{ flex: 1, minWidth: 8 }} />
        {DZ_STATES.map((s) => (
          <button key={s.id} type="button" className={"dz-chip" + (active === s.id ? " on" : "")} style={active === s.id ? { background: s.color, borderColor: s.color } : {}} onClick={() => pick(s.id)}>{s.sk}</button>
        ))}
        <button type="button" className={"dz-chip wall" + (hot ? " on" : "")} onClick={() => pick("barrier")}>Prekážka</button>
      </div>

      <div key={sel.id} style={{ border: "1px solid var(--line)", borderLeft: "3px solid " + sel.color, borderRadius: 14, background: "linear-gradient(120deg," + sel.color + "12, rgba(255,255,255,0.015) 45%)", padding: "clamp(20px, 3.5vw, 34px)", animation: "dzUp .5s ease both" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
          <h3 style={{ fontFamily: "'Playfair Display',Georgia,serif", fontWeight: 500, margin: 0, fontSize: "clamp(20px, 3vw, 26px)", letterSpacing: ".08em", color: sel.color }}>{sel.name}</h3>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, letterSpacing: ".28em", textTransform: "uppercase", color: "var(--muted)" }}>{sel.sk}</span>
        </div>
        <p style={{ margin: "0 0 14px", lineHeight: 1.75, fontSize: 15.5, color: "var(--text)", maxWidth: 720, fontWeight: 300, fontFamily: "Georgia,serif" }}>{sel.desc}</p>
        <p style={{ margin: "0 0 24px", fontSize: 14, fontStyle: "italic", color: "var(--muted)", maxWidth: 720, lineHeight: 1.6, fontFamily: "Georgia,serif" }}>
          <span style={{ color: sel.color, fontStyle: "normal", letterSpacing: ".1em", fontSize: 11, textTransform: "uppercase", marginRight: 8, fontFamily: "'DM Sans',sans-serif" }}>Príklad</span>{sel.priklad}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 24 }}>
          <div>
            <h4 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10.5, letterSpacing: ".3em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 10px", fontWeight: 600 }}>Pozícia v grafe</h4>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: "var(--text)", fontWeight: 300, fontFamily: "Georgia,serif" }}>{sel.position}</p>
          </div>
          <div>
            <h4 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10.5, letterSpacing: ".3em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 10px", fontWeight: 600 }}>Typické riziká</h4>
            {sel.risks.map((r) => (
              <div key={r} style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 7 }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: sel.color, flexShrink: 0, transform: "translateY(-2px)" }} />
                <span style={{ fontSize: 14, color: "var(--text)", fontWeight: 300, lineHeight: 1.5, fontFamily: "Georgia,serif" }}>{r}</span>
              </div>
            ))}
          </div>
          <div>
            <h4 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10.5, letterSpacing: ".3em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 10px", fontWeight: 600 }}>Na čo sa zamerať</h4>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: "var(--text)", fontWeight: 300, fontFamily: "Georgia,serif" }}>{sel.focus}</p>
          </div>
        </div>
      </div>
      <p style={{ textAlign: "center", fontSize: 10.5, letterSpacing: ".26em", textTransform: "uppercase", color: "var(--faint-txt)", marginTop: 22, lineHeight: 1.9, fontFamily: "'DM Sans',sans-serif" }}>
        Vertikálna os · miera súladu so životnými podmienkami<br />Horizontálna os · priebeh zmeny v čase
      </p>
    </div>
  );
}

function ChangeDynamics() {
  const A = (typeof window !== "undefined" && SDL_ASSETS) || {};
  const IC = A.ICONS || {};
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const DZ_PHASES = [
    ["stabilita", "Stabilita", "Cítim, že mi teraz všetko funguje a je to stabilné."],
    ["napatie", "Napätie", "Mám pocit, že mi staré spôsoby prestávajú stačiť a cítim napätie."],
    ["prekazka", "Prekážka", "Čím viac sa snažím, tým menej to ide — akoby som narazil na stenu."],
    ["kolaps", "Kolaps", "Cítim, že sa mi to celé rozpadá a strácam istotu."],
    ["experimentovanie", "Experimentovanie", "Skúšam nové veci a hľadám, čo bude fungovať."],
    ["integracia", "Integrácia", "Začína mi to do seba zapadať a formuje sa nový spôsob fungovania."],
    ["nova_stabilita", "Nová stabilita", "Po zmene fungujem inak a chcem si to upevniť."],
  ];
  async function sendDZ(text) {
    const content = (text != null ? text : input).trim();
    if (!content || loading) return;
    const next = [...msgs, { role: "user", content }];
    setMsgs(next); setInput(""); setLoading(true); setError(null);
    try {
      const reply = await aiComplete({ chat: true, system: "Používateľ konzultuje svoju tému v Dynamike zmeny. Veď reflexívny rozhovor podľa facilitačného protokolu z KB.", messages: next, max_tokens: 700 });
      setMsgs([...next, { role: "assistant", content: String(reply).trim() }]);
    } catch (e) {
      setError(e.message || "Nepodarilo sa odoslať. Skús to prosím znova.");
    } finally { setLoading(false); }
  }
  return (
    <div className="sa-dyn">
      <DynamikaZmenyGraf />
      <p className="sa-areahint" style={{ marginTop: 0 }}>Prechod na vyššiu úroveň nenastáva automaticky — vyžaduje zmenu životných podmienok, krízu a vnútornú pripravenosť.</p>

      <div className="sa-quadtrack-title" style={{ marginBottom: 12 }}>Fázy prechodu</div>
      <div className="sa-phases">
        {SD_KB.fazy.map((f, i) => (
          <div key={i} className="sa-phase">
            <span className="sa-phasenum">{i + 1}</span>
            <div><div className="sa-phaset">{f.t}</div><p className="sa-lvrowbody">{f.d}</p></div>
          </div>
        ))}
      </div>

      <div className="sa-quadtrack-title" style={{ margin: "22px 0 12px" }}>Mosty medzi úrovňami</div>
      <div className="sa-bridges">
        {SD_KB.prechody.map((p, i) => {
          const F = SPIRAL_LEVELS.find((x) => x.key === p.from), T = SPIRAL_LEVELS.find((x) => x.key === p.to);
          return (
            <div key={i} className="sa-bridge">
              <div className="sa-bridgeicons">
                <img src={IC[p.from] || ""} alt={F.name} style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", boxShadow: "0 0 6px " + F.glow }} />
                <span className="sa-bridgearrow" style={{ background: "linear-gradient(90deg," + F.clr + "," + T.clr + ")" }} />
                <img src={IC[p.to] || ""} alt={T.name} style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", boxShadow: "0 0 6px " + T.glow }} />
              </div>
              <div className="sa-bridgebody">
                <div className="sa-bridgerow"><span style={{ color: "#F87171" }}>Spúšťače</span>{p.spustace}</div>
                <div className="sa-bridgerow"><span style={{ color: "#4ADE80" }}>Most</span>{p.most}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sa-dyn2col">
        <div>
          <div className="sa-quadtrack-title" style={{ margin: "22px 0 12px" }}>Znaky stagnácie a regresie</div>
          {SD_KB.stagnacia.map((s, i) => (
            <div key={i} className="sa-lvrow"><span className="sa-lvrowtitle" style={{ color: "#FACC15" }}>{s.t}</span><p className="sa-lvrowbody">{s.d}</p></div>
          ))}
        </div>
        <div>
          <div className="sa-quadtrack-title" style={{ margin: "22px 0 12px" }}>Čo podporuje prechod</div>
          <ul className="sa-planlist">{SD_KB.faktory.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      </div>

      <div className="sa-quadtrack-title" style={{ margin: "26px 0 6px" }}>Konzultácia s AI sprievodcom</div>
      <p className="sa-areahint" style={{ marginTop: 0 }}>Opíš svoju situáciu — sprievodca ti pomôže rozpoznať, v ktorej fáze zmeny si a čo tá fáza potrebuje. Alebo klikni na fázu, ktorá ti je najbližšia.</p>
      {msgs.length === 0 && (
        <div className="sa-dzchips">
          {DZ_PHASES.map(([id, label, starter]) => (
            <button key={id} type="button" className="sa-dzchip" onClick={() => sendDZ(starter)}>{label}</button>
          ))}
        </div>
      )}
      {msgs.length > 0 && (
        <div className="sa-dzchat">
          {msgs.map((m, i) => (
            <div key={i} className={"sa-msg " + (m.role === "user" ? "sa-msg-user" : "sa-msg-ai")}>{m.content}</div>
          ))}
          {loading && <div className="sa-msg sa-msg-ai" style={{ display: "flex", alignItems: "center", gap: 8 }}><Spiral size={16} className="sa-spin" /> premýšľam…</div>}
        </div>
      )}
      {error && <div className="sa-error" style={{ marginTop: 10 }}>{error}</div>}
      <div className="sa-dzinput">
        <textarea className="sa-area" rows={2} value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDZ(); } }}
          placeholder="Napíš, čo prežívaš…" />
        <button type="button" className="sa-btn sa-btn-primary" disabled={loading || !input.trim()} onClick={() => sendDZ()}>Poslať</button>
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&display=swap');

.sa-root *{box-sizing:border-box}
.sa-root{
  --text:#f0ece2; --muted:rgba(240,236,226,0.55); --faint-txt:rgba(240,236,226,0.32);
  --line:rgba(255,255,255,0.09); --line-strong:rgba(255,255,255,0.16);
  --accent:#2DD4BF; --accent-soft:rgba(45,212,191,0.13); --accent-line:rgba(45,212,191,0.5);
  --purple:#A78BFA; --danger:#F87171;
  font-family:'DM Sans',system-ui,-apple-system,sans-serif;
  color:var(--text); min-height:100%; width:100%; padding:26px 18px 54px;
  -webkit-font-smoothing:antialiased; position:relative; z-index:2; background:transparent;
}
.sa-shell{max-width:860px;margin:0 auto}

/* Horná lišta */
.sa-topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:22px;flex-wrap:wrap}
.sa-brand{display:flex;align-items:center;gap:12px;background:none;border:none;cursor:pointer;padding:4px;text-align:left}
.sa-brandtext{display:flex;flex-direction:column;line-height:1.15}
.sa-brandname{font-family:'DM Sans',sans-serif;font-size:22px;font-weight:700;letter-spacing:-.01em;color:var(--text)}
.sa-brandlogo{height:52px;width:auto;display:block;object-fit:contain}
.sa-welcomelogo{height:min(336px,78vw);width:auto;max-width:92vw;display:block;object-fit:contain;margin:2px auto 3px;filter:drop-shadow(0 0 36px rgba(45,212,191,0.3))}
.sa-my{background:linear-gradient(90deg,#A78BFA,#2DD4BF);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.sa-brandsub{font-family:'DM Sans',sans-serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-top:3px}
.sa-topright{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}
.sa-accesspill{display:inline-flex;align-items:center;gap:6px;font-family:'DM Sans',sans-serif;font-size:9.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:5px 11px;border-radius:99px;border:1px solid var(--line-strong);color:var(--muted)}
.sa-backlink{font-family:'DM Sans',sans-serif;background:none;border:1px solid var(--line);color:var(--muted);font-size:12px;padding:8px 15px;border-radius:9px;cursor:pointer;transition:all .15s ease;text-decoration:none;display:inline-block;white-space:nowrap}
.sa-backlink:hover{color:var(--text);border-color:var(--line-strong)}

/* Panel */
.sa-panel{background:rgba(12,12,20,0.6);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--line);border-radius:18px;padding:26px;margin-bottom:16px;animation:sa-fade .35s ease}
@keyframes sa-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

/* Hero / profil */
.sa-hero{padding:24px 26px}
.sa-herohead{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px}
.sa-heroh{font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:500;margin:0;color:var(--text);letter-spacing:.01em}
.sa-herosub{margin:5px 0 0;font-family:'DM Sans',sans-serif;font-size:12px;color:var(--muted)}
.sa-herostat{display:flex;flex-direction:column;align-items:flex-end;line-height:1}
.sa-heronum{font-family:'Playfair Display',serif;font-size:32px;font-weight:600;color:var(--accent)}
.sa-heronumlabel{font-family:'DM Sans',sans-serif;font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-top:4px}

.sa-spec{display:flex;width:100%;border-radius:6px;overflow:hidden;border:1px solid rgba(255,255,255,0.08)}
.sa-specseg{height:100%}
.sa-specempty{width:100%;border-radius:6px;background:rgba(255,255,255,0.05);border:1px dashed var(--line)}

.sa-toplist{display:flex;flex-wrap:wrap;gap:14px;margin-top:14px}
.sa-topitem{display:inline-flex;align-items:center;gap:7px;font-size:12.5px}
.sa-topname{color:var(--text);font-weight:500}
.sa-toppct{color:var(--muted)}

.sa-quadtrack{margin-top:20px;padding-top:18px;border-top:1px solid var(--line)}
.sa-quadtrack-title{font-family:'DM Sans',sans-serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin-bottom:13px}
.sa-qtrow{display:flex;align-items:center;gap:12px;margin-bottom:9px}
.sa-qtname{flex:none;width:74px;font-size:13px;font-weight:600;color:var(--text)}
.sa-qtcode{font-size:9.5px;font-weight:600;color:var(--muted);margin-left:5px;letter-spacing:.06em}
.sa-qtbar{flex:1;min-width:0}
.sa-qttop{flex:none;width:76px;text-align:right;font-size:11.5px;color:var(--muted)}

.sa-lensmini{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}
.sa-lensminichip{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);padding:5px 11px;border:1px solid var(--line);border-radius:20px}
.sa-lensminichip b{color:var(--text)}

/* Navigácia medzi funkciami */
.sa-nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:-6px 0 18px}
.sa-navtab{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:6px 8px;border-radius:10px;background:none;border:none;color:var(--muted);cursor:pointer;transition:color .15s ease}
.sa-navtab:hover{color:var(--text)}
.sa-navtab.is-on{color:var(--text)}
.sa-navtab-feature{color:#c9b273}
.sa-navtab-feature:hover{color:#e9d9a6}
.sa-navtab-feature.is-on{color:#f0dfa0}
.sa-navtab-icon{display:flex;flex-direction:column;align-items:center;gap:7px;padding:8px 10px}
.sa-navicon{width:50px;height:50px;border-radius:14px;object-fit:contain;background:rgba(255,255,255,0.02);border:1.5px solid rgba(255,255,255,0.10);transition:border-color .15s ease,transform .15s ease}
.sa-navtab:hover .sa-navicon{transform:scale(1.06);border-color:rgba(255,255,255,0.28)}
.sa-navtab.is-on .sa-navicon{border-color:rgba(255,255,255,0.42)}

/* Funkcie — široká karta */
.sa-lenswide{grid-column:1 / -1;flex-direction:row;align-items:center;gap:16px}

/* Diagnostika — otázky a výsledok */
.sa-qcard{border:1px solid var(--line);border-radius:13px;padding:15px;background:rgba(255,255,255,0.025);margin-bottom:10px}
.sa-qnum{font-family:'DM Sans',sans-serif;font-size:9.5px;font-weight:700;letter-spacing:.14em;color:#A78BFA;text-transform:uppercase;margin-bottom:6px}
.sa-qtext{font-family:Georgia,serif;font-size:14.5px;line-height:1.55;color:rgba(240,236,226,0.9);margin:0 0 10px}
.sa-dlevels{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:4px}
.sa-dlevel{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 8px;border-radius:12px;background:rgba(255,255,255,0.025);border:1px solid var(--line);cursor:pointer;transition:all .18s ease}
.sa-dlevel:hover{border-color:var(--line-strong);background:rgba(255,255,255,0.05)}
.sa-dlevel.is-sel{border-color:var(--lvl);box-shadow:0 0 14px var(--lvlglow)}
.sa-dbar{width:100%;height:4px;border-radius:99px;background:rgba(255,255,255,0.08);overflow:hidden}

/* Hľavička podstránky (Témy / Progres) */
.sa-viewhead{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:18px;flex-wrap:wrap}
.sa-viewheadmain{display:flex;align-items:center;gap:14px}
.sa-heroicon{width:84px;height:84px;border-radius:21px;object-fit:contain;flex-shrink:0;background:rgba(255,255,255,0.02);border:1.5px solid rgba(255,255,255,0.10)}

/* Časová os progresu */
.sa-timeline{margin-top:20px;padding-top:18px;border-top:1px solid var(--line)}
.sa-tlrow{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05)}
.sa-tlrow:last-child{border-bottom:none}
.sa-tldate{flex:none;width:96px;font-family:'DM Sans',sans-serif;font-size:11.5px;color:var(--muted)}
.sa-tldot{flex:none;width:10px;height:10px;border-radius:50%}
.sa-tlmain{flex:1;min-width:0;display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}
.sa-tltopic{font-size:14px;color:var(--text);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sa-tllens{font-family:'DM Sans',sans-serif;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}

/* Progres — podkategórie */
.sa-subnav{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}
.sa-subtab{font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;padding:9px 16px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid var(--line);color:var(--muted);cursor:pointer;transition:all .15s ease}
.sa-subtab:hover{color:var(--text);border-color:var(--line-strong)}
.sa-subtab.is-on{color:var(--text);background:rgba(45,212,191,0.12);border-color:var(--accent-line)}
.sa-subtab-feature{border-color:rgba(212,175,55,0.55);font-size:15px;padding:14px 24px;font-weight:700;color:#241c05;background:linear-gradient(90deg,#d4af37,#f0dfa0)}
.sa-subtab-feature:hover{background:linear-gradient(90deg,#e0bd4a,#f6e6ac)}
.sa-subtab-feature.is-on{color:#241c05;background:linear-gradient(90deg,#d4af37,#f0dfa0);border-color:transparent}
.sa-subtab-badge{margin-left:8px;font-family:'DM Sans',sans-serif;font-size:8px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:rgba(36,28,5,0.5);background:transparent;padding:0;border-radius:0;vertical-align:middle}
.sa-gokvadbtn{display:inline-flex;align-items:center;gap:8px;margin-top:14px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#0b0b12;background:linear-gradient(90deg,#A78BFA,#2DD4BF);border:none;padding:13px 22px;border-radius:12px;cursor:pointer;transition:filter .2s}
.sa-gokvadbtn:hover{filter:brightness(1.08)}

/* Progres — oblasť */
.sa-arealabel{font-family:'DM Sans',sans-serif;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
.sa-areachips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.sa-areachip{font-family:'DM Sans',sans-serif;font-size:12px;padding:7px 13px;border-radius:99px;background:rgba(255,255,255,0.03);border:1px solid var(--line);color:var(--muted);cursor:pointer;transition:all .15s ease;max-width:230px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sa-areachip:hover{color:var(--text);border-color:var(--line-strong)}
.sa-areachip.is-on{color:#0b0b12;background:linear-gradient(90deg,#A78BFA,#2DD4BF);border-color:transparent;font-weight:600}
.sa-areahint{font-family:'DM Sans',sans-serif;font-size:12px;color:var(--muted);line-height:1.55;margin:0 0 16px}

/* Progres — ikony úrovní (párový Express/Deny layout) */
.sa-plevels{display:grid;grid-template-columns:repeat(8,1fr);gap:12px 6px;align-items:start}
.sa-plvicon{display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 4px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid var(--line);cursor:pointer;transition:all .18s ease;width:100%}
.sa-plvicon:hover{border-color:var(--line-strong);background:rgba(255,255,255,0.05)}
.sa-plvicon.is-on{border-color:var(--lvl);box-shadow:0 0 14px var(--lvlglow)}
.sa-plvname{font-family:'DM Sans',sans-serif;font-size:8px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;text-align:center;line-height:1.2}
.sa-plvbar{width:100%;height:3px;border-radius:99px;background:rgba(255,255,255,0.08);overflow:hidden}
.sa-plvaxis{padding:8px 4px}

/* Progres — rozbaľovacie okno úrovne */
.sa-lvdetail{margin-top:12px;padding:16px 18px;border-radius:14px;background:rgba(10,10,18,0.55);border:1px solid var(--line);border-left-width:3px;animation:sa-fade .28s ease}
.sa-lvdetail-head{display:flex;align-items:center;gap:11px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--line)}
.sa-lvrow{padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05)}
.sa-lvrow:last-child{border-bottom:none}
.sa-lvrowtitle{display:block;font-family:'DM Sans',sans-serif;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px}
.sa-lvrowbody{font-family:Georgia,serif;font-size:13.5px;font-weight:300;line-height:1.6;color:rgba(221,221,221,0.85);margin:0}

/* Progres — plán rastu */
.sa-plan{margin-top:22px;padding-top:18px;border-top:1px solid var(--line)}
.sa-planpick{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.sa-planchip{display:inline-flex;align-items:center;gap:7px;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;padding:7px 12px;border-radius:99px;background:rgba(255,255,255,0.03);border:1px solid var(--line);color:var(--muted);cursor:pointer;transition:all .15s ease}
.sa-planchip:hover{color:var(--text);border-color:var(--line-strong)}
.sa-planchip.is-on{color:var(--text);border-color:var(--lvl);background:rgba(255,255,255,0.06)}
.sa-planout{margin-top:16px}
.sa-planouthead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}
.sa-planarea{font-family:'DM Sans',sans-serif;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.sa-planclear{font-family:'DM Sans',sans-serif;font-size:11px;color:var(--muted);background:none;border:none;cursor:pointer;text-decoration:underline;padding:0}
.sa-planclear:hover{color:var(--danger)}
.sa-plancard{padding:13px 15px;border-radius:12px;background:rgba(255,255,255,0.025);border:1px solid var(--line);border-left:3px solid;margin-bottom:10px}
.sa-plancard-head{font-family:'DM Sans',sans-serif;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px}
.sa-planlist{margin:6px 0 0;padding-left:18px}
.sa-planlist li{font-family:Georgia,serif;font-size:13.5px;font-weight:300;line-height:1.6;color:rgba(221,221,221,0.85);margin-bottom:4px}
.sa-planstep{margin-top:10px;font-family:Georgia,serif;font-size:13.5px;color:rgba(221,221,221,0.9);background:rgba(45,212,191,0.08);border:1px solid var(--accent-line);border-radius:9px;padding:9px 12px}
.sa-planstep span{display:block;font-family:'DM Sans',sans-serif;font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:3px}

/* Dashboard — hodnotový profil (voliteľné ukazovatele) */
.sa-profiledisc{padding:0 !important;overflow:hidden}
.sa-profiletoggle{display:flex;align-items:center;justify-content:space-between;width:100%;gap:10px;padding:15px 20px;background:none;border:none;cursor:pointer;text-align:left}
.sa-profiletoggle:hover{background:rgba(255,255,255,0.03)}
.sa-profilebody{padding:2px 20px 20px}

/* Diagnostika — schéma (párové ikony) + vertikálne stĺpce */
.sa-dgridscroll{overflow-x:auto;margin:0 -6px;padding:2px 6px 4px}
.sa-dgrid{display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:auto auto auto auto;gap:6px 4px;align-items:center;justify-items:center;min-width:448px}
.sa-dcell{display:flex;align-items:center;justify-content:center;background:none;border:1px solid transparent;border-radius:12px;cursor:pointer;padding:3px;width:100%;transition:background .15s,border-color .15s}
.sa-dcell:hover{background:rgba(255,255,255,0.04)}
.sa-dcell.is-sel{border-color:var(--lvl);background:rgba(255,255,255,0.05)}
.sa-dcellname{font-family:'DM Sans',sans-serif;font-size:8.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;text-align:center;line-height:1.15;transition:color .2s}
.sa-dvbar{display:flex;flex-direction:column;align-items:center;gap:5px;background:none;border:none;cursor:pointer;padding:2px 0 0;width:100%}
.sa-dvbar-track{width:12px;height:78px;border-radius:99px;background:rgba(255,255,255,0.08);display:flex;align-items:flex-end;overflow:hidden}
.sa-dvbar-fill{width:100%;border-radius:99px;transition:height .55s cubic-bezier(.4,0,.2,1)}
.sa-dvbar-pct{font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;transition:color .2s}

/* Prostredie — diagnostika súladu */
.sa-quadtoggle{display:flex;align-items:center;gap:9px;width:100%;margin-top:14px;padding:11px 14px;border-radius:12px;background:rgba(96,165,250,0.07);border:1px solid rgba(96,165,250,0.28);color:#cfe0f5;font-family:'DM Sans',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer;transition:background .15s,border-color .15s}
.sa-quadtoggle:hover{background:rgba(96,165,250,0.12);border-color:rgba(96,165,250,0.5)}
.sa-hintmuted{font-weight:500;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(207,224,245,0.5)}
.sa-envnote{margin-top:14px;padding:11px 14px;border-radius:11px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.24);font-family:Georgia,serif;font-size:13px;font-weight:300;line-height:1.6;color:rgba(221,221,221,0.85)}
.sa-linklike{background:none;border:none;padding:0;color:#A78BFA;font:inherit;cursor:pointer;text-decoration:underline}
.sa-chipwrap{display:flex;flex-wrap:wrap;gap:8px}
.sa-suladbox{display:flex;align-items:center;gap:18px;margin-top:6px;padding:16px 18px;border-radius:14px;background:rgba(10,10,18,0.5);border:1px solid var(--line)}
.sa-suladring{flex:none;width:92px;height:92px;border-radius:50%;display:grid;place-items:center}
.sa-suladinner{width:70px;height:70px;border-radius:50%;background:#0b0b12;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px}
.sa-suladinner span{font-family:'DM Sans',sans-serif;font-size:20px;font-weight:700;line-height:1}
.sa-suladinner em{font-family:'DM Sans',sans-serif;font-style:normal;font-size:8.5px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,0.4)}
.sa-suladlabel{font-family:'DM Sans',sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,0.5)}

/* Progres — hodnotový profil / perspektíva */
.sa-persp{margin-top:14px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,0.02);overflow:hidden}
.sa-persphead{display:flex;align-items:center;justify-content:space-between;width:100%;gap:10px;padding:13px 16px;background:none;border:none;cursor:pointer;text-align:left}
.sa-persphead:hover{background:rgba(255,255,255,0.03)}
.sa-persphead-l{display:flex;flex-direction:column;gap:2px}
.sa-persptitle{font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:var(--text)}
.sa-perspcur{font-family:'DM Sans',sans-serif;font-size:10.5px;letter-spacing:.05em;color:var(--muted)}
.sa-perspchev{color:var(--muted);font-size:13px;transition:transform .2s;flex:none}
.sa-perspchev.is-open{transform:rotate(180deg)}
.sa-perspbody{padding:0 16px 16px}
.sa-perspchips{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px}
.sa-perspchip{display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:7px 12px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid var(--line);color:var(--muted);cursor:pointer;transition:all .15s ease}
.sa-perspchip:hover{color:var(--text);border-color:var(--line-strong)}
.sa-perspchip.is-on{color:var(--text);border-color:var(--accent-line);background:rgba(45,212,191,0.1)}
.sa-perspchip span{font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600}
.sa-perspchip em{font-family:'DM Sans',sans-serif;font-size:9px;font-style:normal;letter-spacing:.04em;opacity:.7}

/* Progres — dynamika zmeny */
.sa-phases{display:flex;flex-direction:column;gap:2px}
.sa-phase{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)}
.sa-phase:last-child{border-bottom:none}
.sa-phasenum{flex:none;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:700;color:#0b0b12;background:linear-gradient(135deg,#A78BFA,#2DD4BF)}
.sa-phaset{font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;color:var(--text);margin-bottom:2px}
.sa-bridges{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sa-bridge{padding:12px 14px;border-radius:12px;background:rgba(255,255,255,0.025);border:1px solid var(--line)}
.sa-bridgeicons{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.sa-bridgearrow{flex:1;height:2px;border-radius:2px}
.sa-bridgebody{display:flex;flex-direction:column;gap:5px}
.sa-bridgerow{font-family:Georgia,serif;font-size:12.5px;font-weight:300;line-height:1.5;color:rgba(221,221,221,0.82)}
.sa-bridgerow span{font-family:'DM Sans',sans-serif;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-right:6px}
.sa-dyn2col{display:grid;grid-template-columns:1fr 1fr;gap:20px}

/* Uvítanie */
.sa-welcome{text-align:center;padding:40px 28px}
.sa-welcomeh{font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:500;margin:8px 0 12px;color:var(--text)}
.sa-welcometext{font-family:Georgia,serif;font-weight:300;max-width:520px;margin:0 auto;font-size:14.5px;line-height:1.7;color:var(--muted)}

/* Osem úrovní — ikonový pás */
.sa-levels{padding:24px 20px 22px}
.sa-levels-head{margin-bottom:6px;padding:0 6px}
.sa-levels-scroll{overflow-x:auto;overflow-y:hidden;margin:0 -20px;padding:0 20px}
.sa-levels-canvas{position:relative;margin:0 auto}
.sa-zone{position:absolute;left:0;right:0;text-align:center;font-family:'DM Sans',sans-serif;font-size:8px;letter-spacing:0.38em;text-transform:uppercase;pointer-events:none;z-index:5}
.sa-lvwrap{position:absolute;cursor:pointer;display:flex;flex-direction:column;align-items:center}
.sa-lvaxis{position:absolute;cursor:pointer}
.sa-canvasbar{display:block;width:72%;margin:5px auto 0;height:4px;border-radius:99px;background:rgba(255,255,255,0.1);overflow:hidden}
.sa-lvcard{display:flex;gap:14px;align-items:flex-start;margin-top:6px;padding:16px 18px;border-radius:14px;border:1px solid;border-left-width:3px;backdrop-filter:blur(10px);animation:sa-fade .3s ease}

/* Diagnostika úrovne */
.sa-diag{margin-top:18px;padding-top:18px;border-top:1px solid var(--line)}
.sa-diag-label{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin-bottom:6px}
.sa-diag-hint{font-family:Georgia,serif;font-weight:300;font-size:13px;line-height:1.55;color:var(--muted);margin:0 0 12px}
.sa-diag-area{width:100%}
.sa-diag-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px}
.sa-diag-count{font-family:'DM Sans',sans-serif;font-size:12px;color:var(--muted)}
.sa-diag-result{display:flex;gap:14px;align-items:flex-start;margin-top:16px;padding:16px 18px;border-radius:14px;border:1px solid;border-left-width:3px;backdrop-filter:blur(10px);animation:sa-fade .3s ease}

/* Mandala vo flow — side-by-side s kvadrantmi */
.sa-quad-layout{display:flex;flex-direction:column;gap:20px;align-items:stretch}
.sa-mandala-center{display:flex;justify-content:center;width:100%;padding:6px 0 0}
.sa-mandala-side{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;position:sticky;top:18px}
.sa-mandala-wrap{display:flex;justify-content:center;margin:2px 0 22px}

/* Sekčný label */
.sa-sectionlabel{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin:24px 2px 12px}

/* Optiky */
.sa-lenses{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.sa-funcs{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.sa-lens{display:flex;flex-direction:column;align-items:flex-start;gap:9px;text-align:left;cursor:pointer;background:rgba(255,255,255,0.03);border:1px solid var(--line);border-radius:15px;padding:18px;transition:all .18s ease}
.sa-lens:hover{border-color:var(--acc);background:rgba(255,255,255,0.05);transform:translateY(-2px);box-shadow:0 10px 30px rgba(0,0,0,0.3)}
.sa-lensicon{width:72px;height:72px;border-radius:16px;object-fit:contain;flex-shrink:0;background:rgba(255,255,255,0.02);border:1.5px solid rgba(255,255,255,0.10);transition:border-color .18s ease,transform .18s ease}
.sa-lens:hover .sa-lensicon{border-color:var(--acc);transform:scale(1.05)}
.sa-lenstitle{font-family:'DM Sans',sans-serif;font-size:16px;font-weight:600;color:var(--text)}
.sa-lensdesc{font-family:Georgia,serif;font-weight:300;font-size:13px;line-height:1.5;color:var(--muted);flex:1}
.sa-lensgo{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;margin-top:2px}
.sa-lens:focus-visible{outline:2px solid var(--acc);outline-offset:2px}

/* Nedávne */
.sa-recent{display:flex;flex-direction:column;gap:9px}
.sa-reccard{display:flex;align-items:center;gap:13px;cursor:pointer;text-align:left;background:rgba(255,255,255,0.025);border:1px solid var(--line);border-radius:13px;padding:13px 15px;transition:all .15s ease}
.sa-reccard:hover{border-color:var(--line-strong);background:rgba(255,255,255,0.05)}
.sa-recicon{width:34px;height:34px;flex:none;border-radius:9px;display:grid;place-items:center;background:rgba(255,255,255,0.04);border:1px solid var(--line)}
.sa-recmain{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.sa-rectopic{font-size:14.5px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sa-recmeta{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
.sa-recsep{color:var(--faint-txt)}
.sa-recdots{display:flex;gap:5px;flex:none}
.sa-reccard:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

/* Optika riadok vo flow */
.sa-lensline{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.sa-lenslineicon{width:36px;height:36px;border-radius:10px;object-fit:contain;flex-shrink:0;background:rgba(255,255,255,0.02);border:1.5px solid rgba(255,255,255,0.10)}
.sa-lenslabel{font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;letter-spacing:.13em;text-transform:uppercase}

/* Téma vstup */
.sa-lead{display:block;font-family:'Playfair Display',Georgia,serif;font-size:20px;font-weight:500;color:var(--text);margin-bottom:14px}
.sa-input{width:100%;font-family:'DM Sans',sans-serif;font-size:15px;padding:15px 16px;border-radius:13px;background:rgba(10,10,18,0.75);border:1px solid var(--line);color:var(--text)}
.sa-input::placeholder{color:rgba(240,236,226,0.35);font-style:italic}
.sa-input:focus-visible{outline:none;border-color:var(--accent-line);box-shadow:0 0 0 3px var(--accent-soft)}
.sa-examples{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.sa-ex{font-family:'DM Sans',sans-serif;font-size:12.5px;color:var(--muted);cursor:pointer;padding:7px 13px;border:1px solid var(--line);border-radius:20px;background:transparent;transition:all .15s ease}
.sa-ex:hover{color:var(--text);border-color:var(--accent-line);background:var(--accent-soft)}

/* Téma riadok */
.sa-topicline{display:flex;align-items:center;gap:10px;margin-bottom:22px;padding-bottom:16px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.sa-topiclabel{font-family:'DM Sans',sans-serif;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);flex:none}
.sa-topicval{font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:18px;font-weight:500;color:var(--text)}
.sa-lenspill{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;padding:3px 10px;border:1px solid;border-radius:20px}
.sa-detaildate{margin-left:auto;font-size:12px;color:var(--muted)}

/* Mapa / rámec */
.sa-map{margin:4px 0 6px}
.sa-maprow{display:flex;align-items:stretch;gap:10px}
.sa-grid{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:10px;min-width:0}
.sa-axis{font-family:'DM Sans',sans-serif;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--faint-txt)}
.sa-axis-top{text-align:center;padding-bottom:8px}
.sa-axis-bottom{text-align:center;padding-top:8px}
.sa-axis-side{writing-mode:vertical-rl;text-align:center;display:flex;align-items:center;justify-content:center;flex:none}
.sa-axis-side:last-child{transform:rotate(180deg)}

/* Bunka */
.sa-cell{border:1px solid var(--line);border-radius:13px;padding:15px;background:rgba(255,255,255,0.02);min-width:0;transition:border-color .2s,background .2s,box-shadow .2s}
.sa-cell.is-primary{background:rgba(255,255,255,0.045);border-color:rgba(255,255,255,0.14)}
.sa-cell.is-qhover{border-color:rgba(147,206,197,.6);background:rgba(147,206,197,0.06);box-shadow:0 0 0 1px rgba(147,206,197,.22)}
.sa-quadpop{position:absolute;background:rgba(14,14,22,0.97);border:1px solid rgba(147,206,197,.42);border-radius:13px;padding:13px 13px 12px;box-shadow:0 16px 46px rgba(0,0,0,.62)}
.sa-quadpop .sa-cellhead{margin-bottom:6px;padding-right:18px}
.sa-quadpop-x{position:absolute;top:5px;right:8px;background:none;border:none;color:rgba(255,255,255,.5);font-size:19px;line-height:1;cursor:pointer;padding:2px 4px;z-index:1}
.sa-quadpop-x:hover{color:#fff}
.sa-cellhead{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.sa-cellname{font-family:'Playfair Display',Georgia,serif;font-size:17px;font-weight:500;color:var(--text)}
.sa-cellcode{font-family:'DM Sans',sans-serif;font-size:10px;font-weight:700;letter-spacing:.07em;color:var(--accent);background:var(--accent-soft);padding:2px 7px;border-radius:5px}
.sa-celltag{margin-left:auto;font-family:'DM Sans',sans-serif;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint-txt)}
.sa-celldims{margin:0 0 8px;font-family:'DM Sans',sans-serif;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint-txt)}
.sa-cellq{margin:0 0 10px;font-family:Georgia,serif;font-size:13px;line-height:1.5;color:var(--muted)}
.sa-area{width:100%;font-family:'DM Sans',sans-serif;font-size:13.5px;line-height:1.5;padding:10px 11px;border:1px solid var(--line);border-radius:9px;resize:vertical;background:rgba(10,10,18,0.6);color:var(--text)}
.sa-area::placeholder{color:rgba(240,236,226,0.3)}
.sa-area:focus-visible{outline:none;border-color:var(--accent-line);box-shadow:0 0 0 3px var(--accent-soft)}

/* Akcie / tlačidlá */
.sa-actions{display:flex;justify-content:flex-end;margin-top:22px}
.sa-actions-split{justify-content:space-between;align-items:center}
.sa-actions-right{display:flex;align-items:center;gap:12px}
.sa-hint{font-family:'DM Sans',sans-serif;font-size:12px;color:var(--muted)}
.sa-btn{font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.12em;padding:13px 26px;border-radius:11px;cursor:pointer;border:1px solid transparent;transition:all .18s ease}
.sa-btn-primary{background:linear-gradient(90deg,#A78BFA,#2DD4BF);color:#0b0b12;font-weight:700;border-color:transparent}
.sa-btn-primary:hover:not(:disabled){box-shadow:0 8px 26px rgba(45,212,191,0.28)}
.sa-btn-primary:disabled{opacity:.32;cursor:not-allowed}
.sa-btn-ghost{background:transparent;color:var(--muted);border-color:var(--line)}
.sa-btn-ghost:hover{color:var(--text);border-color:var(--line-strong)}
.sa-btn-danger{background:transparent;color:var(--danger);border-color:rgba(248,113,113,0.5)}
.sa-btn-danger:hover{background:rgba(248,113,113,0.12);border-color:var(--danger)}
.sa-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

/* Loading + error */
.sa-loading{display:flex;align-items:center;gap:12px;margin-top:20px;color:var(--muted);font-size:13.5px}
.sa-spin{animation:sa-rot 2.4s linear infinite}
@keyframes sa-rot{to{transform:rotate(360deg)}}
.sa-error{margin-top:16px;padding:11px 14px;border-radius:9px;font-size:13px;background:rgba(248,113,113,0.12);color:#F3B0A9;border:1px solid rgba(248,113,113,0.3)}
.sa-empty-text{color:var(--muted);text-align:center;margin:0}

/* Výsledok */
.sa-h2{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin:26px 0 13px}
.sa-h2:first-of-type{margin-top:4px}
.sa-rescell{border:1px solid var(--line);border-left-width:3px;border-radius:13px;padding:14px;min-width:0;background:rgba(255,255,255,0.02)}
.sa-chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:9px}
.sa-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px 4px 7px;border:1px solid var(--line);border-radius:20px;background:rgba(255,255,255,0.05);font-size:11.5px}
.sa-dot{width:9px;height:9px;border-radius:50%;flex:none}
.sa-dot-lg{width:12px;height:12px}
.sa-chip-name{font-weight:600;color:var(--text)}
.sa-chip-sk{color:var(--muted)}
.sa-chip-empty{font-size:11.5px;color:var(--faint-txt);font-style:italic}
.sa-cellsum{margin:0;font-family:Georgia,serif;font-size:13px;line-height:1.55;color:rgba(240,236,226,0.75)}
.sa-tensions{display:grid;gap:10px}
.sa-tension{border:1px solid var(--line);border-radius:12px;padding:13px 15px;background:rgba(255,255,255,0.025)}
.sa-tensiontop{display:flex;align-items:center;gap:10px;margin-bottom:7px}
.sa-tensiondots{display:flex;gap:6px}
.sa-tensionbadge{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--accent);background:var(--accent-soft);padding:3px 10px;border-radius:6px}
.sa-tensiontext{margin:0;font-family:Georgia,serif;font-size:13.5px;line-height:1.55;color:rgba(240,236,226,0.8)}
.sa-reflect{margin:0;font-family:'Playfair Display',Georgia,serif;font-size:17px;line-height:1.6;color:var(--text);font-style:italic;padding:18px 22px;border-left:3px solid var(--accent);background:linear-gradient(90deg,var(--accent-soft),transparent);border-radius:0 12px 12px 0}
.sa-growth{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sa-grow{border:1px solid var(--line);border-radius:12px;padding:14px;background:rgba(255,255,255,0.025);min-width:0}
.sa-growhead{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.sa-growname{font-family:'DM Sans',sans-serif;font-size:14.5px;font-weight:600;color:var(--text)}
.sa-growcode{font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.07em}
.sa-growtext{margin:0;font-family:Georgia,serif;font-size:13px;line-height:1.55;color:rgba(240,236,226,0.8)}

/* Mobil */
@media (max-width:680px){
  .sa-root{padding:18px 12px 40px}
  .sa-panel{padding:18px}
  .sa-topbar{gap:10px}
  .sa-quad-layout{flex-direction:column}
  .sa-mandala-side{position:static;width:100%}
  .sa-dlevels{grid-template-columns:repeat(2,1fr)}
  .sa-plevels{grid-template-columns:repeat(4,1fr)}
  .sa-plevels>.sa-plvicon{grid-column:auto !important;grid-row:auto !important}
  .sa-bridges{grid-template-columns:1fr}
  .sa-dyn2col{grid-template-columns:1fr}
  .sa-lenswide{flex-direction:column;align-items:flex-start}
  .sa-lenses{grid-template-columns:1fr}
  .sa-funcs{grid-template-columns:1fr}
  .sa-tldate{width:74px}
  .sa-lensdesc{flex:none}
  .sa-axis-side{display:none}
  .sa-grid{grid-template-columns:1fr}
  .sa-growth{grid-template-columns:1fr}
  .sa-qtname,.sa-qttop{width:56px}
  .sa-actions-split{flex-direction:column-reverse;align-items:stretch;gap:10px}
  .sa-actions-right{justify-content:space-between}
  .sa-btn{width:100%}
  .sa-actions-right .sa-btn{width:auto;flex:1}
}
@media (prefers-reduced-motion:reduce){
  .sa-panel{animation:none}.sa-spin{animation:none}.sa-lens:hover{transform:none}.sa-lens:hover .sa-lensicon{transform:none}
}
/* Dynamika zmeny — AI konzultácia */
.sa-dzchips{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 14px}
.sa-dzchip{font-family:'DM Sans',sans-serif;font-size:12px;padding:7px 14px;border-radius:999px;cursor:pointer;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.32);color:#E9DDFF;transition:all .18s ease}
.sa-dzchip:hover{background:rgba(167,139,250,0.2);border-color:rgba(167,139,250,0.6)}
.sa-dzchat{display:flex;flex-direction:column;gap:10px;margin:6px 0 12px;max-height:420px;overflow-y:auto;padding:4px}
.sa-msg{max-width:82%;padding:11px 14px;border-radius:14px;font-family:'DM Sans',sans-serif;font-size:13.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.sa-msg-user{align-self:flex-end;background:linear-gradient(90deg,rgba(167,139,250,0.22),rgba(45,212,191,0.18));border:1px solid rgba(167,139,250,0.3);color:#eef}
.sa-msg-ai{align-self:flex-start;background:rgba(10,10,18,0.6);border:1px solid var(--line);color:var(--text)}
.sa-dzinput{display:flex;gap:10px;align-items:flex-end;margin-top:6px}
.sa-dzinput .sa-area{flex:1}
.sa-dzinput .sa-btn{white-space:nowrap;padding:11px 20px}
`;

/* ================================================================== *
 *  Spirálová mandala — 8 koncentrických vrstiev (chain-fit)
 *  Prevzaté z produkčného komponentu SpiralMandala, adaptované na
 *  globálny React runtime. Vrstvy = PNG prstence v mandala/layers/.
 * ================================================================== */
const ROTATION_DURATION_MS = 2400;
const SPIRAL_LEVEL_COLORS = {
  beige: '#c9b896', purple: '#6b4d8a', red: '#c8443d', blue: '#3e5a96',
  orange: '#d97a2c', green: '#4a8a3f', yellow: '#d9b441', turquoise: '#3aa6a0',
};
const SPIRAL_LEVEL_MEANINGS = {
  beige: 'Inštinkt · Prežitie', purple: 'Kmeň · Mágia', red: 'Sila · Ego',
  blue: 'Poriadok · Pravda', orange: 'Úspech · Stratégia', green: 'Komunita · Pluralita',
  yellow: 'Integrácia · Systém', turquoise: 'Holos · Globálna',
};
const SPIRAL_LEVEL_NAMES = {
  beige: 'Béžová', purple: 'Purpurová', red: 'Červená', blue: 'Modrá',
  orange: 'Oranžová', green: 'Zelená', yellow: 'Žltá', turquoise: 'Tyrkysová',
};
const SPIRAL_LEVEL_POLARITY = {
  beige: 'Express Self · JA', red: 'Express Self · JA', orange: 'Express Self · JA', yellow: 'Express Self · JA',
  purple: 'Deny Self · MY', blue: 'Deny Self · MY', green: 'Deny Self · MY', turquoise: 'Deny Self · MY',
};
const LAYER_CONFIG = [
  { key: 'beige',     imgSize: 600,  innerSrc: 0,   outerSrc: 205 },
  { key: 'purple',    imgSize: 600,  innerSrc: 182, outerSrc: 280 },
  { key: 'red',       imgSize: 600,  innerSrc: 194, outerSrc: 292 },
  { key: 'blue',      imgSize: 600,  innerSrc: 195, outerSrc: 292 },
  { key: 'orange',    imgSize: 500,  innerSrc: 195, outerSrc: 240 },
  { key: 'green',     imgSize: 600,  innerSrc: 202, outerSrc: 252, offsetY: 6 },
  { key: 'yellow',    imgSize: 1254, innerSrc: 392, outerSrc: 477, offsetY: 10 },
  { key: 'turquoise', imgSize: 600,  innerSrc: 196, outerSrc: 237 },
];
const M_VIEW = 800;
const M_BASE_OUTER = 51;

function buildGeometry(assetBase) {
  let prevOuter = 0;
  let firstReady = true;
  return LAYER_CONFIG.map((cfg, idx) => {
    const src = `${assetBase}/layers/${cfg.key}.png`;
    const color = SPIRAL_LEVEL_COLORS[cfg.key];
    let scale, targetInner, targetOuter;
    if (firstReady) {
      scale = M_BASE_OUTER / cfg.outerSrc;
      targetInner = cfg.innerSrc * scale;
      targetOuter = M_BASE_OUTER;
      firstReady = false;
    } else {
      scale = prevOuter / cfg.innerSrc;
      targetInner = prevOuter;
      targetOuter = cfg.outerSrc * scale;
    }
    const imgWidthVbu = cfg.imgSize * scale;
    prevOuter = targetOuter;
    return {
      ...cfg, idx, color, src,
      name: SPIRAL_LEVEL_NAMES[cfg.key], meaning: SPIRAL_LEVEL_MEANINGS[cfg.key],
      scale, targetInner, targetOuter, imgWidthVbu,
    };
  });
}

function LayerImage({ layer, rotation, isActive, isDimmed, isHovered, tintColor }) {
  const widthPct = (layer.imgWidthVbu / M_VIEW) * 100;
  const offX = ((layer.offsetX || 0) * layer.scale) / M_VIEW * 100;
  const offY = ((layer.offsetY || 0) * layer.scale) / M_VIEW * 100;
  let filterFx = 'none';
  if (isActive) filterFx = `drop-shadow(0 0 14px ${layer.color}dd) drop-shadow(0 0 28px ${layer.color}66)`;
  else if (isDimmed) filterFx = 'blur(1.4px) brightness(0.78) saturate(0.9)';
  else if (isHovered) filterFx = `drop-shadow(0 0 9px ${layer.color}aa)`;
  const brightness = isActive ? 1.18 : isHovered ? 1.10 : 1;
  const scaleFx = isActive ? 1.04 : 1;
  const opacity = isDimmed ? 0.78 : 1;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 1 + layer.idx, pointerEvents: 'none', opacity, filter: filterFx, transition: 'opacity 900ms ease, filter 900ms ease' }}>
      <img src={layer.src} alt="" draggable={false}
        style={{
          position: 'absolute', top: `calc(50% + ${offY}%)`, left: `calc(50% + ${offX}%)`,
          width: `${widthPct}%`, height: `${widthPct}%`,
          transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${scaleFx})`,
          transformOrigin: 'center center',
          transition: `transform ${ROTATION_DURATION_MS}ms cubic-bezier(0.45, 0.05, 0.25, 1), filter 900ms ease`,
          filter: `brightness(${brightness})`, userSelect: 'none', willChange: 'transform', imageRendering: '-webkit-optimize-contrast',
        }} />
      {tintColor && (
        <div style={{
          position: 'absolute', top: `calc(50% + ${offY}%)`, left: `calc(50% + ${offX}%)`,
          width: `${widthPct}%`, height: `${widthPct}%`, transform: 'translate(-50%, -50%)',
          WebkitMaskImage: `url(${layer.src})`, maskImage: `url(${layer.src})`,
          WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskPosition: 'center', maskPosition: 'center',
          WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
          background: tintColor, opacity: 0.32, mixBlendMode: 'color',
          transition: 'opacity 900ms ease, background-color 900ms ease', pointerEvents: 'none',
        }} />
      )}
    </div>
  );
}

function MandalaGlow({ activeColor }) {
  return (
    <>
      <div style={{ position: 'absolute', inset: '-18%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(217, 180, 65, 0.18) 0%, rgba(217, 122, 44, 0.09) 32%, rgba(58, 166, 160, 0.04) 58%, transparent 78%)', pointerEvents: 'none', zIndex: 0, animation: 'spiralMandalaGlowPulse 8s ease-in-out infinite', transformOrigin: 'center', filter: 'blur(8px)' }} />
      <div style={{ position: 'absolute', inset: '-14%', borderRadius: '50%', background: activeColor ? `radial-gradient(circle, ${activeColor}42 0%, ${activeColor}18 30%, transparent 62%)` : 'transparent', pointerEvents: 'none', zIndex: 0, opacity: activeColor ? 1 : 0, transition: 'opacity 900ms ease, background 900ms ease', filter: 'blur(6px)' }} />
    </>
  );
}

function HitOverlay({ geom, onClick, onHover }) {
  const pick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const radiusPx = Math.sqrt(dx * dx + dy * dy);
    const radiusVbu = radiusPx * (M_VIEW / rect.width);
    const maxR = geom[geom.length - 1].targetOuter + 25;
    if (radiusVbu > maxR) return null;
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < geom.length; i++) {
      const mid = (geom[i].targetInner + geom[i].targetOuter) / 2;
      const d = Math.abs(radiusVbu - mid);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return bestIdx;
  };
  return (
    <div onMouseMove={(e) => onHover(pick(e))} onMouseLeave={() => onHover(null)}
      onClick={(e) => { const idx = pick(e); if (idx !== null) onClick(idx); }}
      style={{ position: 'absolute', inset: 0, zIndex: 60, cursor: 'pointer' }} />
  );
}

/* ================================================================== *
 *  QuadrantMandalaKW — interaktúvna kvadrantová mandala (napojené z
 *  projektu Spiralova-dynamika-mandala.dc.html). 4 kvadranty × 8 vrstiev;
 *  hover rozsvieti štvrtinu-vrstvu, klik ju označí/odoberie. Dizajn a
 *  mechanika prevzaté 1:1 z linku (nezmenené), len portnuté na React hooks.
 * ================================================================== */
const KW_RULE_ONE = "Jedna na kvadrant";
const KW_RULE_FREE = "Ľubovoľný počet";
const KW_RULE_PEEL = "Odlupovať zvonku";

function kwSector(a0, a1, ri, ro) {
  const pt = (rad, a) => (rad * Math.cos(a)).toFixed(2) + " " + (rad * Math.sin(a)).toFixed(2);
  const ro2 = ro.toFixed(2);
  if (ri <= 0.6) {
    return "M0 0 L" + pt(ro, a0) + " A" + ro2 + " " + ro2 + " 0 0 1 " + pt(ro, a1) + " Z";
  }
  const ri2 = ri.toFixed(2);
  return "M" + pt(ro, a0) + " A" + ro2 + " " + ro2 + " 0 0 1 " + pt(ro, a1) +
         " L" + pt(ri, a1) + " A" + ri2 + " " + ri2 + " 0 0 0 " + pt(ri, a0) + " Z";
}

function buildKWGeom() {
  const R = 431;
  const B = [0, 0.135, 0.186, 0.267, 0.372, 0.475, 0.593, 0.712, 1.03];
  const H = Math.PI / 2;
  const quads = [[0, H], [H, Math.PI], [Math.PI, 3 * H], [3 * H, 2 * Math.PI]];
  const dMap = [[], [], [], []];
  const baseSegs = [];
  for (let q = 0; q < 4; q++) {
    const a0 = quads[q][0], a1 = quads[q][1];
    for (let r = 1; r <= 8; r++) {
      const ri = B[r - 1] * R, ro = B[r] * R;
      const d = kwSector(a0, a1, ri, ro);
      dMap[q][r] = d;
      baseSegs.push({ q, r, d });
    }
  }
  return { R, B, dMap, baseSegs };
}

const KW_NAMES = ["Béžová", "Purpurová", "Červená", "Modrá", "Oranžová", "Zelená", "Žltá", "Tyrkysová"];
const KW_COLS = ["#cfc7b3", "#b6a0d8", "#d98d99", "#93a1d0", "#cc9245", "#8bb187", "#d9c525", "#93cec5"];

/* Ken Wilberove kvadranty → geometrické štvrtiny mandaly (q index) + rohy */
const KW_QUADS = [
  { q: 2, code: "UL", name: "Ja", dim: "vnútro jednotlivca", corner: "tl" },
  { q: 3, code: "UR", name: "To", dim: "správanie a činy", corner: "tr" },
  { q: 1, code: "LL", name: "My", dim: "kultúra a vzťahy", corner: "bl" },
  { q: 0, code: "LR", name: "Ono", dim: "systémy a procesy", corner: "br" },
];
const KEY_TO_Q = { UL: 2, UR: 3, LL: 1, LR: 0 };
const KW_LEVEL_KEYS = ["beige", "purple", "red", "blue", "orange", "green", "yellow", "turquoise"];

/* Zdieľaný obsah bunky kvadrantu — rovnaký pod mandalou aj v pop-okne pri kvadrante */
function QuadCellInner({ k, lens, L, q, setQ }) {
  const isPrimary = L.primary.includes(k);
  return (
    <>
      <div className="sa-cellhead">
        <span className="sa-cellname">{QUADS[k].name}</span>
        <span className="sa-cellcode">{QUADS[k].en || QUADS[k].code}</span>
        <span className="sa-celltag">{isPrimary ? "hlavné" : "kontext"}</span>
      </div>
      <div className="sa-celldims">{QUADS[k].dims.join(" · ")}</div>
      <p className="sa-cellq">{QQ[lens][k].q}</p>
      <textarea className="sa-area" rows={3} value={q[k]}
        placeholder={QQ[lens][k].ph}
        onChange={(e) => setQ({ ...q, [k]: e.target.value })} />
    </>
  );
}

/* Stavový model segmentu v diagnostike: integrated · growth · absent · notPresent · complex.
   Odvodené z levelScores + segRelevant (per kvadrant, so segRelevant nesúcim fallback na per-úroveň relevant). */
function kwSegState(q, r, levelScores, segRelevant) {
  if (!levelScores) return "growth";
  const key = KW_LEVEL_KEYS[r - 1];
  const score = levelScores[key];
  if (score == null) return "notPresent";
  const nextKey = r < 8 ? KW_LEVEL_KEYS[r] : null;
  const nextScore = nextKey ? levelScores[nextKey] : null;
  if (nextScore != null && nextScore - score >= 25) return "complex";
  const relevant = segRelevant ? segRelevant(q, r) : true;
  if (!relevant) return "absent";
  return score >= 55 ? "integrated" : "growth";
}

function QuadrantMandalaKW({ src = "/mysdl/assets/mandala-cut.png", size = "min(42vw, 320px)", rule = KW_RULE_ONE, dimLevel = 0.32, removedLook = "Prázdno (čierna)", showCross = true, showLegend = true, showQuadLabels = true, hoverQuad, onHoverQuad, mode = "mark", levelScores = null, segRelevant = null, selectedSeg, onSelectSegment, renderQuadPanel = null }) {
  const geomRef = useRef(null);
  if (!geomRef.current) geomRef.current = buildKWGeom();
  const { R, B, dMap, baseSegs } = geomRef.current;
  const DISCS = KW_LEVEL_KEYS.map((k, i) => ({ key: k, r: i + 1, rad: B[i + 1] * R }));
  const DISC_BASE = "/mysdl/assets/only/";
  const diagnose = mode === "diagnose";
  const [removed, setRemoved] = useState([[], [], [], []]);
  const [hoverSeg, setHoverSeg] = useState(null);
  const [hoverRing, setHoverRing] = useState(0);
  const [hoverQuadIn, setHoverQuadIn] = useState(null);
  const [openQuad, setOpenQuad] = useState(null);
  const [selSegIn, setSelSegIn] = useState(null);
  const selSeg = (selectedSeg !== undefined) ? selectedSeg : selSegIn;
  const segScore = (q, r) => { if (!levelScores) return 0; const k = KW_LEVEL_KEYS[r - 1]; return Math.max(0, Math.min(100, (levelScores[k] != null ? levelScores[k] : 0))); };
  function handleSegClick(q, r) {
    if (diagnose) {
      const same = selSeg && selSeg.q === q && selSeg.r === r;
      const nv = same ? null : { q, r };
      setSelSegIn(nv);
      if (onSelectSegment) onSelectSegment(nv);
      return;
    }
    toggle(q, r);
  }

  function toggle(q, r) {
    setRemoved((prev) => {
      const next = prev.map((a) => a.slice());
      const set = next[q];
      if (rule === KW_RULE_FREE) {
        const i = set.indexOf(r);
        if (i >= 0) set.splice(i, 1); else set.push(r);
      } else if (rule === KW_RULE_PEEL) {
        const full = []; for (let k = r; k <= 8; k++) full.push(k);
        const isFull = full.every((k) => set.indexOf(k) >= 0) && set.length === full.length;
        next[q] = isFull ? [] : full;
      } else {
        next[q] = (set.length === 1 && set[0] === r) ? [] : [r];
      }
      return next;
    });
  }

  const removedFill = removedLook.indexOf("Stl") >= 0 ? "rgba(6,6,10,0.60)" : "#050506";
  const veilFill = "rgba(4,4,7," + dimLevel + ")";
  const hq = (hoverQuad !== undefined && hoverQuad !== null) ? hoverQuad : hoverQuadIn;
  const key = (q, r) => q + "-" + r;
  const hovered = {};
  if (hoverSeg) hovered[key(hoverSeg.q, hoverSeg.r)] = 1;
  else if (hoverRing) for (let q = 0; q < 4; q++) hovered[key(q, hoverRing)] = 1;
  if (hq !== null && hq !== undefined) for (let r = 1; r <= 8; r++) hovered[key(hq, r)] = 1;
  const isRem = (q, r) => removed[q].indexOf(r) >= 0;

  const removedSegs = [];
  const removedList = [];
  if (!diagnose) for (let q = 0; q < 4; q++) removed[q].forEach((r) => { removedSegs.push(dMap[q][r]); removedList.push({ q, r }); });
  const veilSegs = [], revealSegs = [], litSegs = [];
  const revealByRing = {};
  baseSegs.forEach((s) => {
    const hov = hovered[key(s.q, s.r)];
    const selHere = diagnose && selSeg && selSeg.q === s.q && selSeg.r === s.r;
    if (hov || selHere) revealSegs.push(s.d);
    if (diagnose) {
      const st = kwSegState(s.q, s.r, levelScores, segRelevant);
      const sc = segScore(s.q, s.r);
      if (st === "notPresent" || st === "complex") {
        (revealByRing[s.r] = revealByRing[s.r] || []).push(s.q);
      } else if (st === "absent") {
        if (!hov && !selHere) veilSegs.push(s.d);
      } else {
        const a = st === "integrated" ? (0.32 + (sc / 100) * 0.58) : (0.07 + (sc / 100) * 0.22);
        litSegs.push({ d: s.d, col: KW_COLS[s.r - 1], a, hi: st === "integrated" && sc >= 70, sel: selHere, state: st });
        if (st === "growth" && !hov && !selHere) veilSegs.push(s.d);
      }
    } else {
      if (!hov && !isRem(s.q, s.r)) veilSegs.push(s.d);
    }
  });
  const total = removed.reduce((a, b) => a + b.length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%", maxWidth: size }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
        {showQuadLabels && KW_QUADS.map((Q) => {
          const cnt = removed[Q.q].length;
          const on = hq === Q.q;
          const pos = Q.corner === "tl" ? { top: "1%", left: "1%" }
            : Q.corner === "tr" ? { top: "1%", right: "1%" }
            : Q.corner === "bl" ? { bottom: "1%", left: "1%" }
            : { bottom: "1%", right: "1%" };
          const toRight = Q.corner.charAt(1) === "r";
          if (renderQuadPanel && openQuad === Q.q) {
            return (
              <div key={Q.q} className="sa-quadpop" style={{ position: "absolute", zIndex: 22, width: "min(62%, 290px)", ...pos }} onClick={(e) => e.stopPropagation()}>
                <button type="button" className="sa-quadpop-x" onClick={() => setOpenQuad(null)} aria-label="Zavrieť">×</button>
                {renderQuadPanel(Q.q)}
              </div>
            );
          }
          const clickable = !!renderQuadPanel;
          return (
            <div key={Q.q} style={{ position: "absolute", display: "flex", flexDirection: "column", maxWidth: "32%", zIndex: 4, cursor: clickable ? "pointer" : "default", alignItems: toRight ? "flex-end" : "flex-start", textAlign: toRight ? "right" : "left", ...pos }}
              onMouseEnter={() => { setHoverQuadIn(Q.q); if (onHoverQuad) onHoverQuad(Q.q); }}
              onMouseLeave={() => { setHoverQuadIn(null); if (onHoverQuad) onHoverQuad(null); }}
              onClick={() => { if (renderQuadPanel) setOpenQuad(Q.q); }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: 6, flexDirection: toRight ? "row-reverse" : "row" }}>
                <span style={{ fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontSize: 23, lineHeight: 1, color: on ? "#f2ead9" : "#cbc3b2", transition: "color .2s, text-shadow .2s", textShadow: on ? "0 0 16px rgba(147,206,197,.65)" : "none" }}>{Q.name}</span>
                {clickable && <span aria-hidden="true" style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 400, lineHeight: 1, width: 18, height: 18, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid " + (on ? "rgba(147,206,197,.7)" : "rgba(179,173,160,.4)"), color: on ? "#93cec5" : "#8f897d", transition: "color .2s, border-color .2s" }}>+</span>}
                {!diagnose && cnt > 0 && <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700, color: "#1a120a", background: "#e4c477", borderRadius: 99, minWidth: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px", boxShadow: "0 0 8px rgba(228,196,119,.5)" }}>{cnt}</span>}
              </span>
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10.5, letterSpacing: ".02em", lineHeight: 1.3, color: on ? "#aaa392" : "#7d776c", transition: "color .2s", marginTop: 3 }}>{Q.dim}</span>
            </div>
          );
        })}
        <div style={{ position: "absolute", inset: showQuadLabels ? "3.5%" : "0" }}>
          <div aria-hidden="true" style={{ position: "absolute", inset: "-6%", borderRadius: "50%", background: "radial-gradient(closest-side, rgba(140,200,196,.18), rgba(140,200,196,0) 72%)", filter: "blur(16px)", pointerEvents: "none" }} />
          {DISCS.slice().reverse().map((D) => {
            const remQ = diagnose ? (revealByRing[D.r] || []) : [0, 1, 2, 3].filter((q) => removed[q].indexOf(D.r) >= 0);
            const sl = (q) => remQ.indexOf(q) >= 0 ? "transparent" : "#000";
            const mask = remQ.length ? ("conic-gradient(from 0deg, " + sl(3) + " 0deg 90deg, " + sl(0) + " 90deg 180deg, " + sl(1) + " 180deg 270deg, " + sl(2) + " 270deg 360deg)") : "none";
            return <img key={D.key} src={DISC_BASE + D.key + ".png"} alt="" draggable={false} style={{ position: "absolute", left: "50%", top: "50%", width: (D.rad / 5) + "%", height: (D.rad / 5) + "%", transform: "translate(-50%, -50%)", pointerEvents: "none", userSelect: "none", WebkitMaskImage: mask, maskImage: mask }} />;
          })}
          <svg viewBox="-500 -500 1000 1000" preserveAspectRatio="xMidYMid meet" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
            <g style={{ pointerEvents: "none", fill: veilFill }}>
              {veilSegs.map((d, i) => <path key={"v" + i} d={d} />)}
            </g>
            {diagnose && (
              <g style={{ pointerEvents: "none" }}>
                {litSegs.map((L, i) => (
                  <path key={"lit" + i} d={L.d} style={{ fill: L.col, opacity: L.sel ? Math.min(0.9, L.a + 0.28) : L.a, filter: (L.hi || L.sel) ? "drop-shadow(0 0 6px " + L.col + ")" : "none", transition: "opacity .35s ease" }} />
                ))}
              </g>
            )}
            <g style={{ pointerEvents: "none", fill: "transparent", stroke: "rgba(255,244,214,0.65)", strokeWidth: 1.8, filter: "drop-shadow(0 0 6px rgba(255,236,196,0.4))" }}>
              {revealSegs.map((d, i) => <path key={"h" + i} d={d} />)}
            </g>
            <g>
              {baseSegs.map((s, i) => (
                <path key={"s" + i} d={s.d}
                  onClick={() => handleSegClick(s.q, s.r)}
                  onMouseEnter={() => setHoverSeg({ q: s.q, r: s.r })}
                  onMouseLeave={() => setHoverSeg(null)}
                  style={{ cursor: "pointer", pointerEvents: "all", fill: "transparent" }} />
              ))}
            </g>
            {showCross && (
              <g style={{ pointerEvents: "none" }}>
                <line x1="0" y1="-432" x2="0" y2="432" style={{ stroke: "rgba(0,0,0,.4)", strokeWidth: 4 }} />
                <line x1="-432" y1="0" x2="432" y2="0" style={{ stroke: "rgba(0,0,0,.4)", strokeWidth: 4 }} />
                <line x1="0" y1="-432" x2="0" y2="432" style={{ stroke: "rgba(255,255,255,.34)", strokeWidth: 1.3 }} />
                <line x1="-432" y1="0" x2="432" y2="0" style={{ stroke: "rgba(255,255,255,.34)", strokeWidth: 1.3 }} />
              </g>
            )}
          </svg>
        </div>
      </div>
      {showLegend && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 13px", justifyContent: "center", alignItems: "center" }}>
          <span style={{ fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: "#67625a" }}>stred</span>
          {KW_NAMES.map((n, i) => (
            <div key={i} onMouseEnter={() => setHoverRing(i + 1)} onMouseLeave={() => setHoverRing(0)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "default" }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: KW_COLS[i], boxShadow: "0 0 0 1px rgba(255,255,255,.16), inset 0 1px 1.5px rgba(255,255,255,.5)" }} />
              <span style={{ fontSize: 11.5, color: "#b3ada0" }}>{n}</span>
            </div>
          ))}
          <span style={{ fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: "#67625a" }}>okraj</span>
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px", alignItems: "center", justifyContent: "center" }}>
        {diagnose ? (
          <span style={{ fontSize: 12, color: "#8f8a7e", fontFamily: "'DM Sans',sans-serif", textAlign: "center" }}>Zastúpené časti sú zvýraznené · klikni na štvrtinu-úroveň pre popis</span>
        ) : (
          <>
            <span style={{ fontSize: 12, color: "#8f8a7e", fontFamily: "'DM Sans',sans-serif" }}>{total ? ("Označené vrstvy: " + total) : "Prejdi kurzorom — rozsvieti sa štvrtina · klik ju označí"}</span>
            <button type="button" onClick={() => setRemoved([[], [], [], []])} style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(201,162,75,.5)", color: "#e4c477", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", padding: "8px 16px", borderRadius: 2, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>Obnoviť</button>
          </>
        )}
      </div>
    </div>
  );
}

function SpiralMandalaCore({ mode = 'integrative', onSelectionChange, onSelect, onDeselect, onHover, size = 'min(72vw, 560px)', assetBase = '/mysdl/mandala', className, style }) {
  const geomRef = useRef(null);
  if (!geomRef.current) geomRef.current = buildGeometry(assetBase);
  const GEOM = geomRef.current;
  const [selectedList, setSelectedList] = useState([]);
  const [hovered, setHovered] = useState(null);
  const [rotations, setRotations] = useState(() => GEOM.map(() => 0));

  useEffect(() => { setSelectedList([]); onDeselect?.(); /* eslint-disable-next-line */ }, [mode]);

  const updateSelected = useCallback((next) => {
    setSelectedList(next);
    onSelectionChange?.(next.map((i) => ({ key: GEOM[i].key, color: GEOM[i].color, idx: i })));
    if (next.length === 0) onDeselect?.();
  }, [onSelectionChange, onDeselect, GEOM]);

  const handleRingClick = useCallback((idx) => {
    const selDir = idx % 2 === 0 ? 1 : -1;
    const layer = GEOM[idx];
    const levelInfo = { key: layer.key, color: layer.color, idx };
    let nextSelected, rotatingIndices;
    if (mode === 'single') {
      const cur = selectedList;
      nextSelected = cur.includes(idx) ? cur.filter((x) => x !== idx) : [...cur, idx];
      rotatingIndices = [idx];
    } else {
      const lastSelected = selectedList.length > 0 ? selectedList[selectedList.length - 1] : null;
      nextSelected = []; rotatingIndices = [];
      if (lastSelected === idx) { for (let i = 0; i <= idx; i++) rotatingIndices.push(i); }
      else { for (let i = 0; i <= idx; i++) { nextSelected.push(i); rotatingIndices.push(i); } }
    }
    updateSelected(nextSelected);
    onSelect?.(levelInfo);
    if (rotatingIndices.length > 0) {
      setRotations((prev) => { const next = prev.slice(); for (const i of rotatingIndices) next[i] = next[i] + 360 * selDir; return next; });
    }
  }, [GEOM, mode, selectedList, updateSelected, onSelect]);

  const handleHover = useCallback((idx) => {
    setHovered(idx);
    if (idx === null) onHover?.(null);
    else onHover?.({ key: GEOM[idx].key, color: GEOM[idx].color, idx });
  }, [onHover, GEOM]);

  const lastSelected = selectedList.length > 0 ? selectedList[selectedList.length - 1] : null;
  const isActive = (i) => selectedList.includes(i);
  const isDimmed = (i) => selectedList.length > 0 && !isActive(i);
  const isHovered = (i) => hovered === i && !isActive(i);
  const tintColorFor = (i) => {
    if (!isActive(i)) return null;
    if (mode === 'single') return GEOM[i].color;
    return lastSelected !== null ? GEOM[lastSelected].color : null;
  };

  return (
    <>
      <style>{`@keyframes spiralMandalaGlowPulse{0%,100%{opacity:.85;transform:scale(1)}50%{opacity:1;transform:scale(1.045)}}`}</style>
      <div className={className}
        style={{ position: 'relative', width: size, aspectRatio: '1 / 1', ...(style || {}) }}
        onClick={(e) => { if (e.target === e.currentTarget) updateSelected([]); }}>
        <MandalaGlow activeColor={lastSelected !== null ? GEOM[lastSelected].color : null} />
        {GEOM.map((layer, i) => (
          <LayerImage key={layer.key} layer={layer} rotation={rotations[i]}
            isActive={isActive(i)} isDimmed={isDimmed(i)} isHovered={isHovered(i)} tintColor={tintColorFor(i)} />
        ))}
        <HitOverlay geom={GEOM} onClick={handleRingClick} onHover={handleHover} />
      </div>
    </>
  );
}

function MandalaModeToggle({ mode, onChange }) {
  const on = mode === 'integrative';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'rgba(240,236,226,0.75)', userSelect: 'none' }}>
      <span style={{ opacity: on ? 0.5 : 1, transition: 'opacity 300ms ease', color: on ? undefined : '#f0e6d4' }}>Jednotlivá úroveň</span>
      <div role="switch" aria-checked={on} onClick={() => onChange(on ? 'single' : 'integrative')}
        style={{ width: 46, height: 24, borderRadius: 100, background: on ? 'rgba(217,180,65,0.85)' : 'rgba(60,48,30,0.9)', border: '1px solid rgba(255,255,255,0.12)', position: 'relative', cursor: 'pointer', transition: 'background 300ms ease' }}>
        <div style={{ position: 'absolute', top: 2, left: on ? 24 : 2, width: 18, height: 18, borderRadius: '50%', background: on ? '#1a0f08' : '#d9b441', transition: 'left 360ms cubic-bezier(.45,.05,.25,1), background 300ms ease' }} />
      </div>
      <span style={{ opacity: on ? 1 : 0.5, transition: 'opacity 300ms ease', color: on ? '#f0e6d4' : undefined }}>Integrovaný pohľad</span>
    </div>
  );
}

function SpiralMandalaPanel({ size = 'min(70vw, 460px)', assetBase = '/mysdl/mandala' }) {
  const [mode, setMode] = useState('integrative');
  const [active, setActive] = useState([]);
  const [hovered, setHovered] = useState(null);
  const last = active.length > 0 ? active[active.length - 1] : null;
  const show = last || hovered;
  const k = show ? show.key : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, width: '100%' }}>
      <SpiralMandalaCore mode={mode} size={size} assetBase={assetBase}
        onSelectionChange={setActive} onHover={setHovered} onDeselect={() => setActive([])} />
      <div style={{ minHeight: 46, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textAlign: 'center' }}>
        {k ? (
          <>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, letterSpacing: '0.28em', textTransform: 'uppercase', color: SPIRAL_LEVEL_COLORS[k] }}>{SPIRAL_LEVEL_NAMES[k]}</div>
            <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontStyle: 'italic', fontSize: 15, color: 'rgba(240,236,226,0.82)' }}>{SPIRAL_LEVEL_MEANINGS[k]}</div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(240,236,226,0.4)', marginTop: 2 }}>{SPIRAL_LEVEL_POLARITY[k]}</div>
          </>
        ) : (
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(240,236,226,0.35)' }}>prejdi myšou po úrovni</div>
        )}
      </div>
      <MandalaModeToggle mode={mode} onChange={setMode} />
    </div>
  );
}

export default App;
