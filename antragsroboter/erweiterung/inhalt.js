/*
 * Antragsroboter - Inhalts-Skript
 *
 * Laeuft direkt in der Seite des Antragsportals. Zwei Betriebsarten:
 *   Aufnahme    - protokolliert Klicks und Eingaben als wiederholbare Schritte
 *   Wiedergabe  - spielt die Schritte fuer einen Antrag ab
 *
 * Der Ablaufzustand liegt bewusst NICHT hier, sondern im Hintergrund-Skript.
 * Nur so uebersteht ein Durchlauf den Seitenwechsel: bei jeder Navigation wird
 * dieses Skript zerstoert und auf der neuen Seite neu geladen - es meldet sich
 * dann beim Hintergrund und macht dort weiter, wo es aufgehoert hat.
 */
(() => {
  'use strict';
  // Wird das Skript ein zweites Mal eingespielt - das tut der Hintergrund, wenn
  // eine Seite nicht mehr antwortet -, darf das nicht stumm verpuffen. Statt
  // abzubrechen, meldet sich die bestehende Fassung erneut beim Hintergrund.
  if (window.__antragsroboterGeladen) {
    try { window.__antragsroboterNeuMelden?.(); } catch (e) { /* Kontext hin */ }
    return;
  }
  window.__antragsroboterGeladen = true;

  const SCHRITT_ZEITLIMIT = 15000;   // wie lange auf ein Element gewartet wird
  const NAV_ZEITLIMIT     = 20000;   // wie lange auf einen Seitenwechsel gewartet wird

  let aufnahmeAktiv = false;
  let wiedergabeAktiv = false;
  let abbruchGewuenscht = false;

  const schlaf = ms => new Promise(r => setTimeout(r, ms));

  /* ------------------------------------------------------------------ *
   * Verbindung zum Hintergrund                                          *
   * ------------------------------------------------------------------ */

  function melde(nachricht) {
    return new Promise(aufloesen => {
      try {
        chrome.runtime.sendMessage(nachricht, antwort => {
          void chrome.runtime.lastError;      // Verbindung weg = Seite wechselt gerade
          aufloesen(antwort || null);
        });
      } catch (e) {
        aufloesen(null);
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Kleine Helfer                                                       *
   * ------------------------------------------------------------------ */

  const attrWert = v => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  function normText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  function istSichtbar(el) {
    if (!el || !el.isConnected) return false;
    if (el.getClientRects().length === 0) return false;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || st.opacity === '0') return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    return true;
  }

  function istBedienbar(el) {
    if (!istSichtbar(el)) return false;
    if (el.disabled) return false;
    if (el.getAttribute('aria-disabled') === 'true') return false;
    if (el.closest('fieldset[disabled]')) return false;
    return true;
  }

  // Beschriftung eines Elements - fuer Textsuche und fuer die Anzeige im Panel
  function beschriftung(el) {
    if (!el) return '';
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' && ['submit', 'button', 'reset'].includes(el.type)) return normText(el.value);
    let t = normText(el.getAttribute('aria-label') || '');
    if (t) return t;
    const beschriftetVon = el.getAttribute('aria-labelledby');
    if (beschriftetVon) {
      const ziel = document.getElementById(beschriftetVon);
      if (ziel) { t = normText(ziel.innerText); if (t) return t; }
    }
    t = normText(el.innerText || el.textContent);
    if (t) return t;
    if (el.id) {
      const lab = document.querySelector(`label[for="${attrWert(el.id)}"]`);
      if (lab) { t = normText(lab.innerText); if (t) return t; }
    }
    const umschliessend = el.closest('label');
    if (umschliessend) { t = normText(umschliessend.innerText); if (t) return t; }
    return normText(el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || '');
  }

  /* ------------------------------------------------------------------ *
   * Selektoren erzeugen (Aufnahme)                                      *
   * ------------------------------------------------------------------ *
   * Es wird bewusst nicht EIN Selektor gespeichert, sondern eine Kette
   * vom stabilsten zum unstabilsten. Beim Abspielen wird der Reihe nach
   * probiert - aendert das Portal sein Layout, greift oft noch ein
   * spaeterer Treffer.
   */

  // Erkennt automatisch erzeugte IDs (React, Angular, Ember, GUIDs ...),
  // die sich beim naechsten Seitenaufruf aendern und darum unbrauchbar sind.
  function idStabil(id) {
    if (!id || id.length > 80) return false;
    if (/^[:.]/.test(id)) return false;                       // React ":r1:"
    if (/\d{5,}/.test(id)) return false;                      // lange Zahlenketten
    if (/^(ember|ext-|yui_|mui-|radix-|headlessui-|aria-)/i.test(id)) return false;
    if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(id)) return false;   // GUID
    if (/^[0-9a-f]{16,}$/i.test(id)) return false;            // Hash
    return true;
  }

  function klassenStabil(el) {
    return Array.from(el.classList || [])
      .filter(c => c.length > 1 && c.length < 40
        && !/\d{4,}/.test(c)
        && !/^(ng-|is-|has-|jsx-|css-|sc-|emotion-)/i.test(c)
        && !/^[a-z]+_[a-z0-9]{5,}$/i.test(c))   // CSS-Module: knopf_x8f2a
      .slice(0, 2);
  }

  function cssPfad(el) {
    const teile = [];
    let k = el;
    while (k && k.nodeType === 1 && k !== document.documentElement && teile.length < 6) {
      let teil = k.tagName.toLowerCase();
      if (k.id && idStabil(k.id)) {
        teile.unshift(`#${CSS.escape(k.id)}`);
        return teile.join(' > ');
      }
      const eltern = k.parentElement;
      if (eltern) {
        const gleiche = Array.from(eltern.children).filter(g => g.tagName === k.tagName);
        if (gleiche.length > 1) teil += `:nth-of-type(${gleiche.indexOf(k) + 1})`;
      }
      teile.unshift(teil);
      k = eltern;
    }
    return teile.join(' > ');
  }

  function selektorKette(el) {
    const kette = [];
    const tag = el.tagName.toLowerCase();
    const merk = ['data-testid', 'data-test', 'data-testid', 'data-qa', 'data-cy',
                  'data-automation-id', 'data-automationid', 'data-id', 'data-name', 'data-action'];
    for (const a of merk) {
      const v = el.getAttribute(a);
      if (v && v.length < 80) kette.push(`[${a}="${attrWert(v)}"]`);
    }
    if (el.id && idStabil(el.id)) kette.push(`#${CSS.escape(el.id)}`);
    const name = el.getAttribute('name');
    if (name) kette.push(`${tag}[name="${attrWert(name)}"]`);
    const aria = el.getAttribute('aria-label');
    if (aria && aria.length < 80) kette.push(`${tag}[aria-label="${attrWert(aria)}"]`);
    if (tag === 'input' && el.type) {
      const ph = el.getAttribute('placeholder');
      if (ph && ph.length < 80) kette.push(`input[placeholder="${attrWert(ph)}"]`);
    }
    const rolle = el.getAttribute('role');
    const kl = klassenStabil(el);
    if (rolle && kl.length) kette.push(`${tag}[role="${attrWert(rolle)}"].${kl.map(c => CSS.escape(c)).join('.')}`);
    if (kl.length) kette.push(`${tag}.${kl.map(c => CSS.escape(c)).join('.')}`);
    kette.push(cssPfad(el));
    return [...new Set(kette)];
  }

  /* ------------------------------------------------------------------ *
   * Zustand eines Pruefmerkmals: Haken oder Kreuz, gruen oder nicht      *
   * ------------------------------------------------------------------ *
   * WohnWeb zeigt unten rechts "Finanzierung" und "Detailpruefbarkeit"
   * mit Haken und gruener Flaeche, wenn sie in Ordnung sind, sonst mit
   * einem Kreuz. Erst wenn beide in Ordnung sind, darf die Pruefung
   * eingeleitet werden.
   *
   * Zeichen schlagen Farbe: ein Haken ist eindeutig, gruen ist Auslegung.
   * Farbe wird nur befragt, wenn sich kein Zeichen finden laesst. Und
   * wenn beides schweigt, lautet die Antwort ausdruecklich "unbekannt" -
   * NICHT "in Ordnung". Bei Freigaben ist Nichtwissen ein Nein.
   */
  function markerZustand(el) {
    if (!el) return { zustand: 'unbekannt', grund: 'Element nicht vorhanden' };

    const text = (el.innerText || el.textContent || '');
    if (/[\u2713\u2714\u2705]/.test(text)) return { zustand: 'ok', grund: 'Haken gefunden' };
    if (/[\u2717\u2718\u274c\u2716]/.test(text)) return { zustand: 'nein', grund: 'Kreuz gefunden' };

    // Symbolschriften und Sinnbilder tragen ihre Bedeutung im Namen
    const merkmale = [el, ...el.querySelectorAll('i, span, svg, use, img, [class]')]
      .slice(0, 40)
      .map(e => [e.getAttribute?.('class') || '', e.getAttribute?.('aria-label') || '',
                 e.getAttribute?.('title') || '', e.getAttribute?.('data-icon') || '',
                 e.getAttribute?.('href') || e.getAttribute?.('xlink:href') || ''].join(' '))
      .join(' ').toLowerCase();
    if (/\b(check|haken|tick|success|erfolg|valid|gruen|green|done|complete)\b/.test(merkmale))
      return { zustand: 'ok', grund: 'Haken-Sinnbild' };
    if (/\b(cross|times|close|error|fehler|invalid|rot|red|warn|cancel)\b/.test(merkmale))
      return { zustand: 'nein', grund: 'Kreuz-Sinnbild' };

    // Zuletzt die Farbe - eigene und die der Kinder, denn oft ist nur ein
    // innerer Bereich eingefaerbt.
    for (const e of [el, ...el.querySelectorAll('*')].slice(0, 30)) {
      const st = getComputedStyle(e);
      for (const farbe of [st.backgroundColor, st.color, st.borderColor]) {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(farbe || '');
        if (!m) continue;
        const [r, g, b] = [+m[1], +m[2], +m[3]];
        const deckung = m[4] === undefined ? 1 : parseFloat(m[4]);
        if (deckung < 0.15) continue;
        if (g > r + 25 && g > b + 25) return { zustand: 'ok',   grund: `gruen (${farbe})` };
        if (r > g + 45 && r > b + 25) return { zustand: 'nein', grund: `rot (${farbe})` };
      }
    }
    return { zustand: 'unbekannt', grund: 'weder Zeichen noch Farbe eindeutig' };
  }

  /* ------------------------------------------------------------------ *
   * Tabellenzeile zu einer Kennung finden                               *
   * ------------------------------------------------------------------ *
   * In WohnWeb steckt in der Adresse eines Antrags nur eine GUID, kein
   * Aktenzeichen. Ein Antrag laesst sich darum NICHT direkt ansteuern -
   * der Roboter muss jedes Mal in der Uebersicht die richtige Zeile
   * suchen und anklicken, genau wie ein Mensch.
   */
  function findeZeile(kennung) {
    const gesucht = normText(kennung).toLowerCase();
    if (!gesucht) return null;
    const zeilen = document.querySelectorAll('tr, [role="row"]');
    const treffer = [];
    for (const z of zeilen) {
      if (!istSichtbar(z)) continue;
      const zellen = z.querySelectorAll('td, th, [role="gridcell"], [role="cell"]');
      if (!zellen.length) continue;
      // Zuerst auf eine Zelle bestehen, die GENAU die Kennung enthaelt.
      // Ein Teiltreffer waere gefaehrlich: "XY 17" steckt auch in "XY 177".
      for (const c of zellen) {
        if (normText(c.innerText).toLowerCase() === gesucht) return { zeile: z, genau: true };
      }
      if (normText(z.innerText).toLowerCase().includes(gesucht)) treffer.push(z);
    }
    if (treffer.length === 1) return { zeile: treffer[0], genau: false };
    if (treffer.length > 1) {
      throw new Error(`"${kennung}" passt auf ${treffer.length} Zeilen - Kennung ist nicht eindeutig`);
    }
    return null;
  }

  const KLICKBAR = 'button, a, input[type=submit], input[type=button], input[type=reset], ' +
                   '[role=button], [role=link], [role=menuitem], [role=tab], [role=option], ' +
                   'summary, label, td, th, li, span, div';

  /* ------------------------------------------------------------------ *
   * Element finden (Wiedergabe)                                         *
   * ------------------------------------------------------------------ */

  function trefferFuer(schritt) {
    for (const sel of (schritt.selektoren || [])) {
      let liste;
      try { liste = document.querySelectorAll(sel); } catch (e) { continue; }
      if (!liste.length) continue;
      // Bei mehreren Treffern gewinnt der erste bedienbare
      const passend = Array.from(liste).filter(istBedienbar);
      if (passend.length === 1) return { el: passend[0], via: sel };
      if (passend.length > 1) {
        // Mehrdeutig - ueber den Text eingrenzen, wenn vorhanden
        if (schritt.text) {
          const genau = passend.find(e => normText(beschriftung(e)) === schritt.text);
          if (genau) return { el: genau, via: sel + ' + Text' };
        }
        return { el: passend[0], via: sel + ` (${passend.length} Treffer, erster genommen)` };
      }
    }
    // Letzte Rettung: ueber die sichtbare Beschriftung suchen
    if (schritt.text) {
      const kandidaten = Array.from(document.querySelectorAll(KLICKBAR))
        .filter(istBedienbar)
        .filter(e => normText(beschriftung(e)) === schritt.text);
      // den am tiefsten liegenden nehmen (span statt umschliessendem div)
      const blatt = kandidaten.find(e => !kandidaten.some(a => a !== e && e.contains(a)));
      if (blatt) return { el: blatt, via: `Text "${schritt.text}"` };
    }
    return null;
  }

  async function findeElement(schritt, zeitlimit = SCHRITT_ZEITLIMIT) {
    const ende = Date.now() + zeitlimit;
    let letzter = null;
    while (Date.now() < ende) {
      if (abbruchGewuenscht) throw new Error('Abgebrochen');
      letzter = trefferFuer(schritt);
      if (letzter) return letzter;
      await schlaf(200);
    }
    throw new Error(`Element nicht gefunden: ${schritt.beschriftung || schritt.selektoren?.[0] || '?'}`);
  }

  /* ------------------------------------------------------------------ *
   * Werte setzen - so, dass auch React/Angular/Vue es mitbekommen       *
   * ------------------------------------------------------------------ *
   * Ein simples el.value = "x" wird von diesen Frameworks ignoriert,
   * weil sie den value-Setter ueberschreiben. Der native Setter des
   * Prototyps umgeht das, danach werden die Ereignisse von Hand ausgeloest.
   */
  function setzeWert(el, wert) {
    const tag = el.tagName.toLowerCase();
    if (el.isContentEditable) {
      el.focus();
      el.textContent = wert;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: wert }));
      return;
    }
    const proto = tag === 'textarea' ? window.HTMLTextAreaElement.prototype
                : tag === 'select'   ? window.HTMLSelectElement.prototype
                :                      window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    el.focus();
    if (setter) setter.call(el, wert); else el.value = wert;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function echterKlick(el) {
    const r = el.getBoundingClientRect();
    const g = {
      bubbles: true, cancelable: true, view: window, button: 0, buttons: 1,
      clientX: Math.floor(r.left + r.width / 2),
      clientY: Math.floor(r.top + r.height / 2)
    };
    const z = { ...g, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    try {
      el.dispatchEvent(new PointerEvent('pointerover', z));
      el.dispatchEvent(new MouseEvent('mouseover', g));
      el.dispatchEvent(new PointerEvent('pointerdown', z));
      el.dispatchEvent(new MouseEvent('mousedown', g));
    } catch (e) { /* aeltere Engines ohne PointerEvent */ }
    if (typeof el.focus === 'function') el.focus();
    try {
      el.dispatchEvent(new PointerEvent('pointerup', z));
      el.dispatchEvent(new MouseEvent('mouseup', { ...g, buttons: 0 }));
    } catch (e) { /* siehe oben */ }
    el.click();     // nativ - loest auch Links und Formular-Absenden aus
  }

  /* ------------------------------------------------------------------ *
   * Platzhalter ersetzen: {{antrag}} und CSV-Spalten                    *
   * ------------------------------------------------------------------ */
  function fuelle(vorlage, werte) {
    if (typeof vorlage !== 'string') return vorlage;
    return vorlage.replace(/\{\{\s*([\w.\-]+)\s*\}\}/g, (treffer, schluessel) => {
      const k = schluessel.toLowerCase();
      if (k in werte) return werte[k];
      return treffer;         // unbekannter Platzhalter bleibt sichtbar stehen
    });
  }

  // Der wichtigste Punkt beim Abspielen: die Antragsnummer steckt nicht nur in
  // Eingabewerten, sondern regelmaessig auch im Selektor und im Suchtext -
  // etwa beim Klick auf die Zeile "A-10001" in einer Trefferliste. Vor der
  // Ausfuehrung wird der Schritt deshalb vollstaendig aufgefuellt.
  function schrittFuellen(schritt, werte) {
    return {
      ...schritt,
      wert:         fuelle(schritt.wert, werte),
      text:         fuelle(schritt.text, werte),
      beschriftung: fuelle(schritt.beschriftung, werte),
      selektoren:  (schritt.selektoren || []).map(sel => fuelle(sel, werte))
    };
  }

  /* ------------------------------------------------------------------ *
   * Einen Schritt ausfuehren                                            *
   * ------------------------------------------------------------------ *
   * Erwartet einen bereits aufgefuellten Schritt (siehe schrittFuellen).
   */
  async function fuehreAus(schritt, werte) {
    const wert = schritt.wert ?? '';

    switch (schritt.aktion) {
      case 'warteText': {
        const ende = Date.now() + (schritt.zeitlimit || SCHRITT_ZEITLIMIT);
        while (Date.now() < ende) {
          if (abbruchGewuenscht) throw new Error('Abgebrochen');
          if ((document.body.innerText || '').includes(wert)) return `Text "${wert}" erschienen`;
          await schlaf(250);
        }
        throw new Error(`Text "${wert}" ist nicht erschienen`);
      }
      case 'warteElement': {
        await findeElement(schritt, schritt.zeitlimit || SCHRITT_ZEITLIMIT);
        return 'Element erschienen';
      }
      case 'pause': {
        await schlaf(Number(wert) || 1000);
        return `${Number(wert) || 1000} ms gewartet`;
      }

      case 'zurueck': {
        history.back();
        return 'zurueck im Browserverlauf';
      }

      // Zeile in der Uebersicht anklicken. Ersetzt den Direktaufruf per
      // Adresse, den WohnWeb wegen seiner GUID-Adressen nicht zulaesst.
      case 'zeileKlicken': {
        const ende = Date.now() + (schritt.zeitlimit || SCHRITT_ZEITLIMIT);
        let gefunden = null;
        while (Date.now() < ende) {
          if (abbruchGewuenscht) throw new Error('Abgebrochen');
          gefunden = findeZeile(wert);        // wirft bei Mehrdeutigkeit
          if (gefunden) break;
          await schlaf(250);
        }
        if (!gefunden) {
          throw new Error(`Keine Zeile mit "${wert}" in der Uebersicht gefunden`);
        }
        const z = gefunden.zeile;
        z.scrollIntoView({ block: 'center' });
        await schlaf(80);
        // Bevorzugt den Verweis in der Zeile anklicken, sonst die Zeile selbst.
        const ziel = z.querySelector('a, button, [role="link"], [role="button"]') || z;
        echterKlick(ziel);
        return `Zeile "${wert}" angeklickt${gefunden.genau ? '' : ' (Teiltreffer)'}`;
      }

      // Vorbedingung: muss erfuellt sein, sonst wird der Antrag ausgelassen.
      // Ein nicht erfuelltes Merkmal ist KEIN Fehler - der Antrag ist nur
      // (noch) nicht so weit.
      case 'vorbedingung': {
        const { el } = await findeElement(schritt, schritt.zeitlimit || 8000);
        const { zustand, grund } = markerZustand(el);
        if (zustand === 'ok') return `${schritt.beschriftung}: in Ordnung (${grund})`;
        const fehler = new Error(
          `${schritt.beschriftung}: ${zustand === 'nein' ? 'nicht erfuellt' : 'nicht feststellbar'} (${grund})`);
        fehler.vorbedingung = true;
        throw fehler;
      }
    }

    const { el, via } = await findeElement(schritt, schritt.zeitlimit || SCHRITT_ZEITLIMIT);
    el.scrollIntoView({ block: 'center', inline: 'center' });
    await schlaf(80);

    switch (schritt.aktion) {
      case 'klick':
        echterKlick(el);
        return `geklickt (${via})`;

      case 'eingabe':
        setzeWert(el, wert);
        return `"${wert}" eingetragen (${via})`;

      case 'auswahl': {
        const opt = Array.from(el.options || [])
          .find(o => o.value === wert || normText(o.text) === normText(wert));
        if (!opt) throw new Error(`Auswahl "${wert}" gibt es nicht in diesem Feld`);
        el.value = opt.value;
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return `"${opt.text}" ausgewaehlt (${via})`;
      }

      case 'haken': {
        const soll = wert === true || wert === 'true';
        if (el.checked !== soll) echterKlick(el);
        return `${soll ? 'angehakt' : 'abgehakt'} (${via})`;
      }

      case 'taste': {
        const t = wert || 'Enter';
        const g = { bubbles: true, cancelable: true, key: t,
                    code: t === 'Enter' ? 'Enter' : t,
                    keyCode: t === 'Enter' ? 13 : 0, which: t === 'Enter' ? 13 : 0 };
        el.focus();
        el.dispatchEvent(new KeyboardEvent('keydown', g));
        el.dispatchEvent(new KeyboardEvent('keypress', g));
        el.dispatchEvent(new KeyboardEvent('keyup', g));
        if (t === 'Enter' && el.form && typeof el.form.requestSubmit === 'function') {
          try { el.form.requestSubmit(); } catch (e) { /* Formular wehrt sich - ignorieren */ }
        }
        return `Taste ${t} (${via})`;
      }

      default:
        throw new Error(`Unbekannte Aktion: ${schritt.aktion}`);
    }
  }

  /* ------------------------------------------------------------------ *
   * Overlay - Statusanzeige und Einzelbestaetigung                      *
   * ------------------------------------------------------------------ *
   * Liegt in einem Shadow-DOM, damit das Portal-CSS es nicht verbiegt.
   */
  let schatten = null;

  function overlay() {
    if (schatten) return schatten;
    const wirt = document.createElement('div');
    wirt.id = 'antragsroboter-overlay';
    (document.body || document.documentElement).appendChild(wirt);
    schatten = wirt.attachShadow({ mode: 'open' });
    schatten.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; }
        .leiste {
          position: fixed; top: 12px; right: 12px; z-index: 2147483647;
          font: 500 13px/1.45 "Segoe UI", system-ui, sans-serif;
          background: #0f172a; color: #f8fafc; border-radius: 10px;
          padding: 10px 14px; box-shadow: 0 8px 28px rgba(0,0,0,.35);
          max-width: 340px; border: 1px solid #1e293b;
        }
        .leiste b { color: #60a5fa; }
        .zeile { display: flex; gap: 8px; align-items: baseline; }
        .punkt { width: 8px; height: 8px; border-radius: 50%; background: #22c55e;
                 flex: none; align-self: center; animation: puls 1.4s infinite; }
        .punkt.warte { background: #f59e0b; animation: none; }
        @keyframes puls { 0%,100% { opacity: 1 } 50% { opacity: .25 } }
        .klein { color: #94a3b8; font-size: 12px; margin-top: 3px;
                 overflow-wrap: anywhere; }
        .decke {
          position: fixed; inset: 0; z-index: 2147483646;
          background: rgba(15,23,42,.55); backdrop-filter: blur(2px);
          display: flex; align-items: center; justify-content: center;
        }
        .frage {
          background: #fff; color: #0f172a; border-radius: 14px; padding: 24px 26px;
          font: 14px/1.55 "Segoe UI", system-ui, sans-serif; max-width: 440px;
          box-shadow: 0 24px 60px rgba(0,0,0,.4);
        }
        .frage h2 { margin: 0 0 6px; font-size: 17px; }
        .frage .antrag { font: 600 20px/1.2 "Segoe UI", system-ui, sans-serif;
                         color: #1d4ed8; margin: 10px 0 14px; overflow-wrap: anywhere; }
        .frage p { margin: 0 0 18px; color: #475569; }
        .knoepfe { display: flex; gap: 8px; flex-wrap: wrap; }
        button {
          font: 600 13px/1 "Segoe UI", system-ui, sans-serif; cursor: pointer;
          border-radius: 8px; padding: 11px 16px; border: 1px solid transparent;
        }
        .ja   { background: #16a34a; color: #fff; }
        .ja:hover { background: #15803d; }
        .weiter { background: #f1f5f9; color: #0f172a; border-color: #cbd5e1; }
        .weiter:hover { background: #e2e8f0; }
        .stopp { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
        .stopp:hover { background: #fee2e2; }
        .hinweis { margin-top: 14px; font-size: 12px; color: #64748b; }
      </style>
      <div class="behaelter"></div>`;
    return schatten;
  }

  function statusZeigen(titel, unterzeile, wartet) {
    const s = overlay();
    const b = s.querySelector('.behaelter');
    let leiste = b.querySelector('.leiste');
    if (!leiste) {
      leiste = document.createElement('div');
      leiste.className = 'leiste';
      b.appendChild(leiste);
    }
    leiste.innerHTML = `
      <div class="zeile"><span class="punkt ${wartet ? 'warte' : ''}"></span>
        <span><b>Antragsroboter</b> &middot; ${titel}</span></div>
      ${unterzeile ? `<div class="klein">${unterzeile}</div>` : ''}`;
  }

  function statusWeg() {
    if (!schatten) return;
    schatten.querySelector('.leiste')?.remove();
  }

  // Einzelbestaetigung: haelt vor dem endgueltigen Freigabe-Klick an.
  function frageNach(antrag, schrittName) {
    return new Promise(aufloesen => {
      const s = overlay();
      const b = s.querySelector('.behaelter');
      const decke = document.createElement('div');
      decke.className = 'decke';
      decke.innerHTML = `
        <div class="frage" role="dialog" aria-modal="true">
          <h2>Freigabe bestaetigen</h2>
          <div class="antrag">${antrag}</div>
          <p>Der Roboter moechte jetzt <b>&bdquo;${schrittName}&ldquo;</b> ausloesen.
             Dieser Schritt ist als endgueltig markiert.</p>
          <div class="knoepfe">
            <button class="ja">Freigeben</button>
            <button class="weiter">Diesen Antrag ueberspringen</button>
            <button class="stopp">Alles anhalten</button>
          </div>
          <div class="hinweis">Die Einzelbestaetigung laesst sich im Panel abschalten.</div>
        </div>`;
      b.appendChild(decke);
      const fertig = wahl => { decke.remove(); aufloesen(wahl); };
      decke.querySelector('.ja').addEventListener('click', () => fertig('ja'));
      decke.querySelector('.weiter').addEventListener('click', () => fertig('ueberspringen'));
      decke.querySelector('.stopp').addEventListener('click', () => fertig('stopp'));
      decke.querySelector('.ja').focus();
    });
  }

  /* ------------------------------------------------------------------ *
   * Aufnahme                                                            *
   * ------------------------------------------------------------------ */

  function schrittAus(el, aktion, wert) {
    return {
      aktion,
      wert,
      selektoren: selektorKette(el),
      text: normText(beschriftung(el)),
      beschriftung: normText(beschriftung(el)) || el.tagName.toLowerCase(),
      tag: el.tagName.toLowerCase(),
      typ: el.type || '',
      endgueltig: false,
      navigiert: false
    };
  }

  function aufKlick(ev) {
    if (!aufnahmeAktiv) return;
    const el = ev.target;
    if (!el || el.nodeType !== 1) return;
    if (el.closest && el.closest('#antragsroboter-overlay')) return;

    // Checkbox/Radio werden als 'haken' gefuehrt, nicht als Klick
    if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
      // Achtung: beim click-Ereignis hat der Browser die Markierung bereits
      // umgestellt. el.checked ist also schon der GEWOLLTE Zustand.
      melde({ typ: 'schrittAufgezeichnet', schritt: schrittAus(el, 'haken', el.checked) });
      return;
    }
    // Auf das eigentlich klickbare Element hochlaufen - Nutzer treffen oft ein
    // <span> im Knopf; der Knopf selbst ist der stabilere Anker.
    const ziel = el.closest('button, a, [role=button], [role=link], [role=menuitem], [role=tab], ' +
                            'input[type=submit], input[type=button], summary, label') || el;
    melde({ typ: 'schrittAufgezeichnet', schritt: schrittAus(ziel, 'klick') });
  }

  function aufAenderung(ev) {
    if (!aufnahmeAktiv) return;
    const el = ev.target;
    if (!el || el.nodeType !== 1) return;
    if (el.closest && el.closest('#antragsroboter-overlay')) return;

    // Passwoerter werden NIE aufgezeichnet - weder Feld noch Wert.
    if (el.type === 'password') {
      melde({ typ: 'passwortUebersprungen' });
      return;
    }
    if (el.tagName === 'SELECT') {
      const o = el.options[el.selectedIndex];
      melde({ typ: 'schrittAufgezeichnet', schritt: schrittAus(el, 'auswahl', o ? o.value : el.value) });
      return;
    }
    if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) return;  // via Klick
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) {
      const wert = el.isContentEditable ? normText(el.textContent) : el.value;
      melde({ typ: 'schrittAufgezeichnet', schritt: schrittAus(el, 'eingabe', wert) });
    }
  }

  function aufEingabe(ev) {
    if (!aufnahmeAktiv) return;
    const el = ev.target;
    if (!el || el.nodeType !== 1) return;
    if (el.closest && el.closest('#antragsroboter-overlay')) return;
    if (el.type === 'password') return;
    if (!['INPUT', 'TEXTAREA'].includes(el.tagName) && !el.isContentEditable) return;
    if (el.tagName === 'INPUT' && ['checkbox', 'radio', 'file', 'submit', 'button']
        .includes(el.type)) return;
    const wert = el.isContentEditable ? normText(el.textContent) : el.value;
    melde({ typ: 'schrittAufgezeichnet', schritt: schrittAus(el, 'eingabe', wert) });
  }

  function aufTaste(ev) {
    if (!aufnahmeAktiv || ev.key !== 'Enter') return;
    const el = ev.target;
    if (!el || el.nodeType !== 1) return;
    if (el.closest && el.closest('#antragsroboter-overlay')) return;
    if (el.type === 'password') return;
    if (!['INPUT', 'TEXTAREA'].includes(el.tagName) && !el.isContentEditable) return;
    melde({ typ: 'schrittAufgezeichnet', schritt: schrittAus(el, 'taste', 'Enter') });
  }

  function aufnahmeStarten() {
    if (aufnahmeAktiv) return;
    aufnahmeAktiv = true;
    // Capture-Phase: wir sehen das Ereignis, bevor die Seite es abfangen kann
    document.addEventListener('click',  aufKlick,     true);
    document.addEventListener('input',  aufEingabe,   true);
    document.addEventListener('change', aufAenderung, true);
    document.addEventListener('keydown', aufTaste,    true);
    statusZeigen('nimmt auf', 'Jeder Klick und jede Eingabe wird gespeichert. Passwoerter nicht.');
  }

  function aufnahmeBeenden() {
    aufnahmeAktiv = false;
    document.removeEventListener('click',  aufKlick,     true);
    document.removeEventListener('input',  aufEingabe,   true);
    document.removeEventListener('change', aufAenderung, true);
    document.removeEventListener('keydown', aufTaste,    true);
    statusWeg();
  }

  /* ------------------------------------------------------------------ *
   * Wiedergabe                                                          *
   * ------------------------------------------------------------------ */

  // Wartet nach einem Schritt, der die Seite wechseln koennte. Entweder wird
  // dieses Skript dabei zerstoert (dann macht die neue Seite weiter), oder wir
  // sind nach kurzer Zeit noch da und laufen einfach lokal weiter.
  function warteAufSeitenwechsel(maxMs) {
    return new Promise(aufloesen => {
      let fertig = false;
      const ende = () => { if (!fertig) { fertig = true; aufloesen(); } };
      const uhr = setTimeout(ende, maxMs);
      window.addEventListener('beforeunload', () => { clearTimeout(uhr); /* wir sterben gleich */ }, { once: true });
      // Bei Einzelseiten-Anwendungen aendert sich nur die URL
      const start = location.href;
      const takt = setInterval(() => {
        if (location.href !== start) { clearInterval(takt); clearTimeout(uhr); ende(); }
      }, 150);
      setTimeout(() => clearInterval(takt), maxMs);
    });
  }

  const zeilen = s => String(s || '').split('\n').map(t => t.trim()).filter(Boolean);

  async function pruefeErgebnis(rezept, geduld = 8000, probelauf = false, freigabeAb = false) {
    const fehlerListe = zeilen(rezept.fehlerText);
    const erfolgListe = zeilen(rezept.erfolgText);

    // Beim Trockenlauf wird der Freigabe-Klick ausgelassen. Die
    // Bestaetigungsseite kann also gar nicht erscheinen - auf das
    // Erfolgsmerkmal zu warten hiesse, jeden Trockenlauf als gescheitert zu
    // melden und damit die Notbremse auszuloesen. Geprueft wird darum nur, ob
    // das Portal bereits jetzt einen Fehler anzeigt.
    if (probelauf) {
      const text = document.body ? (document.body.innerText || '') : '';
      const fehler = fehlerListe.find(f => text.includes(f));
      return fehler
        ? { ok: false, meldung: `Portal meldet: "${fehler}"` }
        : { ok: true, meldung: 'Trockenlauf: alle Schritte bis zur Freigabe fehlerfrei' };
    }

    // Ohne Erfolgsmerkmal gibt es nichts abzuwarten.
    if (!erfolgListe.length && !fehlerListe.length) {
      return { ok: true, meldung: 'Alle Schritte durchgelaufen' };
    }

    // Bestaetigungsseiten brauchen oft einen Augenblick, bis die Meldung
    // steht. Darum wird bis zum Zeitlimit wiederholt nachgesehen. Ein
    // Fehlertext beendet die Suche sofort - er wird nicht besser.
    const ende = Date.now() + geduld;
    let text = '';
    while (Date.now() < ende) {
      text = document.body ? (document.body.innerText || '') : '';
      const fehler = fehlerListe.find(f => text.includes(f));
      if (fehler) return { ok: false, meldung: `Portal meldet: "${fehler}"` };
      if (!erfolgListe.length) return { ok: true, meldung: 'Kein Fehlertext auf der Seite' };
      const gefunden = erfolgListe.find(t => text.includes(t));
      if (gefunden) return { ok: true, meldung: `Erfolg bestaetigt: "${gefunden}"` };
      await schlaf(300);
    }
    // Kein Erfolgsmerkmal gefunden - und jetzt kommt es darauf an, ob der
    // Freigabe-Klick bereits abgesetzt wurde.
    //
    // Wurde er NICHT abgesetzt, ist am Antrag nichts geschehen: das ist ein
    // sauberer Fehler, den man gefahrlos wiederholen kann.
    //
    // Wurde er abgesetzt und die Bestaetigung bleibt trotzdem aus, ist der
    // Ausgang schlicht UNBEKANNT. Ihn als Fehler zu buchen waere die
    // gefaehrlichste Luege, die dieses Programm erzaehlen kann: das Portal
    // koennte die Freigabe laengst verbucht haben, und ein Wiederholungslauf
    // wuerde sie ein zweites Mal ausloesen. Solche Faelle bekommen einen
    // eigenen Zustand und muessen von Hand nachgesehen werden.
    if (freigabeAb) {
      return { unklar: true,
               meldung: `Freigabe wurde ausgeloest, Bestaetigung blieb aber aus `
                      + `(erwartet: "${erfolgListe.join('" oder "')}"). Bitte im Portal nachsehen.` };
    }
    return { ok: false,
             meldung: `Erfolgsmerkmal fehlt (erwartet: "${erfolgListe.join('" oder "')}")` };
  }

  // Nur die Schlusspruefung, ohne Schritte - wird gebraucht, wenn der letzte
  // Schritt einen Seitenwechsel ausgeloest hat und die Bestaetigungsseite
  // dieses Skript neu geladen hat.
  //
  // Hier gilt immer: der Freigabe-Klick ist bereits raus. Sonst waeren wir
  // nicht auf einer Folgeseite gelandet.
  async function nurPruefen(auftrag) {
    // Stand das Ergebnis schon fest, bevor der Rueckweg die Seite wechselte,
    // dann gilt es. Hier noch einmal die Seite zu befragen waere grob
    // irrefuehrend: wir stehen inzwischen auf der Uebersicht, und die weiss
    // nichts ueber den Antrag, der eben ausgelassen wurde oder scheiterte.
    if (auftrag.vorgemerkt) {
      statusZeigen(`${auftrag.antrag} &middot; abgeschlossen`, auftrag.vorgemerkt.meldung);
      await melde({ typ: 'antragFertig', ergebnis: auftrag.vorgemerkt });
      return;
    }

    statusZeigen(`${auftrag.antrag} &middot; pruefe Ergebnis`, '', true);

    // Zuerst die Sitzung pruefen. Ist sie weg, sagt die Seite nichts mehr
    // ueber den Antrag aus - sie zeigt ja nur noch die Anmeldemaske. Ein
    // "Erfolgsmerkmal fehlt" waere hier eine Falschaussage.
    const abgemeldet = sitzungWeg(auftrag.rezept);
    if (abgemeldet) {
      statusZeigen(`${auftrag.antrag} &middot; Sitzung abgelaufen`,
                   'Ausgang dieses Antrags ungeklaert.', true);
      await melde({ typ: 'sitzungAbgelaufen', erkanntAn: abgemeldet, freigabeAb: true });
      return;
    }

    const ergebnis = await pruefeErgebnis(auftrag.rezept, 8000, false, true);
    statusZeigen(`${auftrag.antrag} &middot; ${ergebnis.ok ? 'fertig' : 'Problem'}`, ergebnis.meldung);
    await melde({ typ: 'antragFertig', ergebnis });
  }

  // Steht die Anmeldeseite wieder da, ist die Sitzung abgelaufen.
  //
  // Das ist der gefaehrlichste Moment eines langen Laufs: das Portal zeigt
  // wieder die Anmeldung, und ein Roboter ohne diese Pruefung klickt
  // gutglaeubig weiter - ins Leere oder, schlimmer, auf gleichnamige Knoepfe
  // einer ganz anderen Maske. Darum wird die Sitzung VOR jedem Schritt
  // geprueft und der Lauf notfalls sofort angehalten.
  function sitzungWeg(rezept) {
    const marker = zeilen(rezept.sitzungsText);
    if (!marker.length) return null;
    const text = document.body ? (document.body.innerText || '') : '';
    return marker.find(m => text.includes(m)) || null;
  }

  async function spiele(auftrag) {
    const { rezept, antrag, werte, optionen, startAb } = auftrag;
    wiedergabeAktiv = true;
    abbruchGewuenscht = false;

    const schritte = rezept.schritte || [];
    let freigabeAusgelassen  = false;   // Trockenlauf hat den Schlussschritt ausgelassen
    let freigabeAusgefuehrt  = false;   // der Schlussschritt ist wirklich abgesetzt worden

    // Steht das Ergebnis vorzeitig fest - ausgelassen oder gescheitert -, wird
    // NICHT abgebrochen. Sonst bliebe der Roboter dort stehen, wo es schiefging,
    // und der naechste Antrag faende die Uebersicht nicht mehr vor. Stattdessen
    // laufen ab hier nur noch die als "immer" markierten Schritte weiter: der
    // Rueckweg zur Liste. Ueber Seitenwechsel hinweg wird dieser Merker im
    // Hintergrund gehalten.
    let vorgemerkt = auftrag.vorgemerkt || null;

    // Ergebnis festhalten, ohne den Antrag schon abzuschliessen.
    const vormerken = async ergebnis => {
      vorgemerkt = ergebnis;
      await melde({ typ: 'antragErgebnis', ergebnis });
    };

    // Wird der Lauf nach einem Seitenwechsel mitten im Rezept fortgesetzt,
    // liegt der Schlussschritt moeglicherweise schon hinter uns. Dann darf
    // dieser Antrag spaeter nicht mehr als gefahrlos wiederholbar gelten.
    for (let k = 0; k < startAb && k < schritte.length; k++) {
      if (schritte[k].endgueltig && !schritte[k].aus) {
        if (optionen.trockenlauf) freigabeAusgelassen = true;
        else                      freigabeAusgefuehrt = true;
      }
    }

    for (let i = startAb; i < schritte.length; i++) {
      const s = schritte[i];
      if (s.aus) continue;                       // im Panel deaktiviert

      // Ergebnis steht fest: nur noch den Rueckweg gehen.
      if (vorgemerkt && !s.immer) continue;

      // Im Trockenlauf entfaellt der endgueltige Schritt - und mit ihm alles,
      // was auf ihn folgt und ohne ihn gar nicht eintreten kann (etwa das
      // Abwarten der Bestaetigung). Der Rueckweg bleibt davon unberuehrt.
      if (optionen.trockenlauf && freigabeAusgelassen && !s.immer) continue;

      // Abgemeldet? Solange der Schlussschritt noch nicht abgesetzt ist, ist
      // am Antrag nichts geschehen - er bleibt offen und gilt NICHT als
      // Fehler. Ist die Freigabe dagegen schon raus, ist der Ausgang unklar.
      const abgemeldet = sitzungWeg(rezept);
      if (abgemeldet) {
        statusZeigen(`${antrag} &middot; Sitzung abgelaufen`,
                     freigabeAusgefuehrt
                       ? 'Ausgang dieses Antrags ungeklaert.'
                       : 'Bitte neu anmelden, danach im Panel auf Fortsetzen.', true);
        await melde({ typ: 'sitzungAbgelaufen', erkanntAn: abgemeldet,
                      freigabeAb: freigabeAusgefuehrt });
        wiedergabeAktiv = false;
        return;
      }

      const g  = schrittFuellen(s, werte);      // Platzhalter aufloesen
      const nr = `Schritt ${i + 1}/${schritte.length}`;
      statusZeigen(`${antrag} &middot; ${nr}`, `${g.aktion}: ${g.beschriftung || ''}`);

      // Endgueltige Schritte: Trockenlauf ueberspringt sie, Einzelbestaetigung fragt.
      if (g.endgueltig) {
        if (optionen.trockenlauf) {
          freigabeAusgelassen = true;
          await melde({ typ: 'schrittFertig', index: i, ergebnis: 'im Trockenlauf uebersprungen' });
          continue;
        }
        if (optionen.einzelbestaetigung) {
          statusZeigen(`${antrag} &middot; wartet auf Bestaetigung`, s.beschriftung, true);
          const wahl = await frageNach(antrag, g.beschriftung || g.aktion);
          if (wahl === 'stopp') {
            await melde({ typ: 'lauferAnhalten', grund: 'Vom Bediener angehalten' });
            wiedergabeAktiv = false; statusWeg(); return;
          }
          if (wahl === 'ueberspringen') {
            await melde({ typ: 'antragFertig', ergebnis: { ok: null, meldung: 'Vom Bediener uebersprungen' } });
            wiedergabeAktiv = false; statusWeg(); return;
          }
        }
      }

      await melde({ typ: 'schrittBeginn', index: i });
      try {
        const ergebnis = await fuehreAus(g, werte);
        // Ab hier ist die Freigabe unwiderruflich draussen.
        if (g.endgueltig) freigabeAusgefuehrt = true;
        await melde({ typ: 'schrittFertig', index: i, ergebnis });
      } catch (fehler) {
        // Eine nicht erfuellte Vorbedingung ist kein Fehler, sondern eine
        // Feststellung: dieser Antrag ist noch nicht so weit. Er wird
        // ausgelassen, faellt NICHT der Notbremse zur Last, und kann spaeter
        // erneut drankommen.
        if (fehler.vorbedingung) {
          statusZeigen(`${antrag} &middot; ausgelassen`, fehler.message);
          await vormerken({ ok: null, meldung: fehler.message });
          continue;                       // Rueckweg noch gehen
        }
        // Bevor ein technisches "Element nicht gefunden" ins Protokoll wandert:
        // nachsehen, ob das Portal den Grund im Klartext auf der Seite stehen
        // hat. "Antrag bereits bearbeitet" ist eine brauchbare Auskunft,
        // "Element nicht gefunden" ist keine.
        const seitentext = document.body ? (document.body.innerText || '') : '';
        const portalFehler = zeilen(rezept.fehlerText).find(f => seitentext.includes(f));
        const meldung = portalFehler
          ? `Portal meldet: "${portalFehler}"`
          : fehler.message;

        // Scheitert ein Schritt NACH der Freigabe - etwa die Bestaetigungs-
        // pruefung oder der Rueckweg zur Liste -, dann ist am Antrag sehr wohl
        // etwas geschehen. "Fehler" waere die falsche Auskunft und wuerde zu
        // einem Wiederholungslauf einladen, der die Freigabe verdoppeln kann.
        if (freigabeAusgefuehrt) {
          statusZeigen(`${antrag} &middot; Ausgang unklar`, meldung, true);
          await vormerken({ unklar: true,
            meldung: `Freigabe war bereits ausgeloest, danach: ${meldung}` });
          continue;                       // Rueckweg noch gehen
        }

        statusZeigen(`${antrag} &middot; Fehler`, meldung, true);
        await vormerken({ ok: false, meldung });
        continue;                         // Rueckweg noch gehen
      }

      const pause = Number(optionen.pauseSchritt) || 0;
      if (pause) await schlaf(pause);
      if (g.navigiert) await warteAufSeitenwechsel(NAV_ZEITLIMIT);
    }

    const ergebnis = vorgemerkt
      || await pruefeErgebnis(rezept, 8000, freigabeAusgelassen, freigabeAusgefuehrt);
    statusZeigen(`${antrag} &middot; ${ergebnis.ok ? 'fertig' : 'Problem'}`, ergebnis.meldung);
    await melde({ typ: 'antragFertig', ergebnis });
    wiedergabeAktiv = false;
  }

  /* ------------------------------------------------------------------ *
   * Element auswaehlen lassen                                           *
   * ------------------------------------------------------------------ */
  let waehlenAktiv = false;

  function elementWaehlenStarten() {
    if (waehlenAktiv) return;
    waehlenAktiv = true;
    statusZeigen('Element waehlen', 'Klicke das gewuenschte Element an. Esc bricht ab.', true);

    let letztes = null;
    const hervor = ev => {
      if (letztes) letztes.style.outline = '';
      letztes = ev.target;
      if (letztes && letztes.style) letztes.style.outline = '3px solid #f97316';
    };
    const aufraeumen = () => {
      waehlenAktiv = false;
      if (letztes) letztes.style.outline = '';
      document.removeEventListener('mouseover', hervor, true);
      document.removeEventListener('click', gewaehlt, true);
      document.removeEventListener('keydown', abbrechen, true);
      statusWeg();
    };
    const abbrechen = ev => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault(); ev.stopPropagation();
      aufraeumen();
      melde({ typ: 'elementGewaehlt', abgebrochen: true });
    };
    const gewaehlt = ev => {
      // Der Klick darf die Seite nicht bedienen - er dient nur der Auswahl.
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      const el = ev.target;
      const { zustand, grund } = markerZustand(el);
      aufraeumen();
      melde({ typ: 'elementGewaehlt',
              selektoren: selektorKette(el),
              beschriftung: normText(beschriftung(el)) || el.tagName.toLowerCase(),
              text: normText(beschriftung(el)),
              zustand, grund });
    };

    document.addEventListener('mouseover', hervor, true);
    document.addEventListener('click', gewaehlt, true);
    document.addEventListener('keydown', abbrechen, true);
  }

  /* ------------------------------------------------------------------ *
   * Uebersicht auslesen                                                 *
   * ------------------------------------------------------------------ *
   * Statt Antragsnummern von Hand einzutippen, holt sich der Roboter die
   * Liste aus dem Portal und legt sie dem Menschen zur Auswahl vor. Damit
   * entfaellt die haeufigste Fehlerquelle beim Stapelbetrieb: die falsch
   * abgetippte Nummer.
   */
  function tabelleErnten(statusWert) {
    // Die groesste Tabelle der Seite ist die Trefferliste. Nebentabellen
    // (Kopfzeilen, Summen, Legenden) haben stets weniger Zeilen.
    const anwaerter = [...document.querySelectorAll('table, [role="grid"], [role="table"]')]
      .filter(istSichtbar)
      .map(t => ({ t, n: t.querySelectorAll('tr, [role="row"]').length }))
      .sort((a, b) => b.n - a.n);
    if (!anwaerter.length || anwaerter[0].n < 2) {
      throw new Error('Auf dieser Seite ist keine Tabelle zu finden. '
                    + 'Bitte zuerst die Allgemeine Foerderfalluebersicht oeffnen.');
    }
    const tabelle = anwaerter[0].t;

    const kopfZeile = tabelle.querySelector('thead tr, [role="row"]');
    const spalten = [...(kopfZeile?.querySelectorAll('th, [role="columnheader"]') || [])]
      .map(c => normText(c.innerText));

    const koerper = tabelle.querySelector('tbody') || tabelle;
    const zeilen = [...koerper.querySelectorAll('tr, [role="row"]')].filter(z => {
      if (!istSichtbar(z)) return false;
      return z.querySelectorAll('td, [role="gridcell"], [role="cell"]').length > 0;
    });

    const gesuchterStatus = normText(statusWert).toLowerCase();
    const ausbeute = [];
    for (const z of zeilen) {
      const zellen = [...z.querySelectorAll('td, [role="gridcell"], [role="cell"]')]
        .map(c => normText(c.innerText));
      if (!zellen.length) continue;

      const satz = {};
      zellen.forEach((w, i) => { satz[spalten[i] || `Spalte${i + 1}`] = w; });

      if (gesuchterStatus) {
        // Der Status steht ueblicherweise in der letzten Spalte; sicherheits-
        // halber wird die ganze Zeile befragt.
        const passt = zellen.some(w => w.toLowerCase() === gesuchterStatus)
                   || normText(z.innerText).toLowerCase().includes(gesuchterStatus);
        if (!passt) continue;
      }
      ausbeute.push({ zellen, satz });
    }

    return { spalten, zeilen: ausbeute, gesamt: zeilen.length, url: location.href };
  }

  /* ------------------------------------------------------------------ *
   * Nachrichten vom Hintergrund / Panel                                 *
   * ------------------------------------------------------------------ */
  chrome.runtime.onMessage.addListener((nachricht, absender, antworten) => {
    switch (nachricht.typ) {
      case 'aufnahmeStarten':  aufnahmeStarten();  antworten({ ok: true, url: location.href }); break;
      case 'aufnahmeBeenden':  aufnahmeBeenden();  antworten({ ok: true }); break;
      case 'spielen':          spiele(nachricht.auftrag); antworten({ ok: true }); break;
      case 'anhalten':
        abbruchGewuenscht = true;
        statusZeigen('angehalten', nachricht.grund || '');
        antworten({ ok: true });
        break;
      case 'statusWeg':        statusWeg(); antworten({ ok: true }); break;
      case 'lebt':
        antworten({ ok: true, url: location.href, titel: document.title,
                    beschaeftigt: wiedergabeAktiv });
        break;

      // Der Hintergrund fasst nach, weil die Seite sich nicht gemeldet hat.
      case 'meldeDich':
        antworten({ ok: true, beschaeftigt: wiedergabeAktiv });
        if (!wiedergabeAktiv) beimHintergrundMelden();
        break;
      // Ein Element in der Seite anklicken lassen und seinen Selektor melden.
      // Vorbedingungen kann der Rekorder nicht mitschneiden - "pruefe, ob
      // dieses Feld gruen ist" ist kein Klick. Also zeigt der Mensch darauf.
      case 'elementWaehlen': {
        elementWaehlenStarten();
        antworten({ ok: true });
        break;
      }

      // Die Uebersicht auslesen, damit der Mensch daraus auswaehlen kann.
      case 'tabelleErnten': {
        try { antworten(tabelleErnten(nachricht.statusWert)); }
        catch (f) { antworten({ fehler: f.message }); }
        break;
      }

      // Zum Pruefen eines Selektors aus dem Panel heraus
      case 'selektorTesten': {
        const t = trefferFuer(nachricht.schritt);
        if (t) { t.el.scrollIntoView({ block: 'center' });
                 t.el.style.outline = '3px solid #f97316';
                 setTimeout(() => { t.el.style.outline = ''; }, 2500); }
        antworten({ gefunden: !!t, via: t?.via || null });
        break;
      }
      default: antworten({ ok: false, grund: 'unbekannt' });
    }
    return true;
  });

  /* ------------------------------------------------------------------ *
   * Start: beim Hintergrund melden und ggf. weitermachen                *
   * ------------------------------------------------------------------ *
   * Das ist der Kern der Seitenwechsel-Festigkeit. Nach jeder Navigation
   * laeuft dieser Block erneut - und holt sich den Auftrag dort ab, wo er
   * unterbrochen wurde.
   */
  async function beimHintergrundMelden() {
    if (wiedergabeAktiv) return;        // laeuft schon, nicht doppelt anstossen
    const antwort = await melde({ typ: 'seiteBereit', url: location.href, titel: document.title });
    if (!antwort) return;
    if (antwort.modus === 'aufnahme') {
      aufnahmeStarten();
    } else if (antwort.modus === 'wiedergabe' && antwort.auftrag) {
      await schlaf(Number(antwort.auftrag.optionen?.pauseSeite) || 300);
      spiele(antwort.auftrag);
    } else if (antwort.modus === 'pruefen' && antwort.auftrag) {
      nurPruefen(antwort.auftrag);
    }
  }

  // Nach aussen sichtbar, damit eine erneute Einspritzung hier andocken kann.
  window.__antragsroboterNeuMelden = beimHintergrundMelden;

  beimHintergrundMelden();

  /* ------------------------------------------------------------------ *
   * Rueckkehr aus dem Vor-/Zurueck-Speicher                             *
   * ------------------------------------------------------------------ *
   * Der Browser haelt besuchte Seiten vor (bfcache). Geht man mit dem
   * Zurueck-Knopf dorthin, wird die Seite NICHT neu aufgebaut - dieses
   * Skript laeuft dann kein zweites Mal an und meldet sich nie zurueck.
   * Der Lauf bliebe stehen, bis der Wachhund anschlaegt, und ein laengst
   * erledigter Antrag landete faelschlich als Fehler im Protokoll.
   *
   * Genau das passierte in der Pruefung bei jedem vierten Antrag. Darum
   * wird die Rueckkehr aus dem Zwischenspeicher ausdruecklich abgefangen.
   */
  // Wird diese Seite in den Zwischenspeicher gelegt, muss eine hier noch
  // laufende Wiedergabe ABGEBROCHEN werden.
  //
  // Sonst passiert Folgendes: Die Uebersicht startet Schritt 1, der zur
  // Antragsseite fuehrt. Die Uebersicht wird dabei eingefroren - mitsamt
  // ihrer haengenden Wiedergabe. Kommt der Roboter spaeter mit dem
  // Zurueck-Knopf hierher zurueck, taut diese alte Wiedergabe wieder auf,
  // haelt die Sperre gesetzt und wartet auf einen Seitenwechsel, der nie
  // mehr kommt. Der Lauf steht, bis der Wachhund anschlaegt - und ein
  // erledigter Antrag landet als Fehler im Protokoll.
  //
  // Der Fortschritt liegt ohnehin im Hintergrund. Hier etwas aufzubewahren,
  // waere bestenfalls ueberfluessig und schlimmstenfalls falsch.
  window.addEventListener('pagehide', () => {
    abbruchGewuenscht = true;
    wiedergabeAktiv   = false;
  });

  window.addEventListener('pageshow', ereignis => {
    if (!ereignis.persisted) return;    // normaler Aufbau laeuft oben schon
    // Aus dem Zwischenspeicher zurueck: sauber von vorn beim Hintergrund
    // anfragen, statt an einer alten Wiedergabe weiterzustricken.
    abbruchGewuenscht = false;
    wiedergabeAktiv   = false;
    // Nach aussen sichtbar, damit eine erneute Einspritzung hier andocken kann.
  window.__antragsroboterNeuMelden = beimHintergrundMelden;

  beimHintergrundMelden();
  });

  // Einzelseiten-Anwendungen wechseln die Ansicht ohne Seitenaufbau. Auch
  // dann muss der Roboter sich wieder melden, wenn er gerade nichts tut.
  window.addEventListener('popstate', () => {
    if (wiedergabeAktiv || aufnahmeAktiv) return;
    setTimeout(beimHintergrundMelden, 150);
  });
})();
