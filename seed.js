import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://deniskyu:dess26dessdb@cluster0.oi7muhp.mongodb.net/CarFlip?appName=Cluster0';

const userId = new mongoose.Types.ObjectId('69b21511ca7f86225b1f2751');
const userName = 'deniskyu';
const userImage = 'https://media.car-flip.com/1773342100629-899570606.jpg';

const mediaPool = [
    { url: 'https://media.car-flip.com/processed_1773278575097_217770820.jpg', type: 'image', public_id: 'seed_img_1', zoom_level: 1 },
    { url: 'https://media.car-flip.com/processed_1773278575401_770122209.jpg', type: 'image', public_id: 'seed_img_2', zoom_level: 1 },
    { url: 'https://media.car-flip.com/processed_1773278575684_964497277.jpg', type: 'image', public_id: 'seed_img_3', zoom_level: 1 },
    { url: 'https://media.car-flip.com/processed_1773278576023_916840403.jpg', type: 'image', public_id: 'seed_img_4', zoom_level: 1 },
    { url: 'https://pub-4e542a271dec44a5aa784d3b0b65d47f.r2.dev/processed_1773278635411_213782607.jpg', type: 'image', public_id: 'seed_img_5', zoom_level: 1 },
    { url: 'https://media.car-flip.com/processed_1773278636112_745491429.jpg', type: 'image', public_id: 'seed_img_6', zoom_level: 1 },
    { url: 'https://media.car-flip.com/processed_1773278636772_555187132.mp4', type: 'video', public_id: 'seed_vid_1', zoom_level: 1 },
    { url: 'https://media.car-flip.com/processed_1773279239110_905221769.jpg', type: 'image', public_id: 'seed_img_7', zoom_level: 1 },
];

const models = [
    { id: 1, name: 'Seria 3' }, { id: 2, name: 'Seria 5' }, { id: 3, name: 'Seria 7' },
    { id: 4, name: 'X1' }, { id: 5, name: 'X3' }, { id: 6, name: 'X5' },
    { id: 7, name: 'X6' }, { id: 8, name: 'Seria 1' }, { id: 9, name: 'Seria 4' },
    { id: 10, name: 'M3' }
];

const fuels = ['Benzină', 'Motorină', 'Hibrid', 'GPL', 'Electric'];
const bodies = ['Sedan', 'SUV', 'Hatchback', 'Break (Combi)', 'Coupe'];
const colors = ['Negru', 'Alb', 'Gri', 'Argintiu', 'Albastru', 'Roșu'];
const transmissions = ['Manuală', 'Automată'];
const drivetrains = ['fwd', 'rwd', 'awd'];
const pollutions = ['Euro 4', 'Euro 5', 'Euro 6'];
const counties = ['București', 'Cluj', 'Timiș', 'Iași', 'Constanța', 'Dolj', 'Brașov'];
const cities = ['București', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Constanța', 'Craiova', 'Brașov'];
const capacities = ['1.4 L', '1.6 L', '1.8 L', '2.0 L', '2.5 L', '3.0 L'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function seed() {
    await mongoose.connect(MONGO_URI);
    console.log('Conectat la MongoDB');

    const salesCol = mongoose.connection.collection('sales');
    const now = new Date();
    const threeMonths = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(threeMonths.getTime() + 10 * 24 * 60 * 60 * 1000);

    const docs = [];

    for (let i = 1; i <= 300; i++) {
        const modelIdx = i % models.length;
        const locIdx = i % counties.length;

        const numMedia = randInt(3, 6);
        const saleMedia = [];
        const shuffled = [...mediaPool].sort(() => Math.random() - 0.5);
        for (let m = 0; m < numMedia && m < shuffled.length; m++) {
            saleMedia.push({ ...shuffled[m], public_id: `seed_${i}_${m}` });
        }

        const createdAt = new Date(now.getTime() + i * 100);

        docs.push({
            user_id: userId,
            user_name: userName,
            user_image: userImage,
            brand: { id: 1, name: 'BMW' },
            model: models[modelIdx],
            engine: { capacity: pick(capacities), fuel_type: pick(fuels) },
            price: randInt(2000, 85000),
            negotiable: Math.random() > 0.5,
            mileage: randInt(5000, 350000),
            production_year: randInt(2005, 2025),
            vin: '',
            body_type: pick(bodies),
            color: pick(colors),
            transmission: pick(transmissions),
            drivetrain: pick(drivetrains),
            pollution_standard: pick(pollutions),
            steering_wheel: Math.random() > 0.9 ? 'right' : 'left',
            location: { county: counties[locIdx], city: cities[locIdx] },
            registration_status: Math.random() > 0.2 ? 'registered' : 'unregistered',
            exchange_accepted: Math.random() > 0.7,
            for_dismante: false,
            phone_number: '07' + String(randInt(10000000, 99999999)),
            description: `Anunț test #${i}. Mașină în stare bună, ITP valabil, carte service. Preț negociabil la fața locului.`,
            media: saleMedia,
            likes_count: i,
            liked_by: [],
            allow_comments: true,
            comments_count: 0,
            is_active: true,
            is_promoted: false,
            views: randInt(0, 500),
            status: 'active',
            paid_until: threeMonths,
            expires_at: expiresAt,
            stripe_subscription_id: null,
            createdAt: createdAt,
            updatedAt: createdAt
        });
    }

    const result = await salesCol.insertMany(docs, { ordered: true });
    console.log(`Inserate ${result.insertedCount} anunturi BMW pentru ${userName}.`);

    await mongoose.disconnect();
    console.log('Seed complet.');
}

seed().catch(err => {
    console.error('Eroare seed:', err);
    process.exit(1);
});