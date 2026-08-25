/*
 * Sammelläufer: startet das Übungsportal, fährt alle Prüfungen, räumt auf.
 *
 * Damit läuft die Prüfung mit einem einzigen Befehl - lokal wie in der CI,
 * ohne dass jemand vorher von Hand einen Server starten muss.
 */
import { spawn } from 'child_process';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';
import { fileURLToPath } from 'url';

const HIER    = fileURLToPath(new URL('.', import.meta.url));
const PORTAL  = join(HIER, '..', 'uebungsportal');
const PORT    = Number(process.env.PORT || 8899);

const PRUEFUNGEN = [
  ['01-grundlagen.mjs',     'Grundlagen: Aufnahme, Platzhalter, Trockenlauf, Notbremse'],
  ['02-sitzungsende.mjs',   'Sitzungsende mitten im Stapel'],
  ['03-wohnweb-ablauf.mjs', 'WohnWeb-Ablauf mit Vorbedingungen']
];

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.csv':  'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

/* ---------------------------------------------------------------- Server --
 * Bewusst ein eigener Miniserver statt http-server: eine Abhängigkeit
 * weniger, und der Start ist verlässlich abgeschlossen, bevor die erste
 * Prüfung losläuft.
 */
const server = createServer(async (anfrage, antwort) => {
  try {
    const pfad = decodeURIComponent(new URL(anfrage.url, 'http://x').pathname);
    // Ausbrüche aus dem Portalordner unterbinden
    const ziel = join(PORTAL, normalize(pfad).replace(/^(\.\.[/\\])+/, ''));
    if (!ziel.startsWith(PORTAL)) { antwort.writeHead(403).end('verboten'); return; }

    const datei = pfad.endsWith('/') ? join(ziel, 'index.html') : ziel;
    const inhalt = await readFile(datei);
    antwort.writeHead(200, { 'Content-Type': TYPEN[extname(datei)] || 'application/octet-stream' });
    antwort.end(inhalt);
  } catch (f) {
    antwort.writeHead(404).end('nicht gefunden');
  }
});

await new Promise((fertig, schief) => {
  server.once('error', schief);
  server.listen(PORT, '127.0.0.1', fertig);
});
console.log(`Übungsportal läuft auf http://127.0.0.1:${PORT}\n`);

/* -------------------------------------------------------------- Prüfungen */
function fahre(datei) {
  return new Promise(fertig => {
    const kind = spawn(process.execPath, [join(HIER, datei)], {
      stdio: 'inherit',
      env: { ...process.env, PORT: String(PORT) }
    });
    kind.on('close', code => fertig(code ?? 1));
  });
}

// Auswahl per Argument: "node alle.mjs 03" faehrt nur die dritte Pruefung,
// "node alle.mjs 03 03 03" wiederholt sie dreimal. Nuetzlich beim Nachgehen
// sprunghafter Fehler - einmal gruen beweist bei denen naemlich nichts.
const wahl = process.argv.slice(2);
const laufplan = wahl.length
  ? wahl.map(w => PRUEFUNGEN.find(([d]) => d.startsWith(w)) ||
                  (() => { throw new Error(`Unbekannte Prüfung: ${w}`); })())
  : PRUEFUNGEN;

const ergebnisse = [];
for (const [datei, was] of laufplan) {
  console.log('\n' + '#'.repeat(70));
  console.log(`#  ${was}`);
  console.log('#'.repeat(70) + '\n');
  const code = await fahre(datei);
  ergebnisse.push({ datei, was, code });
}

server.close();

console.log('\n' + '='.repeat(70));
for (const e of ergebnisse) {
  console.log(`${e.code === 0 ? '  BESTANDEN  ' : '  GESCHEITERT'}  ${e.was}`);
}
const schlecht = ergebnisse.filter(e => e.code !== 0).length;
console.log('='.repeat(70));
console.log(schlecht === 0
  ? `Alle ${ergebnisse.length} Durchläufe bestanden.`
  : `${schlecht} von ${ergebnisse.length} Prüfungen gescheitert.`);
process.exit(schlecht === 0 ? 0 : 1);
