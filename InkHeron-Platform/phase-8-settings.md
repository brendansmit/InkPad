# Phase 8 — Teacher settings & admin

Where secrets and management live. Secrets are server-side only, masked, never reachable by a
student. See CLAUDE.md §3 rule 7 and §8.

---

## Step 8.1 — Settings storage (server-side)
- **Goal:** a safe place for secrets and config.
- **Depends on:** Phase 1.7 settings table.
- **Build:** A server-side settings store (env file or the DB settings table). Keys held:
  OpenRouter API key, Server酱 key, and any platform config. Never expose these to client code.
  When reading for display, return a MASKED form only (e.g. `sk-or-...4f2a`) and a boolean
  "is set".
- **Done when:** a key can be stored and read back masked; the raw key is never sent to the
  browser.

## Step 8.2 — Teacher settings screen
- **Goal:** the teacher enters/updates keys.
- **Depends on:** 8.1, Phase 2.4 (teacher auth).
- **Build:** A teacher-only settings page with fields for the OpenRouter key and Server酱 key.
  Show current state masked. Saving updates the server-side store. Guard the route to teacher
  sessions only.
- **Done when:** the teacher pastes a key, saves, sees it masked; no student route can read or
  reach it.

## Step 8.3 — Test-key buttons
- **Goal:** confirm a key works before relying on it.
- **Depends on:** 8.2.
- **Build:** A "Test" button beside each key. For OpenRouter: a cheap minimal call that confirms
  auth (and that fuzzy model resolution finds a model — see CLAUDE.md §8). For Server酱: send a
  test push. Report success/failure inline.
- **Done when:** testing a valid key reports success; an invalid one reports a clear failure.

## Step 8.4 — Class & student management
- **Goal:** rosters in one place.
- **Depends on:** Phase 2.1.
- **Build:** Teacher UI to create/edit classes, add/edit students, and the reset-password action
  (Phase 2.5). Optionally a simple roster import (CSV of students) to speed setup.
- **Done when:** the teacher can manage classes and students and reset passwords from one admin
  area.

## Step 8.5 — OpenRouter call module (shared)
- **Goal:** one place all AI calls go through.
- **Depends on:** 8.1, 8.3.
- **Build:** A server-side module that reads the OpenRouter key, applies fuzzy model resolution
  (store intent family+tier, resolve against the live model list, confident match auto-resolves,
  weak match surfaces, cache resolved id, re-resolve on unknown-model error, log the resolved id).
  Used by any AI feature (Tests portal extraction, future Analyzer touchpoints).
- **Done when:** an AI call succeeds via the stored key with a resolved model, and survives a
  model rename by re-resolving.

---

**Exit check for Phase 8:** the teacher can set and test the OpenRouter and Server酱 keys (stored
server-side, masked), manage rosters, and all AI calls route through one fuzzy-resolving module.
Log in SESSION_NOTES.md.
