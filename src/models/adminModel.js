import mongoose from "mongoose";

const adminSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
}, { timestamps: true, collection: 'admins' });

const admins = mongoose.models.admins || mongoose.model("admins", adminSchema);
export default admins;