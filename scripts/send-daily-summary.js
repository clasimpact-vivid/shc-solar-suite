/**
 * SHC Solar Suite — Rezumat zilnic (end-of-day), doar pentru Chirilă / Nicoraș.
 * Rulează prin GitHub Actions (.github/workflows/daily-summary.yml) la 18:00 România.
 * Trimite intreaga activitate a zilei, indiferent de preferintele notif ale userilor (mereu full).
 */
const FIREBASE_BASE = 'https://solarcrm-ba919-default-rtdb.firebaseio.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SHC Solar Suite <office@shc-group.ro>';
const FULL_ACCESS_IDS = ['u_chirila', 'u_nicoras'];

if (!RESEND_API_KEY) { console.error('Lipsește RESEND_API_KEY.'); process.exit(1); }

async function fetchJson(path) {
  const res = await fetch(`${FIREBASE_BASE}/${path}.json`);
  if (!res.ok) throw new Error(`Firebase fetch failed for ${path}: ${res.status}`);
  return (await res.json()) || {};
}
function toArray(obj) { if (!obj) return []; return Array.isArray(obj) ? obj.filter(Boolean) : Object.values(obj).filter(Boolean); }
function fmtTime(ts) { return new Date(ts).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }); }
function esc(s){ return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

async function main() {
  const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' });
  const dayStart = new Date(todayISO + 'T00:00:00+03:00').getTime();
  const inDay = ts => ts >= dayStart;

  const [crmData, planningData, visitsData, pontajData] = await Promise.all([
    fetchJson('solarcrm_v2'), fetchJson('shc_planning'), fetchJson('shc_visits'), fetchJson('shc_pontaj'),
  ]);
  const cfg = crmData.config || {};
  const users = toArray(cfg.users);
  const projects = toArray(crmData.projects);
  const offers = toArray(crmData.oferte_calculator).filter(o => o.timestamp && inDay(o.timestamp));
  const planningProjects = toArray(planningData.projects);
  const visits = toArray(visitsData.visits).filter(v => v.createdAt && inDay(v.createdAt));
  const pontajRecords = toArray(pontajData.records).filter(r => r.date === todayISO);

  let body = '';

  const crmLog = [];
  projects.forEach(p => {
    toArray(p.auditLog).filter(e => e.timestamp && inDay(e.timestamp)).forEach(e => {
      crmLog.push({ client: p.client || 'Client', action: e.action || 'actualizare', reason: e.reason || '', by: e.user || '', time: e.timestamp });
    });
  });
  crmLog.sort((a, b) => b.time - a.time);
  if (crmLog.length) body += `<h3 style="color:#f59e0b;margin:18px 0 8px;">📋 SolarCRM — activitate (${crmLog.length})</h3><ul style="margin:0;padding-left:20px;">${crmLog.map(a => `<li><strong>${esc(a.client)}</strong> — ${esc(a.action)}${a.reason ? ' (' + esc(a.reason) + ')' : ''} <span style="color:#94a3b8">· ${a.by ? esc(a.by) + ' · ' : ''}${fmtTime(a.time)}</span></li>`).join('')}</ul>`;

  const overdue = [], stale = [];
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  projects.forEach(p => {
    if (!['Lead', 'Ofertă', 'Contract'].includes(p.status)) return;
    if (p.nextFollowUp) {
      const fu = new Date(p.nextFollowUp + 'T00:00:00');
      if (fu < today0) overdue.push({ client: p.client || 'Client', date: p.nextFollowUp, resp: p.responsabil || '—' });
    } else {
      const base = p.fuLastContactAt ? p.fuLastContactAt.slice(0, 10) : (p.date_inserted || p.date_start);
      if (base) { const days = Math.round((today0 - new Date(base + 'T00:00:00')) / 86400000); if (days >= 10) stale.push({ client: p.client || 'Client', days, resp: p.responsabil || '—' }); }
    }
  });
  if (overdue.length || stale.length) {
    body += `<h3 style="color:#f59e0b;margin:18px 0 8px;">⏰ Follow-up necesar</h3>`;
    if (overdue.length) body += `<p style="margin:4px 0;color:#dc2626;font-weight:600;">Restant:</p><ul style="margin:0 0 10px;padding-left:20px;">${overdue.map(o => `<li><strong>${esc(o.client)}</strong> — programat ${o.date} <span style="color:#94a3b8">· ${esc(o.resp)}</span></li>`).join('')}</ul>`;
    if (stale.length) body += `<p style="margin:4px 0;color:#d97706;font-weight:600;">Fără contact nou 10+ zile:</p><ul style="margin:0;padding-left:20px;">${stale.map(s => `<li><strong>${esc(s.client)}</strong> — ${s.days} zile <span style="color:#94a3b8">· ${esc(s.resp)}</span></li>`).join('')}</ul>`;
  }

  if (offers.length) body += `<h3 style="color:#f59e0b;margin:18px 0 8px;">☀️ Oferte generate (Calculator PV-BESS) (${offers.length})</h3><ul style="margin:0;padding-left:20px;">${offers.map(o => `<li><strong>${esc(o.client || o.numeClient || 'Client')}</strong> ${o.kwp ? '— ' + o.kwp + ' kWp' : ''} <span style="color:#94a3b8">· ${esc(o.user || o.creatDe || '')} · ${fmtTime(o.timestamp)}</span></li>`).join('')}</ul>`;

  const late = [], upcoming = [];
  planningProjects.forEach(p => { toArray(p.stages).forEach(s => { if (s.status === 'intarziat') late.push({ project: p.name, stage: s.type }); if (s.startDate === todayISO) upcoming.push({ project: p.name, stage: s.type }); }); });
  if (late.length || upcoming.length) {
    body += `<h3 style="color:#f59e0b;margin:18px 0 8px;">📅 Planificare Șantier</h3>`;
    if (late.length) body += `<p style="margin:4px 0;color:#dc2626;font-weight:600;">⚠ ${late.length} etape întârziate:</p><ul style="margin:0 0 10px;padding-left:20px;">${late.map(l => `<li>${esc(l.project)} — ${esc(l.stage)}</li>`).join('')}</ul>`;
    if (upcoming.length) body += `<p style="margin:4px 0;color:#d97706;font-weight:600;">⏰ Au început azi:</p><ul style="margin:0;padding-left:20px;">${upcoming.map(u => `<li>${esc(u.project)} — ${esc(u.stage)}</li>`).join('')}</ul>`;
  }

  if (visits.length) body += `<h3 style="color:#f59e0b;margin:18px 0 8px;">📷 Vizită Șantier — adăugate (${visits.length})</h3><ul style="margin:0;padding-left:20px;">${visits.map(v => `<li><strong>${esc(v.client || v.address || 'Vizită')}</strong> ${v.address ? '— ' + esc(v.address) : ''} <span style="color:#94a3b8">· de ${esc(v.createdBy || '—')}</span></li>`).join('')}</ul>`;

  const pontajRows = pontajRecords.filter(r => r.checkIn).map(r => {
    const km = r.checkIn.distKm != null ? r.checkIn.distKm : null;
    return `<li><strong>${esc(r.userName || '?')}</strong> — intrare ${r.checkIn.time ? fmtTime(r.checkIn.time) : ''}${r.checkOut ? ', ieșire ' + fmtTime(r.checkOut.time) : ''}${km != null && km > 50 ? ' <span style="color:#d97706;font-weight:600">🚗 ' + km + ' km</span>' : ''}</li>`;
  });
  if (pontajRows.length) body += `<h3 style="color:#f59e0b;margin:18px 0 8px;">🕐 Pontaj — prezențe (${pontajRows.length})</h3><ul style="margin:0;padding-left:20px;">${pontajRows.join('')}</ul>`;

  if (!body.trim()) body = '<p style="color:#64748b;">Nicio activitate înregistrată azi.</p>';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0d1b2e;padding:20px 24px;border-radius:10px 10px 0 0;">
        <h2 style="color:#fff;margin:0;">SHC Solar Suite — Rezumat Zilnic</h2>
        <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">${new Date().toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</p>
      </div>
      <div style="background:#fff;padding:20px 24px;border-radius:0 0 10px 10px;border:1px solid #e2e8f0;color:#1e293b;">
        ${body}
        <p style="margin-top:20px;font-size:12px;color:#94a3b8;">Vezi și istoricul complet în <a href="https://clasimpact-vivid.github.io/shc-solar-suite/Rezumat%20Zilnic.html" style="color:#f59e0b;">Rezumat Zilnic</a>.</p>
      </div>
    </div>`;

  const recipients = users.filter(u => FULL_ACCESS_IDS.includes(u.id) && u.email);
  let sent = 0;
  for (const user of recipients) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM_EMAIL, to: user.email, subject: 'SHC Solar Suite — Rezumat Zilnic', html }),
      });
      if (!res.ok) { console.error(`Eroare trimitere către ${user.email}:`, await res.text()); continue; }
      console.log(`✓ Trimis către ${user.name} (${user.email})`);
      sent++;
    } catch (e) { console.error(`Eroare trimitere către ${user.email}:`, e.message); }
  }
  console.log(`Gata. ${sent} rezumat(e) zilnic(e) trimise.`);
}
main().catch(e => { console.error(e); process.exit(1); });
