// Netlify Function: citește un PDF de titlu și întoarce datele extrase.
// Cheia Anthropic vine DOAR din variabila de mediu ANTHROPIC_API_KEY (Netlify > Site settings > Environment variables).
// Nu există niciun secret în browser.

const PROMPT_BASE = `Ești un asistent care citește titluri de proprietate românești (ANCPI, Legea 18/1991) scanate, inclusiv câmpuri completate de mână, și extrage datele într-un JSON strict.

Răspunde DOAR cu acest JSON, fără text suplimentar, fără fence-uri de cod:
{
 "numarTitlu": "", "cod": "", "judet": "",
 "dataEmiterii": "", "cetatean": "", "defunct": "", "mostenitori": "",
 "sat": "", "comuna": "", "satAmplasament": "", "comunaAmplasament": "",
 "observatii": "",
 "suprafataTotalaMp": "", "totalExtravilanMp": "", "totalIntravilanMp": "", "totalGeneralMp": "",
 "parcele": [
   {"tip":"Extravilan sau Intravilan","categorie":"una din: Arabil, Vii, Livezi, Pășuni, Fânețe, Păduri, Curți-construcții, Alte terenuri","tarla":"","parcela":"","suprafata":"","vecinN":"","vecinE":"","vecinS":"","vecinV":"","observatii":""}
 ]
}
Reguli:
- dataEmiterii: pe titlurile românești, data e scrisă întotdeauna ca ZI.LUNĂ.AN (ex: "08.09.2006" înseamnă ziua 8, luna 9 — septembrie — NU luna 8/august). Nu presupune formatul american lună-zi-an. Convertește mereu în format YYYY-MM-DD (an-lună-zi) păstrând corect ziua și luna citite.
- STRUCTURA FORMULARULUI cu suprafețele: sunt două tabele. „A. Suprafața primită în EXTRAVILAN” (tip = Extravilan) și „B. Suprafața primită în INTRAVILAN” (tip = Intravilan). Rândurile tipărite (coloana NR. CRT.) sunt: în A: 1 ARABIL, 2 VII, 3 LIVEZI, 4 PĂȘUNI, 5 FÂNEȚE, 6 PĂDURI, 7 ALTE TERENURI NEAGRICOLE; în B: 1 ARABIL, 2 VII, 3 LIVEZI, 4 PĂȘUNI, 5 FÂNEȚE, 6 CURȚI, CONSTRUCȚII, 7 ALTE TERENURI. ATENȚIE: rândul 6 e „Păduri” în extravilan, dar „Curți-construcții” în intravilan; rândul 7 se scrie „Alte terenuri” în ambele.
- Fiecare rând tipărit e un BLOC cu mai multe linii pentru scris de mână. Categoria unei linii scrise este cea a BLOCULUI TIPĂRIT în care se află linia (după coloana NR. CRT. / CATEGORIA din stânga), nu ce scrie în vecinități sau observații. Un bloc poate avea mai multe linii scrise (ex. 3 la Arabil, 2 la Fânețe): extrage FIECARE linie scrisă ca parcelă separată, de sus în jos, fără să sari vreo linie și fără să unești liniile. Scrie categoria EXACT cu una din valorile din listă.
- Numele de persoane și de locuri (vecinătăți, observații) se scriu EXACT cum apar în titlu, păstrând majusculele (ex. „TARBA I.”, „PAJUNE COM.”), fără să le convertești în litere mici.
- ORDINEA liniilor: într-un tabel, de sus în jos, numerele de rând (nr. crt.) ale liniilor scrise sunt CRESCĂTOARE (ex. 1,1,1,5,5,6,7); o linie scrisă nu poate aparține unui bloc aflat DEASUPRA blocului liniei precedente. Dacă o linie pare să aparțină unui bloc mai sus (ex. „Pășuni” după „Fânețe”), ai ales greșit blocul: uită-te din nou între ce linii orizontale tipărite se află și alege blocul în care se află efectiv. Atenție: liniile scrise vin una sub alta, deci copiază fiecare vecinătate de pe ACEEAȘI linie orizontală, nu de pe linia de deasupra sau de dedesubt.
- suprafata: număr întreg în mp, calculat din cele DOUĂ coloane ale tabelului: suprafata = Ha × 10000 + mp. Exemple: Ha „1” și mp „5000” = 15000; Ha „-” sau gol (0 hectare) și mp „8000” = 8000; Ha „2” și mp „0000” = 20000. Nu omite niciodată coloana Ha: verific-o la fiecare linie (cifra de hectare e scrisă mic, înaintea celei de mp).
- suprafataTotalaMp: pe PRIMA pagină, în fraza „primește în proprietate o suprafață totală de ___ ha ___ mp” citește cele două numere și convertește în mp: Ha × 10000 + mp (ex. „1 ha 4500 mp” = 14500; „6 ha 8000 mp” = 68000). E totalul pe care trebuie să-l însumeze toate parcelele.
- VERIFICARE OBLIGATORIE cu totalurile din titlu: sub fiecare tabel e un rând „TOTAL” (extravilan, respectiv intravilan), iar în dreapta e „TOTAL GENERAL (A+B)” cu „din care: Arabil, Vii, Livezi, Pășuni, Fânețe, Păduri, Curți construcții, Alte terenuri”. Citește-le în totalExtravilanMp, totalIntravilanMp și totalGeneralMp (în mp, Ha × 10000 + mp; lasă gol dacă nu sunt completate). Suma suprafețelor parcelelor extrase, pe fiecare tabel, trebuie să fie egală cu aceste totaluri; dacă nu e, ai citit greșit o cifră sau ai omis o linie: recitește tabelul înainte de a răspunde.
- Dacă un câmp nu poate fi descifrat cu certitudine (scris neclar, șters, ambiguu), lasă-l gol ("") — nu ghici și nu inventa valori.
- Include câte un obiect în "parcele" pentru fiecare linie din tabelul de suprafețe (atât extravilan cât și intravilan, dacă există).
- Coloana OBSERVAȚII de lângă fiecare parcelă conține adesea nume de loc sau note (ex: "sub Făget", "Văgaș", "grădina casei", "DOS", "hirește", "după văgaș", "sub cot"). E ULTIMA coloană din tabel, uneori îngustă sau cu scris foarte mărunt/prescurtat — verific-o cu atenție maximă pentru FIECARE rând de parcelă, chiar dacă alte rânduri din același tabel nu au nimic scris acolo. Nu lăsa gol acest câmp doar pentru că e greu de citit — încearcă activ să descifrezi, și lasă gol doar dacă e cu adevărat ilizibil sau vizual gol.
- ATENȚIE la rândurile de categorie suprascrise de mână: dacă o categorie (ex. "Arabil") are mai multe parcele decât rânduri tipărite disponibile, persoana taie eticheta tipărită a categoriei următoare goale (de obicei "Vii" sau "Livezi", imediat sub categoria plină) și scrie de mână categoria reală (ex. "ARABIL") peste sau lângă eticheta tăiată, ca să mai adauge un rând pentru acea categorie. În acest caz, folosește OBLIGATORIU categoria scrisă de mână pentru acel rând, NU eticheta tipărită original — chiar dacă eticheta tipărită rămâne parțial vizibilă dedesubt. Nu lăsa categoria goală sau cu "-" într-un astfel de caz — caută explicit scris de mână lângă/peste etichetele tipărite din stânga tabelului. Dacă scrisul de mână de acolo e prea neclar ca să-l descifrezi cu certitudine, dar rândul respectiv are suprafață completată și e poziționat imediat după un bloc continuu de parcele dintr-o singură categorie (fără nicio categorie diferită clar indicată între ele), presupune că parcela continuă ACEEAȘI categorie ca blocul anterior de deasupra ei — NU lăsa categoria goală sau "-" doar pentru că eticheta tipărită originală (Vii/Livezi/etc.) nu se potrivește cu ce pare scris de mână.
- ATENȚIE, nu amesteca niciodată coloanele Nord/Est/Sud/Vest (vecinătăți) cu coloana OBSERVAȚII — sunt coloane complet diferite, de obicei cu OBSERVAȚII ultima, separată printr-o linie. Vecinătățile conțin de regulă nume de persoane (ex. "Onica N.") sau termeni ca "drum", "pârâu"; observațiile conțin nume de loc sau note (ex. "hirește", "după văgaș", "sub cot", "făget", "delă obor"). Pe multe scanuri, textul din coloana OBSERVAȚII e scris înghesuit și se poate întinde pe două rânduri de scris în interiorul aceleiași celule (wrap) — citește ambele rânduri de scris ca aparținând ACELEIAȘI parcele (linia orizontală curentă din tabel), nu ca aparținând parcelei de dedesubt. Verifică pe orizontală, rând cu rând: fiecare parcelă are exact 4 vecinătăți + o observație, aliniate pe aceeași linie a tabelului — nu lăsa conținutul să "alunece" cu o poziție în jos sau în sus între coloane.
- "cetatean" e persoana declarantă de pe prima pagină; "defunct" e numele celui decedat (dacă titlul e pe moștenitori); "mostenitori" e lista moștenitorilor.
- ATENȚIE, sunt DOUĂ locații diferite pe prima pagină, nu le confunda: "sat" și "comuna" sunt din fraza "din satul ___, comuna/orașul/municipiul ___" (adresa declarantului). "satAmplasament" și "comunaAmplasament" sunt din fraza "situată pe teritoriul satului/comunei/orașului/municipiului ___" (unde e situat efectiv terenul) — de multe ori sunt aceleași localități, dar nu presupune asta, citește-le separat din text.
- ATENȚIE, unele PDF-uri conțin ACELAȘI titlu scanat de două ori (de exemplu 4 pagini: prima pereche de pagini e o scanare a titlului, a doua pereche e o a doua scanare a aceluiași titlu, poate mai clară sau mai neclară decât prima). Recunoaște acest caz — verifică dacă paginile ulterioare repetă același număr de titlu și același cetățean ca paginile anterioare. Dacă da, NU trata a doua scanare ca titlu sau parcele suplimentare: tratează-le ca aceeași sursă și, pentru fiecare câmp în parte, alege sau combină informația din varianta mai lizibilă dintre cele două scanări (de exemplu, dacă suprafața e clară doar în a doua scanare dar neclară în prima, folosește-o pe cea clară). Rezultatul final trebuie să conțină un singur titlu, cu o singură listă de parcele, nu duplicate.`;

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const MAX_PDF_BYTES = 4 * 1024 * 1024; // ~4 MB brut => ~5.4 MB base64, sub limita de 6 MB a Netlify
const MAX_OUTPUT_TOKENS = 8192;        // JSON-ul unui titlu are rar peste ~3000 de tokeni

// Extragerea nu are nevoie de „gândire”: la modelele care o pornesc implicit (ex. Haiku 5.5) tokenii de gândire
// se scad din max_tokens și răspunsul JSON se taie la jumătate. Oprim gândirea, în forma acceptată de fiecare model.
function thinkingParam(model) {
  if (/sonnet-5-5|opus-5-5|opus-5\b|fable|mythos/.test(model)) return /sonnet-5-5/.test(model) ? { thinking: { type: 'between_tools' } } : {};
  if (/haiku-5-5|sonnet-4-6|opus-4-[678]|sonnet-5\b/.test(model)) return { thinking: { type: 'disabled' } };
  return {};
}

// Modelul poate înconjura JSON-ul cu text sau fence-uri de cod: păstrăm doar de la prima „{” până la ultima „}”.
function extractJsonObject(text) {
  const s = text.replace(/```json|```/g, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  return a >= 0 && b > a ? s.slice(a, b + 1) : s.trim();
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' }
});

// Verifică tokenul de autentificare Firebase (ID token) trimis de aplicație:
// 1) să fie valid pentru proiectul nostru Firebase (verificat de Google prin accounts:lookup cu cheia web din FIREBASE_CONFIG), cu e-mail verificat;
// 2) contul să aibă acces la date: facem o citire minimă în Firestore CU tokenul utilizatorului, deci o decid chiar
//    regulile Firestore (administratorul + conturile din Setări). Nu mai există o listă separată de e-mailuri aici.
let FIREBASE_API_KEY = '';
let FIREBASE_PROJECT_ID = '';
try {
  const fc = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
  FIREBASE_API_KEY = fc.apiKey || '';
  FIREBASE_PROJECT_ID = fc.projectId || '';
} catch { /* neconfigurat */ }

async function verifyCaller(idToken) {
  if (!idToken) return { ok: false, msg: 'Lipsește autentificarea.' };
  if (!FIREBASE_API_KEY || !FIREBASE_PROJECT_ID) return { ok: false, msg: 'FIREBASE_CONFIG nu este setat în Netlify.' };
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(FIREBASE_API_KEY), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  if (!r.ok) return { ok: false, msg: 'Sesiune expirată sau invalidă.' };
  const user = ((await r.json()).users || [])[0];
  if (!user || !user.email || !user.emailVerified) return { ok: false, msg: 'Cont fără e-mail verificat.' };

  const probe = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/(default)/documents/titles?pageSize=1`,
    { headers: { Authorization: 'Bearer ' + idToken } }
  );
  if (!probe.ok) return { ok: false, msg: 'Contul nu are acces la aplicație.' };
  return { ok: true };
}

function buildPrompt(vocab) {
  const words = (Array.isArray(vocab) ? vocab : [])
    .filter(w => typeof w === 'string')
    .map(w => w.replace(/[^A-Za-zĂÂÎȘȚăâîșț\- ]/g, '').trim())
    .filter(w => w.length >= 2 && w.length <= 40)
    .slice(0, 150);
  if (!words.length) return PROMPT_BASE;
  return PROMPT_BASE + `

Cuvinte/nume de loc deja cunoscute din alte titluri ale acestui registru (observații, denumiri de locuri): ${words.join(', ')}.
Dacă un cuvânt scris de mână pe scanul curent seamănă foarte mult cu unul din lista de mai sus (posibil o literă citită ambiguu, ex. M/H, ex. "MAJAR" vs "HAJAR"), preferă ortografia din listă, ca variantele să rămână consistente în registru — dar nu forța o potrivire dacă cuvântul de pe scan e clar diferit.`;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Metodă nepermisă.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json(500, { error: 'ANTHROPIC_API_KEY nu este setată în Netlify (Environment variables).' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Cerere invalidă.' }); }

  const auth = await verifyCaller(body.idToken);
  if (!auth.ok) return json(401, { error: auth.msg });

  const b64 = body.pdfBase64;
  if (typeof b64 !== 'string' || !b64) return json(400, { error: 'Lipsește PDF-ul.' });
  if (b64.length * 0.75 > MAX_PDF_BYTES) {
    return json(413, { error: 'PDF prea mare pentru autocompletare (limită ~4 MB). Completează manual sau comprimă scanul.' });
  }

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      ...thinkingParam(MODEL),
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
          { type: 'text', text: buildPrompt(body.vocab) }
        ]
      }]
    })
  });

  const out = await resp.json().catch(() => ({}));
  if (!resp.ok || out.error) {
    return json(resp.status >= 400 ? resp.status : 502, { error: out.error?.message || 'Eroare la serviciul AI.' });
  }

  const text = (out.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('');
  let data;
  try { data = JSON.parse(extractJsonObject(text)); }
  catch {
    const truncated = out.stop_reason === 'max_tokens';
    console.log('extract: răspuns ne-interpretabil', JSON.stringify({ model: MODEL, stop_reason: out.stop_reason, usage: out.usage, chars: text.length }));
    return json(200, {
      truncated,
      error: truncated ? 'Răspuns AI întrerupt (prea multe parcele).' : 'Nu am putut interpreta răspunsul AI.',
      debug: { stop_reason: out.stop_reason, usage: out.usage }
    });
  }
  return json(200, { data });
};

export const config = { path: '/api/extract' };
