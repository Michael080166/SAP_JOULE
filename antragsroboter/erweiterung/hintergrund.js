/*
 * Antragsroboter - Hintergrund-Dienst
 *
 * Haelt den kompletten Ablaufzustand. Das ist Absicht: der Inhalts-Skript in
 * der Seite wird bei jedem Seitenwechsel zerstoert, dieser Dienst nicht. Nur
 * dadurch kann ein Durchlauf ueber hunderte Antraege und ebenso viele
 * Seitenwechsel hinweg zusammenhaengen.
 *
 * Zweite Besonderheit: in Manifest V3 darf auch dieser Dienst jederzeit
 * beendet werden. Darum liegt die Wahrheit ausschliesslich in
 * chrome.storage.local - der Speicher hier ist nur ein Zwischenpuffer.
 */

const STANDARD = {
  rezept: {
    name: 'Unbenanntes Rezept',
    startUrl: '',
    schritte: [],
    erfolgText: '',
    fehlerText: '',
    // Text, an dem die abgelaufene Sitzung erkannt wird - typischerweise die
    // Ueberschrift der Anmeldemaske.
    sitzungsText: 'Anmeldung WohnWeb\nBitte melden Sie sich an',
    beispielwert: '',
    erstellt: ''
  },
  antraege: [],
  lauf: {
    aktiv: false,
    pausiert: false,
    tabId: null,
    antragIndex: -1,
    schrittIndex: 0,
    schrittLaufend: null,
    // Ergebnis eines Antrags, das feststeht, waehrend der Rueckweg zur Liste
    // noch laeuft. Muss hier liegen und nicht in der Seite: der Rueckweg ist
    // ein Seitenwechsel, und der zerstoert das Skript in der Seite.
    vorgemerkt: null,
    fehlerInFolge: 0,
    letzteAktivitaet: 0,
    grund: '',
    begonnen: ''
  },
  aufnahme: { aktiv: false, tabId: null, letzteUrl: '' },
  optionen: {
    trockenlauf: false,
    einzelbestaetigung: true,
    maxFehlerInFolge: 3,
    pauseSchritt: 250,
    pauseAntrag: 800,
    pauseSeite: 400,
    hangZeitlimit: 90000
  },
  protokoll: []
};

const PROTOKOLL_MAX = 5000;      // feines Schritt-Protokoll rollt durch
let puffer = null;               // Zwischenpuffer des Zustands
let gewaehltesElement = null;    // zuletzt im Tab angeklicktes Element
let kette  = Promise.resolve();  // serialisiert alle Aenderungen

async function lies() {
  if (!puffer) {
    const gespeichert = await chrome.storage.local.get(Object.keys(STANDARD));
    puffer = {};
    for (const k of Object.keys(STANDARD)) {
      puffer[k] = gespeichert[k] !== undefined ? gespeichert[k] : structuredClone(STANDARD[k]);
    }
    // Neue Optionen aus spaeteren Versionen ergaenzen
    puffer.optionen = { ...STANDARD.optionen, ...puffer.optionen };
  }
  return puffer;
}

// Alle Zustandsaenderungen laufen hier durch - nacheinander, nie parallel.
// Der Aufrufer bekommt Fehler zu sehen, die Warteschlange bleibt trotzdem heil.
function aendere(arbeit) {
  const lauf = kette.then(async () => {
    const z = await lies();
    const ergebnis = await arbeit(z);
    await chrome.storage.local.set(z);
    panelUnterrichten();
    return ergebnis;
  });
  kette = lauf.catch(fehler => {
    console.error('[Antragsroboter] Zustandsfehler:', fehler);
  });
  return lauf;
}

function panelUnterrichten() {
  chrome.runtime.sendMessage({ typ: 'zustandGeaendert' }).catch(() => { /* Panel zu */ });
}

function jetzt() { return new Date().toISOString(); }

function notiere(z, eintrag) {
  z.protokoll.push({ zeit: jetzt(), ...eintrag });
  if (z.protokoll.length > PROTOKOLL_MAX) {
    z.protokoll.splice(0, z.protokoll.length - PROTOKOLL_MAX);
  }
}

/* -------------------------------------------------------------------- *
 * Platzhalter                                                           *
 * -------------------------------------------------------------------- */

function werteFuer(antrag) {
  const werte = { antrag: antrag.wert };
  for (const [k, v] of Object.entries(antrag.felder || {})) werte[k.toLowerCase()] = v;
  return werte;
}

function fuelle(vorlage, werte) {
  if (typeof vorlage !== 'string') return vorlage;
  return vorlage.replace(/\{\{\s*([\w.\-]+)\s*\}\}/g, (t, s) => {
    const k = s.toLowerCase();
    return k in werte ? werte[k] : t;
  });
}

/* -------------------------------------------------------------------- *
 * Auftrag fuer die Seite zusammenstellen                                *
 * -------------------------------------------------------------------- */

function auftragBauen(z, startAb) {
  const antrag = z.antraege[z.lauf.antragIndex];
  if (!antrag) return null;
  return {
    rezept: z.rezept,
    antrag: antrag.wert,
    werte: werteFuer(antrag),
    optionen: z.optionen,
    vorgemerkt: z.lauf.vorgemerkt || null,
    startAb
  };
}

async function anSeite(tabId, nachricht) {
  try {
    return await chrome.tabs.sendMessage(tabId, nachricht);
  } catch (e) {
    return null;      // Seite laedt gerade neu - das ist normal
  }
}

/* -------------------------------------------------------------------- *
 * Ablaufsteuerung                                                       *
 * -------------------------------------------------------------------- */

async function laufStarten(tabId, nurOffene) {
  const z0 = await lies();
  if (!z0.rezept.schritte.length) throw new Error('Es ist noch kein Vorgang aufgezeichnet.');
  if (!z0.antraege.length)        throw new Error('Die Antragsliste ist leer.');
  if (!tabId)                     throw new Error('Kein Arbeits-Tab gewaehlt.');

  await aendere(async z => {
    if (!nurOffene) {
      for (const a of z.antraege) { a.status = 'offen'; a.meldung = ''; a.zeit = ''; }
    }
    z.lauf = {
      aktiv: true, pausiert: false, tabId,
      antragIndex: -1, schrittIndex: 0, schrittLaufend: null, vorgemerkt: null,
      fehlerInFolge: 0, letzteAktivitaet: Date.now(), grund: '',
      begonnen: jetzt()
    };
    notiere(z, {
      antrag: '', ereignis: 'Lauf gestartet', status: 'info',
      detail: `${z.antraege.filter(a => a.status === 'offen').length} offene Antraege` +
              (z.optionen.trockenlauf ? ' - TROCKENLAUF, keine echte Freigabe' : '')
    });
  });
  wachhundStellen();
  await naechsterAntrag();
}

async function naechsterAntrag() {
  const weiter = await aendere(async z => {
    if (!z.lauf.aktiv || z.lauf.pausiert) return null;

    // Normalerweise geht es beim naechsten Antrag weiter. Wurde der Lauf aber
    // angehalten - etwa wegen abgelaufener Sitzung -, ist der aktuelle Antrag
    // auf 'offen' zurueckgesetzt worden und muss noch drankommen. Wer hier
    // stur hochzaehlt, ueberspringt ihn stillschweigend.
    let i = z.lauf.antragIndex;
    if (i < 0 || z.antraege[i]?.status !== 'offen') i = z.lauf.antragIndex + 1;
    while (i < z.antraege.length && z.antraege[i].status !== 'offen') i++;

    if (i >= z.antraege.length) {
      const ok      = z.antraege.filter(a => a.status === 'ok').length;
      const fehler  = z.antraege.filter(a => a.status === 'fehler').length;
      const ueber   = z.antraege.filter(a => a.status === 'uebersprungen').length;
      const unklar  = z.antraege.filter(a => a.status === 'unklar').length;
      z.lauf.aktiv = false;
      z.lauf.grund = `Fertig: ${ok} erledigt, ${fehler} fehlerhaft, ${ueber} uebersprungen`
                   + (unklar ? ` — ${unklar} UNGEKLAERT, bitte im Portal nachsehen` : '');
      notiere(z, { antrag: '', ereignis: 'Lauf beendet', status: 'info', detail: z.lauf.grund });
      return null;
    }

    z.lauf.antragIndex   = i;
    z.lauf.schrittIndex  = 0;
    z.lauf.schrittLaufend = null;
    z.lauf.vorgemerkt    = null;
    z.lauf.letzteAktivitaet = Date.now();
    const antrag = z.antraege[i];
    antrag.status  = 'laeuft';
    antrag.begonnen = jetzt();
    notiere(z, { antrag: antrag.wert, ereignis: 'Antrag begonnen', status: 'info',
                 detail: `${i + 1} von ${z.antraege.length}` });

    return {
      tabId: z.lauf.tabId,
      startUrl: z.rezept.startUrl ? fuelle(z.rezept.startUrl, werteFuer(antrag)) : '',
      pause: Number(z.optionen.pauseAntrag) || 0
    };
  });

  if (!weiter) return;
  if (weiter.pause) await new Promise(r => setTimeout(r, weiter.pause));

  if (weiter.startUrl) {
    // Startseite ansteuern. Ist es dieselbe URL, wuerde tabs.update nicht neu
    // laden - dann muss ausdruecklich neu geladen werden, sonst meldet sich
    // die Seite nie und der Lauf bliebe stehen.
    try {
      const tab = await chrome.tabs.get(weiter.tabId);
      if (tab.url === weiter.startUrl) await chrome.tabs.reload(weiter.tabId);
      else await chrome.tabs.update(weiter.tabId, { url: weiter.startUrl });
    } catch (e) {
      await laufAnhalten(`Tab nicht mehr erreichbar: ${e.message}`);
    }
    // Weiter geht es, sobald sich die neue Seite mit 'seiteBereit' meldet.
  } else {
    // Kein fester Einstieg - die Seite spielt sofort von vorn.
    const z = await lies();
    const auftrag = auftragBauen(z, 0);
    const antwort = await anSeite(weiter.tabId, { typ: 'spielen', auftrag });
    if (!antwort) await schrittFehlerVerarbeiten('Seite antwortet nicht - laeuft der Roboter im richtigen Tab?');
  }
}

async function laufAnhalten(grund) {
  const tabId = await aendere(async z => {
    z.lauf.pausiert = true;
    z.lauf.grund = grund;
    const a = z.antraege[z.lauf.antragIndex];
    if (a && a.status === 'laeuft') a.status = 'offen';
    notiere(z, { antrag: a?.wert || '', ereignis: 'Angehalten', status: 'warnung', detail: grund });
    return z.lauf.tabId;
  });
  if (tabId) await anSeite(tabId, { typ: 'anhalten', grund });
}

async function laufBeenden(grund) {
  const tabId = await aendere(async z => {
    z.lauf.aktiv = false;
    z.lauf.pausiert = false;
    z.lauf.grund = grund;
    const a = z.antraege[z.lauf.antragIndex];
    if (a && a.status === 'laeuft') a.status = 'offen';
    notiere(z, { antrag: '', ereignis: 'Gestoppt', status: 'warnung', detail: grund });
    return z.lauf.tabId;
  });
  if (tabId) { await anSeite(tabId, { typ: 'anhalten', grund }); await anSeite(tabId, { typ: 'statusWeg' }); }
  chrome.alarms.clear('wachhund');
}

// Ergebnis eines Antrags verbuchen und entscheiden, ob es weitergeht.
async function antragAbschliessen(ergebnis) {
  const notbremse = await aendere(async z => {
    const a = z.antraege[z.lauf.antragIndex];
    if (!a) return false;
    z.lauf.letzteAktivitaet = Date.now();
    z.lauf.vorgemerkt = null;
    a.zeit    = jetzt();
    a.meldung = ergebnis.meldung || '';
    a.dauer   = a.begonnen ? Math.round((Date.parse(a.zeit) - Date.parse(a.begonnen)) / 1000) : null;

    if (ergebnis.ok === true) {
      a.status = z.optionen.trockenlauf ? 'probe' : 'ok';
      z.lauf.fehlerInFolge = 0;
      notiere(z, { antrag: a.wert, ereignis: 'Erledigt', status: 'ok', detail: a.meldung });
      return false;
    }
    if (ergebnis.ok === null) {
      a.status = 'uebersprungen';
      z.lauf.fehlerInFolge = 0;
      notiere(z, { antrag: a.wert, ereignis: 'Uebersprungen', status: 'warnung', detail: a.meldung });
      return false;
    }
    // Ungeklaerter Ausgang: die Freigabe ist raus, die Bestaetigung fehlt.
    // Kommt das mehrfach hintereinander vor, stimmt etwas Grundsaetzliches
    // nicht - meist ein falsch gesetzter Erfolgstext. Diese Faelle zaehlen
    // darum auf die Notbremse ein: lieber drei ungeklaerte Antraege
    // nachpruefen als fuenfhundert.
    if (ergebnis.unklar) {
      a.status = 'unklar';
      z.lauf.fehlerInFolge += 1;
      notiere(z, { antrag: a.wert, ereignis: 'Ausgang unklar', status: 'fehler', detail: a.meldung });
    } else {
      a.status = 'fehler';
      z.lauf.fehlerInFolge += 1;
      notiere(z, { antrag: a.wert, ereignis: 'Fehler', status: 'fehler', detail: a.meldung });
    }

    const grenze = Number(z.optionen.maxFehlerInFolge) || 3;
    if (z.lauf.fehlerInFolge >= grenze) {
      z.lauf.pausiert = true;
      z.lauf.grund = `Notbremse: ${z.lauf.fehlerInFolge} Fehler nacheinander. ` +
                     `Letzter: ${a.meldung}`;
      notiere(z, { antrag: a.wert, ereignis: 'NOTBREMSE', status: 'fehler', detail: z.lauf.grund });
      return true;
    }
    return false;
  });

  if (notbremse) {
    const z = await lies();
    if (z.lauf.tabId) await anSeite(z.lauf.tabId, { typ: 'anhalten', grund: z.lauf.grund });
    return;
  }
  await naechsterAntrag();
}

async function schrittFehlerVerarbeiten(meldung) {
  await antragAbschliessen({ ok: false, meldung });
}

/* -------------------------------------------------------------------- *
 * Wachhund - erkennt haengende Durchlaeufe                              *
 * -------------------------------------------------------------------- *
 * Wenn eine Seite gar nicht mehr antwortet (Portal haengt, Tab manuell
 * geschlossen, Sitzung abgelaufen), wuerde der Lauf sonst stumm stehen
 * bleiben. Der Wachhund bricht den Antrag ab und macht weiter.
 */
function wachhundStellen() {
  chrome.alarms.create('wachhund', { periodInMinutes: 0.5 });
}

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== 'wachhund') return;
  const z = await lies();
  if (!z.lauf.aktiv || z.lauf.pausiert) return;
  const still = Date.now() - (z.lauf.letzteAktivitaet || 0);
  if (still < (Number(z.optionen.hangZeitlimit) || 90000)) return;
  await schrittFehlerVerarbeiten(
    `Zeitueberschreitung: seit ${Math.round(still / 1000)} s keine Rueckmeldung von der Seite`);
});

/* -------------------------------------------------------------------- *
 * Nachrichten                                                           *
 * -------------------------------------------------------------------- */

chrome.runtime.onMessage.addListener((nachricht, absender, antworten) => {
  behandle(nachricht, absender).then(antworten).catch(fehler => {
    console.error('[Antragsroboter]', fehler);
    antworten({ ok: false, fehler: fehler.message });
  });
  return true;      // Antwort kommt asynchron
});

async function behandle(n, absender) {
  const tabId = absender?.tab?.id ?? null;

  switch (n.typ) {

    /* ---- Eine Seite hat sich fertig geladen und fragt nach Arbeit ---- */
    case 'seiteBereit': {
      const z = await lies();

      if (z.aufnahme.aktiv && z.aufnahme.tabId === tabId) {
        // Seitenwechsel waehrend der Aufnahme: den letzten Schritt als
        // navigierend markieren, damit der Abspieler spaeter darauf wartet.
        await aendere(async zz => {
          if (zz.aufnahme.letzteUrl && zz.aufnahme.letzteUrl !== n.url) {
            const letzter = zz.rezept.schritte[zz.rezept.schritte.length - 1];
            if (letzter) letzter.navigiert = true;
          }
          zz.aufnahme.letzteUrl = n.url;
          if (!zz.rezept.startUrl && zz.rezept.schritte.length === 0) zz.rezept.startUrl = n.url;
        });
        return { modus: 'aufnahme' };
      }

      if (z.lauf.aktiv && !z.lauf.pausiert && z.lauf.tabId === tabId) {
        const auftrag = await aendere(async zz => {
          // Der entscheidende Punkt: hat ein Schritt die Navigation ausgeloest,
          // fehlt seine Fertigmeldung. Er gilt trotzdem als erledigt, sonst
          // wuerde er nach dem Seitenwechsel ein zweites Mal ausgefuehrt.
          const start = zz.lauf.schrittLaufend !== null
            ? zz.lauf.schrittLaufend + 1
            : zz.lauf.schrittIndex;
          zz.lauf.schrittIndex   = start;
          zz.lauf.schrittLaufend = null;
          zz.lauf.letzteAktivitaet = Date.now();
          return auftragBauen(zz, start);
        });
        if (!auftrag) return { modus: 'nichts' };
        // Alle Schritte sind durch und die Seite hat trotzdem gewechselt: der
        // letzte Schritt war der Freigabe-Klick, DIES hier ist die
        // Bestaetigungsseite. Genau hier muss das Erfolgsmerkmal geprueft
        // werden - nicht vor dem Klick.
        if (auftrag.startAb >= (auftrag.rezept.schritte || []).length) {
          return { modus: 'pruefen', auftrag };
        }
        return { modus: 'wiedergabe', auftrag };
      }

      return { modus: 'nichts' };
    }

    /* ---- Aufnahme ---- */
    case 'schrittAufgezeichnet': {
      await aendere(async z => {
        if (!z.aufnahme.aktiv) return;
        const s = n.schritt;
        const liste = z.rezept.schritte;

        // Mehrfache Meldungen zum selben Feld zusammenfassen.
        //
        // Beim Tippen feuert 'input', beim Verlassen des Feldes zusaetzlich
        // 'change'. Dazwischen kann der Mensch laengst ein anderes Feld bedient
        // haben - die spaete 'change'-Meldung wuerde dann einen zweiten Schritt
        // fuer dasselbe Feld anlegen. Darum wird rueckwaerts gesucht, aber nur
        // bis zum letzten Klick: ab dort kann sich die Seite geaendert haben,
        // und eine erneute Eingabe ins gleiche Feld ist dann wirklich gewollt.
        if (s.aktion === 'eingabe') {
          const kennung = JSON.stringify(s.selektoren);
          for (let i = liste.length - 1; i >= 0; i--) {
            const v = liste[i];
            if (v.aktion === 'klick' || v.aktion === 'taste') break;
            if (v.aktion === 'eingabe' && JSON.stringify(v.selektoren) === kennung) {
              v.wert = s.wert;
              return;
            }
          }
        }
        liste.push(s);
      });
      return { ok: true };
    }

    case 'passwortUebersprungen': {
      await aendere(async z => {
        notiere(z, { antrag: '', ereignis: 'Passwortfeld ignoriert', status: 'info',
                     detail: 'Passwoerter werden grundsaetzlich nicht aufgezeichnet' });
      });
      return { ok: true };
    }

    case 'aufnahmeStarten': {
      const ziel = n.tabId;
      await aendere(async z => {
        // Die Startadresse MUSS hier gesetzt werden. Bliebe sie leer, liefe der
        // Vergleich beim ersten Seitenwechsel ins Leere und der ausloesende
        // Schritt bekaeme keine Wartemarke.
        z.aufnahme = { aktiv: true, tabId: ziel, letzteUrl: n.url || '' };
        if (n.neu) {
          z.rezept = { ...structuredClone(STANDARD.rezept), erstellt: jetzt(), startUrl: n.url || '' };
        }
        notiere(z, { antrag: '', ereignis: 'Aufnahme gestartet', status: 'info', detail: n.url || '' });
      });
      await anSeite(ziel, { typ: 'aufnahmeStarten' });
      return { ok: true };
    }

    case 'aufnahmeBeenden': {
      const z0 = await lies();
      const ziel = z0.aufnahme.tabId;
      await aendere(async z => {
        z.aufnahme.aktiv = false;
        notiere(z, { antrag: '', ereignis: 'Aufnahme beendet', status: 'info',
                     detail: `${z.rezept.schritte.length} Schritte` });
      });
      if (ziel) await anSeite(ziel, { typ: 'aufnahmeBeenden' });
      return { ok: true };
    }

    /* ---- Rueckmeldungen der Wiedergabe ---- */
    case 'schrittBeginn': {
      await aendere(async z => {
        z.lauf.schrittLaufend = n.index;
        z.lauf.letzteAktivitaet = Date.now();
      });
      return { ok: true };
    }

    case 'schrittFertig': {
      await aendere(async z => {
        z.lauf.schrittIndex   = n.index + 1;
        z.lauf.schrittLaufend = null;
        z.lauf.letzteAktivitaet = Date.now();
        const a = z.antraege[z.lauf.antragIndex];
        const s = z.rezept.schritte[n.index];
        notiere(z, { antrag: a?.wert || '', ereignis: `Schritt ${n.index + 1}: ${s?.aktion || ''}`,
                     status: 'ok', detail: `${s?.beschriftung || ''} - ${n.ergebnis || ''}` });
      });
      return { ok: true };
    }

    case 'schrittFehler': {
      const s = (await lies()).rezept.schritte[n.index];
      await schrittFehlerVerarbeiten(
        `Schritt ${n.index + 1} (${s?.aktion || '?'} ${s?.beschriftung || ''}): ${n.meldung}`);
      return { ok: true };
    }

    // Das Ergebnis steht fest, der Rueckweg zur Liste laeuft aber noch.
    // Erst danach kommt 'antragFertig' und der naechste Antrag ist dran.
    case 'antragErgebnis': {
      await aendere(async z => {
        if (!z.lauf.aktiv) return;
        z.lauf.vorgemerkt = n.ergebnis;
        z.lauf.letzteAktivitaet = Date.now();
      });
      return { ok: true };
    }

    case 'antragFertig': {
      await antragAbschliessen(n.ergebnis);
      return { ok: true };
    }

    case 'lauferAnhalten': {
      await laufBeenden(n.grund || 'Vom Bediener angehalten');
      return { ok: true };
    }

    /* ---- Sitzung abgelaufen ---- */
    // Bewusst KEIN Fehler: an diesem Antrag ist nichts geschehen. Er geht
    // zurueck auf 'offen', damit er nach der Neuanmeldung normal drankommt.
    // Wuerde er als Fehler gelten, liefe zusaetzlich die Notbremse mit und
    // spaeter waere im Protokoll nicht mehr zu erkennen, dass hier nur die
    // Anmeldung fehlte.
    case 'sitzungAbgelaufen': {
      const tab = await aendere(async z => {
        if (!z.lauf.aktiv) return null;
        const a = z.antraege[z.lauf.antragIndex];

        if (a && a.status === 'laeuft') {
          if (n.freigabeAb) {
            // Der Freigabe-Klick war schon raus, als die Sitzung starb. Ob das
            // Portal ihn noch verbucht hat, laesst sich von hier aus nicht
            // sagen. Als Fehler zu buchen waere falsch (die Freigabe koennte
            // erteilt sein), als erledigt ebenso (sie koennte fehlen). Also
            // ehrlich: unklar, und ein Mensch sieht nach.
            a.status  = 'unklar';
            a.zeit    = jetzt();
            a.meldung = 'Sitzung endete nach dem Freigabe-Klick — Ausgang '
                      + 'ungeklaert. Bitte im Portal nachsehen.';
          } else {
            a.status = 'offen';
            a.meldung = '';
          }
        }

        z.lauf.pausiert = true;
        z.lauf.grund = n.freigabeAb
          ? `Sitzung abgelaufen — bei ${a?.wert || 'einem Antrag'} ist der Ausgang `
            + `ungeklaert und muss von Hand geprueft werden. Danach neu anmelden `
            + `und auf „Fortsetzen".`
          : 'Sitzung abgelaufen — bitte im Portal neu anmelden, '
            + 'danach auf „Fortsetzen". Es ging nichts verloren.';
        notiere(z, { antrag: a?.wert || '', ereignis: 'Sitzung abgelaufen',
                     status: n.freigabeAb ? 'fehler' : 'warnung',
                     detail: `erkannt an: "${n.erkanntAn}" — `
                           + (n.freigabeAb ? 'Ausgang UNKLAR' : 'Antrag bleibt offen') });
        return z.lauf.tabId;
      });
      if (tab) await anSeite(tab, { typ: 'anhalten', grund: 'Sitzung abgelaufen' });
      return { ok: true };
    }

    /* ---- Steuerung aus dem Panel ---- */
    case 'laufStarten':   await laufStarten(n.tabId, n.nurOffene); return { ok: true };
    case 'laufPause':     await laufAnhalten('Vom Bediener pausiert'); return { ok: true };
    case 'laufStopp':     await laufBeenden('Vom Bediener gestoppt'); return { ok: true };

    case 'laufFortsetzen': {
      await aendere(async z => {
        z.lauf.pausiert = false;
        z.lauf.grund = '';
        z.lauf.fehlerInFolge = 0;
        z.lauf.letzteAktivitaet = Date.now();
        if (n.tabId) z.lauf.tabId = n.tabId;
        notiere(z, { antrag: '', ereignis: 'Fortgesetzt', status: 'info', detail: '' });
      });
      wachhundStellen();
      await naechsterAntrag();
      return { ok: true };
    }

    // Das gewaehlte Element durchreichen: das Inhalts-Skript kann dem Panel
    // nicht unmittelbar antworten, der Weg fuehrt ueber den Hintergrund.
    case 'elementGewaehlt': {
      gewaehltesElement = n.abgebrochen ? null : n;
      chrome.runtime.sendMessage({ typ: 'elementBereit', element: gewaehltesElement })
        .catch(() => { /* Panel zu */ });
      return { ok: true };
    }

    case 'zustandLesen':  return await lies();

    case 'zustandSetzen': {
      await aendere(async z => { Object.assign(z, n.aenderung); });
      return { ok: true };
    }

    case 'alarmAus':      chrome.alarms.clear('wachhund'); return { ok: true };

    default:
      return { ok: false, grund: `unbekannte Nachricht: ${n.typ}` };
  }
}

/* -------------------------------------------------------------------- *
 * Aufraeumen                                                            *
 * -------------------------------------------------------------------- */

// Wird der Tab geschlossen, in dem der Roboter arbeitet, haelt der Lauf an -
// besser als blind weiterzulaufen, wenn niemand mehr zusieht.
chrome.tabs.onRemoved.addListener(async geschlossen => {
  const z = await lies();
  if (z.lauf.aktiv && z.lauf.tabId === geschlossen) {
    await laufAnhalten('Der Arbeits-Tab wurde geschlossen');
  }
  if (z.aufnahme.aktiv && z.aufnahme.tabId === geschlossen) {
    await aendere(async zz => { zz.aufnahme.aktiv = false; });
  }
});

chrome.storage.onChanged.addListener(() => { puffer = null; });

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
chrome.runtime.onStartup?.addListener(() => {
  chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
