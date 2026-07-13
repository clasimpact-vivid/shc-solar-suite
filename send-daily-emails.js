/**
 * SHC Solar Suite — Notificări email zilnice
 * Rulează automat prin GitHub Actions (.github/workflows/daily-emails.yml)
 * Nu necesită nimeni să deschidă vreo aplicație — citește direct din Firebase.
 *
 * Variabile de mediu necesare (setate ca GitHub Secrets):
 *   RESEND_API_KEY   — cheia API de la resend.com
 *   FROM_EMAIL        — adresa expeditor, ex: "SHC Solar Suite <notificari@shc-group.ro>"
 *                        (implicit foloseşte onboarding@resend.dev dacă domeniul nu e încă verificat)
 */

const FIREBASE_BASE = 'https://solarcrm-ba919-default-rtdb.firebaseio.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SHC Solar Suite <office@shc-group.ro>';
const FULL_ACCESS_IDS = ['u_chirila', 'u_nicoras'];

if (!RESEND_API_KEY) {
  console.error('Lipsește RESEND_API_KEY din variabilele de mediu. Adaugă-l ca GitHub Secret.');
  process.exit(1);
}

async function fetchJson(path) {
  const res = await fetch(`${FIREBASE_BASE}/${path}.json`);
  if (!res.ok) throw new Error(`Firebase fetch failed for ${path}: ${res.status}`);
  return (await res.json()) || {};
}

function toArray(obj) {
  if (!obj) return [];
  return Array.isArray(obj) ? obj.filter(Boolean) : Object.values(obj).filter(Boolean);
}

function hoursAgo(n) {
  return Date.now() - n * 3600 * 1000;
}

function fmtTime(ts) {
  return new Date(ts).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function main() {
  console.log('Colectez date din Firebase...');
  const [crmData, planningData, visitsData, pontajData] = await Promise.all([
    fetchJson('solarcrm_v2'),
    fetchJson('shc_planning'),
    fetchJson('shc_visits'),
    fetchJson('shc_pontaj'),
  ]);

  const cfg = crmData.config || {};
  const users = toArray(cfg.users);
  const allUsers = [{ id: '_admin', name: 'Administrator', email: null }, ...users];
  const projects = toArray(crmData.projects);
  const planningProjects = toArray(planningData.projects);
  const visits = toArray(visitsData.visits);
  const pontajRecords = toArray(pontajData.records);

  const cutoff24h = hoursAgo(24);
  const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' }); // YYYY-MM-DD

  // ── SolarCRM section: proiecte cu activitate în audit log în ultimele 24h ──
  function crmSectionFor(user, isFull) {
    const recentActivity = [];
    projects.forEach(p => {
      const log = toArray(p.auditLog).filter(e => e.timestamp && e.timestamp >= cutoff24h);
      if (!log.length) return;
      const isOwn = p.responsabil && user.name && p.responsabil.trim() === user.name.trim();
      if (isFull || isOwn) {
        log.forEach(e => recentActivity.push({ client: p.client || 'Client necunoscut', action: e.action || 'actualizare', reason: e.reason || '', time: e.timestamp }));
      }
    });
    if (!recentActivity.length) return '';
    recentActivity.sort((a, b) => b.time - a.time);
    const rows = recentActivity.map(a => `<li><strong>${a.client}</strong> — ${a.action}${a.reason ? ' (' + a.reason + ')' : ''} <span style="color:#94a3b8">· ${fmtTime(a.time)}</span></li>`).join('');
    return `<h3 style="color:#f59e0b;margin:18px 0 8px;">📋 SolarCRM — activitate recentă</h3><ul style="margin:0;padding-left:20px;">${rows}</ul>`;
  }

  // ── Planificare Șantier: etape întârziate sau care încep azi/mâine ──
  function planningSectionFor(user, isFull) {
    const late = [];
    const upcoming = [];
    planningProjects.forEach(p => {
      toArray(p.stages).forEach(s => {
        const isOwn = s.responsabil === user.id;
        if (!isFull && !isOwn) return;
        if (s.status === 'intarziat') late.push({ project: p.name, stage: s.type });
        if (s.startDate === todayISO && s.status === 'planificat') upcoming.push({ project: p.name, stage: s.type, date: s.startDate });
      });
    });
    if (!late.length && !upcoming.length) return '';
    let html = `<h3 style="color:#f59e0b;margin:18px 0 8px;">📅 Planificare Șantier</h3>`;
    if (late.length) html += `<p style="margin:4px 0;color:#dc2626;font-weight:600;">⚠ ${late.length} etape întârziate:</p><ul style="margin:0 0 10px;padding-left:20px;">${late.map(l => `<li>${l.project} — ${l.stage}</li>`).join('')}</ul>`;
    if (upcoming.length) html += `<p style="margin:4px 0;color:#d97706;font-weight:600;">⏰ Încep azi:</p><ul style="margin:0;padding-left:20px;">${upcoming.map(u => `<li>${u.project} — ${u.stage}</li>`).join('')}</ul>`;
    return html;
  }

  // ── Vizită Șantier: vizite adăugate în ultimele 24h ──
  function visitsSectionFor(isFull) {
    if (!isFull) return '';
    const recent = visits.filter(v => v.createdAt && v.createdAt >= cutoff24h);
    if (!recent.length) return '';
    const rows = recent.map(v => `<li><strong>${v.client || v.address || 'Vizită'}</strong> — ${v.address || ''} <span style="color:#94a3b8">· de ${v.createdBy || '—'}</span></li>`).join('');
    return `<h3 style="color:#f59e0b;margin:18px 0 8px;">📷 Vizită Șantier — adăugate recent</h3><ul style="margin:0;padding-left:20px;">${rows}</ul>`;
  }

  // ── Pontaj: absențe azi (nicio intrare până acum) ──
  function pontajSectionFor(isFull) {
    if (!isFull) return '';
    const activeUsers = users.filter(u => u.id !== '_admin');
    const todayRecs = pontajRecords.filter(r => r.date === todayISO);
    const absent = activeUsers.filter(u => !todayRecs.some(r => r.userId === u.id && r.checkIn));
    if (!absent.length) return '';
    const rows = absent.map(u => `<li>${u.name}</li>`).join('');
    return `<h3 style="color:#f59e0b;margin:18px 0 8px;">🕐 Pontaj — fără check-in azi</h3><ul style="margin:0;padding-left:20px;">${rows}</ul>`;
  }

  // ── Compune și trimite câte un email per destinatar ──
  let sent = 0;
  for (const user of allUsers) {
    if (!user.email) continue; // fără adresă setată -> skip
    const isFull = FULL_ACCESS_IDS.includes(user.id);
    const notif = user.notif || {};
    let body = '';
    const wantsCRM = notif.solarcrm !== false; // implicit true dacă nu e explicit dezactivat
    if (isFull || wantsCRM) body += crmSectionFor(user, isFull);
    if (isFull || notif.planificare) body += planningSectionFor(user, isFull);
    if (isFull || notif.vizita) body += visitsSectionFor(isFull);
    if (isFull || notif.pontaj) body += pontajSectionFor(isFull);

    if (!body.trim()) { console.log(`Fără noutăți pentru ${user.name}, nu trimit.`); continue; }

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0d1b2e;padding:20px 24px;border-radius:10px 10px 0 0;">
          <h2 style="color:#fff;margin:0;">SHC Solar Suite — Sumar zilnic</h2>
          <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">${new Date().toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</p>
        </div>
        <div style="background:#fff;padding:20px 24px;border-radius:0 0 10px 10px;border:1px solid #e2e8f0;color:#1e293b;">
          <p>Bună, ${user.name.split(' ')[0]}!</p>
          ${body}
        </div>
      </div>`;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM_EMAIL, to: user.email, subject: 'SHC Solar Suite — Sumar zilnic', html }),
      });
      if (!res.ok) { console.error(`Eroare trimitere către ${user.email}:`, await res.text()); continue; }
      console.log(`✓ Trimis către ${user.name} (${user.email})`);
      sent++;
    } catch (e) {
      console.error(`Eroare trimitere către ${user.email}:`, e.message);
    }
  }
  console.log(`Gata. ${sent} email(uri) trimise.`);
}

main().catch(e => { console.error(e); process.exit(1); });
