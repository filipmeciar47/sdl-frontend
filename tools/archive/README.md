# Archív migračných skriptov

Jednorazové nástroje, ktoré už svoju prácu odviedli. Nie sú tu preto, že by sa
mali znovu spúšťať — sú tu preto, že **niesli overené dáta** a lebo ich pôvodná
podoba dokázala ticho poškodiť súbor. Mazať ich by znamenalo zahodiť tie dáta.

| skript | čo robil | stav |
|---|---|---|
| `revert_en.js` | vracal anglický preklad produkčnej appky späť do slovenčiny (5 súborov, 99 párov) | hotové; dnes overovacie |
| `revert_en2.js` | dobral, čo prvý minul — zvyšok `App.jsx` a celý `SpotlightGuide.jsx` (21 náhrad) | hotové; dnes overovacie |

## Čo bolo na pôvodných verziách nebezpečné

Tri chyby, ktoré spolu stačili na škodu:

1. **Relatívne cesty.** `patch('backend/api/chat.js', …)` sa vyhodnotilo voči
   aktuálnemu priečinku. Spustenie z iného repa zasiahlo iné súbory, bez varovania.
2. **`.replace()` nahradí len prvý výskyt.** Druhý a ďalší zostali anglické,
   a skript to nahlásil ako úspech.
3. **Pri nenájdenej náhrade („MISS") skript pokračoval a súbor nakoniec aj tak
   zapísal.** Uložil sa teda polovičný výsledok. Práve toto spôsobilo, že revert
   v 10/2026 nedobehol — a to sa potom dokončovalo ručne.

## Čo platí teraz

Spoločné pojistky sú v [`safe-patch.js`](safe-patch.js):

- **`--repo=<cesta>` je povinný** a musí ukazovať na git repozitár. Bez neho
  skript odmietne začať. Cesty sa vyhodnocujú voči nemu a nesmú z repa vyliezť.
- **Predvolene je to náhľad.** Zapisuje sa len s `--write`.
- **Nahrádza sa každý výskyt**, nie prvý.
- **Zmeny sa držia v pamäti** a zapíšu až na konci naraz.
- **Jediný MISS znamená, že sa nezapíše nič** a návratový kód je 1.
- **Súbor s necommitnutými zmenami sa odmietne prepísať** (`--allow-dirty` to zruší).

## Dôsledok, ktorý treba vedieť dopredu

Produkčné súbory sú už preložené, takže **tieto skripty dnes spoľahlivo odmietnu
zápis.** To nie je porucha, to je zámer. Ich úloha sa zmenila z migračnej na
**overovaciu**: náhľad vypíše, ktoré reťazce sú ešte v anglickej podobe.

Stav k 2026-11-11, náhľad proti `main`:

```
revert_en   — nahradené: 2    nenájdené: 97
revert_en2  — nahradené: 0    nenájdené: 21
```

Tie dve nájdené náhrady sú poučné: pôvodná verzia by do 400 kB `App.jsx`
vložila 2 zmeny z 99, súbor zapísala a vypísala „ok: 2, miss: 97" — v tom
množstve výpisu ľahko prehliadnuteľné.

## Spustenie

```
node tools/archive/revert_en.js --repo=.                     # náhľad
node tools/archive/revert_en.js --repo=. --write              # zápis
node tools/archive/revert_en.js --repo=. --quiet              # len súhrn
node tools/archive/revert_en.js --repo=. --export-pairs=x.json   # páry ako dáta
node tools/archive/revert_en.js --help
```

Presun z koreňa repa je sám o sebe pojistka: `node revert_en.js` spustené
z koreňa už nič nenájde.

## Dáta, ktoré z nich zostali

[`../i18n/sk-en-strings.json`](../i18n/sk-en-strings.json) — 120 párov
anglický → slovenský reťazec, vyexportovaných priamo z týchto skriptov
(režim `--export-pairs`), takže sú preukázateľne tie isté.

Z toho **86 je jednoriadkových** a dajú sa použiť priamo ako položky slovníka;
32 je viacriadkových blokov kódu (napríklad `bold:` a `text:` naraz), z ktorých
treba jednotlivé reťazce ešte vytiahnuť; 2 sú regexové vzory.

Je to **základ pre budúce i18n**, nie hotový slovník. Smer je EN → SK, lebo
skripty vracali preklad späť; pre slovník bude zdrojom slovenčina, takže sa
páry otočia.
