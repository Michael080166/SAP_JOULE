# Modales Info-Dynpro — Einrichtung

Report: **`ZSAP_JOULE_INFO_DYNPRO`** (`src/zsap_joule_info_dynpro.prog.abap`)

Zeigt einen mehrteiligen Informationstext in einem **modalen Dynpro**
(Modal Dialog Box) über ein scrollbares `CL_GUI_TEXTEDIT`-Control an.

Da Dynpros (Screen Painter) und GUI-Status/Titel nicht als reine `.abap`-Datei
lauffähig sind, hier die Schritte in der ABAP Workbench (SE80 / SE51 / SE41).

## 1. Report anlegen
- SE38/SE80 → Programm `ZSAP_JOULE_INFO_DYNPRO` anlegen (Typ *Ausführbares Programm*).
- Quelltext aus `zsap_joule_info_dynpro.prog.abap` einfügen.

## 2. Dynpro 0100 anlegen (SE51)
- Dynpro-Nummer **0100**.
- Dynpro-Attribute → **Dynpro-Typ = „Modales Dialogfenster"**.
- Empfohlene Fenstergröße: ca. 80 Spalten × 20 Zeilen.

### Layout / Elemente
- Ein **Custom Control** platzieren, Name: **`CC_INFO`** (füllt möglichst die
  ganze Fläche des Fensters).

### Ablauflogik (Flow Logic) des Dynpros 0100
```abap
PROCESS BEFORE OUTPUT.
  MODULE status_0100.

PROCESS AFTER INPUT.
  MODULE user_command_0100.
```

## 3. GUI-Status `STATUS_0100` (SE41 / im Screen Painter)
- Statustyp: **Dialogfenster**.
- Funktionscodes (mind. eine „OK"-Taste):
  - `OK`   → Text „OK", z. B. auf Drucktaste + Enter (Empf.-Funktion).
  - `CANC` → auf die Abbrechen-Taste (rotes X) legen.
  - `ESC`  → auf die Beenden/Escape-Funktion legen.
- Titel `TB_0100` mit einem Parameter `&1` anlegen (wird per
  `SET TITLEBAR 'TB_0100' WITH gv_title` gefüllt).

## 4. Ausführen
- Report starten → Selektionsbild → Häkchen „Info-Dialog anzeigen" → F8.
- Das modale Fenster erscheint mittig als Popup und zeigt den
  mehrteiligen Text. Schließen über **OK** / **Abbrechen** / **Esc**.

## Text anpassen
Der Text wird in `FORM build_info_text` zusammengesetzt. Über die lokale
Klasse `lcl_info_text`:
- `add_heading( 'Überschrift' )` — Überschrift + Trennlinie
- `add_part( VALUE #( ( `Zeile 1` ) ( `Zeile 2` ) ) )` — ein Textteil
- `add_blank_line( )` — Leerzeile zwischen den Teilen

So lassen sich beliebig viele Teile zu einem Gesamttext kombinieren.
