import { Router } from 'express';
import savedSearches from '../models/savedSearchesModel.js';
import { authUser } from './usersRoute.js'; 
import { sendAndSaveNotification } from '../services/notificationService.js'; // 🔥 IMPORTUL NOU
import { fetchLimiter } from './usersRoute.js';

const alertsActions = Router();

export const triggerSearchAlerts = async (saleData) => {
    try {
        // 1. Construirea Mega-Query-ului Invers
        const query = {
            "brand.id": saleData.brand.id, // Brand-ul este singurul obligatoriu
            user_id: { $ne: saleData.user_id }, // Excludem omul care a publicat anunțul
            
            // Pentru fiecare field opțional, fie nu e definit în alertă, fie se încadrează în condiție
            $and: [
                { $or: [{ "model.id": { $exists: false } }, { "model.id": null }, { "model.id": saleData.model?.id }] },
                
                // 🔥 LOGICA NOUĂ PENTRU MOTORIZARE
                { $or: [{ fuel_type: { $exists: false } }, { fuel_type: null }, { fuel_type: saleData.engine?.fuel_type }] },
                { $or: [{ engine_capacity: { $exists: false } }, { engine_capacity: null }, { engine_capacity: saleData.engine?.capacity }] },
                
                { $or: [{ min_price: { $exists: false } }, { min_price: null }, { min_price: { $lte: saleData.price } }] },
                { $or: [{ max_price: { $exists: false } }, { max_price: null }, { max_price: { $gte: saleData.price } }] },
                
                { $or: [{ min_year: { $exists: false } }, { min_year: null }, { min_year: { $lte: saleData.production_year } }] },
                { $or: [{ max_year: { $exists: false } }, { max_year: null }, { max_year: { $gte: saleData.production_year } }] },
                
                { $or: [{ min_km: { $exists: false } }, { min_km: null }, { min_km: { $lte: saleData.mileage } }] },
                { $or: [{ max_km: { $exists: false } }, { max_km: null }, { max_km: { $gte: saleData.mileage } }] },
                
                { $or: [{ county: { $exists: false } }, { county: null }, { county: saleData.location?.county }] },
                { $or: [{ city: { $exists: false } }, { city: null }, { city: saleData.location?.city }] },
                
                { $or: [{ body_type: { $exists: false } }, { body_type: null }, { body_type: saleData.body_type }] },
                { $or: [{ transmission: { $exists: false } }, { transmission: null }, { transmission: saleData.transmission }] },
                { $or: [{ pollution_standard: { $exists: false } }, { pollution_standard: null }, { pollution_standard: saleData.pollution_standard }] },
                { $or: [{ registration_status: { $exists: false } }, { registration_status: null }, { registration_status: saleData.registration_status }] },
                { $or: [{ steering_wheel: { $exists: false } }, { steering_wheel: null }, { steering_wheel: saleData.steering_wheel }] },
                { $or: [{ for_dismante: { $exists: false } }, { for_dismante: null }, { for_dismante: saleData.for_dismante } ]}
            ]
        };

        // 2. Găsim TOATE alertele care se potrivesc cu acest anunț
        const matchingAlerts = await savedSearches.find(query).select('user_id').lean();

        if (!matchingAlerts || matchingAlerts.length === 0) {
            return; // Nu trimitem nimic dacă nu caută nimeni această mașină
        }

        // 3. Extragem doar ID-urile unice de useri
        const userIds = [...new Set(matchingAlerts.map(alert => alert.user_id.toString()))];

        if (userIds.length === 0) return;

        // 🔥 4. AICI SE ÎNTÂMPLĂ MAGIA (Înlocuiește zeci de linii de cod Firebase)
        // Trimitem lista de useri și datele către Service. El le va salva în DB și va da push-urile.
        await sendAndSaveNotification(
            userIds, // Cine primește
            {
                type: 'SAVED_SEARCH_MATCH',
                title: 'O mașină pe care o cauți tocmai a apărut!',
                body: `${saleData.brand.name} ${saleData.model.name} (${saleData.production_year}) a fost adăugat.`,
                saleId: saleData._id.toString()
            },
            null // Fără sender, e alertă de sistem
        );

    } catch (error) {
        console.error("Eroare critică în triggerSearchAlerts:", error);
    }
};

// ==========================================
// RUTELE CRUD PENTRU ALERTE RĂMÂN IDENTICE
// ==========================================

// 1. GET: Obține toate alertele user-ului curent
alertsActions.get('/api/alerts', authUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const alerts = await savedSearches.find({ user_id: userId }).sort({ createdAt: -1 });
        
        return res.json({ success: true, data: alerts });
    } catch (error) {
        console.error("Eroare la obținerea alertelor:", error);
        return res.status(500).json({ success: false, message: "Eroare la obținerea alertelor." });
    }
});

// 2. POST: Crează o alertă nouă (Max 20 per user)
alertsActions.post('/api/alerts', authUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const { brand, ...optionalFilters } = req.body;

        if (!brand || !brand.id || !brand.name) {
            return res.status(400).json({ success: false, message: "Marca (Brand-ul) este obligatorie pentru a salva o căutare." });
        }

        const alertCount = await savedSearches.countDocuments({ user_id: userId });
        if (alertCount >= 20) {
            return res.status(403).json({ success: false, message: "Ai atins limita maximă de 20 de căutări salvate." });
        }

        const cleanFilters = Object.fromEntries(
            Object.entries(optionalFilters).filter(([_, v]) => v != null && v !== '')
        );

        const newAlert = new savedSearches({
            user_id: userId,
            brand: {
                id: Number(brand.id),
                name: brand.name,
                logo: brand.logo || ''
            },
            ...cleanFilters
        });

        await newAlert.save();

        return res.json({ success: true, message: "Căutarea a fost salvată cu succes!", data: newAlert });
    } catch (error) {
        console.error("Eroare la salvarea alertei:", error);
        return res.status(500).json({ success: false, message: "Eroare la salvarea căutării." });
    }
});

// 3. PUT: Actualizează o alertă existentă (Editare)
alertsActions.put('/api/alerts/:id', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const alertId = req.params.id;
        const { brand, ...optionalFilters } = req.body;

        if (!brand || !brand.id || !brand.name) {
            return res.status(400).json({ success: false, message: "Marca (Brand-ul) nu poate fi eliminată." });
        }

        const cleanFilters = Object.fromEntries(
            Object.entries(optionalFilters).filter(([_, v]) => v != null && v !== '')
        );
        
        const existingAlert = await savedSearches.findOne({ _id: alertId, user_id: userId });
        if (!existingAlert) {
            return res.status(404).json({ success: false, message: "Alerta nu a fost găsită." });
        }

        existingAlert.brand = { id: Number(brand.id), name: brand.name, logo: brand.logo || '' };
        
        // 🔥 ADAUGAT fuel_type si engine_capacity ca să poată fi resetați din edit
        const optionalKeys = ['model', 'fuel_type', 'engine_capacity', 'min_price', 'max_price', 'min_year', 'max_year', 'min_km', 'max_km', 'county', 'city', 'body_type', 'transmission', 'pollution_standard', 'registration_status', 'steering_wheel', 'for_dismante'];
        optionalKeys.forEach(key => existingAlert[key] = undefined);

        Object.keys(cleanFilters).forEach(key => {
            existingAlert[key] = cleanFilters[key];
        });

        await existingAlert.save();

        return res.json({ success: true, message: "Căutarea a fost actualizată.", data: existingAlert });
    } catch (error) {
        console.error("Eroare la editarea alertei:", error);
        return res.status(500).json({ success: false, message: "Eroare la actualizarea căutării." });
    }
});

// 4. DELETE: Șterge o alertă
alertsActions.delete('/api/alerts/:id', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const alertId = req.params.id;

        const deletedAlert = await savedSearches.findOneAndDelete({ _id: alertId, user_id: userId });

        if (!deletedAlert) {
            return res.status(404).json({ success: false, message: "Alerta nu a fost găsită sau a fost deja ștearsă." });
        }

        return res.json({ success: true, message: "Căutarea a fost ștearsă." });
    } catch (error) {
        console.error("Eroare la ștergerea alertei:", error);
        return res.status(500).json({ success: false, message: "Eroare la ștergerea căutării." });
    }
});

export default alertsActions;