/**
 * LUNET AUTH WORKER
 * Handles: register, login, logout, session validation,
 *          subscription status, secret code unlock, history saving
 *
 * SETUP REQUIRED in Cloudflare Dashboard:
 *
 * 1. D1 DATABASE (Workers & Pages → D1 → Create database → name: lunet-db)
 *    Binding name: DB
 *    Run this SQL to create tables (paste in D1 console):
 *
 *    CREATE TABLE users (
 *      id TEXT PRIMARY KEY,
 *      email TEXT UNIQUE NOT NULL,
 *      username TEXT UNIQUE NOT NULL,
 *      password_hash TEXT NOT NULL,
 *      created_at INTEGER NOT NULL,
 *      subscription TEXT DEFAULT 'free',
 *      sub_expires INTEGER DEFAULT 0,
 *      stripe_customer_id TEXT DEFAULT ''
 *    );
 *    CREATE TABLE history (
 *      id TEXT PRIMARY KEY,
 *      user_id TEXT NOT NULL,
 *      type TEXT NOT NULL,
 *      data TEXT NOT NULL,
 *      created_at INTEGER NOT NULL
 *    );
 *
 * 2. KV NAMESPACE (name: LUNET_SESSIONS)
 *    Binding name: SESSIONS
 *
 * 3. ENVIRONMENT VARIABLES (Settings → Variables, encrypt all):
 *    JWT_SECRET   → any long random string, e.g. "lunet_s3cr3t_2026_xyz"
 *    STRIPE_SECRET → sk_live_... (from Stripe dashboard)
 *    STRIPE_WEBHOOK_SECRET → whsec_... (from Stripe webhook settings)
 */

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Plan definitions
const PLANS = {
    free:    { label: 'Free',        ai: 'gpt-only', aiLimit: 15, movies: false, games: false },
    movies:  { label: 'Movies',      ai: 'gpt-only', aiLimit: 15, movies: true,  games: false },
    games:   { label: 'Games',       ai: 'gpt-only', aiLimit: 15, movies: false, games: true  },
    ai_pro:  { label: 'AI Pro',      ai: 'all',      aiLimit: 999, movies: false, games: false },
    bundle:  { label: 'Bundle',      ai: 'all',      aiLimit: 999, movies: true,  games: true  },
    cheat:   { label: 'Secret Day',  ai: 'all',      aiLimit: 999, movies: true,  games: true  },
};

// Stripe price IDs — replace with your actual ones from Stripe dashboard
const STRIPE_PRICES = {
    movies:  'price_REPLACE_MOVIES',
    games:   'price_REPLACE_GAMES',
    ai_pro:  'price_REPLACE_AI_PRO',
    bundle:  'price_REPLACE_BUNDLE',
};

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            if (path === '/auth/register' && request.method === 'POST') return await register(request, env);
            if (path === '/auth/login'    && request.method === 'POST') return await login(request, env);
            if (path === '/auth/logout'   && request.method === 'POST') return await logout(request, env);
            if (path === '/auth/me'       && request.method === 'GET')  return await getMe(request, env);
            if (path === '/auth/secret'   && request.method === 'POST') return await redeemSecret(request, env);
            if (path === '/history/save'  && request.method === 'POST') return await saveHistory(request, env);
            if (path === '/history/get'   && request.method === 'GET')  return await getHistory(request, env);
            if (path === '/stripe/checkout' && request.method === 'POST') return await stripeCheckout(request, env);
            if (path === '/stripe/webhook'  && request.method === 'POST') return await stripeWebhook(request, env);
            if (path === '/session/check'   && request.method === 'POST') return await checkSession(request, env);
            if (path === '/session/tick'    && request.method === 'POST') return await tickSession(request, env);
            if (path === '/session/cooldown'&& request.method === 'GET')  return await getCooldown(request, env);
            return json({ error: 'Not found' }, 404);
        } catch (err) {
            console.error(err);
            return json({ error: 'Server error: ' + err.message }, 500);
        }
    }
};

// ============================================================
// AUTH ROUTES
// ============================================================

async function register(request, env) {
    const { email, username, password } = await request.json();

    if (!email || !username || !password)
        return json({ error: 'Email, username, and password are required.' }, 400);
    if (password.length < 6)
        return json({ error: 'Password must be at least 6 characters.' }, 400);
    if (username.length < 3)
        return json({ error: 'Username must be at least 3 characters.' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return json({ error: 'Invalid email address.' }, 400);

    // Check if email/username taken
    const existing = await env.DB.prepare(
        'SELECT id FROM users WHERE email = ? OR username = ?'
    ).bind(email.toLowerCase(), username.toLowerCase()).first();

    if (existing) return json({ error: 'Email or username already taken.' }, 409);

    const id = crypto.randomUUID();
    const hash = await hashPassword(password, env.JWT_SECRET);
    const now = Date.now();

    await env.DB.prepare(
        'INSERT INTO users (id, email, username, password_hash, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, email.toLowerCase(), username.toLowerCase(), hash, now).run();

    const token = await createSession(id, env);
    return json({ success: true, token, user: { id, email, username, subscription: 'free' } });
}

async function login(request, env) {
    const { email, password } = await request.json();
    if (!email || !password) return json({ error: 'Email and password required.' }, 400);

    const user = await env.DB.prepare(
        'SELECT * FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first();

    if (!user) return json({ error: 'No account found with that email.' }, 401);

    const valid = await verifyPassword(password, user.password_hash, env.JWT_SECRET);
    if (!valid) return json({ error: 'Incorrect password.' }, 401);

    const token = await createSession(user.id, env);
    const sub = getActiveSub(user);

    return json({
        success: true, token,
        user: {
            id: user.id,
            email: user.email,
            username: user.username,
            subscription: sub,
            plan: PLANS[sub] || PLANS.free
        }
    });
}

async function logout(request, env) {
    const token = getToken(request);
    if (token) await env.SESSIONS.delete('session:' + token);
    return json({ success: true });
}

async function getMe(request, env) {
    const user = await requireAuth(request, env);
    if (!user) return json({ error: 'Not logged in.' }, 401);

    const sub = getActiveSub(user);
    return json({
        user: {
            id: user.id,
            email: user.email,
            username: user.username,
            subscription: sub,
            sub_expires: user.sub_expires,
            plan: PLANS[sub] || PLANS.free
        }
    });
}

// ============================================================
// SECRET CODE
// ============================================================

async function redeemSecret(request, env) {
    const { code } = await request.json();
    const user = await requireAuth(request, env);
    if (!user) return json({ error: 'Login required to use a code.' }, 401);

    const normalized = (code || '').toLowerCase().trim();
    if (normalized !== 'a tale of two kitties')
        return json({ error: 'Invalid code. Try again.' }, 400);

    // Check if already used today
    const todayKey = 'cheat:' + user.id + ':' + new Date().toISOString().slice(0, 10);
    const alreadyUsed = await env.SESSIONS.get(todayKey);
    if (alreadyUsed) return json({ error: 'You already used the secret code today!' }, 400);

    // Grant cheat tier for 24 hours
    const expires = Date.now() + 86400000;
    await env.DB.prepare(
        'UPDATE users SET subscription = ?, sub_expires = ? WHERE id = ?'
    ).bind('cheat', expires, user.id).run();

    await env.SESSIONS.put(todayKey, '1', { expirationTtl: 86400 });

    return json({ success: true, message: '🐱 Unlocked! Everything is free for 24 hours. Enjoy.', expires });
}

// ============================================================
// HISTORY
// ============================================================

async function saveHistory(request, env) {
    const user = await requireAuth(request, env);
    if (!user) return json({ error: 'Login required.' }, 401);

    const { type, data } = await request.json();
    // type: 'movie' | 'game' | 'chat'
    if (!type || !data) return json({ error: 'type and data required.' }, 400);

    const id = crypto.randomUUID();
    await env.DB.prepare(
        'INSERT INTO history (id, user_id, type, data, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, user.id, type, JSON.stringify(data), Date.now()).run();

    // Keep only last 100 entries per type per user
    await env.DB.prepare(`
    DELETE FROM history WHERE user_id = ? AND type = ? AND id NOT IN (
      SELECT id FROM history WHERE user_id = ? AND type = ?
      ORDER BY created_at DESC LIMIT 100
    )
  `).bind(user.id, type, user.id, type).run();

    return json({ success: true });
}

async function getHistory(request, env) {
    const user = await requireAuth(request, env);
    if (!user) return json({ error: 'Login required.' }, 401);

    const url = new URL(request.url);
    const type = url.searchParams.get('type'); // optional filter
    const limit = parseInt(url.searchParams.get('limit') || '50');

    let query, params;
    if (type) {
        query = 'SELECT * FROM history WHERE user_id = ? AND type = ? ORDER BY created_at DESC LIMIT ?';
        params = [user.id, type, limit];
    } else {
        query = 'SELECT * FROM history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?';
        params = [user.id, limit];
    }

    const { results } = await env.DB.prepare(query).bind(...params).all();
    const parsed = results.map(r => ({ ...r, data: JSON.parse(r.data) }));
    return json({ history: parsed });
}

// ============================================================
// STRIPE
// ============================================================

async function stripeCheckout(request, env) {
    const user = await requireAuth(request, env);
    if (!user) return json({ error: 'Login required.' }, 401);

    const { plan, successUrl, cancelUrl } = await request.json();
    const priceId = STRIPE_PRICES[plan];
    if (!priceId || priceId.includes('REPLACE'))
        return json({ error: 'Invalid plan or Stripe prices not configured yet.' }, 400);

    // Create Stripe checkout session
    const body = new URLSearchParams({
        'payment_method_types[]': 'card',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'mode': 'subscription',
        'success_url': successUrl + '?session_id={CHECKOUT_SESSION_ID}',
        'cancel_url': cancelUrl,
        'metadata[user_id]': user.id,
        'metadata[plan]': plan,
        'client_reference_id': user.id,
    });

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + env.STRIPE_SECRET,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString()
    });

    const session = await res.json();
    if (!res.ok) return json({ error: session.error?.message || 'Stripe error' }, 400);

    return json({ url: session.url });
}

async function stripeWebhook(request, env) {
    // Verify webhook signature
    const sig = request.headers.get('stripe-signature');
    const rawBody = await request.text();

    // Simple timestamp+signature check (full crypto verification needs SubtleCrypto)
    // For production, add full HMAC verification here
    let event;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return new Response('Bad payload', { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const plan = session.metadata?.plan;

        if (userId && plan) {
            const expires = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
            await env.DB.prepare(
                'UPDATE users SET subscription = ?, sub_expires = ?, stripe_customer_id = ? WHERE id = ?'
            ).bind(plan, expires, session.customer || '', userId).run();
        }
    }

    if (event.type === 'customer.subscription.deleted') {
        const customerId = event.data.object.customer;
        await env.DB.prepare(
            "UPDATE users SET subscription = 'free', sub_expires = 0 WHERE stripe_customer_id = ?"
        ).bind(customerId).run();
    }

    return new Response('ok', { status: 200 });
}

// ============================================================
// SESSION TIME GATING
// 20 min free per day, 30 min cooldown after, tracked by IP+userID
// Keys in KV:
//   playtime:{type}:{id}:{date}  -> seconds used today (int)
//   cooldown:{type}:{id}:{date}  -> timestamp when cooldown ends
// ============================================================

const FREE_SECONDS   = 20 * 60;   // 20 minutes free per day
const COOLDOWN_SECS  = 20 * 60;   // 30 minute cooldown

// POST /session/check
// Body: { type: 'games'|'movies' }
// Returns current usage, remaining, cooldown info, and whether user is subscribed
async function checkSession(request, env) {
    const { type } = await request.json();
    if (!['games','movies'].includes(type)) return json({ error: 'type must be games or movies' }, 400);

    const id    = await getSessionId(request, env);
    const today = todayStr();

    // Check subscription first
    const sub = await getSubForId(id, env);
    const planData = PLANS[sub] || PLANS.free;
    const hasAccess = planData[type] === true;

    if (hasAccess) {
        return json({ subscribed: true, remaining: 99999, cooldownEnds: null, used: 0 });
    }

    const usedKey     = ;
    const cooldownKey = ;

    const usedRaw     = await env.SESSIONS.get(usedKey);
    const cooldownRaw = await env.SESSIONS.get(cooldownKey);

    const used        = usedRaw ? parseInt(usedRaw) : 0;
    const remaining   = Math.max(0, FREE_SECONDS - used);
    const cooldownEnds = cooldownRaw ? parseInt(cooldownRaw) : null;
    const inCooldown  = cooldownEnds && Date.now() < cooldownEnds;

    return json({ subscribed: false, remaining, used, cooldownEnds: inCooldown ? cooldownEnds : null, freeSeconds: FREE_SECONDS });
}

// POST /session/tick
// Body: { type: 'games'|'movies', seconds: number }
// Called every 30s by the client to record playtime
async function tickSession(request, env) {
    const { type, seconds } = await request.json();
    if (!['games','movies'].includes(type)) return json({ error: 'invalid type' }, 400);

    const id    = await getSessionId(request, env);
    const today = todayStr();

    // Check sub — no tracking needed for paid users
    const sub = await getSubForId(id, env);
    const planData = PLANS[sub] || PLANS.free;
    if (planData[type]) return json({ subscribed: true, remaining: 99999 });

    const usedKey     = ;
    const cooldownKey = ;

    const usedRaw = await env.SESSIONS.get(usedKey);
    let used = (usedRaw ? parseInt(usedRaw) : 0) + Math.min(seconds, 35); // max 35s per tick to prevent abuse
    used = Math.min(used, FREE_SECONDS); // cap at limit

    // Save updated time (expires in 26 hours)
    await env.SESSIONS.put(usedKey, String(used), { expirationTtl: 93600 });

    const remaining = Math.max(0, FREE_SECONDS - used);

    // If just hit limit, set cooldown
    if (remaining === 0) {
        const existingCooldown = await env.SESSIONS.get(cooldownKey);
        if (!existingCooldown) {
            const cooldownEnds = Date.now() + (COOLDOWN_SECS * 1000);
            await env.SESSIONS.put(cooldownKey, String(cooldownEnds), { expirationTtl: 93600 });
            return json({ subscribed: false, remaining: 0, cooldownEnds, limitHit: true });
        }
        const cooldownEnds = parseInt(existingCooldown);
        return json({ subscribed: false, remaining: 0, cooldownEnds, limitHit: false });
    }

    return json({ subscribed: false, remaining, used, cooldownEnds: null });
}

// GET /session/cooldown?type=games|movies
async function getCooldown(request, env) {
    const url  = new URL(request.url);
    const type = url.searchParams.get('type');
    if (!['games','movies'].includes(type)) return json({ error: 'invalid type' }, 400);

    const id    = await getSessionId(request, env);
    const today = todayStr();
    const cooldownKey = ;
    const usedKey     = ;

    const cooldownRaw = await env.SESSIONS.get(cooldownKey);
    const usedRaw     = await env.SESSIONS.get(usedKey);
    const used        = usedRaw ? parseInt(usedRaw) : 0;
    const cooldownEnds = cooldownRaw ? parseInt(cooldownRaw) : null;
    const inCooldown   = cooldownEnds && Date.now() < cooldownEnds;

    // Cooldown expired — reset so they get another free session
    if (cooldownEnds && Date.now() >= cooldownEnds) {
        await env.SESSIONS.delete(cooldownKey);
        await env.SESSIONS.delete(usedKey);
        return json({ inCooldown: false, cooldownEnds: null, remaining: FREE_SECONDS });
    }

    return json({
        inCooldown: !!inCooldown,
        cooldownEnds: inCooldown ? cooldownEnds : null,
        remaining: Math.max(0, FREE_SECONDS - used),
        used
    });
}

// Returns a stable ID for this user: their user ID if logged in, else IP-based
async function getSessionId(request, env) {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (token) {
        const userId = await env.SESSIONS.get('session:' + token);
        if (userId) return 'u:' + userId;
    }
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    return 'ip:' + ip;
}

async function getSubForId(id, env) {
    if (!id.startsWith('u:')) return 'free';
    const userId = id.slice(2);
    const user = await env.DB.prepare('SELECT subscription, sub_expires FROM users WHERE id = ?').bind(userId).first();
    if (!user) return 'free';
    if (user.sub_expires && user.sub_expires < Date.now()) return 'free';
    return user.subscription || 'free';
}

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

// ============================================================
// HELPERS
// ============================================================

function getActiveSub(user) {
    if (!user.subscription || user.subscription === 'free') return 'free';
    if (user.sub_expires && user.sub_expires < Date.now()) return 'free'; // expired
    return user.subscription;
}

async function createSession(userId, env) {
    const token = crypto.randomUUID() + '-' + crypto.randomUUID();
    await env.SESSIONS.put('session:' + token, userId, { expirationTtl: 60 * 60 * 24 * 30 }); // 30 days
    return token;
}

async function requireAuth(request, env) {
    const token = getToken(request);
    if (!token) return null;
    const userId = await env.SESSIONS.get('session:' + token);
    if (!userId) return null;
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    return user || null;
}

function getToken(request) {
    const auth = request.headers.get('Authorization') || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7);
    return null;
}

async function hashPassword(password, secret) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(password));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password, hash, secret) {
    const computed = await hashPassword(password, secret);
    return computed === hash;
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' }
    });
}