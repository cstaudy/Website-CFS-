# cfs_zockt Creator Suite — Widget Studio Master Checklist

Stand: 2026-09-06
Arbeitsprinzip: größere kumulative Milestones; keine Mini-Patches außer bei kritischen Bugs.

## 0. Aktueller Ausgangspunkt

- [x] Creator Accounts / Login
- [x] FREE / CREATOR / PRO Grundlagen
- [x] TikTok OAuth / Profilverbindung
- [x] TikTok Profil: Follower-Zahl
- [x] TikTok Profil: Gesamt-Likes
- [x] creator_widgets Datenbank
- [x] Draft / Published Trennung
- [x] stabile öffentliche OBS-URL
- [x] Widget Studio Dashboard V2
- [x] Create Flow V2
- [x] Editor V2
- [x] Presets: CFS Standard / Minimal / Neon / Glass / Compact / Wide / Blank
- [x] Glow / Schatten / einfache Animationen
- [x] Follower Goal
- [x] OBS Runtime für Studio-Widgets

## 1. Live Data Core / Event Bus — höchste Priorität

Ziel: Widgets kennen nicht TikTok direkt. Sie lesen nur normalisierte Creator-Suite-Daten.

### Datenquellen
- [x] profile.followers
- [x] profile.likes_total
- [x] live.connected
- [x] live.session_id
- [x] live.likes
- [x] live.viewers
- [x] live.shares
- [x] live.gifts.count
- [x] live.gifts.value (provider value/points; kein erfundener Geldwert)
- [x] live.followers_gained
- [x] live.started_at

### Event-Typen
- [x] follow
- [x] like
- [x] gift
- [x] share
- [x] viewer_update
- [x] live_start
- [x] live_end
- [ ] optional später: comment
- [ ] optional später: subscribe

### Backend
- [x] creator_live_sessions Tabelle + Session-Historie
- [x] creator_live_state Tabelle
- [x] creator_live_events Tabelle
- [x] Event-Normalisierung
- [x] Event-Deduplizierung
- [x] Event-Timestamps
- [x] Provider-Feld / Quelle
- [x] Creator-/Bridge-authentifizierter Ingest-Endpunkt
- [x] Test-/Simulator-Ingest
- [x] öffentliche Widget-Snapshot-Ausgabe
- [x] Event-/Action-Retention (7 Tage) + Session-Retention (90 Tage) + 5000 Event Cap

## 2. Provider-/Bridge-Schicht

Ziel: Die Website und Widgets bleiben unabhängig davon, woher LIVE-Daten kommen.

- [x] Provider-Registry / Interface-Metadaten
- [x] profile_api Provider (Profilwerte)
- [x] simulator Provider
- [x] launcher_bridge Provider (Transport/API)
- [x] Verbindungsstatus
- [x] Heartbeat
- [x] Reconnect-/Stale-Zustand serverseitig
- [x] stale/offline Erkennung
- [x] letzter Event-Zeitpunkt
- [ ] später echten TikTok-LIVE-Datenweg anbinden
- [x] niemals Profil-Likes fälschlich als LIVE-Likes darstellen

## 3. Widget Registry

Ziel: keine `if widgetType !== follower_goal` Sonderlösung mehr.

- [x] zentrale Widget-Type Registry
- [x] Name / Beschreibung / Kategorie
- [x] benötigte Datenquelle
- [x] erlaubte Presets
- [x] Default-Konfiguration
- [x] Feature-/Plan-Verfügbarkeit in Registry + serverseitiger Check
- [x] Test-Events pro Widget-Typ
- [x] Icon / Create-Flow-Metadaten

## 4. Goals

- [x] Follower Goal
- [x] Like Goal (LIVE Likes)
- [x] Gift Goal
- [x] Share Goal
- [x] Follower Gain Goal pro Session
- [x] Goal-Reached-Alert bei Crossing in OBS Runtime
- [x] Goal Reset über neue LIVE-Session/Simulator Reset; Ziel im Editor änderbar
- [x] Goal/Progress Animationen
- [x] Zielwerte im Editor

## 5. Counter Widgets

- [x] Follower Counter
- [x] Profil-Likes Counter (klar als Profilwert bezeichnet)
- [x] LIVE Like Counter
- [x] Viewer Counter
- [x] Gift Counter
- [x] Share Counter
- [x] Follower Gain Counter
- [x] Compact Preset für Counter

## 6. Latest Widgets

- [x] Latest Follower
- [x] Latest Gift
- [x] Latest Share
- [x] Gift-Name / Menge / provider value als Variablen
- [x] Viewer-/User Avatar wo verfügbar
- [x] Timeout / Ausblenden
- [x] Event-Animation

## 7. Alert Widgets

- [x] Follow Alert
- [x] Gift Alert
- [x] Share Alert
- [x] Goal Reached Alert
- [x] Alert-Dauer
- [x] Queue statt Überschreiben
- [x] Ein-/Ausblendanimation
- [ ] Sound-Schnittstelle vorbereiten
- [x] Bild / Avatar
- [x] Textvariablen
- [x] Test-Button pro Alert

## 8. AutoThanks / Interactions

Nicht als reines Design-Widget behandeln; gehört zur Live-Interaction-Schicht.

- [x] Follow AutoThanks Regel + Launcher Action Queue
- [x] Gift AutoThanks Regel + Launcher Action Queue
- [x] Share AutoThanks Regel + Launcher Action Queue
- [x] Regeln / Cooldown
- [x] Mindest-Giftanzahl optional (kein erfundener Geldwert)
- [x] Template-Text
- [~] Event-Simulator testet Event-Pipeline; Audio-Ausgabe folgt Launcher
- [x] Ausgabeziel launcher_tts als Action Queue definiert
- [ ] später Launcher / Audio / TTS anbinden

## 9. Create Flow

- [x] zuerst Widget-Typ auswählen
- [x] danach Preset auswählen
- [x] Kategorien: Goals / Counter / Alerts / Latest
- [x] Datenquelle sichtbar anzeigen
- [x] "Live Bridge nötig" klar markieren
- [x] verfügbare Widget-Typen + separate Interaction-Hinweise
- [x] Plan-Limits sauber darstellen
- [x] keine auswählbaren Fake-Funktionen

## 10. Editor

- [x] Layer
- [x] Drag / Resize
- [x] Zoom / Fit
- [x] Snap
- [x] Alignment
- [x] Testdaten
- [x] Glow / Shadow
- [x] Basisanimationen
- [ ] Binding-Auswahl im Inspector
- [x] widget-spezifische Einstellungen (Goal/Alert/Latest/Offline)
- [x] Event-Alert-Zustände
- [ ] Multi-Select
- [ ] Copy / Paste
- [ ] Bring Forward / Send Backward
- [ ] Fonts
- [ ] Gradients
- [ ] eigene Bilder / Assets
- [ ] bessere Color Controls
- [ ] Safe Area / Guides
- [ ] Undo/Redo komplett prüfen
- [~] responsive Regeln vorhanden; visuelle Browser-QA nach Deploy

## 11. OBS Runtime

- [x] öffentliche Token-URL
- [x] Draft ≠ Published
- [x] Profil-Follower
- [x] Basisanimationen
- [x] gemeinsamer Live Snapshot
- [x] Event Queue
- [x] Alert Queue
- [ ] Echtzeit-/Near-Realtime Updates
- [x] stale/offline Verhalten: halten / 0 / ausblenden
- [ ] transparenter Hintergrund
- [ ] Browser-Source Reload Recovery
- [ ] keine Abhängigkeit vom offenen Launcher
- [x] statischer Runtime-/Registry-Stresstest im V8 QA

## 12. Dashboard

- [x] Suche
- [x] Filter
- [x] Plan-Limit
- [x] Live/Entwurf
- [ ] Widget-Typ sichtbar
- [ ] Datenquelle / Bridge Status
- [x] Fehler-/Source-Status pro Widget
- [ ] "Live Daten fehlen" Warnung
- [ ] schnelle OBS URL
- [ ] Preview aller Widget-Typen
- [x] Sortierung: zuletzt / live / name / typ

## 13. Daten- und Produktqualität

- [ ] Profil-Likes und LIVE-Likes strikt trennen
- [ ] Gifts niemals mit erfundenem Geldwert darstellen
- [ ] Share-Zähler nur aus echter Sessionquelle
- [ ] Viewer-Zähler mit stale-Zustand
- [x] Eventdaten nur 7 Tage + Max-Cap
- [ ] keine Secrets in öffentlichen URLs
- [ ] öffentliche Widgets nur Published Config
- [ ] Rate Limits prüfen

## 14. Milestone-Reihenfolge

### Milestone V4 — Live Core + Registry
- [x] Live-Datenmodell
- [x] Event-Bus
- [x] Simulator
- [x] Widget Registry
- [x] API von `follower_goal only` lösen
- [x] Follower Counter
- [x] LIVE Like Goal + Counter (zunächst Simulator/Bridge-ready)
- [x] Viewer Counter
- [x] Share Counter
- [x] Gift Counter
- [x] Create Flow mit Widget-Typ-Auswahl

### Milestone V5 — Alerts + Latest
- [x] Follow Alert
- [x] Gift Alert
- [x] Share Alert
- [x] Latest Follower
- [x] Latest Gift
- [x] Event Queue Runtime
- [ ] Alert Editor Controls

### Milestone V6 — Launcher Bridge Transport + LIVE Session
- [x] Launcher-Bridge Transport/API
- [x] Heartbeat / Reconnect
- [~] Bridge-Endpunkt nimmt echte Launcher-Events an; TikTok Provider im PC-Launcher noch offen
- [x] Website Bridge-Status
- [~] Website/Bridge/OBS End-to-End fertig; echter TikTok Provider noch offen

### Milestone V7 — Creator Polish
- [ ] Assets
- [ ] Fonts
- [ ] Gradients
- [ ] Copy/Paste
- [ ] Multi-Select
- [ ] Preset Feinschliff
- [ ] Onboarding
- [ ] QA / Responsive / OBS Tests

## Definition of Done für jedes Widget

Ein Widget gilt erst als fertig, wenn:

- [ ] Create Flow vorhanden
- [ ] mindestens ein hochwertiges Preset vorhanden
- [ ] Editor funktioniert
- [ ] echte/korrekt bezeichnete Datenquelle vorhanden
- [~] Event-Simulator testet Event-Pipeline; Audio-Ausgabe folgt Launcher vorhanden
- [ ] Draft speichern funktioniert
- [ ] Publish funktioniert
- [ ] OBS URL funktioniert
- [ ] Reload funktioniert
- [ ] Offline/Stale Zustand funktioniert
- [ ] kein Fake-Live-Wert angezeigt wird
- [ ] UI passt zum cfs_zockt Qualitätsstandard


## Milestone V5 Ergebnis

- [x] Follow Alert
- [x] Gift Alert
- [x] Share Alert
- [x] Goal Reached Alert mit auswählbarer Ziel-Datenquelle
- [x] Latest Follower
- [x] Latest Gift
- [x] Latest Share
- [x] öffentliche, typgefilterte Event Queue für OBS
- [x] Alert Queue ohne Replay alter Events beim Browser-Source-Start
- [x] Alert-Dauer und Latest-Timeout im Editor
- [x] Event-Avatar Binding
- [x] Event-Textvariablen `{{actor}}`, `{{gift}}`, `{{amount}}`, `{{event}}`, `{{message}}`
- [ ] Echte LIVE-Bridge bleibt Milestone V6


## Milestone V8 Ergebnis — Website Completion

- [x] LIVE Session-Historie mit finalen Kennzahlen
- [x] Event-/Action-Retention und Cap
- [x] Provider Registry
- [x] Follower Gain Goal
- [x] Plan-ready Widget Registry
- [x] Dashboard Source-Health + Sortierung + Session Summary
- [x] Offline/Stale Verhalten pro LIVE-Widget: Hold / Zero / Hide
- [x] AutoThanks Regeln für Follow / Gift / Share
- [x] Cooldown + Mindestanzahl + Textvorlagen
- [x] Launcher Action Queue + ACK API
- [x] OBS Runtime respektiert Offline/Stale Einstellungen
- [x] Website-Seite des Widget Studios damit weitgehend vollständig
- [ ] Echter TikTok-LIVE-Provider bleibt bewusst PC-Launcher-Aufgabe
- [ ] Audio/TTS-Wiedergabe bleibt PC-Launcher-Aufgabe
- [ ] Visuelle Browser-/OBS-QA nach echtem Render-Deploy


## Milestone V9 — Desktop Launcher Alpha

- [x] Electron Desktop Shell
- [x] Creator Suite Launcher UI
- [x] System Tray
- [x] Bridge-Key über OS-Verschlüsselung
- [x] Heartbeat
- [x] Reconnect Backoff
- [x] LIVE Start / Ende
- [x] Offline Event Queue
- [x] Event Batch Upload
- [x] Simulator Provider
- [x] Provider Interface
- [x] AutoThanks Action Queue
- [x] lokale TTS-Ausgabe
- [x] Action ACK
- [x] Windows Autostart
- [x] lokale Logs mit Token-Maskierung
- [x] NSIS Build-Konfiguration
- [x] Website Launcher Bridge Center
- [ ] echter TikTok-LIVE Provider
- [ ] Audio Device / Voice Auswahl
- [ ] Windows Code Signing
- [ ] Auto Update
- [ ] echter Windows Installer Smoke Test


## Milestone V10 — optionaler LIVE Provider

- [x] optionaler LIVE Provider als getrenntes Modul
- [x] TikTool Provider-Adapter
- [x] Follow Events
- [x] LIVE Like Events
- [x] Gift Events
- [x] Share Events
- [x] Viewer Updates
- [x] TikTok Username Konfiguration
- [x] Provider API-Key lokal verschlüsselt
- [x] Provider klar als Drittanbieter markiert
- [x] Gifts `value` bleibt provider-neutral
- [ ] Feldtest während echtem TikTok LIVE
- [ ] Gift-Streak Verhalten real prüfen
- [ ] Provider-Reconnect real prüfen
- [ ] Windows Installer real bauen/testen


## Milestone V11 — Windows Release Candidate

- [x] Windows NSIS Installer-Konfiguration
- [x] Portable Windows Build
- [x] GitHub Actions Release Workflow
- [x] electron-updater Grundlage
- [x] Stable / Beta Update-Kanal
- [x] automatische Update-Prüfung
- [x] manueller Update-Check / Download / Install
- [x] Single-Instance-Lock
- [x] Renderer Crash Recovery
- [x] Diagnosebericht ohne Secrets
- [x] Bridge-Selbsttest
- [x] TTS Voice-Auswahl
- [x] TTS Pitch / Rate / Volume
- [x] AutoThanks Action-Deduplizierung
- [x] lokaler Windows Build-Helper
- [x] Release QA
- [ ] echter Windows Installer Build in GitHub Actions ausführen
- [ ] Code Signing Zertifikat hinterlegen
- [ ] echter TikTok-LIVE-End-to-End-Test
- [ ] OBS Mehrfach-Widget Lasttest


## Milestone V12 — Production Hardening

- [x] persistente LIVE Event Queue
- [x] Queue Deduplizierung
- [x] atomische lokale Queue-Speicherung
- [x] Queue Recovery nach Launcher-Neustart
- [x] LIVE Session Recovery
- [x] optional automatische Session-Wiederaufnahme
- [x] Stream Preflight
- [x] Bridge-Latenz in Diagnose
- [x] letzter erfolgreicher Event-Flush
- [x] Queue-Status im Launcher
- [x] separate Setup-/Portable-Dateinamen
- [x] Git Tag ↔ Launcher Version Check
- [x] SHA256 Checksums im Release Workflow
- [x] optionale Code-Signing-Secrets im Workflow
- [x] zusätzliche Spool-/Preflight-Tests
- [ ] GitHub Actions V0.12 Windows Build real ausführen
- [ ] Installer auf sauberem Windows 11 testen
- [ ] echter TikTok LIVE E2E Test
- [ ] OBS Multi-Widget Lasttest
- [ ] Code-Signing-Zertifikat für öffentlichen Release


## Milestone V13 — Automated Release Gate

- [x] Full LIVE Session E2E Harness
- [x] synthetischer Backend-Ausfall im E2E
- [x] Launcher-Neustart / Session Resume im E2E
- [x] Event-Deduplizierung im E2E
- [x] Action Queue / ACK im E2E
- [x] 900-Event Stress Test
- [x] 12-Source OBS Polling Simulation
- [x] Gift-Streak Tracker
- [x] Gift repeatEnd Normalisierung
- [x] Gift-Streak Timeout-Fallback
- [x] Event-Delivery-Metriken im Launcher
- [x] Release-Gate JSON/Markdown Report
- [x] Release Gate in GitHub Actions
- [x] Production Release Gate Checkliste
- [ ] Windows Real-World Gate
- [ ] echter TikTok LIVE Gate
- [ ] echter OBS Multi-Widget Gate


## Milestone V14 — Real LIVE Field Test

- [x] LIVE Event Monitor im Launcher
- [x] Follow Coverage
- [x] LIVE Like Coverage
- [x] Gift Coverage
- [x] Share Coverage
- [x] Viewer Coverage
- [x] Viewer Peak
- [x] Recent Event Trace
- [x] Event-Monitor Unit Test
- [x] Field-Test JSON Export
- [x] exportierte Actor-Namen pseudonymisiert
- [x] Field-Test Gate in automatischer Release QA
- [ ] Real TikTok LIVE: 5/5 Coverage
- [ ] Real Gift-Streak bestätigt
- [ ] Real Provider Reconnect bestätigt
- [ ] Real OBS Widgets bestätigt


## Milestone V15 — Creator Onboarding / OBS Doctor

- [x] First-Run Setup Wizard
- [x] Bridge-Key Setup Schritt
- [x] Provider Setup Schritt
- [x] Setup Preflight Gate
- [x] Setup Completion State
- [x] Setup Reset
- [x] OBS Doctor
- [x] OBS HTTPS / HTTP Status Check
- [x] OBS Antwortzeit
- [x] CFS Runtime Detection
- [x] OBS Transparenz-Hinweis
- [x] OBS URL Secret Redaction
- [x] Bridge Event Queue Drain
- [x] Queue Drain vor Session-Ende
- [x] Queue Drain vor App Exit
- [x] Update-Sperre während LIVE
- [x] Update-Sperre bei ungelieferter Queue
- [x] Support Bundle ohne Secrets
- [x] OBS Doctor Test
- [x] Graceful Shutdown / Drain Test
- [ ] Windows Installer real bauen
- [ ] echter TikTok LIVE Field Test
- [ ] echter OBS Browser Source Test


## Milestone V16 — Recovery & Deployment Control

- [x] Creator Ready Gesamtstatus
- [x] automatischer Creator-Cloud Healthcheck
- [x] Cloud Datenbank Status
- [x] Cloud Modulstatus
- [x] portable Konfiguration exportieren
- [x] Backup SHA-256 Prüfsumme
- [x] Konfigurationsimport mit Manipulationsprüfung
- [x] keine Secrets im portablen Backup
- [x] Setup nach PC-Import erneut erforderlich
- [x] lokale Restore Points
- [x] Restore Point Integritätsprüfung
- [x] Restore Point vor Konfigurationsimport
- [x] Restore Point vor Launcher Update
- [x] Event-Spool im lokalen Restore Point
- [x] Release Manifest Generator
- [x] Release Manifest SHA-256 Verifikation
- [x] GitHub Actions package-lock Cache-Fehler entfernt
- [x] Release Manifest in GitHub Artefakten
- [ ] echten GitHub Actions Windows Build ausführen
- [ ] Windows Installer real testen
- [ ] TikTok LIVE 5/5 Field Test
- [ ] reales OBS Gate


## Milestone V17 — Release Center & Version Control

- [x] Website Launcher Release Center
- [x] Stable / Beta Kanäle
- [x] GitHub Release Catalog serverseitig
- [x] Release Catalog Cache
- [x] optionaler GitHub API Token
- [x] Windows Setup Download aus echtem Release
- [x] Portable Download aus echtem Release
- [x] SHA256SUMS Download
- [x] Release Manifest Download
- [x] Changelog / GitHub Release Notes
- [x] Build-Ziel strikt von veröffentlichtem Release getrennt
- [x] Launcher Mindestversion
- [x] Launcher empfohlene Version
- [x] Update Required / Update Available Policy
- [x] Stable/Beta Policy im Bridge Heartbeat
- [x] Desktop Launcher zeigt Cloud Release Policy
- [x] serverseitiger Semver / Release Policy Test
- [x] Launcher Policy Consumption Test
- [x] Production Deployment GitHub Workflow
- [x] optionaler Render Deploy Hook
- [x] optionaler Production Health Verification Step
- [ ] erster echter GitHub Launcher Release
- [ ] erster echter Production Workflow Lauf
- [ ] Windows Setup vom Release Center herunterladen und installieren


## Milestone V18 — Production Safety & Rollback Control

- [x] serverseitige Launcher Blocklist
- [x] Wartungsmodus + Wartungsmeldung
- [x] Stable/Beta Rollout Prozent
- [x] deterministische Creator Cohorts
- [x] Rollout Pause bei 0 %
- [x] Stable/Beta Version Pin
- [x] Rollback Recommended
- [x] LIVE Allowed / Blocked Policy
- [x] Release Safety Revision
- [x] Website zeigt Rollout / Cohort / Safety
- [x] Desktop zeigt Rollout / LIVE Gate
- [x] LIVE Preflight blockiert unsichere Version
- [x] Session Recovery respektiert Safety Gate
- [x] aktive LIVE-Session wird nicht remote hart beendet
- [x] Safety-/Rollout-/Rollback Tests
- [x] Operations Runbook
- [ ] echten 5-%-Canary durchführen
- [ ] echten Rollback auf Windows testen
- [ ] echten Maintenance Gate Test durchführen


## Milestone V19 — Universal Widget Renderer / Creator Personalization

- [x] bestehende 19 Widget-Typen übernommen
- [x] bestehende OBS URLs kompatibel
- [x] Widget Config Version 6
- [x] gemeinsamer Browser Renderer
- [x] gemeinsamer Runtime Data Resolver
- [x] OBS Output Profil
- [x] TikTok Vertical 1080 × 1920
- [x] Landscape 1920 × 1080
- [x] Anchor je Output
- [x] X/Y Offset je Output
- [x] Scale je Output
- [x] Safe Area je Scene Output
- [x] 9:16 Preview im Widget Studio
- [x] 16:9 Preview im Widget Studio
- [x] Universal Output URLs
- [x] Creator Profil über Bridge
- [x] Creator Plan über Bridge
- [x] Creator Feature Flags über Bridge
- [x] Creator Avatar im Launcher
- [x] Creator Follower im Launcher
- [x] Creator Profil-Likes im Launcher
- [x] keine E-Mail / Tokens in Creator Identity Payload
- [x] profileFollowers Binding
- [x] profileLikes Binding
- [x] Renderer Isolation Test mit zwei Creatorn
- [x] Launcher Creator Profile Bridge Test
- [ ] echte virtuelle TikTok Videoquelle
- [ ] echter TikTok LIVE Studio Output Test
- [ ] echter Creator Beta-Test mit mehreren Accounts


## Milestone V20 — Scene Composer & Overlay Packs
- [x] Scene Studio
- [x] TikTok Vertical / Landscape
- [x] 24 Widgets pro Scene
- [x] Drag & Drop / Transform
- [x] Creator Ownership Validation
- [x] Published Widget Validation
- [x] Draft / Publish
- [x] Stable Scene Output URL
- [x] Scene Runtime
- [x] Bridge Scene Endpoint
- [x] Launcher LIVE OUTPUT
- [x] Scene Model / Bridge / Static QA
- [ ] native Virtual Camera
- [ ] echter TikTok LIVE Studio Test
- [ ] echter Multi-Creator Beta-Test


## Milestone V21 — Creator Isolation & Beta Control
- [x] Creator-spezifischer TikTok OAuth Start
- [x] Creator-spezifischer TikTok Status / Sync / Disconnect
- [x] Dashboard auf Creator TikTok Status umgestellt
- [x] V20 Scene TEXT-ID Schema Fix
- [x] Admin/Root Gate
- [x] Creator Control Center
- [x] Registrierung / TikTok / Launcher / Widgets / Scenes Übersicht
- [x] Creator Readiness Score
- [x] Beta Tester Status + Notizen
- [x] Admin TikTok Sync Check
- [x] Beta Status im Launcher
- [ ] V22 LIVE Recovery Protocol / Action Leasing


## Milestone V22 — LIVE Reliability / Recovery Protocol

- [x] persistenter LIVE Session Marker
- [x] atomisches Marker Write
- [x] Marker bleibt bei Recovery-Fehler erhalten
- [x] expliziter `/session/resume` Endpoint
- [x] Dry-Run Recovery Probe vor mutierendem Heartbeat
- [x] serverseitige Release-Safety Prüfung vor Resume
- [x] Session-ID bleibt beim Resume identisch
- [x] gleiche Session-Metriken werden beim Resume erhalten
- [x] Provider startet erst nach erfolgreicher Recovery-Probe
- [x] Heartbeat wird erst nach Recovery-Versuch aktiviert
- [x] Marker wird erst nach erfolgreichem Session-Ende gelöscht
- [x] Action Queue Leasing
- [x] `FOR UPDATE SKIP LOCKED` Claim
- [x] 45s Delivery Lease
- [x] ACK entfernt Lease und beendet Aktion
- [x] NACK plant begrenzten Retry
- [x] max. 5 Delivery-Versuche
- [x] 15 Minuten Action TTL
- [x] Speech-Synthesis `onerror` -> NACK
- [x] Provider Switching serialisiert
- [x] Logger Tail byte-basiert und redigiert getestet


## Milestone V23 — Creator Login / Device-Link

- [x] anonymer Device-Link Start Endpoint
- [x] kurzlebiger Geräte-Code
- [x] Device Secret nur gehasht im Backend
- [x] zukünftiger Bridge-Key nur gehasht im Backend
- [x] Pending Secrets lokal via safeStorage verschlüsselt
- [x] Website Confirmation Page
- [x] Bestätigung nur im eingeloggten Creator Account
- [x] Device-Link erstellt creator-spezifische Bridge
- [x] Device-Link ersetzt Bridge-Key Copy als Standard-Setup
- [x] Legacy Bridge-Key bleibt als Advanced Fallback
- [x] automatische Status-Polls
- [x] Pending Device-Link über Launcher Neustart fortsetzbar
- [x] Creator Plan/TikTok über Bridge
- [x] Creator Widget-/Scene-Bibliothek über Bridge
- [x] Geräteverwaltung auf Launcher-Webseite
- [x] einzelne Geräte widerrufen
- [x] Launcher Gerät abmelden
- [x] mehrere aktive PCs pro Creator möglich
- [x] Device-Link Client Test
- [x] Device-Link Config Encryption Test
- [x] V23 Backend Static QA


## Milestone V24 — Local Scene Output & Real-World Gate

- [x] lokaler Scene Output im Launcher
- [x] eigener frameless Capture BrowserWindow
- [x] native Scene Canvas Größe 1080×1920 / 1920×1080
- [x] transparente Ausgabe
- [x] schwarzer Test-Hintergrund
- [x] Chroma-Grün Test-Hintergrund
- [x] Display-Auswahl
- [x] Always-on-Top
- [x] Scene Reload / Stop
- [x] Creator-eigene Scene als einzige Startquelle
- [x] Output Renderer Crash Status
- [x] backgroundThrottling deaktiviert
- [x] persistente manuelle Real-World Gates
- [x] PASS / FAIL / OFFEN je Test
- [x] Output Testreport Export
- [x] Output Window Manager Test
- [x] Output Gate Store Test
- [x] V24 Static QA
- [ ] OBS Window Capture auf echtem Windows testen
- [ ] OBS Browser Source auf echtem Windows testen
- [ ] OBS Alpha/Transparenz real prüfen
- [ ] TikTok LIVE Studio Window Capture real prüfen
- [ ] endgültigen TikTok Output Weg festlegen
- [ ] OBS + TikTok parallel real testen
- [ ] 30-Minuten Lasttest


## Milestone V25 — CFS Stream Deck & Creator Daily UX

- [x] eigene STREAM DECK Seite im Launcher
- [x] Creator Name / Follower / Likes / Plan im Daily Control
- [x] LIVE / Local Output / AutoThanks Status
- [x] 12 persistente Stream-Deck Buttons
- [x] jeder Button frei konfigurierbar innerhalb sicherer Creator-Aktionen
- [x] LIVE Start / Stop
- [x] nächste Scene
- [x] bestimmte Scene
- [x] Local Output Stop / Reload
- [x] Widget lokal An / Aus
- [x] Follow Test Alert
- [x] Gift Test Alert
- [x] Share Test Alert
- [x] Test Alerts verändern keine Cloud LIVE Metriken
- [x] AutoThanks An / Aus
- [x] Creator Library Refresh
- [x] Dashboard Schnellzugriff
- [x] Widget Studio Schnellzugriff
- [x] Scene Studio Schnellzugriff
- [x] Games Schnellzugriff
- [x] Cut Studio Schnellzugriff
- [x] Stream Deck Reset auf CFS Standard
- [x] persistente Button-Belegung
- [x] Stream Deck Store Test
- [x] Stream Deck Action Dispatcher Test
- [x] lokale Scene Runtime Widget Visibility Control
- [x] lokale Scene Runtime TEST Event Weiterleitung
- [x] V28: echte Game Start/Stop Runtime
- [ ] physische Stream-Deck-Hardware Integration


## Milestone V26 — Plan Policy & Premium Enforcement

- [x] zentrale FREE / CREATOR / PRO Policy
- [x] FREE: 2 Widgets / 1 Scene / 1 Launcher-Gerät
- [x] CREATOR: 6 Widgets / 4 Scenes / 8 Stream-Deck Tasten / 3 Geräte
- [x] PRO: 12 Widgets / 12 Scenes / 12 Stream-Deck Tasten / 5 Geräte
- [x] LIVE Widgets ab CREATOR
- [x] Alerts ab CREATOR
- [x] AutoThanks ab CREATOR
- [x] Local Output ab CREATOR
- [x] CFS Stream Deck ab CREATOR
- [x] Cut Studio / Games ab CREATOR
- [x] Blank Template / Custom Branding PRO
- [x] serverseitige Widget-Typ Prüfung
- [x] serverseitige Widget-Template Prüfung
- [x] serverseitige Widget-Limit Prüfung
- [x] serverseitige Scene-Limit Prüfung
- [x] serverseitige AutoThanks Prüfung
- [x] serverseitige LIVE Session / Event Prüfung
- [x] Launcher Device-Limit Prüfung
- [x] Launcher Local Output Entitlement Guard
- [x] Launcher Stream Deck Entitlement Guard
- [x] Launcher LIVE Preflight Plan Guard
- [x] Beta-Grants separat vom Account-Plan
- [x] Beta FREE bleibt plan=free und erhält source=plan_plus_beta
- [x] creator_billing_subscriptions Datenmodell
- [x] öffentliche Plan Catalog API
- [x] Creator Access API
- [x] V26 Plan Policy Test
- [x] V26 Premium Enforcement Static QA
- [x] Launcher Entitlement Guard Test
- [x] Launcher Entitlement Preflight Test
- [x] V37: Stripe Hosted Checkout Provider angebunden
- [x] V37: Stripe Webhook-Signaturprüfung + Event-Dedupe implementiert
- [ ] echte Stripe Testmode-/Live-Zahlung mit realen Provider-Keys verifizieren

## Milestone V27 — Beta Feedback & Release Candidate
- [x] persistente Beta-Testsession im Launcher
- [x] Beta-Session Start / End über Creator Bridge
- [x] Beta-Funktion nur für aktive Beta-Tester
- [x] Version / Platform / Provider / Output-Gate je Session
- [x] sichere Diagnose-Zusammenfassung ohne Keys / Voll-Logs
- [x] Bug / UX / Idee / Sonstiges
- [x] Low / Medium / High / Critical
- [x] Repro Steps / Erwartet / Tatsächlich
- [x] Feedback an aktive Testsession bindbar
- [x] Beta Feedback Inbox im Admin Center
- [x] Admin Status NEW / REVIEWING / FIXED / CLOSED
- [x] Admin Notizen
- [x] Beta Testsession Liste
- [x] Release-Candidate Readiness Score
- [x] RC blockiert bei offenen Critical / High Bugs
- [x] RC Mindestanzahl Beta-Tester / Creator / Sessions
- [x] Beta Session Store Test
- [x] Beta Feedback Bridge Test
- [x] V27 Static / RC QA
- [ ] echter erster freiwilliger Beta-Test
- [ ] echte Windows/OBS/TikTok Real-World Gates
- [ ] Produktions-Canary


## Milestone V28 — Games Runtime & Cut Studio Creator Integration

### Games
- [x] Creator-spezifische Game Runtime
- [x] stabiler Game Output Token / URL
- [x] Chat Battle / Community Quiz / Gift Rush Profil-Grundlage
- [x] Team A / Team B Namen
- [x] Zielpunkte / Rundendauer
- [x] Game Start / Stop
- [x] Score Team A / Team B
- [x] Round Reset
- [x] Gewinner bei Zielpunktzahl
- [x] automatisches Rundenende nach Zeit
- [x] transparentes Game Overlay 900×300
- [x] Game Runtime im Scene Studio als Layer
- [x] Game Layer bleibt Creator-isoliert
- [x] Game Steuerung über Launcher Bridge
- [x] Game Start/Stop / Score / Reset im CFS Stream Deck
- [x] Game Control im Launcher Creator Tools
- [x] V29: TikTok LIVE Events über Game-Regeln auf Punkte mappen
- [ ] komplexe Quiz-/Team-Mechaniken

### Cut Studio
- [x] echte Creator Cut-Projekte
- [x] Projekt-Titel / Status / Format
- [x] 9:16 / 16:9 / 1:1 Export-Metadaten
- [x] Source-Dateiname nur als Metadatum
- [x] Clip Queue
- [x] In / Out Zeiten
- [x] Caption je Clip
- [x] Creator Ownership
- [x] CREATOR: 5 Projekte / 20 Clips je Projekt
- [x] PRO/Beta: 25 Projekte / 100 Clips je Projekt
- [x] Cut Projekte über Launcher Bridge
- [x] Cut Projekte im Launcher Creator Tools
- [x] Stream Deck kann konkretes Cut-Projekt öffnen
- [x] V30: lokale Video-Datei-Auswahl im Launcher
- [ ] echte Timeline
- [ ] Untertitel-Engine
- [x] V30: lokales Rendering / Clip-Export
- [x] V30: FFmpeg-Media-Engine
- [x] V32: GPU-Encoder Erkennung / Auswahl vorbereitet
- [ ] GPU-Hardwarebeschleunigung echter Windows-Realtest


## Milestone V29 — Game LIVE Rules & Cut Export Job Queue

### Game LIVE Rules
- [x] Regeln nur auf akzeptierte creator_live_events
- [x] Follow → Team-Punkte
- [x] Like → Team-Punkte
- [x] Gift → Team-Punkte
- [x] Share → Team-Punkte
- [x] fixe Punkte
- [x] Punkte × Event-Menge
- [x] Mindestmenge
- [x] optionaler exakter Gift-Name
- [x] optionale Provider Gift-ID
- [x] Team A / Team B
- [x] Rule Enable / Disable
- [x] deduplizierter Treffer pro rule_id + event_id
- [x] Regel-Historie / letzte Treffer
- [x] automatische Gewinnerprüfung
- [x] Website Rule Editor
- [x] Launcher zeigt aktive Regeln / Treffer
- [x] CREATOR: 8 Regeln
- [x] PRO/Beta: 24 Regeln
- [ ] erweiterte Kombos / Streaks / Zeitfenster
- [ ] Community-Quiz Logik

### Cut Export Jobs
- [x] Export-Manifest aus Projekt + ausgewählten Clips
- [x] keine Videodatei im Backend
- [x] Queue Status: queued
- [x] Launcher Claim
- [x] processing
- [x] completed
- [x] failed
- [x] canceled
- [x] Launcher-Zuordnung je Job
- [x] Attempts / Result / Error
- [x] Website Job Queue
- [x] Launcher Job Queue sichtbar
- [x] CREATOR: 10 gleichzeitig ausstehende Jobs
- [x] PRO/Beta: 50 gleichzeitig ausstehende Jobs
- [x] V30: lokale Media Engine verarbeitet Jobs
- [x] V30: lokale Quelldatei sicher/persistent zuordnen
- [x] V30: FFmpeg CPU-Rendering
- [ ] optionale GPU-Hardwarebeschleunigung

### V29 Reliability Fix
- [x] Event-Flush Serialisierung im Launcher
- [x] parallele Timer-/manuelle Flushes senden denselben Batch nicht doppelt
- [x] dedizierter Concurrency Regressionstest


## Milestone V30 — Local Cut Media Engine

### Lokale Quellen
- [x] lokale Videodatei per Electron Dateidialog auswählen
- [x] Projekt → lokaler Dateipfad persistent auf diesem PC
- [x] Dateiname/Existenz prüfen
- [x] Mapping kann geändert / entfernt werden
- [x] keine Videodatei wird zur CFS Cloud hochgeladen

### FFmpeg Engine
- [x] CFS_FFMPEG_PATH unterstützen
- [x] gebündelten Resources-Pfad prüfen
- [x] Launcher-Verzeichnis prüfen
- [x] System-PATH prüfen
- [x] FFmpeg Version / Verfügbarkeit anzeigen
- [x] In/Out je Clip anwenden
- [x] 9:16 / 16:9 / 1:1 Scale + Pad
- [x] 24–60 FPS Preset anwenden
- [x] H.264 + AAC MP4 Export
- [x] yuv420p / faststart
- [x] mehrere Clips eines Jobs nacheinander exportieren
- [x] lokaler Exportordner unter Videos/CFS Creator Suite/Exports
- [x] Fortschritt / aktueller Clip im Launcher
- [x] Exportordner direkt öffnen
- [x] V31: Caption Burn-in
- [x] V31: Timeline-Reihenfolge + Multi-Clip Reel
- [x] V32: Reel-Übergänge + Audio Gain/Fades/Normalize
- [x] V33: erste Zoom/Pan Start-/End-Keyframes + eine lokale Musikspur / 2-Track-Mix
- [x] V34: freie Zoom/Pan-Keyframe-Punkte + Voiceover + SFX + Ducking
- [x] V35: direkt ziehbarer visueller Kurveneditor + Rotation/Opacity + Mute/Solo/Pan
- [x] V36: mehrere Musik-/Voice-Spuren + Cubic-Bezier Value-Easing + lokale Waveform/Peak-Analyse
- [ ] optional: echte Bezier-Tangenten / Beat-Snap / Wellenform-Automation
- [ ] GPU NVENC / QSV / AMF Beschleunigung

### Job Lifecycle
- [x] queued → claimed → processing → completed
- [x] Fehler → failed
- [x] failed → retry → queued
- [x] Attempts werden bei erneutem Claim erhöht
- [x] Completion meldet nur Output-Metadaten an Backend
- [x] lokale vollständige Output-Pfade bleiben im Launcher

### QA
- [x] Media Source Store Test
- [x] Media Engine Fake-FFmpeg Test
- [x] Cut Job Retry Bridge Test
- [x] echter FFmpeg Smoke-Test in Build-Umgebung
- [x] Launcher Release Gate 43/43
- [ ] echter Windows-11 FFmpeg Test
- [ ] echter Creator-Video-Test mit großer Datei


## Milestone V31 — Timeline, Captions & Reel Export

### Timeline
- [x] persistente sort_order je Clip
- [x] Timeline-Reihenfolge im Backend
- [x] Creator kann Clips nach oben / unten verschieben
- [x] Reorder-Endpoint validiert alle Projekt-Clips
- [x] Export-Manifest übernimmt Timeline-Reihenfolge
- [x] einzelne Clips können aus dem Export deaktiviert werden

### Captions
- [x] Caption Burn-in pro Clip aktivierbar
- [x] Position oben / mitte / unten
- [x] Caption-Größe 18–120
- [x] Style Box / Outline / Clean
- [x] Caption-Konfiguration im Cloud-Manifest
- [x] FFmpeg drawtext Capability Probe
- [x] fehlender drawtext Filter blockiert Caption-Export mit verständlichem Fehler
- [x] Caption Preview im Cut Studio
- [x] Caption-Text wird für FFmpeg Filter escaped

### Reel Export
- [x] Export-Modus Einzelclips
- [x] Export-Modus Reel
- [x] Export-Modus Clips + Reel
- [x] einzelne Timeline-Segmente lokal rendern
- [x] Segmente per FFmpeg concat zu einem Reel zusammenbauen
- [x] Reel bleibt lokal im Creator Exportordner
- [x] Cloud erhält weiterhin nur Ergebnis-Metadaten
- [x] keine Video-Upload-Route

### QA
- [x] Timeline / Manifest Model Test
- [x] Caption/Reel Fake-FFmpeg Test
- [x] echter FFmpeg Caption + Reel Smoke-Test
- [x] V30 Media Regression
- [x] Regression V30–V19
- [x] Launcher Release Gate 45/45
- [ ] echter Windows-11 Caption/Reel Test
- [ ] großer Creator-Video-Test
- [x] V32: Übergänge zwischen Reel-Clips
- [x] V32: NVENC / QSV / AMF Capability Probe + explizite Encoder-Auswahl
- [ ] echter NVENC / QSV / AMF Windows-Test
- [x] V32: optionale FFmpeg Stage-/Bundle-Struktur für Windows vorbereitet
- [ ] finalen geprüften FFmpeg-Build + Lizenzdateien im Release tatsächlich mitliefern


## Milestone V32 — Transitions, Audio & Windows Media Prep

### Reel-Übergänge
- [x] Harter Schnitt
- [x] Fade
- [x] Dissolve
- [x] Wipe links / rechts
- [x] Slide links / rechts
- [x] Übergangsdauer 100–1500 ms
- [x] Dauer wird bei kurzen Clips automatisch sicher begrenzt
- [x] Video xfade
- [x] Audio acrossfade
- [x] FFmpeg xfade/acrossfade Capability Probe
- [x] stabiler FFmpeg-7 Filter-Complex Single-Thread Pfad
- [x] echter Transition-Reel Smoke-Test

### Audio
- [x] Gain je Clip -24 bis +12 dB
- [x] Fade-In je Clip
- [x] Fade-Out je Clip
- [x] 48 kHz Stereo Normalisierung des Audioformats
- [x] optionale Loudness-Normalisierung auf -16 LUFS
- [x] Audio-Bitrate 96–320 kbps
- [x] lautlose Quelldateien erhalten lokal einen Silent-Audio-Stream
- [x] kein Cloud-Audio-/Video-Upload

### Hardware Encoder Vorbereitung
- [x] libx264 Software-Pfad bleibt Standard
- [x] h264_nvenc erkennen
- [x] h264_qsv erkennen
- [x] h264_amf erkennen
- [x] explizite Encoder-Auswahl im Cut Studio
- [x] nicht vorhandener Hardware-Encoder erzeugt kontrollierten Fehler
- [x] Launcher zeigt erkannte Encoder
- [ ] echter NVIDIA Windows-Test
- [ ] echter Intel QSV Windows-Test
- [ ] echter AMD AMF Windows-Test
- [ ] automatischer Hardware-Fallback erst nach Realtests

### Windows FFmpeg Vorbereitung
- [x] resources/ffmpeg Suchpfad
- [x] vendor/ffmpeg Stage-Verzeichnis
- [x] electron-builder extraResources vorbereitet
- [x] npm ffmpeg:stage
- [x] npm ffmpeg:check
- [x] keine automatische Fremd-Binary aus dem Internet
- [x] Build-Dokumentation für Lizenz-/NOTICE-Dateien
- [ ] geprüfte FFmpeg Windows-Binary tatsächlich in Release-Artefakt
- [ ] Clean Windows 11 Install + Export
- [ ] Code-Signing / SmartScreen mit finalem Installer

### QA
- [x] Manifest Schema 3 Test
- [x] Audio/Transition Sanitizer Test
- [x] Transition/Audio Fake-FFmpeg Test
- [x] Silent-Audio-Fallback Test
- [x] GPU Encoder Probe Test
- [x] FFmpeg Bundle Prep Test
- [x] echter FFmpeg Fade + Audio + Caption Reel Smoke-Test
- [x] Regression V31–V19
- [ ] echter Windows-11 Media-Test

### V32 Final Gate
- [x] Launcher Release Gate 48/48
- [x] E2E LIVE Session mehrfach stabil wiederholt
- [x] kontrollierter Launcher-Restart wartet auf laufenden Event-Flush
- [x] Event-Flush-Serialisierung Regression bleibt grün


## Milestone V33 — Music Track, Visual Keyframes & Two-Track Audio

### Lokale Musikspur
- [x] Projekt kann Musikspur aktivieren
- [x] Musik-Dateiname nur als Cloud-Metadatum
- [x] lokale Musikdatei im Launcher je Projekt zuordnen
- [x] lokale Musikdatei getrennt von lokaler Videoquelle speichern
- [x] MediaSourceStore Schema 2
- [x] Migration älterer Schema-1 Video-Zuordnungen
- [x] Musik Gain -36 bis +6 dB
- [x] Start-Offset
- [x] Loop an / aus
- [x] Fade-In
- [x] Fade-Out
- [x] Musik wird nur in Reel / Clips+Reel gemischt
- [x] Einzelclip-Exports bleiben ohne Projekt-Musikspur
- [x] lokaler 2-Track-Mix: Reel-Audio + Musik
- [x] Video beim Music-Mix per stream-copy
- [x] Audio lokal neu als AAC gemischt
- [x] FFmpeg amix Capability Probe
- [x] Reel-Job blockiert verständlich wenn benötigte lokale Musik fehlt
- [x] keine Musikdatei in der Cloud

### Visuelle Keyframes
- [x] Keyframe an / aus je Clip
- [x] Zoom Start
- [x] Zoom Ende
- [x] Pan X Start / Ende
- [x] Pan Y Start / Ende
- [x] Linear Easing
- [x] Ease-In-Out
- [x] FFmpeg zoompan Rendering
- [x] Keyframes vor Caption-Burn-in
- [x] Keyframe-Konfiguration in Export-Manifest Schema 4
- [x] FFmpeg zoompan Capability Probe
- [x] V34: frei platzierbare Zoom/Pan-Keyframe-Punkte
- [x] V35: Timeline-Kurveneditor mit direkt ziehbaren Punkten
- [x] V35: Rotation / Opacity Keyframes
- [x] V36: Cubic-Bezier Value-Easing mit P1/P2

### Mehrspur-Audio Foundation
- [x] Original-/Clip-Audio als Spur 1
- [x] Projekt-Musik als Spur 2
- [x] unabhängiger Clip-Gain/Fades bleiben erhalten
- [x] unabhängiger Musik-Gain/Fades
- [x] lokal per amix zusammengeführt
- [x] V36: bis zu 4 Musikspuren gesamt
- [x] V34: Voiceover-Spur
- [x] V34: separate SFX-Spuren
- [x] V34: Sidechain-Ducking gegen Voice
- [x] V35: Mixer-Steuerung für vorhandene Audio-Tracks

### QA
- [x] Schema-4 Model Test
- [x] Music Source Store Migration/Test
- [x] Fake FFmpeg Zoompan Test
- [x] Fake FFmpeg Music-Mix Test
- [x] echter FFmpeg Keyframe + Musik Reel Smoke-Test
- [x] statische Local-Only QA
- [x] Regression V32–V19
- [x] Launcher Release Gate 52/52
- [ ] echter Windows-11 Musik/Keyframe-Test
- [ ] großes Creator-Video mit langer Musikspur


## Milestone V34 — Free Keyframes, Voiceover, SFX & Ducking

### Freie visuelle Keyframe-Punkte
- [x] bis zu 8 Punkte je Clip
- [x] Position 0–100 %
- [x] Zoom je Punkt
- [x] Pan X / Pan Y je Punkt
- [x] Easing je Segment
- [x] lineare Interpolation
- [x] Ease-In-Out Interpolation
- [x] automatische Sortierung
- [x] doppelte Zeitpunkte werden bereinigt
- [x] erster / letzter Punkt auf 0 / 100 % abgesichert
- [x] JSONB Speicherung im Backend
- [x] Export-Manifest Schema 5
- [x] FFmpeg piecewise zoompan Expressions
- [x] einfacher visueller Kurven-Preview im Cut Studio
- [x] V35: Punkte direkt auf dem Kurven-Canvas verschiebbar
- [x] V35: Rotation-Keyframes
- [x] V35: Opacity-Keyframes
- [ ] Bezier-Kurveneditor

### Voiceover
- [x] Voiceover aktiv / aus
- [x] Voice-Dateiname nur als Cloud-Metadatum
- [x] lokale Voice-Datei im Launcher
- [x] Gain
- [x] Startzeit auf der Reel-Timeline
- [x] Fade-In / Fade-Out
- [x] Reel-Job blockiert bei fehlender lokaler Voice-Datei
- [x] keine Voice-Datei in der Cloud

### SFX
- [x] bis zu 8 SFX-Metadatenspuren pro Projekt
- [x] stabile Track-ID
- [x] Name
- [x] Startzeit
- [x] Gain
- [x] Fade-In / Fade-Out
- [x] Track an / aus
- [x] lokale SFX-Datei je Track-ID im Launcher
- [x] Job-Readiness prüft alle aktiven SFX
- [x] keine SFX-Datei in der Cloud

### Sidechain-Ducking
- [x] Voiceover kann Musikspur automatisch ducken
- [x] FFmpeg sidechaincompress Capability Probe
- [x] Ducking Ratio 2–20
- [x] fester sicherer Threshold / Attack / Release
- [x] Voice bleibt parallel im finalen Mix hörbar
- [x] Musik wird nur bei aktivem Voice-Signal komprimiert
- [x] kein Ducking wenn Voice oder Musik deaktiviert ist

### Mehrspur-Mix
- [x] Reel/Clip-Audio
- [x] Musikspur
- [x] Voiceover
- [x] mehrere SFX-Spuren
- [x] alle Spuren auf 48 kHz Stereo normalisiert
- [x] finale Mischung per FFmpeg amix
- [x] Video beim finalen Audiomix per stream-copy
- [ ] mehrere Musikspuren
- [x] V36: bis zu 4 Voice-Spuren gesamt
- [ ] SFX-Wellenform / Mixer-Fader UI
- [x] V35: Solo / Mute / Pan je Audio-Track

### QA
- [x] Schema-5 Model Test
- [x] MediaSourceStore Schema 3 + Migration
- [x] Fake FFmpeg freie Keyframes
- [x] Fake FFmpeg Voice/SFX/Sidechain
- [x] echter FFmpeg Voice + SFX + Ducking + freie Keyframes Smoke-Test
- [x] Regression V33–V19
- [x] Launcher Release Gate 56/56
- [ ] echter Windows-11 Mehrspur-Test
- [ ] langer Creator-Reel-Test mit mehreren SFX


## Milestone V35 — Curve Editor, Rotation/Opacity & Mixer Controls

### Grafischer Keyframe-Kurveneditor
- [x] Kurven-Canvas pro Clip
- [x] direkt ziehbare Keyframe-Punkte
- [x] X-Achse = Timeline-Position
- [x] Y-Achse = ausgewählter Parameter
- [x] Zoom-Kurve
- [x] Pan-X-Kurve
- [x] Pan-Y-Kurve
- [x] Rotation-Kurve
- [x] Opacity-Kurve
- [x] Wertefelder und Canvas bleiben synchron
- [x] bis zu 8 Punkte
- [x] Pointer-/Touch-Unterbau
- [ ] echte Bezier-Kontrollpunkte / Tangenten
- [ ] Mehrfachauswahl von Keyframes
- [ ] Snap auf Beat / Frames

### Rotation / Opacity
- [x] Rotation -180 bis +180 Grad je Punkt
- [x] Opacity 0–1 je Punkt
- [x] Speicherung in `visual_keyframes`
- [x] Export-Manifest Schema 6
- [x] FFmpeg rotate Capability Probe
- [x] FFmpeg blend Capability Probe
- [x] piecewise Rotation-Expression
- [x] piecewise Opacity-Expression
- [x] Opacity blendet gegen den Cut-Canvas
- [x] Captions bleiben nach der visuellen Bewegung im Ausgabe-Canvas
- [x] echter FFmpeg Rotation/Opacity Smoke-Test

### Audio Mixer
- [x] Originalton Gain
- [x] Originalton Mute
- [x] Originalton Solo
- [x] Originalton Pan
- [x] Musik Mute / Solo / Pan
- [x] Voice Mute / Solo / Pan
- [x] SFX Mute / Solo / Pan
- [x] globale Solo-Logik
- [x] stummgeschaltete Tracks werden nicht in den finalen Mix aufgenommen
- [x] Stereo-Pan per FFmpeg `pan`
- [x] vorhandenes Voice-Ducking bleibt kompatibel
- [x] bei komplett stummem Mixer wird ein sicherer Silent-Audio-Pfad erzeugt
- [ ] mehrere Musikspuren
- [ ] mehrere Voiceover-Spuren
- [x] V36: echte lokale FFmpeg-Waveform-Analyse / PNG
- [x] V36: Peak-/Mean-dB Analyse beim lokalen Audio-Zuordnen
- [ ] Automation von Gain/Pan

### QA
- [x] Schema-6 Model Test
- [x] Curve-Editor Static QA
- [x] Fake FFmpeg Rotation/Opacity
- [x] Fake FFmpeg Mute/Solo/Pan
- [x] echter FFmpeg Rotation/Opacity + Mixer Reel Smoke-Test
- [x] Regression V34–V19
- [x] Launcher Release Gate 60/60
- [ ] echter Windows-11 Curve/Mixer-Test


## Milestone V36 — Final Creator Editing Pass

### Mehrere Musikspuren
- [x] primäre Musikspur bleibt kompatibel
- [x] bis zu 3 zusätzliche Musikspuren
- [x] insgesamt bis zu 4 Musikspuren
- [x] stabile Track-ID
- [x] Name / Timeline-Start
- [x] Gain
- [x] Fade-In / Fade-Out
- [x] Loop
- [x] Mute / Solo / Pan
- [x] lokale Datei je Track-ID im Launcher
- [x] Export-Preflight für zusätzliche aktive Tracks
- [x] gemeinsamer Music-Bus im finalen FFmpeg-Mix

### Mehrere Voice-Spuren
- [x] primäre Voice-Spur bleibt kompatibel
- [x] bis zu 3 zusätzliche Voice-Spuren
- [x] insgesamt bis zu 4 Voice-Spuren
- [x] stabile Track-ID
- [x] Name / Timeline-Start
- [x] Gain
- [x] Fade-In / Fade-Out
- [x] Mute / Solo / Pan
- [x] lokale Datei je Track-ID im Launcher
- [x] gemeinsamer Voice-Sidechain-Bus
- [x] mehrere Voice-Spuren können gemeinsam die Musik ducken

### Cubic-Bezier Easing
- [x] neues Easing `bezier`
- [x] P1 / P2 Werte pro Segment
- [x] serverseitig auf 0–1 begrenzt
- [x] Export-Manifest Schema 7
- [x] echte Cubic-Bezier Value-Expression in FFmpeg
- [x] kombinierbar mit Zoom / Pan / Rotation / Opacity
- [ ] echte X/Y-Tangenten direkt auf dem Kurven-Canvas
- [ ] Bezier-Handle-Dragging
- [ ] Beat-/Frame-Snap

### Lokale Audioanalyse
- [x] FFmpeg `volumedetect`
- [x] Peak dB
- [x] Mean dB
- [x] Dauer soweit aus FFmpeg-Analyse verfügbar
- [x] FFmpeg `showwavespic`
- [x] echte Waveform-PNG im lokalen Analyse-Cache
- [x] Analysewerte werden lokal beim Audiofile gespeichert
- [x] primäre Musik-/Voice-Waveform im Launcher sichtbar
- [x] zusätzliche Music/Voice/SFX-Dateien werden ebenfalls lokal analysiert
- [ ] vollständige Timeline-Wellenform aller Spuren übereinander
- [ ] Live Peak-Meter während Playback
- [ ] Gain-/Pan-Automation entlang der Timeline

### Local-Only Grenze
- [x] keine Music-Datei in der Cloud
- [x] keine Voice-Datei in der Cloud
- [x] keine SFX-Datei in der Cloud
- [x] Waveform-PNG bleibt lokal
- [x] Peak-/Mean-Analyse bleibt lokal
- [x] Cloud speichert nur Projekt-/Track-/Keyframe-Metadaten

### QA
- [x] Manifest Schema 7 Test
- [x] Multi-Music/Multi-Voice Sanitizer
- [x] MediaSourceStore Schema 4 + Migration
- [x] Cubic-Bezier Fake-FFmpeg-Test
- [x] Multi-Bus Fake-FFmpeg-Test
- [x] Peak-/Waveform Fake-FFmpeg-Test
- [x] echter FFmpeg V36 Smoke-Test
- [x] Regression V35–V19
- [x] Launcher Release Gate 65/65
- [ ] echter Windows-11 Realtest


## Milestone V37 — Billing, Subscriptions & Production Readiness

### Stripe Hosted Checkout
- [x] Stripe Node SDK serverseitig vorgesehen / Version gepinnt
- [x] Hosted Checkout Session für CREATOR
- [x] Hosted Checkout Session für PRO
- [x] Creator-ID in Checkout-Metadaten
- [x] Plan in Checkout- und Subscription-Metadaten
- [x] vorhandener Billing-Customer wird wiederverwendet
- [x] doppelter Checkout bei aktiver verwalteter Subscription blockiert
- [x] Checkout wird nur angeboten wenn Secret + Webhook Secret + passende Price-ID konfiguriert sind
- [x] keine Stripe-Secrets im Browser
- [ ] echter Stripe Testmode Checkout mit realem Test-Account
- [ ] Live-Mode erst nach Testmode-Abnahme

### Billing Webhooks
- [x] Raw-Body Route vor express.json
- [x] Stripe-Signaturprüfung
- [x] `checkout.session.completed`
- [x] `customer.subscription.created`
- [x] `customer.subscription.updated`
- [x] `customer.subscription.deleted`
- [x] `invoice.payment_failed`
- [x] `invoice.paid`
- [x] persistente Event-ID Deduplizierung
- [x] Schutz gegen ältere Subscription Events
- [x] Billing Event Audit-Tabelle ohne vollständige Payment-Payload
- [ ] echter Stripe CLI / Testmode Webhook E2E

### Subscription Entitlements
- [x] aktive Subscription hebt FREE auf CREATOR / PRO an
- [x] Trialing erhält Subscription-Zugriff
- [x] Canceled / Unpaid / Paused fallen auf Basisplan zurück
- [x] vorhandener manueller höherer Basisplan wird nicht heruntergestuft
- [x] Beta-Grants bleiben von Billing getrennt
- [x] Launcher erhält effektiven Billing-Plan über Creator Bridge
- [x] Launcher zeigt Billing-/Grace-Zustand an

### Upgrade / Downgrade / Kündigung
- [x] Stripe Customer Portal Session
- [x] Portal-Link im Plan-Bereich
- [x] Upgrade/Downgrade über Provider-Portal vorgesehen
- [x] Kündigung zum Periodenende wird im Access State angezeigt
- [x] Zugriff bleibt bei aktiver Subscription bis zum Periodenende bestehen
- [x] Payment-Failure Grace Period konfigurierbar, Standard 3 Tage
- [x] `invoice.paid` beendet Payment-Failure Grace
- [ ] Customer-Portal Produkt-/Planwechsel im echten Stripe Testmode konfigurieren und testen

### Production Readiness
- [x] eigener Production-Readiness Evaluator
- [x] Billing-Konfiguration als Release-Gate sichtbar
- [x] RC-Daten-Gate eingebunden
- [x] echte externe Gates standardmäßig OFFEN
- [x] Windows Build / Clean Install / Updater / OBS / TikTok / Billing / 2 Creator / Canary / Rollback getrennt
- [x] Admin Production Readiness API
- [x] Admin Billing Center API
- [x] Admin UI für Production Score / Blocker / Billing Subscriptions
- [ ] GitHub Windows Build real verifizieren
- [ ] Clean Windows 11 real verifizieren
- [ ] OBS + TikTok LIVE real verifizieren
- [ ] Stripe Testmode real verifizieren
- [ ] Production Canary / Rollback real verifizieren

### Reproduzierbarkeit
- [x] Stripe SDK-Version im package.json exakt gepinnt
- [ ] Root package-lock erzeugen / `npm ci` aktivieren — Registry war in dieser Build-Umgebung nicht erreichbar

### QA
- [x] Billing Access State Test
- [x] Stripe Subscription Snapshot Test
- [x] Grace-Period Test
- [x] Webhook Event-Reihenfolge Test
- [x] Production Readiness Test
- [x] Billing Static QA
- [x] Launcher Billing Entitlement Test
- [x] Regression V36–V19
- [x] Launcher Release Gate 69/69
- [ ] echter Stripe Provider-E2E


## Milestone V38 — Windows Release Evidence, Stripe Testmode Evidence & Canary

### Production Evidence
- [x] persistente Tabelle `creator_production_evidence`
- [x] Evidence-Typen für Windows Build / Code Signing / Clean Install / Updater / OBS / TikTok / Billing / 2 Creator / Canary / Rollback
- [x] Status VERIFIED / FAILED / REVOKED
- [x] Release-Version
- [x] Environment / Target
- [x] Referenz
- [x] optionaler Artifact SHA256
- [x] Notiz / Details JSON
- [x] beobachteter Zeitpunkt / Ablaufzeit
- [x] Admin-Autor wird gespeichert
- [x] Evidence anderer Releases überschreibt aktuellen Release-Status nicht
- [x] abgelaufene Evidence zählt nicht mehr
- [x] neuere FAILED/REVOKED Evidence kann ältere VERIFIED Evidence blockieren
- [x] Admin Production Evidence API
- [x] Admin UI zum Erfassen und Prüfen der Evidence
- [ ] reale Evidence erst nach tatsächlichem Test auf VERIFIED setzen

### Stripe Testmode E2E Evidence
- [x] nur `livemode=false`
- [x] nur erfolgreich verarbeitete Webhook-Events
- [x] Checkout Session Completed erforderlich
- [x] Subscription Created erforderlich
- [x] Subscription Lifecycle Update/Delete erforderlich
- [x] Invoice Paid erforderlich
- [x] Checkout und Invoice müssen zu mindestens einem gleichen Creator korrelieren
- [x] 14-Tage Lookback
- [x] automatischer PASS im Production Gate wenn echte Sequenz vorhanden ist
- [ ] echte Stripe-Testmode-Sequenz mit realem Stripe Test-Account ausführen
- [ ] Customer Portal Testmode real ausführen
- [ ] Payment-Failure / Recovery real ausführen

### Windows Build Evidence
- [x] `windows-build-evidence.json`
- [x] Setup EXE muss im Dist vorhanden sein
- [x] Portable EXE muss im Dist vorhanden sein
- [x] Release Manifest muss vorhanden sein
- [x] SHA256SUMS muss vorhanden sein
- [x] SHA256 je Evidence-Asset
- [x] Dateigröße je Asset
- [x] Git SHA / GitHub Run-ID / Ref
- [x] Authenticode-Status wird im Windows Workflow geprüft
- [x] Evidence wird als Build-Artifact und GitHub-Release-Datei angehängt
- [ ] echten GitHub Windows Workflow ausführen
- [ ] echte Windows Evidence danach im Admin Center hinterlegen
- [ ] Code Signing muss real `Valid` liefern

### Canary / Rollback
- [x] `production-canary-check.mjs`
- [x] `/api/health` HTTP Status
- [x] `ok=true`
- [x] DB `connected`
- [x] exakter Backend-Versionstest
- [x] optional Plan-Catalog / Billing-Konfiguration prüfen
- [x] JSON Evidence Report
- [x] Production Deploy Workflow führt Canary Check aus wenn Produktions-URL gesetzt ist
- [x] separates manuelles Canary/Rollback Verification Workflow
- [ ] echten Production Canary ausführen
- [ ] echten Rollback auf vorherige Version ausführen
- [ ] Rollback-Version mit Verifier bestätigen

### Reproduzierbarkeit
- [x] Release Evidence enthält konkrete SHA256 statt nur Dateinamen
- [ ] Root `package-lock.json` erzeugen
- [ ] Launcher `package-lock.json` erzeugen
- [ ] Release-Workflows von `npm install` auf `npm ci` umstellen
- [ ] Registry-Zugriff in einer geeigneten Build-Umgebung für Lockfiles durchführen

### QA
- [x] Production Evidence Test
- [x] Stripe Testmode Evidence Test
- [x] Windows Build Evidence Test
- [x] Canary Health/Version Test
- [x] Production V38 Static QA
- [x] V37 Billing/Readiness Regression
- [x] bestehende V36–V19 Gates weiterhin im Full Release Gate
- [x] Launcher Release Gate 74/74
- [ ] echter GitHub-Windows-Run
- [ ] echter Stripe-Testmode-E2E
- [ ] echter Production Canary/Rollback


## Milestone V39 — Release Acceptance, Beta Cohorts & Go/No-Go

### Release Acceptance Protocols
- [x] Windows 11 Installer Acceptance
- [x] Installed Updater E2E Acceptance
- [x] Stripe Testmode Billing Acceptance
- [x] OBS Output Acceptance
- [x] TikTok LIVE Acceptance
- [x] feste Pflichtschritte je Protokoll
- [x] Status PENDING / PASS / FAIL / SKIP je Schritt
- [x] PASSED nur wenn alle Pflichtschritte PASS
- [x] FAIL erzwingt Acceptance FAILED
- [x] PASSED braucht Referenz oder nachvollziehbare Notiz
- [x] immutable Acceptance Snapshots
- [x] Release-Version pro Acceptance
- [x] Environment / Target / Referenz / Notes
- [ ] reale Windows Installer Acceptance durchführen
- [ ] reale Updater Acceptance durchführen
- [ ] reale Stripe Testmode Acceptance durchführen
- [ ] reale OBS Acceptance durchführen
- [ ] reale TikTok LIVE Acceptance durchführen

### Windows / Updater Acceptance Templates
- [x] generischer Acceptance Template Generator
- [x] Windows Install JSON Template
- [x] Updater E2E JSON Template
- [x] Templates starten vollständig auf PENDING
- [x] GitHub Windows Workflow erzeugt beide Templates
- [x] Templates werden mit Release-Artefakten hochgeladen
- [ ] Template auf echtem Windows 11 ausfüllen
- [ ] Ergebnisse als Acceptance Snapshot im Admin Center speichern

### Beta Cohorts
- [x] `creator_release_cohorts`
- [x] `creator_release_cohort_members`
- [x] Release-scoped Cohorts
- [x] Pilot Stage
- [x] Expanded Stage
- [x] Pilot Default Target 5
- [x] Expanded Default Target 20
- [x] Creator Status INVITED / ACTIVE / COMPLETED / REMOVED
- [x] Sessions Required Metadatum
- [x] Creator direkt im Admin Center zuweisen
- [x] Cohort Score / Member Count / Session Count
- [x] Pilot Ready nur mit 5 echten Release-Testern + 5 echten Sessions
- [x] Expanded Ready nur mit 20 echten Release-Testern + 20 echten Sessions
- [x] alte Launcher-Versionen zählen nicht für V39 Cohort-Readiness
- [x] manuelles `COMPLETED` ersetzt keine echte Beta-Session
- [ ] Pilot mit 5 realen Creator abschließen
- [ ] Expanded Beta mit 20 realen Creator abschließen

### Production Go / No-Go
- [x] Production Readiness muss vollständig sein
- [x] alle fünf Acceptance-Protokolle müssen PASSED sein
- [x] Pilot Beta muss READY sein
- [x] Expanded Beta muss READY sein
- [x] keine offenen Critical Bugs
- [x] keine offenen High Bugs
- [x] automatische Empfehlung GO oder HOLD
- [x] Score und einzelne Blocker
- [x] Admin Decision GO / HOLD / NO-GO
- [x] Entscheidung braucht Begründung
- [x] GO ist serverseitig blockiert solange Automatic Gate nicht READY ist
- [x] HOLD und NO-GO sind jederzeit dokumentierbar
- [x] immutable Decision Snapshot
- [x] Snapshot enthält Production Blocker / Cohorts / Acceptances
- [ ] finales echtes GO erst nach Real-World-Abnahmen

### Admin Release Operations
- [x] Go/No-Go Dashboard
- [x] Acceptance Editor
- [x] Beta Cohort Manager
- [x] Creator-Zuweisung
- [x] Decision History
- [x] Production Evidence bleibt separat sichtbar
- [x] Stripe Testmode Evidence bleibt separat sichtbar

### QA
- [x] Acceptance Model Test
- [x] Acceptance Proof Requirement Test
- [x] Beta 5/20 Cohort Test
- [x] Release-Version Session Isolation Test
- [x] Go/Hold Test
- [x] Manual GO Bypass Block Test
- [x] Admin Release Ops Static QA
- [x] Acceptance Template Test
- [x] Regression aller bisherigen Release Gates
- [x] Launcher Release Gate 80/80
- [ ] echte Windows/Stripe/OBS/TikTok/Cohort-Abnahme


## Milestone V40 — GitHub Repository & Deployment Operations

### Repository Hygiene
- [x] `.gitignore`
- [x] `node_modules` ausgeschlossen
- [x] `.env` ausgeschlossen
- [x] Zertifikate / private Keys ausgeschlossen
- [x] ZIP / EXE / MSI ausgeschlossen
- [x] lokale Runtime-/Media-Daten ausgeschlossen
- [x] `.env.example` bewusst erlaubt
- [x] automatischer Repository-Hygiene-Test

### GitHub Source
- [x] aktives Production-Repo bleibt `cstaudy/CFS-TikTok-Backend`
- [x] Website/Backend im Root
- [x] Launcher bleibt im Unterordner `/launcher`
- [x] altes separates Widget-Studio-Testrepo nicht im Production-Pfad
- [x] kumulatives Milestone-ZIP ist Transport/Backup, nicht Repository-Datei
- [x] Gesamtstand muss vor Commit entpackt werden

### GitHub Quality Gate
- [x] neuer `.github/workflows/quality-gate.yml`
- [x] Pull Request gegen `main`
- [x] Push auf `main`
- [x] manueller Trigger
- [x] Backend/Repository V40 QA
- [x] kompletter Launcher Release Gate
- [x] keine Runtime-Secrets erforderlich
- [x] kein npm-Registry-Download für den Quality Gate erforderlich
- [x] Release Gate Report als GitHub Artifact

### GitHub Production Deployment
- [x] Push auf `main` deployt Production nicht mehr automatisch
- [x] Production Deployment nur `workflow_dispatch`
- [x] GitHub Environment `production`
- [x] `RENDER_DEPLOY_HOOK_URL` als Production Secret vorgesehen
- [x] `CFS_PRODUCTION_URL` als Production Variable vorgesehen
- [x] Canary nach Deployment
- [x] Rollback/Canary Verification bleibt separat
- [ ] echtes GitHub Environment `production` im Repository konfigurieren
- [ ] echten manuellen Production-Deploy damit ausführen

### GitHub Windows Release
- [x] GitHub Environment `windows-release`
- [x] `CSC_LINK` als Signing Secret vorgesehen
- [x] `CSC_KEY_PASSWORD` als Signing Secret vorgesehen
- [x] Windows Build Evidence
- [x] SHA256SUMS
- [x] Release Manifest
- [x] Windows Acceptance Templates
- [x] Installer/Portable gehören in GitHub Releases, nicht in Source
- [ ] echtes Environment `windows-release` konfigurieren
- [ ] echten Windows Release Run ausführen

### Render Runtime
- [x] Runtime-Secrets klar als Render-Konfiguration dokumentiert
- [x] `DATABASE_URL`
- [x] TikTok Client Secret
- [x] Token Encryption Key
- [x] Stripe Secret Key
- [x] Stripe Webhook Secret
- [x] optionale GitHub Release API Credentials
- [x] Launcher Build Target 0.40.0
- [x] Release Evidence Version 0.40.0
- [x] Render Setup Runbook

### Legacy Verification Safety
- [x] alte `CFS_*_VERIFIED` Flags standardmäßig deaktiviert
- [x] V38 Evidence / V39 Acceptance ist der normale Release-Pfad
- [x] expliziter Legacy-Opt-in nur über `CFS_ALLOW_LEGACY_VERIFICATION_FLAGS=true`
- [x] `.env.example` setzt Legacy Opt-in auf `false`

### GitHub Collaboration
- [x] Bug Issue Form
- [x] Release-Acceptance Issue Form
- [x] Blank Issues deaktiviert
- [x] Pull Request Template
- [x] Dependabot Root npm
- [x] Dependabot Launcher npm
- [ ] `main` Ruleset im echten Repository einrichten
- [ ] Status Check `Repository Quality` verlangen
- [ ] Status Check `Launcher Release Gate` verlangen

### Dependency Locking
- [ ] Root `package-lock.json`
- [ ] Launcher `package-lock.json`
- [ ] Build-/Deploy-Workflows auf `npm ci`
- [x] Registry-Versuch V40 erneut durchgeführt
- [x] wegen Timeout keine Lockfiles von Hand erfunden

### QA
- [x] Repository Hygiene Test
- [x] GitHub Setup QA
- [x] Deployment Flow QA
- [x] Legacy Flag Safety Test
- [x] GitHub/Render File Placement Test
- [x] V39 Regression
- [x] kompletter kumulativer Launcher Release Gate 85/85


## Milestone V41 — Configuration Doctor & GitHub Bootstrap

### Config Doctor
- [x] Runtime-Profil
- [x] GitHub-production-Profil
- [x] GitHub-windows-release-Profil
- [x] required / optional
- [x] OK / MISSING / INVALID / OPTIONAL_MISSING
- [x] HTTPS-Validierung
- [x] PostgreSQL-URL-Validierung
- [x] semantische Versionen
- [x] Stripe Prefix-Validierung
- [x] Token-Key Mindestlänge
- [x] mindestens ein Admin-Zugang
- [x] Legacy Verification Flags müssen normal deaktiviert sein
- [x] Secret Redaction Test
- [x] keine Rohwerte in JSON Reports

### Admin Config Doctor
- [x] Admin API
- [x] no-store
- [x] Backend-Version sichtbar
- [x] Launcher Target sichtbar
- [x] Evidence-Version sichtbar
- [x] Runtime READY/BLOCKED
- [x] einzelne ENV-Namen + Status
- [x] keine Secret-Werte im Frontend

### GitHub Configuration Doctor
- [x] workflow_dispatch
- [x] `production` Environment
- [x] `windows-release` Environment
- [x] Render Hook / Production URL Prüfung
- [x] Signing Certificate / Password Prüfung
- [x] redaktierte Artifact Reports
- [ ] echten Workflow im Repository ausführen

### Bootstrap Plan
- [x] Source Sync Schritt
- [x] Quality Gate Schritt
- [x] Production Environment Schritt
- [x] Windows Environment Schritt
- [x] Render Runtime Schritt
- [x] Labels Schritt
- [x] Ruleset Schritt
- [x] Windows Release Schritt
- [x] Acceptance Schritt
- [x] Go/No-Go Schritt
- [x] Production Deploy Schritt
- [x] Lockfile Schritt
- [x] JSON Report
- [x] Markdown Report
- [x] Quality Gate Artifact

### GitHub Labels / Ownership
- [x] manueller Label Setup Workflow
- [x] Repository GITHUB_TOKEN
- [x] minimale `issues: write` Berechtigung
- [x] 11 CFS Labels
- [x] CODEOWNERS für @cstaudy
- [x] CODEOWNERS erzwingt ohne Ruleset noch keine Reviews

### QA
- [x] Config Doctor Test
- [x] Secret Redaction Test
- [x] Bootstrap Plan Test
- [x] Configuration Workflow QA
- [x] Admin Config Doctor QA
- [x] GitHub Labels/CODEOWNERS Test
- [ ] echter GitHub Configuration Doctor
- [ ] echter Render Runtime Doctor


## Milestone V42 — Final Test & Verification Freeze
- [x] Feature Freeze
- [x] 13 Testbereiche
- [x] 109 manuelle Prüfungen
- [x] JSON Testmatrix
- [x] Markdown Testmatrix
- [x] CSV Testmatrix
- [x] Summary JSON
- [x] Final Verification Report
- [x] GitHub Final Verification Workflow
- [x] Root V42 QA
- [x] Launcher Release Gate 93/93
- [ ] alle 109 Checks real bewerten
- [ ] alle FAILs beheben und retesten
- [ ] finales Go/No-Go
