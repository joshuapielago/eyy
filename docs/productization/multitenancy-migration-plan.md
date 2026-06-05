# Multi-Tenancy Migration Plan (the keystone)

Goal: turn EYY from one hardcoded LOKAL workspace into a multi-tenant app where
each installing workspace is an isolated tenant with **its own values + GIFs**
(the two must-have features). Free model — no billing tables.

**Safety note:** all of this is code on the `review-chatbot-multiplatform-launch`
branch. Nothing touches the live LOKAL database until *deployed*. The actual
one-way door is the deploy/backfill step, which we run deliberately with a backup.

## 1. Migration tooling
Adopt **node-pg-migrate** (dev dep, free): versioned, forward-only migrations in
`migrations/`, tracked in a `pgmigrations` table. Replace the current
boot-time `schema.sql` replay (which swallows errors via `DO $$ … WHEN OTHERS
THEN NULL`). Migrations run as an explicit deploy step (`npm run migrate`), not on
every web boot. CI applies them against an ephemeral Postgres.

## 2. Schema changes (additive first, then backfill, then constrain)
- **`tenants`** — `id` (uuid PK), `platform` ('slack'|'google-chat'|'teams'),
  `external_id` (Slack `team_id` / Google customer or domain / Teams tenant id),
  `name`, `created_at`. UNIQUE `(platform, external_id)`.
- **`installations`** — per-install secrets for OAuth (mainly Slack): `tenant_id`
  FK, `bot_token` (encrypted at rest), `bot_user_id`, `scopes`, `installed_by`,
  `installed_at`, `revoked_at`. (Google Chat / Teams use different auth; column
  set kept nullable/flexible.)
- **`tenant_config`** — `tenant_id` PK/FK, `brand_name`, `values` JSONB,
  `giphy` JSONB, `updated_at`. Backs `resolveConfig(tenantId)` (seam already built).
- **`kudos`** / **`user_identity`** — add `tenant_id` FK. Recreate the uniqueness
  rules as composite: `user_identity` uniques become `(tenant_id, email)`,
  `(tenant_id, slack_user_id)`, `(tenant_id, google_user_id)`; hot indexes gain a
  leading `tenant_id`.

## 3. Tenant resolution (per platform, at request time)
- **Slack** — `team_id` (slash-command body) / `team.id` (interactivity payload). Clean.
- **Google Chat** — derive from the verified request: the Workspace customer /
  hosted-domain (`hd`) or the space's host. ⚠️ Less direct than Slack; needs
  validation against a real Chat event. Flagged as the one genuine unknown.
- **Teams** — `activity.conversation.tenantId` / `channelData.tenant.id`. Clean.

`resolveConfig(tenantId)` reads `tenant_config` (with a small in-memory cache),
falling back to the built-in LOKAL default for any unconfigured tenant.

## 4. Thread `tenant_id` through the code
Handlers resolve `tenantId` → pass to: `recordKudos`/`recordKudosBatch` (already
accept it), `resolveConfig`, every read in `src/shared/stats.js`
(`getReceivedStats`/`getRecentVerbatims`/`getTeamLeaderboard` get a tenant filter),
and `learnFromParticipant`/`learnIdentity` (scope merges within a tenant). UI
builders (`modal`, `dialog`, `card`, `message`, `quickchart`, leaderboards) read
the tenant's value list instead of importing static `VALUES`.

## 5. Backfill (the deploy-time step)
1. Back up the DB.
2. Create the LOKAL tenant (platform 'slack', their `team_id`).
3. Seed `tenant_config` with the current LOKAL values (the built-in default).
4. `UPDATE kudos SET tenant_id = <lokal>` and same for `user_identity`.
5. Apply the NOT NULL + composite-unique constraints after backfill.

## 6. Isolation guarantee
A regression test proving tenant A's leaderboard/stats never include tenant B's
kudos, and that identity merges never cross tenants. This is the test that keeps a
cross-tenant data leak from ever shipping to a customer.

## 7. Sequencing
1. node-pg-migrate + port existing schema into the first migration (reversible code).
2. Additive tables (`tenants`, `installations`, `tenant_config`) + `tenant_id`
   columns nullable (reversible code).
3. Thread `tenant_id` through code + tenant resolution + isolation tests (TDD).
4. Deploy + backfill LOKAL + add constraints (the deliberate one-way step).
5. Slack OAuth install flow (Phase 1) then per-tenant config admin (web + import).

## 8. Top risks
- **Google Chat tenant resolution** (§3) — the one design unknown; validate early.
- **Backfill correctness** — must run with a backup; constraints added only after.
- **Identity uniqueness** — Slack user ids aren't globally unique across
  workspaces, so the composite `(tenant_id, …)` uniques are essential.
