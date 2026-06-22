// api/kylas-sync.js
// Fetches leads from Kylas CRM, upserts into Supabase store_visits.
// Triggered fire-and-forget by PreSales_Dashboard every 60s.
// Safe fields only are written on conflict — SM/Receptionist operational fields are never overwritten.

const KYLAS_API = 'https://api.kylas.io/v1/leads';
const SB_URL = 'https://dzilftvisjgckmefpzxk.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;
const KYLAS_KEY = process.env.KYLAS_API_KEY;

// Map Kylas store label → Supabase store UUID.
// Set KYLAS_STORE_MAP env var in Vercel: '{"JP Nagar":"uuid","Whitefield":"uuid","Yelahanka":"uuid"}'
const STORE_MAP = JSON.parse(process.env.KYLAS_STORE_MAP || '{}');

// Extract a custom field value by trying multiple label variants (case-insensitive)
function cf(fields, ...labels) {
  for (const label of labels) {
    const f = fields.find(x => {
      const name = (x.fieldName || x.label || x.name || x.field_name || '').toLowerCase();
      return name === label.toLowerCase();
    });
    if (f && f.value != null && f.value !== '') return String(f.value).trim();
  }
  return null;
}

function parseBool(val) {
  if (!val) return false;
  return ['true', 'yes', '1', 'done', 'called'].includes(String(val).toLowerCase().trim());
}

// Confirmed field structure from live lead (id: 50471878):
//   customFieldValues.cfBranch: numeric option ID → metaData.idNameStore.cfBranch resolves name
//   customFieldValues.cfVisitScheduled: ISO datetime "2026-06-21T14:00:00.000Z"
//   customFieldValues.cfCategoriesOfInterest: [optionId] → metaData.idNameStore resolves names
//   phoneNumbers[0].value: "9747636510"
//   firstName: null (often absent), lastName: phone number string

function storeIdFromBranch(branchOptionId, branchMeta) {
  if (!branchOptionId) return null;
  const branchName = branchMeta[String(branchOptionId)];
  if (!branchName) return null;
  const entry = Object.entries(STORE_MAP).find(
    ([k]) => k.toLowerCase() === branchName.toLowerCase()
  );
  return entry ? entry[1] : null;
}

function mapLead(lead) {
  const cfv = lead.customFieldValues || {};
  const meta = (lead.metaData || {}).idNameStore || {};

  // Name — filter out phone-number-like lastName values
  const rawName = [lead.firstName, lead.lastName]
    .filter(s => s && !/^\+?\d[\d\s\-]{6,}$/.test(s.trim()))
    .join(' ').trim() || null;

  // Phone from phoneNumbers array
  const phones = Array.isArray(lead.phoneNumbers) ? lead.phoneNumbers : [];
  const primary = phones.find(p => p.primary) || phones[0];
  const phone = (primary?.value || '').replace(/\D/g, '').slice(-10) || null;

  // Visit date + time from cfVisitScheduled ISO datetime
  let visitDate = null, visitTime = null;
  const vs = cfv.cfVisitScheduled;
  if (vs) {
    const dt = new Date(vs);
    if (!isNaN(dt)) {
      visitDate = vs.slice(0, 10);
      visitTime = String(dt.getUTCHours()).padStart(2, '0') + ':' +
                  String(dt.getUTCMinutes()).padStart(2, '0');
    }
  }

  // Store via cfBranch option ID → metaData name → STORE_MAP (case-insensitive)
  const storeId = storeIdFromBranch(cfv.cfBranch, meta.cfBranch || {});

  // Categories: resolve option IDs via metaData
  const catIds = Array.isArray(cfv.cfCategoriesOfInterest) ? cfv.cfCategoriesOfInterest : [];
  const catMeta = meta.cfCategoriesOfInterest || {};
  const categories = catIds.map(id => catMeta[String(id)]).filter(Boolean);

  const presalesNotes = cfv.cfNotes || cfv.cfAdditionalComments || cfv.cfRemarks || null;
  const presalesNotified = parseBool(
    cfv.cfPreSalesCalled || cfv.cfClientInformed || cfv.cfCalledClient || null
  );

  return {
    kylas_id: String(lead.id),
    customer_name: rawName || phone || 'Unknown',
    phone,
    visit_date: visitDate,
    visit_time: visitTime,
    store_id: storeId,
    categories,
    presales_notes: presalesNotes,
    presales_notified: presalesNotified,
    updated_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!KYLAS_KEY) {
    res.status(500).json({ error: 'KYLAS_API_KEY env var not set' });
    return;
  }
  if (!SB_KEY) {
    res.status(500).json({ error: 'SUPABASE_KEY env var not set' });
    return;
  }

  // Fetch up to 2 pages of leads (200 total) from Kylas
  let leads = [];
  try {
    for (let page = 1; page <= 2; page++) {
      const r = await fetch(`${KYLAS_API}?page-size=100&page=${page}`, {
        headers: {
          'api-key': KYLAS_KEY,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });
      if (!r.ok) {
        const body = await r.text();
        res.status(502).json({ error: 'Kylas API error', status: r.status, body });
        return;
      }
      const data = await r.json();
      // Handle multiple Kylas response shapes
      const batch = Array.isArray(data) ? data
        : (data.data || data.list || data.leads || data.response?.data || []);
      leads = leads.concat(batch);
      if (batch.length < 100) break; // reached last page
    }
  } catch (e) {
    res.status(502).json({ error: 'Failed to reach Kylas', detail: e.message });
    return;
  }

  // Map leads, skip any without both visit_date and store_id
  const mapped = leads.map(mapLead).filter(l => l.visit_date && l.store_id);

  if (mapped.length) {
    const upsertRes = await fetch(SB_URL + '/rest/v1/store_visits?on_conflict=kylas_id', {
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

  res.status(200).json({
    synced: mapped.length,
    skipped: leads.length - mapped.length,
    total_fetched: leads.length,
  });
}
