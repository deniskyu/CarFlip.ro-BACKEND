import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    // 1. Destinatarul (Cine primește notificarea)
    user_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'users', 
        required: true,
        index: true // 🔥 BULLETPROOF: Fără acest index, la 1 milion de notificări, căutarea ar bloca serverul. Cu el, e instantanee.
    },

    // 2. Tipul notificării (Strict controlat)
    type: { 
        type: String, 
        required: true,
        enum: ['NEW_COMMENT', 'NEW_REPLY', 'SAVED_SEARCH_MATCH', 'SYSTEM_ALERT', 'NEW_MESSAGE', 'LIKE_MILESTONE']
    },

    // 3. Conținutul vizual
    title: { 
        type: String, 
        required: true 
    },
    body: { 
        type: String, 
        required: true 
    },

    // 4. Expeditorul (Cine a declanșat acțiunea - opțional)
    sender_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'users', 
        default: null 
    },
    sender_name: {
        type: String,
        default: null
    },
    sender_image: {
        type: String,
        default: null
    },

    // 5. Datele de Navigare (Exact ca în payload-ul de la FCM)
    sale_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'sales', 
        default: null 
    },
    comment_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'comments', 
        default: null 
    },

    // 6. Statusul notificării
    is_read: { 
        type: Boolean, 
        default: false 
    }
}, { 
    timestamps: true 
});

// 🔥 BULLETPROOF: TTL Index (Time-To-Live)
// MongoDB va scana automat în fundal (fără să consume resurse din API) și va șterge orice notificare mai veche de 30 de zile.
// Asta previne transformarea bazei tale de date într-un "cimitir" de date inutile.
// 30 zile * 24 ore * 60 min * 60 sec = 2592000 secunde
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });
notificationSchema.index({ user_id: 1, is_read: 1 });

const Notifications = mongoose.model('notifications', notificationSchema);

export default Notifications;