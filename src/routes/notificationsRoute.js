import { Router } from 'express';
import Notifications from '../models/notificationModel.js';
import { authUser, fetchLimiter } from './usersRoute.js'; 
import mongoose from 'mongoose';

const notificationsRoute = Router();

// ==========================================
// 1. GET: Extragerea Notificărilor (Paginat)
// ==========================================
notificationsRoute.get('/api/notifications', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Paginare bulletproof (fallback la valori sigure dacă frontend-ul trimite ceva dubios)
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.max(1, parseInt(req.query.limit) || 20);
        const skip = (page - 1) * limit;

        // Căutăm DOAR notificările utilizatorului logat
        const query = { user_id: userId };

        // Executăm în paralel extragerea notificărilor și numărătoarea totală (pentru hasMore)
        const [notifications, totalCount] = await Promise.all([
            Notifications.find(query)
                .sort({ createdAt: -1 }) // Cele mai noi primele
                .skip(skip)
                .limit(limit)
                .lean(), // lean() face query-ul mult mai rapid eliminând overhead-ul de Mongoose Object
            
            Notifications.countDocuments(query)
        ]);

        const hasMore = totalCount > (page * limit);

        return res.json({ 
            success: true, 
            data: notifications,
            hasMore,
            page
        });

    } catch (error) {
        console.error("❌ Eroare GET /api/notifications:", error);
        return res.status(500).json({ success: false, message: "Eroare la obținerea notificărilor." });
    }
});


// ==========================================
// 2. GET: Badge-ul Roșu (Câte sunt necitite)
// ==========================================
// Folosim această rută "ușoară" de fiecare dată când aplicația se deschide, doar ca să știm ce număr afișăm pe Tab Bar
notificationsRoute.get('/api/notifications/unread-count', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;

        const unreadCount = await Notifications.countDocuments({ 
            user_id: userId, 
            is_read: false 
        });

        return res.json({ 
            success: true, 
            unreadCount 
        });

    } catch (error) {
        console.error("❌ Eroare GET unread-count:", error);
        return res.status(500).json({ success: false, message: "Eroare la numărarea notificărilor necitite." });
    }
});


// ==========================================
// 3. PUT: Marchează ca Citit (O notificare sau TOATE)
// ==========================================
notificationsRoute.put('/api/notifications/:id/read', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const notificationId = req.params.id;

        // FEATURE BONUS: Dacă Frontend-ul trimite ID-ul "all", le marcăm pe toate ca citite
        if (notificationId === 'all') {
            await Notifications.updateMany(
                { user_id: userId, is_read: false },
                { $set: { is_read: true } }
            );
            return res.json({ success: true, message: "Toate notificările au fost marcate ca citite." });
        }

        // Validare de siguranță: Ne asigurăm că ID-ul trimis este un ObjectId valid Mongoose.
        // Fără asta, un ID de tip '123' trimis din greșeală ar da crash serverului la execuție.
        if (!mongoose.Types.ObjectId.isValid(notificationId)) {
            return res.status(400).json({ success: false, message: "ID-ul notificării este invalid." });
        }

        // Căutăm și actualizăm strict notificarea utilizatorului (securitate: nu poți citi notificarea altuia)
        const updatedNotification = await Notifications.findOneAndUpdate(
            { _id: notificationId, user_id: userId },
            { $set: { is_read: true } },
            { new: true } // Returnează documentul actualizat
        );

        if (!updatedNotification) {
            return res.status(404).json({ success: false, message: "Notificarea nu a fost găsită." });
        }

        return res.json({ success: true, data: updatedNotification });

    } catch (error) {
        console.error("❌ Eroare PUT mark-read:", error);
        return res.status(500).json({ success: false, message: "Eroare la actualizarea notificării." });
    }
});

export default notificationsRoute;