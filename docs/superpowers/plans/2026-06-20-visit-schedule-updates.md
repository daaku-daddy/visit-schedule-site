# Visit Schedule Updates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update slot timings (10 AM–9 PM), fix slot count display (X/Y format), add public holidays, reseed footfall data, remove BM dashboard, and scaffold Kylas sync via Vercel API route.

**Architecture:** Plain HTML/CSS/JS front-end, Supabase REST API, Vercel static hosting + one new serverless function (`api/kylas-sync.js`). No build step. Changes are isolated to individual HTML files and one new JS function file.

**Tech Stack:** Vanilla JS · Supabase REST (raw fetch) · Vercel serverless functions (Node 20)

**Spec:** `docs/superpowers/specs/2026-06-20-visit-schedule-updates-design.md`

---

## File Map

| File | Action | What changes |
|---|---|---|
| `BM_Dashboard.html` | **Delete** | Removed entirely |
| `Login.html` | **Modify** | Remove `store_bm` route, show error instead |
| `footfall_migration.sql` | **Rewrite** | Hours 10–20, new median values |
| `Admin.html` | **Modify** | FF_SLOTS 10–20 · Public Holidays nav + view |
| `PreSales_Dashboard.html` | **Modify** | SLOTS 10–20 · slot count X/Y · public holidays |
| `api/kylas-sync.js` | **Create** | Vercel function: fetch Kylas → upsert Supabase |
| `vercel.json` | **Modify** | Add CORS header for `/api/*` route |

---

## Task 1: Remove BM Dashboard

**Files:**
- Delete: `BM_Dashboard.html`
- Modify: `Login.html` (lines 53–59, 337–348 approx)

- [ ] **Step 1: Delete BM_Dashboard.html**

```bash
rm /Users/dhruv/Projects/visit-schedule-site/BM_Dashboard.html
```

- [ ] **Step 2: Update ROLE_FILES in Login.html**

Find and replace the `ROLE_FILES` object (around line 53). Remove the `store_bm` entry:

```js
const ROLE_FILES={
  admin:         {label:'Admin',            file:'Admin.html',                  note:'Admin console'},
  pre_sales:     {label:'Pre Sales',        file:'PreSales_Dashboard.html',     note:'Slot capacity view'},
  store_manager: {label:'Store Manager',    file:'StoreManager_Dashboard.html', note:'Visit management'},
  receptionist:  {label:'Receptionist',     file:'Receptionist_Dashboard.html', note:'Check-in & BM assignment'},
};
```

- [ ] **Step 3: Update successScreen() in Login.html to guard unknown roles**

Find `successScreen()` (around line 253). Replace the entire function:

```js
function successScreen(){
  const r=ROLE_FILES[state.user.role];
  if(!r){
    $('#card').innerHTML='<h1>Access not available</h1><p class="sub">This portal is not available for your role. Please contact your administrator.</p>';
    return;
  }
  localStorage.setItem(SESSION_KEY,JSON.stringify({
    name:state.user.name,
    email:state.user.email,
    role:state.user.role,
    store_id:state.user.store_id||null
  }));
  $('#card').innerHTML=`
    <h1>Welcome, ${state.user.name.split(' ')[0]}</h1>
    <p class="sub">You\'re signed in. Taking you to your dashboard…</p>
    <div class="roleline"><span class="ic">&#10003;</span> Role: ${r.label} <span style="margin-left:auto;font-weight:600;color:var(--muted)">${r.note}</span></div>
    <button class="btn" id="go"><span class="spin"></span> Opening…</button>`;
  const go=()=>{window.location.href=r.file;};
  setTimeout(go,900);
  $('#go').onclick=go;
}
```

- [ ] **Step 4: Remove store_bm from Admin.html role constants**

In `Admin.html`, find these two lines (around line 301–304) and remove `store_bm`:

```js
const ROLE_LABELS={admin:'Admin',pre_sales:'Pre Sales',store_manager:'Store Manager',receptionist:'Receptionist'};
const STORE_ROLES=['store_manager','receptionist'];
const ROLE_KEYS=['admin','pre_sales','store_manager','receptionist'];
```

Also find `VIEWER_ROLES` array (around line 706) and remove the `store_bm` entry:
```js
const VIEWER_ROLES=[
  {key:'pre_sales',label:'Pre Sales',ico:'&#128202;',desc:'Cross-store slot view'},
  {key:'store_manager',label:'Store Manager',ico:'&#128203;',desc:'Visit management'},
  {key:'receptionist',label:'Receptionist',ico:'&#127979;',desc:'Check-in & BM panel'},
];
```

- [ ] **Step 5: Verify**

Open `Login.html` in browser. Log in with a `store_bm` account (if one exists in Supabase). Confirm the card shows "Access not available" instead of redirecting to a missing page.

- [ ] **Step 6: Commit**

```bash
cd /Users/dhruv/Projects/visit-schedule-site
git add Login.html Admin.html
git rm BM_Dashboard.html
git commit -m "feat: remove BM dashboard, block store_bm login in this portal"
```

---

## Task 2: Rewrite Footfall Migration SQL

**Files:**
- Rewrite: `footfall_migration.sql`

- [ ] **Step 1: Replace footfall_migration.sql entirely**

```sql
-- Footfall data migration: weekday + weekend median hourly visitors per store
-- Source: Hourly_Footfall_Corrected_Analysis.xlsx (Median column, hours 10–20)
-- Run in Supabase SQL editor. Match is case-insensitive LIKE.

UPDATE stores
SET footfall_data = '{
  "weekday": {"10":1,"11":4,"12":5,"13":5,"14":5,"15":5,"16":5,"17":4,"18":4,"19":4,"20":3},
  "weekend": {"10":1,"11":6,"12":11,"13":10,"14":9,"15":9,"16":9,"17":10,"18":10,"19":7,"20":4}
}'::jsonb
WHERE lower(name) LIKE '%jp nagar%';

UPDATE stores
SET footfall_data = '{
  "weekday": {"10":1,"11":2,"12":3,"13":3,"14":2,"15":3,"16":3,"17":3,"18":3,"19":3,"20":2},
  "weekend": {"10":1,"11":5,"12":6,"13":7,"14":7,"15":9,"16":8,"17":7,"18":8,"19":6,"20":3}
}'::jsonb
WHERE lower(name) LIKE '%whitefield%';

UPDATE stores
SET footfall_data = '{
  "weekday": {"10":0,"11":2,"12":2,"13":2,"14":2,"15":2,"16":2,"17":2,"18":2,"19":2,"20":2},
  "weekend": {"10":1,"11":3,"12":4,"13":4,"14":4,"15":5,"16":4,"17":5,"18":4,"19":3,"20":2}
}'::jsonb
WHERE lower(name) LIKE '%yelahanka%';

-- Verify
SELECT name, footfall_data FROM stores ORDER BY name;
```

- [ ] **Step 2: Run in Supabase**

Go to https://supabase.com/dashboard/project/dzilftvisjgckmefpzxk/sql/new, paste the SQL above, and run it. Confirm all 3 store rows show the updated `footfall_data` with keys 10–20.

- [ ] **Step 3: Commit**

```bash
git add footfall_migration.sql
git commit -m "feat: update footfall data to hours 10-20 with corrected median values"
```

---

## Task 3: Update Admin Footfall Modal (Hours 10–20)

**Files:**
- Modify: `Admin.html` (FF_SLOTS array around line 640)

- [ ] **Step 1: Replace FF_SLOTS array**

Find `const FF_SLOTS=[` (around line 640) and replace the entire array:

```js
const FF_SLOTS=[
  {hour:10,label:'10 AM'},{hour:11,label:'11 AM'},{hour:12,label:'12 PM'},
  {hour:13,label:'1 PM'},{hour:14,label:'2 PM'},{hour:15,label:'3 PM'},
  {hour:16,label:'4 PM'},{hour:17,label:'5 PM'},{hour:18,label:'6 PM'},
  {hour:19,label:'7 PM'},{hour:20,label:'8 PM'}
];
```

- [ ] **Step 2: Verify**

Open `Admin.html` → Stores → click "Set Footfall" on any store. Confirm the modal shows 11 inputs from "10 AM" to "8 PM" (no "9 AM", last is "8 PM"). Check both Weekday and Weekend tabs.

- [ ] **Step 3: Commit**

```bash
git add Admin.html
git commit -m "feat: update footfall modal to hours 10-20"
```

---

## Task 4: Public Holidays — Supabase Table + Admin UI

**Files:**
- Modify: `schema.sql` (add table definition)
- Modify: `Admin.html` (nav item + renderHolidays function + nav() dispatch)

### Step 4a — Create Supabase table

- [ ] **Step 1: Run SQL in Supabase**

Go to https://supabase.com/dashboard/project/dzilftvisjgckmefpzxk/sql/new and run:

```sql
CREATE TABLE IF NOT EXISTS public_holidays (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

- [ ] **Step 2: Add to schema.sql**

Append to the bottom of `schema.sql`:

```sql
-- Public holidays: dates that use weekend footfall for slot capacity
create table if not exists public_holidays (
  id uuid default gen_random_uuid() primary key,
  date text not null unique,  -- 'YYYY-MM-DD'
  name text not null,
  created_at timestamptz default now()
);
```

### Step 4b — Admin nav item

- [ ] **Step 3: Add "Holidays" nav item in Admin.html**

Find the nav rail HTML (around line 162–169). After the Stores button and before the Tools section, add:

```html
      <button class="nav-item" data-view="holidays" onclick="nav('holidays')">
        <span class="ico">&#127965;</span> Holidays
      </button>
```

So the Management section looks like:
```html
      <div class="rail-section">Management</div>
      <button class="nav-item" data-view="users" onclick="nav('users')">
        <span class="ico">&#128100;</span> Users
        <span class="nav-badge" id="userCount">—</span>
      </button>
      <button class="nav-item" data-view="stores" onclick="nav('stores')">
        <span class="ico">&#127978;</span> Stores
        <span class="nav-badge" id="storeCount">—</span>
      </button>
      <button class="nav-item" data-view="holidays" onclick="nav('holidays')">
        <span class="ico">&#127965;</span> Holidays
      </button>
```

- [ ] **Step 4: Add `holidays` case to nav() dispatch**

Find `function nav(v)` (around line 337). Add the `holidays` case:

```js
function nav(v){
  VIEW=v;
  document.querySelectorAll('.nav-item').forEach(el=>{
    el.classList.toggle('active',el.dataset.view===v);
  });
  const main=document.getElementById('main');
  main.innerHTML='<div class="loading-row"><span class="spinner"></span></div>';
  if(v==='overview')renderOverview();
  else if(v==='users')renderUsers();
  else if(v==='stores')renderStores();
  else if(v==='holidays')renderHolidays();
  else if(v==='roleviewer')renderRoleViewer();
}
```

### Step 4c — renderHolidays() function

- [ ] **Step 5: Add renderHolidays() and supporting functions to Admin.html**

Add the following block after the footfall section (before the Role Viewer section comment):

```js
/* ---------- PUBLIC HOLIDAYS ---------- */
async function renderHolidays(){
  const main=document.getElementById('main');
  const rows=await sbGet('public_holidays?order=date.asc');
  const holidays=Array.isArray(rows)?rows:[];
  main.innerHTML=`
    <div class="page-head">
      <h1>Public Holidays</h1>
      <p class="sub">On these dates, slot capacity uses weekend footfall instead of weekday footfall.</p>
    </div>
    <div class="card" style="max-width:560px">
      <div class="card-head" style="padding:14px 16px;border-bottom:1px solid var(--line)">
        <h2>Add Holiday</h2>
      </div>
      <div style="padding:14px 16px;display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
        <div>
          <div style="font-size:11px;font-weight:800;color:var(--muted);margin-bottom:5px;text-transform:uppercase;letter-spacing:.4px">Date</div>
          <input id="hlDate" type="date" style="padding:8px 10px;border:2px solid var(--line);border-radius:9px;font-size:13.5px;color:var(--ink)"/>
        </div>
        <div style="flex:1;min-width:160px">
          <div style="font-size:11px;font-weight:800;color:var(--muted);margin-bottom:5px;text-transform:uppercase;letter-spacing:.4px">Holiday Name</div>
          <input id="hlName" type="text" placeholder="e.g. Republic Day" style="width:100%;padding:8px 10px;border:2px solid var(--line);border-radius:9px;font-size:13.5px;color:var(--ink)"/>
        </div>
        <button class="btn-primary" onclick="addHoliday()" style="height:38px">Add</button>
      </div>
      <div id="hlErr" style="display:none;margin:0 16px 10px;padding:8px 12px;background:var(--redbg);color:var(--red);border-radius:8px;font-size:12.5px;font-weight:600"></div>
    </div>
    <div class="card" style="max-width:560px;margin-top:14px">
      <div class="card-head" style="padding:14px 16px;border-bottom:1px solid var(--line)">
        <h2>All Holidays</h2>
      </div>
      <div id="hlList">${holidays.length?holidays.map(h=>holidayRow(h)).join(''):'<div class="empty"><div class="e-msg">No holidays added yet.</div></div>'}</div>
    </div>`;
}

function holidayRow(h){
  const d=new Date(h.date+'T00:00:00');
  const label=d.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line)">
    <div style="flex:1">
      <div style="font-size:13.5px;font-weight:800">${esc(h.name)}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">${label}</div>
    </div>
    <button class="btn-icon" onclick="deleteHoliday('${h.id}')" style="color:var(--red);border-color:var(--red)">Delete</button>
  </div>`;
}

async function addHoliday(){
  const date=document.getElementById('hlDate').value;
  const name=document.getElementById('hlName').value.trim();
  const err=document.getElementById('hlErr');
  err.style.display='none';
  if(!date){err.textContent='Select a date.';err.style.display='block';return;}
  if(!name){err.textContent='Enter a holiday name.';err.style.display='block';return;}
  try{
    await sbPost('public_holidays',{date,name});
    toast('Holiday added');
    renderHolidays();
  }catch(e){
    err.textContent='Failed to add — date may already exist.';err.style.display='block';
  }
}

async function deleteHoliday(id){
  if(!confirm('Delete this holiday?'))return;
  try{
    await sbDel('public_holidays',id);
    toast('Holiday deleted');
    renderHolidays();
  }catch(e){
    toast('Failed to delete',true);
  }
}
```

- [ ] **Step 6: Verify**

Open `Admin.html`. Confirm "Holidays" appears in the nav rail. Click it and confirm the Add Holiday form renders. Add a test holiday (pick any date, name "Test"). Confirm it appears in the list. Delete it. Confirm it disappears.

- [ ] **Step 7: Commit**

```bash
git add Admin.html schema.sql
git commit -m "feat: add public holidays management in Admin (Supabase table + nav view)"
```

---

## Task 5: Pre-Sales Dashboard — Slots, Count Display, Public Holidays

**Files:**
- Modify: `PreSales_Dashboard.html`

- [ ] **Step 1: Update SLOTS array (lines ~225–237)**

Replace the entire `SLOTS` constant:

```js
const SLOTS=[
  {hour:10,value:'10:00',label:'10 AM – 11 AM'},
  {hour:11,value:'11:00',label:'11 AM – 12 PM'},
  {hour:12,value:'12:00',label:'12 PM – 1 PM'},
  {hour:13,value:'13:00',label:'1 PM – 2 PM'},
  {hour:14,value:'14:00',label:'2 PM – 3 PM'},
  {hour:15,value:'15:00',label:'3 PM – 4 PM'},
  {hour:16,value:'16:00',label:'4 PM – 5 PM'},
  {hour:17,value:'17:00',label:'5 PM – 6 PM'},
  {hour:18,value:'18:00',label:'6 PM – 7 PM'},
  {hour:19,value:'19:00',label:'7 PM – 8 PM'},
  {hour:20,value:'20:00',label:'8 PM – 9 PM'},
];
```

- [ ] **Step 2: Update Schedule Visit modal time options**

Find the `<select id="fTime">` block in the modal HTML (around line 178–192). Replace all `<option>` entries:

```html
          <select id="fTime">
            <option value="">Select time…</option>
            <option value="10:00">10:00 AM</option>
            <option value="11:00">11:00 AM</option>
            <option value="12:00">12:00 PM</option>
            <option value="13:00">1:00 PM</option>
            <option value="14:00">2:00 PM</option>
            <option value="15:00">3:00 PM</option>
            <option value="16:00">4:00 PM</option>
            <option value="17:00">5:00 PM</option>
            <option value="18:00">6:00 PM</option>
            <option value="19:00">7:00 PM</option>
            <option value="20:00">8:00 PM</option>
          </select>
```

- [ ] **Step 3: Add holidaySet state variable and isWeekendOrHoliday helper**

After the existing state variables block (around line 240–247, after `let pollTm=null;`), add:

```js
let holidaySet=new Set();

function isWeekendOrHoliday(d){
  const dow=new Date(d+'T00:00:00').getDay();
  return dow===0||dow===6||holidaySet.has(d);
}
```

- [ ] **Step 4: Fetch public holidays on store load**

Find `async function loadStores()` (around line 294). At the top of this function, add the holiday fetch alongside the stores fetch:

```js
async function loadStores(){
  const [res,hlRes]=await Promise.all([
    sbGet('stores?select=id,name,bm_count,footfall_data&order=name.asc'),
    sbGet('public_holidays?select=date')
  ]);
  allStores=Array.isArray(res)?res:[];
  holidaySet=new Set(Array.isArray(hlRes)?hlRes.map(h=>h.date):[]);
  const sel=document.getElementById('storeSelect');
  if(!allStores.length){
    sel.innerHTML='<option value="">No stores set up yet — add them in Admin</option>';
    return;
  }
  sel.innerHTML='<option value="">Select store…</option>'+allStores.map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join('');
  populateFormStore();
}
```

- [ ] **Step 5: Replace isWeekend with isWeekendOrHoliday in renderSlots()**

Find `renderSlots()` (around line 358). Find the line:
```js
  const ffSet=isWeekend(selectedDay)?(ff.weekend||ff):(ff.weekday||ff);
```
Change it to:
```js
  const ffSet=isWeekendOrHoliday(selectedDay)?(ff.weekend||ff):(ff.weekday||ff);
```

- [ ] **Step 6: Update slot count display in renderSlots()**

In `renderSlots()`, find this line (around line 382):
```js
      '<div class="slot-count">'+scheduled+' visit'+(scheduled===1?'':'s')+'</div>'+
```
Replace with:
```js
      '<div class="slot-count">'+(scheduled+footfall)+' / '+bmCount+'</div>'+
```

- [ ] **Step 7: Verify**

Open `PreSales_Dashboard.html`. Select a store. Confirm:
- Slot grid shows 11 rows from "10 AM – 11 AM" to "8 PM – 9 PM"
- Each slot's right side shows "X / Y" format (e.g. "3 / 5") not "X visits"
- The "Schedule Visit" modal time picker starts at 10:00 AM and ends at 8:00 PM
- Add a public holiday via Admin, reload PreSales, select that date — the slot colors should shift (weekday date with holiday footfall = weekend values, which are higher → likely more orange/red slots)

- [ ] **Step 8: Commit**

```bash
git add PreSales_Dashboard.html
git commit -m "feat: update PreSales slots to 10-20, X/Y count display, public holiday footfall"
```

---

## Task 6: Kylas Sync — Vercel API Route

> ⚠️ **Prerequisite:** Kylas admin must enable "Lead Read" permission on API key `f3586066-8c20-4763-80c9-0622eff59917:20007` before this task can be tested. Build the infrastructure now; confirm field mapping once API access is granted.

**Files:**
- Create: `api/kylas-sync.js`
- Modify: `vercel.json`
- Modify: `PreSales_Dashboard.html`

### Step 6a — Vercel function

- [ ] **Step 1: Create `api/` directory and `api/kylas-sync.js`**

```js
// api/kylas-sync.js
// Fetches leads from Kylas, upserts into Supabase store_visits.
// Called by PreSales_Dashboard on load and every 60s poll.
// FIELD MAPPING: confirm field names against a real Kylas lead response
// once "Lead Read" permission is enabled on the API key.

const KYLAS_API = 'https://api.kylas.io/v1/leads';
const SB_URL = 'https://dzilftvisjgckmefpzxk.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;
const KYLAS_KEY = process.env.KYLAS_API_KEY;

// Map Kylas store label → Supabase store UUID.
// Populate once you fetch a real lead and see the store field value.
// Example: {'JP Nagar': 'uuid-here', 'Whitefield': 'uuid-here'}
const STORE_MAP = JSON.parse(process.env.KYLAS_STORE_MAP || '{}');

function mapLead(lead) {
  // ── FIELD NAMES: verify against real Kylas lead response ──
  // Common patterns: lead.firstName + lead.lastName, or lead.name
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.name || '';
  const phone = (lead.phoneNumber || lead.mobile || '').replace(/\D/g, '').slice(-10);

  // Custom fields come back as an array: lead.customFieldResponses
  // Each entry: { fieldName: 'Visit Date', value: '2026-06-25' }
  const cf = {};
  (lead.customFieldResponses || []).forEach(f => { cf[f.fieldName] = f.value; });

  const visitDate = cf['Visit Date'] || cf['visit_date'] || null;
  const visitTime = cf['Time Slot'] || cf['visit_time'] || null;
  const storeLabel = cf['Store'] || cf['store'] || null;
  const storeId = storeLabel ? (STORE_MAP[storeLabel] || null) : null;

  return {
    kylas_id: String(lead.id),
    customer_name: name,
    phone,
    visit_date: visitDate,
    visit_time: visitTime ? visitTime.replace(/^(\d):/, '0$1:') : null,
    store_id: storeId,
    visit_status: 'scheduled',
    updated_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!KYLAS_KEY) {
    res.status(500).json({ error: 'KYLAS_API_KEY env var not set' });
    return;
  }

  // Fetch leads from Kylas
  let leads;
  try {
    const r = await fetch(KYLAS_API + '?page-size=100', {
      headers: { 'api-key': KYLAS_KEY, 'Accept': 'application/json' },
    });
    if (!r.ok) {
      const body = await r.text();
      res.status(502).json({ error: 'Kylas API error', status: r.status, body });
      return;
    }
    const data = await r.json();
    // Kylas returns { data: [...] } or just an array — handle both
    leads = Array.isArray(data) ? data : (data.data || []);
  } catch (e) {
    res.status(502).json({ error: 'Failed to reach Kylas', detail: e.message });
    return;
  }

  // Map and upsert to Supabase
  const mapped = leads.map(mapLead).filter(l => l.visit_date && l.store_id);

  if (mapped.length) {
    const upsertRes = await fetch(SB_URL + '/rest/v1/store_visits', {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(mapped),
    });
    if (!upsertRes.ok) {
      const err = await upsertRes.json().catch(() => ({}));
      res.status(500).json({ error: 'Supabase upsert failed', detail: err });
      return;
    }
  }

  res.status(200).json({ synced: mapped.length, skipped: leads.length - mapped.length });
}
```

### Step 6b — Environment variables

- [ ] **Step 2: Set environment variables in Vercel**

In the Vercel dashboard for project `material-depot1/visit-schedule-site` → Settings → Environment Variables, add:

| Name | Value |
|---|---|
| `KYLAS_API_KEY` | `f3586066-8c20-4763-80c9-0622eff59917:20007` |
| `SUPABASE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aWxmdHZpc2pnY2ttZWZwenhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2Njg0MTksImV4cCI6MjA5NzI0NDQxOX0.O-ZzJBs7TYEmXvVDf_7y70-skwSh7Ve4DuM-kBfXjP0` |
| `KYLAS_STORE_MAP` | `{}` ← fill in once you have real store UUIDs and Kylas store labels |

### Step 6c — Update vercel.json for CORS on /api

- [ ] **Step 3: Add CORS header to vercel.json**

```json
{
  "headers": [
    {
      "source": "/(.*\\.html)",
      "headers": [{"key": "Cache-Control", "value": "no-cache, no-store, must-revalidate"}]
    },
    {
      "source": "/api/(.*)",
      "headers": [{"key": "Access-Control-Allow-Origin", "value": "*"}]
    }
  ]
}
```

### Step 6d — Wire into Pre-Sales dashboard

- [ ] **Step 4: Add Kylas sync call to PreSales_Dashboard.html**

In `loadData()` (around line 328), after `if(!selectedStore)return;` and before fetching `store_visits`, add a fire-and-forget sync call:

```js
async function loadData(){
  if(!selectedStore)return;
  // Fire Kylas sync in background — don't await, don't block render
  fetch('/api/kylas-sync').catch(()=>{});

  document.getElementById('contentArea').innerHTML=`
    // ... rest of existing HTML template unchanged ...
```

This means every time the Pre-Sales dashboard polls (every 60s), it also pings the sync function. The sync runs server-side and upserts to Supabase. The subsequent `sbGet('store_visits?...')` fetch picks up the freshly synced data.

- [ ] **Step 5: Update Cancel button to only show for manual visits**

In `renderVisitsList()` (around line 414), the cancel button currently shows for all `scheduled` visits. Change it to only show when `kylas_id` is null:

```js
(v.visit_status==='scheduled'&&!v.kylas_id?'<button class="btn-del" onclick="deleteVisit(\''+v.id+'\',\''+esc(v.customer_name)+'\')">Cancel visit</button>':'')
```

- [ ] **Step 6: Commit the scaffolding**

```bash
git add api/kylas-sync.js vercel.json PreSales_Dashboard.html
git commit -m "feat: scaffold Kylas sync Vercel function and wire into PreSales poll"
```

### Step 6e — Post-API-access: confirm field mapping

- [ ] **Step 7: Once Kylas API permission is enabled, fetch a sample lead**

```bash
curl -s "https://api.kylas.io/v1/leads?page-size=1" \
  -H "api-key: f3586066-8c20-4763-80c9-0622eff59917:20007" \
  -H "Accept: application/json" | python3 -m json.tool
```

Inspect the response to confirm:
- The field containing the customer name (`firstName`/`lastName` or `name`)
- The phone field name (`phoneNumber`, `mobile`, etc.)
- How custom fields are returned (key names for "Visit Date", "Time Slot", "Store")
- What value the "Store" field contains (store name string or an ID)

- [ ] **Step 8: Update field mapping in api/kylas-sync.js**

Update `mapLead()` with the confirmed field names. Update `KYLAS_STORE_MAP` env var with the mapping from Kylas store values → Supabase store UUIDs:
```
# Get Supabase store IDs:
curl "https://dzilftvisjgckmefpzxk.supabase.co/rest/v1/stores?select=id,name" \
  -H "apikey: eyJhbGci..."
```

Then update `KYLAS_STORE_MAP` in Vercel env to something like:
```json
{"JP Nagar": "uuid-1", "Whitefield": "uuid-2", "Yelahanka": "uuid-3"}
```

- [ ] **Step 9: Test end-to-end**

Open `PreSales_Dashboard.html`, select a store, wait 5 seconds. Check Supabase `store_visits` table to confirm Kylas leads have appeared with `kylas_id` populated. Confirm they show up in the Visits panel on the right.

- [ ] **Step 10: Commit final field mapping**

```bash
git add api/kylas-sync.js
git commit -m "feat: confirm Kylas field mapping and complete sync function"
```

---

## Task 7: Deploy

- [ ] **Step 1: Push to GitHub and deploy to Vercel**

```bash
cd /Users/dhruv/Projects/visit-schedule-site
git push origin master
vercel --prod --yes
```

- [ ] **Step 2: Smoke test live site**

- Open https://visit-schedule-site.vercel.app/PreSales_Dashboard.html
- Confirm slot grid shows 10 AM–8 PM range
- Confirm slot count shows "X / Y" format
- Open https://visit-schedule-site.vercel.app/Admin.html → Holidays → add a holiday for today → go back to PreSales → select that date → confirm slot colors shift (higher load due to weekend footfall)
- Try logging in with a `store_bm` account → confirm "Access not available" message

- [ ] **Step 3: Run footfall migration in Supabase**

If not already done in Task 2 Step 2, run `footfall_migration.sql` in the Supabase SQL editor.

---

## Self-Review

**Spec coverage:**
- [x] Slot timings 10 AM–9 PM → Task 5 Steps 1–2
- [x] Slot count X/Y display → Task 5 Step 6
- [x] No Week at a Glance → not added (never existed in code)
- [x] Cancel only for manual visits → Task 6 Step 5
- [x] Kylas sync via Vercel function → Task 6
- [x] BM Dashboard removed → Task 1
- [x] store_bm login blocked → Task 1 Step 3
- [x] Footfall data hours 10–20 → Task 2
- [x] Admin footfall modal hours 10–20 → Task 3
- [x] Public holidays table → Task 4a
- [x] Public holidays Admin UI → Task 4b–4c
- [x] isWeekendOrHoliday in PreSales → Task 5 Steps 3–5
- [x] Deploy → Task 7

**Placeholder scan:** No TBD/TODO in functional code. Field mapping in `mapLead()` includes inline comments explaining what to confirm — these are intentional documentation, not placeholders. `KYLAS_STORE_MAP` defaults to `{}` and is filled post-API-access.

**Type consistency:** `holidaySet` (Set) defined in Task 5 Step 3, used in Task 5 Step 5. `mapLead()` return shape matches `store_visits` columns throughout Task 6.
