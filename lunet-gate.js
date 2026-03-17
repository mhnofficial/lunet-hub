/**
 * lunet-gate.js
 * Gating is currently DISABLED — all content is free.
 * To re-enable, remove the `return;` line inside init().
 */

const LunetGate = (() => {

    const AUTH_WORKER   = 'https://lunet-auth.nickygomez-29.workers.dev';
    const FREE_SECONDS  = 20 * 60;
    const TICK_INTERVAL = 30;

    let gateType       = null;
    let remaining      = FREE_SECONDS;
    let timerEl        = null;
    let overlayEl      = null;
    let tickTimer      = null;
    let countdownTimer = null;
    let isPaused       = false;
    let isSubscribed   = false;

    // ── Public init ──────────────────────────────────────────
    async function init(type) {
        return; // ← GATING DISABLED — remove this line to re-enable

        gateType = type;
        injectStyles();
        injectTimerBar();
        injectOverlay();

        const state = await checkWithServer();

        if (state.subscribed) {
            isSubscribed = true;
            timerEl.style.display = 'none';
            unlockExtended();
            return;
        }

        if (state.cooldownEnds && Date.now() < state.cooldownEnds) {
            showCooldownOverlay(state.cooldownEnds);
            return;
        }

        remaining = state.remaining ?? FREE_SECONDS;
        startTimers();
        unlockBasic();
    }

    // ── Server calls ─────────────────────────────────────────
    function token() { return localStorage.getItem('lunet_token') || ''; }

    async function checkWithServer() {
        try {
            const res = await fetch(AUTH_WORKER + '/session/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() },
                body: JSON.stringify({ type: gateType })
            });
            return await res.json();
        } catch { return { subscribed: false, remaining: FREE_SECONDS, cooldownEnds: null }; }
    }

    async function tickServer() {
        try {
            const res = await fetch(AUTH_WORKER + '/session/tick', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() },
                body: JSON.stringify({ type: gateType, seconds: TICK_INTERVAL })
            });
            const data = await res.json();
            if (data.subscribed) { isSubscribed = true; clearAllTimers(); timerEl.style.display = 'none'; unlockExtended(); return; }
            if (data.remaining !== undefined) remaining = data.remaining;
            if (data.limitHit || remaining <= 0) { clearAllTimers(); showLimitOverlay(); }
        } catch {}
    }

    // ── Timers ───────────────────────────────────────────────
    function startTimers() {
        countdownTimer = setInterval(() => {
            if (isPaused) return;
            remaining = Math.max(0, remaining - 1);
            updateTimerBar();
            if (remaining <= 0) { clearAllTimers(); showLimitOverlay(); }
        }, 1000);

        tickTimer = setInterval(() => {
            if (!isPaused) tickServer();
        }, TICK_INTERVAL * 1000);
    }

    function clearAllTimers() {
        clearInterval(countdownTimer);
        clearInterval(tickTimer);
    }

    // ── Timer bar UI ─────────────────────────────────────────
    function injectTimerBar() {
        timerEl = document.createElement('div');
        timerEl.id = 'lunet-timer-bar';
        timerEl.innerHTML = `
      <div class="ltb-inner">
        <span class="ltb-icon">⏱</span>
        <div class="ltb-track"><div class="ltb-fill" id="ltb-fill"></div></div>
        <span class="ltb-label" id="ltb-label">20:00 free</span>
        <a href="pricing.html" class="ltb-upgrade">Upgrade</a>
      </div>`;
        document.body.prepend(timerEl);
        updateTimerBar();
    }

    function updateTimerBar() {
        const label = document.getElementById('ltb-label');
        const fill  = document.getElementById('ltb-fill');
        if (!label || !fill) return;
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        label.textContent = `${m}:${String(s).padStart(2,'0')} free left`;
        const pct = (remaining / FREE_SECONDS) * 100;
        fill.style.width = pct + '%';
        fill.style.background = pct > 40 ? '#a855f7' : pct > 15 ? '#f59e0b' : '#ef4444';
        if (remaining <= 120) label.style.color = '#f87171';
    }

    // ── Overlays ─────────────────────────────────────────────
    function injectOverlay() {
        overlayEl = document.createElement('div');
        overlayEl.id = 'lunet-gate-overlay';
        overlayEl.style.display = 'none';
        document.body.appendChild(overlayEl);
    }

    function showLimitOverlay() {
        isPaused = true;
        timerEl.style.display = 'none';

        const planLabel = gateType === 'games' ? 'Games Plan — $3/mo' : 'Movies Plan — $5/mo';
        const planKey   = gateType === 'games' ? 'games' : 'movies';

        overlayEl.innerHTML = `
      <div class="lgo-card">
        <div class="lgo-icon">${gateType === 'games' ? '🎮' : '🎬'}</div>
        <h2>Your 20 free minutes are up</h2>
        <p>Upgrade to keep going, or wait <strong id="lgo-cooldown">30:00</strong> for another free session.</p>
        <div class="lgo-btns">
          <button class="lgo-btn-pay" onclick="LunetGate._goUpgrade('${planKey}')">
            <i class="fa-solid fa-bolt"></i> ${planLabel}
          </button>
          <button class="lgo-btn-wait" onclick="LunetGate._startCooldownWait()">
            <i class="fa-regular fa-clock"></i> Wait 30 min (free)
          </button>
        </div>
        <a href="index.html" style="font-size:0.8rem;color:#64748b;margin-top:16px;display:block;">← Back to dashboard</a>
      </div>`;
        overlayEl.style.display = 'flex';
    }

    function showCooldownOverlay(endsAt) {
        isPaused = true;
        overlayEl.innerHTML = `
      <div class="lgo-card">
        <div class="lgo-icon">⏳</div>
        <h2>Cooldown in progress</h2>
        <p>Your free session ended. Come back when the timer hits zero, or upgrade for unlimited access.</p>
        <div class="lgo-countdown-big" id="lgo-big-countdown">--:--</div>
        <div class="lgo-btns">
          <button class="lgo-btn-pay" onclick="LunetGate._goUpgrade('${gateType === 'games' ? 'games' : 'movies'}')">
            <i class="fa-solid fa-bolt"></i> Upgrade — skip the wait
          </button>
        </div>
        <a href="index.html" style="font-size:0.8rem;color:#64748b;margin-top:16px;display:block;">← Back to dashboard</a>
      </div>`;
        overlayEl.style.display = 'flex';
        runCooldownClock(endsAt);
    }

    function runCooldownClock(endsAt) {
        const el = document.getElementById('lgo-big-countdown');
        const tick = () => {
            const diff = Math.max(0, Math.floor((endsAt - Date.now()) / 1000));
            const m = Math.floor(diff / 60);
            const s = diff % 60;
            if (el) el.textContent = `${m}:${String(s).padStart(2,'0')}`;
            if (diff <= 0) {
                overlayEl.style.display = 'none';
                remaining = FREE_SECONDS;
                startTimers();
                if (timerEl) timerEl.style.display = 'block';
                unlockBasic();
                return;
            }
            setTimeout(tick, 1000);
        };
        tick();
    }

    function showPaywallOverlay(triggerEl) {
        const planLabel = gateType === 'games' ? 'Games Plan — $3/mo' : 'Movies Plan — $5/mo';
        const planKey   = gateType === 'games' ? 'games' : 'movies';
        const title     = triggerEl?.dataset?.title || 'This content';
        const pw = document.createElement('div');
        pw.id = 'lunet-paywall';
        pw.innerHTML = `
      <div class="lgo-card">
        <div class="lgo-icon">🔒</div>
        <h2>Premium content</h2>
        <p><strong>${title}</strong> requires an upgrade to access.</p>
        <div class="lgo-btns">
          <button class="lgo-btn-pay" onclick="LunetGate._goUpgrade('${planKey}')">
            <i class="fa-solid fa-bolt"></i> ${planLabel}
          </button>
          <button class="lgo-btn-wait" onclick="document.getElementById('lunet-paywall').remove()">
            Maybe later
          </button>
        </div>
      </div>`;
        document.body.appendChild(pw);
    }

    function unlockBasic() {
        document.querySelectorAll('[data-lunet-tier="free"]').forEach(el => el.classList.remove('lunet-locked'));
        document.querySelectorAll('[data-lunet-tier="premium"]').forEach(el => {
            el.classList.add('lunet-premium-item');
            el.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                showPaywallOverlay(el);
            }, { once: false });
        });
    }

    function unlockExtended() {
        document.querySelectorAll('[data-lunet-tier]').forEach(el => {
            el.classList.remove('lunet-locked', 'lunet-premium-item');
        });
    }

    function injectStyles() {
        const s = document.createElement('style');
        s.textContent = `
      #lunet-timer-bar {
        position: fixed; top: 70px; left: 0; right: 0;
        z-index: 900;
        background: rgba(9,6,13,0.95);
        border-bottom: 1px solid rgba(255,255,255,0.06);
        padding: 8px 20px;
        backdrop-filter: blur(12px);
      }
      .ltb-inner {
        max-width: 1000px; margin: 0 auto;
        display: flex; align-items: center; gap: 12px;
        font-family: 'Poppins', sans-serif; font-size: 0.82rem;
      }
      .ltb-track {
        flex: 1; height: 5px; background: rgba(255,255,255,0.07);
        border-radius: 100px; overflow: hidden;
      }
      .ltb-fill { height: 100%; border-radius: 100px; transition: width 1s linear, background 0.5s; }
      .ltb-label { color: #94a3b8; white-space: nowrap; min-width: 100px; }
      .ltb-upgrade {
        background: rgba(168,85,247,0.15); border: 1px solid rgba(168,85,247,0.3);
        color: #c084fc; padding: 4px 12px; border-radius: 100px;
        font-size: 0.75rem; font-weight: 600; text-decoration: none; white-space: nowrap;
        transition: all 0.2s;
      }
      .ltb-upgrade:hover { background: rgba(168,85,247,0.3); color: #fff; }
      #lunet-gate-overlay, #lunet-paywall {
        position: fixed; inset: 0; z-index: 2000;
        background: rgba(0,0,0,0.85); backdrop-filter: blur(16px);
        display: flex; align-items: center; justify-content: center;
        font-family: 'Poppins', sans-serif;
      }
      .lgo-card {
        background: #0f0a1a; border: 1px solid rgba(168,85,247,0.25);
        border-radius: 24px; padding: 44px 36px;
        max-width: 440px; width: 90%; text-align: center;
        animation: lgoFadeUp 0.35s ease forwards;
      }
      @keyframes lgoFadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
      .lgo-icon { font-size: 3rem; margin-bottom: 16px; }
      .lgo-card h2 { font-size: 1.3rem; font-weight: 700; color: #f8fafc; margin-bottom: 10px; }
      .lgo-card p  { font-size: 0.88rem; color: #94a3b8; line-height: 1.65; margin-bottom: 26px; }
      .lgo-countdown-big {
        font-size: 3.5rem; font-weight: 800; color: #a855f7;
        font-variant-numeric: tabular-nums; margin: 0 0 28px;
      }
      .lgo-btns { display: flex; flex-direction: column; gap: 10px; }
      .lgo-btn-pay {
        background: #a855f7; color: white; border: none;
        padding: 14px; border-radius: 14px; font-family: inherit;
        font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: all 0.2s;
        display: flex; align-items: center; justify-content: center; gap: 8px;
      }
      .lgo-btn-pay:hover { background: #7c3aed; }
      .lgo-btn-wait {
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
        color: #94a3b8; padding: 13px; border-radius: 14px;
        font-family: inherit; font-size: 0.9rem; cursor: pointer; transition: all 0.2s;
        display: flex; align-items: center; justify-content: center; gap: 8px;
      }
      .lgo-btn-wait:hover { border-color: rgba(168,85,247,0.3); color: #fff; }
      .lunet-premium-item { position: relative; cursor: pointer; }
      .lunet-premium-item::after {
        content: '🔒 Premium';
        position: absolute; inset: 0;
        background: rgba(9,6,13,0.75); backdrop-filter: blur(3px);
        display: flex; align-items: center; justify-content: center;
        font-size: 0.82rem; font-weight: 600; color: #c084fc;
        border-radius: inherit; pointer-events: none;
      }
    `;
        document.head.appendChild(s);
    }

    function _goUpgrade(plan) {
        const tok = localStorage.getItem('lunet_token');
        if (!tok) { location.href = 'auth.html?redirect=pricing.html'; return; }
        location.href = 'pricing.html';
    }

    async function _startCooldownWait() {
        const state = await checkWithServer();
        if (state.cooldownEnds) {
            overlayEl.innerHTML = '';
            showCooldownOverlay(state.cooldownEnds);
        }
    }

    return { init, showPaywallOverlay, _goUpgrade, _startCooldownWait };

})();ƒƒ