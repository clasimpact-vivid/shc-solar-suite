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
const FULL_ACCESS_IDS = ['u_chirila', 'u_nicoras', '_office'];

// Destinatari garantați — NU depind de baza de date (dacă lista de useri se pierde, mailurile pleacă oricum)
const FIXED_EMAILS = { u_chirila: 'alexandru.chirila@shc-group.ro', u_nicoras: 'nicorasionut@shc-group.ro', u_simon_eszter: 'eszter.simon@shc-group.ro' };
const OFFICE = { id: '_office', name: 'Office SHC', email: 'office@shc-group.ro' };

const BY_NAME = [[/nicoras.*ionut|ionut.*nicoras/i,'nicorasionut@shc-group.ro'],[/chirila/i,'alexandru.chirila@shc-group.ro'],[/dobre/i,'cristian.dobre@shc-group.ro'],[/sirb|beniamin/i,'beniamin.sirb@shc-group.ro'],[/gliga/i,'andreea.gliga@shc-group.ro'],[/simon.*eszter|eszter/i,'eszter.simon@shc-group.ro'],[/vesa/i,'cosmin.vesa@shc-group.ro']];
function mailByName(u){ const n=String(u.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''); for(const [re,m] of BY_NAME) if(re.test(n)) return m; return null; }
function withFixedEmails(list){
  const out = list.map(u => u.email ? u : (FIXED_EMAILS[u.id] || mailByName(u)) ? { ...u, email: FIXED_EMAILS[u.id] || mailByName(u) } : u);
  Object.keys(FIXED_EMAILS).forEach(id => { if (!out.some(u => u.id === id)) out.push({ id, name: id === 'u_chirila' ? 'Alexandru Chirila' : id === 'u_nicoras' ? 'Ionut Nicoras' : 'Simon Eszter', email: FIXED_EMAILS[id] }); });
  return out;
}

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
  const users = withFixedEmails(toArray(cfg.users));
  const allUsers = [...users, OFFICE];
  // nu trimite de două ori la aceeași adresă
  const seenMail = new Set();
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
    const activeUsers = users.filter(u => u.id !== '_admin' && u.id !== '_office');
    const todayRecs = pontajRecords.filter(r => r.date === todayISO);
    const absent = activeUsers.filter(u => !todayRecs.some(r => r.userId === u.id && r.checkIn));
    let html = '';
    if (absent.length) {
      const rows = absent.map(u => `<li>${u.name}</li>`).join('');
      html += `<h3 style="color:#f59e0b;margin:18px 0 8px;">🕐 Pontaj — fără check-in azi</h3><ul style="margin:0;padding-left:20px;">${rows}</ul>`;
    }
    return html;
  }

  // ── Task-uri neterminate (asignate din Pontaj) ──
  const pontajTasksAll = toArray(pontajData.pontajTasks || crmData.pontajTasks);
  function tasksSectionFor(user, isFull) {
    const relevant = pontajTasksAll.filter(t => !t.done && (isFull || t.assigneeId === user.id));
    if (!relevant.length) return '';
    const sorted = [...relevant].sort((a,b)=>(a.due||'').localeCompare(b.due||''));
    const rows = sorted.map(t => {
      const overdue = t.due && t.due < todayISO;
      return `<li>${t.priority==='urgent'?'<strong style="color:#dc2626;">[Urgent]</strong> ':''}${overdue?'<strong style="color:#dc2626;">[Restant]</strong> ':''}${isFull?'<strong>'+(t.assigneeName||'?')+'</strong> — ':''}${t.desc||''} <span style="color:#94a3b8">· de la ${t.createdBy||'—'}</span>${t.due?' <span style="color:#94a3b8">· termen '+t.due.split('-').reverse().join('/')+(t.dueTime?' ora '+t.dueTime:'')+'</span>':''}</li>`;
    }).join('');
    return `<h3 style="color:#f59e0b;margin:18px 0 8px;">📌 Task-uri neterminate</h3><ul style="margin:0;padding-left:20px;">${rows}</ul>`;
  }

  // ── Alerte: task-uri cu termen în următoarele 2 zile ──
  function fmtRo(iso){ return iso ? iso.split('-').reverse().join('/') : ''; }
  const in2days = (() => { const d = new Date(todayISO + 'T12:00:00'); d.setDate(d.getDate() + 2); return d.toISOString().slice(0,10); })();
  function alerteTermenFor(user, isFull) {
    const soon = pontajTasksAll.filter(t =>
      !t.done && t.due && t.due >= todayISO && t.due <= in2days &&
      (isFull || t.assigneeId === user.id || t.assigneeSecId === user.id || t.assigneeTerId === user.id || t.assigneeQuatId === user.id)
    );
    if (!soon.length) return '';
    const rows = [...soon].sort((a,b)=>(a.due||'').localeCompare(b.due||'')).map(t => {
      const azi = t.due === todayISO;
      return `<li><strong style="color:${azi?'#dc2626':'#d97706'};">[${azi?'AZI':'în 2 zile'}]</strong> ${t.title || t.desc || '—'}${isFull ? ' <span style="color:#94a3b8">· ' + (t.assigneeName || '?') + '</span>' : ''} <span style="color:#94a3b8">· termen ${fmtRo(t.due)}${t.dueTime ? ' ora ' + t.dueTime : ''}</span></li>`;
    }).join('');
    return `<h3 style="color:#dc2626;margin:18px 0 8px;">⏳ Termene apropiate</h3><ul style="margin:0;padding-left:20px;">${rows}</ul>`;
  }

  // ── Pontaj: deplasări >50km de Arad azi (pentru ordin de deplasare + diurnă) ──
  const HQ_LAT = 46.1866, HQ_LNG = 21.3123;
  function distFromHQ(lat, lng) {
    const R = 6371, toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat - HQ_LAT), dLng = toRad(lng - HQ_LNG);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(HQ_LAT)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }
  function deplasariSectionFor(user, isFull) {
    const wantsPontaj = isFull || (user.notif && user.notif.pontaj);
    if (!wantsPontaj) return '';
    const todayRecs = pontajRecords.filter(r => r.date === todayISO && r.checkIn && r.checkIn.lat != null);
    const deplasari = todayRecs
      .map(r => ({ name: r.userName || '?', km: r.checkIn.distKm != null ? r.checkIn.distKm : distFromHQ(r.checkIn.lat, r.checkIn.lng) }))
      .filter(d => d.km > 50);
    if (!deplasari.length) return '';
    const rows = deplasari.map(d => `<li><strong>${d.name}</strong> — ${d.km} km de Arad</li>`).join('');
    return `<h3 style="color:#f59e0b;margin:18px 0 8px;">🚗 Pontaj — deplasări peste 50km azi</h3><ul style="margin:0;padding-left:20px;">${rows}</ul>`;
  }

  // ── SolarCRM: follow-up-uri restante sau lucrări fără follow-up de 10+ zile ──
  function followUpSectionFor(user, isFull) {
    const overdue = [];
    const stale = [];
    projects.forEach(p => {
      if (!['Lead', 'Ofertă', 'Contract'].includes(p.status)) return;
      const isOwn = p.responsabil && user.name && p.responsabil.trim() === user.name.trim();
      if (!isFull && !isOwn) return;
      const today0 = new Date(); today0.setHours(0, 0, 0, 0);
      if (p.nextFollowUp) {
        const fuD = new Date(p.nextFollowUp + 'T00:00:00');
        if (fuD < today0) overdue.push({ client: p.client || 'Client', date: p.nextFollowUp, responsabil: p.responsabil || '—' });
      } else {
        const baseIso = p.fuLastContactAt ? p.fuLastContactAt.slice(0, 10) : (p.date_inserted || p.date_start);
        if (baseIso) {
          const days = Math.round((today0 - new Date(baseIso + 'T00:00:00')) / 86400000);
          if (days >= 10) stale.push({ client: p.client || 'Client', days, responsabil: p.responsabil || '—' });
        }
      }
    });
    if (!overdue.length && !stale.length) return '';
    let html = `<h3 style="color:#f59e0b;margin:18px 0 8px;">⏰ SolarCRM — follow-up</h3>`;
    if (overdue.length) html += `<p style="margin:4px 0;color:#dc2626;font-weight:600;">Follow-up restant:</p><ul style="margin:0 0 10px;padding-left:20px;">${overdue.map(o => `<li><strong>${o.client}</strong> — programat ${o.date} <span style="color:#94a3b8">· resp. ${o.responsabil}</span></li>`).join('')}</ul>`;
    if (stale.length) html += `<p style="margin:4px 0;color:#d97706;font-weight:600;">Fără follow-up setat de 10+ zile:</p><ul style="margin:0;padding-left:20px;">${stale.map(s => `<li><strong>${s.client}</strong> — ${s.days} zile fără contact nou <span style="color:#94a3b8">· resp. ${s.responsabil}</span></li>`).join('')}</ul>`;
    return html;
  }

  // ── Gestiune — marfă dată fără factură de peste 14 zile ──
  let griData = {};
  try { griData = await fetchJson('shc_gestiune/gri'); } catch (e) { console.warn('Gestiune indisponibil:', e.message); }
  const tok = n => String(n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).filter(x => x.length > 1);
  const isGestRecipient = u => FULL_ACCESS_IDS.includes(u.id) || (t => (t.includes('simon') && t.includes('eszter')) || (t.includes('ardelean') && t.includes('stefan')) || (t.includes('chirila') && t.includes('alexandru')) || (t.includes('nicoras') && t.includes('ionut')))(tok(u.name));
  const todayIso = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Bucharest' })).toISOString().slice(0, 10);
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dmy = iso => iso ? iso.split('-').reverse().join('/') : '';
  const griOverdue = Object.values(griData || {}).filter(x => x && x.status === 'open' && (x.due || addDays(x.date || todayIso, 14)) < todayIso)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  function griSectionFor(user) {
    if (!griOverdue.length || !isGestRecipient(user)) return '';
    const total = griOverdue.reduce((a, x) => a + (Number(x.qty) || 0) * (Number(x.pm) || 0), 0);
    const fmt = v => Number(v || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `<h3 style="color:#a78bfa;margin:18px 0 8px;">📦 Gestiune — marfă nefacturată (${griOverdue.length})</h3>
      <p style="margin:4px 0 8px;color:#dc2626;font-weight:600;">Predată fără factură, termen depășit — valoare totală ${fmt(total)} lei:</p>
      <ul style="margin:0;padding-left:20px;">${griOverdue.map(x => {
        const days = Math.round((new Date(todayIso) - new Date(x.date)) / 86400000);
        return `<li><strong>${x.den || x.cod}</strong> — ${x.qty} ${x.um || ''} → ${x.toType || ''}: ${x.to || ''} <span style="color:#94a3b8">· scos de ${x.by || '—'} pe ${dmy(x.date)} (${days} zile) · ${fmt((Number(x.qty) || 0) * (Number(x.pm) || 0))} lei</span></li>`;
      }).join('')}</ul>`;
  }

  // ── Compune și trimite câte un email per destinatar ──
  let sent = 0;
  for (const user of allUsers) {
    if (!user.email) continue; // fără adresă setată -> skip
    const mk = user.email.trim().toLowerCase(); if (seenMail.has(mk)) continue; seenMail.add(mk);
    const isFull = FULL_ACCESS_IDS.includes(user.id);
    const notif = user.notif || {};
    let body = '';
    const wantsCRM = notif.solarcrm !== false; // implicit true dacă nu e explicit dezactivat
    if (isFull || wantsCRM) body += crmSectionFor(user, isFull);
    if (isFull || wantsCRM) body += followUpSectionFor(user, isFull);
    if (isFull || notif.planificare) body += planningSectionFor(user, isFull);
    if (isFull || notif.vizita) body += visitsSectionFor(isFull);
    if (isFull || notif.pontaj) body += pontajSectionFor(isFull);
    body += alerteTermenFor(user, isFull);
    body += tasksSectionFor(user, isFull);
    body += deplasariSectionFor(user, isFull);
    body += griSectionFor(user);

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
