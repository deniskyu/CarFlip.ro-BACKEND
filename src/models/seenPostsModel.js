import mongoose from 'mongoose';

const seenPostSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true
    },
    sale_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'sales',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 7776000,
    }
});

seenPostSchema.index({ user_id: 1, sale_id: 1 }, { unique: true });

const SeenPost = mongoose.model('SeenPost', seenPostSchema);

export default SeenPost;