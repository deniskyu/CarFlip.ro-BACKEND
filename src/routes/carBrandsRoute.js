import { Router } from 'express';
import BrandsModel from '../models/brandsModel.js';
import AutomobilesModel from '../models/automobilesModel.js'; 
import { fetchLimiter } from './usersRoute.js';

const carBrandsRoute = Router();

carBrandsRoute.get('/api/brands', 
    fetchLimiter,
    async (req, res) => {
        try {
            const brandsList = await BrandsModel.find({})
                .select('id name logo')
                .sort({ name: 1 });

            return res.json({
                success: true, 
                message: "Successfully fetched brands", 
                brands: brandsList
            });
        } catch(er) {
            return res.json({
                success: false, 
                message: "Could not fetch brands"
            });
        }
    }
);

carBrandsRoute.get('/api/automobiles',
    fetchLimiter,
    async (req, res) => {
        try{
            const { brand_id } = req.query;

            if(!brand_id)
                return res.json({
                    success: false, 
                    message: "No brand ID provided"
                });

            const findModels = await AutomobilesModel.find({ brand_id: brand_id }).sort({ name: 1 });

            return res.json({
                success: true,
                message: "Fetched the models",
                carModels: findModels,
            });
        } catch(er){
            return res.json({
                success: false, 
                message: "Server error fetching models"
            });
        }
    }
);


export default carBrandsRoute;