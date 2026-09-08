# cfs_zockt Creator Suite — Master-Checkliste

Stand: Milestone V42 / Launcher 0.42.0

Diese Liste ist ab jetzt die zentrale Arbeitsreihenfolge. Jeder neue Milestone
markiert Punkte als erledigt und nimmt den nächsten sinnvollen Block.

## A. BASIS / ACCOUNT / WEBSITE — FERTIG

- [x] Registrierung und Login
- [x] Creator Accounts strikt getrennt
- [x] FREE / CREATOR / PRO Plan-Grundlage
- [x] serverseitige Entitlements / Module
- [x] Creator Dashboard
- [x] Creator Setup
- [x] Account / Security Basis
- [x] gleiche Creator-ID als Datenanker für Website, Widgets, Launcher und LIVE-State

## B. TIKTOK PROFIL — FERTIG / V21 BEREINIGT

- [x] TikTok OAuth Grundlage
- [x] TikTok Tokens serverseitig gespeichert
- [x] Avatar / Display Name
- [x] Follower
- [x] Following
- [x] Profil-Likes
- [x] Videoanzahl
- [x] Profile und LIVE Likes getrennt
- [x] V21: jeder eingeloggte Creator startet seine eigene TikTok-Autorisierung
- [x] V21: Creator-spezifischer TikTok Status
- [x] V21: manueller Creator Profil-Sync
- [x] V21: Creator kann eigene TikTok-Verbindung trennen
- [x] V21: Dashboard benutzt Creator-spezifischen TikTok Status
- [ ] Realtest mit zwei echten TikTok Creator Accounts
- [ ] TikTok App/Scopes in finalem Live-App-Status mit echten Testern bestätigen

## C. WIDGET STUDIO — FERTIGER KERN

- [x] 19 Widget-Typen
- [x] Presets
- [x] Text / Counter / Progress / Shape / Image
- [x] Layer / Multi-Select / Alignment / Copy & Paste
- [x] Typografie / Gradient / Glow / Shadow
- [x] Animationen
- [x] Profile Bindings
- [x] LIVE Bindings
- [x] Alerts / Latest / Goals
- [x] Draft und Published getrennt
- [x] stabile öffentliche Widget-URL
- [x] OBS Browser-Source kompatibel
- [x] Offline Behavior hold / zero / hide
- [x] Universal Renderer
- [x] TikTok Vertical Output-Profil 1080×1920
- [x] Landscape 1920×1080
- [x] Safe Area / Position / Scale je Output

## D. SCENE STUDIO / OVERLAY PACKS — FERTIGER KERN

- [x] Scene Studio
- [x] mehrere Widgets in einer Scene
- [x] TikTok Vertical Scene
- [x] Landscape Scene
- [x] Drag & Drop
- [x] X/Y / Scale / Rotation / Opacity / Z-Ebene
- [x] bis zu 24 Widgets pro Scene
- [x] transparente Scene
- [x] Scene Draft / Publish
- [x] stabile Scene Output URL
- [x] Creator Ownership Check
- [x] nur veröffentlichte Widgets in Live-Scenes
- [x] V21: Scene-Datenbank-ID-Typ an bestehende TEXT Creator-/Widget-IDs angepasst
- [x] V21: Scene Widget Query auf TEXT IDs korrigiert

## E. LAUNCHER — FERTIGER TECHNISCHER KERN

- [x] Electron Launcher
- [x] Bridge
- [x] verschlüsselte lokale Secrets
- [x] Event Queue / Spool
- [x] LIVE Provider Grundlage
- [x] Simulator
- [x] TTS / AutoThanks Grundlage
- [x] Tray / Autostart
- [x] Updater Grundlage
- [x] Diagnostics
- [x] Preflight
- [x] Event Monitor
- [x] OBS Doctor
- [x] Support Bundle
- [x] Recovery / Restore Points Grundlage
- [x] Release Center
- [x] Rollout / Blocklist / Maintenance / Rollback Policy
- [x] Creator-Profil im Launcher
- [x] eigene Follower / Profil-Likes im Launcher
- [x] Scene Liste / LIVE OUTPUT
- [x] V21: Beta-Tester-Status im Creator-Profil des Launchers

## F. ROOT / ADMIN / BETA TEST — V21 FERTIG

- [x] Root/Admin Gate
- [x] Admin Zugriff über konfigurierte Creator-ID/E-Mail
- [x] bestehender Legacy-Owner bleibt als Root-Fallback nutzbar
- [x] Creator Control Center
- [x] alle Registrierungen sehen
- [x] Creator Name / E-Mail / Plan / Registrierungszeit
- [x] TikTok verbunden ja/nein
- [x] TikTok Name / Follower / Profil-Likes / letzter Sync
- [x] Sync Health frisch / älter / veraltet
- [x] Launcher online / kürzlich / offline
- [x] Launcher Version / Maschine / letzter Kontakt
- [x] Widget total / live
- [x] Scene total / live
- [x] aktueller LIVE Provider / LIVE Status
- [x] Creator Readiness Score
- [x] Beta Tester aktiv / pausiert / aus
- [x] Beta Notizen
- [x] Admin kann TikTok Profil-Sync eines Testers manuell prüfen
- [x] Beta Feedback Formular für Tester
- [x] Bug-/Feedback Inbox im Admin Center
- [x] Beta Test Sessions mit Versions-/Testprotokoll

## G. LIVE ZUVERLÄSSIGKEIT — V22 FERTIG

- [x] expliziter persistenter LIVE Session Marker im Launcher
- [x] Server Resume Endpoint für bestehende Session
- [x] Recovery vor erstem mutierenden Heartbeat
- [x] Session-ID bei Resume beibehalten
- [x] Metriken bei Resume nicht zurücksetzen
- [x] Safety Policy muss Recovery blockieren können ohne Marker zu löschen
- [x] Action Queue Leasing
- [x] TTS Aktion während Lease nicht doppelt ausliefern
- [x] ACK / NACK sauber trennen
- [x] maximale Retry-Anzahl / Ablauf
- [x] Provider Switching serialisieren
- [x] Logger Tail offiziell implementieren / testen

## H. CREATOR LOGIN / DEVICE LINK IM LAUNCHER — V23 FERTIG

- [x] Launcher nicht mehr primär über manuell kopierten Bridge-Key einrichten
- [x] Creator meldet sich über CFS Account / Device-Link an
- [x] Website bestätigt den Launcher
- [x] Launcher lädt Plan / TikTok / Widgets / Scenes automatisch
- [x] Geräteverwaltung im Account
- [x] Launcher abmelden / Gerät widerrufen
- [x] mehrere PCs pro Creator sauber verwalten

## I. TIKTOK / OBS OUTPUT — REAL-WORLD PHASE

- [ ] echte OBS Browser Source Tests auf Windows
- [ ] 9:16 Scene in realem TikTok Workflow testen
- [ ] endgültigen TikTok LIVE Studio Capture-/Video-Output-Weg festlegen
- [x] V24: lokale Scene Composer Ausgabe im Launcher
- [x] V24: eigenes transparentes Capture-Fenster
- [x] V24: Background-Testmodi Transparent / Schwarz / Chroma
- [x] V24: Display-Auswahl
- [x] V24: Always-on-Top Option
- [x] V24: persistente OBS/TikTok Real-World Testcheckliste
- [x] V24: exportierbarer Output-Testbericht
- [ ] V24 Real-World Gate: echter Windows-PC nötig
- [ ] native/virtuelle Videoquelle nur nach erfolgreichem Windows-Test markieren
- [ ] Transparenz / Alpha / Framerate / Auflösung unter Last testen
- [ ] TikTok + OBS gleichzeitig testen

## J. STREAM DECK / CREATOR TOOLS

- [x] virtuelles CFS Stream Deck
- [x] Widget On/Off Buttons im aktiven lokalen Output
- [x] Scene Wechsel / Nächste Scene / bestimmte Scene
- [x] lokale Follow/Gift/Share Alert Test Buttons ohne LIVE-Metrik-Manipulation
- [x] AutoThanks Toggle
- [x] Games Schnellzugriff
- [x] V28: Game Start/Stop / Score / Reset über echte Creator Runtime
- [x] Cut Studio Schnellzugriff
- [x] 12 frei belegbare Creator Buttons innerhalb sicherer Action-Liste

## K. GAMES / CUT STUDIO / NEXUS

- [x] V28: Games auf Creator Account / Plan / Launcher vereinheitlicht
- [x] V28: Game Runtime als Scene-Studio Layer / stabiler Output
- [x] V29: Game LIVE-Regel-Engine für echte Follow/Like/Gift/Share Events
- [x] V29: Regel-Treffer dedupliziert pro LIVE-Event
- [x] V28: Cut Studio Projekt- und Clip-Queue-Kern
- [x] V29: Cut Export Job Queue + Launcher Bridge Protokoll
- [x] V30: lokale FFmpeg Medienverarbeitung + echter Clip-Export
- [x] V31: Cut Studio Timeline-Reihenfolge / Caption Burn-in / Multi-Clip Reel
- [x] V32: Reel-Übergänge + Audio-Gain/Fades + Loudness-Normalisierung
- [x] V33: erste visuelle Start-/End-Keyframes + lokale Musikspur / 2-Track-Audio-Unterbau
- [x] V34: freie Zoom/Pan-Keyframe-Punkte + Voiceover + SFX + Sidechain-Ducking
- [x] V35: direkt ziehbarer Keyframe-Kurveneditor + Rotation/Opacity + Mixer Mute/Solo/Pan
- [x] V36: mehrere Musik-/Voice-Spuren + Cubic-Bezier Value-Easing + lokale Waveform/Peak-Analyse
- [ ] Cut Studio optionaler Advanced Pass: echte Bezier-Tangenten / Beat-Snap / Wellenform-Mixer-Automation
- [x] V28: Cut Studio Projekte in öffentlichen Creator Launcher integriert
- [ ] NEXUS Produktrolle final definieren

## L. PRO / BILLING / PRODUKT

- [x] finales FREE / CREATOR / PRO Feature-Mapping
- [x] V37: Stripe Hosted Checkout als Subscription Provider angebunden
- [x] V37: signierte Stripe Billing Webhooks + Event-Dedupe / Reihenfolge
- [x] V37: Upgrade / Downgrade über Stripe Customer Portal Integration
- [x] V37: Kündigung zum Periodenende + konfigurierbare Payment-Failure Grace Period
- [x] serverseitige Premium-Enforcement Tests
- [x] Beta-Entitlements getrennt von bezahltem PRO behandeln
- [x] V38: echte Stripe-Testmode-E2E-Sequenz kann automatisch aus verarbeiteten Testmode-Webhooks erkannt werden

## V39 RELEASE OPERATIONS
- [x] V39: strukturierte Windows-/Updater-/Stripe-/OBS-/TikTok-Acceptance
- [x] V39: PASSED Acceptance nur mit vollständig bestandenen Pflichtschritten
- [x] V39: PASSED Acceptance braucht Referenz oder belastbare Notiz
- [x] V39: Pilot Beta Cohort Ziel 5 Creator
- [x] V39: Expanded Beta Cohort Ziel 20 Creator
- [x] V39: Cohort-Erfolg zählt nur echte abgeschlossene Sessions der aktuellen Launcher-Version
- [x] V39: automatisches Production GO/HOLD Assessment
- [x] V39: manuelles GO kann automatische Blocker nicht übergehen
- [x] V39: immutable GO/HOLD/NO-GO Decision Records
- [x] V39: Windows-/Updater-Acceptance-Templates im GitHub Release Workflow
- [ ] echte Pilot-Beta mit 5 Creator durchführen
- [ ] echte Expanded-Beta mit 20 Creator durchführen
- [ ] alle fünf Acceptance-Protokolle real abschließen
- [ ] finales Production GO erst nach 100% Gate

## M. RELEASE / ECHTE TESTS

- [x] V38: Windows-Build-Evidence-Datei mit Setup/Portable/SHA256/Signaturstatus im GitHub Workflow
- [x] V38: Production Evidence pro Release persistent und auditierbar
- [x] V38: Canary-/Rollback-Verifier prüft `/api/health`, DB und erwartete Backend-Version
- [x] V38: Production Deploy Workflow erzeugt Canary-Evidence wenn `CFS_PRODUCTION_URL` gesetzt ist
- [ ] GitHub Windows Build real ausführen
- [ ] echte Setup EXE erzeugen
- [ ] Clean Windows 11 Install
- [ ] Code Signing
- [ ] SmartScreen Verhalten
- [ ] echter Updater E2E
- [ ] Stripe Testmode Checkout / Webhook / Customer Portal E2E mit echten Test-Keys
- [ ] Stripe Live-Mode Freigabe erst nach Testmode-E2E
- [ ] echter TikTok LIVE Provider Test
- [ ] Gift Streak Feldtest
- [ ] Reconnect Feldtest
- [ ] Viewer Snapshot Feldtest
- [ ] 2 Creator parallel testen
- [ ] 5 freiwillige Beta-Tester
- [ ] 20 freiwillige Beta-Tester
- [x] Release-Candidate Readiness Gate auf Basis echter Beta-Sessions/Feedback
- [ ] Produktions-Canary
- [ ] Rollback real testen

## Arbeitsreihenfolge ab jetzt

1. [x] V21 Creator Isolation + Admin/Beta Center
2. [x] V22 LIVE Session Recovery + Action Leasing
3. [x] V23 Launcher Account/Device Login
4. [x] V24 Local Output + Real-World Test Harness (echte Windows-Gates bleiben offen)
5. [x] V25 Stream Deck / Creator Daily UX
6. [x] V26 Plan Policy / PRO Enforcement Foundation
7. [x] V27 Beta Feedback / Release Candidate Foundation
8. [x] V28 Games Runtime + Cut Studio Creator Integration
9. [x] V29 Game LIVE Rules + Cut Export Job Queue
10. [x] V30 Local Cut Media Engine / FFmpeg Export
11. [x] V31 Cut Timeline / Caption Burn-in / Reel Export
12. [x] V32 Transitions / Audio / Windows FFmpeg & GPU Prep
13. [x] V33 Music Track / Visual Keyframes / Two-Track Audio Foundation
14. [x] V34 Free Keyframes / Voiceover / SFX / Ducking
15. [x] V35 Curve Editor / Rotation & Opacity / Mixer Controls
16. [x] V36 Final Creator Editing Pass / Multi Music & Voice / Bezier / Audio Analysis
17. [x] V37 Billing / Subscription / Production Readiness Foundation
18. [x] V38 Windows Release Evidence / Stripe Testmode Evidence / Canary & Rollback Verification
19. [x] V39 Release Acceptance / Beta Cohorts / Production Go-No-Go Control

## V40 GITHUB / DEPLOYMENT OPERATIONS
- [x] Source-Repo / GitHub Release / GitHub Secrets / Render Runtime klar getrennt
- [x] `.gitignore` gegen ZIP/EXE/Secrets/node_modules
- [x] sichere `.env.example`
- [x] GitHub Bug Issue Form
- [x] GitHub Release-Acceptance Issue Form
- [x] Pull Request Template
- [x] Dependabot für Root + Launcher
- [x] neuer dependency-download-freier Quality Gate Workflow für `main` / Pull Requests
- [x] Production Deploy nicht mehr automatisch bei Push auf `main`
- [x] Production Deployment nur noch manuell per `workflow_dispatch`
- [x] GitHub Environment `production`
- [x] GitHub Environment `windows-release`
- [x] Runtime-Secrets bleiben bei Render statt in normalen GitHub Workflows
- [x] Legacy `CFS_*_VERIFIED` Flags standardmäßig deaktiviert
- [x] GitHub/Render Setup Runbooks
- [x] Launcher Release Gate 85/85
- [ ] Root `package-lock.json`
- [ ] Launcher `package-lock.json`
- [ ] Build-Workflows nach echten Lockfiles auf `npm ci` umstellen
- [ ] GitHub `main` Ruleset im echten Repository aktivieren
- [ ] GitHub Environments im echten Repository konfigurieren

20. [x] V40 GitHub Repository / Release / Deployment Operations

## V41 CONFIGURATION DOCTOR / GITHUB BOOTSTRAP
- [x] Render Runtime Config Doctor
- [x] GitHub `production` Config Doctor
- [x] GitHub `windows-release` Config Doctor
- [x] Secret-Werte werden nie im Doctor Report ausgegeben
- [x] Admin Runtime Config Doctor
- [x] GitHub Configuration Doctor Workflow
- [x] Bootstrap Plan Generator
- [x] Bootstrap JSON + Markdown als Quality-Gate Artifact
- [x] manueller GitHub Label Setup Workflow
- [x] CODEOWNERS
- [x] Backend 3.11.0
- [x] Launcher 0.41.0
- [ ] echte GitHub Environments konfigurieren
- [ ] echten GitHub Configuration Doctor ausführen
- [ ] Render Runtime Doctor auf Production ausführen
- [ ] echte Signing Credentials konfigurieren
- [ ] Lockfiles / npm ci

21. [x] V41 Configuration Doctor / GitHub Bootstrap

## V42 FINAL TEST FREEZE
- [x] Feature Freeze vor Real-World-Test
- [x] zentrale Testmatrix mit 13 Bereichen / 109 Checks
- [x] Markdown / CSV / JSON Testpaket
- [x] Final Verification GitHub Workflow
- [x] automatischer Verification Report
- [x] Backend 3.12.0
- [x] Launcher 0.42.0
- [x] Release Gate 93/93
- [ ] 109 manuelle Checks real abarbeiten
- [ ] Fehler aus dem Endtest beheben
- [ ] Pilot 5 / Expanded 20 real abschließen
- [ ] finales Production GO

22. [x] V42 Final Test & Verification Freeze
