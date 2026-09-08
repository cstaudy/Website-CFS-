# CFS-TikTok-Backend
Backend service for CFS Live Studio TikTok integration


## Milestone V9

Der kumulative Stand enthält jetzt zusätzlich `launcher/` — den ersten echten Desktop Launcher Alpha.
Details: `WIDGET_STUDIO_MILESTONE_V9.md` und `launcher/README.md`.


## Aktueller Creator-Suite-Stand

Milestone V12 / Launcher 0.12.0 ist der aktuelle kumulative Production-Hardening-Stand.

Milestone V13 / Launcher 0.13.0 ergänzt das automatisierte Release Gate und End-to-End-Testharness.

Milestone V15 / Launcher 0.15.0 ergänzt Creator-Onboarding, OBS Doctor, Support-Bundle und sicheren Queue-Drain.

Milestone V16 / Launcher 0.16.0 ergänzt Creator Ready, Cloud Health, portable Backups, lokale Restore Points und Release-Manifeste.

Milestone V17 / Launcher 0.17.0 ergänzt Release Center, Stable/Beta-Versionierung, Cloud-Mindestversion und Production Deployment Gate.

Milestone V18 / Launcher 0.18.0 ergänzt Production Safety, gestaffelte Rollouts, Blocklist, Wartungsmodus und Rollback-Pinning.

Milestone V19 / Launcher 0.19.0 führt den universellen Widget Renderer, OBS/TikTok/16:9 Output-Profile und creator-spezifische Launcher-Personalisierung ein.

Milestone V20 / Launcher 0.20.0 ergänzt Scene Studio, Overlay-Packs und LIVE OUTPUT.

Milestone V21 / Launcher 0.21.0 ergänzt creator-spezifischen TikTok OAuth, Creator Admin/Beta Center und korrigiert die Scene-ID-Schema-Konsistenz.

Milestone V22 / Launcher 0.22.0 ergänzt persistente LIVE-Session-Recovery, Action Queue Leasing, ACK/NACK, serialisiertes Provider Switching und getestetes Logger Tail.

Milestone V23 / Launcher 0.23.0 ersetzt die manuelle Bridge-Key-Einrichtung im Standardfluss durch einen sicheren Creator Account Device-Link.

Milestone V24 / Launcher 0.24.0 ergänzt lokalen Scene Capture Output und einen persistenten OBS/TikTok Real-World Test Gate.

Milestone V25 / Launcher 0.25.0 ergänzt das virtuelle CFS Stream Deck mit 12 frei belegbaren Creator-Aktionen und lokalen Scene-/Alert-Kontrollen.

Milestone V26 / Launcher 0.26.0 ergänzt zentrale Plan-Policy, Beta-separate Entitlements und server-/launcher-seitige Premium-Enforcement-Grundlagen.

Milestone V27 / Launcher 0.27.0 ergänzt Beta-Test-Sessions, Feedback Inbox und Release-Candidate Readiness.

Milestone V28 / Launcher 0.28.0 ergänzt eine echte Creator Game Runtime, Game-Scene-Layer sowie persistente Cut-Studio Projekte und Clip Queues.

Milestone V29 / Launcher 0.29.0 ergänzt Game-Regeln auf echte LIVE-Events sowie eine Cut-Export-Job-Queue ohne Cloud-Video-Uploads.

Milestone V30 / Launcher 0.30.0 ergänzt lokale Video-Quellen, echte FFmpeg Clip-Exporte und Retry-fähige Cut-Export-Jobs, ohne Videodateien in die Cloud zu laden.

Milestone V31 / Launcher 0.31.0 ergänzt persistente Cut-Timeline, Caption Burn-in und lokalen Reel-Export per FFmpeg concat.

Milestone V32 / Launcher 0.32.0 ergänzt Reel-Übergänge, Audio-Gain/Fades/Loudness, GPU-Encoder-Erkennung und eine optionale Windows-FFmpeg-Bundle-Struktur.

Milestone V33 / Launcher 0.33.0 ergänzt eine lokale Reel-Musikspur, einen echten Zwei-Track-Audio-Mix sowie erste Zoom/Pan Start-/End-Keyframes per FFmpeg zoompan.

Milestone V34 / Launcher 0.34.0 ergänzt freie Zoom/Pan-Keyframe-Punkte, lokale Voiceover- und SFX-Spuren sowie Sidechain-Ducking im lokalen FFmpeg-Mehrspur-Mix.

Milestone V35 / Launcher 0.35.0 ergänzt einen direkt ziehbaren Keyframe-Kurveneditor, Rotation/Opacity-Keyframes sowie Mute/Solo/Pan-Mixersteuerung für Originalton, Musik, Voice und SFX.

Milestone V36 / Launcher 0.36.0 schließt den großen Cut-Studio Creator-Editing-Pass mit mehreren Music-/Voice-Spuren, Cubic-Bezier Value-Easing und lokaler FFmpeg Waveform-/Peak-Analyse ab.

Milestone V37 / Launcher 0.37.0 ergänzt Stripe Hosted Checkout, signierte Subscription-Webhooks, Customer Portal, Payment-Failure Grace und ein Production-Readiness Gate. Echte Stripe-/Windows-/OBS-/TikTok-Feldtests bleiben explizit offen.

Milestone V38 / Launcher 0.38.0 ergänzt auditierbare Production Evidence, automatische Stripe-Testmode-E2E-Erkennung aus echten Webhooks, Windows Build Evidence mit SHA256/Authenticode und Canary-/Rollback-Verifikation. Externe Realtests bleiben bis zur tatsächlichen Ausführung offen.

Milestone V39 / Launcher 0.39.0 ergänzt strukturierte Release-Acceptance, reale 5/20-Beta-Cohorts und ein serverseitig nicht übersteuerbares Production-Go/No-Go-Gate. Neue Creator-Features stehen bewusst nicht im Fokus.

Milestone V40 / Launcher 0.40.0 trennt GitHub Source, GitHub Releases, Actions Secrets/Variables und Render Runtime sauber. Production deployt nicht mehr automatisch bei einem Push auf `main`; V40 ergänzt Quality Gate, Repository Hygiene, Issue-/PR-Templates und klare GitHub/Render-Runbooks.

Milestone V41 / Launcher 0.41.0 ergänzt einen redaktierten GitHub-/Render-Configuration-Doctor, Admin Runtime Config Status, einen GitHub Bootstrap Plan als Quality-Gate-Artifact sowie einen manuellen Label-Setup-Workflow und CODEOWNERS.

Milestone V42 / Launcher 0.42.0 ist der Feature-Freeze für den Endtest. Eine zentrale Matrix bündelt 13 Bereiche mit 109 manuellen Real-World-Prüfungen; automatisierte QA und Launcher Release Gate stehen auf PASS 93/93.
