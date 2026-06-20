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
