# SAP_JOULE

A starting point for a project related to **SAP Joule**, SAP's generative-AI
assistant (copilot). This repository was initialized with a baseline structure
and is ready to be built out.

## What is SAP Joule?

[SAP Joule](https://www.sap.com/products/artificial-intelligence/ai-assistant.html)
is SAP's AI copilot, embedded across SAP's enterprise applications to help users
get work done through natural-language interaction.

---

# ABAP-Vorlage: ALV-Grid mit Checkbox + 3 String-Feldern als Subdynpro

Einmalige Vorlage für ein editierbares **ALV-Grid** (`CL_GUI_ALV_GRID`) mit
einer **Checkbox**-Spalte und **3 String-Feldern**. Das Grid wird in einem
**Subdynpro (Subscreen)** dargestellt und die Einträge werden über eine
Datenbanktabelle als **Datenbank-Schnittstelle** persistiert.

## Inhalt

| Datei | Zweck |
|-------|-------|
| `ddic/ZALV_DEMO.tabl.md` | DDIC-Definition der Datenbanktabelle (SE11) |
| `src/zr_alv_checkbox_subdynpro.prog.abap` | Report mit ALV-Logik, Modulen und Formroutinen |
| `src/zr_alv_checkbox_subdynpro.screens.txt` | Ablauflogik der Dynpros 0100/0110 + GUI-Status |

## Einrichtung im SAP-System

1. **Tabelle** `ZALV_DEMO` in SE11 gemäß `ddic/ZALV_DEMO.tabl.md` anlegen
   und aktivieren.
2. **Report** `ZR_ALV_CHECKBOX_SUBDYNPRO` in SE38 anlegen und den Quelltext
   aus `src/zr_alv_checkbox_subdynpro.prog.abap` einfügen.
3. **Dynpro 0100** (Normal) in SE51 anlegen, Subscreen-Bereich `SUB_AREA`
   ins Layout setzen, OK-Code-Feld = `GV_OKCODE`, Ablauflogik gemäß
   `screens.txt`.
4. **Dynpro 0110** (Typ *Subscreen*) anlegen, Custom-Control `CC_ALV`
   ins Layout setzen, Ablauflogik gemäß `screens.txt`.
5. **GUI-Status** `STATUS_0100` und **Titel** `TITLE_0100` in SE41 mit den
   Funktionscodes `SAVE`, `ADD`, `DELETE`, `BACK`, `EXIT`, `CANCEL` anlegen.
6. Report starten.

## Funktionsumfang

- Anzeige/Pflege der Daten im editierbaren ALV-Grid
- Checkbox-Spalte `FLAG` sowie drei editierbare String-Spalten
- **SAVE**: `MODIFY`/`DELETE` auf `ZALV_DEMO` + `COMMIT WORK`
- **ADD**: neue Leerzeile
- **DELETE**: markierte Zeilen entfernen (auch aus der DB beim Sichern)
- ALV läuft vollständig im Subdynpro (Einbindung per `CALL SUBSCREEN`)
