import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true
    }],
    last_message: {
        type: String,
        default: null
    },
    last_message_type: {
        type: String,
        enum: ['text', 'image'],
        default: 'text'
    },
    last_message_at: {
        type: Date,
        default: Date.now
    },
    // Unread count separat per participant
    unread_counts: {
        type: Map,
        of: Number,
        default: {}
    },
    // Dacă un participant șterge conversația, o ascundem doar pentru el
    deleted_by: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users'
    }]
}, { timestamps: true });

// Index pentru a găsi rapid conversația dintre 2 useri
conversationSchema.index({ participants: 1 });
conversationSchema.index({ last_message_at: -1 });

const Conversation = mongoose.models.conversations || 
    mongoose.model('conversations', conversationSchema);

export default Conversation;