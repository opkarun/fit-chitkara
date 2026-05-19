# 🏋️ Fit-Chitkara Pro — AI Health Ecosystem

A feature-rich, AI-powered personal fitness and health tracking web application built for Chitkara University students and beyond. Track workouts, nutrition, sleep, hydration, and body measurements — all in one beautifully designed dashboard.

---
---
---
## ✨ Features

| Category | Features |
|---|---|
| 🏃 **Workouts** | Log exercises, auto-fetch YouTube demo videos, calorie burn tracking, workout history heatmap |
| 🍱 **Nutrition** | Meal logging, AI-powered calorie estimation (Gemini), custom food templates |
| 💧 **Hydration** | Daily water intake tracker with visual progress |
| 😴 **Sleep** | Sleep logging and quality tracking |
| 📏 **Body Measurements** | Weight, height, BMI, and custom body metric history |
| 🔥 **Gamification** | XP points, leveling system, streak counter, weekly Report Card |
| 📊 **Dashboard** | Daily overview with charts (Chart.js), calorie balance, performance trends |
| 🔔 **Reminders** | SMS reminders via Twilio + browser push notifications (water, food, exercise, sleep) |
| 🤖 **AI** | Google Gemini AI for calorie estimation and smart insights |
| 🔐 **Auth** | Firebase Authentication (Email/Password + Google OAuth) with OTP email verification via EmailJS |
| 👥 **Community** | Community & motivation section |

---

## 📁 Project Structure

```
fit-chitkara/
├── index.html          # Main application (single-page app)
├── style.css           # Custom styles
├── script.js           # All application logic
├── config.js           # 🔒 Your private API keys (gitignored — DO NOT commit)
├── config_example.js   # ✅ Template — copy this to create config.js
├── image.png           # App favicon/logo
├── .gitignore          # Ensures config.js is never committed
└── README.md           # This file
```

---

## 🚀 Getting Started

### Prerequisites

This is a pure **HTML + CSS + JavaScript** app — no build tools or package managers required. You just need:

- A modern browser (Chrome, Firefox, Edge)
- A local web server (recommended) **or** open `index.html` directly in your browser

> **Tip:** For the best experience use VS Code with the **Live Server** extension — right-click `index.html` → *Open with Live Server*.

---

### 1. Clone the repository

```bash
git clone https://github.com/opkarun/fit-chitkara.git
cd fit-chitkara
```

---

### 2. Set up your `config.js`

This is the **most important step**. The app requires several API keys to function. These are stored in `config.js`, which is intentionally excluded from Git.

**Copy the example file:**

```bash
# Windows (PowerShell)
Copy-Item config_example.js config.js

# macOS / Linux
cp config_example.js config.js
```

Then open `config.js` and fill in your credentials (see [API Keys Setup](#-api-keys-setup) below).

---

### 3. Open the app

Open `index.html` in your browser or start a local dev server:

```bash
# Using VS Code Live Server (recommended)
# Right-click index.html → Open with Live Server

# Using Python (if installed)
python -m http.server 8080
# Then visit http://localhost:8080
```

---

## 🔑 API Keys Setup

All keys go inside `config.js`. Here's where to get each one:

---

### 🔥 Firebase (Authentication)

Used for user login, Google OAuth, and password reset.

1. Go to [Firebase Console](https://console.firebase.google.com/) → Create a project
2. Add a **Web app** to the project
3. Enable **Authentication** → Sign-in methods → Enable **Email/Password** and **Google**
4. Copy your config object into `config.js`:

```js
const firebaseConfig = {
    apiKey:            "YOUR_API_KEY",
    authDomain:        "your-project.firebaseapp.com",
    projectId:         "your-project-id",
    storageBucket:     "your-project.firebasestorage.app",
    messagingSenderId: "YOUR_SENDER_ID",
    appId:             "YOUR_APP_ID",
    measurementId:     "YOUR_MEASUREMENT_ID"
};
```

---

### 📧 EmailJS (OTP Email Delivery)

Used to send one-time password emails for email verification.

1. Sign up at [EmailJS](https://www.emailjs.com/)
2. Create an **Email Service** (e.g. Gmail) → note the **Service ID**
3. Create an **Email Template** with variables `{{otp}}` and `{{to_email}}` → note the **Template ID**
4. Copy your **Public Key** from Account → API Keys
5. Fill in `config.js`:

```js
const emailjsConfig = {
    publicKey:  "YOUR_PUBLIC_KEY",
    serviceId:  "YOUR_SERVICE_ID",
    templateId: "YOUR_TEMPLATE_ID"
};
```

---

### 🤖 Google Gemini AI Key

Used for AI-powered calorie estimation.

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create an API key
3. Add to `config.js`:

```js
const geminiKey = "YOUR_GEMINI_API_KEY";
```

---

### 📺 YouTube Data API v3

Used to auto-fetch exercise demonstration videos.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **YouTube Data API v3**
3. Create an **API Key** under Credentials
4. Add to `config.js`:

```js
const youtubeKey = "YOUR_YOUTUBE_API_KEY";
```

---

### 📱 Twilio SMS (Reminders)

Used to send SMS reminders for water, food, exercise, and sleep.

1. Sign up at [Twilio](https://www.twilio.com/)
2. From your [Twilio Console](https://console.twilio.com/):
   - Copy your **Account SID**
   - Copy your **Auth Token**
   - Get a **Twilio phone number** (free trial number works)
3. Add to `config.js`:

```js
const twilioConfig = {
    accountSid: "YOUR_ACCOUNT_SID",   // starts with "AC..."
    authToken:  "YOUR_AUTH_TOKEN",
    fromNumber: "+1XXXXXXXXXX"        // your Twilio phone number
};
```

> **Note:** SMS is sent via the Twilio REST API using a CORS proxy. Make sure the destination number is **verified** in your Twilio trial account.

---

## ⚙️ Complete `config.js` Template

Here's what a fully configured `config.js` looks like:

```js
// ═══════════════════════════════════════════════════════════════
//  config.js  —  API Keys & Third-Party Service Initialisation
//  ⚠️  Do NOT commit this file. It is listed in .gitignore.
// ═══════════════════════════════════════════════════════════════

const firebaseConfig = {
    apiKey:            "AIzaSy...",
    authDomain:        "your-project.firebaseapp.com",
    projectId:         "your-project-id",
    storageBucket:     "your-project.firebasestorage.app",
    messagingSenderId: "123456789",
    appId:             "1:123...",
    measurementId:     "G-XXXXX"
};

const emailjsConfig = {
    publicKey:  "abc123...",
    serviceId:  "service_xxxxxx",
    templateId: "template_xxxxxx"
};

const geminiKey   = "AIzaSy...";
const youtubeKey  = "AIzaSy...";

const twilioConfig = {
    accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    authToken:  "your_auth_token",
    fromNumber: "+12602865333"
};

// ── Init Firebase & EmailJS ──
firebase.initializeApp(firebaseConfig);
const auth           = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();
emailjs.init(emailjsConfig.publicKey);
```

---

## 🔒 Security Notes

- `config.js` is listed in `.gitignore` and will **never** be committed to GitHub
- `config_example.js` (with placeholder values) is committed so collaborators know which keys to fill in
- Never share your `config.js` or paste real credentials in issues / pull requests
- For production deployments, consider moving to a backend proxy to avoid exposing keys client-side

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| HTML5 / CSS3 / Vanilla JS | Core structure, styling, and logic |
| [Tailwind CSS](https://tailwindcss.com/) (CDN) | Utility-first styling |
| [Chart.js](https://www.chartjs.org/) | Dashboard charts and graphs |
| [Firebase Auth](https://firebase.google.com/products/auth) | User authentication |
| [EmailJS](https://www.emailjs.com/) | OTP email delivery |
| [Google Gemini AI](https://ai.google.dev/) | AI calorie estimation |
| [YouTube Data API v3](https://developers.google.com/youtube/v3) | Exercise video demos |
| [Twilio](https://www.twilio.com/) | SMS reminders |
| [Font Awesome](https://fontawesome.com/) | Icons |
| [Google Fonts](https://fonts.google.com/) | Typography (Outfit, Space Grotesk, DM Sans) |

---

## 🤝 Contributing

1. Fork the repository
2. Follow the [Getting Started](#-getting-started) steps to set up your own `config.js`
3. Make your changes
4. Open a pull request — **never include `config.js` in your PR**

---

## 📄 License

This project is developed for educational purposes at Chitkara University.
