/*
 * Pruefung gegen den WohnWeb-Nachbau.
 *
 * Geprueft wird der von euch beschriebene Ablauf:
 *   Uebersicht -> Zeile anklicken -> beide Merkmale gruen? -> Pruefung
 *   einleiten -> Freitext -> absenden -> Browser-Zurueck -> naechster Antrag
 *
 * Die harten Punkte dabei:
 *   - Adressen enthalten nur GUIDs, der Antrag ist NICHT direkt ansteuerbar
 *   - zwei Faelle sind absichtlich nicht freigabereif und muessen ausgelassen
 *     werden, statt durchgewunken zu werden
 */
import { chromium } from 'playwright';
import fs from 'fs';

const ERWEITERUNG = new URL('../erweiterung', import.meta.url).pathname;
const PORTAL = `http://127.0.0.1:${process.env.PORT || 8899}/wohnweb`;
const PROFIL = `/tmp/antragsroboter-profil-03`;

const schlaf = ms => new Promise(r => setTimeout(r, ms));
let schlecht = 0;
const pruefe = (b, t, z = '') => {
  if (!b) schlecht++;
  console.log(`[${b ? '  OK  ' : ' FEHL '}] ${t}${z ? '  ->  ' + z : ''}`);
};

fs.rmSync(PROFIL, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(PROFIL, {
  headless: true, channel: 'chromium',
  args: [`--disable-extensions-except=${ERWEITERUNG}`, `--load-extension=${ERWEITERUNG}`,
         '--no-first-run', '--no-default-browser-check']
});

let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });
let panelTab = null;
async function swBereit() {
  try { await sw.evaluate(() => 1); return sw; } catch (e) { /* beendet */ }
  for (const w of ctx.serviceWorkers()) {
    try { await w.evaluate(() => 1); sw = w; return sw; } catch (e) { /* alt */ }
  }
  const kommt = ctx.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
  try { await panelTab?.evaluate(() => chrome.runtime.sendMessage({ typ: 'zustandLesen' })); }
  catch (e) { /* weckt den Dienst schon durch den Versuch */ }
  sw = (await kommt) || ctx.serviceWorkers()[0];
  return sw;
}
async function robust(arbeit, versuche = 4) {
  let letzter;
  for (let i = 0; i < versuche; i++) {
    try { return await arbeit(await swBereit()); }
    catch (e) {
      letzter = e;
      if (!/closed|destroyed|Target|Execution context/i.test(e.message)) throw e;
      sw = { evaluate: () => { throw new Error('closed'); } };
      await schlaf(400);
    }
  }
  throw letzter;
}
const anRoboter = (n, t = null) =>
  robust(w => w.evaluate(([a, b]) => behandle(a, b ? { tab: { id: b } } : {}), [n, t]));
const zustand = () => robust(w => w.evaluate(() => lies()));

async function wartenBisFertig(maxMs, was) {
  const bis = Date.now() + maxMs;
  while (Date.now() < bis) {
    const s = await zustand();
    if (!s.lauf.aktiv || s.lauf.pausiert) return s;
    await schlaf(400);
  }
  console.log(`   !! ZEITUEBERSCHREITUNG beim ${was}`);
  return await zustand();
}

console.log('===============  1. Anmelden und Uebersicht oeffnen  ===============');
const seite = ctx.pages()[0] || await ctx.newPage();
await seite.goto(`${PORTAL}/anmeldung.html`, { waitUntil: 'domcontentloaded' });
await seite.click('button[type=submit]');
await seite.waitForURL('**/start.html', { timeout: 10000 });

// Den Browser-Hinweiskasten wegklicken - das macht im Echtbetrieb der
// Mensch bei der Anmeldung. Um spätere Auftritte kümmert sich der Roboter.
async function hinweisWeg() {
  const knopf = seite.locator('button', { hasText: 'Ja, verstanden' });
  if (await knopf.count()) { await knopf.first().click(); await schlaf(200); }
}
await hinweisWeg();

await seite.click('a[href="uebersicht.html"]');
await seite.waitForURL('**/uebersicht.html', { timeout: 10000 });
await schlaf(400);
pruefe(seite.url().includes('uebersicht'), 'Allgemeine Förderfallübersicht offen');

const tabId = await sw.evaluate(async () =>
  (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
const erwId = sw.url().split('/')[2];
panelTab = await ctx.newPage();
await panelTab.goto(`chrome-extension://${erwId}/panel.html`, { waitUntil: 'domcontentloaded' });
await seite.bringToFront();

console.log('\n===============  2. Liste aus dem Portal holen  ===============');
// Wie das Bedienfeld: der Auftrag geht ueber den Hintergrund an das
// Inhalts-Skript. Im Seitenkontext selbst gibt es kein chrome.runtime.
const ernte = await robust(w => w.evaluate(
  id => chrome.tabs.sendMessage(id, { typ: 'tabelleErnten', statusWert: 'gestellt' }), tabId));
console.log(`   Spalten: ${ernte.spalten.join(' | ')}`);
console.log(`   ${ernte.zeilen.length} von ${ernte.gesamt} Zeilen mit Status "gestellt"`);
pruefe(!ernte.fehler, 'Übersicht liess sich auslesen', ernte.fehler || '');
pruefe(ernte.zeilen.length === 8, 'Genau die 8 gestellten Anträge geerntet',
       `${ernte.zeilen.length}`);
pruefe(ernte.spalten.includes('Aktenzeichen'), 'Spaltenüberschriften erkannt');
pruefe(ernte.zeilen.every(z => /gestellt/i.test(z.zellen.join(' '))),
       'Kein Antrag mit falschem Status in der Ernte');

// Kennung = Aktenzeichen, so wie es das Panel vorschlaegt
const kennSpalte = ernte.spalten.indexOf('Aktenzeichen');
const antraege = ernte.zeilen.map(z => {
  const felder = {};
  ernte.spalten.forEach((sp, j) => {
    const n = sp.toLowerCase().replace(/[^\w.\-]/g, '');
    if (n && j !== kennSpalte) felder[n] = z.zellen[j];
  });
  return { wert: z.zellen[kennSpalte], felder, status: 'offen', meldung: '', zeit: '' };
});
console.log(`   Kennungen: ${antraege.map(a => a.wert).join(', ')}`);

console.log('\n===============  3. Rezept nach eurer Beschreibung  ===============');
const schritt = (aktion, extra = {}) => ({
  aktion, wert: '', selektoren: [], text: '', beschriftung: aktion,
  tag: '', typ: '', endgueltig: false, navigiert: false, ...extra });

const rezept = {
  name: 'WohnWeb - Prüfung NRW.BANK einleiten',
  startUrl: '',                       // kein Direktaufruf moeglich: GUID-Adressen
  schritte: [
    // 1. Zeile in der Uebersicht anklicken - der einzige Weg zum Antrag
    schritt('zeileKlicken', { wert: '{{antrag}}', beschriftung: 'Zeile {{antrag}}',
                              navigiert: true }),
    // 2.+3. Beide Merkmale muessen gruen sein, sonst wird ausgelassen
    schritt('vorbedingung', { selektoren: ['[data-testid="merkmal-finanzierung"]'],
                              beschriftung: 'Finanzierung' }),
    schritt('vorbedingung', { selektoren: ['[data-testid="merkmal-detailpruefbarkeit"]'],
                              beschriftung: 'Detailprüfbarkeit' }),
    // 4. Dialog oeffnen
    schritt('klick', { selektoren: ['[data-testid="pruefung-einleiten"]'],
                       beschriftung: 'Prüfung NRW.BANK einleiten' }),
    // 5. Pflicht-Freitext
    schritt('eingabe', { selektoren: ['#freitext'], wert: 'Test',
                         beschriftung: 'Ergänzende Informationen' }),
    // 6. DER endgueltige Schritt
    schritt('klick', { selektoren: ['[data-testid="dialog-senden"]'],
                       beschriftung: 'Prüfung einleiten (endgültig)', endgueltig: true }),
    // 7. Bestaetigung abwarten - die Pruefung sitzt hier, nicht am Schluss,
    //    denn nach dem Zurueckgehen steht sie nicht mehr auf der Seite
    schritt('warteText', { wert: 'Prüfung der NRW.BANK wurde eingeleitet',
                           beschriftung: 'Bestätigung', zeitlimit: 10000 }),
    // 8. Browser-Zurueck auf die Uebersicht. 'immer' ist hier entscheidend:
    //    dieser Schritt muss AUCH laufen, wenn der Antrag vorher ausgelassen
    //    wurde oder scheiterte - sonst bliebe der Roboter auf der Antragsseite
    //    stehen und faende fuer den naechsten Antrag keine Liste mehr vor.
    schritt('zurueck', { beschriftung: 'zurück zur Übersicht',
                         navigiert: true, immer: true })
  ],
  erfolgText: '', fehlerText: 'ist nicht vorhanden\nkeine Prüfung einzuleiten',
  sitzungsText: 'Anmeldung Übungsportal',
  // Der Hinweiskasten des Portals legt sich unregelmässig über die Seite.
  // Er lässt sich nicht als fester Schritt aufzeichnen - mal ist er da,
  // mal nicht. Also wird er weggeklickt, wenn er auftaucht.
  stoererTexte: 'Ja, verstanden',
  beispielwert: '', erstellt: ''
};

const z0 = await zustand();
await anRoboter({ typ: 'zustandSetzen', aenderung: {
  rezept, antraege: structuredClone(antraege), protokoll: [],
  optionen: { ...z0.optionen, trockenlauf: true, einzelbestaetigung: false,
              maxFehlerInFolge: 4, pauseSchritt: 80, pauseAntrag: 250, pauseSeite: 300 } } });

console.log('\n===============  4. Trockenlauf  ===============');
await anRoboter({ typ: 'laufStarten', tabId, nurOffene: false });
let z = await wartenBisFertig(180000, 'Trockenlauf');
console.log('   ' + z.lauf.grund);
z.antraege.forEach(a => console.log(`   ${a.wert}: ${a.status} - ${a.meldung}`));

const probe = z.antraege.filter(a => a.status === 'probe').length;
const uebersprungen = z.antraege.filter(a => a.status === 'uebersprungen');
pruefe(probe === 6, 'Trockenlauf: 6 freigabereife Anträge durchgespielt', `${probe}`);
pruefe(uebersprungen.length === 2, 'Die 2 nicht freigabereifen wurden ausgelassen',
       uebersprungen.map(a => a.wert).join(', '));
pruefe(uebersprungen.some(a => /Finanzierung/.test(a.meldung)),
       'Grund benennt das Merkmal Finanzierung',
       uebersprungen.find(a => /Finanzierung/.test(a.meldung))?.meldung || '');
pruefe(uebersprungen.some(a => /Detailprüfbarkeit/.test(a.meldung)),
       'Grund benennt das Merkmal Detailprüfbarkeit');

const nachProbe = await seite.evaluate(() =>
  JSON.parse(localStorage.getItem('ww.bestand') || '[]')
    .filter(f => f.status === 'Prüfung NRW.BANK eingeleitet').length);
pruefe(nachProbe === 0, 'Trockenlauf hat NICHTS eingeleitet', `${nachProbe} eingeleitet`);

console.log('\n===============  5. Echter Lauf  ===============');
await seite.goto(`${PORTAL}/uebersicht.html`, { waitUntil: 'domcontentloaded' });
await schlaf(400);
await hinweisWeg();
z = await zustand();
await anRoboter({ typ: 'zustandSetzen', aenderung: {
  antraege: structuredClone(antraege),
  optionen: { ...z.optionen, trockenlauf: false } } });
await anRoboter({ typ: 'laufStarten', tabId, nurOffene: false });
z = await wartenBisFertig(240000, 'Echtlauf');
console.log('   ' + z.lauf.grund);
z.antraege.forEach(a => console.log(
  `   ${a.wert}: ${a.status} - ${a.meldung}${a.dauer != null ? ` (${a.dauer}s)` : ''}`));

const ok = z.antraege.filter(a => a.status === 'ok');
const aus = z.antraege.filter(a => a.status === 'uebersprungen');
pruefe(ok.length === 6, 'Alle 6 freigabereifen Anträge erledigt', `${ok.length}`);
pruefe(aus.length === 2, 'Die 2 nicht freigabereifen erneut ausgelassen', `${aus.length}`);
pruefe(z.antraege.filter(a => a.status === 'fehler' || a.status === 'unklar').length === 0,
       'Keine Fehler, nichts Ungeklärtes');

const bestand = await seite.evaluate(() =>
  JSON.parse(localStorage.getItem('ww.bestand') || '[]'));
const eingeleitet = bestand.filter(f => f.status === 'Prüfung NRW.BANK eingeleitet');
console.log(`   Portal: ${eingeleitet.map(f => f.aktenzeichen).join(', ')}`);
pruefe(eingeleitet.length === 6, 'Portal bestätigt genau 6 Einleitungen',
       `${eingeleitet.length}`);
pruefe(eingeleitet.every(f => f.freitext === 'Test'),
       'Der Freitext steht bei jedem Antrag im Portal');
pruefe(eingeleitet.every(f => f.ohneUebermittlung === false),
       'Häkchen "ohne Datenübermittlung" blieb überall leer — Daten gingen an die Bank');

// Die ausgelassenen duerfen unberuehrt sein
const ausAkten = aus.map(a => a.wert);
pruefe(bestand.filter(f => ausAkten.includes(f.aktenzeichen))
              .every(f => f.status === 'gestellt'),
       'Die ausgelassenen Anträge blieben unverändert auf "gestellt"');

// Der eigentliche Prüfstein: stimmt das Protokoll mit dem Portal überein?
// Jeder als 'ok' gemeldete Antrag MUSS im Portal eingeleitet sein, und
// umgekehrt. Ein Protokoll, das mehr meldet als geschah, ist wertlos.
const imPortal = new Set(eingeleitet.map(f => f.aktenzeichen));
const luegen = z.antraege.filter(a =>
  (a.status === 'ok') !== imPortal.has(a.wert));
pruefe(luegen.length === 0,
       'Protokoll und Portal stimmen Antrag für Antrag überein',
       luegen.map(a => `${a.wert}=${a.status}`).join(' ') || 'deckungsgleich');

// Bei einer Abweichung den Verlauf zeigen - ohne ihn ist die Ursache
// nicht zu finden, und ein zweiter Lauf trifft sie vielleicht nicht.
if (luegen.length) {
  const betroffen = new Set(luegen.map(a => a.wert));
  console.log('\n   --- Verlauf rund um die Abweichung ---');
  for (const e of z.protokoll.slice(-40)) {
    const markiere = betroffen.has(e.antrag) ? ' <<<' : '';
    console.log(`   ${e.zeit.slice(11,19)} ${(e.antrag||'—').padEnd(9)} ${e.ereignis}` +
                `${e.detail ? ' — ' + e.detail.slice(0,60) : ''}${markiere}`);
  }
}

// Nachweis, dass der Hinweiskasten überhaupt im Weg stand und geräumt wurde.
// Ohne diesen Beleg könnte der Test auch dann grün sein, wenn der Kasten gar
// nicht erschienen ist.
const geraeumt = z.protokoll.filter(e => e.ereignis === 'Hinweisfenster weggeklickt');
console.log(`   Hinweisfenster weggeklickt: ${geraeumt.length}x`);
pruefe(geraeumt.length > 0,
       'Der Browser-Hinweiskasten wurde erkannt und weggeklickt',
       `${geraeumt.length}x`);

console.log('\n===============  6. Zweiter Lauf: nichts doppelt  ===============');
// Dieselbe Liste noch einmal - jetzt ist nichts mehr "gestellt"
await seite.goto(`${PORTAL}/uebersicht.html`, { waitUntil: 'domcontentloaded' });
await schlaf(400);
await hinweisWeg();
z = await zustand();
await anRoboter({ typ: 'zustandSetzen', aenderung: {
  antraege: structuredClone(antraege),
  optionen: { ...z.optionen, maxFehlerInFolge: 99 } } });
await anRoboter({ typ: 'laufStarten', tabId, nurOffene: false });
z = await wartenBisFertig(240000, 'Wiederholungslauf');
const nochmal = await seite.evaluate(() =>
  JSON.parse(localStorage.getItem('ww.bestand') || '[]')
    .filter(f => f.status === 'Prüfung NRW.BANK eingeleitet').length);
console.log(`   Portal hat jetzt ${nochmal} eingeleitete Anträge (vorher 6)`);
z.antraege.forEach(a => console.log(`   ${a.wert}: ${a.status} - ${(a.meldung||'').slice(0,70)}`));
pruefe(nochmal === 6, 'Ein zweiter Lauf leitet NICHTS doppelt ein', `${nochmal}`);

console.log('\n===============  7. Bedienfeld  ===============');
await panelTab.bringToFront();
await panelTab.evaluate(() => laden());
await schlaf(600);
const panelFehler = [];
panelTab.on('pageerror', f => panelFehler.push(String(f)));
panelTab.on('console', m => { if (m.type() === 'error') panelFehler.push(m.text()); });
await panelTab.reload({ waitUntil: 'domcontentloaded' });
await schlaf(800);
const sicht = await panelTab.evaluate(() => ({
  schritte: Number(document.getElementById('schrittZahl').textContent),
  zeilen: document.querySelectorAll('#antragsTabelle tbody tr').length,
  ernteDa: !!document.getElementById('ernteHolen'),
  neuDa: !!document.getElementById('neuHinzufuegen'),
  aktionen: document.querySelectorAll('#neuAktion option').length,
  // Bei 'zurueck' muessen "immer" und "wechselt die Seite" von selbst gesetzt
  // sein - der haeufigste Fehler beim Bauen des Rezepts.
  zurueckVorbelegt: (() => {
    const w = document.getElementById('neuAktion');
    w.value = 'zurueck'; w.dispatchEvent(new Event('change'));
    return document.getElementById('neuImmer').checked
        && document.getElementById('neuNavigiert').checked;
  })()
}));
console.log('   ', JSON.stringify(sicht));
pruefe(sicht.schritte === 8, 'Bedienfeld zeigt die 8 Schritte', `${sicht.schritte}`);
pruefe(sicht.ernteDa, 'Ernte-Bereich vorhanden');
pruefe(sicht.neuDa, 'Schritte lassen sich von Hand ergänzen');
pruefe(sicht.aktionen >= 11, 'Alle Schrittarten wählbar', `${sicht.aktionen}`);
pruefe(sicht.zurueckVorbelegt,
       'Rückweg-Schritt ist von selbst als "immer" + "wechselt die Seite" vorbelegt');
pruefe(panelFehler.length === 0, 'Bedienfeld lädt ohne Skriptfehler',
       panelFehler.slice(0, 2).join(' | '));

await ctx.close();
console.log('\n' + '='.repeat(56));
console.log(schlecht === 0 ? 'WOHNWEB-ABLAUF BESTANDEN'
                           : `${schlecht} PRUEFUNG(EN) FEHLGESCHLAGEN`);
process.exit(schlecht === 0 ? 0 : 1);
