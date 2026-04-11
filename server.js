require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDB } = require('./database');
const { GoogleGenAI } = require('@google/genai');
const twilio = require('twilio');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const MLModelService = require('./mlService');

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const JWT_SECRET = process.env.JWT_SECRET || 'gigshield_secret_key';

const fs = require('fs');
const multer = require('multer');
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, 'public/uploads/'),
        filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
    })
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Middlewares
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ error: 'No token provided' });
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Unauthorized' });
        req.user = decoded;
        next();
    });
}

function isAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') next();
    else res.status(403).json({ error: 'Require Admin Role' });
}

let db;
const otpStore = new Map(); // Store temporary OTPs

async function start() {
    db = await initializeDB();
    
    // Auth Routes
    app.post('/api/auth/signup', async (req, res) => {
        const { name, email, password } = req.body;
        try {
            const existing = await db.get('SELECT * FROM users WHERE email = ?', [email]);
            if (existing) return res.status(400).json({ error: 'Email already exists' });
            
            const hashedPassword = await bcrypt.hash(password, 10);
            const result = await db.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [name, email, hashedPassword, 'user']);
            
            const token = jwt.sign({ id: result.lastID, role: 'user' }, JWT_SECRET, { expiresIn: '24h' });
            res.json({ success: true, token, user: { id: result.lastID, name, email, role: 'user' } });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Signup failed' });
        }
    });

    app.post('/api/auth/login', async (req, res) => {
        const { email, password } = req.body;
        try {
            const adminEmail = process.env.ADMIN_EMAIL || 'admin@gigshield.com';
            const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
            
            if (email === adminEmail) {
                if (password !== adminPass) return res.status(400).json({ error: 'Invalid credentials' });
                const token = jwt.sign({ id: 0, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
                return res.json({ success: true, token, user: { id: 0, name: 'Admin', email: adminEmail, role: 'admin' } });
            }

            const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
            if (!user || !user.password) return res.status(400).json({ error: 'Invalid credentials' });
            
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });
            
            const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
            res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
        } catch (e) {
            res.status(500).json({ error: 'Login failed' });
        }
    });

    // Verification route to handle token-based sessions
    app.get('/api/auth/me', verifyToken, async (req, res) => {
        const user = await db.get('SELECT id, name, email, role, phone, work_type FROM users WHERE id = ?', [req.user.id]);
        if(!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user });
    });

    // OTP Auth Routes (Legacy/Fallback)
    app.post('/api/auth/otp/send', async (req, res) => {
        const { phone } = req.body;
        
        // Generate a 4-digit OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        otpStore.set(phone, otp);

        try {
            if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
                const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                const formattedPhone = phone.startsWith('+') ? phone : '+91' + phone;
                
                await client.messages.create({
                    from: `whatsapp:${process.env.TWILIO_WA_NUMBER || '+14155238886'}`,
                    body: `*GigShield:* Your login OTP is ${otp}. Do not share this code with anyone.`,
                    to: `whatsapp:${formattedPhone}`
                });
                console.log(`[Twilio SDK] WhatsApp OTP sent natively to ${formattedPhone}`);
            } else {
                console.log(`[WhatsApp Mock Fallback] Missing TWILIO_ACCOUNT_SID. OTP is ${otp} for ${phone}`);
            }
            res.json({ success: true, message: 'OTP processed' });
        } catch (err) {
            console.error("Error sending WhatsApp OTP via Twilio:", err.message);
            console.log(`[Fallback Mock] OTP is ${otp} for ${phone}`);
            res.json({ success: true, message: 'OTP processed (fallback)' });
        }
    });

    app.post('/api/auth/otp/verify', async (req, res) => {
        const { phone, otp } = req.body;
        
        if(!otp || otp.length < 4) {
            return res.status(400).json({ error: 'Invalid OTP length' });
        }
        
        let user = await db.get('SELECT * FROM users WHERE phone = ?', [phone]);
        if (!user) {
            const result = await db.run('INSERT INTO users (phone, role) VALUES (?, ?)', [phone, 'user']);
            user = { id: result.lastID, phone, role: 'user' };
        }
        
        const token = jwt.sign({ id: user.id, role: user.role || 'user' }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, user });
    });

    // KYC / DigiLocker Route
    app.post('/api/kyc/digilocker', async (req, res) => {
        const { userId } = req.body;
        try {
            if (process.env.DIGILOCKER_CLIENT_ID && process.env.DIGILOCKER_SECRET_KEY) {
                // Production: Call verified IndiaStack Aggregator (Setu/Zoop) passing Auth secrets
                // Generic mock URL endpoint since Setu URLs change
                const response = await fetch('https://api.setu.co/api/okyc', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DIGILOCKER_SECRET_KEY}` },
                    body: JSON.stringify({ userId: userId })
                });
                if(response.ok) {
                    const kycData = await response.json();
                    await db.run('UPDATE users SET name = ?, aadhaar = ? WHERE id = ?', [kycData.name, kycData.uid, userId]);
                    return res.json({ success: true, name: kycData.name, aadhaar: kycData.uid });
                } else throw new Error("IndiaStack Auth Rejected");
            } else {
                // Fallback Mock structure
                const verifiedName = "Ravi Kumar (Mock Match)";
                const verifiedAadhaar = "XXXX-XXXX-8921";
                await db.run('UPDATE users SET name = ?, aadhaar = ? WHERE id = ?', [verifiedName, verifiedAadhaar, userId]);
                res.json({ success: true, name: verifiedName, aadhaar: verifiedAadhaar });
            }
        } catch(e) {
            console.error("DigiLocker Error:", e.message);
            res.status(500).json({ error: "KYC Aggregation Failure" });
        }
    });
    app.post('/api/user/workprofile', async (req, res) => {
        const { userId, workType } = req.body;
        await db.run('UPDATE users SET work_type = ? WHERE id = ?', [workType, userId]);
        
        // XGBoost Risk Model
        const riskData = MLModelService.predictRiskPremium({ workType });
        
        res.json({ 
            success: true, 
            recommendedPlan: 'Standard (Stability)', 
            premium: riskData.predicted_premium,
            aiRiskFactors: riskData.xgboost_feature_importance
        });
    });

    // Payments Route
    app.post('/api/payments/create-order', async (req, res) => {
        const { userId, planType, premium } = req.body;
        await db.run('INSERT INTO policies (user_id, active_status, coverage_amount, plan_type) VALUES (?, ?, ?, ?)',
            [userId, true, 200000, planType]
        );

        if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
            try {
                const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
                const order = await rzp.orders.create({ amount: premium * 100, currency: "INR", receipt: "receipt_" + userId });
                return res.json({ success: true, orderId: order.id, key: process.env.RAZORPAY_KEY_ID });
            } catch(e) {
                console.error("Razorpay error capturing order:", e);
                return res.status(500).json({ error: "Razorpay Native Core Error" });
            }
        } else {
            console.warn("Generating Mock Order fallback");
            const orderId = 'order_mock_' + Math.random().toString(36).substr(2, 9);
            return res.json({ success: true, orderId: orderId, key: 'rzp_test_mock123' });
        }
    });

    app.post('/api/payments/verify', async (req, res) => {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        if(process.env.RAZORPAY_KEY_SECRET) {
            const body = razorpay_order_id + "|" + razorpay_payment_id;
            const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body.toString()).digest('hex');
            if (expectedSignature === razorpay_signature) {
                res.json({ success: true, message: "Payment verified natively" });
            } else {
                res.status(400).json({ success: false, error: "Invalid cryptographic signature" });
            }
        } else {
            res.json({ success: true, message: "Payment verified (mock fallback)" });
        }
    });

    // Dashboard Data
    app.get('/api/user/dashboard/:userId', async (req, res) => {
        const userId = req.params.userId;
        const policy = await db.get('SELECT * FROM policies WHERE user_id = ? ORDER BY start_date DESC', [userId]);
        const claims = await db.all('SELECT * FROM claims WHERE user_id = ? ORDER BY date DESC', [userId]);
        const approvedAmount = await db.get(`SELECT SUM(amount) as total FROM claims WHERE user_id = ? AND status LIKE '%Paid%'`, [userId]);
        res.json({ activePolicy: policy, claims, totalApproved: approvedAmount ? approvedAmount.total || 0 : 0 });
    });

    // File a Claim
    app.post('/api/claims/file', verifyToken, upload.fields([{ name: 'files', maxCount: 5 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
        const userId = req.user.id;
        const { title, description, incidentType } = req.body;
        
        let fileUrls = [];
        let videoUrl = null;
        if (req.files && req.files.files) fileUrls = req.files.files.map(f => `/uploads/${f.filename}`);
        if (req.files && req.files.video) videoUrl = `/uploads/${req.files.video[0].filename}`;

        let amount = 50000; 
        let status = 'Pending Review';
        
        // 1. Run ML Anomaly Detection (Isolation Forest)
        const anomalyCheck = MLModelService.predictFraudAnomaly({ incidentType, amount });

        try {
            if (anomalyCheck.isAnomaly) {
                // Intercept anomalous claims before paying out
                status = 'Rejected (Fraud Anomaly)';
                console.log(`[Fraud Alert] Claim Flagged! Score: ${anomalyCheck.fraudScore} - ${anomalyCheck.reason}`);
            } else if (process.env.GEMINI_API_KEY && req.files && req.files.files && req.files.files.length > 0) {
                const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
                const systemPrompt = `Analyze an insurance claim for incident type: "${incidentType}". Maximum payout is 50000. If an image is provided, extract details from the image to justify the payout. Respond strictly with a JSON object { "approved_amount": number, "status": "Paid Out" | "Rejected" } based on normal gig worker claim metrics and visual evidence.`;
                
                let contents = [systemPrompt];
                const imagePath = req.files.files[0].path;
                const base64Data = fs.readFileSync(imagePath).toString('base64');
                const mimeType = req.files.files[0].mimetype;
                contents.push({ inlineData: { data: base64Data, mimeType: mimeType } });
                
                const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents });
                let aiText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
                try {
                    let aiData = JSON.parse(aiText);
                    amount = aiData.approved_amount || amount;
                    status = aiData.status || status;
                } catch(e) {
                    console.error("AI JSON parse fail:", e);
                    status = 'Paid Out'; // Fallback mockup
                }
            } else {
                status = 'Paid Out'; // Original Mock logic
            }
            
            const maxAmount = 50000;
            const percentage = Math.round((amount / maxAmount) * 100);

            await db.run('INSERT INTO claims (user_id, title, description, incident_type, amount, status, file_urls, video_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [userId, title || incidentType, description || '', incidentType, amount, status, JSON.stringify(fileUrls), videoUrl]
            );
            
            res.json({ success: true, claimId: '#CLM-' + Math.floor(Math.random()*10000), amount, percentage, status });
        } catch(e) {
            console.error(e);
            res.status(500).json({ error: 'Crash during Claim Appraisal' });
        }
    });

    // Admin Routes
    app.get('/api/admin/users', verifyToken, isAdmin, async (req, res) => {
        const users = await db.all('SELECT id, name, email, phone, role, work_type FROM users');
        res.json({ success: true, users });
    });

    app.get('/api/admin/claims', verifyToken, isAdmin, async (req, res) => {
        const claims = await db.all(`
            SELECT c.*, u.name as user_name, u.phone as user_phone 
            FROM claims c 
            LEFT JOIN users u ON c.user_id = u.id 
            ORDER BY c.date DESC
        `);
        res.json({ success: true, claims });
    });

    app.post('/api/admin/claims/:id/status', verifyToken, isAdmin, async (req, res) => {
        const { status } = req.body;
        await db.run('UPDATE claims SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ success: true, message: 'Status updated', updatedStatus: status });
    });

    // Alert Routes (CWC & Govt RSS)
    app.get('/api/alerts/cwc', async (req, res) => {
        try {
            // Mock CWC (Central Water Commission) Flood Forecasting logic
            // Assuming this would bridge to https://ffs.india-water.gov.in/ via internal service
            res.json({
                success: true,
                alerts: [
                    { id: 'cwc1', river: 'Ganga', station: 'Patna', status: 'Normal', level: '48.5m', warningLevel: '49m' },
                    { id: 'cwc2', river: 'Brahmaputra', station: 'Guwahati', status: 'Rising Warning', level: '49.8m', warningLevel: '49.6m' }
                ]
            });
        } catch(e) {
            res.status(500).json({ error: 'Failed to fetch CWC alerts' });
        }
    });

    app.get('/api/alerts/rss', async (req, res) => {
        try {
            // Fetch Global/Govt Disaster Alert RSS feed
            if (typeof fetch === 'undefined') {
                 // Dynamic import for older node fallback or just use simple array if fetch missing
                 return res.json({ success: true, feed: [] });
            }
            const response = await fetch('https://gdacs.org/xml/rss.xml');
            const xml = await response.text();
            
            const items = [];
            const regex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/g;
            let match;
            while ((match = regex.exec(xml)) !== null && items.length < 3) {
                // Get general environmental alerts
                items.push({ 
                    title: match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1'), 
                    date: match[2], 
                    link: match[3] 
                });
            }
            
            if(items.length === 0) {
                items.push({ title: "NDMA Alert: Extremely heavy rainfall expected in eastern coastal zones.", date: new Date().toISOString(), link: "#" });
                items.push({ title: "Govt Advisory: Flash floods possible in low lying areas. Stay Alert.", date: new Date().toISOString(), link: "#" });
            }

            res.json({ success: true, feed: items });
        } catch(e) {
            res.status(500).json({ error: 'Failed to fetch RSS feeds' });
        }
    });

    // AI Chatbot Route
    app.post('/api/chat', async (req, res) => {
        const { message } = req.body;
        
        try {
            if (process.env.GEMINI_API_KEY) {
                // Initialize GenAI
                const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
                
                // Construct system instructions and prompt
                const systemPrompt = `You are a helpful customer support bot for GigShield, a micro-insurance platform for delivery partners. Answer concisely and politely. Keep answers under 3 sentences. Explain our plans start from ₹29/week up to ₹79/week, and claims are approved instantly with AI.`;
                
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: `${systemPrompt}\nUser: ${message}\nAssistant:`,
                });
                
                res.json({ success: true, reply: response.text });
            } else {
                // Mock fallback response if no API key is provided
                const lowerMsg = message.toLowerCase();
                let mockReply = "Hello! I am GigShield's virtual assistant. How can I help you with your insurance today?";
                
                if (lowerMsg.includes('claim')) {
                    mockReply = "To file a claim, just head to the 'File Claim' tab and upload your medical bill or FIR photo. Our AI approves it instantly!";
                } else if (lowerMsg.includes('price') || lowerMsg.includes('cost') || lowerMsg.includes('how much')) {
                    mockReply = "Our Standard plan starts at ₹49/week. It covers you for 7 days with priority claim processing!";
                } else if (lowerMsg.includes('activate') || lowerMsg.includes('on')) {
                    mockReply = "Simply slide the 'Coverage' toggle in your dashboard to turn your insurance on.";
                }
                
                // Artificial delay to simulate processing
                setTimeout(() => {
                    res.json({ success: true, reply: mockReply });
                }, 800);
            }
        } catch (error) {
            console.error("Chatbot Error:", error);
            res.status(500).json({ error: "Failed to process chat message." });
        }
    });

    // Fallback for HTML5 history routing
    app.use((req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
}

start().catch(console.error);
