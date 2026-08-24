/*
 * End-zu-End-Pruefung des Antragsroboters gegen das Uebungsportal.
 *
 * Geprueft wird der schwierige Fall: der Vorgang beginnt in der Trefferliste,
 * die Antragsnummer steckt im Selektor des Links, und je Antrag finden ZWEI
 * Seitenwechsel statt (Liste -> Antrag -> Erfolgsseite). Genau daran scheitern
 * einfache Roboter.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const ERWEITERUNG = new URL('../erweiterung', import.meta.url).pathname;
const PORTAL      = 'http://127.0.0.1:8899';
const PROFIL      = '/tmp/antragsroboter-profil';

const schlaf = ms => new Promise(r => setTimeout(r, ms));
let fehlgeschlagen = 0;
function pruefe(b, text, zusatz = '') {
  if (!b) fehlgeschlagen++;
  console.log(`[${b ? '  OK  ' : ' FEHL '}] ${text}${zusatz ? '  ->  ' + zusatz : ''}`);
}

fs.rmSync(PROFIL, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(PROFIL, {
  headless: true, channel: 'chromium',
  args: [`--disable-extensions-except=${ERWEITERUNG}`, `--load-extension=${ERWEITERUNG}`,
         '--no-first-run', '--no-default-browser-check']
});

/* Der Hintergrund-Dienst wird von Chrome nach Leerlauf beendet und bei der
 * naechsten Nachricht neu gestartet - so ist Manifest V3 gebaut. Fuer den Test
 * heisst das: das Handle darauf kann jederzeit ungueltig werden und muss neu
 * geholt werden. Fuer das Produkt heisst es, dass der Zustand niemals im
 * Dienst liegen darf, sondern nur in chrome.storage.local. Genau das prueft
 * dieser Testlauf nebenbei mit. */
let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });
let neustarts = 0;

async function swBereit() {
  try { await sw.evaluate(() => 1); return sw; } catch (e) { /* beendet worden */ }
  neustarts++;
  for (const w of ctx.serviceWorkers()) {
    try { await w.evaluate(() => 1); sw = w; return sw; } catch (e) { /* auch alt */ }
  }
  // Aufwecken, ohne die Portalseite anzufassen: das Bedienfeld liegt in der
  // Erweiterung und darf den Dienst ansprechen.
  const kommt = ctx.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
  try { await panelTab.evaluate(() => chrome.runtime.sendMessage({ typ: 'zustandLesen' })); }
  catch (e) { /* Panel weckt den Dienst auch durch den blossen Versuch */ }
  sw = (await kommt) || ctx.serviceWorkers()[0];
  if (!sw) throw new Error('Hintergrund-Dienst laesst sich nicht wecken');
  return sw;
}

async function robust(arbeit, versuche = 4) {
  let letzter;
  for (let i = 0; i < versuche; i++) {
    try { return await arbeit(await swBereit()); }
    catch (e) {
      letzter = e;
      if (!/closed|destroyed|Target|Execution context/i.test(e.message)) throw e;
      sw = { evaluate: () => { throw new Error('closed'); } };   // Neuholen erzwingen
      await schlaf(400);
    }
  }
  throw letzter;
}

const anRoboter = (n, t = null) =>
  robust(w => w.evaluate(([a, b]) => behandle(a, b ? { tab: { id: b } } : {}), [n, t]));
const zustand = () => robust(w => w.evaluate(() => lies()));

async function wartenBisFertig(maxMs, was) {
  const ende = Date.now() + maxMs;
  while (Date.now() < ende) {
    const s = await zustand();
    if (!s.lauf.aktiv || s.lauf.pausiert) return s;
    await schlaf(400);
  }
  console.log(`   !! ZEITUEBERSCHREITUNG beim ${was}`);
  return await zustand();
}

const alsListe = a => a.map(w => ({ wert: w, felder: {}, status: 'offen', meldung: '', zeit: '' }));

console.log('===============  1. Anmelden  ===============');
const seite = ctx.pages()[0] || await ctx.newPage();
await seite.goto(`${PORTAL}/index.html`, { waitUntil: 'domcontentloaded' });
await seite.click('button.haupt');
await seite.waitForURL('**/liste.html', { timeout: 10000 });
pruefe(seite.url().includes('liste.html'), 'Anmeldung am Uebungsportal');
const tabId = await sw.evaluate(async () =>
  (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);

// Das Bedienfeld als eigenen Tab oeffnen. Damit laeuft der echte Panel-Code
// mit - Zeichnen, Ereignisbindung, Zustandsabruf - statt ungeprueft zu bleiben.
const erwId = sw.url().split('/')[2];
const panelFehler = [];
const panelTab = await ctx.newPage();
panelTab.on('pageerror', f => panelFehler.push(String(f)));
panelTab.on('console', m => { if (m.type() === 'error') panelFehler.push(m.text()); });
await panelTab.goto(`chrome-extension://${erwId}/panel.html`, { waitUntil: 'domcontentloaded' });
await schlaf(800);
await seite.bringToFront();
pruefe(panelFehler.length === 0, 'Bedienfeld laedt ohne Fehler',
       panelFehler.slice(0, 2).join(' | '));
pruefe(await panelTab.locator('.reiterKnopf').count() === 5, 'Bedienfeld zeigt alle 5 Reiter');

console.log('\n===============  2. Vorgang aufzeichnen (ab Trefferliste)  ===============');
await anRoboter({ typ: 'aufnahmeStarten', tabId, url: seite.url(), neu: true });
await schlaf(300);

await seite.click('[data-testid="verweis-A-10001"]');       // Seitenwechsel 1
await seite.waitForURL('**/antrag.html?nr=A-10001', { timeout: 10000 });
await schlaf(400);
await seite.fill('#vermerk', 'Sachlich geprueft, Freigabe A-10001');
await seite.selectOption('#grund', 'regulaer');
await seite.check('#sachlich');
await schlaf(300);
await seite.click('#freigeben');                             // Seitenwechsel 2
await seite.waitForURL('**/erfolg.html*', { timeout: 10000 });
await schlaf(500);
await anRoboter({ typ: 'aufnahmeBeenden' });

let z = await zustand();
const schritte = z.rezept.schritte;
console.log('Aufgezeichnet:');
schritte.forEach((s, i) => console.log(
  `   ${String(i + 1).padStart(2)}. ${s.aktion.padEnd(8)} ${(s.beschriftung || '').slice(0, 32).padEnd(34)}` +
  `${s.wert !== undefined && s.wert !== '' ? 'wert=' + JSON.stringify(String(s.wert)).slice(0, 34) : ''}` +
  `${s.navigiert ? '  [Seitenwechsel]' : ''}`));

const reihenfolge = schritte.map(s => s.aktion).join(',');
pruefe(reihenfolge === 'klick,eingabe,auswahl,haken,klick',
       'Schritte in der richtigen Reihenfolge', reihenfolge);
const haken = schritte.find(s => s.aktion === 'haken');
pruefe(String(haken?.wert) === 'true', 'Kontrollkaestchen als ANGEHAKT gespeichert',
       `wert=${haken?.wert}`);
pruefe(schritte.filter(s => s.navigiert).length === 2, 'Beide Seitenwechsel markiert',
       `${schritte.filter(s => s.navigiert).length}`);
pruefe(!schritte.some(s => String(s.wert || '').includes('geheim')), 'Kennwort NICHT aufgezeichnet');
pruefe(schritte[0].selektoren.some(x => x.includes('A-10001')),
       'Antragsnummer steckt im Selektor von Schritt 1', schritte[0].selektoren[0]);

console.log('\n===============  3. Platzhalter setzen (wie im Panel)  ===============');
const rezept = structuredClone(z.rezept);
let treffer = 0;
const ersetze = t => (typeof t === 'string' && t.includes('A-10001'))
  ? (treffer++, t.split('A-10001').join('{{antrag}}')) : t;
rezept.startUrl = `${PORTAL}/liste.html`;
rezept.schritte.forEach(s => {
  if (typeof s.wert === 'string')         s.wert         = ersetze(s.wert);
  if (typeof s.text === 'string')         s.text         = ersetze(s.text);
  if (typeof s.beschriftung === 'string') s.beschriftung = ersetze(s.beschriftung);
  if (Array.isArray(s.selektoren))        s.selektoren   = s.selektoren.map(ersetze);
});
rezept.erfolgText = 'wurde freigegeben';
rezept.fehlerText = 'Antrag bereits bearbeitet\nist nicht vorhanden';
[...rezept.schritte].reverse().find(s => s.aktion === 'klick').endgueltig = true;
await anRoboter({ typ: 'zustandSetzen', aenderung: { rezept } });
console.log('   Schritt 1 sucht jetzt:', rezept.schritte[0].selektoren[0]);
pruefe(treffer >= 3, 'An mehreren Stellen ersetzt (Wert, Text, Selektor)', `${treffer} Stellen`);
pruefe(rezept.schritte[0].selektoren.every(x => !x.includes('A-10001')),
       'Kein Rest der Beispiel-Antragsnummer im Selektor');

console.log('\n===============  4. Trockenlauf  ===============');
z = await zustand();
await anRoboter({ typ: 'zustandSetzen', aenderung: {
  antraege: alsListe(['A-10002', 'A-10003', 'A-10004']),
  optionen: { ...z.optionen, trockenlauf: true, einzelbestaetigung: false,
              pauseSchritt: 60, pauseAntrag: 150, pauseSeite: 250 } } });
await anRoboter({ typ: 'laufStarten', tabId, nurOffene: false });
z = await wartenBisFertig(90000, 'Trockenlauf');
console.log('   ' + z.lauf.grund);
z.antraege.forEach(a => console.log(`   ${a.wert}: ${a.status} - ${a.meldung}`));
pruefe(z.antraege.every(a => a.status === 'probe'), 'Trockenlauf: alle 3 durchgelaufen',
       z.antraege.map(a => a.status).join(' '));
pruefe(z.antraege.every(a => /bis zur Freigabe fehlerfrei/.test(a.meldung)),
       'Trockenlauf bewertet sich sinnvoll (nicht als Fehlschlag)',
       z.antraege[0]?.meldung || '');

const nachProbe = await seite.evaluate(() =>
  Object.keys(JSON.parse(localStorage.getItem('uebung.freigaben') || '{}')).sort());
pruefe(nachProbe.length === 1 && nachProbe[0] === 'A-10001',
       'Trockenlauf hat NICHTS echt freigegeben', `freigegeben: ${nachProbe.join(', ')}`);

console.log('\n===============  5. Echter Lauf  ===============');
z = await zustand();
await anRoboter({ typ: 'zustandSetzen', aenderung: {
  antraege: alsListe(['A-10002', 'A-10003', 'A-10004', 'A-10005']),
  optionen: { ...z.optionen, trockenlauf: false, einzelbestaetigung: false } } });
await anRoboter({ typ: 'laufStarten', tabId, nurOffene: false });
z = await wartenBisFertig(120000, 'Echtlauf');
console.log('   ' + z.lauf.grund);
z.antraege.forEach(a => console.log(
  `   ${a.wert}: ${a.status} - ${a.meldung}${a.dauer != null ? ` (${a.dauer}s)` : ''}`));
pruefe(z.antraege.every(a => a.status === 'ok'), 'Alle 4 Antraege erledigt',
       z.antraege.map(a => `${a.wert}=${a.status}`).join(' '));

const echtFrei = await seite.evaluate(() =>
  Object.keys(JSON.parse(localStorage.getItem('uebung.freigaben') || '{}')).sort());
pruefe(['A-10002', 'A-10003', 'A-10004', 'A-10005'].every(n => echtFrei.includes(n)),
       'Portal bestaetigt jede einzelne Freigabe', echtFrei.join(', '));
pruefe(z.antraege.every(a => /wurde freigegeben/.test(a.meldung)),
       'Erfolgsmerkmal auf der Bestaetigungsseite geprueft');

console.log('\n===============  6. Fehlertext erkennen  ===============');
// A-10002 ist schon freigegeben - das Portal meldet "Antrag bereits bearbeitet"
z = await zustand();
await anRoboter({ typ: 'zustandSetzen', aenderung: {
  antraege: alsListe(['A-10002']),
  optionen: { ...z.optionen, maxFehlerInFolge: 9 } } });
await anRoboter({ typ: 'laufStarten', tabId, nurOffene: false });
z = await wartenBisFertig(60000, 'Fehlertext-Test');
console.log(`   A-10002: ${z.antraege[0].status} - ${z.antraege[0].meldung}`);
pruefe(z.antraege[0].status === 'fehler', 'Doppelte Freigabe wird als Fehler erkannt');
pruefe(/Portal meldet/.test(z.antraege[0].meldung),
       'Protokoll nennt den Klartext des Portals, nicht nur einen Technikfehler',
       z.antraege[0].meldung);

console.log('\n===============  7. Notbremse  ===============');
z = await zustand();
await anRoboter({ typ: 'zustandSetzen', aenderung: {
  antraege: alsListe(['X-1', 'X-2', 'X-3', 'X-4', 'X-5']),
  optionen: { ...z.optionen, maxFehlerInFolge: 2 } } });
await anRoboter({ typ: 'laufStarten', tabId, nurOffene: false });
z = await wartenBisFertig(120000, 'Notbremsen-Test');
const fehlerZahl = z.antraege.filter(a => a.status === 'fehler').length;
const offen      = z.antraege.filter(a => a.status === 'offen').length;
console.log(`   Fehler: ${fehlerZahl}, offen: ${offen}`);
console.log(`   ${z.lauf.grund}`);
pruefe(z.lauf.pausiert && /Notbremse/i.test(z.lauf.grund), 'Notbremse hat ausgeloest');
pruefe(fehlerZahl === 2, 'Nach genau 2 Fehlern gestoppt', `${fehlerZahl}`);
pruefe(offen === 3, 'Restliche Antraege unberuehrt', `${offen} offen`);

console.log('\n===============  8. Fortsetzen nach Notbremse  ===============');
z = await zustand();
const vorher = z.antraege.filter(a => a.status === 'fehler').length;
await anRoboter({ typ: 'zustandSetzen', aenderung: {
  antraege: [...z.antraege.filter(a => a.status !== 'offen'), ...alsListe(['A-10006'])],
  optionen: { ...z.optionen, maxFehlerInFolge: 3 } } });
await anRoboter({ typ: 'laufFortsetzen', tabId });
z = await wartenBisFertig(60000, 'Fortsetzen');
const wieder = z.antraege.find(a => a.wert === 'A-10006');
console.log(`   A-10006: ${wieder?.status} - ${wieder?.meldung}`);
pruefe(wieder?.status === 'ok', 'Nach Notbremse laesst sich weiterarbeiten');
pruefe(z.antraege.filter(a => a.status === 'fehler').length === vorher,
       'Bereits verbuchte Fehler bleiben unveraendert');

console.log('\n===============  9. Bedienfeld  ===============');
await panelTab.bringToFront();
await panelTab.evaluate(() => laden());
await schlaf(600);
const angezeigt = await panelTab.evaluate(() => ({
  zeilen:  document.querySelectorAll('#antragsTabelle tbody tr').length,
  schritte: Number(document.getElementById('schrittZahl').textContent),
  verlauf: document.querySelectorAll('.verlaufZeile').length,
  kachel:  document.getElementById('zustandKachel').textContent
}));
console.log('   Bedienfeld zeigt:', JSON.stringify(angezeigt));
pruefe(angezeigt.schritte === 5, 'Bedienfeld zeigt die 5 Schritte', `${angezeigt.schritte}`);
pruefe(angezeigt.zeilen > 0,   'Bedienfeld zeigt die Antragstabelle', `${angezeigt.zeilen} Zeilen`);
pruefe(angezeigt.verlauf > 0,  'Bedienfeld zeigt den Verlauf', `${angezeigt.verlauf} Zeilen`);
pruefe(panelFehler.length === 0, 'Bedienfeld ohne Skriptfehler waehrend des Tests',
       panelFehler.slice(0, 2).join(' | '));

console.log('\n===============  10. Protokoll  ===============');
z = await zustand();
pruefe(z.protokoll.length > 30, 'Schritt-Verlauf gefuellt', `${z.protokoll.length} Eintraege`);
pruefe(z.antraege.filter(a => a.zeit).length > 0, 'Zeitstempel im Antragsprotokoll');

await ctx.close();
console.log('\n' + '='.repeat(54));
console.log(`Hintergrund-Dienst wurde ${neustarts}x von Chrome beendet und neu gestartet` +
            ` - der Zustand hat das ueberlebt.`);
console.log(fehlgeschlagen === 0 ? 'ALLE PRUEFUNGEN BESTANDEN'
                                 : `${fehlgeschlagen} PRUEFUNG(EN) FEHLGESCHLAGEN`);
process.exit(fehlgeschlagen === 0 ? 0 : 1);
