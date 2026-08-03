import mongoose from 'mongoose';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000;

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
        enum: ['text', 'image', 'sale_link'],
        default: 'text'
    },
    sale_preview: {
        sale_id: { type: mongoose.Schema.Types.ObjectId, ref: 'sales' },
        image_url: { type: String },
        title: { type: String },
        price: { type: Number }
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
        default: null
    },
    is_read: {
        type: Boolean,
        default: false
    },
    is_deleted: {
        type: Boolean,
        default: false
    },
    expires_at: {
        type: Date,
        default: () => new Date(Date.now() + RETENTION_MS)
    }
}, { timestamps: true });

messageSchema.index({ conversation_id: 1, _id: -1 });
messageSchema.index({ conversation_id: 1, createdAt: -1 });
messageSchema.index({ conversation_id: 1, sender_id: 1, is_read: 1 });
messageSchema.index({ sender_id: 1 });
messageSchema.index({ expires_at: 1 });
messageSchema.index({ expires_at: 1, type: 1, image_public_id: 1 });

const Message = mongoose.models.messages ||
    mongoose.model('messages', messageSchema);

export default Message;
