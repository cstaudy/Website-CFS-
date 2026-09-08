# Optionaler LIVE Provider: TikTool

Milestone V10 integriert optional `tiktok-live-api` (TikTool).

## Warum optional?

TikTok stellt für diese Creator-Suite derzeit keine öffentliche offizielle LIVE-Event-API bereit, über die der Launcher einfach Gifts, Likes, Shares und Viewer beziehen könnte. Der Provider ist deshalb eine austauschbare Drittanbieter-Schicht.

## Datenfluss

TikTool LIVE Service
→ Desktop Launcher
→ Normalisierung auf Creator Suite Events
→ eigene Creator Cloud Bridge
→ Widgets / Alerts / Goals / AutoThanks / OBS

## Lokale Secrets

Der Launcher speichert zwei getrennte Secrets:
- Creator Suite Bridge-Key
- TikTool API-Key

Beide werden über Electron `safeStorage` verschlüsselt. Sie werden nicht in Launcher-Logs geschrieben.

## Normalisierte Events

- `follow`
- `like`
- `gift`
- `share`
- `viewer_update`

Gift `value` wird nur provider-neutral gespeichert. Es wird nicht als Euro-/Geldbetrag bezeichnet.

## Abhängigkeit

`tiktok-live-api` Version `^1.4.9`, MIT-Lizenz.

Dieser Provider ist nicht offiziell von TikTok und nicht Teil der TikTok Developer API.
