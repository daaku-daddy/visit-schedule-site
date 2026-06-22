// api/kylas-webhook.js
// Receives Kylas webhook POSTs for Lead Created / Lead Updated events.
// Configure in Kylas: Settings → Webhooks → Add Webhook
//   URL: https://visit-schedule-site.vercel.app/api/kylas-webhook
//   Events: Lead Created, Lead Updated
//   Pipeline: 31627 (MD Lead pipeline)
//
// Confirmed field structure from live lead (id: 50471878):
//   customFieldValues.cfBranch        → numeric option ID (e.g. 2647630)
//   customFieldValues.cfVisitScheduled → ISO datetime "2026-06-21T14:00:00.000Z"
//   customFieldValues.cfCategoriesOfInterest → [optionId, ...]
//   customFieldValues.cfDcOwner        → "Harshit Naik" (DC team member name)
//   customFieldValues.cfPsOwner        → "Aishwarya Nagaraj" (PS team member name)
//   phoneNumbers[0].value              → "9747636510"
//   metaData.idNameStore.cfBranch      → { "2647630": "WHITEFIELD" }
//   metaData.idNameStore.cfCategoriesOfInterest → { "2689623": "Tiles" }
//   firstName: null (customer name often absent)
//   lastName: "+919747636510" (phone stored here by Kylas)

const SB_URL = 'https://dzilftvisjgckmefpzxk.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;
// KYLAS_STORE_MAP: {"JP Nagar":"uuid","Whitefield":"uuid","Yelahanka":"uuid","Gachibowli":"uuid"}
// Branch name matching is case-insensitive (Kylas returns "WHITEFIELD", map has "Whitefield")
const STORE_MAP = JSON.parse(process.env.KYLAS_STORE_MAP || '{}');

function parseBool(val) {
  if (!val) return false;
  return ['true', 'yes', '1', 'done', 'called'].includes(String(val).toLowerCase().trim());
}

function storeIdFromBranch(branchOptionId, branchMeta) {
  if (!branchOptionId) return null;
  const branchName = branchMeta[String(branchOptionId)];
  if (!branchName) return null;
  // Case-insensitive match ("WHITEFIELD" → "Whitefield" entry in map)
  const entry = Object.entries(STORE_MAP).find(
    ([k]) => k.toLowerCase() === branchName.toLowerCase()
  );
  return entry ? entry[1] : null;
}

function mapLead(lead) {
  const cfv = lead.customFieldValues || {};
  const meta = (lead.metaData || {}).idNameStore || {};

  // Customer name — firstName is usually null; lastName often has the phone number.
  // Filter out any value that looks like a phone number.
  const rawName = [lead.firstName, lead.lastName]
    .filter(s => s && !/^\+?\d[\d\s\-]{6,}$/.test(s.trim()))
    .join(' ').trim() || null;

  // Phone — primary from phoneNumbers array
  const phones = Array.isArray(lead.phoneNumbers) ? lead.phoneNumbers : [];
  const primary = phones.find(p => p.primary) || phones[0];
  const phone = (primary?.value || '').replace(/\D/g, '').slice(-10) || null;

  // Visit date + time from cfVisitScheduled ISO datetime
  let visitDate = null, visitTime = null;
  const vs = cfv.cfVisitScheduled;
  if (vs) {
    const dt = new Date(vs);
    if (!isNaN(dt)) {
      visitDate = vs.slice(0, 10); // YYYY-MM-DD
      // Extract HH:MM directly from ISO string (Kylas stores as local time treated as UTC)
      visitTime = String(dt.getUTCHours()).padStart(2, '0') + ':' +
                  String(dt.getUTCMinutes()).padStart(2, '0');
    }
  }

  // Store UUID via cfBranch option ID → metaData name → STORE_MAP
  const storeId = storeIdFromBranch(cfv.cfBranch, meta.cfBranch || {});

  // Categories: resolve option ID array via metaData
  const catIds = Array.isArray(cfv.cfCategoriesOfInterest) ? cfv.cfCategoriesOfInterest : [];
  const catMeta = meta.cfCategoriesOfInterest || {};
  const categories = catIds.map(id => catMeta[String(id)]).filter(Boolean);

  // Notes/comments — Kylas may add notes as activities; check common field names
  const presalesNotes = cfv.cfNotes || cfv.cfAdditionalComments ||
                        cfv.cfRemarks || cfv.cfComments || null;

  // Whether pre-sales called client about partial/unavailable products
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
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!SB_KEY) { res.status(500).json({ error: 'SUPABASE_KEY not set' }); return; }

  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  // Kylas webhook shapes: { event, data: { lead } } or { event, lead } or just the lead object
  const lead = payload?.data?.lead || payload?.lead || payload?.data || payload;

  if (!lead?.id) {
    res.status(200).json({ status: 'ignored', reason: 'no lead id' });
    return;
  }

  // Only process leads from pipeline 31627 (MD Lead pipeline)
  const pipelineId = lead.pipeline?.id || lead.pipelineId;
  if (pipelineId && pipelineId !== 31627) {
    res.status(200).json({ status: 'ignored', reason: 'wrong pipeline', pipeline: pipelineId });
    return;
  }

  const mapped = mapLead(lead);

  if (!mapped.visit_date) {
    res.status(200).json({ status: 'ignored', reason: 'no cfVisitScheduled', kylas_id: mapped.kylas_id });
    return;
  }
  if (!mapped.store_id) {
    res.status(200).json({ status: 'ignored', reason: 'cfBranch not in STORE_MAP', kylas_id: mapped.kylas_id });
    return;
  }

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

  res.status(200).json({
    status: 'ok',
    kylas_id: mapped.kylas_id,
    visit_date: mapped.visit_date,
    visit_time: mapped.visit_time,
    store_id: mapped.store_id,
    categories: mapped.categories,
  });
}
