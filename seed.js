#!/usr/bin/env node
// ============================================================================
//  seed_dan.js — populează CarFlip cu cele 12 mașini de la Auto Dan (auto-dan.ro).
//
//  RULARE (pe SERVER, lângă package.json):  node seed_dan.js
//
//  • 12 mașini HARDCODATE. Zero scraping la runtime.
//  • Cont AutoDanRo, Zalău / Sălaj, 0740092172.
//  • user_image = logo-ul, pe fiecare anunț.
//  • TOATE în promo (allow_social_promo:true).
//  • Date REALE de pe site: an, km, motor, cutie, CP, preț, CULOARE, normă Euro.
//    (cel mai complet site — nu se deduce nimic în afară de caroserie din model).
//  • ALL-OR-NOTHING + idempotent (titlu+preț pe contul AutoDanRo).
// ============================================================================

import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs-extra';
import path from 'path';
import { addMonths, addDays } from 'date-fns';

import sales from './src/models/salesModel.js';
import { addMediaToQueue } from './src/mediaProcessing/mediaQueue.js';

const DEALER_ID   = '6a7b3f2b7732f77a71275d63';
const DEALER_NAME = 'AutoDanRo';
const COUNTY = 'Sălaj';
const CITY   = 'Zalău';
const USER_IMAGE = 'https://media.car-flip.com/splash_logo.jpg';
const MAX_IMG_BYTES = 15 * 1024 * 1024;
const RAW_DIR = path.join(process.cwd(), 'temp_uploads', 'raw');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';

const CARS = [
    {
        "title": "Audi A5 2014",
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
        "price": 13990,
        "mileage": 257000,
        "production_year": 2014,
        "vin": "",
        "body_type": "Coupe",
        "color": "Gri",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0740092172",
        "description": "",
        "images": [
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0194.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0193.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0192.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0199.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0201.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0195.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0200.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0215-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0215.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0204.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0207.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0208.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0212.jpg"
        ]
    },
    {
        "title": "Peugeot 3008 2021",
        "brand": {
            "id": 106,
            "name": "Peugeot"
        },
        "model": {
            "id": 1493,
            "name": "3008"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Hibrid Benzină"
        },
        "horsepower": 224,
        "price": 23990,
        "mileage": 77000,
        "production_year": 2021,
        "vin": "",
        "body_type": "SUV",
        "color": "Albastru",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0740092172",
        "description": "",
        "images": [
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0278-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0278.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0274-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0274.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0260-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0260.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0284-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0284.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0270-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0270.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0256-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0256.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0266-scaled.jpg"
        ]
    },
    {
        "title": "Dacia Duster 2012",
        "brand": {
            "id": 31,
            "name": "Dacia"
        },
        "model": {
            "id": 415,
            "name": "Duster"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 105,
        "price": 6390,
        "mileage": 175000,
        "production_year": 2012,
        "vin": "",
        "body_type": "SUV",
        "color": "Auriu",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0740092172",
        "description": "<link rel='stylesheet' id='caleader-add-icon-css",
        "images": [
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-07-at-14.08.47.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-07-at-14.08.47-3.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-07-at-14.08.47-4.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-07-at-14.08.47-1.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-07-at-14.08.49-1.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-07-at-14.08.48.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-07-at-14.08.48-2.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-07-at-14.08.49.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-07-at-14.08.47-2.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0194.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0278.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09044.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09008.jpeg"
        ]
    },
    {
        "title": "Audi Q3 2016",
        "brand": {
            "id": 12,
            "name": "Audi"
        },
        "model": {
            "id": 112,
            "name": "Q3"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 150,
        "price": 18990,
        "mileage": 90397,
        "production_year": 2016,
        "vin": "",
        "body_type": "SUV",
        "color": "Albastru",
        "transmission": "Manuală",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0740092172",
        "description": "",
        "images": [
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09044.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09042.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09043.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09039.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09038.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09040.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09045.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09056.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09057.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09058.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09049.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09050.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09051.jpeg"
        ]
    },
    {
        "title": "Nissan X-trail 2020",
        "brand": {
            "id": 100,
            "name": "Nissan"
        },
        "model": {
            "id": 1430,
            "name": "X-trail"
        },
        "engine": {
            "capacity": "1.7 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 150,
        "price": 16990,
        "mileage": 95000,
        "production_year": 2020,
        "vin": "",
        "body_type": "SUV",
        "color": "Gri",
        "transmission": "Manuală",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0740092172",
        "description": "",
        "images": [
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09008-1.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09006.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09005.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09013.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09012.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09011.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09015.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09014.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09017.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09016.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09019.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09018.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09031.jpeg"
        ]
    },
    {
        "title": "Renault Captur 2020",
        "brand": {
            "id": 115,
            "name": "Renault"
        },
        "model": {
            "id": 1604,
            "name": "Captur"
        },
        "engine": {
            "capacity": "1.0 L",
            "fuel_type": "Benzină + GPL"
        },
        "horsepower": 90,
        "price": 12990,
        "mileage": 96000,
        "production_year": 2020,
        "vin": "",
        "body_type": "SUV",
        "color": "Portocaliu",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0740092172",
        "description": "",
        "images": [
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0341-1-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0341-1.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0337-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0337.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0345-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0345.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0349-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0349.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0329-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0329.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0323-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0323.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0339-scaled.jpg"
        ]
    },
    {
        "title": "Dacia Duster 2017",
        "brand": {
            "id": 31,
            "name": "Dacia"
        },
        "model": {
            "id": 415,
            "name": "Duster"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 109,
        "price": 9990,
        "mileage": 200000,
        "production_year": 2017,
        "vin": "",
        "body_type": "SUV",
        "color": "Negru",
        "transmission": "Manuală",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0740092172",
        "description": "",
        "images": [
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0354.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0359.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0353.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0355.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0350.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0357.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0352.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0351.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0358.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0356.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0194.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0278.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-07-at-14.08.47.jpeg"
        ]
    },
    {
        "title": "Dacia Duster 2011",
        "brand": {
            "id": 31,
            "name": "Dacia"
        },
        "model": {
            "id": 415,
            "name": "Duster"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 105,
        "price": 5990,
        "mileage": 213000,
        "production_year": 2011,
        "vin": "",
        "body_type": "SUV",
        "color": "Gri",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0740092172",
        "description": "",
        "images": [
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0290-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0290.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0292-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0292.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0296-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0296.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0295-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0295.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0294-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0294.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0293-scaled.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0293.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0291-scaled.jpg"
        ]
    },
    {
        "title": "Renault Koleos 2014",
        "brand": {
            "id": 115,
            "name": "Renault"
        },
        "model": {
            "id": 1615,
            "name": "Koleos"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 173,
        "price": 7590,
        "mileage": 250000,
        "production_year": 2014,
        "vin": "",
        "body_type": "SUV",
        "color": "Negru",
        "transmission": "Manuală",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0740092172",
        "description": "",
        "images": [
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0282.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0281.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0279.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0280.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0284.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0285.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0283.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0194.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0278.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-07-at-14.08.47.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09044.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09008.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0341-1.jpg"
        ]
    },
    {
        "title": "Nissan Qashqai+2 2012",
        "brand": {
            "id": 100,
            "name": "Nissan"
        },
        "model": {
            "id": 1415,
            "name": "Qashqai+2"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 131,
        "price": 7390,
        "mileage": 219000,
        "production_year": 2012,
        "vin": "",
        "body_type": "SUV",
        "color": "Maro",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0740092172",
        "description": "",
        "images": [
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0243.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0230.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0236.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0245.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0237.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0244.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0233.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0238.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0246.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0249.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0250.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0255.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0260.jpg"
        ]
    },
    {
        "title": "Toyota Yaris 2023",
        "brand": {
            "id": 140,
            "name": "Toyota"
        },
        "model": {
            "id": 1891,
            "name": "Yaris"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Hibrid Benzină"
        },
        "horsepower": 116,
        "price": 23990,
        "mileage": 104000,
        "production_year": 2023,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Negru",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0740092172",
        "description": "<link rel=\"altern",
        "images": [
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0177.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0182.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0188.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0185.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0187.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0178.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0189.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0184.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0190.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0186.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0180.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0179.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260806-WA0175.jpg"
        ]
    },
    {
        "title": "Renault Megane 2017",
        "brand": {
            "id": 115,
            "name": "Renault"
        },
        "model": {
            "id": 1619,
            "name": "Megane"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 163,
        "price": 10590,
        "mileage": 177000,
        "production_year": 2017,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Albastru",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0740092172",
        "description": "",
        "images": [
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-05-at-23.04.16.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-05-at-23.04.16-1.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-05-at-23.04.16-3.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-05-at-23.04.16-4.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-05-at-23.04.17-1.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-05-at-23.04.16-2.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-05-at-23.04.17-2.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-05-at-23.04.17-3.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0194.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/IMG-20260807-WA0278.jpg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-07-at-14.08.47.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09044.jpeg",
            "https://www.auto-dan.ro/wp-content/uploads/2026/08/DSC09008.jpeg"
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
    console.log('\n╔══ SEED Auto Dan → CarFlip (12 mașini, toate în promo) ══╗\n');
    await mongoose.connect(process.env.DB_URL);
    console.log('   ✅ MongoDB conectat');

    const dealer = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(DEALER_ID) });
    if (!dealer) { console.log('❌ Contul AutoDanRo nu există.'); await mongoose.disconnect(); process.exit(1); }
    console.log(`   ✅ dealer: ${dealer.username}`);

    const existing = new Set((await sales.find({ user_id: DEALER_ID }).select('title price').lean()).map(s => `${s.title}|${s.price}`));
    const toAdd = CARS.filter(c => !existing.has(`${c.title}|${c.price}`));
    console.log(`   ${CARS.length} în listă, ${CARS.length - toAdd.length} deja în DB, ${toAdd.length} de adăugat\n`);
    if (toAdd.length === 0) { console.log('Nimic de făcut.'); await mongoose.disconnect(); process.exit(0); }

    console.log('── Faza 1: descarc pozele (nimic în DB încă) ──');
    const prepared = [];
    for (const [i, car] of toAdd.entries()) {
        process.stdout.write(`   [${i+1}/${toAdd.length}] ${car.title.padEnd(26)} `);
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
        console.log(`   ✅ ${car.title.padEnd(26)} ${files.length}p ⭐`);
    }

    console.log(`\n╔══ GATA ══╗`);
    console.log(`   ${created} anunțuri create pe contul AutoDanRo.`);
    console.log(`   ⏳ Worker-ul procesează pozele → R2 → le activează.\n`);
    await mongoose.disconnect();
    process.exit(0);
}
main().catch(async (e) => { console.error('\n❌ EȘEC:', e); try { await mongoose.disconnect(); } catch {} process.exit(1); });