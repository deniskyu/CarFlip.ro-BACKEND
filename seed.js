#!/usr/bin/env node
// ============================================================================
//  seed_rbs.js — populează CarFlip cu cele 86 de mașini de la RbsAuto (rbsauto.ro).
//
//  RULARE (pe SERVER, lângă package.json — NU pe Mac):
//      node seed_rbs.js
//
//  • 86 mașini HARDCODATE (array CARS). Zero scraping la runtime.
//  • Nu atinge schema. Anunțuri normale pe contul RbsAuto.
//  • Pozele (URL rbsauto) se descarcă temporar → worker → R2. Worker-ul TREBUIE
//    să ruleze. URL-ul rbsauto nu se stochează.
//  • PRIMELE 12 primesc allow_social_promo:true; restul false.
//  • ALL-OR-NOTHING: descarcă toate pozele întâi; scrie în DB doar dacă TOTUL e ok.
//  • Idempotent: sare peste ce există deja (titlu+preț pe contul RbsAuto).
//
//  NOTĂ: rbsauto nu afișează norma Euro / culoarea / tracțiunea. Acestea sunt
//  DEDUSE: Euro din anul mașinii, tracțiune din model (SUV/quattro→4x4),
//  culoare = "Alta culoare". Restul (preț, km, an, capacitate, combustibil,
//  cutie, CP, poze) sunt reale de pe site.
// ============================================================================

import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs-extra';
import path from 'path';
import { addMonths, addDays } from 'date-fns';

import sales from './src/models/salesModel.js';
import { addMediaToQueue } from './src/mediaProcessing/mediaQueue.js';

const DEALER_ID   = '6a7a583fee365e699b5e551c';
const DEALER_NAME = 'RbsAuto';
const COUNTY = 'Suceava';
const CITY   = 'Rădăuți';
const PROMO_COUNT = 12;
const MAX_IMG_BYTES = 15 * 1024 * 1024;
const RAW_DIR = path.join(process.cwd(), 'temp_uploads', 'raw');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';

// ─────────────────────────────────────────────────────────────────────────────
//  CELE 86 DE MAȘINI (extrase de pe rbsauto.ro)
// ─────────────────────────────────────────────────────────────────────────────
const CARS = [
    {
        "title": "Volkswagen Tiguan 2019",
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
        "horsepower": 190,
        "price": 17990,
        "mileage": 165000,
        "production_year": 2019,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei, Distributie si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile\nKM 165.000\nCUTIE AUTOMATA\nMODURI DE CONDUS\nKEYLESS GO\nCLIMATRONIC PE 3 ZONE\nINCALZIRE IN SCAUNE\nINCALZIRE IN VOLAN\nNAVIGATIE MARE\nPADELE\nPILOT AUTOMAT\nCOMENZI PE VOLAN\nFRONT ASSIST\nSIDE ASSIST\nLANE ASSIST\nBORD DIGITAL\nHEAD UP DISPLAY\nMASAJ IN SCAUNE\nSENZORI DE LUMINA / PLOAIE\nCAMERA SPATE\nOGLINZI ELECTRICE\n17990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2738-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2739-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2739-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2740-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2740-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2741-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2741-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2742-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2742-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2744-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2744-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2743-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2743-1.jpg"
        ]
    },
    {
        "title": "Mercedes GLA 2017",
        "brand": {
            "id": 92,
            "name": "Mercedes"
        },
        "model": {
            "id": 1242,
            "name": "GLA"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 109,
        "price": 10490,
        "mileage": 261700,
        "production_year": 2017,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile\nKM 261.700\nCUTIE AUTOMATA\nDUBLU CLIMATRONIC\nINCALZIRE IN SCAUNE\nNAVIGATIE\nPADELE\nCOMENZI PE VOLAN\nPILOT AUTOMAT\nSIDE ASSIST\nGEAMURI ELECTRICE\nCOMPUTER BORD\n10490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2747-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2748-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2748-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2749-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2749-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2753-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2753-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2754-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2754-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2756-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2756-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2755-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2755-1.jpg"
        ]
    },
    {
        "title": "Audi Q5 2015",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 114,
            "name": "Q5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 163,
        "price": 14490,
        "mileage": 209000,
        "production_year": 2015,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 209.000\n🔵CUTIE AUTOMATA\n🔵PILOT AUTOMAT\n🔵INCALZIRE IN SCAUNE\n🔵DUBLU CLIMATRONIC\n🔵SENZORI DE PARCARE\n🔵ASISTENTA LA COBORARE IN PANTA\n🔵START / STOP\n🔵SENZORI DE LUMINA / PLOAIE\n🔵NAVIGATIE\n🔵COMPUTER BORD\n🔵COMENZI PE VOLAN\n💸14490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2603-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2604-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2604-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2606-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2606-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2608-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2608-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2609-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2609-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2611-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2611-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2610-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2610-1.jpg"
        ]
    },
    {
        "title": "Volkswagen Tiguan 2015",
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
        "horsepower": 110,
        "price": 10490,
        "mileage": 224000,
        "production_year": 2015,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 224.000\n🔵CUTIE MANUALA\n🔵PILOT AUTOMAT\n🔵KEYLESS GO\n🔵SENZORI DE LUMINA / PLOAIE\n🔵SENZORI DE PARCARE\n🔵DUBLU CLIMATRONIC\n🔵PARK ASSIST\n🔵SISTEM START / STOP\n🔵AUTO HOLD\n🔵PANORAMIC\n🔵CARLIG\n💸10490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2650-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2653-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2653-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2654-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2654-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2655-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2655-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2656-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2656-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2658-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2658-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2657-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2657-1.jpg"
        ]
    },
    {
        "title": "Volkswagen Tiguan 2016",
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
        "price": 16490,
        "mileage": 178000,
        "production_year": 2016,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 178.000\n🔵CUTIE AUTOMATA\n🔵MODURI DE CONDUS\n🔵PILOT AUTOMAT ADAPTIV\n🔵LANE ASSIST\n🔵FRONT ASSIST\n🔵SENZORI DE PARCARE\n🔵SENZORI DE LUMINA / PLOAIE\n🔵CAMERA SPATE\n🔵PARK ASSIST\n🔵SISTEM START / STOP\n🔵BORD DIGITAL\n🔵SISTEM AUDIO DYNAUDIO\n💸16490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2580-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2581-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2581-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2583-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2583-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2585-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2585-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2586-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2586-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2589-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2589-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2588-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2588-1.jpg"
        ]
    },
    {
        "title": "Skoda Superb 2015",
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
        "horsepower": 140,
        "price": 8490,
        "mileage": 231000,
        "production_year": 2015,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 231.000\n🔵CUTIE AUTOMATA\n🔵PILOT AUTOMAT\n🔵INCALZIRE IN SCAUNE\n🔵PADELE\n🔵SENZORI DE PARCARE\n🔵SENZORI DE LUMINA / PLOAIE\n🔵DUBLU CLIMATRONIC\n🔵CARLIG\n🔵FARURI BI-XENON\n💸8490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2551-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2552-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2552-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2554-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2554-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2556-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2556-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2559-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2559-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2560-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2560-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2561-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2561-1.jpg"
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
            "fuel_type": "Motorină"
        },
        "horsepower": 75,
        "price": 2990,
        "mileage": 168000,
        "production_year": 2010,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "🔴KM 168.000\n🔵CUTIE MANUALA\n🔵PILOT AUTOMAT\n🔵COMENZI PE VOLAN\n🔵COMPUTER BORD\n🔵NAVIGATIE\n🔵INCALZIRE IN LUNETA\n🔵START / STOP\n💸2990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2594-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2596-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2596-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2597-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2597-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2598-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2598-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2599-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2599-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2601-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2601-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2600-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2600-1.jpg"
        ]
    },
    {
        "title": "Volkswagen Sharan 2011",
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
        "horsepower": 140,
        "price": 8990,
        "mileage": 280000,
        "production_year": 2011,
        "vin": "",
        "body_type": "Minivan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 280.000\n🔵CUTIE MANUALA\n🔵PILOT AUTOMAT\n🔵SENZORI DE LUMINA / PLOAIE\n🔵CAMERA SPATE\n🔵INCALZIRE IN SCAUNE\n🔵DUBLU CLIMATRONIC\n🔵NAVIGATIE\n🔵COMPUTER BORD\n🔵7 LOCURI\n🔵OGLINZI ELECTRICE\n💸8990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2537-1-Copy.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2539-1-Copy-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2539-1-Copy.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2542-1-Copy-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2542-1-Copy.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2543-1-Copy-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2543-1-Copy.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2544-1-Copy-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2544-1-Copy.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2548-1-Copy-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2548-1-Copy.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2547-1-Copy-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2547-1-Copy.jpg"
        ]
    },
    {
        "title": "Seat Ateca 2022",
        "brand": {
            "id": 122,
            "name": "Seat"
        },
        "model": {
            "id": 1694,
            "name": "Ateca"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 150,
        "price": 13490,
        "mileage": 229000,
        "production_year": 2022,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 229.000\n🔵CUTIE MANUALA\n🔵PILOT AUTOMAT\n🔵FRONT ASSIST\n🔵APPLE CARPLAY / ANDROID AUTO\n🔵INCALZIRE IN VOLAN\n🔵INCALZIRE IN SCAUNE\n🔵DUBLU CLIMATRONIC\n🔵SENZORI DE LUMINA / PLOAIE\n🔵AUTO HOLD\n🔵SISTEM START/ STOP\n💸13490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2566-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2569-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2569-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2571-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2571-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2574-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2574-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2575-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2575-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2577-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2577-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2576-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2576-1.jpg"
        ]
    },
    {
        "title": "Audi Q5 2013",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 114,
            "name": "Q5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 177,
        "price": 14490,
        "mileage": 242000,
        "production_year": 2013,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 242.000\n🔵CUTIE AUTOMATA\n🔵DUBLU CLIMATRONIC\n🔵KEYLESS GO\n🔵INCALZIRE IN SCAUNE\n🔵NAVIGATIE\n🔵COMENZI PE VOLAN\n🔵PILOT AUTOMAT\n💸14490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2524-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2526-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2526-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2527-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2527-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2528-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2528-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2530-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2530-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2533-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2533-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2531-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2531-1.jpg"
        ]
    },
    {
        "title": "Mercedes C 2015",
        "brand": {
            "id": 92,
            "name": "Mercedes"
        },
        "model": {
            "id": 1210,
            "name": "C"
        },
        "engine": {
            "capacity": "2.2 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 170,
        "price": 12490,
        "mileage": 209000,
        "production_year": 2015,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 209.000\n🔵CUTIE AUTOMATA\n🔵DUBLU CLIMATRONIC\n🔵PILOT AUTOMAT\n🔵INCALZIRE IN SCAUNE\n🔵PADELE\n🔵SENZORI DE LUMINA / PLOAIE\n🔵HAION ELECTRIC\n🔵LANE ASSIST\n🔵COMPUTER BORD\n🔵MODURI DE CONDUS\n🔵OGLINZI ELECTRICE\n💸12490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2512-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2514-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2514-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2515-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2515-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2516-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2516-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2517-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2517-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2520-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2520-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2519-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2519-1.jpg"
        ]
    },
    {
        "title": "Volkswagen Tiguan 2016",
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
        "price": 13490,
        "mileage": 223000,
        "production_year": 2016,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 223.000\n🔵CUTIE MANUALA\n🔵FRONT ASSIST\n🔵LANE ASSIST\n🔵INCALZIRE IN SCAUNE\n🔵PILOT AUTOMAT\n🔵DUBLU CLIMATRONIC\n🔵SENZORI DE PARCARE\n🔵AUTO HOLD\n🔵SISTEM START STOP\n🔵COMPUTER BORD\n💸13490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2416-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2420-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2420-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2423-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2423-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2424-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2424-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2425-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2425-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2427-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2427-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2426-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2426-1.jpg"
        ]
    },
    {
        "title": "Volkswagen Sharan 2013",
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
        "price": 10490,
        "mileage": 231000,
        "production_year": 2013,
        "vin": "",
        "body_type": "Minivan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 231.000\n🔵CUTIE MANUALA\n🔵PILOT AUTOMAT\n🔵DUBLU CLIMATRONIC\n🔵SENZORI DE PARCARE\n🔵SENZORI DE LUMINA / PLOAIE\n🔵INCALZIRE IN SCAUNE\n🔵7 LOCURI\n🔵GEAMURI ELECTRICE\n🔵COMPUTER BORD\n🔵AUTO HOLD\n💸10490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2474-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2475-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2475-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2478-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2478-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2479-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2479-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2480-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2480-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2482-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2482-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2483-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2483-1.jpg"
        ]
    },
    {
        "title": "BMW Seria 5 2015",
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
        "horsepower": 184,
        "price": 13990,
        "mileage": 201000,
        "production_year": 2015,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 201.000\n🔵CUTIE AUTOMATA\n🔵PILOT AUTOMAT\n🔵SENZORI DE LUMINA / PLOAIE\n🔵INCALZIRE IN SCAUNE\n🔵MODURI DE CONDUS\n🔵AUTO HOLD\n🔵KEYLESS GO\n🔵SISTEM START / STOP\n🔵COMPUTER BORD\n💸13990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2497-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2501-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2501-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2502-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2502-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2503-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2503-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2504-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2504-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2507-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2507-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2505-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2505-1.jpg"
        ]
    },
    {
        "title": "Audi Q5 2013",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 114,
            "name": "Q5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 177,
        "price": 14490,
        "mileage": 242000,
        "production_year": 2013,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 242.000\n🔵CUTIE AUTOMATA\n🔵DUBLU CLIMATRONIC\n🔵KEYLESS GO\n🔵INCALZIRE IN SCAUNE\n🔵NAVIGATIE\n🔵COMENZI PE VOLAN\n🔵PILOT AUTOMAT\n🔵SENZORI DE PARCARE\n💸14490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2470-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2473-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2473-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2462-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2462-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2463-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2463-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2464-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2464-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2466-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2466-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2465-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2465-1.jpg"
        ]
    },
    {
        "title": "Audi A4 2016",
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
        "price": 12990,
        "mileage": 241000,
        "production_year": 2016,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 241.000\n🔵CUTIE AUTOMATA\n🔵PILOT AUTOMAT\n🔵CLIMATRONIC PE 3 ZONE\n🔵MODURI DE CONDUS\n🔵KEYLESS GO\n🔵SENZORI DE LUMINA / PLOAIE\n🔵OGLINZI ELECTRICE\n🔵COMPUTER BORD\n🔵NAVIGATIE\n💸12990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2495-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2496-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2496-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2486-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2486-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2489-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2489-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2490-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2490-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2491-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2491-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2493-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2493-1.jpg"
        ]
    },
    {
        "title": "Audi A4 2017",
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
        "horsepower": 150,
        "price": 12990,
        "mileage": 204000,
        "production_year": 2017,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 204.000\n🔵CUTIE AUTOMATA\n🔵SENZORI DE PARCARE\n🔵PILOT AUTOMAT\n🔵INCALZIRE IN SCAUNE\n🔵SENZORI DE LUMINA / PLOAIE\n🔵COMENZI PE VOLAN\n🔵HAION ELECTRIC\n🔵KEYLESS GO\n🔵PADELE\n🔵COMPUTER BORD\n💸12990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2452-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2453-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2453-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2454-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2454-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2455-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2455-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2456-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2456-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2458-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2458-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2457-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2457-1.jpg"
        ]
    },
    {
        "title": "Audi A4 2015",
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
        "price": 10990,
        "mileage": 226300,
        "production_year": 2015,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 226300\n🔵CUTIE AUTOMATA\n🔵CLIMATRONIC\n🔵INCALZIRE IN SCAUNE\n🔵NAVIGATIE\n🔵COMENZI PE VOLAN\n🔵PILOT AUTOMAT\n🔵COMPUTER BORD\n🔵SENZORI DE LUMINA / PLOAIE\n🔵GEAMURI ELECTRICE\n💸10990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2432-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2431-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2431-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2435-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2435-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2436-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2436-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2437-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2437-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2439-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2439-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2438-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2438-1.jpg"
        ]
    },
    {
        "title": "Audi A4 2013",
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
        "horsepower": 150,
        "price": 10490,
        "mileage": 257000,
        "production_year": 2013,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 257.000\n🔵CUTIE AUTOMATA\n🔵CLIMATRONIC PE 3 ZONE\n🔵INCALZIRE IN SCAUNE\n🔵NAVIGATIE\n🔵PILOT AUTOMAT\n🔵SENZORI DE PARCARE\n🔵COMPUTER BORD\n💸10490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2443-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2442-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2442-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2444-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2444-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2445-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2445-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2446-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2446-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2448-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2448-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2447-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/08/DSC_2447-1.jpg"
        ]
    },
    {
        "title": "Audi Q5 2018",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 114,
            "name": "Q5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 163,
        "price": 24990,
        "mileage": 149000,
        "production_year": 2018,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔴KM 149.000\n🔵CUTIE AUTOMATA\n🔵MODURI DE CONDUS\n🔵NAVIGATIE\n🔵CAMERA FATA / SPATE\n🔵BORD DIGITAL\n🔵PADELE\n🔵SENZORI DE LUMINA / PLOAIE\n🔵PARK ASSIT\n🔵PANORAMIC\n🔵KEYLESS GO\n🔵VOLAN INCALZIT\n💸24990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2243-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2244-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2244-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2246-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2246-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2247-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2247-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2248-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2248-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2250-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2250-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2249-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2249-1.jpg"
        ]
    },
    {
        "title": "Mercedes CLA 2019",
        "brand": {
            "id": 92,
            "name": "Mercedes"
        },
        "model": {
            "id": 1216,
            "name": "CLA"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Benzină"
        },
        "price": 18990,
        "mileage": 181575,
        "production_year": 2019,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔴KM 181.575\n🔵DISTRONIC\n🔵LANE ASSIST\n🔵COMENZI PE VOLAN\n🔵INCALZIRE IN SCAUNE\n🔵SENZORI DE PARCARE\n🔵FARURI BI-XENON\n🔵OGLINZI ELECTRICE\n🔵PARK ASSIST\n🔵NAVIGATIE\n💸18990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2342-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2343-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2343-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2345-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2345-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2346-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2346-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2347-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2347-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2349-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2349-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2348-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2348-1.jpg"
        ]
    },
    {
        "title": "Skoda Kodiaq 2019",
        "brand": {
            "id": 125,
            "name": "Skoda"
        },
        "model": {
            "id": 1724,
            "name": "Kodiaq"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 190,
        "price": 17990,
        "mileage": 207000,
        "production_year": 2019,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 207.000\n🔵CUTIE AUTOMATA\n🔵MODURI DE CONDUS\n🔵NAVIGATIE\n🔵SENZORI DE PARCARE\n🔵KEYLESS GO\n🔵LANE ASSIST\n🔵PADELE\n🔵FONT ASSIST\n🔵DUBLU CLIMATRONIC\n🔵PILOT AUTOMAT\n🔵SENZORI DE LUMINA / PLOAIE\n💸17990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2280-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2282-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2282-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2283-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2283-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2284-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2284-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2285-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2285-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2288-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2288-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2286-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2286-1.jpg"
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
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 140,
        "price": 4990,
        "mileage": 265280,
        "production_year": 2009,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 4",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 265.280\n🔵CUTIE MANUALA\n🔵GEAMURI ELECTRICE\n🔵SENZORI DE PARCARE\n🔵COMPUTER BORD\n🔵NAVIGATIE\n🔵COMENZI PE VOLAN\n💸4990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2292-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2293-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2293-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2295-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2295-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2297-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2297-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2298-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2298-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2300-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2300-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2299-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2299-1.jpg"
        ]
    },
    {
        "title": "Mercedes GLC 2017",
        "brand": {
            "id": 92,
            "name": "Mercedes"
        },
        "model": {
            "id": 1244,
            "name": "GLC"
        },
        "engine": {
            "capacity": "2.2 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 204,
        "price": 19490,
        "mileage": 227000,
        "production_year": 2017,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 227.000\n🔵CUTIE AUTOMATA\n🔵DUBLU CLIMATRONIC\n🔵INCALZIRE IN SCAUNE\n🔵NAVIGATIE\n🔵PADELE\n🔵COMENZI PE VOLAN\n🔵KEYLESS GO\n🔵SENZORI DE PARCARE\n🔵CAMERA SPATE\n🔵MODURI DE CONDUS\n🔵COMPUTER BORD\n💸19490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2078-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2080-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2080-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2070-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2070-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2072-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2072-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2073-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2073-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2075-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2075-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2074-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2074-1.jpg"
        ]
    },
    {
        "title": "Volkswagen Passat 2009",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1952,
            "name": "Passat"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 140,
        "price": 3990,
        "mileage": 410160,
        "production_year": 2009,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 4",
        "phone_number": "0736130852",
        "description": "🔴KM 410.160\n🔵CUTIE MANUALA\n🔵GEAMURI ELECTRICE\n🔵PILOT AUTOMAT\n🔵SENZORI DE PARCARE\n🔵DUBLU CLIMATRONIC\n🔵INCALZIRE IN SCAUNE\n🔵SENZORI DE LUMINA / PLOAIE\n🔵COMENZI PE VOLAN\n🔵COMPUTER BORD\n🔵PANORAMIC\n💸3990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2372-2.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2369-2-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2369-2.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2373-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2373-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2374-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2374-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2375-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2375-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2377-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2377-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2376-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2376-1.jpg"
        ]
    },
    {
        "title": "Audi Q5 2021",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 114,
            "name": "Q5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 163,
        "price": 23990,
        "mileage": 200000,
        "production_year": 2021,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 200.000\n🔵CUTIE AUTOMATA\n🔵MODURI DE CONDUS\n🔵PILOT AUTOMAT ADAPTIV\n🔵DISTRONIC\n🔵FRONT ASSIST\n🔵SENZORI DE LUMINA SI PLOAIE\n🔵HAION ELECTRIC\n🔵OGLINZI ELECTRICE\n🔵CLIMATRONIC PE 3 ZONE\n🔵KEYLESS GO\n🔵NAVIGATIE\n💸23990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2352-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2357-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2357-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2358-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2358-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2359-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2359-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2361-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2361-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2364-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2364-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2363-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2363-1.jpg"
        ]
    },
    {
        "title": "Volkswagen Tiguan 2016",
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
        "price": 10990,
        "mileage": 181575,
        "production_year": 2016,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 181.575\n🔵CUTIE MANUALA\n🔵CAMERA SPATE\n🔵DUBLU CLIMATRONIC\n🔵SENZORI DE LUMINA SI PLOAIE\n🔵SENZORI DE PARCARE\n🔵START STOP\n🔵KEYLESS GO\n🔵PARK ASSIST\n🔵AUTO HOLD\n🔵NAVIGATIE\n🔵COMPUTER BORD\n💸10990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2333-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2334-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2334-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2335-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2335-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2336-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2336-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2337-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2337-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2339-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2339-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2338-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2338-1.jpg"
        ]
    },
    {
        "title": "Volkswagen Sharan 2013",
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
        "horsepower": 140,
        "price": 10490,
        "mileage": 237000,
        "production_year": 2013,
        "vin": "",
        "body_type": "Minivan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 237.000\n🔵CUTIE AUTOMATA\n🔵DUBLU CLIMATRONIC\n🔵AUTO HOLD\n🔵SISTEM START / STOP\n🔵SENZORI DE PARCARE\n🔵SENZORI DE LUMINA / PLOAIE\n🔵PILOT AUTOMAT\n🔵COMPUTER BORD\n🔵INCALZIRE IN SCAUNE\n🔵GEAMURI ELECTRICE\n🔵NAVIGATIE\n🔵COMENZI PE VOLAN",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2232-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2233-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2233-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2235-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2235-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2236-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2236-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2237-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2237-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2239-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2239-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2240-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2240-1.jpg"
        ]
    },
    {
        "title": "BMW Seria 5 2017",
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
        "horsepower": 190,
        "price": 16490,
        "mileage": 259000,
        "production_year": 2017,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 259.000\n🔵CUTIE AUTOMATA\n🔵MODURI DE CONDUS\n🔵BORD DIGITAL\n🔵DUBLU CLIMATRONIC\n🔵INCALZIRE IN SCAUNE\n🔵SENZORI DE PARCARE\n🔵NAVIGATIE\n🔵START / STOP\n🔵KEYLESS GO\n🔵PILOT AUTOMAT\n🔵SENZORI DE LUMINA SI PLOAIE\n🔵COMPUTER BORD",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2194-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2198-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2198-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2199-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2199-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2200-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2200-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2201-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2201-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2203-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2203-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2202-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2202-1.jpg"
        ]
    },
    {
        "title": "Volkswagen Tiguan 2010",
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
        "horsepower": 170,
        "price": 7990,
        "mileage": 257000,
        "production_year": 2010,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 257.000\n🔵CUTIE MANUALA\n🔵PACHET R-LINE\n🔵DUBLU CLIMATRONIC\n🔵SENZORI DE PARCARE\n🔵SENZORI DE LUMINA / PLOAIE\n🔵AUTO HOLD\n🔵GEAMURI ELECTRICE\n🔵NAVIGATIE\n🔵COMENZI PE VOLAN",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2183-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2184-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2184-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2185-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2185-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2186-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2186-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2187-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2187-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2189-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2189-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2188-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2188-1.jpg"
        ]
    },
    {
        "title": "BMW Seria 4 2015",
        "brand": {
            "id": 18,
            "name": "BMW"
        },
        "model": {
            "id": 191,
            "name": "Seria 4"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 190,
        "price": 13490,
        "mileage": 247000,
        "production_year": 2015,
        "vin": "",
        "body_type": "Coupe",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 247.000\n🔵CUTIE AUTOMATA\n🔵DUBLU CLIMATRONIC\n🔵INCALZIRE IN SCAUNE\n🔵MODURI DE CONDUS\n🔵SENZORI DE PARCARE\n🔵PADELE\n🔵NAVIGATIE\n🔵COMENZI PE VOLAN\n🔵SENZORI DE LUMINA / PLOAIE\n🔵PILOT AUTOMAT\n🔵COMPUTER BORD\n💸13490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2010-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2009-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2009-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2018-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2018-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2011-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2011-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2012-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2012-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2014-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2014-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2013-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2013-1.jpg"
        ]
    },
    {
        "title": "Audi Q5 2015",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 114,
            "name": "Q5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 190,
        "price": 14490,
        "mileage": 171900,
        "production_year": 2015,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 171900\n🔵CUTIE AUTOMATA\n🔵KEYLESS GO\n🔵DUBLU CLIMATRONIC\n🔵PANORAMIC\n🔵INCALZIRE IN SCAUNE\n🔵NAVIGATIE\n🔵CAMERA SPATE\n🔵COMENZI PE VOLAN\n🔵PILOT AUTOMAT\n🔵SENZORI DE LUMINA / PLOAIE\n🔵SENZORI DE PARCARE\n🔵SCAUNE ELECTRICE CU MEMORIE\n🔵COMPUTER BORD\n💸14490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2098-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2100-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2100-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2089-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2089-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2090-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2090-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2091-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2091-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2094-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2094-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2092-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2092-1.jpg"
        ]
    },
    {
        "title": "Porsche Cayenne 2015",
        "brand": {
            "id": 111,
            "name": "Porsche"
        },
        "model": {
            "id": 1573,
            "name": "Cayenne"
        },
        "engine": {
            "capacity": "3.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 262,
        "price": 26490,
        "mileage": 244000,
        "production_year": 2015,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2110-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2112-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2112-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2115-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2115-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2119-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2119-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2123-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2123-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2128-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2128-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2137-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_2137-1.jpg"
        ]
    },
    {
        "title": "Audi Q5 2019",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 114,
            "name": "Q5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 190,
        "price": 22990,
        "mileage": 128600,
        "production_year": 2019,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "KM 128600\nCUTIE AUTOMATA\nKEYLESS GO\nMODURI DE CONDUS\nINCALZIRE IN SCAUNE\nSENZORI DE PARCARE\nNAVIGATIE\nPILOT AUTOMAT\nPADELE\nSENZORI DE LUMINA / PLOAIE\nCOMPUTER BORD\n22990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1829-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1831-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1831-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1832-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1832-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1834-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1834-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1836-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1836-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1838-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1838-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1837-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1837-1.jpg"
        ]
    },
    {
        "title": "Mercedes C 2019",
        "brand": {
            "id": 92,
            "name": "Mercedes"
        },
        "model": {
            "id": 1210,
            "name": "C"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 190,
        "price": 14490,
        "mileage": 219000,
        "production_year": 2019,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile\nKM 219.000\nCUTIE AUTOMATA\nSTART/ STOP\nKEYLESS GO\nDUBLU CLIMATRONIC\nCAMERA SPATE\nSENZORI DE LUMINA / PLOAIE\nSENZORI DE PARCARE\nPADELE\nCOMPUTER BORD\nNAVIGATIE\nAUTO HOLD\n14490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1853-2.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1854-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1854-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1857-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1857-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1858-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1858-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1859-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1859-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1861-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1861-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1860-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1860-1.jpg"
        ]
    },
    {
        "title": "Volkswagen Passat 2018",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1952,
            "name": "Passat"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 150,
        "price": 10990,
        "mileage": 265000,
        "production_year": 2018,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei, Distributie si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile\nKM 265.000\nCUTIE AUTOMATA\nBORD DIGITAL\nPILOT AUTOMAT\nLANE ASSIST\nFRONT ASSIST\nINCALZIRE IN SCAUNE\nDUBLU CLIMATRONIC\nAUTO HOLD\nMASAJ IN SCAUNE\nSENZORI DE LUMINA / PLOAIE\n10990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1641-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1642-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1642-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1632-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1632-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1633-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1633-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1635-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1635-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1638-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1638-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1637-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/07/DSC_1637-1.jpg"
        ]
    },
    {
        "title": "Audi Q5 2015",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 114,
            "name": "Q5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 150,
        "price": 13490,
        "mileage": 232000,
        "production_year": 2015,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei, Distributie si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile\nKM 232.000\nCUTIE MANUALA\nSENZORI DE LUMINA / PLOAIE\nPILOT AUTOMAT\nDUBLU CLIMATRONIC\nSENZORI DE PARCARE\nCOMPUTER BORD\nCOMENZI PE VOLAN\nCARLIG\nFARURI BI-XENON\n13490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1349-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1350-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1350-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1339-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1339-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1340-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1340-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1341-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1341-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1343-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1343-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1342-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1342-1.jpg"
        ]
    },
    {
        "title": "BMW X5 2015",
        "brand": {
            "id": 18,
            "name": "BMW"
        },
        "model": {
            "id": 202,
            "name": "X5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 218,
        "price": 18990,
        "mileage": 201000,
        "production_year": 2015,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile\nKM 201.000\nCUTIE AUTOMATA\nMODURI DE CONDUS\nSENZORI DE PARCARE\nCAMERE SPATE\nINCALZIRE IN SCAUNE\nPILOT AUTOMAT\nAUTO HOLD\nSENZORI DE LUMINA / PLOAIE\nDUBLU CLIMATRONIC\nKEYLESS GO\n18990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1297-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1300-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1300-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1290-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1290-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1291-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1291-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1292-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1292-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1294-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1294-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1293-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1293-1.jpg"
        ]
    },
    {
        "title": "Mercedes C 2015",
        "brand": {
            "id": 92,
            "name": "Mercedes"
        },
        "model": {
            "id": 1210,
            "name": "C"
        },
        "engine": {
            "capacity": "2.2 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 170,
        "price": 11990,
        "mileage": 270000,
        "production_year": 2015,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile\nKM 270.000\nCUTIE AUTOMATA\nMODURI DE CONDUS\nDUBLU CLIMATRONIC\nNAVIGATIE MARE\nINCALZIRE IN SCAUNE\nPADELE\nLANE ASSIST\nSIDE ASSIST\nSENZORI DE PARCARE\nSENZORI DE LUMINA / PLOAIE\n11990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1546-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1548-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1548-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1534-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1534-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1536-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1536-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1538-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1538-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1543-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1543-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1539-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1539-1.jpg"
        ]
    },
    {
        "title": "BMW X1 2015",
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
        "horsepower": 143,
        "price": 8490,
        "mileage": 226000,
        "production_year": 2015,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "KM 226.000\nCUTIE MANUALA\nINCALZIRE IN SCAUNE\nPILOT AUTOMAT\nMOD ECO PRO\nSISTEM START / STOP\nDUBLU CLIMATRONIC\nCOMPUTER BORD\nSENZORI DE LUMIN / PLOAIE\nCOMENZI PE VOLAN\nOGLINZI ELECTRICE\n8490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1460-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1461-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1461-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1450-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1450-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1451-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1451-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1452-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1452-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1454-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1454-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1453-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1453-1.jpg"
        ]
    },
    {
        "title": "BMW Seria 5 2017",
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
        "horsepower": 190,
        "price": 19990,
        "mileage": 263000,
        "production_year": 2017,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "BMW 520d 2017 LUXURY LINE MOTOR 2.0 DIESEL 190 CP\nGaranție 12 luni. Ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile\nKM 263.000\nCUTIE AUTOMATA\nMODURI DE CONDUS\nPILOT AUTOMAT\nSCAUNE ELECTRICE CU MEMORIE\nDUBLU CLIMATRONIC\nINCALZIRE IN SCAUNE\nTRAPA\nAUTO HOLD\nVOLAN INCALZIT\nSENZORI DE LUMINA / PLOAIE\nNAVIGATIE\n19990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1512-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1513-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1513-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1499-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1499-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1501-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1501-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1507-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1507-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1508-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1508-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1504-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1504-1.jpg"
        ]
    },
    {
        "title": "Volkswagen Tiguan 2022",
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
        "price": 21490,
        "mileage": 197000,
        "production_year": 2022,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile\n🔴KM 197.000\n🔵CUTIE AUTOMATA\n🔵BORD DIGITAL\n🔵PILOT AUTOMAT ADAPTIV\n🔵FRONT ASSIST\n🔵LANE ASSIST\n🔵INCALZIRE IN SCAUNE\n🔵VOLAN INCALZIT\n🔵FARURI LED ADAPTIVE\n🔵CARLIG\n🔵COMPUTER BORD\n💸21490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1227-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1228-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1228-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1216-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1216-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1217-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1217-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1218-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1218-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1220-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1220-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1219-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1219-1.jpg"
        ]
    },
    {
        "title": "Audi Q5 2015",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 114,
            "name": "Q5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 163,
        "price": 14990,
        "mileage": 235000,
        "production_year": 2015,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "AUDI Q5 2015 MOTOR 2.0 DIESEL 163 CP\n🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile !\n🔴KM 235.000\n🔵CUTIE AUTOMATA\n🔵KEYLESS GO\n🔵CLIMATRONIC\n🔵INCALZIRE IN SCAUNE\n🔵NAVIGATIE\n🔵COMENZI PE VOLAN\n🔵SENZORI PARCARE\n🔵PILOT AUTOMAT\n🔵COMPUTER BORD\n🔵HAION ELECTRIC\n🔵SCAUNE ELECTRICE\n💸14990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1202-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1203-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1203-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1193-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1193-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1194-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1194-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1195-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1195-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1197-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1197-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1196-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1196-1.jpg"
        ]
    },
    {
        "title": "Audi Q5 2013",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 114,
            "name": "Q5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 177,
        "price": 11990,
        "mileage": 258000,
        "production_year": 2013,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "AUDI Q5 2013 MOTOR 2.0 DIESEL 177 CP\n🔖Garanție 12 luni. Ulei, Distributie si filtre CADOU🎁\n🔖 Cumpara In siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile !\n🔴KM 258.000\n🔵CUTIE MANUALA\n🔵PILOT AUTOMAT\n🔵INCALZIRE IN SCAUNE\n🔵DUBLU CLIMATRONIC\n🔵OGLINZI ELECTRICE\n🔵COMPUTER BORD\n🔵SENZORI DE LUMINA / PLOAIE\n🔵START / STOP\n🔵FARURI BI-XENON\n🔵ASISTENTA COBORARE IN PANTA\n💸11990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1156-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1157-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1157-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1159-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1159-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1158-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1158-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1162-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1162-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1164-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1164-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1163-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1163-1.jpg"
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
        "price": 3990,
        "mileage": 294000,
        "production_year": 2010,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "KM 294.000\nCUTIE MANUALA\nSENZORI DE PARCARE\nDUBLU CLIMATRONIC\nOGLINZI ELECTRICE\nGEAMURI ELECTRICE\nCOMPUTER BORD\n3990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1141-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1142-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1142-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1131-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1131-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1132-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1132-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1133-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1133-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1136-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1136-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1134-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1134-1.jpg"
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
        "price": 4990,
        "mileage": 228000,
        "production_year": 2010,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei, Distributie si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 228.000\nCUTIE MANUALA\nDUBLU CLIMATRONIC\nPILOT AUTOMAT\nSENZORI DE LUMINA / PLOAIE\nOGLINZI ELECTRICE\nNAVIGATIE\nCOMPUTER BORD\nGEAMURI ELECTRICE\n4990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1105-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1106-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1106-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1097-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1097-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1098-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1098-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1100-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1100-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1102-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1102-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1101-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1101-1.jpg"
        ]
    },
    {
        "title": "Volkswagen Tiguan 2009",
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
        "horsepower": 140,
        "price": 5490,
        "mileage": 301600,
        "production_year": 2009,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 4",
        "phone_number": "0736130852",
        "description": "KM 301600\nCUTIE MANUALA\nNAVIGATIE\nDUBLU CLIMATRONIC\nINCALZIRE IN SCAUNE\nPANORAMIC\nSCAUNE ELECTRICE\nCOMENZI PE VOLAN\nCOMPUTER BORD\nSENZORI DE LUMINA / PLOAIE\n5490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1129-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1130-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1130-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1119-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1119-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1120-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1120-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1122-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1122-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1125-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1125-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1123-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1123-1.jpg"
        ]
    },
    {
        "title": "Opel Astra 2021",
        "brand": {
            "id": 105,
            "name": "Opel"
        },
        "model": {
            "id": 1447,
            "name": "Astra"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 105,
        "price": 7990,
        "mileage": 147000,
        "production_year": 2021,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei, Distributie si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 147.000\nCUTIE MANUALA\nPILOT AUTOMAT\nINCALZIRE IN SCAUNE\nINCALZIRE IN VOLAN\nSENZORI DE PARCARE\nCAMERA SPATE\nSENZORI DE LUMINA / PLOAIE\nDUBLU CLIMATRONIC\nCOMPUTER BORD\nSTART / STOP\n7990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1069-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1070-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1070-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1059-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1059-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1060-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1060-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1061-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1061-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1066-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1066-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1065-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_1065-1.jpg"
        ]
    },
    {
        "title": "Audi A4 2013",
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
        "price": 9990,
        "mileage": 233000,
        "production_year": 2013,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei, distributie si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 233.000\nCUTIE MANUALA\nPILOT AUTOMAT\nSENZORI DE PARCARE\nINCALZIRE IN SCAUNE\nCOMENZI PE VOLAN\nNAVIGATIE\nPACHET S-LINE\nFARURI BI-XENON\nCOMPUTER BORD\n9990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0914-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0915-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0915-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0905-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0905-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0906-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0906-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0908-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0908-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0910-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0910-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0909-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0909-1.jpg"
        ]
    },
    {
        "title": "Audi A5 2013",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 102,
            "name": "A5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 177,
        "price": 10990,
        "mileage": 283900,
        "production_year": 2013,
        "vin": "",
        "body_type": "Coupe",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 283900\nCUTIE MANUALA\nDUBLU CLIMATRONIC\nKEYLESS GO\nNAVIGATIE\nINCALZIRE IN SCAUNE\nCOMENZI PE VOLAN\nPILOT AUTOMAT\nSENZORI DE LUMINA / PLOAIE\nSTART / STOP\nCARLIG\nCOMPUTER BORD\n10990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0548-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0550-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0550-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0537-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0537-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0538-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0538-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0539-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0539-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0543-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0543-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0540-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0540-1.jpg"
        ]
    },
    {
        "title": "BMW Seria 3 2021",
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
            "fuel_type": "Benzină"
        },
        "horsepower": 255,
        "price": 22990,
        "mileage": 38000,
        "production_year": 2021,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "KM 38.000\nCUTIE AUTOMATA\nMODURI DE CONDUS\nSCAUNE ELECTRICE CU MEMORIE\nFRONT ASSIST\nINCALZIRE IN SCAUNE\nSIDE ASSIST\nBORD DIGITAL\nNAVIGATIE\nKEYLESS ENTRY / GO\nLANE ASSIST\nLUMINI AMBIENTALE\nCAMERE 360\n22990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0711-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0712-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0712-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0703-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0703-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0704-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0704-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0705-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0705-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0707-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0707-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0706-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0706-1.jpg"
        ]
    },
    {
        "title": "Audi Q5 2012",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 114,
            "name": "Q5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 177,
        "price": 13490,
        "mileage": 161000,
        "production_year": 2012,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 161.000\nCUTIE AUTOMATA\nKEYLESS GO\nINCALZIRE IN SCAUNE\nASISTENTA LA COBORAREA IN PANTA\nSENZORI DE LUMINA / PLOAIE\nSENZORI DE PARCARE\nNAVIGATIE\nCOMPUTER BORD\nCOMENZI PE VOLAN\nFARURI BI-XENON\n13490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0754-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0756-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0756-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0747-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0747-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0748-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0748-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0749-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0749-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0751-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0751-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0750-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0750-1.jpg"
        ]
    },
    {
        "title": "Mercedes C 2015",
        "brand": {
            "id": 92,
            "name": "Mercedes"
        },
        "model": {
            "id": 1210,
            "name": "C"
        },
        "engine": {
            "capacity": "2.2 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 204,
        "price": 14990,
        "mileage": 239000,
        "production_year": 2015,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 239.000\nCUTIE AUTOMATA\nMODURI DE CONDUS\nINCALZIRE IN SCAUNE\nDUBLU CLIMATRONIC\nPILOT AUTOMAT\nNAVIGATIE\nTRAPA\nPADELE\nSENZORI DE LUMINA / PLOAIE\nFARURI ADAPTIVE\nSENZORI DE PARCARE\n14990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0774-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0775-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0775-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0767-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0767-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0768-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0768-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0769-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0769-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0771-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0771-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0770-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0770-1.jpg"
        ]
    },
    {
        "title": "Audi A4 2018",
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
        "horsepower": 150,
        "price": 12990,
        "mileage": 225800,
        "production_year": 2018,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei, distributie si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 225800\nCUTIE AUTOMATA\nKEYLESS GO\nCLIMATRONIC PE 3 ZONE\nNAVIGATIE\nCOMPUTER BORD\nSENZORI DE PARCARE\nPADELE\nPILOT AUTOMAT\nSTART / STOP\nGEAMURI ELECTRICE\nCOMENZI PE VOLAN\n12990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0881-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0882-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0882-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0873-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0873-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0874-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0874-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0875-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0875-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0878-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0878-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0877-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/06/DSC_0877-1.jpg"
        ]
    },
    {
        "title": "Audi A4 2017",
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
        "horsepower": 150,
        "price": 13490,
        "mileage": 187000,
        "production_year": 2017,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Distributie, ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 187.000\nCUTIE AUTOMATA\nCLIMATRONIC PE 3 ZONE\nINCALZIRE IN SCAUNE\nBORD DIGITAL\nSENZORI DE PARCARE\nCOMENZI PE VOLAN\nPILOT AUTOMAT\nKEYLESS GO\nSENZORI LUMINA / PLOAIE\n13490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0603-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0604-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0604-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0594-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0594-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0595-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0595-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0596-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0596-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0599-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0599-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0597-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0597-1.jpg"
        ]
    },
    {
        "title": "Volkswagen Touareg 2024",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1967,
            "name": "Touareg"
        },
        "engine": {
            "capacity": "3.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 286,
        "price": 59990,
        "mileage": 36200,
        "production_year": 2024,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Distributie, ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 36200\nCUTIE AUTOMATA\nKEYLESS GO\nCAMERE 360\nHEAD-UP DISPALY\nBORD DIGITAL\nVENTILATIE IN SCAUNE\nINCALZIRE IN SCAUNE\nLANE ASSIST\nFRONT ASSIST\nSCAUNE ELECTRICE CU MEMORIE\nVOLAN INCALZIT\nPILOT AUTOMAT\nMODURI DE CONDUS\nCOMENZI PE VOLAN\n59990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0521-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0522-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0522-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0510-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0510-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0511-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0511-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0512-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0512-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0517-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0517-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0513-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0513-1.jpg"
        ]
    },
    {
        "title": "Audi Q5 2020",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 114,
            "name": "Q5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 163,
        "price": 19490,
        "mileage": 251000,
        "production_year": 2020,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0422-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0424-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0424-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0410-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0410-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0411-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0411-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0412-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0412-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0416-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0416-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0414-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0414-1.jpg"
        ]
    },
    {
        "title": "Audi A4 2016",
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
        "horsepower": 150,
        "price": 12990,
        "mileage": 254000,
        "production_year": 2016,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Distributie, ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 254.000\nCUTIE AUTOMATA\nSENZORI DE PARCARE\nINCALZIRE IN SCAUNE\nKEYLESS GO\nHAION ELECTRIC\nOGLINZI ELECTRICE\nSENZORI DE LUMINA / PLOAIE\nPILOT AUTOMAT\nCOMPUTER BORD\nCOMENZI PE VOLAN\n12990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0372-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0373-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0373-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0363-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0363-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0364-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0364-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0365-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0365-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0368-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0368-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0366-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0366-1.jpg"
        ]
    },
    {
        "title": "Audi A4 2016",
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
        "horsepower": 150,
        "price": 12990,
        "mileage": 170000,
        "production_year": 2016,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Distributie, ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 170.000\nCUTIE AUTOMATA\nINCALZIRE IN SCAUNE\nKEYLESS GO\nNAVIGATIE\nCLIMATRONIC\nPILOT AUTOMAT\nSENZORI LUMINA/ PLOAIE\nSENZORI PARCARE\nPADELE\nLUMINI DE ZI LED\n12990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0214-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0215-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0215-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0204-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0204-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0205-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0205-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0206-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0206-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0210-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0210-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0207-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0207-1.jpg"
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
        "price": 5490,
        "mileage": 177000,
        "production_year": 2010,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Distributie, ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 177.000\nCUTIE MANUALA\nNAVIGATIE\nSENZORI DE PARCARE\nINCALZIRE IN SCAUNE\nDUBLU CLIMATRONIC\nOGLINZI ELECTRICE\nTRAPA\nCOMPUTER BORD\n5490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0248-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0249-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0249-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0239-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0239-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0240-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0240-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0243-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0243-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0245-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0245-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0244-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0244-1.jpg"
        ]
    },
    {
        "title": "Audi A4 2017",
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
        "horsepower": 150,
        "price": 13490,
        "mileage": 187000,
        "production_year": 2017,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Distributie, ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 187000\nCUTIE AUTOMATA\nCLIMATRONIC PE 3 ZONE\nINCALZIRE IN SCAUNE\nSENZORI PARCARE\nBORD DIGITAL\nCOMENZI PE VOLAN\nPILOT AUTOMAT\nKEYLESS GO\nSENZORI DE PARCARE\nSENZORI LUMINA / PLOAIE\n13490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0300-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0302-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0302-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0292-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0292-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0293-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0293-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0294-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0294-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0297-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0297-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0295-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0295-1.jpg"
        ]
    },
    {
        "title": "BMW Seria 5 2012",
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
        "horsepower": 184,
        "price": 9990,
        "mileage": 242000,
        "production_year": 2012,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 242.000\nCUTIE AUTOMATA\nMODURI DE CONDUS\nDUBLU CLIMATRONIC\nINCALZIRE IN SCAUNE\nNAVIGATIE MARE\nCOMENZI PE VOLAN\nSENZORI DE LUMINA / PLOAIE\nKEYLESS GO\nAUTO HOLD\n9990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0175-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0177-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0177-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0168-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0168-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0169-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0169-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0170-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0170-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0173-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0173-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0172-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0172-1.jpg"
        ]
    },
    {
        "title": "Mercedes GLC 2021",
        "brand": {
            "id": 92,
            "name": "Mercedes"
        },
        "model": {
            "id": 1244,
            "name": "GLC"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "price": 22990,
        "mileage": 254000,
        "production_year": 2021,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 254.000\nCUTIE AUTOMATA\nDISTRONIC\nPILOT AUTOMAT\nFRONT ASSIST\nSIDE ASSIST\nINCALZIRE AUXILIARA\nCAMERA SPATE\nINCALZIRE IN SCAUNE\nDUBLU CLIMATRONIC\nCOMENZI PE VOLAN\nNAVIGATIE\n22990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0062-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0064-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0064-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0047-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0047-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0049-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0049-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0050-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0050-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0051-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0051-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0052-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_0052-1.jpg"
        ]
    },
    {
        "title": "Audi A6 2019",
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
        "horsepower": 204,
        "price": 19990,
        "mileage": 245000,
        "production_year": 2019,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM: 245000\nCUTIE AUTOMATA\nDISTRONIC\nMODURI DE CONDUS\nSIDE ASSIST\nFRONT ASSIST\nPILOT AUTOMAT ADAPTIV\nHAION ELECTRIC\nSENZORI DE PARCARE\nKEYLESS GO\nINCALZIRE IN SCAUNE\n19990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_9964-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_9966-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_9966-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_9953-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_9953-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_9954-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_9954-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_9955-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_9955-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_9958-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_9958-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_9957-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/05/DSC_9957-1.jpg"
        ]
    },
    {
        "title": "BMW Seria 4 2015",
        "brand": {
            "id": 18,
            "name": "BMW"
        },
        "model": {
            "id": 191,
            "name": "Seria 4"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 190,
        "price": 13490,
        "mileage": 273700,
        "production_year": 2015,
        "vin": "",
        "body_type": "Coupe",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 273700\nCUTIE AUTOMATA\nMODURI DE CONDUS\nDUBLU CLIMATRONIC\nINCALZIRE IN SCAUNE\nNAVIGATIE\nCOMENZI PE VOLAN\nSENZORI PARCARE\nSENZORI LUMINA / PLOAIE\nCOMPUTER BORD\nKEYLESS GO\n13490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9612-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9613-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9613-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9599-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9599-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9600-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9600-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9604-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9604-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9607-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9607-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9605-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9605-1.jpg"
        ]
    },
    {
        "title": "Audi A4 2011",
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
        "horsepower": 118,
        "price": 7490,
        "mileage": 240000,
        "production_year": 2011,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Distributie, ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 240000\nCUTIE MANUALA\nINCALZIRE IN SCAUNE\nSENZORI PARCARE\nCOMENZI PE VOLAN\nGEAMURI ELECTRICE\nCLIMATRONIC\nCOMPUTER BORD\nPACHET S-LINE\n7490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9586-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9585-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9585-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9578-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9578-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9579-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9579-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9580-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9580-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9582-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9582-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9581-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9581-1.jpg"
        ]
    },
    {
        "title": "Audi Q5 2009",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 114,
            "name": "Q5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 170,
        "price": 9490,
        "mileage": 235000,
        "production_year": 2009,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 4",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Distributie, ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 235000\nCUTIE MANUALA\nDUBLU CLIMATRONIC\nPILOT AUTOMAT\nSCAUNE ELECTRICE\nINCALZIRE IN SCAUNE\nCOMENZI PE VOLAN\nAUTO HOLD\nSENZORI DE PARCARE\n9490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9394-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9395-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9395-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9566-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9566-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9567-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9567-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9568-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9568-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9570-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9570-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9569-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9569-1.jpg"
        ]
    },
    {
        "title": "Audi Q5 2013",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 114,
            "name": "Q5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 177,
        "price": 14490,
        "mileage": 221600,
        "production_year": 2013,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Distributie, ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 221600\nCUTIE AUTOMATA\nKEYLESS GO\nNAVIGATIE\nCLIMATRONIC\nINCALZIRE IN SCAUNE\nCAMERA SPATE\nLANE ASSIST\nPILOT AUTOMAT\nSCAUNE ELECTRICE CU MEMORIE\nMODURI DE CONDUS\nASISTENTA COBORARE\n14490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9272-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9269-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9269-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9262-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9262-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9263-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9263-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9264-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9264-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9265-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9265-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9266-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_9266-1.jpg"
        ]
    },
    {
        "title": "Audi A4 2011",
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
        "horsepower": 143,
        "price": 6990,
        "mileage": 246000,
        "production_year": 2011,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Distributie, ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 246000\nCUTIE MANUALA\nNAVIGATIE\nGEAMURI ELECTRICE\nINCALZIRE IN SCAUNE\nPILOT AUTOMAT\nCOMENZI\nSTART / STOP\nCOMPUTER BORD\n6990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8975-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8976-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8976-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8977-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8977-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8978-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8978-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8982-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8982-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8980-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8980-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8981-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8981-1.jpg"
        ]
    },
    {
        "title": "Audi A4 2016",
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
        "horsepower": 163,
        "price": 11490,
        "mileage": 186000,
        "production_year": 2016,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Distributie, ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKm 186000\nCutie manuală\nNavigație\nClimatornic\nStart stop\nKeyless go\nComenzi pe volan\nPilot automat\nComputer bord\nSenzori lumină ploaie\nGeamuri electrice\nBluetooth\n11490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8781-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8787-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8787-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8793-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8793-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8794-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8794-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8800-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8800-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8796-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8796-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8797-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8797-1.jpg"
        ]
    },
    {
        "title": "Audi A4 2014",
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
        "horsepower": 150,
        "price": 9490,
        "mileage": 227000,
        "production_year": 2014,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Distributie, ulei si filtre CADOU\nCumpara In siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 227000\nCUTIE MANUALA\nCLIMATRONIC\nCOMENZI PE VOLAN\nINCALZIRE IN SCAUNE\nNAVIGATIE\nSENZORI DE PARCARE\nSENZORI LUMINA / PLOAIE\nCOMPUTER BORD\nGEAMURI ELECTRICE\n9490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8659-1-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8660-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8660-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8661-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8661-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8664-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8664-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8665-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8665-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8671-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8671-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8666-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8666-1.jpg"
        ]
    },
    {
        "title": "BMW X3 2012",
        "brand": {
            "id": 18,
            "name": "BMW"
        },
        "model": {
            "id": 198,
            "name": "X3"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 184,
        "price": 11490,
        "mileage": 196000,
        "production_year": 2012,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Ulei si filtre CADOU\nCumpara în siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 196000\nCUTIE AUTOMATA\nPILOT AUTOMAT\nDUBLU CLIMATRONIC\nINCALZIRE IN SCAUNE\nCOMENZI PE VOLAN\nSENZORI DE LUMINA / PLOAIE\nSENZORI DE PARCARE",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8578-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8579-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8579-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8582-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8582-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8581-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8581-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8583-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8583-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8584-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8584-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8586-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/04/DSC_8586-1.jpg"
        ]
    },
    {
        "title": "Audi A5 2016",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 102,
            "name": "A5"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 150,
        "price": 12490,
        "mileage": 257800,
        "production_year": 2016,
        "vin": "",
        "body_type": "Coupe",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Distributie, ulei si filtre CADOU\nCumpara în siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 257800\nCUTIE MANUALA\nNAVIGATIE\nCLIMATRONIC\nINCALZIRE IN SCAUNE\nPILOT AUTOMAT\nLANE ASSIST\nSIDE ASSIST\nSENZORI PARCARE\nCOMPUTER BORD",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_8376-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_8371-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_8371-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_8394-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_8394-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_8393-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_8393-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_8391-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_8391-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_8384-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_8384-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_8380-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_8380-1.jpg"
        ]
    },
    {
        "title": "Volkswagen Passat 2009",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1952,
            "name": "Passat"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 170,
        "price": 5490,
        "mileage": 303800,
        "production_year": 2009,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 4",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Distributie, ulei si filtre CADOU🎁\n🔖 Cumpara în siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile !\n🔵KM 303800\n🔵CUTIE MANUALA\n🔵DUBLU CLIMATRONIC\n🔵INCALZIRE IN SCAUNE\n🔵NAVIGATIE\n🔵PILOT AUTOMAT\n🔵COMENZI PE VOLAN\n🔵SENZORI LUMINA / PLOAIE\n🔵COMPUTER BORD",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7478-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7480-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7480-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7482-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7482-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7483-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7483-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7485-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7485-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7486-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7486-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7487-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7487-1.jpg"
        ]
    },
    {
        "title": "BMW Seria 7 2016",
        "brand": {
            "id": 18,
            "name": "BMW"
        },
        "model": {
            "id": 194,
            "name": "Seria 7"
        },
        "engine": {
            "capacity": "3.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 265,
        "price": 23990,
        "mileage": 219300,
        "production_year": 2016,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. ulei si filtre CADOU\nCumpara în siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 219300\nCUTIE AUTOMATA\nFARURI LASER\nMASAJ IN SCAUNE\nVOLAN INCALZIT\nSISTEM AUDIO HARMAN/KARDON\nSUSPENSIE PNEUMATICA\nSCAUNE ELECTRICE CU MEMORIE\nSOFT CLOSE\nMODURI DE CONDUS\nHEAD UP DISPLAY",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7659-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7658-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7658-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7661-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7661-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7662-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7662-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7664-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7664-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7665-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7665-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7667-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7667-1.jpg"
        ]
    },
    {
        "title": "Audi A4 2015",
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
        "horsepower": 150,
        "price": 9990,
        "mileage": 246000,
        "production_year": 2015,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. ulei si filtre CADOU🎁\n🔖 Cumpara în siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile !\n🔵KM 246000\n🔵CUTIE AUTOMATA\n🔵PILOT AUTOMAT\n🔵COMENZI PE VOLAN\n🔵NAVIGATIE\n🔵INCALZIRE IN SCAUNE\n🔵MODURI DE CONDUS\n🔵SENZORI LUMINI SI PLOAIE",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7361-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7362-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7362-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7363-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7363-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7365-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7365-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7367-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7367-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7368-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7368-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7370-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7370-1.jpg"
        ]
    },
    {
        "title": "BMW Seria 1 2011",
        "brand": {
            "id": 18,
            "name": "BMW"
        },
        "model": {
            "id": 188,
            "name": "Seria 1"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "price": 4990,
        "mileage": 186000,
        "production_year": 2011,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. ulei si filtre CADOU🎁\n🔖 Cumpara în siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile !\n🔵KM 186000\n🔵CUTIE MANUALA\n🔵NAVIGATIE\n🔵DUBLU CLIMATRONIC\n🔵SENZORI PARCARE\n🔵COMPUTER BORD\n🔵COMENZI PE VOLAN\n🔵GEAMURI ELECTRICE\n🔵SENZORI LUMINI\n🔵BI XENON\n💸4990EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7422-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7425-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7425-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7431-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7431-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7433-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7433-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7434-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7434-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7435-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7435-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7436-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7436-1.jpg"
        ]
    },
    {
        "title": "BMW Seria 1 2011",
        "brand": {
            "id": 18,
            "name": "BMW"
        },
        "model": {
            "id": 188,
            "name": "Seria 1"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "price": 4490,
        "mileage": 248000,
        "production_year": 2011,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. ulei si filtre CADOU🎁\n🔖 Cumpara în siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile !\n🔵KM 248000\n🔵CUTIE MANUALA\n🔵INCALZIRE IN SCAUNE\n🔵DUBLU CLIMATORNIC\n🔵BI-XENON\n🔵NAVIGATIE\n🔵COMPUTER BORD\n🔵COMENZI PE VOLAN\n🔵PILOT AUTOMAT\n🔵SENZORI PLOAIE\n💸4490EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7385-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7386-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7386-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7387-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7387-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7388-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7388-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7390-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7390-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7392-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7392-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7393-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7393-1.jpg"
        ]
    },
    {
        "title": "Mercedes GLC 2016",
        "brand": {
            "id": 92,
            "name": "Mercedes"
        },
        "model": {
            "id": 1244,
            "name": "GLC"
        },
        "engine": {
            "capacity": "2.2 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 204,
        "price": 21990,
        "mileage": 200703,
        "production_year": 2016,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "🔖Garanție 12 luni. Ulei si filtre CADOU🎁\n🔖 Cumpara în siguranță din Bucovina!\n🔖Posibilitate buy-back!\n🔖Posibilitate de retur in 7️⃣ zile !\n🔵KM 200.703\n🔵CUTIE AUTOMATA\n🔵DISTRONIC\n🔵LANE ASSIST\n🔵ACOPERIȘ PANORAMIC\n🔵FRONT ASSIST\n🔵NAVIGATIE\n🔵MODURI DE CONDUS\n🔵ÎNCĂLZIRE ÎN SCAUNE\n🔵SIDE ASSIST\n🔵DUBLU CLIMATRONIC",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7022-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7021-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7021-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7025-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7025-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7024-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7024-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7026-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7026-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7028-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7028-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7027-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/03/DSC_7027-1.jpg"
        ]
    },
    {
        "title": "BMW Seria 5 2019",
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
        "horsepower": 150,
        "price": 18990,
        "mileage": 173700,
        "production_year": 2019,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni, Ulei si filtre CADOU\nCumpara în siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 173700\nCUTIE AUTOMATA\nDUBLU CLIMATRONIC\nBORD DIGITAL\nNAVIGATIE MARE\nINCALZIRE IN SCAUNE\nMODURI DE CONDUS\nHEAD UP DISPLAY\nCAMERE 360\nKEYLESS GO\nLUMINI AMBIENTALE\n18990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_8501-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_8503-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_8503-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_8515-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_8515-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_8506-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_8506-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_8507-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_8507-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_8508-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_8508-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_8509-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_8509-1.jpg"
        ]
    },
    {
        "title": "Audi A6 2015",
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
        "horsepower": 272,
        "price": 14990,
        "mileage": 218700,
        "production_year": 2015,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Distributie, ulei si filtre CADOU\nCumpara în siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 218700\nCUTIE AUTOMATA\nNAVIGATIE\nCLIMATRONIC PE 4 ZONE\nINCALZIRE IN SCAUNE FATA / SPATE\nSCAUNE ELECTRICE CU MEMORIE\nPILOT AUTOMAT\nCAMERA SPATE\nSENZORI LUMIN / PLOAIE\nCOMENZI PE VOLAN\n14990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9662-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9663-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9663-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9653-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9653-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9654-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9654-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9656-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9656-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9659-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9659-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9657-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9657-1.jpg"
        ]
    },
    {
        "title": "Audi A4 2013",
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
        "horsepower": 143,
        "price": 10490,
        "mileage": 197800,
        "production_year": 2013,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Distributie, ulei si filtre CADOU\nCumpara în siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 197800\nCUTIE MANUALA\nCLIMATRONIC\nNAVIGATIE\nINCALZIRE IN SCAUNE\nCOMENZI PE VOLAN\nPILOT AUTOMAT\nSENZORI LUMINA / PLOAIE\n10490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9444-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9443-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9443-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9431-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9431-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9434-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9434-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9440-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9440-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9437-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9437-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9438-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/02/DSC_9438-1.jpg"
        ]
    },
    {
        "title": "Mercedes C 2015",
        "brand": {
            "id": 92,
            "name": "Mercedes"
        },
        "model": {
            "id": 1210,
            "name": "C"
        },
        "engine": {
            "capacity": "2.2 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 170,
        "price": 13490,
        "mileage": 270000,
        "production_year": 2015,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "MERCEDES-BENZ C-CLASS 2015 MOTOR 2.2 170 CP\nGaranție 12 luni. Distributie, ulei si filtre CADOU\nCumpara în siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 270000\nCUTIE AUTOMATA\nDUBLU CLIMATRONIC\nINCALZIRE IN SCAUNE\nMODURI DE CONDUS\nHEAD UP DISPLAY\nPADELE\nCAMERA SPATE\nSISTEM AUDIO BURMESTER",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5235-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5238-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5238-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5236-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5236-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5240-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5240-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5239-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5239-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5243-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5243-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5244-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5244-1.jpg"
        ]
    },
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
            "capacity": "1.6 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 105,
        "price": 7490,
        "mileage": 247000,
        "production_year": 2013,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "VW GOLF 7 2013 MOTOR 1.6 DIESEL 105 CP\nGaranție 12 luni. Distributie, ulei si filtre CADOU\nC\numpara în siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 247000\nCUTIE MANUALA\nCLIMATRONIC\nINCALZIRE IN SCAUNE\nCOMENZI PE VOLAN\nCOMPUTER BORD\nAUTO HOLD\nSENZORI LUMINA/PLOAIE\n7490 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5138-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5140-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5140-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5139-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5139-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5142-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5142-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5141-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5141-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5144-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5144-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5146-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5146-1.jpg"
        ]
    },
    {
        "title": "Volkswagen Passat 2014",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1952,
            "name": "Passat"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 140,
        "price": 7990,
        "mileage": 281200,
        "production_year": 2014,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0736130852",
        "description": "Garanție 12 luni. Distributie, ulei si filtre CADOU\nC\numpara în siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 281200\nCUTIE MANUALA\nDUBLU CLIMATRONIC\nINCALZIRE IN SCAUNE\nCOMENZI PE VOLAN\nSENZORI PARCARE\nAUTO HOLD\nSENZORI LUMINA / PLOAIE\n7990 EURO",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5123-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5125-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5125-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5124-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5124-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5127-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5127-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5126-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5126-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5133-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5133-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5136-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_5136-1.jpg"
        ]
    },
    {
        "title": "Volkswagen Passat 2015",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1952,
            "name": "Passat"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 150,
        "price": 9990,
        "mileage": 251000,
        "production_year": 2015,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0736130852",
        "description": "VW PASSAT 2015 MOTOR 2.0 DIESEL 150 CP\nGaranție 12 luni. Distributie, ulei si filtre CADOU\nC\numpara în siguranță din Bucovina!\nPosibilitate buy-back!\nPosibilitate de retur in\nzile !\nKM 251000\nCUTIE AUTOMATA\nDUBLU CLIMATRONIC\nINCALZIRE IN SCAUNE SI MASAJ\nCOMENZI PE VOLAN\nNAVIGATIE\nKEYLESS GO\nSENZORI LUMINA/PLOAIE",
        "images": [
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_1213-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_1214-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_1214-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_1204-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_1204-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_1206-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_1206-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_1207-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_1207-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_1209-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_1209-1.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_1208-1-scaled.jpg",
            "https://rbsauto.ro/wp-content/uploads/2026/01/DSC_1208-1.jpg"
        ]
    }
];

// ─────────────────────────────────────────────────────────────────────────────

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
    console.log('\n╔══ SEED RbsAuto → CarFlip (86 mașini, 12 în promo) ══╗\n');
    await mongoose.connect(process.env.DB_URL);
    console.log('   ✅ MongoDB conectat');

    const dealer = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(DEALER_ID) });
    if (!dealer) { console.log('❌ Contul RbsAuto nu există.'); await mongoose.disconnect(); process.exit(1); }
    console.log(`   ✅ dealer: ${dealer.username}`);

    const existing = new Set((await sales.find({ user_id: DEALER_ID }).select('title price').lean()).map(s => `${s.title}|${s.price}`));
    const alreadyPromoted = await sales.countDocuments({ user_id: DEALER_ID, allow_social_promo: true });
    let promoBudget = Math.max(0, PROMO_COUNT - alreadyPromoted);

    const toAdd = CARS.filter(c => !existing.has(`${c.title}|${c.price}`));
    console.log(`   ${CARS.length} în listă, ${CARS.length - toAdd.length} deja în DB, ${toAdd.length} de adăugat`);
    console.log(`   ⭐ promo: ${alreadyPromoted}/${PROMO_COUNT} ocupate, mai pot promova ${promoBudget}\n`);
    if (toAdd.length === 0) { console.log('Nimic de făcut.'); await mongoose.disconnect(); process.exit(0); }

    // FAZA 1: descarcă TOATE pozele înainte să scriem ceva
    console.log('── Faza 1: descarc pozele (nimic în DB încă) ──');
    const prepared = [];
    for (const [i, car] of toAdd.entries()) {
        process.stdout.write(`   [${i+1}/${toAdd.length}] ${car.title.padEnd(30)} `);
        const files = await downloadImages(car.images, car.title);
        if (files.length === 0) {
            console.log('❌ 0 poze');
            console.log('\n⛔ ABORT: o mașină nu are poze descărcabile. NU s-a scris nimic în DB.');
            for (const p of prepared) for (const f of p.files) await fs.remove(f.path).catch(()=>{});
            await mongoose.disconnect(); process.exit(1);
        }
        console.log(`✅ ${files.length}p`);
        prepared.push({ car, files });
    }

    // FAZA 2: scriem în DB + coadă
    console.log('\n── Faza 2: scriu în DB + pun media în coadă ──');
    let created = 0;
    for (const { car, files } of prepared) {
        const willPromote = promoBudget > 0;
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
            allow_comments: true, allow_social_promo: willPromote,
            is_active: false, status: 'media_processing',
            paid_until: paidUntil, expires_at: addDays(paidUntil, 10), stripe_subscription_id: null,
        });
        await doc.save();
        await addMediaToQueue(doc._id, files, files.map(() => ({})));
        if (willPromote) promoBudget--;
        created++;
        console.log(`   ✅ ${car.title.padEnd(30)} ${files.length}p ${willPromote ? '⭐ PROMO' : ''}`);
    }

    console.log(`\n╔══ GATA ══╗`);
    console.log(`   ${created} anunțuri create pe contul RbsAuto.`);
    console.log(`   ⭐ ${PROMO_COUNT - promoBudget - alreadyPromoted} noi în promo.`);
    console.log(`   ⏳ Worker-ul procesează pozele → R2 → le activează.\n`);
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(async (e) => { console.error('\n❌ EȘEC:', e); try { await mongoose.disconnect(); } catch {} process.exit(1); });