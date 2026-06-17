# Material Depot — Visit Schedule Site

## Project Overview
Store visit scheduling and management system for Material Depot. Separate repo/app from the existing audit+install dashboard. Plain HTML/CSS/JS, no framework, no build step.

- **Local path**: `/Users/dhruv/Projects/visit-schedule-site/`
- **GitHub**: https://github.com/daaku-daddy/visit-schedule-site (branch: `master`)
- **Live URL**: https://visit-schedule-site.vercel.app
- **Vercel project**: `material-depot1/visit-schedule-site`
- **Supabase URL**: `https://dzilftvisjgckmefpzxk.supabase.co`
- **Stack**: Plain HTML/CSS/JS · Supabase REST API (raw fetch) · Vercel static hosting
- **Session key**: `vs_user` in localStorage (not `md_user` — separate from audit/install app)

## Files
| File | Role |
|---|---|
| `index.html` | Redirect to Login.html |
| `Login.html` | Passcode login → routes by role |
| `PreSales_Dashboard.html` | Desktop · slot capacity view per store |
| `StoreManager_Dashboard.html` | Mobile · upcoming visits + My Team tab |
| `Receptionist_Dashboard.html` | Desktop/Tablet · today's visits + BM panel |
| `BM_Dashboard.html` | Mobile · assigned clients + fill comments |

## Roles
| Role key | Device | Scope |
|---|---|---|
| `pre_sales` | Desktop | Cross-store — sees all stores' slot capacity |
| `store_manager` | Mobile | One store — manages visits + BM roster for their store |
| `receptionist` | Desktop/Tablet | One store — check-in + BM assignment |
| `store_bm` | Mobile | One store — assigned client list + comments |

## Auth / Session
- `localStorage` key: `md_user` → `{name, email, role, store_id}`
- `store_id` is null for `pre_sales` (cross-store role)
- Role routing on login: `pre_sales→PreSales_Dashboard.html`, `store_manager→StoreManager_Dashboard.html`, `receptionist→Receptionist_Dashboard.html`, `store_bm→BM_Dashboard.html`
- Same passcode pattern as existing app (null on creation, user sets on first login)

## Supabase Tables

### `stores`
`id, name, location, bm_count, footfall_data (jsonb), created_at`
- `footfall_data`: historical footfall estimates per hour slot (provided by user, used for slot capacity calculation)

### `profiles`
`id, name, email, role, passcode, store_id, created_at`
- `store_id` is null for `pre_sales`
- BMs added by SM get `role = store_bm` and `store_id = SM's store`

### `store_visits`
`id, kylas_id, store_id, customer_name, phone, visit_date, visit_time, categories (jsonb), sku_links (jsonb), presales_notes, availability_status, availability_notes, arrival_time, assigned_bm_id, bm_comments, house_stage, follow_up, visit_status, created_at, updated_at`

- `availability_status`: `null | 'available' | 'partial' | 'unavailable'` — set by Store Manager
- `visit_status`: `scheduled | arrived | bm_assigned | completed`
- `house_stage`: set by BM during/after visit (NOT captured at scheduling time)
- `kylas_id`: foreign reference to Kylas lead/activity (for deduplication during sync)

### `bm_status`
`id, bm_id (fk profiles), store_id, status, last_allocated_at, active_client_count, updated_at`
- `status`: `free | engaged | potentially_available`
- `potentially_available` auto-assigned 2h after `last_allocated_at` if BM hasn't manually marked free
- BM manually marks `free` from their dashboard

### `visit_assignments`
`id, visit_id (fk store_visits), bm_id (fk profiles), assigned_at, store_id`
- One visit can be assigned to one BM at a time (receptionist picks)
- Multiple visits can be assigned to the same BM simultaneously

## Kylas Sync
- Kylas has a REST API (open API, accessible via API key)
- Vercel cron job polls Kylas API every ~2 minutes
- Upserts new/updated activities into `store_visits` (matched on `kylas_id`)
- Visit `store_id` is set in Kylas at scheduling time by Pre Sales (who tags each visit to a store)
- Pre Sales continues to schedule visits in Kylas as their primary workflow

## Slot Capacity System (Pre Sales view)
- Each hourly slot is coloured based on: `(scheduled_visits_for_slot + estimated_footfall_for_slot) / bm_count`
- **Green**: < 50% capacity
- **Orange**: 50–80% capacity
- **Red**: ≥ 80% capacity
- Footfall data per store per hour to be provided by user (stored in `stores.footfall_data`)
- Pre Sales picks store from dropdown first, then sees the slot grid for that store

## BM Availability System
- Day start: all BMs default to `free`
- Receptionist assigns client → BM status → `engaged`, `active_client_count` increments
- BM manually taps "Mark Free" → status → `free`
- If BM does NOT mark free: system auto-sets `potentially_available` 2h after `last_allocated_at`
- Multiple clients can be assigned to the same BM simultaneously
- Receptionist sees: BM name + status chip + active client count

## SM BM Management
- SM goes to "My Team" tab on their dashboard
- Enters `@materialdepot.com` email of a BM → creates profile with `role=store_bm, store_id=SM's store, passcode=null`
- BM logs in and sets their own passcode (first-login flow)
- BM immediately appears in Receptionist's BM panel for that store
- SM can also remove a BM from their store roster

## BM Comment Form (after/during visit)
Fields BM fills in per client:
- **House Stage**: dropdown (Under Construction / Ready to Move / Renovation / New Build — Bare Shell)
- **Visit Notes**: free text (requirements, preferences, budget discussed)
- **Follow-up**: No follow-up / Call in 2 days / Send quotation

## Store Isolation
- All SM / Receptionist / BM queries are filtered by `store_id = current user's store_id`
- Pre Sales is the only cross-store role (no store_id filter)
- Visit `store_id` is assigned at Kylas scheduling time (Kylas activity has store field)

## Multi-Store (Pre Sales)
- Store dropdown shows all stores with today's slot summary (green/orange/red counts)
- Selecting a store loads the hourly slot grid for that store
- Slot grid is navigable by day (today + 6 days forward)

## CSS Design System
Same variables as existing material-depot-site:
```css
--navy:#1F3A5F   --navy2:#16294a  --blue:#2E6CA8   --yellow:#F4C20D
--ink:#1b2230    --muted:#67748a  --line:#dde3ec   --bg:#eef1f6   --card:#fff
--green:#1f7a3f  --red:#b3261e    --amber:#9a6200  --purple:#5b3aa6
--orange:#c45e00
```

## Architecture Patterns
- Same Supabase REST helpers: `sbGet`, `sbPost`, `sbPatch`, `sbDel`
- 10s polling on Receptionist (BM status changes need to be near-live)
- 30s polling on SM and BM dashboards
- `localStorage` for session (persistent across browser sessions)
- Role guard on every page load → redirect to Login.html on failure

## Deployment Workflow
```bash
git add <specific files>
git commit -m "description"
git push origin master
vercel --prod
```

## Design Decisions & Context
- **House stage NOT captured at scheduling** — BM captures it in conversation during the visit and fills it on their dashboard
- **Pre Sales is read-only in this app** — they schedule in Kylas, this app is a capacity reference tool
- **SM availability check is NOT shown to Pre Sales** — removed as not useful for their workflow
- **Receptionist BM panel is always visible** — split layout (visits left, BM panel right) because both are needed simultaneously
- **BM "Potentially Available"** — system auto-flag, not set by BM. Appears 2h after last allocation if no manual check-in
- **All BMs for a store are "Free" at day start** — status resets daily
- **Footfall data** — historical per-store per-hour estimates, provided by user (pending as of 2026-06-17), to be stored in `stores.footfall_data`

## Pending / To Confirm
- Footfall data per store per hour (user to provide — stored in `stores.footfall_data` jsonb)
- Kylas API key and field mapping for visit/activity sync (Vercel cron job to be built)
- Store list + BM counts (can be added via Admin → Stores once deployed)
- First admin user must be seeded manually in Supabase SQL editor (see schema.sql comment)
