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
        enum: ['text', 'image', 'sale_link'],
        default: 'text'
    },
    last_message_at: {
        type: Date,
        default: Date.now
    },
    unread_counts: {
        type: Map,
        of: Number,
        default: () => ({})
    },
    deleted_by: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users'
    }]
}, { timestamps: true });

conversationSchema.index({ participants: 1, last_message_at: -1 });
conversationSchema.index({ participants: 1, deleted_by: 1 });
conversationSchema.index({ last_message_at: -1 });

const Conversation = mongoose.models.conversations ||
    mongoose.model('conversations', conversationSchema);

export default Conversation;
