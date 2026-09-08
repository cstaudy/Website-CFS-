# V41 Configuration Doctor

## Warum?

Ein häufiger Release-Fehler ist nicht der Code, sondern eine fehlende oder
falsch benannte Environment Variable.

V41 prüft deshalb die Konfiguration, ohne Secret-Werte anzuzeigen.

## Render Runtime Doctor

Im laufenden Render-Service oder in einer vergleichbaren Shell:

`node tools/config-doctor-v41.mjs --profile runtime`

Geprüft werden unter anderem:

- `NODE_ENV`
- `APP_BASE_URL`
- `DATABASE_URL`
- TikTok Client Key / Secret / Redirect
- Token Encryption Key
- Admin-Zugriff
- Launcher Target Version
- Release Evidence Version
- Release Repository
- Stripe Secret / Webhook / Price IDs
- Legacy Verification Opt-in muss `false` sein

## GitHub Production Doctor

Automatisch über den manuellen GitHub Workflow.

Technisch:

`node tools/config-doctor-v41.mjs --profile github-production`

Geprüft:

- `RENDER_DEPLOY_HOOK_URL`
- `CFS_PRODUCTION_URL`

## GitHub Windows Doctor

Technisch:

`node tools/config-doctor-v41.mjs --profile github-windows`

Geprüft:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`

## Secret Redaction

Der Doctor gibt niemals den tatsächlichen Wert zurück.

Beispiel:

```json
{
  "name": "CFS_STRIPE_WEBHOOK_SECRET",
  "secret": true,
  "required": true,
  "status": "missing"
}
```

Nicht enthalten:

- Stripe-Key
- DB URL
- TikTok Secret
- Signing-Passwort
- Render Deploy Hook

## Admin Center

Admin → Production Evidence & Config

zeigt:

- READY / BLOCKED
- Anzahl bestandener Checks
- einzelne Namen + Status

Auch dort werden keine Secret-Werte übertragen.
