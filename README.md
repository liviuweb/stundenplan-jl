# KahloGames – Punkte & Statistiken für den Spieleabend

Spiele: **Floriferous**, **Skyjo**, **Flip 7**, **13 Feuilles**, **Virus!**, **Dogs** (Dog Royal, Backdog, Agent Dog), **Wizard**, **Dominion**, **Catan** (Normal, Catan Energie, Raumfahrer), **Schiffe versenken** (Spielfeldgröße und Flotte pro Partie einstellbar).
Die Seite ist ein reines HTML/JS-Projekt. Sie läuft auf GitHub Pages und auch direkt per Doppelklick auf `index.html`. Gespeichert wird in einem Google Sheet.

---

## 1. Google Sheet als Datenbank einrichten (ca. 5 Minuten)

1. Neues Google Sheet anlegen (z. B. „KahloGames Daten“).
2. Menü **Erweiterungen → Apps Script**.
3. Den Inhalt von `apps-script/Code.gs` komplett in das Editorfenster kopieren (vorhandenen Code ersetzen) und speichern.
4. Oben im Auswahlfeld die Funktion **`setup`** wählen → **Ausführen**. Google fragt nach Berechtigungen → erlauben.
   Danach gibt es im Sheet die Tabellenblätter *Spieler*, *Partien* und *Punkte*.
5. **Bereitstellen → Neue Bereitstellung** → Zahnrad → **Web-App**
   - Ausführen als: **Ich**
   - Wer hat Zugriff: **Jeder**
   → **Bereitstellen** und die **Web-App-URL** kopieren (endet auf `/exec`).
6. In `js/config.js` die URL eintragen:
   ```js
   window.KG_API_URL = 'https://script.google.com/macros/s/…/exec';
   ```

Die Passwörter stehen nur im Apps Script (Funktion `setup`), nicht im Code der Webseite.
Zum Ändern: Werte in `setup()` anpassen und `setup` erneut ausführen.

> Wenn du später `Code.gs` änderst: **Bereitstellen → Bereitstellungen verwalten → Bearbeiten → Version: Neue Version**. Die URL bleibt gleich.

Im Blatt **Punkte** steht jede Partie lesbar (eine Zeile pro Spieler). Bitte nur im Blatt **Partien** nichts von Hand ändern – dort liegen die vollständigen Daten.

## 2. Auf GitHub Pages veröffentlichen

1. Neues Repository anlegen und den gesamten Ordnerinhalt hochladen (per Drag & Drop im Browser oder `git push`).
2. Repository → **Settings → Pages** → *Source: Deploy from a branch* → Branch `main`, Ordner `/ (root)` → Save.
3. Nach ca. einer Minute ist die Seite unter `https://<name>.github.io/<repo>/` erreichbar.

Hinweis: GitHub Pages aus einem **privaten** Repository geht nur mit GitHub Pro/Team. Mit einem kostenlosen Konto muss das Repository öffentlich sein. Das ist unkritisch: Die Daten liegen im Google Sheet, und das Script gibt sie nur mit dem richtigen Passwort heraus. Die Seite ist zusätzlich für Suchmaschinen gesperrt (`noindex`).

## 3. Demo-Modus

Solange `API_URL` leer ist, läuft alles im **Demo-Modus**: Daten werden nur im Browser dieses Geräts gespeichert. Gut zum Ausprobieren – für den echten Einsatz die Google-Tabelle verbinden.

## Bedienung

- **Start:** Passwort eingeben → Spiel wählen. Das Zahnrad auf der Startseite öffnet die **Einstellungen** (Spieler anlegen, umbenennen, löschen).
- **Spieler-Symbole** stellt man im jeweiligen Spiel über das Zahnrad neben „Spiele“ ein – jedes Spiel hat eigene Symbole.
- **Catan:** Wählt man oben die Variante Catan Energie oder Raumfahrer, wechselt das Design.
- **Spieler löschen** braucht das Lösch-Passwort (Livius fragen). Alte Partien bleiben im Verlauf erhalten.
- Jedes Spiel hat **Dashboard · Neues Spiel · Statistik · Verlauf**. Unter Statistik gibt es den Bereich **„Mehr Statistiken“** zum Ausklappen.
- **Rundenspiele** (Skyjo, Flip 7, 13 Feuilles): Runde für Runde eintragen; ein laufendes Spiel bleibt auf dem Gerät gespeichert, auch wenn man die Seite schließt. Erst „Spiel beenden & speichern“ schreibt es in die Tabelle.
  - Skyjo: „hat beendet“ markieren – wer beendet und nicht die wenigsten Punkte hat, wird automatisch verdoppelt (nur positive Punkte).
  - Flip 7: endet automatisch, sobald jemand 200 Punkte hat.
  - 13 Feuilles: Rundensieger wählen (0 Punkte), die anderen tragen ihre Restkarten ein. Niedrigste Summe gewinnt.
- **Wizard:** pro Runde Ansage und Stiche je Spieler eintragen, die App rechnet die Punkte (richtig: 20 + 10 je Stich, falsch: −10 je Stich Abweichung) und prüft, ob die Stiche zur Runde passen. Das Spiel endet nach 60 ÷ Spielerzahl Runden.
- **Dominion & Catan:** Siegpunkte am Ende je Spieler eintragen. Bei Gleichstand wählt man den Sieger oder „Geteilter Sieg“. Bei Catan „Normal“ kann man zusätzlich Längste Handelsstraße und Größte Rittermacht festhalten.
- **Schiffe versenken:** Spielfeld (z. B. 10×10) und Anzahl je Schiffstyp festlegen – die letzte Einstellung wird gemerkt. Dann pro Spieler antippen, welche gegnerischen Schiffe er versenkt hat. Optional: Schüsse und wer angefangen hat – daraus entstehen Treffsicherheit, schnellster Sieg und die Frage, ob sich der erste Schuss lohnt.
- **Floriferous:** Solo und Multiplayer werden getrennt ausgewertet, Standard und Extended ebenfalls (Extended bringt mehr Punkte). Die Stimmung (Anxious … Nirvana) wird nach der Tabelle aus dem Regelheft berechnet.

## Ablage

Die Seite funktioniert in zwei Varianten: mit den Unterordnern `css/`, `js/`, `assets/` – oder mit **allen Dateien in einem Ordner** (flach). `index.html` findet beides selbst.

### Mit Unterordnern

```
index.html          Einstieg
css/                Grundlayout + Themes je Spiel
js/                 config.js (Google-URL), app.bundle.js (fertige App), Quellcode der App
build.sh            baut js/app.bundle.js neu – nur nötig, wenn du den Quellcode änderst
js/games/           ein Modul pro Spiel
assets/flori/       gemalte Aquarell-Bilder für Floriferous
apps-script/Code.gs Backend für Google Sheets
paint/              Werkzeug, mit dem die Aquarell-Bilder erzeugt wurden (wird für die Seite nicht gebraucht)
```
