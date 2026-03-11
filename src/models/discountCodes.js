import mongoose from "mongoose";

const discountSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    percentage_off: { type: Number, required: true, min: 1, max: 100 },
    is_active: { type: Boolean, default: true },
    current_uses: { type: Number, default: 0 }
}, { 
    timestamps: true,
    collection: 'discountCodes' 
});

const discountCodes = mongoose.models.discountCodes || mongoose.model("discountCodes", discountSchema);

export default discountCodes;