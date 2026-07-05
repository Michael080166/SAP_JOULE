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

## ABAP-Report: Datenelemente & Domänen aus CSV anlegen

Siehe `Z_CSV_CREATE_DTEL_DOMA.abap` und die Beispieldatei
`beispiel_datenelemente.csv`. Der Report liest eine CSV ein und legt daraus
DDIC-**Datenelemente** und **Domänen** an (inkl. Transportauftrags-Zuordnung).

---

## Contributing

Änderungen als Issue oder Pull Request vorschlagen.
