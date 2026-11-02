# Horaires Commerces — Benutzerhandbuch

Diese Integration bringt die **Öffnungszeiten** der Geschäfte, in die Sie gehen, in
Gladys: welche Geschäfte geöffnet sind, wann sie öffnen oder schließen, mit Szenen,
wenn ein Geschäft bald öffnet oder schließt.

Alles wird in Gladys berechnet. Der einzige Aufruf nach außen geht an OpenStreetMap,
über den Dienst overpass.ch und mit Ihrem kostenlosen Schlüssel, um die Zeiten der
Geschäfte rund um Ihre Häuser zu finden (siehe **overpass.ch-Schlüssel** unten). Ohne
Schlüssel geben Sie die Zeiten Ihrer Geschäfte selbst ein.

## Einrichtung

Öffnen Sie **Integrationen**, suchen Sie die Integration, installieren Sie sie und
füllen Sie dann den Bildschirm **Konfiguration** aus.

| Feld                         | Was eintragen                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------- |
| overpass.ch-Schlüssel        | Ihr kostenloser Schlüssel, um die Zeiten auf OpenStreetMap zu suchen (unten). |
| Geschäfte und Öffnungszeiten | Ihre Geschäfte und ihre Zeiten (siehe unten).                                 |
| Häuser, um die gesucht wird  | Die Gladys-Häuser, um die gesucht wird. Keines angekreuzt: alle mit Standort. |
| Suchradius ... (km)          | Wie weit von einem Haus die Geschäfte gesucht werden. Standard: 10.           |
| Arten von Geschäften ...     | Die im Reiter Erkennung angebotenen Arten. Keine angekreuzt: keine.           |
| Vorlauf vor ... (Min.)       | Wann „öffnet bald“ / „schließt bald“ auslösen. Standard: 30 Minuten.          |

Klicken Sie dann auf **Konfiguration testen**: Die Antwort sagt Geschäft für Geschäft,
ob es geöffnet ist.

Öffnen Sie zuletzt den Reiter **Erkennung** der Integration und legen Sie die Geräte an.

### Geschäfte und Öffnungszeiten

Ein Geschäft pro Eintrag: ein Name, dann `=` und seine Zeiten, wenn Sie sie eingeben wollen. Trennen Sie die Geschäfte mit
`|`:

```
Leclerc = Mo-Sa 08:30-20:00; PH off | Apotheke = Mo-Fr 09:00-19:00 | Bäckerei = Tu-Su 07:00-13:00,15:30-19:30
```

Die Zeiten folgen der OpenStreetMap-Syntax — oft schon auf der Kartenseite des
Geschäfts zu sehen:

| Sie schreiben                       | Bedeutung                                            |
| ----------------------------------- | ---------------------------------------------------- |
| `Mo-Sa 08:30-20:00`                 | Montag bis Samstag, 8:30 bis 20:00                   |
| `Mo-Fr 08:30-12:00,14:00-19:00`     | Mit Mittagspause                                     |
| `Mo-Sa 08:30-20:00; Su 09:00-12:30` | Regeln durch `;` getrennt                            |
| `Mo-Sa 08:30-20:00; We 08:30-21:00` | Eine spätere Regel ersetzt die frühere an diesem Tag |
| `...; PH off`                       | An französischen Feiertagen geschlossen              |
| `...; PH 09:00-12:30`               | Kürzere Zeiten an Feiertagen                         |
| `24/7`                              | Immer geöffnet                                       |

Tage: `Mo Tu We Th Fr Sa Su`. `PH` = französische Feiertage (Ostermontag, Christi
Himmelfahrt und Pfingstmontag inbegriffen). Die Zeiten gelten nach Pariser Uhrzeit.
Höchstens 10 Geschäfte.

Der Name kennzeichnet das Geschäft: Umbenennen legt ein neues Gerät in Gladys an.

#### Automatisch gefundene Zeiten

Schreiben Sie nur den Namen: `Leclerc` (oder `Leclerc = auto`). Die Integration sucht dann
auf OpenStreetMap das Geschäft dieses Namens, das Ihren Gladys-Häusern am nächsten
liegt (alle Häuser mit Standort, festgelegt unter **Einstellungen → Häuser**), und
übernimmt seine Zeiten. Um andere Wörter als den Namen zu suchen, schreiben Sie sie
nach `auto:`, zum Beispiel `Bäcker = auto: Boulangerie Dupont`. Akzente und
Groß-/Kleinschreibung spielen keine Rolle. Dafür ist ein kostenloser
overpass.ch-Schlüssel nötig (siehe **overpass.ch-Schlüssel** unten).

- Bei mehreren Häusern gewinnt das Geschäft, das einem der Häuser am nächsten ist:
  Geben Sie einen genauen Namen an (`auto: Carrefour Market Vierzon`), um eines
  nahe einem bestimmten Haus zu wählen.
- **Konfiguration testen** nennt das gefundene Geschäft, seinen Ort, seine Entfernung
  und seine Zeiten: Prüfen Sie, ob es das richtige ist.
- Die Zeiten werden einmal am Tag neu gesucht und gespeichert: Ein Neustart ohne Netz
  behält sie.
- Wenn OpenStreetMap keine Zeiten für Ihr Geschäft hat oder Zeiten, die die
  Integration nicht lesen kann, geben Sie sie von Hand ein (und tragen Sie sie gern
  auf openstreetmap.org nach).

### Geschäfte rund um Ihre Häuser (Reiter Erkennung)

Die Integration sucht auf OpenStreetMap rund um jedes Gladys-Haus mit Standort
(festgelegt unter **Einstellungen → Häuser**) die nächsten Geschäfte der in der
Konfiguration angekreuzten Arten — Supermärkte, Bäckereien, Apotheken, Postämter,
Wertstoffhöfe… —, die ihre Öffnungszeiten veröffentlichen. Die 3 nächsten jeder Art,
pro Haus.

Öffnen Sie den Reiter **Erkennung** der Integration: Jedes Geschäft steht dort mit
seinem Haus und seiner Entfernung, zum Beispiel `E.Leclerc (Zuhause, 1.3 km)`. Legen
Sie die an, in die Sie gehen, in einem Raum des richtigen Hauses, und benennen Sie sie
nach Belieben um: Sie funktionieren wie die eingegebenen Geschäfte, und ihre Zeiten
werden einmal am Tag aktualisiert.

### overpass.ch-Schlüssel

Die Zeiten werden auf OpenStreetMap über den Dienst [overpass.ch](https://overpass.ch)
gesucht, mit Ihrem eigenen kostenlosen Schlüssel: Ohne Schlüssel wird nichts
gesucht (die mit ihren Zeiten eingetragenen Geschäfte funktionieren trotzdem). Der
kostenlose Tarif (ohne Kreditkarte, für private Nutzung) bietet 10 000 Anfragen im
Monat; die Integration stellt eine am Tag.

1. Öffnen Sie [overpass.ch/signup](https://overpass.ch/signup) (Schaltfläche **Get a
   free key** auf der Startseite).
2. Füllen Sie **E-mail**, **Password** (mindestens 10 Zeichen) und **Website** aus (zum
   Beispiel `https://github.com/prohand/gladys-horaires-commerces`), akzeptieren Sie
   die Bedingungen und klicken Sie auf **Create account** (oder **Continue with
   Google**).
3. Öffnen Sie die erhaltene E-Mail und klicken Sie auf den Bestätigungslink.
4. Melden Sie sich an (**Log in**) und öffnen Sie die Seite der Schlüssel:
   [overpass.ch/dashboard/keys](https://overpass.ch/dashboard/keys). Legen Sie einen
   Schlüssel an. **Lassen Sie „Allowed referers“ leer und kreuzen Sie „Reject requests
   without a referer“ nicht an**: Die Integration sendet keinen Referer, der Server
   würde ihre Anfragen ablehnen (Fehler 403 `forbidden_referer`).
5. Kopieren Sie den Schlüssel. Die ganze Adresse,
   `https://api.overpass.ch/v1/…/interpreter`, geht auch.
6. In Gladys: **Integrationen** → **Horaires Commerces** → **Konfiguration**, fügen Sie
   ihn in **overpass.ch-Schlüssel** ein und speichern Sie.
7. Klicken Sie auf **Konfiguration testen**. Die Logs der Integration zeigen
   `OpenStreetMap answered by api.overpass.ch`, wenn der Schlüssel funktioniert.

Der Schlüssel ist persönlich: Veröffentlichen Sie ihn nicht (Forum, Code-Repository,
Screenshot). Ein abgelehnter Schlüssel oder ein aufgebrauchtes
Monatskontingent wird von **Konfiguration testen** und in den Logs gemeldet
(`OpenStreetMap lookup failed: overpass.ch refused the key (403)`); die schon
gefundenen Zeiten bleiben, und die Suche versucht es innerhalb einer Stunde erneut.

## Geräte

| Gerät          | Funktion                                 | Hinweise                         |
| -------------- | ---------------------------------------- | -------------------------------- |
| Jedes Geschäft | Geöffnet (1 = geöffnet, 0 = geschlossen) | In jeder Szenenbedingung nutzbar |
| Jedes Geschäft | Minuten bis zur Öffnung oder Schließung  | Jede Minute aktualisiert         |

## Szenen

### Auslöser

- **Ein Geschäft öffnet bald** (`store_opening_soon`) und **Ein Geschäft schließt
  bald** (`store_closing_soon`): einmal, die eingestellte Anzahl Minuten vorher.
  Filter: das Geschäft (leer = beliebig). Variablen: Name des Geschäfts, Uhrzeit,
  verbleibende Minuten. Beispiel: „{{store_name}} schließt um {{time}}, noch
  {{minutes_left}} Minuten.“

„Das Geschäft ist geöffnet“ ist ein Zustand: Nutzen Sie die Gerätebedingungen von
Gladys.

### Aktionen

- **Ist ein Geschäft geöffnet?** (`is_store_open`): Wählen Sie ein Geschäft. Ausgaben:
  _geöffnet_ (ja/nein), die Uhrzeit der nächsten Änderung (HH:MM) und die Minuten bis
  dahin.

## Dashboard

- **Öffnungszeiten**: alle Geschäfte auf einen Blick (geöffnet oder geschlossen, bis
  wann), oder — mit der Einstellung _Geschäft_ — ein Geschäft im Detail, mit
  Countdown und den heutigen Zeiten. Die Einstellung _Angezeigte Folgetage_ (0 bis 6) ergänzt diese Ansicht um die Zeiten der folgenden Tage, Feiertage markiert: 6
  zeigt die ganze Woche.

## Fehlerbehebung

- **Der Reiter Erkennung ist leer**: Klicken Sie auf **Konfiguration testen**: Es
  sucht erneut auf OpenStreetMap und sagt warum (Haus ohne Standort, keine Art
  angekreuzt, OpenStreetMap nicht erreichbar, kein Geschäft dieser Arten im Radius).
- **„overpass.ch-Schlüssel fehlt“**: Fügen Sie Ihren Schlüssel in die Konfiguration
  ein (siehe **overpass.ch-Schlüssel** oben).
- **„OpenStreetMap war nicht erreichbar“**: Die Meldung sagt warum (Schlüssel
  abgelehnt, Kontingent aufgebraucht, Server nicht erreichbar). Prüfen Sie den
  Schlüssel auf [overpass.ch/dashboard/keys](https://overpass.ch/dashboard/keys); neuer
  Versuch innerhalb einer Stunde.
- **„Kein Geschäft dieses Namens ... auf OpenStreetMap“**: Versuchen Sie weniger
  Wörter, einen größeren **Suchradius** oder geben Sie die Zeiten von Hand ein.
- **„Kein Haus von Gladys hat einen Standort“**: Legen Sie den Standort des Hauses
  unter **Einstellungen → Häuser** fest.
- **„Die Öffnungszeiten werden nicht verstanden“**: Die Meldung nennt den falschen
  Teil. Verwenden Sie die englischen Tagesnamen (`Mo`, `Tu`…) und `HH:MM`-Zeiten
  (`08:30`, nicht `8.30`).
- **Ein Geschäft wird „nicht verstanden“**: Jeder Eintrag muss `Name = Zeiten` sein,
  Einträge durch `|` getrennt.

## Daten

Um die Zeiten zu finden (ohne Zeiten eingetragene Geschäfte und Reiter Erkennung),
werden die gesuchten Wörter, die Arten von Geschäften und der Standort Ihrer Häuser
(ein Bereich im Suchradius um jedes) einmal am Tag mit Ihrem Schlüssel an die
Overpass-API von overpass.ch (`api.overpass.ch`, in Deutschland) gesendet. Die gefundenen Zeiten werden in
`/data/hours.json` gespeichert. Um nichts zu senden: Tragen Sie keinen Schlüssel ein
und geben Sie die Zeiten aller Geschäfte ein.
