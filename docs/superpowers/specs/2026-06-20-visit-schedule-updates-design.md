# Visit Schedule Site — Updates Design
**Date:** 2026-06-20

## Overview

Six changes to the existing visit-schedule-site:
1. Pre-Sales dashboard UI updates (slot timings + slot count display)
2. Kylas CRM sync via Vercel API route (Approach A)
3. BM Dashboard removal
4. Footfall data update (hours 10–20, median values from Excel analysis)
5. Public holidays feature (Admin marks a weekday date as holiday → weekend footfall used that day)
6. SM/Receptionist CRM portal integration is a **future step** — deferred to Metabase portal migration

---

## 1. Pre-Sales Dashboard UI

**File:** `PreSales_Dashboard.html`

### Slot timings
Replace current 9 AM–7 PM (hours 9–19) with **10 AM–9 PM** (hours 10–20). 11 slots total:

| Slot | Value |
|---|---|
| 10 – 11 AM | `10:00` |
| 11 AM – 12 PM | `11:00` |
| 12 – 1 PM | `12:00` |
| 1 – 2 PM | `13:00` |
| 2 – 3 PM | `14:00` |
| 3 – 4 PM | `15:00` |
| 4 – 5 PM | `16:00` |
| 5 – 6 PM | `17:00` |
| 6 – 7 PM | `18:00` |
| 7 – 8 PM | `19:00` |
| 8 – 9 PM | `20:00` |

The `Schedule Visit` modal time picker must also update to these 11 options.

### Admin footfall modal
`Admin.html` "Set Footfall" modal currently covers hours 9–19. Update to 10–20:
- Drop `ff_wd_9` / `ff_we_9` inputs (hour 9)
- Add `ff_wd_20` / `ff_we_20` inputs (hour 20)
- `buildFfGrid()` and the label array update accordingly

The `footfall_data` JSONB in Supabase uses hour integers as keys — no schema change needed, Admin just writes the new range.

### Slot count display
Change the right-side count in each slot row from `"X visits"` to `"X / Y"` format where:
- `X` = `scheduled_visits_in_slot + footfall[hour]` (same numerator as the color formula)
- `Y` = `stores.bm_count`

Example: if 2 visits are scheduled, footfall is 1, and bm_count is 5 → display `"3 / 5"`.

The color thresholds (Green < 50%, Orange 50–79%, Red ≥ 80%) are unchanged.

### No section headers, no Week at a Glance
No MORNING/AFTERNOON/EVENING dividers. No "Week at a Glance" panel. Layout stays as-is: slot grid left, visits list right.

### Schedule Visit button
Keep `"+ Schedule Visit"` button as a fallback for manually scheduling visits not coming from Kylas (walk-ins, phone enquiries). Visits created this way have `kylas_id = NULL`.

### Cancel visit button
Only shown on visits where `kylas_id IS NULL` (manually created). Kylas-synced visits cannot be cancelled from this app.

---

## 2. Kylas Sync — Vercel API Route

### Architecture
```
Pre-Sales dashboard (browser)
    → GET /api/kylas-sync   (every page load + 60s poll)
        → Kylas Leads API   (server-side, API key in env var)
        → Supabase upsert   (on kylas_id)
        → return leads list
    ← renders from response
```

SM / Receptionist dashboards read from `store_visits` in Supabase as normal — they see Kylas-synced visits within 60s of Pre-Sales having the dashboard open.

### New file: `api/kylas-sync.js`
Vercel serverless function:
- Reads `process.env.KYLAS_API_KEY`
- Calls Kylas REST API: `GET https://api.kylas.io/v1/leads` (Lead entity, read-only)
- Maps lead fields → `store_visits` row (see field mapping below)
- Upserts to Supabase via `kylas_id` conflict key
- Returns the mapped leads array as JSON

### Kylas API auth
Header: `api-key: <KYLAS_API_KEY>`  
Key format: `f3586066-8c20-4763-80c9-0622eff59917:20007`  
Env var name: `KYLAS_API_KEY`  
Set in Vercel project → Settings → Environment Variables.

**Prerequisite:** Kylas admin must enable "Lead Read" permission on this API key before the function can be built and tested. Once enabled, fetch one real lead to confirm exact field names.

### Field mapping (to be confirmed post-API-access)

| Kylas Lead field | `store_visits` column | Notes |
|---|---|---|
| `id` | `kylas_id` | Deduplication key |
| contact name | `customer_name` | Check `name`, `fullName`, or `firstName`+`lastName` |
| mobile / phone | `phone` | Strip non-digits, take first 10 |
| custom: visit date | `visit_date` | Format as `YYYY-MM-DD` |
| custom: time slot | `visit_time` | Format as `HH:00` |
| custom: store | `store_id` | Map store name/label → Supabase `stores.id` |

`visit_status` defaults to `'scheduled'` on insert; never overwritten on update (SM/Receptionist own status after that).

### Supabase upsert
```
POST /rest/v1/store_visits
Header: Prefer: resolution=merge-duplicates
On conflict: kylas_id
```
Fields updated on conflict: `customer_name`, `phone`, `visit_date`, `visit_time`, `store_id`, `updated_at`.  
Fields NOT overwritten: `visit_status`, `arrival_time`, `assigned_bm_id`, `bm_comments`, `availability_status`.

### vercel.json update
Add the `/api` route so Vercel knows to run serverless functions:
```json
{
  "functions": { "api/*.js": { "runtime": "nodejs20.x" } }
}
```

---

## 3. BM Dashboard Removal

**Files changed:** `BM_Dashboard.html` (deleted), `Login.html` (updated)

- Delete `BM_Dashboard.html` entirely from the repo.
- In `Login.html`, remove the `store_bm` case from the role routing switch. Replace with an inline error: `"Access not available in this portal."` shown on the login screen (user stays on Login.html, no redirect).
- The `store_bm` role and existing `profiles` rows with that role are untouched in Supabase — the role data is preserved for the future Metabase CRM portal migration.
- `bm_status` and `visit_assignments` tables are also untouched.

---

## 4. SM / Receptionist CRM Integration

**Status: Deferred.**  
SM and Receptionist dashboards (`StoreManager_Dashboard.html`, `Receptionist_Dashboard.html`) are unchanged in this release. Integration into the Metabase CRM portal is a separate future project.

---

---

## 4. Footfall Data Update

**Files changed:** `footfall_migration.sql`, `Admin.html`

### Median footfall values (from `Hourly_Footfall_Corrected_Analysis.xlsx`)

Hours 10–20 (10 AM – 9 PM), using **median** values per store:

**JP Nagar**
| Hour | Weekday | Weekend |
|---|---|---|
| 10 | 1 | 1 |
| 11 | 4 | 6 |
| 12 | 5 | 11 |
| 13 | 5 | 10 |
| 14 | 5 | 9 |
| 15 | 5 | 9 |
| 16 | 5 | 9 |
| 17 | 4 | 10 |
| 18 | 4 | 10 |
| 19 | 4 | 7 |
| 20 | 3 | 4 |

**Whitefield**
| Hour | Weekday | Weekend |
|---|---|---|
| 10 | 1 | 1 |
| 11 | 2 | 5 |
| 12 | 3 | 6 |
| 13 | 3 | 7 |
| 14 | 2 | 7 |
| 15 | 3 | 9 |
| 16 | 3 | 8 |
| 17 | 3 | 7 |
| 18 | 3 | 8 |
| 19 | 3 | 6 |
| 20 | 2 | 3 |

**Yelahanka**
| Hour | Weekday | Weekend |
|---|---|---|
| 10 | 0 | 1 |
| 11 | 2 | 3 |
| 12 | 2 | 4 |
| 13 | 2 | 4 |
| 14 | 2 | 4 |
| 15 | 2 | 5 |
| 16 | 2 | 4 |
| 17 | 2 | 5 |
| 18 | 2 | 4 |
| 19 | 2 | 3 |
| 20 | 2 | 2 |

### footfall_migration.sql
Rewrite to use the new hour range (10–20) and the above median values. The SQL does an `UPDATE stores SET footfall_data = '...'::jsonb WHERE name = 'Store Name'` for each store. Existing rows are updated (not inserted).

### Admin footfall modal (Admin.html)
- Input IDs: `ff_wd_10…ff_wd_20` (weekday), `ff_we_10…ff_we_20` (weekend) — drop hour 9 inputs, add hour 20
- Label array in `buildFfGrid()` updated to `['10 AM','11 AM','12 PM','1 PM','2 PM','3 PM','4 PM','5 PM','6 PM','7 PM','8 PM']`

---

## 5. Public Holidays Feature

When a weekday is a public holiday, store footfall behaves like a weekend (higher traffic). Admin can mark specific dates as public holidays.

### New Supabase table: `public_holidays`
```sql
CREATE TABLE public_holidays (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date text NOT NULL UNIQUE,   -- 'YYYY-MM-DD'
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);
```
Holidays are global (apply to all stores). No `store_id` — public holidays affect everyone.

### Admin UI
New "Public Holidays" section inside `Admin.html` (added as a nav view or a card in the Stores view):
- List of upcoming holidays (date + name) with a Delete button per row
- "Add Holiday" form: date picker + holiday name text input + Add button
- On add: `POST /rest/v1/public_holidays`
- On delete: `DELETE /rest/v1/public_holidays?id=eq.{id}`

### Pre-Sales dashboard usage
On load, fetch `public_holidays` alongside stores:
```js
const holidays = await sbGet('public_holidays?select=date');
const holidaySet = new Set(holidays.map(h => h.date));
```
Then in `isWeekend()` / footfall selection logic:
```js
function isWeekendOrHoliday(d) {
  const dow = new Date(d + 'T00:00:00').getDay();
  return dow === 0 || dow === 6 || holidaySet.has(d);
}
```
Replace all `isWeekend(selectedDay)` calls with `isWeekendOrHoliday(selectedDay)`.

---

## 6. SM / Receptionist CRM Integration

**Status: Deferred.**  
SM and Receptionist dashboards (`StoreManager_Dashboard.html`, `Receptionist_Dashboard.html`) are unchanged in this release. Integration into the Metabase CRM portal is a separate future project.

---

## Out of Scope
- BM auto "Potentially Available" cron (existing pending item)
- Daily BM status reset cron (existing pending item)
- Receptionist / SM dashboard UI changes

---

## Open Items
1. **Kylas API permission** — admin must enable "Lead Read" on key `f3586066-...` before field mapping can be confirmed and the sync function built.
2. **Store mapping** — how Kylas identifies which store a lead is tagged to (field name + value format) must be confirmed from a real lead response.
