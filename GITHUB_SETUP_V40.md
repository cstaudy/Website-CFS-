# CFS Creator Suite V40 — GitHub Setup

## Kurzfassung

Das aktive Repository ist:

`cstaudy/CFS-TikTok-Backend`

Die Creator Suite, Website und der Launcher bleiben **in diesem einen Repository**.

Das alte separate Widget-Studio-Testrepository gehört nicht in den
Production-Deploy-Pfad.

## Was kommt in das GitHub Repository?

In den Repository-Root gehören die **entpackten Inhalte** des jeweils
aktuellen kumulativen Gesamtstands.

Für V40 bedeutet das beispielsweise:

- `server.js`
- `package.json`
- `lib/`
- `public/`
- `launcher/`
- `tools/`
- `.github/`
- `.gitignore`
- `.env.example`
- die aktuellen Runbooks und Roadmap-Dateien

### Nicht das ZIP selbst hochladen

`CFS-TikTok-Backend-Creator-Suite-Milestone-V40.zip`

ist ein Transport-/Backup-Artefakt.

Das ZIP lokal entpacken und **seinen Inhalt** in das Repository übernehmen.
Die ZIP-Datei selbst gehört nicht in Git.

Auch folgende Dateien gehören nicht als Source in das Repository:

- Setup EXE
- Portable EXE
- lokale `.env`
- Zertifikate / PFX / PEM / Keys
- `node_modules`
- lokale Logs
- Creator-Mediendateien
- FFmpeg-Binaries, solange sie nicht bewusst als lizenzierter Build-Input
  in einem eigenen Release-Prozess verwaltet werden

`.gitignore` schützt diese Kategorien zusätzlich.

## GitHub Actions

V40 trennt die Workflows klar.

### `quality-gate.yml`

Läuft bei:

- Pull Request gegen `main`
- Push auf `main`
- manuell

Er deployt **nichts**.

Er prüft:

- Repository Hygiene
- GitHub-Konfiguration
- Backend V40 QA
- komplettes Launcher Release Gate

Dieser Workflow benötigt bewusst keine API-Keys und keine Production
Secrets.

### `launcher-release.yml`

Zweck:

- Windows Launcher bauen
- Setup + Portable erzeugen
- SHA256
- Release Manifest
- Windows Build Evidence
- Acceptance Templates
- GitHub Release veröffentlichen

GitHub Environment:

`windows-release`

Empfohlene Secrets dort:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`

Wenn noch kein Code-Signing-Zertifikat vorhanden ist, können diese
Secrets fehlen. Der Build kann dadurch je nach electron-builder-Kontext
unsigniert bleiben; das Production Code-Signing-Gate bleibt dann korrekt
offen.

### `production-deploy.yml`

V40 deployt Production **nicht mehr automatisch bei jedem Push auf
`main`**.

Der Workflow wird nur manuell über `workflow_dispatch` gestartet.

GitHub Environment:

`production`

Empfohlene GitHub Environment Secret:

- `RENDER_DEPLOY_HOOK_URL`

Empfohlene GitHub Environment Variable:

- `CFS_PRODUCTION_URL`

Beispiel:

`https://deine-cfs-domain.example`

Diese Variable ist nicht geheim und wird für Canary-/Rollback-Checks
verwendet.

### `production-verification.yml`

Manueller Canary-/Rollback-Check gegen die Production-URL.

Verwendet ebenfalls:

- Environment `production`
- Variable `CFS_PRODUCTION_URL`

## Was gehört NICHT als GitHub Action Secret hinein?

Die Runtime-Secrets der Website gehören primär zum **Runtime-Host**,
aktuell Render, nicht in einen normalen GitHub Workflow.

Insbesondere:

- `DATABASE_URL`
- `TIKTOK_CLIENT_SECRET`
- `CFS_TOKEN_ENCRYPTION_KEY`
- `CFS_STRIPE_SECRET_KEY`
- `CFS_STRIPE_WEBHOOK_SECRET`

Diese Werte werden von `server.js` zur Laufzeit benötigt. Wenn Render den
Server startet, gehören sie in Render Environment Variables / Secrets.

Nur wenn später ein anderer Deployment-Mechanismus den Server direkt aus
GitHub Actions startet, müsste diese Aufteilung neu bewertet werden.

## GitHub Repository Variables vs Secrets

Faustregel:

### Secret

Vertraulich, darf nicht im Log auftauchen.

Beispiele:

- Signing-Zertifikat
- Signing-Passwort
- Render Deploy Hook

### Variable

Nicht vertrauliche Konfiguration.

Beispiel:

- Production URL

GitHub weist darauf hin, dass normale Actions-Variablen in Build-Ausgaben
unmaskiert erscheinen können. Vertrauliche Werte deshalb als Secrets
speichern.

## GitHub Environments

Empfohlen:

### `production`

Verwendet von:

- Production Deploy
- Canary / Rollback Verification

Dort speichern:

Secret:
- `RENDER_DEPLOY_HOOK_URL`

Variable:
- `CFS_PRODUCTION_URL`

Wenn dein GitHub-Plan/Repository die gewünschten Environment-
Protection-Regeln unterstützt, zusätzlich:

- nur `main` oder bewusst freigegebene Tags deployen lassen
- Deployment Approval aktivieren
- kein automatisches Production-Deployment bei Source-Push

### `windows-release`

Verwendet vom Windows Launcher Build.

Dort speichern:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`

## GitHub Ruleset für `main`

Empfohlener Ruleset:

Target:

`main`

Aktivieren:

- Force Push blockieren
- Branch-Löschung blockieren
- Pull Request vor Merge verlangen, wenn du mit Branches arbeitest
- Status Checks verlangen

Empfohlene Status Checks aus V40:

- `Repository Quality`
- `Launcher Release Gate`

Wenn du aktuell allein arbeitest und direkt auf `main` hochlädst, kann
"Pull Request required" zunächst stören. Die beiden QA-Checks und das
Blockieren von Force Pushes sind trotzdem sinnvoll.

## GitHub Releases

Binary-Dateien gehören **hierhin**, nicht ins normale Repository.

Beim Tag:

`v0.40.0`

baut `launcher-release.yml` unter anderem:

- Setup EXE
- Portable EXE
- Update-Metadaten / Blockmaps
- `SHA256SUMS.txt`
- `release-manifest.json`
- `windows-build-evidence.json`
- Windows Installer Acceptance Template
- Updater Acceptance Template
- Release Gate JSON/Markdown

GitHub Releases sind der richtige Ort für herunterladbare Installer und
andere Binärdateien.

## Dependabot

V40 enthält `.github/dependabot.yml`.

Es überwacht separat:

- Root npm Backend
- `/launcher` npm Launcher

Dependency-Updates sollten als PR geprüft und **nicht blind gemerged**
werden, insbesondere bei:

- Electron
- electron-builder
- electron-updater
- TikTok LIVE Provider
- Stripe

## Issue Forms

V40 ergänzt:

- Bug Report
- Release Acceptance / Field Test

Damit kann ein Windows-/TikTok-/OBS-/Stripe-Feldtest auch auf GitHub
nachvollziehbar dokumentiert werden.

Keine Secrets in Issues einfügen.

## Pull Request Template

Das PR Template erinnert automatisch an:

- keine Secrets
- V40 QA
- Launcher Gate
- keine ZIP/EXE im Git
- Real-World-Gates nur markieren, wenn tatsächlich getestet

## Lockfiles / `npm ci`

Noch offen:

- Root `package-lock.json`
- Launcher `package-lock.json`

In der aktuellen Buildumgebung konnte `npm install --package-lock-only`
erneut nicht rechtzeitig auf die npm Registry zugreifen.

Deshalb:

- keine Lockfiles von Hand erzeugen
- Build-Workflows vorerst weiter mit `npm install`
- Quality Gate arbeitet ohne Dependency-Download
- nach erfolgreicher Lockfile-Erzeugung beide Build-Workflows auf
  `npm ci` umstellen

## Empfohlener Upload-Ablauf für dich

1. V40 Gesamt-ZIP lokal entpacken.
2. Repository `cstaudy/CFS-TikTok-Backend` öffnen.
3. **Inhalt** des V40-Ordners übernehmen, nicht das ZIP selbst.
4. Alte Dateien mit gleichen Pfaden überschreiben.
5. Neue `.github`-, `.gitignore`- und `.env.example`-Dateien mitnehmen.
6. Commit auf einen V40-Branch oder direkt `main`, falls du weiterhin
   allein direkt arbeitest.
7. `Creator Suite Quality Gate` in Actions abwarten.
8. Erst danach Production Deploy manuell starten.
9. Launcher Release erst mit Tag `v0.40.0` auslösen, wenn der echte
   Windows-Test ansteht.
