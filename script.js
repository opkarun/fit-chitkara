// ═══════════════════════════════════════════════════════════════
//  script.js  —  FitChitkara Main Application Logic
//  Depends on: config.js (must be loaded first)
// ═══════════════════════════════════════════════════════════════
/* ── Dark Mode ── */
function toggleDarkMode() {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark');
    localStorage.setItem('fitchitkara-dark', isDark ? '1' : '0');
    document.getElementById('dark-mode-icon').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
}

// Apply saved preference on load
(function () {
    const saved = localStorage.getItem('fitchitkara-dark');
    if (saved === '1') {
        document.documentElement.classList.add('dark');
        // Icon will be updated once DOM is ready
        document.addEventListener('DOMContentLoaded', () => {
            const icon = document.getElementById('dark-mode-icon');
            if (icon) icon.className = 'fas fa-sun';
        });
    }
})();
/* ── App state (persisted per-day in localStorage) ── */
const TODAY_KEY = 'fitState_' + new Date().toDateString();
function loadState() {
    const saved = JSON.parse(localStorage.getItem(TODAY_KEY) || 'null');
    if (saved) return saved;
    // First visit today — seed chart with past 6 days from stored history
    const history = JSON.parse(localStorage.getItem('workoutHistory') || '[]');
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const today = new Date();
    const chartData = [0, 0, 0, 0, 0, 0, 0];
    history.forEach(l => {
        const d = new Date(l.date);
        const diff = Math.round((today - d) / 86400000);
        if (diff >= 0 && diff < 7) {
            const dayIdx = (today.getDay() + 6 - diff) % 7; // Mon=0
            chartData[dayIdx] = (chartData[dayIdx] || 0) + (l.calories || 0);
        }
    });
    return { burnedCals: 0, consumedCals: 0, targetBurn: 1000, targetConsume: 2500, chartData, lastActivity: '' };
}
function saveState() {
    localStorage.setItem(TODAY_KEY, JSON.stringify(state));
    // Clean up old day keys (keep last 8)
    const keys = Object.keys(localStorage).filter(k => k.startsWith('fitState_'));
    if (keys.length > 8) keys.sort().slice(0, keys.length - 8).forEach(k => localStorage.removeItem(k));
}
let state = loadState();
let tempActivity = { name: '', rate: 0, icon: '' };
let tempFood = { name: '', calories: 0 };
let performanceChart;

/* ─────────────────────────────────────────
   OTP state
───────────────────────────────────────── */
let otpState = {
    code: null,
    email: null,
    expiry: null,
    timerInterval: null
};

/* ═══════════════════════════════════════
   FIREBASE AUTH LISTENERS
═══════════════════════════════════════ */
auth.onAuthStateChanged(user => {
    if (user) {
        renderLoggedIn(user);
    } else {
        renderLoggedOut();
    }
});

function renderLoggedIn(user) {
    const name = user.displayName || user.email.split('@')[0];
    const initials = name.substring(0, 2).toUpperCase();
    const photoUrl = user.photoURL;

    document.getElementById('nav-auth-state').innerHTML = `
<div class="flex items-center gap-3">
    ${photoUrl
            ? `<img src="${photoUrl}" class="avatar-ring" alt="${name}">`
            : `<div class="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 font-black flex items-center justify-center border-2 border-emerald-400 text-sm font-display">${initials}</div>`
        }
    <span class="text-sm font-semibold text-slate-700 hidden sm:block">${name.split(' ')[0]}</span>
    <button onclick="signOutUser()" title="Sign out" class="text-slate-400 hover:text-red-500 transition ml-1">
        <i class="fas fa-sign-out-alt text-sm"></i>
    </button>
</div>`;

    closeAuthModal();
    // Show motivational quote once per day
    showDailyQuote(name.split(' ')[0]);
    // Refresh community streak for this user
    initCommunity(user.uid || user.email, name);
}

function renderLoggedOut() {
    document.getElementById('nav-auth-state').innerHTML = `
<button onclick="openAuthModal()" class="bg-slate-900 text-white px-6 py-2.5 rounded-full text-sm font-bold hover:bg-slate-800 transition shadow-lg">
    Login / Sign Up
</button>`;
}

/* ═══════════════════════════════════════
   MODAL HELPERS
═══════════════════════════════════════ */
function openAuthModal() {
    document.getElementById('auth-modal').classList.remove('hidden');
    showPanel('panel-main');
    switchTab('login');
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
    clearOtpTimer();
}

// Close on backdrop click
document.getElementById('auth-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('auth-modal')) closeAuthModal();
});

const PANELS = ['panel-main', 'panel-forgot', 'panel-otp', 'panel-newpwd'];
function showPanel(id) {
    PANELS.forEach(p => {
        const el = document.getElementById(p);
        if (p === id) { el.classList.remove('hidden'); el.classList.add('auth-panel'); }
        else el.classList.add('hidden');
    });
}

function switchTab(tab) {
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
    document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
    document.getElementById('form-signup').classList.toggle('hidden', tab !== 'signup');
    clearError('login-error');
    clearError('signup-error');
}

/* ═══════════════════════════════════════
   AUTH FUNCTIONS
═══════════════════════════════════════ */
/* ── Google Sign-In ── */
async function signInWithGoogle() {
    try {
        await auth.signInWithPopup(googleProvider);
        // onAuthStateChanged handles the rest
    } catch (err) {
        showAuthError('login-error', friendlyError(err.code));
    }
}

/* ── Email Sign-In ── */
async function signInEmail() {
    const email = document.getElementById('login-email').value.trim();
    const pwd = document.getElementById('login-password').value;
    clearError('login-error');

    if (!email || !pwd) return showAuthError('login-error', 'Please fill in all fields.');

    setLoading('btn-login', true, 'Signing in...');
    try {
        await auth.signInWithEmailAndPassword(email, pwd);
    } catch (err) {
        showAuthError('login-error', friendlyError(err.code));
    } finally {
        setLoading('btn-login', false, 'Sign In <i class="fas fa-arrow-right text-xs"></i>');
    }
}

/* ── Email Sign-Up ── */
async function signUpEmail() {
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const pwd = document.getElementById('signup-password').value;
    clearError('signup-error');

    if (!name || !email || !pwd) return showAuthError('signup-error', 'Please fill in all fields.');
    if (pwd.length < 6) return showAuthError('signup-error', 'Password must be at least 6 characters.');

    setLoading('btn-signup', true, 'Creating account...');
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, pwd);
        await cred.user.updateProfile({ displayName: name });
        auth.onAuthStateChanged(u => { if (u) renderLoggedIn(u); }); // refresh display name
    } catch (err) {
        showAuthError('signup-error', friendlyError(err.code));
    } finally {
        setLoading('btn-signup', false, 'Create Account <i class="fas fa-user-plus text-xs"></i>');
    }
}

/* ── Sign Out ── */
async function signOutUser() {
    await auth.signOut();
    showAlert('Signed out successfully.');
}

/* ─────────────────────────────────────────
   FORGOT PASSWORD  (OTP flow)
───────────────────────────────────────── */
async function sendOTP(isResend = false) {
    const emailEl = document.getElementById('forgot-email');
    const email = emailEl ? emailEl.value.trim() : otpState.email;
    clearError('forgot-error');

    if (!email) return showAuthError('forgot-error', 'Enter your email address.');
    if (!/\S+@\S+\.\S+/.test(email)) return showAuthError('forgot-error', 'Enter a valid email.');

    // Check email exists in Firebase (try sign-in and catch — light method)
    // We'll send OTP regardless and let Firebase reset handle the backend check
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpState = { code: otp, email, expiry: Date.now() + 10 * 60 * 1000 };

    const btn = document.getElementById('btn-send-otp') || document.getElementById('btn-resend');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    try {
        /* ── Send via EmailJS ──
           Make sure your EmailJS template has these variables:
           {{to_email}}  → recipient address
           {{otp}}       → the 6-digit code
        */
        await emailjs.send(emailjsConfig.serviceId, emailjsConfig.templateId, {
            to_email: email,
            otp: otp
        });

        document.getElementById('otp-email-display').textContent = email;
        startOtpTimer();
        showPanel('panel-otp');

        // Clear the OTP boxes
        document.querySelectorAll('.otp-box').forEach(b => b.value = '');
        document.querySelectorAll('.otp-box')[0].focus();

    } catch (err) {
        console.error('EmailJS error:', err);
        showAuthError('forgot-error',
            'Failed to send OTP. Check your EmailJS config or try again.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = isResend ? 'Resend' : '<i class="fas fa-paper-plane"></i> Send OTP'; }
    }
}

/* OTP box auto-advance */
function otpMove(input, idx) {
    input.value = input.value.replace(/\D/g, ''); // numbers only
    if (input.value && idx < 5) {
        document.querySelectorAll('.otp-box')[idx + 1].focus();
    }
    if (input.value === '' && idx > 0) {
        // allow backspace nav
    }
}

/* Backspace navigation for OTP */
document.addEventListener('keydown', e => {
    if (e.key === 'Backspace' && e.target.classList.contains('otp-box')) {
        const boxes = [...document.querySelectorAll('.otp-box')];
        const idx = boxes.indexOf(e.target);
        if (!e.target.value && idx > 0) boxes[idx - 1].focus();
    }
});

/* Verify OTP */
function verifyOTP() {
    clearError('otp-error');
    const boxes = document.querySelectorAll('.otp-box');
    const entered = [...boxes].map(b => b.value).join('');

    if (entered.length < 6) return showAuthError('otp-error', 'Enter all 6 digits.');
    if (Date.now() > otpState.expiry) return showAuthError('otp-error', 'OTP expired. Please request a new one.');
    if (entered !== otpState.code) {
        // Shake animation
        boxes.forEach(b => { b.style.borderColor = '#ef4444'; setTimeout(() => b.style.borderColor = '', 600); });
        return showAuthError('otp-error', 'Incorrect OTP. Please try again.');
    }

    clearOtpTimer();
    showPanel('panel-newpwd');
}

/* Reset password after OTP verified */
async function resetPassword() {
    clearError('newpwd-error');
    const pwd1 = document.getElementById('new-pwd').value;
    const pwd2 = document.getElementById('new-pwd-confirm').value;

    if (!pwd1 || !pwd2) return showAuthError('newpwd-error', 'Fill in both fields.');
    if (pwd1.length < 6) return showAuthError('newpwd-error', 'Password must be at least 6 characters.');
    if (pwd1 !== pwd2) return showAuthError('newpwd-error', 'Passwords don\'t match.');

    /* Firebase: use sendPasswordResetEmail as the actual reset mechanism
       (the OTP was purely for identity verification on the client side)
       For a production app you'd use a Cloud Function to securely update the password.
       Here we send the reset email as the final step. */
    try {
        await auth.sendPasswordResetEmail(otpState.email);
        showAlert('Password reset email sent! Check your inbox to complete the reset.');
        closeAuthModal();
        showPanel('panel-main');
    } catch (err) {
        showAuthError('newpwd-error', friendlyError(err.code));
    }
}

/* OTP countdown timer */
function startOtpTimer() {
    clearOtpTimer();
    let remaining = 600; // 10 min in seconds
    const el = document.getElementById('otp-timer');
    otpState.timerInterval = setInterval(() => {
        remaining--;
        const m = Math.floor(remaining / 60).toString().padStart(2, '0');
        const s = (remaining % 60).toString().padStart(2, '0');
        if (el) el.textContent = `${m}:${s}`;
        if (remaining <= 0) {
            clearOtpTimer();
            if (el) { el.textContent = 'Expired'; el.classList.replace('text-emerald-600', 'text-red-500'); }
        }
    }, 1000);
}

function clearOtpTimer() {
    if (otpState.timerInterval) clearInterval(otpState.timerInterval);
}

/* ═══════════════════════════════════════
   UI HELPERS
═══════════════════════════════════════ */
function showAuthError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<i class="fas fa-exclamation-circle mr-2"></i>${msg}`;
    el.classList.remove('hidden');
}
function clearError(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}
function setLoading(btnId, loading, html) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading ? `<div class="spinner border-t-white border-2"></div>` : html;
}
function togglePwd(inputId, btn) {
    const input = document.getElementById(inputId);
    const isText = input.type === 'text';
    input.type = isText ? 'password' : 'text';
    btn.innerHTML = isText ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
}
function checkStrength(pwd) {
    const bar = document.getElementById('strength-bar');
    const txt = document.getElementById('strength-text');
    if (!bar) return;
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    const configs = [
        { w: '0%', c: 'bg-slate-200', t: 'Too short' },
        { w: '25%', c: 'bg-red-400', t: 'Weak' },
        { w: '50%', c: 'bg-yellow-400', t: 'Fair' },
        { w: '75%', c: 'bg-blue-400', t: 'Good' },
        { w: '100%', c: 'bg-emerald-500', t: 'Strong 💪' }
    ];
    const cfg = configs[score];
    bar.style.width = cfg.w;
    bar.className = `strength-bar h-full ${cfg.c}`;
    txt.textContent = cfg.t;
}

/* Firebase error code → human message */
function friendlyError(code) {
    const map = {
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/email-already-in-use': 'This email is already registered.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/weak-password': 'Password is too weak (min 6 chars).',
        'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
        'auth/network-request-failed': 'Network error. Check your connection.',
        'auth/too-many-requests': 'Too many attempts. Try again later.',
        'auth/invalid-credential': 'Incorrect email or password.',
    };
    return map[code] || 'An error occurred. Please try again.';
}

/* ═══════════════════════════════════════
   LEGACY MODAL TOGGLE (activity modal)
═══════════════════════════════════════ */
function toggleModal(id) {
    document.getElementById(id).classList.toggle('hidden');
}

/* ═══════════════════════════════════════
   CHART & FITNESS LOGIC (unchanged)
═══════════════════════════════════════ */
window.onload = () => {
    initChart();
    restoreDailyOverview();
    loadSavedWorkouts(); loadSavedMeals(); initWater(); initXP(); initCommunityWall(); initMeasurements(); initWorkoutHistory(); initReminders();
};

function restoreDailyOverview() {
    // Restore burned calories
    document.getElementById('total-calories').innerText = state.burnedCals;
    document.getElementById('burn-fill').style.width = Math.min((state.burnedCals / state.targetBurn) * 100, 100) + '%';
    // Restore consumed calories
    document.getElementById('consumed-calories').innerText = state.consumedCals;
    const fill = document.getElementById('consume-fill');
    fill.style.width = Math.min((state.consumedCals / state.targetConsume) * 100, 100) + '%';
    if (state.consumedCals > state.targetConsume) fill.classList.replace('bg-blue-500', 'bg-red-500');
    // Restore last activity
    if (state.lastActivity) document.getElementById('last-activity').innerHTML = state.lastActivity;
}

function showAlert(msg) {
    const alert = document.getElementById('custom-alert');
    document.getElementById('alert-msg').innerText = msg;
    alert.classList.remove('hidden');
    setTimeout(() => alert.classList.remove('translate-y-10', 'opacity-0'), 10);
    setTimeout(() => {
        alert.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => alert.classList.add('hidden'), 300);
    }, 3500);
}

function initChart() {
    const ctx = document.getElementById('performanceChart').getContext('2d');
    performanceChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], datasets: [{ label: 'Calories Burned', data: state.chartData, backgroundColor: '#10b981', borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { border: { display: false } }, x: { grid: { display: false }, border: { display: false } } } }
    });
}
function updateChartData(n) {
    // today is always the last bar (index 6 = Sun slot, but we use day-of-week)
    const todayIdx = (new Date().getDay() + 6) % 7; // Mon=0 … Sun=6
    state.chartData[todayIdx] = (state.chartData[todayIdx] || 0) + n;
    performanceChart.data.datasets[0].data = state.chartData;
    performanceChart.update();
    saveState();
}

function openActivityModal(name, rate, iconClass) {
    tempActivity = { name, rate, iconClass };
    document.getElementById('activity-title').innerText = `Log ${name}`;
    toggleModal('activity-modal');
}
function confirmActivity() {
    const mins = parseInt(document.getElementById('activity-minutes').value);
    if (isNaN(mins) || mins <= 0) return showAlert('Invalid minutes.');
    const burnt = mins * tempActivity.rate;
    state.burnedCals += burnt;
    const actHTML = `<i class="${tempActivity.iconClass} text-emerald-500"></i> ${tempActivity.name} (${mins}m)`;
    state.lastActivity = actHTML;
    document.getElementById('last-activity').innerHTML = actHTML;
    document.getElementById('total-calories').innerText = state.burnedCals;
    document.getElementById('burn-fill').style.width = Math.min((state.burnedCals / state.targetBurn) * 100, 100) + '%';
    updateChartData(burnt);
    saveState();
    saveWorkoutLog(tempActivity.name, mins, burnt);
    toggleModal('activity-modal');
    showAlert(`Burned ${burnt} calories.`);
    earnXP(20, 'workout');
}
function logMeal(name, calories) {
    state.consumedCals += calories;
    document.getElementById('consumed-calories').innerText = state.consumedCals;
    const fill = document.getElementById('consume-fill');
    fill.style.width = Math.min((state.consumedCals / state.targetConsume) * 100, 100) + '%';
    if (state.consumedCals > state.targetConsume) fill.classList.replace('bg-blue-500', 'bg-red-500');
    saveState();
    showAlert(`Logged ${name} (${calories} kcal).`);
    earnXP(10, 'meal');
}
function calcBMI() {
    const w = document.getElementById('weight').value, h = document.getElementById('height').value;
    if (w > 0 && h > 0) {
        const bmi = (w / Math.pow(h / 100, 2)).toFixed(1);
        document.getElementById('bmi-result-box').classList.remove('hidden');
        document.getElementById('bmi-val').innerText = bmi;
        const s = document.getElementById('bmi-status');
        if (bmi < 18.5) { s.innerText = 'UNDERWEIGHT'; s.className = 'text-sm font-bold tracking-wider text-yellow-400'; }
        else if (bmi < 25) { s.innerText = 'OPTIMAL'; s.className = 'text-sm font-bold tracking-wider text-emerald-400'; }
        else { s.innerText = 'OVERWEIGHT/OBESE'; s.className = 'text-sm font-bold tracking-wider text-red-400'; }
        earnXP(5, 'bmi');
    } else showAlert('Enter valid details.');
}
async function handleContact(e) {
    e.preventDefault();
    const name = document.getElementById('contact-name').value.trim();
    const email = document.getElementById('contact-email').value.trim();
    const message = document.getElementById('contact-message').value.trim();
    const btn = document.getElementById('contact-btn');
    const result = document.getElementById('contact-result');

    btn.disabled = true;
    btn.innerHTML = '<div class="spinner border-t-white border-2"></div> Sending...';
    result.classList.add('hidden');

    try {
        await emailjs.send(emailjsConfig.serviceId, 'template_gmmh35r', {
            to_name: name,
            to_email: email,
            message: message
        });

        // Success
        result.className = 'mt-4 text-center text-sm font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl py-3 px-4';
        result.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Message sent! We\'ll get back to you shortly.';
        result.classList.remove('hidden');
        e.target.reset();
        showAlert('Support message sent! Check your email for confirmation.');
    } catch (err) {
        console.error('Contact EmailJS error:', err);
        result.className = 'mt-4 text-center text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl py-3 px-4';
        result.innerHTML = '<i class="fas fa-exclamation-circle mr-2"></i>Failed to send. Please try again.';
        result.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message';
    }
}

/* ═══════════════════════════════════════
   GEMINI AI FUNCTIONS
═══════════════════════════════════════ */
async function fetchGeminiJSON(parts, systemInstr) {
    let retries = 0;
    while (retries < 3) {
        try {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${geminiKey}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ role: 'user', parts }], systemInstruction: { parts: [{ text: systemInstr }] }, generationConfig: { responseMimeType: 'application/json' } })
            });
            if (r.ok) { const d = await r.json(); return JSON.parse(d?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'); }
        } catch (e) { console.error(e); }
        retries++; await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retries)));
    }
    throw new Error('Failed to reach AI.');
}
async function fetchGeminiText(prompt, sys) {
    let retries = 0;
    while (retries < 3) {
        try {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiKey}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], systemInstruction: { parts: [{ text: sys }] } })
            });
            if (r.ok) { const d = await r.json(); return d?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.'; }
        } catch (e) { console.error(e); }
        retries++; await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retries)));
    }
    throw new Error('Failed.');
}
function getBase64(file) { return new Promise((res, rej) => { const r = new FileReader(); r.readAsDataURL(file); r.onload = () => res(r.result.split(',')[1]); r.onerror = e => rej(e); }); }

async function analyzeFood() {
    const textInput = document.getElementById('food-text-input').value.trim();
    const fileInput = document.getElementById('food-image-input').files[0];
    if (!textInput && !fileInput) return showAlert('Provide a description or image.');
    const btn = document.getElementById('btn-scan-food'), os = document.getElementById('food-output-state'), rc = document.getElementById('food-result-card');
    btn.innerHTML = `<div class="spinner border-t-white border-2"></div> Analyzing...`; btn.disabled = true;
    rc.classList.add('hidden'); os.classList.remove('hidden');
    os.innerHTML = `<div class="spinner border-t-emerald-500 border-2 mx-auto mb-4 w-10 h-10"></div><h3 class="text-lg font-bold text-slate-600">AI is analyzing...</h3>`;
    try {
        let parts = [];
        if (fileInput) { const b64 = await getBase64(fileInput); parts.push({ inlineData: { mimeType: fileInput.type, data: b64 } }); parts.push({ text: 'Analyze the food in this image. ' }); }
        if (textInput) parts.push({ text: `Analyze this food: ${textInput}. ` });
        parts[parts.length - 1].text += 'Provide accurate calorie estimate.';
        const data = await fetchGeminiJSON(parts, 'You are a strict nutritionist AI. Respond ONLY with JSON: {"foodName":"string","calories":number,"description":"string 1-2 sentences"}.');
        if (data && data.foodName && data.calories) {
            tempFood = { name: data.foodName, calories: data.calories };
            document.getElementById('res-food-name').innerText = data.foodName;
            document.getElementById('res-food-desc').innerText = data.description;
            document.getElementById('res-food-cals').innerText = data.calories;
            os.classList.add('hidden'); rc.classList.remove('hidden');
        } else throw new Error('Bad output.');
    } catch (e) { os.innerHTML = `<i class="fas fa-exclamation-triangle text-red-500 text-4xl mb-2"></i><h3 class="font-bold text-red-500">Analysis Failed</h3>`; }
    finally { btn.innerHTML = `<i class="fas fa-search"></i> Analyze Calories`; btn.disabled = false; }
}
function logScannedFood() { if (tempFood.calories > 0) { logMeal(tempFood.name, tempFood.calories); document.getElementById('food-text-input').value = ''; document.getElementById('food-image-input').value = ''; document.getElementById('food-result-card').classList.add('hidden'); document.getElementById('food-output-state').classList.remove('hidden'); document.getElementById('food-output-state').innerHTML = `<i class="fas fa-check-circle text-5xl text-emerald-400 mb-4"></i><h3 class="text-lg font-bold text-slate-600">Food Logged!</h3>`; } }

async function generatePlan() {
    const cWt = document.getElementById('plan-current-wt').value, tWt = document.getElementById('plan-target-wt').value, wks = document.getElementById('plan-weeks').value, act = document.getElementById('plan-activity').value;
    if (!cWt || !tWt || !wks) return showAlert('Fill out all planner fields first!');
    const btn = document.getElementById('btn-generate'), out = document.getElementById('plan-output');
    btn.innerHTML = `<div class="spinner"></div> Generating...`; btn.disabled = true;
    out.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-slate-500 animate-pulse"><div class="spinner mb-4 border-emerald-500 border-t-transparent"></div><p class="font-bold">Analyzing your parameters...</p></div>`;
    const prompt = `Weight: ${cWt}kg. Target: ${tWt}kg. Time: ${wks} weeks. Activity: ${act}. Create a realistic fitness roadmap.`;
    const sys = `Return ONLY raw HTML. Tags: <div class='mb-6'>, <h3 class='text-xl font-black mb-2 text-emerald-600'>, <h4 class='font-bold text-slate-800 mt-4 mb-2'>, <ul class='list-disc pl-5 space-y-2 mb-4 text-sm text-slate-600'>, <li>. NO markdown.`;
    try { const html = await fetchGeminiText(prompt, sys); out.innerHTML = `<div class="text-left h-full"><h2 class="text-2xl font-black mb-6 pb-4 border-b border-slate-100">Your Custom Roadmap</h2>${html.replace(/```html|```/g, '').trim()}</div>`; }
    catch (e) { out.innerHTML = `<p class="text-red-500 font-bold">Error generating plan.</p>`; }
    finally { btn.innerHTML = `<i class="fas fa-magic"></i> Generate Roadmap`; btn.disabled = false; }
}

async function askAI() {
    const input = document.getElementById('ai-input');
    const chat = document.getElementById('ai-chat-window');
    const query = input.value.trim();
    if (!query) return;

    // ── Add user bubble ──
    chat.innerHTML += `
<div class="flex gap-4 flex-row-reverse">
    <div class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white shrink-0">
        <i class="fas fa-user"></i>
    </div>
    <div class="bg-slate-900 text-white p-4 rounded-2xl rounded-tr-none shadow-md max-w-[80%]">${query}</div>
</div>`;
    input.value = '';
    chat.scrollTop = chat.scrollHeight;

    // ── Loading bubble ──
    const lid = 'ai-load-' + Date.now();
    chat.innerHTML += `
<div id="${lid}" class="flex gap-4 items-center mt-4">
    <div class="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0">
        <i class="fas fa-robot"></i>
    </div>
    <div class="text-slate-400 text-sm italic">Typing...</div>
</div>`;
    chat.scrollTop = chat.scrollHeight;

    // ── Detect video / exercise demo request ──
    const videoTriggers = [
        'video', 'show me', 'tutorial', 'demonstrate', 'watch',
        'how to do', 'how do i do', 'see how', 'play',
        'how to', 'show how', 'example of', 'demo', 'technique for',
        'form for', 'proper form', 'correct form', 'teach me'
    ];
    // Also trigger if query contains a known exercise word alongside intent
    const exerciseWords = [
        'deadlift', 'squat', 'bench press', 'pull up', 'push up', 'lunge',
        'curl', 'row', 'plank', 'burpee', 'clean', 'snatch', 'press',
        'crunch', 'dip', 'kettlebell', 'exercise', 'workout', 'stretch'
    ];
    const lq = query.toLowerCase();
    const hasVideoTrigger = videoTriggers.some(kw => lq.includes(kw));
    const hasExerciseWord = exerciseWords.some(kw => lq.includes(kw));
    const isVideoRequest = hasVideoTrigger || (hasExerciseWord && (lq.includes('how') || lq.includes('show') || lq.includes('teach')));

    try {
        if (isVideoRequest) {
            // Ask Gemini to extract a clean YouTube search query
            const searchQuery = await fetchGeminiText(
                query,
                `The user wants to watch a fitness or exercise video. Extract the main exercise/topic.
         Return ONLY a short, clean YouTube search string (max 6 words). No quotes, no punctuation.
         Examples: deadlift proper form tutorial, barbell squat technique beginners, push up correct form guide`
            );

            const cleanQuery = searchQuery.replace(/^["']+|["']+$/g, '').trim();

            // ── Call YouTube Data API v3 to get a real video ID ──
            const ytApiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(cleanQuery)}&key=${youtubeKey}`;
            const ytResp = await fetch(ytApiUrl);
            const ytData = await ytResp.json();

            document.getElementById(lid).remove();

            if (ytData.items && ytData.items.length > 0) {
                const item = ytData.items[0];
                const videoId = item.id.videoId;
                const videoTitle = item.snippet.title;
                const channelName = item.snippet.channelTitle;
                const thumbnail = item.snippet.thumbnails.medium.url;
                const embedSrc = `https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0`;
                const ytLink = `https://www.youtube.com/watch?v=${videoId}`;

                chat.innerHTML += `
            <div class="flex gap-4 mt-4">
                <div class="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="bg-slate-100 text-slate-700 p-4 rounded-2xl rounded-tl-none w-full max-w-[95%]">
                    <p class="text-sm font-semibold mb-3 flex items-center gap-2">
                        <i class="fab fa-youtube text-red-500 text-lg"></i>
                        Video for: <span class="text-emerald-600 font-bold italic">${cleanQuery}</span>
                    </p>
                    <div class="rounded-xl overflow-hidden shadow-lg border border-slate-200" style="position:relative;padding-top:56.25%">
                        <iframe
                            src="${embedSrc}"
                            title="${videoTitle}"
                            frameborder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowfullscreen
                            style="position:absolute;top:0;left:0;width:100%;height:100%;border-radius:0;"
                        ></iframe>
                    </div>
                    <div class="mt-2 px-1">
                        <p class="font-semibold text-slate-800 text-sm leading-snug">${videoTitle}</p>
                        <p class="text-xs text-slate-400 mt-0.5">${channelName}</p>
                    </div>
                    <a href="${ytLink}" target="_blank" rel="noopener noreferrer"
                       class="mt-3 flex items-center justify-center gap-2 w-full bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl transition shadow text-sm">
                        <i class="fab fa-youtube"></i> Watch on YouTube
                    </a>
                </div>
            </div>`;
            } else {
                // Fallback: YouTube search link if API returns no results
                const encodedQuery = encodeURIComponent(cleanQuery);
                chat.innerHTML += `
            <div class="flex gap-4 mt-4">
                <div class="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="bg-slate-100 text-slate-700 p-4 rounded-2xl rounded-tl-none max-w-[90%]">
                    <p class="text-sm mb-2">Couldn't find an embedded video, but here's a YouTube search:</p>
                    <a href="https://www.youtube.com/results?search_query=${encodedQuery}" target="_blank"
                       class="flex items-center gap-2 text-red-500 font-bold hover:underline">
                        <i class="fab fa-youtube"></i> Search YouTube for "${cleanQuery}"
                    </a>
                </div>
            </div>`;
            }

        } else {
            // ── Normal text reply ──
            const t = await fetchGeminiText(query, 'You are a fitness coach. Answer in 2-3 short sentences. No fluff. Basic HTML ok.');
            document.getElementById(lid).remove();
            chat.innerHTML += `
        <div class="flex gap-4 mt-4">
            <div class="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0">
                <i class="fas fa-robot"></i>
            </div>
            <div class="bg-slate-100 text-slate-700 p-4 rounded-2xl rounded-tl-none max-w-[80%]">${t}</div>
        </div>`;
        }

        chat.scrollTop = chat.scrollHeight;

    } catch (e) {
        const loadEl = document.getElementById(lid);
        if (loadEl) loadEl.querySelector('div:last-child').textContent = 'Error — please try again.';
    }
}
document.getElementById('ai-input').addEventListener('keypress', e => { if (e.key === 'Enter') askAI(); });

/* ═══════════════════════════════════════
   CUSTOM WORKOUT TEMPLATES
═══════════════════════════════════════ */
function openCustomWorkoutModal() {
    document.getElementById('cw-name').value = '';
    document.getElementById('cw-desc').value = '';
    document.getElementById('cw-preview').classList.add('hidden');
    document.getElementById('cw-error').classList.add('hidden');
    document.getElementById('cw-btn').innerHTML = '<i class="fas fa-magic"></i> Estimate &amp; Save';
    document.getElementById('cw-btn').disabled = false;
    toggleModal('custom-workout-modal');
}

async function estimateAndSaveWorkout() {
    const name = document.getElementById('cw-name').value.trim();
    const desc = document.getElementById('cw-desc').value.trim();
    const errEl = document.getElementById('cw-error');
    errEl.classList.add('hidden');

    if (!name) { errEl.textContent = 'Please enter a workout name.'; errEl.classList.remove('hidden'); return; }

    const btn = document.getElementById('cw-btn');
    btn.innerHTML = '<div class="spinner border-t-white border-2"></div> AI thinking...';
    btn.disabled = true;

    try {
        const prompt = `Workout: "${name}". ${desc ? 'Description: ' + desc : ''}. Estimate average calories burned per minute for a typical adult. Return ONLY a JSON: {"calPerMin": number, "icon": "fas fa-<iconname>"}. Icon should best represent this workout (e.g. fa-bicycle, fa-swimmer, fa-running, fa-dumbbell, fa-heartbeat).`;
        const data = await fetchGeminiJSON([{ text: prompt }], 'You are a fitness expert. Return only valid JSON with calPerMin (integer) and icon (font-awesome class string).');

        const rate = Math.round(data.calPerMin) || 6;
        const icon = data.icon || 'fas fa-heartbeat';
        const template = { name, desc, rate, icon, id: Date.now() };

        // Save to localStorage
        const saved = JSON.parse(localStorage.getItem('customWorkouts') || '[]');
        saved.push(template);
        localStorage.setItem('customWorkouts', JSON.stringify(saved));

        // Show preview
        document.getElementById('cw-preview-text').textContent = `${rate} Cal / Min`;
        document.getElementById('cw-preview').classList.remove('hidden');

        // Render card
        renderWorkoutCard(template);
        showAlert(`"${name}" saved! ${rate} cal/min.`);
        setTimeout(() => toggleModal('custom-workout-modal'), 900);

    } catch (e) {
        errEl.textContent = 'AI estimation failed. Try again.';
        errEl.classList.remove('hidden');
    } finally {
        btn.innerHTML = '<i class="fas fa-magic"></i> Estimate &amp; Save';
        btn.disabled = false;
    }
}

function renderWorkoutCard(t) {
    const container = document.getElementById('workout-cards');
    const div = document.createElement('div');
    div.className = 'card-hover bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm relative';
    div.id = 'wcard-' + t.id;
    div.innerHTML = `
<button onclick="deleteWorkoutTemplate(${t.id})" title="Remove" class="absolute top-2 right-2 z-10 w-7 h-7 bg-white/80 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full flex items-center justify-center text-xs transition shadow"><i class="fas fa-times"></i></button>
<div class="h-32 bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-5xl">
    <i class="${t.icon}"></i>
</div>
<div class="p-5">
    <h3 class="font-bold text-lg mb-1">${t.name}</h3>
    ${t.desc ? `<p class="text-slate-400 text-xs mb-1">${t.desc}</p>` : ''}
    <p class="text-emerald-500 text-sm font-bold mb-4"><i class="fas fa-fire mr-1"></i>${t.rate} Cal / Min <span class="text-slate-400 font-normal text-xs ml-1">· AI estimated</span></p>
    <button onclick="openActivityModal('${t.name}', ${t.rate}, '${t.icon}')" class="w-full bg-slate-100 text-slate-900 py-2 rounded-lg font-bold hover:bg-slate-200 transition">Add Activity</button>
</div>`;
    container.appendChild(div);
}

function deleteWorkoutTemplate(id) {
    const saved = JSON.parse(localStorage.getItem('customWorkouts') || '[]').filter(w => w.id !== id);
    localStorage.setItem('customWorkouts', JSON.stringify(saved));
    const el = document.getElementById('wcard-' + id);
    if (el) el.remove();
    showAlert('Workout template removed.');
}

function loadSavedWorkouts() {
    const saved = JSON.parse(localStorage.getItem('customWorkouts') || '[]');
    saved.forEach(t => renderWorkoutCard(t));
}

/* ═══════════════════════════════════════
   CUSTOM MEAL TEMPLATES
═══════════════════════════════════════ */
function openCustomMealModal() {
    document.getElementById('cm-name').value = '';
    document.getElementById('cm-desc').value = '';
    document.getElementById('cm-preview').classList.add('hidden');
    document.getElementById('cm-error').classList.add('hidden');
    document.getElementById('cm-btn').innerHTML = '<i class="fas fa-magic"></i> Estimate &amp; Save';
    document.getElementById('cm-btn').disabled = false;
    toggleModal('custom-meal-modal');
}

async function estimateAndSaveMeal() {
    const name = document.getElementById('cm-name').value.trim();
    const desc = document.getElementById('cm-desc').value.trim();
    const errEl = document.getElementById('cm-error');
    errEl.classList.add('hidden');

    if (!name) { errEl.textContent = 'Please enter a meal name.'; errEl.classList.remove('hidden'); return; }

    const btn = document.getElementById('cm-btn');
    btn.innerHTML = '<div class="spinner border-t-white border-2"></div> AI thinking...';
    btn.disabled = true;

    try {
        const prompt = `Meal: "${name}". ${desc ? 'Details: ' + desc : ''}. Estimate total calories and pick a relevant Font Awesome icon. Return ONLY JSON: {"calories": number, "icon": "fas fa-<iconname>"}`;
        const data = await fetchGeminiJSON([{ text: prompt }], 'You are a nutritionist. Return only valid JSON with calories (integer) and icon (font-awesome class string like fas fa-egg).');

        const cals = Math.round(data.calories) || 400;
        const icon = data.icon || 'fas fa-utensils';
        const template = { name, desc, cals, icon, id: Date.now() };

        const saved = JSON.parse(localStorage.getItem('customMeals') || '[]');
        saved.push(template);
        localStorage.setItem('customMeals', JSON.stringify(saved));

        document.getElementById('cm-preview-text').textContent = `${cals} kcal`;
        document.getElementById('cm-preview').classList.remove('hidden');

        renderMealCard(template);
        showAlert(`"${name}" saved! ~${cals} kcal.`);
        setTimeout(() => toggleModal('custom-meal-modal'), 900);

    } catch (e) {
        errEl.textContent = 'AI estimation failed. Try again.';
        errEl.classList.remove('hidden');
    } finally {
        btn.innerHTML = '<i class="fas fa-magic"></i> Estimate &amp; Save';
        btn.disabled = false;
    }
}

function renderMealCard(t) {
    const container = document.getElementById('meal-cards');
    const div = document.createElement('div');
    div.className = 'card-hover bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between relative';
    div.id = 'mcard-' + t.id;
    div.innerHTML = `
<button onclick="deleteMealTemplate(${t.id})" title="Remove" class="absolute top-2 right-2 w-7 h-7 bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full flex items-center justify-center text-xs transition shadow"><i class="fas fa-times"></i></button>
<div>
    <div class="w-12 h-12 bg-emerald-100 text-emerald-500 rounded-xl flex items-center justify-center text-xl mb-4"><i class="${t.icon}"></i></div>
    <h3 class="font-bold text-lg">${t.name}</h3>
    ${t.desc ? `<p class="text-slate-400 text-xs mt-1">${t.desc}</p>` : ''}
    <p class="text-xs text-slate-400 mt-1"><i class="fas fa-robot mr-1"></i>AI estimated</p>
</div>
<div class="flex items-center justify-between mt-4">
    <span class="font-black text-slate-800">${t.cals} <span class="text-xs font-normal text-slate-500">kcal</span></span>
    <button onclick="logMeal('${t.name}', ${t.cals})" class="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-blue-100 transition"><i class="fas fa-plus"></i> Log</button>
</div>`;
    container.appendChild(div);
}

function deleteMealTemplate(id) {
    const saved = JSON.parse(localStorage.getItem('customMeals') || '[]').filter(m => m.id !== id);
    localStorage.setItem('customMeals', JSON.stringify(saved));
    const el = document.getElementById('mcard-' + id);
    if (el) el.remove();
    showAlert('Meal template removed.');
}

function loadSavedMeals() {
    const saved = JSON.parse(localStorage.getItem('customMeals') || '[]');
    saved.forEach(t => renderMealCard(t));
}


/* ═══════════════════════════════════════
   WATER TRACKER
═══════════════════════════════════════ */
const WATER_GOAL = 8;

function initWater() {
    const today = new Date().toDateString();
    const saved = JSON.parse(localStorage.getItem('waterData') || '{"date":"","count":0}');
    if (saved.date !== today) {
        localStorage.setItem('waterData', JSON.stringify({ date: today, count: 0 }));
        renderWater(0);
    } else {
        renderWater(saved.count);
    }
}

function addWater(delta) {
    const today = new Date().toDateString();
    const saved = JSON.parse(localStorage.getItem('waterData') || '{"date":"","count":0}');
    let count = Math.min(Math.max((saved.count || 0) + delta, 0), WATER_GOAL);
    localStorage.setItem('waterData', JSON.stringify({ date: today, count }));
    renderWater(count);
    if (count === WATER_GOAL) {
        showAlert('Daily water goal reached! +15 XP');
        earnXP(15, 'water');
    }
}

function renderWater(count) {
    const container = document.getElementById('water-glasses');
    container.innerHTML = '';
    for (let i = 0; i < WATER_GOAL; i++) {
        const filled = i < count;
        const btn = document.createElement('button');
        btn.onclick = () => addWater(filled ? -1 : 1);
        btn.title = filled ? 'Click to remove' : 'Click to add';
        btn.className = 'w-12 h-14 rounded-2xl border-2 flex flex-col items-center justify-end pb-1 transition-all duration-300 ' +
            (filled ? 'bg-blue-400 border-blue-400 shadow-lg' : 'bg-white border-blue-200 hover:border-blue-400');
        btn.innerHTML =
            '<i class="fas fa-tint text-lg ' + (filled ? 'text-white' : 'text-blue-200') + '"></i>' +
            '<span class="text-xs font-bold ' + (filled ? 'text-white' : 'text-blue-300') + '">' + (i + 1) + '</span>';
        container.appendChild(btn);
    }
    const pct = Math.round((count / WATER_GOAL) * 100);
    document.getElementById('water-fill').style.width = pct + '%';
    document.getElementById('water-count-label').textContent = count + ' / ' + WATER_GOAL + ' glasses';
    document.getElementById('water-percent-label').textContent = pct + '%';
}

/* ═══════════════════════════════════════
   XP & BADGES SYSTEM
═══════════════════════════════════════ */
const BADGES_DEF = [
    { id: 'first_workout', icon: 'fas fa-dumbbell', label: 'First Workout', desc: 'Log your first activity', color: 'bg-emerald-400', trigger: 'workout' },
    { id: 'first_meal', icon: 'fas fa-utensils', label: 'First Bite', desc: 'Log your first meal', color: 'bg-blue-400', trigger: 'meal' },
    { id: 'hydrated', icon: 'fas fa-tint', label: 'Hydration Hero', desc: 'Reach daily water goal', color: 'bg-cyan-400', trigger: 'water' },
    { id: 'bmi_check', icon: 'fas fa-heartbeat', label: 'Know Yourself', desc: 'Calculate your BMI', color: 'bg-pink-400', trigger: 'bmi' },
    { id: 'xp_100', icon: 'fas fa-fire', label: 'On Fire', desc: 'Earn 100 XP total', color: 'bg-orange-400', trigger: 'xp100' },
    { id: 'xp_500', icon: 'fas fa-trophy', label: 'Champion', desc: 'Earn 500 XP total', color: 'bg-yellow-400', trigger: 'xp500' }
];
const XP_LEVELS = [0, 100, 250, 500, 1000, 2000];

function initXP() { renderBadges(); updateXPUI(); }

function getXPData() {
    return JSON.parse(localStorage.getItem('xpData') || '{"xp":0,"badges":[]}');
}
function saveXPData(data) { localStorage.setItem('xpData', JSON.stringify(data)); }

function earnXP(amount, trigger) {
    const data = getXPData();
    data.xp += amount;
    const newBadges = [];
    if (trigger === 'workout' && !data.badges.includes('first_workout')) { data.badges.push('first_workout'); newBadges.push('First Workout'); }
    if (trigger === 'meal' && !data.badges.includes('first_meal')) { data.badges.push('first_meal'); newBadges.push('First Bite'); }
    if (trigger === 'water' && !data.badges.includes('hydrated')) { data.badges.push('hydrated'); newBadges.push('Hydration Hero'); }
    if (trigger === 'bmi' && !data.badges.includes('bmi_check')) { data.badges.push('bmi_check'); newBadges.push('Know Yourself'); }
    if (data.xp >= 100 && !data.badges.includes('xp_100')) { data.badges.push('xp_100'); newBadges.push('On Fire'); }
    if (data.xp >= 500 && !data.badges.includes('xp_500')) { data.badges.push('xp_500'); newBadges.push('Champion'); }
    saveXPData(data);
    updateXPUI();
    renderBadges();
    setTimeout(() => showAlert('+' + amount + ' XP earned!'), 400);
    if (newBadges.length) setTimeout(() => showAlert('Badge unlocked: ' + newBadges.join(', ') + '!'), 1200);
}

function updateXPUI() {
    const xp = getXPData().xp;
    let level = 1;
    for (let i = 1; i < XP_LEVELS.length; i++) { if (xp >= XP_LEVELS[i]) level = i + 1; }
    const levelXP = XP_LEVELS[Math.min(level - 1, XP_LEVELS.length - 1)];
    const nextXP = XP_LEVELS[Math.min(level, XP_LEVELS.length - 1)];
    const pct = level >= XP_LEVELS.length ? 100 : Math.round(((xp - levelXP) / (nextXP - levelXP)) * 100);
    document.getElementById('xp-level').textContent = level;
    document.getElementById('xp-label').textContent = xp + ' XP';
    document.getElementById('xp-next-label').textContent = level >= XP_LEVELS.length ? 'MAX LEVEL!' : 'Next: ' + nextXP + ' XP';
    document.getElementById('xp-fill').style.width = pct + '%';
}

function renderBadges() {
    const badges = getXPData().badges;
    const grid = document.getElementById('badges-grid');
    grid.innerHTML = '';
    BADGES_DEF.forEach(b => {
        const unlocked = badges.includes(b.id);
        const div = document.createElement('div');
        div.title = b.desc;
        div.className = 'rounded-2xl p-3 text-center flex flex-col items-center gap-1 transition-all ' +
            (unlocked ? b.color + ' shadow-lg' : 'bg-slate-700 opacity-50');
        div.innerHTML =
            '<i class="' + b.icon + ' text-xl ' + (unlocked ? 'text-white' : 'text-slate-400') + '"></i>' +
            '<p class="text-xs font-bold leading-tight ' + (unlocked ? 'text-white' : 'text-slate-400') + '">' + b.label + '</p>' +
            (unlocked ? '<p class="text-[10px] text-white/70">Unlocked!</p>' : '<p class="text-[10px] text-slate-500">Locked</p>');
        grid.appendChild(div);
    });
}

/* ═══════════════════════════════════════
   MOTIVATIONAL QUOTES
═══════════════════════════════════════ */
const MOTIVATIONAL_QUOTES = [
    { text: "The only bad workout is the one that didn't happen.", author: "— Unknown" },
    { text: "Take care of your body. It's the only place you have to live.", author: "— Jim Rohn" },
    { text: "Sweat is just fat crying.", author: "— Unknown" },
    { text: "Push yourself, because no one else is going to do it for you.", author: "— Unknown" },
    { text: "The body achieves what the mind believes.", author: "— Unknown" },
    { text: "Don't stop when you're tired. Stop when you're done.", author: "— Unknown" },
    { text: "Your only limit is you.", author: "— Unknown" },
    { text: "Wake up with determination. Go to bed with satisfaction.", author: "— Unknown" },
    { text: "It always seems impossible until it's done.", author: "— Nelson Mandela" },
    { text: "Fitness is not about being better than someone else. It's about being better than you used to be.", author: "— Unknown" },
    { text: "The hard days are the best because that's when champions are made.", author: "— Gabrielle Douglas" },
    { text: "An hour of workout a day keeps the doctor away.", author: "— Unknown" },
    { text: "Success starts with self-discipline.", author: "— Unknown" },
    { text: "No matter how slow you go, you're still lapping everyone on the couch.", author: "— Unknown" },
    { text: "Be stronger than your excuses.", author: "— Unknown" },
    { text: "Believe in yourself and all that you are.", author: "— Christian D. Larson" },
    { text: "You are one workout away from a good mood.", author: "— Unknown" },
    { text: "Strive for progress, not perfection.", author: "— Unknown" },
    { text: "When you feel like quitting, remember why you started.", author: "— Unknown" },
    { text: "A little progress each day adds up to big results.", author: "— Unknown" },
    { text: "Train insane or remain the same.", author: "— Unknown" },
    { text: "The difference between try and triumph is a little umph.", author: "— Marvin Phillips" },
    { text: "Fall in love with taking care of yourself.", author: "— Unknown" },
    { text: "Health is wealth.", author: "— Unknown" },
    { text: "Your future self is watching you right now through your memories.", author: "— Aubrey de Grey" },
    { text: "Every champion was once a contender who refused to give up.", author: "— Rocky Balboa" },
    { text: "The pain you feel today will be the strength you feel tomorrow.", author: "— Unknown" },
    { text: "Energy and persistence conquer all things.", author: "— Benjamin Franklin" },
    { text: "Discipline is the bridge between goals and accomplishment.", author: "— Jim Rohn" },
    { text: "Make yourself proud.", author: "— Unknown" }
];

function showDailyQuote(firstName) {
    // Always show on every login — pick a fresh random quote
    const q = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
    document.getElementById('quote-text').textContent = '"' + q.text + '"';
    document.getElementById('quote-author').textContent = q.author;
    document.getElementById('quote-modal').classList.remove('hidden');
}

function closeQuoteModal() {
    document.getElementById('quote-modal').classList.add('hidden');
}

/* ═══════════════════════════════════════
   COMMUNITY FEATURE
═══════════════════════════════════════ */
let communityUser = { uid: null, name: 'Anonymous' };

function initCommunity(uid, name) {
    communityUser = { uid, name };
    updateStreakUI();
    checkAlreadyPostedToday();
    renderCommunityWall(); // re-render so delete buttons appear for owner
}

function initCommunityWall() {
    // Render wall on page load (no login required to view)
    renderCommunityWall();
}

function getPosts() {
    return JSON.parse(localStorage.getItem('communityPosts') || '[]');
}
function savePosts(posts) {
    localStorage.setItem('communityPosts', JSON.stringify(posts));
}

function getTodayStr() {
    return new Date().toDateString();
}

function checkAlreadyPostedToday() {
    if (!communityUser.uid) return;
    const posts = getPosts();
    const postedToday = posts.some(p => p.uid === communityUser.uid && p.date === getTodayStr());
    const alreadyBanner = document.getElementById('already-posted-today');
    const postBtn = document.getElementById('post-photo-btn');
    if (postedToday) {
        alreadyBanner.classList.remove('hidden');
        postBtn.disabled = true;
        postBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        alreadyBanner.classList.add('hidden');
        postBtn.disabled = false;
        postBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

function getStreakForUser(uid) {
    const posts = getPosts().filter(p => p.uid === uid);
    if (!posts.length) return { current: 0, best: 0 };
    // Unique dates
    const uniqueDates = [...new Set(posts.map(p => p.date))].sort((a, b) => new Date(b) - new Date(a));
    let current = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < uniqueDates.length; i++) {
        const d = new Date(uniqueDates[i]); d.setHours(0, 0, 0, 0);
        const expected = new Date(today); expected.setDate(today.getDate() - i);
        if (d.getTime() === expected.getTime()) current++;
        else break;
    }
    // Best streak
    let best = 0, streak = 1;
    const sorted = [...uniqueDates].sort((a, b) => new Date(a) - new Date(b));
    for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1]); prev.setHours(0, 0, 0, 0);
        const curr = new Date(sorted[i]); curr.setHours(0, 0, 0, 0);
        const diff = (curr - prev) / (1000 * 60 * 60 * 24);
        if (diff === 1) { streak++; best = Math.max(best, streak); }
        else streak = 1;
    }
    best = Math.max(best, current, 1);
    return { current, best };
}

function updateStreakUI() {
    if (!communityUser.uid) return;
    const { current, best } = getStreakForUser(communityUser.uid);
    document.getElementById('streak-count').textContent = current;
    document.getElementById('streak-best').textContent = best;
}

function previewPhoto(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const img = document.getElementById('upload-preview');
        img.src = e.target.result;
        img.classList.remove('hidden');
        document.getElementById('upload-placeholder').classList.add('hidden');
        document.getElementById('ai-analyze-row').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
    document.getElementById('upload-zone').classList.add('drag-over');
}

async function postCommunityPhoto() {
    if (!communityUser.uid) { showAlert('Please login to post to the community!'); return; }
    const fileInput = document.getElementById('community-photo-input');
    if (!fileInput.files[0]) { showAlert('Please select a photo first.'); return; }
    const btn = document.getElementById('post-photo-btn');
    btn.innerHTML = '<div class="spinner border-t-white border-2"></div> Posting...';
    btn.disabled = true;
    try {
        const base64 = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = rej;
            r.readAsDataURL(fileInput.files[0]);
        });
        const posts = getPosts();
        const { current } = getStreakForUser(communityUser.uid);
        const newPost = {
            id: Date.now(),
            uid: communityUser.uid,
            name: communityUser.name,
            photo: base64,
            date: getTodayStr(),
            streakDay: current + 1,
            likes: [],
            ts: Date.now()
        };
        posts.unshift(newPost);
        savePosts(posts);
        // Reset upload UI
        fileInput.value = '';
        document.getElementById('upload-preview').classList.add('hidden');
        document.getElementById('upload-placeholder').classList.remove('hidden');
        document.getElementById('upload-zone').classList.remove('drag-over');
        renderCommunityWall();
        updateStreakUI();
        checkAlreadyPostedToday();
        showAlert('Progress posted! 🎉 Streak updated!');
        earnXP(25, 'community');
    } catch (e) {
        showAlert('Failed to post. Image may be too large.');
        btn.disabled = false;
    }
    btn.innerHTML = '<i class="fas fa-share"></i> Share Progress';
}

function renderCommunityWall() {
    const posts = getPosts();
    const wall = document.getElementById('community-wall');
    const empty = document.getElementById('community-empty');
    const label = document.getElementById('post-count-label');
    label.textContent = posts.length + ' post' + (posts.length !== 1 ? 's' : '');
    [...wall.querySelectorAll('.community-card')].forEach(el => el.remove());
    if (!posts.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    posts.forEach(post => {
        const myLiked = communityUser.uid && post.likes.includes(communityUser.uid);
        const isOwner = communityUser.uid && communityUser.uid === post.uid;
        const comments = post.comments || [];
        const card = document.createElement('div');
        card.className = 'community-card bg-white border border-slate-100 shadow-sm';
        card.id = 'post-' + post.id;
        const initials = post.name.substring(0, 2).toUpperCase();
        card.innerHTML = `
    <img src="${post.photo}" class="community-photo" alt="Progress photo by ${post.name}" loading="lazy">
    <div class="p-4">
        <!-- Header row -->
        <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white text-xs font-black">${initials}</div>
                <div>
                    <p class="font-bold text-sm text-slate-800 leading-none">${post.name}</p>
                    <p class="text-xs text-slate-400">${post.date}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <span class="streak-badge"><i class="fas fa-fire"></i> Day ${post.streakDay}</span>
                ${isOwner ? `<button onclick="deletePost(${post.id})" title="Delete post" class="w-7 h-7 rounded-full bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 flex items-center justify-center text-xs transition"><i class="fas fa-trash-alt"></i></button>` : ''}
            </div>
        </div>
        <!-- Like + Comment toggle -->
        <div class="flex items-center gap-4 mt-3">
            <button id="like-${post.id}" onclick="toggleLike(${post.id})" class="like-btn flex items-center gap-1 text-sm font-bold text-slate-400 hover:text-red-500 transition ${myLiked ? 'liked' : ''}">
                <i class="fas fa-heart"></i>
                <span id="like-count-${post.id}">${post.likes.length}</span>
            </button>
            <button onclick="toggleComments(${post.id})" class="flex items-center gap-1 text-sm font-bold text-slate-400 hover:text-indigo-500 transition">
                <i class="fas fa-comment"></i>
                <span id="comment-count-${post.id}">${comments.length}</span>
            </button>
            <button onclick="analyzeProgressPhoto('wall', '${post.id}')" class="ml-auto flex items-center gap-1 text-xs font-bold text-violet-400 hover:text-violet-600 transition bg-violet-50 hover:bg-violet-100 px-2.5 py-1 rounded-lg">
                <i class="fas fa-robot"></i> AI Analyze
            </button>
        </div>
        <!-- Comments panel (hidden by default) -->
        <div id="comments-panel-${post.id}" class="hidden mt-3">
            <div id="comments-list-${post.id}" class="space-y-2 mb-3 max-h-40 overflow-y-auto" style="scrollbar-width:thin"></div>
            <div class="flex gap-2">
                <input id="comment-input-${post.id}" type="text" placeholder="Add a comment…"
                    class="flex-1 text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400"
                    onkeypress="if(event.key==='Enter') addComment(${post.id})">
                <button onclick="addComment(${post.id})" class="bg-indigo-500 text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-indigo-600 transition">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    </div>`;
        wall.appendChild(card);
        renderComments(post.id);
    });
}

function toggleComments(postId) {
    const panel = document.getElementById('comments-panel-' + postId);
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        document.getElementById('comment-input-' + postId).focus();
    }
}

function renderComments(postId) {
    const posts = getPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    const comments = post.comments || [];
    const list = document.getElementById('comments-list-' + postId);
    if (!list) return;
    list.innerHTML = '';
    if (!comments.length) {
        list.innerHTML = '<p class="text-xs text-slate-300 text-center py-2">No comments yet. Be the first!</p>';
        return;
    }
    comments.forEach(c => {
        const div = document.createElement('div');
        div.className = 'flex items-start gap-2';
        const isMyComment = communityUser.uid && c.uid === communityUser.uid;
        div.innerHTML = `
    <div class="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white text-[9px] font-black shrink-0">${c.name.substring(0, 2).toUpperCase()}</div>
    <div class="flex-1 bg-slate-50 rounded-xl px-2.5 py-1.5 relative">
        <p class="text-[10px] font-bold text-indigo-600">${c.name}</p>
        <p class="text-xs text-slate-700">${c.text}</p>
    </div>
    ${isMyComment ? `<button onclick="deleteComment(${postId}, '${c.cid}')" class="text-slate-300 hover:text-red-400 text-[10px] transition mt-1"><i class="fas fa-times"></i></button>` : ''}`;
        list.appendChild(div);
    });
    list.scrollTop = list.scrollHeight;
}

function addComment(postId) {
    if (!communityUser.uid) { showAlert('Login to comment!'); return; }
    const input = document.getElementById('comment-input-' + postId);
    const text = input.value.trim();
    if (!text) return;
    const posts = getPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    if (!post.comments) post.comments = [];
    post.comments.push({
        cid: Date.now().toString(),
        uid: communityUser.uid,
        name: communityUser.name,
        text,
        ts: Date.now()
    });
    savePosts(posts);
    input.value = '';
    // Update comment count badge
    const cnt = document.getElementById('comment-count-' + postId);
    if (cnt) cnt.textContent = post.comments.length;
    renderComments(postId);
}

function deleteComment(postId, cid) {
    const posts = getPosts();
    const post = posts.find(p => p.id === postId);
    if (!post || !post.comments) return;
    post.comments = post.comments.filter(c => c.cid !== cid);
    savePosts(posts);
    const cnt = document.getElementById('comment-count-' + postId);
    if (cnt) cnt.textContent = post.comments.length;
    renderComments(postId);
}

function deletePost(postId) {
    if (!communityUser.uid) return;
    const posts = getPosts();
    const post = posts.find(p => p.id === postId);
    if (!post || post.uid !== communityUser.uid) { showAlert('You can only delete your own posts.'); return; }
    if (!confirm('Delete this progress post?')) return;
    savePosts(posts.filter(p => p.id !== postId));
    const card = document.getElementById('post-' + postId);
    if (card) card.remove();
    const remaining = getPosts();
    const label = document.getElementById('post-count-label');
    if (label) label.textContent = remaining.length + ' post' + (remaining.length !== 1 ? 's' : '');
    if (!remaining.length) document.getElementById('community-empty').classList.remove('hidden');
    updateStreakUI();
    checkAlreadyPostedToday();
    showAlert('Post deleted.');
}

function toggleLike(postId) {
    if (!communityUser.uid) { showAlert('Login to like posts!'); return; }
    const posts = getPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    const idx = post.likes.indexOf(communityUser.uid);
    if (idx === -1) post.likes.push(communityUser.uid);
    else post.likes.splice(idx, 1);
    savePosts(posts);
    const btn = document.getElementById('like-' + postId);
    const cnt = document.getElementById('like-count-' + postId);
    if (btn) btn.classList.toggle('liked', idx === -1);
    if (cnt) cnt.textContent = post.likes.length;
}

/* ═══════════════════════════════════════
   AI PROGRESS ANALYSIS
═══════════════════════════════════════ */
async function analyzeProgressPhoto(source, postId) {
    // Determine base64 image source
    let base64 = null;
    let mimeType = 'image/jpeg';

    if (source === 'preview') {
        const fileInput = document.getElementById('community-photo-input');
        if (!fileInput.files[0]) { showAlert('Please select a photo first.'); return; }
        mimeType = fileInput.files[0].type || 'image/jpeg';
        base64 = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result.split(',')[1]);
            r.onerror = rej;
            r.readAsDataURL(fileInput.files[0]);
        });
    } else if (source === 'wall') {
        const posts = getPosts();
        const post = posts.find(p => String(p.id) === String(postId));
        if (!post || !post.photo) { showAlert('Could not load photo for analysis.'); return; }
        // post.photo is a full data URL
        const parts = post.photo.split(',');
        base64 = parts[1];
        mimeType = post.photo.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
    }

    if (!base64) { showAlert('No photo available to analyze.'); return; }

    // Show modal in loading state
    const modal = document.getElementById('ai-progress-modal');
    const loading = document.getElementById('ai-progress-loading');
    const result = document.getElementById('ai-progress-result');
    const errDiv = document.getElementById('ai-progress-error');
    modal.classList.remove('hidden');
    loading.classList.remove('hidden');
    result.classList.add('hidden');
    errDiv.classList.add('hidden');

    const systemPrompt = `You are an expert fitness coach and body composition analyst with 20 years of experience.
Analyze the provided progress photo and return ONLY valid JSON in this exact structure:
{
  "score": <integer 1-100 representing overall physique/progress quality>,
  "label": <short title like "Good Progress" | "Excellent Shape" | "Keep Going!">,
  "summary": <1-2 sentence overall assessment>,
  "positives": [<2-3 specific visible strengths or improvements>],
  "focus_areas": [<2-3 specific areas to work on>],
  "tips": [<2-3 actionable, personalized training/nutrition tips>],
  "motivation": <one powerful motivational sentence tailored to what you see>
}
Be encouraging, specific, and professional. If the image is not a fitness/body photo, still respond with valid JSON and score:0, label:"Not a fitness photo".`;

    try {
        const data = await fetchGeminiJSON(
            [
                { inlineData: { mimeType, data: base64 } },
                { text: 'Analyze this fitness progress photo and return the JSON analysis.' }
            ],
            systemPrompt
        );

        if (!data || typeof data.score === 'undefined') throw new Error('Invalid AI response');

        // Populate score ring
        const pct = Math.min(Math.max(data.score, 0), 100);
        const ring = document.getElementById('ai-score-ring');
        ring.style.setProperty('--pct', pct * 3.6 + 'deg');
        document.getElementById('ai-score-val').textContent = pct;
        document.getElementById('ai-score-label').textContent = data.label || '';
        document.getElementById('ai-score-desc').textContent = data.summary || '';

        // Build sections
        const body = document.getElementById('ai-result-body');
        body.innerHTML = '';
        const sections = [
            { icon: 'fa-thumbs-up', color: 'text-emerald-500', title: 'What\'s Looking Great', items: data.positives || [] },
            { icon: 'fa-bullseye', color: 'text-orange-500', title: 'Areas to Focus On', items: data.focus_areas || [] },
            { icon: 'fa-lightbulb', color: 'text-blue-500', title: 'Personalized Tips', items: data.tips || [] }
        ];
        sections.forEach(sec => {
            if (!sec.items.length) return;
            const div = document.createElement('div');
            div.className = 'ai-result-section';
            div.innerHTML = `
        <p class="text-xs font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <i class="fas ${sec.icon} ${sec.color}"></i> ${sec.title}
        </p>
        <ul class="space-y-1.5">
            ${sec.items.map(item => `<li class="text-sm text-slate-700 flex items-start gap-2"><i class="fas fa-check text-violet-400 mt-0.5 text-xs shrink-0"></i>${item}</li>`).join('')}
        </ul>`;
            body.appendChild(div);
        });
        // Motivation
        if (data.motivation) {
            const mot = document.createElement('div');
            mot.className = 'mt-4 bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-100 rounded-2xl p-4';
            mot.innerHTML = `<p class="text-sm font-bold text-violet-700 italic">"${data.motivation}"</p>`;
            body.appendChild(mot);
        }

        loading.classList.add('hidden');
        result.classList.remove('hidden');

    } catch (e) {
        console.error('AI progress analysis error:', e);
        loading.classList.add('hidden');
        errDiv.classList.remove('hidden');
        document.getElementById('ai-progress-error-msg').textContent = e.message || 'Please try again.';
    }
}

/* ═══════════════════════════════════════
   WORKOUT HISTORY + HEATMAP
═══════════════════════════════════════ */
function saveWorkoutLog(name, mins, calories) {
    const log = JSON.parse(localStorage.getItem('workoutHistory') || '[]');
    log.push({ date: new Date().toDateString(), name, mins, calories: calories || 0, ts: Date.now() });
    localStorage.setItem('workoutHistory', JSON.stringify(log));
    renderHeatmap();
    renderActivityLog();
}

function initWorkoutHistory() { renderHeatmap(); renderActivityLog(); }

function renderHeatmap() {
    const grid = document.getElementById('heatmap-grid');
    if (!grid) return;
    const log = JSON.parse(localStorage.getItem('workoutHistory') || '[]');
    const dateMap = {};
    log.forEach(l => { dateMap[l.date] = (dateMap[l.date] || 0) + 1; });
    grid.innerHTML = '';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 363; i >= 0; i--) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        const key = d.toDateString();
        const count = dateMap[key] || 0;
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        cell.title = `${key}: ${count} workout${count !== 1 ? 's' : ''}`;
        cell.dataset.i = count === 0 ? '0' : count === 1 ? '1' : count <= 3 ? '2' : '3';
        grid.appendChild(cell);
    }
}

function renderActivityLog() {
    const list = document.getElementById('activity-log-list');
    const empty = document.getElementById('activity-log-empty');
    if (!list) return;
    const log = JSON.parse(localStorage.getItem('workoutHistory') || '[]').slice().reverse().slice(0, 15);
    list.innerHTML = '';
    if (!log.length) { if (empty) empty.classList.remove('hidden'); return; }
    if (empty) empty.classList.add('hidden');
    log.forEach(l => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5';
        div.innerHTML = `
    <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-teal-100 rounded-xl flex items-center justify-center text-teal-600"><i class="fas fa-dumbbell text-xs"></i></div>
        <div><p class="font-bold text-sm text-slate-800">${l.name}</p><p class="text-xs text-slate-400">${l.date}</p></div>
    </div>
    <div class="text-right">
        <p class="font-black text-teal-600 text-sm">${l.calories} kcal</p>
        <p class="text-xs text-slate-400">${l.mins} min</p>
    </div>`;
        list.appendChild(div);
    });
}

/* ═══════════════════════════════════════
   BODY MEASUREMENTS
═══════════════════════════════════════ */
let measurementChart;
function initMeasurements() { renderMeasurementChart(); showLatestMeasurement(); }

function saveMeasurement() {
    const fields = ['chest', 'waist', 'hips', 'arms', 'thighs'];
    const entry = { date: new Date().toDateString(), ts: Date.now() };
    let hasValue = false;
    fields.forEach(f => {
        const v = parseFloat(document.getElementById('meas-' + f).value);
        if (!isNaN(v) && v > 0) { entry[f] = v; hasValue = true; }
    });
    if (!hasValue) { showAlert('Enter at least one measurement.'); return; }
    const history = JSON.parse(localStorage.getItem('measurementHistory') || '[]');
    history.push(entry);
    localStorage.setItem('measurementHistory', JSON.stringify(history));
    fields.forEach(f => { document.getElementById('meas-' + f).value = ''; });
    renderMeasurementChart();
    showLatestMeasurement();
    showAlert('Measurements saved! 📏');
    earnXP(10, 'measurement');
}

function showLatestMeasurement() {
    const history = JSON.parse(localStorage.getItem('measurementHistory') || '[]');
    const box = document.getElementById('meas-latest');
    const content = document.getElementById('meas-latest-content');
    if (!history.length || !box) return;
    const last = history[history.length - 1];
    box.classList.remove('hidden');
    const fields = { chest: 'Chest', waist: 'Waist', hips: 'Hips', arms: 'Arms', thighs: 'Thighs' };
    content.innerHTML = Object.entries(fields).filter(([k]) => last[k]).map(([k, label]) =>
        `<div class="bg-white rounded-lg px-3 py-2 border border-pink-100"><p class="text-[10px] font-bold text-pink-400 uppercase">${label}</p><p class="font-black text-slate-800">${last[k]} cm</p></div>`
    ).join('');
}

function renderMeasurementChart() {
    const history = JSON.parse(localStorage.getItem('measurementHistory') || '[]');
    const emptyMsg = document.getElementById('meas-empty');
    const ctx = document.getElementById('measurementChart');
    if (!ctx) return;
    if (!history.length) { if (emptyMsg) emptyMsg.classList.remove('hidden'); return; }
    if (emptyMsg) emptyMsg.classList.add('hidden');
    const labels = history.map(e => e.date);
    const defs = [
        { key: 'waist', label: 'Waist', color: '#ef4444' },
        { key: 'chest', label: 'Chest', color: '#3b82f6' },
        { key: 'hips', label: 'Hips', color: '#a855f7' },
        { key: 'arms', label: 'Arms', color: '#10b981' },
        { key: 'thighs', label: 'Thighs', color: '#f59e0b' }
    ];
    const datasets = defs.map(d => ({
        label: d.label, data: history.map(e => e[d.key] || null),
        borderColor: d.color, backgroundColor: d.color + '20',
        tension: 0.3, fill: false, pointRadius: 4, spanGaps: true
    }));
    if (measurementChart) measurementChart.destroy();
    measurementChart = new Chart(ctx, {
        type: 'line', data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
            scales: { y: { beginAtZero: false, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }
        }
    });
}

/* ═══════════════════════════════════════
   WEEKLY REPORT CARD
═══════════════════════════════════════ */
function showReportCard() {
    const xpData = getXPData();
    const waterData = JSON.parse(localStorage.getItem('waterData') || '{}');
    const workoutLog = JSON.parse(localStorage.getItem('workoutHistory') || '[]');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
    const thisWeek = workoutLog.filter(l => new Date(l.date) >= weekAgo);
    const totalBurned = thisWeek.reduce((s, l) => s + (l.calories || 0), 0);
    const daysActive = new Set(thisWeek.map(l => l.date)).size;
    const streak = communityUser.uid ? getStreakForUser(communityUser.uid).current : 0;

    document.getElementById('rc-days').textContent = daysActive;
    document.getElementById('rc-calories').textContent = totalBurned;
    document.getElementById('rc-water').textContent = waterData.count || 0;
    document.getElementById('rc-streak').textContent = streak;
    document.getElementById('rc-xp').textContent = xpData.xp;
    document.getElementById('rc-level').textContent = document.getElementById('xp-level').textContent;

    const msgs = [
        daysActive >= 5 ? '🔥 Incredible week — 5+ active days!' : null,
        daysActive >= 3 ? '💪 Great effort this week!' : null,
        totalBurned > 2000 ? '🏆 Over 2000 calories burned — champion level!' : null,
        streak >= 7 ? `🌟 ${streak}-day streak — unstoppable!` : null,
        '✨ Keep showing up. Every rep counts!'
    ].filter(Boolean);
    document.getElementById('rc-message').textContent = msgs[0];
    document.getElementById('report-card-modal').classList.remove('hidden');
}

/* ═══════════════════════════════════════
   SMS + PUSH REMINDERS
═══════════════════════════════════════ */
let reminderInterval;

function initReminders() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    loadReminderSettings();
    scheduleReminderCheck();
}

/* ── Twilio credentials are loaded from config.js (gitignored) ── */

function loadReminderSettings() {
    const s = JSON.parse(localStorage.getItem('reminderSettings') || '{}');
    const phoneEl = document.getElementById('sms-phone');
    const enEl = document.getElementById('sms-enabled');
    if (phoneEl && s.phone) phoneEl.value = s.phone;
    if (enEl && s.enabled) enEl.checked = true;
}

function saveReminderSettings() {
    const existing = JSON.parse(localStorage.getItem('reminderSettings') || '{}');
    const settings = {
        ...existing,
        phone: document.getElementById('sms-phone').value.trim(),
        enabled: document.getElementById('sms-enabled').checked
    };
    localStorage.setItem('reminderSettings', JSON.stringify(settings));
    document.getElementById('sms-modal').classList.add('hidden');
    showAlert('Reminder settings saved! 🔔');
    scheduleReminderCheck();
}

async function sendTestSMS() {
    const btn = document.getElementById('test-sms-btn');
    const confirm = document.getElementById('sms-confirm');
    const detail = document.getElementById('sms-confirm-detail');
    const timeEl = document.getElementById('sms-confirm-time');

    // Loading state
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner border-violet-500 border-t-transparent" style="width:18px;height:18px;border-width:3px"></div> Sending…';
    confirm.classList.add('hidden');

    const settings = JSON.parse(localStorage.getItem('reminderSettings') || '{}');
    const msg = '🏋️ Test from FitChitkara! Your reminders are now active. Stay hydrated! 💧';

    // Always attempt, even if enabled is off
    let sent = false;

    // 1. Browser push notification
    if ('Notification' in window) {
        if (Notification.permission === 'granted') {
            new Notification('FitChitkara 💪', { body: msg });
            sent = true;
        } else if (Notification.permission !== 'denied') {
            const perm = await Notification.requestPermission();
            if (perm === 'granted') { new Notification('FitChitkara 💪', { body: msg }); sent = true; }
        }
    }

    // 2. Twilio SMS (via corsproxy.io to bypass CORS) — credentials from config.js
    const fresh = {
        ...settings,
        accountSid: twilioConfig.accountSid,
        authToken: twilioConfig.authToken,
        fromNumber: twilioConfig.fromNumber
    };
    if (fresh.accountSid && fresh.authToken && fresh.fromNumber && fresh.phone) {
        try {
            const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${fresh.accountSid}/Messages.json`;
            const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(twilioUrl);
            const body = new URLSearchParams({ To: fresh.phone, From: fresh.fromNumber, Body: msg });
            const res = await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Authorization': 'Basic ' + btoa(fresh.accountSid + ':' + fresh.authToken),
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body
            });
            if (res.ok) sent = true;
        } catch (e) { console.warn('Twilio error:', e); }
    }

    // Reset button
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Test SMS';

    // Show confirmation card
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    detail.textContent = fresh.phone
        ? `Browser notification + SMS attempted to ${fresh.phone}`
        : 'Browser push notification sent (no phone number saved).';
    timeEl.textContent = 'Sent at ' + timeStr;
    confirm.classList.remove('hidden');
}

async function sendSMSReminder(message, settings) {
    if (!settings) settings = JSON.parse(localStorage.getItem('reminderSettings') || '{}');
    if (!settings.enabled) return;

    // Browser push notification
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('FitChitkara 💪', { body: message });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') new Notification('FitChitkara 💪', { body: message });
    }

    // SMS via Twilio REST API — credentials from config.js
    const base = JSON.parse(localStorage.getItem('reminderSettings') || '{}');
    const latest = {
        ...base,
        accountSid: twilioConfig.accountSid,
        authToken: twilioConfig.authToken,
        fromNumber: twilioConfig.fromNumber
    };
    if (latest.accountSid && latest.authToken && latest.fromNumber && latest.phone) {
        try {
            const url = `https://api.twilio.com/2010-04-01/Accounts/${latest.accountSid}/Messages.json`;
            const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
            const body = new URLSearchParams({ To: latest.phone, From: latest.fromNumber, Body: message });
            await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Authorization': 'Basic ' + btoa(latest.accountSid + ':' + latest.authToken),
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body
            });
        } catch (e) { console.warn('Twilio SMS error:', e); }
    }
}

/* ─── Sample Reminder Quick-Send ─── */
async function sendSampleReminder(type) {
    const msgs = {
        water: '💧 Hydration check! Time to drink a glass of water. Stay healthy with FitChitkara! 🏋️',
        food: '🍱 Don\'t forget to log your meal! Track your calories and nutrition on FitChitkara. 🥗',
        exercise: '🏋️ Time to move! Log your workout and keep your streak alive on FitChitkara. 💪',
        sleep: '🌙 Wind down time! Aim for 7–8 hours of sleep for best recovery. Goodnight from FitChitkara! 😴'
    };
    const message = msgs[type] || '💡 Stay on track with FitChitkara!';

    // Find the clicked button and show loading state
    const btn = event.currentTarget;
    const origHTML = btn.innerHTML;
    btn.innerHTML = '<div class="spinner border-violet-500 border-t-transparent" style="width:16px;height:16px;border-width:2px"></div> <span>Sending…</span>';
    btn.disabled = true;

    // Browser push
    if ('Notification' in window) {
        if (Notification.permission === 'granted') {
            new Notification('FitChitkara 💪', { body: message });
        } else if (Notification.permission !== 'denied') {
            const perm = await Notification.requestPermission();
            if (perm === 'granted') new Notification('FitChitkara 💪', { body: message });
        }
    }

    // Twilio SMS — credentials from config.js
    const base2 = JSON.parse(localStorage.getItem('reminderSettings') || '{}');
    const s = {
        ...base2,
        accountSid: twilioConfig.accountSid,
        authToken: twilioConfig.authToken,
        fromNumber: twilioConfig.fromNumber
    };
    if (s.accountSid && s.authToken && s.fromNumber && s.phone) {
        try {
            const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${s.accountSid}/Messages.json`;
            const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(twilioUrl);
            const body = new URLSearchParams({ To: s.phone, From: s.fromNumber, Body: message });
            await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Authorization': 'Basic ' + btoa(s.accountSid + ':' + s.authToken),
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body
            });
        } catch (e) { console.warn('Sample SMS error:', e); }
    }

    btn.innerHTML = origHTML;
    btn.disabled = false;

    // Show confirm panel
    const detail = document.getElementById('sms-confirm-detail');
    const timeEl = document.getElementById('sms-confirm-time');
    const confirm = document.getElementById('sms-confirm');
    detail.textContent = s.phone
        ? `Sample reminder sent to ${s.phone}`
        : 'Browser notification sent (save a phone number to also send SMS).';
    timeEl.textContent = 'Sent at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    // Update the preview bubble text using the dedicated ID
    const bubble = document.getElementById('sms-preview-bubble');
    if (bubble) bubble.textContent = message;
    confirm.classList.remove('hidden');
}

function scheduleReminderCheck() {
    if (reminderInterval) clearInterval(reminderInterval);
    reminderInterval = setInterval(() => {
        const settings = JSON.parse(localStorage.getItem('reminderSettings') || '{}');
        if (!settings.enabled) return;
        const h = new Date().getHours(), m = new Date().getMinutes();
        if (h === 8 && m === 0) sendSMSReminder('💧 Good morning! Time to start hydrating. Log your first glass on FitChitkara!', settings);
        if (h === 12 && m === 0) sendSMSReminder('🍱 Lunchtime! Don\'t forget to log your meal and track your calories on FitChitkara.', settings);
        if (h === 18 && m === 0) sendSMSReminder('🏋️ Evening workout time! Log your exercise and keep that streak alive on FitChitkara!', settings);
        if (h === 21 && m === 0) sendSMSReminder('💧 Final water check! Have you hit your 8 glasses today? Log it on FitChitkara!', settings);
    }, 60000);
}
/* ─── Mobile Menu ─── */
function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    const icon = document.getElementById('hamburger-icon');
    const isHidden = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !isHidden);
    icon.className = isHidden ? 'fas fa-times' : 'fas fa-bars';
}
function closeMobileMenu() {
    document.getElementById('mobile-menu').classList.add('hidden');
    document.getElementById('hamburger-icon').className = 'fas fa-bars';
}
// Close mobile menu on outside click
document.addEventListener('click', e => {
    const nav = document.getElementById('main-nav');
    const menu = document.getElementById('mobile-menu');
    if (nav && menu && !nav.contains(e.target)) closeMobileMenu();
});

/* ── Footer Live Stats Sync ── */
function syncFooterStats() {
    try {
        const cal = parseInt(document.getElementById('total-calories')?.textContent || '0', 10);
        const water = parseInt(document.getElementById('water-count-label')?.textContent?.split('/')[0] || '0', 10);
        const xp = parseInt(document.getElementById('xp-label')?.textContent?.replace(' XP', '') || '0', 10);
        const streak = parseInt(document.getElementById('streak-count')?.textContent || '0', 10);
        const fc = document.getElementById('footer-calories');
        const fw = document.getElementById('footer-water');
        const fx = document.getElementById('footer-xp');
        const fs = document.getElementById('footer-streak');
        if (fc) fc.textContent = cal;
        if (fw) fw.textContent = water;
        if (fx) fx.textContent = xp;
        if (fs) fs.textContent = streak;
    } catch (e) { }
}
setInterval(syncFooterStats, 2000);
window.addEventListener('load', () => setTimeout(syncFooterStats, 1000));

