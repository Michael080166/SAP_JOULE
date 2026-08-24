# Prüfungen

End-zu-End-Prüfungen der Erweiterung gegen die Übungsportale. Sie laden die
Erweiterung in ein echtes Chromium und spielen vollständige Durchläufe ab —
es wird nichts nachgestellt oder vorgetäuscht.

## Voraussetzungen

```bash
npm install -g playwright http-server
npx playwright install chromium
```

## Ausführen

```bash
# Übungsportale bereitstellen (in einem eigenen Fenster laufen lassen)
npx http-server -p 8899 -a 127.0.0.1 ../uebungsportal

# dann die Prüfungen
node 01-grundlagen.mjs        # Aufnahme, Platzhalter, Trockenlauf, Notbremse
node 02-sitzungsende.mjs      # Sitzung stirbt mitten im Stapel
node 03-wohnweb-ablauf.mjs    # der WohnWeb-Ablauf mit Vorbedingungen
```

Rückgabewert 0 = bestanden.

## Was jede Prüfung absichert

**01-grundlagen** — Aufzeichnen eines Vorgangs über zwei Seitenwechsel,
Reihenfolge der Schritte, Kennwörter werden nicht gespeichert, Platzhalter
ersetzen auch Selektoren und Suchtexte, Trockenlauf gibt nichts frei, echter
Lauf gibt jeden Antrag frei und weist es nach, Notbremse hält nach *n*
Fehlern, Fortsetzen danach.

**02-sitzungsende** — Mitten im Stapel wird die Anmeldung entzogen. Sichert
den Punkt ab, an dem ein Roboter am meisten Schaden anrichtet: Eine bereits
erteilte Freigabe darf **niemals** als „Fehler" im Protokoll stehen — sonst
wird sie in einem Wiederholungslauf ein zweites Mal erteilt. Sie wird
stattdessen `unklar` und nie erneut angefasst.

**03-wohnweb-ablauf** — Der Ablauf aus WohnWeb: Übersicht auslesen, nach
Status filtern, Zeile über das Aktenzeichen finden (die Adressen enthalten nur
GUIDs), zwei Prüfmerkmale auswerten, Dialog mit Pflichtfeld, Rückweg zur
Liste. Zwei der zwölf Fälle sind absichtlich nicht freigabereif. Geprüft wird
am Ende Antrag für Antrag, ob Protokoll und Portalzustand deckungsgleich sind.

## Alles auf einmal

```bash
npm install          # einmalig
node alle.mjs        # Server hoch, alle drei Prüfungen, Server runter
```

Einzeln oder wiederholt:

```bash
node alle.mjs 03           # nur den WohnWeb-Ablauf
node alle.mjs 03 03 03 03  # viermal hintereinander
```

Die Wiederholung ist kein Luxus. Zwei der schwersten Fehler in diesem
Programm traten nur bei jedem dritten bis vierten Durchlauf auf — ein
einzelner grüner Lauf hätte beide durchgewinkt.

## Warum playwright fest verdrahtet ist

`package.json` nennt eine genaue Version statt eines Bereichs. Jede
Playwright-Fassung erwartet ihren eigenen Chromium-Bau; ein stiller
Versionssprung führt sonst zu Fehlschlägen, die nichts mit dem Roboter zu
tun haben. Beim Anheben der Version einmal `npx playwright install chromium`
nachziehen.
