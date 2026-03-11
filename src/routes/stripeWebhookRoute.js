import { Router } from 'express';
import Stripe from 'stripe';
import sales from '../models/salesModel.js';
import { addMonths, addDays } from 'date-fns';
import { triggerSearchAlerts } from './searchAlertsRoute.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const stripeWebhookRoute = Router();

const getSafeDates = (subscription) => {
    let paidUntilDate;
    if (subscription && subscription.current_period_end) {
        paidUntilDate = new Date(subscription.current_period_end * 1000);
    } else {
        paidUntilDate = addMonths(new Date(), 1);
    }
    const expiresAtDate = addDays(paidUntilDate, 10);
    return { paidUntil: paidUntilDate, expiresAt: expiresAtDate };
};

stripeWebhookRoute.post('/', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        console.log(`EVENT: ${event.type}`);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        if (event.type === 'invoice.payment_succeeded') {
            const invoice = event.data.object;
            const subscriptionId = invoice.subscription || invoice.parent?.subscription_details?.subscription;

            if (subscriptionId && invoice.amount_paid > 0) {
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                const { paidUntil, expiresAt } = getSafeDates(subscription);

                // Pasul 1: Încercăm să-l activăm direct (dacă Media e gata)
                let updatedSale = await sales.findOneAndUpdate(
                    { 
                        stripe_subscription_id: subscriptionId,
                        'media.0': { $exists: true } 
                    },
                    { 
                        $set: { 
                            status: 'active', 
                            is_active: true, 
                            paid_until: paidUntil, 
                            expires_at: expiresAt 
                        } 
                    },
                    { new: true }
                );

                if (updatedSale) {
                    console.log(`✅ Plata confirmată și Media gata. Anunț ACTIVAT! (ID: ${updatedSale._id})`);
                    
                    if (invoice.billing_reason === 'subscription_create') {
                        const timeSinceCreation = Date.now() - new Date(updatedSale.createdAt).getTime();
                        const isBrandNew = timeSinceCreation < 24 * 60 * 60 * 1000;

                        if (isBrandNew && !updatedSale.alerts_sent) {
                            await sales.findByIdAndUpdate(updatedSale._id, { alerts_sent: true });
                            triggerSearchAlerts(updatedSale).catch(err => console.error("Eroare background trigger:", err));
                        }
                    }
                } else {
                    // Pasul 2: Dacă NU are media încă, îl trecem în 'media_processing'
                    updatedSale = await sales.findOneAndUpdate(
                        { 
                            stripe_subscription_id: subscriptionId,
                            'media.0': { $exists: false },
                            status: { $ne: 'active' } // 🔥 FIX 1: Ne asigurăm că workerul nu l-a activat FIX acum o milisecundă
                        },
                        { 
                            $set: { 
                                status: 'media_processing', 
                                is_active: false, 
                                paid_until: paidUntil, 
                                expires_at: expiresAt 
                            } 
                        },
                        { new: true }
                    );

                    if (updatedSale) {
                        console.log(`⏳ Plata confirmată, dar Media nu e gata. Rămâne în așteptare. (ID: ${updatedSale._id})`);
                    } else {
                        console.log(`⚠️ Eroare DB sau cursa a fost câștigată de Worker. Subscription_id: ${subscriptionId}`);
                    }
                }
            }
        }
        
        else if (event.type === 'invoice.payment_failed') {
            const invoice = event.data.object;
            const subscriptionId = invoice.subscription || invoice.parent?.subscription_details?.subscription;
            if (subscriptionId) {
                await sales.findOneAndUpdate(
                    { stripe_subscription_id: subscriptionId }, 
                    { $set: { is_active: false, status: 'grace_period' } }
                );
                console.log(`⚠️ Plată eșuată. Anunț trecut în grace period.`);
            }
        }
        
        else if (event.type === 'customer.subscription.deleted') {
            const subscription = event.data.object;
            await sales.findOneAndUpdate(
                { stripe_subscription_id: subscription.id }, 
                { $set: { is_active: false, status: 'grace_period' } }
            );
            console.log(`❌ Abonament anulat definitiv.`);
        }
        
    } catch (error) {
        console.error("Eroare la Webhook:", error);
    }

    res.json({ received: true });
});

export default stripeWebhookRoute;