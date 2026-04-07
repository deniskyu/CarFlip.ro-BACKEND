import mongoose from "mongoose";

const reportSchema = new mongoose.Schema({
    reporter_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true
    },
    target_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        // Nu punem 'ref' fix pentru că poate fi post, comment sau user
    },
    target_type: {
        type: String,
        enum: ['post', 'comment', 'profile', 'message'],
        required: true
    },
    reason: {
        type: String,
        required: true,
        maxLength: 500
    },
    status: {
        type: String,
        default: "pending",
    }
}, { 
    timestamps: true 
});

// TTL Index: Documentele se vor șterge automat după 2 luni (60 zile)
reportSchema.index({ createdAt: 1 }, { expireAfterSeconds: 5184000 });

const Reports = mongoose.models.Reports || mongoose.model("Reports", reportSchema);

export default Reports;