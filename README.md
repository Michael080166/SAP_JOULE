# SAP_JOULE

A starting point for a project related to **SAP Joule**, SAP's generative-AI
assistant (copilot). This repository was initialized with a baseline structure
and is ready to be built out.

## Status

🚧 Early scaffold — no application code yet. The direction (language, framework,
and scope) is still open.

## What is SAP Joule?

[SAP Joule](https://www.sap.com/products/artificial-intelligence/ai-assistant.html)
is SAP's AI copilot, embedded across SAP's enterprise applications to help users
get work done through natural-language interaction.

## Getting started

This repo currently contains only baseline files. Typical next steps:

1. Decide the stack (e.g. Python, TypeScript/Node, Java).
2. Add project tooling (dependency manifest, linter, formatter, tests).
3. Build out the application or integration code.

## Contributing

Open an issue or pull request to propose changes.

---

# Z_CSV_CREATE_DTEL_DOMA

ABAP-Report, der aus einer CSV-Datei Domänen und gleichnamige Datenelemente
im SAP Data Dictionary anlegt und aktiviert.

## Was macht das Programm?

Für jede Zeile der CSV-Datei wird:

1. eine **Domäne** mit Datentyp, Anzahl Stellen, Dezimalstellen, Vorzeichen
   und Kleinbuchstaben-Kennzeichen angelegt (`DDIF_DOMA_PUT`). Die Domäne
   trägt den **gleichen Namen** wie das Datenelement, ist dessen Typ und
   erhält **dieselbe Beschreibung wie das Datenelement, mit vorangestelltem
   „Domäne"** (z. B. Datenelement „Kundennummer" → Domäne „Domäne Kundennummer").
2. ein **Datenelement** unter gleichem Namen angelegt, das auf diese
   Domäne verweist, inkl. Kurzbeschreibung und den vier Feldbezeichnungen
   (`DDIF_DTEL_PUT`),
3. beides in den Objektkatalog (TADIR) eingetragen und **aktiviert**.

Die Längenangaben (Stellen, Dezimalstellen sowie die Längen der
Feldbezeichnungen) werden über den **ALPHA-Eingabe-Exit**
(`CONVERSION_EXIT_ALPHA_INPUT`) rechtsbündig mit führenden Nullen übertragen,
wie es die DDIC-Strukturen `DD01V`/`DD04V` erwarten. Die **Ausgabelänge
(`OUTPUTLEN`)** wird bewusst **nicht** selbst gesetzt, sondern von DDIC bei der
Aktivierung typgerecht berechnet – nur so stimmt sie z. B. für `CURR`/`QUAN`/`DEC`
(Tausender-Trennzeichen, Dezimalkomma, Vorzeichen). Eine selbst gesetzte,
abweichende Ausgabelänge führt sonst zu einem Format-/Konsistenzfehler.

## Aufbau der CSV-Datei

Trennzeichen ist standardmäßig `;` (über Parameter `P_SEP` änderbar). Eine
optionale Kopfzeile kann über `P_HEAD` übersprungen werden.

| # | Spalte           | Bedeutung                                   |
|---|------------------|---------------------------------------------|
| 1 | NAME             | Name von Datenelement **und** Domäne        |
| 2 | BEZEICHNUNG      | Kurzbeschreibung (DDTEXT)                    |
| 3 | DATENTYP         | z. B. CHAR, NUMC, DEC, CURR, QUAN, DATS, INT4 |
| 4 | STELLEN          | Anzahl Stellen (Länge)                      |
| 5 | DEZIMALSTELLEN   | Anzahl Dezimalstellen                       |
| 6 | VORZEICHEN       | `X` = mit Vorzeichen, sonst leer            |
| 7 | KLEINBUCHSTABEN  | `X` = Kleinbuchstaben erlaubt, sonst leer   |
| 8 | FELD_KURZ        | Feldbezeichnung kurz (max. 10)              |
| 9 | FELD_MITTEL      | Feldbezeichnung mittel (max. 20)            |
| 10| FELD_LANG        | Feldbezeichnung lang (max. 40)              |
| 11| FELD_UEBERSCHRIFT| Feldbezeichnung Überschrift (max. 55)       |

Sind die Spalten 8–11 leer, werden die Feldbezeichnungen aus der
Bezeichnung (Spalte 2) abgeleitet.

Beispieldaten siehe [`beispiel_datenelemente.csv`](beispiel_datenelemente.csv).

## Selektionsbild

| Parameter | Bedeutung                                            |
|-----------|------------------------------------------------------|
| P_FILE    | Pfad zur CSV-Datei (F4-Hilfe vorhanden)              |
| P_SEP     | Trennzeichen (Default `;`)                           |
| P_HEAD    | Erste Zeile ist Kopfzeile und wird übersprungen      |
| P_DEV     | Entwicklungsklasse / Paket (Default `$TMP`)          |
| P_ORDER   | Transportauftrag, dem die Objekte zugeordnet werden (F4-Hilfe vorhanden) |
| P_TEST    | Testlauf – es wird nur geprüft, **nichts angelegt**  |

> **Hinweis:** Zum tatsächlichen Anlegen muss `P_TEST` deaktiviert werden.
> Bei einem Paket ungleich `$TMP` ist ein Transportauftrag (`P_ORDER`)
> erforderlich. Über die F4-Hilfe lässt sich ein Workbench-Auftrag auswählen;
> Domäne und Datenelement werden per `RS_CORR_INSERT` diesem Auftrag
> zugeordnet. Bleibt `P_ORDER` leer und das Paket ist transportfähig, fragt
> das System den Auftrag interaktiv ab.

## Hinweise

- Die Namen müssen im Kundennamensraum liegen (beginnen mit `Y`, `Z` oder `/`).
- Das Programm muss im SAP-System (SE38/SE80) angelegt und gegen ein
  Frontend mit GUI ausgeführt werden, da die CSV über `GUI_UPLOAD` gelesen wird.
- Die Ausgabelänge der Domäne wird von DDIC bei der Aktivierung automatisch
  und typgerecht ermittelt (`OUTPUTLEN` wird vom Programm nicht vorgegeben).
