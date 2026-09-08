# Launcher Release Safety — Operations Runbook

## Canary
1. Release veröffentlichen.
2. `CFS_LAUNCHER_STABLE_ROLLOUT_PERCENT=5`
3. Realtest / Logs prüfen.
4. 25 → 50 → 100 erhöhen.

## Rollout pausieren
`CFS_LAUNCHER_STABLE_ROLLOUT_PERCENT=0`

## Rollback empfehlen
`CFS_LAUNCHER_PIN_STABLE_VERSION=<vorherige-version>`

## Fehlerhafte Version hart sperren
`CFS_LAUNCHER_BLOCKED_VERSIONS=<fehlerhafte-version>`

## Wartungsmodus
- `CFS_LAUNCHER_MAINTENANCE_MODE=true`
- `CFS_LAUNCHER_MAINTENANCE_MESSAGE=<Text>`

## Grundregel
Eine aktive LIVE-Session wird absichtlich nicht automatisch remote beendet.
Safety greift beim nächsten Start oder Recovery.
