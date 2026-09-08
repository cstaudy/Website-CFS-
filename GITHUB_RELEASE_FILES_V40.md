# V40 — Welche Datei gehört wohin?

| Datei / Datenart | Git Repo | GitHub Release | GitHub Secret/Variable | Render |
|---|---:|---:|---:|---:|
| `server.js`, `lib/`, `public/` | JA | nein | nein | via Deploy |
| `launcher/` Source | JA | nein | nein | nein |
| `.github/workflows/` | JA | nein | nein | nein |
| `CFS-...Milestone-V40.zip` | NEIN | optional Backup | nein | nein |
| Setup `.exe` | NEIN | JA | nein | nein |
| Portable `.exe` | NEIN | JA | nein | nein |
| `SHA256SUMS.txt` | nein | JA | nein | nein |
| `release-manifest.json` | nein | JA | nein | nein |
| Build Evidence | nein | JA | nein | Admin Evidence |
| `.env` | NEIN | NEIN | nein | Werte einzeln |
| `CSC_LINK` | nein | nein | `windows-release` Secret | nein |
| `CSC_KEY_PASSWORD` | nein | nein | `windows-release` Secret | nein |
| `RENDER_DEPLOY_HOOK_URL` | nein | nein | `production` Secret | nein |
| `CFS_PRODUCTION_URL` | nein | nein | `production` Variable | nein |
| `DATABASE_URL` | nein | nein | normalerweise nein | JA |
| TikTok Secret | nein | nein | normalerweise nein | JA |
| Stripe Secret | nein | nein | normalerweise nein | JA |
| Stripe Webhook Secret | nein | nein | normalerweise nein | JA |
| Token Encryption Key | nein | nein | normalerweise nein | JA |
| Creator Video/Audio | NEIN | NEIN | NEIN | NEIN |

Die drei von ChatGPT erzeugten Milestone-ZIPs sind primär
Transport-/Backup-Dateien. Für den normalen GitHub Source-Stand wird der
komplette ZIP-Inhalt entpackt und committed.
