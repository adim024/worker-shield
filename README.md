# GigShield Insurance

A high-quality, responsive Single Page Application (SPA) designed to serve as an instant, micro-insurance platform for gig economy delivery workers.

## Project Stack
- **Frontend**: Vanilla HTML/JS/CSS, Chart.js
- **Backend API**: Node.js & Express.js
- **Database**: SQLite3 (Local file-based driver)

## Features
- **5-Step Onboarding**: DigiLocker Mock Verification -> Work Profile Selection -> Fake Quoting -> Razorpay Mock Checkout.
- **Dynamic Dashboard**: Geolocation + Weather widgets utilizing Open-Meteo mapping.
- **AI Claims Handling**: Flow mapping user claim injections into SQLite tracking tables.

## How to Run Locally

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Rename `.env.example` to `.env` or just proceed (default settings apply).

3. **Start the Server**
   ```bash
   npm start
   ```

4. **Navigate**
   Open your browser to `http://localhost:3000`

## Deployment Strategy
Because this uses a local SQLite database file, it requires a persistent filesystem. Standard serverless functions (like Vercel or standard Netlify) will **lose your database saves upon refresh/spin-down**.

**For live Free-Tier deployments:** Always configure via Node hosting services like [Render.com](https://render.com) (Web Service mode) or [Railway.app](https://railway.app), leveraging their underlying volume mounts or simply accepting the DB clears on restarts for hackathons.
