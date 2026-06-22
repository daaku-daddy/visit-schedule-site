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

function mapLead(lead) {
  // Name: try firstName+lastName, then full name field
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim()
    || lead.name || lead.customerName || lead.fullName || '';

  // Phone: clean to last 10 digits
  const phone = (lead.phoneNumber || lead.mobile || lead.phone || lead.contactNumber || '')
    .replace(/\D/g, '').slice(-10);

  // Custom fields array (Kylas returns as customFieldResponses or customFields)
  const fields = lead.customFieldResponses || lead.customFields || lead.fields || [];

  // Visit date — try common field name variants
  const visitDate = cf(fields,
    'Visit Date', 'visit_date', 'Appointment Date', 'Date of Visit',
    'Scheduled Date', 'Visit Scheduled Date'
  );

  // Visit time — normalise to HH:MM 24h
  const rawTime = cf(fields,
    'Time Slot', 'visit_time', 'Appointment Time', 'Visit Time',
    'Scheduled Time', 'Time of Visit'
  );
  const visitTime = rawTime
    ? rawTime.replace(/^(\d):/, '0$1:').substring(0, 5)
    : null;

  // Store → lookup UUID from env var map
  const storeLabel = cf(fields,
    'Store', 'store', 'Branch', 'Store Name', 'Store Location', 'Location'
  );
  const storeId = storeLabel ? (STORE_MAP[storeLabel] || null) : null;

  // Product categories — may be comma-separated string or already an array
  const catRaw = cf(fields,
    'Product Categories', 'Categories', 'categories', 'Products Interested',
    'Products', 'Interested In', 'Category'
  );
  const categories = catRaw
    ? catRaw.split(/[,;]/).map(s => s.trim()).filter(Boolean)
    : [];

  // Additional comments / pre-sales notes
  const presalesNotes = cf(fields,
    'Additional Comments', 'Notes', 'Comments', 'Presales Notes',
    'Remarks', 'Special Requirements', 'Additional Notes'
  ) || null;

  // Whether pre-sales called client about partial/unavailable status
  const notifiedRaw = cf(fields,
    'Pre-Sales Called', 'Client Informed', 'presales_notified',
    'Called Client', 'Client Called', 'Follow Up Done', 'Customer Notified'
  );
  const presalesNotified = parseBool(notifiedRaw);

  // Only overwrite safe fields on upsert conflict.
  // visit_status, arrival_time, assigned_bm_id, bm_comments,
  // availability_status, availability_notes are SM/Receptionist owned — never included here.
  return {
    kylas_id: String(lead.id),
    customer_name: name,
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
