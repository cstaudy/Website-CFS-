/**
 * ============================================================
 * cfs_zockt Creator Suite
 * Website Backend
 * Version 3.12.0
 * ============================================================
 */

"use strict";

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { LauncherReleaseCatalog, buildPolicy: buildLauncherReleasePolicy } = require("./lib/launcher-release-policy");
const { validSessionId, canResumeSessionRow, releasePolicyAllowsLive, buildResumedLiveState } = require("./lib/live-session-recovery");
const { ACTION_LEASE_SECONDS, ACTION_RETRY_DELAY_SECONDS, ACTION_MAX_ATTEMPTS, ACTION_TTL_MINUTES, normalizeActionIds } = require("./lib/live-action-delivery");
const { SCENE_PROFILES, sanitizeSceneConfig, validateSceneOwnership, scenePublicToken, publicSceneRow } = require("./lib/creator-widget-scenes");
const { basePlanEntitlements, resolveCreatorEntitlements, minimumPlanForTemplate, templateAllowed, publicPlanCatalog } = require("./lib/creator-plan-policy");
const { releaseCandidateReadiness } = require("./lib/release-candidate-readiness");
const { sanitizeGameProfile, sanitizeScoreAction, initialGameState, gamePublicToken, publicGameRuntime, gameSceneSource } = require("./lib/creator-games");
const { CUT_FORMATS, sanitizeCutProject, sanitizeCutClip, publicCutProject, publicCutClip } = require("./lib/creator-cut-studio");
const { sanitizeGameRule, gameRuleMatches, gameRulePoints, publicGameRule, publicGameRuleHit } = require("./lib/creator-game-rules");
const { buildCutJobManifest, sanitizeCutJobResult, publicCutJob, canTransitionCutJob } = require("./lib/creator-cut-jobs");
const { profileSyncStatus, bridgeConnectionStatus, creatorReadiness } = require("./lib/creator-admin-health");
const { billingAccessState, effectivePlan: effectiveBillingPlan, stripeSubscriptionSnapshot, publicBillingSubscription, billingConfigState, eventSummary: billingEventSummary, shouldApplyStripeEvent, stripeSubscriptionIdFromInvoice } = require("./lib/creator-billing");
const { productionReleaseReadiness } = require("./lib/production-release-readiness");
const { EVIDENCE_KINDS, sanitizeProductionEvidence, publicProductionEvidence, verificationFlagsFromEvidence } = require("./lib/production-evidence");
const { stripeTestmodeE2E } = require("./lib/stripe-testmode-evidence");
const { PROTOCOLS: RELEASE_ACCEPTANCE_PROTOCOLS, PROTOCOL_KEYS: RELEASE_ACCEPTANCE_KEYS, sanitizeAcceptance, publicAcceptance, latestAcceptances } = require("./lib/release-acceptance");
const { STAGES: BETA_COHORT_STAGES, sanitizeCohort, sanitizeMember, evaluateCohort, releaseCohortReadiness } = require("./lib/beta-cohort-operations");
const { goNoGoAssessment, sanitizeDecision } = require("./lib/release-go-no-go");
const { runtimeDoctor } = require("./lib/config-doctor");

const app = express();


// ============================================================
// KONFIGURATION
// ============================================================

const PORT =
    Number(
        process.env.PORT ||
        3000
    );

const NODE_ENV =
    process.env.NODE_ENV ||
    "production";

const APP_NAME =
    "CFS_Zockt Creator Suite";

const BACKEND_VERSION =
    "3.12.0";


const DATABASE_URL =
    process.env.DATABASE_URL ||
    "";

const CLIENT_KEY =
    process.env.TIKTOK_CLIENT_KEY ||
    "";

const CLIENT_SECRET =
    process.env.TIKTOK_CLIENT_SECRET ||
    "";

const LAUNCHER_API_KEY =
    process.env.CFS_LAUNCHER_API_KEY ||
    "";

const APP_BASE_URL =
    process.env.APP_BASE_URL ||
    "https://cfs-zockt.de";

// ============================================================
// BILLING V37 · STRIPE HOSTED CHECKOUT / CUSTOMER PORTAL
// Medien und Creator-Inhalte bleiben davon vollständig getrennt.
// ============================================================

const STRIPE_SECRET_KEY = String(process.env.CFS_STRIPE_SECRET_KEY || "").trim();
const STRIPE_WEBHOOK_SECRET = String(process.env.CFS_STRIPE_WEBHOOK_SECRET || "").trim();
const STRIPE_PRICE_CREATOR_MONTHLY = String(process.env.CFS_STRIPE_PRICE_CREATOR_MONTHLY || "").trim();
const STRIPE_PRICE_PRO_MONTHLY = String(process.env.CFS_STRIPE_PRICE_PRO_MONTHLY || "").trim();
const BILLING_GRACE_DAYS = Math.max(0,Math.min(30,Math.round(Number(process.env.CFS_BILLING_GRACE_DAYS || 3))));
const BILLING_PRICE_PLAN = Object.freeze({
    ...(STRIPE_PRICE_CREATOR_MONTHLY ? {[STRIPE_PRICE_CREATOR_MONTHLY]:"creator"} : {}),
    ...(STRIPE_PRICE_PRO_MONTHLY ? {[STRIPE_PRICE_PRO_MONTHLY]:"pro"} : {})
});
const BILLING_PLAN_PRICE = Object.freeze({creator:STRIPE_PRICE_CREATOR_MONTHLY,pro:STRIPE_PRICE_PRO_MONTHLY});
const BILLING_CONFIG = billingConfigState({secretKey:STRIPE_SECRET_KEY,webhookSecret:STRIPE_WEBHOOK_SECRET,creatorPriceId:STRIPE_PRICE_CREATOR_MONTHLY,proPriceId:STRIPE_PRICE_PRO_MONTHLY,graceDays:BILLING_GRACE_DAYS});
const ALLOW_LEGACY_PRODUCTION_FLAGS =
    String(process.env.CFS_ALLOW_LEGACY_VERIFICATION_FLAGS || "false").trim().toLowerCase() === "true";
const PRODUCTION_VERIFICATION_FLAGS = Object.freeze(ALLOW_LEGACY_PRODUCTION_FLAGS ? {
    windows_build_verified:process.env.CFS_WINDOWS_BUILD_VERIFIED,
    code_signing_verified:process.env.CFS_CODE_SIGNING_VERIFIED,
    clean_install_verified:process.env.CFS_WINDOWS_CLEAN_INSTALL_VERIFIED,
    updater_e2e_verified:process.env.CFS_UPDATER_E2E_VERIFIED,
    obs_field_verified:process.env.CFS_OBS_FIELD_VERIFIED,
    tiktok_live_field_verified:process.env.CFS_TIKTOK_LIVE_FIELD_VERIFIED,
    billing_live_verified:process.env.CFS_BILLING_LIVE_VERIFIED,
    two_creators_verified:process.env.CFS_TWO_CREATORS_VERIFIED,
    canary_verified:process.env.CFS_CANARY_VERIFIED,
    rollback_verified:process.env.CFS_ROLLBACK_VERIFIED
} : {});
const PRODUCTION_EVIDENCE_RELEASE_VERSION = String(process.env.CFS_RELEASE_EVIDENCE_VERSION || "0.42.0").trim();


let stripeClientCache=null;
function stripeClient(){
    if(!STRIPE_SECRET_KEY){const error=new Error("Stripe Billing ist auf diesem Server nicht konfiguriert.");error.code="billing_not_configured";throw error;}
    if(!stripeClientCache){const Stripe=require("stripe");stripeClientCache=new Stripe(STRIPE_SECRET_KEY);}
    return stripeClientCache;
}

const REDIRECT_URI =
    process.env.TIKTOK_REDIRECT_URI ||
    `${APP_BASE_URL}/auth/tiktok/callback`;

const DEFAULT_CREATOR_ID =
    "default";

const ALLOW_PUBLIC_TIKTOK_CONNECT =
    String(
        process.env.ALLOW_PUBLIC_TIKTOK_CONNECT ||
        "false"
    )
        .trim()
        .toLowerCase() === "true";

const TIKTOK_CONNECT_CODE =
    String(
        process.env.CFS_TIKTOK_CONNECT_CODE ||
        ""
    ).trim();

const LAUNCHER_RELEASE_REPO =
    String(
        process.env.CFS_LAUNCHER_RELEASE_REPO ||
        "cstaudy/CFS-TikTok-Backend"
    ).trim();

const LAUNCHER_RELEASE_GITHUB_TOKEN =
    String(
        process.env.CFS_GITHUB_RELEASE_TOKEN ||
        ""
    ).trim();

const LAUNCHER_MIN_STABLE_VERSION =
    String(
        process.env.CFS_LAUNCHER_MIN_STABLE_VERSION ||
        "0.15.0"
    ).trim();

const LAUNCHER_MIN_BETA_VERSION =
    String(
        process.env.CFS_LAUNCHER_MIN_BETA_VERSION ||
        LAUNCHER_MIN_STABLE_VERSION
    ).trim();

const LAUNCHER_BUILD_TARGET_VERSION =
    String(
        process.env.CFS_LAUNCHER_BUILD_TARGET_VERSION ||
        "0.42.0"
    ).trim();

const LAUNCHER_BLOCKED_VERSIONS =
    String(process.env.CFS_LAUNCHER_BLOCKED_VERSIONS || "")
        .split(",")
        .map(value => value.trim())
        .filter(Boolean);

const LAUNCHER_MAINTENANCE_MODE =
    String(process.env.CFS_LAUNCHER_MAINTENANCE_MODE || "false")
        .trim()
        .toLowerCase() === "true";

const LAUNCHER_MAINTENANCE_MESSAGE =
    String(process.env.CFS_LAUNCHER_MAINTENANCE_MESSAGE || "").trim();

const LAUNCHER_STABLE_ROLLOUT_PERCENT =
    Math.max(0, Math.min(100, Number(process.env.CFS_LAUNCHER_STABLE_ROLLOUT_PERCENT || 100)));

const LAUNCHER_BETA_ROLLOUT_PERCENT =
    Math.max(0, Math.min(100, Number(process.env.CFS_LAUNCHER_BETA_ROLLOUT_PERCENT || 100)));

const LAUNCHER_PIN_STABLE_VERSION =
    String(process.env.CFS_LAUNCHER_PIN_STABLE_VERSION || "").trim();

const LAUNCHER_PIN_BETA_VERSION =
    String(process.env.CFS_LAUNCHER_PIN_BETA_VERSION || "").trim();

const LAUNCHER_SAFETY_REVISION =
    String(process.env.CFS_LAUNCHER_SAFETY_REVISION || "v21-default").trim();

const CFS_ADMIN_CREATOR_IDS = new Set(
    String(process.env.CFS_ADMIN_CREATOR_IDS || "")
        .split(",")
        .map(value => value.trim())
        .filter(Boolean)
);

const CFS_ADMIN_EMAILS = new Set(
    String(process.env.CFS_ADMIN_EMAILS || "")
        .split(",")
        .map(value => value.trim().toLowerCase())
        .filter(Boolean)
);

const LAUNCHER_RELEASE_CACHE_TTL_MS =
    Math.max(
        60 * 1000,
        Number(
            process.env.CFS_LAUNCHER_RELEASE_CACHE_TTL_MS ||
            10 * 60 * 1000
        )
    );

const launcherReleaseCatalog =
    new LauncherReleaseCatalog({
        repo:
            LAUNCHER_RELEASE_REPO,

        token:
            LAUNCHER_RELEASE_GITHUB_TOKEN,

        cacheTtlMs:
            LAUNCHER_RELEASE_CACHE_TTL_MS,

        logger:
            console
    });


// ============================================================
// TIKTOK KONFIGURATION
// ============================================================

const TIKTOK_AUTHORIZE_URL =
    "https://www.tiktok.com/v2/auth/authorize/";

const TIKTOK_TOKEN_URL =
    "https://open.tiktokapis.com/v2/oauth/token/";

const TIKTOK_REVOKE_URL =
    "https://open.tiktokapis.com/v2/oauth/revoke/";

const TIKTOK_USER_INFO_URL =
    "https://open.tiktokapis.com/v2/user/info/";

const REQUESTED_SCOPES = [
    "user.info.basic",
    "user.info.stats"
];

const OAUTH_TTL_MS =
    10 * 60 * 1000;

const ACCESS_TOKEN_SAFETY_WINDOW_MS =
    5 * 60 * 1000;

const TIKTOK_TIMEOUT_MS =
    15000;


// ============================================================
// CREATOR ACCOUNT
// ============================================================

const CREATOR_SESSION_COOKIE =
    "cfs_creator_session";

const CREATOR_SESSION_TTL_MS =
    30 * 24 * 60 * 60 * 1000;

const CREATOR_MAX_SESSIONS =
    8;

const PASSWORD_MIN_LENGTH =
    12;

const PASSWORD_MAX_LENGTH =
    128;

const LOGIN_RATE_WINDOW_MS =
    15 * 60 * 1000;

const LOGIN_RATE_MAX =
    10;

const REGISTER_RATE_WINDOW_MS =
    60 * 60 * 1000;

const REGISTER_RATE_MAX =
    5;

const TIKTOK_CONNECT_RATE_WINDOW_MS =
    15 * 60 * 1000;

const TIKTOK_CONNECT_RATE_MAX =
    10;

const ACCOUNT_DELETE_RATE_WINDOW_MS =
    15 * 60 * 1000;

const ACCOUNT_DELETE_RATE_MAX =
    5;

const SECURITY_EVENT_RETENTION_DAYS =
    180;


const WIDGET_SOURCE_KEY_BYTES =
    24;

const WIDGET_TIKTOK_REFRESH_MS =
    60 * 1000;

const WIDGET_READ_RATE_WINDOW_MS =
    60 * 1000;

const WIDGET_READ_RATE_MAX =
    180;

// Widget Studio V6 - Launcher Bridge transport
const WIDGET_BRIDGE_TOKEN_BYTES =
    32;

const WIDGET_BRIDGE_HEARTBEAT_STALE_MS =
    30 * 1000;

const WIDGET_BRIDGE_HEARTBEAT_RATE_WINDOW_MS =
    60 * 1000;

const WIDGET_BRIDGE_HEARTBEAT_RATE_MAX =
    120;

const WIDGET_BRIDGE_EVENT_RATE_WINDOW_MS =
    60 * 1000;

const WIDGET_BRIDGE_EVENT_RATE_MAX =
    360;

const WIDGET_BRIDGE_MAX_BATCH =
    50;

const FOLLOWER_WIDGET_MAX_GOAL =
    100000000;


// ============================================================
// EXPRESS
// ============================================================

app.disable(
    "x-powered-by"
);

app.set(
    "trust proxy",
    1
);

// Stripe verlangt für die Signaturprüfung den unveränderten Raw Body.
// Diese Route muss deshalb vor express.json() registriert werden.
app.post(
    "/api/billing/stripe/webhook",
    express.raw({type:"application/json",limit:"512kb"}),
    stripeBillingWebhook
);

app.use(
    express.json({
        limit:
            "256kb"
    })
);

app.use(
    express.urlencoded({
        extended:
            true,

        limit:
            "256kb"
    })
);


// ============================================================
// SECURITY HEADERS
// ============================================================

app.use(
    (
        req,
        res,
        next
    ) => {

        res.setHeader(
            "X-Content-Type-Options",
            "nosniff"
        );

        res.setHeader(
            "X-Frame-Options",
            "DENY"
        );

        res.setHeader(
            "Referrer-Policy",
            "strict-origin-when-cross-origin"
        );

        res.setHeader(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        );

        res.setHeader(
            "Cross-Origin-Opener-Policy",
            "same-origin"
        );

        if (
            NODE_ENV !==
            "development"
        ) {

            res.setHeader(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains"
            );

        }

        next();

    }
);


// ============================================================
// RATE LIMITING
//
// Bewusst ohne zusätzliche npm-Abhängigkeit.
// Bei späterem Multi-Instance-Betrieb auf Redis/DB-basierten
// Rate Limiter umstellen.
// ============================================================

function requestIp(
    req
) {

    return String(
        req.ip ||
        req.socket?.remoteAddress ||
        "unknown"
    );

}


function createRateLimiter({
    windowMs,
    max,
    keyGenerator,
    message
}) {

    const store =
        new Map();

    const cleanupTimer =
        setInterval(
            () => {

                const now =
                    Date.now();

                for (
                    const [
                        key,
                        value
                    ]
                    of store
                ) {

                    if (
                        value.resetAt <=
                        now
                    ) {

                        store.delete(
                            key
                        );

                    }

                }

            },
            Math.max(
                windowMs,
                60 * 1000
            )
        );

    cleanupTimer.unref?.();

    return (
        req,
        res,
        next
    ) => {

        const now =
            Date.now();

        const key =
            String(
                keyGenerator?.(
                    req
                ) ||
                requestIp(
                    req
                )
            );

        let entry =
            store.get(
                key
            );

        if (
            !entry ||
            entry.resetAt <=
                now
        ) {

            entry = {
                count:
                    0,
                resetAt:
                    now +
                    windowMs
            };

        }

        entry.count +=
            1;

        store.set(
            key,
            entry
        );

        const remaining =
            Math.max(
                0,
                max -
                entry.count
            );

        res.setHeader(
            "X-RateLimit-Limit",
            String(
                max
            )
        );

        res.setHeader(
            "X-RateLimit-Remaining",
            String(
                remaining
            )
        );

        res.setHeader(
            "X-RateLimit-Reset",
            String(
                Math.ceil(
                    entry.resetAt /
                    1000
                )
            )
        );

        if (
            entry.count >
            max
        ) {

            const retryAfter =
                Math.max(
                    1,
                    Math.ceil(
                        (
                            entry.resetAt -
                            now
                        ) /
                        1000
                    )
                );

            res.setHeader(
                "Retry-After",
                String(
                    retryAfter
                )
            );

            return res
                .status(429)
                .json({

                    ok:
                        false,

                    error:
                        message ||
                        "Zu viele Anfragen. Bitte versuche es später erneut."

                });

        }

        next();

    };

}


const accountLoginLimiter =
    createRateLimiter({

        windowMs:
            LOGIN_RATE_WINDOW_MS,

        max:
            LOGIN_RATE_MAX,

        keyGenerator:
            req =>
                (
                    requestIp(
                        req
                    ) +
                    "|" +
                    String(
                        req.body?.email ||
                        ""
                    )
                        .trim()
                        .toLowerCase()
                        .slice(
                            0,
                            254
                        )
                ),

        message:
            "Zu viele Anmeldeversuche. Bitte warte einige Minuten und versuche es erneut."

    });


const accountRegisterLimiter =
    createRateLimiter({

        windowMs:
            REGISTER_RATE_WINDOW_MS,

        max:
            REGISTER_RATE_MAX,

        keyGenerator:
            req =>
                requestIp(
                    req
                ),

        message:
            "Zu viele Registrierungsversuche. Bitte versuche es später erneut."

    });


const tiktokConnectLimiter =
    createRateLimiter({

        windowMs:
            TIKTOK_CONNECT_RATE_WINDOW_MS,

        max:
            TIKTOK_CONNECT_RATE_MAX,

        keyGenerator:
            req =>
                requestIp(
                    req
                ),

        message:
            "Zu viele TikTok-Verbindungsversuche. Bitte warte einige Minuten."

    });


const accountDeleteLimiter =
    createRateLimiter({

        windowMs:
            ACCOUNT_DELETE_RATE_WINDOW_MS,

        max:
            ACCOUNT_DELETE_RATE_MAX,

        keyGenerator:
            req =>
                (
                    String(
                        req.creatorAccount?.id ||
                        "unknown"
                    ) +
                    "|" +
                    requestIp(
                        req
                    )
                ),

        message:
            "Zu viele Löschversuche. Bitte warte einige Minuten und versuche es erneut."

    });


const widgetReadLimiter =
    createRateLimiter({

        windowMs:
            WIDGET_READ_RATE_WINDOW_MS,

        max:
            WIDGET_READ_RATE_MAX,

        keyGenerator:
            req =>
                (
                    requestIp(
                        req
                    ) +
                    "|" +
                    String(
                        req.params?.sourceKey ||
                        "widget"
                    )
                ),

        message:
            "Zu viele Widget-Aktualisierungen. Bitte warte kurz."

    });


const widgetBridgeHeartbeatLimiter =
    createRateLimiter({
        windowMs: WIDGET_BRIDGE_HEARTBEAT_RATE_WINDOW_MS,
        max: WIDGET_BRIDGE_HEARTBEAT_RATE_MAX,
        keyGenerator: req => requestIp(req),
        message: "Zu viele Bridge-Heartbeats. Bitte warte kurz."
    });

const widgetBridgeEventLimiter =
    createRateLimiter({
        windowMs: WIDGET_BRIDGE_EVENT_RATE_WINDOW_MS,
        max: WIDGET_BRIDGE_EVENT_RATE_MAX,
        keyGenerator: req => requestIp(req),
        message: "Zu viele Bridge-Events. Bitte sende Events gebündelt."
    });

const launcherDeviceStartLimiter =
    createRateLimiter({
        windowMs: 10 * 60 * 1000,
        max: 12,
        keyGenerator: req => requestIp(req),
        message: "Zu viele Launcher-Verknüpfungen gestartet. Bitte warte einige Minuten."
    });

const launcherDevicePollLimiter =
    createRateLimiter({
        windowMs: 10 * 60 * 1000,
        max: 240,
        keyGenerator: req => requestIp(req) + "|" + String(req.body?.device_link_id || ""),
        message: "Zu viele Statusabfragen für diese Launcher-Verknüpfung."
    });




// ============================================================
// ORIGIN / CSRF BASISSCHUTZ
//
// Für Browser-Schreibzugriffe auf Account- und Creator-APIs wird
// eine fremde Origin/Referer abgewiesen. Fehlende Origin bleibt
// zur Kompatibilität mit lokalen Tools erlaubt.
// ============================================================

function safeOrigin(
    value
) {

    try {

        return new URL(
            String(
                value ||
                ""
            )
        ).origin;

    }
    catch {

        return "";

    }

}


const TRUSTED_BROWSER_ORIGINS =
    new Set(
        [
            safeOrigin(
                APP_BASE_URL
            ),
            NODE_ENV ===
            "development"
                ? `http://localhost:${PORT}`
                : "",
            NODE_ENV ===
            "development"
                ? `http://127.0.0.1:${PORT}`
                : ""
        ]
            .filter(
                Boolean
            )
    );


app.use(
    (
        req,
        res,
        next
    ) => {

        const method =
            String(
                req.method ||
                "GET"
            )
                .toUpperCase();

        if (
            [
                "GET",
                "HEAD",
                "OPTIONS"
            ].includes(
                method
            )
        ) {

            return next();

        }

        const protectedBrowserApi =
            req.path.startsWith(
                "/api/account/"
            ) ||
            req.path.startsWith(
                "/api/creator/"
            );

        if (
            !protectedBrowserApi
        ) {

            return next();

        }

        const origin =
            safeOrigin(
                req.get(
                    "Origin"
                )
            );

        const refererOrigin =
            safeOrigin(
                req.get(
                    "Referer"
                )
            );

        const suppliedOrigin =
            origin ||
            refererOrigin;

        if (
            suppliedOrigin &&
            !TRUSTED_BROWSER_ORIGINS.has(
                suppliedOrigin
            )
        ) {

            return res
                .status(403)
                .json({

                    ok:
                        false,

                    error:
                        "Die Anfrage wurde aus Sicherheitsgründen abgewiesen."

                });

        }

        return next();

    }
);


// ============================================================
// ENV PRÜFEN
// ============================================================

function requireEnv(
    name,
    value
) {

    if (!value) {

        throw new Error(
            `${name} fehlt.`
        );

    }

}


function validateConfiguration() {

    requireEnv(
        "DATABASE_URL",
        DATABASE_URL
    );

    requireEnv(
        "TIKTOK_CLIENT_KEY",
        CLIENT_KEY
    );

    requireEnv(
        "TIKTOK_CLIENT_SECRET",
        CLIENT_SECRET
    );

    requireEnv(
        "CFS_LAUNCHER_API_KEY",
        LAUNCHER_API_KEY
    );

    if (
        !/^https:\/\//i.test(
            REDIRECT_URI
        )
    ) {

        throw new Error(
            "TIKTOK_REDIRECT_URI muss HTTPS verwenden."
        );

    }

}


// ============================================================
// POSTGRESQL
// ============================================================

const pool =
    new Pool({

        connectionString:
            DATABASE_URL,

        ssl:
            /render\.com/i.test(
                DATABASE_URL
            )
                ? {
                    rejectUnauthorized:
                        false
                }
                : undefined

    });


pool.on(
    "error",
    error => {

        console.error(
            "PostgreSQL Fehler:",
            error
        );

    }
);


// ============================================================
// TOKEN-VERSCHLÜSSELUNG
// ============================================================

function getEncryptionKey() {

    const raw =
        String(
            process.env.CFS_TOKEN_ENCRYPTION_KEY ||
            ""
        ).trim();

    if (!raw) {
        return null;
    }

    if (
        /^[0-9a-fA-F]{64}$/.test(
            raw
        )
    ) {

        return Buffer.from(
            raw,
            "hex"
        );

    }

    try {

        const decoded =
            Buffer.from(
                raw,
                "base64"
            );

        if (
            decoded.length ===
            32
        ) {

            return decoded;

        }

    }
    catch {
        // unten Fehler
    }

    throw new Error(
        "CFS_TOKEN_ENCRYPTION_KEY muss 32 Byte lang sein."
    );

}


const TOKEN_ENCRYPTION_KEY =
    getEncryptionKey();


function encryptSecret(
    value
) {

    if (!value) {
        return null;
    }

    if (
        !TOKEN_ENCRYPTION_KEY
    ) {

        return (
            "plain:" +
            String(value)
        );

    }

    const iv =
        crypto.randomBytes(
            12
        );

    const cipher =
        crypto.createCipheriv(
            "aes-256-gcm",
            TOKEN_ENCRYPTION_KEY,
            iv
        );

    const encrypted =
        Buffer.concat([
            cipher.update(
                String(value),
                "utf8"
            ),
            cipher.final()
        ]);

    const authTag =
        cipher.getAuthTag();

    return [
        "gcm",
        iv.toString(
            "base64"
        ),
        authTag.toString(
            "base64"
        ),
        encrypted.toString(
            "base64"
        )
    ].join(":");

}


function decryptSecret(
    value
) {

    if (!value) {
        return null;
    }

    const text =
        String(value);

    if (
        text.startsWith(
            "plain:"
        )
    ) {

        return text.slice(
            6
        );

    }

    if (
        !text.startsWith(
            "gcm:"
        )
    ) {

        return text;

    }

    if (
        !TOKEN_ENCRYPTION_KEY
    ) {

        throw new Error(
            "Token ist verschlüsselt, aber CFS_TOKEN_ENCRYPTION_KEY fehlt."
        );

    }

    const parts =
        text.split(":");

    if (
        parts.length !==
        4
    ) {

        throw new Error(
            "Ungültiges Token-Format."
        );

    }

    const iv =
        Buffer.from(
            parts[1],
            "base64"
        );

    const authTag =
        Buffer.from(
            parts[2],
            "base64"
        );

    const encrypted =
        Buffer.from(
            parts[3],
            "base64"
        );

    const decipher =
        crypto.createDecipheriv(
            "aes-256-gcm",
            TOKEN_ENCRYPTION_KEY,
            iv
        );

    decipher.setAuthTag(
        authTag
    );

    return Buffer
        .concat([
            decipher.update(
                encrypted
            ),
            decipher.final()
        ])
        .toString(
            "utf8"
        );

}


// ============================================================
// DATENBANK INITIALISIEREN
// ============================================================

async function initDatabase() {

    // --------------------------------------------------------
    // TIKTOK
    // --------------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS tiktok_connections (

            creator_id TEXT PRIMARY KEY,

            connected BOOLEAN
                NOT NULL
                DEFAULT FALSE,

            open_id TEXT,

            access_token TEXT,

            refresh_token TEXT,

            access_expires_at BIGINT,

            refresh_expires_at BIGINT,

            scope TEXT,

            display_name TEXT,

            avatar_url TEXT,

            follower_count BIGINT
                NOT NULL
                DEFAULT 0,

            following_count BIGINT
                NOT NULL
                DEFAULT 0,

            likes_count BIGINT
                NOT NULL
                DEFAULT 0,

            video_count BIGINT
                NOT NULL
                DEFAULT 0,

            updated_at TIMESTAMPTZ
                NOT NULL
                DEFAULT NOW()

        )
    `);


    await pool.query(`
        CREATE TABLE IF NOT EXISTS tiktok_oauth_states (

            state_hash TEXT PRIMARY KEY,

            creator_id TEXT
                NOT NULL,

            expires_at TIMESTAMPTZ
                NOT NULL,

            created_at TIMESTAMPTZ
                NOT NULL
                DEFAULT NOW()

        )
    `);


    await pool.query(`
        CREATE INDEX IF NOT EXISTS
            idx_tiktok_oauth_states_expires

        ON tiktok_oauth_states (
            expires_at
        )
    `);


    // --------------------------------------------------------
    // CREATOR ACCOUNTS
    // --------------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_accounts (

            id TEXT PRIMARY KEY,

            email TEXT
                NOT NULL
                UNIQUE,

            password_hash TEXT
                NOT NULL,

            password_salt TEXT
                NOT NULL,

            display_name TEXT
                NOT NULL
                DEFAULT '',

            plan TEXT
                NOT NULL
                DEFAULT 'free',

            status TEXT
                NOT NULL
                DEFAULT 'active',

            created_at TIMESTAMPTZ
                NOT NULL
                DEFAULT NOW(),

            updated_at TIMESTAMPTZ
                NOT NULL
                DEFAULT NOW()

        )
    `);


    // --------------------------------------------------------
    // LEGACY TIKTOK OWNER BRIDGE
    //
    // Die bestehende interne TikTok-Verbindung "default" wird
    // einmalig dem ältesten bestehenden Creator-Account zugeordnet.
    // Die Zuordnung bleibt absichtlich auch dann bestehen, wenn
    // dieser Account später gelöscht wird. So kann die globale
    // Owner-Verbindung niemals automatisch auf einen anderen
    // Creator übergehen.
    // --------------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_tiktok_legacy_owner (

            slot TEXT PRIMARY KEY,

            creator_id TEXT
                NOT NULL,

            created_at TIMESTAMPTZ
                NOT NULL
                DEFAULT NOW()

        )
    `);


    await pool.query(`
        INSERT INTO creator_tiktok_legacy_owner (
            slot,
            creator_id,
            created_at
        )

        SELECT
            'default',
            id,
            NOW()

        FROM creator_accounts

        WHERE status = 'active'

        ORDER BY
            created_at ASC,
            id ASC

        LIMIT 1

        ON CONFLICT (slot)
            DO NOTHING
    `);


    // --------------------------------------------------------
    // CREATOR SESSIONS
    //
    // WICHTIG:
    // token_hash bleibt erhalten, damit bestehende Logins
    // und die aktuelle Datenbank kompatibel bleiben.
    // --------------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_sessions (

            token_hash TEXT PRIMARY KEY,

            creator_id TEXT
                NOT NULL,

            expires_at TIMESTAMPTZ
                NOT NULL,

            created_at TIMESTAMPTZ
                NOT NULL
                DEFAULT NOW(),

            CONSTRAINT
                fk_creator_sessions_creator

            FOREIGN KEY (
                creator_id
            )

            REFERENCES creator_accounts (
                id
            )

            ON DELETE CASCADE

        )
    `);


    await pool.query(`
        CREATE INDEX IF NOT EXISTS
            idx_creator_sessions_creator

        ON creator_sessions (
            creator_id
        )
    `);


    await pool.query(`
        CREATE INDEX IF NOT EXISTS
            idx_creator_sessions_expires

        ON creator_sessions (
            expires_at
        )
    `);


    // --------------------------------------------------------
    // CREATOR SECURITY EVENTS
    //
    // Datenschutzfreundlich: Es werden bewusst weder Klartext-IP
    // noch User-Agent oder Browser-Fingerprints gespeichert.
    // --------------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_security_events (

            id BIGSERIAL PRIMARY KEY,

            creator_id TEXT
                NOT NULL,

            event_type TEXT
                NOT NULL,

            created_at TIMESTAMPTZ
                NOT NULL
                DEFAULT NOW(),

            CONSTRAINT
                fk_creator_security_events_creator

            FOREIGN KEY (
                creator_id
            )

            REFERENCES creator_accounts (
                id
            )

            ON DELETE CASCADE

        )
    `);


    await pool.query(`
        CREATE INDEX IF NOT EXISTS
            idx_creator_security_events_creator_created

        ON creator_security_events (
            creator_id,
            created_at DESC
        )
    `);


    // --------------------------------------------------------
    // CREATOR WIDGET SOURCES
    //
    // Öffentliche OBS-Quellen werden über einen zufälligen,
    // nicht erratbaren Source-Key aufgelöst. Account-Löschung
    // entfernt diese Einträge automatisch per CASCADE.
    // --------------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_widget_sources (

            creator_id TEXT
                NOT NULL,

            widget_key TEXT
                NOT NULL,

            source_key TEXT
                NOT NULL
                UNIQUE,

            config JSONB
                NOT NULL
                DEFAULT '{}'::jsonb,

            created_at TIMESTAMPTZ
                NOT NULL
                DEFAULT NOW(),

            updated_at TIMESTAMPTZ
                NOT NULL
                DEFAULT NOW(),

            PRIMARY KEY (
                creator_id,
                widget_key
            ),

            CONSTRAINT
                fk_creator_widget_sources_creator

            FOREIGN KEY (
                creator_id
            )

            REFERENCES creator_accounts (
                id
            )

            ON DELETE CASCADE

        )
    `);


    await pool.query(`
        CREATE INDEX IF NOT EXISTS
            idx_creator_widget_sources_source_key

        ON creator_widget_sources (
            source_key
        )
    `);


    // --------------------------------------------------------
    // WIDGET STUDIO V1
    //
    // Neue Studio-Widgets leben getrennt von den bisherigen
    // Legacy-Widget-Quellen. Dadurch kann ein Creator mehrere
    // Widgets besitzen und Entwurf/Live sauber trennen.
    // --------------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_widgets (

            id TEXT PRIMARY KEY,

            creator_id TEXT
                NOT NULL,

            widget_type TEXT
                NOT NULL,

            name TEXT
                NOT NULL,

            template_key TEXT
                NOT NULL
                DEFAULT 'cfs-standard',

            status TEXT
                NOT NULL
                DEFAULT 'draft',

            draft_config JSONB
                NOT NULL
                DEFAULT '{}'::jsonb,

            published_config JSONB,

            public_token TEXT
                NOT NULL
                UNIQUE,

            version INTEGER
                NOT NULL
                DEFAULT 1,

            created_at TIMESTAMPTZ
                NOT NULL
                DEFAULT NOW(),

            updated_at TIMESTAMPTZ
                NOT NULL
                DEFAULT NOW(),

            published_at TIMESTAMPTZ,

            CONSTRAINT fk_creator_widgets_creator
                FOREIGN KEY (creator_id)
                REFERENCES creator_accounts (id)
                ON DELETE CASCADE
        )
    `);

    // --------------------------------------------------------
    // V28 CREATOR TOOLS — GAME RUNTIME + CUT STUDIO PROJECTS
    // --------------------------------------------------------
    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_game_runtime (
            creator_id TEXT PRIMARY KEY REFERENCES creator_accounts(id) ON DELETE CASCADE,
            public_token TEXT NOT NULL UNIQUE,
            status VARCHAR(24) NOT NULL DEFAULT 'idle',
            game_type VARCHAR(40) NOT NULL DEFAULT 'chat_battle',
            title VARCHAR(120) NOT NULL DEFAULT 'Community Battle',
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            state JSONB NOT NULL DEFAULT '{}'::jsonb,
            started_at TIMESTAMPTZ,
            round_ends_at TIMESTAMPTZ,
            ended_at TIMESTAMPTZ,
            version INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_cut_projects (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            creator_id TEXT NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
            title VARCHAR(120) NOT NULL,
            status VARCHAR(24) NOT NULL DEFAULT 'draft',
            format VARCHAR(24) NOT NULL DEFAULT 'vertical',
            notes TEXT NOT NULL DEFAULT '',
            source_name VARCHAR(240) NOT NULL DEFAULT '',
            export_preset JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_cut_projects_creator ON creator_cut_projects (creator_id, updated_at DESC)`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_cut_clips (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id UUID NOT NULL REFERENCES creator_cut_projects(id) ON DELETE CASCADE,
            creator_id TEXT NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
            label VARCHAR(120) NOT NULL DEFAULT 'Clip',
            in_ms INTEGER NOT NULL DEFAULT 0,
            out_ms INTEGER NOT NULL DEFAULT 15000,
            caption TEXT NOT NULL DEFAULT '',
            selected BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_cut_clips_project ON creator_cut_clips (project_id, created_at ASC)`);
    await pool.query(`ALTER TABLE creator_cut_clips ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE creator_cut_clips ADD COLUMN IF NOT EXISTS caption_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE creator_cut_clips ADD COLUMN IF NOT EXISTS caption_position VARCHAR(16) NOT NULL DEFAULT 'bottom'`);
    await pool.query(`ALTER TABLE creator_cut_clips ADD COLUMN IF NOT EXISTS caption_size INTEGER NOT NULL DEFAULT 52`);
    await pool.query(`ALTER TABLE creator_cut_clips ADD COLUMN IF NOT EXISTS caption_style VARCHAR(16) NOT NULL DEFAULT 'box'`);
    await pool.query(`ALTER TABLE creator_cut_clips ADD COLUMN IF NOT EXISTS audio_gain_db NUMERIC(5,1) NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE creator_cut_clips ADD COLUMN IF NOT EXISTS audio_fade_in_ms INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE creator_cut_clips ADD COLUMN IF NOT EXISTS audio_fade_out_ms INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE creator_cut_clips ADD COLUMN IF NOT EXISTS keyframe_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE creator_cut_clips ADD COLUMN IF NOT EXISTS keyframe_zoom_start NUMERIC(5,3) NOT NULL DEFAULT 1`);
    await pool.query(`ALTER TABLE creator_cut_clips ADD COLUMN IF NOT EXISTS keyframe_zoom_end NUMERIC(5,3) NOT NULL DEFAULT 1`);
    await pool.query(`ALTER TABLE creator_cut_clips ADD COLUMN IF NOT EXISTS keyframe_pan_x_start NUMERIC(5,3) NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE creator_cut_clips ADD COLUMN IF NOT EXISTS keyframe_pan_x_end NUMERIC(5,3) NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE creator_cut_clips ADD COLUMN IF NOT EXISTS keyframe_pan_y_start NUMERIC(5,3) NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE creator_cut_clips ADD COLUMN IF NOT EXISTS keyframe_pan_y_end NUMERIC(5,3) NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE creator_cut_clips ADD COLUMN IF NOT EXISTS keyframe_easing VARCHAR(20) NOT NULL DEFAULT 'linear'`);
    await pool.query(`ALTER TABLE creator_cut_clips ADD COLUMN IF NOT EXISTS visual_keyframes JSONB NOT NULL DEFAULT '[]'::jsonb`);


    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_cut_clips_timeline ON creator_cut_clips (project_id, sort_order ASC, created_at ASC)`);



    // --------------------------------------------------------
    // V29 GAME LIVE RULES
    // Reagieren ausschließlich auf bereits angenommene echte
    // creator_live_events. Kein künstliches Event-Injection.
    // --------------------------------------------------------
    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_game_rules (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            creator_id TEXT NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
            label VARCHAR(120) NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            event_type VARCHAR(24) NOT NULL,
            team VARCHAR(4) NOT NULL DEFAULT 'a',
            points INTEGER NOT NULL DEFAULT 1,
            amount_mode VARCHAR(16) NOT NULL DEFAULT 'fixed',
            min_amount INTEGER NOT NULL DEFAULT 1,
            gift_name VARCHAR(120) NOT NULL DEFAULT '',
            gift_id VARCHAR(120) NOT NULL DEFAULT '',
            last_triggered_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_game_rules_creator ON creator_game_rules (creator_id, event_type, updated_at DESC)`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_game_rule_hits (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            creator_id TEXT NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
            rule_id UUID NOT NULL REFERENCES creator_game_rules(id) ON DELETE CASCADE,
            event_id TEXT NOT NULL,
            session_id TEXT,
            event_type VARCHAR(24) NOT NULL,
            team VARCHAR(4) NOT NULL,
            points INTEGER NOT NULL,
            actor_name VARCHAR(100) NOT NULL DEFAULT '',
            gift_name VARCHAR(120) NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(rule_id,event_id)
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_game_rule_hits_creator ON creator_game_rule_hits (creator_id, created_at DESC)`);

    // --------------------------------------------------------
    // V29 CUT EXPORT JOB QUEUE
    // Nur Manifest/Metadaten in der Cloud. Keine Videodateien.
    // --------------------------------------------------------
    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_cut_export_jobs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            creator_id TEXT NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
            project_id UUID NOT NULL REFERENCES creator_cut_projects(id) ON DELETE CASCADE,
            status VARCHAR(24) NOT NULL DEFAULT 'queued',
            manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
            bridge_id TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,
            result JSONB NOT NULL DEFAULT '{}'::jsonb,
            error_message TEXT NOT NULL DEFAULT '',
            requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            claimed_at TIMESTAMPTZ,
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_cut_export_jobs_creator ON creator_cut_export_jobs (creator_id, requested_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_cut_export_jobs_status ON creator_cut_export_jobs (creator_id, status, requested_at ASC)`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_widget_scenes (
            id TEXT PRIMARY KEY,
            creator_id TEXT NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
            name VARCHAR(120) NOT NULL DEFAULT 'Neue Scene',
            status VARCHAR(20) NOT NULL DEFAULT 'draft',
            draft_config JSONB NOT NULL DEFAULT '{}'::jsonb,
            published_config JSONB,
            public_token VARCHAR(120) NOT NULL UNIQUE,
            version INTEGER NOT NULL DEFAULT 1,
            published_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_creator_widget_scenes_creator
        ON creator_widget_scenes (creator_id, updated_at DESC)
    `);


    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_beta_testers (
            creator_id TEXT PRIMARY KEY REFERENCES creator_accounts(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'active',
            notes TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_creator_beta_testers_status
        ON creator_beta_testers (status, updated_at DESC)
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_beta_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            creator_id TEXT NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
            bridge_id TEXT,
            label VARCHAR(120) NOT NULL DEFAULT 'Beta Test',
            launcher_version VARCHAR(80) NOT NULL DEFAULT '',
            platform VARCHAR(80) NOT NULL DEFAULT '',
            provider VARCHAR(80) NOT NULL DEFAULT '',
            status VARCHAR(24) NOT NULL DEFAULT 'active',
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ended_at TIMESTAMPTZ,
            duration_seconds INTEGER,
            output_gate JSONB NOT NULL DEFAULT '{}'::jsonb,
            diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
            result_summary TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_beta_sessions_creator ON creator_beta_sessions (creator_id, started_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_beta_sessions_status ON creator_beta_sessions (status, started_at DESC)`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_beta_feedback (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            creator_id TEXT NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
            bridge_id TEXT,
            session_id UUID REFERENCES creator_beta_sessions(id) ON DELETE SET NULL,
            kind VARCHAR(24) NOT NULL DEFAULT 'bug',
            severity VARCHAR(24) NOT NULL DEFAULT 'medium',
            category VARCHAR(40) NOT NULL DEFAULT 'launcher',
            title VARCHAR(160) NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            repro_steps TEXT NOT NULL DEFAULT '',
            expected TEXT NOT NULL DEFAULT '',
            actual TEXT NOT NULL DEFAULT '',
            launcher_version VARCHAR(80) NOT NULL DEFAULT '',
            platform VARCHAR(80) NOT NULL DEFAULT '',
            provider VARCHAR(80) NOT NULL DEFAULT '',
            diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
            status VARCHAR(24) NOT NULL DEFAULT 'new',
            admin_notes TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_beta_feedback_status ON creator_beta_feedback (status, severity, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_beta_feedback_creator ON creator_beta_feedback (creator_id, created_at DESC)`);


    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_billing_subscriptions (
            creator_id TEXT PRIMARY KEY REFERENCES creator_accounts(id) ON DELETE CASCADE,
            provider TEXT NOT NULL DEFAULT '',
            provider_customer_id TEXT NOT NULL DEFAULT '',
            provider_subscription_id TEXT NOT NULL DEFAULT '',
            plan TEXT NOT NULL DEFAULT 'free',
            status TEXT NOT NULL DEFAULT 'none',
            current_period_end TIMESTAMPTZ,
            cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_creator_billing_subscriptions_status
        ON creator_billing_subscriptions (status, updated_at DESC)
    `);

    await pool.query(`ALTER TABLE creator_billing_subscriptions ADD COLUMN IF NOT EXISTS provider_price_id TEXT NOT NULL DEFAULT ''`);
    await pool.query(`ALTER TABLE creator_billing_subscriptions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE creator_billing_subscriptions ADD COLUMN IF NOT EXISTS grace_ends_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE creator_billing_subscriptions ADD COLUMN IF NOT EXISTS cancel_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE creator_billing_subscriptions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE creator_billing_subscriptions ADD COLUMN IF NOT EXISTS currency VARCHAR(12) NOT NULL DEFAULT ''`);
    await pool.query(`ALTER TABLE creator_billing_subscriptions ADD COLUMN IF NOT EXISTS amount_minor BIGINT`);
    await pool.query(`ALTER TABLE creator_billing_subscriptions ADD COLUMN IF NOT EXISTS billing_interval VARCHAR(24) NOT NULL DEFAULT ''`);
    await pool.query(`ALTER TABLE creator_billing_subscriptions ADD COLUMN IF NOT EXISTS last_invoice_status VARCHAR(40) NOT NULL DEFAULT ''`);
    await pool.query(`ALTER TABLE creator_billing_subscriptions ADD COLUMN IF NOT EXISTS last_event_id TEXT NOT NULL DEFAULT ''`);
    await pool.query(`ALTER TABLE creator_billing_subscriptions ADD COLUMN IF NOT EXISTS last_event_created BIGINT NOT NULL DEFAULT 0`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_billing_customer ON creator_billing_subscriptions(provider,provider_customer_id) WHERE provider_customer_id <> ''`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_billing_subscription ON creator_billing_subscriptions(provider,provider_subscription_id) WHERE provider_subscription_id <> ''`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_billing_events (
            event_id TEXT PRIMARY KEY,
            provider VARCHAR(40) NOT NULL,
            event_type VARCHAR(140) NOT NULL,
            creator_id TEXT REFERENCES creator_accounts(id) ON DELETE SET NULL,
            provider_customer_id TEXT NOT NULL DEFAULT '',
            provider_subscription_id TEXT NOT NULL DEFAULT '',
            event_created BIGINT NOT NULL DEFAULT 0,
            livemode BOOLEAN NOT NULL DEFAULT FALSE,
            outcome VARCHAR(40) NOT NULL DEFAULT 'received',
            summary JSONB NOT NULL DEFAULT '{}'::jsonb,
            processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_billing_events_created ON creator_billing_events(event_created DESC,processed_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_billing_events_creator ON creator_billing_events(creator_id,processed_at DESC)`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_production_evidence (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            kind VARCHAR(60) NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'verified',
            source VARCHAR(80) NOT NULL DEFAULT 'manual',
            release_version VARCHAR(80) NOT NULL DEFAULT '',
            environment VARCHAR(80) NOT NULL DEFAULT 'production',
            target TEXT NOT NULL DEFAULT '',
            reference TEXT NOT NULL DEFAULT '',
            artifact_sha256 VARCHAR(80) NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            details JSONB NOT NULL DEFAULT '{}'::jsonb,
            observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ,
            created_by TEXT REFERENCES creator_accounts(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_production_evidence_kind ON creator_production_evidence(kind,observed_at DESC,created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_production_evidence_release ON creator_production_evidence(release_version,observed_at DESC)`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_release_acceptances (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            protocol VARCHAR(80) NOT NULL,
            release_version VARCHAR(80) NOT NULL DEFAULT '',
            environment VARCHAR(80) NOT NULL DEFAULT 'production',
            target TEXT NOT NULL DEFAULT '',
            reference TEXT NOT NULL DEFAULT '',
            status VARCHAR(30) NOT NULL DEFAULT 'draft',
            step_results JSONB NOT NULL DEFAULT '[]'::jsonb,
            notes TEXT NOT NULL DEFAULT '',
            created_by TEXT REFERENCES creator_accounts(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_release_acceptance_release ON creator_release_acceptances(release_version,protocol,updated_at DESC)`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_release_cohorts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            release_version VARCHAR(80) NOT NULL DEFAULT '',
            name VARCHAR(160) NOT NULL,
            stage VARCHAR(30) NOT NULL DEFAULT 'pilot',
            target_testers INTEGER NOT NULL DEFAULT 5,
            status VARCHAR(30) NOT NULL DEFAULT 'planning',
            notes TEXT NOT NULL DEFAULT '',
            created_by TEXT REFERENCES creator_accounts(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_release_cohorts_release ON creator_release_cohorts(release_version,stage,updated_at DESC)`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_release_cohort_members (
            cohort_id UUID NOT NULL REFERENCES creator_release_cohorts(id) ON DELETE CASCADE,
            creator_id TEXT NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
            status VARCHAR(30) NOT NULL DEFAULT 'invited',
            sessions_required INTEGER NOT NULL DEFAULT 1,
            notes TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY(cohort_id,creator_id)
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_release_cohort_members_creator ON creator_release_cohort_members(creator_id,updated_at DESC)`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_release_decisions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            release_version VARCHAR(80) NOT NULL DEFAULT '',
            recommendation VARCHAR(30) NOT NULL DEFAULT 'hold',
            decision VARCHAR(30) NOT NULL DEFAULT 'hold',
            rationale TEXT NOT NULL,
            snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by TEXT REFERENCES creator_accounts(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_creator_release_decisions_release ON creator_release_decisions(release_version,created_at DESC)`);





    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_creator_widgets_creator_updated
        ON creator_widgets (
            creator_id,
            updated_at DESC
        )
    `);


    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_creator_widgets_public_token
        ON creator_widgets (
            public_token
        )
    `);


    // --------------------------------------------------------
    // WIDGET STUDIO V4 - LIVE DATA CORE / EVENT BUS
    //
    // Widgets lesen normalisierte Creator-Suite-Daten. Der
    // Provider kann spaeter Launcher/TikTok LIVE sein; aktuell
    // ist ausserdem ein klar gekennzeichneter Simulator moeglich.
    // --------------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_live_state (
            creator_id TEXT PRIMARY KEY,
            session_id TEXT,
            provider TEXT NOT NULL DEFAULT 'none',
            connected BOOLEAN NOT NULL DEFAULT FALSE,
            likes BIGINT NOT NULL DEFAULT 0,
            viewers BIGINT NOT NULL DEFAULT 0,
            shares BIGINT NOT NULL DEFAULT 0,
            gifts_count BIGINT NOT NULL DEFAULT 0,
            gifts_value NUMERIC(14,2) NOT NULL DEFAULT 0,
            followers_gained BIGINT NOT NULL DEFAULT 0,
            started_at TIMESTAMPTZ,
            last_event_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT fk_creator_live_state_creator
                FOREIGN KEY (creator_id)
                REFERENCES creator_accounts (id)
                ON DELETE CASCADE
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_live_events (
            id TEXT PRIMARY KEY,
            creator_id TEXT NOT NULL,
            session_id TEXT,
            provider TEXT NOT NULL DEFAULT 'simulator',
            event_key TEXT,
            event_type TEXT NOT NULL,
            actor_name TEXT,
            actor_avatar TEXT,
            amount BIGINT NOT NULL DEFAULT 1,
            event_value NUMERIC(14,2) NOT NULL DEFAULT 0,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT fk_creator_live_events_creator
                FOREIGN KEY (creator_id)
                REFERENCES creator_accounts (id)
                ON DELETE CASCADE
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_creator_live_events_creator_created
        ON creator_live_events (creator_id, created_at DESC)
    `);

    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_live_events_event_key
        ON creator_live_events (creator_id, provider, event_key)
        WHERE event_key IS NOT NULL
    `);

    // --------------------------------------------------------
    // WIDGET STUDIO V6 - LAUNCHER BRIDGE
    // Token werden nur gehasht gespeichert. Der Klartext wird
    // beim Erstellen genau einmal an den Creator ausgegeben.
    // --------------------------------------------------------

    await pool.query(`
        ALTER TABLE creator_live_state
        ADD COLUMN IF NOT EXISTS bridge_heartbeat_at TIMESTAMPTZ
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_live_bridges (
            id TEXT PRIMARY KEY,
            creator_id TEXT NOT NULL,
            label TEXT NOT NULL DEFAULT 'Creator Suite Launcher',
            token_hash TEXT NOT NULL UNIQUE,
            token_prefix TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            client_version TEXT,
            machine_name TEXT,
            capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
            last_seen_at TIMESTAMPTZ,
            last_connected_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            revoked_at TIMESTAMPTZ,
            CONSTRAINT fk_creator_live_bridges_creator
                FOREIGN KEY (creator_id)
                REFERENCES creator_accounts (id)
                ON DELETE CASCADE
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_creator_live_bridges_creator
        ON creator_live_bridges (creator_id, created_at DESC)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_creator_live_bridges_token_hash
        ON creator_live_bridges (token_hash)
        WHERE status = 'active'
    `);

    // --------------------------------------------------------
    // CREATOR SUITE V23 - LAUNCHER DEVICE LINK
    //
    // Klartext-Device-Secret und Bridge-Key werden niemals in
    // PostgreSQL gespeichert. Der Launcher erhält sie beim Start
    // der Kopplung und schützt sie lokal via safeStorage.
    // --------------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_launcher_device_links (
            id TEXT PRIMARY KEY,
            user_code TEXT NOT NULL UNIQUE,
            device_secret_hash TEXT NOT NULL UNIQUE,
            bridge_token_hash TEXT NOT NULL UNIQUE,
            bridge_token_prefix TEXT NOT NULL,
            creator_id TEXT,
            bridge_id TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            machine_name TEXT,
            client_version TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            approved_at TIMESTAMPTZ,
            consumed_at TIMESTAMPTZ,
            revoked_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT fk_creator_launcher_device_links_creator
                FOREIGN KEY (creator_id)
                REFERENCES creator_accounts (id)
                ON DELETE CASCADE
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_creator_launcher_device_links_creator
        ON creator_launcher_device_links (creator_id, created_at DESC)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_creator_launcher_device_links_expires
        ON creator_launcher_device_links (expires_at)
    `);

    await pool.query(`
        ALTER TABLE creator_live_bridges
        ADD COLUMN IF NOT EXISTS auth_method TEXT NOT NULL DEFAULT 'legacy_key'
    `);

    await pool.query(`
        ALTER TABLE creator_live_bridges
        ADD COLUMN IF NOT EXISTS device_link_id TEXT
    `);


    // --------------------------------------------------------
    // WIDGET STUDIO V8 - SESSION HISTORY + INTERACTIONS
    // --------------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_live_sessions (
            id TEXT PRIMARY KEY,
            creator_id TEXT NOT NULL,
            provider TEXT NOT NULL DEFAULT 'none',
            status TEXT NOT NULL DEFAULT 'live',
            likes BIGINT NOT NULL DEFAULT 0,
            viewers_peak BIGINT NOT NULL DEFAULT 0,
            shares BIGINT NOT NULL DEFAULT 0,
            gifts_count BIGINT NOT NULL DEFAULT 0,
            gifts_value NUMERIC(14,2) NOT NULL DEFAULT 0,
            followers_gained BIGINT NOT NULL DEFAULT 0,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ended_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT fk_creator_live_sessions_creator
                FOREIGN KEY (creator_id) REFERENCES creator_accounts (id) ON DELETE CASCADE
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_creator_live_sessions_creator_started
        ON creator_live_sessions (creator_id, started_at DESC)
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_interaction_rules (
            id TEXT PRIMARY KEY,
            creator_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT FALSE,
            cooldown_seconds INTEGER NOT NULL DEFAULT 20,
            min_amount BIGINT NOT NULL DEFAULT 1,
            template_text TEXT NOT NULL,
            output_kind TEXT NOT NULL DEFAULT 'launcher_tts',
            last_triggered_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (creator_id, event_type),
            CONSTRAINT fk_creator_interaction_rules_creator
                FOREIGN KEY (creator_id) REFERENCES creator_accounts (id) ON DELETE CASCADE
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_live_actions (
            id TEXT PRIMARY KEY,
            creator_id TEXT NOT NULL,
            session_id TEXT,
            event_id TEXT,
            action_type TEXT NOT NULL DEFAULT 'launcher_tts',
            action_text TEXT NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            delivered_at TIMESTAMPTZ,
            acked_at TIMESTAMPTZ,
            CONSTRAINT fk_creator_live_actions_creator
                FOREIGN KEY (creator_id) REFERENCES creator_accounts (id) ON DELETE CASCADE
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_creator_live_actions_creator_created
        ON creator_live_actions (creator_id, created_at DESC)
    `);

    await pool.query(`ALTER TABLE creator_live_actions ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE creator_live_actions ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE creator_live_actions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE creator_live_actions ADD COLUMN IF NOT EXISTS last_error TEXT`);
    await pool.query(
        `UPDATE creator_live_actions
         SET expires_at = COALESCE(expires_at, created_at + ($1::int * INTERVAL '1 minute'))
         WHERE status IN ('pending','delivered')`,
        [ACTION_TTL_MINUTES]
    );
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_creator_live_actions_delivery
        ON creator_live_actions (creator_id, status, lease_until, created_at)
    `);

    // --------------------------------------------------------
    // CREATOR SETTINGS
    // --------------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_settings (

            creator_id TEXT PRIMARY KEY,

            settings JSONB
                NOT NULL
                DEFAULT '{}'::jsonb,

            updated_at TIMESTAMPTZ
                NOT NULL
                DEFAULT NOW(),

            CONSTRAINT
                fk_creator_settings_creator

            FOREIGN KEY (
                creator_id
            )

            REFERENCES creator_accounts (
                id
            )

            ON DELETE CASCADE

        )
    `);


    // --------------------------------------------------------
    // CREATOR MODULE STATE
    //
    // Hier können später getrennt gespeichert werden:
    //
    // editor
    // launcher
    // cut_studio
    // games
    // nexus
    // audio_studio
    // twitch
    // obs
    // --------------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS creator_module_state (

            creator_id TEXT
                NOT NULL,

            module_key TEXT
                NOT NULL,

            state JSONB
                NOT NULL
                DEFAULT '{}'::jsonb,

            updated_at TIMESTAMPTZ
                NOT NULL
                DEFAULT NOW(),

            PRIMARY KEY (
                creator_id,
                module_key
            ),

            CONSTRAINT
                fk_creator_module_state_creator

            FOREIGN KEY (
                creator_id
            )

            REFERENCES creator_accounts (
                id
            )

            ON DELETE CASCADE

        )
    `);


    await pool.query(`
        CREATE INDEX IF NOT EXISTS
            idx_creator_module_state_creator

        ON creator_module_state (
            creator_id
        )
    `);


    await cleanupExpiredOAuthStates();

    await cleanupExpiredCreatorSessions();

    await cleanupOldSecurityEvents();

    console.log(
        "PostgreSQL bereit."
    );

}


// ============================================================
// CLEANUP
// ============================================================

async function cleanupExpiredOAuthStates() {

    await pool.query(`
        DELETE FROM tiktok_oauth_states
        WHERE expires_at < NOW()
    `);

}


async function cleanupExpiredCreatorSessions() {

    await pool.query(`
        DELETE FROM creator_sessions
        WHERE expires_at < NOW()
    `);

}


async function cleanupOldSecurityEvents() {

    await pool.query(
        `
        DELETE FROM creator_security_events
        WHERE created_at < NOW() - ($1 * INTERVAL '1 day')
        `,
        [
            SECURITY_EVENT_RETENTION_DAYS
        ]
    );

}


// ============================================================
// CREATOR ID
// ============================================================

function normalizeCreatorId(
    value
) {

    const id =
        String(
            value ||
            DEFAULT_CREATOR_ID
        ).trim();

    if (
        !/^[A-Za-z0-9_-]{1,80}$/.test(
            id
        )
    ) {

        throw new Error(
            "Ungültige Creator-ID."
        );

    }

    return id;

}


function creatorIdFromRequest(
    req
) {

    return normalizeCreatorId(

        req.get(
            "X-CFS-Creator-ID"
        ) ||

        req.query.creator_id ||

        DEFAULT_CREATOR_ID

    );

}


// ============================================================
// SECURITY
// ============================================================

function hashValue(
    value
) {

    return crypto
        .createHash(
            "sha256"
        )
        .update(
            String(value)
        )
        .digest(
            "hex"
        );

}


function safeEqualText(
    a,
    b
) {

    const left =
        Buffer.from(
            String(
                a ||
                ""
            )
        );

    const right =
        Buffer.from(
            String(
                b ||
                ""
            )
        );

    if (
        left.length !==
        right.length
    ) {

        return false;

    }

    return crypto
        .timingSafeEqual(
            left,
            right
        );

}


// ============================================================
// CREATOR ACCOUNT HELFER
// ============================================================

function normalizeEmail(
    value
) {

    return String(
        value ||
        ""
    )
        .trim()
        .toLowerCase();

}


function validEmail(
    value
) {

    const email =
        normalizeEmail(
            value
        );

    return (
        email.length <=
            254 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            email
        )
    );

}


function normalizeDisplayName(
    value
) {

    return String(
        value ||
        ""
    )
        .trim()
        .replace(
            /\s+/g,
            " "
        )
        .slice(
            0,
            80
        );

}


function createCreatorAccountId() {

    return (
        "creator_" +
        crypto
            .randomBytes(
                16
            )
            .toString(
                "hex"
            )
    );

}


function createSessionToken() {

    return crypto
        .randomBytes(
            32
        )
        .toString(
            "hex"
        );

}


function hashSessionToken(
    token
) {

    return hashValue(
        token
    );

}


function scryptAsync(
    password,
    salt
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            crypto.scrypt(
                password,
                salt,
                64,
                (
                    error,
                    derivedKey
                ) => {

                    if (
                        error
                    ) {

                        reject(
                            error
                        );

                        return;

                    }

                    resolve(
                        derivedKey
                    );

                }
            );

        }
    );

}


async function createPasswordHash(
    password
) {

    const salt =
        crypto
            .randomBytes(
                16
            )
            .toString(
                "hex"
            );

    const derivedKey =
        await scryptAsync(
            String(
                password
            ),
            salt
        );

    return {

        salt,

        hash:
            derivedKey
                .toString(
                    "hex"
                )

    };

}


async function verifyPassword(
    password,
    salt,
    storedHash
) {

    try {

        const derivedKey =
            await scryptAsync(
                String(
                    password
                ),
                String(
                    salt
                )
            );

        const stored =
            Buffer.from(
                String(
                    storedHash
                ),
                "hex"
            );

        if (
            derivedKey.length !==
            stored.length
        ) {

            return false;

        }

        return crypto
            .timingSafeEqual(
                derivedKey,
                stored
            );

    }
    catch {

        return false;

    }

}


// ============================================================
// PLAN SYSTEM
// ============================================================

function normalizePlan(
    value
) {

    const plan =
        String(
            value ||
            "free"
        )
            .trim()
            .toLowerCase();

    if (
        [
            "free",
            "creator",
            "pro"
        ].includes(
            plan
        )
    ) {

        return plan;

    }

    return "free";

}


function planRank(
    value
) {

    return ({
        free:
            0,

        creator:
            1,

        pro:
            2
    })[
        normalizePlan(
            value
        )
    ] ?? 0;

}


function hasMinimumPlan(
    currentPlan,
    requiredPlan
) {

    return (
        planRank(
            currentPlan
        ) >=
        planRank(
            requiredPlan
        )
    );

}


// ============================================================
// PLAN RECHTE
// ============================================================

function getPlanEntitlements(
    value
) {
    return basePlanEntitlements(value);
}



async function getCreatorSubscriptionState(creatorId) {
    const result=await pool.query(`
        SELECT provider,provider_customer_id,provider_subscription_id,provider_price_id,plan,status,
               current_period_start,current_period_end,grace_ends_at,cancel_at_period_end,cancel_at,ended_at,
               currency,amount_minor,billing_interval,last_invoice_status,last_event_id,last_event_created,created_at,updated_at
        FROM creator_billing_subscriptions WHERE creator_id=$1 LIMIT 1
    `,[creatorId]);
    const row=result.rows[0];
    return row ? publicBillingSubscription(row) : publicBillingSubscription({plan:"free",status:"none"});
}

async function getCreatorBetaState(creatorId) {
    const result=await pool.query(`SELECT status,notes,created_at,updated_at FROM creator_beta_testers WHERE creator_id=$1 LIMIT 1`,[creatorId]);
    const row=result.rows[0];
    return {status:row?.status||"none",active:row?.status==="active",notes:studioText(row?.notes,1200,""),created_at:row?.created_at||null,updated_at:row?.updated_at||null};
}

async function creatorAccessProfile(accountOrId) {
    let account=typeof accountOrId==="object"&&accountOrId?accountOrId:null;
    if(!account){const result=await pool.query(`SELECT id,plan,status,display_name,email,created_at FROM creator_accounts WHERE id=$1 LIMIT 1`,[String(accountOrId||"")]);account=result.rows[0]||null;}
    if(!account)return null;
    const [beta,subscription]=await Promise.all([getCreatorBetaState(account.id),getCreatorSubscriptionState(account.id)]);
    const plan=normalizePlan(account.plan),effectivePlan=effectiveBillingPlan(plan,subscription);
    const entitlements=resolveCreatorEntitlements(effectivePlan,{betaActive:beta.active});
    const billingRaised=planRank(effectivePlan)>planRank(plan);
    const accessSource=beta.active?(billingRaised?"billing_plus_beta":"plan_plus_beta"):(billingRaised?"billing":"plan");
    entitlements.access_source=accessSource;
    return {
        plan,effective_plan:effectivePlan,
        base_entitlements:basePlanEntitlements(effectivePlan),entitlements,
        beta,subscription,
        access_source:accessSource
    };
}

function accessDeniedPayload(access,feature,requiredPlan="creator") {
    return {ok:false,allowed:false,feature:String(feature||""),required_plan:normalizePlan(requiredPlan),current_plan:access?.effective_plan||access?.plan||"free",base_plan:access?.plan||"free",beta_active:Boolean(access?.beta?.active),billing_active:Boolean(access?.subscription?.access_active),error:`Diese Funktion benötigt mindestens den ${normalizePlan(requiredPlan).toUpperCase()} Plan.`};
}

async function requireCreatorFeatureAccess(accountOrId,feature,requiredPlan="creator") {
    const access=await creatorAccessProfile(accountOrId);
    if(!access?.entitlements?.[feature]){const error=new Error(accessDeniedPayload(access,feature,requiredPlan).error);error.code="creator_feature_locked";error.access=access;error.feature=feature;error.requiredPlan=requiredPlan;throw error;}
    return access;
}

function stripeId(value){return typeof value==="string"?value:String(value?.id||"");}
function stripeCreatorIdFromObject(object={}){return studioText(object?.metadata?.creator_id||object?.client_reference_id,120,"");}
function stripePlanFromObject(object={}){
    const direct=normalizePlan(object?.metadata?.cfs_plan||"");
    if(["creator","pro"].includes(direct))return direct;
    const item=object?.items?.data?.[0],priceId=stripeId(item?.price)||stripeId(item?.plan);
    return normalizePlan(BILLING_PRICE_PLAN[priceId]||"free");
}
async function creatorIdForStripeObject(object={}){
    const direct=stripeCreatorIdFromObject(object);if(direct)return direct;
    const subscriptionId=object?.object==="subscription"?stripeId(object.id):stripeSubscriptionIdFromInvoice(object);
    const customerId=stripeId(object.customer);
    const result=await pool.query(`SELECT creator_id FROM creator_billing_subscriptions WHERE (provider='stripe' AND provider_subscription_id=$1 AND $1<>'') OR (provider='stripe' AND provider_customer_id=$2 AND $2<>'') LIMIT 1`,[subscriptionId,customerId]);
    return result.rows[0]?.creator_id||"";
}
async function recordBillingEvent(event,creatorId,outcome,extra={}){
    const summary={...billingEventSummary(event),...extra};
    await pool.query(`INSERT INTO creator_billing_events(event_id,provider,event_type,creator_id,provider_customer_id,provider_subscription_id,event_created,livemode,outcome,summary,processed_at) VALUES($1,'stripe',$2,$3,$4,$5,$6,$7,$8,$9::jsonb,NOW()) ON CONFLICT(event_id) DO UPDATE SET outcome=EXCLUDED.outcome,summary=EXCLUDED.summary,processed_at=NOW()`,[
        summary.id||String(event?.id||""),summary.type||String(event?.type||""),creatorId||null,summary.customer_id||"",summary.subscription_id||"",Number(summary.created||0),Boolean(summary.livemode),String(outcome||"processed"),JSON.stringify(summary)
    ]);
}
async function billingEventAlreadyProcessed(eventId){const r=await pool.query(`SELECT outcome FROM creator_billing_events WHERE event_id=$1 LIMIT 1`,[String(eventId||"")]);return Boolean(r.rows[0]&&["processed","ignored_stale","ignored_unmapped"].includes(r.rows[0].outcome));}
async function upsertStripeSubscription(creatorId,subscription,event,{graceEndsAt=null,lastInvoiceStatus=""}={}){
    const snapshot=stripeSubscriptionSnapshot(subscription,BILLING_PRICE_PLAN,event),existing=await pool.query(`SELECT last_event_id,last_event_created,grace_ends_at,last_invoice_status FROM creator_billing_subscriptions WHERE creator_id=$1 LIMIT 1`,[creatorId]),row=existing.rows[0]||{};
    if(!shouldApplyStripeEvent(row,event))return{applied:false,reason:"stale",snapshot};
    const preserveGrace=graceEndsAt===undefined?row.grace_ends_at:graceEndsAt;
    await pool.query(`
      INSERT INTO creator_billing_subscriptions(
        creator_id,provider,provider_customer_id,provider_subscription_id,provider_price_id,plan,status,current_period_start,current_period_end,
        grace_ends_at,cancel_at_period_end,cancel_at,ended_at,currency,amount_minor,billing_interval,last_invoice_status,last_event_id,last_event_created,created_at,updated_at
      ) VALUES($1,'stripe',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW())
      ON CONFLICT(creator_id) DO UPDATE SET provider='stripe',provider_customer_id=EXCLUDED.provider_customer_id,provider_subscription_id=EXCLUDED.provider_subscription_id,
        provider_price_id=EXCLUDED.provider_price_id,plan=EXCLUDED.plan,status=EXCLUDED.status,current_period_start=EXCLUDED.current_period_start,current_period_end=EXCLUDED.current_period_end,
        grace_ends_at=EXCLUDED.grace_ends_at,cancel_at_period_end=EXCLUDED.cancel_at_period_end,cancel_at=EXCLUDED.cancel_at,ended_at=EXCLUDED.ended_at,
        currency=EXCLUDED.currency,amount_minor=EXCLUDED.amount_minor,billing_interval=EXCLUDED.billing_interval,last_invoice_status=EXCLUDED.last_invoice_status,
        last_event_id=EXCLUDED.last_event_id,last_event_created=EXCLUDED.last_event_created,updated_at=NOW()
    `,[creatorId,snapshot.provider_customer_id,snapshot.provider_subscription_id,snapshot.provider_price_id,snapshot.plan,snapshot.status,snapshot.current_period_start,snapshot.current_period_end,preserveGrace,snapshot.cancel_at_period_end,snapshot.cancel_at,snapshot.ended_at,snapshot.currency,snapshot.amount_minor,snapshot.interval,lastInvoiceStatus||row.last_invoice_status||"",snapshot.last_event_id,snapshot.last_event_created]);
    return{applied:true,snapshot};
}
async function handleStripeEvent(event){
    if(await billingEventAlreadyProcessed(event.id))return{duplicate:true};
    const object=event?.data?.object||{},type=String(event?.type||""),client=stripeClient();
    let creatorId=await creatorIdForStripeObject(object);
    try{
        if(type==="checkout.session.completed"&&object?.mode==="subscription"){
            creatorId=creatorId||stripeCreatorIdFromObject(object);
            const subscriptionId=stripeId(object.subscription);
            if(!creatorId||!subscriptionId){await recordBillingEvent(event,creatorId,"ignored_unmapped",{reason:"checkout_missing_creator_or_subscription"});return{ignored:true};}
            const subscription=await client.subscriptions.retrieve(subscriptionId);
            const synced=await upsertStripeSubscription(creatorId,subscription,event,{graceEndsAt:null,lastInvoiceStatus:"checkout_completed"});
            await recordBillingEvent(event,creatorId,synced.applied?"processed":"ignored_stale");return synced;
        }
        if(type.startsWith("customer.subscription.")){
            creatorId=creatorId||stripeCreatorIdFromObject(object);
            if(!creatorId){await recordBillingEvent(event,null,"ignored_unmapped",{reason:"subscription_creator_missing"});return{ignored:true};}
            const synced=await upsertStripeSubscription(creatorId,object,event,{graceEndsAt:object.status==="active"||object.status==="trialing"?null:undefined});
            await recordBillingEvent(event,creatorId,synced.applied?"processed":"ignored_stale");return synced;
        }
        if(type==="invoice.payment_failed"||type==="invoice.paid"){
            const subscriptionId=stripeSubscriptionIdFromInvoice(object);
            if(!creatorId&&subscriptionId){const r=await pool.query(`SELECT creator_id FROM creator_billing_subscriptions WHERE provider='stripe' AND provider_subscription_id=$1 LIMIT 1`,[subscriptionId]);creatorId=r.rows[0]?.creator_id||"";}
            if(!creatorId||!subscriptionId){await recordBillingEvent(event,creatorId,"ignored_unmapped",{reason:"invoice_subscription_unmapped"});return{ignored:true};}
            const subscription=await client.subscriptions.retrieve(subscriptionId);
            const graceEndsAt=type==="invoice.payment_failed"?new Date(Date.now()+BILLING_GRACE_DAYS*86400000):null;
            const synced=await upsertStripeSubscription(creatorId,subscription,event,{graceEndsAt,lastInvoiceStatus:type==="invoice.paid"?"paid":"payment_failed"});
            await recordBillingEvent(event,creatorId,synced.applied?"processed":"ignored_stale",{grace_ends_at:graceEndsAt});return synced;
        }
        await recordBillingEvent(event,creatorId||null,"ignored_unmapped",{reason:"event_not_required"});return{ignored:true};
    }catch(error){await recordBillingEvent(event,creatorId||null,"failed",{error:studioText(error?.message,300,"billing event failed")});throw error;}
}
async function stripeBillingWebhook(req,res){
    if(!BILLING_CONFIG.webhook_ready)return res.status(503).json({ok:false,error:"Billing Webhook ist auf diesem Server nicht vollständig konfiguriert."});
    const signature=String(req.headers["stripe-signature"]||"");
    if(!signature)return res.status(400).json({ok:false,error:"Stripe-Signatur fehlt."});
    let event;
    try{event=stripeClient().webhooks.constructEvent(req.body,signature,STRIPE_WEBHOOK_SECRET);}catch(error){return res.status(400).json({ok:false,error:"Ungültige Stripe-Webhook-Signatur."});}
    try{const result=await handleStripeEvent(event);return res.json({received:true,duplicate:Boolean(result?.duplicate)});}catch(error){console.error("[billing:webhook]",error?.message||error);return res.status(500).json({ok:false,error:"Billing Event konnte nicht verarbeitet werden."});}
}

// ============================================================
// MODUL REGISTRY
// ============================================================

const CREATOR_MODULES =
    Object.freeze({

        dashboard: {
            key:
                "dashboard",
            title:
                "Dashboard",
            minimum_plan:
                "free",
            stateful:
                false,
            status:
                "active"
        },

        editor: {
            key:
                "editor",
            title:
                "Creator Editor",
            minimum_plan:
                "free",
            stateful:
                true,
            status:
                "active"
        },

        widget_studio: {
            key:
                "widget_studio",
            title:
                "Widget Studio",
            minimum_plan:
                "free",
            stateful:
                false,
            status:
                "active"
        },

        tiktok: {
            key:
                "tiktok",
            title:
                "TikTok Hub",
            minimum_plan:
                "free",
            stateful:
                false,
            status:
                "active"
        },

        launcher: {
            key:
                "launcher",
            title:
                "CFS Launcher",
            minimum_plan:
                "free",
            stateful:
                true,
            status:
                "active"
        },

        cut_studio: {
            key:
                "cut_studio",
            title:
                "Cut Studio",
            minimum_plan:
                "creator",
            stateful:
                true,
            status:
                "beta"
        },

        games: {
            key:
                "games",
            title:
                "Interaktive Spiele",
            minimum_plan:
                "creator",
            stateful:
                true,
            status:
                "active"
        },

        nexus: {
            key:
                "nexus",
            title:
                "NEXUS",
            minimum_plan:
                "pro",
            stateful:
                true,
            status:
                "preview"
        },

        audio_studio: {
            key:
                "audio_studio",
            title:
                "Audio Studio",
            minimum_plan:
                "pro",
            stateful:
                true,
            status:
                "roadmap"
        },

        twitch: {
            key:
                "twitch",
            title:
                "Twitch",
            minimum_plan:
                "pro",
            stateful:
                true,
            status:
                "roadmap"
        },

        obs: {
            key:
                "obs",
            title:
                "OBS",
            minimum_plan:
                "pro",
            stateful:
                true,
            status:
                "roadmap"
        }

    });


function canUseModule(
    plan,
    moduleKey
) {

    const module =
        CREATOR_MODULES[
            moduleKey
        ];

    if (!module) {
        return false;
    }

    return hasMinimumPlan(
        plan,
        module.minimum_plan
    );

}


function normalizeModuleKey(
    value
) {

    const key =
        String(
            value ||
            ""
        )
            .trim()
            .toLowerCase();

    if (
        !Object
            .prototype
            .hasOwnProperty
            .call(
                CREATOR_MODULES,
                key
            )
    ) {

        throw new Error(
            "Unbekanntes Creator-Modul."
        );

    }

    return key;

}


function publicModuleRegistry(
    account,
    entitlements = null
) {

    return Object
        .values(
            CREATOR_MODULES
        )
        .map(
            module => ({

                ...module,

                allowed:
                    entitlements && Object.prototype.hasOwnProperty.call(entitlements,module.key)
                        ? Boolean(entitlements[module.key])
                        : canUseModule(account?.plan,module.key)

            })
        );

}
// ============================================================
// CREATOR ACCOUNT ÖFFENTLICHE DATEN
// ============================================================

function publicCreatorAccount(
    account
) {

    if (!account) {
        return null;
    }

    return {

        id:
            account.id,

        email:
            account.email,

        display_name:
            account.display_name,

        plan:
            normalizePlan(
                account.plan
            ),

        status:
            account.status ||
            "active",

        created_at:
            account.created_at ||
            null,

        updated_at:
            account.updated_at ||
            null

    };

}


// ============================================================
// CREATOR ACCOUNT SUCHEN
// ============================================================

async function findCreatorByEmail(
    email
) {

    const result =
        await pool.query(
            `
            SELECT
                id,
                email,
                password_hash,
                password_salt,
                display_name,
                plan,
                status,
                created_at,
                updated_at

            FROM creator_accounts

            WHERE email = $1

            LIMIT 1
            `,
            [
                normalizeEmail(
                    email
                )
            ]
        );

    return (
        result.rows[0] ||
        null
    );

}


async function findCreatorById(
    creatorId
) {

    const result =
        await pool.query(
            `
            SELECT
                id,
                email,
                display_name,
                plan,
                status,
                created_at,
                updated_at

            FROM creator_accounts

            WHERE id = $1

            LIMIT 1
            `,
            [
                String(
                    creatorId
                )
            ]
        );

    return (
        result.rows[0] ||
        null
    );

}


// ============================================================
// CREATOR SESSION
// ============================================================

async function createCreatorSession(
    res,
    creatorId
) {

    await cleanupExpiredCreatorSessions();

    const token =
        createSessionToken();

    const tokenHash =
        hashSessionToken(
            token
        );

    const expiresAt =
        new Date(
            Date.now() +
            CREATOR_SESSION_TTL_MS
        );

    await pool.query(
        `
        INSERT INTO creator_sessions (
            token_hash,
            creator_id,
            expires_at
        )

        VALUES (
            $1,
            $2,
            $3
        )
        `,
        [
            tokenHash,
            creatorId,
            expiresAt
        ]
    );

    // Pro Creator nur eine begrenzte Zahl aktiver Sessions behalten.
    await pool.query(
        `
        DELETE FROM creator_sessions

        WHERE creator_id = $1

        AND token_hash NOT IN (
            SELECT token_hash
            FROM creator_sessions
            WHERE creator_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        )
        `,
        [
            creatorId,
            CREATOR_MAX_SESSIONS
        ]
    );

    res.cookie(
        CREATOR_SESSION_COOKIE,
        token,
        {

            httpOnly:
                true,

            secure:
                NODE_ENV !==
                "development",

            sameSite:
                "lax",

            maxAge:
                CREATOR_SESSION_TTL_MS,

            path:
                "/"

        }
    );

}


async function destroyCreatorSession(
    req,
    res
) {

    const cookies =
        parseCookies(
            req
        );

    const token =
        cookies[
            CREATOR_SESSION_COOKIE
        ];

    if (token) {

        await pool.query(
            `
            DELETE FROM creator_sessions
            WHERE token_hash = $1
            `,
            [
                hashSessionToken(
                    token
                )
            ]
        );

    }

    res.clearCookie(
        CREATOR_SESSION_COOKIE,
        {
            path:
                "/"
        }
    );

}


async function getCreatorFromRequest(
    req
) {

    const cookies =
        parseCookies(
            req
        );

    const token =
        cookies[
            CREATOR_SESSION_COOKIE
        ];

    if (!token) {
        return null;
    }

    const tokenHash =
        hashSessionToken(
            token
        );

    const result =
        await pool.query(
            `
            SELECT
                a.id,
                a.email,
                a.display_name,
                a.plan,
                a.status,
                a.created_at,
                a.updated_at

            FROM creator_sessions s

            INNER JOIN creator_accounts a
                ON a.id = s.creator_id

            WHERE
                s.token_hash = $1

            AND
                s.expires_at > NOW()

            AND
                a.status = 'active'

            LIMIT 1
            `,
            [
                tokenHash
            ]
        );

    return (
        result.rows[0] ||
        null
    );

}


async function launcherReleasePolicy(
    currentVersion = "",
    channel = "stable",
    force = false,
    cohortKey = ""
) {
    const catalog =
        await launcherReleaseCatalog.fetch({
            force:
                force === true
        });

    return {
        catalog: {
            ok:
                catalog.ok,

            repo:
                catalog.repo,

            fetched_at:
                catalog.fetched_at,

            stale:
                catalog.stale,

            cache:
                catalog.cache,

            error:
                catalog.error
        },

        policy:
            buildLauncherReleasePolicy({
                releases:
                    catalog.releases,

                currentVersion:
                    currentVersion,

                channel:
                    channel,

                minStable:
                    LAUNCHER_MIN_STABLE_VERSION,

                minBeta:
                    LAUNCHER_MIN_BETA_VERSION,

                buildTarget:
                    LAUNCHER_BUILD_TARGET_VERSION,

                blockedVersions:
                    LAUNCHER_BLOCKED_VERSIONS,

                maintenanceMode:
                    LAUNCHER_MAINTENANCE_MODE,

                maintenanceMessage:
                    LAUNCHER_MAINTENANCE_MESSAGE,

                rolloutStable:
                    LAUNCHER_STABLE_ROLLOUT_PERCENT,

                rolloutBeta:
                    LAUNCHER_BETA_ROLLOUT_PERCENT,

                pinnedStable:
                    LAUNCHER_PIN_STABLE_VERSION,

                pinnedBeta:
                    LAUNCHER_PIN_BETA_VERSION,

                cohortKey:
                    cohortKey,

                safetyRevision:
                    LAUNCHER_SAFETY_REVISION
            })
    };
}



async function getCreatorGameProfile(creatorId) {
    const data=await getModuleState(creatorId,"games");
    return sanitizeGameProfile(data.state||{});
}

async function getCreatorGameRuntimeRow(creatorId,{ensure=false}={}) {
    await pool.query(`
        UPDATE creator_game_runtime
        SET status='idle',ended_at=COALESCE(ended_at,NOW()),updated_at=NOW(),version=version+1
        WHERE creator_id=$1 AND status='running' AND round_ends_at IS NOT NULL AND round_ends_at<=NOW()
    `,[creatorId]);

    let result=await pool.query(`SELECT * FROM creator_game_runtime WHERE creator_id=$1 LIMIT 1`,[creatorId]);
    if(result.rows[0]||!ensure)return result.rows[0]||null;

    const profile=await getCreatorGameProfile(creatorId);
    result=await pool.query(
        `INSERT INTO creator_game_runtime(creator_id,public_token,status,game_type,title,config,state,created_at,updated_at)
         VALUES($1,$2,'idle',$3,$4,$5::jsonb,$6::jsonb,NOW(),NOW())
         ON CONFLICT(creator_id) DO NOTHING
         RETURNING *`,
        [creatorId,gamePublicToken(),profile.game_type,profile.title,JSON.stringify(profile),JSON.stringify(initialGameState(profile))]
    );
    if(result.rows[0])return result.rows[0];
    const existing=await pool.query(`SELECT * FROM creator_game_runtime WHERE creator_id=$1 LIMIT 1`,[creatorId]);
    return existing.rows[0]||null;
}

async function getCreatorGameRuntimePublic(creatorId,{ensure=false}={}) {
    const row=await getCreatorGameRuntimeRow(creatorId,{ensure});
    return row?publicGameRuntime(row,APP_BASE_URL):null;
}

async function startCreatorGameRuntime(creatorId) {
    const profile=await getCreatorGameProfile(creatorId);
    if(profile.enabled===false)throw new Error("Das Spielprofil ist deaktiviert.");
    await getCreatorGameRuntimeRow(creatorId,{ensure:true});
    const state=initialGameState(profile);
    const result=await pool.query(
        `UPDATE creator_game_runtime
         SET status='running',game_type=$2,title=$3,config=$4::jsonb,state=$5::jsonb,
             started_at=NOW(),round_ends_at=NOW()+($6::int*INTERVAL '1 second'),
             ended_at=NULL,version=version+1,updated_at=NOW()
         WHERE creator_id=$1 RETURNING *`,
        [creatorId,profile.game_type,profile.title,JSON.stringify(profile),JSON.stringify(state),profile.round_seconds]
    );
    return publicGameRuntime(result.rows[0],APP_BASE_URL);
}

async function stopCreatorGameRuntime(creatorId) {
    await getCreatorGameRuntimeRow(creatorId,{ensure:true});
    const result=await pool.query(
        `UPDATE creator_game_runtime SET status='idle',ended_at=NOW(),round_ends_at=NULL,version=version+1,updated_at=NOW() WHERE creator_id=$1 RETURNING *`,
        [creatorId]
    );
    return publicGameRuntime(result.rows[0],APP_BASE_URL);
}

async function resetCreatorGameRuntime(creatorId) {
    const client=await pool.connect();
    try{
        await client.query("BEGIN");
        let current=(await client.query(`SELECT * FROM creator_game_runtime WHERE creator_id=$1 FOR UPDATE`,[creatorId])).rows[0];
        if(!current){
            await client.query("ROLLBACK");
            await getCreatorGameRuntimeRow(creatorId,{ensure:true});
            return resetCreatorGameRuntime(creatorId);
        }
        const profile=sanitizeGameProfile(current.config||{});
        const oldState=current.state||{};
        const next={...initialGameState(profile),round:Number(oldState.round||1)+1,last_action:"reset"};
        const result=await client.query(
            `UPDATE creator_game_runtime
             SET state=$2::jsonb,
                 round_ends_at=CASE WHEN status='running' THEN NOW()+($3::int*INTERVAL '1 second') ELSE NULL END,
                 version=version+1,updated_at=NOW()
             WHERE creator_id=$1 RETURNING *`,
            [creatorId,JSON.stringify(next),profile.round_seconds]
        );
        await client.query("COMMIT");
        return publicGameRuntime(result.rows[0],APP_BASE_URL);
    }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}

async function scoreCreatorGameRuntime(creatorId,input={}) {
    const action=sanitizeScoreAction(input);
    const client=await pool.connect();
    try{
        await client.query("BEGIN");
        const current=(await client.query(`SELECT * FROM creator_game_runtime WHERE creator_id=$1 FOR UPDATE`,[creatorId])).rows[0];
        if(!current||current.status!=="running"){
            const error=new Error("Das Game läuft aktuell nicht.");error.code="game_not_running";throw error;
        }
        const profile=sanitizeGameProfile(current.config||{});
        const state={...initialGameState(profile),...(current.state||{})};
        const key=action.team==="b"?"score_b":"score_a";
        state[key]=Math.max(0,Number(state[key]||0)+action.delta);
        state.last_action=`score_${action.team}_${action.delta}`;
        state.target_score=profile.target_score;
        let winner="";
        if(state.score_a>=profile.target_score)winner="a";
        if(state.score_b>=profile.target_score)winner=winner||"b";
        state.winner=winner;
        const result=await client.query(
            `UPDATE creator_game_runtime
             SET state=$2::jsonb,
                 status=CASE WHEN $3<>'' THEN 'idle' ELSE status END,
                 ended_at=CASE WHEN $3<>'' THEN NOW() ELSE ended_at END,
                 round_ends_at=CASE WHEN $3<>'' THEN NULL ELSE round_ends_at END,
                 version=version+1,updated_at=NOW()
             WHERE creator_id=$1 RETURNING *`,
            [creatorId,JSON.stringify(state),winner]
        );
        await client.query("COMMIT");
        return publicGameRuntime(result.rows[0],APP_BASE_URL);
    }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}

async function getPublicGameRuntimeByToken(token) {
    const result=await pool.query(
        `SELECT r.*,c.display_name AS creator_display_name
         FROM creator_game_runtime r JOIN creator_accounts c ON c.id=r.creator_id
         WHERE r.public_token=$1 LIMIT 1`,
        [studioText(token,160,"")]
    );
    if(!result.rows[0])return null;
    return{runtime:publicGameRuntime(result.rows[0],APP_BASE_URL),creator:{display_name:result.rows[0].creator_display_name||"Creator"}};
}

async function getCreatorGameSceneSource(creatorId,{ensure=false}={}) {
    const runtime=await getCreatorGameRuntimePublic(creatorId,{ensure});
    return runtime?gameSceneSource(runtime):null;
}

async function getCreatorSceneSources(creatorId,{includeGame=false}={}) {
    const widgets=await getCreatorSceneWidgets(creatorId);
    if(includeGame){
        const game=await getCreatorGameSceneSource(creatorId,{ensure:true});
        if(game)widgets.push(game);
    }
    return widgets;
}

async function listCreatorGameRules(creatorId) {
    const result=await pool.query(
        `SELECT * FROM creator_game_rules WHERE creator_id=$1 ORDER BY created_at ASC`,
        [creatorId]
    );
    return result.rows.map(publicGameRule);
}

async function recentCreatorGameRuleHits(creatorId,limit=20) {
    const safe=Math.max(1,Math.min(100,Number(limit)||20));
    const result=await pool.query(
        `SELECT * FROM creator_game_rule_hits WHERE creator_id=$1 ORDER BY created_at DESC LIMIT ${safe}`,
        [creatorId]
    );
    return result.rows.map(publicGameRuleHit);
}

async function processCreatorGameLiveEvent(creatorId,event) {
    if(!event||!["follow","like","gift","share"].includes(String(event.event_type||"")))return null;

    const access=await creatorAccessProfile(creatorId);
    if(!access?.entitlements?.games)return null;

    const client=await pool.connect();
    try{
        await client.query("BEGIN");
        const runtime=(await client.query(
            `SELECT * FROM creator_game_runtime WHERE creator_id=$1 FOR UPDATE`,
            [creatorId]
        )).rows[0];
        if(!runtime||runtime.status!=="running"){
            await client.query("COMMIT");
            return{applied:0,runtime:null};
        }

        const rules=(await client.query(
            `SELECT * FROM creator_game_rules WHERE creator_id=$1 AND event_type=$2 AND enabled=TRUE ORDER BY created_at ASC`,
            [creatorId,String(event.event_type)]
        )).rows;

        const profile=sanitizeGameProfile(runtime.config||{});
        const state={...initialGameState(profile),...(runtime.state||{})};
        let addA=0,addB=0,applied=0;

        for(const rawRule of rules){
            const rule=sanitizeGameRule(rawRule);
            if(!gameRuleMatches(rule,event))continue;
            const points=gameRulePoints(rule,event);
            if(points<=0)continue;

            const payload=event.payload&&typeof event.payload==="object"?event.payload:{};
            const hit=await client.query(
                `
                INSERT INTO creator_game_rule_hits(
                    creator_id,rule_id,event_id,session_id,event_type,team,points,
                    actor_name,gift_name,created_at
                )
                VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
                ON CONFLICT(rule_id,event_id) DO NOTHING
                RETURNING id
                `,
                [
                    creatorId,rawRule.id,String(event.id||""),event.session_id||null,
                    String(event.event_type||""),rule.team,points,
                    studioText(event.actor_name,100,""),
                    studioText(payload.gift_name||payload.giftName,120,"")
                ]
            );
            if(!hit.rowCount)continue;

            if(rule.team==="b")addB+=points;else addA+=points;
            applied++;
            await client.query(
                `UPDATE creator_game_rules SET last_triggered_at=NOW(),updated_at=NOW() WHERE creator_id=$1 AND id=$2`,
                [creatorId,rawRule.id]
            );
        }

        if(!applied){
            await client.query("COMMIT");
            return{applied:0,runtime:publicGameRuntime(runtime,APP_BASE_URL)};
        }

        state.score_a=Math.max(0,Number(state.score_a||0)+addA);
        state.score_b=Math.max(0,Number(state.score_b||0)+addB);
        state.last_action=`live_event_${String(event.event_type||"")}`;
        state.target_score=profile.target_score;

        const aWins=state.score_a>=profile.target_score;
        const bWins=state.score_b>=profile.target_score;
        if(aWins&&!bWins)state.winner="a";
        else if(bWins&&!aWins)state.winner="b";
        else if(aWins&&bWins){
            if(state.score_a>state.score_b)state.winner="a";
            else if(state.score_b>state.score_a)state.winner="b";
            else state.winner="";
        } else state.winner="";

        const updated=(await client.query(
            `
            UPDATE creator_game_runtime
            SET state=$2::jsonb,
                status=CASE WHEN $3<>'' THEN 'idle' ELSE status END,
                ended_at=CASE WHEN $3<>'' THEN NOW() ELSE ended_at END,
                round_ends_at=CASE WHEN $3<>'' THEN NULL ELSE round_ends_at END,
                version=version+1,
                updated_at=NOW()
            WHERE creator_id=$1
            RETURNING *
            `,
            [creatorId,JSON.stringify(state),state.winner]
        )).rows[0];

        await client.query("COMMIT");
        return{
            applied,
            points_a:addA,
            points_b:addB,
            runtime:publicGameRuntime(updated,APP_BASE_URL)
        };
    }catch(error){
        await client.query("ROLLBACK");
        throw error;
    }finally{
        client.release();
    }
}

async function listCutExportJobs(creatorId,limit=50) {
    const safe=Math.max(1,Math.min(100,Number(limit)||50));
    const result=await pool.query(
        `SELECT * FROM creator_cut_export_jobs WHERE creator_id=$1 ORDER BY requested_at DESC LIMIT ${safe}`,
        [creatorId]
    );
    return result.rows.map(publicCutJob);
}

async function createCutExportJob(creatorId,projectId,access) {
    const projectData=await getCutProject(creatorId,projectId);
    if(!projectData)throw Object.assign(new Error("Cut-Projekt nicht gefunden."),{code:"cut_project_missing"});
    const manifest=buildCutJobManifest(projectData.project,projectData.clips);
    if(!manifest.clips.length)throw Object.assign(new Error("Für einen Export-Job muss mindestens ein gültiger Clip ausgewählt sein."),{code:"cut_job_empty"});

    const active=await pool.query(
        `SELECT COUNT(*)::int AS count FROM creator_cut_export_jobs WHERE creator_id=$1 AND status IN ('queued','claimed','processing')`,
        [creatorId]
    );
    const max=Math.max(0,Number(access?.entitlements?.max_pending_cut_jobs||0));
    if(Number(active.rows[0]?.count||0)>=max){
        const error=new Error(`Dein Zugriff erlaubt maximal ${max} gleichzeitig ausstehende Cut-Jobs.`);
        error.code="cut_job_limit";
        throw error;
    }

    const result=await pool.query(
        `INSERT INTO creator_cut_export_jobs(creator_id,project_id,status,manifest,result,requested_at,updated_at)
         VALUES($1,$2,'queued',$3::jsonb,'{}'::jsonb,NOW(),NOW())
         RETURNING *`,
        [creatorId,projectId,JSON.stringify(manifest)]
    );
    return publicCutJob(result.rows[0]);
}

async function transitionCutExportJob(creatorId,jobId,to,{bridgeId=null,result=null,errorMessage=""}={}) {
    const client=await pool.connect();
    try{
        await client.query("BEGIN");
        const current=(await client.query(
            `SELECT * FROM creator_cut_export_jobs WHERE creator_id=$1 AND id=$2 FOR UPDATE`,
            [creatorId,jobId]
        )).rows[0];
        if(!current){
            const error=new Error("Cut-Export-Job nicht gefunden.");error.code="cut_job_missing";throw error;
        }
        if(!canTransitionCutJob(current.status,to)){
            const error=new Error(`Cut-Job kann nicht von ${current.status} nach ${to} wechseln.`);error.code="cut_job_transition";throw error;
        }
        if(current.bridge_id&&bridgeId&&String(current.bridge_id)!==String(bridgeId)){
            const error=new Error("Dieser Cut-Job ist bereits einem anderen Launcher zugeordnet.");error.code="cut_job_bridge";throw error;
        }

        const cleanResult=result?sanitizeCutJobResult(result):current.result||{};
        const nextBridge=bridgeId||current.bridge_id||null;
        const updated=(await client.query(
            `
            UPDATE creator_cut_export_jobs
            SET status=$3,
                bridge_id=$4,
                attempts=CASE WHEN $3='claimed' THEN attempts+1 ELSE attempts END,
                claimed_at=CASE WHEN $3='claimed' THEN NOW() ELSE claimed_at END,
                started_at=CASE WHEN $3='processing' THEN NOW() ELSE started_at END,
                completed_at=CASE WHEN $3='completed' THEN NOW() ELSE completed_at END,
                result=$5::jsonb,
                error_message=$6,
                updated_at=NOW()
            WHERE creator_id=$1 AND id=$2
            RETURNING *
            `,
            [creatorId,jobId,to,nextBridge,JSON.stringify(cleanResult),studioText(errorMessage,2000,"")]
        )).rows[0];
        await client.query("COMMIT");
        return publicCutJob(updated);
    }catch(error){
        await client.query("ROLLBACK");
        throw error;
    }finally{client.release()}
}

async function listCutProjects(creatorId) {
    const result=await pool.query(
        `SELECT p.*,COUNT(c.id)::int AS clip_count
         FROM creator_cut_projects p LEFT JOIN creator_cut_clips c ON c.project_id=p.id
         WHERE p.creator_id=$1 GROUP BY p.id ORDER BY p.updated_at DESC`,
        [creatorId]
    );
    return result.rows.map(row=>publicCutProject(row,row.clip_count));
}

async function getCutProject(creatorId,projectId) {
    const projectResult=await pool.query(
        `SELECT p.*,(SELECT COUNT(*)::int FROM creator_cut_clips c WHERE c.project_id=p.id) AS clip_count
         FROM creator_cut_projects p WHERE p.creator_id=$1 AND p.id=$2 LIMIT 1`,
        [creatorId,projectId]
    );
    const row=projectResult.rows[0];
    if(!row)return null;
    const clips=await pool.query(`SELECT * FROM creator_cut_clips WHERE creator_id=$1 AND project_id=$2 ORDER BY sort_order ASC, created_at ASC`,[creatorId,projectId]);
    return{project:publicCutProject(row,row.clip_count),clips:clips.rows.map(publicCutClip)};
}

async function getCreatorSceneWidgets(creatorId) {
    const result=await pool.query(
        `SELECT * FROM creator_widgets WHERE creator_id=$1 ORDER BY updated_at DESC`,
        [creatorId]
    );
    return result.rows.map(publicStudioWidgetRow);
}
async function getCreatorSceneRow(creatorId,sceneId) {
    const result=await pool.query(
        `SELECT * FROM creator_widget_scenes WHERE creator_id=$1 AND id=$2 LIMIT 1`,
        [creatorId,sceneId]
    );
    return result.rows[0]||null;
}
async function getPublicSceneRow(token) {
    const result=await pool.query(
        `
        SELECT s.*,c.display_name AS creator_display_name
        FROM creator_widget_scenes s
        JOIN creator_accounts c ON c.id=s.creator_id
        WHERE s.public_token=$1
          AND s.status='live'
          AND s.published_config IS NOT NULL
        LIMIT 1
        `,
        [token]
    );
    return result.rows[0]||null;
}
async function hydratePublicScene(sceneRow) {
    const config=sanitizeSceneConfig(sceneRow.published_config||{});
    const ids=[...new Set(config.items.map(item=>String(item.widget_id)).filter(Boolean))];
    if(!ids.length)return{scene:publicSceneRow(sceneRow,APP_BASE_URL),creator:{display_name:sceneRow.creator_display_name||"Creator"},items:[]};

    const normalIds=ids.filter(id=>id!=="game_runtime");
    const widgetMap=new Map();
    if(normalIds.length){
        const widgets=await pool.query(
            `SELECT * FROM creator_widgets
             WHERE creator_id=$1 AND id=ANY($2::text[]) AND status='live' AND published_config IS NOT NULL`,
            [sceneRow.creator_id,normalIds]
        );
        for(const row of widgets.rows){
            const widget=publicStudioWidgetRow(row);
            widgetMap.set(String(widget.id),widget);
        }
    }
    if(ids.includes("game_runtime")){
        const game=await getCreatorGameSceneSource(sceneRow.creator_id,{ensure:false});
        if(game)widgetMap.set("game_runtime",game);
    }
    return{
        scene:publicSceneRow(sceneRow,APP_BASE_URL),
        creator:{display_name:sceneRow.creator_display_name||"Creator"},
        items:config.items.map(item=>{
            const widget=widgetMap.get(String(item.widget_id));if(!widget)return null;
            const published=widget.published_config||{};
            return{...item,widget:{id:widget.id,name:widget.name,widget_type:widget.widget_type,public_token:widget.public_token,source_url:widget.source_url,canvas:published.canvas||{width:600,height:120}}};
        }).filter(Boolean)
    };
}

// ============================================================
// CREATOR AUTH MIDDLEWARE
// ============================================================

async function requireCreatorAccount(
    req,
    res,
    next
) {

    try {

        const account =
            await getCreatorFromRequest(
                req
            );

        if (!account) {

            return res
                .status(401)
                .json({

                    ok:
                        false,

                    authenticated:
                        false,

                    error:
                        "Du bist nicht angemeldet."

                });

        }

        req.creatorAccount =
            account;

        next();

    }
    catch (error) {

        console.error(
            "Creator Auth Fehler:",
            error
        );

        return res
            .status(500)
            .json({

                ok:
                    false,

                error:
                    "Creator-Session konnte nicht geprüft werden."

            });

    }

}


// ============================================================
// SECURITY EVENT LOG
//
// Nur minimale Account-Sicherheitsereignisse.
// Keine Klartext-IP, kein User-Agent, kein Fingerprinting.
// Ein Log-Fehler darf Login oder andere Kernfunktionen nicht blockieren.
// ============================================================

const ALLOWED_SECURITY_EVENT_TYPES =
    new Set([
        "account_registered",
        "login_success",
        "logout_all",
        "profile_updated"
    ]);


async function recordSecurityEvent(
    creatorId,
    eventType
) {

    if (
        !creatorId ||
        !ALLOWED_SECURITY_EVENT_TYPES.has(
            eventType
        )
    ) {

        return;

    }


    try {

        await pool.query(
            `
            INSERT INTO creator_security_events (
                creator_id,
                event_type,
                created_at
            )

            VALUES (
                $1,
                $2,
                NOW()
            )
            `,
            [
                creatorId,
                eventType
            ]
        );

    }
    catch (error) {

        console.error(
            "Security Event Log Fehler:",
            error
        );

    }

}


async function isCreatorSuiteAdmin(account) {
    if (!account?.id) return false;

    if (CFS_ADMIN_CREATOR_IDS.has(String(account.id))) return true;
    if (CFS_ADMIN_EMAILS.has(String(account.email || "").trim().toLowerCase())) return true;

    const legacyOwner = await pool.query(
        `SELECT 1 FROM creator_tiktok_legacy_owner WHERE slot='default' AND creator_id=$1 LIMIT 1`,
        [account.id]
    );
    return legacyOwner.rowCount > 0;
}

async function requireCreatorAdmin(req,res,next) {
    try {
        if (!req.creatorAccount) {
            return requireCreatorAccount(req,res,async()=>requireCreatorAdmin(req,res,next));
        }
        if (!(await isCreatorSuiteAdmin(req.creatorAccount))) {
            return res.status(403).json({ok:false,error:"Dieser Bereich ist nur für CFS Root/Admin freigeschaltet."});
        }
        next();
    } catch (error) {
        console.error("Creator Admin Auth Fehler:",error);
        return res.status(500).json({ok:false,error:"Admin-Berechtigung konnte nicht geprüft werden."});
    }
}

// ============================================================
// CREATOR SETTINGS
// ============================================================

function defaultCreatorSettings() {

    return {

        profile: {

            bio:
                "",

            accent:
                "#148cff",

            theme:
                "cfs"

        },

        dashboard: {

            start_module:
                "dashboard"

        },

        widgets: {

            enabled: [
                "follower_goal"
            ]

        }

    };

}


function sanitizeCreatorSettings(
    input
) {

    if (
        !input ||
        typeof input !==
            "object" ||
        Array.isArray(
            input
        )
    ) {

        return defaultCreatorSettings();

    }

    const json =
        JSON.stringify(
            input
        );

    if (
        Buffer.byteLength(
            json,
            "utf8"
        ) >
        64 * 1024
    ) {

        throw new Error(
            "Creator-Einstellungen sind zu groß."
        );

    }

    return JSON.parse(
        json
    );

}


async function getCreatorSettings(
    creatorId
) {

    const result =
        await pool.query(
            `
            SELECT
                settings,
                updated_at

            FROM creator_settings

            WHERE creator_id = $1

            LIMIT 1
            `,
            [
                creatorId
            ]
        );

    if (
        !result.rows[0]
    ) {

        const defaults =
            defaultCreatorSettings();

        await pool.query(
            `
            INSERT INTO creator_settings (
                creator_id,
                settings,
                updated_at
            )

            VALUES (
                $1,
                $2::jsonb,
                NOW()
            )

            ON CONFLICT (
                creator_id
            )

            DO NOTHING
            `,
            [
                creatorId,
                JSON.stringify(
                    defaults
                )
            ]
        );

        return {

            settings:
                defaults,

            updated_at:
                null

        };

    }

    return {

        settings:
            result
                .rows[0]
                .settings ||
            defaultCreatorSettings(),

        updated_at:
            result
                .rows[0]
                .updated_at ||
            null

    };

}


async function saveCreatorSettings(
    creatorId,
    settings
) {

    const clean =
        sanitizeCreatorSettings(
            settings
        );

    const result =
        await pool.query(
            `
            INSERT INTO creator_settings (
                creator_id,
                settings,
                updated_at
            )

            VALUES (
                $1,
                $2::jsonb,
                NOW()
            )

            ON CONFLICT (
                creator_id
            )

            DO UPDATE SET
                settings =
                    EXCLUDED.settings,

                updated_at =
                    NOW()

            RETURNING
                settings,
                updated_at
            `,
            [
                creatorId,
                JSON.stringify(
                    clean
                )
            ]
        );

    return result.rows[0];

}


// ============================================================
// MODUL STATE
// ============================================================

function sanitizeModuleState(
    input
) {

    if (
        !input ||
        typeof input !==
            "object" ||
        Array.isArray(
            input
        )
    ) {

        return {};

    }

    const json =
        JSON.stringify(
            input
        );

    if (
        Buffer.byteLength(
            json,
            "utf8"
        ) >
        128 * 1024
    ) {

        throw new Error(
            "Modul-Daten sind zu groß."
        );

    }

    return JSON.parse(
        json
    );

}


async function getModuleState(
    creatorId,
    moduleKey
) {

    const key =
        normalizeModuleKey(
            moduleKey
        );

    const result =
        await pool.query(
            `
            SELECT
                state,
                updated_at

            FROM creator_module_state

            WHERE
                creator_id = $1

            AND
                module_key = $2

            LIMIT 1
            `,
            [
                creatorId,
                key
            ]
        );

    if (
        !result.rows[0]
    ) {

        return {

            module_key:
                key,

            state:
                {},

            updated_at:
                null

        };

    }

    return {

        module_key:
            key,

        state:
            result
                .rows[0]
                .state ||
            {},

        updated_at:
            result
                .rows[0]
                .updated_at ||
            null

    };

}


async function saveModuleState(
    creatorId,
    moduleKey,
    state
) {

    const key =
        normalizeModuleKey(
            moduleKey
        );

    const cleanState =
        sanitizeModuleState(
            state
        );

    const result =
        await pool.query(
            `
            INSERT INTO creator_module_state (
                creator_id,
                module_key,
                state,
                updated_at
            )

            VALUES (
                $1,
                $2,
                $3::jsonb,
                NOW()
            )

            ON CONFLICT (
                creator_id,
                module_key
            )

            DO UPDATE SET
                state =
                    EXCLUDED.state,

                updated_at =
                    NOW()

            RETURNING
                module_key,
                state,
                updated_at
            `,
            [
                creatorId,
                key,
                JSON.stringify(
                    cleanState
                )
            ]
        );

    return result.rows[0];

}


// ============================================================
// WIDGET STUDIO - FOLLOWER GOAL
// ============================================================

function clampNumber(
    value,
    minimum,
    maximum,
    fallback
) {

    const number =
        Number(
            value
        );

    if (
        !Number.isFinite(
            number
        )
    ) {

        return fallback;

    }

    return Math.min(
        maximum,
        Math.max(
            minimum,
            number
        )
    );

}


function normalizeWidgetColor(
    value,
    fallback
) {

    const color =
        String(
            value ||
            ""
        ).trim();

    if (
        /^#[0-9a-fA-F]{6}$/.test(
            color
        )
    ) {

        return color.toLowerCase();

    }

    return fallback;

}


function defaultFollowerGoalWidgetConfig() {

    return {

        enabled:
            true,

        preset:
            "bar",

        label:
            "Follower-Ziel",

        goal:
            200,

        accent:
            "#0a8cff",

        background:
            "#071321",

        text_color:
            "#f4f8ff",

        background_opacity:
            0.9,

        font_size:
            24,

        border_width:
            1,

        border_radius:
            18,

        show_logo:
            true,

        show_progress:
            true,

        show_numbers:
            true

    };

}


function sanitizeFollowerGoalWidgetConfig(
    input
) {

    const defaults =
        defaultFollowerGoalWidgetConfig();

    const source =
        input &&
        typeof input ===
            "object" &&
        !Array.isArray(
            input
        )
            ? input
            : {};

    const preset =
        [
            "bar",
            "compact",
            "card"
        ].includes(
            String(
                source.preset ||
                ""
            )
                .trim()
                .toLowerCase()
        )
            ? String(
                source.preset
            )
                .trim()
                .toLowerCase()
            : defaults.preset;

    const label =
        String(
            source.label ??
            defaults.label
        )
            .trim()
            .replace(
                /\s+/g,
                " "
            )
            .slice(
                0,
                60
            );

    return {

        enabled:
            source.enabled !==
            false,

        preset,

        label:
            label ||
            defaults.label,

        goal:
            Math.round(
                clampNumber(
                    source.goal,
                    1,
                    FOLLOWER_WIDGET_MAX_GOAL,
                    defaults.goal
                )
            ),

        accent:
            normalizeWidgetColor(
                source.accent,
                defaults.accent
            ),

        background:
            normalizeWidgetColor(
                source.background,
                defaults.background
            ),

        text_color:
            normalizeWidgetColor(
                source.text_color,
                defaults.text_color
            ),

        background_opacity:
            Math.round(
                clampNumber(
                    source.background_opacity,
                    0,
                    1,
                    defaults.background_opacity
                ) *
                100
            ) /
            100,

        font_size:
            Math.round(
                clampNumber(
                    source.font_size,
                    14,
                    72,
                    defaults.font_size
                )
            ),

        border_width:
            Math.round(
                clampNumber(
                    source.border_width,
                    0,
                    4,
                    defaults.border_width
                )
            ),

        border_radius:
            Math.round(
                clampNumber(
                    source.border_radius,
                    0,
                    40,
                    defaults.border_radius
                )
            ),

        show_logo:
            source.show_logo !==
            false,

        show_progress:
            source.show_progress !==
            false,

        show_numbers:
            source.show_numbers !==
            false

    };

}


function createWidgetSourceKey() {

    return crypto
        .randomBytes(
            WIDGET_SOURCE_KEY_BYTES
        )
        .toString(
            "hex"
        );

}


function validWidgetSourceKey(
    value
) {

    return new RegExp(
        `^[a-f0-9]{${WIDGET_SOURCE_KEY_BYTES * 2}}$`,
        "i"
    ).test(
        String(
            value ||
            ""
        )
    );

}


async function getFollowerWidgetSourceByCreator(
    creatorId,
    createIfMissing =
        true
) {

    const existing =
        await pool.query(
            `
            SELECT
                creator_id,
                widget_key,
                source_key,
                config,
                created_at,
                updated_at

            FROM creator_widget_sources

            WHERE
                creator_id = $1

            AND
                widget_key = 'follower_goal'

            LIMIT 1
            `,
            [
                creatorId
            ]
        );

    if (
        existing.rows[0] ||
        !createIfMissing
    ) {

        return existing.rows[0] ||
            null;

    }

    for (
        let attempt = 0;
        attempt < 3;
        attempt += 1
    ) {

        const sourceKey =
            createWidgetSourceKey();

        const result =
            await pool.query(
                `
                INSERT INTO creator_widget_sources (
                    creator_id,
                    widget_key,
                    source_key,
                    config,
                    created_at,
                    updated_at
                )

                VALUES (
                    $1,
                    'follower_goal',
                    $2,
                    $3::jsonb,
                    NOW(),
                    NOW()
                )

                ON CONFLICT
                    DO NOTHING

                RETURNING
                    creator_id,
                    widget_key,
                    source_key,
                    config,
                    created_at,
                    updated_at
                `,
                [
                    creatorId,
                    sourceKey,
                    JSON.stringify(
                        defaultFollowerGoalWidgetConfig()
                    )
                ]
            );

        if (
            result.rows[0]
        ) {

            return result.rows[0];

        }

        const afterConflict =
            await getFollowerWidgetSourceByCreator(
                creatorId,
                false
            );

        if (
            afterConflict
        ) {

            return afterConflict;

        }

    }

    throw new Error(
        "Widget-Quelle konnte nicht erstellt werden."
    );

}


async function saveFollowerWidgetSource(
    creatorId,
    config
) {

    const current =
        await getFollowerWidgetSourceByCreator(
            creatorId,
            true
        );

    const clean =
        sanitizeFollowerGoalWidgetConfig(
            config
        );

    const result =
        await pool.query(
            `
            UPDATE creator_widget_sources

            SET
                config = $3::jsonb,
                updated_at = NOW()

            WHERE
                creator_id = $1

            AND
                widget_key = $2

            RETURNING
                creator_id,
                widget_key,
                source_key,
                config,
                created_at,
                updated_at
            `,
            [
                creatorId,
                "follower_goal",
                JSON.stringify(
                    clean
                )
            ]
        );

    return result.rows[0] ||
        current;

}


async function rotateFollowerWidgetSourceKey(
    creatorId
) {

    await getFollowerWidgetSourceByCreator(
        creatorId,
        true
    );

    for (
        let attempt = 0;
        attempt < 3;
        attempt += 1
    ) {

        const sourceKey =
            createWidgetSourceKey();

        try {

            const result =
                await pool.query(
                    `
                    UPDATE creator_widget_sources

                    SET
                        source_key = $2,
                        updated_at = NOW()

                    WHERE
                        creator_id = $1

                    AND
                        widget_key = 'follower_goal'

                    RETURNING
                        creator_id,
                        widget_key,
                        source_key,
                        config,
                        created_at,
                        updated_at
                    `,
                    [
                        creatorId,
                        sourceKey
                    ]
                );

            if (
                result.rows[0]
            ) {

                return result.rows[0];

            }

        }
        catch (error) {

            if (
                error?.code !==
                "23505"
            ) {

                throw error;

            }

        }

    }

    throw new Error(
        "Neuer OBS-Schlüssel konnte nicht erstellt werden."
    );

}


async function getFollowerWidgetSourceByKey(
    sourceKey
) {

    if (
        !validWidgetSourceKey(
            sourceKey
        )
    ) {

        return null;

    }

    const result =
        await pool.query(
            `
            SELECT
                w.creator_id,
                w.widget_key,
                w.source_key,
                w.config,
                w.updated_at,
                a.display_name,
                a.status

            FROM creator_widget_sources w

            INNER JOIN creator_accounts a
                ON a.id = w.creator_id

            WHERE
                w.source_key = $1

            AND
                w.widget_key = 'follower_goal'

            AND
                a.status = 'active'

            LIMIT 1
            `,
            [
                String(
                    sourceKey
                )
            ]
        );

    return result.rows[0] ||
        null;

}


async function canUseLegacyDefaultTikTok(
    creatorId
) {

    const result =
        await pool.query(
            `
            SELECT creator_id
            FROM creator_tiktok_legacy_owner
            WHERE slot = 'default'
            LIMIT 1
            `
        );

    return Boolean(
        result.rows[0]?.creator_id &&
        String(
            result.rows[0].creator_id
        ) ===
        String(
            creatorId
        )
    );

}


async function resolveWidgetTikTokConnection(
    creatorId
) {

    const personal =
        await getConnection(
            creatorId
        );

    if (
        personal?.connected
    ) {

        return {

            creator_id:
                creatorId,

            connection:
                personal,

            source:
                "account"

        };

    }

    if (
        await canUseLegacyDefaultTikTok(
            creatorId
        )
    ) {

        const legacy =
            await getConnection(
                DEFAULT_CREATOR_ID
            );

        if (
            legacy?.connected
        ) {

            return {

                creator_id:
                    DEFAULT_CREATOR_ID,

                connection:
                    legacy,

                source:
                    "legacy_default"

            };

        }

    }

    return {

        creator_id:
            creatorId,

        connection:
            personal,

        source:
            "none"

    };

}


function widgetConnectionNeedsRefresh(
    connection
) {

    const updatedAt =
        connection?.updated_at
            ? new Date(
                connection.updated_at
            ).getTime()
            : 0;

    return Boolean(
        connection?.connected &&
        (
            !updatedAt ||
            Date.now() -
                updatedAt >=
                WIDGET_TIKTOK_REFRESH_MS
        )
    );

}


async function getFollowerWidgetTikTokData(
    creatorId
) {

    const resolved =
        await resolveWidgetTikTokConnection(
            creatorId
        );

    let connection =
        resolved.connection;

    if (
        widgetConnectionNeedsRefresh(
            connection
        )
    ) {

        try {

            await fetchTikTokProfile(
                resolved.creator_id
            );

            connection =
                await getConnection(
                    resolved.creator_id
                );

        }
        catch (error) {

            console.warn(
                "Widget TikTok Refresh Hinweis:",
                error?.message ||
                error
            );

        }

    }

    return {

        connected:
            Boolean(
                connection?.connected
            ),

        source:
            resolved.source,

        display_name:
            connection?.display_name ||
            "",

        avatar_url:
            connection?.avatar_url ||
            "",

        follower_count:
            Number(
                connection?.follower_count ||
                0
            ),

        likes_count:
            Number(
                connection?.likes_count ||
                0
            ),

        following_count:
            Number(
                connection?.following_count ||
                0
            ),

        video_count:
            Number(
                connection?.video_count ||
                0
            ),

        updated_at:
            connection?.updated_at ||
            null

    };

}


function followerWidgetSourceUrl(
    sourceKey
) {

    return (
        APP_BASE_URL +
        "/widgets/follower-goal.html#key=" +
        encodeURIComponent(
            sourceKey
        )
    );

}



// ============================================================
// WIDGET STUDIO V1 - CORE / DATENMODELL
// ============================================================

const WIDGET_STUDIO_ALLOWED_TYPES =
    new Set([
        "text",
        "counter",
        "progress",
        "shape",
        "image"
    ]);


const WIDGET_STUDIO_TEMPLATE_KEYS =
    new Set([
        "cfs-standard",
        "minimal",
        "neon",
        "glass",
        "compact",
        "wide",
        "blank"
    ]);


const WIDGET_STUDIO_PROVIDERS = Object.freeze({
    profile_api: {
        key: "profile_api",
        label: "TikTok Profil API",
        status: "ready",
        supplies: ["profile.followers", "profile.likes_total"]
    },
    simulator: {
        key: "simulator",
        label: "Creator Suite Simulator",
        status: "ready",
        supplies: ["live.likes", "live.viewers", "live.shares", "live.gifts_count", "live.followers_gained", "events"]
    },
    launcher_bridge: {
        key: "launcher_bridge",
        label: "Creator Suite Launcher Bridge",
        status: "ready",
        supplies: ["live.likes", "live.viewers", "live.shares", "live.gifts_count", "live.followers_gained", "events", "actions"]
    }
});

function studioProviderRegistryPublic() {
    return Object.values(WIDGET_STUDIO_PROVIDERS).map(item => ({...item, supplies:[...item.supplies]}));
}

const WIDGET_STUDIO_WIDGET_TYPES = Object.freeze({
    follower_goal: {
        key: "follower_goal", label: "Follower Goal", short_label: "FOLLOWER GOAL",
        category: "goals", mode: "goal", metric: "profile.followers",
        source: "TikTok Profil", source_kind: "profile",
        description: "Zeigt deinen aktuellen Follower-Stand und ein frei definierbares Ziel.", default_goal: 2000
    },
    follower_counter: {
        key: "follower_counter", label: "Follower Counter", short_label: "FOLLOWER COUNTER",
        category: "counter", mode: "counter", metric: "profile.followers",
        source: "TikTok Profil", source_kind: "profile",
        description: "Ein sauberer Zähler für deinen aktuellen Profil-Followerstand."
    },
    profile_likes_counter: {
        key: "profile_likes_counter", label: "Profil Likes Counter", short_label: "PROFIL LIKES",
        category: "counter", mode: "counter", metric: "profile.likes_total",
        source: "TikTok Profil", source_kind: "profile",
        description: "Zeigt die Gesamtzahl der Likes deines TikTok-Profils – nicht die Likes eines LIVE."
    },
    live_like_goal: {
        key: "live_like_goal", minimum_plan: "creator", label: "LIVE Like Goal", short_label: "LIVE LIKE GOAL",
        category: "goals", mode: "goal", metric: "live.likes",
        source: "LIVE Bridge", source_kind: "live_bridge",
        description: "Like-Ziel für eine laufende TikTok-LIVE-Session. Bis zur Bridge im Simulator testbar.", default_goal: 10000
    },
    live_like_counter: {
        key: "live_like_counter", minimum_plan: "creator", label: "LIVE Like Counter", short_label: "LIVE LIKES",
        category: "counter", mode: "counter", metric: "live.likes",
        source: "LIVE Bridge", source_kind: "live_bridge",
        description: "Zählt Likes innerhalb der aktuellen LIVE-Session."
    },
    viewer_counter: {
        key: "viewer_counter", minimum_plan: "creator", label: "Viewer Counter", short_label: "VIEWER",
        category: "counter", mode: "counter", metric: "live.viewers",
        source: "LIVE Bridge", source_kind: "live_bridge",
        description: "Zeigt die aktuelle Zuschauerzahl deiner LIVE-Session."
    },
    gift_goal: {
        key: "gift_goal", minimum_plan: "creator", label: "Gift Goal", short_label: "GIFT GOAL",
        category: "goals", mode: "goal", metric: "live.gifts_count",
        source: "LIVE Bridge", source_kind: "live_bridge",
        description: "Setze ein Ziel für die Anzahl empfangener Gifts in der LIVE-Session.", default_goal: 50
    },
    gift_counter: {
        key: "gift_counter", minimum_plan: "creator", label: "Gift Counter", short_label: "GIFTS",
        category: "counter", mode: "counter", metric: "live.gifts_count",
        source: "LIVE Bridge", source_kind: "live_bridge",
        description: "Zählt empfangene Gifts in der laufenden LIVE-Session."
    },
    share_goal: {
        key: "share_goal", minimum_plan: "creator", label: "Share Goal", short_label: "SHARE GOAL",
        category: "goals", mode: "goal", metric: "live.shares",
        source: "LIVE Bridge", source_kind: "live_bridge",
        description: "Setze ein Ziel für Shares innerhalb deiner LIVE-Session.", default_goal: 100
    },
    share_counter: {
        key: "share_counter", minimum_plan: "creator", label: "Share Counter", short_label: "SHARES",
        category: "counter", mode: "counter", metric: "live.shares",
        source: "LIVE Bridge", source_kind: "live_bridge",
        description: "Zählt Shares deiner laufenden LIVE-Session."
    },
    follower_gain_counter: {
        key: "follower_gain_counter", minimum_plan: "creator", label: "Follower Gain", short_label: "NEUE FOLLOWER",
        category: "counter", mode: "counter", metric: "live.followers_gained",
        source: "LIVE Bridge", source_kind: "live_bridge",
        description: "Zeigt, wie viele neue Follower während der LIVE-Session hinzugekommen sind."
    },
    follower_gain_goal: {
        key: "follower_gain_goal", minimum_plan: "creator", label: "Follower Gain Goal", short_label: "FOLLOWER GAIN GOAL",
        category: "goals", mode: "goal", metric: "live.followers_gained",
        source: "LIVE Bridge", source_kind: "live_bridge",
        description: "Ziel für neue Follower innerhalb der aktuellen LIVE-Session.", default_goal: 100
    },

    follow_alert: {
        key: "follow_alert", minimum_plan: "creator", label: "Follow Alert", short_label: "FOLLOW ALERT",
        category: "alerts", mode: "alert", event_type: "follow",
        source: "LIVE Event Queue", source_kind: "live_bridge",
        description: "Zeigt einen animierten Alert, wenn dir während des LIVE jemand folgt.", default_duration_ms: 4500
    },
    gift_alert: {
        key: "gift_alert", minimum_plan: "creator", label: "Gift Alert", short_label: "GIFT ALERT",
        category: "alerts", mode: "alert", event_type: "gift",
        source: "LIVE Event Queue", source_kind: "live_bridge",
        description: "Zeigt Sender, Gift und Anzahl als animierten LIVE-Alert.", default_duration_ms: 5200
    },
    share_alert: {
        key: "share_alert", minimum_plan: "creator", label: "Share Alert", short_label: "SHARE ALERT",
        category: "alerts", mode: "alert", event_type: "share",
        source: "LIVE Event Queue", source_kind: "live_bridge",
        description: "Bedankt sich sichtbar, wenn ein Zuschauer deinen LIVE teilt.", default_duration_ms: 4200
    },
    goal_reached_alert: {
        key: "goal_reached_alert", minimum_plan: "creator", label: "Goal Reached Alert", short_label: "GOAL REACHED",
        category: "alerts", mode: "goal_alert", metric: "live.likes",
        metric_options: ["profile.followers", "live.likes", "live.gifts_count", "live.shares", "live.followers_gained"],
        source: "Creator Suite Daten", source_kind: "hybrid",
        description: "Wird ausgelöst, sobald ein ausgewählter Zähler seinen Zielwert erreicht.",
        default_goal: 10000, default_duration_ms: 6000
    },
    latest_follower: {
        key: "latest_follower", minimum_plan: "creator", label: "Latest Follower", short_label: "LATEST FOLLOWER",
        category: "latest", mode: "latest", event_type: "follow",
        source: "LIVE Event Queue", source_kind: "live_bridge",
        description: "Zeigt dauerhaft den zuletzt erfassten neuen Follower der aktuellen LIVE-Session."
    },
    latest_gift: {
        key: "latest_gift", minimum_plan: "creator", label: "Latest Gift", short_label: "LATEST GIFT",
        category: "latest", mode: "latest", event_type: "gift",
        source: "LIVE Event Queue", source_kind: "live_bridge",
        description: "Zeigt den letzten Gift-Sender inklusive Gift-Name und Anzahl."
    },
    latest_share: {
        key: "latest_share", minimum_plan: "creator", label: "Latest Share", short_label: "LATEST SHARE",
        category: "latest", mode: "latest", event_type: "share",
        source: "LIVE Event Queue", source_kind: "live_bridge",
        description: "Zeigt den letzten Zuschauer, der deinen LIVE geteilt hat."
    }
});

const WIDGET_STUDIO_WIDGET_TYPE_KEYS =
    new Set(Object.keys(WIDGET_STUDIO_WIDGET_TYPES));

function studioWidgetDefinition(value) {
    const key = String(value || "follower_goal");
    return WIDGET_STUDIO_WIDGET_TYPES[key] || WIDGET_STUDIO_WIDGET_TYPES.follower_goal;
}

function studioWidgetRegistryPublic(plan = "free", entitlements = null) {
    const effective=entitlements||getPlanEntitlements(plan);
    return Object.values(WIDGET_STUDIO_WIDGET_TYPES).map((item) => {
        const minimumPlan=item.minimum_plan||"free";
        const available=minimumPlan==="free" ? true : (["alert","latest","goal_alert"].includes(item.mode)?Boolean(effective.alerts):Boolean(effective.live_widgets));
        return {...item,minimum_plan:minimumPlan,available,metric_options:Array.isArray(item.metric_options)?[...item.metric_options]:undefined};
    });
}

function studioClamp(
    value,
    min,
    max,
    fallback
) {

    const number =
        Number(value);

    return Number.isFinite(number)
        ? Math.min(max, Math.max(min, number))
        : fallback;

}


function studioText(
    value,
    max,
    fallback = ""
) {

    const clean =
        String(value ?? "")
            .replace(/[\u0000-\u001f\u007f]/g, " ")
            .trim()
            .slice(0, max);

    return clean || fallback;

}


function studioColor(
    value,
    fallback
) {

    const color =
        String(value || "")
            .trim();

    if (
        /^#[0-9a-fA-F]{6}$/.test(color) ||
        /^rgba?\(\s*[0-9.]+\s*,\s*[0-9.]+\s*,\s*[0-9.]+(?:\s*,\s*[0-9.]+)?\s*\)$/.test(color) ||
        color === "transparent"
    ) {
        return color;
    }

    return fallback;

}



const WIDGET_STUDIO_FONT_FAMILIES =
    new Set([
        "Inter",
        "system-ui",
        "Arial",
        "Verdana",
        "Trebuchet MS",
        "Georgia",
        "Courier New",
        "Impact"
    ]);

function studioFontFamily(value) {
    const family = String(value || "Inter").trim();
    return WIDGET_STUDIO_FONT_FAMILIES.has(family) ? family : "Inter";
}

function studioGradientStyle(source = {}) {
    return {
        gradientEnabled: source.gradientEnabled === true,
        gradientFrom: studioColor(source.gradientFrom, "#148cff"),
        gradientTo: studioColor(source.gradientTo, "#20d4e6"),
        gradientAngle: Math.round(studioClamp(source.gradientAngle, 0, 360, 90))
    };
}

function studioImageSource(value) {
    const source = String(value || "").trim();
    if (/^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(source) && source.length <= 145000) {
        return source;
    }
    if (/^https:\/\/[^\s"'<>]{1,1980}$/i.test(source)) {
        return source.slice(0, 2000);
    }
    return "";
}


function studioEffectStyle(
    source = {}
) {

    return {
        shadowColor:
            studioColor(
                source.shadowColor,
                "rgba(0,0,0,0.35)"
            ),
        shadowBlur:
            studioClamp(
                source.shadowBlur,
                0,
                80,
                0
            ),
        shadowX:
            studioClamp(
                source.shadowX,
                -80,
                80,
                0
            ),
        shadowY:
            studioClamp(
                source.shadowY,
                -80,
                80,
                0
            ),
        glowColor:
            studioColor(
                source.glowColor,
                "#148cff"
            ),
        glowBlur:
            studioClamp(
                source.glowBlur,
                0,
                80,
                0
            )
    };

}


function studioAnimation(
    source = {},
    fallbackEnter = "none",
    fallbackChange = "none"
) {

    const enter =
        ["none", "fade", "pop", "slide-up"].includes(
            source.enter
        )
            ? source.enter
            : fallbackEnter;

    const change =
        ["none", "pulse", "glow"].includes(
            source.change
        )
            ? source.change
            : fallbackChange;

    return {
        enabled:
            source.enabled !== false,
        enter,
        change,
        durationMs:
            Math.round(
                studioClamp(
                    source.durationMs,
                    100,
                    3000,
                    500
                )
            )
    };

}


function studioElementBase(
    source,
    index,
    type
) {

    return {
        id:
            studioText(
                source.id,
                80,
                `${type}_${index + 1}`
            ),

        type,

        name:
            studioText(
                source.name,
                80,
                type === "progress"
                    ? "Fortschritt"
                    : type === "counter"
                        ? "Zähler"
                        : type === "shape"
                            ? "Form"
                            : type === "image"
                                ? "Bild"
                                : "Text"
            ),

        visible:
            source.visible !== false,

        locked:
            source.locked === true,

        position: {
            x:
                Math.round(
                    studioClamp(
                        source.position?.x,
                        -2000,
                        4000,
                        0
                    )
                ),
            y:
                Math.round(
                    studioClamp(
                        source.position?.y,
                        -2000,
                        4000,
                        0
                    )
                )
        },

        size: {
            width:
                Math.round(
                    studioClamp(
                        source.size?.width,
                        1,
                        4000,
                        200
                    )
                ),
            height:
                Math.round(
                    studioClamp(
                        source.size?.height,
                        1,
                        4000,
                        40
                    )
                )
        },

        rotation:
            studioClamp(
                source.rotation,
                -360,
                360,
                0
            ),

        opacity:
            studioClamp(
                source.opacity,
                0,
                1,
                1
            ),

        animation:
            studioAnimation(
                source.animation
            ),

        zIndex:
            Math.round(
                studioClamp(
                    source.zIndex,
                    -1000,
                    1000,
                    index
                )
            )
    };

}


function sanitizeStudioElement(
    input,
    index
) {

    const source =
        input &&
        typeof input === "object" &&
        !Array.isArray(input)
            ? input
            : {};

    const type =
        WIDGET_STUDIO_ALLOWED_TYPES.has(
            String(source.type || "")
        )
            ? String(source.type)
            : "text";

    const base =
        studioElementBase(
            source,
            index,
            type
        );

    if (
        type === "text"
    ) {

        return {
            ...base,
            data: {
                text:
                    studioText(
                        source.data?.text,
                        240,
                        "Text"
                    )
            },
            style: {
                fontFamily:
                    studioFontFamily(
                        source.style?.fontFamily
                    ),
                fontSize:
                    Math.round(
                        studioClamp(
                            source.style?.fontSize,
                            8,
                            200,
                            24
                        )
                    ),
                fontWeight:
                    Math.round(
                        studioClamp(
                            source.style?.fontWeight,
                            100,
                            1000,
                            700
                        )
                    ),
                color:
                    studioColor(
                        source.style?.color,
                        "#f4f8ff"
                    ),
                textAlign:
                    ["left", "center", "right"].includes(
                        source.style?.textAlign
                    )
                        ? source.style.textAlign
                        : "left",
                letterSpacing:
                    studioClamp(source.style?.letterSpacing, -8, 30, 0),
                textTransform:
                    ["none", "uppercase", "lowercase"].includes(source.style?.textTransform)
                        ? source.style.textTransform
                        : "none",
                ...studioEffectStyle(
                    source.style
                )
            }
        };

    }

    if (
        type === "counter"
    ) {

        return {
            ...base,
            data: {
                format:
                    studioText(
                        source.data?.format,
                        80,
                        "{{current}} / {{target}}"
                    )
            },
            style: {
                fontFamily:
                    studioFontFamily(
                        source.style?.fontFamily
                    ),
                fontSize:
                    Math.round(
                        studioClamp(
                            source.style?.fontSize,
                            8,
                            200,
                            20
                        )
                    ),
                fontWeight:
                    Math.round(
                        studioClamp(
                            source.style?.fontWeight,
                            100,
                            1000,
                            800
                        )
                    ),
                color:
                    studioColor(
                        source.style?.color,
                        "#f4f8ff"
                    ),
                textAlign:
                    ["left", "center", "right"].includes(
                        source.style?.textAlign
                    )
                        ? source.style.textAlign
                        : "right",
                letterSpacing:
                    studioClamp(source.style?.letterSpacing, -8, 30, 0),
                textTransform:
                    ["none", "uppercase", "lowercase"].includes(source.style?.textTransform)
                        ? source.style.textTransform
                        : "none",
                ...studioEffectStyle(
                    source.style
                )
            }
        };

    }

    if (
        type === "progress"
    ) {

        return {
            ...base,
            data: {},
            style: {
                backgroundColor:
                    studioColor(
                        source.style?.backgroundColor,
                        "rgba(255,255,255,0.12)"
                    ),
                fillColor:
                    studioColor(
                        source.style?.fillColor,
                        "#148cff"
                    ),
                borderRadius:
                    studioClamp(
                        source.style?.borderRadius,
                        0,
                        200,
                        10
                    ),
                borderWidth:
                    studioClamp(
                        source.style?.borderWidth,
                        0,
                        20,
                        0
                    ),
                borderColor:
                    studioColor(
                        source.style?.borderColor,
                        "transparent"
                    ),
                ...studioEffectStyle(
                    source.style
                ),
                ...studioGradientStyle(
                    source.style
                )
            },
            animation:
                studioAnimation(
                    source.animation,
                    "fade",
                    "glow"
                )
        };

    }

    if (
        type === "shape"
    ) {

        return {
            ...base,
            data: {
                shape:
                    ["rectangle", "ellipse", "line"].includes(
                        source.data?.shape
                    )
                        ? source.data.shape
                        : "rectangle"
            },
            style: {
                backgroundColor:
                    studioColor(
                        source.style?.backgroundColor,
                        "#071321"
                    ),
                borderRadius:
                    studioClamp(
                        source.style?.borderRadius,
                        0,
                        500,
                        18
                    ),
                borderWidth:
                    studioClamp(
                        source.style?.borderWidth,
                        0,
                        20,
                        1
                    ),
                borderColor:
                    studioColor(
                        source.style?.borderColor,
                        "#173756"
                    ),
                ...studioEffectStyle(
                    source.style
                ),
                ...studioGradientStyle(
                    source.style
                )
            }
        };

    }

    return {
        ...base,
        data: {
            src:
                studioImageSource(
                    source.data?.src
                ),
            binding:
                ["tiktok.avatar", "event.actor_avatar"].includes(
                    source.data?.binding
                )
                    ? source.data.binding
                    : "",
            alt:
                studioText(
                    source.data?.alt,
                    120,
                    "Widget Bild"
                )
        },
        style: {
            objectFit:
                ["contain", "cover", "fill"].includes(
                    source.style?.objectFit
                )
                    ? source.style.objectFit
                    : "cover",
            borderRadius:
                studioClamp(
                    source.style?.borderRadius,
                    0,
                    500,
                    0
                ),
            ...studioEffectStyle(
                source.style
            )
        }
    };

}


function studioWidgetTemplateConfig(widgetType = "follower_goal", templateKey = "cfs-standard") {
    const def = studioWidgetDefinition(widgetType);
    const template = WIDGET_STUDIO_TEMPLATE_KEYS.has(String(templateKey)) ? String(templateKey) : "cfs-standard";
    const isGoal = def.mode === "goal" || def.mode === "goal_alert";
    const isEventWidget = def.mode === "alert" || def.mode === "latest";
    const goal = Number(def.default_goal || 1000);
    const label = def.label;
    const short = def.short_label;
    const sourceText = def.source_kind === "profile" ? "TIKTOK PROFIL" : def.source_kind === "hybrid" ? "CREATOR SUITE" : "TIKTOK LIVE";

    const base = (id,type,name,x,y,w,h,z=10) => ({id,type,name,visible:true,locked:false,position:{x,y},size:{width:w,height:h},rotation:0,opacity:1,zIndex:z,animation:{enabled:true,enter:"fade",change:type==="counter"?"pulse":type==="progress"?"glow":"none",durationMs:500}});
    const text=(id,name,value,x,y,w,h,size,color,align="left",weight=800,z=10,fx={})=>({...base(id,"text",name,x,y,w,h,z),data:{text:value},style:{fontFamily:"Inter",fontSize:size,fontWeight:weight,color,textAlign:align,letterSpacing:0,textTransform:"none",shadowColor:"rgba(0,0,0,.36)",shadowBlur:0,shadowX:0,shadowY:0,glowColor:"#148cff",glowBlur:0,...fx}});
    const counter=(id,name,format,x,y,w,h,size,color,align="right",weight=850,z=12,fx={})=>({...base(id,"counter",name,x,y,w,h,z),data:{format},style:{fontFamily:"Inter",fontSize:size,fontWeight:weight,color,textAlign:align,letterSpacing:0,textTransform:"none",shadowColor:"rgba(0,0,0,.36)",shadowBlur:0,shadowX:0,shadowY:0,glowColor:"#148cff",glowBlur:0,...fx}});
    const shape=(id,name,x,y,w,h,bg,radius,border="transparent",bw=0,z=0,fx={})=>({...base(id,"shape",name,x,y,w,h,z),data:{shape:"rectangle"},style:{backgroundColor:bg,gradientEnabled:false,gradientFrom:"#148cff",gradientTo:"#20d4e6",gradientAngle:90,borderRadius:radius,borderWidth:bw,borderColor:border,shadowColor:"rgba(0,0,0,.45)",shadowBlur:22,shadowX:0,shadowY:10,glowColor:"#148cff",glowBlur:0,...fx}});
    const progress=(id,x,y,w,h,fill,bg,radius,z=12,fx={})=>({...base(id,"progress","Fortschrittsbalken",x,y,w,h,z),data:{},style:{backgroundColor:bg,fillColor:fill,gradientEnabled:false,gradientFrom:fill,gradientTo:"#20d4e6",gradientAngle:90,borderRadius:radius,borderWidth:0,borderColor:"transparent",shadowColor:"rgba(0,0,0,.25)",shadowBlur:0,shadowX:0,shadowY:0,glowColor:fill,glowBlur:0,...fx},animation:{enabled:true,enter:"fade",change:"glow",durationMs:650}});
    const avatar=(id,name,binding,x,y,size,radius,z=12,fx={})=>({...base(id,"image",name,x,y,size,size,z),data:{binding,src:"",alt:name},style:{objectFit:"cover",borderRadius:radius,shadowColor:"rgba(0,0,0,.4)",shadowBlur:14,shadowX:0,shadowY:6,glowColor:"#148cff",glowBlur:0,...fx},animation:{enabled:true,enter:"pop",change:"none",durationMs:500}});

    const common={
        version:4,
        widgetType:def.key,
        data:{metric:def.metric||"",eventType:def.event_type||""},
        settings:{
            goal,
            alertDurationMs:Number(def.default_duration_ms||4500),
            latestTimeoutMs:0
        }
    };
    if(template==="blank") return {...common,canvas:{width:600,height:140,background:"transparent"},elements:[]};

    if (isEventWidget) {
        const eventType = def.event_type || "event";
        const title = eventType === "follow" ? (def.mode === "latest" ? "LETZTER FOLLOWER" : "NEUER FOLLOWER")
            : eventType === "gift" ? (def.mode === "latest" ? "LETZTES GIFT" : "NEUES GIFT")
            : eventType === "share" ? (def.mode === "latest" ? "LETZTER SHARE" : "LIVE GETEILT")
            : short;
        const message = eventType === "follow" ? (def.mode === "latest" ? "{{actor}}" : "{{actor}} folgt dir jetzt!")
            : eventType === "gift" ? "{{actor}} · {{amount}}× {{gift}}"
            : eventType === "share" ? (def.mode === "latest" ? "{{actor}}" : "{{actor}} hat deinen LIVE geteilt!")
            : "{{actor}}";
        const sub = eventType === "gift" ? "Danke für deinen Support!" : eventType === "follow" ? "Willkommen in der Community" : "Danke fürs Teilen";
        const h = def.mode === "alert" ? 158 : 112;
        const accent = template === "neon" ? "#ec3cff" : template === "wide" ? "#20d4e6" : template === "glass" ? "#27d0ff" : "#148cff";
        const bg = template === "neon" ? "rgba(12,7,24,.96)" : template === "glass" ? "rgba(13,34,52,.72)" : "rgba(6,17,31,.97)";
        const width = template === "compact" ? 440 : template === "wide" ? 760 : 620;
        const height = template === "compact" ? 96 : template === "wide" ? 112 : h;
        if (template === "minimal") return {...common,canvas:{width:600,height:def.mode==="alert"?118:82,background:"transparent"},elements:[
            text("event_title","Event Titel",title,8,8,220,18,9,accent,"left",900),
            text("event_actor","Event Text",message,8,30,584,30,def.mode==="alert"?21:18,"#f4f8ff","left",850),
            text("event_sub","Event Subtext",sub,8,66,584,18,8,"rgba(244,248,255,.54)","left",650)
        ]};
        return {...common,canvas:{width,height,background:"transparent"},elements:[
            shape("bg","Alert Hintergrund",3,3,width-6,height-6,bg,template==="compact"?18:22,accent,1,0,{glowColor:accent,glowBlur:template==="neon"?22:7,shadowBlur:28,shadowY:12}),
            avatar("event_avatar","Event Avatar","event.actor_avatar",template==="compact"?14:18,template==="compact"?15:24,template==="compact"?64:def.mode==="alert"?88:68,template==="compact"?16:22,12,{glowColor:accent,glowBlur:6}),
            text("event_source","Event Quelle","TIKTOK LIVE · "+title,template==="compact"?94:126,template==="compact"?13:20,width-(template==="compact"?112:150),16,8,accent,"left",900),
            text("event_actor","Event Text",message,template==="compact"?94:126,template==="compact"?31:44,width-(template==="compact"?112:150),def.mode==="alert"?34:28,template==="compact"?15:def.mode==="alert"?21:17,"#f4f8ff","left",850,13,{glowColor:template==="neon"?accent:"#148cff",glowBlur:template==="neon"?8:0}),
            text("event_sub","Event Subtext",sub,template==="compact"?94:126,template==="compact"?62:def.mode==="alert"?91:77,width-(template==="compact"?112:150),18,8,"rgba(176,207,232,.68)","left",650)
        ]};
    }

    if (def.mode === "goal_alert") {
        const accent = template === "neon" ? "#ec3cff" : template === "wide" ? "#20d4e6" : "#148cff";
        return {...common,canvas:{width:640,height:166,background:"transparent"},elements:[
            shape("bg","Goal Alert Hintergrund",4,4,632,158,template==="neon"?"rgba(12,7,24,.96)":"rgba(6,17,31,.97)",24,accent,1,0,{glowColor:accent,glowBlur:template==="neon"?24:9}),
            text("badge","Goal Badge","ZIEL ERREICHT",28,24,584,20,10,accent,"center",900,12,{glowColor:accent,glowBlur:8}),
            text("headline","Headline","GESCHAFFT!",28,51,584,42,30,"#f4f8ff","center",900,13),
            counter("counter","Zielstand","{{current}} / {{target}}",28,97,584,28,18,"#dceeff","center",800,13),
            text("message","Nachricht","Danke an die ganze Community!",28,128,584,18,9,"rgba(176,207,232,.68)","center",650,13)
        ]};
    }

    const currentFormat=isGoal?"{{current}} / {{target}}":"{{current}}";
    const subText=isGoal?"{{percent}}% erreicht · noch {{remaining}}":"{{status}} · "+sourceText;

    if(template==="minimal") return {...common,canvas:{width:600,height:isGoal?96:82,background:"transparent"},elements:[
        text("title","Titel",label,8,10,300,23,15,"#f4f8ff","left",700),
        counter("counter","Wert",currentFormat,315,8,277,29,19,"#f4f8ff","right",700),
        ...(isGoal?[progress("progress",8,58,584,4,"#f4f8ff","rgba(255,255,255,.15)",999),text("sub","Status",subText,8,68,584,16,8,"rgba(244,248,255,.55)","right",600)]:[text("sub","Status",subText,8,52,584,16,8,"rgba(244,248,255,.55)","right",600)])
    ]};

    if(template==="neon") return {...common,canvas:{width:620,height:isGoal?132:112,background:"transparent"},elements:[
        shape("bg","Neon Hintergrund",4,4,612,isGoal?124:104,"rgba(12,7,24,.95)",22,"#ec3cff",1,0,{glowColor:"#ec3cff",glowBlur:22}),
        text("source","Datenquelle",sourceText,26,17,260,18,8,"#ff8fff","left",900,10,{glowColor:"#ec3cff",glowBlur:8}),
        text("title","Titel",short,26,38,280,24,16,"#ffffff","left",900),
        counter("counter","Wert",currentFormat,300,30,290,34,25,"#ffffff","right",900,12,{glowColor:"#ec3cff",glowBlur:10}),
        ...(isGoal?[progress("progress",26,88,564,11,"#ec3cff","rgba(255,255,255,.1)",999,12,{glowColor:"#ec3cff",glowBlur:14}),text("sub","Status",subText,26,104,564,15,8,"rgba(255,255,255,.58)","right",650)]:[text("sub","Status",subText,26,76,564,16,8,"rgba(255,255,255,.58)","right",650)])
    ]};

    if(template==="glass") return {...common,canvas:{width:610,height:isGoal?132:112,background:"transparent"},elements:[
        shape("bg","Glass Hintergrund",4,4,602,isGoal?124:104,"rgba(13,34,52,.68)",24,"rgba(96,197,255,.3)",1,0,{glowColor:"#27d0ff",glowBlur:7}),
        avatar("avatar","TikTok Profilbild","tiktok.avatar",20,18,isGoal?88:72,20,12,{glowColor:"#27d0ff",glowBlur:7}),
        text("title","Titel",label,126,22,230,28,18,"#f6fbff","left",800),
        counter("counter","Wert",currentFormat,344,20,240,30,19,"#f6fbff","right",850),
        ...(isGoal?[progress("progress",126,82,458,12,"#27d0ff","rgba(255,255,255,.12)",999),text("sub","Status",subText,126,100,458,15,8,"rgba(205,235,252,.68)","right",650)]:[text("sub","Status",subText,126,62,458,18,8,"rgba(205,235,252,.68)","left",650)])
    ]};

    if(template==="compact") return {...common,canvas:{width:430,height:92,background:"transparent"},elements:[
        shape("bg","Hintergrund",2,2,426,88,"rgba(6,17,31,.96)",18,"rgba(90,174,255,.24)",1),
        avatar("avatar","TikTok Profilbild","tiktok.avatar",13,13,66,16),
        text("title","Titel",short,94,12,220,16,8,"#78baff","left",900),
        counter("counter","Wert",currentFormat,94,29,310,25,16,"#f4f8ff","left",850),
        ...(isGoal?[progress("progress",94,64,310,8,"#5aaeff","rgba(255,255,255,.11)",999)]:[text("sub","Status",subText,94,61,310,15,7,"rgba(244,248,255,.5)","left",650)])
    ]};

    if(template==="wide") return {...common,canvas:{width:800,height:112,background:"transparent"},elements:[
        shape("bg","Hintergrund",2,2,796,108,"rgba(6,17,31,.96)",18,"rgba(32,212,230,.22)",1),
        text("title","Titel",short,24,17,210,18,9,"#20d4e6","left",900),
        counter("counter","Wert","{{current}}",224,14,210,38,30,"#f4f8ff","left",900),
        text("source","Datenquelle",isGoal?"von {{target}} · "+sourceText:sourceText,442,26,210,18,9,"rgba(244,248,255,.52)","left",650),
        ...(isGoal?[counter("percent","Prozent","{{percent}}%",650,17,120,28,18,"#20d4e6","right",850),progress("progress",24,72,746,9,"#20d4e6","rgba(255,255,255,.1)",999),text("sub","Status","Noch {{remaining}} bis zum Ziel",24,87,746,14,8,"rgba(244,248,255,.46)","right",650)]:[text("sub","Status",subText,650,72,120,16,8,"rgba(244,248,255,.46)","right",650)])
    ]};

    return {...common,canvas:{width:620,height:isGoal?132:112,background:"transparent"},elements:[
        shape("bg","CFS Hintergrund",3,3,614,isGoal?126:106,"rgba(6,17,31,.97)",22,"rgba(20,140,255,.32)",1,0,{glowColor:"#148cff",glowBlur:6}),
        avatar("avatar","TikTok Profilbild","tiktok.avatar",18,18,isGoal?90:72,22,12,{glowColor:"#148cff",glowBlur:6}),
        text("source","CFS Label","CFS_ZOCKT · "+sourceText,126,17,300,16,8,"#4eb7ff","left",900),
        text("title","Titel",label,126,35,240,28,19,"#f4f8ff","left",850),
        counter("counter","Wert",currentFormat,350,35,244,29,19,"#f4f8ff","right",850),
        ...(isGoal?[progress("progress",126,78,468,12,"#148cff","rgba(255,255,255,.11)",999),text("sub","Status",subText,126,98,468,16,9,"rgba(176,207,232,.68)","right",650)]:[text("sub","Status",subText,126,76,468,17,8,"rgba(176,207,232,.62)","right",650)])
    ]};
}

function followerGoalTemplateConfig(templateKey = "cfs-standard") {
    return studioWidgetTemplateConfig("follower_goal", templateKey);
}


const WIDGET_STUDIO_OUTPUT_PROFILES = Object.freeze({
    obs: {
        key: "obs",
        label: "OBS Widget",
        width: null,
        height: null,
        anchor: "top-left",
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        safeArea: false
    },
    tiktok_vertical: {
        key: "tiktok_vertical",
        label: "TikTok Vertical",
        width: 1080,
        height: 1920,
        anchor: "top-center",
        offsetX: 0,
        offsetY: 180,
        scale: 1,
        safeArea: true
    },
    landscape: {
        key: "landscape",
        label: "Landscape 16:9",
        width: 1920,
        height: 1080,
        anchor: "bottom-center",
        offsetX: 0,
        offsetY: -90,
        scale: 1,
        safeArea: true
    }
});

const WIDGET_STUDIO_OUTPUT_ANCHORS = new Set([
    "top-left","top-center","top-right",
    "center-left","center","center-right",
    "bottom-left","bottom-center","bottom-right"
]);

function studioWidgetOutputDefaults(profileKey) {
    const profile = WIDGET_STUDIO_OUTPUT_PROFILES[profileKey] || WIDGET_STUDIO_OUTPUT_PROFILES.obs;
    return {
        enabled: true,
        anchor: profile.anchor,
        offsetX: profile.offsetX,
        offsetY: profile.offsetY,
        scale: profile.scale,
        safeArea: profile.safeArea
    };
}

function sanitizeStudioWidgetOutput(input, profileKey) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const defaults = studioWidgetOutputDefaults(profileKey);
    return {
        enabled: source.enabled !== false,
        anchor: WIDGET_STUDIO_OUTPUT_ANCHORS.has(String(source.anchor || ""))
            ? String(source.anchor)
            : defaults.anchor,
        offsetX: Math.round(studioClamp(source.offsetX,-4000,4000,defaults.offsetX)),
        offsetY: Math.round(studioClamp(source.offsetY,-4000,4000,defaults.offsetY)),
        scale: Math.round(studioClamp(source.scale,0.25,3,defaults.scale)*100)/100,
        safeArea: profileKey === "obs" ? false : source.safeArea !== false
    };
}

function studioWidgetOutputUrls(publicToken) {
    const token = encodeURIComponent(publicToken);
    return {
        obs: APP_BASE_URL + "/widgets/studio.html#token=" + token,
        tiktok_vertical: APP_BASE_URL + "/widgets/output.html#token=" + token + "&profile=tiktok_vertical",
        landscape: APP_BASE_URL + "/widgets/output.html#token=" + token + "&profile=landscape"
    };
}

async function studioCreatorIdentity(creatorId) {
    const result = await pool.query(
        `
        SELECT
            c.display_name,
            c.plan,
            c.status,
            c.created_at,
            t.connected AS tiktok_connected,
            t.display_name AS tiktok_display_name,
            t.avatar_url,
            t.follower_count,
            t.likes_count,
            t.updated_at AS tiktok_updated_at,
            beta.status AS beta_status
        FROM creator_accounts c
        LEFT JOIN tiktok_connections t
          ON t.creator_id = c.id
        LEFT JOIN creator_beta_testers beta
          ON beta.creator_id = c.id
        WHERE c.id = $1
        LIMIT 1
        `,
        [creatorId]
    );

    const row = result.rows[0];
    if (!row) return null;
    const access=await creatorAccessProfile({id:creatorId,plan:row.plan,status:row.status,display_name:row.display_name});
    const baseEntitlements=access.base_entitlements;
    const entitlements=access.entitlements;

    return {
        display_name: studioText(row.display_name,120,"Creator"),
        plan: normalizePlan(row.plan),
        effective_plan: access.effective_plan,
        status: row.status || "active",
        created_at: row.created_at || null,
        beta: {
            status: row.beta_status || "none",
            active: row.beta_status === "active"
        },
        profile: {
            connected: Boolean(row.tiktok_connected),
            display_name: studioText(row.tiktok_display_name,120,""),
            avatar_url: studioText(row.avatar_url,2000,""),
            followers: Number(row.follower_count || 0),
            likes_total: Number(row.likes_count || 0),
            updated_at: row.tiktok_updated_at || null
        },
        features: {
            widget_studio:Boolean(entitlements.widget_studio),launcher:Boolean(entitlements.launcher),scene_studio:Boolean(entitlements.scene_studio),live_bridge:Boolean(entitlements.live_bridge),live_widgets:Boolean(entitlements.live_widgets),alerts:Boolean(entitlements.alerts),auto_thanks:Boolean(entitlements.auto_thanks),local_output:Boolean(entitlements.local_output),stream_deck:Boolean(entitlements.stream_deck),games:Boolean(entitlements.games),cut_studio:Boolean(entitlements.cut_studio),audio_studio:Boolean(entitlements.audio_studio),obs:Boolean(entitlements.obs),custom_branding:Boolean(entitlements.custom_branding),max_widgets:Number(entitlements.max_widgets||0),max_scenes:Number(entitlements.max_scenes||0),max_stream_deck_buttons:Number(entitlements.max_stream_deck_buttons||0),max_active_devices:Number(entitlements.max_active_devices||0),max_cut_projects:Number(entitlements.max_cut_projects||0),max_cut_clips_per_project:Number(entitlements.max_cut_clips_per_project||0),max_game_rules:Number(entitlements.max_game_rules||0),max_pending_cut_jobs:Number(entitlements.max_pending_cut_jobs||0)
        },
        entitlements,base_entitlements:baseEntitlements,access_source:access.access_source||"plan",subscription:access.subscription
    };
}


function sanitizeStudioWidgetConfig(input, widgetTypeHint = null) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const candidate = String(widgetTypeHint || source.widgetType || "follower_goal");
    const def = studioWidgetDefinition(candidate);
    const elements = Array.isArray(source.elements) ? source.elements.slice(0, 80) : [];
    const metricOptions = Array.isArray(def.metric_options) ? def.metric_options : [];
    const requestedMetric = String(source.data?.metric || def.metric || "");
    const metric = metricOptions.length && metricOptions.includes(requestedMetric)
        ? requestedMetric
        : String(def.metric || requestedMetric || "");
    return {
        version: 6,
        widgetType: def.key,
        data: {
            metric,
            eventType: String(def.event_type || "")
        },
        canvas: {
            width: Math.round(studioClamp(source.canvas?.width,120,1920,600)),
            height: Math.round(studioClamp(source.canvas?.height,60,1080,120)),
            background: studioColor(source.canvas?.background,"transparent")
        },
        settings: {
            goal: Math.round(studioClamp(source.settings?.goal,1,1000000000,Number(def.default_goal || 1000))),
            alertDurationMs: Math.round(studioClamp(source.settings?.alertDurationMs,1000,20000,Number(def.default_duration_ms || 4500))),
            latestTimeoutMs: Math.round(studioClamp(source.settings?.latestTimeoutMs,0,3600000,0)),
            offlineBehavior: ["hold","zero","hide"].includes(String(source.settings?.offlineBehavior || ""))
                ? String(source.settings.offlineBehavior)
                : "hold"
        },
        outputs: {
            obs: sanitizeStudioWidgetOutput(source.outputs?.obs, "obs"),
            tiktok_vertical: sanitizeStudioWidgetOutput(source.outputs?.tiktok_vertical, "tiktok_vertical"),
            landscape: sanitizeStudioWidgetOutput(source.outputs?.landscape, "landscape")
        },
        elements: elements.map((element,index)=>sanitizeStudioElement(element,index))
    };
}


function studioWidgetName(
    value,
    fallback = "Mein Follower Goal"
) {

    return studioText(
        value,
        80,
        fallback
    );

}


function createStudioWidgetToken() {

    return crypto
        .randomBytes(24)
        .toString("hex");

}


function validStudioWidgetToken(
    value
) {

    return /^[a-f0-9]{48}$/i.test(
        String(value || "")
    );

}


function validStudioWidgetId(
    value
) {

    return /^[0-9a-f-]{36}$/i.test(
        String(value || "")
    );

}


function studioWidgetSourceUrl(
    publicToken
) {

    return (
        APP_BASE_URL +
        "/widgets/studio.html#token=" +
        encodeURIComponent(publicToken)
    );

}


function studioBridgeToken() {
    return "cfsb_" + crypto.randomBytes(WIDGET_BRIDGE_TOKEN_BYTES).toString("base64url");
}

function studioBridgeTokenFromRequest(req) {
    const auth = String(req.get("Authorization") || "").trim();
    if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
    return String(req.get("X-CFS-Bridge-Key") || "").trim();
}

function publicStudioBridgeRow(row) {
    if (!row) return null;
    const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
    const online = row.status === "active" && Boolean(lastSeen) && Date.now() - lastSeen <= WIDGET_BRIDGE_HEARTBEAT_STALE_MS;
    const capabilities = row.capabilities && typeof row.capabilities === "object" && !Array.isArray(row.capabilities) ? row.capabilities : {};
    return {
        id: String(row.id || ""),
        label: studioText(row.label, 80, "Creator Suite Launcher"),
        token_prefix: studioText(row.token_prefix, 24, ""),
        status: row.status || "active",
        auth_method: studioText(row.auth_method, 40, "legacy_key"),
        device_link_id: studioText(row.device_link_id, 80, ""),
        online,
        client_version: studioText(row.client_version, 80, ""),
        machine_name: studioText(row.machine_name, 120, ""),
        capabilities,
        last_seen_at: row.last_seen_at || null,
        last_connected_at: row.last_connected_at || null,
        created_at: row.created_at || null,
        revoked_at: row.revoked_at || null
    };
}

async function listStudioBridges(creatorId, includeRevoked = false) {
    const result = await pool.query(
        `SELECT * FROM creator_live_bridges
         WHERE creator_id = $1 ${includeRevoked ? "" : "AND status = 'active'"}
         ORDER BY created_at DESC
         LIMIT 10`,
        [creatorId]
    );
    return result.rows.map(publicStudioBridgeRow).filter(Boolean);
}

async function getStudioBridgeStatus(creatorId) {
    const result = await pool.query(
        `SELECT * FROM creator_live_bridges
         WHERE creator_id = $1 AND status = 'active'
         ORDER BY last_seen_at DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        [creatorId]
    );
    const bridge = publicStudioBridgeRow(result.rows[0]);
    if (!bridge) {
        return {
            configured: false,
            online: false,
            id: null,
            label: "Creator Suite Launcher",
            token_prefix: "",
            client_version: "",
            machine_name: "",
            capabilities: {},
            last_seen_at: null,
            last_connected_at: null
        };
    }
    return { configured: true, ...bridge };
}

async function createStudioBridgeKey(creatorId, label = "Creator Suite Launcher", { revokeExisting = true, authMethod = "legacy_key", deviceLinkId = null, tokenHash = "", tokenPrefix = "" } = {}) {
    const rawToken = tokenHash ? "" : studioBridgeToken();
    const resolvedTokenHash = tokenHash || hashValue(rawToken);
    const resolvedTokenPrefix = tokenPrefix || rawToken.slice(0, 13);
    const id = crypto.randomUUID();
    const safeLabel = studioText(label, 80, "Creator Suite Launcher");
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        if (revokeExisting) {
            await client.query(
                `UPDATE creator_live_bridges
                 SET status='revoked', revoked_at=NOW(), updated_at=NOW()
                 WHERE creator_id=$1 AND status='active'`,
                [creatorId]
            );
        }
        const result = await client.query(
            `INSERT INTO creator_live_bridges (
                id, creator_id, label, token_hash, token_prefix, status,
                auth_method, device_link_id, created_at, updated_at
             ) VALUES ($1,$2,$3,$4,$5,'active',$6,$7,NOW(),NOW())
             RETURNING *`,
            [id, creatorId, safeLabel, resolvedTokenHash, resolvedTokenPrefix, authMethod, deviceLinkId]
        );
        await client.query("COMMIT");
        return { bridge: publicStudioBridgeRow(result.rows[0]), token: rawToken };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function revokeStudioBridgeKey(creatorId, bridgeId) {
    const result = await pool.query(
        `UPDATE creator_live_bridges
         SET status='revoked', revoked_at=NOW(), updated_at=NOW()
         WHERE creator_id=$1 AND id=$2 AND status='active'
         RETURNING id`,
        [creatorId, bridgeId]
    );
    return Boolean(result.rows[0]);
}

async function getStudioBridgeByToken(rawToken) {
    if (!rawToken || !String(rawToken).startsWith("cfsb_") || String(rawToken).length < 30) return null;
    const result = await pool.query(
        `SELECT * FROM creator_live_bridges
         WHERE token_hash=$1 AND status='active'
         LIMIT 1`,
        [hashValue(rawToken)]
    );
    return result.rows[0] || null;
}


const LAUNCHER_DEVICE_LINK_TTL_MS = 10 * 60 * 1000;
const LAUNCHER_DEVICE_POLL_AFTER_MS = 2500;
const DEVICE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function launcherDeviceSecret() {
    return "cfsd_" + crypto.randomBytes(24).toString("base64url");
}

function launcherUserCode() {
    const bytes = crypto.randomBytes(8);
    let out = "";
    for (let i = 0; i < 8; i += 1) {
        out += DEVICE_CODE_ALPHABET[bytes[i] % DEVICE_CODE_ALPHABET.length];
    }
    return "CFS-" + out.slice(0,4) + "-" + out.slice(4);
}

async function cleanupLauncherDeviceLinks() {
    await pool.query(
        `
        UPDATE creator_launcher_device_links
        SET status='expired', updated_at=NOW()
        WHERE status='pending'
          AND expires_at <= NOW()
        `
    );
    await pool.query(
        `
        DELETE FROM creator_launcher_device_links
        WHERE created_at < NOW() - INTERVAL '7 days'
          AND status IN ('expired','consumed','revoked')
        `
    );
}

async function createLauncherDeviceLink(input = {}) {
    await cleanupLauncherDeviceLinks();

    const id = crypto.randomUUID();
    const deviceSecret = launcherDeviceSecret();
    const bridgeToken = studioBridgeToken();
    const machineName = studioText(input.machine_name, 120, "Creator PC");
    const clientVersion = studioText(input.client_version, 80, "");
    const expiresAt = new Date(Date.now() + LAUNCHER_DEVICE_LINK_TTL_MS);

    let userCode = "";
    for (let attempt = 0; attempt < 6; attempt += 1) {
        userCode = launcherUserCode();
        const exists = await pool.query(
            `SELECT 1 FROM creator_launcher_device_links WHERE user_code=$1 LIMIT 1`,
            [userCode]
        );
        if (!exists.rows[0]) break;
        userCode = "";
    }
    if (!userCode) throw new Error("Device-Code konnte nicht erzeugt werden.");

    await pool.query(
        `
        INSERT INTO creator_launcher_device_links (
            id,user_code,device_secret_hash,bridge_token_hash,bridge_token_prefix,
            status,machine_name,client_version,expires_at,created_at,updated_at
        )
        VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,NOW(),NOW())
        `,
        [
            id,
            userCode,
            hashValue(deviceSecret),
            hashValue(bridgeToken),
            bridgeToken.slice(0,13),
            machineName,
            clientVersion,
            expiresAt
        ]
    );

    return {
        device_link_id:id,
        device_secret:deviceSecret,
        bridge_token:bridgeToken,
        user_code:userCode,
        verification_url:
            APP_BASE_URL + "/pages/launcher-connect.html?code=" + encodeURIComponent(userCode),
        expires_at:expiresAt.toISOString(),
        poll_after_ms:LAUNCHER_DEVICE_POLL_AFTER_MS,
        machine_name:machineName,
        client_version:clientVersion
    };
}

async function getLauncherDeviceLinkBySecret(id, secret) {
    if (!id || !secret || !String(secret).startsWith("cfsd_")) return null;
    const result = await pool.query(
        `
        SELECT *
        FROM creator_launcher_device_links
        WHERE id=$1
          AND device_secret_hash=$2
        LIMIT 1
        `,
        [String(id),hashValue(secret)]
    );
    return result.rows[0] || null;
}

async function approveLauncherDeviceLink(creatorId, userCode) {
    await cleanupLauncherDeviceLinks();
    const access=await creatorAccessProfile(creatorId);
    const activeResult=await pool.query(`SELECT COUNT(*)::int AS count FROM creator_live_bridges WHERE creator_id=$1 AND status='active'`,[creatorId]);
    if(Number(activeResult.rows[0]?.count||0)>=Number(access.entitlements.max_active_devices||1)){const error=new Error(`Dein Zugriff erlaubt maximal ${Number(access.entitlements.max_active_devices||1)} aktive Launcher-Geräte.`);error.code="device_limit_reached";throw error;}
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const linkResult = await client.query(
            `
            SELECT *
            FROM creator_launcher_device_links
            WHERE user_code=$1
            FOR UPDATE
            `,
            [studioText(userCode, 40, "").toUpperCase()]
        );
        const link = linkResult.rows[0];
        if (!link) {
            const error = new Error("Dieser Geräte-Code ist nicht gültig.");
            error.code = "device_code_invalid";
            throw error;
        }
        if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) {
            await client.query(
                `UPDATE creator_launcher_device_links SET status='expired',updated_at=NOW() WHERE id=$1`,
                [link.id]
            );
            const error = new Error("Dieser Geräte-Code ist abgelaufen.");
            error.code = "device_code_expired";
            throw error;
        }
        if (link.status !== "pending") {
            const error = new Error(
                link.status === "approved" || link.status === "consumed"
                    ? "Dieser Geräte-Code wurde bereits bestätigt."
                    : "Dieser Geräte-Code kann nicht mehr verwendet werden."
            );
            error.code = "device_code_used";
            throw error;
        }

        const bridgeId = crypto.randomUUID();
        const label = studioText(link.machine_name, 80, "Creator Suite Launcher");

        await client.query(
            `
            INSERT INTO creator_live_bridges (
                id,creator_id,label,token_hash,token_prefix,status,
                client_version,machine_name,capabilities,
                auth_method,device_link_id,created_at,updated_at
            )
            VALUES ($1,$2,$3,$4,$5,'active',$6,$7,'{}'::jsonb,'device_link',$8,NOW(),NOW())
            `,
            [
                bridgeId,
                creatorId,
                label,
                link.bridge_token_hash,
                link.bridge_token_prefix,
                studioText(link.client_version,80,""),
                studioText(link.machine_name,120,""),
                link.id
            ]
        );

        await client.query(
            `
            UPDATE creator_launcher_device_links
            SET creator_id=$2,
                bridge_id=$3,
                status='approved',
                approved_at=NOW(),
                updated_at=NOW()
            WHERE id=$1
            `,
            [link.id,creatorId,bridgeId]
        );

        await client.query("COMMIT");
        return {
            ok:true,
            device_link_id:String(link.id),
            bridge_id:bridgeId,
            machine_name:studioText(link.machine_name,120,"Creator PC"),
            client_version:studioText(link.client_version,80,""),
            user_code:studioText(link.user_code,40,"")
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function inspectLauncherDeviceLink(userCode) {
    await cleanupLauncherDeviceLinks();
    const result = await pool.query(
        `
        SELECT id,user_code,status,machine_name,client_version,created_at,expires_at
        FROM creator_launcher_device_links
        WHERE user_code=$1
        LIMIT 1
        `,
        [studioText(userCode,40,"").toUpperCase()]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
        device_link_id:String(row.id),
        user_code:studioText(row.user_code,40,""),
        status:row.status || "pending",
        machine_name:studioText(row.machine_name,120,"Creator PC"),
        client_version:studioText(row.client_version,80,""),
        created_at:row.created_at || null,
        expires_at:row.expires_at || null
    };
}

async function listCreatorLauncherDevices(creatorId) {
    const result = await pool.query(
        `
        SELECT *
        FROM creator_live_bridges
        WHERE creator_id=$1
        ORDER BY
            CASE WHEN status='active' THEN 0 ELSE 1 END,
            last_seen_at DESC NULLS LAST,
            created_at DESC
        LIMIT 30
        `,
        [creatorId]
    );
    return result.rows.map(publicStudioBridgeRow).filter(Boolean);
}

async function revokeCurrentStudioBridge(bridgeId, creatorId) {
    const result = await pool.query(
        `
        UPDATE creator_live_bridges
        SET status='revoked',revoked_at=NOW(),updated_at=NOW()
        WHERE id=$1 AND creator_id=$2 AND status='active'
        RETURNING id
        `,
        [bridgeId,creatorId]
    );
    if (result.rows[0]) {
        await pool.query(
            `
            UPDATE creator_launcher_device_links
            SET status='revoked',revoked_at=NOW(),updated_at=NOW()
            WHERE bridge_id=$1
            `,
            [bridgeId]
        );
    }
    return Boolean(result.rows[0]);
}



const BETA_FEEDBACK_KINDS=new Set(["bug","idea","ux","other"]);
const BETA_FEEDBACK_SEVERITIES=new Set(["low","medium","high","critical"]);
const BETA_FEEDBACK_CATEGORIES=new Set(["launcher","live","widgets","scenes","obs","tiktok","games","cut_studio","account","other"]);
const BETA_FEEDBACK_STATUSES=new Set(["new","reviewing","fixed","closed"]);

function betaText(value,max=200,fallback=""){
    const text=String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").trim();
    return (text||fallback).slice(0,max);
}
function sanitizeBetaDiagnostics(input={}){
    const source=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
    const outputGate=source.output_gate&&typeof source.output_gate==="object"?source.output_gate:{};
    const preflight=source.preflight&&typeof source.preflight==="object"?source.preflight:{};
    return {
        launcher_version:betaText(source.launcher_version,80,""),
        platform:betaText(source.platform,80,""),
        provider:betaText(source.provider,80,""),
        bridge_connected:Boolean(source.bridge_connected),
        live_active:Boolean(source.live_active),
        local_output_running:Boolean(source.local_output_running),
        local_output_ready:Boolean(source.local_output_ready),
        scene_id:betaText(source.scene_id,120,""),
        scene_name:betaText(source.scene_name,120,""),
        spool_pending:Math.max(0,Number(source.spool_pending||0)),
        preflight:{
            ok:Boolean(preflight.ok),
            blockers:Array.isArray(preflight.blockers)?preflight.blockers.slice(0,20).map(item=>({
                key:betaText(item?.key,80,""),label:betaText(item?.label,120,""),detail:betaText(item?.detail,300,"")
            })):[]
        },
        output_gate:{
            pass:Math.max(0,Number(outputGate.pass||0)),
            fail:Math.max(0,Number(outputGate.fail||0)),
            untested:Math.max(0,Number(outputGate.untested||0)),
            total:Math.max(0,Number(outputGate.total||0)),
            complete:Boolean(outputGate.complete)
        }
    };
}
async function requireActiveBetaBridge(bridge){
    const beta=await getCreatorBetaState(bridge.creator_id);
    if(!beta.active){const error=new Error("Beta-Testfunktionen sind für diesen Creator nicht aktiv.");error.code="beta_not_active";throw error}
    return beta;
}
async function activeBetaSessionForBridge(creatorId,bridgeId){
    const result=await pool.query(`SELECT * FROM creator_beta_sessions WHERE creator_id=$1 AND bridge_id=$2 AND status='active' ORDER BY started_at DESC LIMIT 1`,[creatorId,bridgeId]);
    return result.rows[0]||null;
}
function publicBetaSession(row){
    if(!row)return null;
    return {id:String(row.id),creator_id:String(row.creator_id),bridge_id:row.bridge_id?String(row.bridge_id):null,label:row.label||"Beta Test",launcher_version:row.launcher_version||"",platform:row.platform||"",provider:row.provider||"",status:row.status||"active",started_at:row.started_at||null,ended_at:row.ended_at||null,duration_seconds:Number(row.duration_seconds||0),output_gate:row.output_gate||{},diagnostics:row.diagnostics||{},result_summary:row.result_summary||""};
}
function publicBetaFeedback(row){
    if(!row)return null;
    return {id:String(row.id),creator_id:String(row.creator_id),bridge_id:row.bridge_id?String(row.bridge_id):null,session_id:row.session_id?String(row.session_id):null,kind:row.kind||"bug",severity:row.severity||"medium",category:row.category||"launcher",title:row.title||"",description:row.description||"",repro_steps:row.repro_steps||"",expected:row.expected||"",actual:row.actual||"",launcher_version:row.launcher_version||"",platform:row.platform||"",provider:row.provider||"",diagnostics:row.diagnostics||{},status:row.status||"new",admin_notes:row.admin_notes||"",created_at:row.created_at||null,updated_at:row.updated_at||null};
}

async function requireStudioBridge(req, res, next) {
    try {
        const rawToken = studioBridgeTokenFromRequest(req);
        const bridge = await getStudioBridgeByToken(rawToken);
        if (!bridge) {
            return res.status(401).json({ ok:false, error:"Bridge-Schlüssel ungültig oder widerrufen." });
        }
        req.studioBridge = bridge;
        next();
    } catch (error) {
        console.error("Widget Studio Bridge Auth Fehler:", error);
        return res.status(500).json({ ok:false, error:"Bridge konnte nicht authentifiziert werden." });
    }
}

async function touchStudioBridge(bridgeId, creatorId, input = {}) {
    const machineName = studioText(input.machine_name, 120, "");
    const clientVersion = studioText(input.client_version, 80, "");
    const capabilities = input.capabilities && typeof input.capabilities === "object" && !Array.isArray(input.capabilities) ? input.capabilities : {};
    const hasLiveFlag = typeof input.live_session_active === "boolean";
    const liveActive = input.live_session_active === true;
    await pool.query(
        `UPDATE creator_live_bridges SET
            machine_name = CASE WHEN $3 <> '' THEN $3 ELSE machine_name END,
            client_version = CASE WHEN $4 <> '' THEN $4 ELSE client_version END,
            capabilities = CASE WHEN $5::jsonb <> '{}'::jsonb THEN $5::jsonb ELSE capabilities END,
            last_seen_at=NOW(),
            last_connected_at=COALESCE(last_connected_at,NOW()),
            updated_at=NOW()
         WHERE id=$1 AND creator_id=$2 AND status='active'`,
        [bridgeId, creatorId, machineName, clientVersion, JSON.stringify(capabilities)]
    );
    await pool.query(
        `INSERT INTO creator_live_state (creator_id, provider, connected, bridge_heartbeat_at, updated_at)
         VALUES ($1,'launcher_bridge',$3,NOW(),NOW())
         ON CONFLICT (creator_id) DO UPDATE SET
            bridge_heartbeat_at=NOW(),
            connected=CASE WHEN $2 THEN $3 ELSE creator_live_state.connected END,
            provider=CASE WHEN $2 AND $3 THEN 'launcher_bridge' ELSE creator_live_state.provider END`,
        [creatorId, hasLiveFlag, liveActive]
    );
}

function emptyStudioLiveState() {
    return {
        connected: false,
        provider: "none",
        session_id: null,
        likes: 0,
        viewers: 0,
        shares: 0,
        gifts_count: 0,
        gifts_value: 0,
        followers_gained: 0,
        started_at: null,
        last_event_at: null,
        bridge_heartbeat_at: null,
        updated_at: null,
        stale: true
    };
}

async function getStudioLiveState(creatorId) {
    const result = await pool.query(
        `SELECT * FROM creator_live_state WHERE creator_id = $1 LIMIT 1`,
        [creatorId]
    );
    const row = result.rows[0];
    if (!row) return emptyStudioLiveState();
    const provider = row.provider || "none";
    const updated = row.updated_at ? new Date(row.updated_at).getTime() : 0;
    const heartbeat = row.bridge_heartbeat_at ? new Date(row.bridge_heartbeat_at).getTime() : 0;
    const freshness = provider === "launcher_bridge" ? heartbeat : updated;
    const stale = !freshness || Date.now() - freshness > WIDGET_BRIDGE_HEARTBEAT_STALE_MS;
    return {
        connected: Boolean(row.connected) && !stale,
        provider,
        session_id: row.session_id || null,
        likes: Number(row.likes || 0),
        viewers: Number(row.viewers || 0),
        shares: Number(row.shares || 0),
        gifts_count: Number(row.gifts_count || 0),
        gifts_value: Number(row.gifts_value || 0),
        followers_gained: Number(row.followers_gained || 0),
        started_at: row.started_at || null,
        last_event_at: row.last_event_at || null,
        bridge_heartbeat_at: row.bridge_heartbeat_at || null,
        updated_at: row.updated_at || null,
        stale
    };
}

async function studioDataSnapshot(creatorId) {
    const [profile, live, bridge] = await Promise.all([
        getFollowerWidgetTikTokData(creatorId),
        getStudioLiveState(creatorId),
        getStudioBridgeStatus(creatorId)
    ]);
    return {
        profile: {
            connected: Boolean(profile.connected),
            display_name: profile.display_name || "",
            avatar_url: profile.avatar_url || "",
            followers: Number(profile.follower_count || 0),
            likes_total: Number(profile.likes_count || 0),
            updated_at: profile.updated_at || null
        },
        live,
        bridge
    };
}

function publicStudioLiveEventRow(row) {
    if (!row) return null;
    const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
    return {
        id: String(row.id || ""),
        session_id: row.session_id || null,
        provider: row.provider || "none",
        event_type: String(row.event_type || ""),
        actor_name: studioText(row.actor_name, 100, ""),
        actor_avatar: studioText(row.actor_avatar, 2000, ""),
        amount: Number(row.amount || 0),
        value: Number(row.event_value || 0),
        payload: {
            gift_name: studioText(payload.gift_name || payload.giftName, 120, ""),
            gift_id: studioText(payload.gift_id || payload.giftId, 120, ""),
            message: studioText(payload.message, 240, ""),
            repeat_count: Math.max(0, Math.round(Number(payload.repeat_count || payload.repeatCount || 0) || 0))
        },
        created_at: row.created_at || null
    };
}

async function getRecentStudioLiveEvents(creatorId, eventType = null, limit = 20, sessionId = null) {
    const safeLimit = Math.max(1, Math.min(50, Math.round(Number(limit) || 20)));
    const resolvedSessionId = sessionId || (await getStudioLiveState(creatorId)).session_id;
    if (!resolvedSessionId) return [];
    const params = [creatorId, resolvedSessionId];
    let where = `creator_id = $1 AND session_id = $2`;
    if (eventType) {
        params.push(String(eventType));
        where += ` AND event_type = $3`;
    }
    params.push(safeLimit);
    const limitParam = `$${params.length}`;
    const result = await pool.query(
        `SELECT * FROM creator_live_events WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ${limitParam}`,
        params
    );
    return result.rows.map(publicStudioLiveEventRow).filter(Boolean);
}

const WIDGET_STUDIO_INTERACTION_EVENT_TYPES = new Set(["follow","gift","share"]);
const WIDGET_STUDIO_EVENT_RETENTION_DAYS = 7;
const WIDGET_STUDIO_SESSION_RETENTION_DAYS = 90;

function studioInteractionDefaults(eventType) {
    if (eventType === "gift") return {enabled:false,cooldown_seconds:8,min_amount:1,template_text:"Danke {{actor}} für {{amount}}x {{gift}}!",output_kind:"launcher_tts"};
    if (eventType === "share") return {enabled:false,cooldown_seconds:20,min_amount:1,template_text:"Danke fürs Teilen, {{actor}}!",output_kind:"launcher_tts"};
    return {enabled:false,cooldown_seconds:20,min_amount:1,template_text:"Danke für deinen Follow, {{actor}}!",output_kind:"launcher_tts"};
}

function studioInteractionText(template, event) {
    const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
    return String(template || "")
        .replaceAll("{{actor}}", studioText(event?.actor_name,100,"Creator"))
        .replaceAll("{{gift}}", studioText(payload.gift_name,100,"Gift"))
        .replaceAll("{{amount}}", String(Math.max(0,Number(event?.amount||1))))
        .replaceAll("{{event}}", studioText(event?.event_type,40,"LIVE"))
        .slice(0,280);
}

async function listStudioInteractionRules(creatorId) {
    const result = await pool.query(`SELECT * FROM creator_interaction_rules WHERE creator_id=$1`, [creatorId]);
    const rows = new Map(result.rows.map(row => [row.event_type,row]));
    return ["follow","gift","share"].map(eventType => {
        const row = rows.get(eventType), defaults = studioInteractionDefaults(eventType);
        return {
            event_type:eventType,
            enabled:row ? Boolean(row.enabled) : defaults.enabled,
            cooldown_seconds:Number(row?.cooldown_seconds ?? defaults.cooldown_seconds),
            min_amount:Number(row?.min_amount ?? defaults.min_amount),
            template_text:row?.template_text || defaults.template_text,
            output_kind:row?.output_kind || defaults.output_kind,
            last_triggered_at:row?.last_triggered_at || null
        };
    });
}

async function saveStudioInteractionRule(creatorId, eventType, input={}) {
    if (!WIDGET_STUDIO_INTERACTION_EVENT_TYPES.has(eventType)) throw new Error("Unbekannter Interaction-Typ.");
    const defaults = studioInteractionDefaults(eventType);
    const enabled = input.enabled === true;
    const cooldown = Math.round(studioClamp(input.cooldown_seconds,0,3600,defaults.cooldown_seconds));
    const minAmount = Math.round(studioClamp(input.min_amount,1,1000000,defaults.min_amount));
    const template = studioText(input.template_text,280,defaults.template_text);
    const outputKind = "launcher_tts";
    const result = await pool.query(`
        INSERT INTO creator_interaction_rules (id,creator_id,event_type,enabled,cooldown_seconds,min_amount,template_text,output_kind,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
        ON CONFLICT (creator_id,event_type) DO UPDATE SET
            enabled=EXCLUDED.enabled,cooldown_seconds=EXCLUDED.cooldown_seconds,min_amount=EXCLUDED.min_amount,
            template_text=EXCLUDED.template_text,output_kind=EXCLUDED.output_kind,updated_at=NOW()
        RETURNING *`,
        [crypto.randomUUID(),creatorId,eventType,enabled,cooldown,minAmount,template,outputKind]
    );
    return result.rows[0];
}

async function processStudioInteractionEvent(creatorId, event) {
    if (!event || !WIDGET_STUDIO_INTERACTION_EVENT_TYPES.has(event.event_type)) return null;
    const ruleResult = await pool.query(`SELECT * FROM creator_interaction_rules WHERE creator_id=$1 AND event_type=$2 LIMIT 1`, [creatorId,event.event_type]);
    const rule = ruleResult.rows[0];
    if (!rule || !rule.enabled) return null;
    if (Number(event.amount||0) < Number(rule.min_amount||1)) return null;
    const last = rule.last_triggered_at ? new Date(rule.last_triggered_at).getTime() : 0;
    if (last && Date.now()-last < Number(rule.cooldown_seconds||0)*1000) return null;
    const text = studioInteractionText(rule.template_text,event);
    if (!text) return null;
    const id = crypto.randomUUID();
    await pool.query(
        `INSERT INTO creator_live_actions
            (id,creator_id,session_id,event_id,action_type,action_text,payload,status,attempts,expires_at,created_at)
         VALUES
            ($1,$2,$3,$4,$5,$6,$7::jsonb,'pending',0,NOW()+($8::int*INTERVAL '1 minute'),NOW())`,
        [id,creatorId,event.session_id||null,event.id||null,rule.output_kind||"launcher_tts",text,JSON.stringify({event_type:event.event_type,actor_name:event.actor_name||"",gift_name:event.payload?.gift_name||"",amount:Number(event.amount||1)}),ACTION_TTL_MINUTES]
    );
    await pool.query(`UPDATE creator_interaction_rules SET last_triggered_at=NOW(),updated_at=NOW() WHERE creator_id=$1 AND event_type=$2`,[creatorId,event.event_type]);
    return {id,action_type:rule.output_kind||"launcher_tts",text};
}

async function getStudioLiveSessions(creatorId, limit=8) {
    const safeLimit = Math.max(1,Math.min(30,Number(limit)||8));
    const result = await pool.query(`SELECT * FROM creator_live_sessions WHERE creator_id=$1 ORDER BY started_at DESC LIMIT ${safeLimit}`,[creatorId]);
    return result.rows.map(row=>({id:row.id,provider:row.provider,status:row.status,likes:Number(row.likes||0),viewers_peak:Number(row.viewers_peak||0),shares:Number(row.shares||0),gifts_count:Number(row.gifts_count||0),gifts_value:Number(row.gifts_value||0),followers_gained:Number(row.followers_gained||0),started_at:row.started_at,ended_at:row.ended_at,updated_at:row.updated_at}));
}

async function cleanupStudioLiveHistory(creatorId) {
    await Promise.all([
        pool.query(`DELETE FROM creator_live_events WHERE creator_id=$1 AND created_at < NOW() - INTERVAL '${WIDGET_STUDIO_EVENT_RETENTION_DAYS} days'`,[creatorId]),
        pool.query(`DELETE FROM creator_live_actions WHERE creator_id=$1 AND created_at < NOW() - INTERVAL '${WIDGET_STUDIO_EVENT_RETENTION_DAYS} days'`,[creatorId]),
        pool.query(`DELETE FROM creator_live_sessions WHERE creator_id=$1 AND started_at < NOW() - INTERVAL '${WIDGET_STUDIO_SESSION_RETENTION_DAYS} days'`,[creatorId])
    ]);
    await pool.query(`DELETE FROM creator_live_events WHERE creator_id=$1 AND id IN (SELECT id FROM creator_live_events WHERE creator_id=$1 ORDER BY created_at DESC OFFSET 5000)`,[creatorId]);
}

function publicStudioAction(row) {
    return {
        id:row.id,
        session_id:row.session_id||null,
        event_id:row.event_id||null,
        action_type:row.action_type,
        action_text:row.action_text,
        payload:row.payload||{},
        status:row.status,
        attempts:Number(row.attempts||0),
        lease_until:row.lease_until||null,
        expires_at:row.expires_at||null,
        last_error:row.last_error||null,
        created_at:row.created_at,
        delivered_at:row.delivered_at||null,
        acked_at:row.acked_at||null
    };
}

const WIDGET_STUDIO_LIVE_EVENT_TYPES = new Set([
    "live_start", "live_end", "follow", "like", "gift", "share", "viewer_update", "reset"
]);

async function applyStudioLiveEvent(creatorId, input = {}, provider = "simulator") {
    const type = String(input.event_type || "");
    if (!WIDGET_STUDIO_LIVE_EVENT_TYPES.has(type)) throw new Error("Unbekannter Live-Event-Typ.");
    const amount = Math.max(0, Math.round(Number(input.amount ?? 1) || 0));
    const value = Math.max(0, Number(input.value ?? 0) || 0);
    const actorName = studioText(input.actor_name, 100, "");
    const actorAvatar = studioImageSource(input.actor_avatar) || studioText(input.actor_avatar, 2000, "");
    const eventKey = studioText(input.event_key, 160, "") || null;
    const payload = input.payload && typeof input.payload === "object" && !Array.isArray(input.payload) ? input.payload : {};
    const client = await pool.connect();
    let insertedEvent = null;
    let sessionId = null;
    try {
        await client.query("BEGIN");
        const stateResult = await client.query(`SELECT * FROM creator_live_state WHERE creator_id=$1 FOR UPDATE`,[creatorId]);
        const previousState = stateResult.rows[0] || null;
        sessionId = previousState?.session_id || crypto.randomUUID();
        if (type === "live_start" || type === "reset") sessionId = crypto.randomUUID();

        const eventId = crypto.randomUUID();
        const eventInsert = await client.query(`INSERT INTO creator_live_events (id,creator_id,session_id,provider,event_key,event_type,actor_name,actor_avatar,amount,event_value,payload,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,NOW()) ON CONFLICT (creator_id,provider,event_key) WHERE event_key IS NOT NULL DO NOTHING RETURNING *`,
            [eventId,creatorId,sessionId,provider,eventKey,type,actorName||null,actorAvatar||null,amount,value,JSON.stringify(payload)]
        );
        if (eventKey && eventInsert.rowCount === 0) {
            await client.query("COMMIT");
            return getStudioLiveState(creatorId);
        }
        insertedEvent = eventInsert.rows[0] ? publicStudioLiveEventRow(eventInsert.rows[0]) : null;

        if (type === "live_start" || type === "reset") {
            if (previousState?.session_id && previousState.session_id !== sessionId) {
                await client.query(`UPDATE creator_live_sessions SET status='ended',ended_at=COALESCE(ended_at,NOW()),likes=$3,viewers_peak=GREATEST(viewers_peak,$4),shares=$5,gifts_count=$6,gifts_value=$7,followers_gained=$8,updated_at=NOW() WHERE creator_id=$1 AND id=$2 AND status='live'`,
                    [creatorId,previousState.session_id,Number(previousState.likes||0),Number(previousState.viewers||0),Number(previousState.shares||0),Number(previousState.gifts_count||0),Number(previousState.gifts_value||0),Number(previousState.followers_gained||0)]
                );
            }
            await client.query(`INSERT INTO creator_live_sessions (id,creator_id,provider,status,metadata,started_at,updated_at) VALUES ($1,$2,$3,'live',$4::jsonb,NOW(),NOW()) ON CONFLICT (id) DO UPDATE SET provider=EXCLUDED.provider,status='live',ended_at=NULL,metadata=EXCLUDED.metadata,updated_at=NOW()`,[sessionId,creatorId,provider,JSON.stringify(payload)]);
            await client.query(`INSERT INTO creator_live_state (creator_id,session_id,provider,connected,likes,viewers,shares,gifts_count,gifts_value,followers_gained,started_at,last_event_at,updated_at) VALUES ($1,$2,$3,TRUE,0,0,0,0,0,0,NOW(),NOW(),NOW()) ON CONFLICT (creator_id) DO UPDATE SET session_id=EXCLUDED.session_id,provider=EXCLUDED.provider,connected=TRUE,likes=0,viewers=0,shares=0,gifts_count=0,gifts_value=0,followers_gained=0,started_at=NOW(),last_event_at=NOW(),updated_at=NOW()`,[creatorId,sessionId,provider]);
        } else if (type === "live_end") {
            const current = previousState || {};
            await client.query(`INSERT INTO creator_live_state (creator_id,session_id,provider,connected,updated_at,last_event_at) VALUES ($1,$2,$3,FALSE,NOW(),NOW()) ON CONFLICT (creator_id) DO UPDATE SET connected=FALSE,provider=$3,last_event_at=NOW(),updated_at=NOW()`,[creatorId,sessionId,provider]);
            await client.query(`INSERT INTO creator_live_sessions (id,creator_id,provider,status,likes,viewers_peak,shares,gifts_count,gifts_value,followers_gained,started_at,ended_at,updated_at) VALUES ($1,$2,$3,'ended',$4,$5,$6,$7,$8,$9,COALESCE($10,NOW()),NOW(),NOW()) ON CONFLICT (id) DO UPDATE SET status='ended',likes=EXCLUDED.likes,viewers_peak=GREATEST(creator_live_sessions.viewers_peak,EXCLUDED.viewers_peak),shares=EXCLUDED.shares,gifts_count=EXCLUDED.gifts_count,gifts_value=EXCLUDED.gifts_value,followers_gained=EXCLUDED.followers_gained,ended_at=NOW(),updated_at=NOW()`,[sessionId,creatorId,provider,Number(current.likes||0),Number(current.viewers||0),Number(current.shares||0),Number(current.gifts_count||0),Number(current.gifts_value||0),Number(current.followers_gained||0),current.started_at||null]);
        } else {
            await client.query(`INSERT INTO creator_live_state (creator_id,session_id,provider,connected,started_at,updated_at) VALUES ($1,$2,$3,TRUE,NOW(),NOW()) ON CONFLICT (creator_id) DO NOTHING`,[creatorId,sessionId,provider]);
            await client.query(`INSERT INTO creator_live_sessions (id,creator_id,provider,status,started_at,updated_at) VALUES ($1,$2,$3,'live',NOW(),NOW()) ON CONFLICT (id) DO NOTHING`,[sessionId,creatorId,provider]);
            if (type === "like") await client.query(`UPDATE creator_live_state SET likes=likes+$2,connected=TRUE,provider=$3,bridge_heartbeat_at=CASE WHEN $3='launcher_bridge' THEN NOW() ELSE bridge_heartbeat_at END,last_event_at=NOW(),updated_at=NOW() WHERE creator_id=$1`,[creatorId,amount,provider]);
            if (type === "share") await client.query(`UPDATE creator_live_state SET shares=shares+$2,connected=TRUE,provider=$3,bridge_heartbeat_at=CASE WHEN $3='launcher_bridge' THEN NOW() ELSE bridge_heartbeat_at END,last_event_at=NOW(),updated_at=NOW() WHERE creator_id=$1`,[creatorId,amount,provider]);
            if (type === "gift") await client.query(`UPDATE creator_live_state SET gifts_count=gifts_count+$2,gifts_value=gifts_value+$3,connected=TRUE,provider=$4,bridge_heartbeat_at=CASE WHEN $4='launcher_bridge' THEN NOW() ELSE bridge_heartbeat_at END,last_event_at=NOW(),updated_at=NOW() WHERE creator_id=$1`,[creatorId,amount,value,provider]);
            if (type === "follow") await client.query(`UPDATE creator_live_state SET followers_gained=followers_gained+$2,connected=TRUE,provider=$3,bridge_heartbeat_at=CASE WHEN $3='launcher_bridge' THEN NOW() ELSE bridge_heartbeat_at END,last_event_at=NOW(),updated_at=NOW() WHERE creator_id=$1`,[creatorId,amount,provider]);
            if (type === "viewer_update") await client.query(`UPDATE creator_live_state SET viewers=$2,connected=TRUE,provider=$3,bridge_heartbeat_at=CASE WHEN $3='launcher_bridge' THEN NOW() ELSE bridge_heartbeat_at END,last_event_at=NOW(),updated_at=NOW() WHERE creator_id=$1`,[creatorId,amount,provider]);
            const after = await client.query(`SELECT * FROM creator_live_state WHERE creator_id=$1`,[creatorId]);
            const s = after.rows[0] || {};
            await client.query(`UPDATE creator_live_sessions SET provider=$3,likes=$4,viewers_peak=GREATEST(viewers_peak,$5),shares=$6,gifts_count=$7,gifts_value=$8,followers_gained=$9,updated_at=NOW() WHERE creator_id=$1 AND id=$2`,[creatorId,sessionId,provider,Number(s.likes||0),Number(s.viewers||0),Number(s.shares||0),Number(s.gifts_count||0),Number(s.gifts_value||0),Number(s.followers_gained||0)]);
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally { client.release(); }

    if (insertedEvent && WIDGET_STUDIO_INTERACTION_EVENT_TYPES.has(insertedEvent.event_type)) {
        processStudioInteractionEvent(creatorId, insertedEvent).catch(error=>console.error("Widget Studio Interaction Fehler:",error));
    }
    if (insertedEvent && ["follow","like","gift","share"].includes(insertedEvent.event_type)) {
        await processCreatorGameLiveEvent(creatorId, insertedEvent)
            .catch(error=>console.error("Creator Game LIVE Rule Fehler:",error));
    }
    if (type === "live_end") cleanupStudioLiveHistory(creatorId).catch(error=>console.error("Widget Studio Cleanup Fehler:",error));
    return getStudioLiveState(creatorId);
}

function publicStudioWidgetRow(
    row
) {

    if (!row) {
        return null;
    }

    return {
        id: row.id,
        widget_type: row.widget_type,
        name: row.name,
        template_key: row.template_key,
        status: row.status,
        draft_config: sanitizeStudioWidgetConfig(row.draft_config, row.widget_type),
        published_config: row.published_config
            ? sanitizeStudioWidgetConfig(row.published_config, row.widget_type)
            : null,
        public_token: row.public_token,
        source_url: studioWidgetSourceUrl(row.public_token),
        source_urls: studioWidgetOutputUrls(row.public_token),
        output_profiles: Object.values(WIDGET_STUDIO_OUTPUT_PROFILES).map(profile => ({
            key: profile.key,
            label: profile.label,
            width: profile.width,
            height: profile.height
        })),
        version: Number(row.version || 1),
        created_at: row.created_at,
        updated_at: row.updated_at,
        published_at: row.published_at || null,
        has_unpublished_changes:
            Boolean(
                row.published_at &&
                row.updated_at &&
                new Date(row.updated_at).getTime() >
                new Date(row.published_at).getTime()
            )
    };

}


async function getStudioWidgetById(
    creatorId,
    widgetId
) {

    if (!validStudioWidgetId(widgetId)) {
        return null;
    }

    const result =
        await pool.query(
            `
            SELECT *
            FROM creator_widgets
            WHERE creator_id = $1
              AND id = $2
            LIMIT 1
            `,
            [creatorId, widgetId]
        );

    return result.rows[0] || null;

}


async function listStudioWidgets(
    creatorId
) {

    const result =
        await pool.query(
            `
            SELECT *
            FROM creator_widgets
            WHERE creator_id = $1
            ORDER BY updated_at DESC, created_at DESC
            `,
            [creatorId]
        );

    return result.rows;

}


async function getPublicStudioWidget(
    publicToken
) {

    if (!validStudioWidgetToken(publicToken)) {
        return null;
    }

    const result =
        await pool.query(
            `
            SELECT
                w.*,
                a.display_name AS creator_display_name,
                a.status AS creator_status
            FROM creator_widgets w
            INNER JOIN creator_accounts a
                ON a.id = w.creator_id
            WHERE w.public_token = $1
              AND w.status = 'live'
              AND w.published_config IS NOT NULL
              AND a.status = 'active'
            LIMIT 1
            `,
            [publicToken]
        );

    return result.rows[0] || null;

}


// ============================================================
// ACCOUNT REGISTRIEREN
// ============================================================

app.get("/api/plans/catalog",async(_req,res)=>{
    res.set("Cache-Control","public, max-age=120");
    const plans=publicPlanCatalog().map(plan=>({...plan,price_status:plan.key==="free"?"active":BILLING_CONFIG.plans?.[plan.key]?.checkout_available?"active":"configuration_required",checkout_available:Boolean(BILLING_CONFIG.plans?.[plan.key]?.checkout_available)}));
    return res.json({ok:true,billing_enabled:BILLING_CONFIG.enabled,checkout_available:BILLING_CONFIG.checkout_available,provider:BILLING_CONFIG.provider,webhook_ready:BILLING_CONFIG.webhook_ready,grace_days:BILLING_CONFIG.grace_days,plans});
});

app.get("/api/creator/access",requireCreatorAccount,async(req,res)=>{res.set("Cache-Control","no-store");try{return res.json({ok:true,...(await creatorAccessProfile(req.creatorAccount))});}catch(error){return res.status(500).json({ok:false,error:"Creator-Zugriff konnte nicht geladen werden."});}});

app.get("/api/creator/billing/status",requireCreatorAccount,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{const access=await creatorAccessProfile(req.creatorAccount);return res.json({ok:true,provider:BILLING_CONFIG.provider,billing_enabled:BILLING_CONFIG.enabled,webhook_ready:BILLING_CONFIG.webhook_ready,checkout_available:BILLING_CONFIG.checkout_available,portal_available:BILLING_CONFIG.portal_available,grace_days:BILLING_CONFIG.grace_days,plan:access.plan,effective_plan:access.effective_plan,access_source:access.access_source,beta:access.beta,subscription:access.subscription});}
    catch(error){return res.status(500).json({ok:false,error:"Billing-Status konnte nicht geladen werden."});}
});

app.post("/api/creator/billing/checkout",requireCreatorAccount,async(req,res)=>{
    res.set("Cache-Control","no-store");
    const plan=normalizePlan(req.body?.plan);
    if(!["creator","pro"].includes(plan))return res.status(400).json({ok:false,error:"Für diesen Plan ist kein Checkout erforderlich."});
    const priceId=BILLING_PLAN_PRICE[plan];if(!BILLING_CONFIG.enabled||!priceId)return res.status(503).json({ok:false,error:`${plan.toUpperCase()} Checkout ist noch nicht auf diesem Server konfiguriert.`});
    try{
        const access=await creatorAccessProfile(req.creatorAccount);
        if(access.subscription?.access_active&&access.subscription?.provider==="stripe"&&access.subscription?.configured)return res.status(409).json({ok:false,code:"subscription_exists",error:"Du hast bereits eine verwaltete Subscription. Nutze BILLING VERWALTEN für Upgrade, Downgrade oder Kündigung."});
        let customerId="";const existing=await pool.query(`SELECT provider_customer_id FROM creator_billing_subscriptions WHERE creator_id=$1 LIMIT 1`,[req.creatorAccount.id]);customerId=String(existing.rows[0]?.provider_customer_id||"");
        const client=stripeClient();
        if(!customerId){const customer=await client.customers.create({email:req.creatorAccount.email||undefined,name:req.creatorAccount.display_name||undefined,metadata:{creator_id:req.creatorAccount.id,cfs_source:"creator_suite"}});customerId=customer.id;await pool.query(`INSERT INTO creator_billing_subscriptions(creator_id,provider,provider_customer_id,plan,status,created_at,updated_at) VALUES($1,'stripe',$2,'free','none',NOW(),NOW()) ON CONFLICT(creator_id) DO UPDATE SET provider='stripe',provider_customer_id=EXCLUDED.provider_customer_id,updated_at=NOW()`,[req.creatorAccount.id,customerId]);}
        const session=await client.checkout.sessions.create({mode:"subscription",customer:customerId,line_items:[{price:priceId,quantity:1}],success_url:`${APP_BASE_URL}/pages/plans.html?billing=success&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${APP_BASE_URL}/pages/plans.html?billing=cancel`,client_reference_id:req.creatorAccount.id,allow_promotion_codes:true,metadata:{creator_id:req.creatorAccount.id,cfs_plan:plan},subscription_data:{metadata:{creator_id:req.creatorAccount.id,cfs_plan:plan}}});
        return res.json({ok:true,provider:"stripe",plan,url:session.url||"",session_id:session.id});
    }catch(error){console.error("[billing:checkout]",error?.message||error);return res.status(502).json({ok:false,error:"Checkout konnte nicht erstellt werden."});}
});

app.post("/api/creator/billing/portal",requireCreatorAccount,async(req,res)=>{
    res.set("Cache-Control","no-store");
    if(!BILLING_CONFIG.portal_available)return res.status(503).json({ok:false,error:"Billing Portal ist noch nicht konfiguriert."});
    try{
        const row=(await pool.query(`SELECT provider_customer_id FROM creator_billing_subscriptions WHERE creator_id=$1 LIMIT 1`,[req.creatorAccount.id])).rows[0];
        const customerId=String(row?.provider_customer_id||"");if(!customerId)return res.status(409).json({ok:false,error:"Für diesen Account existiert noch kein Billing-Customer."});
        const session=await stripeClient().billingPortal.sessions.create({customer:customerId,return_url:`${APP_BASE_URL}/pages/plans.html?billing=return`});
        return res.json({ok:true,provider:"stripe",url:session.url||""});
    }catch(error){console.error("[billing:portal]",error?.message||error);return res.status(502).json({ok:false,error:"Billing Portal konnte nicht geöffnet werden."});}
});


app.post(
    "/api/account/register",

    accountRegisterLimiter,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        try {

            const email =
                normalizeEmail(
                    req.body?.email
                );

            const password =
                String(
                    req.body?.password ||
                    ""
                );

            const displayName =
                normalizeDisplayName(
                    req.body?.display_name
                );


            if (
                !validEmail(
                    email
                )
            ) {

                return res
                    .status(400)
                    .json({

                        ok:
                            false,

                        error:
                            "Bitte gib eine gültige E-Mail-Adresse ein."

                    });

            }


            if (
                password.length <
                PASSWORD_MIN_LENGTH
            ) {

                return res
                    .status(400)
                    .json({

                        ok:
                            false,

                        error:
                            `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`

                    });

            }


            if (
                password.length >
                PASSWORD_MAX_LENGTH
            ) {

                return res
                    .status(400)
                    .json({

                        ok:
                            false,

                        error:
                            `Das Passwort darf höchstens ${PASSWORD_MAX_LENGTH} Zeichen lang sein.`

                    });

            }


            if (
                !displayName
            ) {

                return res
                    .status(400)
                    .json({

                        ok:
                            false,

                        error:
                            "Bitte gib einen Creator-Namen ein."

                    });

            }


            const existing =
                await findCreatorByEmail(
                    email
                );

            if (
                existing
            ) {

                return res
                    .status(409)
                    .json({

                        ok:
                            false,

                        error:
                            "Die Registrierung konnte nicht abgeschlossen werden. Falls bereits ein Konto existiert, melde dich bitte an."

                    });

            }


            const passwordRecord =
                await createPasswordHash(
                    password
                );

            const creatorId =
                createCreatorAccountId();


            const result =
                await pool.query(
                    `
                    INSERT INTO creator_accounts (

                        id,
                        email,
                        password_hash,
                        password_salt,
                        display_name,
                        plan,
                        status,
                        created_at,
                        updated_at

                    )

                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        'free',
                        'active',
                        NOW(),
                        NOW()
                    )

                    RETURNING
                        id,
                        email,
                        display_name,
                        plan,
                        status,
                        created_at,
                        updated_at
                    `,
                    [
                        creatorId,
                        email,
                        passwordRecord.hash,
                        passwordRecord.salt,
                        displayName
                    ]
                );


            const account =
                result.rows[0];


            await saveCreatorSettings(
                creatorId,
                defaultCreatorSettings()
            );


            await recordSecurityEvent(
                creatorId,
                "account_registered"
            );


            await createCreatorSession(
                res,
                creatorId
            );


            return res
                .status(201)
                .json({

                    ok:
                        true,

                    authenticated:
                        true,

                    account:
                        publicCreatorAccount(
                            account
                        ),

                    entitlements:
                        getPlanEntitlements(
                            account.plan
                        ),

                    modules:
                        publicModuleRegistry(
                            account
                        )

                });

        }
        catch (error) {

            console.error(
                "Creator Registrierung Fehler:",
                error
            );

            if (
                error?.code ===
                "23505"
            ) {

                return res
                    .status(409)
                    .json({

                        ok:
                            false,

                        error:
                            "Die Registrierung konnte nicht abgeschlossen werden. Falls bereits ein Konto existiert, melde dich bitte an."

                    });

            }

            return res
                .status(500)
                .json({

                    ok:
                        false,

                    error:
                        "Das Creator-Konto konnte nicht erstellt werden."

                });

        }

    }
);


// ============================================================
// ACCOUNT LOGIN
// ============================================================

app.post(
    "/api/account/login",

    accountLoginLimiter,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        try {

            const email =
                normalizeEmail(
                    req.body?.email
                );

            const password =
                String(
                    req.body?.password ||
                    ""
                );


            if (
                !email ||
                !password ||
                !validEmail(
                    email
                ) ||
                password.length >
                    PASSWORD_MAX_LENGTH
            ) {

                return res
                    .status(401)
                    .json({

                        ok:
                            false,

                        authenticated:
                            false,

                        error:
                            "E-Mail-Adresse oder Passwort ist nicht korrekt."

                    });

            }


            const account =
                await findCreatorByEmail(
                    email
                );


            if (
                !account
            ) {

                // Dummy-scrypt reduziert Timing-Unterschiede zwischen
                // existierenden und unbekannten E-Mail-Adressen.
                await scryptAsync(
                    password,
                    "cfs_login_dummy_salt_v1"
                );

                return res
                    .status(401)
                    .json({

                        ok:
                            false,

                        authenticated:
                            false,

                        error:
                            "E-Mail-Adresse oder Passwort ist nicht korrekt."

                    });

            }


            if (
                account.status !==
                "active"
            ) {

                return res
                    .status(403)
                    .json({

                        ok:
                            false,

                        authenticated:
                            false,

                        error:
                            "Dieses Creator-Konto ist derzeit nicht aktiv."

                    });

            }


            const passwordOk =
                await verifyPassword(
                    password,
                    account.password_salt,
                    account.password_hash
                );


            if (
                !passwordOk
            ) {

                return res
                    .status(401)
                    .json({

                        ok:
                            false,

                        authenticated:
                            false,

                        error:
                            "E-Mail-Adresse oder Passwort ist nicht korrekt."

                    });

            }


            await createCreatorSession(
                res,
                account.id
            );


            await recordSecurityEvent(
                account.id,
                "login_success"
            );


            const access=await creatorAccessProfile(account);

            return res.json({

                ok:
                    true,

                authenticated:
                    true,

                account:
                    publicCreatorAccount(
                        account
                    ),

                entitlements:
                    access.entitlements,

                access:
                    access,

                modules:
                    publicModuleRegistry(account,access.entitlements),

                admin:
                    await isCreatorSuiteAdmin(account)

            });

        }
        catch (error) {

            console.error(
                "Creator Login Fehler:",
                error
            );

            return res
                .status(500)
                .json({

                    ok:
                        false,

                    error:
                        "Die Anmeldung konnte nicht durchgeführt werden."

                });

        }

    }
);


// ============================================================
// ACCOUNT LOGOUT
// ============================================================

app.post(
    "/api/account/logout",
    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        try {

            await destroyCreatorSession(
                req,
                res
            );


            return res.json({

                ok:
                    true,

                authenticated:
                    false

            });

        }
        catch (error) {

            console.error(
                "Creator Logout Fehler:",
                error
            );

            res.clearCookie(
                CREATOR_SESSION_COOKIE,
                {
                    path:
                        "/"
                }
            );


            return res
                .status(500)
                .json({

                    ok:
                        false,

                    error:
                        "Die Abmeldung konnte nicht vollständig durchgeführt werden."

                });

        }

    }
);


// ============================================================
// ACCOUNT AUF ALLEN GERÄTEN ABMELDEN
// ============================================================

app.post(
    "/api/account/logout-all",

    requireCreatorAccount,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        try {

            await recordSecurityEvent(
                req.creatorAccount.id,
                "logout_all"
            );


            await pool.query(
                `
                DELETE FROM creator_sessions
                WHERE creator_id = $1
                `,
                [
                    req.creatorAccount.id
                ]
            );

            res.clearCookie(
                CREATOR_SESSION_COOKIE,
                {
                    path:
                        "/"
                }
            );

            return res.json({

                ok:
                    true,

                authenticated:
                    false,

                message:
                    "Du wurdest auf allen Geräten abgemeldet."

            });

        }
        catch (error) {

            console.error(
                "Creator Logout-All Fehler:",
                error
            );

            return res
                .status(500)
                .json({

                    ok:
                        false,

                    error:
                        "Die Sitzungen konnten nicht vollständig beendet werden."

                });

        }

    }
);


// ============================================================
// ACCOUNT ME
// ============================================================

app.get(
    "/api/account/me",
    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        try {

            const account =
                await getCreatorFromRequest(
                    req
                );


            if (
                !account
            ) {

                return res
                    .status(401)
                    .json({

                        ok:
                            false,

                        authenticated:
                            false,

                        account:
                            null

                    });

            }


            const access=await creatorAccessProfile(account);

            return res.json({

                ok:
                    true,

                authenticated:
                    true,

                account:
                    publicCreatorAccount(
                        account
                    ),

                entitlements:
                    access.entitlements,

                access:
                    access,

                modules:
                    publicModuleRegistry(account,access.entitlements),

                admin:
                    await isCreatorSuiteAdmin(account)

            });

        }
        catch (error) {

            console.error(
                "Creator Account Me Fehler:",
                error
            );

            return res
                .status(500)
                .json({

                    ok:
                        false,

                    authenticated:
                        false,

                    error:
                        "Das Creator-Konto konnte nicht geladen werden."

                });

        }

    }
);


// ============================================================
// ACCOUNT SICHERHEITSAKTIVITÄT
// ============================================================

app.get(
    "/api/account/security-events",

    requireCreatorAccount,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        event_type,
                        created_at

                    FROM creator_security_events

                    WHERE creator_id = $1

                    ORDER BY created_at DESC

                    LIMIT 20
                    `,
                    [
                        req.creatorAccount.id
                    ]
                );


            return res.json({

                ok:
                    true,

                retention_days:
                    SECURITY_EVENT_RETENTION_DAYS,

                events:
                    result.rows

            });

        }
        catch (error) {

            console.error(
                "Security Events Laden Fehler:",
                error
            );

            return res
                .status(500)
                .json({

                    ok:
                        false,

                    error:
                        "Die Sicherheitsaktivität konnte nicht geladen werden."

                });

        }

    }
);


// ============================================================
// ACCOUNT PROFIL AKTUALISIEREN
// ============================================================

app.patch(
    "/api/account/profile",

    requireCreatorAccount,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        try {

            const displayName =
                normalizeDisplayName(
                    req.body?.display_name
                );


            if (
                !displayName
            ) {

                return res
                    .status(400)
                    .json({

                        ok:
                            false,

                        error:
                            "Bitte gib einen Creator-Namen ein."

                    });

            }


            const result =
                await pool.query(
                    `
                    UPDATE creator_accounts

                    SET
                        display_name = $2,
                        updated_at = NOW()

                    WHERE id = $1

                    RETURNING
                        id,
                        email,
                        display_name,
                        plan,
                        status,
                        created_at,
                        updated_at
                    `,
                    [
                        req.creatorAccount.id,
                        displayName
                    ]
                );


            await recordSecurityEvent(
                req.creatorAccount.id,
                "profile_updated"
            );


            return res.json({

                ok:
                    true,

                account:
                    publicCreatorAccount(
                        result.rows[0]
                    )

            });

        }
        catch (error) {

            console.error(
                "Creator Profil Update Fehler:",
                error
            );

            return res
                .status(500)
                .json({

                    ok:
                        false,

                    error:
                        "Das Creator-Profil konnte nicht gespeichert werden."

                });

        }

    }
);


// ============================================================
// ACCOUNT LÖSCHEN
//
// Sicherheitsprinzip:
// - aktive Creator-Session erforderlich
// - Passwort muss erneut bestätigt werden
// - feste Bestätigungsphrase erforderlich
// - Rate Limit gegen wiederholte Passwortversuche
// - accountbezogene Daten werden in einer DB-Transaktion entfernt
//
// WICHTIG:
// Die aktuelle TikTok-Owner-Verbindung läuft historisch unter
// DEFAULT_CREATOR_ID ("default") und ist noch nicht eindeutig einem
// Creator-Account zugeordnet. Deshalb wird "default" hier NICHT gelöscht.
// Account-spezifische TikTok-Zeilen mit creator_id = Account-ID werden
// dagegen entfernt. So bleibt die bestehende Launcher/TikTok-Verbindung
// beim Löschen eines Website-Accounts geschützt.
// ============================================================

app.delete(
    "/api/account",

    requireCreatorAccount,

    accountDeleteLimiter,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        const password =
            String(
                req.body?.password ||
                ""
            );

        const confirmation =
            String(
                req.body?.confirmation ||
                ""
            )
                .trim()
                .toUpperCase();


        if (
            !password ||
            password.length >
                PASSWORD_MAX_LENGTH
        ) {

            return res
                .status(400)
                .json({

                    ok:
                        false,

                    error:
                        "Bitte bestätige die Löschung mit deinem Passwort."

                });

        }


        if (
            confirmation !==
                "LÖSCHEN"
        ) {

            return res
                .status(400)
                .json({

                    ok:
                        false,

                    error:
                        "Bitte gib zur Bestätigung exakt LÖSCHEN ein."

                });

        }


        let client =
            null;


        try {

            client =
                await pool.connect();


            await client.query(
                "BEGIN"
            );


            const accountResult =
                await client.query(
                    `
                    SELECT
                        id,
                        password_hash,
                        password_salt

                    FROM creator_accounts

                    WHERE id = $1

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        req.creatorAccount.id
                    ]
                );


            const account =
                accountResult.rows[0];


            if (
                !account
            ) {

                await client.query(
                    "ROLLBACK"
                );

                res.clearCookie(
                    CREATOR_SESSION_COOKIE,
                    {
                        path:
                            "/"
                    }
                );

                return res
                    .status(401)
                    .json({

                        ok:
                            false,

                        authenticated:
                            false,

                        error:
                            "Das Creator-Konto ist nicht mehr verfügbar."

                    });

            }


            const passwordOk =
                await verifyPassword(
                    password,
                    account.password_salt,
                    account.password_hash
                );


            if (
                !passwordOk
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res
                    .status(401)
                    .json({

                        ok:
                            false,

                        error:
                            "Das Passwort ist nicht korrekt."

                    });

            }


            // Explizit löschen, auch wenn die vorhandenen FK-Constraints
            // bereits ON DELETE CASCADE verwenden. Das hält die Löschung
            // nachvollziehbar und kompatibel mit älteren Datenbankständen.

            await client.query(
                `
                DELETE FROM creator_module_state
                WHERE creator_id = $1
                `,
                [
                    account.id
                ]
            );


            await client.query(
                `
                DELETE FROM creator_settings
                WHERE creator_id = $1
                `,
                [
                    account.id
                ]
            );


            await client.query(
                `
                DELETE FROM creator_sessions
                WHERE creator_id = $1
                `,
                [
                    account.id
                ]
            );


            await client.query(
                `
                DELETE FROM tiktok_oauth_states
                WHERE creator_id = $1
                `,
                [
                    account.id
                ]
            );


            // Nur account-spezifische TikTok-Verbindungen entfernen.
            // Die globale Owner-Verbindung "default" bleibt unangetastet.
            await client.query(
                `
                DELETE FROM tiktok_connections
                WHERE creator_id = $1
                AND creator_id <> $2
                `,
                [
                    account.id,
                    DEFAULT_CREATOR_ID
                ]
            );


            const deleteResult =
                await client.query(
                    `
                    DELETE FROM creator_accounts
                    WHERE id = $1
                    RETURNING id
                    `,
                    [
                        account.id
                    ]
                );


            if (
                deleteResult.rowCount !==
                    1
            ) {

                throw new Error(
                    "Creator-Account konnte nicht eindeutig gelöscht werden."
                );

            }


            await client.query(
                "COMMIT"
            );


            res.clearCookie(
                CREATOR_SESSION_COOKIE,
                {
                    path:
                        "/"
                }
            );


            console.log(
                "[CFS Account] Creator-Account wurde gelöscht."
            );


            return res.json({

                ok:
                    true,

                authenticated:
                    false,

                deleted:
                    true,

                message:
                    "Dein Creator-Konto wurde gelöscht."

            });

        }
        catch (error) {

            if (
                client
            ) {

                try {

                    await client.query(
                        "ROLLBACK"
                    );

                }
                catch (
                    rollbackError
                ) {

                    console.error(
                        "Creator Account Delete Rollback Fehler:",
                        rollbackError
                    );

                }

            }


            console.error(
                "Creator Account Delete Fehler:",
                error
            );


            return res
                .status(500)
                .json({

                    ok:
                        false,

                    error:
                        "Das Creator-Konto konnte nicht gelöscht werden."

                });

        }
        finally {

            client?.release();

        }

    }
);


// ============================================================
// CREATOR SETTINGS LADEN
// ============================================================

app.get(
    "/api/creator/settings",

    requireCreatorAccount,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        try {

            const data =
                await getCreatorSettings(
                    req.creatorAccount.id
                );


            return res.json({

                ok:
                    true,

                settings:
                    data.settings,

                updated_at:
                    data.updated_at,

                entitlements:
                    getPlanEntitlements(
                        req.creatorAccount.plan
                    )

            });

        }
        catch (error) {

            console.error(
                "Creator Settings Laden Fehler:",
                error
            );

            return res
                .status(500)
                .json({

                    ok:
                        false,

                    error:
                        "Creator-Einstellungen konnten nicht geladen werden."

                });

        }

    }
);


// ============================================================
// CREATOR SETTINGS SPEICHERN
// ============================================================

app.put(
    "/api/creator/settings",

    requireCreatorAccount,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        try {

            const settings =
                sanitizeCreatorSettings(
                    req.body?.settings
                );


            const plan =
                normalizePlan(
                    req.creatorAccount.plan
                );


            const entitlements =
                getPlanEntitlements(
                    plan
                );


            // ------------------------------------------------
            // Theme serverseitig prüfen
            // ------------------------------------------------

            if (
                settings?.profile?.theme &&
                !entitlements
                    .themes
                    .includes(
                        settings.profile.theme
                    )
            ) {

                return res
                    .status(403)
                    .json({

                        ok:
                            false,

                        error:
                            "Dieses Theme ist für deinen aktuellen Plan nicht freigeschaltet."

                    });

            }


            const result =
                await saveCreatorSettings(
                    req.creatorAccount.id,
                    settings
                );


            return res.json({

                ok:
                    true,

                settings:
                    result.settings,

                updated_at:
                    result.updated_at

            });

        }
        catch (error) {

            console.error(
                "Creator Settings Speichern Fehler:",
                error
            );

            return res
                .status(500)
                .json({

                    ok:
                        false,

                    error:
                        error.message ||
                        "Creator-Einstellungen konnten nicht gespeichert werden."

                });

        }

    }
);


// ============================================================
// CREATOR MODULE REGISTRY
// ============================================================

app.get(
    "/api/creator/modules",

    requireCreatorAccount,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );


        const moduleAccess=await creatorAccessProfile(req.creatorAccount);

        return res.json({

            ok:
                true,

            plan:
                normalizePlan(
                    req.creatorAccount.plan
                ),

            entitlements:
                moduleAccess.entitlements,

            access:
                moduleAccess,

            modules:
                publicModuleRegistry(req.creatorAccount,moduleAccess.entitlements)

        });

    }
);


// ============================================================
// MODUL STATE LADEN
// ============================================================

app.get(
    "/api/creator/modules/:moduleKey/state",

    requireCreatorAccount,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        try {

            const moduleKey =
                normalizeModuleKey(
                    req.params.moduleKey
                );


            const module =
                CREATOR_MODULES[
                    moduleKey
                ];


            const moduleAccess=await creatorAccessProfile(req.creatorAccount);

            if (!Boolean(moduleAccess?.entitlements?.[moduleKey])) {

                return res
                    .status(403)
                    .json({

                        ok:
                            false,

                        allowed:
                            false,

                        module:
                            module,

                        error:
                            `Dieses Modul benötigt mindestens den Plan ${module.minimum_plan.toUpperCase()}.`

                    });

            }


            const data =
                await getModuleState(
                    req.creatorAccount.id,
                    moduleKey
                );


            return res.json({

                ok:
                    true,

                allowed:
                    true,

                module:
                    module,

                state:
                    data.state,

                updated_at:
                    data.updated_at

            });

        }
        catch (error) {

            if (
                error.message ===
                "Unbekanntes Creator-Modul."
            ) {

                return res
                    .status(404)
                    .json({

                        ok:
                            false,

                        error:
                            error.message

                    });

            }


            console.error(
                "Modul State Laden Fehler:",
                error
            );


            return res
                .status(500)
                .json({

                    ok:
                        false,

                    error:
                        "Modul-Daten konnten nicht geladen werden."

                });

        }

    }
);


// ============================================================
// MODUL STATE SPEICHERN
// ============================================================

app.put(
    "/api/creator/modules/:moduleKey/state",

    requireCreatorAccount,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        try {

            const moduleKey =
                normalizeModuleKey(
                    req.params.moduleKey
                );


            const module =
                CREATOR_MODULES[
                    moduleKey
                ];


            if (
                !module.stateful
            ) {

                return res
                    .status(400)
                    .json({

                        ok:
                            false,

                        error:
                            "Dieses Modul besitzt keinen speicherbaren Status."

                    });

            }


            const moduleAccess=await creatorAccessProfile(req.creatorAccount);

            if (!Boolean(moduleAccess?.entitlements?.[moduleKey])) {

                return res
                    .status(403)
                    .json({

                        ok:
                            false,

                        allowed:
                            false,

                        module:
                            module,

                        error:
                            `Dieses Modul benötigt mindestens den Plan ${module.minimum_plan.toUpperCase()}.`

                    });

            }


            const state =
                moduleKey==="games"
                    ? sanitizeGameProfile(req.body?.state)
                    : sanitizeModuleState(
                        req.body?.state
                    );


            const result =
                await saveModuleState(
                    req.creatorAccount.id,
                    moduleKey,
                    state
                );


            return res.json({

                ok:
                    true,

                allowed:
                    true,

                module:
                    module,

                state:
                    result.state,

                updated_at:
                    result.updated_at

            });

        }
        catch (error) {

            if (
                error.message ===
                "Unbekanntes Creator-Modul."
            ) {

                return res
                    .status(404)
                    .json({

                        ok:
                            false,

                        error:
                            error.message

                    });

            }


            console.error(
                "Modul State Speichern Fehler:",
                error
            );


            return res
                .status(500)
                .json({

                    ok:
                        false,

                    error:
                        error.message ||
                        "Modul-Daten konnten nicht gespeichert werden."

                });

        }

    }
);

// ============================================================
// WIDGET STUDIO V1 - CREATOR API
// ============================================================

app.get(
    "/api/creator/widget-studio/widgets",
    requireCreatorAccount,
    async (req, res) => {

        res.set("Cache-Control", "no-store");

        try {

            const rows =
                await listStudioWidgets(
                    req.creatorAccount.id
                );

            const tiktok =
                await getFollowerWidgetTikTokData(
                    req.creatorAccount.id
                );

            const access=await creatorAccessProfile(req.creatorAccount);
            const entitlements=access.entitlements;

            const live =
                await getStudioLiveState(
                    req.creatorAccount.id
                );

            return res.json({
                ok: true,
                widgets:
                    rows.map(publicStudioWidgetRow),
                tiktok,
                live,
                bridge: await getStudioBridgeStatus(req.creatorAccount.id),
                registry: studioWidgetRegistryPublic(req.creatorAccount.plan,entitlements),
                access,
                providers: studioProviderRegistryPublic(),
                sessions: await getStudioLiveSessions(req.creatorAccount.id, 5),
                interactions: await listStudioInteractionRules(req.creatorAccount.id),
                plan: normalizePlan(req.creatorAccount.plan),
                limits:{max_widgets:entitlements.max_widgets,max_scenes:entitlements.max_scenes},
                entitlements
            });

        }
        catch (error) {

            console.error(
                "Widget Studio Liste Fehler:",
                error
            );

            return res.status(500).json({
                ok: false,
                error: "Widgets konnten nicht geladen werden."
            });

        }

    }
);


app.post(
    "/api/creator/widget-studio/widgets",
    requireCreatorAccount,
    async (req, res) => {

        res.set("Cache-Control", "no-store");

        try {

            const access=await creatorAccessProfile(req.creatorAccount);
            const entitlements=access.entitlements;

            const countResult =
                await pool.query(
                    `
                    SELECT COUNT(*)::int AS count
                    FROM creator_widgets
                    WHERE creator_id = $1
                    `,
                    [req.creatorAccount.id]
                );

            const count =
                Number(countResult.rows[0]?.count || 0);

            if (
                count >= entitlements.max_widgets
            ) {

                return res.status(403).json({
                    ok: false,
                    error:
                        `Dein Plan erlaubt maximal ${entitlements.max_widgets} Widgets.`
                });

            }

            const widgetType =
                String(req.body?.widget_type || "follower_goal");

            if (
                !WIDGET_STUDIO_WIDGET_TYPE_KEYS.has(widgetType)
            ) {
                return res.status(400).json({
                    ok: false,
                    error: "Unbekannter Widget-Typ."
                });
            }

            const definition =
                studioWidgetDefinition(widgetType);

            const minimumPlan=definition.minimum_plan||"free";
            const typeAllowed=minimumPlan==="free"||(["alert","latest","goal_alert"].includes(definition.mode)?Boolean(entitlements.alerts):Boolean(entitlements.live_widgets));
            if(!typeAllowed)return res.status(403).json({...accessDeniedPayload(access,["alert","latest","goal_alert"].includes(definition.mode)?"alerts":"live_widgets",minimumPlan),error:`${definition.label} benötigt mindestens den ${minimumPlan.toUpperCase()} Plan.`});

            const templateKey =
                WIDGET_STUDIO_TEMPLATE_KEYS.has(
                    String(req.body?.template_key || "")
                )
                    ? String(req.body.template_key)
                    : "cfs-standard";

            if(!templateAllowed(templateKey,entitlements)){const requiredPlan=minimumPlanForTemplate(templateKey);return res.status(403).json({...accessDeniedPayload(access,"widget_templates",requiredPlan),template_key:templateKey,error:`Das Template ${templateKey.toUpperCase()} benötigt mindestens den ${requiredPlan.toUpperCase()} Plan.`});}

            const draftConfig =
                sanitizeStudioWidgetConfig(
                    studioWidgetTemplateConfig(
                        widgetType,
                        templateKey
                    ),
                    widgetType
                );

            const id =
                crypto.randomUUID();

            const publicToken =
                createStudioWidgetToken();

            const name =
                studioWidgetName(
                    req.body?.name,
                    templateKey === "cfs-standard"
                        ? `Mein ${definition.label}`
                        : `${templateKey.replaceAll("-", " ")} ${definition.label}`
                );

            const result =
                await pool.query(
                    `
                    INSERT INTO creator_widgets (
                        id,
                        creator_id,
                        widget_type,
                        name,
                        template_key,
                        status,
                        draft_config,
                        public_token,
                        version,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        'draft',
                        $6::jsonb,
                        $7,
                        1,
                        NOW(),
                        NOW()
                    )
                    RETURNING *
                    `,
                    [
                        id,
                        req.creatorAccount.id,
                        widgetType,
                        name,
                        templateKey,
                        JSON.stringify(draftConfig),
                        publicToken
                    ]
                );

            const tiktok =
                await getFollowerWidgetTikTokData(
                    req.creatorAccount.id
                );

            return res.status(201).json({
                ok: true,
                widget: publicStudioWidgetRow(result.rows[0]),
                tiktok,
                live: await getStudioLiveState(req.creatorAccount.id),
                registry: studioWidgetRegistryPublic(req.creatorAccount.plan),
                providers: studioProviderRegistryPublic()
            });

        }
        catch (error) {

            console.error(
                "Widget Studio Erstellen Fehler:",
                error
            );

            return res.status(500).json({
                ok: false,
                error: "Widget konnte nicht erstellt werden."
            });

        }

    }
);


app.get(
    "/api/creator/widget-studio/widgets/:id",
    requireCreatorAccount,
    async (req, res) => {

        res.set("Cache-Control", "no-store");

        try {

            const row =
                await getStudioWidgetById(
                    req.creatorAccount.id,
                    req.params.id
                );

            if (!row) {
                return res.status(404).json({
                    ok: false,
                    error: "Widget nicht gefunden."
                });
            }

            const tiktok =
                await getFollowerWidgetTikTokData(
                    req.creatorAccount.id
                );

            return res.json({
                ok: true,
                widget: publicStudioWidgetRow(row),
                tiktok,
                live: await getStudioLiveState(req.creatorAccount.id),
                bridge: await getStudioBridgeStatus(req.creatorAccount.id),
                registry: studioWidgetRegistryPublic(req.creatorAccount.plan),
                providers: studioProviderRegistryPublic()
            });

        }
        catch (error) {

            console.error(
                "Widget Studio Laden Fehler:",
                error
            );

            return res.status(500).json({
                ok: false,
                error: "Widget konnte nicht geladen werden."
            });

        }

    }
);


app.put(
    "/api/creator/widget-studio/widgets/:id/draft",
    requireCreatorAccount,
    async (req, res) => {

        res.set("Cache-Control", "no-store");

        try {

            const current =
                await getStudioWidgetById(
                    req.creatorAccount.id,
                    req.params.id
                );

            if (!current) {
                return res.status(404).json({
                    ok: false,
                    error: "Widget nicht gefunden."
                });
            }

            const widgetAccess=await creatorAccessProfile(req.creatorAccount);
            const widgetEntitlements=widgetAccess.entitlements;
            const widgetDefinition=studioWidgetDefinition(current.widget_type);
            const widgetMinimum=widgetDefinition.minimum_plan||"free";
            const widgetAllowed=widgetMinimum==="free"||(["alert","latest","goal_alert"].includes(widgetDefinition.mode)?Boolean(widgetEntitlements.alerts):Boolean(widgetEntitlements.live_widgets));
            if(!widgetAllowed)return res.status(403).json(accessDeniedPayload(widgetAccess,["alert","latest","goal_alert"].includes(widgetDefinition.mode)?"alerts":"live_widgets",widgetMinimum));

            const config =
                sanitizeStudioWidgetConfig(
                    req.body?.config ?? current.draft_config,
                    current.widget_type
                );

            const name =
                studioWidgetName(
                    req.body?.name,
                    current.name
                );

            const result =
                await pool.query(
                    `
                    UPDATE creator_widgets
                    SET
                        name = $3,
                        draft_config = $4::jsonb,
                        version = version + 1,
                        updated_at = NOW()
                    WHERE creator_id = $1
                      AND id = $2
                    RETURNING *
                    `,
                    [
                        req.creatorAccount.id,
                        current.id,
                        name,
                        JSON.stringify(config)
                    ]
                );

            return res.json({
                ok: true,
                widget: publicStudioWidgetRow(result.rows[0])
            });

        }
        catch (error) {

            console.error(
                "Widget Studio Draft Fehler:",
                error
            );

            return res.status(500).json({
                ok: false,
                error: "Entwurf konnte nicht gespeichert werden."
            });

        }

    }
);


app.post(
    "/api/creator/widget-studio/widgets/:id/publish",
    requireCreatorAccount,
    async (req, res) => {

        res.set("Cache-Control", "no-store");

        try {

            const current =
                await getStudioWidgetById(
                    req.creatorAccount.id,
                    req.params.id
                );

            if (!current) {
                return res.status(404).json({
                    ok: false,
                    error: "Widget nicht gefunden."
                });
            }

            const widgetAccess=await creatorAccessProfile(req.creatorAccount);
            const widgetEntitlements=widgetAccess.entitlements;
            const widgetDefinition=studioWidgetDefinition(current.widget_type);
            const widgetMinimum=widgetDefinition.minimum_plan||"free";
            const widgetAllowed=widgetMinimum==="free"||(["alert","latest","goal_alert"].includes(widgetDefinition.mode)?Boolean(widgetEntitlements.alerts):Boolean(widgetEntitlements.live_widgets));
            if(!widgetAllowed)return res.status(403).json(accessDeniedPayload(widgetAccess,["alert","latest","goal_alert"].includes(widgetDefinition.mode)?"alerts":"live_widgets",widgetMinimum));

            const clean =
                sanitizeStudioWidgetConfig(
                    current.draft_config,
                    current.widget_type
                );

            const result =
                await pool.query(
                    `
                    UPDATE creator_widgets
                    SET
                        published_config = $3::jsonb,
                        status = 'live',
                        version = version + 1,
                        updated_at = NOW(),
                        published_at = NOW()
                    WHERE creator_id = $1
                      AND id = $2
                    RETURNING *
                    `,
                    [
                        req.creatorAccount.id,
                        current.id,
                        JSON.stringify(clean)
                    ]
                );

            return res.json({
                ok: true,
                widget: publicStudioWidgetRow(result.rows[0])
            });

        }
        catch (error) {

            console.error(
                "Widget Studio Publish Fehler:",
                error
            );

            return res.status(500).json({
                ok: false,
                error: "Widget konnte nicht veröffentlicht werden."
            });

        }

    }
);


app.post(
    "/api/creator/widget-studio/widgets/:id/duplicate",
    requireCreatorAccount,
    async (req, res) => {

        res.set("Cache-Control", "no-store");

        try {

            const current =
                await getStudioWidgetById(
                    req.creatorAccount.id,
                    req.params.id
                );

            if (!current) {
                return res.status(404).json({
                    ok: false,
                    error: "Widget nicht gefunden."
                });
            }

            const duplicateAccess=await creatorAccessProfile(req.creatorAccount);
            const duplicateEntitlements=duplicateAccess.entitlements;
            const duplicateDefinition=studioWidgetDefinition(current.widget_type);
            const duplicateMinimum=duplicateDefinition.minimum_plan||"free";
            const duplicateAllowed=duplicateMinimum==="free"||(["alert","latest","goal_alert"].includes(duplicateDefinition.mode)?Boolean(duplicateEntitlements.alerts):Boolean(duplicateEntitlements.live_widgets));
            if(!duplicateAllowed)return res.status(403).json(accessDeniedPayload(duplicateAccess,["alert","latest","goal_alert"].includes(duplicateDefinition.mode)?"alerts":"live_widgets",duplicateMinimum));
            if(!templateAllowed(current.template_key,duplicateEntitlements))return res.status(403).json(accessDeniedPayload(duplicateAccess,"widget_templates",minimumPlanForTemplate(current.template_key)));

            const access=await creatorAccessProfile(req.creatorAccount);
            const entitlements=access.entitlements;

            const countResult =
                await pool.query(
                    `
                    SELECT COUNT(*)::int AS count
                    FROM creator_widgets
                    WHERE creator_id = $1
                    `,
                    [req.creatorAccount.id]
                );

            if (
                Number(countResult.rows[0]?.count || 0) >=
                entitlements.max_widgets
            ) {
                return res.status(403).json({
                    ok: false,
                    error:
                        `Dein Plan erlaubt maximal ${entitlements.max_widgets} Widgets.`
                });
            }

            const id = crypto.randomUUID();
            const publicToken = createStudioWidgetToken();
            const config = sanitizeStudioWidgetConfig(current.draft_config, current.widget_type);

            const result =
                await pool.query(
                    `
                    INSERT INTO creator_widgets (
                        id,
                        creator_id,
                        widget_type,
                        name,
                        template_key,
                        status,
                        draft_config,
                        public_token,
                        version,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        $1,$2,$3,$4,$5,'draft',$6::jsonb,$7,1,NOW(),NOW()
                    )
                    RETURNING *
                    `,
                    [
                        id,
                        req.creatorAccount.id,
                        current.widget_type,
                        studioWidgetName(`${current.name} Kopie`),
                        current.template_key,
                        JSON.stringify(config),
                        publicToken
                    ]
                );

            return res.status(201).json({
                ok: true,
                widget: publicStudioWidgetRow(result.rows[0])
            });

        }
        catch (error) {

            console.error(
                "Widget Studio Duplizieren Fehler:",
                error
            );

            return res.status(500).json({
                ok: false,
                error: "Widget konnte nicht dupliziert werden."
            });

        }

    }
);


app.delete(
    "/api/creator/widget-studio/widgets/:id",
    requireCreatorAccount,
    async (req, res) => {

        res.set("Cache-Control", "no-store");

        try {

            if (!validStudioWidgetId(req.params.id)) {
                return res.status(404).json({
                    ok: false,
                    error: "Widget nicht gefunden."
                });
            }

            const result =
                await pool.query(
                    `
                    DELETE FROM creator_widgets
                    WHERE creator_id = $1
                      AND id = $2
                    RETURNING id
                    `,
                    [req.creatorAccount.id, req.params.id]
                );

            if (!result.rows[0]) {
                return res.status(404).json({
                    ok: false,
                    error: "Widget nicht gefunden."
                });
            }

            return res.json({
                ok: true,
                deleted: true,
                id: result.rows[0].id
            });

        }
        catch (error) {

            console.error(
                "Widget Studio Löschen Fehler:",
                error
            );

            return res.status(500).json({
                ok: false,
                error: "Widget konnte nicht gelöscht werden."
            });

        }

    }
);


// ============================================================
// WIDGET STUDIO V4 - LIVE DATA CORE / SIMULATOR API
// ============================================================

app.get(
    "/api/creator/widget-studio/live",
    requireCreatorAccount,
    async (req, res) => {
        res.set("Cache-Control", "no-store");
        try {
            return res.json({
                ok: true,
                data: await studioDataSnapshot(req.creatorAccount.id),
                bridge: await getStudioBridgeStatus(req.creatorAccount.id),
                events: await getRecentStudioLiveEvents(req.creatorAccount.id, null, 20),
                registry: studioWidgetRegistryPublic()
            });
        } catch (error) {
            console.error("Widget Studio Live State Fehler:", error);
            return res.status(500).json({ ok: false, error: "Live-Daten konnten nicht geladen werden." });
        }
    }
);

app.post(
    "/api/creator/widget-studio/live/simulate",
    requireCreatorAccount,
    async (req, res) => {
        res.set("Cache-Control", "no-store");
        try {
            const live = await applyStudioLiveEvent(
                req.creatorAccount.id,
                req.body || {},
                "simulator"
            );
            return res.json({
                ok: true,
                live,
                data: await studioDataSnapshot(req.creatorAccount.id),
                events: await getRecentStudioLiveEvents(req.creatorAccount.id, null, 20)
            });
        } catch (error) {
            console.error("Widget Studio Simulator Fehler:", error);
            return res.status(400).json({ ok: false, error: error.message || "Simulator-Event fehlgeschlagen." });
        }
    }
);

app.get(
    "/api/creator/widget-studio/live/events",
    requireCreatorAccount,
    async (req, res) => {
        res.set("Cache-Control", "no-store");
        try {
            const eventType = studioText(req.query?.type, 40, "") || null;
            return res.json({
                ok: true,
                events: await getRecentStudioLiveEvents(req.creatorAccount.id, eventType, req.query?.limit || 20)
            });
        } catch (error) {
            console.error("Widget Studio Event Queue Fehler:", error);
            return res.status(500).json({ ok: false, error: "Live-Events konnten nicht geladen werden." });
        }
    }
);

// ============================================================
// WIDGET STUDIO V8 - SESSIONS / INTERACTIONS
// ============================================================

app.get("/api/creator/widget-studio/live/sessions", requireCreatorAccount, async (req,res)=>{
    res.set("Cache-Control","no-store");
    try { return res.json({ok:true,sessions:await getStudioLiveSessions(req.creatorAccount.id,req.query?.limit||10)}); }
    catch(error){ console.error("Widget Studio Sessions Fehler:",error); return res.status(500).json({ok:false,error:"LIVE-Historie konnte nicht geladen werden."}); }
});

app.get("/api/creator/widget-studio/interactions", requireCreatorAccount, async (req,res)=>{
    res.set("Cache-Control","no-store");
    try { const access=await creatorAccessProfile(req.creatorAccount); return res.json({ok:true,allowed:Boolean(access.entitlements.auto_thanks),required_plan:"creator",rules:await listStudioInteractionRules(req.creatorAccount.id),output:{kind:"launcher_tts",ready:Boolean(access.entitlements.auto_thanks),label:"Launcher TTS / AutoThanks"}}); }
    catch(error){ console.error("Widget Studio Interaction Regeln Fehler:",error); return res.status(500).json({ok:false,error:"Interaction-Regeln konnten nicht geladen werden."}); }
});

app.put("/api/creator/widget-studio/interactions/:eventType", requireCreatorAccount, async (req,res)=>{
    res.set("Cache-Control","no-store");
    try { const access=await requireCreatorFeatureAccess(req.creatorAccount,"auto_thanks","creator"); const rule=await saveStudioInteractionRule(req.creatorAccount.id,String(req.params.eventType||""),req.body||{}); return res.json({ok:true,rule,access_source:access.access_source}); }
    catch(error){ console.error("Widget Studio Interaction Speichern Fehler:",error); return res.status(400).json({ok:false,error:error.message||"Interaction-Regel konnte nicht gespeichert werden."}); }
});

// ============================================================
// WIDGET STUDIO V6 - LAUNCHER BRIDGE API
// ============================================================

app.get(
    "/api/creator/launcher/releases",
    requireCreatorAccount,
    async (req, res) => {
        res.set("Cache-Control", "no-store");

        try {
            const bridge =
                await getStudioBridgeStatus(
                    req.creatorAccount.id
                );

            const currentVersion =
                studioText(
                    req.query?.current,
                    80,
                    bridge.client_version || ""
                );

            const channel =
                req.query?.channel === "beta"
                    ? "beta"
                    : "stable";

            const data =
                await launcherReleasePolicy(
                    currentVersion,
                    channel,
                    req.query?.refresh === "1",
                    `${req.creatorAccount.id}:${bridge.id || "creator-web"}`
                );

            return res.json({
                ok: true,
                bridge,
                ...data,
                server_time: new Date().toISOString()
            });
        }
        catch (error) {
            console.error(
                "Launcher Release Center Fehler:",
                error
            );

            return res
                .status(500)
                .json({
                    ok: false,
                    error: "Launcher-Releases konnten nicht geladen werden."
                });
        }
    }
);


app.get("/api/admin/creator-suite/beta-center",requireCreatorAccount,requireCreatorAdmin,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        const [feedbackResult,sessionResult,metricResult]=await Promise.all([
            pool.query(`SELECT f.*,c.display_name AS creator_display_name,c.email AS creator_email FROM creator_beta_feedback f JOIN creator_accounts c ON c.id=f.creator_id ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,f.created_at DESC LIMIT 250`),
            pool.query(`SELECT s.*,c.display_name AS creator_display_name,c.email AS creator_email FROM creator_beta_sessions s JOIN creator_accounts c ON c.id=s.creator_id ORDER BY s.started_at DESC LIMIT 150`),
            pool.query(`SELECT (SELECT COUNT(*)::int FROM creator_beta_testers WHERE status='active') AS active_beta_testers,(SELECT COUNT(*)::int FROM creator_beta_sessions WHERE status='completed') AS completed_sessions,(SELECT COUNT(DISTINCT creator_id)::int FROM creator_beta_sessions WHERE status='completed') AS tested_creators,(SELECT COUNT(*)::int FROM creator_beta_feedback WHERE status IN ('new','reviewing')) AS open_feedback,(SELECT COUNT(*)::int FROM creator_beta_feedback WHERE status IN ('new','reviewing') AND severity='critical') AS open_critical,(SELECT COUNT(*)::int FROM creator_beta_feedback WHERE status IN ('new','reviewing') AND severity='high') AS open_high`)
        ]);
        const metrics=metricResult.rows[0]||{};
        return res.json({ok:true,generated_at:new Date().toISOString(),summary:{active_beta_testers:Number(metrics.active_beta_testers||0),completed_sessions:Number(metrics.completed_sessions||0),tested_creators:Number(metrics.tested_creators||0),open_feedback:Number(metrics.open_feedback||0),open_critical:Number(metrics.open_critical||0),open_high:Number(metrics.open_high||0)},release_candidate:releaseCandidateReadiness(metrics),feedback:feedbackResult.rows.map(row=>({...publicBetaFeedback(row),creator:{display_name:row.creator_display_name||"Creator",email:row.creator_email||""}})),sessions:sessionResult.rows.map(row=>({...publicBetaSession(row),creator:{display_name:row.creator_display_name||"Creator",email:row.creator_email||""}}))});
    }catch(error){console.error("Beta Center Fehler:",error);return res.status(500).json({ok:false,error:"Beta Center konnte nicht geladen werden."})}
});
async function loadProductionEvidence(){
    const rows=(await pool.query(`SELECT * FROM creator_production_evidence ORDER BY observed_at DESC,created_at DESC LIMIT 500`)).rows;
    return{rows,...verificationFlagsFromEvidence(rows,{releaseVersion:PRODUCTION_EVIDENCE_RELEASE_VERSION})};
}
async function loadStripeTestmodeEvidence(){
    const rows=(await pool.query(`SELECT event_id,event_type,creator_id,event_created,livemode,outcome,processed_at FROM creator_billing_events WHERE livemode=FALSE AND processed_at >= NOW()-INTERVAL '30 days' ORDER BY processed_at DESC LIMIT 500`)).rows;
    return stripeTestmodeE2E(rows,{lookbackDays:14});
}
function mergeProductionVerificationFlags(evidenceFlags={}){
    const merged={...PRODUCTION_VERIFICATION_FLAGS};
    for(const [key,value] of Object.entries(evidenceFlags||{})){if(value===true)merged[key]=true}
    return merged;
}


async function loadProductionReadinessBundle(){
    const metricResult=await pool.query(`SELECT (SELECT COUNT(*)::int FROM creator_beta_testers WHERE status='active') AS active_beta_testers,(SELECT COUNT(*)::int FROM creator_beta_sessions WHERE status='completed') AS completed_sessions,(SELECT COUNT(DISTINCT creator_id)::int FROM creator_beta_sessions WHERE status='completed') AS tested_creators,(SELECT COUNT(*)::int FROM creator_beta_feedback WHERE status IN ('new','reviewing')) AS open_feedback,(SELECT COUNT(*)::int FROM creator_beta_feedback WHERE status IN ('new','reviewing') AND severity='critical') AS open_critical,(SELECT COUNT(*)::int FROM creator_beta_feedback WHERE status IN ('new','reviewing') AND severity='high') AS open_high`);
    const metrics=metricResult.rows[0]||{},rc=releaseCandidateReadiness(metrics);
    const [evidence,stripeTestmode,billingMetrics,recentEvents]=await Promise.all([
        loadProductionEvidence(),
        loadStripeTestmodeEvidence(),
        pool.query(`SELECT status,COUNT(*)::int AS count FROM creator_billing_subscriptions GROUP BY status ORDER BY status`).then(r=>r.rows),
        pool.query(`SELECT event_id,event_type,creator_id,event_created,livemode,outcome,summary,processed_at FROM creator_billing_events ORDER BY processed_at DESC LIMIT 50`).then(r=>r.rows)
    ]);
    const flags=mergeProductionVerificationFlags(evidence.flags);
    const readiness=productionReleaseReadiness({billing:BILLING_CONFIG,appBaseUrl:APP_BASE_URL,releaseCandidate:rc,flags,stripeTestmode});
    return{metrics,rc,evidence,stripeTestmode,billingMetrics,recentEvents,flags,readiness};
}

async function loadReleaseOperationsState(){
    const production=await loadProductionReadinessBundle();
    const [acceptanceRows,cohortRows,memberRows,sessionRows,decisionRows]=await Promise.all([
        pool.query(`SELECT * FROM creator_release_acceptances WHERE release_version=$1 ORDER BY updated_at DESC,created_at DESC LIMIT 250`,[PRODUCTION_EVIDENCE_RELEASE_VERSION]).then(r=>r.rows),
        pool.query(`SELECT * FROM creator_release_cohorts WHERE release_version=$1 ORDER BY updated_at DESC,created_at DESC LIMIT 50`,[PRODUCTION_EVIDENCE_RELEASE_VERSION]).then(r=>r.rows),
        pool.query(`SELECT m.*,c.display_name,c.email FROM creator_release_cohort_members m JOIN creator_release_cohorts r ON r.id=m.cohort_id JOIN creator_accounts c ON c.id=m.creator_id WHERE r.release_version=$1 ORDER BY m.updated_at DESC`,[PRODUCTION_EVIDENCE_RELEASE_VERSION]).then(r=>r.rows),
        pool.query(`SELECT creator_id,launcher_version,status,started_at,ended_at FROM creator_beta_sessions WHERE status='completed' AND (launcher_version=$1 OR launcher_version='') ORDER BY started_at DESC`,[PRODUCTION_EVIDENCE_RELEASE_VERSION]).then(r=>r.rows),
        pool.query(`SELECT * FROM creator_release_decisions WHERE release_version=$1 ORDER BY created_at DESC LIMIT 50`,[PRODUCTION_EVIDENCE_RELEASE_VERSION]).then(r=>r.rows)
    ]);
    const membersByCohort={};
    for(const row of memberRows){
        const key=String(row.cohort_id);
        if(!membersByCohort[key])membersByCohort[key]=[];
        membersByCohort[key].push({...row,creator:{display_name:row.display_name||"Creator",email:row.email||""}});
    }
    const cohorts=cohortRows.map(row=>({...row,members:membersByCohort[String(row.id)]||[],evaluation:evaluateCohort(row,membersByCohort[String(row.id)]||[],sessionRows)}));
    const cohortReadiness=releaseCohortReadiness(cohortRows,membersByCohort,sessionRows);
    const latest=latestAcceptances(acceptanceRows,PRODUCTION_EVIDENCE_RELEASE_VERSION);
    const assessment=goNoGoAssessment({
        production:production.readiness,
        acceptances:latest,
        cohorts:cohortReadiness,
        feedback:production.metrics,
        releaseVersion:PRODUCTION_EVIDENCE_RELEASE_VERSION
    });
    return{
        production,acceptanceRows,latestAcceptances:latest,
        cohorts,cohortReadiness,sessionRows,decisions:decisionRows,assessment
    };
}

app.get("/api/admin/creator-suite/config-doctor",requireCreatorAccount,requireCreatorAdmin,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        const report=runtimeDoctor(process.env);
        return res.json({
            ok:true,
            generated_at:new Date().toISOString(),
            backend_version:BACKEND_VERSION,
            launcher_target:LAUNCHER_BUILD_TARGET_VERSION,
            release_evidence_version:PRODUCTION_EVIDENCE_RELEASE_VERSION,
            runtime:report
        });
    }catch(error){
        console.error("Config Doctor Fehler:",error);
        return res.status(500).json({ok:false,error:"Config Doctor konnte nicht ausgeführt werden."});
    }
});

app.get("/api/admin/creator-suite/production-readiness",requireCreatorAccount,requireCreatorAdmin,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        const state=await loadProductionReadinessBundle();
        return res.json({
            ok:true,generated_at:new Date().toISOString(),release_version:PRODUCTION_EVIDENCE_RELEASE_VERSION,
            readiness:state.readiness,
            evidence:{kinds:EVIDENCE_KINDS,latest:state.evidence.latest,history:state.evidence.rows.slice(0,100).map(publicProductionEvidence)},
            stripe_testmode:state.stripeTestmode,
            billing:{config:BILLING_CONFIG,subscriptions_by_status:state.billingMetrics,recent_events:state.recentEvents},
            release_candidate:state.rc
        });
    }catch(error){console.error("Production Readiness Fehler:",error);return res.status(500).json({ok:false,error:"Production Readiness konnte nicht geladen werden."});}
});

app.post("/api/admin/creator-suite/production-evidence",requireCreatorAccount,requireCreatorAdmin,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        const item=sanitizeProductionEvidence(req.body||{},{releaseVersion:PRODUCTION_EVIDENCE_RELEASE_VERSION});
        if(item.status==="verified"&&!item.reference&&!item.artifact_sha256&&item.notes.length<12){
            return res.status(400).json({ok:false,error:"Verifizierte Evidence braucht Referenz, SHA256 oder eine nachvollziehbare Notiz."});
        }
        const result=await pool.query(`
            INSERT INTO creator_production_evidence(kind,status,source,release_version,environment,target,reference,artifact_sha256,notes,details,observed_at,expires_at,created_by,created_at,updated_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,NOW(),NOW())
            RETURNING *
        `,[
            item.kind,item.status,item.source,item.release_version,item.environment,item.target,item.reference,item.artifact_sha256,item.notes,
            JSON.stringify(item.details||{}),item.observed_at,item.expires_at,req.creatorAccount.id
        ]);
        return res.status(201).json({ok:true,evidence:publicProductionEvidence(result.rows[0])});
    }catch(error){
        const msg=String(error?.message||"");
        if(msg.includes("Evidence")||msg.includes("SHA256"))return res.status(400).json({ok:false,error:msg});
        console.error("Production Evidence Fehler:",error);
        return res.status(500).json({ok:false,error:"Production Evidence konnte nicht gespeichert werden."});
    }
});


app.get("/api/admin/creator-suite/release-operations",requireCreatorAccount,requireCreatorAdmin,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        const state=await loadReleaseOperationsState();
        const protocols=Object.fromEntries(Object.entries(RELEASE_ACCEPTANCE_PROTOCOLS).map(([key,value])=>[key,{key,label:value.label,steps:value.steps.map(([id,label,required])=>({id,label,required:required!==false}))}]));
        return res.json({
            ok:true,generated_at:new Date().toISOString(),release_version:PRODUCTION_EVIDENCE_RELEASE_VERSION,
            protocols,
            acceptances:{latest:state.latestAcceptances,history:state.acceptanceRows.slice(0,100).map(publicAcceptance)},
            cohorts:{stages:BETA_COHORT_STAGES,readiness:state.cohortReadiness,items:state.cohorts},
            go_no_go:state.assessment,
            decisions:state.decisions
        });
    }catch(error){console.error("Release Operations Fehler:",error);return res.status(500).json({ok:false,error:"Release Operations konnten nicht geladen werden."});}
});

app.post("/api/admin/creator-suite/release-acceptance",requireCreatorAccount,requireCreatorAdmin,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        const item=sanitizeAcceptance(req.body||{},{releaseVersion:PRODUCTION_EVIDENCE_RELEASE_VERSION});
        const result=await pool.query(`
            INSERT INTO creator_release_acceptances(protocol,release_version,environment,target,reference,status,step_results,notes,created_by,created_at,updated_at)
            VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,NOW(),NOW())
            RETURNING *
        `,[item.protocol,item.release_version,item.environment,item.target,item.reference,item.status,JSON.stringify(item.step_results),item.notes,req.creatorAccount.id]);
        return res.status(201).json({ok:true,acceptance:publicAcceptance(result.rows[0])});
    }catch(error){
        const msg=String(error?.message||"");
        if(msg.includes("Acceptance")||msg.includes("Protokoll"))return res.status(400).json({ok:false,error:msg});
        console.error("Release Acceptance Fehler:",error);return res.status(500).json({ok:false,error:"Release Acceptance konnte nicht gespeichert werden."});
    }
});

app.post("/api/admin/creator-suite/release-cohorts",requireCreatorAccount,requireCreatorAdmin,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        const item=sanitizeCohort(req.body||{},{releaseVersion:PRODUCTION_EVIDENCE_RELEASE_VERSION});
        const result=await pool.query(`
            INSERT INTO creator_release_cohorts(release_version,name,stage,target_testers,status,notes,created_by,created_at,updated_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) RETURNING *
        `,[item.release_version,item.name,item.stage,item.target_testers,item.status,item.notes,req.creatorAccount.id]);
        return res.status(201).json({ok:true,cohort:result.rows[0]});
    }catch(error){console.error("Release Cohort Fehler:",error);return res.status(500).json({ok:false,error:"Release Cohort konnte nicht erstellt werden."});}
});

app.put("/api/admin/creator-suite/release-cohorts/:id",requireCreatorAccount,requireCreatorAdmin,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        const existing=(await pool.query(`SELECT * FROM creator_release_cohorts WHERE id=$1 AND release_version=$2`,[req.params.id,PRODUCTION_EVIDENCE_RELEASE_VERSION])).rows[0];
        if(!existing)return res.status(404).json({ok:false,error:"Release Cohort nicht gefunden."});
        const item=sanitizeCohort({...existing,...req.body,release_version:PRODUCTION_EVIDENCE_RELEASE_VERSION},{releaseVersion:PRODUCTION_EVIDENCE_RELEASE_VERSION});
        const result=await pool.query(`UPDATE creator_release_cohorts SET name=$2,stage=$3,target_testers=$4,status=$5,notes=$6,updated_at=NOW() WHERE id=$1 RETURNING *`,[existing.id,item.name,item.stage,item.target_testers,item.status,item.notes]);
        return res.json({ok:true,cohort:result.rows[0]});
    }catch(error){return res.status(500).json({ok:false,error:"Release Cohort konnte nicht aktualisiert werden."});}
});

app.put("/api/admin/creator-suite/release-cohorts/:id/members/:creatorId",requireCreatorAccount,requireCreatorAdmin,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        const cohort=(await pool.query(`SELECT id FROM creator_release_cohorts WHERE id=$1 AND release_version=$2`,[req.params.id,PRODUCTION_EVIDENCE_RELEASE_VERSION])).rows[0];
        if(!cohort)return res.status(404).json({ok:false,error:"Release Cohort nicht gefunden."});
        const item=sanitizeMember({...req.body,creator_id:req.params.creatorId});
        const creator=(await pool.query(`SELECT id FROM creator_accounts WHERE id=$1`,[item.creator_id])).rows[0];
        if(!creator)return res.status(404).json({ok:false,error:"Creator nicht gefunden."});
        const result=await pool.query(`
            INSERT INTO creator_release_cohort_members(cohort_id,creator_id,status,sessions_required,notes,created_at,updated_at)
            VALUES($1,$2,$3,$4,$5,NOW(),NOW())
            ON CONFLICT(cohort_id,creator_id) DO UPDATE SET status=EXCLUDED.status,sessions_required=EXCLUDED.sessions_required,notes=EXCLUDED.notes,updated_at=NOW()
            RETURNING *
        `,[cohort.id,item.creator_id,item.status,item.sessions_required,item.notes]);
        return res.json({ok:true,member:result.rows[0]});
    }catch(error){
        const msg=String(error?.message||"");
        if(msg.includes("Creator-ID"))return res.status(400).json({ok:false,error:msg});
        return res.status(500).json({ok:false,error:"Cohort-Mitglied konnte nicht aktualisiert werden."});
    }
});

app.post("/api/admin/creator-suite/release-decisions",requireCreatorAccount,requireCreatorAdmin,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        const state=await loadReleaseOperationsState();
        const item=sanitizeDecision(req.body||{},state.assessment);
        const snapshot={
            go_no_go:state.assessment,
            production:{score:state.production.readiness.score,blocking:state.production.readiness.blocking},
            cohorts:state.cohortReadiness,
            acceptances:Object.fromEntries(Object.entries(state.latestAcceptances).map(([key,value])=>[key,value?{id:value.id,status:value.status,evaluation:value.evaluation}:null]))
        };
        const result=await pool.query(`
            INSERT INTO creator_release_decisions(release_version,recommendation,decision,rationale,snapshot,created_by,created_at)
            VALUES($1,$2,$3,$4,$5::jsonb,$6,NOW()) RETURNING *
        `,[PRODUCTION_EVIDENCE_RELEASE_VERSION,state.assessment.recommendation,item.decision,item.rationale,JSON.stringify(snapshot),req.creatorAccount.id]);
        return res.status(201).json({ok:true,decision:result.rows[0]});
    }catch(error){
        const msg=String(error?.message||"");
        if(msg.includes("Entscheidung")||msg.includes("GO ist blockiert"))return res.status(400).json({ok:false,error:msg});
        console.error("Go/No-Go Decision Fehler:",error);return res.status(500).json({ok:false,error:"Go/No-Go Entscheidung konnte nicht gespeichert werden."});
    }
});

app.get("/api/admin/creator-suite/billing-center",requireCreatorAccount,requireCreatorAdmin,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        const subscriptions=(await pool.query(`SELECT b.creator_id,b.provider,b.plan,b.status,b.current_period_end,b.grace_ends_at,b.cancel_at_period_end,b.last_invoice_status,b.updated_at,c.display_name,c.email FROM creator_billing_subscriptions b JOIN creator_accounts c ON c.id=b.creator_id ORDER BY b.updated_at DESC LIMIT 250`)).rows.map(row=>({...publicBillingSubscription(row),creator_id:row.creator_id,creator:{display_name:row.display_name||"Creator",email:row.email||""},updated_at:row.updated_at||null}));
        const events=(await pool.query(`SELECT event_id,event_type,creator_id,event_created,livemode,outcome,summary,processed_at FROM creator_billing_events ORDER BY processed_at DESC LIMIT 100`)).rows;
        return res.json({ok:true,generated_at:new Date().toISOString(),config:BILLING_CONFIG,subscriptions,events});
    }catch(error){return res.status(500).json({ok:false,error:"Billing Center konnte nicht geladen werden."});}
});

app.put("/api/admin/creator-suite/beta-feedback/:id",requireCreatorAccount,requireCreatorAdmin,async(req,res)=>{
    try{
        const status=BETA_FEEDBACK_STATUSES.has(String(req.body?.status||""))?String(req.body.status):"new";
        const result=await pool.query(`UPDATE creator_beta_feedback SET status=$2,admin_notes=$3,updated_at=NOW() WHERE id=$1 RETURNING *`,[betaText(req.params.id,120,""),status,betaText(req.body?.admin_notes,5000,"")]);
        if(!result.rows[0])return res.status(404).json({ok:false,error:"Feedback nicht gefunden."});
        return res.json({ok:true,feedback:publicBetaFeedback(result.rows[0])});
    }catch(error){return res.status(500).json({ok:false,error:"Feedback konnte nicht aktualisiert werden."})}
});

app.get(
    "/api/admin/creator-suite/overview",
    requireCreatorAccount,
    requireCreatorAdmin,
    async(req,res)=>{
        res.set("Cache-Control","no-store");
        try {
            const result=await pool.query(`
                WITH widget_counts AS (
                    SELECT creator_id,
                           COUNT(*)::int AS widgets_total,
                           COUNT(*) FILTER (WHERE status='live')::int AS widgets_live
                    FROM creator_widgets GROUP BY creator_id
                ),
                scene_counts AS (
                    SELECT creator_id,
                           COUNT(*)::int AS scenes_total,
                           COUNT(*) FILTER (WHERE status='live')::int AS scenes_live
                    FROM creator_widget_scenes GROUP BY creator_id
                ),
                bridge_latest AS (
                    SELECT DISTINCT ON (creator_id)
                           creator_id,status AS bridge_status,client_version,
                           machine_name,last_seen_at,last_connected_at
                    FROM creator_live_bridges
                    ORDER BY creator_id,last_seen_at DESC NULLS LAST,created_at DESC
                )
                SELECT
                    c.id,c.email,c.display_name,c.plan,c.status,c.created_at,c.updated_at,
                    t.connected AS tiktok_connected,t.display_name AS tiktok_display_name,
                    t.avatar_url,t.follower_count,t.likes_count,t.video_count,
                    t.updated_at AS tiktok_updated_at,
                    COALESCE(w.widgets_total,0) AS widgets_total,
                    COALESCE(w.widgets_live,0) AS widgets_live,
                    COALESCE(s.scenes_total,0) AS scenes_total,
                    COALESCE(s.scenes_live,0) AS scenes_live,
                    b.bridge_status,b.client_version,b.machine_name,
                    b.last_seen_at AS bridge_last_seen_at,
                    b.last_connected_at AS bridge_last_connected_at,
                    live.connected AS live_connected,live.provider AS live_provider,
                    live.last_event_at,live.updated_at AS live_updated_at,
                    beta.status AS beta_status,beta.notes AS beta_notes,
                    beta.created_at AS beta_created_at,beta.updated_at AS beta_updated_at
                FROM creator_accounts c
                LEFT JOIN tiktok_connections t ON t.creator_id=c.id
                LEFT JOIN widget_counts w ON w.creator_id=c.id
                LEFT JOIN scene_counts s ON s.creator_id=c.id
                LEFT JOIN bridge_latest b ON b.creator_id=c.id
                LEFT JOIN creator_live_state live ON live.creator_id=c.id
                LEFT JOIN creator_beta_testers beta ON beta.creator_id=c.id
                ORDER BY c.created_at DESC
                LIMIT 500
            `);

            const now=Date.now();
            const creators=result.rows.map(row=>{
                const readiness=creatorReadiness(row,now);
                return{
                    id:row.id,email:row.email,display_name:row.display_name,
                    plan:normalizePlan(row.plan),status:row.status,created_at:row.created_at,updated_at:row.updated_at,
                    tiktok:{
                        connected:Boolean(row.tiktok_connected),display_name:row.tiktok_display_name||"",avatar_url:row.avatar_url||"",
                        followers:Number(row.follower_count||0),likes:Number(row.likes_count||0),videos:Number(row.video_count||0),updated_at:row.tiktok_updated_at||null,
                        sync:readiness.sync
                    },
                    launcher:{
                        status:row.bridge_status||"",client_version:row.client_version||"",machine_name:row.machine_name||"",
                        last_seen_at:row.bridge_last_seen_at||null,last_connected_at:row.bridge_last_connected_at||null,
                        connection:readiness.bridge
                    },
                    widgets:{total:Number(row.widgets_total||0),live:Number(row.widgets_live||0)},
                    scenes:{total:Number(row.scenes_total||0),live:Number(row.scenes_live||0)},
                    live:{connected:Boolean(row.live_connected),provider:row.live_provider||"none",last_event_at:row.last_event_at||null,updated_at:row.live_updated_at||null},
                    beta:{status:row.beta_status||"none",notes:row.beta_notes||"",created_at:row.beta_created_at||null,updated_at:row.beta_updated_at||null},
                    readiness:{score:readiness.score,checks:readiness.checks}
                };
            });

            return res.json({
                ok:true,
                generated_at:new Date().toISOString(),
                summary:{
                    creators:creators.length,
                    tiktok_connected:creators.filter(c=>c.tiktok.connected).length,
                    sync_fresh:creators.filter(c=>c.tiktok.sync.key==="fresh").length,
                    launcher_online:creators.filter(c=>c.launcher.connection.key==="online").length,
                    beta_active:creators.filter(c=>c.beta.status==="active").length,
                    live_now:creators.filter(c=>c.live.connected).length
                },
                creators
            });
        }catch(error){
            console.error("Creator Admin Overview Fehler:",error);
            return res.status(500).json({ok:false,error:"Creator Übersicht konnte nicht geladen werden."});
        }
    }
);

app.put(
    "/api/admin/creator-suite/creators/:id/beta",
    requireCreatorAccount,
    requireCreatorAdmin,
    async(req,res)=>{
        try {
            const creatorId=studioText(req.params.id,120,"");
            const status=["none","active","paused"].includes(String(req.body?.status||""))?String(req.body.status):"none";
            const notes=studioText(req.body?.notes,1200,"");
            const exists=await pool.query(`SELECT id FROM creator_accounts WHERE id=$1 LIMIT 1`,[creatorId]);
            if(!exists.rowCount)return res.status(404).json({ok:false,error:"Creator nicht gefunden."});
            if(status==="none"){
                await pool.query(`DELETE FROM creator_beta_testers WHERE creator_id=$1`,[creatorId]);
                return res.json({ok:true,beta:{status:"none",notes:""}});
            }
            const result=await pool.query(`
                INSERT INTO creator_beta_testers(creator_id,status,notes,created_at,updated_at)
                VALUES($1,$2,$3,NOW(),NOW())
                ON CONFLICT(creator_id) DO UPDATE SET status=EXCLUDED.status,notes=EXCLUDED.notes,updated_at=NOW()
                RETURNING status,notes,created_at,updated_at
            `,[creatorId,status,notes]);
            return res.json({ok:true,beta:result.rows[0]});
        }catch(error){
            console.error("Beta Status Fehler:",error);
            return res.status(500).json({ok:false,error:"Beta-Status konnte nicht gespeichert werden."});
        }
    }
);

app.post(
    "/api/admin/creator-suite/creators/:id/sync-tiktok",
    requireCreatorAccount,
    requireCreatorAdmin,
    async(req,res)=>{
        res.set("Cache-Control","no-store");
        try {
            const creatorId=studioText(req.params.id,120,"");
            const connection=await getConnection(creatorId);
            if(!connection?.connected)return res.status(409).json({ok:false,error:"Dieser Creator hat TikTok noch nicht verbunden."});
            const profile=await fetchTikTokProfile(creatorId);
            return res.json({ok:true,profile});
        }catch(error){
            const diagnostic=getSafeDiagnostic(error,"admin_creator_sync");
            return res.status(502).json({ok:false,error:diagnosticMessage(diagnostic),diagnostic});
        }
    }
);

// ============================================================
// V28 — CREATOR GAMES RUNTIME
// ============================================================
app.get("/api/creator/games/rules",requireCreatorAccount,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        const access=await requireCreatorFeatureAccess(req.creatorAccount,"games","creator");
        return res.json({ok:true,rules:await listCreatorGameRules(req.creatorAccount.id),recent_hits:await recentCreatorGameRuleHits(req.creatorAccount.id,25),limits:{max_rules:Number(access.entitlements.max_game_rules||0)}});
    }catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Game-Regeln konnten nicht geladen werden."})}
});
app.post("/api/creator/games/rules",requireCreatorAccount,async(req,res)=>{
    try{
        const access=await requireCreatorFeatureAccess(req.creatorAccount,"games","creator");
        const count=await pool.query(`SELECT COUNT(*)::int AS count FROM creator_game_rules WHERE creator_id=$1`,[req.creatorAccount.id]);
        const max=Number(access.entitlements.max_game_rules||0);
        if(Number(count.rows[0]?.count||0)>=max)return res.status(403).json({ok:false,error:`Dein Zugriff erlaubt maximal ${max} Game-Regeln.`});
        const clean=sanitizeGameRule(req.body||{});
        const result=await pool.query(`INSERT INTO creator_game_rules(creator_id,label,enabled,event_type,team,points,amount_mode,min_amount,gift_name,gift_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW()) RETURNING *`,[req.creatorAccount.id,clean.label,clean.enabled,clean.event_type,clean.team,clean.points,clean.amount_mode,clean.min_amount,clean.gift_name,clean.gift_id]);
        return res.status(201).json({ok:true,rule:publicGameRule(result.rows[0])});
    }catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Game-Regel konnte nicht erstellt werden."})}
});
app.put("/api/creator/games/rules/:id",requireCreatorAccount,async(req,res)=>{
    try{
        await requireCreatorFeatureAccess(req.creatorAccount,"games","creator");
        const clean=sanitizeGameRule(req.body||{});
        const result=await pool.query(`UPDATE creator_game_rules SET label=$3,enabled=$4,event_type=$5,team=$6,points=$7,amount_mode=$8,min_amount=$9,gift_name=$10,gift_id=$11,updated_at=NOW() WHERE creator_id=$1 AND id=$2 RETURNING *`,[req.creatorAccount.id,req.params.id,clean.label,clean.enabled,clean.event_type,clean.team,clean.points,clean.amount_mode,clean.min_amount,clean.gift_name,clean.gift_id]);
        if(!result.rows[0])return res.status(404).json({ok:false,error:"Game-Regel nicht gefunden."});
        return res.json({ok:true,rule:publicGameRule(result.rows[0])});
    }catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Game-Regel konnte nicht gespeichert werden."})}
});
app.delete("/api/creator/games/rules/:id",requireCreatorAccount,async(req,res)=>{
    try{
        await requireCreatorFeatureAccess(req.creatorAccount,"games","creator");
        const result=await pool.query(`DELETE FROM creator_game_rules WHERE creator_id=$1 AND id=$2 RETURNING id`,[req.creatorAccount.id,req.params.id]);
        if(!result.rows[0])return res.status(404).json({ok:false,error:"Game-Regel nicht gefunden."});
        return res.json({ok:true});
    }catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Game-Regel konnte nicht gelöscht werden."})}
});

app.get("/api/creator/games/runtime",requireCreatorAccount,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{const access=await requireCreatorFeatureAccess(req.creatorAccount,"games","creator");return res.json({ok:true,profile:await getCreatorGameProfile(req.creatorAccount.id),runtime:await getCreatorGameRuntimePublic(req.creatorAccount.id,{ensure:true}),access_source:access.access_source})}
    catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Game Runtime konnte nicht geladen werden."})}
});
app.post("/api/creator/games/runtime/start",requireCreatorAccount,async(req,res)=>{try{await requireCreatorFeatureAccess(req.creatorAccount,"games","creator");return res.json({ok:true,runtime:await startCreatorGameRuntime(req.creatorAccount.id)})}catch(error){return res.status(error?.code==="creator_feature_locked"?403:400).json({ok:false,error:error.message||"Game konnte nicht gestartet werden."})}});
app.post("/api/creator/games/runtime/stop",requireCreatorAccount,async(req,res)=>{try{await requireCreatorFeatureAccess(req.creatorAccount,"games","creator");return res.json({ok:true,runtime:await stopCreatorGameRuntime(req.creatorAccount.id)})}catch(error){return res.status(error?.code==="creator_feature_locked"?403:400).json({ok:false,error:error.message||"Game konnte nicht gestoppt werden."})}});
app.post("/api/creator/games/runtime/reset",requireCreatorAccount,async(req,res)=>{try{await requireCreatorFeatureAccess(req.creatorAccount,"games","creator");return res.json({ok:true,runtime:await resetCreatorGameRuntime(req.creatorAccount.id)})}catch(error){return res.status(error?.code==="creator_feature_locked"?403:400).json({ok:false,error:error.message||"Game konnte nicht zurückgesetzt werden."})}});
app.post("/api/creator/games/runtime/score",requireCreatorAccount,async(req,res)=>{try{await requireCreatorFeatureAccess(req.creatorAccount,"games","creator");return res.json({ok:true,runtime:await scoreCreatorGameRuntime(req.creatorAccount.id,req.body||{})})}catch(error){return res.status(error?.code==="creator_feature_locked"?403:error?.code==="game_not_running"?409:400).json({ok:false,error:error.message||"Game Score konnte nicht geändert werden."})}});
app.get("/api/games/runtime/:token",studioPublicReadLimiter,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{const payload=await getPublicGameRuntimeByToken(req.params.token);if(!payload)return res.status(404).json({ok:false,error:"Game Runtime nicht gefunden."});return res.json({ok:true,...payload,server_time:new Date().toISOString()})}
    catch(error){return res.status(500).json({ok:false,error:"Game Runtime konnte nicht geladen werden."})}
});

// ============================================================
// V28 — CUT STUDIO PROJECTS / CLIP QUEUE
// ============================================================
app.get("/api/creator/cut-studio/projects",requireCreatorAccount,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{const access=await requireCreatorFeatureAccess(req.creatorAccount,"cut_studio","creator");return res.json({ok:true,projects:await listCutProjects(req.creatorAccount.id),formats:Object.values(CUT_FORMATS),limits:{max_projects:Number(access.entitlements.max_cut_projects||0),max_clips_per_project:Number(access.entitlements.max_cut_clips_per_project||0)}})}
    catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Cut Studio Projekte konnten nicht geladen werden."})}
});
app.post("/api/creator/cut-studio/projects",requireCreatorAccount,async(req,res)=>{
    try{
        const access=await requireCreatorFeatureAccess(req.creatorAccount,"cut_studio","creator");
        const count=await pool.query(`SELECT COUNT(*)::int AS count FROM creator_cut_projects WHERE creator_id=$1`,[req.creatorAccount.id]);
        if(Number(count.rows[0]?.count||0)>=Number(access.entitlements.max_cut_projects||0))return res.status(403).json({ok:false,error:`Dein Zugriff erlaubt maximal ${Number(access.entitlements.max_cut_projects||0)} Cut-Studio Projekte.`});
        const clean=sanitizeCutProject(req.body||{});
        const result=await pool.query(`INSERT INTO creator_cut_projects(creator_id,title,status,format,notes,source_name,export_preset,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,NOW(),NOW()) RETURNING *`,[req.creatorAccount.id,clean.title,clean.status,clean.format,clean.notes,clean.source_name,JSON.stringify(clean.export_preset)]);
        return res.status(201).json({ok:true,project:publicCutProject(result.rows[0],0)});
    }catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Cut-Projekt konnte nicht erstellt werden."})}
});
app.get("/api/creator/cut-studio/projects/:id",requireCreatorAccount,async(req,res)=>{
    try{await requireCreatorFeatureAccess(req.creatorAccount,"cut_studio","creator");const data=await getCutProject(req.creatorAccount.id,req.params.id);if(!data)return res.status(404).json({ok:false,error:"Cut-Projekt nicht gefunden."});return res.json({ok:true,...data})}
    catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Cut-Projekt konnte nicht geladen werden."})}
});
app.put("/api/creator/cut-studio/projects/:id",requireCreatorAccount,async(req,res)=>{
    try{
        await requireCreatorFeatureAccess(req.creatorAccount,"cut_studio","creator");const clean=sanitizeCutProject(req.body||{});
        const result=await pool.query(`UPDATE creator_cut_projects SET title=$3,status=$4,format=$5,notes=$6,source_name=$7,export_preset=$8::jsonb,updated_at=NOW() WHERE creator_id=$1 AND id=$2 RETURNING *`,[req.creatorAccount.id,req.params.id,clean.title,clean.status,clean.format,clean.notes,clean.source_name,JSON.stringify(clean.export_preset)]);
        if(!result.rows[0])return res.status(404).json({ok:false,error:"Cut-Projekt nicht gefunden."});
        const count=await pool.query(`SELECT COUNT(*)::int AS count FROM creator_cut_clips WHERE project_id=$1`,[req.params.id]);
        return res.json({ok:true,project:publicCutProject(result.rows[0],count.rows[0]?.count||0)});
    }catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Cut-Projekt konnte nicht gespeichert werden."})}
});
app.delete("/api/creator/cut-studio/projects/:id",requireCreatorAccount,async(req,res)=>{
    try{await requireCreatorFeatureAccess(req.creatorAccount,"cut_studio","creator");const result=await pool.query(`DELETE FROM creator_cut_projects WHERE creator_id=$1 AND id=$2 RETURNING id`,[req.creatorAccount.id,req.params.id]);if(!result.rows[0])return res.status(404).json({ok:false,error:"Cut-Projekt nicht gefunden."});return res.json({ok:true})}
    catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Cut-Projekt konnte nicht gelöscht werden."})}
});
app.post("/api/creator/cut-studio/projects/:id/clips",requireCreatorAccount,async(req,res)=>{
    try{
        const access=await requireCreatorFeatureAccess(req.creatorAccount,"cut_studio","creator");const project=await getCutProject(req.creatorAccount.id,req.params.id);
        if(!project)return res.status(404).json({ok:false,error:"Cut-Projekt nicht gefunden."});
        if(project.clips.length>=Number(access.entitlements.max_cut_clips_per_project||0))return res.status(403).json({ok:false,error:`Dieses Projekt erlaubt maximal ${Number(access.entitlements.max_cut_clips_per_project||0)} Clips.`});
        const requested=sanitizeCutClip(req.body||{});
        const nextOrder=await pool.query(`SELECT COALESCE(MAX(sort_order),-1)+1 AS next_order FROM creator_cut_clips WHERE creator_id=$1 AND project_id=$2`,[req.creatorAccount.id,req.params.id]);
        const clean={...requested,sort_order:Number(nextOrder.rows[0]?.next_order||0)};
        const result=await pool.query(`INSERT INTO creator_cut_clips(project_id,creator_id,label,in_ms,out_ms,caption,selected,sort_order,caption_enabled,caption_position,caption_size,caption_style,audio_gain_db,audio_fade_in_ms,audio_fade_out_ms,keyframe_enabled,keyframe_zoom_start,keyframe_zoom_end,keyframe_pan_x_start,keyframe_pan_x_end,keyframe_pan_y_start,keyframe_pan_y_end,keyframe_easing,visual_keyframes,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,NOW(),NOW()) RETURNING *`,[req.params.id,req.creatorAccount.id,clean.label,clean.in_ms,clean.out_ms,clean.caption,clean.selected,clean.sort_order,clean.caption_enabled,clean.caption_position,clean.caption_size,clean.caption_style,clean.audio_gain_db,clean.audio_fade_in_ms,clean.audio_fade_out_ms,clean.keyframe_enabled,clean.keyframe_zoom_start,clean.keyframe_zoom_end,clean.keyframe_pan_x_start,clean.keyframe_pan_x_end,clean.keyframe_pan_y_start,clean.keyframe_pan_y_end,clean.keyframe_easing,JSON.stringify(clean.visual_keyframes||[])]);
        await pool.query(`UPDATE creator_cut_projects SET updated_at=NOW() WHERE creator_id=$1 AND id=$2`,[req.creatorAccount.id,req.params.id]);
        return res.status(201).json({ok:true,clip:publicCutClip(result.rows[0])});
    }catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Clip konnte nicht hinzugefügt werden."})}
});
app.put("/api/creator/cut-studio/projects/:projectId/clips/order",requireCreatorAccount,async(req,res)=>{
    try{
        await requireCreatorFeatureAccess(req.creatorAccount,"cut_studio","creator");
        const ids=Array.isArray(req.body?.clip_ids)?req.body.clip_ids.map(id=>studioText(id,120,"")).filter(Boolean):[];
        if(!ids.length)return res.status(400).json({ok:false,error:"Timeline-Reihenfolge fehlt."});
        if(new Set(ids).size!==ids.length)return res.status(400).json({ok:false,error:"Timeline enthält doppelte Clip-IDs."});
        const owned=await pool.query(`SELECT id FROM creator_cut_clips WHERE creator_id=$1 AND project_id=$2`,[req.creatorAccount.id,req.params.projectId]);
        const ownedSet=new Set(owned.rows.map(row=>String(row.id)));
        if(ids.length!==ownedSet.size||ids.some(id=>!ownedSet.has(String(id))))return res.status(400).json({ok:false,error:"Timeline muss alle Clips dieses Projekts genau einmal enthalten."});
        const client=await pool.connect();
        try{
            await client.query("BEGIN");
            for(let i=0;i<ids.length;i++){
                await client.query(`UPDATE creator_cut_clips SET sort_order=$4,updated_at=NOW() WHERE creator_id=$1 AND project_id=$2 AND id=$3`,[req.creatorAccount.id,req.params.projectId,ids[i],i]);
            }
            await client.query(`UPDATE creator_cut_projects SET updated_at=NOW() WHERE creator_id=$1 AND id=$2`,[req.creatorAccount.id,req.params.projectId]);
            await client.query("COMMIT");
        }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
        const data=await getCutProject(req.creatorAccount.id,req.params.projectId);
        return res.json({ok:true,clips:data?.clips||[]});
    }catch(error){
        return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Timeline konnte nicht gespeichert werden."});
    }
});

app.put("/api/creator/cut-studio/projects/:projectId/clips/:clipId",requireCreatorAccount,async(req,res)=>{
    try{
        await requireCreatorFeatureAccess(req.creatorAccount,"cut_studio","creator");const clean=sanitizeCutClip(req.body||{});
        const result=await pool.query(`UPDATE creator_cut_clips SET label=$4,in_ms=$5,out_ms=$6,caption=$7,selected=$8,caption_enabled=$9,caption_position=$10,caption_size=$11,caption_style=$12,audio_gain_db=$13,audio_fade_in_ms=$14,audio_fade_out_ms=$15,keyframe_enabled=$16,keyframe_zoom_start=$17,keyframe_zoom_end=$18,keyframe_pan_x_start=$19,keyframe_pan_x_end=$20,keyframe_pan_y_start=$21,keyframe_pan_y_end=$22,keyframe_easing=$23,visual_keyframes=$24::jsonb,updated_at=NOW() WHERE creator_id=$1 AND project_id=$2 AND id=$3 RETURNING *`,[req.creatorAccount.id,req.params.projectId,req.params.clipId,clean.label,clean.in_ms,clean.out_ms,clean.caption,clean.selected,clean.caption_enabled,clean.caption_position,clean.caption_size,clean.caption_style,clean.audio_gain_db,clean.audio_fade_in_ms,clean.audio_fade_out_ms,clean.keyframe_enabled,clean.keyframe_zoom_start,clean.keyframe_zoom_end,clean.keyframe_pan_x_start,clean.keyframe_pan_x_end,clean.keyframe_pan_y_start,clean.keyframe_pan_y_end,clean.keyframe_easing,JSON.stringify(clean.visual_keyframes||[])]);
        if(!result.rows[0])return res.status(404).json({ok:false,error:"Clip nicht gefunden."});
        await pool.query(`UPDATE creator_cut_projects SET updated_at=NOW() WHERE creator_id=$1 AND id=$2`,[req.creatorAccount.id,req.params.projectId]);
        return res.json({ok:true,clip:publicCutClip(result.rows[0])});
    }catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Clip konnte nicht gespeichert werden."})}
});
app.delete("/api/creator/cut-studio/projects/:projectId/clips/:clipId",requireCreatorAccount,async(req,res)=>{
    try{await requireCreatorFeatureAccess(req.creatorAccount,"cut_studio","creator");const result=await pool.query(`DELETE FROM creator_cut_clips WHERE creator_id=$1 AND project_id=$2 AND id=$3 RETURNING id`,[req.creatorAccount.id,req.params.projectId,req.params.clipId]);if(!result.rows[0])return res.status(404).json({ok:false,error:"Clip nicht gefunden."});await pool.query(`UPDATE creator_cut_projects SET updated_at=NOW() WHERE creator_id=$1 AND id=$2`,[req.creatorAccount.id,req.params.projectId]);return res.json({ok:true})}
    catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Clip konnte nicht gelöscht werden."})}
});


app.get(
    "/api/creator/widget-studio/scenes",
    requireCreatorAccount,
    async(req,res)=>{
        try{
            const access=await creatorAccessProfile(req.creatorAccount);
            const result=await pool.query(`SELECT * FROM creator_widget_scenes WHERE creator_id=$1 ORDER BY updated_at DESC`,[req.creatorAccount.id]);
            return res.json({
                ok:true,access,entitlements:access.entitlements,limits:{max_scenes:access.entitlements.max_scenes},
                profiles:Object.values(SCENE_PROFILES),
                scenes:result.rows.map(row=>publicSceneRow(row,APP_BASE_URL)),
                widgets:(await getCreatorSceneSources(req.creatorAccount.id,{includeGame:Boolean(access.entitlements.games)}))
                    .filter(widget=>widget.status==="live")
                    .map(widget=>({
                        id:widget.id,
                        name:widget.name,
                        widget_type:widget.widget_type,
                        source_url:widget.source_url,
                        source_urls:widget.source_urls||{},
                        canvas:widget.published_config?.canvas||{width:600,height:120}
                    }))
            });
        }catch(error){console.error("Scene Liste Fehler:",error);return res.status(500).json({ok:false,error:"Scenes konnten nicht geladen werden."})}
    }
);

app.post(
    "/api/creator/widget-studio/scenes",
    requireCreatorAccount,
    async(req,res)=>{
        try{
            const access=await creatorAccessProfile(req.creatorAccount);
            const countResult=await pool.query(`SELECT COUNT(*)::int AS count FROM creator_widget_scenes WHERE creator_id=$1`,[req.creatorAccount.id]);
            if(Number(countResult.rows[0]?.count||0)>=Number(access.entitlements.max_scenes||0))return res.status(403).json({...accessDeniedPayload(access,"max_scenes",access.plan==="free"?"creator":"pro"),error:`Dein Zugriff erlaubt maximal ${Number(access.entitlements.max_scenes||0)} Scenes.`});
            const name=studioText(req.body?.name,120,"Neue Scene");
            const config=sanitizeSceneConfig(req.body?.config||{profile:req.body?.profile||"tiktok_vertical",canvas:{background:"transparent",safe_area:true},items:[]});
            const result=await pool.query(
                `INSERT INTO creator_widget_scenes (id,creator_id,name,status,draft_config,public_token) VALUES($1,$2,$3,'draft',$4::jsonb,$5) RETURNING *`,
                [crypto.randomUUID(),req.creatorAccount.id,name,JSON.stringify(config),scenePublicToken()]
            );
            return res.status(201).json({ok:true,scene:publicSceneRow(result.rows[0],APP_BASE_URL)});
        }catch(error){console.error("Scene Create Fehler:",error);return res.status(500).json({ok:false,error:"Scene konnte nicht erstellt werden."})}
    }
);

app.put(
    "/api/creator/widget-studio/scenes/:id",
    requireCreatorAccount,
    async(req,res)=>{
        try{
            const existing=await getCreatorSceneRow(req.creatorAccount.id,req.params.id);
            if(!existing)return res.status(404).json({ok:false,error:"Scene nicht gefunden."});
            const access=await creatorAccessProfile(req.creatorAccount);
            const config=sanitizeSceneConfig(req.body?.config||existing.draft_config||{});
            const ownership=validateSceneOwnership(config,await getCreatorSceneSources(req.creatorAccount.id,{includeGame:Boolean(access.entitlements.games)}));
            if(!ownership.ok)return res.status(400).json({ok:false,error:"Scene enthält ungültige oder nicht veröffentlichte Widgets.",scene_errors:ownership.errors});
            const name=studioText(req.body?.name,120,existing.name||"Scene");
            const result=await pool.query(
                `UPDATE creator_widget_scenes SET name=$3,draft_config=$4::jsonb,updated_at=NOW() WHERE creator_id=$1 AND id=$2 RETURNING *`,
                [req.creatorAccount.id,req.params.id,name,JSON.stringify(config)]
            );
            return res.json({ok:true,scene:publicSceneRow(result.rows[0],APP_BASE_URL)});
        }catch(error){console.error("Scene Save Fehler:",error);return res.status(500).json({ok:false,error:"Scene konnte nicht gespeichert werden."})}
    }
);

app.post(
    "/api/creator/widget-studio/scenes/:id/publish",
    requireCreatorAccount,
    async(req,res)=>{
        try{
            const existing=await getCreatorSceneRow(req.creatorAccount.id,req.params.id);
            if(!existing)return res.status(404).json({ok:false,error:"Scene nicht gefunden."});
            const access=await creatorAccessProfile(req.creatorAccount);
            const config=sanitizeSceneConfig(existing.draft_config||{});
            if(!config.items.length)return res.status(400).json({ok:false,error:"Eine Scene benötigt mindestens ein Widget oder Game-Overlay."});
            const ownership=validateSceneOwnership(config,await getCreatorSceneSources(req.creatorAccount.id,{includeGame:Boolean(access.entitlements.games)}));
            if(!ownership.ok)return res.status(400).json({ok:false,error:"Vor Publish müssen alle Scene-Widgets veröffentlicht sein.",scene_errors:ownership.errors});
            const result=await pool.query(
                `UPDATE creator_widget_scenes SET status='live',published_config=draft_config,version=version+1,published_at=NOW(),updated_at=NOW() WHERE creator_id=$1 AND id=$2 RETURNING *`,
                [req.creatorAccount.id,req.params.id]
            );
            return res.json({ok:true,scene:publicSceneRow(result.rows[0],APP_BASE_URL)});
        }catch(error){console.error("Scene Publish Fehler:",error);return res.status(500).json({ok:false,error:"Scene konnte nicht veröffentlicht werden."})}
    }
);

app.delete(
    "/api/creator/widget-studio/scenes/:id",
    requireCreatorAccount,
    async(req,res)=>{
        try{
            const result=await pool.query(`DELETE FROM creator_widget_scenes WHERE creator_id=$1 AND id=$2 RETURNING id`,[req.creatorAccount.id,req.params.id]);
            if(!result.rows[0])return res.status(404).json({ok:false,error:"Scene nicht gefunden."});
            return res.json({ok:true});
        }catch(error){console.error("Scene Delete Fehler:",error);return res.status(500).json({ok:false,error:"Scene konnte nicht gelöscht werden."})}
    }
);

app.get(
    "/api/widgets/scene/:token",
    studioPublicReadLimiter,
    async(req,res)=>{
        res.set("Cache-Control","no-store");
        try{
            const token=studioText(req.params.token,160,""),row=await getPublicSceneRow(token);
            if(!row)return res.status(404).json({ok:false,error:"Scene nicht gefunden."});
            return res.json({ok:true,...(await hydratePublicScene(row)),server_time:new Date().toISOString()});
        }catch(error){console.error("Public Scene Fehler:",error);return res.status(500).json({ok:false,error:"Scene konnte nicht geladen werden."})}
    }
);


app.post(
    "/api/launcher/device-link/start",
    launcherDeviceStartLimiter,
    async (req,res) => {
        res.set("Cache-Control","no-store");
        try {
            const link=await createLauncherDeviceLink({
                machine_name:req.body?.machine_name,
                client_version:req.body?.client_version
            });
            return res.status(201).json({ok:true,...link});
        } catch (error) {
            console.error("Launcher Device Link Start Fehler:",error);
            return res.status(500).json({ok:false,error:"Launcher-Verknüpfung konnte nicht gestartet werden."});
        }
    }
);

app.post(
    "/api/launcher/device-link/poll",
    launcherDevicePollLimiter,
    async (req,res) => {
        res.set("Cache-Control","no-store");
        try {
            await cleanupLauncherDeviceLinks();
            const link=await getLauncherDeviceLinkBySecret(
                req.body?.device_link_id,
                req.body?.device_secret
            );
            if(!link)return res.status(401).json({ok:false,error:"Geräte-Verknüpfung ist ungültig."});

            if(link.expires_at && new Date(link.expires_at).getTime() <= Date.now()){
                return res.json({
                    ok:true,
                    status:"expired",
                    approved:false,
                    expires_at:link.expires_at,
                    poll_after_ms:LAUNCHER_DEVICE_POLL_AFTER_MS
                });
            }

            if(link.status==="approved"||link.status==="consumed"){
                if(link.status==="approved"){
                    await pool.query(
                        `UPDATE creator_launcher_device_links SET status='consumed',consumed_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='approved'`,
                        [link.id]
                    );
                }
                const creator=link.creator_id?await studioCreatorIdentity(link.creator_id):null;
                return res.json({
                    ok:true,
                    status:"approved",
                    approved:true,
                    bridge_id:link.bridge_id || null,
                    creator,
                    poll_after_ms:LAUNCHER_DEVICE_POLL_AFTER_MS
                });
            }

            return res.json({
                ok:true,
                status:link.status || "pending",
                approved:false,
                expires_at:link.expires_at,
                poll_after_ms:LAUNCHER_DEVICE_POLL_AFTER_MS
            });
        } catch (error) {
            console.error("Launcher Device Link Poll Fehler:",error);
            return res.status(500).json({ok:false,error:"Verknüpfungsstatus konnte nicht geprüft werden."});
        }
    }
);

app.get(
    "/api/creator/launcher/device-link/:code",
    requireCreatorAccount,
    async (req,res) => {
        res.set("Cache-Control","no-store");
        try {
            const link=await inspectLauncherDeviceLink(req.params.code);
            if(!link)return res.status(404).json({ok:false,error:"Geräte-Code nicht gefunden."});
            return res.json({ok:true,device_link:link});
        } catch (error) {
            return res.status(500).json({ok:false,error:"Geräte-Code konnte nicht geprüft werden."});
        }
    }
);

app.post(
    "/api/creator/launcher/device-link/confirm",
    requireCreatorAccount,
    async (req,res) => {
        res.set("Cache-Control","no-store");
        try {
            const confirmed=await approveLauncherDeviceLink(
                req.creatorAccount.id,
                req.body?.user_code
            );
            return res.json({
                ok:true,
                confirmed:true,
                device:confirmed,
                account:publicCreatorAccount(req.creatorAccount),
                entitlements:getPlanEntitlements(req.creatorAccount.plan)
            });
        } catch (error) {
            const status = ["device_code_invalid","device_code_expired","device_code_used","device_limit_reached"].includes(error?.code) ? 400 : 500;
            return res.status(status).json({ok:false,error:error?.message || "Launcher konnte nicht bestätigt werden."});
        }
    }
);

app.get(
    "/api/creator/launcher/devices",
    requireCreatorAccount,
    async (req,res) => {
        res.set("Cache-Control","no-store");
        try {
            return res.json({
                ok:true,
                devices:await listCreatorLauncherDevices(req.creatorAccount.id)
            });
        } catch (error) {
            return res.status(500).json({ok:false,error:"Geräte konnten nicht geladen werden."});
        }
    }
);

app.delete(
    "/api/creator/launcher/devices/:id",
    requireCreatorAccount,
    async (req,res) => {
        res.set("Cache-Control","no-store");
        try {
            const revoked=await revokeStudioBridgeKey(req.creatorAccount.id,req.params.id);
            if(!revoked)return res.status(404).json({ok:false,error:"Aktives Gerät nicht gefunden."});
            await pool.query(
                `UPDATE creator_launcher_device_links SET status='revoked',revoked_at=NOW(),updated_at=NOW() WHERE bridge_id=$1`,
                [req.params.id]
            );
            return res.json({ok:true,revoked:true});
        } catch (error) {
            return res.status(500).json({ok:false,error:"Gerät konnte nicht widerrufen werden."});
        }
    }
);

// ============================================================
// V29 — CUT EXPORT JOBS
// Nur Manifest/Status in der Cloud. Keine Videodatei.
// ============================================================
app.get("/api/creator/cut-studio/jobs",requireCreatorAccount,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        const access=await requireCreatorFeatureAccess(req.creatorAccount,"cut_studio","creator");
        return res.json({ok:true,jobs:await listCutExportJobs(req.creatorAccount.id,75),limits:{max_pending_jobs:Number(access.entitlements.max_pending_cut_jobs||0)}});
    }catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Cut-Export-Jobs konnten nicht geladen werden."})}
});
app.post("/api/creator/cut-studio/projects/:id/export-jobs",requireCreatorAccount,async(req,res)=>{
    try{
        const access=await requireCreatorFeatureAccess(req.creatorAccount,"cut_studio","creator");
        return res.status(201).json({ok:true,job:await createCutExportJob(req.creatorAccount.id,req.params.id,access)});
    }catch(error){
        const status=error?.code==="creator_feature_locked"||error?.code==="cut_job_limit"?403:["cut_project_missing","cut_job_empty"].includes(error?.code)?400:500;
        return res.status(status).json({ok:false,error:error.message||"Cut-Export-Job konnte nicht erstellt werden."});
    }
});
app.post("/api/creator/cut-studio/jobs/:id/cancel",requireCreatorAccount,async(req,res)=>{
    try{
        await requireCreatorFeatureAccess(req.creatorAccount,"cut_studio","creator");
        return res.json({ok:true,job:await transitionCutExportJob(req.creatorAccount.id,req.params.id,"canceled")});
    }catch(error){
        const status=error?.code==="creator_feature_locked"?403:error?.code==="cut_job_missing"?404:409;
        return res.status(status).json({ok:false,error:error.message||"Cut-Export-Job konnte nicht abgebrochen werden."});
    }
});

app.get("/api/bridge/beta/status",widgetBridgeHeartbeatLimiter,requireStudioBridge,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        const beta=await getCreatorBetaState(req.studioBridge.creator_id);
        const session=beta.active?await activeBetaSessionForBridge(req.studioBridge.creator_id,req.studioBridge.id):null;
        const recent=beta.active?await pool.query(`SELECT * FROM creator_beta_feedback WHERE creator_id=$1 ORDER BY created_at DESC LIMIT 10`,[req.studioBridge.creator_id]):{rows:[]};
        return res.json({ok:true,beta,active_session:publicBetaSession(session),recent_feedback:recent.rows.map(publicBetaFeedback)});
    }catch(error){return res.status(500).json({ok:false,error:"Beta-Status konnte nicht geladen werden."})}
});
app.post("/api/bridge/beta/session/start",widgetBridgeHeartbeatLimiter,requireStudioBridge,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        await requireActiveBetaBridge(req.studioBridge);
        const creatorId=req.studioBridge.creator_id,bridgeId=req.studioBridge.id;
        await pool.query(`UPDATE creator_beta_sessions SET status='abandoned',ended_at=NOW(),duration_seconds=GREATEST(0,EXTRACT(EPOCH FROM (NOW()-started_at))::int),updated_at=NOW() WHERE creator_id=$1 AND bridge_id=$2 AND status='active'`,[creatorId,bridgeId]);
        const diagnostics=sanitizeBetaDiagnostics(req.body?.diagnostics||{});
        const result=await pool.query(`INSERT INTO creator_beta_sessions(creator_id,bridge_id,label,launcher_version,platform,provider,status,started_at,output_gate,diagnostics,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'active',NOW(),$7::jsonb,$8::jsonb,NOW(),NOW()) RETURNING *`,[creatorId,bridgeId,betaText(req.body?.label,120,"Beta Test"),betaText(req.body?.launcher_version,80,""),betaText(req.body?.platform,80,""),betaText(req.body?.provider,80,""),JSON.stringify(req.body?.output_gate&&typeof req.body.output_gate==="object"?req.body.output_gate:{}),JSON.stringify(diagnostics)]);
        return res.status(201).json({ok:true,session:publicBetaSession(result.rows[0])});
    }catch(error){return res.status(error?.code==="beta_not_active"?403:500).json({ok:false,error:error?.message||"Beta-Session konnte nicht gestartet werden."})}
});
app.post("/api/bridge/beta/session/end",widgetBridgeHeartbeatLimiter,requireStudioBridge,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        await requireActiveBetaBridge(req.studioBridge);
        const sessionId=betaText(req.body?.session_id,120,"");
        const result=await pool.query(`UPDATE creator_beta_sessions SET status='completed',ended_at=NOW(),duration_seconds=GREATEST(0,EXTRACT(EPOCH FROM (NOW()-started_at))::int),output_gate=$4::jsonb,diagnostics=$5::jsonb,result_summary=$6,updated_at=NOW() WHERE id=$1 AND creator_id=$2 AND bridge_id=$3 AND status='active' RETURNING *`,[sessionId,req.studioBridge.creator_id,req.studioBridge.id,JSON.stringify(req.body?.output_gate&&typeof req.body.output_gate==="object"?req.body.output_gate:{}),JSON.stringify(sanitizeBetaDiagnostics(req.body?.diagnostics||{})),betaText(req.body?.result_summary,2000,"")]);
        if(!result.rows[0])return res.status(404).json({ok:false,error:"Aktive Beta-Session nicht gefunden."});
        return res.json({ok:true,session:publicBetaSession(result.rows[0])});
    }catch(error){return res.status(error?.code==="beta_not_active"?403:500).json({ok:false,error:error?.message||"Beta-Session konnte nicht beendet werden."})}
});
app.post("/api/bridge/beta/feedback",widgetBridgeHeartbeatLimiter,requireStudioBridge,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        await requireActiveBetaBridge(req.studioBridge);
        const title=betaText(req.body?.title,160,"");if(title.length<4)return res.status(400).json({ok:false,error:"Feedback-Titel ist zu kurz."});
        const kind=BETA_FEEDBACK_KINDS.has(String(req.body?.kind||""))?String(req.body.kind):"bug",severity=BETA_FEEDBACK_SEVERITIES.has(String(req.body?.severity||""))?String(req.body.severity):"medium",category=BETA_FEEDBACK_CATEGORIES.has(String(req.body?.category||""))?String(req.body.category):"launcher",sessionId=betaText(req.body?.session_id,120,"")||null;
        if(sessionId){const check=await pool.query(`SELECT id FROM creator_beta_sessions WHERE id=$1 AND creator_id=$2 LIMIT 1`,[sessionId,req.studioBridge.creator_id]);if(!check.rows[0])return res.status(400).json({ok:false,error:"Beta-Session gehört nicht zu diesem Creator."})}
        const result=await pool.query(`INSERT INTO creator_beta_feedback(creator_id,bridge_id,session_id,kind,severity,category,title,description,repro_steps,expected,actual,launcher_version,platform,provider,diagnostics,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,'new',NOW(),NOW()) RETURNING *`,[req.studioBridge.creator_id,req.studioBridge.id,sessionId,kind,severity,category,title,betaText(req.body?.description,5000,""),betaText(req.body?.repro_steps,5000,""),betaText(req.body?.expected,3000,""),betaText(req.body?.actual,3000,""),betaText(req.body?.launcher_version,80,""),betaText(req.body?.platform,80,""),betaText(req.body?.provider,80,""),JSON.stringify(sanitizeBetaDiagnostics(req.body?.diagnostics||{}))]);
        return res.status(201).json({ok:true,feedback:publicBetaFeedback(result.rows[0])});
    }catch(error){return res.status(error?.code==="beta_not_active"?403:500).json({ok:false,error:error?.message||"Beta-Feedback konnte nicht gesendet werden."})}
});

app.get("/api/bridge/games/rules",widgetBridgeHeartbeatLimiter,requireStudioBridge,async(req,res)=>{
    try{
        const access=await requireCreatorFeatureAccess(req.studioBridge.creator_id,"games","creator");
        return res.json({ok:true,rules:await listCreatorGameRules(req.studioBridge.creator_id),recent_hits:await recentCreatorGameRuleHits(req.studioBridge.creator_id,15),limits:{max_rules:Number(access.entitlements.max_game_rules||0)}});
    }catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Game-Regeln konnten nicht geladen werden."})}
});
app.get("/api/bridge/games/runtime",widgetBridgeHeartbeatLimiter,requireStudioBridge,async(req,res)=>{try{await requireCreatorFeatureAccess(req.studioBridge.creator_id,"games","creator");return res.json({ok:true,runtime:await getCreatorGameRuntimePublic(req.studioBridge.creator_id,{ensure:true}),profile:await getCreatorGameProfile(req.studioBridge.creator_id)})}catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Game Runtime konnte nicht geladen werden."})}});
app.post("/api/bridge/games/runtime/start",widgetBridgeHeartbeatLimiter,requireStudioBridge,async(req,res)=>{try{await requireCreatorFeatureAccess(req.studioBridge.creator_id,"games","creator");return res.json({ok:true,runtime:await startCreatorGameRuntime(req.studioBridge.creator_id)})}catch(error){return res.status(error?.code==="creator_feature_locked"?403:400).json({ok:false,error:error.message||"Game konnte nicht gestartet werden."})}});
app.post("/api/bridge/games/runtime/stop",widgetBridgeHeartbeatLimiter,requireStudioBridge,async(req,res)=>{try{await requireCreatorFeatureAccess(req.studioBridge.creator_id,"games","creator");return res.json({ok:true,runtime:await stopCreatorGameRuntime(req.studioBridge.creator_id)})}catch(error){return res.status(error?.code==="creator_feature_locked"?403:400).json({ok:false,error:error.message||"Game konnte nicht gestoppt werden."})}});
app.post("/api/bridge/games/runtime/reset",widgetBridgeHeartbeatLimiter,requireStudioBridge,async(req,res)=>{try{await requireCreatorFeatureAccess(req.studioBridge.creator_id,"games","creator");return res.json({ok:true,runtime:await resetCreatorGameRuntime(req.studioBridge.creator_id)})}catch(error){return res.status(error?.code==="creator_feature_locked"?403:400).json({ok:false,error:error.message||"Game konnte nicht zurückgesetzt werden."})}});
app.post("/api/bridge/games/runtime/score",widgetBridgeHeartbeatLimiter,requireStudioBridge,async(req,res)=>{try{await requireCreatorFeatureAccess(req.studioBridge.creator_id,"games","creator");return res.json({ok:true,runtime:await scoreCreatorGameRuntime(req.studioBridge.creator_id,req.body||{})})}catch(error){return res.status(error?.code==="creator_feature_locked"?403:error?.code==="game_not_running"?409:400).json({ok:false,error:error.message||"Game Score konnte nicht geändert werden."})}});
app.get("/api/bridge/cut-studio/jobs",widgetBridgeHeartbeatLimiter,requireStudioBridge,async(req,res)=>{
    res.set("Cache-Control","no-store");
    try{
        const access=await requireCreatorFeatureAccess(req.studioBridge.creator_id,"cut_studio","creator");
        return res.json({ok:true,jobs:await listCutExportJobs(req.studioBridge.creator_id,50),limits:{max_pending_jobs:Number(access.entitlements.max_pending_cut_jobs||0)}});
    }catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Cut-Export-Jobs konnten nicht geladen werden."})}
});
app.post("/api/bridge/cut-studio/jobs/:id/claim",widgetBridgeEventLimiter,requireStudioBridge,async(req,res)=>{
    try{await requireCreatorFeatureAccess(req.studioBridge.creator_id,"cut_studio","creator");return res.json({ok:true,job:await transitionCutExportJob(req.studioBridge.creator_id,req.params.id,"claimed",{bridgeId:req.studioBridge.id})})}
    catch(error){return res.status(error?.code==="creator_feature_locked"?403:error?.code==="cut_job_missing"?404:409).json({ok:false,error:error.message||"Cut-Job konnte nicht reserviert werden."})}
});
app.post("/api/bridge/cut-studio/jobs/:id/processing",widgetBridgeEventLimiter,requireStudioBridge,async(req,res)=>{
    try{await requireCreatorFeatureAccess(req.studioBridge.creator_id,"cut_studio","creator");return res.json({ok:true,job:await transitionCutExportJob(req.studioBridge.creator_id,req.params.id,"processing",{bridgeId:req.studioBridge.id})})}
    catch(error){return res.status(error?.code==="creator_feature_locked"?403:error?.code==="cut_job_missing"?404:409).json({ok:false,error:error.message||"Cut-Job konnte nicht gestartet werden."})}
});
app.post("/api/bridge/cut-studio/jobs/:id/complete",widgetBridgeEventLimiter,requireStudioBridge,async(req,res)=>{
    try{await requireCreatorFeatureAccess(req.studioBridge.creator_id,"cut_studio","creator");return res.json({ok:true,job:await transitionCutExportJob(req.studioBridge.creator_id,req.params.id,"completed",{bridgeId:req.studioBridge.id,result:req.body?.result||{}})})}
    catch(error){return res.status(error?.code==="creator_feature_locked"?403:error?.code==="cut_job_missing"?404:409).json({ok:false,error:error.message||"Cut-Job konnte nicht abgeschlossen werden."})}
});
app.post("/api/bridge/cut-studio/jobs/:id/fail",widgetBridgeEventLimiter,requireStudioBridge,async(req,res)=>{
    try{await requireCreatorFeatureAccess(req.studioBridge.creator_id,"cut_studio","creator");return res.json({ok:true,job:await transitionCutExportJob(req.studioBridge.creator_id,req.params.id,"failed",{bridgeId:req.studioBridge.id,errorMessage:req.body?.error_message||"Media Engine Fehler"})})}
    catch(error){return res.status(error?.code==="creator_feature_locked"?403:error?.code==="cut_job_missing"?404:409).json({ok:false,error:error.message||"Cut-Job konnte nicht als fehlgeschlagen markiert werden."})}
});

app.post("/api/bridge/cut-studio/jobs/:id/retry",widgetBridgeEventLimiter,requireStudioBridge,async(req,res)=>{
    try{
        await requireCreatorFeatureAccess(req.studioBridge.creator_id,"cut_studio","creator");
        const current=(await pool.query(`SELECT * FROM creator_cut_export_jobs WHERE creator_id=$1 AND id=$2 LIMIT 1`,[req.studioBridge.creator_id,req.params.id])).rows[0];
        if(!current)return res.status(404).json({ok:false,error:"Cut-Job nicht gefunden."});
        if(current.bridge_id&&String(current.bridge_id)!==String(req.studioBridge.id))return res.status(409).json({ok:false,error:"Dieser Cut-Job gehört zu einem anderen Launcher."});
        const job=await transitionCutExportJob(req.studioBridge.creator_id,req.params.id,"queued",{bridgeId:req.studioBridge.id,errorMessage:""});
        return res.json({ok:true,job});
    }catch(error){
        const status=error?.code==="creator_feature_locked"?403:error?.code==="cut_job_missing"?404:409;
        return res.status(status).json({ok:false,error:error.message||"Cut-Job konnte nicht erneut eingereiht werden."});
    }
});

app.get("/api/bridge/cut-studio/projects",widgetBridgeHeartbeatLimiter,requireStudioBridge,async(req,res)=>{try{const access=await requireCreatorFeatureAccess(req.studioBridge.creator_id,"cut_studio","creator");return res.json({ok:true,projects:await listCutProjects(req.studioBridge.creator_id),limits:{max_projects:Number(access.entitlements.max_cut_projects||0),max_clips_per_project:Number(access.entitlements.max_cut_clips_per_project||0)}})}catch(error){return res.status(error?.code==="creator_feature_locked"?403:500).json({ok:false,error:error.message||"Cut Studio Projekte konnten nicht geladen werden."})}});

app.get(
    "/api/bridge/widget-studio/library",
    widgetBridgeHeartbeatLimiter,
    requireStudioBridge,
    async (req,res) => {
        res.set("Cache-Control","no-store");
        try {
            const creatorId=req.studioBridge.creator_id;
            const access=await creatorAccessProfile(creatorId);
            const [widgets,scenes,creator,game,cutProjects,gameRules,gameRuleHits,cutJobs]=await Promise.all([
                getCreatorSceneSources(creatorId,{includeGame:Boolean(access.entitlements.games)}),
                pool.query(
                    `SELECT * FROM creator_widget_scenes WHERE creator_id=$1 AND status='live' AND published_config IS NOT NULL ORDER BY updated_at DESC`,
                    [creatorId]
                ),
                studioCreatorIdentity(creatorId),
                access.entitlements.games?getCreatorGameRuntimePublic(creatorId,{ensure:true}):Promise.resolve(null),
                access.entitlements.cut_studio?listCutProjects(creatorId):Promise.resolve([]),
                access.entitlements.games?listCreatorGameRules(creatorId):Promise.resolve([]),
                access.entitlements.games?recentCreatorGameRuleHits(creatorId,10):Promise.resolve([]),
                access.entitlements.cut_studio?listCutExportJobs(creatorId,25):Promise.resolve([])
            ]);
            return res.json({
                ok:true,creator,access,entitlements:access.entitlements,
                widgets:widgets.filter(widget=>widget.status==="live").map(widget=>({
                    id:widget.id,
                    name:widget.name,
                    widget_type:widget.widget_type,
                    source_url:widget.source_url,
                    source_urls:widget.source_urls||{}
                })),
                scenes:scenes.rows.map(row=>publicSceneRow(row,APP_BASE_URL)),
                game,
                game_rules:gameRules,
                game_rule_hits:gameRuleHits,
                cut_projects:cutProjects,
                cut_jobs:cutJobs,
                server_time:new Date().toISOString()
            });
        } catch (error) {
            return res.status(500).json({ok:false,error:"Creator-Bibliothek konnte nicht geladen werden."});
        }
    }
);

app.post(
    "/api/bridge/widget-studio/logout",
    widgetBridgeHeartbeatLimiter,
    requireStudioBridge,
    async (req,res) => {
        res.set("Cache-Control","no-store");
        try {
            const bridgeId=String(req.studioBridge.id);
            const creatorId=String(req.studioBridge.creator_id);
            const revoked=await revokeCurrentStudioBridge(bridgeId,creatorId);
            return res.json({ok:true,revoked});
        } catch (error) {
            return res.status(500).json({ok:false,error:"Launcher konnte nicht abgemeldet werden."});
        }
    }
);


app.get(
    "/api/creator/widget-studio/bridge",
    requireCreatorAccount,
    async (req, res) => {
        res.set("Cache-Control", "no-store");
        try {
            return res.json({
                ok: true,
                status: await getStudioBridgeStatus(req.creatorAccount.id),
                bridges: await listStudioBridges(req.creatorAccount.id, true),
                live: await getStudioLiveState(req.creatorAccount.id)
            });
        } catch (error) {
            console.error("Widget Studio Bridge Status Fehler:", error);
            return res.status(500).json({ ok:false, error:"Bridge-Status konnte nicht geladen werden." });
        }
    }
);

app.post(
    "/api/creator/widget-studio/bridge/keys",
    requireCreatorAccount,
    async (req, res) => {
        res.set("Cache-Control", "no-store");
        try {
            const created = await createStudioBridgeKey(
                req.creatorAccount.id,
                req.body?.label || "Creator Suite Launcher"
            );
            return res.status(201).json({
                ok: true,
                bridge: created.bridge,
                token: created.token,
                warning: "Dieser Bridge-Schlüssel wird nur einmal vollständig angezeigt."
            });
        } catch (error) {
            console.error("Widget Studio Bridge Key Fehler:", error);
            return res.status(500).json({ ok:false, error:"Bridge-Schlüssel konnte nicht erstellt werden." });
        }
    }
);

app.delete(
    "/api/creator/widget-studio/bridge/keys/:id",
    requireCreatorAccount,
    async (req, res) => {
        res.set("Cache-Control", "no-store");
        try {
            const revoked = await revokeStudioBridgeKey(req.creatorAccount.id, req.params.id);
            if (!revoked) return res.status(404).json({ ok:false, error:"Aktiver Bridge-Schlüssel nicht gefunden." });
            return res.json({ ok:true, revoked:true });
        } catch (error) {
            console.error("Widget Studio Bridge Revoke Fehler:", error);
            return res.status(500).json({ ok:false, error:"Bridge-Schlüssel konnte nicht widerrufen werden." });
        }
    }
);

app.get(
    "/api/bridge/widget-studio/release-policy",
    widgetBridgeHeartbeatLimiter,
    requireStudioBridge,
    async (req, res) => {
        res.set("Cache-Control", "no-store");

        const bridge =
            publicStudioBridgeRow(
                req.studioBridge
            );

        const channel =
            req.query?.channel === "beta"
                ? "beta"
                : "stable";

        const data =
            await launcherReleasePolicy(
                req.query?.current ||
                bridge?.client_version ||
                "",
                channel,
                false,
                `${req.studioBridge.creator_id}:${req.studioBridge.id}`
            );

        return res.json({
            ok: true,
            ...data,
            server_time: new Date().toISOString()
        });
    }
);


app.get(
    "/api/bridge/widget-studio/scenes",
    widgetBridgeHeartbeatLimiter,
    requireStudioBridge,
    async(req,res)=>{
        try{
            const result=await pool.query(
                `SELECT * FROM creator_widget_scenes WHERE creator_id=$1 AND status='live' AND published_config IS NOT NULL ORDER BY updated_at DESC`,
                [req.studioBridge.creator_id]
            );
            return res.json({ok:true,scenes:result.rows.map(row=>publicSceneRow(row,APP_BASE_URL)),server_time:new Date().toISOString()});
        }catch(error){console.error("Bridge Scene Liste Fehler:",error);return res.status(500).json({ok:false,error:"Scene Liste konnte nicht geladen werden."})}
    }
);


app.get(
    "/api/bridge/widget-studio/status",
    widgetBridgeHeartbeatLimiter,
    requireStudioBridge,
    async (req, res) => {
        res.set("Cache-Control", "no-store");
        const creatorId = req.studioBridge.creator_id;
        const bridge = await getStudioBridgeStatus(creatorId);
        const release = await launcherReleasePolicy(
            bridge.client_version || "",
            req.query?.channel === "beta" ? "beta" : "stable",
            false,
            `${creatorId}:${req.studioBridge.id}`
        );
        return res.json({
            ok: true,
            bridge,
            live: await getStudioLiveState(creatorId),
            creator: await studioCreatorIdentity(creatorId),
            release_policy: release.policy,
            release_catalog: release.catalog,
            server_time: new Date().toISOString(),
            protocol: 1
        });
    }
);

app.post(
    "/api/bridge/widget-studio/heartbeat",
    widgetBridgeHeartbeatLimiter,
    requireStudioBridge,
    async (req, res) => {
        res.set("Cache-Control", "no-store");
        try {
            const creatorId = req.studioBridge.creator_id;
            await touchStudioBridge(req.studioBridge.id, creatorId, {
                ...(req.body || {}),
                live_session_active: req.body?.live_session_active === true
            });
            const bridge = await getStudioBridgeStatus(creatorId);
            const release = await launcherReleasePolicy(
                bridge.client_version || "",
                req.body?.update_channel === "beta" ? "beta" : "stable",
                false,
                `${creatorId}:${req.studioBridge.id}`
            );
            return res.json({
                ok: true,
                bridge,
                live: await getStudioLiveState(creatorId),
                creator: await studioCreatorIdentity(creatorId),
                release_policy: release.policy,
                release_catalog: release.catalog,
                server_time: new Date().toISOString(),
                heartbeat_after_ms: 10000,
                protocol: 1
            });
        } catch (error) {
            console.error("Widget Studio Bridge Heartbeat Fehler:", error);
            return res.status(400).json({ ok:false, error:error.message || "Heartbeat fehlgeschlagen." });
        }
    }
);

app.post(
    "/api/bridge/widget-studio/session/resume",
    widgetBridgeEventLimiter,
    requireStudioBridge,
    async (req,res) => {
        res.set("Cache-Control","no-store");
        const creatorId=req.studioBridge.creator_id;
        const sessionId=String(req.body?.session_id||"");
        const dryRun=req.body?.dry_run===true;

        if(!validSessionId(sessionId)){
            return res.status(400).json({ok:false,allowed:false,reason:"invalid_session_id",error:"Ungültige LIVE Session-ID."});
        }

        try{
            await requireCreatorFeatureAccess(creatorId,"live_bridge","creator");
            const clientVersion=studioText(req.body?.client_version,40,req.studioBridge.client_version||"");
            const channel=req.body?.update_channel==="beta"?"beta":"stable";
            const release=await launcherReleasePolicy(
                clientVersion,
                channel,
                false,
                `${creatorId}:${req.studioBridge.id}`
            );
            const safety=releasePolicyAllowsLive(release.policy);

            if(!safety.ok){
                return res.json({
                    ok:true,
                    allowed:false,
                    reason:safety.reason,
                    message:release.policy?.message||"LIVE Recovery ist durch die Release Policy blockiert.",
                    release_policy:release.policy,
                    release_catalog:release.catalog,
                    server_time:new Date().toISOString()
                });
            }

            const sessionResult=await pool.query(
                `SELECT * FROM creator_live_sessions WHERE creator_id=$1 AND id=$2 LIMIT 1`,
                [creatorId,sessionId]
            );
            const session=sessionResult.rows[0]||null;
            const resumable=canResumeSessionRow(session);
            if(!resumable.ok){
                return res.json({
                    ok:true,
                    allowed:false,
                    reason:resumable.reason,
                    message:"Die gespeicherte LIVE Session kann nicht mehr fortgesetzt werden.",
                    release_policy:release.policy,
                    release_catalog:release.catalog,
                    server_time:new Date().toISOString()
                });
            }

            const currentResult=await pool.query(
                `SELECT * FROM creator_live_state WHERE creator_id=$1 LIMIT 1`,
                [creatorId]
            );
            const preview=buildResumedLiveState(session,currentResult.rows[0]||null);

            if(dryRun){
                return res.json({
                    ok:true,
                    allowed:true,
                    dry_run:true,
                    session_id:sessionId,
                    session:{id:session.id,provider:session.provider,status:session.status,metadata:session.metadata||{},started_at:session.started_at,updated_at:session.updated_at},
                    live:{...preview,stale:false},
                    creator:await studioCreatorIdentity(creatorId),
                    release_policy:release.policy,
                    release_catalog:release.catalog,
                    server_time:new Date().toISOString()
                });
            }

            const db=await pool.connect();
            try{
                await db.query("BEGIN");
                const lockedSessionResult=await db.query(
                    `SELECT * FROM creator_live_sessions WHERE creator_id=$1 AND id=$2 FOR UPDATE`,
                    [creatorId,sessionId]
                );
                const lockedSession=lockedSessionResult.rows[0]||null;
                const lockedCheck=canResumeSessionRow(lockedSession);
                if(!lockedCheck.ok)throw new Error("LIVE Session ist nicht mehr fortsetzbar.");

                const stateResult=await db.query(
                    `SELECT * FROM creator_live_state WHERE creator_id=$1 FOR UPDATE`,
                    [creatorId]
                );
                const resumed=buildResumedLiveState(lockedSession,stateResult.rows[0]||null);

                await db.query(
                    `
                    INSERT INTO creator_live_state
                        (creator_id,session_id,provider,connected,likes,viewers,shares,gifts_count,gifts_value,followers_gained,started_at,last_event_at,bridge_heartbeat_at,updated_at)
                    VALUES
                        ($1,$2,'launcher_bridge',TRUE,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
                    ON CONFLICT (creator_id) DO UPDATE SET
                        session_id=EXCLUDED.session_id,
                        provider='launcher_bridge',
                        connected=TRUE,
                        likes=EXCLUDED.likes,
                        viewers=EXCLUDED.viewers,
                        shares=EXCLUDED.shares,
                        gifts_count=EXCLUDED.gifts_count,
                        gifts_value=EXCLUDED.gifts_value,
                        followers_gained=EXCLUDED.followers_gained,
                        started_at=EXCLUDED.started_at,
                        last_event_at=COALESCE(EXCLUDED.last_event_at,creator_live_state.last_event_at),
                        bridge_heartbeat_at=NOW(),
                        updated_at=NOW()
                    `,
                    [creatorId,sessionId,resumed.likes,resumed.viewers,resumed.shares,resumed.gifts_count,resumed.gifts_value,resumed.followers_gained,resumed.started_at,resumed.last_event_at]
                );
                await db.query(
                    `UPDATE creator_live_sessions SET status='live',ended_at=NULL,updated_at=NOW() WHERE creator_id=$1 AND id=$2`,
                    [creatorId,sessionId]
                );
                await db.query("COMMIT");
            }catch(error){
                await db.query("ROLLBACK");
                throw error;
            }finally{
                db.release();
            }

            await touchStudioBridge(req.studioBridge.id,creatorId,{
                ...(req.body||{}),
                live_session_active:true
            });

            const live=await getStudioLiveState(creatorId);
            return res.json({
                ok:true,
                allowed:true,
                recovered:true,
                session_id:sessionId,
                live,
                creator:await studioCreatorIdentity(creatorId),
                release_policy:release.policy,
                release_catalog:release.catalog,
                server_time:new Date().toISOString()
            });
        }catch(error){
            console.error("Widget Studio Bridge Session Resume Fehler:",error);
            return res.status(error?.code==="creator_feature_locked"?403:400).json({ok:false,allowed:false,error:error.message||"LIVE Session konnte nicht fortgesetzt werden."});
        }
    }
);


app.post(
    "/api/bridge/widget-studio/session/start",
    widgetBridgeEventLimiter,
    requireStudioBridge,
    async (req, res) => {
        res.set("Cache-Control", "no-store");
        try {
            const creatorId = req.studioBridge.creator_id;
            await requireCreatorFeatureAccess(creatorId,"live_bridge","creator");
            await touchStudioBridge(req.studioBridge.id, creatorId, { ...(req.body || {}), live_session_active:true });
            const live = await applyStudioLiveEvent(
                creatorId,
                { event_type:"live_start", event_key:req.body?.event_key || null, payload:req.body?.payload || {} },
                "launcher_bridge"
            );
            await pool.query(`UPDATE creator_live_state SET bridge_heartbeat_at=NOW() WHERE creator_id=$1`, [creatorId]);
            return res.json({ ok:true, live, session_id:live.session_id });
        } catch (error) {
            console.error("Widget Studio Bridge Session Start Fehler:", error);
            return res.status(error?.code==="creator_feature_locked"?403:400).json({ ok:false, error:error.message || "LIVE-Session konnte nicht gestartet werden." });
        }
    }
);

app.post(
    "/api/bridge/widget-studio/session/end",
    widgetBridgeEventLimiter,
    requireStudioBridge,
    async (req, res) => {
        res.set("Cache-Control", "no-store");
        try {
            const creatorId = req.studioBridge.creator_id;
            await touchStudioBridge(req.studioBridge.id, creatorId, { ...(req.body || {}), live_session_active:false });
            const live = await applyStudioLiveEvent(
                creatorId,
                { event_type:"live_end", event_key:req.body?.event_key || null, payload:req.body?.payload || {} },
                "launcher_bridge"
            );
            return res.json({ ok:true, live });
        } catch (error) {
            console.error("Widget Studio Bridge Session End Fehler:", error);
            return res.status(400).json({ ok:false, error:error.message || "LIVE-Session konnte nicht beendet werden." });
        }
    }
);

app.post(
    "/api/bridge/widget-studio/events",
    widgetBridgeEventLimiter,
    requireStudioBridge,
    async (req, res) => {
        res.set("Cache-Control", "no-store");
        try {
            const creatorId = req.studioBridge.creator_id;
            await requireCreatorFeatureAccess(creatorId,"live_bridge","creator");
            await touchStudioBridge(req.studioBridge.id, creatorId, { ...(req.body || {}), live_session_active:true });
            const incoming = Array.isArray(req.body?.events) ? req.body.events : [req.body?.event || req.body];
            const events = incoming.filter(Boolean).slice(0, WIDGET_BRIDGE_MAX_BATCH);
            if (!events.length) return res.status(400).json({ ok:false, error:"Keine Events übergeben." });
            const results = [];
            for (const event of events) {
                const type = String(event?.event_type || "");
                if (["live_start","live_end","reset"].includes(type)) {
                    return res.status(400).json({ ok:false, error:"LIVE Start/Ende bitte über die Session-Endpunkte senden." });
                }
                const live = await applyStudioLiveEvent(creatorId, event || {}, "launcher_bridge");
                results.push({ event_key:event?.event_key || null, event_type:type, live });
            }
            await pool.query(`UPDATE creator_live_state SET bridge_heartbeat_at=NOW() WHERE creator_id=$1`, [creatorId]);
            return res.json({
                ok:true,
                accepted:results.length,
                live:await getStudioLiveState(creatorId),
                bridge:await getStudioBridgeStatus(creatorId)
            });
        } catch (error) {
            console.error("Widget Studio Bridge Event Fehler:", error);
            return res.status(error?.code==="creator_feature_locked"?403:400).json({ ok:false, error:error.message || "Bridge-Events konnten nicht verarbeitet werden." });
        }
    }
);

app.get("/api/bridge/widget-studio/actions", widgetBridgeEventLimiter, requireStudioBridge, async (req,res)=>{
    res.set("Cache-Control","no-store");
    try {
        const creatorId=req.studioBridge.creator_id;
        const limit=Math.max(1,Math.min(50,Number(req.query?.limit)||20));

        await pool.query(
            `
            UPDATE creator_live_actions
            SET status='expired',
                lease_until=NULL,
                last_error=COALESCE(last_error,'delivery_expired')
            WHERE creator_id=$1
              AND status IN ('pending','delivered')
              AND (
                COALESCE(expires_at,created_at+($2::int*INTERVAL '1 minute'))<=NOW()
                OR attempts >= $3
              )
            `,
            [creatorId,ACTION_TTL_MINUTES,ACTION_MAX_ATTEMPTS]
        );

        const result=await pool.query(
            `
            WITH claimable AS (
                SELECT id
                FROM creator_live_actions
                WHERE creator_id=$1
                  AND status IN ('pending','delivered')
                  AND COALESCE(expires_at,created_at+($2::int*INTERVAL '1 minute'))>NOW()
                  AND attempts < $3
                  AND (
                    status='pending'
                    OR lease_until IS NULL
                    OR lease_until<=NOW()
                  )
                ORDER BY created_at ASC
                FOR UPDATE SKIP LOCKED
                LIMIT $4
            )
            UPDATE creator_live_actions action
            SET status='delivered',
                delivered_at=NOW(),
                lease_until=NOW()+($5::int*INTERVAL '1 second'),
                attempts=action.attempts+1,
                last_error=NULL
            FROM claimable
            WHERE action.id=claimable.id
            RETURNING action.*
            `,
            [creatorId,ACTION_TTL_MINUTES,ACTION_MAX_ATTEMPTS,limit,ACTION_LEASE_SECONDS]
        );

        return res.json({
            ok:true,
            actions:result.rows.map(publicStudioAction),
            lease_seconds:ACTION_LEASE_SECONDS,
            max_attempts:ACTION_MAX_ATTEMPTS,
            server_time:new Date().toISOString()
        });
    } catch(error){
        console.error("Widget Studio Bridge Actions Fehler:",error);
        return res.status(500).json({ok:false,error:"Launcher-Aktionen konnten nicht geladen werden."});
    }
});

app.post("/api/bridge/widget-studio/actions/ack", widgetBridgeEventLimiter, requireStudioBridge, async (req,res)=>{
    res.set("Cache-Control","no-store");
    try {
        const creatorId=req.studioBridge.creator_id;
        const ids=normalizeActionIds(req.body?.ids,50);
        if(!ids.length)return res.json({ok:true,acked:0});
        const result=await pool.query(
            `
            UPDATE creator_live_actions
            SET status='acked',
                acked_at=NOW(),
                lease_until=NULL,
                last_error=NULL
            WHERE creator_id=$1
              AND id=ANY($2::text[])
              AND status='delivered'
            RETURNING id
            `,
            [creatorId,ids]
        );
        return res.json({ok:true,acked:result.rowCount});
    } catch(error){
        console.error("Widget Studio Bridge Action ACK Fehler:",error);
        return res.status(400).json({ok:false,error:"Launcher-Aktionen konnten nicht bestätigt werden."});
    }
});

app.post("/api/bridge/widget-studio/actions/nack", widgetBridgeEventLimiter, requireStudioBridge, async (req,res)=>{
    res.set("Cache-Control","no-store");
    try {
        const creatorId=req.studioBridge.creator_id;
        const ids=normalizeActionIds(req.body?.ids,50);
        const errorText=studioText(req.body?.error,300,"tts_failed");
        if(!ids.length)return res.json({ok:true,nacked:0,retry_scheduled:0,expired:0});

        const result=await pool.query(
            `
            UPDATE creator_live_actions
            SET last_error=$3,
                status=CASE
                    WHEN attempts >= $4
                      OR COALESCE(expires_at,created_at+($5::int*INTERVAL '1 minute'))<=NOW()
                    THEN 'expired'
                    ELSE 'delivered'
                END,
                lease_until=CASE
                    WHEN attempts >= $4
                      OR COALESCE(expires_at,created_at+($5::int*INTERVAL '1 minute'))<=NOW()
                    THEN NULL
                    ELSE NOW()+($6::int*INTERVAL '1 second')
                END
            WHERE creator_id=$1
              AND id=ANY($2::text[])
              AND status='delivered'
            RETURNING id,status
            `,
            [creatorId,ids,errorText,ACTION_MAX_ATTEMPTS,ACTION_TTL_MINUTES,ACTION_RETRY_DELAY_SECONDS]
        );
        const retry=result.rows.filter(row=>row.status==="delivered").length;
        const expired=result.rows.filter(row=>row.status==="expired").length;
        return res.json({ok:true,nacked:result.rowCount,retry_scheduled:retry,expired});
    } catch(error){
        console.error("Widget Studio Bridge Action NACK Fehler:",error);
        return res.status(400).json({ok:false,error:"Launcher-Aktion konnte nicht als fehlgeschlagen markiert werden."});
    }
});

// ============================================================
// WIDGET STUDIO V1 - ÖFFENTLICHE OBS API
// ============================================================

app.get(
    "/api/widgets/studio/:publicToken",
    widgetReadLimiter,
    async (req, res) => {

        res.set("Cache-Control", "no-store");

        try {

            const row =
                await getPublicStudioWidget(
                    req.params.publicToken
                );

            if (!row) {
                return res.status(404).json({
                    ok: false,
                    error: "Widget nicht gefunden oder nicht veröffentlicht."
                });
            }

            const snapshot =
                await studioDataSnapshot(
                    row.creator_id
                );

            const definition = studioWidgetDefinition(row.widget_type);
            const eventType = definition.event_type || null;
            const events = eventType
                ? await getRecentStudioLiveEvents(row.creator_id, eventType, 20, snapshot.live.session_id)
                : [];

            return res.json({
                ok: true,
                widget: {
                    id: row.id,
                    type: row.widget_type,
                    name: row.name,
                    definition,
                    config: sanitizeStudioWidgetConfig(row.published_config, row.widget_type),
                    published_at: row.published_at
                },
                creator: {
                    display_name:
                        snapshot.profile.display_name ||
                        row.creator_display_name ||
                        "Creator",
                    avatar_url:
                        snapshot.profile.avatar_url || ""
                },
                data: snapshot,
                events,
                tiktok: {
                    connected: snapshot.profile.connected,
                    display_name: snapshot.profile.display_name,
                    avatar_url: snapshot.profile.avatar_url,
                    follower_count: snapshot.profile.followers,
                    likes_count: snapshot.profile.likes_total,
                    updated_at: snapshot.profile.updated_at
                },
                live: snapshot.live,
                bridge: snapshot.bridge
            });

        }
        catch (error) {

            console.error(
                "Widget Studio Public Fehler:",
                error
            );

            return res.status(500).json({
                ok: false,
                error: "Widget-Daten konnten nicht geladen werden."
            });

        }

    }
);


// ============================================================
// WIDGET STUDIO - FOLLOWER GOAL - CREATOR API
// ============================================================

app.get(
    "/api/creator/widgets/follower-goal",

    requireCreatorAccount,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        try {

            const source =
                await getFollowerWidgetSourceByCreator(
                    req.creatorAccount.id,
                    true
                );

            const tiktok =
                await getFollowerWidgetTikTokData(
                    req.creatorAccount.id
                );

            return res.json({

                ok:
                    true,

                widget:
                    "follower_goal",

                config:
                    sanitizeFollowerGoalWidgetConfig(
                        source.config
                    ),

                source_key:
                    source.source_key,

                source_url:
                    followerWidgetSourceUrl(
                        source.source_key
                    ),

                updated_at:
                    source.updated_at,

                tiktok

            });

        }
        catch (error) {

            console.error(
                "Follower Widget Laden Fehler:",
                error
            );

            return res
                .status(500)
                .json({

                    ok:
                        false,

                    error:
                        "Follower-Widget konnte nicht geladen werden."

                });

        }

    }
);


app.put(
    "/api/creator/widgets/follower-goal",

    requireCreatorAccount,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        try {

            const source =
                await saveFollowerWidgetSource(
                    req.creatorAccount.id,
                    req.body?.config
                );

            const tiktok =
                await getFollowerWidgetTikTokData(
                    req.creatorAccount.id
                );

            return res.json({

                ok:
                    true,

                widget:
                    "follower_goal",

                config:
                    sanitizeFollowerGoalWidgetConfig(
                        source.config
                    ),

                source_key:
                    source.source_key,

                source_url:
                    followerWidgetSourceUrl(
                        source.source_key
                    ),

                updated_at:
                    source.updated_at,

                tiktok

            });

        }
        catch (error) {

            console.error(
                "Follower Widget Speichern Fehler:",
                error
            );

            return res
                .status(500)
                .json({

                    ok:
                        false,

                    error:
                        error?.message ||
                        "Follower-Widget konnte nicht gespeichert werden."

                });

        }

    }
);


app.post(
    "/api/creator/widgets/follower-goal/rotate-key",

    requireCreatorAccount,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        try {

            const source =
                await rotateFollowerWidgetSourceKey(
                    req.creatorAccount.id
                );

            return res.json({

                ok:
                    true,

                source_key:
                    source.source_key,

                source_url:
                    followerWidgetSourceUrl(
                        source.source_key
                    ),

                updated_at:
                    source.updated_at

            });

        }
        catch (error) {

            console.error(
                "Follower Widget Schlüssel Fehler:",
                error
            );

            return res
                .status(500)
                .json({

                    ok:
                        false,

                    error:
                        "Neuer OBS-Schlüssel konnte nicht erstellt werden."

                });

        }

    }
);


// ============================================================
// WIDGET STUDIO - FOLLOWER GOAL - ÖFFENTLICHE OBS API
// ============================================================

app.get(
    "/api/widgets/follower-goal/:sourceKey",

    widgetReadLimiter,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        try {

            const source =
                await getFollowerWidgetSourceByKey(
                    req.params.sourceKey
                );

            if (
                !source
            ) {

                return res
                    .status(404)
                    .json({

                        ok:
                            false,

                        error:
                            "Widget-Quelle nicht gefunden."

                    });

            }

            const config =
                sanitizeFollowerGoalWidgetConfig(
                    source.config
                );

            const tiktok =
                await getFollowerWidgetTikTokData(
                    source.creator_id
                );

            return res.json({

                ok:
                    true,

                widget:
                    "follower_goal",

                enabled:
                    config.enabled,

                creator:
                    {

                        display_name:
                            source.display_name ||
                            "Creator"

                    },

                config,

                live:
                    {

                        connected:
                            tiktok.connected,

                        follower_count:
                            tiktok.follower_count,

                        tiktok_display_name:
                            tiktok.display_name,

                        source:
                            tiktok.source,

                        updated_at:
                            tiktok.updated_at

                    },

                updated_at:
                    source.updated_at

            });

        }
        catch (error) {

            console.error(
                "Öffentliches Follower Widget Fehler:",
                error
            );

            return res
                .status(500)
                .json({

                    ok:
                        false,

                    error:
                        "Widget-Daten konnten nicht geladen werden."

                });

        }

    }
);


// ============================================================
// NEXUS BASIS
// ============================================================

app.get(
    "/api/nexus/status",

    requireCreatorAccount,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );


        const allowed =
            canUseModule(
                req.creatorAccount.plan,
                "nexus"
            );


        return res.json({

            ok:
                true,

            service:
                "NEXUS",

            version:
                "1.0",

            status:
                "online",

            allowed,

            plan:
                normalizePlan(
                    req.creatorAccount.plan
                ),

            integrations: {

                website:
                    "online",

                creator_account:
                    "online",

                launcher:
                    "prepared",

                tiktok:
                    "active",

                cut_studio:
                    "project_runtime",

                games:
                    "active",

                audio_studio:
                    "roadmap",

                twitch:
                    "roadmap",

                obs:
                    "roadmap"

            }

        });

    }
);
// ============================================================
// TIKTOK CONNECTION LADEN
// ============================================================

async function getConnection(
    creatorId = DEFAULT_CREATOR_ID
) {

    const result =
        await pool.query(
            `
            SELECT *
            FROM tiktok_connections
            WHERE creator_id = $1
            LIMIT 1
            `,
            [
                normalizeCreatorId(
                    creatorId
                )
            ]
        );


    if (
        !result.rows[0]
    ) {

        return null;

    }


    const row =
        result.rows[0];


    return {

        ...row,

        access_token:
            decryptSecret(
                row.access_token
            ),

        refresh_token:
            decryptSecret(
                row.refresh_token
            )

    };

}


// ============================================================
// TIKTOK TOKENS SPEICHERN
// ============================================================

async function saveTokens(
    creatorId,
    data
) {

    creatorId =
        normalizeCreatorId(
            creatorId
        );


    const existing =
        await getConnection(
            creatorId
        );


    const now =
        Date.now();


    const refreshToken =
        data.refresh_token ||
        existing?.refresh_token ||
        null;


    const accessExpiresAt =
        data.expires_in != null
            ? now +
              Number(
                  data.expires_in
              ) *
              1000
            : existing?.access_expires_at ||
              null;


    const refreshExpiresAt =
        data.refresh_expires_in != null
            ? now +
              Number(
                  data.refresh_expires_in
              ) *
              1000
            : existing?.refresh_expires_at ||
              null;


    await pool.query(
        `
        INSERT INTO tiktok_connections (

            creator_id,
            connected,
            open_id,
            access_token,
            refresh_token,
            access_expires_at,
            refresh_expires_at,
            scope,
            updated_at

        )

        VALUES (
            $1,
            TRUE,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            NOW()
        )

        ON CONFLICT (
            creator_id
        )

        DO UPDATE SET

            connected =
                TRUE,

            open_id =
                COALESCE(
                    EXCLUDED.open_id,
                    tiktok_connections.open_id
                ),

            access_token =
                EXCLUDED.access_token,

            refresh_token =
                COALESCE(
                    EXCLUDED.refresh_token,
                    tiktok_connections.refresh_token
                ),

            access_expires_at =
                EXCLUDED.access_expires_at,

            refresh_expires_at =
                COALESCE(
                    EXCLUDED.refresh_expires_at,
                    tiktok_connections.refresh_expires_at
                ),

            scope =
                EXCLUDED.scope,

            updated_at =
                NOW()
        `,
        [
            creatorId,

            data.open_id ||
            existing?.open_id ||
            null,

            encryptSecret(
                data.access_token
            ),

            refreshToken
                ? encryptSecret(
                    refreshToken
                )
                : null,

            accessExpiresAt,

            refreshExpiresAt,

            data.scope ||
            existing?.scope ||
            ""
        ]
    );

}


// ============================================================
// TIKTOK PROFIL SPEICHERN
// ============================================================

async function saveProfile(
    creatorId,
    profile
) {

    await pool.query(
        `
        UPDATE tiktok_connections

        SET
            open_id = $2,
            display_name = $3,
            avatar_url = $4,
            follower_count = $5,
            following_count = $6,
            likes_count = $7,
            video_count = $8,
            updated_at = NOW()

        WHERE creator_id = $1
        `,
        [
            normalizeCreatorId(
                creatorId
            ),

            profile.open_id ||
            null,

            profile.display_name ||
            "",

            profile.avatar_url ||
            "",

            Number(
                profile.follower_count ||
                0
            ),

            Number(
                profile.following_count ||
                0
            ),

            Number(
                profile.likes_count ||
                0
            ),

            Number(
                profile.video_count ||
                0
            )
        ]
    );

}


// ============================================================
// LAUNCHER API KEY
// ============================================================

function requireLauncherKey(
    req,
    res,
    next
) {

    const supplied =
        req.get(
            "X-CFS-API-Key"
        );


    if (
        !supplied
    ) {

        return res
            .status(401)
            .json({

                ok:
                    false,

                error:
                    "API-Key fehlt."

            });

    }


    if (
        !safeEqualText(
            LAUNCHER_API_KEY,
            supplied
        )
    ) {

        return res
            .status(403)
            .json({

                ok:
                    false,

                error:
                    "API-Key ungültig."

            });

    }


    next();

}


// ============================================================
// HEALTH CHECK
// ============================================================

app.get(
    "/api/health",
    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );


        try {

            await pool.query(
                "SELECT 1"
            );


            return res.json({

                ok:
                    true,

                service:
                    APP_NAME,

                backend:
                    "Creator Suite Backend",

                version:
                    BACKEND_VERSION,

                status:
                    "online",

                database:
                    "connected",

                redirect_uri:
                    REDIRECT_URI,

                modules: {

                    account:
                        "online",

                    security_activity:
                        "online",

                    creator_settings:
                        "online",

                    widget_studio:
                        "online",

                    tiktok:
                        "online",

                    launcher:
                        "online",

                    launcher_release_center:
                        "online",

                    widget_scene_composer:
                        "online",

                    nexus:
                        "prepared",

                    cut_studio:
                        "online",

                    games:
                        "online",

                    audio_studio:
                        "roadmap",

                    twitch:
                        "roadmap",

                    obs:
                        "roadmap"

                }

            });

        }
        catch (error) {

            console.error(
                "Health Check Error:",
                error
            );


            return res
                .status(503)
                .json({

                    ok:
                        false,

                    service:
                        APP_NAME,

                    version:
                        BACKEND_VERSION,

                    status:
                        "database_error"

                });

        }

    }
);


// ============================================================
// CREATOR-SPEZIFISCHE TIKTOK VERBINDUNG
//
// Diese Routen sind die öffentliche Creator-Suite-Verbindung.
// Der bestehende /auth/tiktok Owner-Pfad bleibt für Legacy/Root erhalten.
// ============================================================

function publicTikTokConnection(connection) {
    const grantedScopes=String(connection?.scope||"")
        .split(/[\s,]+/)
        .map(scope=>scope.trim())
        .filter(Boolean);
    return {
        connected:Boolean(connection?.connected),
        scopes:{
            basic:grantedScopes.includes("user.info.basic"),
            stats:grantedScopes.includes("user.info.stats")
        },
        profile:{
            display_name:connection?.display_name||"",
            avatar_url:connection?.avatar_url||"",
            follower_count:Number(connection?.follower_count||0),
            following_count:Number(connection?.following_count||0),
            likes_count:Number(connection?.likes_count||0),
            video_count:Number(connection?.video_count||0)
        },
        updated_at:connection?.updated_at||null
    };
}

app.get(
    "/api/creator/tiktok/status",
    requireCreatorAccount,
    async(req,res)=>{
        res.set("Cache-Control","no-store");
        try {
            const connection=await getConnection(req.creatorAccount.id);
            return res.json({ok:true,...publicTikTokConnection(connection)});
        } catch (error) {
            console.error("Creator TikTok Status Fehler:",error);
            return res.status(500).json({ok:false,connected:false,error:"TikTok Status konnte nicht geladen werden."});
        }
    }
);

app.get(
    "/auth/creator/tiktok",
    requireCreatorAccount,
    tiktokConnectLimiter,
    async(req,res)=>{
        res.set("Cache-Control","no-store");
        try {
            return await beginTikTokOAuth(res,req.creatorAccount.id);
        } catch (error) {
            console.error("Creator TikTok Login Fehler:",error);
            return res.status(500).send(renderPage("TikTok Verbindung",`<p class="error">TikTok Login konnte nicht gestartet werden.</p>`));
        }
    }
);

app.post(
    "/api/creator/tiktok/sync",
    requireCreatorAccount,
    async(req,res)=>{
        res.set("Cache-Control","no-store");
        try {
            const connection=await getConnection(req.creatorAccount.id);
            if(!connection?.connected)return res.status(409).json({ok:false,error:"TikTok ist noch nicht verbunden."});
            const profile=await fetchTikTokProfile(req.creatorAccount.id);
            return res.json({ok:true,connected:true,profile,updated_at:profile.updated_at});
        } catch (error) {
            const diagnostic=getSafeDiagnostic(error,"creator_profile_sync");
            return res.status(502).json({ok:false,error:diagnosticMessage(diagnostic),diagnostic});
        }
    }
);

app.post(
    "/api/creator/tiktok/disconnect",
    requireCreatorAccount,
    async(req,res)=>{
        res.set("Cache-Control","no-store");
        try {
            const creatorId=req.creatorAccount.id;
            const connection=await getConnection(creatorId);
            if(connection?.access_token){
                try {
                    const body=new URLSearchParams({client_key:CLIENT_KEY,client_secret:CLIENT_SECRET,token:connection.access_token});
                    await fetchTikTok(TIKTOK_REVOKE_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
                } catch (error) {
                    console.warn("Creator TikTok Revoke Warnung:",getSafeDiagnostic(error,"creator_disconnect"));
                }
            }
            await pool.query(`DELETE FROM tiktok_connections WHERE creator_id=$1`,[creatorId]);
            await pool.query(`DELETE FROM tiktok_oauth_states WHERE creator_id=$1`,[creatorId]);
            return res.json({ok:true,connected:false});
        } catch (error) {
            console.error("Creator TikTok Disconnect Fehler:",error);
            return res.status(500).json({ok:false,error:"TikTok-Verbindung konnte nicht getrennt werden."});
        }
    }
);

// ============================================================
// TIKTOK STATUS
// ============================================================

app.get(
    "/api/tiktok/status",
    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );


        try {

            const connection =
                await getConnection(
                    DEFAULT_CREATOR_ID
                );


            const grantedScopes =
                String(
                    connection?.scope ||
                    ""
                )
                    .split(
                        /[\s,]+/
                    )
                    .map(
                        scope =>
                            scope.trim()
                    )
                    .filter(
                        Boolean
                    );


            return res.json({

                ok:
                    true,

                connected:
                    Boolean(
                        connection?.connected
                    ),

                scopes: {

                    basic:
                        grantedScopes.includes(
                            "user.info.basic"
                        ),

                    stats:
                        grantedScopes.includes(
                            "user.info.stats"
                        )

                },

                profile: {

                    display_name:
                        connection?.display_name ||
                        "",

                    avatar_url:
                        connection?.avatar_url ||
                        "",

                    follower_count:
                        Number(
                            connection?.follower_count ||
                            0
                        ),

                    following_count:
                        Number(
                            connection?.following_count ||
                            0
                        ),

                    likes_count:
                        Number(
                            connection?.likes_count ||
                            0
                        ),

                    video_count:
                        Number(
                            connection?.video_count ||
                            0
                        )

                },

                updated_at:
                    connection?.updated_at ||
                    null

            });

        }
        catch (error) {

            console.error(
                "TikTok Status Error:",
                error
            );


            return res
                .status(500)
                .json({

                    ok:
                        false,

                    connected:
                        false,

                    error:
                        "Status konnte nicht geladen werden."

                });

        }

    }
);


// ============================================================
// LAUNCHER - TIKTOK PROFIL
// ============================================================

app.get(
    "/api/launcher/tiktok/profile",

    requireLauncherKey,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );


        let creatorId =
            DEFAULT_CREATOR_ID;


        try {

            creatorId =
                creatorIdFromRequest(
                    req
                );


            const connection =
                await getConnection(
                    creatorId
                );


            if (
                !connection?.connected
            ) {

                return res
                    .status(401)
                    .json({

                        ok:
                            false,

                        connected:
                            false,

                        creator_id:
                            creatorId,

                        error:
                            "TikTok ist nicht verbunden."

                    });

            }


            if (
                !connection?.refresh_token
            ) {

                return res
                    .status(401)
                    .json({

                        ok:
                            false,

                        connected:
                            false,

                        creator_id:
                            creatorId,

                        error:
                            "TikTok Refresh Token fehlt."

                    });

            }


            const profile =
                await fetchTikTokProfile(
                    creatorId
                );


            return res.json({

                ok:
                    true,

                connected:
                    true,

                creator_id:
                    creatorId,

                profile

            });

        }
        catch (error) {

            const diagnostic =
                getSafeDiagnostic(
                    error,
                    "launcher_profile"
                );


            console.error(
                "[CFS TikTok] Launcher-Profil fehlgeschlagen:",
                diagnostic
            );


            return res
                .status(502)
                .json({

                    ok:
                        false,

                    connected:
                        false,

                    creator_id:
                        creatorId,

                    error:
                        diagnosticMessage(
                            diagnostic
                        ),

                    diagnostic

                });

        }

    }
);


// ============================================================
// ALTER ÖFFENTLICHER PROFIL-ENDPUNKT DEAKTIVIERT
// ============================================================

app.get(
    "/api/tiktok/profile",
    (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );


        return res
            .status(410)
            .json({

                ok:
                    false,

                error:
                    "Dieser öffentliche Profil-Endpunkt wurde deaktiviert."

            });

    }
);


// ============================================================
// TIKTOK OAUTH START
// ============================================================

async function beginTikTokOAuth(
    res,
    creatorId = DEFAULT_CREATOR_ID
) {

    creatorId =
        normalizeCreatorId(
            creatorId
        );


    const state =
        crypto
            .randomBytes(
                32
            )
            .toString(
                "hex"
            );


    const stateHash =
        hashValue(
            state
        );


    await cleanupExpiredOAuthStates();


    await pool.query(
        `
        INSERT INTO tiktok_oauth_states (
            state_hash,
            creator_id,
            expires_at
        )

        VALUES (
            $1,
            $2,
            NOW() + INTERVAL '10 minutes'
        )
        `,
        [
            stateHash,
            creatorId
        ]
    );


    res.cookie(
        "cfs_tiktok_state",
        state,
        {

            httpOnly:
                true,

            secure:
                NODE_ENV !==
                "development",

            sameSite:
                "lax",

            maxAge:
                OAUTH_TTL_MS,

            path:
                "/"

        }
    );


    const params =
        new URLSearchParams({

            client_key:
                CLIENT_KEY,

            response_type:
                "code",

            scope:
                REQUESTED_SCOPES.join(
                    ","
                ),

            redirect_uri:
                REDIRECT_URI,

            state

        });


    return res.redirect(
        `${TIKTOK_AUTHORIZE_URL}?${params.toString()}`
    );

}


// ============================================================
// TIKTOK OWNER GATE
// ============================================================

function renderTikTokOwnerGate(
    errorMessage = ""
) {

    const errorHtml =
        errorMessage
            ? `
                <p class="error">
                    ${escapeHtml(
                        errorMessage
                    )}
                </p>
              `
            : "";


    return renderPage(
        "TikTok Verbindung",
        `

        <p class="muted">
            Diese Verbindung ist aktuell als geschützter
            Creator-Owner-Login eingerichtet.
        </p>

        <p class="muted">
            TikTok-Tokens werden ausschließlich
            auf dem Server verarbeitet.
        </p>

        ${errorHtml}

        <form
            method="post"
            action="/auth/tiktok/start"
        >

            <label for="connect_code">
                Creator-Verbindungscode
            </label>

            <input
                id="connect_code"
                name="connect_code"
                type="password"
                required
                autocomplete="current-password"
            >

            <button
                class="button"
                type="submit"
            >
                TikTok Login starten
            </button>

        </form>

        <p class="muted small">
            Hier wird nicht dein TikTok-Passwort eingegeben.
        </p>

        `
    );

}


// ============================================================
// /auth/tiktok
// ============================================================

app.get(
    "/auth/tiktok",

    tiktokConnectLimiter,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );


        try {

            if (
                ALLOW_PUBLIC_TIKTOK_CONNECT
            ) {

                return await beginTikTokOAuth(
                    res,
                    DEFAULT_CREATOR_ID
                );

            }


            if (
                !TIKTOK_CONNECT_CODE
            ) {

                return res
                    .status(503)
                    .send(
                        renderPage(
                            "TikTok Verbindung",
                            `
                            <p>
                                Die TikTok-Verwaltung
                                ist derzeit gesperrt.
                            </p>

                            <p class="muted">
                                CFS_TIKTOK_CONNECT_CODE
                                ist auf dem Server nicht gesetzt.
                            </p>
                            `
                        )
                    );

            }


            return res.send(
                renderTikTokOwnerGate()
            );

        }
        catch (error) {

            console.error(
                "TikTok Login Error:",
                error
            );


            return res
                .status(500)
                .send(
                    renderPage(
                        "TikTok Verbindung",
                        `
                        <p class="error">
                            TikTok Login konnte nicht gestartet werden.
                        </p>
                        `
                    )
                );

        }

    }
);


// ============================================================
// TIKTOK LOGIN START
// ============================================================

app.post(
    "/auth/tiktok/start",

    tiktokConnectLimiter,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );


        try {

            if (
                ALLOW_PUBLIC_TIKTOK_CONNECT
            ) {

                return await beginTikTokOAuth(
                    res,
                    DEFAULT_CREATOR_ID
                );

            }


            if (
                !TIKTOK_CONNECT_CODE
            ) {

                return res
                    .status(503)
                    .send(
                        renderPage(
                            "TikTok Verbindung",
                            `
                            <p>
                                Privater Creator-Login
                                ist nicht eingerichtet.
                            </p>
                            `
                        )
                    );

            }


            const suppliedCode =
                String(
                    req.body?.connect_code ||
                    ""
                ).trim();


            if (
                !suppliedCode ||
                !safeEqualText(
                    TIKTOK_CONNECT_CODE,
                    suppliedCode
                )
            ) {

                return res
                    .status(403)
                    .send(
                        renderTikTokOwnerGate(
                            "Der Creator-Verbindungscode ist nicht korrekt."
                        )
                    );

            }


            return await beginTikTokOAuth(
                res,
                DEFAULT_CREATOR_ID
            );

        }
        catch (error) {

            console.error(
                "TikTok Login Start Error:",
                error
            );


            return res
                .status(500)
                .send(
                    renderPage(
                        "TikTok Verbindung",
                        `
                        <p class="error">
                            TikTok Anmeldung konnte nicht gestartet werden.
                        </p>
                        `
                    )
                );

        }

    }
);


// ============================================================
// TIKTOK CALLBACK
// ============================================================

app.get(
    "/auth/tiktok/callback",
    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );


        try {

            const {
                code,
                state,
                error,
                error_description:
                    errorDescription
            } =
                req.query;


            if (
                error
            ) {

                return res
                    .status(400)
                    .send(
                        renderPage(
                            "TikTok Verbindung",
                            `
                            <p>
                                TikTok Verbindung wurde
                                nicht abgeschlossen.
                            </p>

                            <p class="muted">
                                ${escapeHtml(
                                    errorDescription ||
                                    error
                                )}
                            </p>
                            `
                        )
                    );

            }


            if (
                !code
            ) {

                return res
                    .status(400)
                    .send(
                        renderPage(
                            "TikTok Verbindung",
                            `
                            <p>
                                Kein Autorisierungscode
                                von TikTok erhalten.
                            </p>
                            `
                        )
                    );

            }


            const cookies =
                parseCookies(
                    req
                );


            const cookieState =
                cookies
                    .cfs_tiktok_state;


            if (
                !state ||
                !cookieState ||
                !safeEqualText(
                    state,
                    cookieState
                )
            ) {

                return res
                    .status(400)
                    .send(
                        renderPage(
                            "Sicherheitsprüfung",
                            `
                            <p>
                                OAuth Sicherheitsprüfung
                                fehlgeschlagen.
                            </p>
                            `
                        )
                    );

            }


            const stateHash =
                hashValue(
                    state
                );


            const stateResult =
                await pool.query(
                    `
                    DELETE FROM tiktok_oauth_states

                    WHERE
                        state_hash = $1

                    AND
                        expires_at >= NOW()

                    RETURNING
                        creator_id
                    `,
                    [
                        stateHash
                    ]
                );


            if (
                !stateResult.rowCount
            ) {

                return res
                    .status(400)
                    .send(
                        renderPage(
                            "Sicherheitsprüfung",
                            `
                            <p>
                                Login ist abgelaufen
                                oder wurde bereits verwendet.
                            </p>
                            `
                        )
                    );

            }


            const creatorId =
                normalizeCreatorId(
                    stateResult
                        .rows[0]
                        .creator_id
                );


            const tokenData =
                await exchangeAuthorizationCode(
                    code
                );


            await saveTokens(
                creatorId,
                tokenData
            );


            const profile =
                await fetchTikTokProfile(
                    creatorId
                );


            res.clearCookie(
                "cfs_tiktok_state",
                {
                    path:
                        "/"
                }
            );


            return res.send(
                renderPage(
                    "TikTok erfolgreich verbunden",
                    `

                    <div class="success">
                        ✓ TikTok erfolgreich verbunden
                    </div>

                    ${
                        profile.avatar_url
                            ? `
                                <img
                                    class="avatar"
                                    src="${escapeHtml(
                                        profile.avatar_url
                                    )}"
                                    alt="TikTok Profilbild"
                                >
                              `
                            : ""
                    }

                    <h2>
                        ${escapeHtml(
                            profile.display_name ||
                            "TikTok Creator"
                        )}
                    </h2>

                    <div class="stats">

                        <div>
                            <span>
                                Follower
                            </span>

                            <strong>
                                ${formatNumber(
                                    profile.follower_count
                                )}
                            </strong>
                        </div>

                        <div>
                            <span>
                                Gefolgt
                            </span>

                            <strong>
                                ${formatNumber(
                                    profile.following_count
                                )}
                            </strong>
                        </div>

                        <div>
                            <span>
                                Likes
                            </span>

                            <strong>
                                ${formatNumber(
                                    profile.likes_count
                                )}
                            </strong>
                        </div>

                        <div>
                            <span>
                                Videos
                            </span>

                            <strong>
                                ${formatNumber(
                                    profile.video_count
                                )}
                            </strong>
                        </div>

                    </div>

                    <p>
                        <a
                            class="button"
                            href="/pages/tiktok.html"
                        >
                            Zum TikTok Hub
                        </a>
                    </p>

                    `
                )
            );

        }
        catch (error) {

            const diagnostic =
                getSafeDiagnostic(
                    error,
                    "oauth_callback"
                );


            console.error(
                "TikTok Callback Error:",
                diagnostic
            );


            return res
                .status(500)
                .send(
                    renderPage(
                        "TikTok Verbindung",
                        `

                        <p class="error">
                            Beim Verbinden mit TikTok
                            ist ein Fehler aufgetreten.
                        </p>

                        <p class="muted">
                            ${escapeHtml(
                                diagnosticMessage(
                                    diagnostic
                                )
                            )}
                        </p>

                        `
                    )
                );

        }

    }
);


// ============================================================
// TIKTOK TOKEN EXCHANGE
// ============================================================

async function exchangeAuthorizationCode(
    code
) {

    const body =
        new URLSearchParams({

            client_key:
                CLIENT_KEY,

            client_secret:
                CLIENT_SECRET,

            code:
                String(
                    code
                ),

            grant_type:
                "authorization_code",

            redirect_uri:
                REDIRECT_URI

        });


    const response =
        await fetchTikTok(
            TIKTOK_TOKEN_URL,
            {

                method:
                    "POST",

                headers: {

                    "Content-Type":
                        "application/x-www-form-urlencoded",

                    "Cache-Control":
                        "no-cache"

                },

                body

            }
        );


    const data =
        await safeJson(
            response
        );


    if (
        !response.ok ||
        !data?.access_token ||
        !data?.refresh_token
    ) {

        throw createTikTokApiError(
            "token_exchange",
            response,
            data,
            "TikTok Token Exchange fehlgeschlagen."
        );

    }


    return data;

}


// ============================================================
// ACCESS TOKEN PRÜFEN
// ============================================================

async function ensureFreshAccessToken(
    creatorId
) {

    const connection =
        await getConnection(
            creatorId
        );


    if (
        !connection?.connected
    ) {

        throw new Error(
            "Keine TikTok-Verbindung."
        );

    }


    const expiresAt =
        Number(
            connection
                .access_expires_at ||
            0
        );


    if (
        connection.access_token &&
        expiresAt &&
        Date.now() <
            expiresAt -
            ACCESS_TOKEN_SAFETY_WINDOW_MS
    ) {

        return true;

    }


    await refreshAccessToken(
        creatorId
    );


    return true;

}


// ============================================================
// TOKEN REFRESH
// ============================================================

async function refreshAccessToken(
    creatorId
) {

    const connection =
        await getConnection(
            creatorId
        );


    if (
        !connection?.refresh_token
    ) {

        throw new Error(
            "Kein Refresh Token vorhanden."
        );

    }


    const body =
        new URLSearchParams({

            client_key:
                CLIENT_KEY,

            client_secret:
                CLIENT_SECRET,

            grant_type:
                "refresh_token",

            refresh_token:
                connection
                    .refresh_token

        });


    const response =
        await fetchTikTok(
            TIKTOK_TOKEN_URL,
            {

                method:
                    "POST",

                headers: {

                    "Content-Type":
                        "application/x-www-form-urlencoded",

                    "Cache-Control":
                        "no-cache"

                },

                body

            }
        );


    const data =
        await safeJson(
            response
        );


    if (
        !response.ok ||
        !data?.access_token
    ) {

        throw createTikTokApiError(
            "token_refresh",
            response,
            data,
            "TikTok Token Refresh fehlgeschlagen."
        );

    }


    await saveTokens(
        creatorId,
        {

            ...data,

            refresh_token:
                data.refresh_token ||
                connection.refresh_token

        }
    );

}


// ============================================================
// TIKTOK PROFIL LADEN
// ============================================================

async function fetchTikTokProfile(
    creatorId
) {

    await ensureFreshAccessToken(
        creatorId
    );


    const connection =
        await getConnection(
            creatorId
        );


    if (
        !connection?.access_token
    ) {

        throw new Error(
            "Kein TikTok Access Token vorhanden."
        );

    }


    const fields = [

        "open_id",
        "avatar_url",
        "display_name",
        "follower_count",
        "following_count",
        "likes_count",
        "video_count"

    ].join(",");


    const url =
        TIKTOK_USER_INFO_URL +
        "?fields=" +
        encodeURIComponent(
            fields
        );


    const response =
        await fetchTikTok(
            url,
            {

                method:
                    "GET",

                headers: {

                    Authorization:
                        `Bearer ${connection.access_token}`,

                    "Cache-Control":
                        "no-cache"

                }

            }
        );


    const data =
        await safeJson(
            response
        );


    if (
        !response.ok ||
        !data?.data?.user
    ) {

        throw createTikTokApiError(
            "user_info",
            response,
            data,
            "TikTok User Info fehlgeschlagen."
        );

    }


    const user =
        data.data.user;


    const profile = {

        open_id:
            user.open_id ||
            connection.open_id ||
            "",

        display_name:
            user.display_name ||
            "",

        avatar_url:
            user.avatar_url ||
            "",

        follower_count:
            Number(
                user.follower_count ||
                0
            ),

        following_count:
            Number(
                user.following_count ||
                0
            ),

        likes_count:
            Number(
                user.likes_count ||
                0
            ),

        video_count:
            Number(
                user.video_count ||
                0
            ),

        updated_at:
            new Date()
                .toISOString()

    };


    await saveProfile(
        creatorId,
        profile
    );


    return profile;

}
// ============================================================
// TIKTOK RESET
// ============================================================

app.get(
    "/auth/tiktok/reset",
    (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        return res.send(
            renderPage(
                "TikTok Verbindung zurücksetzen",
                `

                <p class="muted">
                    Hier wird nur die aktuell gespeicherte
                    TikTok-Verbindung der cfs_zockt
                    Creator Suite gelöscht.
                </p>

                <form
                    method="post"
                    action="/auth/tiktok/reset"
                >

                    <label for="connect_code">
                        Creator-Verbindungscode
                    </label>

                    <input
                        id="connect_code"
                        name="connect_code"
                        type="password"
                        required
                        autocomplete="current-password"
                    >

                    <button
                        class="button danger"
                        type="submit"
                    >
                        TikTok Verbindung zurücksetzen
                    </button>

                </form>

                `
            )
        );

    }
);


app.post(
    "/auth/tiktok/reset",
    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        try {

            const suppliedCode =
                String(
                    req.body?.connect_code ||
                    ""
                ).trim();


            if (
                !TIKTOK_CONNECT_CODE ||
                !suppliedCode ||
                !safeEqualText(
                    TIKTOK_CONNECT_CODE,
                    suppliedCode
                )
            ) {

                return res
                    .status(403)
                    .send(
                        renderPage(
                            "TikTok Verbindung zurücksetzen",
                            `
                            <p class="error">
                                Verbindungscode ist nicht korrekt.
                            </p>
                            `
                        )
                    );

            }


            await pool.query(
                `
                DELETE FROM tiktok_connections
                WHERE creator_id = $1
                `,
                [
                    DEFAULT_CREATOR_ID
                ]
            );


            await pool.query(
                `
                DELETE FROM tiktok_oauth_states
                `
            );


            console.log(
                "[CFS TikTok] TikTok-Verbindung wurde zurückgesetzt."
            );


            return res.send(
                renderPage(
                    "TikTok zurückgesetzt",
                    `

                    <div class="success">
                        ✓ TikTok-Verbindung wurde gelöscht
                    </div>

                    <p class="muted">
                        Jetzt kannst du TikTok neu verbinden.
                    </p>

                    <p>
                        <a
                            class="button"
                            href="/auth/tiktok"
                        >
                            TikTok neu verbinden
                        </a>
                    </p>

                    `
                )
            );

        }
        catch (error) {

            console.error(
                "TikTok Reset Fehler:",
                error
            );


            return res
                .status(500)
                .send(
                    renderPage(
                        "TikTok Reset Fehler",
                        `
                        <p class="error">
                            Die TikTok-Verbindung konnte
                            nicht zurückgesetzt werden.
                        </p>
                        `
                    )
                );

        }

    }
);


// ============================================================
// TIKTOK DISCONNECT
// ============================================================

app.post(
    "/auth/tiktok/disconnect",

    requireLauncherKey,

    async (
        req,
        res
    ) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        try {

            const creatorId =
                creatorIdFromRequest(
                    req
                );


            const connection =
                await getConnection(
                    creatorId
                );


            if (
                connection?.access_token
            ) {

                const body =
                    new URLSearchParams({

                        client_key:
                            CLIENT_KEY,

                        client_secret:
                            CLIENT_SECRET,

                        token:
                            connection.access_token

                    });


                const revokeResponse =
                    await fetchTikTok(
                        TIKTOK_REVOKE_URL,
                        {

                            method:
                                "POST",

                            headers: {

                                "Content-Type":
                                    "application/x-www-form-urlencoded"

                            },

                            body

                        }
                    );


                if (
                    !revokeResponse.ok
                ) {

                    const revokeData =
                        await safeJson(
                            revokeResponse
                        );


                    console.warn(
                        "TikTok Revoke:",
                        sanitizeTikTokError(
                            revokeData
                        )
                    );

                }

            }


            await pool.query(
                `
                DELETE FROM tiktok_connections
                WHERE creator_id = $1
                `,
                [
                    creatorId
                ]
            );


            return res.json({

                ok:
                    true,

                connected:
                    false,

                creator_id:
                    creatorId

            });

        }
        catch (error) {

            console.error(
                "Disconnect Error:",
                error
            );


            return res
                .status(500)
                .json({

                    ok:
                        false,

                    error:
                        "TikTok-Verbindung konnte nicht getrennt werden."

                });

        }

    }
);


// ============================================================
// TIKTOK FETCH MIT TIMEOUT
// ============================================================

async function fetchTikTok(
    url,
    options = {}
) {

    const controller =
        new AbortController();


    const timeout =
        setTimeout(
            () => {

                controller.abort();

            },
            TIKTOK_TIMEOUT_MS
        );


    try {

        return await fetch(
            url,
            {

                ...options,

                signal:
                    controller.signal

            }
        );

    }
    catch (error) {

        if (
            error?.name ===
            "AbortError"
        ) {

            const timeoutError =
                new Error(
                    "TikTok Anfrage hat das Zeitlimit überschritten."
                );


            timeoutError.tiktokDiagnostic = {

                stage:
                    "network_timeout",

                http_status:
                    null,

                code:
                    "timeout",

                description:
                    "TikTok API antwortete nicht innerhalb von 15 Sekunden.",

                log_id:
                    ""

            };


            throw timeoutError;

        }


        throw error;

    }
    finally {

        clearTimeout(
            timeout
        );

    }

}


// ============================================================
// JSON SICHER LESEN
// ============================================================

async function safeJson(
    response
) {

    const text =
        await response.text();


    if (
        !text
    ) {

        return {};

    }


    try {

        return JSON.parse(
            text
        );

    }
    catch {

        return {

            raw_response:
                text.slice(
                    0,
                    500
                )

        };

    }

}


// ============================================================
// TIKTOK FEHLER SÄUBERN
// ============================================================

function sanitizeTikTokError(
    data
) {

    if (
        !data ||
        typeof data !==
            "object"
    ) {

        return {};

    }


    const nested =
        data.error &&
        typeof data.error ===
            "object"
            ? data.error
            : {};


    const code =

        nested.code ??

        data.code ??

        data.error_code ??

        (
            typeof data.error ===
            "string"
                ? data.error
                : ""
        );


    const description =

        nested.message ??

        data.error_description ??

        data.message ??

        "";


    const logId =

        nested.log_id ??

        data.log_id ??

        "";


    return {

        code:
            cleanDiagnosticText(
                code,
                120
            ),

        description:
            cleanDiagnosticText(
                description,
                300
            ),

        log_id:
            cleanDiagnosticText(
                logId,
                160
            )

    };

}


// ============================================================
// TIKTOK API ERROR
// ============================================================

function createTikTokApiError(
    stage,
    response,
    data,
    fallbackMessage
) {

    const safe =
        sanitizeTikTokError(
            data
        );


    const diagnostic = {

        stage:
            cleanDiagnosticText(
                stage,
                80
            ),

        http_status:
            response &&
            Number.isFinite(
                Number(
                    response.status
                )
            )
                ? Number(
                    response.status
                )
                : null,

        code:
            safe.code ||
            "",

        description:
            safe.description ||
            "",

        log_id:
            safe.log_id ||
            ""

    };


    console.error(
        `[CFS TikTok] ${stage} fehlgeschlagen:`,
        diagnostic
    );


    const error =
        new Error(
            fallbackMessage ||
            "TikTok API Fehler."
        );


    error.tiktokDiagnostic =
        diagnostic;


    return error;

}


// ============================================================
// DIAGNOSE
// ============================================================

function getSafeDiagnostic(
    error,
    fallbackStage =
        "unknown"
) {

    if (
        error?.tiktokDiagnostic &&
        typeof error.tiktokDiagnostic ===
            "object"
    ) {

        const source =
            error.tiktokDiagnostic;


        return {

            stage:
                cleanDiagnosticText(
                    source.stage ||
                    fallbackStage,
                    80
                ),

            http_status:
                Number.isFinite(
                    Number(
                        source.http_status
                    )
                )
                    ? Number(
                        source.http_status
                    )
                    : null,

            code:
                cleanDiagnosticText(
                    source.code ||
                    "",
                    120
                ),

            description:
                cleanDiagnosticText(
                    source.description ||
                    "",
                    300
                ),

            log_id:
                cleanDiagnosticText(
                    source.log_id ||
                    "",
                    160
                )

        };

    }


    return {

        stage:
            cleanDiagnosticText(
                fallbackStage,
                80
            ),

        http_status:
            null,

        code:
            "",

        description:
            cleanDiagnosticText(
                error?.message ||
                "Unbekannter Fehler",
                300
            ),

        log_id:
            ""

    };

}


// ============================================================
// DIAGNOSE TEXT
// ============================================================

function diagnosticMessage(
    diagnostic
) {

    const parts = [
        "TikTok Profildaten konnten nicht aktualisiert werden."
    ];


    if (
        diagnostic?.stage
    ) {

        parts.push(
            `Stufe: ${diagnostic.stage}`
        );

    }


    if (
        diagnostic?.http_status
    ) {

        parts.push(
            `TikTok HTTP ${diagnostic.http_status}`
        );

    }


    if (
        diagnostic?.code
    ) {

        parts.push(
            `Code: ${diagnostic.code}`
        );

    }


    if (
        diagnostic?.description
    ) {

        parts.push(
            `Meldung: ${diagnostic.description}`
        );

    }


    if (
        diagnostic?.log_id
    ) {

        parts.push(
            `Log-ID: ${diagnostic.log_id}`
        );

    }


    return parts.join(
        " | "
    );

}


// ============================================================
// DIAGNOSE TEXT BEREINIGEN
// ============================================================

function cleanDiagnosticText(
    value,
    maxLength =
        300
) {

    return String(
        value ??
        ""
    )
        .replace(
            /[\r\n\t]+/g,
            " "
        )
        .trim()
        .slice(
            0,
            maxLength
        );

}


// ============================================================
// COOKIES
// ============================================================

function parseCookies(
    req
) {

    const result =
        {};


    const header =
        req.headers.cookie ||
        "";


    for (
        const item
        of header.split(";")
    ) {

        const index =
            item.indexOf("=");


        if (
            index ===
            -1
        ) {

            continue;

        }


        const key =
            item
                .slice(
                    0,
                    index
                )
                .trim();


        const value =
            item
                .slice(
                    index + 1
                )
                .trim();


        if (
            !key
        ) {

            continue;

        }


        try {

            result[key] =
                decodeURIComponent(
                    value
                );

        }
        catch {

            result[key] =
                value;

        }

    }


    return result;

}


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(
    value
) {

    return String(
        value ??
        ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );

}


// ============================================================
// ZAHL FORMATIEREN
// ============================================================

function formatNumber(
    value
) {

    return new Intl
        .NumberFormat(
            "de-DE"
        )
        .format(
            Number(
                value ||
                0
            )
        );

}


// ============================================================
// PUBLIC ORDNER ERMITTELN
// ============================================================

function resolvePublicDirectory() {

    if (
        process.env.PUBLIC_DIR
    ) {

        return path.resolve(
            __dirname,
            process.env.PUBLIC_DIR
        );

    }


    const candidates = [

        path.join(
            __dirname,
            "public"
        ),

        path.join(
            __dirname,
            "Öffentlich"
        )

    ];


    for (
        const candidate
        of candidates
    ) {

        if (
            fs.existsSync(
                candidate
            )
        ) {

            return candidate;

        }

    }


    return path.join(
        __dirname,
        "public"
    );

}


const PUBLIC_DIR =
    resolvePublicDirectory();


// ============================================================
// SERVER HTML SEITE
// ============================================================

function renderPage(
    title,
    content
) {

    return `
    <!doctype html>

    <html lang="de">

    <head>

        <meta charset="utf-8">

        <meta
            name="viewport"
            content="width=device-width,initial-scale=1"
        >

        <meta
            name="robots"
            content="noindex,nofollow"
        >

        <title>
            ${escapeHtml(title)} | cfs_zockt
        </title>

        <style>

            * {
                box-sizing: border-box;
            }

            body {

                margin: 0;

                min-height: 100vh;

                padding: 40px 20px;

                background:
                    radial-gradient(
                        circle at top,
                        rgba(0, 120, 255, .22),
                        transparent 45%
                    ),
                    #070a11;

                color: #fff;

                font-family:
                    Arial,
                    Helvetica,
                    sans-serif;

            }

            main {

                width:
                    min(
                        700px,
                        100%
                    );

                margin: auto;

                padding: 32px;

                border:
                    1px solid #26334c;

                border-radius: 24px;

                background:
                    #0d121d;

                text-align:
                    center;

            }

            h1,
            h2 {
                margin-top: 10px;
            }

            .muted {

                color:
                    #9caac0;

                line-height:
                    1.6;

            }

            .small {
                font-size: 13px;
            }

            .error {

                color:
                    #ff9fac;

                font-weight:
                    bold;

            }

            .success {

                display:
                    inline-block;

                padding:
                    10px 15px;

                margin-bottom:
                    15px;

                border-radius:
                    30px;

                background:
                    #12361e;

                color:
                    #94f3ae;

            }

            .avatar {

                display:
                    block;

                width:
                    110px;

                height:
                    110px;

                margin:
                    18px auto;

                border-radius:
                    50%;

                object-fit:
                    cover;

                border:
                    3px solid #198cff;

            }

            .stats {

                display:
                    grid;

                grid-template-columns:
                    repeat(
                        2,
                        1fr
                    );

                gap:
                    12px;

                margin:
                    25px 0;

            }

            .stats div {

                padding:
                    18px;

                background:
                    #080d16;

                border:
                    1px solid #253149;

                border-radius:
                    14px;

            }

            .stats span {

                display:
                    block;

                color:
                    #94a2bb;

                margin-bottom:
                    8px;

            }

            .stats strong {
                font-size: 25px;
            }

            form {

                width:
                    min(
                        420px,
                        100%
                    );

                margin:
                    24px auto;

                text-align:
                    left;

            }

            label {

                display:
                    block;

                margin-bottom:
                    8px;

                font-weight:
                    bold;

            }

            input {

                width:
                    100%;

                min-height:
                    46px;

                padding:
                    10px 12px;

                border:
                    1px solid #32405c;

                border-radius:
                    10px;

                background:
                    #09111e;

                color:
                    #fff;

                font:
                    inherit;

            }

            .button {

                display:
                    inline-block;

                margin-top:
                    15px;

                padding:
                    13px 20px;

                border:
                    0;

                background:
                    #168cff;

                color:
                    #fff;

                text-decoration:
                    none;

                border-radius:
                    12px;

                font-weight:
                    bold;

                cursor:
                    pointer;

            }

            form .button {
                width: 100%;
            }

            .danger {
                background: #b42333;
            }

            @media (
                max-width: 500px
            ) {

                .stats {
                    grid-template-columns:
                        1fr;
                }

            }

        </style>

    </head>

    <body>

        <main>

            <p class="muted">
                cfs_zockt Creator Suite
            </p>

            <h1>
                ${escapeHtml(title)}
            </h1>

            ${content}

        </main>

    </body>

    </html>
    `;

}


// ============================================================
// UNBEKANNTE API / AUTH ROUTEN
// ============================================================

app.use(
    (
        req,
        res,
        next
    ) => {

        if (
            req.path.startsWith(
                "/api/"
            ) ||
            req.path.startsWith(
                "/auth/"
            )
        ) {

            return res
                .status(404)
                .json({

                    ok:
                        false,

                    error:
                        "Endpunkt nicht gefunden."

                });

        }

        next();

    }
);


// ============================================================
// ÖFFENTLICHE WEBSITE AUS /public
//
// WICHTIG:
// - API UND AUTH LIEGEN VOR EXPRESS.STATIC
// - HTML WIRD NICHT ALT GECACHT
// - CSS / JS / BILDER WERDEN BEI JEDEM AUFRUF
//   AUF AKTUALITÄT GEPRÜFT
// ============================================================

app.use(
    express.static(
        PUBLIC_DIR,
        {

            extensions: [
                "html"
            ],

            etag:
                true,

            lastModified:
                true,

            cacheControl:
                false,

            setHeaders:
                (
                    res,
                    filePath
                ) => {

                    const extension =
                        path
                            .extname(
                                filePath
                            )
                            .toLowerCase();


                    // ------------------------------------------
                    // HTML NICHT CACHEN
                    // ------------------------------------------

                    if (
                        extension ===
                        ".html"
                    ) {

                        res.setHeader(
                            "Cache-Control",
                            "no-store, no-cache, must-revalidate, proxy-revalidate"
                        );

                        res.setHeader(
                            "Pragma",
                            "no-cache"
                        );

                        res.setHeader(
                            "Expires",
                            "0"
                        );

                        return;

                    }


                    // ------------------------------------------
                    // CSS / JS / BILDER / SONSTIGE ASSETS
                    // ------------------------------------------

                    res.setHeader(
                        "Cache-Control",
                        "public, max-age=0, must-revalidate"
                    );

                }

        }
    )
);


// ============================================================
// SERVER ERROR HANDLER
// ============================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "Unbehandelter Serverfehler:",
            error
        );


        if (
            res.headersSent
        ) {

            return next(
                error
            );

        }


        if (
            req.path.startsWith(
                "/api/"
            ) ||
            req.path.startsWith(
                "/auth/"
            )
        ) {

            return res
                .status(500)
                .json({

                    ok:
                        false,

                    error:
                        "Interner Serverfehler."

                });

        }


        return res
            .status(500)
            .send(
                "Interner Serverfehler."
            );

    }
);


// ============================================================
// START
// ============================================================

async function startServer() {

    try {

        validateConfiguration();


        await initDatabase();


        app.listen(
            PORT,
            () => {

                console.log("");

                console.log(
                    "============================================================"
                );

                console.log(
                    `${APP_NAME} Backend ${BACKEND_VERSION}`
                );

                console.log(
                    `Port: ${PORT}`
                );

                console.log(
                    `Website: ${PUBLIC_DIR}`
                );

                console.log(
                    `TikTok Redirect: ${REDIRECT_URI}`
                );

                console.log(
                    "------------------------------------------------------------"
                );

                console.log(
                    "Creator Accounts: ONLINE"
                );

                console.log(
                    "Creator Sessions: ONLINE"
                );

                console.log(
                    "Account-Löschung: ONLINE"
                );

                console.log(
                    `Security-Aktivität: ONLINE / ${SECURITY_EVENT_RETENTION_DAYS} Tage`
                );

                console.log(
                    "Creator Settings: ONLINE"
                );

                console.log(
                    "Widget Studio: ONLINE / Follower Goal v1"
                );

                console.log(
                    "Plan-System: FREE / CREATOR / PRO"
                );

                console.log(
                    "Website Cache: HTML deaktiviert"
                );

                console.log(
                    `Security: Rate Limits aktiv / Passwort min. ${PASSWORD_MIN_LENGTH} Zeichen`
                );

                console.log(
                    `Session-Limit: max. ${CREATOR_MAX_SESSIONS} aktive Sitzungen pro Creator`
                );

                console.log(
                    "------------------------------------------------------------"
                );

                console.log(
                    "Creator Suite Module:"
                );


                for (
                    const module
                    of Object.values(
                        CREATOR_MODULES
                    )
                ) {

                    console.log(
                        `- ${module.title}: ${module.status} / ${module.minimum_plan.toUpperCase()}`
                    );

                }


                console.log(
                    "------------------------------------------------------------"
                );

                console.log(
                    "TikTok: ONLINE"
                );

                console.log(
                    "Launcher API: ONLINE"
                );

                console.log(
                    "NEXUS Basis: ONLINE"
                );

                console.log(
                    "Cut Studio Backend: PREPARED"
                );

                console.log(
                    "Games Backend: PREPARED"
                );

                console.log(
                    "Audio Studio: ROADMAP"
                );

                console.log(
                    "Twitch: ROADMAP"
                );

                console.log(
                    "OBS: ROADMAP"
                );


                if (
                    !TOKEN_ENCRYPTION_KEY
                ) {

                    console.warn(
                        "Hinweis: CFS_TOKEN_ENCRYPTION_KEY ist nicht gesetzt."
                    );

                    console.warn(
                        "TikTok-Tokens werden aktuell nicht zusätzlich verschlüsselt gespeichert."
                    );

                }


                if (
                    !ALLOW_PUBLIC_TIKTOK_CONNECT &&
                    !TIKTOK_CONNECT_CODE
                ) {

                    console.warn(
                        "Hinweis: CFS_TIKTOK_CONNECT_CODE ist nicht gesetzt."
                    );

                }


                console.log(
                    "============================================================"
                );

                console.log("");

            }
        );

    }
    catch (error) {

        console.error(
            "Backend konnte nicht gestartet werden:",
            error
        );


        process.exit(
            1
        );

    }

}


startServer();