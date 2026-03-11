import mongoose from "mongoose";

const brandSchema = new mongoose.Schema({
    id: {
        type: Number,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    logo: {
        type: String,
        required: false
    }
}, { 
    collection: 'brands',
    versionKey: false 
});

const brands = mongoose.models.brands || mongoose.model("brands", brandSchema);

export default brands;