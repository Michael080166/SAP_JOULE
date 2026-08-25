/*
 * Antragsroboter - Bedienfeld
 *
 * Reine Oberflaeche. Der Zustand liegt im Hintergrund-Dienst; hier wird nur
 * gelesen, dargestellt und angestossen. Das Panel darf jederzeit geschlossen
 * werden, ohne dass ein laufender Durchlauf davon etwas merkt.
 */
'use strict';

let Z = null;              // letzter bekannter Zustand
let neuZeichnenGeplant = false;

const $  = w => document.querySelector(w);
const $$ = w => Array.from(document.querySelectorAll(w));

function frage(typ, rest = {}) {
  return new Promise((aufloesen, ablehnen) => {
    chrome.runtime.sendMessage({ typ, ...rest }, antwort => {
      if (chrome.runtime.lastError) return ablehnen(new Error(chrome.runtime.lastError.message));
      if (antwort && antwort.ok === false && antwort.fehler) return ablehnen(new Error(antwort.fehler));
      aufloesen(antwort);
    });
  });
}

const escape = s => String(s ?? '').replace(/[&<>"']/g,
  z => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z]));

// Platzhalter im Text hervorheben
const mitPlatzhaltern = s =>
  escape(s).replace(/\{\{\s*[\w.\-]+\s*\}\}/g, t => `<span class="platz">${t}</span>`);

const uhrzeit = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleTimeString('de-DE', { hour12: false });
};

async function aktiverTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function tabTauglich(tab) {
  if (!tab || !tab.url) return false;
  return /^https?:/i.test(tab.url);
}

/* ==================================================================== *
 * Zustand holen und zeichnen                                            *
 * ==================================================================== */

async function laden() {
  Z = await frage('zustandLesen');
  zeichnen();
}

function zeichneSpaeter() {
  if (neuZeichnenGeplant) return;
  neuZeichnenGeplant = true;
  setTimeout(async () => { neuZeichnenGeplant = false; await laden(); }, 120);
}

chrome.runtime.onMessage.addListener(n => {
  if (n.typ === 'zustandGeaendert') zeichneSpaeter();
});

function zeichnen() {
  if (!Z) return;
  zeichneKopf();
  zeichneAntraege();
  zeichneVorgang();
  zeichneLauf();
  zeichneProtokoll();
  zeichneOptionen();
}

/* ------------------------------- Kopf ------------------------------- */
function zeichneKopf() {
  const k = $('#zustandKachel');
  const { lauf, aufnahme } = Z;
  if (aufnahme.aktiv)      { k.className = 'kachel aufnahme'; k.textContent = 'nimmt auf'; }
  else if (lauf.pausiert)  { k.className = 'kachel pause';    k.textContent = 'angehalten'; }
  else if (lauf.aktiv)     { k.className = 'kachel laeuft';   k.textContent = 'läuft'; }
  else                     { k.className = 'kachel ruhe';     k.textContent = 'bereit'; }
}

/* ------------------------------ Anträge ----------------------------- */
function zeichneAntraege() {
  const liste = Z.antraege || [];
  const z = $('#antraegeZusammenfassung');
  if (!liste.length) {
    z.className = 'zusammenfassung leer';
    z.textContent = 'Noch keine Anträge geladen.';
  } else {
    const felder = Object.keys(liste[0].felder || {});
    z.className = 'zusammenfassung';
    z.textContent = `${liste.length} Anträge`
      + (felder.length ? ` · Platzhalter: {{antrag}}, ${felder.map(f => `{{${f}}}`).join(', ')}`
                       : ' · Platzhalter: {{antrag}}');
  }

  const koerper = $('#antragsTabelle tbody');
  koerper.textContent = '';
  // Bei sehr langen Listen nur einen Ausschnitt zeichnen - sonst wird das
  // Panel bei tausenden Zeilen zaeh.
  const zeigeMax = 300;
  liste.slice(0, zeigeMax).forEach((a, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td class="nr">${i + 1}</td>` +
      `<td>${escape(a.wert)}</td>` +
      `<td><span class="status ${escape(a.status || 'offen')}">${escape(a.status || 'offen')}</span></td>` +
      `<td class="meldung">${escape(a.meldung || '')}</td>`;
    koerper.appendChild(tr);
  });
  if (liste.length > zeigeMax) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4" class="meldung">… und ${liste.length - zeigeMax} weitere
      (alle sind im CSV-Protokoll enthalten)</td>`;
    koerper.appendChild(tr);
  }
}

/* ------------------------------ Vorgang ----------------------------- */
function zeichneVorgang() {
  const { rezept, aufnahme } = Z;
  $('#aufnahmeStart').disabled = aufnahme.aktiv;
  $('#aufnahmeStopp').disabled = !aufnahme.aktiv;
  $('#aufnahmeStart').textContent = rezept.schritte.length ? 'Neu aufzeichnen' : 'Aufnahme starten';

  if (document.activeElement !== $('#startUrl'))   $('#startUrl').value   = rezept.startUrl || '';
  if (document.activeElement !== $('#erfolgText')) $('#erfolgText').value = rezept.erfolgText || '';
  if (document.activeElement !== $('#fehlerText')) $('#fehlerText').value = rezept.fehlerText || '';
  if (document.activeElement !== $('#sitzungsText')) $('#sitzungsText').value = rezept.sitzungsText || '';
  if (document.activeElement !== $('#stoererTexte')) $('#stoererTexte').value = rezept.stoererTexte || '';
  if (document.activeElement !== $('#beispielwert') && rezept.beispielwert) {
    $('#beispielwert').value = rezept.beispielwert;
  }

  $('#schrittZahl').textContent = rezept.schritte.length;
  if (typeof neuPositionenFuellen === 'function') neuPositionenFuellen();
  const ol = $('#schrittListe');
  ol.textContent = '';

  if (!rezept.schritte.length) {
    ol.innerHTML = '<div class="leerHinweis">Noch nichts aufgezeichnet.<br>' +
      'Starte die Aufnahme und gib einen Antrag von Hand frei.</div>';
    return;
  }

  rezept.schritte.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = (s.endgueltig ? 'endgueltig ' : '') + (s.immer ? 'immer ' : '')
                 + (s.aus ? 'aus' : '');
    li.dataset.index = i;

    const wertbar = ['eingabe', 'auswahl', 'warteText', 'pause'].includes(s.aktion);
    li.innerHTML = `
      <div class="schritteInhalt">
        <div class="schrittKopf">
          <span class="aktionMarke">${escape(s.aktion)}</span>
          <span class="schrittBez">${escape(s.beschriftung || s.tag || '')}</span>
          ${s.navigiert ? '<span class="schrittNav">↻ Seitenwechsel</span>' : ''}
        </div>
        ${wertbar
          ? `<input type="text" class="wertFeld" data-index="${i}"
                    value="${escape(s.wert ?? '')}" spellcheck="false">`
          : (s.wert !== undefined && s.wert !== ''
              ? `<span class="schrittWert">${mitPlatzhaltern(s.wert)}</span>` : '')}
        <div class="schrittWerkzeuge">
          <label title="Nur dieser Schritt löst die Freigabe endgültig aus">
            <input type="checkbox" class="endgueltigFeld" data-index="${i}"
                   ${s.endgueltig ? 'checked' : ''}> endgültig
          </label>
          <label class="immerBez"
            title="Läuft auch dann, wenn der Antrag vorher ausgelassen wurde oder scheiterte — für den Rückweg zur Liste">
            <input type="checkbox" class="immerFeld" data-index="${i}"
                   ${s.immer ? 'checked' : ''}> immer
          </label>
          <button class="neben pruefKnopf" data-index="${i}">im Tab suchen</button>
          <button class="neben ausKnopf" data-index="${i}">${s.aus ? 'einschalten' : 'überspringen'}</button>
          <button class="gefahr wegKnopf" data-index="${i}">löschen</button>
        </div>
      </div>`;
    ol.appendChild(li);
  });
}

/* -------------------------------- Lauf ------------------------------ */
function zeichneLauf() {
  const { lauf, antraege, rezept, optionen } = Z;
  const gesamt = antraege.length;
  const ok     = antraege.filter(a => a.status === 'ok' || a.status === 'probe').length;
  const fehler = antraege.filter(a => a.status === 'fehler').length;
  const offen  = antraege.filter(a => a.status === 'offen').length;
  const unklar = antraege.filter(a => a.status === 'unklar').length;
  const fertig = gesamt - offen;

  // Ungeklaerte Ausgaenge sind die einzige Kategorie, die zwingend einen
  // Menschen braucht - darum stehen sie ueber allem anderen.
  const uw = $('#unklarWarnung');
  uw.classList.toggle('versteckt', unklar === 0);
  if (unklar) {
    uw.textContent = `${unklar} Antrag/Anträge mit ungeklärtem Ausgang: `
      + `die Freigabe wurde ausgelöst, das Portal hat sie aber nicht bestätigt. `
      + `Diese bitte im Portal von Hand nachsehen — der Roboter fasst sie `
      + `nicht wieder an, damit nichts doppelt freigegeben wird. `
      + `Betroffen: ${antraege.filter(a => a.status === 'unklar').map(a => a.wert).join(', ')}`;
  }

  $('#zahlOk').textContent     = ok;
  $('#zahlFehler').textContent = fehler;
  $('#zahlOffen').textContent  = offen;
  $('#fortschrittBalken').style.width = gesamt ? `${(fertig / gesamt) * 100}%` : '0';
  $('#fortschrittText').textContent = `${fertig} von ${gesamt}`;

  const aktuell = $('#aktuellerAntrag');
  const a = antraege[lauf.antragIndex];
  if (lauf.aktiv && a) {
    aktuell.classList.remove('versteckt');
    aktuell.innerHTML = `<b>${escape(a.wert)}</b>` +
      `<small>Schritt ${lauf.schrittIndex + 1} von ${rezept.schritte.length}` +
      (optionen.trockenlauf ? ' · Trockenlauf' : '') + '</small>';
  } else {
    aktuell.classList.add('versteckt');
  }

  const warnung = $('#laufWarnung');
  if (lauf.grund) {
    warnung.classList.remove('versteckt');
    warnung.classList.toggle('schwer', /NOTBREMSE|Notbremse/.test(lauf.grund));
    warnung.textContent = lauf.grund;
  } else {
    warnung.classList.add('versteckt');
  }

  $('#laufStart').disabled     = lauf.aktiv;
  $('#laufPause').disabled     = !lauf.aktiv || lauf.pausiert;
  $('#laufStopp').disabled     = !lauf.aktiv;
  $('#laufFortsetzen').classList.toggle('versteckt', !(lauf.aktiv && lauf.pausiert));
  $('#laufStart').textContent  = optionen.trockenlauf ? 'Trockenlauf starten' : 'Lauf starten';

  const hat = (id, erfuellt, warn) => {
    const el = $(id);
    el.classList.toggle('erfuellt', !!erfuellt);
    el.classList.toggle('warnung2', !!warn && !erfuellt);
    el.querySelector('.haken').textContent = erfuellt ? '✓' : (warn ? '!' : '–');
  };
  const endgueltigDa = rezept.schritte.some(s => s.endgueltig);
  hat('#pruefRezept',     rezept.schritte.length > 0);
  hat('#pruefAntraege',   antraege.length > 0);
  hat('#pruefEndgueltig', endgueltigDa, true);
  hat('#pruefErfolg',     !!(rezept.erfolgText || '').trim(), true);
  hat('#pruefProbe',      antraege.some(x => x.status === 'probe'), true);
}

/* ----------------------------- Protokoll ---------------------------- */
function zeichneProtokoll() {
  const v = $('#verlauf');
  const eintraege = (Z.protokoll || []).slice(-400).reverse();
  if (!eintraege.length) {
    v.innerHTML = '<div class="leerHinweis">Noch kein Verlauf.</div>';
    return;
  }
  v.innerHTML = eintraege.map(e => `
    <div class="verlaufZeile ${escape(e.status || '')}">
      <span class="verlaufZeit">${uhrzeit(e.zeit)}</span>
      <span class="verlaufText">${escape(e.antrag ? e.antrag + ' · ' : '')}${escape(e.ereignis)}${
        e.detail ? ' — ' + escape(e.detail) : ''}</span>
    </div>`).join('');
}

/* ----------------------------- Optionen ----------------------------- */
function zeichneOptionen() {
  const o = Z.optionen;
  if (document.activeElement?.closest('#tab-optionen')) return;   // beim Tippen nicht dazwischenfunken
  $('#optTrockenlauf').checked  = !!o.trockenlauf;
  $('#optEinzel').checked       = !!o.einzelbestaetigung;
  $('#optMaxFehler').value      = o.maxFehlerInFolge;
  $('#optPauseSchritt').value   = o.pauseSchritt;
  $('#optPauseAntrag').value    = o.pauseAntrag;
  $('#optPauseSeite').value     = o.pauseSeite;
  $('#optHang').value           = o.hangZeitlimit;
}

/* ==================================================================== *
 * CSV                                                                   *
 * ==================================================================== */

// Ein CSV-Leser, der Anfuehrungszeichen und eingebettete Trennzeichen versteht.
function csvLesen(text) {
  const roh = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const erste = roh.split('\n')[0] || '';
  // Trennzeichen raten: in Deutschland ueberwiegt das Semikolon
  const trenn = (erste.match(/;/g) || []).length >= (erste.match(/,/g) || []).length ? ';' : ',';

  const zeilen = [];
  let feld = '', zeile = [], inAnf = false;
  for (let i = 0; i < roh.length; i++) {
    const c = roh[i];
    if (inAnf) {
      if (c === '"') {
        if (roh[i + 1] === '"') { feld += '"'; i++; } else inAnf = false;
      } else feld += c;
    } else if (c === '"') inAnf = true;
    else if (c === trenn) { zeile.push(feld); feld = ''; }
    else if (c === '\n')  { zeile.push(feld); zeilen.push(zeile); zeile = []; feld = ''; }
    else feld += c;
  }
  if (feld !== '' || zeile.length) { zeile.push(feld); zeilen.push(zeile); }
  return zeilen.filter(z => z.some(f => f.trim() !== ''));
}

function csvSchreiben(kopf, zeilen) {
  const feld = w => {
    const s = String(w ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM voran, damit Excel die Umlaute richtig liest
  return '﻿' + [kopf, ...zeilen].map(z => z.map(feld).join(';')).join('\r\n');
}

function herunterladen(name, inhalt) {
  const blob = new Blob([inhalt], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename: name, saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
}

const zeitstempel = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

/* ==================================================================== *
 * Bedienung                                                             *
 * ==================================================================== */

/* --- Reiter --- */
$$('.reiterKnopf').forEach(k => k.addEventListener('click', () => {
  $$('.reiterKnopf').forEach(x => x.classList.remove('aktiv'));
  $$('.tafel').forEach(x => x.classList.remove('aktiv'));
  k.classList.add('aktiv');
  $(`#tab-${k.dataset.ziel}`).classList.add('aktiv');
}));

/* --- Anträge übernehmen --- */
function antraegeAusText(text) {
  const zeilen = csvLesen(text);
  if (!zeilen.length) return [];

  const ersteZeile = zeilen[0];
  // Kopfzeile erkennen: mehrspaltig und die erste Spalte heisst nach Antrag
  const hatKopf = ersteZeile.length > 1 &&
    /antrag|nummer|nr\.?|id|vorgang|beleg/i.test(ersteZeile[0] || '');

  if (!hatKopf) {
    return zeilen.map(z => z[0]).map(w => String(w).trim()).filter(Boolean)
      .map(wert => ({ wert, felder: {}, status: 'offen', meldung: '', zeit: '' }));
  }

  const namen = ersteZeile.map(n => String(n).trim().toLowerCase().replace(/[^\w.\-]/g, ''));
  return zeilen.slice(1).map(z => {
    const felder = {};
    namen.forEach((n, i) => { if (n && i > 0) felder[n] = String(z[i] ?? '').trim(); });
    return { wert: String(z[0] ?? '').trim(), felder, status: 'offen', meldung: '', zeit: '' };
  }).filter(a => a.wert);
}

$('#antraegeUebernehmen').addEventListener('click', async () => {
  const liste = antraegeAusText($('#antragsFeld').value);
  if (!liste.length) return alert('In der Eingabe steht keine verwertbare Antragsnummer.');
  const doppelt = liste.length - new Set(liste.map(a => a.wert)).size;
  if (doppelt && !confirm(
      `${doppelt} Antragsnummer(n) kommen mehrfach vor.\n\n` +
      `Sie würden auch mehrfach freigegeben. Trotzdem übernehmen?`)) return;
  await frage('zustandSetzen', { aenderung: { antraege: liste } });
  await laden();
});

/* ------------------------------------------------------------------ *
 * Liste aus dem Portal holen                                          *
 * ------------------------------------------------------------------ *
 * WohnWeb vergibt in seinen Adressen nur GUIDs. Ein Antrag laesst sich
 * darum nicht direkt ansteuern - der Roboter muss ihn in der Uebersicht
 * wiederfinden. Deshalb wird hier nicht nur eine Nummer gemerkt, sondern
 * die Kennung, mit der die Zeile spaeter aufzufinden ist.
 */
let ernte = null;               // { spalten, zeilen }
let ernteGewaehlt = new Set();

$('#ernteHolen').addEventListener('click', async () => {
  const h = $('#ernteHinweis');
  const tab = await aktiverTab();
  if (!tabTauglich(tab)) {
    h.className = 'hinweisZeile schlecht';
    h.textContent = 'Bitte zuerst die Portalseite im Browser öffnen.';
    return;
  }
  h.className = 'hinweisZeile';
  h.textContent = 'wird geholt …';

  let antwort = null;
  try {
    antwort = await chrome.tabs.sendMessage(tab.id, {
      typ: 'tabelleErnten', statusWert: $('#ernteStatus').value.trim() });
  } catch (e) {
    h.className = 'hinweisZeile schlecht';
    h.textContent = 'Die Seite antwortet nicht. Seite neu laden und erneut versuchen.';
    return;
  }
  if (!antwort || antwort.fehler) {
    h.className = 'hinweisZeile schlecht';
    h.textContent = antwort?.fehler || 'Nichts gefunden.';
    $('#ernteBereich').classList.add('versteckt');
    return;
  }

  ernte = antwort;
  ernteGewaehlt = new Set(antwort.zeilen.map((_, i) => i));   // erst einmal alles
  h.className = 'hinweisZeile gut';
  h.textContent = `${antwort.zeilen.length} von ${antwort.gesamt} Zeilen mit Status `
                + `„${$('#ernteStatus').value.trim() || 'beliebig'}" gefunden.`;

  // Kennungsspalte vorschlagen: Aktenzeichen schlaegt alles andere.
  const wahl = $('#ernteKennung');
  wahl.innerHTML = ernte.spalten
    .map((sp, i) => `<option value="${i}">${escape(sp || `Spalte ${i + 1}`)}</option>`).join('');
  const bevorzugt = ernte.spalten.findIndex(sp => /aktenzeichen|nummer|nr\.?$|id$/i.test(sp || ''));
  wahl.value = String(bevorzugt >= 0 ? bevorzugt : 0);

  $('#ernteBereich').classList.remove('versteckt');
  zeichneErnte();
});

function zeichneErnte() {
  if (!ernte) return;
  const kennSpalte = Number($('#ernteKennung').value) || 0;

  // Doppelte Kennungen sind gefaehrlich: der Roboter koennte spaeter die
  // falsche Zeile anklicken. Sie werden darum hervorgehoben.
  const zaehlung = {};
  ernte.zeilen.forEach(z => {
    const k = z.zellen[kennSpalte] || '';
    zaehlung[k] = (zaehlung[k] || 0) + 1;
  });

  $('#ernteListe').innerHTML = ernte.zeilen.map((z, i) => {
    const kennung = z.zellen[kennSpalte] || '';
    const doppelt = kennung && zaehlung[kennung] > 1;
    const rest = z.zellen.filter((_, j) => j !== kennSpalte).filter(Boolean).join(' · ');
    return `<label class="ernteZeile ${doppelt ? 'doppelt' : ''}">
      <input type="checkbox" data-i="${i}" ${ernteGewaehlt.has(i) ? 'checked' : ''}>
      <span>
        <span class="kennung">${escape(kennung || '(leer)')}</span>
        ${doppelt ? ' <b>⚠ mehrfach</b>' : ''}
        <span class="rest">${escape(rest.slice(0, 160))}</span>
      </span></label>`;
  }).join('');

  const dopplungen = Object.values(zaehlung).filter(n => n > 1).length;
  $('#ernteZahl').textContent = `${ernteGewaehlt.size} gewählt`
    + (dopplungen ? ` · ${dopplungen} Kennung(en) mehrfach!` : '');
}

$('#ernteKennung').addEventListener('change', zeichneErnte);
$('#ernteListe').addEventListener('change', ev => {
  const i = Number(ev.target.dataset?.i);
  if (Number.isNaN(i)) return;
  if (ev.target.checked) ernteGewaehlt.add(i); else ernteGewaehlt.delete(i);
  $('#ernteZahl').textContent = `${ernteGewaehlt.size} gewählt`;
});
$('#ernteAlle').addEventListener('click', () => {
  ernteGewaehlt = new Set(ernte?.zeilen.map((_, i) => i) || []); zeichneErnte();
});
$('#ernteKeine').addEventListener('click', () => { ernteGewaehlt.clear(); zeichneErnte(); });

$('#ernteUebernehmen').addEventListener('click', async () => {
  if (!ernte || !ernteGewaehlt.size) return alert('Es ist nichts ausgewählt.');
  const kennSpalte = Number($('#ernteKennung').value) || 0;

  const liste = [...ernteGewaehlt].sort((a, b) => a - b).map(i => {
    const z = ernte.zeilen[i];
    const felder = {};
    ernte.spalten.forEach((sp, j) => {
      const name = (sp || `spalte${j + 1}`).toLowerCase().replace(/[^\w.\-]/g, '');
      if (name && j !== kennSpalte) felder[name] = z.zellen[j] ?? '';
    });
    return { wert: z.zellen[kennSpalte] || '', felder,
             status: 'offen', meldung: '', zeit: '' };
  }).filter(a => a.wert);

  const leer = ernteGewaehlt.size - liste.length;
  const doppelt = liste.length - new Set(liste.map(a => a.wert)).size;
  if (doppelt && !confirm(
      `${doppelt} Kennung(en) kommen mehrfach vor.\n\n` +
      `Der Roboter kann die zugehörigen Zeilen nicht sicher auseinanderhalten und ` +
      `würde sie überspringen. Trotzdem übernehmen?`)) return;

  await frage('zustandSetzen', { aenderung: { antraege: liste } });
  await laden();
  const h = $('#ernteHinweis');
  h.className = 'hinweisZeile gut';
  h.textContent = `${liste.length} Anträge übernommen.`
    + (leer ? ` ${leer} ohne Kennung ausgelassen.` : '');
});

$('#csvWaehlen').addEventListener('click', () => $('#csvDatei').click());
$('#csvDatei').addEventListener('change', async ev => {
  const datei = ev.target.files[0];
  if (!datei) return;
  $('#antragsFeld').value = await datei.text();
  ev.target.value = '';
  $('#antraegeUebernehmen').click();
});

$('#offeneZuruecksetzen').addEventListener('click', async () => {
  const liste = Z.antraege.map(a =>
    a.status === 'fehler' ? { ...a, status: 'offen', meldung: '' } : a);
  await frage('zustandSetzen', { aenderung: { antraege: liste } });
  await laden();
});

$('#listeLeeren').addEventListener('click', async () => {
  if (!confirm('Antragsliste vollständig leeren?')) return;
  await frage('zustandSetzen', { aenderung: { antraege: [] } });
  $('#antragsFeld').value = '';
  await laden();
});

/* --- Aufnahme --- */
$('#aufnahmeStart').addEventListener('click', async () => {
  const tab = await aktiverTab();
  if (!tabTauglich(tab)) {
    return alert('Bitte zuerst im Browser die Portalseite öffnen und dort angemeldet sein.\n\n' +
                 'Der Roboter kann nur auf http- und https-Seiten arbeiten.');
  }
  if (Z.rezept.schritte.length &&
      !confirm('Das vorhandene Rezept wird überschrieben. Fortfahren?')) return;
  await frage('aufnahmeStarten', { tabId: tab.id, url: tab.url, neu: true });
  await laden();
  alert('Aufnahme läuft.\n\nGib jetzt EINEN Antrag ganz normal von Hand frei. ' +
        'Danach hier auf „Aufnahme beenden" klicken.');
});

$('#aufnahmeStopp').addEventListener('click', async () => {
  await frage('aufnahmeBeenden');
  await laden();
  const n = Z.rezept.schritte.length;
  if (n) {
    // Der letzte Klick ist fast immer die eigentliche Freigabe - er wird
    // vorgeschlagen, aber nicht ungefragt gesetzt.
    const letzter = [...Z.rezept.schritte].reverse().find(s => s.aktion === 'klick');
    if (letzter && !Z.rezept.schritte.some(s => s.endgueltig)) {
      if (confirm(`${n} Schritte aufgezeichnet.\n\n` +
          `War „${letzter.beschriftung}" der Klick, der die Freigabe endgültig auslöst?\n\n` +
          `OK = als Schlussschritt markieren (empfohlen).`)) {
        letzter.endgueltig = true;
        await frage('zustandSetzen', { aenderung: { rezept: Z.rezept } });
        await laden();
      }
    }
  }
});

/* --- Platzhalter setzen --- */
$('#platzhalterSetzen').addEventListener('click', async () => {
  const beispiel = $('#beispielwert').value.trim();
  const ergebnis = $('#platzhalterErgebnis');
  if (!beispiel) {
    ergebnis.className = 'hinweisZeile schlecht';
    ergebnis.textContent = 'Bitte die bei der Aufnahme benutzte Antragsnummer eintragen.';
    return;
  }
  const rezept = structuredClone(Z.rezept);
  let treffer = 0;
  const ersetze = s => {
    if (typeof s !== 'string' || !s.includes(beispiel)) return s;
    treffer++;
    return s.split(beispiel).join('{{antrag}}');
  };

  // Die Antragsnummer steckt erfahrungsgemäß an vier Stellen, nicht nur im
  // Eingabewert: in der Startadresse, im eingetippten Text, im Suchtext eines
  // Klickziels („Zeile A-10001 anklicken") und sogar im Selektor selbst
  // (data-testid="verweis-A-10001"). Alle vier müssen ersetzt werden, sonst
  // sucht der Roboter bei jedem Antrag stur nach dem ersten.
  rezept.startUrl = ersetze(rezept.startUrl);
  rezept.schritte.forEach(s => {
    if (typeof s.wert === 'string')         s.wert         = ersetze(s.wert);
    if (typeof s.text === 'string')         s.text         = ersetze(s.text);
    if (typeof s.beschriftung === 'string') s.beschriftung = ersetze(s.beschriftung);
    if (Array.isArray(s.selektoren))        s.selektoren   = s.selektoren.map(ersetze);
  });
  rezept.beispielwert = beispiel;

  await frage('zustandSetzen', { aenderung: { rezept } });
  await laden();

  if (treffer) {
    ergebnis.className = 'hinweisZeile gut';
    ergebnis.textContent = `An ${treffer} Stelle(n) durch {{antrag}} ersetzt — ` +
      `Werte, Suchtexte und Selektoren.`;
  } else {
    ergebnis.className = 'hinweisZeile schlecht';
    ergebnis.textContent = `„${beispiel}" kommt im Rezept nicht vor — Schreibweise prüfen.`;
  }
});

/* --- Rezeptfelder --- */
function rezeptFeldBinden(wahl, schluessel) {
  $(wahl).addEventListener('change', async () => {
    const rezept = { ...Z.rezept, [schluessel]: $(wahl).value };
    await frage('zustandSetzen', { aenderung: { rezept } });
    Z.rezept = rezept;
  });
}
rezeptFeldBinden('#startUrl',   'startUrl');
rezeptFeldBinden('#erfolgText', 'erfolgText');
rezeptFeldBinden('#fehlerText', 'fehlerText');
rezeptFeldBinden('#sitzungsText', 'sitzungsText');
rezeptFeldBinden('#stoererTexte', 'stoererTexte');

/* --- Schrittliste: alle Bedienelemente über einen Zuhörer --- */
$('#schrittListe').addEventListener('click', async ev => {
  const knopf = ev.target.closest('button');
  if (!knopf) return;
  const i = Number(knopf.dataset.index);
  const rezept = structuredClone(Z.rezept);

  if (knopf.classList.contains('wegKnopf')) {
    rezept.schritte.splice(i, 1);
  } else if (knopf.classList.contains('ausKnopf')) {
    rezept.schritte[i].aus = !rezept.schritte[i].aus;
  } else if (knopf.classList.contains('pruefKnopf')) {
    const tab = await aktiverTab();
    if (!tabTauglich(tab)) return alert('Bitte zuerst die Portalseite im Browser öffnen.');
    let antwort = null;
    try {
      antwort = await chrome.tabs.sendMessage(tab.id, {
        typ: 'selektorTesten', schritt: rezept.schritte[i] });
    } catch (e) { /* Inhalts-Skript noch nicht geladen */ }
    alert(antwort?.gefunden
      ? `Gefunden und orange umrandet.\n\nErkannt über: ${antwort.via}`
      : 'Auf dieser Seite nicht gefunden.\n\n' +
        'Das ist in Ordnung, wenn der Schritt zu einer anderen Seite des ' +
        'Vorgangs gehört. Steht die Seite richtig, ist der Schritt unsicher.');
    return;
  } else return;

  await frage('zustandSetzen', { aenderung: { rezept } });
  await laden();
});

$('#schrittListe').addEventListener('change', async ev => {
  const feld = ev.target;
  const i = Number(feld.dataset.index);
  if (Number.isNaN(i)) return;
  const rezept = structuredClone(Z.rezept);
  if (feld.classList.contains('endgueltigFeld')) rezept.schritte[i].endgueltig = feld.checked;
  else if (feld.classList.contains('immerFeld'))  rezept.schritte[i].immer = feld.checked;
  else if (feld.classList.contains('wertFeld'))  rezept.schritte[i].wert = feld.value;
  else return;
  await frage('zustandSetzen', { aenderung: { rezept } });
  Z.rezept = rezept;
  if (feld.classList.contains('endgueltigFeld') || feld.classList.contains('immerFeld')) await laden();
});

/* ------------------------------------------------------------------ *
 * Schritt von Hand ergaenzen                                          *
 * ------------------------------------------------------------------ *
 * Die Aufnahme sieht nur Klicks und Eingaben. Vorbedingungen ("ist das
 * Feld gruen?") und der Rueckweg zur Liste lassen sich damit nicht
 * mitschneiden - sie werden hier ergaenzt.
 */
let neuesElement = null;      // im Tab angeklicktes Element

// Welche Aktion braucht welche Felder?
const AKTIONSBEDARF = {
  vorbedingung: { ziel: true,  wert: false },
  zurueck:      { ziel: false, wert: false },
  zeileKlicken: { ziel: false, wert: true,  wertBez: 'Kennung der Zeile',
                  wertVorgabe: '{{antrag}}' },
  warteText:    { ziel: false, wert: true,  wertBez: 'Text, auf den gewartet wird' },
  warteElement: { ziel: true,  wert: false },
  klick:        { ziel: true,  wert: false },
  eingabe:      { ziel: true,  wert: true,  wertBez: 'Einzutragender Text' },
  auswahl:      { ziel: true,  wert: true,  wertBez: 'Auszuwählender Wert' },
  haken:        { ziel: true,  wert: true,  wertBez: 'true (setzen) oder false (leeren)',
                  wertVorgabe: 'true' },
  taste:        { ziel: true,  wert: true,  wertBez: 'Taste', wertVorgabe: 'Enter' },
  pause:        { ziel: false, wert: true,  wertBez: 'Millisekunden', wertVorgabe: '1000' }
};

function neuFormularAnpassen() {
  const aktion = $('#neuAktion').value;
  const bedarf = AKTIONSBEDARF[aktion] || { ziel: true, wert: true };
  $('#neuZielBereich').classList.toggle('versteckt', !bedarf.ziel);
  $('#neuWertBereich').classList.toggle('versteckt', !bedarf.wert);
  if (bedarf.wert) {
    $('#neuWertBez').textContent = bedarf.wertBez || 'Wert';
    if (!$('#neuWert').value && bedarf.wertVorgabe) $('#neuWert').value = bedarf.wertVorgabe;
  }
  // Der Rueckweg ist fast immer ein Seitenwechsel und muss immer laufen.
  if (aktion === 'zurueck') {
    $('#neuImmer').checked = true;
    $('#neuNavigiert').checked = true;
    if (!$('#neuBeschriftung').value) $('#neuBeschriftung').value = 'zurück zur Übersicht';
  }
  if (aktion === 'zeileKlicken') {
    $('#neuNavigiert').checked = true;
    if (!$('#neuBeschriftung').value) $('#neuBeschriftung').value = 'Zeile {{antrag}}';
  }
}
$('#neuAktion').addEventListener('change', neuFormularAnpassen);

function neuPositionenFuellen() {
  const n = Z?.rezept?.schritte?.length || 0;
  const wahl = $('#neuPosition');
  const alt = wahl.value;
  wahl.innerHTML = `<option value="${n}">am Ende (als Schritt ${n + 1})</option>`
    + Array.from({ length: n }, (_, i) =>
        `<option value="${i}">vor Schritt ${i + 1}: ${escape(
          (Z.rezept.schritte[i].beschriftung || Z.rezept.schritte[i].aktion).slice(0, 30))}</option>`
      ).join('');
  if (alt && wahl.querySelector(`option[value="${alt}"]`)) wahl.value = alt;
}

$('#neuElementWaehlen').addEventListener('click', async () => {
  const tab = await aktiverTab();
  if (!tabTauglich(tab)) return alert('Bitte zuerst die Portalseite im Browser öffnen.');
  const info = $('#neuElementInfo');
  info.className = 'hinweisZeile';
  info.textContent = 'Klicke jetzt im Portal auf das Element (Esc bricht ab) …';
  try { await chrome.tabs.sendMessage(tab.id, { typ: 'elementWaehlen' }); }
  catch (e) {
    info.className = 'hinweisZeile schlecht';
    info.textContent = 'Die Seite antwortet nicht. Seite neu laden und erneut versuchen.';
  }
});

// Antwort kommt ueber den Hintergrund zurueck
chrome.runtime.onMessage.addListener(n => {
  if (n.typ !== 'elementBereit') return;
  const info = $('#neuElementInfo');
  if (!n.element) {
    neuesElement = null;
    info.className = 'hinweisZeile';
    info.textContent = 'Auswahl abgebrochen.';
    return;
  }
  neuesElement = n.element;
  info.className = 'hinweisZeile gut';
  // Bei Vorbedingungen ist der erkannte Zustand die wichtigste Rueckmeldung:
  // daran sieht man sofort, ob die Erkennung an dieser Stelle ueberhaupt greift.
  const zustandText = { ok: 'wird als ERFÜLLT erkannt',
                        nein: 'wird als NICHT erfüllt erkannt',
                        unbekannt: 'Zustand NICHT erkennbar — dieser Punkt taugt nicht als Vorbedingung' }[n.element.zustand];
  info.innerHTML = `„${escape(n.element.beschriftung)}" übernommen`
    + `<br><small>${escape(zustandText)} (${escape(n.element.grund)})</small>`;
  if (!$('#neuBeschriftung').value) $('#neuBeschriftung').value = n.element.beschriftung;
});

$('#neuHinzufuegen').addEventListener('click', async () => {
  const aktion = $('#neuAktion').value;
  const bedarf = AKTIONSBEDARF[aktion] || { ziel: true, wert: true };
  const h = $('#neuHinweis');

  if (bedarf.ziel && !neuesElement) {
    h.className = 'hinweisZeile schlecht';
    h.textContent = 'Bitte zuerst das Element im Tab anklicken.';
    return;
  }
  const wert = bedarf.wert ? $('#neuWert').value : '';
  if (bedarf.wert && !String(wert).trim()) {
    h.className = 'hinweisZeile schlecht';
    h.textContent = 'Bitte einen Wert eintragen.';
    return;
  }

  const schritt = {
    aktion, wert,
    selektoren: bedarf.ziel ? neuesElement.selektoren : [],
    text: bedarf.ziel ? (neuesElement.text || '') : '',
    beschriftung: $('#neuBeschriftung').value.trim() || aktion,
    tag: '', typ: '',
    endgueltig: false,
    immer: $('#neuImmer').checked,
    navigiert: $('#neuNavigiert').checked
  };

  const rezept = structuredClone(Z.rezept);
  const pos = Number($('#neuPosition').value);
  rezept.schritte.splice(Number.isNaN(pos) ? rezept.schritte.length : pos, 0, schritt);
  await frage('zustandSetzen', { aenderung: { rezept } });
  await laden();

  h.className = 'hinweisZeile gut';
  h.textContent = `„${schritt.beschriftung}" eingefügt.`;
  neuesElement = null;
  $('#neuElementInfo').textContent = '';
  $('#neuWert').value = '';
  $('#neuBeschriftung').value = '';
});

/* --- Rezept sichern und laden --- */
$('#rezeptSichern').addEventListener('click', () => {
  const inhalt = JSON.stringify(Z.rezept, null, 2);
  const url = URL.createObjectURL(new Blob([inhalt], { type: 'application/json' }));
  chrome.downloads.download({
    url, filename: `antragsroboter-rezept-${zeitstempel()}.json`, saveAs: true
  }, () => setTimeout(() => URL.revokeObjectURL(url), 60000));
});

$('#rezeptLadenKnopf').addEventListener('click', () => $('#rezeptDatei').click());
$('#rezeptDatei').addEventListener('change', async ev => {
  const datei = ev.target.files[0];
  ev.target.value = '';
  if (!datei) return;
  try {
    const rezept = JSON.parse(await datei.text());
    if (!Array.isArray(rezept.schritte)) throw new Error('Keine Schrittliste enthalten');
    await frage('zustandSetzen', { aenderung: { rezept } });
    await laden();
    alert(`Rezept geladen: ${rezept.schritte.length} Schritte.`);
  } catch (fehler) {
    alert(`Datei nicht lesbar: ${fehler.message}`);
  }
});

$('#rezeptLeeren').addEventListener('click', async () => {
  if (!confirm('Aufgezeichneten Vorgang verwerfen?')) return;
  await frage('zustandSetzen', {
    aenderung: { rezept: { name: 'Unbenanntes Rezept', startUrl: '', schritte: [],
                           erfolgText: '', fehlerText: '', beispielwert: '', erstellt: '' } } });
  await laden();
});

/* --- Lauf steuern --- */
async function starten(nurOffene) {
  const tab = await aktiverTab();
  if (!tabTauglich(tab)) {
    return alert('Bitte zuerst die Portalseite im Browser öffnen und dort angemeldet sein.');
  }
  const offene = Z.antraege.filter(a => a.status === 'offen').length;
  if (!offene) return alert('Es sind keine offenen Anträge in der Liste.');

  if (!Z.optionen.trockenlauf) {
    const endgueltigDa = Z.rezept.schritte.some(s => s.endgueltig);
    const hinweise = [];
    if (!endgueltigDa) hinweise.push(
      '• Kein Schritt ist als „endgültig" markiert. Trockenlauf und ' +
      'Einzelbestätigung greifen dann nicht.');
    if (!(Z.rezept.erfolgText || '').trim()) hinweise.push(
      '• Kein Erfolgstext gesetzt. Der Roboter kann eine gescheiterte ' +
      'Freigabe nicht von einer gelungenen unterscheiden.');
    if (!Z.antraege.some(a => a.status === 'probe')) hinweise.push(
      '• Es gab noch keinen Trockenlauf.');

    const frageText =
      `${offene} Anträge werden jetzt ECHT freigegeben.\n\n` +
      (hinweise.length ? hinweise.join('\n') + '\n\n' : '') +
      `Fortfahren?`;
    if (!confirm(frageText)) return;
  }

  try {
    await frage('laufStarten', { tabId: tab.id, nurOffene });
  } catch (fehler) {
    alert(fehler.message);
  }
  await laden();
}

$('#laufStart').addEventListener('click',    () => starten(false));
$('#laufNurOffene').addEventListener('click', () => starten(true));
$('#laufPause').addEventListener('click', async () => { await frage('laufPause'); await laden(); });
$('#laufStopp').addEventListener('click', async () => {
  if (!confirm('Durchlauf abbrechen? Bereits erledigte Anträge bleiben erledigt.')) return;
  await frage('laufStopp'); await laden();
});
$('#laufFortsetzen').addEventListener('click', async () => {
  const tab = await aktiverTab();
  await frage('laufFortsetzen', { tabId: tabTauglich(tab) ? tab.id : null });
  await laden();
});

/* --- Protokoll ausgeben --- */
$('#csvAntraege').addEventListener('click', () => {
  const felder = Object.keys(Z.antraege[0]?.felder || {});
  const kopf = ['Nr', 'Antrag', ...felder, 'Status', 'Meldung', 'Begonnen', 'Abgeschlossen', 'Dauer_s'];
  const zeilen = Z.antraege.map((a, i) => [
    i + 1, a.wert, ...felder.map(f => a.felder?.[f] ?? ''),
    a.status || 'offen', a.meldung || '', a.begonnen || '', a.zeit || '', a.dauer ?? ''
  ]);
  herunterladen(`antragsprotokoll-${zeitstempel()}.csv`, csvSchreiben(kopf, zeilen));
});

$('#csvVerlauf').addEventListener('click', () => {
  const kopf = ['Zeit', 'Antrag', 'Ereignis', 'Status', 'Detail'];
  const zeilen = (Z.protokoll || []).map(e =>
    [e.zeit, e.antrag || '', e.ereignis, e.status || '', e.detail || '']);
  herunterladen(`schrittverlauf-${zeitstempel()}.csv`, csvSchreiben(kopf, zeilen));
});

$('#protokollLeeren').addEventListener('click', async () => {
  if (!confirm('Schritt-Verlauf leeren? Das Antragsprotokoll bleibt erhalten.')) return;
  await frage('zustandSetzen', { aenderung: { protokoll: [] } });
  await laden();
});

/* --- Optionen --- */
$('#optionenSichern').addEventListener('click', async () => {
  const optionen = {
    trockenlauf:       $('#optTrockenlauf').checked,
    einzelbestaetigung:$('#optEinzel').checked,
    maxFehlerInFolge:  Math.max(1, Number($('#optMaxFehler').value) || 3),
    pauseSchritt:      Math.max(0, Number($('#optPauseSchritt').value) || 0),
    pauseAntrag:       Math.max(0, Number($('#optPauseAntrag').value) || 0),
    pauseSeite:        Math.max(0, Number($('#optPauseSeite').value) || 0),
    hangZeitlimit:     Math.max(10000, Number($('#optHang').value) || 90000)
  };
  await frage('zustandSetzen', { aenderung: { optionen } });
  await laden();
  const h = $('#optionenHinweis');
  h.className = 'hinweisZeile gut';
  h.textContent = 'Gespeichert.';
  setTimeout(() => { h.textContent = ''; h.className = 'hinweisZeile'; }, 2500);
});

// Trockenlauf wirkt sofort - er entscheidet ueber die Beschriftung des Startknopfes
$('#optTrockenlauf').addEventListener('change', async () => {
  const optionen = { ...Z.optionen, trockenlauf: $('#optTrockenlauf').checked };
  await frage('zustandSetzen', { aenderung: { optionen } });
  await laden();
});

/* --- Start --- */
neuFormularAnpassen();
laden();
// Sicherheitsnetz: waehrend eines Laufs regelmaessig nachsehen, falls eine
// Benachrichtigung verloren geht (der Dienst darf zwischendurch schlafen).
setInterval(() => { if (Z?.lauf?.aktiv) laden(); }, 2000);
