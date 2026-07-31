import dotenv from 'dotenv';
dotenv.config();

const ZERNIO_BASE = 'https://zernio.com/api/v1';
const REQUEST_TIMEOUT_MS = 60000;

export const SOCIAL_ENABLED = String(process.env.SOCIAL_PROMO_ENABLED) === 'true';

const API_KEY = process.env.ZERNIO_API_KEY || null;
export const FB_ACCOUNT_ID = process.env.ZERNIO_FB_ACCOUNT_ID || null;
export const TT_ACCOUNT_ID = process.env.ZERNIO_TT_ACCOUNT_ID || null;
const FB_PAGE_ID = process.env.ZERNIO_FB_PAGE_ID || null;

// Coduri HTTP care înseamnă "încearcă mai târziu", nu "conținutul e greșit".
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 507, 522, 524]);

export const isConfigured = (platform) => {
    if (!SOCIAL_ENABLED || !API_KEY) return false;
    if (platform === 'facebook') return !!FB_ACCOUNT_ID;
    if (platform === 'tiktok') return !!TT_ACCOUNT_ID;
    return false;
};

const request = async (method, path, body = null) => {
    if (!API_KEY) {
        const e = new Error('ZERNIO_NOT_CONFIGURED: lipsește ZERNIO_API_KEY');
        e.retryable = false;
        throw e;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const res = await fetch(`${ZERNIO_BASE}${path}`, {
            method,
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });

        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }

        if (!res.ok) {
            const msg = json?.error || json?.message || text || `HTTP ${res.status}`;
            const err = new Error(`ZERNIO_${res.status}: ${String(msg).slice(0, 300)}`);
            err.status = res.status;
            err.retryable = RETRYABLE_STATUS.has(res.status);
            throw err;
        }

        return json;
    } catch (err) {
        // Timeout: cererea poate să fi ajuns la platformă. Nu e sigur nici că a
        // reușit, nici că a eșuat — marcat separat, ca apelantul să NU reia orb.
        if (err.name === 'AbortError') {
            const e = new Error(`ZERNIO_TIMEOUT: ${method} ${path} a depășit ${REQUEST_TIMEOUT_MS}ms`);
            e.timeout = true;
            e.retryable = true;
            throw e;
        }
        // Eroare de rețea (fetch a aruncat înainte de a primi un status).
        if (err.status === undefined && err.retryable === undefined) {
            err.retryable = true;
            err.network = true;
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
};

export const postToFacebook = async ({ imageUrls, caption, firstComment }) => {
    const platformEntry = {
        platform: 'facebook',
        accountId: FB_ACCOUNT_ID,
        platformSpecificData: {},
    };
    if (FB_PAGE_ID) platformEntry.platformSpecificData.pageId = FB_PAGE_ID;
    if (firstComment) platformEntry.platformSpecificData.firstComment = firstComment;

    const body = {
        content: caption,
        mediaItems: imageUrls.map(url => ({ type: 'image', url })),
        platforms: [platformEntry],
        publishNow: true,
    };

    const data = await request('POST', '/posts', body);
    const postId = data?.post?._id || data?.post?.id || null;
    if (!postId) {
        const e = new Error('ZERNIO_NO_POST_ID: răspuns fără post._id (Facebook)');
        e.retryable = false;
        throw e;
    }
    return postId;
};

export const postToTikTok = async ({ imageUrls, title, description }) => {
    const body = {
        content: title,
        mediaItems: imageUrls.map(url => ({ type: 'image', url })),
        platforms: [
            { platform: 'tiktok', accountId: TT_ACCOUNT_ID },
        ],
        tiktokSettings: {
            privacy_level: 'PUBLIC_TO_EVERYONE',
            allow_comment: true,
            media_type: 'photo',
            photo_cover_index: 0,
            description,
            auto_add_music: false,
            commercialContentType: 'brand_organic',
            content_preview_confirmed: true,
            express_consent_given: true,
        },
        publishNow: true,
    };

    const data = await request('POST', '/posts', body);
    const postId = data?.post?._id || data?.post?.id || null;
    if (!postId) {
        const e = new Error('ZERNIO_NO_POST_ID: răspuns fără post._id (TikTok)');
        e.retryable = false;
        throw e;
    }
    return postId;
};

export const unpublishPost = async (zernioPostId, platform) => {
    return request('POST', `/posts/${zernioPostId}/unpublish`, { platform });
};

export const getTikTokCreatorInfo = async () => {
    if (!TT_ACCOUNT_ID) throw new Error('ZERNIO_NOT_CONFIGURED: lipsește ZERNIO_TT_ACCOUNT_ID');
    return request('GET', `/accounts/${TT_ACCOUNT_ID}/tiktok/creator-info?mediaType=photo`);
};
