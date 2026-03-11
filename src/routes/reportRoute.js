import { Router } from 'express';
import { authUser, fetchLimiter } from './usersRoute.js'; // Ajustează calea dacă e diferită
import Reports from '../models/reportModel.js';
import users from '../models/userModel.js'; // <--- AM ADĂUGAT IMPORTUL ASTA

const reportRoute = Router();

reportRoute.post('/api/report', authUser, fetchLimiter, async (req, res) => {
    try {
        const { target_id, target_type, reason } = req.body;
        const reporter_id = req.user.id;

        if (!target_id || !target_type || !reason) {
            return res.status(400).json({ success: false, message: "Date incomplete." });
        }

        if (!['post', 'comment', 'profile', 'message'].includes(target_type)) {
            return res.status(400).json({ success: false, message: "Tip raport invalid." });
        }

        // Verificăm dacă userul a mai dat report la acest item recent (opțional, anti-spam)
        const existingReport = await Reports.findOne({
            reporter_id,
            target_id,
            target_type
        });

        if (existingReport) {
            return res.json({ success: true, message: "Ai raportat deja acest element." });
        }

        const newReport = new Reports({
            reporter_id,
            target_id,
            target_type,
            reason
        });

        await newReport.save();

        return res.json({ success: true, message: "Raport trimis cu succes." });

    } catch (error) {
        console.error("Report Error:", error);
        return res.status(500).json({ success: false, message: "Eroare server." });
    }
});

reportRoute.post('/api/block', authUser, fetchLimiter, async (req, res) => {
    try {
        const { target_id } = req.body; // ID-ul userului pe care vrei să-l blochezi
        const my_id = req.user.id;      // ID-ul tău

        if (!target_id) {
            return res.status(400).json({ success: false, message: "Lipseste ID-ul utilizatorului." });
        }

        if (target_id === my_id) {
            return res.status(400).json({ success: false, message: "Nu te poți bloca singur." });
        }

        // Folosim $addToSet pentru a evita duplicatele (dacă apeși block de 2 ori)
        
        // 1. Îl adăugăm pe El în lista ta de "blocking"
        await users.findByIdAndUpdate(my_id, {
            $addToSet: { blocking: target_id }
        });

        // 2. Te adăugăm pe Tine în lista lui de "blocked_by"
        await users.findByIdAndUpdate(target_id, {
            $addToSet: { blocked_by: my_id }
        });

        return res.json({ success: true, message: "Utilizator blocat." });

    } catch (error) {
        console.error("Block Error:", error);
        return res.status(500).json({ success: false, message: "Eroare la blocare." });
    }
});

// --- ENDPOINT UNBLOCK USER ---
reportRoute.post('/api/unblock', authUser, fetchLimiter, async (req, res) => {
    try {
        const { target_id } = req.body;
        const my_id = req.user.id;

        if (!target_id) {
            return res.status(400).json({ success: false, message: "Lipseste ID-ul utilizatorului." });
        }

        // Folosim $pull pentru a scoate ID-urile din liste

        // 1. Îl scoatem pe El din lista ta de "blocking"
        await users.findByIdAndUpdate(my_id, {
            $pull: { blocking: target_id }
        });

        // 2. Te scoatem pe Tine din lista lui de "blocked_by"
        await users.findByIdAndUpdate(target_id, {
            $pull: { blocked_by: my_id }
        });

        return res.json({ success: true, message: "Utilizator deblocat." });

    } catch (error) {
        console.error("Unblock Error:", error);
        return res.status(500).json({ success: false, message: "Eroare la deblocare." });
    }
});

export default reportRoute;