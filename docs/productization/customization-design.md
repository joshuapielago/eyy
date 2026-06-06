# EYY Customization Design — "Define your own values + bring your own GIFs"

> **Status (self-host direction):** IMPLEMENTED. Customization now ships as a
> single operator config file (`eyy.config.json` via `EYY_CONFIG_PATH`), not a
> per-tenant DB. The value picker, posted cards, leaderboard chart, and stats all
> read it. See [SETUP.md](../../SETUP.md). The multi-tenant/DB sections below are
> retained as reference for the parked SaaS direction.

Owner priority #1 for productizing EYY: every customer must be able to
**define their own recognition values** and **supply their own GIFs**
(their own Giphy key, their own Giphy searches, or a specific link they paste).
Today both are hardcoded to LOKAL in `src/shared/values.js`.

These two features are the same underlying capability: **per-tenant configuration**.

## The config model (built — `src/shared/config.js`)

A single seam, `resolveConfig(tenantId)`, returns the customer's config object.
Every consumer reads from it instead of importing hardcoded `VALUES`.

```js
{
  tenantId: 'T-acme',
  brandName: 'EYYY',                 // customizable product/brand label
  values: [
    {
      key: 'speed',                  // stable id (used in DB rows + charts)
      name: 'Speed Is Our Advantage',
      emoji: '⚡',
      tagline: 'Move fast, win first',
      gif: { mode: 'search', terms: ['fast and furious', 'speed run'] }
      //  OR { mode: 'url', url: 'https://cdn.acme.com/our-party.gif' }
    },
    // ...as many values as the customer defines
  ],
  giphy: { apiKey: '<tenant key or platform default>', rating: 'pg' }
}
```

### "Bring your own GIF" — three levels, all covered by `gif` + `giphy`
1. **Their own Giphy account** — per-tenant `giphy.apiKey` (rate limits, content
   rating, and analytics belong to the customer).
2. **Their own Giphy searches** — `gif.mode:'search'` with custom `terms` per value.
3. **Their own exact link** — `gif.mode:'url'` sends a fixed URL the customer
   pastes (a branded GIF, an internal meme, any image/GIF link). This is the
   literal "add their own Giphy link or whatever link they have."

`resolveGifUrl(config, valueKey)` implements all three and short-circuits the
Giphy call entirely for `url` mode.

### Status (TDD, all tests green)
- ✅ `src/shared/config.js` — config model + `resolveConfig`/`getValue`/`listValues`/`resolveGifUrl`.
- ✅ GIF resolution in `src/shared/kudos.js` now flows through the config engine;
  `recordKudos`/`recordKudosBatch` accept `{ tenantId, config }`. Defaults to
  LOKAL's built-in set, so current Slack behavior is unchanged.
- ✅ Tests: `tests/shared/config.test.js` (7) + new kudos url-mode test.

## What's next to make it real per-customer (rides on multi-tenancy)

Customization is inseparable from **multi-tenancy** — "each customer's own
values" presupposes "each customer is a tenant." Remaining work, in order:

1. **Tenant resolution per platform** — derive `tenantId` from each request:
   Slack `team_id` (in every command/interaction payload), Google Chat space's
   customer/host, Teams `tenant.id`. Thread it into `resolveConfig`.
2. **Config storage** — `tenant_config` table (tenantId, brandName, values JSONB,
   giphy JSONB, updated_at). `resolveConfig` reads it (with a short cache),
   falling back to the built-in default for unconfigured tenants.
3. **Thread config through the UI builders** — `modal.js`, `dialog.js`, `card.js`,
   `message.js`, `quickchart.js`, `stats.js`, leaderboards currently import the
   static `VALUES`/`VALUE_KEYS_IN_ORDER`. Switch them to take the tenant's value
   list (radar-chart axes, modal value picker, card taglines all become dynamic).
4. **Admin surface to edit config** (the one product decision — see below).
5. **Validation & safety for customer-provided content**:
   - value count bounds (e.g. 3–12), unique keys, length limits, emoji optional;
   - GIF URL allowlist/scheme check (`https:` only, image/gif content-type probe,
     block SSRF/`localhost`/private IPs), reuse the existing QuickChart-style HEAD probe;
   - sanitize all custom strings through the existing `escapeHtml`/`escapeSlackMrkdwn`.

## The one decision needed: how customers edit their config

| Option | Effort | Pros | Cons |
|---|---|---|---|
| **A. Web admin page** (per-workspace, linked from the app/post-install) | M–L | Familiar, room for GIF preview + value editor, needed anyway for billing | Needs auth + hosting |
| B. In-chat `/eyy config` wizard (modal) | M | No web app; native to each platform | Cramped UX for editing 7+ values × GIFs; 3× the work (Slack/GChat/Teams) |
| C. Import (JSON/CSV/Google Sheet template) | S | Fastest to ship; good for white-glove onboarding | Not self-serve; clunky for non-technical admins |

**Recommendation: A (web admin), with C as the day-1 stopgap.** A web config
page doubles as the billing/admin home you'll need for self-serve anyway, and a
JSON/Sheet import lets us onboard the first pilot customers immediately while the
UI is built. Default every new install to LOKAL's set so the app works before
any configuration.
