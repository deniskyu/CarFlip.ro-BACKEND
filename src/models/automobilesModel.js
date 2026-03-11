import mongoose from "mongoose";

const carModelSchema = new mongoose.Schema({
    id: {
        type: Number,
        required: true,
        unique: true
    },
    brand_id: {
        type: Number,
        required: true
    },
    name: {
        type: String,
        required: true
    }
}, { 
    collection: 'automobiles',
    versionKey: false 
});

const automobiles = mongoose.models.automobiles || mongoose.model("automobiles", carModelSchema);

export default automobiles;