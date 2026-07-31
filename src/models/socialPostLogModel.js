import mongoose from "mongoose";

const socialPostLogSchema = new mongoose.Schema({
    platform: { type: String, enum: ['facebook', 'tiktok'], required: true },
    posted_at: { type: Date, required: true, default: Date.now },
    sale_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    zernio_post_id: { type: String, default: null },
}, {
    timestamps: false,
    collection: 'socialpostlogs'
});

socialPostLogSchema.index({ platform: 1, posted_at: -1 });
socialPostLogSchema.index({ posted_at: 1 }, { expireAfterSeconds: 604800 });

const SocialPostLog = mongoose.models.socialpostlogs || mongoose.model("socialpostlogs", socialPostLogSchema);
export default SocialPostLog;
