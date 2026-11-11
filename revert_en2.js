const fs = require('fs');

// Fix remaining misses from revert_en.js

// ─── App.jsx remaining 5 ─────────────────────────────────────────────────────
{
  let c = fs.readFileSync('frontend/src/App.jsx', 'utf8');
  let ok = 0, fail = 0;

  const reps = [
    // 1. Failed to load perspectives — single close paren
    ['content: err.message || "Failed to load perspectives." }] } } : prev);',
     'content: err.message || "Nepodarilo sa načítať perspektívy." }] } } : prev);'],
    // 2. Question label in HTML export — single-quoted
    ["'<div class=\"q\"><strong>Question:</strong> '",
     "'<div class=\"q\"><strong>Otázka:</strong> '"],
    // 3. Topic label in HTML export — single-quoted
    ["'<div class=\"meta\"><strong>Topic:</strong> '",
     "'<div class=\"meta\"><strong>Téma:</strong> '"],
    // 4 & 5 handled below with regex for CRLF tolerance
  ];

  for (const [from, to] of reps) {
    if (c.includes(from)) { c = c.replace(from, to); ok++; }
    else { console.log('  MISS:', JSON.stringify(from).slice(0, 80)); fail++; }
  }

  // Handle "View Style" and "Run Analysis" with regex to tolerate CRLF
  if (/\bView Style[\r\n]/.test(c)) {
    c = c.replace(/\bView Style([\r\n])/, 'Štýl zobrazenia$1');
    ok++;
  } else { console.log('  MISS: View Style line'); fail++; }

  if (/\bRun Analysis[\r\n]/.test(c)) {
    c = c.replace(/\bRun Analysis([\r\n])/, 'Spustiť analýzu$1');
    ok++;
  } else { console.log('  MISS: Run Analysis line'); fail++; }

  // Also check if Topic label was actually just part of a longer string (line 385)
  // The line has: '<strong>Topic:</strong> ' inside the html const
  const topicHtml = "'<head><meta charset=\"UTF-8\"><title>Spiral Dynamics";
  // Let's just target the exact substring
  const oldMeta = '<div class="meta"><strong>Topic:</strong> ';
  const newMeta = '<div class="meta"><strong>Téma:</strong> ';
  if (c.includes(oldMeta)) { c = c.replace(oldMeta, newMeta); ok++; }
  else console.log('  MISS meta topic (already done or different)');

  fs.writeFileSync('frontend/src/App.jsx', c, 'utf8');
  console.log('App.jsx fix2 — ok:', ok, 'miss:', fail);
}

// ─── SpotlightGuide.jsx — CRLF version ──────────────────────────────────────
{
  let c = fs.readFileSync('frontend/src/SpotlightGuide.jsx', 'utf8');
  // Detect line ending
  const crlf = c.includes('\r\n');
  const nl = crlf ? '\r\n' : '\n';
  console.log('SpotlightGuide line ending:', crlf ? 'CRLF' : 'LF');

  let ok = 0, fail = 0;

  const steps = [
    ['      bold: "Detailed tutorial.",' + nl + '      text: "Opens the full interactive guide with all Spiral Dynamics levels and concept explanations. Useful if you\'re new to Spiral Dynamics." },',
     '      bold: "Detailný tutoriál.",' + nl + '      text: "Otvorí kompletnú interaktívnu príručku so všetkými úrovňami špirálovej dynamiky a vysvetleniami konceptov. Užitočné, ak Spiral Dynamics ešte nepoznáte." },'],
    ['      bold: "Enter your topic here.",' + nl + '      text: "A question, problem, or situation you want to explore. This is not a regular chat — it\'s an entry point into multi-level analysis." },',
     '      bold: "Sem zadajte tému.",' + nl + '      text: "Otázku, problém alebo situáciu, ktorú chcete preskúmať. Nie je to bežný chat — je to vstupný bod do viacúrovňovej analýzy." },'],
    ['      bold: "Click to start the analysis.",' + nl + '      text: "An interactive mandala opens where you can select specific levels for your perspective." },',
     '      bold: "Kliknutím spustíte analýzu.",' + nl + '      text: "Otvorí sa interaktívna mandala, na ktorej môžete zvoliť konkrétne úrovne pre váš pohľad." },'],
    ['      bold: "View toggle.",' + nl + '      text: "Mandala as concentric rings, or Icons as a clear list. The content is the same — choose what works for you." },',
     '      bold: "Prepínač zobrazenia.",' + nl + '      text: "Mandala ako sústredné prstence, alebo Ikony ako prehľadný zoznam. Obsah je rovnaký — vyberte si, čo vám vyhovuje." },'],
    ['      bold: "Click any layer.",' + nl + '      text: "Select a level for analysis. You can select multiple levels at once." },',
     '      bold: "Kliknite na ktorúkoľvek vrstvu.",' + nl + '      text: "Označíte úroveň pre analýzu. Vrstiev môžete označiť viac naraz." },'],
    ['      bold: "Single level or integrated view.",' + nl + '      text: "Integrated opens the selected layer with all inner levels — levels are cumulative and cannot be skipped." },',
     '      bold: "Jednotlivá úroveň alebo integrovaný pohľad.",' + nl + '      text: "Integrovaný otvorí zvolenú vrstvu so všetkými vnútornými — úrovne sú kumulatívne a nedajú sa preskakovať." },'],
    ['      bold: "Run analysis.",' + nl + '      text: "Once you have layers selected, this opens all chosen perspectives at once." },',
     '      bold: "Spustiť analýzu.",' + nl + '      text: "Keď máte vrstvy označené, týmto otvoríte všetky zvolené perspektívy naraz." },'],
    ['      bold: "Select a perspective.",' + nl + '      text: "Check to select a response. With two or more selected, integration and tension comparison unlock." },',
     '      bold: "Označte perspektívu.",' + nl + '      text: "Zaškrtnutím vyberiete odpoveď. Pri dvoch a viac sa odomknú integrácia a porovnanie napätí." },'],
    ['      bold: "Deepen the perspective.",' + nl + '      text: "Expand it, show how it emerged from the previous level, or where it leads in its consequences." },',
     '      bold: "Prehĺbte perspektívu.",' + nl + '      text: "Rozviňte ju, ukážte, ako vznikla z predchádzajúcej úrovne, alebo kam vedie vo svojich dôsledkoch." },'],
    ['      bold: "Level axis.",' + nl + '      text: "Individualistic (express-self) or collective (deny-self). The spiral naturally alternates between poles." },',
     '      bold: "Os úrovne.",' + nl + '      text: "Individualistická (express-self) alebo kolektívna (deny-self). Špirála prirodzene striedá póly." },'],
    ['      bold: "Integrate into Yellow.",' + nl + '      text: "Selected perspectives are transferred into the integrative dialogue as context." },',
     '      bold: "Integrovať do žltej.",' + nl + '      text: "Vybrané perspektívy sa prenesú do integratívneho dialógu ako kontext." },'],
    ['      bold: "Tensions between perspectives.",' + nl + '      text: "Shows where the logics of levels meet and where they contradict — without judgment." },',
     '      bold: "Napätia medzi perspektívami.",' + nl + '      text: "Ukáže, kde sa logiky úrovní stretávajú a kde si odporujú — bez hodnotenia." },'],
    ['      bold: "Integrative dialogue (Yellow).",' + nl + '      text: "Yellow doesn\'t judge — it connects perspectives and finds bridges for your situation." },',
     '      bold: "Integratívny dialóg (Žltá).",' + nl + '      text: "Žltá nehodnotí — prepája perspektívy a hľadá mosty pre vašu situáciu." },'],
    ['      bold: "Export conversation.",' + nl + '      text: "A document with all perspectives — ready to print or save as PDF." },',
     '      bold: "Exportovať konverzáciu.",' + nl + '      text: "Dokument so všetkými perspektívami — pripravený na tlač alebo uloženie ako PDF." },'],
    ['      bold: "New topic.",' + nl + '      text: "Clears everything and returns you to the beginning for a new topic." },',
     '      bold: "Nová téma.",' + nl + '      text: "Vymaže všetko a vráti vás na začiatok pre novú tému." },'],
  ];

  for (const [from, to] of steps) {
    if (c.includes(from)) { c = c.replace(from, to); ok++; }
    else { console.log('  MISS:', JSON.stringify(from).slice(0, 80)); fail++; }
  }

  fs.writeFileSync('frontend/src/SpotlightGuide.jsx', c, 'utf8');
  console.log('SpotlightGuide.jsx — ok:', ok, 'miss:', fail);
}

console.log('\nDone.');
