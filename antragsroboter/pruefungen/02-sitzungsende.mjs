/*
 * Gezielte Pruefung des Sitzungs-Abbruchs.
 *
 * Mitten in einem laufenden Stapel wird die Anmeldung entzogen - genau das,
 * was ein Portal mit Sitzungszeitlimit nach einer Weile von selbst tut.
 * Erwartet wird: der Roboter haelt SOFORT an, verbucht den betroffenen Antrag
 * NICHT als Fehler, und arbeitet nach der Neuanmeldung sauber weiter.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const ERWEITERUNG = new URL('../erweiterung', import.meta.url).pathname;
const PORTAL = `http://127.0.0.1:${process.env.PORT || 8899}`;
const PROFIL = `/tmp/antragsroboter-profil-02`;
const MARKE  = 'Beliebige Eingaben werden angenommen';   // steht nur auf der Anmeldeseite

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
  catch (e) { /* der Versuch weckt den Dienst bereits */ }
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

// ---------------------------------------------------------------- Anmelden
const seite = ctx.pages()[0] || await ctx.newPage();
await seite.goto(`${PORTAL}/index.html`, { waitUntil: 'domcontentloaded' });
await seite.click('button.haupt');
await seite.waitForURL('**/liste.html', { timeout: 10000 });
const tabId = await sw.evaluate(async () =>
  (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);

const erwId = sw.url().split('/')[2];
panelTab = await ctx.newPage();
await panelTab.goto(`chrome-extension://${erwId}/panel.html`, { waitUntil: 'domcontentloaded' });
await seite.bringToFront();
console.log('Angemeldet, Bedienfeld offen.\n');

// -------------------------------------------------- Rezept direkt einsetzen
const feld = (aktion, sel, wert, extra = {}) => ({
  aktion, wert, selektoren: [sel], text: '', beschriftung: sel,
  tag: '', typ: '', endgueltig: false, navigiert: false, ...extra
});
const rezept = {
  name: 'Sitzungstest',
  startUrl: `${PORTAL}/antrag.html?nr={{antrag}}`,
  schritte: [
    feld('eingabe', '#vermerk', 'Freigabe {{antrag}}'),
    feld('auswahl', '#grund', 'regulaer'),
    feld('haken',   '#sachlich', 'true'),
    feld('klick',   '#freigeben', '', { endgueltig: true, navigiert: true })
  ],
  erfolgText: 'wurde freigegeben',
  fehlerText: 'ist nicht vorhanden',
  sitzungsText: MARKE,
  beispielwert: '', erstellt: ''
};
const alsListe = a => a.map(w => ({ wert: w, felder: {}, status: 'offen', meldung: '', zeit: '' }));
const z0 = await zustand();
await anRoboter({ typ: 'zustandSetzen', aenderung: {
  rezept, antraege: alsListe(['A-10001', 'A-10002', 'A-10003', 'A-10004', 'A-10005']),
  protokoll: [],
  optionen: { ...z0.optionen, trockenlauf: false, einzelbestaetigung: false,
              maxFehlerInFolge: 3, pauseSchritt: 60, pauseAntrag: 200, pauseSeite: 250 } } });

console.log('===============  Lauf starten  ===============');
await anRoboter({ typ: 'laufStarten', tabId, nurOffene: false });

// Warten, bis der erste Antrag durch ist, dann die Anmeldung entziehen.
let entzogen = false;
const ende = Date.now() + 90000;
while (Date.now() < ende) {
  const s = await zustand();
  const fertig = s.antraege.filter(a => a.status === 'ok').length;
  if (!entzogen && fertig >= 1) {
    await seite.evaluate(() => localStorage.removeItem('uebung.sitzung'));
    entzogen = true;
    console.log(`   Nach ${fertig} erledigten Antraegen die Anmeldung entzogen.`);
  }
  if (!s.lauf.aktiv || s.lauf.pausiert) break;
  await schlaf(300);
}

let z = await zustand();
console.log('   Zustand:', z.lauf.pausiert ? 'angehalten' : (z.lauf.aktiv ? 'laeuft' : 'beendet'));
console.log('   Grund:  ', z.lauf.grund);
z.antraege.forEach(a => console.log(`   ${a.wert}: ${a.status}${a.meldung ? ' - ' + a.meldung : ''}`));

pruefe(z.lauf.pausiert, 'Roboter haelt bei Sitzungsende an');
pruefe(/Sitzung abgelaufen/i.test(z.lauf.grund), 'Grund nennt die abgelaufene Sitzung', z.lauf.grund);
pruefe(z.antraege.filter(a => a.status === 'fehler').length === 0,
       'KEIN Antrag faelschlich als Fehler verbucht',
       `${z.antraege.filter(a => a.status === 'fehler').length} Fehler`);

// Der Kern der Sache: was das Portal freigegeben hat, darf im Protokoll nie
// als "Fehler" stehen. Entweder 'ok' (bestaetigt) oder 'unklar' (ungeprueft).
const unklar = z.antraege.filter(a => a.status === 'unklar');
const echtFrei = await seite.evaluate(() =>
  Object.keys(JSON.parse(localStorage.getItem('uebung.freigaben') || '{}')));
const falschVerbucht = z.antraege.filter(a =>
  echtFrei.includes(a.wert) && a.status !== 'ok' && a.status !== 'unklar');
pruefe(falschVerbucht.length === 0,
       'Keine erteilte Freigabe wird als Fehler ausgewiesen',
       falschVerbucht.map(a => `${a.wert}=${a.status}`).join(' ') || 'keine');
if (unklar.length) console.log(`   ungeklaert: ${unklar.map(a => a.wert).join(', ')}`);
pruefe(z.antraege.filter(a => a.status === 'laeuft').length === 0,
       'Kein Antrag bleibt im Zustand "laeuft" haengen');
const erledigt = z.antraege.filter(a => a.status === 'ok').length;
const offen    = z.antraege.filter(a => a.status === 'offen').length;
pruefe(erledigt + offen + unklar.length === 5, 'Alle Antraege sauber zugeordnet',
       `${erledigt} ok, ${offen} offen, ${unklar.length} unklar`);
pruefe(echtFrei.length === erledigt + unklar.length,
       'Portal und Protokoll erklaerbar', `Portal ${echtFrei.length}, ok+unklar ${erledigt + unklar.length}`);

console.log('\n===============  Neu anmelden und fortsetzen  ===============');
await seite.goto(`${PORTAL}/index.html`, { waitUntil: 'domcontentloaded' });
await seite.click('button.haupt');
await seite.waitForURL('**/liste.html', { timeout: 10000 });
await anRoboter({ typ: 'laufFortsetzen', tabId });

const ende2 = Date.now() + 90000;
while (Date.now() < ende2) {
  const s = await zustand();
  if (!s.lauf.aktiv || s.lauf.pausiert) break;
  await schlaf(300);
}
z = await zustand();
console.log('   ' + z.lauf.grund);
z.antraege.forEach(a => console.log(`   ${a.wert}: ${a.status}${a.meldung ? ' - ' + a.meldung : ''}`));
pruefe(z.antraege.filter(a => a.status === 'offen').length === 0,
       'Kein Antrag bleibt nach dem Fortsetzen liegen',
       z.antraege.map(a => `${a.wert}=${a.status}`).join(' '));
pruefe(z.antraege.every(a => a.status === 'ok' || a.status === 'unklar'),
       'Alle Antraege endeten in einem erklaerbaren Zustand',
       z.antraege.map(a => a.status).join(' '));

const echt2 = await seite.evaluate(() =>
  Object.keys(JSON.parse(localStorage.getItem('uebung.freigaben') || '{}')).sort());
pruefe(echt2.length === 5, 'Portal hat am Ende genau 5 Freigaben - keine fehlt, keine doppelt',
       echt2.join(', '));
// Kein 'unklar' darf erneut angefasst worden sein - sonst droht Doppelfreigabe.
pruefe(z.antraege.filter(a => a.status === 'unklar').every(a => !/erneut/i.test(a.meldung || '')),
       'Ungeklaerte Antraege wurden NICHT erneut abgespielt');

await ctx.close();
console.log('\n' + '='.repeat(54));
console.log(schlecht === 0 ? 'SITZUNGSSCHUTZ BESTANDEN' : `${schlecht} PRUEFUNG(EN) FEHLGESCHLAGEN`);
process.exit(schlecht === 0 ? 0 : 1);
