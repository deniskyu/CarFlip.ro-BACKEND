// ============================================================================
//  src/utils/reservedSubdomains.js
// ----------------------------------------------------------------------------
//  Gardul care împiedică un client să-și ia un subdomeniu care ar sparge
//  infrastructura proprie.
//
//  Scenariul concret de evitat: un dealer pe nume "API Auto" cere subdomeniul
//  "api" → api.car-flip.com începe să randeze un site de mașini în loc de
//  backend, iar aplicația mobilă moare instant pentru toată lumea.
//
//  Lista e generoasă intenționat. Costul unui subdomeniu blocat degeaba e zero
//  (îi dai clientului altă variantă); costul unuia lăsat liber din greșeală
//  poate fi o pană de producție.
// ============================================================================

export const RESERVED_SUBDOMAINS = new Set([
    // Infrastructura proprie — cele critice
    'api', 'admin', 'app', 'apps', 'www', 'media', 'cdn', 'static', 'assets',
    'img', 'images', 'files', 'upload', 'uploads', 'storage', 'r2',

    // Email și DNS
    'mail', 'email', 'webmail', 'smtp', 'imap', 'pop', 'pop3', 'mx', 'mx1', 'mx2',
    'ns', 'ns1', 'ns2', 'ns3', 'dns', 'autodiscover', 'autoconfig',
    'dkim', 'spf', 'dmarc', '_domainkey',

    // Medii de lucru
    'dev', 'test', 'testing', 'staging', 'stage', 'demo', 'preview', 'beta',
    'alpha', 'sandbox', 'local', 'localhost', 'tmp', 'temp',

    // Panouri și acces
    'panel', 'cpanel', 'whm', 'phpmyadmin', 'webdisk', 'dashboard', 'console',
    'auth', 'login', 'logout', 'signin', 'signup', 'register', 'account',
    'accounts', 'user', 'users', 'profile', 'secure', 'ssl', 'vpn', 'ssh',
    'ftp', 'sftp', 'proxy', 'gateway', 'router', 'root', 'system', 'internal',
    'private', 'public',

    // Servicii și operare
    'status', 'health', 'monitor', 'monitoring', 'metrics', 'logs', 'grafana',
    'cache', 'redis', 'mongo', 'db', 'database', 'backup', 'backups',
    'git', 'gitlab', 'github', 'ci', 'cd', 'deploy', 'jenkins', 'webhook',
    'webhooks', 'socket', 'ws', 'wss',

    // Conținut și pagini generice
    'blog', 'news', 'press', 'help', 'support', 'docs', 'doc', 'faq',
    'about', 'contact', 'terms', 'privacy', 'legal', 'gdpr', 'cookies',
    'search', 'feed', 'rss', 'sitemap', 'robots', 'well-known',

    // Comercial
    'shop', 'store', 'pay', 'payment', 'payments', 'checkout', 'billing',
    'invoice', 'pricing', 'partner', 'partners', 'affiliate',

    // Brand propriu — nu vrem ca un client să pară că e CarFlip oficial
    'carflip', 'car-flip', 'carflipro', 'oficial', 'official',

    // Furnizori (ca să nu pară phishing găzduit de tine)
    'google', 'facebook', 'tiktok', 'instagram', 'whatsapp', 'stripe',
    'cloudflare', 'zernio', 'apple', 'microsoft', 'olx', 'autovit',

    // Scurte / generice care merită păstrate pentru redirecturi
    'm', 'mobile', 'wap', 'go', 'l', 'link', 'links', 's', 'r', 'e', 'w',
]);

export const isReservedSubdomain = (value) =>
    RESERVED_SUBDOMAINS.has(String(value || '').trim().toLowerCase());

export const MIN_SUBDOMAIN_LENGTH = 3;
export const MAX_SUBDOMAIN_LENGTH = 30;

/**
 * Validează și normalizează un subdomeniu.
 *
 * @param {string} raw
 * @returns {{ valid: boolean, value?: string, error?: string }}
 *
 * Mesajele de eroare sunt în română pentru că ajung direct în interfața ta de
 * admin, sub câmpul de input.
 */
export const validateSubdomain = (raw) => {
    if (typeof raw !== 'string' || !raw.trim()) {
        return { valid: false, error: 'Subdomeniul este obligatoriu.' };
    }

    const value = raw.trim().toLowerCase();

    if (value.length < MIN_SUBDOMAIN_LENGTH) {
        return { valid: false, error: `Minim ${MIN_SUBDOMAIN_LENGTH} caractere.` };
    }
    if (value.length > MAX_SUBDOMAIN_LENGTH) {
        return { valid: false, error: `Maxim ${MAX_SUBDOMAIN_LENGTH} de caractere.` };
    }
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(value)) {
        return {
            valid: false,
            error: 'Doar litere mici, cifre și cratime. Nu poate începe sau se termina cu cratimă.',
        };
    }
    if (value.includes('--')) {
        return { valid: false, error: 'Nu sunt permise două cratime consecutive.' };
    }
    // Prefixul punycode — ar putea produce afișări înșelătoare în bara de adrese.
    if (value.startsWith('xn--')) {
        return { valid: false, error: 'Prefix nepermis.' };
    }
    if (/^\d+$/.test(value)) {
        return { valid: false, error: 'Subdomeniul nu poate fi format doar din cifre.' };
    }
    if (isReservedSubdomain(value)) {
        return { valid: false, error: 'Acest subdomeniu este rezervat. Alege altul.' };
    }

    return { valid: true, value };
};

export default { RESERVED_SUBDOMAINS, isReservedSubdomain, validateSubdomain };
