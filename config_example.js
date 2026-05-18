// ═══════════════════════════════════════════════════════════════
//  config.js  —  API Keys & Third-Party Service Initialisation
//  ⚠️  Do NOT commit this file to a public repository.
//      Add config.js to your .gitignore file.
// ═══════════════════════════════════════════════════════════════

/* ─── Firebase Config ─── */
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_DOMAIN",
    projectId: "fitchitkara",
    storageBucket: "fitchitkara.firebasestorage.app",
    messagingSenderId: "FIREBASE_ID",
    appId: "APP_ID",
    measurementId: "MEASUREMENT_ID"
};

/* ─── EmailJS Config ─── */
const emailjsConfig = {
    publicKey: "YOUR_PUBLIC_KEY",
    serviceId: "YOUR_SERVICE_ID",
    templateId: "TEMPLATE_ID"   // template vars: {{otp}}, {{to_email}}
};

/* ─── Gemini AI Key ─── */
const geminiKey = "YOUR_GEMINI_KEY";

/* ─── YouTube Data API v3 Key ─── */
const youtubeKey = "YOUR_YOUTUBE_KEY";

/* ─── Twilio SMS Config ─── */
const twilioConfig = {
    accountSid:  "YOUR_TWILIO_ACCOUNT_SID",
    authToken:   "YOUR_TWILIO_AUTH_TOKEN",
    fromNumber:  "YOUR_TWILIO_PHONE_NUMBER"   // e.g. "+1XXXXXXXXXX"
};

/* ── Init Firebase & EmailJS ── */
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();
emailjs.init(emailjsConfig.publicKey);
