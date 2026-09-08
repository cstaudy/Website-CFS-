# V39 Release Operations Runbook

## 1. Release vorbereiten

Zielversion:

- Backend 3.9.0
- Launcher 0.39.0

Im Admin Center `RELEASE OPERATIONS` öffnen.

Die automatische Empfehlung wird voraussichtlich zunächst `HOLD` zeigen.
Das ist korrekt, solange Real-World-Gates fehlen.

## 2. Windows Build

GitHub Windows Workflow für `v0.39.0` ausführen.

Danach prüfen:

- Setup EXE
- Portable EXE
- SHA256SUMS
- release-manifest
- windows-build-evidence
- Windows Install Acceptance Template
- Updater Acceptance Template

Production Evidence für Windows Build erst nach realem Run speichern.

## 3. Clean Windows Acceptance

Auf einem frischen Windows-11-System das Windows-Install-Protokoll
vollständig durcharbeiten.

Alle Pflichtschritte einzeln bewerten.

Bei einem Fehler:

- Schritt auf FAIL
- Acceptance speichern
- Bug/Feedback erfassen
- Release bleibt HOLD

Erst nach erneutem vollständigem PASS einen neuen Acceptance Snapshot
speichern.

## 4. Updater E2E

Aus einer tatsächlich installierten älteren Launcher-Version starten.

Nicht Portable verwenden.

Update auf 0.39.0 prüfen, installieren und nach Neustart kontrollieren.

Creator-Link und lokale Einstellungen müssen erhalten bleiben.

## 5. Stripe Testmode

Echte Stripe-Testmode-Umgebung verwenden.

Zusätzlich zur automatischen Webhook-Evidence das vollständige
`stripe_testmode` Acceptance-Protokoll abarbeiten.

Insbesondere Customer Portal, Planänderung, Kündigung, Failure/Grace und
Recovery real prüfen.

## 6. OBS / TikTok

Beide Acceptance-Protokolle auf realen Creator-Systemen abarbeiten.

TikTok benötigt zwei reale Creator-Verbindungen.

Keine simulierten Events als Feldtestnachweis verwenden.

## 7. Pilot Beta

Pilot Cohort erstellen:

- Stage `pilot`
- Target 5

Fünf reale Creator zuweisen.

Jeder Creator muss mindestens eine abgeschlossene Beta-Session mit
Launcher-Version `0.39.0` besitzen.

## 8. Expanded Beta

Nach stabilem Pilot:

- Stage `expanded`
- Target 20

Zwanzig Creator real testen lassen.

Das Gate zählt nur abgeschlossene Sessions von 0.39.0.

## 9. Go / No-Go

Vor GO:

- Production Score vollständig
- alle Acceptance-Protokolle PASSED
- Pilot READY
- Expanded READY
- 0 Critical
- 0 High

Wenn das automatische Gate HOLD zeigt, kann der Admin kein GO speichern.

HOLD oder NO-GO können jederzeit mit Begründung dokumentiert werden.

## 10. Canary / Rollback

Nach einem späteren echten GO:

- Production Canary ausführen
- Canary Evidence speichern
- Rollback-Verfahren real testen
- Rollback Evidence speichern

Erst danach ist der gesamte Production-Release-Prozess praktisch
abgenommen.
