#!/usr/bin/env node
// ============================================================================
//  seed_sh.js — populează CarFlip cu cele 37 de mașini de la ShAutoTrade.
//
//  RULARE (pe SERVER, lângă package.json):  node seed_sh.js
//
//  • 37 mașini HARDCODATE. Zero scraping la runtime.
//  • Cont ShAutoTrade, Oradea / Bihor, 0754485506.
//  • user_image = logo-ul, pe fiecare anunț.
//  • TOATE în promo (allow_social_promo:true).
//  • Date REALE de pe site (an, km, motor, cutie, normă Euro, caroserie, preț).
//    Doar culoarea e "Alta culoare" (site-ul nu o afișează) și tracțiunea e
//    dedusă din titlu (xDrive/quattro/4x4 → 4x4, restul FWD).
//  • ALL-OR-NOTHING: descarcă toate pozele întâi; scrie doar dacă totul e ok.
//  • Idempotent: sare peste ce există deja (titlu+preț pe contul ShAutoTrade).
// ============================================================================

import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs-extra';
import path from 'path';
import { addMonths, addDays } from 'date-fns';

import sales from './src/models/salesModel.js';
import { addMediaToQueue } from './src/mediaProcessing/mediaQueue.js';

const DEALER_ID   = '6a7b2ea1a154c417469d5983';
const DEALER_NAME = 'ShAutoTrade';
const COUNTY = 'Bihor';
const CITY   = 'Oradea';
const USER_IMAGE = 'https://media.car-flip.com/splash_logo.jpg';
const MAX_IMG_BYTES = 15 * 1024 * 1024;
const RAW_DIR = path.join(process.cwd(), 'temp_uploads', 'raw');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';

const CARS = [
    {
        "title": "Volkswagen Golf 2013",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1936,
            "name": "Golf"
        },
        "engine": {
            "capacity": "1.2 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 85,
        "price": 6700,
        "mileage": 235000,
        "production_year": 2013,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nVolkswagen Golf 7\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 900 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H Auto Trade iti",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-11-at-14.20.13.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-11-at-14.20.13-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-11-at-14.20.14-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-11-at-14.20.16-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-11-at-14.20.16.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-11-at-14.20.15-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-11-at-14.20.14-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-11-at-14.20.15-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-11-at-14.20.14-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-11-at-14.20.14-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-11-at-14.20.15-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-11-at-14.20.15-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-11-at-14.20.15.jpeg"
        ]
    },
    {
        "title": "Seat Exeo 2012",
        "brand": {
            "id": 122,
            "name": "Seat"
        },
        "model": {
            "id": 1696,
            "name": "Exeo"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 140,
        "price": 5000,
        "mileage": 215000,
        "production_year": 2012,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 700 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H Auto Trade iti gaseste client, o",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-31-at-15.01.07-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-31-at-15.01.07.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-31-at-15.01.07-2-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-31-at-15.01.09-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-31-at-15.01.08-5.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-31-at-15.01.09-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-31-at-15.01.08-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-31-at-15.01.08-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-31-at-15.01.07-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-31-at-15.01.08-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-31-at-15.01.08-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-31-at-15.01.08.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-31-at-15.01.09-2.jpeg"
        ]
    },
    {
        "title": "Audi A6 2012",
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
        "horsepower": 175,
        "price": 9500,
        "mileage": 290000,
        "production_year": 2012,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H Auto Trade iti gaseste client, o vinde pentru tine si se ocupa de toata partea birocratica.\nAi o intrebare",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-27-at-16.16.52.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-27-at-16.16.52-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-27-at-16.16.51-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-27-at-16.16.54-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-27-at-16.16.54-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-27-at-16.16.53-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-27-at-16.16.52-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-27-at-16.16.52-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-27-at-16.16.52-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-27-at-16.16.53-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-27-at-16.16.53-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-27-at-16.16.53-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-27-at-16.16.53.jpeg"
        ]
    },
    {
        "title": "Volkswagen Golf 2010",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1936,
            "name": "Golf"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 105,
        "price": 4200,
        "mileage": 264000,
        "production_year": 2010,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nVolkswagen Golf 6 Euro 5\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H Auto Trade iti gaseste client, o vinde pentru tine si se ocupa de toata partea",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-18-at-12.27.31-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-18-at-12.27.31.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-18-at-12.27.30-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-18-at-12.27.31-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-18-at-12.27.31-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-18-at-12.27.32-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-18-at-12.27.32-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-18-at-12.27.33.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-18-at-12.27.32-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-18-at-12.27.32-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-18-at-12.27.32.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-31-at-15.01.07-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-27-at-16.16.51.jpeg"
        ]
    },
    {
        "title": "Opel Insignia 2009",
        "brand": {
            "id": 105,
            "name": "Opel"
        },
        "model": {
            "id": 1460,
            "name": "Insignia"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 160,
        "price": 4500,
        "mileage": 210000,
        "production_year": 2009,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nOpel Insigna Full Euro 5\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 650 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H Auto Trade",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-15-at-18.20.33.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-15-at-18.20.33-2-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-15-at-18.20.33-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-15-at-18.20.34.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-15-at-18.20.35.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-15-at-18.20.36.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-15-at-18.20.34-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-15-at-18.20.34-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-15-at-18.20.34-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-15-at-18.20.35-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-15-at-18.20.35-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-15-at-18.20.35-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-15-at-18.20.36-1.jpeg"
        ]
    },
    {
        "title": "BMW Seria 5 2008",
        "brand": {
            "id": 18,
            "name": "BMW"
        },
        "model": {
            "id": 192,
            "name": "Seria 5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 160,
        "price": 4500,
        "mileage": 350000,
        "production_year": 2008,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\n– Bi-Xenon adaptiv\n– Dublu climatronic\n– Pilot automat\n– Scaune full piele cu reglaj electric\n– Încălzire în scaune\n– Comenzi volan\n– Senzori parcare spate-fată cu afisaj\n– Computer de bord\n– Inchidere centralizată\n– Oglinzi cu reglare electrică si încalzite\n– Servodirecție\n– Geamuri electrice fata-spate\n– Faruri automate\n– Senzori lumini,ploaie etc\n– Abs ,ESP,etc..\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 650 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua.",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/06/90d38b52-8a6a-453a-b7b0-f157b4d54ff8.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/9a286161-f7b9-4582-ba5e-f4df159cbeca.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/c9cf846c-7983-4d24-8137-2a003dcba890-1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/3dadc578-1d55-4ac2-9613-63e1759bb7e6.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/bc5eb9e5-2f5d-4b11-a085-9e588466fd9f.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/91510a61-6257-4963-8011-445016777afb.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/7f2a8a68-d61d-46db-b887-e102bd293420.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/a68e5562-143c-4817-b9ca-9c26a31c43f1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/8dd416ba-a581-4f43-b76d-a0b76653af1b.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/9f3a803f-371a-404a-a249-e478bc7ba0a7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/d83eef73-8369-42f5-9fe8-c4511119c89b.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/bf0b9e4d-36cb-44a9-833e-710e987c8fff.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/caec0e92-9e08-4aac-8318-8155b1edb67d.jpg"
        ]
    },
    {
        "title": "Ford Fiesta 2009",
        "brand": {
            "id": 44,
            "name": "Ford"
        },
        "model": {
            "id": 641,
            "name": "Fiesta"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 120,
        "price": 3990,
        "mileage": 233000,
        "production_year": 2009,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 4",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\n– Ac perfect funcțional\n– Încălzire în scaune\n– Comenzi volan\n– Senzori parcare spate-fată\n– Computer de bord\n– Inchidere centralizată\n– Oglinzi cu reglare electrică si încalzite\n– Servodirecție\n– Geamuri electrice fata-spate\n– Faruri automate\n– Senzori lumini,ploaie etc\n– Abs ,ESP,etc..\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 600 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/06/1158cdf5-dd3b-4cdb-87d0-6fcd57ade37e-1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/3d7e29c0-9dc1-4567-ad31-7f56e7998967.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/618d8f86-0e4b-49d8-871c-e8e3ecc26d32.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/f475354d-4b53-4fb9-b6d6-8e72694c50ad.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/973404f2-bdb5-4645-ac25-414daf367437.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/f40ea7b5-bf73-4bc7-ac94-6140e913af16.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/f95d7f3a-1df1-4b9b-8f38-82136cb25b3b.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/17e42929-ca8f-44b8-b278-23e5f49cfda4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/8c9c4508-f985-44a3-bac2-257026572367.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/c5699f32-4683-46f1-afa5-d0423f3cdee4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/66e1482b-f88b-47f6-9416-933c15ec7ef0.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/cb8dc526-0592-48d6-ade4-cdea5a0d6539.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/f5634de4-8f85-42c0-8786-2322271015d1.jpg"
        ]
    },
    {
        "title": "JAC Altele 2026",
        "brand": {
            "id": 61,
            "name": "JAC"
        },
        "model": {
            "id": 2031,
            "name": "Altele"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 174,
        "price": 30990,
        "mileage": 20,
        "production_year": 2026,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\n26.042€ net + TVA\n(TVA deductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\n(TVA nedeductibil)\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H Auto Trade iti gaseste client, o vinde pentru tine si se ocupa de toata",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-31-at-15.01.07-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-27-at-16.16.51.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-18-at-12.27.30.jpeg"
        ]
    },
    {
        "title": "Citroen C5 2010",
        "brand": {
            "id": 28,
            "name": "Citroen"
        },
        "model": {
            "id": 374,
            "name": "C5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 140,
        "price": 4900,
        "mileage": 233000,
        "production_year": 2010,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nCitroen C5 Exclusiv Full\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 700 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H Auto Trade",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-01-at-13.52.23.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-01-at-13.52.24-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-01-at-13.52.25-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-01-at-13.52.25-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-01-at-13.52.25-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-01-at-13.52.25-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-01-at-13.52.25.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-01-at-13.52.26-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-01-at-13.52.26-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-01-at-13.52.26-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-01-at-13.52.26-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-01-at-13.52.26-5.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-01-at-13.52.26.jpeg"
        ]
    },
    {
        "title": "Ford Fusion 2005",
        "brand": {
            "id": 44,
            "name": "Ford"
        },
        "model": {
            "id": 646,
            "name": "Fusion"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 90,
        "price": 2000,
        "mileage": 180000,
        "production_year": 2005,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 3",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 318 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H Auto Trade iti gaseste client, o",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-05-31-at-17.41.33.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-05-31-at-17.41.34.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-05-31-at-17.41.34-1-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-05-31-at-17.41.35-5.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-05-31-at-17.41.36.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-05-31-at-17.41.34-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-05-31-at-17.41.34-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-05-31-at-17.41.34-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-05-31-at-17.41.35-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-05-31-at-17.41.35-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-05-31-at-17.41.35-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-05-31-at-17.41.35-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/06/WhatsApp-Image-2026-05-31-at-17.41.35.jpeg"
        ]
    },
    {
        "title": "BMW X6 2024",
        "brand": {
            "id": 18,
            "name": "BMW"
        },
        "model": {
            "id": 204,
            "name": "X6"
        },
        "engine": {
            "capacity": "3.0 L",
            "fuel_type": "Hibrid Benzină"
        },
        "horsepower": 286,
        "price": 97600,
        "mileage": 1,
        "production_year": 2024,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Hibrid",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nBMW X6 30d NOU !!!\n80.000€ net + TVA\n(TVA deductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\n(TVA nedeductibil)\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H Auto Trade iti gaseste client, o vinde pentru tine si",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-13-at-14.50.52-1-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-13-at-14.50.52.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-13-at-14.50.53-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-13-at-14.50.53.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-13-at-14.50.54-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-13-at-14.50.54-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-13-at-14.50.54-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-13-at-14.50.54.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-13-at-14.50.55-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-13-at-14.50.55-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-13-at-14.50.55-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-13-at-14.50.55.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-13-at-14.50.56-1.jpeg"
        ]
    },
    {
        "title": "Volkswagen Golf 2008",
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
        "horsepower": 140,
        "price": 5200,
        "mileage": 132000,
        "production_year": 2008,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 4",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nVolkswagen Golf 5\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\n– Cutie automată\n– Pilot automat\n– Comenzi volan\n– Senzori parcare spate\n– Computer de bord\n– Inchidere centralizată\n– Oglinzi cu reglare electrică si încalzite\n– Servodirecție\n– Geamuri electrice fată -spate\n– Faruri automate\n– Senzori lumini, ploaie etc.\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/04/ccda4a55-0d2b-4111-87d9-d21420f1572f.jfif_.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/36031a85-5897-4504-80ec-260656c8f3f8.jfif_.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/59273306-61f7-445a-a96e-9a01806f6959.jfif_-1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/be1b7d9e-f89b-4eac-9f04-4e4790e361e5.jfif_.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/55610d36-bc3b-4bdb-8835-8884c382566b.jfif_.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/4afd4d89-3c85-469b-ad91-8aeee0c3b619.jfif_.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/30e90754-e76f-486f-91f5-3c91396e958e.jfif_.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/b62d480b-9207-483d-a3a5-31a12545652f.jfif_.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/c5644e89-3430-4061-b793-226f3cf5c1f0.jfif_.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/68e805e1-698e-4446-95bc-486845e37173.jfif_.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/ad9193cb-afcb-462d-a97d-84d1311a92a7.jfif_.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/f41acdc4-c99a-4d20-9132-89ac9e7b1470.jfif_.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/50a4518a-df4e-4ee9-841a-94b027849f28.jfif_.jpg"
        ]
    },
    {
        "title": "BMW Seria 3 2008",
        "brand": {
            "id": 18,
            "name": "BMW"
        },
        "model": {
            "id": 190,
            "name": "Seria 3"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 140,
        "price": 5200,
        "mileage": 260000,
        "production_year": 2008,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 650 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H Auto Trade iti gaseste client, o",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-10.17.00.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-10.17.01.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-10.17.01-1-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-10.17.04-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-10.17.05.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-10.17.03-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-10.17.02.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-10.17.04.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-10.17.04-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-10.17.04-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-10.17.02-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-10.17.02-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-10.17.03-2.jpeg"
        ]
    },
    {
        "title": "BMW Seria 1 2012",
        "brand": {
            "id": 18,
            "name": "BMW"
        },
        "model": {
            "id": 188,
            "name": "Seria 1"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 135,
        "price": 5500,
        "mileage": 193000,
        "production_year": 2012,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nBMW Seria 1, 116i\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 750 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H Auto Trade iti",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-09.58.16-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-09.58.16-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-09.58.18-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-09.58.18-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-09.58.17-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-09.58.17-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-09.58.17.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-09.58.18-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-09.58.17-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-09.58.17-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-09.58.18.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-22-at-09.58.18-2.jpeg"
        ]
    },
    {
        "title": "Ford Focus 2016",
        "brand": {
            "id": 44,
            "name": "Ford"
        },
        "model": {
            "id": 643,
            "name": "Focus"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 120,
        "price": 5000,
        "mileage": 255000,
        "production_year": 2016,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nFord Focus 1.5 EcoBlue Start-Stopp-System TITANIUM STYLE\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\n– Comenzi volan\n– Pilot automat\n– Computer de bord\n– Inchidere centralizată\n– Oglinzi cu reglare electrică si încalzite\n– Servodirecție\n– Geamuri electrice fata-spate\n– Faruri automate\n– Senzori lumini, ploaie etc.\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/04/627359166_1803615770886575_6468875443190029215_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/627697584_1803615977553221_824477282217102688_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/627508623_1803616047553214_1511305703757579823_n-1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/627683861_1803615927553226_8995321083663891954_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/627389895_1803616117553207_8276313085316817845_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/627687274_1803615754219910_2436424668904644197_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/627559311_1803615757553243_5976476125009671143_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/627688522_1803615830886569_695856028747491942_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/627480469_1803615940886558_3566943093609631051_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/627693826_1803616017553217_4179791946535708188_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/627559311_1803615857553233_3317259641163992501_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/627239649_1803616074219878_498170390840968458_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/627474433_1803615854219900_1298940164526318271_n.jpg"
        ]
    },
    {
        "title": "Toyota Aygo 2008",
        "brand": {
            "id": 140,
            "name": "Toyota"
        },
        "model": {
            "id": 1847,
            "name": "Aygo"
        },
        "engine": {
            "capacity": "1.0 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 68,
        "price": 2500,
        "mileage": 250000,
        "production_year": 2008,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 4",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H Auto Trade iti gaseste client, o vinde pentru tine si se ocupa de toata partea birocratica.\nAi o intrebare",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-01-at-18.37.23-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-01-at-18.37.24-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-01-at-18.37.22.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-01-at-18.37.21.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-01-at-18.37.22-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-01-at-18.37.22-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-01-at-18.37.23-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-01-at-18.37.23.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-01-at-18.37.22-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-01-at-18.37.23-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-01-at-18.37.23-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-01-at-18.37.24-1.jpeg"
        ]
    },
    {
        "title": "Volkswagen Golf Plus 2010",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1937,
            "name": "Golf Plus"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 105,
        "price": 5200,
        "mileage": 240000,
        "production_year": 2010,
        "vin": "",
        "body_type": "Minivan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nVolkswagen Golf Plus\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 500 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H Auto Trade iti",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-26-at-16.25.46.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-26-at-16.25.45.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-26-at-16.25.46-2-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-26-at-16.25.47.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-26-at-16.25.46-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-26-at-16.25.46-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-26-at-16.25.47-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-26-at-16.25.48-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-26-at-16.25.48-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-26-at-16.25.48.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-26-at-16.25.48-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-26-at-16.25.47-1.jpeg"
        ]
    },
    {
        "title": "Volkswagen Touran 2009",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1968,
            "name": "Touran"
        },
        "engine": {
            "capacity": "1.9 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 105,
        "price": 4900,
        "mileage": 310000,
        "production_year": 2009,
        "vin": "",
        "body_type": "Minivan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 4",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nVolkswagen Touran Automat 7 Locuri\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 500 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.30.22.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.30.21.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.30.22-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.30.22-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.30.24-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.30.25-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.30.25.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.30.23-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.30.23.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.30.24-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.30.23-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.30.24.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.30.23-1.jpeg"
        ]
    },
    {
        "title": "Volkswagen Beetle 2012",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1924,
            "name": "Beetle"
        },
        "engine": {
            "capacity": "1.2 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 105,
        "price": 5900,
        "mileage": 193000,
        "production_year": 2012,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nVolkswagen Beetle\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 800 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H Auto Trade iti",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.22.27-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.22.27.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.22.28-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.22.28.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.22.29-5.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.22.29-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.22.30-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.22.28-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.22.29-7.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.22.28-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.22.29-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.22.29-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-10.22.29-3.jpeg"
        ]
    },
    {
        "title": "Dacia Dokker 2015",
        "brand": {
            "id": 31,
            "name": "Dacia"
        },
        "model": {
            "id": 414,
            "name": "Dokker"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 90,
        "price": 7350,
        "mileage": 155000,
        "production_year": 2015,
        "vin": "",
        "body_type": "Minivan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nPrețul inițial a fost: 7.350 &euro;.\nPrețul curent este: 6.000 &euro;.\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 1000 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/03/Dacia-Doker-1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/Dacia-Doker-5-1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/Dacia-Doker-3.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/Dacia-Doker-8.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/Dacia-Doker-12.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/Dacia-Doker-10.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/Dacia-Doker-11.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/Dacia-Doker-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/Dacia-Doker-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/Dacia-Doker-9.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/Dacia-Doker-6.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-03-at-11.35.54.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-03-at-11.35.53.jpeg"
        ]
    },
    {
        "title": "Volkswagen Golf 2009",
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
        "horsepower": 120,
        "price": 5300,
        "mileage": 230000,
        "production_year": 2009,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nVolkswagen Golf 6\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 650 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H Auto Trade iti",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/02/Volkswagen-Golf-6-1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Volkswagen-Golf-6-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Volkswagen-Golf-6-11.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Volkswagen-Golf-6-13.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Volkswagen-Golf-6-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Volkswagen-Golf-6-6.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Volkswagen-Golf-6-10.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Volkswagen-Golf-6-12.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Volkswagen-Golf-6-3.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Volkswagen-Golf-6-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Volkswagen-Golf-6-5.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Volkswagen-Golf-6-8.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Volkswagen-Golf-6-9.jpg"
        ]
    },
    {
        "title": "Skoda Superb 2011",
        "brand": {
            "id": 125,
            "name": "Skoda"
        },
        "model": {
            "id": 1730,
            "name": "Superb"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 105,
        "price": 6490,
        "mileage": 232000,
        "production_year": 2011,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nPrețul inițial a fost: 6.490 &euro;.\nPrețul curent este: 5.500 &euro;.\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 850 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Superb-1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Superb-4-1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Superb-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Superb-3.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Superb-14.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Superb-6.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Superb-11.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Superb-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Superb-12.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Superb-13.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Superb-10.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Superb-9.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Superb-5.jpg"
        ]
    },
    {
        "title": "Skoda Fabia 2010",
        "brand": {
            "id": 125,
            "name": "Skoda"
        },
        "model": {
            "id": 1718,
            "name": "Fabia"
        },
        "engine": {
            "capacity": "1.2 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 70,
        "price": 3500,
        "mileage": 152000,
        "production_year": 2010,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nPrețul inițial a fost: 3.500 &euro;.\nPrețul curent este: 3.000 &euro;.\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H Auto Trade iti gaseste client, o vinde",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Fabia-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Fabia-1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Fabia-3-1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Fabia-9.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Fabia-8.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Fabia-5.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Fabia-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Fabia-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Skoda-Fabia-6.jpg"
        ]
    },
    {
        "title": "Mini Cooper 2012",
        "brand": {
            "id": 96,
            "name": "Mini"
        },
        "model": {
            "id": 1321,
            "name": "Cooper"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 110,
        "price": 6200,
        "mileage": 257000,
        "production_year": 2012,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nMini Cooper D Clubman\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa te ocupi de vanzarea acesteia? S-H Auto Trade iti gaseste client, o vinde pentru tine si se ocupa de toata partea",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/02/Mini-Cooper-1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Mini-Cooper-2-1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Mini-Cooper-14.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Mini-Cooper-16.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Mini-Cooper-3.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Mini-Cooper-5.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Mini-Cooper-6.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Mini-Cooper-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Mini-Cooper-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Mini-Cooper-13.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Mini-Cooper-8.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Mini-Cooper-11.jpg",
            "https://shautotrade.ro/wp-content/uploads/2026/02/Mini-Cooper-12.jpg"
        ]
    },
    {
        "title": "Audi A3 2013",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 99,
            "name": "A3"
        },
        "engine": {
            "capacity": "1.4 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 120,
        "price": 8500,
        "mileage": 250000,
        "production_year": 2013,
        "vin": "",
        "body_type": "Coupe",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nPrețul inițial a fost: 8.500 &euro;.\nPrețul curent este: 8.000 &euro;.\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 1000 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de masini la comanda. Tu doar spune-ne ce masina iti place, iar noi ti-o livram acasa.\nAi o masina de vanzare, dar nu ai timp si chef suficient sa",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-26-at-11.19.18.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-26-at-11.19.19.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-26-at-11.19.17-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-26-at-11.19.19-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-26-at-11.19.19-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-26-at-11.19.20.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-26-at-11.19.19-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-26-at-11.19.20-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-26-at-11.19.20-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-26-at-11.19.20-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-26-at-11.19.20-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-26-at-11.19.21-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-26-at-11.19.21-2.jpeg"
        ]
    },
    {
        "title": "Opel Astra 2016",
        "brand": {
            "id": 105,
            "name": "Opel"
        },
        "model": {
            "id": 1447,
            "name": "Astra"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 110,
        "price": 6000,
        "mileage": 253000,
        "production_year": 2016,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nOpel Astra Sports Tourer\nPrețul inițial a fost: 6.000 &euro;.\nPrețul curent este: 5.000 &euro;.\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\n-Navigație mare\n-Moduri de condus eco/normal\n-Senzori parcare fata/spate\n-Dublu climatronic\n-Computer de bord\n-Inchidere centralizată\n-Oglinzi cu reglare electrică si încalzite\n-Geamuri electrice fata-spate\n-Faruri automate\n-Jante aluminiu\n-Senzori lumini, ploaie etc.\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 650 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2025/12/Opel-Astra-5.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/12/Opel-Astra-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/12/Opel-Astra-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/12/Opel-Astra-3.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/12/Opel-Astra-13.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/12/Opel-Astra-12.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/12/Opel-Astra-11.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/12/Opel-Astra-10.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/12/Opel-Astra-9.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/12/Opel-Astra-8.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/12/Opel-Astra-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/12/Opel-Astra-6.jpg"
        ]
    },
    {
        "title": "Opel Astra 2018",
        "brand": {
            "id": 105,
            "name": "Opel"
        },
        "model": {
            "id": 1447,
            "name": "Astra"
        },
        "engine": {
            "capacity": "1.4 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 150,
        "price": 9400,
        "mileage": 173000,
        "production_year": 2018,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nPrețul inițial a fost: 9.400 &euro;.\nPrețul curent este: 8.900 &euro;.\n7.355€ net + TVA\n(TVA deductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\n– Încălzire în scaune\n– Încalzire in volan\n– Cameră marsalier\n– Senzori parcare fata/spate\n– Dublu climatronic\n– Computer de bord\n– Comenzi volan\n– Inchidere centralizată\n– Oglinzi cu reglare electrică si încalzite\n– Servodirecție\n– Geamuri electrice fata-spate\n– Faruri automate\n– Jante aluminiu\n– Senzori lumini, ploaie etc.\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\n(TVA nedeductibil)\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2025/11/Opel-Astra-K-6.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/11/Opel-Astra-K-20.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/11/Opel-Astra-K-13.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/11/Opel-Astra-K-1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/11/Opel-Astra-K-17.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/11/Opel-Astra-K-3.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/11/Opel-Astra-K-18.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/11/Opel-Astra-K-10.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/11/Opel-Astra-K-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/11/Opel-Astra-K-5.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/11/Opel-Astra-K-8.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/11/Opel-Astra-K-9.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/11/Opel-Astra-K-12.jpg"
        ]
    },
    {
        "title": "BMW X5 2021",
        "brand": {
            "id": 18,
            "name": "BMW"
        },
        "model": {
            "id": 202,
            "name": "X5"
        },
        "engine": {
            "capacity": "3.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 286,
        "price": 52017,
        "mileage": 118000,
        "production_year": 2021,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nBMW X5 xDrive30d M Garantie BMW 2 ani\nPrețul inițial a fost: 52.017 &euro;.\nPrețul curent este: 48.400 &euro;.\n40.000€ net + TVA\n(TVA deductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\n– Transmisie: Automată sport Steptronic 8 trepte\n– Tracțiune: Integrală xDrive\n– Pachet M Sport complet (interior + exterior)\n– Pachet Aerodinamic M\n– Suspensie adaptivă M\n– Frâne M Sport\n– Jante M 21” Y-Spoke 741M cu anvelope Runflat\n– Shadow Line High Gloss + elemente exterioare negre lucioase\n– Individual Shadow Line Lights\n– Bare longitudinale plafon Shadow Line\n– Eliminare inscripție model (look curat, sportiv)\n– Faruri BMW Laserlight – iluminare extinsă și precisă\n– Faruri LED cu funcție adaptivă și High Beam Assistant\n– Geamuri fumurii Privacy Glass\n– Trapă panoramică din sticlă\n– Oglinzi exterioare cu reglaj și rabatare electrică + auto-dimming\n– Lumină ambientală exterioară și interioară completă\n– Spoilere M Sport + plafon antracit M\n– Scaune față confort cu reglaje electrice, memorie și ventilație + încălzire\n– Pachet Heat Comfort (volan încălzit + cotiere încălzite)\n– Climatizare automată pe 4 zone\n– Volan M îmbrăcat în piele\n– Bord Sensatec + finisaje Aluminiu Tetragon\n– Pachet Comfort Access – acces fără cheie + deschidere portbagaj electrică\n– Portbagaj acționat electric\n– Capac portbagaj protejat (cover)\n– Covorașe velur originale BMW\n– Priză 12V",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2025/10/BMW-X5-xDrive30d-M-Sport-1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/10/BMW-X5-xDrive30d-M-Sport-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/10/BMW-X5-xDrive30d-M-Sport-8.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/10/BMW-X5-xDrive30d-M-Sport-5.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/10/BMW-X5-xDrive30d-M-Sport-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/10/BMW-X5-xDrive30d-M-Sport-6.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/10/BMW-X5-xDrive30d-M-Sport-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/10/BMW-X5-xDrive30d-M-Sport-9.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/10/BMW-X5-xDrive30d-M-Sport-10.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/10/BMW-X5-xDrive30d-M-Sport-11.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/10/BMW-X5-xDrive30d-M-Sport-12.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/10/BMW-X5-xDrive30d-M-Sport-13.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/10/BMW-X5-xDrive30d-M-Sport-14.jpg"
        ]
    },
    {
        "title": "Dacia Lodgy 2016",
        "brand": {
            "id": 31,
            "name": "Dacia"
        },
        "model": {
            "id": 417,
            "name": "Lodgy"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 110,
        "price": 7690,
        "mileage": 222750,
        "production_year": 2016,
        "vin": "",
        "body_type": "Minivan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nDacia Lodgy 1.5 dCi Stepway\nPrețul inițial a fost: 7.690 &euro;.\nPrețul curent este: 6.000 &euro;.\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\n-Pachet stepway\n-Incalzire in scaune\n-Senzori parcare\n-Computer de bord\n-Inchidere centralizată\n-Oglinzi cu reglare electrică si încalzite\n-Geamuri electrice fata-spate\n-Faruri automate\n-Jante aluminiu\n-Senzori lumini,ploaie etc\n-Abs ,ESP,etc..\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 830 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2025/08/image-1-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/08/image-2-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/08/image-3-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/08/image-4-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/08/image-5-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/08/image-6-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/08/image-7-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/08/image-8-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/08/image-9-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/08/image-10-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/08/image-11-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/08/image-12-3.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/08/image-13-3.jpg"
        ]
    },
    {
        "title": "Dacia Lodgy 2012",
        "brand": {
            "id": 31,
            "name": "Dacia"
        },
        "model": {
            "id": 417,
            "name": "Lodgy"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 90,
        "price": 6200,
        "mileage": 242000,
        "production_year": 2012,
        "vin": "",
        "body_type": "Minivan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nDacia Lodgy 1.5 dCi 90 CP Stepway\nPrețul inițial a fost: 6.200 &euro;.\nPrețul curent este: 5.000 &euro;.\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\n– Comenzi volan\n– Computer de bord\n– Inchidere centralizată\n– Oglinzi cu reglare electrică si încalzite\n– Servodirecție\n– Geamuri electrice fata-spate\n– Faruri automate\n– Jante aluminiu\n– Senzori lumini,ploaie etc\n– Abs ,ESP,etc..\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 661 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2025/06/Dacia-Lodgy-1.5-dCi-90-CP-Stepway-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/Dacia-Lodgy-1.5-dCi-90-CP-Stepway-8.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/Dacia-Lodgy-1.5-dCi-90-CP-Stepway-10.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/Dacia-Lodgy-1.5-dCi-90-CP-Stepway-9.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/Dacia-Lodgy-1.5-dCi-90-CP-Stepway-1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/Dacia-Lodgy-1.5-dCi-90-CP-Stepway-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/Dacia-Lodgy-1.5-dCi-90-CP-Stepway-3.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/Dacia-Lodgy-1.5-dCi-90-CP-Stepway-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/Dacia-Lodgy-1.5-dCi-90-CP-Stepway-5.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/Dacia-Lodgy-1.5-dCi-90-CP-Stepway-11.jpg"
        ]
    },
    {
        "title": "Audi A3 2010",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 99,
            "name": "A3"
        },
        "engine": {
            "capacity": "1.4 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 125,
        "price": 6900,
        "mileage": 180000,
        "production_year": 2010,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nAudi A3 1.4 TFSI Sportback S line Sportpaket\nPrețul inițial a fost: 6.900 &euro;.\nPrețul curent este: 5.500 &euro;.\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\n– Pachet S line interior exterior\n– Încalzire in scaune\n– Dublu climatronic\n– Pilot automat\n– Computer de bord\n– Senzori parcare spate cu afisaj\n– Inchidere centralizată\n– Oglinzi cu reglare electrică si încalzite\n– Servodirecție\n– Geamuri electrice fata-spate\n– Faruri automate\n– Jante aluminiu\n– Senzori lumini,ploaie etc\n– Abs ,ESP,etc.\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 750 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-17.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-1-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-2-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-3-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-4-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-5-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-6-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-7-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-8-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-9-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-10-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-11-2.jpg"
        ]
    },
    {
        "title": "Audi Q8 2020",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 117,
            "name": "Q8"
        },
        "engine": {
            "capacity": "3.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 286,
        "price": 49900,
        "mileage": 190000,
        "production_year": 2020,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nAudi Q8 50 TDI quattro Tiptronic\nPrețul inițial a fost: 49.900 &euro;.\nPrețul curent este: 49.400 &euro;.\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\n– Climatronic 4 zone\n– Încălzire in scaune\n– Faruri matrix\n– Cameră marșalier\n– Keyless go ,Keyless entry\n– Comenzi volan\n– Pilot automat\n– Portbagaj electric\n– Computer de bord\n– Senzori parcare spate-fata cu afisaj\n– Inchidere centralizată\n– Oglinzi cu reglare electrică si încalzite\n– Servodirecție\n– Geamuri electrice fata-spate\n– Faruri automate\n– Jante aluminiu\n– Senzori lumini,ploaie etc\n– Abs ,ESP,etc..\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 4999 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-1.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-3.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-5.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-6.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-8.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-9.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-10.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-11.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-12.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/06/image-13.jpg"
        ]
    },
    {
        "title": "Volkswagen Golf 2009",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1936,
            "name": "Golf"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Benzină + GPL"
        },
        "horsepower": 102,
        "price": 6200,
        "mileage": 226000,
        "production_year": 2009,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 4",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nVolkswagen Golf 1.6 Highline\nPrețul inițial a fost: 6.200 &euro;.\nPrețul curent este: 5.500 &euro;.\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\n– Bi-fuel(echipare gaz din fabrica)\n– Dublu climatronic\n– Scaune full piele\n– Încălzire in scaune\n– Trapă electrică\n– Cameră marșalier\n– Comenzi volan\n– Pilot automat\n– Computer de bord\n– Senzori parcare spate-fata cu afisaj\n– Inchidere centralizată\n– Oglinzi cu reglare electrică si încalzite\n– Servodirecție\n– Geamuri electrice fata-spate\n– Faruri automate\n– Jante aluminiu\n– Senzori lumini,ploaie etc\n– Abs ,ESP,etc..\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 660 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-13-6.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-1-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-3-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-4-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-14-5.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-2-8.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-5-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-6-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-7-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-8-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-9-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-10-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-11-6.jpg"
        ]
    },
    {
        "title": "Nissan Qashqai 2014",
        "brand": {
            "id": 100,
            "name": "Nissan"
        },
        "model": {
            "id": 1414,
            "name": "Qashqai"
        },
        "engine": {
            "capacity": "1.2 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 115,
        "price": 9200,
        "mileage": 206600,
        "production_year": 2014,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nNissan Qashqai 1.2 DIG-T Start/Stop Tekna\nPrețul inițial a fost: 9.200 &euro;.\nPrețul curent este: 8.500 &euro;.\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\n– Dublu climatronic\n– Cameră marșalier\n– Comenzi volan\n– Keyless entry\n– Pilot automat\n– Computer de bord\n– Senzori parcare spate-fata cu afisaj\n– Inchidere centralizată\n– Oglinzi cu reglare electrică si încalzite\n– Servodirecție\n– Geamuri electrice fata-spate\n– Faruri automate\n– Jante aluminiu\n– Senzori lumini,ploaie etc\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 1000 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2025/05/WhatsApp-Image-2026-07-25-at-15.22.06.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/WhatsApp-Image-2026-07-25-at-15.22.06-1.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/WhatsApp-Image-2026-07-25-at-15.22.05.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/WhatsApp-Image-2026-07-25-at-15.22.06-2.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/WhatsApp-Image-2026-07-25-at-15.22.06-3.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/WhatsApp-Image-2026-07-25-at-15.22.06-4.jpeg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-5-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-6-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-7-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-8-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-9-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-10-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/05/image-11-1.jpg"
        ]
    },
    {
        "title": "Opel Corsa 2009",
        "brand": {
            "id": 105,
            "name": "Opel"
        },
        "model": {
            "id": 1453,
            "name": "Corsa"
        },
        "engine": {
            "capacity": "1.0 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 60,
        "price": 2890,
        "mileage": 163000,
        "production_year": 2009,
        "vin": "",
        "body_type": "Coupe",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 4",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nOpel Corsa 1.0 12V Edition\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\n– Încălzire in scaune\n– Computer de bord\n– Inchidere centralizată\n– Oglinzi cu reglare electrică si încalzite\n– Servodirecție\n– Faruri automate\n– Senzori lumini,ploaie etc\n– Abs ,ESP, etc.\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 278 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai gasit masina potrivita in parcul nostru auto? Nicio problema, caci S-H Auto Trade ofera si serviciul de",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2025/04/Opel-Corsa-1.0-12V-Edition-2.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/04/Opel-Corsa-1.0-12V-Edition-3.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/04/Opel-Corsa-1.0-12V-Edition-4.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/04/Opel-Corsa-1.0-12V-Edition-5.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/04/Opel-Corsa-1.0-12V-Edition-6.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/04/Opel-Corsa-1.0-12V-Edition-7.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/04/Opel-Corsa-1.0-12V-Edition-8.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/04/Opel-Corsa-1.0-12V-Edition-9.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/04/Opel-Corsa-1.0-12V-Edition-10.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/04/Opel-Corsa-1.0-12V-Edition-11.jpg"
        ]
    },
    {
        "title": "Suzuki SX4 2010",
        "brand": {
            "id": 131,
            "name": "Suzuki"
        },
        "model": {
            "id": 1794,
            "name": "SX4"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 135,
        "price": 5000,
        "mileage": 265000,
        "production_year": 2010,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nSuzuki SX4 2.0 DDIS 4×2 Style\nPrețul inițial a fost: 5.000 &euro;.\nPrețul curent este: 3.990 &euro;.\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\n-Incalzire in scaune\n-Computer de bord\n-Senzori parcare spate\n-Inchidere centralizată\n-Oglinzi cu reglare electrică si încalzite\n-Geamuri electrice fata-spate\n-Faruri automate\n-Jante aluminiu vara /iarna\n-Senzori lumini,ploaie etc\n-Abs ,ESP,etc..\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 571 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2025/02/475088891_1471176867463802_7604505832370310803_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/02/475467613_1471176830797139_7069142397603465895_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/02/475761049_1471176917463797_2119622145377589688_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/02/475808741_1471176997463789_1891646167236744802_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/02/475856261_1471177160797106_7796944852031612101_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/02/475862178_1471176857463803_4039092039434058742_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/02/475981140_1471176920797130_9053206404106689177_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/02/476123157_1471177000797122_4931415858818058538_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/02/476466159_1471176924130463_118015522843255804_n.jpg"
        ]
    },
    {
        "title": "Volkswagen Golf 2010",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1936,
            "name": "Golf"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 105,
        "price": 5600,
        "mileage": 274000,
        "production_year": 2010,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0754485506",
        "description": "Str. István Balogh nr. 17, Oradea\nObtine finantare\nVolkswagen Golf 1.6 TDI BlueMotion Technology DPF Highline\nPrețul inițial a fost: 5.600 &euro;.\nPrețul curent este: 4.500 &euro;.\n(TVA nedeductibil)\n12 luni GARANTIE\nLivrare la domiciliu\nIstoric verificat\nNumere provizorii\nAi intrebari? Contacteaza-ne!\nVreau credit auto\n-Computer de bord\n-Inchidere centralizată\n-Oglinzi cu reglare electrică si încalzite\n-Geamuri electrice fata-spate\n-Faruri automate\n-Jante aluminiu\n-Senzori lumini,ploaie etc\n-Abs ,ESP,etc..\naplici rapid, la noi in parc sau online, doar cu buletinul\nSe iau in calcul veniturile din diurna, maternitate/paternitate\nvarsta intre 18 si 75 ani, la finalul creditului\nSalariu/alte venituri - minim 1651 / luna lei SAU pensie minim 1.281 lei / luna\ncontract de munca in Romania/UE sau pensie de varsta/boala\nminim 3 luni vechime la actualul angajator (RO) sau 6 luni (EU)\nCapacitate cilindrică:\nAchizitioneaza aceasta masina in rate, incepand de la 600 lei pe luna.*\nVreau sa simulez un credit auto\nRate de la 900 lei / luna\nCere detalii pe WhatsApp\nRate de la 700 lei / luna\nRate de la 650 lei / luna\nPlatesti masina cu banii jos doar daca doresti tu. S-H Auto Trade Oradea iti pune la dispozitie solutii avantajoase de finantare pentru masina ta, fie ca vorbim de credit auto sau leasing.\nAcum e mai simplu ca niciodata sa facem un schimb. Prin sistemul nostru de buy-back, ne lasi noua masina veche ca avans pentru una noua. Diferenta o poti plati atat cash, cat si in rate.\nNu ai",
        "images": [
            "https://shautotrade.ro/wp-content/uploads/2025/01/473578832_1459754711939351_6569064292782948596_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/01/473804328_1459754588606030_6459457976821858853_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/01/474687249_1459754591939363_5963150078743013500_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/01/474625311_1459754715272684_941287461095931197_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/01/473830964_1459754788606010_7484777210922533919_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/01/474147648_1459754821939340_2155522251376617973_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/01/473948397_1459754701939352_1769978161232067388_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/01/473611634_1459754915272664_4427038482514720790_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/01/473625819_1459754918605997_8506572492121202935_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/01/474084021_1459754581939364_5692255046108777106_n.jpg",
            "https://shautotrade.ro/wp-content/uploads/2025/01/473801431_1459754818606007_3492598653916020895_n.jpg"
        ]
    }
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let _last = 0;
async function politeFetch(url) {
    const wait = 350 - (Date.now() - _last); if (wait > 0) await sleep(wait); _last = Date.now();
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
            if (buf.length > MAX_IMG_BYTES) continue;
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
    console.log('\n╔══ SEED ShAutoTrade → CarFlip (37 mașini, toate în promo) ══╗\n');
    await mongoose.connect(process.env.DB_URL);
    console.log('   ✅ MongoDB conectat');

    const dealer = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(DEALER_ID) });
    if (!dealer) { console.log('❌ Contul ShAutoTrade nu există.'); await mongoose.disconnect(); process.exit(1); }
    console.log(`   ✅ dealer: ${dealer.username}`);

    const existing = new Set((await sales.find({ user_id: DEALER_ID }).select('title price').lean()).map(s => `${s.title}|${s.price}`));
    const toAdd = CARS.filter(c => !existing.has(`${c.title}|${c.price}`));
    console.log(`   ${CARS.length} în listă, ${CARS.length - toAdd.length} deja în DB, ${toAdd.length} de adăugat\n`);
    if (toAdd.length === 0) { console.log('Nimic de făcut.'); await mongoose.disconnect(); process.exit(0); }

    console.log('── Faza 1: descarc pozele (nimic în DB încă) ──');
    const prepared = [];
    for (const [i, car] of toAdd.entries()) {
        process.stdout.write(`   [${i+1}/${toAdd.length}] ${car.title.padEnd(30)} `);
        const files = await downloadImages(car.images, car.title);
        if (files.length === 0) {
            console.log('❌ 0 poze');
            console.log('\n⛔ ABORT: o mașină nu are poze. NU s-a scris nimic în DB.');
            for (const p of prepared) for (const f of p.files) await fs.remove(f.path).catch(()=>{});
            await mongoose.disconnect(); process.exit(1);
        }
        console.log(`✅ ${files.length}p`);
        prepared.push({ car, files });
    }

    console.log('\n── Faza 2: scriu în DB + pun media în coadă ──');
    let created = 0;
    for (const { car, files } of prepared) {
        const now = new Date();
        const paidUntil = addMonths(now, 6);
        const doc = new sales({
            user_id: DEALER_ID, user_name: DEALER_NAME, user_image: USER_IMAGE,
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
        console.log(`   ✅ ${car.title.padEnd(30)} ${files.length}p ⭐`);
    }

    console.log(`\n╔══ GATA ══╗`);
    console.log(`   ${created} anunțuri create pe contul ShAutoTrade.`);
    console.log(`   ⏳ Worker-ul procesează pozele → R2 → le activează.\n`);
    await mongoose.disconnect();
    process.exit(0);
}
main().catch(async (e) => { console.error('\n❌ EȘEC:', e); try { await mongoose.disconnect(); } catch {} process.exit(1); });