/* revert_en.js — ARCHIVOVANÉ. Pôvodný migračný nástroj z 10/2026.
 *
 * Vracal anglický preklad produkčnej appky späť do slovenčiny. Dnes už
 * nemá čo meniť: produkčné súbory sú preložené, takže každá náhrada minie
 * a skript zápis odmietne. Jeho úloha je teraz OVEROVACIA — náhľad vypíše,
 * ktoré reťazce sú ešte anglické.
 *
 * Pojistky (prečo a aké) sú opísané v safe-patch.js a v README.md vedľa.
 * Krátko: --repo je povinný, predvolene sa nič nezapisuje, nahrádza sa každý
 * výskyt a jediný MISS znamená, že sa nezapíše nič.
 *
 * Dáta (páry anglický → slovenský reťazec) sú nižšie nezmenené. Tie isté
 * páry sú ako čisté dáta v tools/i18n/sk-en-strings.json.
 *
 *   node tools/archive/revert_en.js --repo=.            (náhľad)
 *   node tools/archive/revert_en.js --repo=. --write     (zápis)
 */

'use strict';

const { patcher } = require('./safe-patch');

const p = patcher({
  name: 'revert_en',
  purpose: 'Revert anglického prekladu späť do slovenčiny (archivované, dnes overovacie).',
});

// ─── backend/api/chat.js ──────────────────────────────────────────────────────
p.file('backend/api/chat.js').many([
  [
    'RULE: Each call activates ONE persona (or a group for integrative/conflict mode) via the instruction in the next block. Apply the active persona consistently — do not bleed into it the language, SILENT FACILITATION, or RECOGNITION OF LIMITS of other levels. You respond primarily from the perspective of the activated level. Include facilitation elements naturally. Write in English.',
    'PRAVIDLO: Každé volanie aktivuje JEDNU personu (alebo skupinu pre integratívny/konfliktný mód) cez inštrukciu v nasledujúcom bloku. Aktívnu personu aplikuj dôsledne — neprelievaj do nej jazyk, TICHÚ FACILITÁCIU ani ROZPOZNANIE HRANÍC iných úrovní. Odpovedáš primárne z perspektívy aktivovanej úrovne. Facilitačné prvky zaraď prirodzene. Píš v slovenčine.'
  ],
  [
    'return `INTEGRATIVE MODE. Analyze the topic from the perspectives: ${markers}.\\nFor each one use its complete persona from the library. Mark each level precisely: [KEY] text. Write in English.`;',
    'return `INTEGRATÍVNY MÓD. Analyzuj tému z pohľadov: ${markers}.\\nPre každú použi jej kompletnú personu z knižnice. Každú úroveň označ presne: [KEY] text.`;'
  ],
  [
    'return "You are an expert in Spiral Dynamics. The user is exploring a topic from multiple levels and wants to understand where tensions and conflicts arise between them. Do not judge the levels — show where their logics meet and where they contradict. Be specific to the topic. Write in English. 5-8 sentences.";',
    'return "Si expert na Špirálovú dynamiku. Užívateľ skúma tému z viacerých úrovní a chce pochopiť, kde medzi nimi vznikajú napätia a konflikty. Nehodnoť úrovne — ukáž, kde sa ich logiky stretávajú a kde si odporujú. Buď konkrétny voči téme. Píš v slovenčine. 5-8 viet.";'
  ],
  [
    'return "You are an expert in Spiral Dynamics. Continue the analysis of tensions between levels. Write in English. 6-10 sentences.";',
    'return "Si expert na Špirálovú dynamiku. Pokračuješ v analýze napätí medzi úrovňami. Píš v slovenčine. 6-10 viet.";'
  ],
  [
    'return "You are an expert in Spiral Dynamics. Continue the analysis of tensions between levels. Write in English. 4-8 sentences.";',
    'return "Si expert na Špirálovú dynamiku. Pokračuješ v analýze napätí medzi úrovňami. Píš v slovenčine. 4-8 viet.";'
  ],
  [
    'return "You are an integrative facilitator at the YELLOW level of Spiral Dynamics. You connect perspectives into a functional whole. You identify tensions between levels and propose bridges. You offer practical recommendations. You respect every level. Write in English. 4-8 sentences.";',
    'return "Si integratívny facilitátor na úrovni ŽLTEJ Špirálovej dynamiky. Prepájaš perspektívy do funkčného celku. Identifikuješ napätia medzi úrovňami a navrhuješ mosty. Ponúkaš praktické odporúčania. Rešpektuješ každú úroveň. Píš v slovenčine. 4-8 viet.";'
  ],
  [
    'return `ACTIVE PERSONA: [${level.toUpperCase()}]. Respond exclusively from this perspective. Write in English.`;',
    'return `AKTÍVNA PERSONA: [${level.toUpperCase()}]. Odpovedaj výhradne z tejto perspektívy.`;'
  ],
]);

// ─── frontend/src/SpiralLensV5.jsx ───────────────────────────────────────────
p.file('frontend/src/SpiralLensV5.jsx').many([
  ["{ id: 'beige',     name: 'BEIGE',     motto: 'Survival',",
   "{ id: 'beige',     name: 'BÉŽOVÁ',    motto: 'Prežitie',"],
  ["{ id: 'purple',    name: 'PURPLE',    motto: 'Clan Safety',",
   "{ id: 'purple',    name: 'PURPUROVÁ', motto: 'Bezpečie klanu',"],
  ["{ id: 'red',       name: 'RED',       motto: 'Power & Will',",
   "{ id: 'red',       name: 'ČERVENÁ',   motto: 'Moc a vôľa',"],
  ["{ id: 'blue',      name: 'BLUE',      motto: 'Order & Meaning',",
   "{ id: 'blue',      name: 'MODRÁ',     motto: 'Poriadok a zmysel',"],
  ["{ id: 'orange',    name: 'ORANGE',    motto: 'Achievement & Success',",
   "{ id: 'orange',    name: 'ORANŽOVÁ',  motto: 'Úspech a výkon',"],
  ["{ id: 'green',     name: 'GREEN',     motto: 'Harmony & Equality',",
   "{ id: 'green',     name: 'ZELENÁ',    motto: 'Harmónia a rovnosť',"],
  ["{ id: 'yellow',    name: 'YELLOW',    motto: 'Systemic Integration',",
   "{ id: 'yellow',    name: 'ŽLTÁ',      motto: 'Syst. integrácia',"],
  ["{ id: 'turquoise', name: 'TURQUOISE', motto: 'Holistic Awareness',",
   "{ id: 'turquoise', name: 'TYRKYSOVÁ', motto: 'Celostné vedomie',"],
]);

// ─── frontend/src/SpiralMandala.jsx ──────────────────────────────────────────
p.file('frontend/src/SpiralMandala.jsx').many([
  ["? 'Click a layer to open it + all inner levels'",
   "? 'Kliknutím na vrstvu otvoríte túto + všetky vnútorné úrovne'"],
  ["'Click to add / remove a level; each one stays highlighted in its color'",
   "'Kliknutím pridáte / odoberiete úroveň; každá zostane svietiť svojou farbou'"],
]);

// ─── frontend/src/SpotlightGuide.jsx — len GUIDE_STEPS texty ─────────────────
p.file('frontend/src/SpotlightGuide.jsx').many([
  ['      bold: "Detailed tutorial.",\n      text: "Opens the full interactive guide with all Spiral Dynamics levels and concept explanations. Useful if you\'re new to Spiral Dynamics." },',
   '      bold: "Detailný tutoriál.",\n      text: "Otvorí kompletnú interaktívnu príručku so všetkými úrovňami špirálovej dynamiky a vysvetleniami konceptov. Užitočné, ak Spiral Dynamics ešte nepoznáte." },'],
  ['      bold: "Enter your topic here.",\n      text: "A question, problem, or situation you want to explore. This is not a regular chat — it\'s an entry point into multi-level analysis." },',
   '      bold: "Sem zadajte tému.",\n      text: "Otázku, problém alebo situáciu, ktorú chcete preskúmať. Nie je to bežný chat — je to vstupný bod do viacúrovňovej analýzy." },'],
  ['      bold: "Click to start the analysis.",\n      text: "An interactive mandala opens where you can select specific levels for your perspective." },',
   '      bold: "Kliknutím spustíte analýzu.",\n      text: "Otvorí sa interaktívna mandala, na ktorej môžete zvoliť konkrétne úrovne pre váš pohľad." },'],
  ['      bold: "View toggle.",\n      text: "Mandala as concentric rings, or Icons as a clear list. The content is the same — choose what works for you." },',
   '      bold: "Prepínač zobrazenia.",\n      text: "Mandala ako sústredné prstence, alebo Ikony ako prehľadný zoznam. Obsah je rovnaký — vyberte si, čo vám vyhovuje." },'],
  ['      bold: "Click any layer.",\n      text: "Select a level for analysis. You can select multiple levels at once." },',
   '      bold: "Kliknite na ktorúkoľvek vrstvu.",\n      text: "Označíte úroveň pre analýzu. Vrstiev môžete označiť viac naraz." },'],
  ['      bold: "Single level or integrated view.",\n      text: "Integrated opens the selected layer with all inner levels — levels are cumulative and cannot be skipped." },',
   '      bold: "Jednotlivá úroveň alebo integrovaný pohľad.",\n      text: "Integrovaný otvorí zvolenú vrstvu so všetkými vnútornými — úrovne sú kumulatívne a nedajú sa preskakovať." },'],
  ['      bold: "Run analysis.",\n      text: "Once you have layers selected, this opens all chosen perspectives at once." },',
   '      bold: "Spustiť analýzu.",\n      text: "Keď máte vrstvy označené, týmto otvoríte všetky zvolené perspektívy naraz." },'],
  ['      bold: "Select a perspective.",\n      text: "Check to select a response. With two or more selected, integration and tension comparison unlock." },',
   '      bold: "Označte perspektívu.",\n      text: "Zaškrtnutím vyberiete odpoveď. Pri dvoch a viac sa odomknú integrácia a porovnanie napätí." },'],
  ['      bold: "Deepen the perspective.",\n      text: "Expand it, show how it emerged from the previous level, or where it leads in its consequences." },',
   '      bold: "Prehĺbte perspektívu.",\n      text: "Rozviňte ju, ukážte, ako vznikla z predchádzajúcej úrovne, alebo kam vedie vo svojich dôsledkoch." },'],
  ['      bold: "Level axis.",\n      text: "Individualistic (express-self) or collective (deny-self). The spiral naturally alternates between poles." },',
   '      bold: "Os úrovne.",\n      text: "Individualistická (express-self) alebo kolektívna (deny-self). Špirála prirodzene striedá póly." },'],
  ['      bold: "Integrate into Yellow.",\n      text: "Selected perspectives are transferred into the integrative dialogue as context." },',
   '      bold: "Integrovať do žltej.",\n      text: "Vybrané perspektívy sa prenesú do integratívneho dialógu ako kontext." },'],
  ['      bold: "Tensions between perspectives.",\n      text: "Shows where the logics of levels meet and where they contradict — without judgment." },',
   '      bold: "Napätia medzi perspektívami.",\n      text: "Ukáže, kde sa logiky úrovní stretávajú a kde si odporujú — bez hodnotenia." },'],
  ['      bold: "Integrative dialogue (Yellow).",\n      text: "Yellow doesn\'t judge — it connects perspectives and finds bridges for your situation." },',
   '      bold: "Integratívny dialóg (Žltá).",\n      text: "Žltá nehodnotí — prepája perspektívy a hľadá mosty pre vašu situáciu." },'],
  ['      bold: "Export conversation.",\n      text: "A document with all perspectives — ready to print or save as PDF." },',
   '      bold: "Exportovať konverzáciu.",\n      text: "Dokument so všetkými perspektívami — pripravený na tlač alebo uloženie ako PDF." },'],
  ['      bold: "New topic.",\n      text: "Clears everything and returns you to the beginning for a new topic." },',
   '      bold: "Nová téma.",\n      text: "Vymaže všetko a vráti vás na začiatok pre novú tému." },'],
]);

// ─── frontend/src/App.jsx ─────────────────────────────────────────────────────
p.file('frontend/src/App.jsx').many([
  // LEVELS array — names and subs
  ['{ key: "beige", name: "BEIGE", sub: "Survival",',
   '{ key: "beige", name: "BÉŽOVÁ", sub: "Prežitie",'],
  ['{ key: "purple", name: "PURPLE", sub: "Clan Safety",',
   '{ key: "purple", name: "PURPUROVÁ", sub: "Bezpečie klanu",'],
  ['{ key: "red", name: "RED", sub: "Power & Will",',
   '{ key: "red", name: "ČERVENÁ", sub: "Moc a vôľa",'],
  ['{ key: "blue", name: "BLUE", sub: "Order & Meaning",',
   '{ key: "blue", name: "MODRÁ", sub: "Poriadok a zmysel",'],
  ['{ key: "orange", name: "ORANGE", sub: "Achievement & Success",',
   '{ key: "orange", name: "ORANŽOVÁ", sub: "Úspech a výkon",'],
  ['{ key: "green", name: "GREEN", sub: "Harmony & Equality",',
   '{ key: "green", name: "ZELENÁ", sub: "Harmónia a rovnosť",'],
  ['{ key: "yellow", name: "YELLOW", sub: "Systemic Integration",',
   '{ key: "yellow", name: "ŽLTÁ", sub: "Systémová integrácia",'],
  ['{ key: "turquoise", name: "TURQUOISE", sub: "Holistic Awareness",',
   '{ key: "turquoise", name: "TYRKYSOVÁ", sub: "Celostné vedomie",'],

  // Error messages
  ['throw new Error("Something went wrong, please try again later. (429)");',
   'throw new Error("Niečo sa pokazilo, skúste neskôr. (429)");'],
  ['if (!data.content) throw new Error("Empty response. Please try again.");',
   'if (!data.content) throw new Error("Prázdna odpoveď. Skúste znova.");'],

  // getReflection — 4 strings (file has literal \\u2014 sequences)
  ['return "Your exploration moves through individualistic perspectives (express-self). Collective perspectives \\u2014 " + unexploredDeny.join(", ") + " \\u2014 offer a different kind of orientation, valuable when the individual approach hits its limits.";',
   'return "Tvoja explorácia sa pohybuje v individualistických perspektívach (express-self). Kolektívne perspektívy \\u2014 " + unexploredDeny.join(", ") + " \\u2014 ponúkajú iný druh orientácie, cenný keď individuálny prístup naráža na limity.";'],
  ['return "Your exploration moves through collective perspectives (deny-self). Individualistic perspectives \\u2014 " + unexploredExpress.join(", ") + " \\u2014 offer a view of personal power and autonomy.";',
   'return "Tvoja explorácia sa pohybuje v kolektívnych perspektívach (deny-self). Individualistické perspektívy \\u2014 " + unexploredExpress.join(", ") + " \\u2014 ponúkajú pohľad na osobnú silu a autonómiu.";'],
  ['return "Most of your exploration leans toward individualistic perspectives. Unexplored collective views \\u2014 " + unexploredDeny.join(", ") + " \\u2014 may offer something the individual lens cannot see.";',
   'return "Väčšina explorácie smeruje k individualistickým perspektívam. Nepreskúmané kolektívne pohľady \\u2014 " + unexploredDeny.join(", ") + " \\u2014 môžu ponúknuť niečo, čo individuálna optika nevidí.";'],
  ['return "Most of your exploration leans toward collective perspectives. Unexplored individualistic views \\u2014 " + unexploredExpress.join(", ") + " \\u2014 may offer something the group lens cannot see.";',
   'return "Väčšina explorácie smeruje ku kolektívnym perspektívam. Nepreskúmané individualistické pohľady \\u2014 " + unexploredExpress.join(", ") + " \\u2014 môžu ponúknuť niečo, čo skupinová optika nevidí.";'],

  // fetchIntegrated prompt
  ['content: "Topic: \\"" + topicSet + "\\"\\n\\nAnalyze this topic from the perspective of levels: " + levelNames }])',
   'content: "Téma: \\"" + topicSet + "\\"\\n\\nAnalyzuj túto tému z pohľadu úrovní: " + levelNames }])'],

  // fetchInitial prompt
  ['content: "Topic: \\"" + topicSet + "\\"\\n\\nProvide a brief introductory perspective on this topic from this level. MAX 2-3 sentences. Be specific and concise." }])',
   'content: "Téma: \\"" + topicSet + "\\"\\n\\nPoskyni stručnú úvodnú perspektívu na túto tému z pohľadu tejto úrovne. MAX 2-3 vety. Buď konkrétny a výstižný." }])'],
  ['content: err.message || "Failed to load perspectives." }] } } : prev));',
   'content: err.message || "Nepodarilo sa načítať perspektívy." }] } } : prev));'],
  ['content: err.message || "Failed to load perspective." }] } } : prev))',
   'content: err.message || "Nepodarilo sa načítať perspektívu." }] } } : prev))'],

  // elaborateChat prompt
  ['content: "Expand this perspective in more depth. Explain more deeply why this level sees the topic this way, what its strengths are, and where it hits its limits. 6-10 sentences." }];',
   'content: "Rozviň túto perspektívu podrobnejšie. Vysvetli hlbšie, prečo táto úroveň vidí tému práve takto, aké sú jej silné stránky a kde naráža na svoje hranice. 6-10 viet." }];'],

  // topic prefix for elaborateChat, showEmergence, showGrowthDirection callAPI
  ['content: "Topic: \\"" + topicSet + "\\"" }, ...msgs])',
   'content: "Téma: \\"" + topicSet + "\\"" }, ...msgs])'],

  // analyzeConflicts prompt
  ['"Topic: \\"" + topicSet + "\\"\\n\\nPerspectives to compare:\\n" + levelDescs + "\\n\\nWhere do tensions and conflicts arise between these perspectives on this specific topic? What one sees as a solution, another may perceive as a problem?"',
   '"Téma: \\"" + topicSet + "\\"\\n\\nPerspektívy na porovnanie:\\n" + levelDescs + "\\n\\nKde vznikajú napätia a konflikty medzi týmito perspektívami pri tejto konkrétnej téme? Čo jedna vidí ako riešenie, druhá môže vnímať ako problém?"'],

  // elaborateConflicts prompt
  ['content: "Deepen these tensions further. Where exactly does the clash of values occur? What are the practical consequences of this tension in everyday life? Is there a way to connect these perspectives without any losing its essence?" }];',
   'content: "Rozviň tieto napätia hlbšie. Kde presne nastáva stret hodnôt? Aké praktické dôsledky má toto napätie v každodennom živote? Existuje spôsob, ako tieto perspektívy prepojiť bez toho, aby niektorá stratila svoju podstatu?" }];'],

  // showEmergence — 2 prompts
  ['? "Explain how the " + current.name + " level emerged from the previous " + previous.name + " level in the context of this topic. Describe: 1) What were the conditions in " + previous.name + " that stopped being sufficient? 2) What crisis or contradiction led to the emergence of " + current.name + "? 3) What specifically did " + current.name + " bring as a response to the limits of " + previous.name + "? Provide a historical example relevant to the topic. 6-10 sentences."',
   '? "Vysvetli, ako sa " + current.name + " úroveň vyvinula z predchádzajúcej " + previous.name + " úrovne v kontexte tejto témy. Popíš: 1) Aké boli podmienky v " + previous.name + ", ktoré prestali stačiť? 2) Aká kríza alebo rozpor viedol k vzniku " + current.name + "? 3) Čo konkrétne " + current.name + " priniesla ako odpoveď na limity " + previous.name + "? Uveď historický príklad relevantný k téme. 6-10 viet."'],
  ['      : "Explain why the " + current.name + " level is the foundation of the entire spiral. How does the most fundamental form of consciousness manifest in the context of this topic? 4-6 sentences.";',
   '      : "Vysvetli, prečo je " + current.name + " úroveň základom celej špirály. Ako sa prejavuje najzákladnejšia forma vedomia v kontexte tejto témy? 4-6 viet.";'],

  // showGrowthDirection — 2 prompts
  ['? "Analyze where the " + current.name + " perspective leads in the context of this topic when taken to its logical conclusions. Specifically show: 1) What questions does this perspective begin to ask that it cannot answer itself? 2) Where does it hit its own limit — not as a flaw, but as a natural horizon? 3) What appears beyond that horizon, which this perspective does not yet see, but already senses? Do not use Spiral Dynamics level names. Talk about what emerges, not about where someone should move. 6-10 sentences."',
   '? "Analyzuj, kam smeruje " + current.name + " perspektíva v kontexte tejto témy, keď ju dovedieš do jej logických dôsledkov. Konkrétne ukáž: 1) Aké otázky si táto perspektíva začína klásť, na ktoré sama nemá odpoveď? 2) Kde naráža na svoju vlastnú hranicu — nie ako chybu, ale ako prirodzený horizont? 3) Čo sa objavuje za týmto horizontom, čo táto perspektíva zatiaľ nevidí, ale už tuší? Nepoužívaj názvy úrovní Špirálovej dynamiky. Hovor o tom, čo sa objavuje, nie o tom, kam by sa mal človek posunúť. 6-10 viet."'],
  ['      : "Analyze where the " + current.name + " perspective — the broadest in Spiral Dynamics — leads in the context of this topic. What remains unsaid even from this most holistic view? Where does even this perspective meet the mystery that transcends any map? 4-6 sentences.";',
   '      : "Analyzuj, kam smeruje " + current.name + " perspektíva — najširšia v Špirálovej dynamike — v kontexte tejto témy. Čo zostáva nevypovedané aj z tohto najcelostnejšieho pohľadu? Kde sa aj táto perspektíva stretáva s tajomstvom, ktoré presahuje akúkoľvek mapu? 4-6 viet.";'],

  // sendMain — ctx building
  ['let ctx = "Topic: \\"" + topicSet + "\\"";',
   'let ctx = "Téma: \\"" + topicSet + "\\"";'],
  ['if (integratedContext) ctx += "\\n\\nIntegrated perspectives:" + integratedContext;',
   'if (integratedContext) ctx += "\\n\\nIntegrované perspektívy:" + integratedContext;'],
  ['if (reflection) ctx += "\\n\\nExploration pattern: " + reflection;',
   'if (reflection) ctx += "\\n\\nVzorec explorácie: " + reflection;'],
  ['"Understood. Let us continue."',
   '"Rozumiem. Pokračujeme."'],
  ['catch (err) { setMainChat(m => [...m, { role: "assistant", content: "Error: " + err.message }]); }',
   'catch (err) { setMainChat(m => [...m, { role: "assistant", content: "Chyba: " + err.message }]); }'],
  ['setConflictResult("Error: " + err.message);',
   'setConflictResult("Chyba: " + err.message);'],

  // ctx building — user label
  ['ctx += (m.role === "user" ? "User: " : l.name + ": ") + m.content + "\\n";',
   'ctx += (m.role === "user" ? "Užívateľ: " : l.name + ": ") + m.content + "\\n";'],

  // Export HTML
  ['new Date().toLocaleString("en-US")',
   'new Date().toLocaleString("sk-SK")'],
  ['"<strong>Question:</strong> "',
   '"<strong>Otázka:</strong> "'],
  ['<h2>Tensions Between Perspectives</h2>',
   '<h2>Napätia medzi perspektívami</h2>'],
  ['<h2>Exploration Pattern</h2>',
   '<h2>Vzorec explorácie</h2>'],
  ['<h2>Integrative Dialogue</h2>',
   '<h2>Integratívny dialóg</h2>'],
  ['"<strong>Topic:</strong> "',
   '"<strong>Téma:</strong> "'],

  // Export MD
  ['`## Tensions Between Perspectives\\n\\n',
   '`## Napätia medzi perspektívami\\n\\n'],
  ['`## Exploration Pattern\\n\\n',
   '`## Vzorec explorácie\\n\\n'],
  ['`## Integrative Dialogue\\n\\n`',
   '`## Integratívny dialóg\\n\\n`'],
  ['if (m.role === "user") md += `**Question:** ${m.content}\\n\\n`;',
   'if (m.role === "user") md += `**Otázka:** ${m.content}\\n\\n`;'],
  ['let md = `# Spiral Dynamics Lens\\n**Topic:** ${topicSet}\\n\\n`;',
   'let md = `# Spiral Dynamics Lens\\n**Téma:** ${topicSet}\\n\\n`;'],

  // Import — regex + alert + topic + history
  ['const conflictRx = /##\\s+Tensions Between Perspectives\\s*\\n+([\\s\\S]*?)(?=\\n##\\s+|$)/;',
   'const conflictRx = /##\\s+Napätia medzi perspektívami\\s*\\n+([\\s\\S]*?)(?=\\n##\\s+|$)/;'],
  ['/^\\*{0,2}Topic:\\*{0,2}\\s*(.+)$/m',
   '/^\\*{0,2}Téma:\\*{0,2}\\s*(.+)$/m'],
  ['if (!importedTopic) { alert("File does not contain a topic — check the .md file format."); return; }',
   'if (!importedTopic) { alert("Súbor neobsahuje tému — skontrolujte formát .md súboru."); return; }'],
  ['? [{ role: "user", content: `Topic: "${importedTopic}"\\n\\nTension analysis:` }, { role: "assistant", content: importedConflict }]',
   '? [{ role: "user", content: `Téma: "${importedTopic}"\\n\\nAnalýza napätí:` }, { role: "assistant", content: importedConflict }]'],
  ['const parts = rawSection.split(/\\n\\*\\*Question:\\*\\*[^\\n]*\\n/);',
   'const parts = rawSection.split(/\\n\\*\\*Otázka:\\*\\*[^\\n]*\\n/);'],

  // UI strings
  ['<p className="sub">Multi-level View of Reality</p>',
   '<p className="sub">Viacúrovňový pohľad na realitu</p>'],
  ['title="Continue with saved analysis"',
   'title="Pokračovať v uloženej analýze"'],
  ['                  View Style\n',
   '                  Štýl zobrazenia\n'],
  ['>Integrated View<',
   '>Integrovaný pohľad<'],
  ['{isExpress ? "Express Self · I" : "Deny Self · WE"}',
   '{isExpress ? "Express Self · JA" : "Deny Self · MY"}'],
  ['"Click to select a layer + inner ones, then run analysis"',
   '"Kliknutím zvolíte vrstvu + vnútorné, potom spustíte analýzu"'],
  ['"Click to select a level, then click Run Analysis"',
   '"Kliknutím zvolíte úroveň, potom kliknite Spustiť analýzu"'],
  ['                  Run Analysis\n',
   '                  Spustiť analýzu\n'],
  ['{"Integrate " + selectedCount + (selectedCount === 1 ? " perspective" : " perspectives") + " into Yellow"}',
   '{"Integrovať " + selectedCount + (selectedCount === 1 ? " perspektívu" : " perspektívy") + " do Žltej"}'],
  ['{conflictLoading ? "Analyzing tensions..." : "Tensions Between " + selectedCount + " Perspectives"}',
   '{conflictLoading ? "Analyzujem napätia..." : "Napätia medzi " + selectedCount + " perspektívami"}'],
  ['        <span style={{ fontFamily: "\'DM Sans\',sans-serif", fontSize: 11, fontWeight: 600, color: "#F87171", letterSpacing: 1.5, textTransform: "uppercase" }}>Tensions Between Perspectives</span>',
   '        <span style={{ fontFamily: "\'DM Sans\',sans-serif", fontSize: 11, fontWeight: 600, color: "#F87171", letterSpacing: 1.5, textTransform: "uppercase" }}>Napätia medzi perspektívami</span>'],
  ['title={"Jump to " + LEVEL_MAP[k]?.name}',
   'title={"Prejsť na " + LEVEL_MAP[k]?.name}'],
  ['<span className="lt">Analyzing...</span>',
   '<span className="lt">Analyzujem...</span>'],
  ['placeholder="Ask about tensions..."',
   'placeholder="Opýtaj sa na napätia..."'],
  [' Integrative Dialogue <span className="bg2">Yellow</span>',
   ' Integratívny dialóg <span className="bg2">Žltá</span>'],
  ['              <div className="msl">Continue exploring the topic from an integrative, systemic perspective</div>',
   '              <div className="msl">Pokračuj v skúmaní témy z integratívnej, systémovej perspektívy</div>'],
  ['Integrated perspectives are included in context',
   'Integrované perspektívy sú zahrnuté v kontexte'],
  ['>New Topic<',
   '>Nová téma<'],
]);

p.finish();
