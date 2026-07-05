# SAP_JOULE

Sammel-Repository rund um **SAP Joule**, SAPs generativen KI-Assistenten
(Copilot). Es bündelt mehrere Bausteine: eine Python-Baseline für Integrations-
und Tooling-Code sowie einsatzfertige **ABAP-Vorlagen** für das SAP-System.

## Was ist SAP Joule?

[SAP Joule](https://www.sap.com/products/artificial-intelligence/ai-assistant.html)
ist SAPs KI-Copilot, der in SAPs Unternehmensanwendungen eingebettet ist und
Nutzer per natürlicher Sprache bei ihrer Arbeit unterstützt.

## Inhalt des Repositorys

| Bereich | Ort | Beschreibung |
|---------|-----|--------------|
| Python-Baseline | `src/sap_joule/`, `tests/`, `pyproject.toml` | Ausbaufähige Projektstruktur für Integrations-/Tooling-Code |
| ABAP: ALV-Grid mit Checkbox | `src/zr_alv_checkbox_subdynpro.*`, `ddic/ZALV_DEMO.tabl.md` | Editierbares ALV-Grid mit Checkbox + 3 String-Feldern als Subdynpro |
| ABAP: CSV → Datenelemente/Domänen | `Z_CSV_CREATE_DTEL_DOMA.abap`, `beispiel_datenelemente.csv` | Anlage von DDIC-Datenelementen und Domänen aus einer CSV |

---

## Python-Baseline

Requires Python 3.10+.

```
.
├── src/sap_joule/      # Anwendungspaket
│   ├── __init__.py
│   ├── __main__.py     # `python -m sap_joule` Einstiegspunkt
│   └── config.py       # umgebungsgesteuerte Konfiguration
├── tests/              # pytest-Testsuite
├── pyproject.toml      # Projekt-Metadaten + Tooling (ruff, pytest)
├── .env.example        # Beispiel-Umgebungsvariablen
└── .gitignore
```

```bash
# virtuelle Umgebung anlegen und aktivieren
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

# Paket inkl. Dev-Tooling installieren
pip install -e ".[dev]"

# Umgebungsvariablen kopieren und ausfüllen
cp .env.example .env

# CLI starten
python -m sap_joule
```

Entwicklung:

```bash
ruff check .        # Lint
ruff format .       # Format
pytest              # Tests
```

Die Konfiguration wird aus Umgebungsvariablen gelesen (siehe `.env.example`).
Diese Baseline kontaktiert noch kein Live-SAP-Endpoint — `config.py` lädt und
validiert lediglich Einstellungen als zentraler Startpunkt für Integrationscode.

---

## ABAP-Vorlage: ALV-Grid mit Checkbox + 3 String-Feldern als Subdynpro

Editierbares **ALV-Grid** (`CL_GUI_ALV_GRID`) mit einer **Checkbox**-Spalte und
**3 String-Feldern**. Das Grid wird in einem **Subdynpro (Subscreen)**
dargestellt; die Einträge werden über eine Datenbanktabelle persistiert.

| Datei | Zweck |
|-------|-------|
| `ddic/ZALV_DEMO.tabl.md` | DDIC-Definition der Datenbanktabelle (SE11) |
| `src/zr_alv_checkbox_subdynpro.prog.abap` | Report mit ALV-Logik, Modulen und Formroutinen |
| `src/zr_alv_checkbox_subdynpro.screens.txt` | Ablauflogik der Dynpros 0100/0110 + GUI-Status |

**Einrichtung im SAP-System**

1. **Tabelle** `ZALV_DEMO` in SE11 gemäß `ddic/ZALV_DEMO.tabl.md` anlegen und aktivieren.
2. **Report** `ZR_ALV_CHECKBOX_SUBDYNPRO` in SE38 anlegen und den Quelltext aus `src/zr_alv_checkbox_subdynpro.prog.abap` einfügen.
3. **Dynpro 0100** (Normal) in SE51 anlegen, Subscreen-Bereich `SUB_AREA` ins Layout setzen, OK-Code-Feld = `GV_OKCODE`, Ablauflogik gemäß `screens.txt`.
4. **Dynpro 0110** (Typ *Subscreen*) anlegen, Custom-Control `CC_ALV` ins Layout setzen, Ablauflogik gemäß `screens.txt`.
5. **GUI-Status** `STATUS_0100` und **Titel** `TITLE_0100` in SE41 mit den Funktionscodes `SAVE`, `ADD`, `DELETE`, `BACK`, `EXIT`, `CANCEL` anlegen.
6. Report starten.

Funktionsumfang: Anzeige/Pflege im editierbaren ALV-Grid, Checkbox-Spalte `FLAG`
plus drei editierbare String-Spalten, **SAVE** (`MODIFY`/`DELETE` auf `ZALV_DEMO`
+ `COMMIT WORK`), **ADD** (neue Leerzeile), **DELETE** (markierte Zeilen), ALV
vollständig im Subdynpro (`CALL SUBSCREEN`).

---

## ABAP-Report: Datenelemente & Domänen aus CSV anlegen (`Z_CSV_CREATE_DTEL_DOMA`)

ABAP-Report, der aus einer CSV-Datei Domänen und gleichnamige Datenelemente
im SAP Data Dictionary anlegt und aktiviert.

### Was macht das Programm?

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

### Aufbau der CSV-Datei

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

### Selektionsbild

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

### Hinweise

- Die Namen müssen im Kundennamensraum liegen (beginnen mit `Y`, `Z` oder `/`).
- Das Programm muss im SAP-System (SE38/SE80) angelegt und gegen ein
  Frontend mit GUI ausgeführt werden, da die CSV über `GUI_UPLOAD` gelesen wird.
- Die Ausgabelänge der Domäne wird von DDIC bei der Aktivierung automatisch
  und typgerecht ermittelt (`OUTPUTLEN` wird vom Programm nicht vorgegeben).

---

## Contributing

Änderungen als Issue oder Pull Request vorschlagen.
