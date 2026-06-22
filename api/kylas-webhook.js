// api/kylas-webhook.js
// Receives Kylas webhook events for lead created/updated in pipeline 31627.
// Configure in Kylas: Settings → Webhooks → Add Webhook
//   URL: https://visit-schedule-site.vercel.app/api/kylas-webhook
//   Events: Lead Created, Lead Updated
//   Pipeline filter: 31627 (DC Total Visits)

const SB_URL = 'https://dzilftvisjgckmefpzxk.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;
const STORE_MAP = JSON.parse(process.env.KYLAS_STORE_MAP || '{}');

// Extract a custom field value — tries multiple label/key variants
function cf(values, ...labels) {
  if (!values || typeof values !== 'object') return null;
  // customFieldValues is a flat object: { cfVisitScheduled: '...', cfDcOwner: '...', ... }
  for (const label of labels) {
    if (values[label] != null && values[label] !== '') return String(values[label]).trim();
    // Also try camelCase variant
    const key = label.replace(/[^a-zA-Z0-9]/g, '');
    if (values[key] != null && values[key] !== '') return String(values[key]).trim();
  }
  return null;
}

function parseBool(val) {
  if (!val) return false;
  return ['true', 'yes', '1', 'done', 'called'].includes(String(val).toLowerCase().trim());
}

function mapLead(lead) {
  // Name from firstName + lastName or title
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim()
    || lead.name || lead.title || '';

  // Phone from phoneNumbers array or direct field
  const phones = Array.isArray(lead.phoneNumbers) ? lead.phoneNumbers : [];
  const primaryPhone = phones.find(p => p.primary) || phones[0];
  const phone = (primaryPhone?.value || lead.phoneNumber || lead.mobile || '')
    .replace(/\D/g, '').slice(-10);

  // Custom fields — Kylas sends as customFieldValues flat object
  const cfv = lead.customFieldValues || {};

  // Visit date/time
  const visitScheduled = cf(cfv,
    'cfVisitScheduled', 'cfVisitScheduledAt', 'Visit Scheduled',
    'cfVisitDate', 'Visit Date', 'visit_date'
  );
  let visitDate = null, visitTime = null;
  if (visitScheduled) {
    // May be ISO datetime "2026-06-25T10:00:00.000Z" or date "2026-06-25" or "10:00"
    if (visitScheduled.includes('T')) {
      const dt = new Date(visitScheduled);
      visitDate = dt.toISOString().slice(0, 10);
      const h = String(dt.getUTCHours()).padStart(2, '0');
      const m = String(dt.getUTCMinutes()).padStart(2, '0');
      visitTime = `${h}:${m}`;
    } else if (visitScheduled.match(/^\d{4}-\d{2}-\d{2}$/)) {
      visitDate = visitScheduled;
    } else {
      visitDate = visitScheduled;
    }
  }

  // Separate time field if present
  const timeField = cf(cfv, 'cfVisitTime', 'cfTimeSlot', 'Time Slot', 'visit_time');
  if (timeField && !visitTime) {
    visitTime = timeField.replace(/^(\d):/, '0$1:').substring(0, 5);
  }

  // Store — try cfStore, cfBranch (option ID), or store label
  const storeLabel = cf(cfv, 'cfStore', 'cfBranch', 'Store', 'Branch', 'store', 'branch');
  const storeId = storeLabel ? (STORE_MAP[storeLabel] || null) : null;

  // Categories
  const catRaw = cf(cfv,
    'cfProductCategories', 'cfCategories', 'Product Categories',
    'Categories', 'cfProductsInterested', 'Products Interested'
  );
  const categories = catRaw
    ? catRaw.split(/[,;]/).map(s => s.trim()).filter(Boolean)
    : [];

  // Pre-sales notes / additional comments
  const presalesNotes = cf(cfv,
    'cfAdditionalComments', 'cfNotes', 'Additional Comments',
    'Notes', 'cfRemarks', 'Remarks', 'cfDescription'
  ) || lead.description || null;

  // Whether pre-sales called the client about partial/unavailable stock
  const notifiedRaw = cf(cfv,
    'cfPreSalesCalled', 'cfClientInformed', 'Pre-Sales Called',
    'Client Informed', 'cfCalledClient', 'cfCustomerNotified'
  );

  return {
    kylas_id: String(lead.id),
    customer_name: name || null,
    phone: phone || null,
    visit_date: visitDate,
    visit_time: visitTime,
    store_id: storeId,
    categories,
    presales_notes: presalesNotes,
    presales_notified: parseBool(notifiedRaw),
    updated_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  // Allow CORS preflight
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Only accept POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!SB_KEY) {
    res.status(500).json({ error: 'SUPABASE_KEY not set' });
    return;
  }

  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  // Kylas webhook payload: { event: 'LEAD_CREATED'|'LEAD_UPDATED', data: { lead: {...} } }
  // or sometimes: { event: '...', lead: {...} }
  const lead = payload?.data?.lead || payload?.data || payload?.lead || payload;

  if (!lead?.id) {
    // Not a lead event we can process — acknowledge and ignore
    res.status(200).json({ status: 'ignored', reason: 'no lead id' });
    return;
  }

  const mapped = mapLead(lead);

  // Skip if no visit date (not a visit scheduling lead)
  if (!mapped.visit_date) {
    res.status(200).json({ status: 'ignored', reason: 'no visit_date', kylas_id: mapped.kylas_id });
    return;
  }

  // Skip if no store mapping
  if (!mapped.store_id) {
    res.status(200).json({ status: 'ignored', reason: 'store not mapped', kylas_id: mapped.kylas_id });
    return;
  }

  // Upsert to Supabase on kylas_id conflict
  const upsertRes = await fetch(SB_URL + '/rest/v1/store_visits?on_conflict=kylas_id', {
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([mapped]),
  });

  if (!upsertRes.ok) {
    const err = await upsertRes.json().catch(() => ({}));
    res.status(500).json({ error: 'Supabase upsert failed', detail: err });
    return;
  }

  res.status(200).json({ status: 'ok', kylas_id: mapped.kylas_id, visit_date: mapped.visit_date });
}
