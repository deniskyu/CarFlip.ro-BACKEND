import admin from 'firebase-admin';
import { createRequire } from "module"; // 1. Importă createRequire
const require = createRequire(import.meta.url); // 2. Definește require
const serviceAccount = require('./carflip-64045-firebase-adminsdk-fbsvc-0b883ed977.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

export default admin;