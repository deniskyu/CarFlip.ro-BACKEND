import { html } from '../html.js';

// ============================================================================
//  src/site/legal/texts.js
// ----------------------------------------------------------------------------
//  Cele trei documente legale, ca ȘABLOANE UNICE cu injectare din `parcModel`.
//  Se scriu o dată, se completează singure pentru fiecare site. Zero muncă per
//  client.
//
//  ── DE CE SUNT SCURTE ─────────────────────────────────────────────────────
//  Pentru că site-ul e un CATALOG DE PREZENTARE, nu un magazin online. Nu se
//  încheie niciun contract la distanță, nu se acceptă plăți, nu există comenzi
//  și nu există formulare. Asta elimină, corect și complet:
//    • dreptul de retragere în 14 zile (nu există contract la distanță)
//    • termenii de livrare și de plată
//    • politica de retur
//    • consimțământul pentru cookie-uri (doar cookie-uri strict necesare)
//
//  Un șablon copiat de la un magazin online ar promite lucruri false — un risc
//  legal mai mare decât un text scurt și corect.
//
//  ⚠️ ESTE UN PUNCT DE PLECARE SOLID, NU CONSULTANȚĂ JURIDICĂ. Textul acoperă
//  cerințele uzuale, dar înainte de primul client plătitor merită trecut o dată
//  pe la un avocat. Costă puțin și îl folosești pe toate site-urile.
// ============================================================================

const CARFLIP = 'CarFlip';
const CARFLIP_URL = 'https://car-flip.com';

const shared = (parc) => ({
    firma: parc.company_name,
    cui: parc.company_cui,
    reg: parc.company_reg,
    sediu: parc.company_address,
    site: `${parc.subdomain}.car-flip.com`,
    nume: parc.display_name,
    oras: parc.city,
    judet: parc.county,
    adresa: parc.address,
    telefon: parc.phone,
    email: parc.email || null,
});

// ════════════════════════════════════════════════════════════════════════════

const termeni = (p) => html`
<p>Prezentul document stabilește condițiile de utilizare a site-ului
<strong>${p.site}</strong>, denumit în continuare „Site-ul".</p>

<h2>1. Identificarea operatorului</h2>
<p>Site-ul este administrat de <strong>${p.firma}</strong>, cu sediul social în
${p.sediu}, înregistrată la Registrul Comerțului sub nr. ${p.reg}, cod unic de
înregistrare ${p.cui}.</p>
<p>Punct de lucru: ${p.adresa}, ${p.oras}, județul ${p.judet}.<br>
Telefon: +${p.telefon}${p.email ? html`<br>Email: ${p.email}` : ''}</p>

<h2>2. Natura Site-ului</h2>
<p>Site-ul are caracter exclusiv de <strong>prezentare și informare</strong>. Prin
intermediul lui nu se pot plasa comenzi, nu se efectuează plăți și nu se încheie
contracte la distanță.</p>
<p>Informațiile despre autovehicule reprezintă o invitație de a intra în
negocieri, nu o ofertă fermă în sensul art. 1188 Cod civil. Orice tranzacție se
încheie exclusiv la punctul de lucru, prin contract scris, în urma verificării
directe a autovehiculului de către cumpărător.</p>

<h2>3. Prețuri și disponibilitate</h2>
<p>Prețurile afișate sunt exprimate în euro și au caracter informativ. Ele pot fi
modificate fără notificare prealabilă.</p>
<p>Stocul se actualizează periodic. Un autovehicul afișat poate fi deja vândut sau
rezervat la momentul consultării Site-ului. Recomandăm confirmarea telefonică a
disponibilității înainte de deplasare.</p>

<h2>4. Acuratețea informațiilor</h2>
<p>Depunem eforturi rezonabile pentru ca descrierile, fotografiile și
specificațiile tehnice să fie corecte și actuale. Pot exista însă erori de
transcriere sau diferențe față de configurația reală.</p>
<p><strong>Datele afișate nu înlocuiesc verificarea directă.</strong> Cumpărătorul
are dreptul și este încurajat să inspecteze autovehiculul, să solicite documentele
și să efectueze verificări tehnice independente înainte de achiziție.</p>
<p>Fotografiile sunt reale și aparțin autovehiculului prezentat, cu excepția
cazurilor semnalate explicit.</p>

<h2>5. Garanție</h2>
<p>Garanția aplicabilă autovehiculelor rulate este cea prevăzută de legislația în
vigoare și de condițiile comunicate în scris la momentul vânzării. Eventualele
garanții comerciale suplimentare se stabilesc individual și se consemnează în
contract.</p>

<h2>6. Proprietate intelectuală</h2>
<p>Conținutul Site-ului — texte, fotografii, siglă — aparține ${p.firma} sau este
utilizat cu drept legal. Reproducerea fără acord scris este interzisă.</p>

<h2>7. Limitarea răspunderii</h2>
<p>${p.firma} nu răspunde pentru întreruperi temporare de funcționare, pentru
erori tehnice independente de voința sa sau pentru conținutul site-urilor terțe
către care se face trimitere.</p>

<h2>8. Găzduire tehnică</h2>
<p>Site-ul este găzduit și administrat tehnic de ${CARFLIP}
(<a href="${CARFLIP_URL}" target="_blank" rel="noopener">${CARFLIP_URL}</a>), în
calitate de furnizor de servicii. Răspunderea pentru conținutul comercial și
pentru tranzacții revine integral ${p.firma}.</p>

<h2>9. Soluționarea litigiilor</h2>
<p>Consumatorii se pot adresa Autorității Naționale pentru Protecția
Consumatorilor (<a href="https://anpc.ro" target="_blank" rel="noopener nofollow">anpc.ro</a>)
sau platformei europene de soluționare online a litigiilor
(<a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener nofollow">ec.europa.eu/consumers/odr</a>).</p>
<p>Prezentele condiții sunt guvernate de legea română.</p>

<h2>10. Modificări</h2>
<p>Ne rezervăm dreptul de a actualiza acest document. Versiunea aplicabilă este
cea publicată pe Site la momentul consultării.</p>`;

// ════════════════════════════════════════════════════════════════════════════

const confidentialitate = (p) => html`
<p>Acest document explică modul în care sunt tratate datele cu caracter personal
în legătură cu site-ul <strong>${p.site}</strong>.</p>

<h2>1. Operator de date</h2>
<p><strong>${p.firma}</strong>, ${p.sediu}, CUI ${p.cui}, Reg. Com. ${p.reg}.<br>
Telefon: +${p.telefon}${p.email ? html`<br>Email: ${p.email}` : ''}</p>

<h2>2. Ce date colectăm prin Site</h2>
<p><strong>Site-ul nu colectează date cu caracter personal.</strong> Nu există
formulare de contact, nu există cont de utilizator, nu se folosesc instrumente de
analiză a traficului și nu se folosesc pixeli de urmărire publicitară.</p>
<p>Serverul înregistrează automat, ca orice server web, date tehnice minime
(adresă IP, tip de browser, pagină accesată, momentul accesării), necesare
funcționării și securității serviciului. Acestea se păstrează pentru o perioadă
limitată și nu sunt folosite pentru profilare.</p>

<h2>3. Când ne contactați</h2>
<p>Dacă ne contactați telefonic sau prin WhatsApp, prelucrăm datele pe care ni le
comunicați (nume, număr de telefon, detalii despre autovehiculul care vă
interesează) în scopul de a răspunde solicitării dumneavoastră.</p>
<p><strong>Temei legal:</strong> demersuri precontractuale la cererea persoanei
vizate (art. 6 alin. 1 lit. b GDPR) și interesul legitim de a răspunde solicitărilor
(art. 6 alin. 1 lit. f GDPR).</p>
<p>Conversațiile purtate prin WhatsApp sunt supuse și politicii de confidențialitate
a furnizorului acelui serviciu, asupra căruia nu avem control.</p>

<h2>4. Durata păstrării</h2>
<p>Datele de contact se păstrează pe durata necesară soluționării solicitării și,
ulterior, pe termenele impuse de obligațiile legale de arhivare în cazul în care
se încheie o tranzacție.</p>

<h2>5. Destinatari</h2>
<p>Nu vindem și nu închiriem date cu caracter personal.</p>
<p>Infrastructura tehnică a Site-ului este asigurată de ${CARFLIP}, care
acționează în calitate de <strong>persoană împuternicită</strong>, exclusiv pe
baza instrucțiunilor operatorului și fără drept de a folosi datele în scop propriu.</p>
<p>Datele pot fi comunicate autorităților publice atunci când legea o impune.</p>

<h2>6. Drepturile dumneavoastră</h2>
<p>Conform Regulamentului (UE) 2016/679, aveți dreptul de acces, de rectificare,
de ștergere, de restricționare a prelucrării, de opoziție, la portabilitatea
datelor, precum și dreptul de a nu fi supus unei decizii automate.</p>
<p>Vă puteți exercita aceste drepturi contactându-ne la datele de mai sus. Aveți
de asemenea dreptul de a depune plângere la Autoritatea Națională de Supraveghere
a Prelucrării Datelor cu Caracter Personal
(<a href="https://dataprotection.ro" target="_blank" rel="noopener nofollow">dataprotection.ro</a>).</p>

<h2>7. Securitate</h2>
<p>Aplicăm măsuri tehnice și organizatorice rezonabile pentru protejarea datelor,
inclusiv transmiterea criptată a traficului (HTTPS) și acces restricționat la
sistemele de administrare.</p>

<h2>8. Minori</h2>
<p>Site-ul nu se adresează persoanelor sub 16 ani și nu colectează în cunoștință
de cauză date despre acestea.</p>`;

// ════════════════════════════════════════════════════════════════════════════

const cookies = (p) => html`
<p>Acest document explică modulele cookie folosite pe site-ul
<strong>${p.site}</strong>.</p>

<h2>1. Ce sunt cookie-urile</h2>
<p>Cookie-urile sunt fișiere text de mici dimensiuni pe care un site le stochează
în browserul dumneavoastră, pentru a-și aminti anumite informații între pagini
sau între vizite.</p>

<h2>2. Ce cookie-uri folosim</h2>
<p><strong>Site-ul nu folosește cookie-uri de analiză, de publicitate sau de
urmărire.</strong> Nu sunt integrate Google Analytics, pixeli de rețele sociale
sau alte instrumente de profilare.</p>
<p>Singurul cookie utilizat este unul <strong>strict necesar</strong>, folosit
pentru menținerea sesiunii în panoul de administrare al site-ului. Este creat
exclusiv la autentificarea administratorului și nu are legătură cu vizitatorii
obișnuiți.</p>

<table style="width:100%;border-collapse:collapse;margin:1rem 0">
  <tr style="text-align:left">
    <th style="padding:.5rem 0">Cookie</th><th>Scop</th><th>Durată</th>
  </tr>
  <tr>
    <td style="padding:.5rem 0"><code>cf_dealer_sid</code></td>
    <td>Sesiune de administrare</td>
    <td>7 zile</td>
  </tr>
</table>

<h2>3. De ce nu vedeți un banner de consimțământ</h2>
<p>Legislația impune obținerea consimțământului pentru cookie-urile care nu sunt
strict necesare funcționării. Cum Site-ul folosește exclusiv un cookie strict
necesar, nu este cerut consimțământul prealabil, ci doar informarea — pe care o
îndeplinește acest document.</p>

<h2>4. Servicii terțe încorporate</h2>
<p>Pagina de contact include o hartă furnizată de Google Maps. La încărcarea
hărții, Google poate stabili cookie-uri proprii, conform politicii sale
(<a href="https://policies.google.com/technologies/cookies" target="_blank" rel="noopener nofollow">policies.google.com</a>).
Harta se încarcă întârziat și numai pe pagina de contact.</p>

<h2>5. Controlul cookie-urilor</h2>
<p>Puteți bloca sau șterge cookie-urile din setările browserului. Blocarea
cookie-ului de sesiune împiedică autentificarea în panoul de administrare, dar nu
afectează în niciun fel consultarea Site-ului de către vizitatori.</p>`;

// ════════════════════════════════════════════════════════════════════════════

const DOCS = {
    termeni: { title: 'Termeni și condiții', build: termeni },
    confidentialitate: { title: 'Politica de confidențialitate', build: confidentialitate },
    cookies: { title: 'Politica de cookie-uri', build: cookies },
};

export const LEGAL_SLUGS = Object.keys(DOCS);

export const getLegalDoc = (slug, parc) => {
    const doc = DOCS[slug];
    if (!doc) return null;
    return { title: doc.title, content: doc.build(shared(parc)) };
};

export default { LEGAL_SLUGS, getLegalDoc };
