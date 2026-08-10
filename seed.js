#!/usr/bin/env node
// ============================================================================
//  seed.js — populează CarFlip cu cele 22 de mașini de la FisiBest (fisibest.ro).
//
//  RULARE (pe SERVER, lângă package.json — NU pe Mac, ca să fie pe același
//  Redis + filesystem ca worker-ul):
//
//      node seed.js
//
//  • Anunțurile sunt HARDCODATE mai jos (array CARS). Zero scraping la runtime.
//  • Nu atinge schema. Anunțuri normale pe contul FisiBest.
//  • Pozele (URL-uri fisibest) se descarcă temporar, apoi worker-ul le urcă în
//    R2 și le pune în media[]. ⚠️ Worker-ul (mediaWorker) trebuie să RULEZE.
//  • TOATE primesc allow_social_promo:true → dispecerul le postează eșalonat.
//  • ALL-OR-NOTHING: verifică toate, descarcă toate pozele; scrie în DB doar
//    dacă TOTUL e ok. Dacă pică ceva, nu se scrie niciun anunț.
//  • Idempotent: sare peste ce există deja (după titlu + preț pe contul FisiBest).
//
//  Cele 2 mașini adăugate manual (Skoda Octavia Scout 2015, Audi A4 B9 13.990€)
//  sunt deja EXCLUSE din listă.
// ============================================================================

import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs-extra';
import path from 'path';
import { addMonths, addDays } from 'date-fns';

import sales from './src/models/salesModel.js';
import { addMediaToQueue } from './src/mediaProcessing/mediaQueue.js';

const DEALER_ID   = '6a79c3c258e5e79394135834';
const DEALER_NAME = 'FisiBest';
const COUNTY = 'Sălaj';
const CITY   = 'Zalău';
const MAX_IMG_BYTES = 15 * 1024 * 1024;
const RAW_DIR = path.join(process.cwd(), 'temp_uploads', 'raw');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';

// ─────────────────────────────────────────────────────────────────────────────
//  CELE 22 DE MAȘINI (extrase de pe fisibest.ro)
// ─────────────────────────────────────────────────────────────────────────────
const CARS = [
    {
        "title": "Volkswagen Golf 6 Euro 5 2010",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1936,
            "name": "Golf"
        },
        "engine": {
            "capacity": "1.4 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 122,
        "price": 4800,
        "mileage": 208890,
        "production_year": 2010,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Argintiu",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 29 Decembrie 2010\n- Motorizare : 1.4 TSI ( benzina - Euro 5 ) 122 Cai putere\n- Cutie de viteze : Manuala 6+1 rapoarte + Gear change recomandation ( pt.un consum redus )\n- Rulaj : 208.890 km\n- Tara de provenienta : Germania ( cumparata de la privat )\n- Culoare : Titansilber Metallic (354)\n✅ RNS 315 - Navigatie color / Touchscreen / 3D / HDD Intern etc\n✅ Climatronic pe 2 zone, cu afisaj digital\n✅ Scaune sport, incalzite\n✅ Senzori de parcare fata si spate, cu afisaj color pe Display\n✅ Tempomat ( pilot automat ) cu functi de accelerare si franare\n✅ Senzori de ploaie si de lumini\n✅ Jante aliaj OEM VW\n✅ Carlig de remorcare, detasabil\n✅ Oglinda interioara cu penumbra automata\n✅ Sistem spalatori faruri\n✅ Cotiera fata si spate\n✅ ISOFIX\n✅ Trimuri interioare “ carbon look “\n✅ Proiectoare ceata\n✅ Oglinzi electrice / incalzite / heliomate\n✅ Volan sport din piele, in 3 spite\n✅ Computer de bord color si multifunctional\n✅ 2 Chei + alte dotari de baza\n✔️ Masina se poate achizitiona Online sau la parc. Avansul nu este obligatoriu.\nPublicat: mai 15, 2026\n<div",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/05/1-17.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/05/2-16-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/3-10-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/4-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/5-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/6-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/7-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/8-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/10-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/9-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/12-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/11-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/13-9-scaled.jpg"
        ]
    },
    {
        "title": "Audi A6 C7 Facelift S-Line 2017",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 103,
            "name": "A6"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 190,
        "price": 15490,
        "mileage": 287472,
        "production_year": 2017,
        "vin": "",
        "body_type": "Sedan",
        "color": "Negru",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 27 Septembrie 2017 ( An in Carte si in Serie - 2018 )\n- Motorizare : 2.0 TDI Ultra ( diesel - Euro 6 ) 190 Cai putere\n- Cutie de viteze : S-Tronic Generatia a 2-a ( automata - dublu ambreiaj umed ) 7+1 rapoarte + functia TipTronic pt.schimbarea vitezelor in regim manual + Padele F1 volan\n- Rulaj : 287.472 km\n- Tara de provenienta : Germania ( cumparata de la privat )\n- Masina este inmatriculata in tara cu toate actele la zi ( inclusiv Certificat Fiscal pe loc ) si trebuie doar transcrisa\n- Culoare : Brilliant Black Metallic\n- Interior : Tapiterie din piele de culoare neagra + Alcantara\n✅ Configuratia masinii : S-Line exterior / Sport Pachet interior\n✅ Masina vine cu pachetul piele 2 ( extins ) pe consola centrala, cotiere si ponouri usi, volan etc\n✅ Faruri Bi-Xenon adaptive / kurvenlight / cornering / lumini de zi LED\n✅ Camera la mers inapoi\n✅ Pavilion negru S-Line\n✅ Trapa electrica si multifunctionala\n✅ Bose Sorround Sound - Sistem audio Profesional\n✅ Deluxe Climatronic pe 4 zone, cu afisaj digital fata si spate\n✅ Audi drive select® : 5 moduri de condus : Efficiency / Normal / Confort / Dynamic / Individual\n✅ Scaune sport, incalzite\n✅ KeyLess GO - Pornirea si oprirea masinii se face de la buton, fara a se introduce cheia\n✅ Senzori de parcare fata si spate, cu afisaj pe Display\n✅ Suspensie sport S-Line\n✅ Incarcare Smartphone Wireless, prin inductie\n✅ Padele F1 volan\n✅ Jante aliaj Audi Sport R19\n✅ Start / Stop cu functia de",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/05/1-5.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/05/2-3-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/3-16-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/4-15-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/5-14-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/6-15-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/7-15-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/8-14-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/9-15-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/10-15-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/11-15-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/12-15-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/13-15-scaled.jpg"
        ]
    },
    {
        "title": "Volkswagen Sharan Facelift 2015",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1959,
            "name": "Sharan"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 150,
        "price": 8990,
        "mileage": 261753,
        "production_year": 2015,
        "vin": "",
        "body_type": "Minivan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 27 Noiembrie 2015 ( An in Carte si in Serie - 2016 )\n- Motorizare : 2.0 TDI ( diesel - Euro 6 ) 150 Cai putere\n- Cutie de viteze : DSG DQ250 ( automata - dublu ambreiaj ) 6+1 rapoarte + functia TipTronic pt.schimbarea vitezelor in regim manual\n- Rulaj : 261.753 km\n- Tara de provenienta : Germania ( cumparata de la privat ) - Un Singur Proprietar : Fritz Gustav\n✅ Climatronic pe 3 zone, cu afisaj digital si senzor de impact\n✅ Composition Media - Navigatie mare, cu toate functiile aferente inclusiv CarNEt\n✅ Scaune incalzite\n✅ Jante aliaj R18\n✅ 7 Locuri : 2 / 3 / 2\n✅ Senzori de parcare fata si spate, cu afisaj color pe Navigatie\n✅ Volan din piele, in 3 spite\n✅ Oglinzi electrice / incalzite / heliomate\n✅ Servotronic - Directie asistata electric si electronic “ sensibila “ la viteza\n✅ Toate scaunele sunt reglabila, pliabile si cele din mijloc se pot si lua jos\n✅ Acoustics packag” „Extra”\n✅ Stopuri cu tehnologie LED\n✅ Start / Stop cu functia de franare regenerativa\n✅ 4 Geamuri electrice\n✅ Incalzire Auxiliara\n✅ Auto Hold / Asistenta la pornire din rampa\n✅ Blocatoare electrice pentru geamuri si usi spate\n✅ Senzori de ploaie / lumini / presiune in anvelope\n✅ ISOFIX\n✅ Geamuri spate si luneta din sticla termoizolanta, tratata impotriva cladurii si ionizata 65% din fabrica\n✅ Car-Net „Guide & Inform”\n✅ Driver alert system\n✅ Iluminare numar spate cu LED\n✅ Frana de mana electromecanica, la buton\n✅ 2 Chei + alte dotari de baza\n✔️ Masina se poate",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/05/1-14.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/05/2-13-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/3-19-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/9-18-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/4-18-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/5-17-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/6-18-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/7-18-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/8-17-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/10-18-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/11-18-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/12-18-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/13-18-scaled.jpg"
        ]
    },
    {
        "title": "BMW X1 X-Line E84 xDrive 2010",
        "brand": {
            "id": 18,
            "name": "BMW"
        },
        "model": {
            "id": 196,
            "name": "X1"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 177,
        "price": 8290,
        "mileage": 235031,
        "production_year": 2010,
        "vin": "",
        "body_type": "SUV",
        "color": "Maro",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 10 Iunie 2010\n- Motorizare : 2.0 D ( diesel - Euro 5 ) 177 Cai putere\n- Transmisie : xDrive - 4x4 permanent si automat\n- Cutie de viteze : Steptronic ZF ( automata - convertizor de cuplu ) 6+1 rapoarte + functia TipTronic pt.schimbarea vitezelor in regim manual\n- Rulaj : 235.021 km\n- Culoare deosebita : Marrakeschbraun Metallic (B09)\nInterior : Tapiterie din material textil de culoare crem ( Stoff Elektra/beige (EAB4) )\n✅ Pachete : Lights Package / Comfort Package\n✅ Panorama electrica si multifunctionala\n✅ Camera la mers inapoi\n✅ Navigatie Android cu touchscreen, Android Auto, Wlan etc\n✅ Scaune cu reglaj complet electric si memorie\n✅ Faruri Bi-Xenon / lumi de zi LED\n✅ HDC - Asistenta la coborare in rampa\n✅ Masina construita si asamblata in Leipzig, Germany / BMW AG\n✅ Start / Stop cu functia de franare regenerativa\n✅ Volan din piele in 3 spite, multifunctional\n✅ Jante aliaj OEM BMW\n✅ Tempomat ( pilot automat ) cu functie de accelerare si franare\n✅ Dublu Clmatronic cu afisaj digital\n✅ BMW High Speed Synchronisation - limitator electronic de viteza crescut, care creste viteza maxima de la standard ( 210 km/h ) la un prag mai mare ( 250 km/h ). Aceasta optiune este frecvent inclusa in pachetele M Sport, suspensiile mai sportive sau jantele mai mari\n✅ Sistem Alarma, din fabrica\n✅ Suport lombar cu reglaj electric pentru sofer si pasager\n✅ Oglinda interioara cu penumbra automata\n✅ Senzori de parcare fata si spate\n✅ Cotiera din piele\n✅",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/05/1-13.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/05/2-12-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/3-22-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/4-21-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/5-20-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/6-21-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/7-21-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/8-20-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/9-21-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/10-21-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/11-21-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/12-21-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/13-21-scaled.jpg"
        ]
    },
    {
        "title": "Ford Fiesta Mk8 ST-Line 2018",
        "brand": {
            "id": 44,
            "name": "Ford"
        },
        "model": {
            "id": 641,
            "name": "Fiesta"
        },
        "engine": {
            "capacity": "1.0 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 125,
        "price": 8490,
        "mileage": 176103,
        "production_year": 2018,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Negru",
        "transmission": "Manuală",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 17 Mai 2018\n- Motorizare : 1l EcoBoost ( benzina - Euro 6 ) 125 Cai putere\n- Cutie de viteze : Manuala 6+1 rapoarte\n- Consum la aceasta motorizare :\n4,6 l/100km ( mixt )\n5,9 l/100km ( intern )\n4,0 l/100km ( extern )\n- Emisii CO₂ - 121 g/km\n- Rulaj : 176.103 km\n- Tara de provenienta : Germania ( cumparata de la privat )\n- Culoare : Negru metalizat\n- Interior ST - cusaturi rosii si albe\n✅ Masina are din fabrica pachet ST Line interior si exterior\n✅ Navigatie mare / color / 3D / Touchscreen / Android Auto / Apple CarPlay / HDD Intern etc\n✅ Volan incalzit\n✅ City Stop - Masina avertizeaza si chiar franeaza singura in cazul unui obstacol ( pieton sau masina ) pana la viteze de 120 km/h\n✅ Climatronic, cu afisaj digital\n✅ Lane Keeping System ( lane assist ) - masina avertizeaza la parasirea benzii de circulatie si chiar mentine masina pe banda ( vireaza singura )\n✅ Functia ECO - pentru un consum redus\n✅ Faruri cu tehnologie LED\n✅ KeyLess GO - Pornirea si oprirea masinii se face de la buton, fara a fi introdusa cheia\n✅ Pavilion negru ST\n✅ Driver alert system\n✅ Scaune sport, incalzite\n✅ Pedale ST din otel inoxidabil\n✅ Jante aliaj originale ST pe 17\n✅ Schimbator de viteze metalic ST\n✅ Traffic Sign Recognition - Masina citeste semnele de circulatie prin una din camerele din parbriz si le reda pe Navigatie si in bord\n✅ Sony - Sistem audio Premium\n✅ Volan sport din piele perforata si tesit in partea de jos ST\n✅ Eleron haion ST\n✅ Suport lombar,",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/05/1-9.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/05/2-7-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/3-25-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/4-24-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/5-22-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/6-24-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/8-23-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/7-24-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/9-24-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/10-24-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/11-24-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/12-24-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/13-24-scaled.jpg"
        ]
    },
    {
        "title": "Audi A6 C8 S-Line Sport Pachet 2020",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 103,
            "name": "A6"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Hibrid Motorină"
        },
        "horsepower": 204,
        "price": 24990,
        "mileage": 206930,
        "production_year": 2020,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Negru",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 9 Iunie 2020\n- Motorizare : 2.0 TDI Mild Hybrid ( diesel - Euro 6 Plus ) 204 Cai putere\n- Cutie de viteze : S-Tronic Gen 2 ( automata - dublu ambreiaj umed ) 7+1 rapoarte + functia TipTronic pt.schimbarea vitezelor in regim manual + Padele F1 volan\n- Rulaj : 206.930 km\n- Tara de provenienta : Germania - un Singur Proprietar\n- Service complet la in Germania doar la Reprezentanta Audi cu ultima intrare la 204.573 in 2025 cand s-a facut schimbul de ulei flexibil, plus filtre\nUleiul in cutie de viteze a fost schimbat de 3 ori conform manulului de intretinere, ultimul schimb in Noiembrie 2024 la 179.205 km\n- Culoare : Brilliant Black Metallic\n- Interior S-Line cu tapiterie din Alcantara „Frequenz” + piele si cu logo S-Line impregnat in piele\n✅ Faruri Full LED cu toate functiile aferente, inclusiv mascarea pana la 15 de masini care vin din fata sau se deplaseaza in acelasi sens\n✅ Audi Virtual Cockpit - Bord virtual cu multiple instante si setari\n✅ Scaune sport, incalzite\n✅ Climatronic Digital pe 2 zone cu ecran cu functia de feedback haptic si senzor de impact\n✅ Audi drive select® : 5 moduri de condus : Efficiency / Normal / Confort / Dynamic / Individual\n✅ Sistem de detectare a soferului si pasagerului\n✅ Suspensie sport S-Line\n✅ Android Auto / Apple Car Play\n✅ Audi Active Lane Assist\n✅ Pod Pedalier in otel inoxidabil “ S-Line “\n✅ Praguri S-Line ( logo in aluminiu )\n✅ Progressive steering ( Directie progressiva ) - sistem suplementar",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/05/1-6.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/05/2-4-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/3-28-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/4-27-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/5-25-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/6-27-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/7-27-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/8-26-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/9-27-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/10-27-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/11-27-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/12-27-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/13-27-scaled.jpg"
        ]
    },
    {
        "title": "Audi Q7 Long Base Quattro 2015",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 116,
            "name": "Q7"
        },
        "engine": {
            "capacity": "3.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 272,
        "price": 18890,
        "mileage": 17990,
        "production_year": 2015,
        "vin": "",
        "body_type": "SUV",
        "color": "Negru",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 3 Noimbrie 2015 ( An in Carte si in Serie - 2016 )\n- Motorizare : 3.0 V6 TDI ( diesel - Euro 6 Plus ) 272 Cai putere\n- Transmisie : Quattro - 4x4 permanent si automat + Automatic slip-control differential\n- Cutie de viteze : TipTronic ZF ( automata - convertizor de cuplu ) 8+1 rapoarte + functia TipTronic pt.schimbarea vitezelor in regim manual + Padele F1 volan\n- Rulaj : 287.298 km\n- Masina este inmatriculata in rata din 2025 si are un singur proprietar\n- Tara de provenienta : Germania ( cumparata de la privat )\n- Culoare : Deep Black Perleffekt\n- Interior : Tapiterie din piele Valcone de culoare Rock Gray\n- Masina are sasiul in varianta Long\n✅ Adaptive Air Suspension - Suspensie pe aer, cu multiple niveluri de ridicare si coborare\n✅ City assistance package\n✅ Scaune cu reglaj complet electric\n✅ Park Assist - Masina parcheaza singura\n✅ Automatic slip-control differential - fata de diferentialele blocante mecanic traditionale, acesta utilizeaza electronica si franarea pentru a directiona puterea catre rotile cu cea mai buna tractiune\n✅ Climatronic pe 2 zone, cu afisaj digital\n✅ Camera la mers inapoi\n✅ Faruri Bi-Xenon adaptive / kurvenlight / cornering / lumini de zi LED\n✅ Incalzire Auxiliara ( Sirocou ) programabila sau cu pornire din telecomanda\n✅ Pavilion negru\n✅ Bose Sorround with 3D Sound - Sistem audio Profesional, cu Soobwofer din fabrica\n✅ Portbagaj cu inchidere si deschidere electrica\n✅ Scaune sport, incalzite\n✅ Audi Side",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/05/1-2.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/05/2-10-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/3-36-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/4-36-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/6-36-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/5-33-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/8-35-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/7-36-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/9-36-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/10-36-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/11-36-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/12-36-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/05/14-36-scaled.jpg"
        ]
    },
    {
        "title": "Audi A6 C8 S-Line Sport Pachet 2020",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 103,
            "name": "A6"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Hibrid Motorină"
        },
        "horsepower": 204,
        "price": 25990,
        "mileage": 162852,
        "production_year": 2020,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Negru",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 23 Septembrie 2020\n- Motorizare : 2.0 TDI Mild Hybrid ( diesel - Euro 6 Plus ) 204 Cai putere\n- Cutie de viteze : S-Tronic Gen 2 ( automata - dublu ambreiaj umed ) 7+1 rapoarte + functia TipTronic pt.schimbarea vitezelor in regim manual + Padele F1 volan\n- Rulaj : 162.852 km\n- Tara de provenienta : Germania - un Singur Proprietar\n- Service complet la in Germania doar la Reprezentanta Audi cu ultima intrare la 158.276 in Noiembrie 2025 cand s-a facut schimbul de ulei flexibil, plus filtre\nUleiul in cutie de viteze a fost schimbat de 2 ori conform manulului de intretinere - in Ianuarie 2023 la 62.991 km si in August 2024 la 122.084 km\n- Culoare : Myth Black Metallic\n- Interior S-Line cu tapiterie din Alcantara „Frequenz” + piele si cu logo S-Line impregnat in piele\nMasina are sistemul complet de Asistenta sofer ( Tour assistance package ) :\n- ACC Distronic Plus ( adaptive cruise control ) mentine distanta fata de masina din fata, franand si accelerand automat - inclusiv se opreste si porneste singura de la semafor\n- Audi Breaking Guard - masina franeaza singura in cazul unui impact frontal iminent\n- Emergency assist - sistem avansata de asistenta a șsoferului care detecteaza daca un soferul devine inactiv din cauza unei urgente medicale si preia controlul pentru a opri vehiculul in siguranta. Aceasta declanseaza avertizari vizuale/acustice, strange centurile de siguranta, aprinde luminile de avarie și trage gradual pe marginea",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/06/1-1.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/06/2-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/3-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/4-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/5-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/6-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/7-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/8-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/9-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/10-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/11-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/12-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/13-1-scaled.jpg"
        ]
    },
    {
        "title": "Ford Focus Mk3 Titanium 2014",
        "brand": {
            "id": 44,
            "name": "Ford"
        },
        "model": {
            "id": 643,
            "name": "Focus"
        },
        "engine": {
            "capacity": "1.0 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 125,
        "price": 24990,
        "mileage": 178384,
        "production_year": 2014,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 28 Februarie 2014\n- Motorizare : 1.0 EcoBoost ( Benzina Euro 5 ) 125 Cai putere\n- Transmisie : Manuala 6+1 rapoarte + gear change recomandation pt.un consum redus\n- Rulaj : 178.384 km\n- Tara de provenienta : Germania ( cumparata de la privat ) un Singur proprietar\n- Consum :\n5,1 l/100km ( mixt )\n6,4 l/100km ( intern )\n4,4 l/100km ( extern )\n- Emisii CO₂ - 121 g/km\n✅ Sync - cu afisaj color si multifunctional\n✅ Climatronic pe 2 zone, cu afisaj digital\n✅ Scaune incalzite\n✅ Start / Stop cu functia de franare regenerative\n✅ Senzori de parcare cu afisaj color pe Display\n✅ Volan din piele multifunctional\n✅ Sync Applications - Emergency Assist\n✅ Parbriz incalzit, cu functia de degivrare\n✅ Computer de bord color si multifunctional\n✅ ISOFIX\n✅ Senzori de lumini / ploaie / presiune in anvelope\n✅ Bluetooth / Comenzi vocale\n✅ Cotiera din piele\n✅ Oglinda interioara cu penumbra automata\n✅ Bluetooth Audio / USB / AUX / Mp3 / Sync etc\n✅ Mobile Apps\n✅ Jante aliaj OEM Ford\n✅ Proiectoare ceata\n✅ Oglinzi electrice / incalzite / heliomate\n✅ Sistem Audio DSP\n✅ 2 Chei + alte dotari de baza\n✔️ Masina se poate achizitiona Online sau la parc. Avansul nu este obligatoriu.\nPublicat: iunie 26, 2026\n<div",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/06/1-7.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/06/2-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/3-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/4-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/5-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/6-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/7-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/8-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/9-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/10-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/11-7-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/12-7-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/06/13-7-scaled.jpg"
        ]
    },
    {
        "title": "Audi A6 Competition Bi-TDI 2016",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 103,
            "name": "A6"
        },
        "engine": {
            "capacity": "3.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 326,
        "price": 19990,
        "mileage": 222808,
        "production_year": 2016,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Gri",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 3 Septembrie 2016 ( An in Carte si in Serie - 2017 )\n- Motorizare : 3.0 TDI V6 ( Euro 6 Plus ) 326 Cai putere / 650 Cuplu N/M\n- Transmisie : Quattro Ultra ( a 6-a generatie ) permanent si automat inclusiv diferential blocabil XDS ( diferential central blocabil )\n- Cutie de viteze : TipTronic ZF ( automata - convertizor de cuplu ) 8+1 rapoarte + functia TipTronic pt.schimbarea vitezelor in regim manual + Padele F1 volan\n- Rulaj : 222.808 km\n- Consum :\n/ 6,2 l/100km ( mixt )\n/ 7,5 l/100km ( intern )\n/ 5,5 l/100km ( extern )\nCuloare deosebita : Daytona Gray Pearlescent\nInterior S6 : Scaune scoica / Tapiterie din piele naturala Valcona de culoare neagra cu model romb\nMasina este inmatriculata cu toate actele la zi, trebuie doar transcrisa\n✅ 3xS -Line din fabrica ( Competition ) :\n- Diferential SPORT\n- Bara fata evazata cu faguri S-Line\n- Difuzor spate S-Line\n- Scaune S - model romb cu logo “ S-Line” impregnat in piele\n- Pavilion negru S-Line\n- Volan si schimbator viteze din piele perforata S-Line\n- Suspensie S-Line\n- Praguri prelungite ( side skirt ) S-Line\n- Embleme “ V6Turbo “ pe aripi\n- Jante aliaj Audi R20\n- Praguri interioare cu embleme cromate Quattro\n- Grila S-Line\n- Culoare S-Line\n- Eleron s-Line\n- Culoare S-Line\n✅ Masina are din Fabrica pachet “ Audi exclusive black high-gloss styling “ - toate elementele exterioare sunt negre lucios in locul clasicului crom\n✅ Panorama electrica si multifunctionala\n✅ Scaune cu reglaj",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/07/1.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/07/2-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/Audi-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/Audi-2-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/Audi-4-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/Audi-10-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/Audi-11-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/Audi-12-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/Audi-13-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/Audi-38-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/Audi-14-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/Audi-39-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/Audi-41-scaled.jpg"
        ]
    },
    {
        "title": "Volkswagen Golf 6 Scurt Euro 5 2009",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1936,
            "name": "Golf"
        },
        "engine": {
            "capacity": "1.4 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 122,
        "price": 5490,
        "mileage": 224101,
        "production_year": 2009,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alb",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 21 Februarie 2009\n- Motorizare : 1.4 TSI ( benzina - Euro 5 ) 122 Cai putere\n- Cutie de viteze : Manuala 6+1 rapoarte\n- Rulaj : 224.101 km\n- Tara de provenienta : Germania ( cumparata de la privat )\n- Culoare : Candy White Metallic\n✅ Pachet : „Lights & Vision”\n✅ Navigatie color Android\n✅ Senzori de parcare fata si spate\n✅ Dublu climatronic cu afisaj digital\n✅ Scaune top confort, incalzite\n✅ Oglinda interioara cu penumbra automata\n✅ Jante aliaj OEM VW\n✅ Tempomat ( pilot automat ) cu functia de accelerare si franare\n✅ Computer de bord multifunctional\n✅ Volan sport din piele in 3 spite\n✅ Servotronic - Directie asistata electric si electronic “ sensibila “ la viteza\n✅ Senzori de ploaie / lumini / presiune in anvelope\n✅ Suspensie sport dinamica, din fabrica\n✅ Oglinzi electrice, incalzite si heliomate\n✅ Cotiera\n✅ Faruri automat cu functiile „Leaving Home” si „Coming Home”\n✅ Trimuri interioare „Black Pyramide”\n✅ Sistem spalatori faruri, incalzit\n✅ ISOFIX\n✅ Geamuri spate si luneta ionizate din fabrica 65%\n✅ Suport lombar relgabil pentru sofer si pasager\n✅ Comfort equipment\n✅ Pachet Chrom\n✅ Proiectoare ceata + alte dotari de baza\n✔️ Masina se poate achizitiona Online sau la parc. Avansul nu este obligatoriu.\nPublicat: iulie 9, 2026\n<div",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/07/1-1.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/07/2-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/3-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/4-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/5-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/6-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/7-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/10-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/11-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/12-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/13-scaled.jpg"
        ]
    },
    {
        "title": "Audi A4 Allroad Quattro 2014",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 100,
            "name": "A4"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 177,
        "price": 12990,
        "mileage": 115921,
        "production_year": 2014,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Negru",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 1 Octombrie 2014 ( An in Serie si n Carte - 2015 )\n- Motorizare : 2.0 TDI ( diesel - Euro 5 ) 177 Cai putere\n- Transmisie : Quattro ( 4x4 automat ) inclusiv diferential blocabil elextronic XDS\n- Cutie de viteze : S-Tronic ( automata - dublu ambreiaj ) 7+1 rapoarte + functia TipTronic pt.schimbarea vitezelor in regim manual\n- Rulaj : 115.921 km\n- Tara de provenienta : Germania ( cumparata de la privat )\n- Masina este inmatriculata in tara din Octombrie 2023 si are un singur proprietar\n- Culoare : Myth Black Metallic\n- Interior : Tapiterie din material textil in 2 culori\n✅ Faruri Bi-Xenon adaptive / kurvenlight / cornering / lumini de zi LED\n✅ ACC Distronic Plus - Mentine distanta fata de masina din fata, franand si accelerand automat - inclusiv se opreste si porneste de la semafor\n✅ Audi Active Lane Assist - Sistem de siguranta pasiv care mentine masina pe banda de mers, intervenind electric si electronic asupra directiei ( masina franeaza singura )\n✅ Bang & Olufsen - Sistem audio Premium\n✅ Audi Breaking Guard - Masina franeaza singura in cazul unui impact iminent\n✅ Portbagaj cu inchidere si deschidere electrica\n✅ Climatronic cu afisaj digital\n✅ Faza lunga Automata - masina schimba singura fazele de drum\n✅ Sistem Navigatie MMI\n✅ Scaune sport, incalzite\n✅ Senzori de parcare fata si spate, cu afisaj color pe Display\n✅ Carlig de remorcare, detasabil\n✅ Senzori de ploaie / lumina / oboseala / presiune in anvelope\n✅ Vehicle class",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/07/1-5.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/07/2-5-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/3-4-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/4-4-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/5-4-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/6-4-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/7-4-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/8-4-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/9-4-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/10-4-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/11-4-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/12-4-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/13-4-scaled.jpg"
        ]
    },
    {
        "title": "Audi A6 BiTDI Quattro Business 2017",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 103,
            "name": "A6"
        },
        "engine": {
            "capacity": "3.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 320,
        "price": 25990,
        "mileage": 221200,
        "production_year": 2017,
        "vin": "",
        "body_type": "Sedan",
        "color": "Negru",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 18 Iulie 2017 ( An in Carte 2018 )\n- Motorizare : 3.0 TDI V6 ( Euro 6 Plus ) 320 Cai putere 650 Cuplu N/M\n- Transmisie : TipTronic ZF ( automata - convertizor de cuplu ) 8+1 rapoarte + Padele F1 volan\n- Rulaj : 221.200 km\n- Tara de provenienta : Germania - cumparata de la Reprezentanta Audi Drechsler GmbH & Co.KG din Denkendorf in Septembrie 2019 si inmatriculata in Romania - un singur proprietar\n- Service complet Reprezentanta Audi atat in Germania cat si in Romania\n- Masina are schimbat : Distributie / Ulei + filtre / Frane / Ulei in cutia de viteze ZF / Diferentiale in 2023 - DOAR piese OEM\n- Telescoape spate / Discuri si placute schimbate in Septembrie 2024 - DOAR piese OEM\nToate acestea sunt facute in Reprezentanta Audi si service-uri autorizate RAR cu facturi si garantie . S-au folosit piese exlclusiv OEM . In acest moment masina are absoltu toate consumabilele schimbate, nu mai necesita nicio investitie\n- Consum :\ncc 6,0 l/100km ( mixt )\ncc 7,3 l/100km ( intern )\ncc 5,3 l/100km ( extern )\n- Emisii CO₂ - 159 g/km\n- Culoare : Myth Black Metallic\n- Interior Confort ( Audi A8 ) : piele naturala Valcona perforata / Alcantara usi, de culoare Atlas Beige-Atlas Beige\n✅ 3xS-Line din fabrica :\n- Bara fata evazata cu faguri S-Line\n- Difuzor spate S-Line\n- Suspensie S-Line\n- Praguri prelungite ( side skirt ) S-Line\n- Embleme S-Line pe aripi fata\n- Jante aliaj S-Line R20\n✅ Head-Up Display\n✅ Soft Close la toate 4 usile + portbagaj\n✅",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/07/1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/2-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/3-7-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/4-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/5-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/6-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/7-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/8-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/9-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/10-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/12-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/11-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/13-8-scaled.jpg"
        ]
    },
    {
        "title": "Ford Focus Mk3 Facelift 2016",
        "brand": {
            "id": 44,
            "name": "Ford"
        },
        "model": {
            "id": 643,
            "name": "Focus"
        },
        "engine": {
            "capacity": "1.0 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 125,
        "price": 5990,
        "mileage": 189112,
        "production_year": 2016,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 23 Iunie 2016\n- Motorizare : 1l EcoBoost ( benzina - Euro 6 ) 125 Cai putere\n- Cutie de viteze : Manuala 6+1 rapoarte\n- Consum la aceasta motorizare :\n5,1 l/100km ( mixt )\n6,4 l/100km ( intern )\n4,4 l/100km ( extern )\n- Emisii CO₂ - 121 g/km\n- Rulaj : 129.112 km\n- Tara de provenienta : Germania ( cumparata de la privat ) - Un singur Proprietar de noua\n✅ Sistem Climatizare\n✅ Sync 2 cu Bluetooth Audio si Hard intern\n✅ Navigatie mare / color / 3D etc\n✅ Start / Stop cu functia de franare regenerativa\n✅ Volan din piele, multifunctional ( 24 butoane )\n✅ Tehnologie Econetic, pentru un consum redus\n✅ Tempomat ( pilot automat ) cu functie de accelerare si franare\n✅ Asistenta la pornire din rampa\n✅ Computer de bord color si multifunctional\n✅ Ford DSP\n✅ Bluetooth Audio / Mp3 / AUX / SD Card etc\n✅ Senzori de parcare\n✅ Sync - Navigatie mare / color / 3D / TFT / HDD intern etc\n✅ Senzori de presiune in anvelope\n✅ Jante aliaj OEM Ford R17\n✅ Oglinzi electrice / inclazite / heliomate / iluminate / rabatabile electric\n✅ Proiectoare ceata\n✅ Cotiere fata si spate - cea din fata din piele\n✅ ISOFIX\n✅ Oglinda retrovizoare cu penumbra automata\n✅ 2 Chei + multe alte dotari de baza\n✔️ Masina se poate achizitiona Online sau la parc. Avansul nu este obligatoriu.\nPublicat: iulie 22, 2026\n<div",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/07/1-9.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/07/2-10-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/3-8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/4-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/5-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/6-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/7-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/8-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/9-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/10-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/11-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/12-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/13-9-scaled.jpg"
        ]
    },
    {
        "title": "Ford EcoSport EcoBoost Euro 6 2017",
        "brand": {
            "id": 44,
            "name": "Ford"
        },
        "model": {
            "id": 628,
            "name": "EcoSport"
        },
        "engine": {
            "capacity": "1.0 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 140,
        "price": 7990,
        "mileage": 156886,
        "production_year": 2017,
        "vin": "",
        "body_type": "SUV",
        "color": "Negru",
        "transmission": "Manuală",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 27 Octombrie 2017\n- Motorizare : 1.0 EcoBoost ( Benzina - Euro 5 ) 140 Cai putere\n- Transmisie : Manuala\n- Rulaj : 156.866 km\n- Consum la aceasta motorizare :\n5,1 l/100km ( mixt )\n6,4 l/100km ( intern )\n4,4 l/100km ( extern )\n* Emisii CO₂ - 121 g/km\n✅ Pachet All Black din fabrica\n✅ KeyLess Entry - Deschiderea si inchiderea masinii se face fara a fi actionata cheia, prin senzorii de proximitate de pe portiere sal haion\n✅ Camera la mers inapoi\n✅ Lumini de zi LED\n✅ Navigatie color / 3D / tft / HDD Intern etc\n✅ Climatronic automat cu afisaj digital\n✅ Sony - Sistem audio Premuim\n✅ Scaune incalzite\n✅ Tempomat ( pilot automat ) cu functie de accelerare si franare\n✅ KeyLess GO - Masina se porneste si se opreste de la buton, fara a se introduce cheia\n✅ Aparatoare noroi\n✅ Computer de bord multifunctional\n✅ Geamuri spate si luneta din sticla termoizolanta tratata impotriva caldurii si ionizata 65%\n✅ Cotiera sofer\n✅ Parbriz laminat\n✅ Senzori de parcare\n✅ Tehnologia ECOnetic - Tehnologia ECOnetic include tehnologia Ford EcoBoost - un motor lider in clasa, disponibil intr-o varietate de dimensiuni, inclusiv premiul EcoBoost de 1 litru, care ofera acelasi nivel de putere, dar cu 20% mai puțin combustibil.\n✅ Pabriz incalzit - inclusiv functia “ dezghetare electirca “\n✅ EcoMode Driving - Sistemul inovator Ford Eco Mode evalueaza in mod incontinuu efectele stilului personal de condus asupra consumului de combustibil. Sistemul citeste viteza,",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/07/1-10.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/07/2-11-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/3-9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/4-10-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/5-10-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/6-10-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/7-10-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/8-10-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/9-10-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/10-10-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/11-10-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/12-10-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/07/13-10-scaled.jpg"
        ]
    },
    {
        "title": "Audi A4 B9 Facelift Mild Sport 2021",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 100,
            "name": "A4"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Hibrid Motorină"
        },
        "horsepower": 163,
        "price": 19990,
        "mileage": 189239,
        "production_year": 2021,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Gri",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 3 Iunie 2021\n- Motorizare : 2.0 TDI Mild Hybrid ( diesel - Euro 6 Plus ) 163 Cai putere\n- Cutie de viteze : S-Tronic Generatia a 2-a ( automata - dublu ambreiaj umed ) 7+1 rapoarte + functia TipTronic pt.schimbarea vitezelor in regim manual + Padele F1 volan\n- Rulaj : 189.239 km\n- Service complet in Germania doar in reteaua Audi, cu ultima intrare la 180.469 km, cand a fost schimbat ulei + filtre + ulei in cutia de viteze\n- Tara de provenienta : Germania\n- Culoare deosebita : Manhattan Gray Metallic\n- Interior : Tapiterie din piele naturala de culoare neagra, perforata\n✅ Masina are pachetul complet de asistenta sofer - Assist Package Tour :\n- ACC Distronic Plus - Mentine distanta fata de masina din fata, franand si accelerand automat - inclusiv se opreste si porneste de la semafor\n- Audi Active Lane Assist - Sistem de siguranta pasiv care mentine masina pe banda de mers, intervenind electric si electronic asupra directiei ( masina franeaza singura )\n- Audi Breaking Guard - Masina franeaza singura in cazul unui impact iminent\n- Audi Side Assist - Asistenta la punctul mort prin semnale luminoase in ambele oglinzi, dar si prin sistemul de iluminare ambientala prin semnale de culoare rosie, mai puternice, intermediare\n- Audi pre sense city + Audi pre sense rear and basic + City assistance package\n- Camera-based traffic sign recognition\n- Extended pedestrian protection - Capota activa\n✅ Panorama electrica si multifunctionala\n✅ Head-Up",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/08/1.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/2-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/3-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/4-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/05-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/5-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/6-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/7-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/8-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/9-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/10-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/11-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/12-scaled.jpg"
        ]
    },
    {
        "title": "Mercedes-Benz GLC 220 AMG 2016",
        "brand": {
            "id": 92,
            "name": "Mercedes-Benz"
        },
        "model": {
            "id": 1244,
            "name": "GLC"
        },
        "engine": {
            "capacity": "2.2 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 170,
        "price": 19990,
        "mileage": 209014,
        "production_year": 2016,
        "vin": "",
        "body_type": "SUV",
        "color": "Gri",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 4 Februarie 2016\n- Motorizare : 2.2 CDI ( diesel - Euro 6 ) 170 Cai putere\n- Transmisie : 4x4 permanent si automat\n- Cutie de viteze : 9G-Tronic ( automata - multi clutch ) 9+1 rapoarte + functia TipTronic pt.schimbarea vitezelor in regim manual + Padele F1 volan\n- Rulaj : 209.014 km\n- Tara de provenienta : Germania\n- Culoare : Teneorite Grau Metallic (755U)\n- Interior : Tapiterie din piele de culoare neagra + Alcantara de culoare neagra\n✅ AMG Interior si Exterior din fabrica :\n- AMG Line Interior/AMG SPORTS PACKAGE INTERIOR\n- AMG Line Exterior/AMG SPORTS PACKAGE EXTERIOR\n- Bara fata evazata cu fagure AMG\n- Praguri ( side skirt ) prelungite AMG\n- Jante AMG R18\n- Volan din piele perforata si tesit in partea de jos\n- Suspensie dinamica AMG\n✅ Panorama electrica si multifunctionala\n✅ Agility Select - Moduri de condus care seteaza motorul / transmisia / cutia de viteze / directia / ACC-ul / Suspensie / Climatizarea\n✅ Faruri full LED MultiBEam, cu toate functiile aferente inclusive decupare prin umbrire\n✅ BASS Plus - Masina avertizeaza si franeaza singura in cazul unui impact iminent\n✅ MB Connect Command Pro - Navigatie Mare cu toate functiile aferente\n✅ Ambele scaune electrice si incalzite\n✅ Traffic Sign Recognition - Sistem care prin una din camerele din parbriz “ citeste “ semnele de circulatie si le reda pe Navigatie si in bord\n✅ Camera la mers inapoi cu multiple instante si setari\n✅ Thermatic ( Climatronic ) pe 2 zone, cu afisaj",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/08/1-1.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/2.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/4-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/3-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/5-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/06-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/6-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/7-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/8-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/9-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/10-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/11-1-scaled.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/12-1-scaled.jpg"
        ]
    },
    {
        "title": "Volkswagen Tiguan Allspace 2018",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1966,
            "name": "Tiguan"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 150,
        "price": 18990,
        "mileage": 196497,
        "production_year": 2018,
        "vin": "",
        "body_type": "SUV",
        "color": "Negru",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 4 ianuarie 2018\n- Motorizare : 2.0 TDI ( diesel - Euro 6 Plus ) 150 Cai putere\n- Transmisie : 4Motion - 4x4 automat + diferential blocabil XDS\n- Cutie de viteze : DSG ( automata - dublu ambreiaj ) 7+1 rapoarte + functia TipTronic pt.schimbarea vitezelor in regim manual + Padele F1 volan\n- Rulaj : 196.497 km\n- Tara de provenienta : Germania ( cumparata de la privat )\n- Culoare : Deep Black Pearlescent\n- Inteior Highline : Tapterie din Alcantara\n✅ Varianta AllSpace :\n- mai lung cu 106 m - mai mult spatiu picioare pt.pasagerii din spate\n- portbagaj la mare cu 70l\n- mai inalt cu 10mm, neobservabil in exterior dar mai mult spatiu cap la pasagerii din spate si un portbagaj mai incapator\n✅ Masina are sistemul COMPLET de asistenta sofer, inclusiv Autonomous Driving : ACC Distronic Plus / Front Assist / Active Lane Assist / Side Assist / Park Assist / Emergency Assist / Traffic Jam Assist / Rear Traffic Alert / Trailer maneuvering system Trailer Assist / Pedestrian monitoring\n✅ Faruri Full LED adaptive, cu toate functiile aferente - inclusiv mascarea masinilor care vin din fata sau se deplaseaza in acelasi sens\n✅ Head Up Display\n✅ Volan Incalzit\n✅ 7 Locuri : randul 2 de scaune reglabila si rabatabile / randul 3 de scaune, rabatabile\n✅ Active Info Display - cockpit virtual cu multiple instante si setari\n✅ Driving Profile Selection - Moduri de condus : ECO / Confort / Normal / Sport / Individual\n✅ Carlig de remorcare, electric\n✅ Park Assist",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/08/1-2.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/2-1.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/3-2.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/4-2.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/5-2.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/6-2.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/8-2.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/7-2.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/9-2.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/10-2.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/11-2.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/12-2.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/13-2.jpg"
        ]
    },
    {
        "title": "Audi A6 C7 Facelift Bi-TDI 2015",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 103,
            "name": "A6"
        },
        "engine": {
            "capacity": "3.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 320,
        "price": 19990,
        "mileage": 211550,
        "production_year": 2015,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Gri",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 26 Iunie 2015\n- Motorizare : 3.0 TDI V6 ( Euro 6 Plus ) 320 Cai putere / 650 Cuplu N/M\n- Transmisie : Quattro Ultra ( a 6-a generatie ) permanent si automat inclusiv Sport Diferential, din fabrica\n- Cutie de viteze : TipTronic ZF ( automata - convertizor de cuplu ) 8+1 rapoarte + functia TipTronic pt.schimbarea vitezelor in regim manual + Padele F1 volan\n- Rulaj : 211.550 km\n- Masina are SERVICE COPMPLET in Audi Germania, cu ultima intrare in 30 Iunie 2026, la 211.258 km cand s-a facut schimbul de ulei in motor + filtre\n- Culoare deosebita : Dakota Gray Metallic ( Maro Metalizat )\n- Interior : Tapiterie din piele naturala perforata Valcona, de culoare neagra\n- Pret de Lista ( de noua ) : 92.500 Euro\n- Consum :\n/ 6,2 l/100km ( mixt )\n/ 7,5 l/100km ( intern )\n/ 5,5 l/100km ( extern )\nMasina are o configuratie mai speciala : S-Line Sport Pachet la exterior si Confort la interior\n✅ Faruri Audi Matrix LED, cu mascarea masinilor care vin din fata sau se deplaseaza pe acelasi sens\n✅ Semnalizari dinamice fata ( faruri ) si spate ( stopuri )\n✅ Night Vision cu functia de recunoastere a pedestrienilor\n✅ HeadUp Display\n✅ Adaptive Air Suspension - Suspensie pe aer, cu diferite moduri de condus si functia de ridicare si coborare, la buton\n✅ Sport Diferential\n✅ Volan incalzit\n✅ Scaune Confort Individual cu reglaj complet electric si memorie ( inclusiv lombar cu 12 setari, ca la Audi A8 )\n✅ ACC Distronic Plus - Urmareste masina din fata,",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/08/1-3.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/2-2.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/2.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/3.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/4.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/6.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/5.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/8.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/7.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/9.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/10.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/11.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/12.png"
        ]
    },
    {
        "title": "Skoda Superb 3 Facelift 2020",
        "brand": {
            "id": 125,
            "name": "Skoda"
        },
        "model": {
            "id": 1730,
            "name": "Superb"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 190,
        "price": 19990,
        "mileage": 170000,
        "production_year": 2020,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Albastru",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 7 Februarie 2020\n- Motorizare : 2.0 TDI ( diesel - Euro 6 Plus ) 190 Cai putere\n- Cutie de viteze : DSG DQ381 ( automata - dublu ambreiaj ) 7+1 rapoarte + functia TipTronic pt.schimbarea vitezelor in regim manual + Padele F1 volan\n- Rulaj : 170.000 km km\n- Service complet in reteaua Skoda Germania cu ultima intrare 4 Martie 2026 cand a avut facut schimbul de ulei flexibil + filtre\n- Tara de provenienta : Germania ( cumparata de la privat )\n- Culoare deosebita : Energy Blue Metallic\n- Interior : Tapiterie din piele perforata de culoare neagra\n✅ Masina are Comfort Drive Travel Assist ( sistemul complet de asistenta sofer ) : ACC Distronic Plus / Active Lane Assist / Emergency Assist / Autonomous Emergency Braking Front Assist / Proactive passenger protection / Driver alert system / Automatic Vehicle control in a Medical Emergency / Dynamic Road Sign Display\n✅ Virtual Cockpit Plus - bord virtual cu multiple instante si setari\n✅ Scaune electrice, incalzite si ventilate\n✅ Panorama electrica si multifunctionala\n✅ Faruri Matrix LED ( Skoda Crystal Lighting ) cu toate functiile aferente, inclusiv decuparea masinilor care vin din fata sau se deplaseaza pe acelasi sens + Welcome Effect ( jocuri de lumini la deschiderea si inchiderea masinii )\n✅ Dynamic Chassis Control - Suspensie electromagnetica, reglabila\n✅ Volan incalzit\n✅ Bancheta incalzita\n✅ KeyLess Entry - deschiderea si inchiderea masinii se face fara a fi actionata cheia, prin",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/08/1-4.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/2-3.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/10.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/11.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/12.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/13.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/14.jpeg"
        ]
    },
    {
        "title": "Audi A4 B9 S-Line Sport Pachet 2016",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 100,
            "name": "A4"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 190,
        "price": 15990,
        "mileage": 221200,
        "production_year": 2016,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Gri",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 26 Septembrie 2016 ( An in Carte si in Serie - 2017 )\n- Motorizare : 2.0 TDI ( diesel - Euro 6 Plus ) 190 Cai putere\n- Cutie de viteze : S-Tronic Generatia a 2-a ( automata - dublu ambreiaj umed ) 7+1 rapoarte + functia TipTronic pt.schimbarea vitezelor in regim manual + Padele F1 volan\n- Rulaj : 221.200 km cu service complet in Germania - Intrarea mare cu Distributie facuta la 211.000 in 2026\n- Tara de provenienta : Germania\n- Culoare : Manhattan Gray Metallic\n- Interior : Tapiterie din piele naturala de culoare neagra, perforata\n✅ Masina are pachetul complet de asistenta sofer - Assist Package Tour :\n- ACC Distronic Plus - Mentine distanta fata de masina din fata, franand si accelerand automat - inclusiv se opreste si porneste de la semafor\n- Audi Active Lane Assist - Sistem de siguranta pasiv care mentine masina pe banda de mers, intervenind electric si electronic asupra directiei ( masina franeaza singura )\n- Audi Breaking Guard - Masina franeaza singura in cazul unui impact iminent\n- Audi Side Assist - Asistenta la punctul mort prin semnale luminoase in ambele oglinzi, dar si prin sistemul de iluminare ambientala prin semnale de culoare rosie, mai puternice, intermediare\n- Audi pre sense city + Audi pre sense rear and basic + City assistance package\n- Camera-based traffic sign recognition\n- Extended pedestrian protection - Capota activa\n✅ Faruri Matrix cu toate functiile aferente, inclusiv mascarea masinilor care vin din",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/08/00.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/1-5.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/1.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/2-1.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/3-3.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/5-3.jpg",
            "https://fisibest.ro/wp-content/uploads/2026/08/4-1.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/7-1.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/8-1.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/9-1.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/10-1.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/1-7.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/1-4.jpeg"
        ]
    },
    {
        "title": "Audi A6 C7 Sport Pachet 2012",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 103,
            "name": "A6"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 177,
        "price": 12490,
        "mileage": 244850,
        "production_year": 2012,
        "vin": "",
        "body_type": "Sedan",
        "color": "Negru",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0752558763",
        "description": "Descriere Autovehicul\n- Prima inmatriculare : 9 Noiembrie 2012 ( An in Carte si in Serie - 2013 )\n- Motorizare : 2.0 TDI ( diesel - Euro 5 ) 177 Cai putere\n- Cutie de viteze : Multitronic ( automata - variatie continua ) 8+1 rapoarte + functia TipTronic pt.schimbarea vitezelor in regim manual\n- Rulaj : 244.850 km\n- Tara de provenienta : Germania\n- Culoare : Brilliant Black Metallic\n- Interior : Tapiterie din piele de culoare neagra + Alcantara\n✅ Faruri Bi-Xenon adaptive / kurvenlight / cornering / lumini de zi LED\n✅ Assistance package including Audi pre sense plus\n✅ ACC Distronic Plus - Mentine distanta fata de masina din fata, franand si accelerand automat - inclusiv se opreste si porneste de la semafor\n✅ Audi Active Lane Assist - Sistem de siguranta pasiv care mentine masina pe banda de mers, intervenind electric si electronic asupra directiei ( masina franeaza singura )\n✅ Deluxe Climatronic pe 4 zone, cu afisaj digital in fata si in spate\n✅ Audi Breaking Guard - Masina franeaza singura in cazul unui impact iminent\n✅ Audi Side Assist - Asistenta la punctul mort prin semnale luminoase in ambele oglinzi, dar si prin sistemul de iluminare ambientala prin semnale de culoare rosie, mai puternice, intermediare\n✅ MMI® navigation plus with MMI touch® - Navigatie mare - cu toate functiile aferente, inclusiv HDD Intern 30 GB\n✅ Audi pre sense Plus\n✅ Audi drive select with efficiency® : Efficiency / Confort / Auto / Dynamic / Individual\n✅ Suspensie Dinamica\n✅ Oglinzi electrice /",
        "images": [
            "https://fisibest.ro/wp-content/uploads/2026/08/00-1.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/0.jpeg",
            "https://fisibest.ro/wp-content/uploads/2026/08/2-1.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/1.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/3-1.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/4-2.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/5-1.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/6-1.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/7-2.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/9-2.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/10-2.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/11-1.png",
            "https://fisibest.ro/wp-content/uploads/2026/08/12-1.png"
        ]
    }
];

// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let _last = 0;
async function politeFetch(url) {
    const wait = 400 - (Date.now() - _last); if (wait > 0) await sleep(wait); _last = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
}

async function downloadImages(urls, tag) {
    await fs.ensureDir(RAW_DIR);
    const files = [];
    for (const url of urls) {
        try {
            const buf = Buffer.from(await (await politeFetch(url)).arrayBuffer());
            if (buf.length > MAX_IMG_BYTES) { console.log(`      sar poza ${(buf.length/1048576).toFixed(1)}MB`); continue; }
            const ext = (url.match(/\.(jpe?g|png|webp)$/i) || [, 'jpg'])[1].toLowerCase();
            const name = `raw_${Date.now()}_${Math.round(Math.random()*1e9)}.${ext === 'jpeg' ? 'jpg' : ext}`;
            const dest = path.join(RAW_DIR, name);
            await fs.writeFile(dest, buf);
            files.push({ path: dest, originalname: name, mimetype: ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg'), size: buf.length });
        } catch (e) { console.log(`      eroare poză (${tag}): ${e.message}`); }
    }
    return files;
}

async function main() {
    console.log('\n╔══ SEED FisiBest → CarFlip (22 mașini) ══╗\n');
    await mongoose.connect(process.env.DB_URL);
    console.log('   ✅ MongoDB conectat');

    const dealer = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(DEALER_ID) });
    if (!dealer) { console.log('❌ Contul FisiBest nu există.'); await mongoose.disconnect(); process.exit(1); }
    console.log(`   ✅ dealer: ${dealer.username}`);

    // idempotent: ce există deja pe cont (titlu|preț)
    const existing = new Set((await sales.find({ user_id: DEALER_ID }).select('title price').lean()).map(s => `${s.title}|${s.price}`));
    const toAdd = CARS.filter(c => !existing.has(`${c.title}|${c.price}`));
    console.log(`   ${CARS.length} în listă, ${CARS.length - toAdd.length} deja în DB, ${toAdd.length} de adăugat\n`);
    if (toAdd.length === 0) { console.log('Nimic de făcut.'); await mongoose.disconnect(); process.exit(0); }

    // ── FAZA 1: descarcă TOATE pozele înainte să scriem ceva (all-or-nothing) ──
    console.log('── Faza 1: descarc pozele (nimic în DB încă) ──');
    const prepared = [];
    for (const [i, car] of toAdd.entries()) {
        process.stdout.write(`   [${i+1}/${toAdd.length}] ${car.title.padEnd(38)} `);
        const files = await downloadImages(car.images, car.title);
        if (files.length === 0) {
            console.log('❌ 0 poze descărcate');
            console.log('\n⛔ ABORT: o mașină nu are poze descărcabile. NU s-a scris nimic în DB.');
            for (const p of prepared) for (const f of p.files) await fs.remove(f.path).catch(()=>{});
            await mongoose.disconnect(); process.exit(1);
        }
        console.log(`✅ ${files.length} poze`);
        prepared.push({ car, files });
    }

    // ── FAZA 2: acum că TOATE au poze, scriem în DB + coadă ──
    console.log('\n── Faza 2: scriu în DB + pun media în coadă ──');
    let created = 0;
    for (const { car, files } of prepared) {
        const now = new Date();
        const paidUntil = addMonths(now, 6);
        const doc = new sales({
            user_id: DEALER_ID, user_name: DEALER_NAME,
            title: car.title, brand: car.brand, model: car.model, engine: car.engine,
            horsepower: car.horsepower, price: car.price, negotiable: false, mileage: car.mileage,
            production_year: car.production_year, vin: car.vin,
            body_type: car.body_type, color: car.color, transmission: car.transmission,
            drivetrain: car.drivetrain, pollution_standard: car.pollution_standard,
            steering_wheel: 'left', location: { county: COUNTY, city: CITY },
            registration_status: 'registered', exchange_accepted: false, for_dismante: false,
            phone_number: car.phone_number, description: car.description,
            media: [], likes_count: 0, views: 0, comments_count: 0,
            allow_comments: true, allow_social_promo: true,
            is_active: false, status: 'media_processing',
            paid_until: paidUntil, expires_at: addDays(paidUntil, 10), stripe_subscription_id: null,
        });
        await doc.save();
        await addMediaToQueue(doc._id, files, files.map(() => ({})));
        created++;
        console.log(`   ✅ ${car.title.padEnd(38)} ${files.length} poze → coadă ⭐`);
    }

    console.log(`\n╔══ GATA ══╗`);
    console.log(`   ${created} anunțuri create pe contul FisiBest.`);
    console.log(`   ⏳ Worker-ul procesează pozele → R2 → le activează.`);
    console.log(`   ⭐ Toate au allow_social_promo → dispecerul le postează eșalonat.\n`);
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(async (e) => { console.error('\n❌ EȘEC:', e); try { await mongoose.disconnect(); } catch {} process.exit(1); });