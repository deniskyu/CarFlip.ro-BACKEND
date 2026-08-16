// ============================================================================
//  src/validation/locations.js
// ----------------------------------------------------------------------------
//  Județele și orașele, copiate LITERAL din `staticData.js` al aplicației
//  mobile (78 de intrări, inclusiv Republica Moldova).
//
//  ── DE CE NU E TEXT LIBER ─────────────────────────────────────────────────
//  `location.county` ajunge în indexul `{ is_active, location.county, _id }`
//  și în filtrele feed-ului. Un anunț salvat cu „dolj" în loc de „Dolj" nu mai
//  apare la filtrarea pe județ — nici în aplicație, nici pe site — iar dealerul
//  nu are cum să înțeleagă de ce.
//
//  Apare și în JSON-LD ca `addressRegion`, deci o formă greșită strică datele
//  structurate pe care le citește Google.
//
//  ⚠️ Când modifici lista în `staticData.js`, modific-o și aici.
// ============================================================================

export const LOCATIONS = [
    {
        judet: "Alba",
        orase: [
            "Alba Iulia",
            "Aiud",
            "Blaj",
            "Sebeș",
            "Cugir",
            "Ocna Mureș",
            "Zlatna",
            "Câmpeni",
            "Teiuș",
            "Abrud",
            "Baia de Arieș"
        ]
    },
    {
        judet: "Arad",
        orase: [
            "Arad",
            "Pecica",
            "Sântana",
            "Lipova",
            "Ineu",
            "Chișineu-Criș",
            "Nădlac",
            "Curtici",
            "Pâncota",
            "Sebiș"
        ]
    },
    {
        judet: "Argeș",
        orase: [
            "Pitești",
            "Câmpulung",
            "Curtea de Argeș",
            "Mioveni",
            "Costești",
            "Topoloveni",
            "Ștefănești"
        ]
    },
    {
        judet: "Bacău",
        orase: [
            "Bacău",
            "Onești",
            "Moinești",
            "Comănești",
            "Buhuși",
            "Dărmănești",
            "Târgu Ocna",
            "Slănic-Moldova"
        ]
    },
    {
        judet: "Bihor",
        orase: [
            "Oradea",
            "Salonta",
            "Marghita",
            "Beiuș",
            "Săcueni",
            "Aleșd",
            "Valea lui Mihai",
            "Ștei",
            "Vașcău",
            "Nucet"
        ]
    },
    {
        judet: "Bistrița-Năsăud",
        orase: [
            "Bistrița",
            "Năsăud",
            "Beclean",
            "Sângeorz-Băi"
        ]
    },
    {
        judet: "Botoșani",
        orase: [
            "Botoșani",
            "Dorohoi",
            "Darabani",
            "Săveni",
            "Flămânzi",
            "Bucecea",
            "Ștefănești"
        ]
    },
    {
        judet: "Brașov",
        orase: [
            "Brașov",
            "Făgăraș",
            "Săcele",
            "Zărnești",
            "Codlea",
            "Râșnov",
            "Victoria",
            "Predeal",
            "Rupea",
            "Ghimbav"
        ]
    },
    {
        judet: "Brăila",
        orase: [
            "Brăila",
            "Ianca",
            "Însurăței",
            "Făurei"
        ]
    },
    {
        judet: "București",
        orase: [
            "București"
        ]
    },
    {
        judet: "Buzău",
        orase: [
            "Buzău",
            "Râmnicu Sărat",
            "Nehoiu",
            "Pătârlagele",
            "Pogoanele"
        ]
    },
    {
        judet: "Caraș-Severin",
        orase: [
            "Reșița",
            "Caransebeș",
            "Bocșa",
            "Moldova Nouă",
            "Oravița",
            "Oțelu Roșu",
            "Anina",
            "Băile Herculane"
        ]
    },
    {
        judet: "Călărași",
        orase: [
            "Călărași",
            "Oltenița",
            "Budești",
            "Fundulea",
            "Lehliu Gară"
        ]
    },
    {
        judet: "Cluj",
        orase: [
            "Cluj-Napoca",
            "Turda",
            "Dej",
            "Câmpia Turzii",
            "Gherla",
            "Huedin"
        ]
    },
    {
        judet: "Constanța",
        orase: [
            "Constanța",
            "Medgidia",
            "Mangalia",
            "Năvodari",
            "Cernavodă",
            "Ovidiu",
            "Murfatlar",
            "Hârșova",
            "Eforie",
            "Techirghiol",
            "Băneasa",
            "Negru Vodă"
        ]
    },
    {
        judet: "Covasna",
        orase: [
            "Sfântu Gheorghe",
            "Târgu Secuiesc",
            "Covasna",
            "Baraolt",
            "Întorsura Buzăului"
        ]
    },
    {
        judet: "Dâmbovița",
        orase: [
            "Târgoviște",
            "Moreni",
            "Pucioasa",
            "Găești",
            "Titu",
            "Fieni",
            "Răcari"
        ]
    },
    {
        judet: "Dolj",
        orase: [
            "Craiova",
            "Băilești",
            "Calafat",
            "Filiași",
            "Dăbuleni",
            "Segarcea",
            "Bechet"
        ]
    },
    {
        judet: "Galați",
        orase: [
            "Galați",
            "Tecuci",
            "Târgu Bujor",
            "Berești"
        ]
    },
    {
        judet: "Giurgiu",
        orase: [
            "Giurgiu",
            "Bolintin-Vale",
            "Mihăilești"
        ]
    },
    {
        judet: "Gorj",
        orase: [
            "Târgu Jiu",
            "Motru",
            "Rovinari",
            "Bumbești-Jiu",
            "Târgu Cărbunești",
            "Turceni",
            "Tismana",
            "Novaci",
            "Ticleni"
        ]
    },
    {
        judet: "Harghita",
        orase: [
            "Miercurea Ciuc",
            "Odorheiu Secuiesc",
            "Gheorgheni",
            "Toplița",
            "Cristuru Secuiesc",
            "Vlăhița",
            "Bălan",
            "Borsec",
            "Băile Tușnad"
        ]
    },
    {
        judet: "Hunedoara",
        orase: [
            "Deva",
            "Hunedoara",
            "Petroșani",
            "Vulcan",
            "Lupeni",
            "Petrila",
            "Orăștie",
            "Brad",
            "Simeria",
            "Călan",
            "Hațeg",
            "Uricani",
            "Geoagiu",
            "Aninoasa"
        ]
    },
    {
        judet: "Ialomița",
        orase: [
            "Slobozia",
            "Fetești",
            "Urziceni",
            "Țăndărei",
            "Amara",
            "Fierbinți-Târg",
            "Căzănești"
        ]
    },
    {
        judet: "Iași",
        orase: [
            "Iași",
            "Pașcani",
            "Hârlău",
            "Târgu Frumos",
            "Podu Iloaiei"
        ]
    },
    {
        judet: "Ilfov",
        orase: [
            "Voluntari",
            "Pantelimon",
            "Buftea",
            "Popești-Leordeni",
            "Bragadiru",
            "Chitila",
            "Otopeni",
            "Măgurele"
        ]
    },
    {
        judet: "Maramureș",
        orase: [
            "Baia Mare",
            "Sighetu Marmației",
            "Borșa",
            "Vișeu de Sus",
            "Baia Sprie",
            "Târgu Lăpuș",
            "Seini",
            "Șomcuta Mare",
            "Ulmeni",
            "Tăuții-Măgherăuș",
            "Cavnic",
            "Săliștea de Sus",
            "Dragomirești"
        ]
    },
    {
        judet: "Mehedinți",
        orase: [
            "Drobeta-Turnu Severin",
            "Orșova",
            "Strehaia",
            "Vânju Mare",
            "Baia de Aramă"
        ]
    },
    {
        judet: "Mureș",
        orase: [
            "Târgu Mureș",
            "Reghin",
            "Sighișoara",
            "Târnăveni",
            "Luduș",
            "Sovata",
            "Iernut",
            "Sângeorgiu de Pădure",
            "Ungheni",
            "Sărmașu",
            "Miercurea Nirajului"
        ]
    },
    {
        judet: "Neamț",
        orase: [
            "Piatra Neamț",
            "Roman",
            "Târgu Neamț",
            "Roznov",
            "Bicaz"
        ]
    },
    {
        judet: "Olt",
        orase: [
            "Slatina",
            "Caracal",
            "Balș",
            "Corabia",
            "Scornicești",
            "Drăgănești-Olt",
            "Piatra-Olt",
            "Potcoava"
        ]
    },
    {
        judet: "Prahova",
        orase: [
            "Ploiești",
            "Câmpina",
            "Băicoi",
            "Breaza",
            "Mizil",
            "Comarnic",
            "Vălenii de Munte",
            "Boldești-Scăeni",
            "Urlați",
            "Sinaia",
            "Bușteni",
            "Plopeni",
            "Slănic",
            "Azuga"
        ]
    },
    {
        judet: "Satu Mare",
        orase: [
            "Satu Mare",
            "Carei",
            "Negrești-Oaș",
            "Tășnad",
            "Livada",
            "Ardud"
        ]
    },
    {
        judet: "Sălaj",
        orase: [
            "Zalău",
            "Șimleu Silvaniei",
            "Jibou",
            "Cehu Silvaniei"
        ]
    },
    {
        judet: "Sibiu",
        orase: [
            "Sibiu",
            "Mediaș",
            "Cisnădie",
            "Avrig",
            "Agnita",
            "Dumbrăveni",
            "Tălmaciu",
            "Copșa Mică",
            "Săliște",
            "Miercurea Sibiului",
            "Ocna Sibiului"
        ]
    },
    {
        judet: "Suceava",
        orase: [
            "Suceava",
            "Fălticeni",
            "Rădăuți",
            "Câmpulung Moldovenesc",
            "Vatra Dornei",
            "Vicovu de Sus",
            "Gura Humorului",
            "Dolhasca",
            "Liteni",
            "Salcea",
            "Siret",
            "Cajvana",
            "Frasin",
            "Broșteni",
            "Milișăuți",
            "Solca"
        ]
    },
    {
        judet: "Teleorman",
        orase: [
            "Alexandria",
            "Roșiorii de Vede",
            "Turnu Măgurele",
            "Zimnicea",
            "Videle"
        ]
    },
    {
        judet: "Timiș",
        orase: [
            "Timișoara",
            "Lugoj",
            "Sânnicolau Mare",
            "Jimbolia",
            "Recaș",
            "Făget",
            "Buziaș",
            "Deta",
            "Gătaia",
            "Ciacova"
        ]
    },
    {
        judet: "Tulcea",
        orase: [
            "Tulcea",
            "Babadag",
            "Măcin",
            "Isaccea",
            "Sulina"
        ]
    },
    {
        judet: "Vaslui",
        orase: [
            "Vaslui",
            "Bârlad",
            "Huși",
            "Negrești",
            "Murgeni"
        ]
    },
    {
        judet: "Vâlcea",
        orase: [
            "Râmnicu Vâlcea",
            "Drăgășani",
            "Băbeni",
            "Călimănești",
            "Horezu",
            "Brezoi",
            "Bălcești",
            "Berbești",
            "Băile Govora",
            "Băile Olănești",
            "Ocnele Mari"
        ]
    },
    {
        judet: "Vrancea",
        orase: [
            "Focșani",
            "Adjud",
            "Mărășești",
            "Panciu",
            "Odobești"
        ]
    },
    {
        judet: "Chișinău (MD)",
        orase: [
            "Chișinău",
            "Codru",
            "Durlești",
            "Sîngera",
            "Vadul lui Vodă",
            "Vatra"
        ]
    },
    {
        judet: "Bălți (MD)",
        orase: [
            "Bălți"
        ]
    },
    {
        judet: "Anenii Noi (MD)",
        orase: [
            "Anenii Noi"
        ]
    },
    {
        judet: "Basarabeasca (MD)",
        orase: [
            "Basarabeasca"
        ]
    },
    {
        judet: "Briceni (MD)",
        orase: [
            "Briceni",
            "Lipcani"
        ]
    },
    {
        judet: "Cahul (MD)",
        orase: [
            "Cahul"
        ]
    },
    {
        judet: "Cantemir (MD)",
        orase: [
            "Cantemir"
        ]
    },
    {
        judet: "Călărași (MD)",
        orase: [
            "Călărași"
        ]
    },
    {
        judet: "Căușeni (MD)",
        orase: [
            "Căușeni",
            "Căinari"
        ]
    },
    {
        judet: "Cimișlia (MD)",
        orase: [
            "Cimișlia"
        ]
    },
    {
        judet: "Criuleni (MD)",
        orase: [
            "Criuleni"
        ]
    },
    {
        judet: "Dondușeni (MD)",
        orase: [
            "Dondușeni"
        ]
    },
    {
        judet: "Drochia (MD)",
        orase: [
            "Drochia"
        ]
    },
    {
        judet: "Dubăsari (MD)",
        orase: [
            "Cocieri"
        ]
    },
    {
        judet: "Edineț (MD)",
        orase: [
            "Edineț",
            "Cupcini"
        ]
    },
    {
        judet: "Fălești (MD)",
        orase: [
            "Fălești"
        ]
    },
    {
        judet: "Florești (MD)",
        orase: [
            "Florești",
            "Ghindești",
            "Mărculești"
        ]
    },
    {
        judet: "Glodeni (MD)",
        orase: [
            "Glodeni"
        ]
    },
    {
        judet: "Hîncești (MD)",
        orase: [
            "Hîncești"
        ]
    },
    {
        judet: "Ialoveni (MD)",
        orase: [
            "Ialoveni"
        ]
    },
    {
        judet: "Leova (MD)",
        orase: [
            "Leova",
            "Iargara"
        ]
    },
    {
        judet: "Nisporeni (MD)",
        orase: [
            "Nisporeni"
        ]
    },
    {
        judet: "Ocnița (MD)",
        orase: [
            "Ocnița",
            "Otaci",
            "Frunză"
        ]
    },
    {
        judet: "Orhei (MD)",
        orase: [
            "Orhei"
        ]
    },
    {
        judet: "Rezina (MD)",
        orase: [
            "Rezina"
        ]
    },
    {
        judet: "Rîșcani (MD)",
        orase: [
            "Rîșcani",
            "Costești"
        ]
    },
    {
        judet: "Sîngerei (MD)",
        orase: [
            "Sîngerei",
            "Biruința"
        ]
    },
    {
        judet: "Soroca (MD)",
        orase: [
            "Soroca"
        ]
    },
    {
        judet: "Strășeni (MD)",
        orase: [
            "Strășeni",
            "Bucovăț"
        ]
    },
    {
        judet: "Șoldănești (MD)",
        orase: [
            "Șoldănești"
        ]
    },
    {
        judet: "Ștefan Vodă (MD)",
        orase: [
            "Ștefan Vodă"
        ]
    },
    {
        judet: "Taraclia (MD)",
        orase: [
            "Taraclia",
            "Tvardița"
        ]
    },
    {
        judet: "Telenești (MD)",
        orase: [
            "Telenești"
        ]
    },
    {
        judet: "Ungheni (MD)",
        orase: [
            "Ungheni",
            "Cornești"
        ]
    },
    {
        judet: "Găgăuzia (MD)",
        orase: [
            "Comrat",
            "Ceadîr-Lunga",
            "Vulcănești"
        ]
    },
    {
        judet: "Stânga Nistrului (MD)",
        orase: [
            "Tiraspol",
            "Bender",
            "Rîbnița",
            "Dubăsari",
            "Slobozia",
            "Camenca",
            "Grigoriopol",
            "Dnestrovsc"
        ]
    }
];

/** Toate denumirile de județe, pentru validare rapidă. */
export const COUNTIES = LOCATIONS.map((l) => l.judet);

const CITY_MAP = new Map(LOCATIONS.map((l) => [l.judet, new Set(l.orase)]));

/** Orașele unui județ. Array gol dacă județul nu există. */
export const citiesOf = (county) => {
    const entry = LOCATIONS.find((l) => l.judet === county);
    return entry ? entry.orase : [];
};

/**
 * Verifică perechea județ + oraș.
 * Nu e suficient ca ambele să existe separat: „Craiova, Cluj" ar trece o
 * validare care le verifică independent, dar e o locație inexistentă.
 */
export const isValidLocation = (county, city) => {
    const set = CITY_MAP.get(county);
    return !!set && set.has(city);
};

export default { LOCATIONS, COUNTIES, citiesOf, isValidLocation };
