# Antragsroboter

Gibt mehrere hundert Anträge auf eurer eigenen Webseite frei. Ihr zeichnet
**einen** Vorgang von Hand auf, der Roboter wiederholt ihn für jeden Antrag
aus eurer Liste.

Läuft vollständig auf dem eigenen Rechner. Kein Server, keine Installation,
keine Zusatzsoftware — nur der Browser, der auf jedem Windows-Rechner ohnehin
vorhanden ist.

---

## Warum kein Server und kein iframe

Der naheliegende Weg wäre eine kleine Webseite, die euer Portal in einem
Rahmen (`iframe`) öffnet und fernsteuert. Der funktioniert nicht zuverlässig:
Browser verbieten den Zugriff über Seitengrenzen hinweg (Same-Origin-Policy),
und die meisten Portale unterbinden das Einbetten zusätzlich per
`X-Frame-Options` oder `CSP`.

Der Roboter läuft deshalb **als Browser-Erweiterung direkt in der Portalseite**.
Damit gibt es keine Rahmen-Grenze, keine Server-Beteiligung und keine
Einschränkung durch Sicherheitskopfzeilen. Er sieht die Seite so, wie ihr sie
seht.

---

## Einrichten in 4 Klicks

Einmalig, dauert keine Minute:

1. In Edge `edge://extensions` öffnen (in Chrome: `chrome://extensions`).
2. Unten links **Entwicklermodus** einschalten.
3. Oben auf **Entpackte Erweiterung laden**.
4. Den Ordner **`erweiterung`** auswählen (den Ordner selbst, nicht eine Datei darin).

### Edge, Chrome oder Firefox?

**Edge genügt.** Edge und Chrome teilen denselben Unterbau (Chromium); der
Roboter läuft in beiden gleich.

WohnWeb begrüßt Edge allerdings mit dem Kasten *„Ihr Browser wird nicht
unterstützt"*, der sich über die Seite legt und alles dahinter blockiert.
Beim Anmelden klickt ihn ein Mensch weg; taucht er später wieder auf, räumt
ihn der Roboter selbst — siehe **Hinweisfenster wegklicken** im Reiter
*Vorgang*, voreingestellt auf `Ja, verstanden`.

Das ist keine Notlösung: Solche Kästen erscheinen unregelmäßig und ließen
sich darum ohnehin nicht als fester Schritt aufzeichnen. Wäre der Kasten
beim Abspielen einmal nicht da, würde ein starres Rezept daran scheitern.

Firefox nutzt ein anderes Erweiterungsformat — dort läuft der Roboter
**nicht**.

Fertig. Der Roboter bleibt geladen, auch nach einem Neustart des Browsers.

Zum Öffnen: oben rechts auf das Puzzleteil, dann auf **Antragsroboter**. Das
Bedienfeld erscheint als Seitenleiste neben dem Portal.

> **Alternative:** `Antragsroboter-starten.cmd` startet den Browser mit bereits
> geladenem Roboter und einem eigenen Browserprofil. Trage oben in der Datei
> eure Portal-Adresse ein. Nützlich, wenn es sich wie ein Windows-Programm
> anfühlen soll. Falls euer Edge das Laden per Befehlszeile unterbindet,
> nehmt die 4 Klicks oben — die funktionieren immer.

---

## Der erste Durchlauf

### 1. Anmelden — von Hand

Öffnet euer Portal und meldet euch ganz normal an. Der Roboter arbeitet danach
in eurer angemeldeten Sitzung weiter.

**Der Roboter zeichnet Passwörter grundsätzlich nicht auf.** Der Inhalt von
Passwortfeldern wird nie gespeichert, nicht einmal im Arbeitsspeicher. Es gibt
im ganzen Programm keine Stelle, an der ein Kennwort abgelegt würde.

### 2. Anträge einlesen — Reiter „Anträge"

Eine Nummer pro Zeile einfügen und **Liste übernehmen** klicken:

```
A-10001
A-10002
A-10003
```

Wer mehr Felder braucht, nimmt eine CSV mit Kopfzeile:

```csv
Antragsnummer;Antragsteller;Kostenstelle
A-10001;Meier, Anna;4711
A-10002;Schulz, Bernd;4711
```

Jede Spalte wird zum Platzhalter: `{{antrag}}` (immer die erste Spalte),
`{{antragsteller}}`, `{{kostenstelle}}`.

### 3. Vorgang aufzeichnen — Reiter „Vorgang"

**Aufnahme starten** klicken und dann **einen** Antrag ganz normal von Hand
freigeben. Jeder Klick, jede Eingabe, jedes Häkchen wird zum Rezept.
Anschließend **Aufnahme beenden**.

### 4. Antragsnummer zum Platzhalter machen

Tragt die Nummer ein, die ihr eben benutzt habt (z. B. `A-10001`), und klickt
**Ersetzen**. Der Roboter ersetzt sie an **allen** Stellen durch `{{antrag}}`:

- im eingetippten Text,
- in der Startadresse,
- im Suchtext eines Klickziels („die Zeile *A-10001* anklicken"),
- **und im Selektor selbst** (`data-testid="verweis-A-10001"`).

Der letzte Punkt ist der wichtigste. Wer nur Eingabewerte ersetzt, baut einen
Roboter, der für jeden Antrag stur die Zeile des ersten anklickt.

### 5. Erfolg erkennbar machen

Tragt den Text ein, der nach erfolgreicher Freigabe erscheint — etwa
`Antrag wurde freigegeben`.

**Ohne dieses Merkmal kann der Roboter Erfolg nicht von Misserfolg
unterscheiden** und meldet alles als erledigt. Bei Freigaben ist das der
Unterschied zwischen einem Protokoll und einer Behauptung.

Optional ein Fehlertext (z. B. `Keine Berechtigung`), der einen Antrag sofort
als fehlerhaft beendet.

### 6. Schlussschritt markieren

Hakt in der Schrittliste den Schritt an, der die Freigabe **endgültig**
auslöst — meist der letzte Klick. Der Roboter schlägt ihn nach der Aufnahme
selbst vor.

Diese Markierung ist die Grundlage für Trockenlauf und Einzelbestätigung.
Ohne sie greift beides nicht.

### 7. Trockenlauf

Reiter „Optionen" → **Trockenlauf** einschalten → Lauf starten.

Der Roboter spielt alles durch, **nur den als endgültig markierten Schritt
nicht**. So seht ihr an echten Anträgen, ob das Rezept trägt, ohne dass etwas
freigegeben wird.

### 8. Echter Lauf

Trockenlauf wieder aus, **Lauf starten**. Vor dem Start fragt der Roboter
nach und weist auf fehlende Sicherungen hin.

---

## Für WohnWeb im Besonderen

Der Ablauf, den ihr beschrieben habt — *Allgemeine Förderfallübersicht →
Antrag öffnen → Prüfung NRW.BANK einleiten* — hat drei Eigenheiten, die man
kennen muss.

### 1. Anträge sind nicht direkt ansteuerbar

Die Adresse eines geöffneten Antrags lautet sinngemäß:

```
…/fall-bearbeiten/18867ad1-04e1-45ef-…/antraege/7b29bbeb-6386-…
```

Nur GUIDs, kein Aktenzeichen. **Der Roboter kann einen Antrag deshalb nicht
über die Adresszeile aufrufen** — er muss jedes Mal in die Übersicht und dort
die richtige Zeile anklicken, genau wie ein Mensch.

Dafür gibt es den Schritt **„Zeile anklicken"**. Er sucht die Zeile, in der
`{{antrag}}` steht, und klickt sie an. Damit das eindeutig bleibt, muss die
Kennung je Zeile einmalig sein: **das Aktenzeichen**, nicht der Name — der
lautet bei vielen Fällen gleich. Kommt eine Kennung mehrfach vor, weist das
Bedienfeld beim Übernehmen darauf hin und der Roboter lässt die betroffenen
Zeilen aus, statt zu raten.

Die Liste tippt ihr auch nicht ab: **„Aus dem Portal holen"** im Reiter
*Anträge* liest die Übersicht aus, filtert auf Status `gestellt` und legt sie
euch zum Ankreuzen vor.

### 2. Die zwei Prüfmerkmale

Unten rechts stehen *Finanzierung* und *Detailprüfbarkeit* — mit Haken, wenn
sie in Ordnung sind, mit Kreuz, wenn nicht. Erst wenn beide in Ordnung sind,
darf die Prüfung eingeleitet werden.

Das kann die Aufnahme nicht mitschneiden — „prüfe, ob dieses Feld grün ist"
ist kein Klick. Ihr ergänzt die beiden Schritte darum von Hand über
**„Schritt von Hand ergänzen" → Vorbedingung**, und zeigt dem Roboter per
*Im Tab anklicken* das jeweilige Feld. Er meldet sofort zurück, was er dort
erkennt — *erfüllt*, *nicht erfüllt* oder *nicht erkennbar*. Steht dort
„nicht erkennbar", taugt die Stelle nicht als Vorbedingung; dann nehmt ein
Element weiter innen oder weiter außen.

Der Roboter liest **zuerst das Zeichen** (Haken oder Kreuz) und erst danach
die Farbe. Ein Haken ist eindeutig, grün ist Auslegung.

Ist eine Vorbedingung nicht erfüllt, wird der Antrag **ausgelassen** — nicht
als Fehler gebucht. Er ist ja nicht kaputt, er ist nur noch nicht so weit.
Ausgelassene Anträge zählen auch nicht auf die Notbremse ein.

### 3. Der Rückweg muss *immer* laufen

Nach dem Einleiten schließt sich der Dialog und ihr geht mit dem Browser-Zurück
auf die Übersicht. Dieser Schritt braucht zwingend das Häkchen **„immer
ausführen"**.

Ohne dieses Häkchen bleibt der Roboter beim ersten ausgelassenen Antrag auf
dessen Seite stehen — und findet für alle folgenden keine Übersicht mehr vor.
In unseren Tests fielen dadurch fünf einwandfreie Anträge aus, nur weil einer
davor nicht freigabereif war.

### Das Rezept im Überblick

| # | Schritt | Besonderheit |
|---|---|---|
| 1 | Zeile anklicken `{{antrag}}` | wechselt die Seite |
| 2 | Vorbedingung *Finanzierung* | von Hand ergänzt |
| 3 | Vorbedingung *Detailprüfbarkeit* | von Hand ergänzt |
| 4 | Klick *Prüfung NRW.BANK einleiten* | öffnet den Dialog |
| 5 | Text eintragen *Ergänzende Informationen* | Pflichtfeld; erst danach gibt der Knopf frei |
| 6 | Klick *Prüfung NRW.BANK einleiten* | **endgültig** |
| 7 | Auf Text warten *…wurde eingeleitet* | die eigentliche Erfolgsprüfung |
| 8 | Zurück zur Übersicht | **immer ausführen** |

Schritt 7 sitzt bewusst *vor* dem Rückweg. Die Bestätigung steht auf der
Antragsseite — nach dem Zurückgehen ist sie weg, und eine Prüfung am Ende
würde auf der falschen Seite suchen.

Das Häkchen *„Statuswechsel nur innerhalb des WohnWebs ohne Datenübermittlung"*
rührt der Roboter nicht an; es bleibt leer, wie ihr es festgelegt habt. Die
Daten gehen also an die NRW.BANK.

### Sitzungsende

WohnWeb zeigt oben einen Countdown (bei euch 29:33). Läuft die Sitzung während
eines Stapels ab, hält der Roboter sofort an. Tragt dazu im Reiter *Vorgang*
unter **Text der Anmeldeseite** ein, was auf eurer Anmeldemaske steht — etwa
`Anmeldung WohnWeb`.

Entscheidend ist, was dann mit dem laufenden Antrag geschieht:

- Die Freigabe war **noch nicht ausgelöst** → der Antrag bleibt `offen`.
  Neu anmelden, *Fortsetzen*, fertig.
- Die Freigabe war **schon ausgelöst** → der Antrag wird `unklar`. Der Roboter
  weiß nicht, ob das Portal sie noch verbucht hat, und behauptet darum nichts.
  **Diese Fälle seht ihr von Hand nach.** Der Roboter fasst sie nie wieder an,
  damit nichts doppelt eingeleitet wird.

---

## Ohne Risiko üben

Im Ordner `uebungsportal` liegen zwei Übungsumgebungen:

- **`uebungsportal/`** — ein allgemein gehaltenes Antragsportal mit Anmeldung,
  Trefferliste, Prüfvermerk, Auswahlfeld, Häkchen und Bestätigungsseite.
- **`uebungsportal/wohnweb/`** — ein Nachbau, der WohnWebs Eigenheiten
  nachstellt: GUID-Adressen, Statusspalte, die zwei Prüfmerkmale und der
  Dialog mit Pflicht-Freitextfeld. Zwei der zwölf Fälle sind absichtlich
  **nicht** freigabereif — daran seht ihr, ob der Roboter sie ausläßt, statt
  sie durchzuwinken.

Starten:

```bash
npx http-server -p 8899 uebungsportal
# allgemein:  http://127.0.0.1:8899/
# WohnWeb:    http://127.0.0.1:8899/wohnweb/anmeldung.html
```

Nichts davon ist mit eurem Testserver verbunden — es läuft ausschließlich auf
dem eigenen Rechner.

Dort könnt ihr das Aufzeichnen gefahrlos üben, bevor ihr an echte Anträge
geht. **Übung zurücksetzen** stellt den Ausgangszustand wieder her.

---

## Die vier Sicherungen

| Sicherung | Was sie tut |
|---|---|
| **Trockenlauf** | Spielt alles durch außer dem endgültigen Schritt. Zum Prüfen des Rezepts an echten Anträgen. |
| **Notbremse** | Hält nach *n* Fehlern nacheinander an (Standard 3). Fängt den Fall ab, dass sich das Portal ändert oder die Sitzung abläuft — statt hunderte Anträge falsch zu verarbeiten. |
| **Einzelbestätigung** | Hält vor jeder endgültigen Freigabe an und fragt. Sicher, aber bei hunderten Anträgen langsam — als Option gedacht, nicht als Dauerzustand. |
| **Protokoll** | Eine Zeile je Antrag mit Zeitstempel, Ergebnis und Meldung. Als CSV exportierbar (Semikolon und BOM, öffnet direkt in Excel). |

Dazu ein **Wachhund**: Meldet sich eine Seite 90 Sekunden lang nicht,
gilt der Antrag als hängend, wird als Fehler vermerkt, und es geht weiter.
Ohne ihn bliebe ein Durchlauf bei einem hängenden Portal stumm stehen.

Und: wird der Arbeits-Tab geschlossen, hält der Lauf an. Ein Roboter, dem
niemand mehr zusieht, soll keine Freigaben erteilen.

---

## Wiederaufnahme

Der Zustand jedes Antrags (`offen`, `ok`, `fehler`, `übersprungen`) bleibt
gespeichert — auch über einen Browser-Neustart hinweg.

- **Nur offene abarbeiten** setzt einen abgebrochenen Lauf fort, ohne
  bereits Erledigtes noch einmal anzufassen.
- **Fehlerhafte auf „offen" zurücksetzen** nimmt nur die gescheiterten
  Anträge erneut auf, nachdem ihr die Ursache behoben habt.

---

## Wenn etwas nicht klappt

**„Element nicht gefunden"**
Der häufigste Fall. Nutzt in der Schrittliste **im Tab suchen** — der Roboter
umrandet das Element orange, wenn er es findet. Steht die richtige Seite offen
und er findet nichts, ist der Schritt unsicher: Aufnahme wiederholen und dabei
den Knopf selbst treffen, nicht dessen Beschriftung.

**Der Roboter klickt immer denselben Antrag an**
Die Ersetzung aus Schritt 4 wurde nicht gemacht oder die Schreibweise wich ab.
Kontrolle: In der Schrittliste muss `{{antrag}}` blau hervorgehoben stehen.

**Der Lauf bleibt nach dem ersten Antrag stehen**
Meist fehlt die Startadresse. Ohne sie beginnt jeder Durchlauf auf der Seite,
auf der der vorige endete — bei einer Bestätigungsseite geht das nicht.
Tragt die Adresse ein, auf der ein Vorgang beginnt.

**Alles wird als „erledigt" gemeldet, obwohl nichts passiert ist**
Es fehlt der Erfolgstext. Ohne ihn prüft der Roboter nur, ob alle Schritte
durchliefen — nicht, ob das Portal die Freigabe angenommen hat.

**Nach einem Portal-Update geht nichts mehr**
Vorgang neu aufzeichnen. Das dauert eine Minute und ist verlässlicher als
Selektoren von Hand zu reparieren.

---

## Grenzen

Ehrlich gesagt, was der Roboter **nicht** kann:

- **Keine Zwei-Faktor-Anmeldung im Ablauf.** Wenn das Portal mitten im
  Vorgang erneut nach einer TAN fragt, bricht der Antrag ab. Die Anmeldung
  am Anfang macht ohnehin ein Mensch.
- **Keine Inhalte in fremden Rahmen.** Steckt das Antragsformular in einem
  `iframe` einer anderen Domain, sieht der Roboter es nicht.
- **Kein CAPTCHA.**
- **Keine Datei-Uploads.** Der Dateiauswahl-Dialog gehört dem Betriebssystem,
  nicht der Seite.
- **Keine inhaltliche Prüfung.** Der Roboter entscheidet nicht, *ob* ein
  Antrag freigegeben werden darf. Diese Entscheidung trefft ihr, wenn ihr die
  Liste zusammenstellt. Der Roboter führt sie nur aus.

Der letzte Punkt ist der wichtigste: Die fachliche Verantwortung für jede
Freigabe bleibt bei euch. Der Roboter spart das Klicken, nicht das Prüfen.

---

## Wo die Daten liegen

Alles im lokalen Speicher des Browsers auf eurem Rechner
(`chrome.storage.local`). Der Roboter baut **keine** Netzwerkverbindung auf —
weder zu uns noch zu sonst jemandem. Antragsnummern, Rezepte und Protokolle
verlassen den Rechner nicht.

Der Roboter fordert Zugriff auf alle Seiten an (`<all_urls>`), damit er auf
eurem Portal arbeiten kann, ohne dass ihr dessen Adresse vorher ins Manifest
eintragen müsst. Wer das enger fassen will, ersetzt in
`erweiterung/manifest.json` beide Vorkommen von `<all_urls>` durch die eigene
Adresse, z. B. `https://portal.example/*`.

---

## Aufbau

```
antragsroboter/
├── erweiterung/              ← dieser Ordner wird in den Browser geladen
│   ├── manifest.json         Anmeldung beim Browser (Manifest V3)
│   ├── hintergrund.js        Zustandsmaschine; überlebt jeden Seitenwechsel
│   ├── inhalt.js             Rekorder und Abspieler; läuft in der Portalseite
│   ├── overlay.css           Träger der Statusanzeige (Rest im Shadow-DOM)
│   ├── panel.html/.css/.js   Bedienfeld in der Seitenleiste
│   └── symbole/              Symbole
├── uebungsportal/            Übungsportal zum gefahrlosen Ausprobieren
├── Antragsroboter-starten.cmd  Windows-Starter
├── beispiel-antraege.csv     Beispielliste
└── LIESMICH.md               diese Datei
```

### Warum der Zustand im Hintergrund liegt

Bei jedem Seitenwechsel zerstört der Browser das Skript in der Seite. Ein
Roboter, der seinen Fortschritt dort hielte, käme über den ersten
Seitenwechsel nicht hinaus.

Deshalb liegt der Ablaufzustand im Hintergrund-Dienst, und zwar in
`chrome.storage.local` — denn auch dieser Dienst darf jederzeit beendet
werden. Nach jedem Seitenaufbau meldet sich die Seite („`seiteBereit`") und
holt sich den Auftrag dort ab, wo er unterbrochen wurde.

Ein Detail entscheidet dabei über Doppelfreigaben: Löst ein Schritt die
Navigation aus, wird seine Fertigmeldung vom Seitenwechsel verschluckt. Der
Roboter merkt sich darum den *begonnenen* Schritt und setzt nach dem
Seitenwechsel beim **darauffolgenden** fort — nie beim selben.

### Warum Werte über den nativen Setter gesetzt werden

Moderne Portale (React, Angular, Vue) überschreiben den `value`-Setter ihrer
Eingabefelder. Ein einfaches `feld.value = "..."` ändert dort zwar die
Anzeige, aber das Framework merkt davon nichts — beim Absenden ist das Feld
wieder leer. Der Roboter geht deshalb über den nativen Setter des Prototyps
und löst `input` und `change` selbst aus.
