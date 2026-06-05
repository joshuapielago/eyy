# EYY Productization Roadmap

Synthesized from a multi-agent review (8 dimensions: security, multi-tenancy,
platform/Teams, reliability, privacy/legal, correctness, distribution/billing,
testing/CI). Every security & correctness finding was adversarially verified
against the source. Tags: **[CODE]** = Claude can implement here · **[OWNER]** =
only you can do it (accounts, legal, payments, marketplace submissions).

## 1. Verdict

EYY today is a clean, well-tested **single-tenant internal tool** for LOKAL, and
almost every line assumes that: one Slack bot token, one signing secret, one
company's seven values hardcoded in `src/shared/values.js`, and a database
(`sql/schema.sql`) with **no tenant column anywhere**. The single biggest lift is
**multi-tenancy** — a tenant/installation identity, OAuth install flows,
per-workspace token storage, and tenant-scoping every query. It is the keystone:
per-customer values/branding, OAuth distribution, data deletion, and Teams all
sit on top of it (note: business model is **free, no billing**). Good news: the shared kudos pipeline
(`src/shared/kudos.js`) is platform-neutral, SQL is parameterized, Slack request
verification is solid, and 233 tests pass. The bones are good; the product
scaffolding is absent.

## 2. Three launch ambitions — very different bills

- **(a) External pilot** — hand-onboard 2–3 friendly companies. Skip billing,
  marketplaces, public install. **Cannot** skip tenant isolation, the silent
  data-loss fix, the Google Chat auth fix, and configurable values. ~3–5 weeks of
  code, no legal/marketplace gate. **Fastest path to revenue.**
- **(b) Free public listing (the chosen model — no billing)** — anyone installs
  free across all 3 platforms. Everything in (a) plus OAuth install, admin/config
  UI, landing site, the net-new Teams adapter, **and** the owner-only gates
  (privacy policy/ToS, Slack App Directory, Google Workspace Marketplace +
  possible CASA security assessment, Microsoft Partner Center + Teams
  certification). A multi-month program dominated by marketplace/legal lead times.

**Cost-containment (it's free and you pay the bills):** push variable cost onto
customers and cap abuse — **per-tenant Giphy key is required** (don't share
yours), rate-limit per tenant, purge old kudos on a retention schedule, and
**minimize OAuth scopes** to dodge a paid Google CASA assessment. Flag every
marketplace step with a fee (Google CASA, Microsoft Partner Center enrollment).

The legal docs and the three marketplace submissions are **irreducibly yours**.
Everything else is code.

## 3. Phased plan

### Phase 0 — Launch-blockers & hardening (~1 week, mostly [CODE])
1. ✅ **DONE** [CODE] Fixed **silent kudos data-loss** — `recordKudos`/`recordKudosBatch`
   now propagate save failures (kudos.js); handlers no longer announce an unsaved kudos.
2. ✅ **DONE** [CODE] Fixed **Google Chat auth forgery** — `verify.js` now pins
   `payload.email === 'chat@system.gserviceaccount.com'` + `email_verified`; added
   `tests/google-chat/verify.test.js` (none existed).
3. ✅ **DONE** [CODE] **Fail-fast on DB init** — `src/index.js` now `process.exit(1)`
   on `initDb` failure instead of serving with a broken schema.
4. ✅ **DONE** [CODE] **Real health check** — `/health` now runs `SELECT 1` and returns
   503 on failure; covered by `tests/app.test.js` (first HTTP-level tests in the repo).
5. ✅ **DONE** [CODE] **Timeout the Giphy call** (~1.5s race) — protects the Slack 3s ack
   and caps dependency-hang cost.
6. [CODE] **Defer work off the ack path** — record kudos via the existing
   `setImmediate` pattern so a slow dependency can't blow the 3s deadline.
7. [CODE] **Idempotency** — dedupe on the platform event id (`ON CONFLICT DO NOTHING`)
   so timeout-retries don't double-insert and inflate leaderboards.
8. ✅ **DONE** [CODE] **Patch CVEs + add CI** — high-severity axios CVE patched via
   `npm audit fix` (2 moderate `@giphy`→`uuid` transitives remain, code path unused);
   `.github/workflows/ci.yml` runs the suite on every PR/push.
9. ✅ **DONE (helmet deferred)** [CODE] **DB TLS + pool limits + body-size limits** —
   env-driven `resolveSslConfig` (supports `DATABASE_SSL=verify`), pool
   max/idle/connect timeouts, explicit `express.json/urlencoded({ limit })`. Helmet
   deferred until there's a browser-facing surface (landing/admin page).

### Phase 1 — Multi-tenancy + Slack public distribution (~4–6 weeks)
1. [CODE] Adopt a **migration tool** (node-pg-migrate/Knex); stop replaying
   `schema.sql` on boot with swallowed errors.
2. [CODE] **tenants/installations table** + NOT NULL `tenant_id` on `kudos` &
   `user_identity`; composite uniqueness `(tenant_id, …)`; seed LOKAL as tenant 1.
3. [CODE] **Tenant-scope every query** (stats/leaderboards/identity merge) + a
   regression test proving two tenants never bleed.
4. [CODE] **Slack OAuth v2 install flow** — `/slack/install` + callback, persist
   per-workspace encrypted bot token, `getSlackClientForTeam(teamId)`, handle
   `app_uninstalled`/`tokens_revoked`.
5. [CODE] **Per-tenant config store** — back `resolveConfig()` with the DB
   (values + GIFs + branding); thread config through all UI builders. *(Engine
   already built — see customization-design.md.)*
6. [CODE] **Data deletion + export** (GDPR/CCPA) + retention purge; purge on uninstall.
7. [CODE] **HTTP/integration tests** via supertest against `buildApp()`.
8. [OWNER] Register a **public Slack app**, branding/listing assets, scope
   justifications, submit to **App Directory** (~2–6 wk review).
9. [OWNER] **Publish Privacy Policy, ToS, DPA, sub-processor list** (Railway,
   Giphy, QuickChart). Hard gate for every listing. (Claude drafts; you host/vet.)

### Phase 2 — Google Chat marketplace + Teams parity (~3–5 weeks code)
1. [CODE] **Generalize identity** — `external_identity(provider, external_id)` so
   new platforms add rows, not columns.
2. [CODE] **Build the Teams adapter** — `src/platforms/teams/{router,verify,handler,card}`:
   Bot Framework activities, JWKS JWT validation, Adaptive Cards, task module
   dialog, AAD/UPN identity, 3s ack. (XL, net-new.)
3. [CODE] Document/codify the **adapter contract**.
4. [OWNER] **Google Workspace Marketplace** — listing, OAuth verification,
   **CASA security assessment if sensitive scopes** (budget $ + weeks–months;
   biggest schedule unknown).
5. [OWNER] **Microsoft** — Azure Bot registration, Teams manifest, Partner Center
   enrollment + Publisher Verification + Teams Store certification.

### Phase 3 — Cost-containment + GTM polish (~1–2 weeks; FREE model, no billing)
1. [CODE] **Per-tenant Giphy key** enforcement + graceful no-GIF fallback so you
   never eat customers' Giphy quota.
2. [CODE] **Per-tenant rate limiting** + retention/purge job for old kudos (caps
   DB growth) — cost controls, not revenue.
3. [CODE] **Landing page** with install CTAs → OAuth flow + links to legal/support.
4. [CODE] **Structured logging (pino) + error tracking (Sentry) + light metrics**
   with tenant/request IDs (free tiers).
5. [OWNER] **Support email + status page** (required for listings; free tiers exist).
6. [CODE] Correctness polish: drop QuickChart `label` PII leak, self-kudos guard,
   deterministic leaderboard tie-break.

## 4. What Claude can start on now (no account/legal/marketplace needed)
1. Phase 0 bug fixes #1–7 (silent data-loss, Google Chat forgery, fail-fast,
   health check, Giphy timeout, ack deferral, idempotency).
2. CI + `npm audit fix`.
3. Migration tooling (must precede the tenant migration).
4. The `tenant_id` data-model migration + query scoping (the keystone).
5. Per-tenant values/branding config — **engine done**; next is the DB store +
   threading config through the UI builders.

## 5. Top risks
1. **Multi-tenancy is XL and touches everything** — underscope it and you ship a
   cross-tenant data leak to paying customers.
2. **Google CASA security assessment** — biggest cost/schedule unknown
   (weeks–months, possibly thousands). Start OAuth verification early; keep scopes minimal.
3. **Marketplace reviewers will flag current posture** — `rejectUnauthorized:false`,
   axios CVE, no rate limiting, no privacy policy. Cheap to fix; must precede submission.
4. **Silent data loss with a success confirmation** — worst failure shape for a
   paid product. Fix before any external customer.
5. **Teams is net-new (XL) + its own certification track** — treat as fast-follow,
   not same-day GA.
