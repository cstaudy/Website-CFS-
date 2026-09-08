# V38 Production Evidence Runbook

## 1. Windows Build

Git Tag passend zur Launcher-Version erzeugen:

`v0.38.0`

Der GitHub Workflow `Build Creator Suite Launcher` erzeugt:

- Setup EXE
- Portable EXE
- SHA256SUMS.txt
- release-manifest.json
- windows-build-evidence.json
- release-gate.json / .md

Erst nach einem echten erfolgreichen Run darf `windows_build` als
VERIFIED gespeichert werden.

Für `code_signing` muss der Authenticode-Status der Evidence `valid` sein.

## 2. Clean Windows

Auf einem frischen Windows-11-System:

- Setup installieren
- Launcher starten
- Device-Link
- Update Check
- lokaler Output
- mindestens ein Cut-Studio Export
- Deinstallation / Neustart prüfen

Danach Evidence `clean_install` mit Testgerät/Windows-Build und Referenz
hinterlegen.

## 3. Stripe Testmode

Auf der echten Zielumgebung Stripe-Testmode konfigurieren.

Durchführen:

1. CREATOR oder PRO Checkout
2. erfolgreicher Test-Payment-Abschluss
3. Subscription Update über Customer Portal
4. Billing Status im Creator Account kontrollieren
5. optional Payment-Failure/Recovery separat testen

Der Admin Production Center erkennt aus echten Webhooks automatisch die
Basis-Sequenz.

Keine Testmode-Webhooks manuell faken, nur um das Gate grün zu machen.

## 4. Production Canary

Repository Variable:

`CFS_PRODUCTION_URL`

Nach Deploy führt `production-deploy.yml` den Canary Checker aus.

Manuell:

`node tools/production-canary-check.mjs --url https://... --expected-version 3.8.0 --mode canary --require-billing`

Ergebnis:

`reports/production-canary-evidence.json`

## 5. Rollback

Zuerst wirklich auf die gewünschte vorherige Production-Version
zurückrollen.

Danach das Workflow `Production Canary / Rollback Verification` mit:

- mode = rollback
- expected_backend_version = tatsächlich ausgerollte alte Version

ausführen.

Erst nach erfolgreichem Versionscheck Evidence `rollback` hinterlegen.

## 6. Evidence im Admin Center

Für VERIFIED mindestens eines angeben:

- Run-/Ticket-/Artifact-Referenz
- SHA256
- ausführliche Testnotiz

Evidence immer für die aktuelle Release-Version erfassen.

## 7. Noch offener Dependency-Lock

In dieser Buildumgebung konnte `npm install --package-lock-only` nicht
innerhalb des verfügbaren Registry-Zeitfensters abgeschlossen werden.

Darum weiterhin offen:

- Root package-lock
- Launcher package-lock
- Wechsel der Release-Workflows auf `npm ci`

Keine Lockfiles von Hand erfinden.
