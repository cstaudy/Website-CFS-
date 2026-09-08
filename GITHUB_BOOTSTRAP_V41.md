# CFS Creator Suite V41 — GitHub Bootstrap

## Ziel

V41 macht aus der bisherigen Setup-Dokumentation einen prüfbaren
Bootstrap-Ablauf.

Aktives Repository:

`cstaudy/CFS-TikTok-Backend`

## Reihenfolge

### 1. Source übernehmen

Das komplette V41-Gesamt-ZIP lokal entpacken.

Den **Inhalt** des entpackten Ordners in das Repository übernehmen.

Nicht committen:

- das Milestone ZIP selbst
- EXE / MSI
- `.env`
- Zertifikate
- `node_modules`
- lokale Logs oder Creator-Medien

### 2. Quality Gate

Nach Push auf `main` oder in einem Pull Request:

GitHub → Actions → `Creator Suite Quality Gate`

Erwartet:

- `Repository Quality` PASS
- `Launcher Release Gate` PASS

Der Workflow erzeugt zusätzlich:

- `github-bootstrap-plan.json`
- `github-bootstrap-plan.md`

als GitHub Artifact.

### 3. GitHub Environment `production`

GitHub:

Settings → Environments → New environment → `production`

Dort:

Secret:

`RENDER_DEPLOY_HOOK_URL`

Variable:

`CFS_PRODUCTION_URL`

Danach kann der Workflow:

`Creator Suite Configuration Doctor`

prüfen, ob beide Namen tatsächlich gesetzt wurden.

Die Werte selbst werden nicht ausgegeben.

### 4. GitHub Environment `windows-release`

Settings → Environments → `windows-release`

Secrets:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`

Wenn noch kein Code-Signing-Zertifikat vorhanden ist, bleibt der
Windows-Doctor korrekt BLOCKED.

Das ist kein Softwarefehler.

### 5. GitHub Labels

Actions → `Setup Creator Suite Labels` → Run workflow

Der Workflow legt u. a. an:

- bug
- release-acceptance
- launcher
- backend
- billing
- tiktok-live
- obs
- cut-studio
- games
- release-blocker
- dependencies

Der Workflow läuft nur manuell und verwendet ausschließlich das
Repository-`GITHUB_TOKEN` mit `issues: write`.

### 6. CODEOWNERS

V41 enthält:

`.github/CODEOWNERS`

Aktuell:

`@cstaudy`

Das erzeugt noch keine Pflicht zur Code-Owner-Freigabe.

Erst ein GitHub Ruleset könnte Reviews verpflichtend machen.

### 7. `main` Ruleset

GitHub:

Settings → Rules → Rulesets → New branch ruleset

Target:

`main`

Empfohlen:

- Force Push blockieren
- Branch-Löschung blockieren
- Status Checks verlangen

Checks:

- `Repository Quality`
- `Launcher Release Gate`

Wenn du weiter direkt allein auf `main` arbeitest, musst du
"Pull request required" nicht sofort aktivieren.

### 8. Render Runtime

Render:

Service → Environment

Dort gehören die Backend-Runtime-Werte hin.

Danach im Render Shell:

`node tools/config-doctor-v41.mjs --profile runtime`

Der Doctor zeigt nur:

- Name
- OK
- MISSING
- INVALID
- OPTIONAL_MISSING

Keine Werte.

### 9. Configuration Doctor

GitHub:

Actions → `Creator Suite Configuration Doctor`

Der Workflow prüft getrennt:

- `production`
- `windows-release`

Bei fehlenden Werten schlägt der jeweilige Job absichtlich fehl und das
Artifact zeigt die fehlenden Namen.

### 10. Windows Release

Erst wenn der echte Windows-Build ansteht:

Tag:

`v0.41.0`

Danach `launcher-release.yml`.

Installer/Portable gehören in GitHub Releases, nicht in Source.

### 11. Real-World Acceptance

Admin Center:

Release Operations

Abarbeiten:

- Windows
- Updater
- Stripe Testmode
- OBS
- TikTok LIVE
- Pilot 5
- Expanded 20

### 12. Production

Nur wenn das Go/No-Go Gate READY ist:

GitHub → Actions → Production Deploy

manuell starten.

Production wird nicht automatisch durch einen Push auf `main`
ausgelöst.
