import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    conversation_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'conversations',
        required: true
    },
    sender_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true
    },
    type: {
        type: String,
        enum: ['text', 'image'],
        default: 'text'
    },
    text: {
        type: String,
        default: null
    },
    image_url: {
        type: String,
        default: null
    },
    image_public_id: {
        type: String,
        default: null  // Pentru ștergerea din R2
    },
    is_read: {
        type: Boolean,
        default: false
    },
    is_deleted: { type: Boolean, default: false },
    // TTL index — MongoDB șterge automat documentul după 30 zile
    expires_at: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000)
    }
}, { timestamps: true });

// TTL index — MongoDB rulează un job intern la fiecare 60 secunde
// și șterge automat documentele unde expires_at a trecut
messageSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

// Indexuri pentru performanță
messageSchema.index({ conversation_id: 1, createdAt: -1 });
messageSchema.index({ sender_id: 1 });

const Message = mongoose.models.messages || 
    mongoose.model('messages', messageSchema);

export default Message;