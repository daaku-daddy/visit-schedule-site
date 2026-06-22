# Material Depot — Visit Schedule Site

## Project Overview
Store visit scheduling and management system for Material Depot. Separate repo, Supabase project, and Vercel deployment from the audit+install app. Plain HTML/CSS/JS, no framework, no build step.

- **Local path**: `/Users/dhruv/Projects/visit-schedule-site/`
- **GitHub**: https://github.com/daaku-daddy/visit-schedule-site (branch: `master`)
- **Live URL**: https://visit-schedule-site.vercel.app
- **Vercel project**: `material-depot1/visit-schedule-site`
- **Supabase URL**: `https://dzilftvisjgckmefpzxk.supabase.co`
- **Supabase anon key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aWxmdHZpc2pnY2ttZWZwenhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2Njg0MTksImV4cCI6MjA5NzI0NDQxOX0.O-ZzJBs7TYEmXvVDf_7y70-skwSh7Ve4DuM-kBfXjP0`
- **Session key**: `vs_user` in localStorage (distinct from `md_user` used by the audit/install app)
- **Stack**: Plain HTML/CSS/JS · Supabase REST API (raw fetch, no client lib) · Vercel static hosting + one serverless function

## Files
| File | Role | Device |
|---|---|---|
| `index.html` | Meta-refresh redirect to Login.html | — |
| `Login.html` | Email + 4-digit passcode flow, routes by role | Any |
| `Admin.html` | Admin console — Users, Stores, Footfall, Public Holidays, Role Viewer | Desktop |
| `PreSales_Dashboard.html` | Slot capacity grid + visits list per store; Kylas sync trigger | Desktop |
| `StoreManager_Dashboard.html` | Upcoming visits + BM team management | Mobile |
| `Receptionist_Dashboard.html` | Today's check-ins + live BM panel | Desktop/Tablet |
| `api/kylas-sync.js` | Vercel serverless function — fetches Kylas leads, upserts to Supabase | Server |
| `schema.sql` | Full Supabase schema (run once in SQL editor) | — |
| `footfall_migration.sql` | Seeds weekday/weekend footfall for JP Nagar, Whitefield, Yelahanka (hours 10–20) | — |
| `vercel.json` | no-cache headers on HTML; CORS header on `/api/*` | — |

## Roles
| Role key | Label | Device | Scope |
|---|---|---|---|
| `admin` | Admin | Desktop | Full admin console |
| `pre_sales` | Pre Sales | Desktop | All stores — slot capacity view + fallback visit scheduling |
| `store_manager` | Store Manager | Mobile | One store — visits + BM team |
| `receptionist` | Receptionist | Desktop/Tablet | One store — check-in + BM assignment |
| `store_bm` | Business Manager | — | **Removed from this portal** — role exists in DB, login shows "Access not available" |

## Auth / Session
- `localStorage` key: `vs_user` → `{name, email, role, store_id}`
- `store_id` is `null` for `admin` and `pre_sales` (cross-store roles)
- Login flow: email → if `passcode=null`: create passcode screen; else: enter passcode screen
- Change passcode flow available from the enter-passcode screen
- Role routing on login:
  - `admin → Admin.html`
  - `pre_sales → PreSales_Dashboard.html`
  - `store_manager → StoreManager_Dashboard.html`
  - `receptionist → Receptionist_Dashboard.html`
  - `store_bm` → "Access not available" message (BM dashboard removed; role reserved for future Metabase CRM portal)
- Every dashboard reads session on load, redirects to Login.html if missing/wrong role
- First admin must be seeded manually via Supabase SQL editor (see schema.sql comment)

## Supabase Tables

### `stores`
`id, name, location, bm_count, footfall_data (jsonb), created_at`
- `bm_count`: number of BMs — denominator in slot capacity formula
- `footfall_data`: `{weekday: {10:1,11:4,...,20:3}, weekend: {10:1,11:6,...,20:4}}` — median walk-in footfall per hour, hours 10–20, split by weekday/weekend
- Seeded for JP Nagar, Whitefield, Yelahanka via `footfall_migration.sql` (median values from `Hourly_Footfall_Corrected_Analysis.xlsx`)
- Managed via Admin → Stores → "Set Footfall" modal (Weekday / Weekend tabs, hours 10 AM–8 PM)
- Backward-compatible: if old flat `{9:2,...}` or old 9–19 range format exists, code falls back gracefully

### `profiles`
`id, name, email, role, passcode, store_id, created_at`
- `store_id` is null for `admin` and `pre_sales`
- `passcode` is null on creation — user sets it on first login
- BMs added by SM via "My Team" tab get `role=store_bm`, `store_id=SM's store`, `passcode=null`
- Admin manages all users via Admin → Users (CRUD: add, edit role/store, reset passcode, delete)
- Role dropdown in Admin shows 4 roles: admin, pre_sales, store_manager, receptionist (store_bm removed)

### `store_visits`
`id, kylas_id, store_id, customer_name, phone, visit_date, visit_time (text "HH:MM"), categories (jsonb array), sku_links (jsonb), presales_notes, availability_status, availability_notes, arrival_time, assigned_bm_id, bm_comments, house_stage, follow_up, visit_status, created_at, updated_at`

- `visit_time` stored as `"10:00"`, `"11:00"`, etc. (24h text, not timestamptz). Valid range is now 10:00–20:00.
- `availability_status`: `null | 'available' | 'partial' | 'unavailable'` — set by Store Manager
- `visit_status`: `scheduled → arrived → bm_assigned → completed`
- `house_stage`: set by BM during visit — NOT captured at scheduling time
- `kylas_id`: text, UNIQUE — foreign reference to Kylas lead ID. Null for manually-entered visits.
- `categories`: jsonb array e.g. `["Tiles","Wallpapers"]`
- All PATCH calls include `updated_at: new Date().toISOString()`
- **Kylas sync fields**: only `kylas_id`, `customer_name`, `phone`, `visit_date`, `visit_time`, `store_id`, `updated_at` are overwritten on sync. `visit_status`, `arrival_time`, `assigned_bm_id`, `bm_comments`, `availability_status` are NEVER overwritten by the sync.

### `bm_status`
`id, bm_id (fk profiles), store_id, status, last_allocated_at, active_client_count, updated_at`
- `status`: `free | engaged | potentially_available`
- Created by Receptionist on first BM assignment if row doesn't exist yet
- `potentially_available`: auto-flag set 2h after `last_allocated_at` if BM hasn't manually marked free (server job not yet built — currently manual only)
- BM taps "Mark Free" → status → `free`, `active_client_count` → 0

### `visit_assignments`
`id, visit_id (fk store_visits), bm_id (fk profiles), assigned_at, store_id`
- One active assignment per visit (receptionist picks one BM)
- Multiple visits can be assigned to same BM simultaneously

### `public_holidays`
`id, uuid, date (text 'YYYY-MM-DD', UNIQUE), name (text), created_at`
- Global (no store_id) — applies to all stores
- Managed via Admin → Holidays nav view (add date + name, delete)
- On a public holiday weekday, PreSales uses weekend footfall for the slot capacity formula
- **Run SQL in Supabase**: `CREATE TABLE IF NOT EXISTS public_holidays (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, date text NOT NULL UNIQUE, name text NOT NULL, created_at timestamptz DEFAULT now());`

## Supabase Helpers (in every HTML file)
```javascript
const SB_H = {'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','Prefer':'return=representation'};
async function sbGet(q){const r=await fetch(SB_URL+'/rest/v1/'+q,{headers:SB_H});return r.json();}
async function sbPost(t,b){const r=await fetch(SB_URL+'/rest/v1/'+t,{method:'POST',headers:SB_H,body:JSON.stringify(b)});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||'Save failed ('+r.status+')');}return r.json();}
async function sbPatch(t,id,b){const r=await fetch(SB_URL+'/rest/v1/'+t+'?id=eq.'+id,{method:'PATCH',headers:SB_H,body:JSON.stringify(b)});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||'Save failed ('+r.status+')');}return r.json();}
async function sbDel(t,id){const r=await fetch(SB_URL+'/rest/v1/'+t+'?id=eq.'+id,{method:'DELETE',headers:SB_H});if(!r.ok)throw new Error('Delete failed ('+r.status+')');return true;}
```
- `sbPost` and `sbPatch` throw on non-2xx — all callers must use try/catch
- `sbGet` returns raw JSON (including Supabase error objects) — always check `Array.isArray(result)` before use

## Dashboard Details

### Admin.html (Desktop)
Rail nav views (Management section): Overview · Users · Stores · Holidays
Tools section: Role Viewer

- **Overview**: stat cards (total users, stores, visits today, arrived today) + role breakdown
- **Users**: table with search, Add/Edit/Reset PIN/Delete. Role dropdown: admin, pre_sales, store_manager, receptionist. Store picker shown only for `store_manager`, `receptionist`.
- **Stores**: card grid. Add/Edit store (name, location, bm_count). "Set Footfall" → 11-input modal with Weekday + Weekend tabs, hours 10 AM–8 PM (`FF_SLOTS` hours 10–20). Input IDs: `ff_wd_10…ff_wd_20` (weekday), `ff_we_10…ff_we_20` (weekend).
- **Holidays**: Add/delete public holidays (date picker + name). Holidays stored in `public_holidays` table. Add button has `id="hlAddBtn"` for double-submit guard.
- **Role Viewer**: Admin selects a role → picks store (if store-specific) → injects fake session into localStorage → loads dashboard in iframe → restores real admin session in `iframe.onload`

### PreSales_Dashboard.html (Desktop)
- Store dropdown + day nav (today + 6 days forward) + "+ Schedule Visit" button
- On load: fetches stores AND `public_holidays?select=date` in parallel; populates `holidaySet` (Set of 'YYYY-MM-DD' strings)
- Fires `fetch('/api/kylas-sync').catch(e=>console.warn(...))` fire-and-forget on every `loadData()` call (every 60s poll) to sync Kylas leads into Supabase
- **Left panel** — Slot Capacity Grid (10 AM–9 PM, 11 slots):
  - Load formula: `(scheduled_visits_for_slot + footfall[hour]) / bm_count`
  - Footfall set chosen by `isWeekendOrHoliday(selectedDay)` — uses weekend footfall on Sat/Sun AND public holidays
  - Display: `(scheduled+footfall) / bmCount` shown as right-side count (e.g. "3 / 5")
  - Green < 50%, Orange 50–80%, Red ≥ 80%
  - Each row clickable → opens scheduling form pre-filled with that time
- **Right panel** — Visits for selected store + day:
  - Lists all visits with time, name, phone, category tags, pre-sales notes, status chip
  - "Cancel visit" button shown only for `scheduled` visits WHERE `kylas_id IS NULL` (manually entered). Kylas-synced visits cannot be cancelled here.
- **Schedule Visit modal** (fallback for walk-ins / phone bookings):
  - Time options: 10:00 AM–8:00 PM (11 slots)
  - Standard category chips: Tiles, Laminates, Plywood, Panels, Wooden Flooring, Wallpapers, Quartz, HDHMR, Blockboard, Adhesives, Wall Cladding
  - Other Categories: free-text input + Add button; removable chips; saved as flat array in `categories` jsonb
  - Saves with `visit_status='scheduled'`, `kylas_id=null`
- Polls every 60s after store selected

### StoreManager_Dashboard.html (Mobile)
Two tabs:
- **Visits tab**: today + tomorrow's visits for `store_id = SESSION.store_id`. "Set Availability" opens bottom sheet: Available / Partially Available / Unavailable + optional notes. Saves `availability_status` and `availability_notes`.
- **My Team tab**: lists BMs for this store (`role=store_bm, store_id=SESSION.store_id`). Add BM by name + @materialdepot.com email. Remove BM deletes their profile.
- Polls every 30s on Visits tab

### Receptionist_Dashboard.html (Desktop/Tablet)
Split layout (always visible side by side):
- **Left — Today's Visits**: `scheduled` → "Mark Arrived"; `arrived` → "Assign BM"
- **Right — BM Panel**: lists all `store_bm` profiles for this store with live `bm_status`. Status chip (Free/Engaged/P.Available) + active client count.
- **Assign BM modal**: on assign → patches visit to `bm_assigned`, posts to `visit_assignments`, patches/posts `bm_status` (increments `active_client_count`, sets `engaged`)
- Polls every 10s (BM status needs to be near-live)

## Kylas Sync — `api/kylas-sync.js`

Vercel serverless function (Node 20, ESM → auto-compiled to CJS by Vercel).

**Flow:** PreSales dashboard → `GET /api/kylas-sync` (fire-and-forget, every 60s) → function fetches Kylas Leads API → maps leads → upserts to `store_visits` on `kylas_id` conflict.

**Env vars** (set in Vercel dashboard → Settings → Environment Variables):
| Var | Value |
|---|---|
| `KYLAS_API_KEY` | `f3586066-8c20-4763-80c9-0622eff59917:20007` |
| `SUPABASE_KEY` | Supabase anon key (same as above) |
| `KYLAS_STORE_MAP` | JSON string mapping Kylas store labels → Supabase store UUIDs e.g. `{"JP Nagar":"uuid","Whitefield":"uuid"}` |

**Upsert:** `POST /rest/v1/store_visits?on_conflict=kylas_id` with `Prefer: resolution=merge-duplicates,return=minimal`

**Fields written on conflict:** `customer_name`, `phone`, `visit_date`, `visit_time`, `store_id`, `updated_at` only.
**Never overwritten:** `visit_status`, `arrival_time`, `assigned_bm_id`, `bm_comments`, `availability_status`.

**Field mapping** (⚠️ PENDING CONFIRMATION — Kylas "Lead Read" API permission not yet enabled):
| Kylas field | → `store_visits` column |
|---|---|
| `id` | `kylas_id` |
| `firstName` + `lastName` (or `name`) | `customer_name` |
| `phoneNumber` or `mobile` | `phone` (cleaned, last 10 digits) |
| custom `'Visit Date'` / `'visit_date'` | `visit_date` |
| custom `'Time Slot'` / `'visit_time'` | `visit_time` |
| custom `'Store'` / `'store'` → STORE_MAP lookup | `store_id` |

**To complete Kylas integration:**
1. Kylas admin enables "Lead Read" permission on API key `f3586066-...`
2. Fetch a sample lead: `curl -s "https://api.kylas.io/v1/leads?page-size=1" -H "api-key: f3586066-8c20-4763-80c9-0622eff59917:20007"`
3. Confirm exact field names in the response, update `mapLead()` in `api/kylas-sync.js`
4. Set `KYLAS_STORE_MAP` env var with confirmed store UUID mapping
5. Set `KYLAS_API_KEY` and `SUPABASE_KEY` env vars in Vercel

## Slot Capacity Formula
```
load = (scheduled_visits_for_slot + footfall[hour]) / stores.bm_count
Display: "(scheduled+footfall) / bm_count"  e.g. "3 / 5"
Green:  load < 0.50
Orange: load 0.50–0.79
Red:    load >= 0.80
```
- `scheduled_visits_for_slot`: count of `store_visits` where `visit_date=selectedDay`, `visit_time` starts with that hour, `visit_status != completed`
- `footfall` set chosen by `isWeekendOrHoliday(selectedDay)`:
  - Returns true if `getDay()==0||6` (Sat/Sun) OR `holidaySet.has(selectedDay)`
  - Uses `footfall_data.weekend` if true, else `footfall_data.weekday`
- Footfall keys are hours 10–20 as integers or strings — both checked
- `bm_count` fallback: `store.bm_count||1`

## Footfall Data (from Hourly_Footfall_Corrected_Analysis.xlsx, median values)

| Hour | JP Nagar WD | JP Nagar WE | Whitefield WD | Whitefield WE | Yelahanka WD | Yelahanka WE |
|---|---|---|---|---|---|---|
| 10 | 1 | 1 | 1 | 1 | 0 | 1 |
| 11 | 4 | 6 | 2 | 5 | 2 | 3 |
| 12 | 5 | 11 | 3 | 6 | 2 | 4 |
| 13 | 5 | 10 | 3 | 7 | 2 | 4 |
| 14 | 5 | 9 | 2 | 7 | 2 | 4 |
| 15 | 5 | 9 | 3 | 9 | 2 | 5 |
| 16 | 5 | 9 | 3 | 8 | 2 | 4 |
| 17 | 4 | 10 | 3 | 7 | 2 | 5 |
| 18 | 4 | 10 | 3 | 8 | 2 | 4 |
| 19 | 4 | 7 | 3 | 6 | 2 | 3 |
| 20 | 3 | 4 | 2 | 3 | 2 | 2 |

WD = Weekday (Mon–Fri), WE = Weekend (Sat–Sun)

## Polling Intervals
| Dashboard | Interval | Reason |
|---|---|---|
| Receptionist | 10s | BM status must update near-live |
| StoreManager | 30s | Visit list less time-critical |
| PreSales | 60s | Slot capacity + Kylas sync trigger |
| Admin | None | Manual refresh |

## CSS Design System
```css
--navy:#1F3A5F;  --navy2:#16294a; --blue:#2E6CA8;  --yellow:#F4C20D;
--ink:#1b2230;   --muted:#67748a; --line:#dde3ec;  --bg:#eef1f6;   --card:#fff;
--green:#1f7a3f; --greenbg:#e6f3ea;
--red:#b3261e;   --redbg:#fbeae8;
--amber:#9a6200; --amberbg:#fdf2da;
--purple:#5b3aa6;--purplebg:#efeaf8;
```
Role badge CSS classes: `rb-admin` (purple), `rb-pre_sales` (navy), `rb-store_manager` (blue), `rb-receptionist` (green)

## Architecture Patterns
- Role guard on every page: reads `vs_user` from localStorage, checks `role`, redirects to Login.html on failure
- All write operations (sbPost, sbPatch, sbDel) throw on non-2xx and are wrapped in try/catch with error toasts
- Save buttons disabled during in-flight requests to prevent double-submits
- `updated_at: new Date().toISOString()` added to every PATCH on `store_visits` and `bm_status`
- `Array.isArray(result)` guard on every `sbGet` result before use
- `esc(s)` helper used everywhere user-supplied strings go into innerHTML
- Never use smart/curly quotes in JS strings — always ASCII `'` and `"`
- Role Viewer iframe trick: save adminSession → write fake session → set iframe.src → restore adminSession in `iframe.onload`
- Fire-and-forget fetch: `fetch(url).catch(e=>console.warn(...))` — used for Kylas sync in PreSales

## Deployment Workflow
```bash
git add <specific files>          # never git add -A
git commit -m "description"
git push origin master
vercel --prod --yes               # from /Users/dhruv/Projects/visit-schedule-site/
```
Auto-deploys are linked: every push to master also triggers Vercel via GitHub integration.

## Key Design Decisions
- **Pre Sales primary workflow is Kylas** — they schedule visits in Kylas CRM; the app syncs those via `api/kylas-sync.js`. The "+ Schedule Visit" button is kept as a fallback for walk-ins and phone enquiries (saved with `kylas_id=null`).
- **Cancel visit only for manual visits** — Kylas-synced visits (`kylas_id IS NOT NULL`) cannot be cancelled from this app; they are managed in Kylas.
- **isWeekendOrHoliday replaces isWeekend** — public holidays use weekend footfall. `holidaySet` populated at `loadStores()` time from `public_holidays` table.
- **House stage NOT captured at scheduling** — BM captures it during the visit conversation
- **Receptionist BM panel always visible** — split layout because both panels are needed simultaneously
- **BM "Potentially Available"** — currently a manual-only status; auto-flag (2h after last allocation) not yet implemented as a server job
- **All footfall data managed by Admin** — Pre Sales sees the result in the capacity grid but cannot edit it
- **Store isolation** — all SM/Receptionist queries filter by `store_id = SESSION.store_id`
- **`vs_user` not `md_user`** — prevents localStorage collision if someone has both apps open in the same browser
- **Kylas sync does not overwrite operational fields** — `visit_status`, `arrival_time`, `assigned_bm_id`, `bm_comments`, `availability_status` are owned by SM/Receptionist after a visit is created

## Implementation Notes
1. **sbPatch/sbPost throw on failure** — Supabase returns valid JSON even for errors. Check `r.ok` before `r.json()`. All callers use try/catch.
2. **visit_time is text "HH:MM"** — stored as "10:00", "11:00", etc. (range 10:00–20:00). Parse with `parseInt(v.visit_time.split(':')[0])` to match to a slot hour.
3. **BM profile lookup uses email** — `profiles?email=eq.${SESSION.email}` (not by id)
4. **bm_status is one row per BM** — Receptionist checks for existing row then patches or posts. Filter by `bm_id` and `store_id` to avoid cross-store collision.
5. **footfall_data format** — `{weekday:{10:1,...,20:3}, weekend:{10:1,...,20:4}}`. Read with `ff.weekday||ff` to fall back to old flat format. Keys can be int or string — check both.
6. **isWeekendOrHoliday(dateStr)** — `new Date(d+'T00:00:00').getDay()===0||6 || holidaySet.has(d)`. `holidaySet` is a module-level Set populated by `loadStores()`. Used in PreSales to pick weekday vs weekend footfall.
7. **Cancel visit (Pre Sales)** — only shown for `visit_status==='scheduled' && !v.kylas_id`. Uses `sbDel('store_visits', id)` — hard delete. Kylas-synced visits never show this button.
8. **Category multi-select (Pre Sales)** — two arrays: `selectedCats` (standard chips) + `otherCats` (free-text custom entries). On save: `[...selectedCats,...otherCats]` saved to `categories` jsonb.
9. **Admin Set Footfall modal** — Weekday/Weekend tabs via `switchFfTab()`. `FF_SLOTS` array covers hours 10–20. Input IDs: `ff_wd_10…ff_wd_20` (weekday), `ff_we_10…ff_we_20` (weekend). `buildFfGrid(gridId, prefix, data)` populates each tab.
10. **Admin role viewer store picker** — shown only for `store_manager`, `receptionist`. Pre-loads `allStores` from init fetch.
11. **Day nav** — `Array.from({length:7}, (_,i) => dateStr(i))` generates today + 6 forward. `dateStr(0)` = today in local timezone.
12. **vercel.json** — `Cache-Control: no-cache` on all `*.html`; `Access-Control-Allow-Origin: *` on `/api/*` (for Kylas sync function).
13. **Kylas sync upsert** — URL must include `?on_conflict=kylas_id` for Supabase to use the right unique constraint. Without it, every row is treated as a new insert.
14. **Public holidays** — `public_holidays` table must be created in Supabase before the Holidays admin view works. SQL is in `schema.sql`.
15. **Admin Holidays Add button** — has `id="hlAddBtn"` for double-submit guard in `addHoliday()`. On re-render (after success), the button is recreated fresh so no stale disabled state.

## Pending / Still to Build

### Pre Sales Dashboard UI (confirmed missing as of 2026-06-22)
The original design mockup (shared by user) included two features that were explicitly excluded from the first implementation plan but the user still wants:
- **"Week at a Glance" panel**: 7-day mini calendar grid at top of page. Columns = days (today + 6 forward). Rows = Morning (10 AM–12 PM) / Afternoon (12 PM–5 PM) / Evening (5 PM–9 PM). Each cell shows aggregate load count, color-coded green/orange/red. Clicking a day selects it for the slot detail view below.
- **Morning / Afternoon / Evening section dividers** in the Slot Capacity panel: group the 11 hourly slot rows under MORNING (10–11 AM), AFTERNOON (12 PM–4 PM), EVENING (5–9 PM) section headers.

### Kylas & Ops
- **Kylas field mapping**: fetch a real lead once "Lead Read" permission is enabled on API key `f3586066-...`, confirm field names, update `mapLead()` in `api/kylas-sync.js`, set `KYLAS_STORE_MAP` env var
- **Vercel env vars**: set `KYLAS_API_KEY`, `SUPABASE_KEY`, `KYLAS_STORE_MAP` in Vercel dashboard before Kylas sync goes live
- **Run `footfall_migration.sql`** in Supabase SQL editor to seed actual footfall data for all 3 stores
- **Run `public_holidays` table SQL** from `schema.sql` in Supabase SQL editor
- **BM "Potentially Available" auto-flag**: server-side Vercel cron sets `status='potentially_available'` 2h after `last_allocated_at` if BM hasn't manually marked free
- **Daily BM status reset**: Vercel cron resets all `bm_status.status='free'` and `active_client_count=0` at start of each day
- **SM + Receptionist Metabase CRM integration**: future — add visit schedule as a tab in the existing Metabase CRM portal (separate project); tested externally in this portal first
