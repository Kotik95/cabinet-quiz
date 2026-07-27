# Cabinet Quiz

Ein für iPhone und andere Smartphones optimiertes Allgemeinwissensquiz im antiken Kabinett-Stil.

## Enthalten

- 100 eigenständig formulierte Fragen in 10 Kategorien
- genau 5 Fragen pro Runde
- auswählbar: 1, 2, 3, 5 oder 10 Runden
- 4 Antwortboxen pro Frage
- 20 Sekunden Antwortzeit
- 100 Punkte für eine richtige Antwort plus bis zu 50 Zeitbonus-Punkte
- Online-Lobby mit Spielername, Raumcode und teilbarem Einladungslink
- automatische neue Spielleitung, falls der Host die Verbindung verliert
- für iPhone-Hochformat, Safe Areas und große Touchflächen optimiert
- als Web-App zum Home-Bildschirm hinzufügbar
- keine fremden Bilder, Logos, Sounds oder Webfonts

## Brauche ich Firebase?

**Für das Online-Spiel: ja.** GitHub Pages liefert nur die statischen Dateien aus. Firebase übernimmt:

1. anonyme Spieler-IDs,
2. Lobby und Raumzustand,
3. synchrone Fragen und Timer,
4. Antworten und Punktestände.

Das Projekt ist bereits mit derselben Firebase-Web-App vorkonfiguriert, die im Basketball-Spiel verwendet wurde (`game-18fa7`). Du brauchst daher nicht zwingend ein neues Firebase-Projekt.

Für ein komplett getrenntes Quiz-Projekt kannst du später in `app.js` den Block `firebaseConfig` durch die Konfiguration eines neuen Firebase-Projekts ersetzen.

---

# Einrichtung Schritt für Schritt

## 1. Dateien bei GitHub anlegen

1. Entpacke `cabinet-quiz.zip`.
2. Erstelle auf GitHub ein neues Repository, zum Beispiel `cabinet-quiz`.
3. Lade **den Inhalt des entpackten Ordners** in die oberste Ebene des Repositorys hoch.
4. Prüfe, dass `index.html` direkt im Hauptverzeichnis liegt.
5. Committe die Dateien in den Branch `main`.

Die wichtigsten Dateien sind:

- `index.html` – Aufbau
- `styles.css` – antikes Design und iPhone-Anpassung
- `app.js` – Firebase, Lobby und Spiellogik
- `questions.js` – 100 Fragen
- `firebase.rules.json` – empfohlene Datenbankregeln
- `manifest.webmanifest`, `sw.js`, `icons/` – Web-App-Funktionen

## 2. Anonyme Anmeldung in Firebase aktivieren

1. Öffne die Firebase Console.
2. Wähle das Projekt `game-18fa7`.
3. Öffne **Authentication**.
4. Öffne **Sign-in method**.
5. Aktiviere den Anbieter **Anonymous / Anonym**.
6. Speichere.

Ohne diese Einstellung erscheint im Spiel eine Fehlermeldung zur Firebase-Anmeldung.

## 3. Realtime Database prüfen

1. Öffne in Firebase **Realtime Database**.
2. Falls noch keine Datenbank vorhanden ist, erstelle eine.
3. Die in `app.js` eingetragene URL lautet:

```text
https://game-18fa7-default-rtdb.europe-west1.firebasedatabase.app
```

Falls deine Firebase Console eine andere URL zeigt, ersetze nur `databaseURL` in `app.js`.

## 4. Firebase-Regeln veröffentlichen

1. Öffne **Realtime Database → Rules**.
2. Öffne lokal die Datei `firebase.rules.json`.
3. Kopiere den Inhalt in den Regeln-Editor.
4. Klicke auf **Publish / Veröffentlichen**.

Die Datei enthält zwei Bereiche:

- `rooms` für das bestehende Basketball-Spiel
- `quizRooms` für Cabinet Quiz

Dadurch bleibt das bisherige Basketball-Prinzip erhalten. Vergleiche die Regeln trotzdem mit deinen aktuell veröffentlichten Regeln, falls du inzwischen weitere Spiele oder Datenpfade hinzugefügt hast.

Die Regeln sind für ein privates Freundes-Quiz gedacht. Sie verlangen eine anonyme Firebase-Anmeldung und erlauben Spielern nur, ihr eigenes Profil und ihre eigene Antwort zu schreiben. Die Spielleitung darf den gemeinsamen Spielzustand und die Punktestände aktualisieren.

## 5. GitHub Pages einschalten

1. Öffne das GitHub-Repository.
2. Gehe zu **Settings → Pages**.
3. Wähle bei **Source**: `Deploy from a branch`.
4. Wähle den Branch `main`.
5. Wähle den Ordner `/(root)`.
6. Speichere.
7. Öffne anschließend die von GitHub angezeigte Pages-Adresse.

Beispiel:

```text
https://DEIN-NAME.github.io/cabinet-quiz/
```

## 6. Multiplayer testen

1. Öffne die Pages-Adresse auf deinem Gerät.
2. Gib einen Namen ein.
3. Erstelle einen Raum.
4. Tippe auf **Link teilen**.
5. Öffne den Link auf einem zweiten Gerät oder in einem privaten Browserfenster.
6. Gib dort einen anderen Namen ein und tritt bei.
7. Starte die Partie auf dem Gerät der Spielleitung.

Der Link enthält den Raumcode:

```text
https://DEINE-SEITE.example/?room=ABC123
```

Der eingeladene Spieler muss nur noch einen Namen eingeben.

## 7. Auf dem iPhone wie eine App verwenden

1. Öffne das Spiel in Safari.
2. Tippe auf das Teilen-Symbol.
3. Wähle **Zum Home-Bildschirm**.
4. Starte Cabinet Quiz künftig über das neue Symbol.

Die App ist auf Hochformat ausgelegt. Sie berücksichtigt die Displayaussparung und den unteren Home-Indikator.

---

# Fragen ändern oder erweitern

Alle Fragen stehen in `questions.js`.

Eine Frage sieht so aus:

```js
{
  id: "geo-01",
  category: "Geografie",
  question: "Welche Stadt ist die Hauptstadt Kanadas?",
  options: ["Toronto", "Vancouver", "Ottawa", "Montreal"],
  answer: 2,
  explanation: "Ottawa ist die Hauptstadt Kanadas."
}
```

`answer` zählt ab null:

- `0` = erste Antwort
- `1` = zweite Antwort
- `2` = dritte Antwort
- `3` = vierte Antwort

Jede Frage braucht:

- eine eindeutige `id`
- genau vier verschiedene Antworten
- genau einen korrekten Antwortindex
- eine kurze Erklärung

Das Spiel mischt sowohl die Fragen als auch die Reihenfolge der Antwortmöglichkeiten.

---

# Urheberrecht und Inhalte

Die enthaltenen Fragen und Erklärungen wurden für dieses Projekt neu formuliert. Es wurden keine Wikipedia-Absätze, fremden Quizdatenbanken, Bilder, Logos, Audiodateien oder fremden Webfonts übernommen.

Allgemeine Tatsachen wie Hauptstädte, Jahreszahlen oder naturwissenschaftliche Größen sind keine kopierten Formulierungen. Bei späteren Ergänzungen solltest du:

- Fakten anhand verlässlicher Quellen prüfen,
- die Frage und Erklärung selbst formulieren,
- keine ganzen Sätze oder Absätze aus Wikipedia oder Quizseiten übernehmen,
- keine Bilder verwenden, ohne deren konkrete Lizenz zu prüfen,
- Markenlogos und geschützte Figuren nicht als Gestaltungselemente einsetzen.

Eine absolute juristische Garantie kann ein Softwarepaket nicht geben. Die aktuelle Version reduziert das Risiko jedoch bewusst, indem sie nur eigenes Layout, eigene Formulierungen und selbst erstellte Symbole verwendet.

---

# Technische Hinweise

## Keine echte Betrugssicherheit

Die Fragen und richtigen Antworten liegen im Browsercode. Für ein privates Freundes-Spiel ist das praktisch und günstig. Ein technisch versierter Spieler könnte die Antworten jedoch im Quellcode nachsehen.

Für ein öffentliches Turnier mit Preisen müssten Fragen und Auswertung auf einen vertrauenswürdigen Server oder in Firebase Cloud Functions verlagert werden.

## Host-Wechsel

Die Person, die den Raum erstellt, ist zuerst die Spielleitung. Wird sie als getrennt erkannt, versucht der am längsten verbundene Spieler, die Leitung zu übernehmen.

## Verwaiste Räume

Ein alleiniger Host löscht den Raum beim normalen Verlassen. Bei einem abrupten Browserabbruch bleibt ein kleiner Datensatz in Firebase bestehen. Für ein kleines privates Spiel ist das unproblematisch. Bei vielen öffentlichen Nutzern wäre eine automatische serverseitige Bereinigung sinnvoll.

## Lokaler Test

ES-Module und Service Worker sollten über einen lokalen Webserver getestet werden, nicht durch Doppelklick auf `index.html`.

Beispiel mit Python:

```bash
cd cabinet-quiz
python3 -m http.server 8080
```

Dann im Browser öffnen:

```text
http://localhost:8080
```
