#!/usr/bin/env node
// ============================================================================
//  seed_iri.js — populează CarFlip cu cele 35 mașini de la Auto Irimia (autoirimia.ro).
//  RULARE (pe SERVER, lângă package.json):  node seed_iri.js
//  • 35 mașini HARDCODATE. Zero scraping la runtime. TOATE în promo.
//  • Cont AutoIrimia, Galați / Galați, 0758097579. user_image = logo.
//  • Poze extrase STRICT din galeria WooCommerce (fără poze random/amestecate).
//  • Note: km lipsă pe site → fallback 100000; culoare → "Alta culoare";
//    câțiva ani/capacități estimate din model+Euro (site incomplet).
//  • ALL-OR-NOTHING + idempotent (titlu+preț pe contul AutoIrimia).
// ============================================================================
import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs-extra';
import path from 'path';
import { addMonths, addDays } from 'date-fns';
import sales from './src/models/salesModel.js';
import { addMediaToQueue } from './src/mediaProcessing/mediaQueue.js';

const DEALER_ID='6a7b4368a4667b6b6284e43a', DEALER_NAME='AutoIrimia';
const COUNTY='Galați', CITY='Galați', USER_IMAGE='https://media.car-flip.com/splash_logo.jpg';
const MAX_IMG_BYTES=15*1024*1024, RAW_DIR=path.join(process.cwd(),'temp_uploads','raw');
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';

const CARS = [
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
            "fuel_type": "Benzină"
        },
        "price": 9990,
        "mileage": 175001,
        "production_year": 2009,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 4",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-09-at-16.40.48-8.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-09-at-16.40.48-8-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-09-at-16.40.48-6.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-09-at-16.40.48-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-09-at-16.40.48-9.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-09-at-16.40.48-7.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-09-at-16.40.48-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-09-at-16.40.47-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-09-at-16.40.47-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-09-at-16.40.47-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-09-at-16.40.47-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-09-at-16.40.47.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/07/WhatsApp-Image-2026-07-09-at-16.40.48-1.jpeg"
        ]
    },
    {
        "title": "Seat Leon 2011",
        "brand": {
            "id": 122,
            "name": "Seat"
        },
        "model": {
            "id": 1699,
            "name": "Leon"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Motorină"
        },
        "price": 8990,
        "mileage": 200001,
        "production_year": 2011,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-30-at-10.44.27-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-30-at-10.44.27-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-30-at-10.44.27-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-30-at-10.44.27-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-30-at-10.44.27-4-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-30-at-10.44.27-7.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-30-at-10.44.27.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-30-at-10.44.28-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-30-at-10.44.28-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-30-at-10.44.28-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-30-at-10.44.28-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-30-at-10.44.28-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-30-at-10.44.28.jpeg"
        ]
    },
    {
        "title": "Volkswagen Tiguan 2017",
        "brand": {
            "id": 145,
            "name": "Volkswagen"
        },
        "model": {
            "id": 1966,
            "name": "Tiguan"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Motorină"
        },
        "price": 15990,
        "mileage": 175001,
        "production_year": 2017,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-01-at-09.26.45-7.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-01-at-09.26.45-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-01-at-09.26.45-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-01-at-09.26.45-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-01-at-09.26.45-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-01-at-09.26.45-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-01-at-09.26.45-6.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-01-at-09.26.45-7-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-01-at-09.26.45.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-01-at-09.26.46-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-01-at-09.26.46-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-01-at-09.26.46.jpeg"
        ]
    },
    {
        "title": "Dacia Duster 2019",
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
        "horsepower": 116,
        "price": 11490,
        "mileage": 200001,
        "production_year": 2019,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-28-at-16.26.50-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-28-at-16.26.50-1-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-28-at-16.26.50-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-28-at-16.26.50-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-28-at-16.26.50-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-28-at-16.26.50-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-28-at-16.26.50-6.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-28-at-16.26.50-8.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-28-at-16.26.50-9.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-28-at-16.26.50-10.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-28-at-16.26.50-11.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-28-at-16.26.50-12.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-28-at-16.26.50-13.jpeg"
        ]
    },
    {
        "title": "Renault Megane 2019",
        "brand": {
            "id": 115,
            "name": "Renault"
        },
        "model": {
            "id": 1619,
            "name": "Megane"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 140,
        "price": 11990,
        "mileage": 125001,
        "production_year": 2019,
        "vin": "",
        "body_type": "Break (Combi)",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-19.43.23-11.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-19.43.23-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-19.43.23-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-19.43.23-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-19.43.23-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-19.43.23-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-19.43.23-6.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-19.43.23-7.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-19.43.23-8.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-19.43.23-9.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-19.43.23-10.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-19.43.23-11-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-19.43.23-12.jpeg"
        ]
    },
    {
        "title": "Kia Sportage 2022",
        "brand": {
            "id": 68,
            "name": "Kia"
        },
        "model": {
            "id": 942,
            "name": "Sportage"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Hibrid Benzină"
        },
        "horsepower": 265,
        "price": 21990,
        "mileage": 172000,
        "production_year": 2022,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-13.01.47.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-13.01.47-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-13.01.47-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-13.01.47-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-13.01.47-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-13.01.47-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-13.01.47-6.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-13.01.47-7.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-13.01.47-8.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-13.01.47-9.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-13.01.47-10.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-13.01.47-11.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-13.01.47-12.jpeg"
        ]
    },
    {
        "title": "Kia Niro 2018",
        "brand": {
            "id": 68,
            "name": "Kia"
        },
        "model": {
            "id": 923,
            "name": "Niro"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Hibrid Benzină"
        },
        "horsepower": 141,
        "price": 14990,
        "mileage": 175001,
        "production_year": 2018,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-12.50.28-14.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-12.50.27.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-12.50.28-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-12.50.28-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-12.50.28-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-12.50.28-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-12.50.28-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-12.50.28-6.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-12.50.28-8.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-12.50.28-9.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-12.50.28-10.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-12.50.28-11.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-26-at-12.50.28-12.jpeg"
        ]
    },
    {
        "title": "Hyundai Ioniq 2019",
        "brand": {
            "id": 55,
            "name": "Hyundai"
        },
        "model": {
            "id": 794,
            "name": "Ioniq"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Hibrid Benzină"
        },
        "horsepower": 141,
        "price": 14950,
        "mileage": 125001,
        "production_year": 2019,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-21-at-15.12.27-13.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-21-at-15.12.27-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-21-at-15.12.27-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-21-at-15.12.27-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-21-at-15.12.27-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-21-at-15.12.27-6.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-21-at-15.12.27-7.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-21-at-15.12.27-8.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-21-at-15.12.27-9.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-21-at-15.12.27-10.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-21-at-15.12.27-11.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-21-at-15.12.27-12.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-21-at-15.12.27-13-1.jpeg"
        ]
    },
    {
        "title": "Audi A3 2015",
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
        "price": 10990,
        "mileage": 175001,
        "production_year": 2015,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-20-at-17.03.59-49.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-20-at-17.03.59-7.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-20-at-17.03.59-11.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-20-at-17.03.59-13.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-20-at-17.03.59-14.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-20-at-17.03.59-16.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-20-at-17.03.59-17.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-20-at-17.03.59-18.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-20-at-17.03.59-19.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-20-at-17.03.59-21.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-20-at-17.03.59-22.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-20-at-17.03.59-24.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-20-at-17.03.59-25.jpeg"
        ]
    },
    {
        "title": "Mini Cooper 2024",
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
            "fuel_type": "Benzină"
        },
        "price": 24990,
        "mileage": 25000,
        "production_year": 2024,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-03-31-at-14.51.43-3-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-03-31-at-14.51.43-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-03-31-at-14.51.43-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-03-31-at-14.51.43-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-03-31-at-14.51.43-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-03-31-at-14.51.43.jpeg"
        ]
    },
    {
        "title": "Audi A5 2020",
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
            "fuel_type": "Benzină"
        },
        "horsepower": 150,
        "price": 12990,
        "mileage": 100000,
        "production_year": 2020,
        "vin": "",
        "body_type": "Coupe",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-07-at-16.59.25-10.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-07-at-16.59.24.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-07-at-16.59.25-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-07-at-16.59.25-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-07-at-16.59.25-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-07-at-16.59.25-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-07-at-16.59.25-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-07-at-16.59.25-6.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-07-at-16.59.25-7.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-07-at-16.59.25-8.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-07-at-16.59.25-9.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-07-at-16.59.25-10-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-07-at-16.59.25-11.jpeg"
        ]
    },
    {
        "title": "BMW Seria 5 2020",
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
            "fuel_type": "Benzină"
        },
        "horsepower": 190,
        "price": 21490,
        "mileage": 100000,
        "production_year": 2020,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-31-at-14.51.44-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-31-at-14.51.43.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-31-at-14.51.44-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-31-at-14.51.44-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-31-at-14.51.44-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-31-at-14.51.44-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-31-at-14.51.44-5-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-31-at-14.51.44-6.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-31-at-14.51.44.jpeg"
        ]
    },
    {
        "title": "Skoda Octavia 2025",
        "brand": {
            "id": 125,
            "name": "Skoda"
        },
        "model": {
            "id": 1725,
            "name": "Octavia"
        },
        "engine": {
            "capacity": "2.0 L",
            "fuel_type": "Benzină"
        },
        "price": 26990,
        "mileage": 100000,
        "production_year": 2025,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-30-at-21.51.39.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-30-at-21.51.39-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-30-at-21.51.39-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-30-at-21.51.39-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-30-at-21.51.39-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-30-at-21.51.40-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-30-at-21.51.40-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-30-at-21.51.40.jpeg"
        ]
    },
    {
        "title": "Seat Leon 2016",
        "brand": {
            "id": 122,
            "name": "Seat"
        },
        "model": {
            "id": 1699,
            "name": "Leon"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 105,
        "price": 8990,
        "mileage": 100000,
        "production_year": 2016,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-12.43.49-7.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-12.43.48-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-12.43.48.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-12.43.49-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-12.43.49-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-12.43.49-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-12.43.49-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-12.43.49-6.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-12.43.49-7-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-12.43.49.jpeg"
        ]
    },
    {
        "title": "Renault Clio 2014",
        "brand": {
            "id": 115,
            "name": "Renault"
        },
        "model": {
            "id": 1605,
            "name": "Clio"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 140,
        "price": 6490,
        "mileage": 100000,
        "production_year": 2014,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.54.17-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.54.17-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.54.17-2-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.54.17-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.54.17-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.54.17-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.54.17-6.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.54.17-7.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.54.17-8.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.54.17-9.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.54.17-10.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.54.17.jpeg"
        ]
    },
    {
        "title": "Renault Clio 2014",
        "brand": {
            "id": 115,
            "name": "Renault"
        },
        "model": {
            "id": 1605,
            "name": "Clio"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 110,
        "price": 6490,
        "mileage": 100000,
        "production_year": 2014,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.31.10-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.31.10-7.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.31.10-8.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.31.10-9.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.31.10-10.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.31.10.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.31.10-1-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.31.10-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.31.10-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.31.10-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.31.10-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-11.31.10-6.jpeg"
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
            "fuel_type": "Benzină"
        },
        "price": 4990,
        "mileage": 100000,
        "production_year": 2009,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 4",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-09.43.10-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-09.43.10-10.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-09.43.10-11.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-09.43.10.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-09.43.10-1-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-09.43.10-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-09.43.10-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-09.43.10-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-09.43.10-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-09.43.10-6.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-09.43.10-7.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-09.43.10-8.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-29-at-09.43.10-9.jpeg"
        ]
    },
    {
        "title": "BMW Seria 3 2010",
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
        "price": 21490,
        "mileage": 100000,
        "production_year": 2010,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-24-at-15.37.28-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-24-at-15.37.27.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-24-at-15.37.28-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-24-at-15.37.28-2-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-24-at-15.37.28-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-24-at-15.37.28-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-24-at-15.37.28-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-24-at-15.37.28-6.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-24-at-15.37.28-7.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-24-at-15.37.28-8.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-24-at-15.37.28-9.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-24-at-15.37.28-10.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-24-at-15.37.28.jpeg"
        ]
    },
    {
        "title": "Renault Megane 2019",
        "brand": {
            "id": 115,
            "name": "Renault"
        },
        "model": {
            "id": 1619,
            "name": "Megane"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 110,
        "price": 10490,
        "mileage": 100000,
        "production_year": 2019,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-16.02.34-8.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-16.02.34-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-16.02.34-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-16.02.34-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-16.02.34-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-16.02.34-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-16.02.34-6.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-16.02.34-7.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-16.02.34-8-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-16.02.34-9.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-16.02.34-10.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-16.02.34-11.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-10-at-16.02.34-12.jpeg"
        ]
    },
    {
        "title": "Seat Leon 2017",
        "brand": {
            "id": 122,
            "name": "Seat"
        },
        "model": {
            "id": 1699,
            "name": "Leon"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 105,
        "price": 8990,
        "mileage": 100000,
        "production_year": 2017,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/02/WhatsApp-Image-2026-02-16-at-17.47.45-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/02/WhatsApp-Image-2026-02-16-at-17.47.45-1-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/02/WhatsApp-Image-2026-02-16-at-17.47.45-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/02/WhatsApp-Image-2026-02-16-at-17.47.45-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/02/WhatsApp-Image-2026-02-16-at-17.47.45-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/02/WhatsApp-Image-2026-02-16-at-17.47.45-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/02/WhatsApp-Image-2026-02-16-at-17.47.45-6.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/02/WhatsApp-Image-2026-02-16-at-17.47.45-7.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/02/WhatsApp-Image-2026-02-16-at-17.47.45.jpeg"
        ]
    },
    {
        "title": "Audi A6 2014",
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
        "price": 12990,
        "mileage": 100000,
        "production_year": 2014,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-29-at-14.28.52.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-29-at-14.28.52-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-29-at-14.28.52-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-29-at-14.28.52-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-29-at-14.28.53-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-29-at-14.28.53-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-29-at-14.28.53.jpeg"
        ]
    },
    {
        "title": "Volkswagen Passat 2017",
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
        "price": 9990,
        "mileage": 100000,
        "production_year": 2017,
        "vin": "",
        "body_type": "Sedan",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-25-at-21.17.52.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-25-at-21.17.52-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-25-at-21.17.52-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-25-at-21.17.52-3.jpeg"
        ]
    },
    {
        "title": "Volkswagen Tiguan 2017",
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
        "price": 9990,
        "mileage": 100000,
        "production_year": 2017,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-22-at-9.41.42-PM-5.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-22-at-9.41.42-PM-1-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-22-at-9.41.42-PM-2.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-22-at-9.41.42-PM-3.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-22-at-9.41.42-PM-4.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-22-at-9.41.42-PM-5-1.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-22-at-9.41.42-PM-6.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-22-at-9.41.42-PM.jpeg"
        ]
    },
    {
        "title": "Renault Megane 2014",
        "brand": {
            "id": 115,
            "name": "Renault"
        },
        "model": {
            "id": 1619,
            "name": "Megane"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Motorină"
        },
        "price": 5490,
        "mileage": 100000,
        "production_year": 2014,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251209-WA0118.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251209-WA0106.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251209-WA0107.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251209-WA0108.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251209-WA0109.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251209-WA0110.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251209-WA0111.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251209-WA0112.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251209-WA0113.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251209-WA0114.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251209-WA0115.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251209-WA0116.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251209-WA0117.jpg"
        ]
    },
    {
        "title": "Renault Megane 2018",
        "brand": {
            "id": 115,
            "name": "Renault"
        },
        "model": {
            "id": 1619,
            "name": "Megane"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 110,
        "price": 10990,
        "mileage": 100000,
        "production_year": 2018,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0160.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0156.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0157.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0158.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0159.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0160-1.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0161.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0162.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0163.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0164.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0165.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0166.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0167.jpg"
        ]
    },
    {
        "title": "Dacia Duster 2019",
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
        "price": 13990,
        "mileage": 100000,
        "production_year": 2019,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0142.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0139-1.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0140-1.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0141-1.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0142-2.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0143-1.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0144-1.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0145-1.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0146-1.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0147-1.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0148-1.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0149-1.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/12/IMG-20251202-WA0150-1.jpg"
        ]
    },
    {
        "title": "Renault Megane 2019",
        "brand": {
            "id": 115,
            "name": "Renault"
        },
        "model": {
            "id": 1619,
            "name": "Megane"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 110,
        "price": 10490,
        "mileage": 100000,
        "production_year": 2019,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251016-WA0027.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251016-WA0018.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251016-WA0019.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251016-WA0020.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251016-WA0021.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251016-WA0022.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251016-WA0023.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251016-WA0024.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251016-WA0025.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251016-WA0026.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251016-WA0027-1.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251016-WA0028.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251016-WA0029.jpg"
        ]
    },
    {
        "title": "Renault Megane 2018",
        "brand": {
            "id": 115,
            "name": "Renault"
        },
        "model": {
            "id": 1619,
            "name": "Megane"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 110,
        "price": 10990,
        "mileage": 100000,
        "production_year": 2018,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0098.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0079.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0080.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0081.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0082.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0083.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0084.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0085.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0086.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0087.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0088.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0089.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0090.jpg"
        ]
    },
    {
        "title": "Renault Megane 2018",
        "brand": {
            "id": 115,
            "name": "Renault"
        },
        "model": {
            "id": 1619,
            "name": "Megane"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 140,
        "price": 11450,
        "mileage": 66800,
        "production_year": 2018,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2025/10/image00024-scaled.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/image00025-scaled.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/image00019-scaled.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/image00021-scaled.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/image00022-scaled.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/image00027-scaled.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/image00014-scaled.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/image00016-scaled.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/image00013-scaled.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/image00017-scaled.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/image00001-scaled.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/image00011-scaled.jpeg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/image00012-scaled.jpeg"
        ]
    },
    {
        "title": "Renault Megane 2019",
        "brand": {
            "id": 115,
            "name": "Renault"
        },
        "model": {
            "id": 1619,
            "name": "Megane"
        },
        "engine": {
            "capacity": "1.5 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 140,
        "price": 9990,
        "mileage": 100000,
        "production_year": 2019,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0008.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0005.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0006.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0007.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0008-1.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0009.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0010.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0011.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0012.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0013.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0014.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0015.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251014-WA0016.jpg"
        ]
    },
    {
        "title": "Volkswagen Golf 2017",
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
        "price": 5990,
        "mileage": 100000,
        "production_year": 2017,
        "vin": "",
        "body_type": "Hatchback",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251013-WA0056.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251013-WA0044.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251013-WA0045.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251013-WA0046.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251013-WA0047.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251013-WA0048.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251013-WA0049.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251013-WA0050.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251013-WA0051.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251013-WA0052.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251013-WA0053.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251013-WA0054.jpg",
            "https://autoirimia.ro/wp-content/uploads/2025/10/IMG-20251013-WA0055.jpg"
        ]
    },
    {
        "title": "Renault Espace 2017",
        "brand": {
            "id": 115,
            "name": "Renault"
        },
        "model": {
            "id": 1606,
            "name": "Espace"
        },
        "engine": {
            "capacity": "1.6 L",
            "fuel_type": "Motorină"
        },
        "horsepower": 140,
        "price": 11990,
        "mileage": 66800,
        "production_year": 2017,
        "vin": "",
        "body_type": "Minivan",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2025/09/image-1-1.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/09/image-2-1.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/09/image-3-1.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/09/image-4-1.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/09/image-5-1.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/09/image-6-1.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/09/image-7-1.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/09/image-8-1.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/09/image-9-1.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/09/image-10-1.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/09/image-11-1.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/09/image-12-1.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/09/image-13-1.webp"
        ]
    },
    {
        "title": "Mercedes AMG GT 2019",
        "brand": {
            "id": 92,
            "name": "Mercedes"
        },
        "model": {
            "id": 1199,
            "name": "AMG GT"
        },
        "engine": {
            "capacity": "4.0 L",
            "fuel_type": "Benzină"
        },
        "horsepower": 630,
        "price": 79000,
        "mileage": 54128,
        "production_year": 2019,
        "vin": "",
        "body_type": "Coupe",
        "color": "Alta culoare",
        "transmission": "Manuală",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-11-17.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-1-17.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-2-17.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-3-17.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-4-17.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-5-17.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-6-17.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-7-17.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-8-17.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-9-17.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-10-17.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-12-15.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-13-15.webp"
        ]
    },
    {
        "title": "Mazda CX-5 2017",
        "brand": {
            "id": 90,
            "name": "Mazda"
        },
        "model": {
            "id": 1144,
            "name": "CX-5"
        },
        "engine": {
            "capacity": "2.2 L",
            "fuel_type": "Motorină"
        },
        "price": 10990,
        "mileage": 100000,
        "production_year": 2017,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Integrală (4x4/AWD)",
        "pollution_standard": "Euro 6",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-29.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-1-13.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-2-13.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-3-13.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-4-13.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-5-13.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-6-13.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-7-13.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-8-13.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-10-13.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-11-13.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-12-11.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-13-11.webp"
        ]
    },
    {
        "title": "Volkswagen Tiguan 2017",
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
        "price": 9990,
        "mileage": 100000,
        "production_year": 2017,
        "vin": "",
        "body_type": "SUV",
        "color": "Alta culoare",
        "transmission": "Automată",
        "drivetrain": "Față (FWD)",
        "pollution_standard": "Euro 5",
        "phone_number": "0758097579",
        "description": "",
        "images": [
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-1-12.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-2-12.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-3-12.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-4-12.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-5-12.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-6-12.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-7-12.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-8-12.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-9-12.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-10-12.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-11-12.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-12-10.webp",
            "https://autoirimia.ro/wp-content/uploads/2025/06/image-13-10.webp"
        ]
    }
];

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms)); let _last=0;
async function politeFetch(url){const w=350-(Date.now()-_last);if(w>0)await sleep(w);_last=Date.now();const res=await fetch(url,{headers:{'User-Agent':UA}});if(!res.ok)throw new Error('HTTP '+res.status);return res;}
async function downloadImages(urls,tag){await fs.ensureDir(RAW_DIR);const files=[];for(const url of urls){try{const buf=Buffer.from(await(await politeFetch(url)).arrayBuffer());if(buf.length>MAX_IMG_BYTES)continue;const ext=(url.match(/\.(jpe?g|png|webp)$/i)||[,'jpg'])[1].toLowerCase();const name='raw_'+Date.now()+'_'+Math.round(Math.random()*1e9)+'.'+(ext==='jpeg'?'jpg':ext);const dest=path.join(RAW_DIR,name);await fs.writeFile(dest,buf);files.push({path:dest,originalname:name,mimetype:ext==='png'?'image/png':(ext==='webp'?'image/webp':'image/jpeg'),size:buf.length});}catch(e){console.log('      eroare poză ('+tag+'): '+e.message);}}return files;}

async function main(){
  console.log('\n╔══ SEED Auto Irimia → CarFlip (35 mașini, toate în promo) ══╗\n');
  await mongoose.connect(process.env.DB_URL); console.log('   ✅ MongoDB conectat');
  const dealer=await mongoose.connection.db.collection('users').findOne({_id:new mongoose.Types.ObjectId(DEALER_ID)});
  if(!dealer){console.log('❌ Contul AutoIrimia nu există.');await mongoose.disconnect();process.exit(1);}
  console.log('   ✅ dealer: '+dealer.username);
  const existing=new Set((await sales.find({user_id:DEALER_ID}).select('title price').lean()).map(s=>s.title+'|'+s.price));
  const toAdd=CARS.filter(c=>!existing.has(c.title+'|'+c.price));
  console.log('   '+CARS.length+' în listă, '+(CARS.length-toAdd.length)+' deja în DB, '+toAdd.length+' de adăugat\n');
  if(toAdd.length===0){console.log('Nimic de făcut.');await mongoose.disconnect();process.exit(0);}
  console.log('── Faza 1: descarc pozele (nimic în DB încă) ──');
  const prepared=[];
  for(const[i,car]of toAdd.entries()){
    process.stdout.write('   ['+(i+1)+'/'+toAdd.length+'] '+car.title.padEnd(26)+' ');
    const files=await downloadImages(car.images,car.title);
    if(files.length===0){console.log('❌ 0 poze');console.log('\n⛔ ABORT: o mașină nu are poze. NU s-a scris nimic în DB.');for(const p of prepared)for(const f of p.files)await fs.remove(f.path).catch(()=>{});await mongoose.disconnect();process.exit(1);}
    console.log('✅ '+files.length+'p'); prepared.push({car,files});
  }
  console.log('\n── Faza 2: scriu în DB + pun media în coadă ──');
  let created=0;
  for(const{car,files}of prepared){
    const now=new Date(),paidUntil=addMonths(now,6);
    const doc=new sales({user_id:DEALER_ID,user_name:DEALER_NAME,user_image:USER_IMAGE,title:car.title,brand:car.brand,model:car.model,engine:car.engine,horsepower:car.horsepower,price:car.price,negotiable:false,mileage:car.mileage,production_year:car.production_year,vin:car.vin,body_type:car.body_type,color:car.color,transmission:car.transmission,drivetrain:car.drivetrain,pollution_standard:car.pollution_standard,steering_wheel:'left',location:{county:COUNTY,city:CITY},registration_status:'registered',exchange_accepted:false,for_dismante:false,phone_number:car.phone_number,description:car.description,media:[],likes_count:0,views:0,comments_count:0,allow_comments:true,allow_social_promo:true,is_active:false,status:'media_processing',paid_until:paidUntil,expires_at:addDays(paidUntil,10),stripe_subscription_id:null});
    await doc.save(); await addMediaToQueue(doc._id,files,files.map(()=>({}))); created++;
    console.log('   ✅ '+car.title.padEnd(26)+' '+files.length+'p ⭐');
  }
  console.log('\n╔══ GATA ══╗');
  console.log('   '+created+' anunțuri create pe contul AutoIrimia.');
  console.log('   ⏳ Worker-ul procesează pozele → R2 → le activează.\n');
  await mongoose.disconnect(); process.exit(0);
}
main().catch(async(e)=>{console.error('\n❌ EȘEC:',e);try{await mongoose.disconnect();}catch{}process.exit(1);});