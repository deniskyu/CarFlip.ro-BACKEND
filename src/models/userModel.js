import mongoose from "mongoose";

// 1. Definim o sub-schemă pentru Sesiune (Refresh + FCM)
const sessionSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true
    },
    fcmToken: {
        type: String,
        default: null 
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false }); 

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
    },

    googleId: {
        type: String,
    },
    appleId: { type: String },
    
    appleRefreshToken: { type: String, default: null },

    refreshTokens: {
        type: [sessionSchema], 
        default: [],
    },

    // ==========================================
    // CÂMPURI NOI PENTRU OTP (ÎNREGISTRARE)
    // ==========================================
    isVerified: {
        type: Boolean,
        default: false, // La înregistrare, contul este creat dar neverificat
    },
    verificationCode: {
        type: String,
        default: null, // Aici vom salva codul OTP de 6 cifre (hash-uit)
    },
    verificationExpires: {
        type: Date,
        default: null, // Momentul la care expiră codul de creare cont (ex: 15 min)
    },

    // ==========================================
    // CÂMPURI NOI PENTRU OTP (RESETARE PAROLĂ)
    // ==========================================
    resetPasswordOtp: {
        type: String,
        default: null, // Aici vom salva codul OTP pentru parola uitată
    },
    resetPasswordExpires: {
        type: Date,
        default: null, // Momentul la care expiră codul de resetare
    },

    // --- ICONIȚA / AVATARUL ---
    icon: {
        type: String,
        default: "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
    },
    metaData:{
        type: Object,
        default: {}
    },

    blocking: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users'
    }],

    blocked_by: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users'
    }],

    rating: {
        type: Object,
        default: null,
    },

    isBanned: {
        type: Boolean,
        default: false,
    }

}, { 
    minimize: false, 
    timestamps: true 
});
userSchema.index({ "refreshTokens.token": 1 });
userSchema.index(
    { googleId: 1 },
    { unique: true, partialFilterExpression: { googleId: { $type: "string" } } }
);
userSchema.index({ appleId: 1 }, { unique: true, partialFilterExpression: { appleId: { $type: "string" } } });

const users = mongoose.models.users || mongoose.model("users", userSchema);
export default users;