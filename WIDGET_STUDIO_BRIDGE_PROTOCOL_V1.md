# Creator Suite Launcher Bridge Protocol V1

Milestone V6 führt die **authentifizierte Transport-Schicht** zwischen dem späteren PC-Launcher und dem Widget-Studio-Backend ein.

Wichtig: Das ist der echte Creator-Suite-Bridge-Kanal. Der TikTok-LIVE-Provider selbst wird später im Launcher angeschlossen und übersetzt TikTok-Ereignisse in dieses neutrale Protokoll.

## Authentifizierung

Im Widget Studio unter **Launcher Bridge → Einrichten** einen Bridge-Schlüssel erzeugen.

Der Schlüssel wird nur einmal vollständig angezeigt und serverseitig ausschließlich als SHA-256 Hash gespeichert.

Alle Launcher-Endpunkte verwenden:

```http
Authorization: Bearer cfsb_...
Content-Type: application/json
```

## Heartbeat

`POST /api/bridge/widget-studio/heartbeat`

Empfohlene Frequenz: alle 10 Sekunden.

```json
{
  "client_version": "0.1.0",
  "machine_name": "Creator-PC",
  "live_session_active": false,
  "capabilities": {
    "follow": true,
    "like": true,
    "gift": true,
    "share": true,
    "viewer_update": true
  }
}
```

Nach ca. 30 Sekunden ohne Heartbeat gilt die Bridge als offline/stale. Der Launcher setzt `live_session_active` bei laufender Session auf `true`, damit ein alter LIVE-Zustand nach einem Neustart nicht versehentlich wieder aktiviert wird.

## LIVE Session

Start:

`POST /api/bridge/widget-studio/session/start`

Ende:

`POST /api/bridge/widget-studio/session/end`

Der Server erzeugt beim Start eine neue Session und setzt LIVE-Zähler zurück.

## Events

`POST /api/bridge/widget-studio/events`

Bis zu 50 normalisierte Events pro Request:

```json
{
  "events": [
    {
      "event_key": "provider-event-123",
      "event_type": "follow",
      "actor_name": "viewer_name",
      "actor_avatar": "https://...",
      "amount": 1,
      "payload": {}
    },
    {
      "event_key": "provider-event-124",
      "event_type": "gift",
      "actor_name": "viewer_name",
      "amount": 5,
      "value": 0,
      "payload": {
        "gift_name": "Rose",
        "gift_id": "5655",
        "repeat_count": 5
      }
    },
    {
      "event_key": "viewer-snapshot-987",
      "event_type": "viewer_update",
      "amount": 173
    }
  ]
}
```

Unterstützte Event-Typen:

- `follow`
- `like` — `amount` wird auf LIVE Likes addiert
- `gift` — `amount` = Anzahl; `value` bleibt provider-neutral
- `share` — `amount` wird auf Shares addiert
- `viewer_update` — `amount` ist die **absolute** aktuelle Viewer-Zahl

`event_key` sollte vom Provider eindeutig sein. Doppelte Keys werden serverseitig dedupliziert.

## Sicherheit / Produktregeln

- Keine Bridge-Tokens in OBS-URLs.
- Klartext-Tokens werden nicht in der Datenbank gespeichert.
- Neuer Creator-Schlüssel widerruft den bisherigen Schlüssel automatisch.
- LIVE-Daten werden nur als LIVE bezeichnet, wenn eine aktive Session vorhanden ist.
- Profil-Likes bleiben von LIVE-Likes getrennt.
- `value` bei Gifts darf nicht als Geldbetrag bezeichnet werden, solange der Provider keine eindeutige Bedeutung garantiert.


## V8 Launcher Action Queue

Der Launcher kann vorbereitete Interaction-Aktionen abrufen:
- `GET /api/bridge/widget-studio/actions?limit=20`
- `POST /api/bridge/widget-studio/actions/ack` mit `{ "ids": ["..."] }`

Aktuell erzeugt die Website `launcher_tts` Actions für aktivierte Follow-, Gift- und Share-AutoThanks-Regeln. Der Launcher entscheidet später über Audio/TTS-Ausgabe.


## V9 Desktop Launcher Alpha

Der Ordner `launcher/` enthält jetzt den ersten echten Desktop-Client für dieses Protokoll.

Launcher-Funktionen:
- verschlüsselte Ablage des Bridge-Tokens über Electron `safeStorage`
- 10-Sekunden Heartbeat mit Backoff bei Verbindungsfehlern
- LIVE Start / Ende
- lokaler Event-Puffer mit maximal 500 Events
- Upload in Batches bis 50 Events
- Action Queue Polling
- AutoThanks TTS + ACK
- System Tray
- Windows Autostart
- Provider-Manager

Der enthaltene `mock` Provider erzeugt ausschließlich klar erkennbare Testdaten.
Der `tiktok` Provider ist ein Adapter-Slot und liefert absichtlich keine erfundenen LIVE-Daten.


## V10 Provider Beta

Der Launcher kann normalisierte Events nun optional aus `tiktok-live-api` / TikTool beziehen.

Das Bridge-Protokoll selbst bleibt unverändert. Provider-spezifische Felder werden im Launcher normalisiert, bevor sie an `/api/bridge/widget-studio/events` gesendet werden.

Damit bleiben Website, Backend, OBS und Widgets unabhängig vom gewählten LIVE-Provider.
