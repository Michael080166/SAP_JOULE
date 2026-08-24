/* Uebungsportal in der Bauart von WohnWeb.
 *
 * Nachgebildet sind genau die Eigenschaften, an denen ein Roboter scheitern
 * kann - nicht das Aussehen:
 *   - Adressen enthalten nur GUIDs, kein Aktenzeichen. Ein Antrag ist damit
 *     NICHT direkt ansteuerbar, er muss in der Liste gesucht werden.
 *   - Eine Statusspalte, nach der gefiltert wird.
 *   - Zwei Pruefmerkmale, die erfuellt sein muessen (Haken) oder nicht (Kreuz).
 *   - Ein Dialog mit Pflicht-Freitextfeld, dessen Knopf erst danach freigibt.
 */

const GUIDS = [
  '18867ad1-04e1-45ef-8658-47bc234f544e', '7b29bbeb-6386-4dc9-ae09-c0a4a58c8e8c',
  '2c4a91f0-11b2-4a55-9c31-8e77d0a4b512', 'a91c7e34-55d8-4b10-9f22-1d3e6c8a7b90',
  'f3d8b2a1-9c44-4e7f-8a15-6b2c9d0e1f33', '5e1a4c88-2b67-4d93-b5e0-7a9f3c1d8e24',
  'b7c2f019-8d35-4a61-92c4-0e5b8a7d6f11', 'd4e9a3b6-7f21-4c85-a0d7-3b6e2f9c4a58',
  '9a0b1c2d-3e4f-4a5b-8c7d-6e5f4a3b2c1d', 'c8d7e6f5-4a3b-4c2d-9e8f-1a2b3c4d5e6f',
  '0f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f', '6b5a4c3d-2e1f-4098-a7b6-c5d4e3f2a1b0'
];

const ORTE = ['Münster', 'Morsbach', 'Dortmund', 'Bielefeld'];

// Der Datenbestand wird einmal erzeugt und bleibt dann bestehen.
function bestand() {
  let b = JSON.parse(localStorage.getItem('ww.bestand') || 'null');
  if (b) return b;

  const zustaende = [
    'gestellt', 'gestellt', 'gestellt', 'gestellt', 'gestellt', 'gestellt',
    'gestellt', 'gestellt', 'erteilt', 'in Detailprüfung', 'bekanntgegeben',
    'Prüfung NRW.BANK abgeschlossen'
  ];
  b = GUIDS.map((id, i) => ({
    id,
    aktenzeichen: `XY ${170 + i}`,
    name: `${170 + i}, Bulktest_Miete26`,
    adresse: `Fakestr. ${170 + i}`,
    ort: ORTE[i % ORTE.length],
    vorgangstyp: i % 5 === 4 ? 'Förderzusage' : 'Förderantrag',
    status: zustaende[i],
    // Zwei Faelle sind absichtlich NICHT freigabereif - daran muss sich
    // zeigen, dass der Roboter sie auslaesst statt sie durchzuwinken.
    finanzierung:     (i === 2) ? 'nein' : 'ok',
    detailpruefbar:   (i === 5) ? 'nein' : 'ok',
    freitext: ''
  }));
  localStorage.setItem('ww.bestand', JSON.stringify(b));
  return b;
}

function speichern(b) { localStorage.setItem('ww.bestand', JSON.stringify(b)); }

const angemeldet = () => localStorage.getItem('ww.sitzung') === 'ja';

function sitzungPruefen() {
  if (!angemeldet()) { location.href = 'anmeldung.html'; return false; }
  return true;
}

const parameter = n => new URLSearchParams(location.search).get(n);

function kopf(zurueck) {
  return `<div class="uebungsband">ÜBUNGSPORTAL — Nachbau zu Testzwecken. Hier wird nichts echt eingeleitet.</div>
  <header>
    <a href="#" id="abmelden">ABMELDEN</a>
    <span class="uhr" id="uhr">29:33</span>
    <span class="rechts">Übungs-Portal</span>
  </header>
  ${zurueck ? `<div class="zurueckleiste"><a href="${zurueck}">&lsaquo; Zur Startseite</a></div>` : ''}`;
}

function kopfBeleben() {
  const ab = document.getElementById('abmelden');
  if (ab) ab.addEventListener('click', ev => {
    ev.preventDefault();
    localStorage.removeItem('ww.sitzung');
    location.href = 'anmeldung.html';
  });
}
