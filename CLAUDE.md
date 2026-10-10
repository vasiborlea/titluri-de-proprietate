# Registru titluri de proprietate

Aplicație web (în română) pentru evidența titlurilor de proprietate românești: căutare, filtre, introducere manuală sau autocompletare din PDF-ul scanat cu AI. Folosită de un grup mic (conturi Google din listă).

## Arhitectură

- **Frontend:** un singur fișier `index.html` (HTML + CSS + JS simplu, fără build). Biblioteci din CDN: pdf.js, SheetJS, Firebase compat SDK 10.14.1 (`app`, `auth`, `firestore`).
- **Găzduire:** Netlify, deploy automat din GitHub (`vasiborlea/titluri-de-proprietate`, branch `main`). Site: https://registru-titluri-proprietate.netlify.app
- **Autentificare:** Firebase Auth, Google sign-in (proiect Firebase `titluri-de-proprietate`).
- **Date:** Firestore.
  - `titles/{id}` — un document per titlu (fără `pdfBlob`).
  - `scans/{titleId}` — scanul salvat ca imagini JPEG în tonuri de gri, într-un singur document `{pages: [base64, ...]}`, cu buget total ~50 KB per titlu (`SCAN_TOTAL_BYTES`, împărțit pe pagini; max 10 pagini). Titlul păstrează `scanPages` = numărul de pagini. Compresia se face în browser cu pdf.js la salvare (`pdfToJpegPages`); autocompletarea AI citește PDF-ul original, nu JPEG-urile. Formatele mai vechi (documente `{titleId}_{n}`, respectiv PDF în bucăți cu `pdfParts`) se citesc în continuare.
  - Nu folosim Firebase Storage (cere planul Blaze cu card; vrem să rămânem pe planul gratuit).
- **Server (Netlify Functions, `netlify/functions/`):**
  - `extract.mjs` → `/api/extract`: primește PDF + ID token Firebase, verifică tokenul (`accounts:lookup`) și accesul (citire de probă în Firestore cu tokenul utilizatorului), apoi apelează Anthropic. Promptul de extragere stă aici, nu în browser.
  - `config.mjs` → `/api/config`: întoarce configurarea web Firebase din `FIREBASE_CONFIG`.

## Pagini

- `index.html` — registrul de titluri. După conectare apare meniul de start (`#appMenu`) cu butoane mari, doar pentru aplicațiile la care contul are acces: „Titluri”, „Distanțe corecte”, „Setări” (doar administratori). Butonul „☰ Meniu” din antet (în stânga) deschide un submeniu (dropdown) în pagină. Adresa `/?view=titluri` sare direct în Titluri (folosită de submeniul din celelalte pagini).
- `distante.html` — instrument de calcul al distanțelor laturilor din punctele TopoLT (X, Y), cu aceeași temă și siglă (`logo.png`) ca registrul. Calculează doar în browser, nu salvează nimic. Se arată doar conturilor cu acces la „Distanțe corecte” (poartă la nivel de pagină, fără date de protejat în baza de date).
- `setari.html` — pagina de administrare, doar pentru administratori: adaugă/elimină conturi Google, schimbă rolul (Administrator / Utilizator) și bifează aplicațiile permise (Titluri, Distanțe corecte) pentru fiecare cont.
- `menu.js` — comun celor trei pagini: `AppMenu.loadPerms(db, user)` (permisiunile contului, din `allowedUsers`) și submeniul din butonul „☰ Meniu”. Pagină nouă = adaugă o intrare în `ITEMS` din `menu.js`.

## Securitate (de păstrat)

- Nicio cheie secretă în `index.html` sau în repo. `ANTHROPIC_API_KEY` doar în variabilele Netlify.
- Accesul real la date e în `firestore.rules`: administratorul principal (`borleavasi@gmail.com`, hardcodat în reguli și în `ADMIN_EMAIL` din `index.html`, nu poate fi retrogradat) plus conturile din colecția `allowedUsers/{email}` (un document per e-mail, id = e-mail cu litere mici). Câmpuri: `role` = `admin` | `user` și `apps` = `{titluri: bool, distante: bool}` (dacă `apps` lipsește, contul are acces la ambele). Administratorii (principalul + conturile cu `role: admin`) au acces la tot și gestionează lista din `setari.html`; ceilalți au acces doar la aplicațiile bifate. Accesul la titluri și scanuri (`hasApp('titluri')` în `firestore.rules`) e impus de baza de date; accesul la „Distanțe corecte” e doar la nivel de pagină. Logica de permisiuni din `menu.js` oglindește regulile; dacă modifici una, modific-o și pe cealaltă. Ecranul de login din `index.html` (`#authGate`) e doar interfață; aplicația se arată după ce Firestore acceptă o citire reală.
- Sursa unică a accesului sunt regulile Firestore. `/api/extract` verifică accesul făcând o citire minimă în Firestore cu tokenul utilizatorului, deci nu există o listă de e-mailuri și în Netlify.
- Dacă schimbi administratorul, modifică și `isAdmin()` în `firestore.rules` și apoi redeployează regulile.
- Fără rate limiting pe `/api/extract` — setează o limită lunară de cheltuieli în consola Anthropic.
- Config web Firebase (apiKey etc.) e publică prin natura ei; nu e secret.

## Variabile de mediu Netlify

| Variabilă | Rol |
|---|---|
| `ANTHROPIC_API_KEY` | cheia Anthropic (secretă) |
| `FIREBASE_CONFIG` | JSON `firebaseConfig` al aplicației web |
| `ANTHROPIC_MODEL` | opțional, implicit `claude-sonnet-4-6` |

## Comenzi utile

```bash
firebase deploy --only firestore:rules --project titluri-de-proprietate   # regulile Firestore
netlify env:list --site 308aaaaa-2d75-4331-a21b-a2c0f59d15c7              # variabile Netlify
```

Un push pe `main` pornește deploy-ul Netlify automat.

## Note pentru dezvoltare

- Nu există build, teste sau linter. Verificare de sintaxă: extrage scriptul inline din `index.html` și rulează `node --check`.
- După modificări în `index.html` păstrează funcțiile de date (`loadData`, `saveTitle`, `deleteTitleRecord`) doar pe calea Firebase; fără autentificare nu se încarcă și nu se salvează nimic.
- Domeniul site-ului trebuie să fie în Firebase Console → Authentication → Settings → Authorized domains.
- Textul interfeței și al promptului e în limba română; păstrează diacriticele.

## Mediu Windows (sesiunea de dezvoltare)

- `node`, `gh`, `git`, `netlify`, `firebase` sunt instalate; un terminal deschis înainte de instalare nu le vede în PATH (reîmprospătează PATH sau repornește aplicația).
- Folderul proiectului nu are `.git` (Windows blochează crearea de foldere de către shell). Git rulează cu `--git-dir` în afara proiectului și `--work-tree` pe acest folder; alternativ, clonează repo-ul în altă parte.
