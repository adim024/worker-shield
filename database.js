const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

async function initializeDB() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    // Create tables
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT UNIQUE,
            email TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'user',
            name TEXT,
            aadhaar TEXT,
            work_type TEXT
        );

        CREATE TABLE IF NOT EXISTS policies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            active_status BOOLEAN,
            coverage_amount INTEGER,
            plan_type TEXT,
            start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            end_date DATETIME,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT,
            description TEXT,
            incident_type TEXT,
            amount INTEGER,
            status TEXT,
            file_urls TEXT DEFAULT '[]',
            video_url TEXT,
            date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
    `);

    // Migrations to add missing columns in case tables already existed
    try { await db.exec("ALTER TABLE users ADD COLUMN email TEXT;"); } catch(e) {}
    try { await db.exec("ALTER TABLE users ADD COLUMN password TEXT;"); } catch(e) {}
    try { await db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';"); } catch(e) {}
    try { await db.exec("ALTER TABLE claims ADD COLUMN title TEXT;"); } catch(e) {}
    try { await db.exec("ALTER TABLE claims ADD COLUMN description TEXT;"); } catch(e) {}
    try { await db.exec("ALTER TABLE policies ADD COLUMN end_date DATETIME;"); } catch(e) {}
    try { await db.exec("ALTER TABLE claims ADD COLUMN file_urls TEXT DEFAULT '[]';"); } catch(e) {}
    try { await db.exec("ALTER TABLE claims ADD COLUMN video_url TEXT;"); } catch(e) {}

    // Add default admin user
    const bcrypt = require('bcryptjs');
    const adminEmail = 'admin@gigshield.com';
    const adminExists = await db.get("SELECT id FROM users WHERE email = ?", [adminEmail]);
    if (!adminExists) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await db.run("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)", ['Super Admin', adminEmail, hashedPassword, 'admin']);
    }

    console.log("Database & Tables setup complete.");
    return db;
}

module.exports = { initializeDB };
