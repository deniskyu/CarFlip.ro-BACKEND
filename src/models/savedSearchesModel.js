import mongoose from "mongoose";

const savedSearchSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true,
        index: true // Esențial pentru GET-ul rapid al alertelor per user
    },
    
    // --- CÂMP OBLIGATORIU ---
    brand: {
        id: { type: Number, required: true },
        name: { type: String, required: true },
        logo: { type: String } 
    },

    // --- CÂMPURI OPȚIONALE ---
    model: {
        id: { type: Number },
        name: { type: String }
    },

    // 🔥 CÂMPURI NOI PENTRU MOTORIZARE
    fuel_type: { type: String },
    engine_capacity: { type: String },

    min_price: { type: Number },
    max_price: { type: Number },
    
    min_year: { type: Number },
    max_year: { type: Number },
    
    min_km: { type: Number },
    max_km: { type: Number },

    county: { type: String },
    city: { type: String },

    body_type: { type: String },
    transmission: { type: String },
    pollution_standard: { type: String },
    registration_status: { type: String }, // Ex: 'registered' / 'unregistered'
    
    steering_wheel: { type: String, enum: ['left', 'right'] }, // Pentru strictness
    for_dismante: { type: Boolean }

}, { 
    timestamps: true,
    collection: 'saved_searches'
});

// Index pentru "reverse query" (să găsim rapid alertele când se postează o mașină de acest brand)
savedSearchSchema.index({ "brand.id": 1 });

const savedSearches = mongoose.models.saved_searches || mongoose.model("saved_searches", savedSearchSchema);

export default savedSearches;