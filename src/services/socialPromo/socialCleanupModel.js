import mongoose from "mongoose";

const socialCleanupSchema = new mongoose.Schema({
    zernio_post_id: { type: String, required: true },
    platform: { type: String, enum: ['facebook'], required: true },
    sale_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    attempts: { type: Number, default: 0 },
    last_error: { type: String, default: null },
    next_attempt_at: { type: Date, default: Date.now },
}, {
    timestamps: true,
    collection: 'socialcleanups'
});

socialCleanupSchema.index({ next_attempt_at: 1 });
socialCleanupSchema.index({ zernio_post_id: 1 }, { unique: true });

const SocialCleanup = mongoose.models.socialcleanups || mongoose.model("socialcleanups", socialCleanupSchema);
export default SocialCleanup;
