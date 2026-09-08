# CFS Creator Suite V40 — Render Runtime Setup

## Prinzip

GitHub speichert Source, Workflows und Release-Artefakte.

Render betreibt das laufende Backend.

Darum gehören Backend-Runtime-Credentials nach Render.

## Render Environment — vertraulich

Diese Werte nicht committen:

- `DATABASE_URL`
- `TIKTOK_CLIENT_SECRET`
- `CFS_TOKEN_ENCRYPTION_KEY`
- `CFS_STRIPE_SECRET_KEY`
- `CFS_STRIPE_WEBHOOK_SECRET`
- optional `CFS_GITHUB_RELEASE_TOKEN`
- optional `CFS_TIKTOK_CONNECT_CODE`

Je nach TikTok-Konfiguration kann auch `TIKTOK_CLIENT_KEY` dort
gespeichert werden, obwohl es nicht dieselbe Geheimhaltungsstufe wie ein
Client Secret hat.

## Render Environment — Konfiguration

Empfohlen:

- `NODE_ENV=production`
- `APP_BASE_URL=https://...`
- `TIKTOK_REDIRECT_URI=https://.../auth/tiktok/callback`
- `CFS_STRIPE_PRICE_CREATOR_MONTHLY=price_...`
- `CFS_STRIPE_PRICE_PRO_MONTHLY=price_...`
- `CFS_BILLING_GRACE_DAYS=3`
- `CFS_ADMIN_CREATOR_IDS=...`
- `CFS_ADMIN_EMAILS=...`
- `CFS_LAUNCHER_BUILD_TARGET_VERSION=0.40.0`
- `CFS_RELEASE_EVIDENCE_VERSION=0.40.0`
- `CFS_LAUNCHER_RELEASE_REPO=cstaudy/CFS-TikTok-Backend`

## Legacy Verification Flags

V40 deaktiviert die alten `CFS_*_VERIFIED` Environment-Overrides
standardmäßig.

Nicht mehr als normalen Release-Prozess verwenden:

- `CFS_WINDOWS_BUILD_VERIFIED`
- `CFS_CODE_SIGNING_VERIFIED`
- `CFS_WINDOWS_CLEAN_INSTALL_VERIFIED`
- `CFS_UPDATER_E2E_VERIFIED`
- `CFS_OBS_FIELD_VERIFIED`
- `CFS_TIKTOK_LIVE_FIELD_VERIFIED`
- `CFS_BILLING_LIVE_VERIFIED`
- `CFS_TWO_CREATORS_VERIFIED`
- `CFS_CANARY_VERIFIED`
- `CFS_ROLLBACK_VERIFIED`

V38/V39 hat dafür persistente Evidence und Acceptance.

Nur ein bewusster Migrations-/Notfallpfad kann die Legacy Flags wieder
aktivieren:

`CFS_ALLOW_LEGACY_VERIFICATION_FLAGS=true`

Für normalen Production-Betrieb:

`CFS_ALLOW_LEGACY_VERIFICATION_FLAGS=false`

## GitHub ↔ Render Verbindung

GitHub Environment `production`:

Secret:
- `RENDER_DEPLOY_HOOK_URL`

Variable:
- `CFS_PRODUCTION_URL`

Der Deploy Hook startet den Render Deploy.

Die Website-Secrets selbst bleiben dabei auf Render.

## Production Ablauf V40

1. Source nach GitHub.
2. Quality Gate PASS.
3. V39 Go/No-Go / Real-World-Abnahmen prüfen.
4. Production Deployment Workflow manuell starten.
5. Render Deploy Hook wird ausgelöst.
6. Canary prüft `/api/health`.
7. Evidence im Admin Center hinterlegen.
