# SHC Solar Suite

Suita internă de aplicații Smart House Color pentru vânzări, execuție și operațiuni — sisteme fotovoltaice, stocare BESS și STS.

Toate aplicațiile sunt fișiere HTML de sine stătătoare, sincronizate live printr-o singură bază de date Firebase (`solarcrm-ba919`). Nu necesită instalare — se deschid direct în browser (desktop sau mobil).

## Cum intri

Deschide **`index.html`** — pagina principală SHC Solar Suite. De acolo, fiecare aplicație se deschide într-un tab nou; poți lucra în mai multe aplicații simultan fără să pierzi contextul.

Autentificare: PIN de 4 cifre (tastatură numerică) pentru majoritatea colegilor, sau parolă pentru Administrator / Chirila / Nicoraș. Fiecare aplicație are un buton „← Suite" în stânga sus, care te duce înapoi la pagina principală.

## Aplicațiile din suită

### 🧮 Calculator Oferte PV-BESS
Configurează un sistem (panouri, invertor, baterie BESS, STS), calculează CAPEX/producție/economii/payback, și generează oferta client sub formă de PDF profesional (prima pagină cu fundal navy, KPI-uri, devize, grafic de plăți). Ofertele generate sunt vizibile tuturor colegilor (jurnal comun), nu doar celui care le-a creat.

### 📋 SolarCRM
Gestiunea lucrărilor: de la Lead până la Finalizat. Fiecare lucrare are istoric de audit (cine a modificat ce și când), follow-up automat la 10-14 zile, atașamente (oferte/documente), generare Contract de prestări servicii (document legal complet, cu antet, tabel de componență, semnături), și panou de Utilizatori (PIN-uri, parole, roluri, permisiuni).

### 🗓️ Planificare Șantier
Grafic Gantt pentru etapele unei lucrări (Proiectare → Avize → Montaj → Comisionare → Recepție). Doar Chirila și Nicoraș pot modifica/șterge etape odată create, ca să nu existe confuzie pe termene.

### 📍 Vizită Șantier
Schițe de amplasament pentru vizite la client — desen liber + forme predefinite (panouri, baterii), fotografii, date client/locație. Export PDF cu schiță + poze + date.

### 🕐 Pontaj
Pontaj cu geolocalizare (check-in/check-out), hartă live a echipei din teren, cereri de concediu/învoire (cu aprobare Chirila/Nicoraș/Eszter), proces verbal, și export CSV lunar per angajat (sau pentru toată echipa) pentru contabilitate.

### 📊 Rezumat Zilnic
Vedere agregată a activității zilei/săptămânii din toate aplicațiile — cine a lucrat la ce, oferte generate, follow-up-uri restante, cereri de concediu, linie de productivitate pe 7 zile.

## Utilizatori și acces

Fiecare coleg are un cont unic (nume, rol, PIN, parolă) creat din SolarCRM → Utilizatori (drepturi depline doar pentru Chirila și Nicoraș). Rolul determină ce vede fiecare: agenții de vânzări văd propriile lucrări urgente, contabilitatea (Eszter) vede pontaje/concedii, muncitorii de teren au acces restrâns la Pontaj și instrumentele de teren.

## Note tehnice (pentru cine continuă dezvoltarea)

- Bază de date: Firebase Realtime Database, proiect `solarcrm-ba919`, colecție principală `solarcrm_v2`.
- E-mailuri automate: Resend (notificări zilnice, oferte, aprobare concedii) + EmailJS (unele fluxuri client-side), rulate printr-un GitHub Action (`.github/workflows/`).
- Găzduire: GitHub Pages (`clasimpact-vivid.github.io/shc-solar-suite`).
- Nu edita fișierul `support.js` — e runtime-ul comun al aplicațiilor.

## Status

Suită în fază de testare internă (beta). Înainte de utilizarea cu date reale de clienți: revizuire securitate (reguli Firebase, parole unice per user, 2FA), apoi trecere la producție.
