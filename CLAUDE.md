# Registru titluri de proprietate

Aplicație web (în română) pentru evidența titlurilor de proprietate românești: căutare, filtre, introducere manuală sau autocompletare din PDF-ul scanat cu AI. Folosită de un grup mic (conturi Google din listă).

## Arhitectură

- **Frontend:** un singur fișier `index.html` (HTML + CSS + JS simplu, fără build). Biblioteci din CDN: pdf.js, SheetJS, Firebase compat SDK 10.14.1 (`app`, `auth`, `firestore`).
- **Găzduire:** Netlify, deploy automat din GitHub (`vasiborlea/titluri-de-proprietate`, branch `main`). Site: https://registru-titluri-proprietate.netlify.app
- **Autentificare:** Firebase Auth, Google sign-in (proiect Firebase `titluri-de-proprietate`).
- **Date:** Firestore.
  - `titles/{id}` — un document per titlu (fără `pdfBlob`).
  - `scans/{titleId}` — scanul salvat ca imagini în tonuri de gri, WebP (JPEG dacă browserul nu encodează WebP), într-un singur document `{type, pages: [base64, ...]}`. Țintă ~25 KB/pagină (`SCAN_PAGE_BYTES`: 2 pagini = 50 KB, 3 = 75 KB, 4 = 100 KB), de la 2000 px pe latura lungă în jos până la minimum 600 px (`SCAN_MIN_EDGE`), max 6 pagini și ~650 KB total pe titlu (documentul Firestore e limitat la 1 MiB, base64 adaugă ~33%). Pe la 25 KB/pagină scrisul de mână mărunt poate deveni greu de citit; pentru lizibilitate bună ridică `SCAN_PAGE_BYTES` (~100 KB/pagină a fost lizibil). Titlul păstrează `scanPages` = numărul de pagini. Compresia se face în browser cu pdf.js la salvare (`pdfToScanPages`: pagina se randează o dată, apoi se redimensionează dacă trebuie); autocompletarea AI citește PDF-ul original, nu imaginile. Capacitate la 25 KB/pagină: ~10.000 de titluri cu 2 pagini în 1 GiB (la 100 KB/pagină: ~3.500–4.000). Atașarea unui PDF nou la un titlu existent înlocuiește scanul vechi (`currentPdfIsNew`). Formatele mai vechi (documente `{titleId}_{n}`, PDF în bucăți cu `pdfParts`) se citesc în continuare. Scanurile salvate la 50 KB/titlu sunt prea neclare: se refac atașând din nou PDF-ul.
  - Nu folosim Firebase Storage (cere planul Blaze cu card; vrem să rămânem pe planul gratuit).
- **Server (Netlify Functions, `netlify/functions/`):**
  - `extract.mjs` → `/api/extract`: primește PDF + ID token Firebase, verifică tokenul (`accounts:lookup`) și accesul (citire de probă în Firestore cu tokenul utilizatorului), apoi apelează Anthropic. Promptul de extragere stă aici, nu în browser.
  - `config.mjs` → `/api/config`: întoarce configurarea web Firebase din `FIREBASE_CONFIG`.

## Pagini

- `index.html` — registrul de titluri. După conectare apare meniul de start (`#appMenu`) cu butoane mari, doar pentru aplicațiile la care contul are acces: „Titluri”, „Distanțe corecte”, „Setări” (doar administratori). Butonul „☰ Meniu” din antet (în stânga) deschide un submeniu (dropdown) în pagină. Adresa `/?view=titluri` sare direct în Titluri (folosită de submeniul din celelalte pagini).
- `distante.html` — instrument de calcul al distanțelor laturilor din punctele TopoLT (X, Y), cu aceeași temă și siglă (`logo.png`) ca registrul. Calculează doar în browser, nu salvează nimic. Se arată doar conturilor cu acces la „Distanțe corecte” (poartă la nivel de pagină, fără date de protejat în baza de date).
- `setari.html` — pagina de administrare, doar pentru administratori: adaugă/elimină conturi Google, schimbă rolul (Administrator / Utilizator) și bifează aplicațiile permise (Titluri, Distanțe corecte) pentru fiecare cont.
- `menu.js` — comun celor trei pagini: `AppMenu.loadPerms(db, user)` (permisiunile contului, din `allowedUsers`) și submeniul din butonul „☰ Meniu”. Pagină nouă = adaugă o intrare în `ITEMS` din `menu.js`.

## Autocompletarea din PDF (`netlify/functions/extract.mjs`)

- Model: variabila Netlify `ANTHROPIC_MODEL` (acum `claude-sonnet-5-5`). Haiku 5.5 e mult mai ieftin, dar a citit inconsistent scrisul de mână din tabel (hectare pierdute, linii omise sau puse la altă categorie); Sonnet 5.5 a citit corect titlul de test în ~7,5 s. Funcția oprește „gândirea” (`thinkingParam`) și are `max_tokens` 8192.
- Limita Netlify pentru funcții sincrone e 10 s: titlurile mari se pot apropia de ea. Dacă apare „eroare server 504”, ridică limita în Netlify (Site configuration → Functions).
- Structura formularului din titlu (în promptul funcției): tabelul A = extravilan, B = intravilan. Rândurile tipărite: 1 Arabil, 2 Vii, 3 Livezi, 4 Pășuni, 5 Fânețe, **6 Păduri (extravilan) / Curți-construcții (intravilan)**, 7 Alte terenuri. Suprafața = Ha × 10000 + mp (două coloane).
- Categoriile din aplicație: `CATEGORII` în `index.html` (aceleași valori ca în prompt). `normalizeCategorie` acceptă variante și valorile vechi („Curți-construcții / alte terenuri”, „Altele”).
- Numerotarea parcelelor (`parcelNumbers`): litera tabelului (A = extravilan, B = intravilan) + nr. rândului din titlu + ordinea liniei în aceeași categorie și același tabel: A1.1, A1.2, B5.1... Se calculează la afișare/export, nu se salvează.
- Câmpul „Suprafață totală din titlu (mp)” (`suprafataTotala` pe titlu, `f_suprafataTotala` în formular) vine din prima pagină („suprafață totală de … ha … mp”, convertită în mp) și se compară în formular cu suma parcelelor.
- După autocompletare, `checkExtractedTotals` compară suma parcelelor cu totalul din prima pagină și cu totalurile din tabele (extravilan, intravilan) și verifică ordinea crescătoare a categoriilor; la nepotrivire, `extractFromPdf` face automat o A DOUA CITIRE (`retry` în `extract.mjs`: modelul primește prima citire cu parcelele numerotate și problemele concrete, recitește liniile respective și întoarce DOAR corecturile `{corecturi, adauga, sterge, totaluri}`, aplicate de `applyPatchToData`; răspuns scurt = rapid). Rescrierea întregului JSON la a doua citire dădea 504 la titluri mari (~20 de parcele). Dacă tot rămân neconcordanțe, utilizatorul e avertizat, iar titlul apare în „Erori” la importul în masă. Limita Netlify pentru funcții sincrone: nominal 10 s (nu se poate ridica pe planul Personal), dar în practică un apel de ~14 s a reușit, iar unul de ~30 s a dat 504; ține fiecare apel sub ~20 s.
- Datele: se afișează ca zi.lună.an (ex. 05.07.1993) și se salvează ISO (an-lună-zi) în `dataEmiterii`, cu `dataFormat: 2`. Titlurile mai vechi, salvate cu ziua și luna inversate (bug în `roToIso`), se corectează la încărcare prin `fixLegacyDate`.

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
