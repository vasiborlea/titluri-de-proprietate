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
 "parcele": [
   {"tip":"Extravilan sau Intravilan","categorie":"una din: Arabil, Vii, Livezi, Pășuni, Fânețe, Păduri, Curți-construcții / alte terenuri, Altele","tarla":"","parcela":"","suprafata":"","vecinN":"","vecinE":"","vecinS":"","vecinV":"","observatii":""}
 ]
}
Reguli:
- dataEmiterii: pe titlurile românești, data e scrisă întotdeauna ca ZI.LUNĂ.AN (ex: "08.09.2006" înseamnă ziua 8, luna 9 — septembrie — NU luna 8/august). Nu presupune formatul american lună-zi-an. Convertește mereu în format YYYY-MM-DD (an-lună-zi) păstrând corect ziua și luna citite.
- suprafata doar cifre, în mp (dacă e dat în ha și mp, convertește tot în mp).
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
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' }
});

// Verifică tokenul Google trimis de aplicație: să fie emis pentru aplicația noastră
// (GOOGLE_CLIENT_ID) și, opțional, să aparțină unui e-mail din ALLOWED_EMAILS.
async function verifyCaller(token) {
  if (!token) return { ok: false, msg: 'Lipsește autentificarea Google.' };
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token));
  if (!r.ok) return { ok: false, msg: 'Sesiune Google expirată sau invalidă.' };
  const info = await r.json();
  const expectedClient = process.env.GOOGLE_CLIENT_ID;
  if (expectedClient && info.aud !== expectedClient) return { ok: false, msg: 'Token emis pentru altă aplicație.' };
  if (ALLOWED_EMAILS.length) {
    let email = (info.email || '').toLowerCase();
    if (!email) {
      const a = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (a.ok) email = ((await a.json()).user?.emailAddress || '').toLowerCase();
    }
    if (!ALLOWED_EMAILS.includes(email)) return { ok: false, msg: 'Contul Google nu are voie să folosească autocompletarea.' };
  }
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

  const auth = await verifyCaller(body.googleToken);
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
      max_tokens: 4096,
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

  const text = (out.content || []).map(b => b.text || '').join('');
  const clean = text.replace(/```json|```/g, '').trim();
  let data;
  try { data = JSON.parse(clean); }
  catch {
    return json(200, { truncated: out.stop_reason === 'max_tokens', error: out.stop_reason === 'max_tokens' ? 'Răspuns AI întrerupt (prea multe parcele).' : 'Nu am putut interpreta răspunsul AI.' });
  }
  return json(200, { data });
};

export const config = { path: '/api/extract' };
