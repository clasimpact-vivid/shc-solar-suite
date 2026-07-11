# SHC Solar Suite

Suită internă de aplicații pentru Smart House Color — CRM, oferte, planificare șantier și vizite tehnice. Toate sincronizate live prin Firebase.

## 🔗 Aplicații

| Aplicație | Fișier | Descriere |
|---|---|---|
| **Hub** | `index.html` | Pagina de start — link-uri către toate aplicațiile |
| **SolarCRM** | `SolarCRM - Standalone.html` | Gestiune lucrări, clienți, contracte, permisiuni pe roluri |
| **Calculator Oferte PV-BESS** | `Calculator Oferte PV-BESS.html` | Oferte tehnico-economice, cash-flow, export PDF |
| **Planificare Șantier** | `Planificare Santier.html` | Gantt cu etape, responsabili, alerte |
| **Vizită Șantier** | `Vizita Santier.html` | Schițe amplasament, poze, date tehnice de la fața locului |
| **Pontaj** | `Pontaj.html` | Check-in/out cu GPS, listă zilnică echipă, hartă live, export CSV lunar |

Link live: `https://clasimpact-vivid.github.io/shc-solar-suite/`

## 👤 Utilizatori & parole

Utilizatorii și parolele se gestionează din interiorul SolarCRM (buton **Utilizatori**, sus dreapta) — nu editați cod pentru asta. Modificările se sincronizează automat prin Firebase pentru toți colegii.

Fiecare utilizator are:
- **Rol** (Manager, Vânzări, Backoffice, Administrator)
- **Acces deplin (SuperAdmin)** — vede toate lucrările
- **Segmente vizibile** (PV, Inverter, Baterie, BESS) — dacă nu e SuperAdmin, vede doar lucrările din segmentele bifate

## 🔄 Cum actualizezi un fișier

1. Cere-i lui Claude modificarea dorită și descarcă fișierul rezultat
2. Pe GitHub, în acest repo → **Add file → Upload files**
3. Trage fișierul nou — **păstrează exact același nume** (inclusiv spații/majuscule)
4. Commit — Netlify/GitHub Pages redeployă automat în ~1 minut

⚠️ Nu redenumi fișierele — link-urile dintre aplicații (SolarCRM ↔ Calculator ↔ Planificare ↔ Vizită) depind de numele exacte.

## 🗄️ Date

Toate proiectele, ofertele, etapele și utilizatorii se salvează în Firebase Realtime Database (nu în fișierele HTML) — descărcarea/reîncărcarea aplicațiilor **nu șterge datele**.
