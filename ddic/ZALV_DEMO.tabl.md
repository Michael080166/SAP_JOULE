# DDIC-Definition: Transparente Tabelle `ZALV_DEMO`

Diese Tabelle ist die "Datenbank-Schnittstelle", in der die ALV-Einträge
(Checkbox + 3 String-Felder) persistent gespeichert werden.

Im SAP-System über **SE11** anlegen (Auslieferungsklasse `A`,
Data-Browser/Table-View-Pflege = "Anzeige/Pflege erlaubt").

| Feld       | Key | Datenelement / Typ      | Länge | Beschreibung                    |
|------------|-----|-------------------------|-------|---------------------------------|
| MANDT      | X   | MANDT (CLNT)            | 3     | Mandant                         |
| KEY_ID     | X   | CHAR                    | 10    | Schlüssel / Positionsnummer     |
| FLAG       |     | XFELD (CHAR)            | 1     | Checkbox ('X' = markiert)       |
| TEXT1      |     | CHAR / STRING           | 60    | String-Feld 1                   |
| TEXT2      |     | CHAR / STRING           | 60    | String-Feld 2                   |
| TEXT3      |     | CHAR / STRING           | 60    | String-Feld 3                   |

> Hinweis: Echte `STRING`-Felder sind im ALV-Grid nur eingeschränkt
> editierbar. Für das editierbare ALV-Grid werden hier `CHAR`-Felder
> (Domäne mit Länge 60) verwendet. Die Fachlogik ("String-Felder") bleibt
> erhalten. Wer echte `STRING`-Spalten benötigt, legt sie als `STRING` im
> DDIC an und deaktiviert die Inline-Editierbarkeit dieser Spalten.

DDL-ähnliche Kurzform:

```
@EndUserText.label : 'ALV-Demo: Checkbox + 3 Strings'
define table zalv_demo {
  key mandt  : mandt not null;
  key key_id : char10 not null;
  flag       : xfeld;
  text1      : char60;
  text2      : char60;
  text3      : char60;
}
```
