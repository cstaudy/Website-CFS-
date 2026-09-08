# CFS Creator Suite V42 — Final Test & Verification Guide

V42 ist der **Freeze-Stand für den gemeinsamen Endtest**.

- Backend: `3.12.0`
- Launcher: `0.42.0`
- Automatisches Launcher Release Gate: `PASS 93/93`
- Manuelle Testmatrix: `13 Bereiche / 109 Prüfungen`

## Wichtig

Ab V42 werden zunächst keine neuen Features ergänzt. Erst die reale Testmatrix abarbeiten, Fehler beheben und danach neu entscheiden.

## Reihenfolge

1. **GitHub Source**
   - kompletten V42-Gesamtstand entpacken und in `cstaudy/CFS-TikTok-Backend` übernehmen
   - `Creator Suite Quality Gate` abwarten
   - `Creator Suite Configuration Doctor` ausführen

2. **Render Runtime**
   - Environment prüfen
   - `node tools/config-doctor-v41.mjs --profile runtime`
   - Production `/api/health` prüfen

3. **Windows Build**
   - Tag `v0.42.0`
   - GitHub Windows Release Workflow
   - Setup/Portable/SHA256/Build Evidence prüfen

4. **Clean Windows 11**
   - Setup installieren
   - Device-Link
   - Neustart
   - SafeStorage
   - Launcher/Tray/Autostart/Diagnostics
   - Updater E2E

5. **Creator Features**
   - Website / Account
   - Widget Studio
   - Scene Studio
   - Stream Deck
   - Games
   - Cut Studio

6. **OBS**
   - Widget Browser Source
   - Scene Browser Source
   - Alpha
   - Vertical/Landscape
   - mehrere Quellen gleichzeitig

7. **TikTok LIVE**
   - zwei echte Creator verbinden
   - LIVE Connect
   - Follow / Like / Gift / Share
   - Viewer / Gift Streak
   - Reconnect / Recovery
   - keine Duplikate

8. **TikTok Output**
   - 9:16 Workflow
   - finaler Capture-/Output-Pfad
   - OBS + TikTok gleichzeitig
   - 30-Minuten-Stabilität

9. **Stripe Testmode**
   - CREATOR / PRO Checkout
   - Webhooks
   - Customer Portal
   - Upgrade / Downgrade
   - Kündigung
   - Failure / Grace / Recovery

10. **Beta**
    - Pilot 5 Creator
    - Expanded 20 Creator

11. **Production**
    - Go/No-Go
    - manueller Deploy
    - Canary
    - Rollback-Test

## Testdateien

Im Ordner `reports/` liegen:

- `final-test-matrix.md` — lesbare Checkliste
- `final-test-matrix.csv` — gut für Excel/Sheets
- `final-test-matrix.json` — maschinenlesbar
- `final-test-summary.json`
- `final-verification-v42.json`

## Regel für Fehler

Bei einem Fehler:

1. Check auf FAIL setzen.
2. genaue Repro-Schritte notieren.
3. Screenshot/Run/Issue als Referenz hinterlegen.
4. nicht einfach den Check überspringen.
5. Fehler beheben.
6. denselben Check erneut testen.

## Release-Kriterium

Ein Production GO ist erst sinnvoll, wenn:

- alle 109 manuellen Checks bewertet sind,
- keine Pflichtprüfung FAIL/PENDING ist,
- V39 Go/No-Go READY ist,
- 0 Critical / 0 High Blocker offen sind.
