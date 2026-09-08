# CFS Creator Suite V37 — Stripe Billing Runbook

## Ziel

V37 verwendet Stripe Hosted Checkout für neue CREATOR/PRO Subscriptions und das Stripe Customer Portal für Billing-Verwaltung. Der Creator Suite Server speichert nur Provider-IDs, Subscription-Status und Zugriffsmetadaten. Zahlungsdaten werden nicht in CFS gespeichert.

## Benötigte Server-Umgebungsvariablen

- `CFS_STRIPE_SECRET_KEY`
- `CFS_STRIPE_WEBHOOK_SECRET`
- `CFS_STRIPE_PRICE_CREATOR_MONTHLY`
- `CFS_STRIPE_PRICE_PRO_MONTHLY`
- optional `CFS_BILLING_GRACE_DAYS` — Standard 3
- `APP_BASE_URL` muss in Produktion HTTPS verwenden

Keine Werte dieser Variablen gehören in Browser-JavaScript oder in Git.

## Checkout

Creator starten Checkout über `POST /api/creator/billing/checkout`.

Der Server erzeugt eine Stripe Hosted Checkout Session im Subscription-Modus. Creator-ID und CFS-Plan werden als Metadaten an Checkout und Subscription gebunden.

Checkout wird serverseitig deaktiviert, solange Signatur-Webhooks nicht vollständig konfiguriert sind. Dadurch kann kein bezahlter Checkout gestartet werden, dessen Subscription-Zustand CFS anschließend nicht sicher empfangen könnte.

## Customer Portal

`POST /api/creator/billing/portal` erzeugt eine temporäre Stripe Customer Portal Session.

Das Portal ist für folgende Creator-Aktionen vorgesehen:

- Zahlungsmethode verwalten
- Rechnungen ansehen
- Plan aktualisieren
- Subscription kündigen

Welche Planwechsel im Portal angeboten werden, muss im Stripe Dashboard passend zu CREATOR/PRO konfiguriert und im Testmode geprüft werden.

## Webhook

Endpoint:

`POST /api/billing/stripe/webhook`

Die Route verwendet einen Raw Body und prüft `stripe-signature` mit `CFS_STRIPE_WEBHOOK_SECRET`.

Verarbeitete Subscription-Ereignisse:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `invoice.paid`

Webhook Event-IDs werden in `creator_billing_events` persistiert. Bereits erfolgreich verarbeitete Events werden dedupliziert. Zusätzlich schützt `last_event_created` vor älteren Subscription-Events, die nach einem neueren Event eintreffen.

## Access State

Zugriff durch Billing:

- `active` → Subscription-Plan aktiv
- `trialing` → Subscription-Plan aktiv
- `past_due` → nur innerhalb der CFS Grace Period aktiv
- `canceled`, `unpaid`, `paused`, `incomplete_expired` → kein bezahlter Zugriff

Ein bereits manuell höher gesetzter Account-Basisplan wird durch Billing nicht herabgestuft. Beta-Entitlements bleiben separat.

## Kündigung

Wenn Stripe `cancel_at_period_end=true` meldet und die Subscription weiterhin aktiv ist, bleibt der CFS Zugriff bis zum Periodenende aktiv. Nach dem tatsächlichen Subscription-Ende fällt der Creator auf den Basisplan zurück.

## Payment Failure Grace

Bei `invoice.payment_failed` wird standardmäßig eine 3-Tage-Grace gesetzt. Währenddessen bleibt der bezahlte Plan aktiv. `invoice.paid` entfernt die Grace wieder.

## Vor Live-Freigabe zwingend real testen

1. Stripe Testmode Checkout CREATOR
2. Stripe Testmode Checkout PRO
3. signierter Webhook
4. Subscription Update
5. Zahlung fehlgeschlagen → Grace
6. Zahlung wieder erfolgreich → Grace entfernt
7. Kündigung zum Periodenende
8. Customer Portal Upgrade/Downgrade
9. erst danach Live-Mode aktivieren
