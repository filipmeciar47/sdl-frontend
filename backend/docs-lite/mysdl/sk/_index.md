# Index — backend/docs-lite/mysdl/sk/

Toto je len vývojárska mapa priečinka, nie KB obsah. `.md` prípona zámerne
(nie `.txt`) — `loadMysdlKB()` v `backend/api/chat.js` naťahuje `readdirSync`
+ `.filter(f => f.endsWith('.txt'))`, takže tento súbor sa AI nikdy
nenačíta ako grounding text; slúži len ako referencia pre ľudí.

Súbory nižšie sa načítajú abecedne a spoja do jedného groundingu pre
VŠETKY mysdl JSON volania (kvadranty lens, DiagView.evaluate(),
fetchQuadCellDetail) — nie je tu (zatiaľ) topic-scoping podľa funkcie.

| Súbor | Slúži | Popis |
|---|---|---|
| `01_kvadrant_sebaanalyza.txt` | kvadranty lens, DiagView, fetchQuadCellDetail | Rola AI, diagnostický kľúč (8 úrovní × signály po 4 kvadrantoch), protokol rozhovoru, formát výstupu |
| `02_urovne_signaly_zivotne_podmienky.txt` | DiagView, Prostredie, QuadLevelDetail statické texty (cez `SD_KB`, nezávisle) | Per úroveň: životné podmienky, silné stránky, prejavy, slepé miesta, tiene |
| `03_prechody_rast_integracia.txt` | Plán (rastový plán), fetchQuadCellDetail | Fázy zmeny úrovne, princípy rastu/integrácie naprieč AQAL kvadrantmi |
| `05_diagnostika_kalibracia_priklady.txt` | DiagView.evaluate(), fetchQuadCellDetail | Kalibrácia skóre 0-100, skóre vs. relevancia, ukážkové mini-dialógy |

**Chýbajúce "04":** pôvodný `04_dynamika_zmeny.txt` bol nahradený rozdelenou
KB v `../change/sk/` (`01_core_facilitacia_safety.txt`, `02_fazy.txt`,
`03_podmienky_varianty_sd.txt`) pre samostatný flow "Dynamika zmeny"
(`chat: true` vetva v `chat.js`, načítava `loadChangeKB()` namiesto tejto
priečinky). Pôvodný súbor je zálohovaný v `../../_archiv/04_dynamika_zmeny.txt`.

**Keď pridávaš nový súbor sem:** pridaj riadok do tabuľky vyššie s tým,
ktorej funkcii/funkciám slúži — je to lacné teraz a ušetrí to archeológiu
neskôr, keď/ak sa KB rozrastie natoľko, že bude dávať zmysel načítavať len
podmnožinu súborov podľa volajúcej funkcie (pozri roadmapu v pláne
`ideme-vylep-i-a-za-a-harmonic-penguin.md`).
