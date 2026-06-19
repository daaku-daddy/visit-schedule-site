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
- **Stack**: Plain HTML/CSS/JS · Supabase REST API (raw fetch, no client lib) · Vercel static hosting

## Files
| File | Role | Device |
|---|---|---|
| `index.html` | Meta-refresh redirect to Login.html | — |
| `Login.html` | Email + 4-digit passcode flow, routes by role | Any |
| `Admin.html` | Admin console — Users, Stores, Footfall, Role Viewer | Desktop |
| `PreSales_Dashboard.html` | Schedule visits + slot capacity grid per store | Desktop |
| `StoreManager_Dashboard.html` | Upcoming visits + BM team management | Mobile |
| `Receptionist_Dashboard.html` | Today's check-ins + live BM panel | Desktop/Tablet |
| `BM_Dashboard.html` | Assigned clients + comment/house stage form | Mobile |
| `schema.sql` | Full Supabase schema (run once in SQL editor) | — |
| `footfall_migration.sql` | Seeds weekday/weekend footfall for JP Nagar, Whitefield, Yelahanka from Excel analysis | — |
| `vercel.json` | `no-cache` headers on all HTML files | — |

## Roles
| Role key | Label | Device | Scope |
|---|---|---|---|
| `admin` | Admin | Desktop | Full admin console |
| `pre_sales` | Pre Sales | Desktop | All stores — schedule visits + capacity grid |
| `store_manager` | Store Manager | Mobile | One store — visits + BM team |
| `receptionist` | Receptionist | Desktop/Tablet | One store — check-in + BM assignment |
| `store_bm` | Business Manager | Mobile | One store — assigned clients + fill comments |

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
  - `store_bm → BM_Dashboard.html`
- Every dashboard reads session on load, redirects to Login.html if missing/wrong role
- First admin must be seeded manually via Supabase SQL editor (see schema.sql comment)

## Supabase Tables

### `stores`
`id, name, location, bm_count, footfall_data (jsonb), created_at`
- `bm_count`: target number of BMs, used in slot capacity formula
- `footfall_data`: `{weekday: {9:0,10:1,...}, weekend: {9:0,10:1,...}}` — expected walk-in footfall per hour (key = hour 9–19), split by weekday/weekend
- Backward-compatible: if old flat `{9:2,...}` format exists, code falls back gracefully
- Set via Admin → Stores → "Set Footfall" button — modal has Weekday (Mon–Fri) and Weekend (Sat–Sun) tabs, each with 11 hour inputs
- Seeded for JP Nagar, Whitefield, Yelahanka via `footfall_migration.sql` (median values from Hourly_Footfall_Corrected_Analysis.xlsx)

### `profiles`
`id, name, email, role, passcode, store_id, created_at`
- `store_id` is null for `admin` and `pre_sales`
- `passcode` is null on creation — user sets it on first login
- BMs added by SM via "My Team" tab get `role=store_bm`, `store_id=SM's store`, `passcode=null`
- Admin manages all users via Admin → Users (CRUD: add, edit role/store, reset passcode, delete)

### `store_visits`
`id, kylas_id, store_id, customer_name, phone, visit_date, visit_time (text "HH:MM"), categories (jsonb array), sku_links (jsonb), presales_notes, availability_status, availability_notes, arrival_time, assigned_bm_id, bm_comments, house_stage, follow_up, visit_status, created_at, updated_at`

- `visit_time` stored as `"09:00"`, `"10:00"`, etc. (24h text, not timestamptz)
- `availability_status`: `null | 'available' | 'partial' | 'unavailable'` — set by Store Manager
- `visit_status`: `scheduled → arrived → bm_assigned → completed`
- `house_stage`: set by BM during visit — NOT captured at scheduling time
- `kylas_id`: unique reference for Kylas sync deduplication (nullable until Kylas integration built)
- `categories`: jsonb array e.g. `["Flooring","Wallpaper"]`
- All PATCH calls include `updated_at: new Date().toISOString()`

### `bm_status`
`id, bm_id (fk profiles), store_id, status, last_allocated_at, active_client_count, updated_at`
- `status`: `free | engaged | potentially_available`
- Created by Receptionist on first BM assignment if row doesn't exist yet
- `potentially_available`: auto-flag set 2h after `last_allocated_at` if BM hasn't manually marked free (not yet implemented as a server job — currently manual only)
- BM taps "Mark Free" → status → `free`, `active_client_count` → 0
- When BM marks visit complete: `active_client_count` decremented; if hits 0 → status auto-set to `free`

### `visit_assignments`
`id, visit_id (fk store_visits), bm_id (fk profiles), assigned_at, store_id`
- One active assignment per visit (receptionist picks one BM)
- Multiple visits can be assigned to same BM simultaneously
- Used by BM_Dashboard to look up which visits belong to this BM

## Supabase Helpers (in every file)
```javascript
const SB_H = {'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','Prefer':'return=representation'};
async function sbGet(q){const r=await fetch(SB_URL+'/rest/v1/'+q,{headers:SB_H});return r.json();}
async function sbPost(t,b){const r=await fetch(SB_URL+'/rest/v1/'+t,{method:'POST',headers:SB_H,body:JSON.stringify(b)});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||'Save failed ('+r.status+')');}return r.json();}
async function sbPatch(t,id,b){const r=await fetch(SB_URL+'/rest/v1/'+t+'?id=eq.'+id,{method:'PATCH',headers:SB_H,body:JSON.stringify(b)});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||'Save failed ('+r.status+')');}return r.json();}
async function sbDel(t,id){const r=await fetch(SB_URL+'/rest/v1/'+t+'?id=eq.'+id,{method:'DELETE',headers:SB_H});if(!r.ok)throw new Error('Delete failed ('+r.status+')');return true;}
```
- `sbPost` and `sbPatch` throw on non-2xx — all callers must use try/catch
- PreSales_Dashboard uses the same helpers but with `sbDel` added (visit cancellation)
- `sbGet` returns raw JSON (including Supabase error objects) — always check `Array.isArray(result)` before use

## Dashboard Details

### Admin.html (Desktop)
Rail nav views:
- **Overview**: stat cards (total users, stores, visits today, arrived today) + role breakdown
- **Users**: table with search, Add/Edit/Reset PIN/Delete. Role dropdown has all 5 roles. Store picker shown only for `store_manager`, `receptionist`, `store_bm`. Store_id set to null for `admin` and `pre_sales`.
- **Stores**: card grid. Add/Edit store (name, location, bm_count). "Set Footfall" button per store → 11-input modal (9 AM–7 PM), saves to `stores.footfall_data` jsonb.
- **Role Viewer**: Admin selects a role → picks store (if store-specific) → injects fake session into localStorage → loads dashboard in iframe → restores real admin session in `iframe.onload`

### PreSales_Dashboard.html (Desktop)
- Store dropdown (fetched from `stores` table on load)
- Day nav (today + 6 days forward)
- "+ Schedule Visit" button in controls bar
- **Left panel** — Slot Capacity Grid (9 AM–7 PM):
  - Load formula: `(scheduled_visits_for_slot + footfall[hour]) / bm_count`
  - Footfall set chosen by `isWeekend(selectedDay)` — weekday vs weekend
  - Green < 50%, Orange 50–80%, Red ≥ 80%
  - Each row is clickable → opens scheduling form pre-filled with that time
  - "+ Schedule" hint appears on row hover
- **Right panel** — Visits for selected store + day:
  - Lists all visits with time, name, phone, category tags, pre-sales notes, status chip
  - "Cancel visit" button on `scheduled` visits only (deletes the row)
- **Schedule Visit modal**:
  - Customer name, phone (10-digit validated), store, date, time slot
  - **Standard category chips** (toggle): Tiles, Laminates, Plywood, Panels, Wooden Flooring, Wallpapers, Quartz, HDHMR, Blockboard, Adhesives, Wall Cladding
  - **Other Categories** section below divider: free-text input + Add button (or Enter key); each custom entry shows as a removable chip; `selectedCats` + `otherCats` merged on save
  - Pre-sales notes (optional textarea)
  - Saves to `store_visits` with `visit_status='scheduled'`
  - Error handling: button disabled during save, error shown inline if fails
- Polls every 60s after store selected

### StoreManager_Dashboard.html (Mobile)
Two tabs:
- **Visits tab**: today + tomorrow's visits for `store_id = SESSION.store_id`. Each card shows name, phone, time, categories, availability chip. "Set Availability" opens bottom sheet: Available / Partially Available / Unavailable + optional notes. Saves `availability_status` and `availability_notes` to `store_visits`.
- **My Team tab**: lists BMs for this store (`role=store_bm, store_id=SESSION.store_id`). Add BM by name + @materialdepot.com email (creates profile, `passcode=null`). Remove BM deletes their profile.
- Polls every 30s on Visits tab

### Receptionist_Dashboard.html (Desktop/Tablet)
Split layout (always visible side by side):
- **Left — Today's Visits**: fetched for `store_id = SESSION.store_id`, `visit_date = today`. Cards show time, name, phone, categories, status chip. Actions:
  - `scheduled` → "Mark Arrived" button → patches `visit_status='arrived'`, sets `arrival_time`
  - `arrived` → "Assign BM" button → opens BM picker modal
- **Right — BM Panel**: lists all `store_bm` profiles for this store with their live `bm_status`. Shows status chip (Free/Engaged/P.Available) + active client count.
- **Assign BM modal**: shows BM cards with status. Busy BMs are greyed out and unclickable. On assign: patches visit to `bm_assigned`, posts to `visit_assignments`, patches/posts `bm_status` (increments `active_client_count`, sets `engaged`).
- Polls every 10s (BM status needs to be near-live)

### BM_Dashboard.html (Mobile)
- Looks up own profile by email from `SESSION.email`
- Status bar at top: shows current `bm_status.status` chip + active client count
- "Mark Free" button: patches `bm_status` to `free`, resets `active_client_count=0`
- Fetches `visit_assignments` for own `bm_id` → gets matching `store_visits` (today, not completed)
- Each client card is expandable (tap to open):
  - House Stage dropdown: Under Construction / Ready to Move / Renovation / New Build — Bare Shell
  - Visit Notes textarea
  - Follow-up dropdown: No follow-up / Call in 2 days / Send quotation
  - "Save & Mark Complete" button: patches visit with all fields + `visit_status='completed'`; decrements `active_client_count` (auto-sets `free` if hits 0)
  - Button disabled during save; error toast warns "do not close this page, try again" on failure
- Polls every 30s

## Polling Intervals
| Dashboard | Interval | Reason |
|---|---|---|
| Receptionist | 10s | BM status must update near-live |
| StoreManager | 30s | Visit list less time-critical |
| BM | 30s | Assignment list less time-critical |
| PreSales | 60s | Slot capacity, low urgency |
| Admin | None | Manual refresh |

## Slot Capacity Formula
```
load = (scheduled_visits_for_slot + footfall[hour]) / stores.bm_count
Green:  load < 0.50
Orange: load 0.50–0.79
Red:    load >= 0.80
```
- `scheduled_visits_for_slot`: count of `store_visits` where `visit_date=selectedDay`, `visit_time` starts with that hour, `visit_status != completed`
- `footfall` set chosen by day-of-week: `isWeekend(selectedDay)` (getDay()==0||6) → `footfall_data.weekend` else `footfall_data.weekday`
- Falls back to flat `footfall_data` if no `weekday` key (backward compat)
- Key is the hour as integer (9, 10, … 19) or string — both are checked
- Set by Admin in Stores → "Set Footfall" modal (Weekday + Weekend tabs)

## CSS Design System
Same variables as existing material-depot-site:
```css
--navy:#1F3A5F;  --navy2:#16294a; --blue:#2E6CA8;  --yellow:#F4C20D;
--ink:#1b2230;   --muted:#67748a; --line:#dde3ec;  --bg:#eef1f6;   --card:#fff;
--green:#1f7a3f; --greenbg:#e6f3ea;
--red:#b3261e;   --redbg:#fbeae8;
--amber:#9a6200; --amberbg:#fdf2da;
--purple:#5b3aa6;--purplebg:#efeaf8;
```
Role badge CSS classes: `rb-admin` (purple), `rb-pre_sales` (navy), `rb-store_manager` (blue), `rb-receptionist` (green), `rb-store_bm` (amber)

## Architecture Patterns
- Role guard on every page: reads `vs_user` from localStorage, checks `role`, redirects to Login.html on failure
- All write operations (sbPost, sbPatch, sbDel) throw on non-2xx and are wrapped in try/catch with error toasts
- Save buttons disabled during in-flight requests to prevent double-submits
- `updated_at: new Date().toISOString()` added to every PATCH on `store_visits` and `bm_status`
- `Array.isArray(result)` guard on every `sbGet` result before use
- `esc(s)` helper used everywhere user-supplied strings go into innerHTML
- Never use smart/curly quotes in JS strings — always ASCII `'` and `"`
- Role Viewer iframe trick: save adminSession → write fake session → set iframe.src → restore adminSession in `iframe.onload`

## Deployment Workflow
```bash
git add <specific files>          # never git add -A
git commit -m "description"
git push origin master
vercel --prod --yes               # from /Users/dhruv/Projects/visit-schedule-site/
```
Auto-deploys are linked: every push to master also triggers Vercel via GitHub integration.

## Key Design Decisions
- **Pre Sales schedules directly in this app** — not Kylas-only. Kylas sync (when built) will upsert via `kylas_id`, complementing manually entered visits.
- **House stage NOT captured at scheduling** — BM captures it during the visit conversation
- **Receptionist BM panel always visible** — split layout because both panels are needed simultaneously
- **BM "Potentially Available"** — currently a manual-only status; auto-flag (2h after last allocation) not yet implemented as a server job
- **All footfall data managed by Admin** — Pre Sales sees the result in the capacity grid but cannot edit it
- **Store isolation** — all SM/Receptionist/BM queries filter by `store_id = SESSION.store_id`
- **`vs_user` not `md_user`** — prevents localStorage collision if someone has both apps open in the same browser

## Implementation Notes
1. **sbPatch/sbPost throw on failure** — Supabase returns valid JSON even for errors (e.g. "relation does not exist"). Check `r.ok` before `r.json()`. All callers use try/catch.
2. **visit_time is text "HH:MM"** — stored as "09:00", "10:00", etc. Parse with `parseInt(v.visit_time.split(':')[0])` to match to a slot hour.
3. **BM profile lookup uses email** — `profiles?email=eq.${SESSION.email}` (not by id — id isn't stored in session)
4. **bm_status is one row per BM** — Receptionist checks for existing row then patches or posts. Filter by `bm_id` and `store_id` to avoid cross-store collision.
5. **footfall_data format** — `{weekday:{9:0,...,19:4}, weekend:{9:0,...,19:7}}`. Read with `ff.weekday||ff` to fall back to old flat format. Keys can be int or string — check both.
6. **isWeekend(dateStr)** — `new Date(d+'T00:00:00').getDay()===0||===6`. Used in PreSales to pick weekday vs weekend footfall set.
7. **Cancel visit (Pre Sales)** — only shown for `visit_status='scheduled'` visits. Uses `sbDel('store_visits', id)` — hard delete.
8. **Category multi-select (Pre Sales)** — two arrays: `selectedCats` (standard chips) + `otherCats` (free-text custom entries). `buildCatGrid()` renders both. On save: `[...selectedCats,...otherCats]` saved to `categories` jsonb.
9. **Admin Set Footfall modal** — Weekday/Weekend tabs via `switchFfTab()`. Input IDs: `ff_wd_9…ff_wd_19` (weekday), `ff_we_9…ff_we_19` (weekend). `buildFfGrid(gridId, prefix, data)` populates each tab. On open: `ff.weekday||ff` for weekday tab, `ff.weekend||{}` for weekend tab.
10. **Admin role viewer store picker** — shown only for `store_manager`, `receptionist`, `store_bm`. Pre-loads `allStores` from init fetch.
11. **Day nav** — `Array.from({length:7}, (_,i) => dateStr(i))` generates today + 6 forward. `dateStr(0)` = today in local timezone.
12. **vercel.json** — `Cache-Control: no-cache` on all `*.html` to prevent stale JS on mobile browsers.

## Pending / Still to Build
- **Kylas CRM sync**: Vercel cron job (~2 min) polling Kylas REST API → upsert into `store_visits` on `kylas_id`. Requires Kylas API key + field mapping from user.
- **BM "Potentially Available" auto-flag**: server-side job (Vercel cron) sets `status='potentially_available'` 2h after `last_allocated_at` if BM hasn't manually marked free.
- **Daily BM status reset**: cron to reset all `bm_status.status='free'` and `active_client_count=0` at start of each day.
- **Footfall data**: actual per-store per-hour numbers from user (can now be entered via Admin → Stores → Set Footfall).
- **Store list + BM counts**: to be added via Admin → Stores once Supabase tables are set up.
