const { Telegraf, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const express = require('express');
const path = require('path');
const fs = require('fs');

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
const BOT_TOKEN = '8716545255:AAHNcyDFzOdVUQz38iutCVEN3DARA5YJLBM';
const MONGODB_URI = 'mongodb+srv://sandip:9E9AISFqTfU3VI5i@cluster0.p8irtov.mongodb.net/telegram_bot';
const PORT = process.env.PORT || 8080;
const WEB_APP_URL = 'https://web-production-820965.up.railway.app';
const CHAT_ID = 8781152810;

// ==========================================
// 🕐 TIMEZONE CONSTANTS (IST = UTC+5:30)
// ==========================================
const IST_OFFSET_HOURS = 5;
const IST_OFFSET_MINUTES = 30;
const IST_OFFSET_MS = (IST_OFFSET_HOURS * 60 + IST_OFFSET_MINUTES) * 60 * 1000;

const app = express();

// ==========================================
// 🎨 EXPRESS CONFIGURATION
// ==========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const viewsDir = path.join(__dirname, 'views');
const publicDir = path.join(__dirname, 'public');

if (!fs.existsSync(viewsDir)) fs.mkdirSync(viewsDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

// ==========================================
// 🕐 TIMEZONE UTILITY FUNCTIONS
// ==========================================
function istToUTC(istDate, istTime) {
    if (!istDate || !istTime) return null;
    const [year, month, day] = istDate.split('-').map(Number);
    const [hour, minute] = istTime.split(':').map(Number);
    const istDateObj = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    return new Date(istDateObj.getTime() - IST_OFFSET_MS);
}

function utcToISTDisplay(utcDate) {
    if (!utcDate) return { date: '', time: '', dateTime: '' };
    const istDate = new Date(utcDate.getTime() + IST_OFFSET_MS);
    const year = istDate.getUTCFullYear();
    const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    const hours = String(istDate.getUTCHours()).padStart(2, '0');
    const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
    
    return {
        date: `${year}-${month}-${day}`,
        time: `${hours}:${minutes}`,
        dateTime: `${day}-${month}-${year} at ${hours}:${minutes}`,
        displayDate: `${day}-${month}-${year}`,
        displayTime: `${hours}:${minutes}`
    };
}

function getCurrentIST() {
    return new Date(new Date().getTime() + IST_OFFSET_MS);
}

function getTodayStartUTC() {
    const istNow = getCurrentIST();
    const istStartOfDay = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), 0, 0, 0));
    return new Date(istStartOfDay.getTime() - IST_OFFSET_MS);
}

function getCurrentISTDisplay() {
    return utcToISTDisplay(getCurrentIST());
}

// ==========================================
// 🗄️ DATABASE CONNECTION
// ==========================================
let db;
let client;

async function connectDB() {
    let retries = 5;
    while (retries > 0) {
        try {
            client = new MongoClient(MONGODB_URI, { 
                serverSelectionTimeoutMS: 5000, 
                maxPoolSize: 10,
                ssl: true,
                tls: true,
                tlsAllowInvalidCertificates: true
            });
            await client.connect();
            db = client.db('telegram_bot');
            console.log('✅ Connected to MongoDB');
            
            // Initialize grow collection with default structure
            const exists = await db.collection('grow').findOne({ type: 'tracker' });
            if (!exists) {
                await db.collection('grow').insertOne({ 
                    type: 'tracker', 
                    items: [], 
                    progress: {} 
                });
                console.log('✅ Initialized grow collection');
            }
            
            return true;
        } catch (error) {
            console.error('MongoDB connection error:', error);
            retries--;
            if (retries === 0) return false;
            console.log(`Retrying connection... (${retries} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    return false;
}

// ==========================================
// 🛠️ UTILITY FUNCTIONS
// ==========================================
function generateId() { return 'g' + Date.now() + Math.random().toString(36).substring(2, 6); }

// 8 Exact Colors
const paletteColors = ['#ec4899', '#a855f7', '#38bdf8', '#ef4444', '#f97316', '#16a34a', '#84cc16', '#3b82f6'];

// ==========================================
// 🤖 BOT SETUP (NOTIFICATIONS ONLY)
// ==========================================
const bot = new Telegraf(BOT_TOKEN);

bot.command('start', async (ctx) => {
    const keyboard = Markup.inlineKeyboard([[Markup.button.webApp('🌱 Open Grow Tracker', WEB_APP_URL)]]);
    await ctx.reply('🌱 <b>Grow Tracker</b>\n\nTrack your daily progress using the Web App below. I will send you notifications here when you add, update, delete, or complete growth items.', { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
});

// ==========================================
// 📱 WEB INTERFACE - GROW TRACKER UI
// ==========================================

// Write the EJS template - using regular string concatenation to avoid template literal issues
function writeGrowEJS() {
    const growEJS = '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'    <meta charset="UTF-8">\n' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">\n' +
'    <title>🌱 Grow Tracker</title>\n' +
'    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">\n' +
'    <style>\n' +
'        /* === THEME VARIABLES - SYSTEM DEFAULT ONLY === */\n' +
'        :root {\n' +
'            --bg-color: #f5f7fa;\n' +
'            --surface-color: #ffffff;\n' +
'            --text-primary: #1e293b;\n' +
'            --text-secondary: #475569;\n' +
'            --border-color: #e2e8f0;\n' +
'            --accent-color: #059669;\n' +
'            --success-color: #059669;\n' +
'            --danger-color: #dc2626;\n' +
'            --hover-color: #f1f5f9;\n' +
'            --shadow-soft: 0 4px 20px -5px rgba(0,0,0,0.08);\n' +
'            --modal-backdrop: rgba(15, 23, 42, 0.5);\n' +
'            --ring-today: #059669;\n' +
'        }\n' +
'\n' +
'        @media (prefers-color-scheme: dark) {\n' +
'            :root {\n' +
'                --bg-color: #0f172a;\n' +
'                --surface-color: #1e293b;\n' +
'                --text-primary: #f8fafc;\n' +
'                --text-secondary: #cbd5e1;\n' +
'                --border-color: #334155;\n' +
'                --accent-color: #34d399;\n' +
'                --success-color: #34d399;\n' +
'                --danger-color: #f87171;\n' +
'                --hover-color: #2d3b4f;\n' +
'                --shadow-soft: 0 4px 20px -5px rgba(0,0,0,0.5);\n' +
'                --modal-backdrop: rgba(0, 0, 0, 0.8);\n' +
'                --ring-today: #34d399;\n' +
'            }\n' +
'        }\n' +
'\n' +
'        * { margin: 0; padding: 0; box-sizing: border-box; font-family: \'Inter\', system-ui, -apple-system, sans-serif; }\n' +
'        \n' +
'        body { \n' +
'            background: var(--bg-color); color: var(--text-primary); \n' +
'            padding: 20px 10px 120px 10px; min-height: 100vh;\n' +
'            transition: background 0.3s, color 0.3s; \n' +
'            font-size: 12px;\n' +
'        }\n' +
'\n' +
'        .panel-wrapper {\n' +
'            max-width: 600px; margin: 0 auto 15px auto;\n' +
'            background: var(--surface-color);\n' +
'            border: 1px solid var(--border-color);\n' +
'            border-radius: 16px;\n' +
'            box-shadow: var(--shadow-soft);\n' +
'            overflow: hidden;\n' +
'        }\n' +
'\n' +
'        .panel-summary {\n' +
'            display: flex; justify-content: space-between; align-items: center;\n' +
'            padding: 15px 20px; font-size: 1.1rem; font-weight: 700; color: var(--text-primary);\n' +
'            cursor: pointer; list-style: none; user-select: none;\n' +
'            background: var(--surface-color); border-bottom: 1px solid transparent;\n' +
'        }\n' +
'        .panel-summary::-webkit-details-marker { display: none; }\n' +
'        .panel-summary i.chevron { transition: transform 0.3s; color: var(--text-secondary); }\n' +
'        details[open] .panel-summary i.chevron { transform: rotate(180deg); }\n' +
'        details[open] .panel-summary { border-bottom: 1px solid var(--border-color); }\n' +
'\n' +
'        .panel-body { padding: 20px; }\n' +
'\n' +
'        .graphs-grid-container {\n' +
'            width: 100%;\n' +
'            aspect-ratio: 1 / 1;\n' +
'            display: flex; flex-direction: column;\n' +
'        }\n' +
'        .chart-wrapper {\n' +
'            display: flex; justify-content: space-around; align-items: flex-end;\n' +
'            flex: 1; padding-top: 10px;\n' +
'        }\n' +
'        .bar-col {\n' +
'            display: flex; flex-direction: column; align-items: center; justify-content: flex-end;\n' +
'            width: 10%; max-width: 35px; height: 100%;\n' +
'        }\n' +
'        .bar-track {\n' +
'            width: 100%; height: 90%; border-radius: 6px;\n' +
'            position: relative;\n' +
'            display: flex; align-items: flex-end;\n' +
'        }\n' +
'        .bar-fill {\n' +
'            width: 100%; border-radius: 6px;\n' +
'            transition: height 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275);\n' +
'        }\n' +
'        .bar-label-inner {\n' +
'            position: absolute;\n' +
'            top: 0; bottom: 0; left: 0; right: 0;\n' +
'            writing-mode: vertical-rl;\n' +
'            transform: rotate(180deg);\n' +
'            display: flex; align-items: center; justify-content: flex-end;\n' +
'            padding-top: 8px;\n' +
'            color: #ffffff; font-size: 0.75rem; font-weight: 700;\n' +
'            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\n' +
'            text-shadow: 0px 1px 3px rgba(0,0,0,0.8), 0px 0px 2px rgba(0,0,0,0.5);\n' +
'            pointer-events: none; z-index: 10;\n' +
'        }\n' +
'        .bar-percent { font-size: 0.7rem; font-weight: 800; color: var(--text-primary); margin-bottom: 5px; }\n' +
'\n' +
'        .month-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; }\n' +
'        .month-nav h1 { \n' +
'            font-size: 0.95rem; font-weight: 700; color: var(--text-primary); \n' +
'            margin: 0; text-transform: uppercase; letter-spacing: 1px; \n' +
'            background: var(--hover-color); padding: 6px 16px; \n' +
'            border-radius: 50px; border: 1px solid var(--border-color);\n' +
'        }\n' +
'        .nav-btn {\n' +
'            background: var(--bg-color); border: 1px solid var(--border-color); width: 30px; height: 30px; border-radius: 50%;\n' +
'            cursor: pointer; font-size: 0.8rem; color: var(--text-secondary); display: flex; align-items: center; justify-content: center;\n' +
'        }\n' +
'\n' +
'        .grid-container { width: 100%; aspect-ratio: 1 / 1; display: flex; flex-direction: column; }\n' +
'        .calendar-grid { flex: 1; display: grid; grid-template-columns: repeat(7, 1fr); grid-template-rows: auto repeat(6, 1fr); gap: 6px; }\n' +
'        .weekday { display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.65rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px; }\n' +
'        \n' +
'        .day-cell { display: flex; align-items: center; justify-content: center; border-radius: 12px; position: relative; }\n' +
'        .day-cell.empty { pointer-events: none; }\n' +
'        .day-cell:hover:not(.empty) { background: var(--hover-color); cursor: pointer; }\n' +
'\n' +
'        .day-circle {\n' +
'            width: 100%; max-width: 40px; aspect-ratio: 1; border-radius: 50%;\n' +
'            display: flex; align-items: center; justify-content: center;\n' +
'            font-weight: 700; font-size: 0.9rem; color: var(--text-primary);\n' +
'            transition: transform 0.2s ease; position: relative;\n' +
'        }\n' +
'        .day-cell:hover:not(.empty) .day-circle { transform: scale(1.1); }\n' +
'        \n' +
'        .day-circle.has-data {\n' +
'            color: #ffffff; box-shadow: 0 2px 5px rgba(0,0,0,0.1);\n' +
'            text-shadow: 0px 1px 3px rgba(0,0,0,0.7), 0px 0px 2px rgba(0,0,0,0.5);\n' +
'        }\n' +
'        .day-circle.today { box-shadow: 0 0 0 2px var(--surface-color), 0 0 0 4px var(--ring-today); color: var(--ring-today); font-weight: 800; }\n' +
'        .day-circle.today.has-data { color: #ffffff; }\n' +
'\n' +
'        .speech-bubble {\n' +
'            position: absolute; background: var(--surface-color);\n' +
'            backdrop-filter: blur(10px); border: 1px solid var(--border-color); \n' +
'            border-radius: 12px; padding: 12px; z-index: 100; min-width: 160px; max-width: 220px;\n' +
'            pointer-events: none; box-shadow: 0 15px 30px rgba(0,0,0,0.2); display: none; opacity: 0;\n' +
'        }\n' +
'        .speech-bubble.show { opacity: 1; }\n' +
'        .speech-tail { position: absolute; width: 12px; height: 12px; background: var(--surface-color); border: 1px solid var(--border-color); z-index: -1; }\n' +
'        .speech-date { font-size: 0.7rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; text-transform: uppercase;}\n' +
'        .speech-item { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 0.8rem; font-weight: 600; }\n' +
'\n' +
'        .grow-card {\n' +
'            background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 14px; \n' +
'            padding: 14px; margin-bottom: 10px; transition: all 0.2s ease;\n' +
'        }\n' +
'        \n' +
'        .grow-summary {\n' +
'            display: flex; justify-content: space-between; align-items: flex-start;\n' +
'            cursor: pointer; outline: none; list-style: none;\n' +
'        }\n' +
'        .grow-summary::-webkit-details-marker { display: none; }\n' +
'        \n' +
'        .grow-title-section { display: flex; align-items: center; gap: 8px; flex: 1; padding-top: 6px; }\n' +
'        .grow-title-section .chevron-icon { font-size: 0.75rem; color: var(--text-secondary); transition: transform 0.2s; }\n' +
'        details.grow-details[open] .chevron-icon { transform: rotate(90deg); }\n' +
'        .grow-title { font-weight: 700; font-size: 1rem; color: var(--text-primary); }\n' +
'        \n' +
'        .grow-actions { display: flex; gap: 6px; flex-shrink: 0; margin-left: 10px; }\n' +
'        .action-btn { \n' +
'            width: 30px; height: 30px; border-radius: 8px; border: none; \n' +
'            background: var(--hover-color); color: var(--text-secondary); \n' +
'            display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; \n' +
'        }\n' +
'        .action-btn:hover { background: var(--accent-color); color: white; }\n' +
'        .action-btn.delete:hover { background: var(--danger-color); color: white; }\n' +
'\n' +
'        .grow-description-container { width: 100%; margin-top: 12px; }\n' +
'        .grow-description { \n' +
'            font-size: 0.85rem; color: var(--text-secondary); padding: 8px 12px; \n' +
'            background: var(--hover-color); border-radius: 10px; border-left: 3px solid; \n' +
'            word-break: break-word; white-space: pre-wrap; line-height: 1.4; \n' +
'        }\n' +
'\n' +
'        .grow-meta-row { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; width: 100%; }\n' +
'        .badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--hover-color); border-radius: 100px; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); }\n' +
'        .color-dot { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--border-color); flex-shrink: 0; }\n' +
'        \n' +
'        .fab {\n' +
'            position: fixed; bottom: 20px; right: 20px; z-index: 1000;\n' +
'            width: 54px; height: 54px; border-radius: 50%;\n' +
'            background: var(--accent-color); color: white; border: none;\n' +
'            display: flex; align-items: center; justify-content: center; font-size: 1.4rem;\n' +
'            cursor: pointer; box-shadow: 0 8px 20px rgba(5,150,105,0.4); transition: 0.2s;\n' +
'        }\n' +
'\n' +
'        .modal {\n' +
'            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;\n' +
'            background: var(--modal-backdrop); backdrop-filter: blur(4px);\n' +
'            align-items: center; justify-content: center; z-index: 2000; padding: 15px; opacity: 0;\n' +
'        }\n' +
'        .modal.show { opacity: 1; }\n' +
'        .modal-content {\n' +
'            background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 20px; \n' +
'            padding: 20px; width: 100%; max-width: 400px; max-height: 85vh; overflow-y: auto; \n' +
'            box-shadow: 0 25px 50px rgba(0,0,0,0.25); transform: scale(0.95); transition: 0.3s ease;\n' +
'        }\n' +
'        .modal.show .modal-content { transform: scale(1); }\n' +
'\n' +
'        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;}\n' +
'        .modal-header h2 { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); }\n' +
'        .close-btn { background: var(--hover-color); border: none; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; color: var(--text-secondary); transition: 0.2s; }\n' +
'        .close-btn:hover { background: var(--danger-color); color: white; }\n' +
'\n' +
'        .form-group { margin-bottom: 15px; }\n' +
'        .form-group label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 0.8rem; color: var(--text-primary); }\n' +
'        .form-control { width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 10px; font-size: 0.85rem; outline: none; background: var(--bg-color); color: var(--text-primary); }\n' +
'        .form-control:focus { border-color: var(--accent-color); }\n' +
'        \n' +
'        .color-palette { display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: 8px; }\n' +
'        .color-swatch { width: 26px; height: 26px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: 0.1s;}\n' +
'        .color-swatch.selected { transform: scale(1.15); box-shadow: 0 0 0 2px var(--surface-color), 0 0 0 4px var(--text-primary); }\n' +
'        .color-swatch.hidden { display: none; }\n' +
'        \n' +
'        .checkbox-group { display: flex; align-items: center; gap: 8px; margin: 15px 0; font-weight: 600; font-size: 0.85rem; cursor: pointer; color: var(--text-primary); }\n' +
'        .checkbox-group input { width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-color); }\n' +
'        .hidden-fields { display: none; background: var(--hover-color); padding: 15px; border-radius: 12px; margin-bottom: 15px; }\n' +
'        \n' +
'        .btn-submit { width: 100%; padding: 14px; background: var(--accent-color); color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 0.95rem; cursor: pointer; margin-top: 10px; transition: 0.2s; }\n' +
'        .btn-submit:hover { background: #047857; }\n' +
'\n' +
'        .empty-state { text-align: center; color: var(--text-secondary); padding: 30px; font-size: 0.9rem; background: var(--hover-color); border-radius: 16px; }\n' +
'        \n' +
'        .log-card { background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 14px; padding: 12px; margin-bottom: 10px; }\n' +
'        \n' +
'        #log-question-view { display: none; }\n' +
'        \n' +
'        .app-header { \n' +
'            max-width: 600px; margin: 0 auto 15px auto; \n' +
'            background: var(--surface-color);\n' +
'            border: 1px solid var(--border-color);\n' +
'            border-radius: 16px;\n' +
'            padding: 12px 20px;\n' +
'            display: flex;\n' +
'            justify-content: space-between;\n' +
'            align-items: center;\n' +
'        }\n' +
'        .app-header h1 { \n' +
'            font-size: 1.2rem; \n' +
'            font-weight: 700; \n' +
'            color: var(--accent-color);\n' +
'            display: flex;\n' +
'            align-items: center;\n' +
'            gap: 6px;\n' +
'        }\n' +
'        .time-badge { \n' +
'            display: flex; \n' +
'            align-items: center; \n' +
'            gap: 8px; \n' +
'            padding: 6px 12px; \n' +
'            background: var(--hover-color); \n' +
'            border-radius: 100px; \n' +
'            font-size: 0.75rem; \n' +
'            font-weight: 500; \n' +
'            color: var(--text-secondary);\n' +
'        }\n' +
'    </style>\n' +
'</head>\n' +
'<body>\n' +
'\n' +
'    <div class="app-header">\n' +
'        <h1><i class="fas fa-seedling"></i> Grow Tracker</h1>\n' +
'        <div class="time-badge">\n' +
'            <i class="fas fa-calendar-alt"></i> <span id="currentDateDisplay"><%= currentDate %></span>\n' +
'            <span style="margin-left: 4px;"><i class="fas fa-clock"></i> <span id="currentTimeDisplay"><%= currentTime %></span></span>\n' +
'        </div>\n' +
'    </div>\n' +
'\n' +
'    <details class="panel-wrapper">\n' +
'        <summary class="panel-summary">\n' +
'            <span>Grow Overview</span>\n' +
'            <i class="fas fa-chevron-down chevron"></i>\n' +
'        </summary>\n' +
'        <div class="panel-body" id="graphs-container"></div>\n' +
'    </details>\n' +
'\n' +
'    <details class="panel-wrapper" open>\n' +
'        <summary class="panel-summary">\n' +
'            <span>Grow Calendar</span>\n' +
'            <i class="fas fa-chevron-down chevron"></i>\n' +
'        </summary>\n' +
'        <div class="panel-body">\n' +
'            <div class="month-nav">\n' +
'                <button class="nav-btn" onclick="changeMonth(-1)"><i class="fas fa-chevron-left"></i></button>\n' +
'                <h1 id="month-year-display"><%= currentMonth %></h1>\n' +
'                <button class="nav-btn" onclick="changeMonth(1)"><i class="fas fa-chevron-right"></i></button>\n' +
'            </div>\n' +
'            <div class="grid-container">\n' +
'                <div class="calendar-grid" id="calendar-grid"></div>\n' +
'            </div>\n' +
'        </div>\n' +
'    </details>\n' +
'    \n' +
'    <details class="panel-wrapper" open>\n' +
'        <summary class="panel-summary">\n' +
'            <span>Manage Growth</span>\n' +
'            <i class="fas fa-chevron-down chevron"></i>\n' +
'        </summary>\n' +
'        <div class="panel-body" id="grow-manage-list"></div>\n' +
'    </details>\n' +
'    \n' +
'    <div class="speech-bubble" id="speech-bubble">\n' +
'        <div id="speech-content"></div>\n' +
'        <div class="speech-tail" id="speech-tail"></div>\n' +
'    </div>\n' +
'\n' +
'    <button class="fab" onclick="openAddModal()"><i class="fas fa-plus"></i></button>\n' +
'\n' +
'    <div class="modal" id="add-modal">\n' +
'        <div class="modal-content">\n' +
'            <div class="modal-header">\n' +
'                <h2>Add New Growth</h2>\n' +
'                <button class="close-btn" onclick="closeModal(\'add-modal\')"><i class="fas fa-times"></i></button>\n' +
'            </div>\n' +
'            <form id="add-grow-form">\n' +
'                <div class="form-group">\n' +
'                    <label>Title</label>\n' +
'                    <input type="text" class="form-control" id="g-title" required placeholder="e.g. Daily Workout">\n' +
'                </div>\n' +
'                <div class="form-group">\n' +
'                    <label>Description (Optional)</label>\n' +
'                    <textarea class="form-control" id="g-desc" rows="2" placeholder="Brief details..."></textarea>\n' +
'                </div>\n' +
'                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">\n' +
'                    <div class="form-group"><label>Start Date</label><input type="date" class="form-control" id="g-start-date" required></div>\n' +
'                    <div class="form-group"><label>Duration (Days)</label><input type="number" class="form-control" id="g-end-count" value="365" required></div>\n' +
'                </div>\n' +
'                <div class="form-group">\n' +
'                    <label>Color</label>\n' +
'                    <div class="color-palette" id="color-palette"></div>\n' +
'                    <input type="hidden" id="g-color" value="" required>\n' +
'                    <small id="color-error" style="color:var(--danger-color); display:none; font-weight:600; margin-top:5px;">All 8 colors are used! Max limit reached.</small>\n' +
'                </div>\n' +
'                \n' +
'                <label class="checkbox-group"><input type="checkbox" id="g-has-data" onchange="toggleDataFields(\'add\')">Require specific data logging?</label>\n' +
'                \n' +
'                <div class="hidden-fields" id="data-fields">\n' +
'                    <div class="form-group"><label>Question</label><input type="text" class="form-control" id="g-question" placeholder="e.g. Current weight?"></div>\n' +
'                    <div class="form-group">\n' +
'                        <label>Type</label>\n' +
'                        <select class="form-control" id="g-type" onchange="toggleStartGoalData(\'add\')">\n' +
'                            <option value="boolean">Boolean (Yes/No)</option>\n' +
'                            <option value="float">Float (Decimals)</option>\n' +
'                            <option value="integer">Integer (Whole numbers)</option>\n' +
'                        </select>\n' +
'                    </div>\n' +
'                    <div id="start-goal-wrapper" style="display: none; grid-template-columns: 1fr 1fr; gap: 12px;">\n' +
'                        <div class="form-group"><label>Start Data</label><input type="number" step="0.01" class="form-control" id="g-start-data"></div>\n' +
'                        <div class="form-group"><label>End Data</label><input type="number" step="0.01" class="form-control" id="g-goal-data"></div>\n' +
'                    </div>\n' +
'                </div>\n' +
'                <button type="submit" class="btn-submit" id="create-btn">Create Growth</button>\n' +
'            </form>\n' +
'        </div>\n' +
'    </div>\n' +
'\n' +
'    <div class="modal" id="edit-modal">\n' +
'        <div class="modal-content">\n' +
'            <div class="modal-header">\n' +
'                <h2>Edit Growth</h2>\n' +
'                <button class="close-btn" onclick="closeModal(\'edit-modal\')"><i class="fas fa-times"></i></button>\n' +
'            </div>\n' +
'            <form id="edit-grow-form">\n' +
'                <input type="hidden" id="edit-g-id">\n' +
'                <div class="form-group">\n' +
'                    <label>Title</label>\n' +
'                    <input type="text" class="form-control" id="edit-g-title" required>\n' +
'                </div>\n' +
'                <div class="form-group">\n' +
'                    <label>Description (Optional)</label>\n' +
'                    <textarea class="form-control" id="edit-g-desc" rows="2"></textarea>\n' +
'                </div>\n' +
'                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">\n' +
'                    <div class="form-group"><label>Start Date</label><input type="date" class="form-control" id="edit-g-start-date" required></div>\n' +
'                    <div class="form-group"><label>Duration (Days)</label><input type="number" class="form-control" id="edit-g-end-count" required></div>\n' +
'                </div>\n' +
'                <div class="form-group">\n' +
'                    <label>Color (Interchanges if occupied)</label>\n' +
'                    <div class="color-palette" id="edit-color-palette"></div>\n' +
'                    <input type="hidden" id="edit-g-color" required>\n' +
'                </div>\n' +
'                \n' +
'                <label class="checkbox-group"><input type="checkbox" id="edit-g-has-data" onchange="toggleDataFields(\'edit\')">Require specific data logging?</label>\n' +
'                \n' +
'                <div class="hidden-fields" id="edit-data-fields">\n' +
'                    <div class="form-group"><label>Question</label><input type="text" class="form-control" id="edit-g-question"></div>\n' +
'                    <div class="form-group">\n' +
'                        <label>Type</label>\n' +
'                        <select class="form-control" id="edit-g-type" onchange="toggleStartGoalData(\'edit\')">\n' +
'                            <option value="boolean">Boolean (Yes/No)</option>\n' +
'                            <option value="float">Float (Decimals)</option>\n' +
'                            <option value="integer">Integer (Whole numbers)</option>\n' +
'                        </select>\n' +
'                    </div>\n' +
'                    <div id="edit-start-goal-wrapper" style="display: none; grid-template-columns: 1fr 1fr; gap: 12px;">\n' +
'                        <div class="form-group"><label>Start Data</label><input type="number" step="0.01" class="form-control" id="edit-g-start-data"></div>\n' +
'                        <div class="form-group"><label>End Data</label><input type="number" step="0.01" class="form-control" id="edit-g-goal-data"></div>\n' +
'                    </div>\n' +
'                </div>\n' +
'                <button type="submit" class="btn-submit" id="update-btn">Update Growth</button>\n' +
'            </form>\n' +
'        </div>\n' +
'    </div>\n' +
'\n' +
'    <div class="modal" id="log-modal">\n' +
'        <div class="modal-content">\n' +
'            <div id="log-list-view">\n' +
'                <div class="modal-header">\n' +
'                    <h2 id="log-modal-title">Log Growth</h2>\n' +
'                    <button class="close-btn" onclick="closeModal(\'log-modal\')"><i class="fas fa-times"></i></button>\n' +
'                </div>\n' +
'                <div id="daily-grow-list"></div>\n' +
'            </div>\n' +
'            <div id="log-question-view">\n' +
'                <div class="modal-header">\n' +
'                    <h2 id="l-title"></h2>\n' +
'                    <button class="close-btn" onclick="showLogList()"><i class="fas fa-arrow-left"></i></button>\n' +
'                </div>\n' +
'                <div id="l-desc-container"></div>\n' +
'                <div class="form-group">\n' +
'                    <label id="l-question" style="font-size: 0.85rem; color: var(--text-primary);"></label>\n' +
'                    <div id="l-input-wrapper"></div>\n' +
'                </div>\n' +
'                <button class="btn-submit" id="save-log-btn">Save Growth</button>\n' +
'            </div>\n' +
'        </div>\n' +
'    </div>\n' +
'\n' +
'<script>\n' +
'    const API_URL = \'/api/\';\n' +
'    let db = null;\n' +
'    let todayStr = \'\';\n' +
'    let currentMonth = 0;\n' +
'    let currentYear = 2026;\n' +
'    let loggingContext = null;\n' +
'\n' +
'    const paletteColors = [\'#ec4899\', \'#a855f7\', \'#38bdf8\', \'#ef4444\', \'#f97316\', \'#16a34a\', \'#84cc16\', \'#3b82f6\'];\n' +
'\n' +
'    document.addEventListener(\'DOMContentLoaded\', () => {\n' +
'        calculateISTDate();\n' +
'        fetchData();\n' +
'\n' +
'        document.getElementById(\'calendar-grid\').addEventListener(\'click\', (e) => {\n' +
'            const cell = e.target.closest(\'.day-cell\');\n' +
'            if(cell && !cell.classList.contains(\'empty\')) {\n' +
'                const dateStr = cell.dataset.date;\n' +
'                const activeItems = db.items.filter(g => isItemActive(g, dateStr));\n' +
'                const dayData = db.progress[dateStr] || {};\n' +
'                const isAllCompleted = activeItems.length > 0 && activeItems.every(g => dayData[g.id] !== undefined);\n' +
'                \n' +
'                if(dateStr === todayStr && !isAllCompleted) openLogModal(dateStr);\n' +
'                else showBubble(cell, dateStr);\n' +
'            }\n' +
'        });\n' +
'        \n' +
'        document.addEventListener(\'click\', (e) => {\n' +
'            if (!e.target.closest(\'.day-cell\') && !e.target.closest(\'.speech-bubble\')) {\n' +
'                document.getElementById(\'speech-bubble\').classList.remove(\'show\');\n' +
'            }\n' +
'        });\n' +
'        \n' +
'        setInterval(() => {\n' +
'            const now = new Date();\n' +
'            const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));\n' +
'            document.getElementById(\'currentTimeDisplay\').innerHTML = String(istNow.getUTCHours()).padStart(2, \'0\') + \':\' + String(istNow.getUTCMinutes()).padStart(2, \'0\');\n' +
'            document.getElementById(\'currentDateDisplay\').innerHTML = String(istNow.getUTCDate()).padStart(2, \'0\') + \'-\' + String(istNow.getUTCMonth() + 1).padStart(2, \'0\') + \'-\' + istNow.getUTCFullYear();\n' +
'        }, 1000);\n' +
'    });\n' +
'\n' +
'    function calculateISTDate() {\n' +
'        const istString = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });\n' +
'        const istDate = new Date(istString);\n' +
'        todayStr = istDate.getFullYear() + \'-\' + String(istDate.getMonth() + 1).padStart(2, \'0\') + \'-\' + String(istDate.getDate()).padStart(2, \'0\');\n' +
'        currentMonth = istDate.getMonth(); \n' +
'        currentYear = istDate.getFullYear();\n' +
'    }\n' +
'\n' +
'    async function fetchData() {\n' +
'        try {\n' +
'            const res = await fetch(API_URL + \'grow/data\');\n' +
'            db = await res.json();\n' +
'            \n' +
'            if (Array.isArray(db.progress)) db.progress = {};\n' +
'            if (!Array.isArray(db.items)) db.items = [];\n' +
'            \n' +
'            updateAllViews();\n' +
'        } catch(e) { \n' +
'            console.error("Load Error", e);\n' +
'            db = { items: [], progress: {} };\n' +
'        }\n' +
'    }\n' +
'\n' +
'    function updateAllViews() {\n' +
'        renderCalendar();\n' +
'        renderGraphs();\n' +
'        renderGrowList();\n' +
'    }\n' +
'\n' +
'    function renderGrowList() {\n' +
'        const container = document.getElementById(\'grow-manage-list\');\n' +
'        if(db.items.length === 0) {\n' +
'            container.innerHTML = \'<div class="empty-state"><i class="fas fa-seedling" style="font-size:2rem; margin-bottom:10px;"></i><br>No growth tracked yet. Start your journey with the + button.</div>\';\n' +
'            return;\n' +
'        }\n' +
'\n' +
'        let html = \'\';\n' +
'        const todayObj = new Date(todayStr + "T00:00:00");\n' +
'\n' +
'        db.items.forEach(item => {\n' +
'            const startObj = new Date(item.startDate + "T00:00:00");\n' +
'            let daysPassed = Math.floor((todayObj - startObj) / (1000 * 60 * 60 * 24));\n' +
'            let daysLeft = item.endCount - daysPassed;\n' +
'            if(daysPassed < 0) daysLeft = item.endCount; \n' +
'            if(daysLeft < 0) daysLeft = 0;\n' +
'\n' +
'            html += \'<div class="grow-card">\';\n' +
'            html += \'<details class="grow-details">\';\n' +
'            html += \'<summary class="grow-summary">\';\n' +
'            html += \'<div class="grow-title-section">\';\n' +
'            html += \'<i class="fas fa-chevron-right chevron-icon"></i>\';\n' +
'            html += \'<span class="grow-title">\' + item.title + \'</span>\';\n' +
'            html += \'</div>\';\n' +
'            html += \'<div class="grow-actions">\';\n' +
'            html += \'<button class="action-btn" onclick="event.preventDefault(); event.stopPropagation(); openEditModal(\\\'\' + item.id + \'\\\')"><i class="fas fa-pencil-alt"></i></button>\';\n' +
'            html += \'<button class="action-btn delete" onclick="event.preventDefault(); event.stopPropagation(); deleteGrow(\\\'\' + item.id + \'\\\')"><i class="fas fa-trash"></i></button>\';\n' +
'            html += \'</div>\';\n' +
'            html += \'</summary>\';\n' +
'            if(item.description) {\n' +
'                html += \'<div class="grow-description-container">\';\n' +
'                html += \'<div class="grow-description" style="border-left-color: \' + item.color + \';">\' + item.description + \'</div>\';\n' +
'                html += \'</div>\';\n' +
'            }\n' +
'            html += \'</details>\';\n' +
'            \n' +
'            html += \'<div class="grow-meta-row">\';\n' +
'            html += \'<span class="badge"><i class="fas fa-calendar-alt"></i> \' + item.startDate + \'</span>\';\n' +
'            html += \'<span class="badge"><i class="fas fa-hourglass-half"></i> \' + daysLeft + \' left</span>\';\n' +
'            html += \'<div class="color-dot" style="background:\' + item.color + \';"></div>\';\n' +
'            html += \'</div>\';\n' +
'            html += \'</div>\';\n' +
'        });\n' +
'        container.innerHTML = html;\n' +
'    }\n' +
'\n' +
'    async function deleteGrow(itemId) {\n' +
'        if(!confirm("Are you sure you want to delete this growth and ALL its history?")) return;\n' +
'        \n' +
'        const res = await fetch(API_URL + \'grow/\' + itemId + \'/delete\', { method: \'POST\' });\n' +
'        if (res.ok) {\n' +
'            await fetchData();\n' +
'        }\n' +
'    }\n' +
'\n' +
'    function openEditModal(itemId) {\n' +
'        const item = db.items.find(g => g.id === itemId);\n' +
'        if(!item) return;\n' +
'\n' +
'        document.getElementById(\'edit-g-id\').value = item.id;\n' +
'        document.getElementById(\'edit-g-title\').value = item.title;\n' +
'        document.getElementById(\'edit-g-desc\').value = item.description || \'\';\n' +
'        document.getElementById(\'edit-g-start-date\').value = item.startDate;\n' +
'        document.getElementById(\'edit-g-end-count\').value = item.endCount;\n' +
'        \n' +
'        document.getElementById(\'edit-g-has-data\').checked = item.hasData;\n' +
'        toggleDataFields(\'edit\');\n' +
'\n' +
'        if(item.hasData) {\n' +
'            document.getElementById(\'edit-g-question\').value = item.question || \'\';\n' +
'            document.getElementById(\'edit-g-type\').value = item.type || \'boolean\';\n' +
'            toggleStartGoalData(\'edit\');\n' +
'            \n' +
'            if(item.type !== \'boolean\') {\n' +
'                document.getElementById(\'edit-g-start-data\').value = item.start !== undefined ? item.start : \'\';\n' +
'                document.getElementById(\'edit-g-goal-data\').value = item.end !== undefined ? item.end : \'\';\n' +
'            }\n' +
'        }\n' +
'\n' +
'        initEditColorPalette(item.color);\n' +
'        openModalObj(\'edit-modal\');\n' +
'    }\n' +
'\n' +
'    document.getElementById(\'edit-grow-form\').addEventListener(\'submit\', async (e) => {\n' +
'        e.preventDefault();\n' +
'        const itemId = document.getElementById(\'edit-g-id\').value;\n' +
'        \n' +
'        const formData = new FormData();\n' +
'        formData.append(\'id\', itemId);\n' +
'        formData.append(\'title\', document.getElementById(\'edit-g-title\').value.trim());\n' +
'        formData.append(\'description\', document.getElementById(\'edit-g-desc\').value.trim());\n' +
'        formData.append(\'startDate\', document.getElementById(\'edit-g-start-date\').value);\n' +
'        formData.append(\'endCount\', document.getElementById(\'edit-g-end-count\').value);\n' +
'        formData.append(\'color\', document.getElementById(\'edit-g-color\').value);\n' +
'        formData.append(\'hasData\', document.getElementById(\'edit-g-has-data\').checked ? \'true\' : \'false\');\n' +
'        formData.append(\'type\', document.getElementById(\'edit-g-type\').value);\n' +
'        formData.append(\'question\', document.getElementById(\'edit-g-question\').value.trim());\n' +
'        formData.append(\'start\', document.getElementById(\'edit-g-start-data\').value);\n' +
'        formData.append(\'end\', document.getElementById(\'edit-g-goal-data\').value);\n' +
'\n' +
'        const res = await fetch(API_URL + \'grow/\' + itemId + \'/update\', { \n' +
'            method: \'POST\', \n' +
'            body: new URLSearchParams(formData) \n' +
'        });\n' +
'        \n' +
'        if (res.ok) {\n' +
'            closeModal(\'edit-modal\');\n' +
'            await fetchData();\n' +
'        }\n' +
'    });\n' +
'\n' +
'    function renderGraphs() {\n' +
'        const container = document.getElementById(\'graphs-container\');\n' +
'        if (db.items.length === 0) {\n' +
'            container.innerHTML = \'<div class="empty-state">No growth added yet.</div>\';\n' +
'            return;\n' +
'        }\n' +
'\n' +
'        let html = \'<div class="graphs-grid-container"><div class="chart-wrapper">\';\n' +
'        \n' +
'        db.items.forEach(item => {\n' +
'            const start = new Date(item.startDate + "T00:00:00");\n' +
'            const todayObj = new Date(todayStr + "T00:00:00");\n' +
'            \n' +
'            let totalDaysSoFar = Math.floor((todayObj - start) / (1000 * 60 * 60 * 24)) + 1;\n' +
'            if (totalDaysSoFar < 1) totalDaysSoFar = 0;\n' +
'            if (totalDaysSoFar > item.endCount) totalDaysSoFar = item.endCount;\n' +
'\n' +
'            let completedCount = 0;\n' +
'            Object.keys(db.progress).forEach(dateStr => {\n' +
'                const dObj = new Date(dateStr + "T00:00:00");\n' +
'                if (dObj >= start && dObj <= todayObj) {\n' +
'                    if (db.progress[dateStr][item.id] !== undefined) completedCount++;\n' +
'                }\n' +
'            });\n' +
'\n' +
'            let percentage = 0;\n' +
'            if (totalDaysSoFar > 0) {\n' +
'                percentage = (completedCount / totalDaysSoFar) * 100;\n' +
'                if (percentage > 100) percentage = 100;\n' +
'            }\n' +
'\n' +
'            const lightColor = item.color + \'40\'; \n' +
'\n' +
'            html += \'<div class="bar-col">\';\n' +
'            html += \'<div class="bar-percent">\' + Math.round(percentage) + \'%</div>\';\n' +
'            html += \'<div class="bar-track" style="background-color: \' + lightColor + \';" title="\' + item.title + \': \' + completedCount + \'/\' + totalDaysSoFar + \' Days">\';\n' +
'            html += \'<div class="bar-fill" style="height: \' + percentage + \'%; background-color: \' + item.color + \';"></div>\';\n' +
'            html += \'<div class="bar-label-inner">\' + item.title + \'</div>\';\n' +
'            html += \'</div>\';\n' +
'            html += \'</div>\';\n' +
'        });\n' +
'        \n' +
'        html += \'</div></div>\';\n' +
'        container.innerHTML = html;\n' +
'    }\n' +
'\n' +
'    function changeMonth(dir) {\n' +
'        currentMonth += dir;\n' +
'        if (currentMonth > 11) { currentMonth = 0; currentYear++; }\n' +
'        else if (currentMonth < 0) { currentMonth = 11; currentYear--; }\n' +
'        renderCalendar();\n' +
'    }\n' +
'\n' +
'    function renderCalendar() {\n' +
'        const grid = document.getElementById(\'calendar-grid\');\n' +
'        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];\n' +
'        document.getElementById(\'month-year-display\').innerText = monthNames[currentMonth] + \' \' + currentYear;\n' +
'        \n' +
'        const firstDay = new Date(currentYear, currentMonth, 1).getDay();\n' +
'        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();\n' +
'        \n' +
'        let html = \'\';\n' +
'        [\'Sun\', \'Mon\', \'Tue\', \'Wed\', \'Thu\', \'Fri\', \'Sat\'].forEach(d => { html += \'<div class="weekday">\' + d + \'</div>\'; });\n' +
'        \n' +
'        for (let i = 0; i < firstDay; i++) html += \'<div class="day-cell empty"></div>\';\n' +
'        \n' +
'        for (let i = 1; i <= daysInMonth; i++) {\n' +
'            const dateStr = currentYear + \'-\' + String(currentMonth + 1).padStart(2, \'0\') + \'-\' + String(i).padStart(2, \'0\');\n' +
'            const isToday = dateStr === todayStr;\n' +
'            const dayData = db.progress[dateStr] || {};\n' +
'            \n' +
'            const completedColors = [];\n' +
'            db.items.forEach(g => {\n' +
'                if (isItemActive(g, dateStr) && dayData[g.id] !== undefined) completedColors.push(g.color);\n' +
'            });\n' +
'\n' +
'            let bgStyle = \'transparent\';\n' +
'            let dataClass = \'\';\n' +
'            \n' +
'            if (completedColors.length === 1) {\n' +
'                bgStyle = completedColors[0];\n' +
'                dataClass = \'has-data\';\n' +
'            } else if (completedColors.length > 1) {\n' +
'                const step = 100 / completedColors.length;\n' +
'                const stops = [];\n' +
'                for(let idx = 0; idx < completedColors.length; idx++) {\n' +
'                    stops.push(completedColors[idx] + \' \' + (idx * step) + \'% \' + ((idx + 1) * step) + \'%\');\n' +
'                }\n' +
'                bgStyle = \'conic-gradient(\' + stops.join(\', \') + \')\';\n' +
'                dataClass = \'has-data\';\n' +
'            }\n' +
'\n' +
'            html += \'<div class="day-cell" data-date="\' + dateStr + \'">\';\n' +
'            html += \'<div class="day-circle \' + (isToday ? \'today\' : \'\') + \' \' + dataClass + \'" style="background: \' + bgStyle + \'">\';\n' +
'            html += i;\n' +
'            html += \'</div>\';\n' +
'            html += \'</div>\';\n' +
'        }\n' +
'        \n' +
'        grid.innerHTML = html;\n' +
'        document.getElementById(\'speech-bubble\').classList.remove(\'show\');\n' +
'    }\n' +
'\n' +
'    function isItemActive(item, dateStr) {\n' +
'        const start = new Date(item.startDate + "T00:00:00");\n' +
'        const target = new Date(dateStr + "T00:00:00");\n' +
'        const diffDays = Math.floor((target - start) / (1000 * 60 * 60 * 24));\n' +
'        return diffDays >= 0 && diffDays < item.endCount;\n' +
'    }\n' +
'\n' +
'    function showBubble(cellEl, dateStr) {\n' +
'        const bubble = document.getElementById(\'speech-bubble\');\n' +
'        const content = document.getElementById(\'speech-content\');\n' +
'        const tail = document.getElementById(\'speech-tail\');\n' +
'        \n' +
'        const activeItems = db.items.filter(g => isItemActive(g, dateStr));\n' +
'        const dayData = db.progress[dateStr] || {};\n' +
'        \n' +
'        const dObj = new Date(dateStr + "T00:00:00");\n' +
'        let html = \'<div class="speech-date">\' + dObj.toLocaleDateString(\'en-US\', {month: \'short\', day: \'numeric\', year: \'numeric\'}) + \'</div>\';\n' +
'        \n' +
'        if(activeItems.length === 0) {\n' +
'            html += \'<div style="font-size:0.75rem; color:var(--text-muted); text-align:center;">No growth active.</div>\';\n' +
'        } else {\n' +
'            activeItems.forEach(g => {\n' +
'                const isDone = dayData[g.id] !== undefined;\n' +
'                html += \'<div class="speech-item" style="color:\' + g.color + \'">\';\n' +
'                html += \'<span>\' + g.title + \'</span>\';\n' +
'                html += \'<i class="fas \' + (isDone ? \'fa-check-circle\' : \'fa-circle\') + \'"></i>\';\n' +
'                html += \'</div>\';\n' +
'            });\n' +
'        }\n' +
'\n' +
'        content.innerHTML = html;\n' +
'        bubble.style.display = \'block\';\n' +
'\n' +
'        const bRect = bubble.getBoundingClientRect();\n' +
'        const cellRect = cellEl.getBoundingClientRect();\n' +
'        \n' +
'        let bubbleX = (window.innerWidth / 2) - (bRect.width / 2);\n' +
'        let bubbleY = cellRect.top - bRect.height - 6.5; \n' +
'        let placeBelow = false;\n' +
'\n' +
'        if (bubbleY < 10) { \n' +
'            bubbleY = cellRect.bottom + 6.5; \n' +
'            placeBelow = true; \n' +
'        }\n' +
'\n' +
'        bubble.style.left = bubbleX + \'px\';\n' +
'        bubble.style.top = bubbleY + \'px\';\n' +
'        \n' +
'        let tailX = (cellRect.left + cellRect.width / 2) - bubbleX;\n' +
'        tailX = Math.max(15, Math.min(bRect.width - 15, tailX)); \n' +
'        \n' +
'        tail.style.left = tailX + \'px\';\n' +
'        \n' +
'        if (placeBelow) {\n' +
'            tail.style.top = \'-6.5px\'; tail.style.bottom = \'auto\';\n' +
'            tail.style.transform = \'translateX(-50%) rotate(225deg)\'; \n' +
'        } else {\n' +
'            tail.style.bottom = \'-6.5px\'; tail.style.top = \'auto\';\n' +
'            tail.style.transform = \'translateX(-50%) rotate(45deg)\'; \n' +
'        }\n' +
'        \n' +
'        setTimeout(() => bubble.classList.add(\'show\'), 10);\n' +
'    }\n' +
'\n' +
'    function initColorPalette() {\n' +
'        const container = document.getElementById(\'color-palette\');\n' +
'        const input = document.getElementById(\'g-color\');\n' +
'        const usedColors = db.items.map(g => g.color);\n' +
'        let html = \'\'; let firstAvail = null;\n' +
'        \n' +
'        paletteColors.forEach((hex) => {\n' +
'            const isUsed = usedColors.includes(hex);\n' +
'            if(!isUsed && !firstAvail) firstAvail = hex;\n' +
'            html += \'<div class="color-swatch \' + (isUsed ? \'hidden\' : \'\') + \'" style="background-color: \' + hex + \';" data-color="\' + hex + \'"></div>\';\n' +
'        });\n' +
'        \n' +
'        container.innerHTML = html;\n' +
'        if(firstAvail) {\n' +
'            input.value = firstAvail;\n' +
'            container.querySelector(\'[data-color="\' + firstAvail + \']\').classList.add(\'selected\');\n' +
'            document.getElementById(\'color-error\').style.display = \'none\';\n' +
'            document.getElementById(\'create-btn\').disabled = false;\n' +
'        } else {\n' +
'            document.getElementById(\'color-error\').style.display = \'block\';\n' +
'            document.getElementById(\'create-btn\').disabled = true;\n' +
'        }\n' +
'        \n' +
'        container.onclick = (e) => handlePaletteClick(e, container, input, false);\n' +
'    }\n' +
'\n' +
'    function initEditColorPalette(currentColor) {\n' +
'        const container = document.getElementById(\'edit-color-palette\');\n' +
'        const input = document.getElementById(\'edit-g-color\');\n' +
'        let html = \'\'; \n' +
'        \n' +
'        paletteColors.forEach((hex) => {\n' +
'            const isSelected = hex === currentColor ? \'selected\' : \'\';\n' +
'            html += \'<div class="color-swatch \' + isSelected + \'" style="background-color: \' + hex + \';" data-color="\' + hex + \'"></div>\';\n' +
'        });\n' +
'        \n' +
'        container.innerHTML = html;\n' +
'        input.value = currentColor;\n' +
'        container.onclick = (e) => handlePaletteClick(e, container, input, true);\n' +
'    }\n' +
'\n' +
'    function handlePaletteClick(e, container, inputElement, isEditMode) {\n' +
'        if(e.target.classList.contains(\'color-swatch\') && (isEditMode || !e.target.classList.contains(\'hidden\'))) {\n' +
'            container.querySelectorAll(\'.color-swatch\').forEach(el => el.classList.remove(\'selected\'));\n' +
'            e.target.classList.add(\'selected\');\n' +
'            inputElement.value = e.target.dataset.color;\n' +
'        }\n' +
'    }\n' +
'\n' +
'    function openAddModal() {\n' +
'        document.getElementById(\'g-start-date\').value = todayStr;\n' +
'        document.getElementById(\'g-type\').value = \'boolean\';\n' +
'        toggleStartGoalData(\'add\');\n' +
'        initColorPalette(); \n' +
'        openModalObj(\'add-modal\');\n' +
'    }\n' +
'\n' +
'    function toggleDataFields(mode) {\n' +
'        const prefix = mode === \'add\' ? \'g\' : \'edit-g\';\n' +
'        const hasData = document.getElementById(prefix + \'-has-data\').checked;\n' +
'        document.getElementById(mode === \'add\' ? \'data-fields\' : \'edit-data-fields\').style.display = hasData ? \'block\' : \'none\';\n' +
'        document.getElementById(prefix + \'-question\').required = hasData;\n' +
'        toggleStartGoalData(mode);\n' +
'    }\n' +
'\n' +
'    function toggleStartGoalData(mode) {\n' +
'        const prefix = mode === \'add\' ? \'g\' : \'edit-g\';\n' +
'        const type = document.getElementById(prefix + \'-type\').value;\n' +
'        const wrapper = document.getElementById(mode === \'add\' ? \'start-goal-wrapper\' : \'edit-start-goal-wrapper\');\n' +
'        if (type === \'boolean\') {\n' +
'            wrapper.style.display = \'none\';\n' +
'        } else {\n' +
'            wrapper.style.display = \'grid\';\n' +
'        }\n' +
'    }\n' +
'\n' +
'    document.getElementById(\'add-grow-form\').addEventListener(\'submit\', async (e) => {\n' +
'        e.preventDefault();\n' +
'        \n' +
'        const formData = new FormData();\n' +
'        formData.append(\'title\', document.getElementById(\'g-title\').value.trim());\n' +
'        formData.append(\'description\', document.getElementById(\'g-desc\').value.trim());\n' +
'        formData.append(\'startDate\', document.getElementById(\'g-start-date\').value);\n' +
'        formData.append(\'endCount\', document.getElementById(\'g-end-count\').value);\n' +
'        formData.append(\'color\', document.getElementById(\'g-color\').value);\n' +
'        formData.append(\'hasData\', document.getElementById(\'g-has-data\').checked ? \'true\' : \'false\');\n' +
'        formData.append(\'type\', document.getElementById(\'g-type\').value);\n' +
'        formData.append(\'question\', document.getElementById(\'g-question\').value.trim());\n' +
'        formData.append(\'start\', document.getElementById(\'g-start-data\').value);\n' +
'        formData.append(\'end\', document.getElementById(\'g-goal-data\').value);\n' +
'\n' +
'        const res = await fetch(API_URL + \'grow\', { \n' +
'            method: \'POST\', \n' +
'            body: new URLSearchParams(formData) \n' +
'        });\n' +
'        \n' +
'        if (res.ok) {\n' +
'            closeModal(\'add-modal\');\n' +
'            document.getElementById(\'add-grow-form\').reset();\n' +
'            document.getElementById(\'data-fields\').style.display = \'none\';\n' +
'            await fetchData();\n' +
'        }\n' +
'    });\n' +
'\n' +
'    function openLogModal(dateStr) {\n' +
'        const activeItems = db.items.filter(g => isItemActive(g, dateStr));\n' +
'        const dateObj = new Date(dateStr + "T00:00:00");\n' +
'        document.getElementById(\'log-modal-title\').innerText = dateObj.toLocaleDateString(\'en-US\', { month: \'long\', day: \'numeric\', year: \'numeric\' });\n' +
'        const listContainer = document.getElementById(\'daily-grow-list\');\n' +
'        \n' +
'        let html = \'\';\n' +
'        const dayData = db.progress[dateStr] || {};\n' +
'\n' +
'        activeItems.forEach(item => {\n' +
'            const isDone = dayData[item.id] !== undefined;\n' +
'            html += \'<div class="grow-card">\';\n' +
'            html += \'<details class="grow-details" style="display: contents;">\';\n' +
'            html += \'<summary class="grow-summary">\';\n' +
'            html += \'<div class="grow-title-section">\';\n' +
'            html += \'<i class="fas fa-chevron-right chevron-icon"></i>\';\n' +
'            html += \'<div class="color-dot" style="background:\' + item.color + \';"></div>\';\n' +
'            html += \'<span class="grow-title">\' + item.title + \'</span>\';\n' +
'            html += \'</div>\';\n' +
'            html += \'<div class="grow-actions">\';\n' +
'            html += \'<button class="action-btn" onclick="event.preventDefault(); event.stopPropagation(); handleLogAction(event, \\\'\' + item.id + \'\\\', \\\'\' + dateStr + \'\\\')" style="background: \' + (isDone ? \'var(--hover-color)\' : item.color) + \'; color: \' + (isDone ? \'var(--text-secondary)\' : \'white\') + \';" \' + (isDone ? \'disabled\' : \'\') + \'>\';\n' +
'            html += \'<i class="fas fa-check"></i>\';\n' +
'            html += \'</button>\';\n' +
'            html += \'</div>\';\n' +
'            html += \'</summary>\';\n' +
'            if(item.description) {\n' +
'                html += \'<div class="grow-description-container">\';\n' +
'                html += \'<div class="grow-description" style="border-left-color: \' + item.color + \';">\' + item.description + \'</div>\';\n' +
'                html += \'</div>\';\n' +
'            }\n' +
'            html += \'</details>\';\n' +
'            html += \'</div>\';\n' +
'        });\n' +
'        listContainer.innerHTML = html;\n' +
'        showLogList();\n' +
'        openModalObj(\'log-modal\');\n' +
'    }\n' +
'\n' +
'    window.handleLogAction = (e, itemId, dateStr) => {\n' +
'        const btn = e.currentTarget;\n' +
'        btn.innerHTML = \'<i class="fas fa-spinner fa-spin"></i>\';\n' +
'        btn.style.background = \'var(--hover-color)\';\n' +
'        btn.style.color = \'var(--text-muted)\';\n' +
'        btn.disabled = true;\n' +
'\n' +
'        const item = db.items.find(g => g.id === itemId);\n' +
'        if (item.hasData && item.type !== \'boolean\') openLogQuestion(item, dateStr);\n' +
'        else saveDirectComplete(item, dateStr);\n' +
'    };\n' +
'\n' +
'    function openLogQuestion(item, dateStr) {\n' +
'        loggingContext = { item, dateStr };\n' +
'        document.getElementById(\'l-title\').innerText = item.title;\n' +
'        \n' +
'        const descElement = document.getElementById(\'l-desc-container\');\n' +
'        if(item.description) {\n' +
'            descElement.innerHTML = \'<div class="grow-description" style="border-left-color: \' + item.color + \'; margin-bottom: 15px;">\' + item.description + \'</div>\';\n' +
'        } else {\n' +
'            descElement.innerHTML = \'\';\n' +
'        }\n' +
'        \n' +
'        document.getElementById(\'l-question\').innerText = item.question;\n' +
'\n' +
'        const wrapper = document.getElementById(\'l-input-wrapper\');\n' +
'        if (item.type === \'float\') wrapper.innerHTML = \'<input type="number" step="0.01" class="form-control" id="log-input" placeholder="0.00">\';\n' +
'        else wrapper.innerHTML = \'<input type="number" step="1" class="form-control" id="log-input" placeholder="0">\';\n' +
'\n' +
'        document.getElementById(\'log-list-view\').style.display = \'none\';\n' +
'        document.getElementById(\'log-question-view\').style.display = \'block\';\n' +
'    }\n' +
'\n' +
'    async function saveDirectComplete(item, dateStr) {\n' +
'        const formData = new FormData();\n' +
'        formData.append(\'itemId\', item.id);\n' +
'        formData.append(\'dateStr\', dateStr);\n' +
'        formData.append(\'value\', \'true\');\n' +
'\n' +
'        const res = await fetch(API_URL + \'grow/log\', { \n' +
'            method: \'POST\', \n' +
'            body: new URLSearchParams(formData) \n' +
'        });\n' +
'        \n' +
'        if (res.ok) {\n' +
'            await fetchData();\n' +
'            \n' +
'            const activeItems = db.items.filter(g => isItemActive(g, dateStr));\n' +
'            const dayData = db.progress[dateStr] || {};\n' +
'            const isAllCompleted = activeItems.length > 0 && activeItems.every(g => dayData[g.id] !== undefined);\n' +
'            \n' +
'            if (isAllCompleted) {\n' +
'                closeModal(\'log-modal\');\n' +
'                showBubble(document.querySelector(\'.day-cell[data-date="\' + dateStr + \'"]\'), dateStr);\n' +
'            } else openLogModal(dateStr);\n' +
'        }\n' +
'    }\n' +
'\n' +
'    document.getElementById(\'save-log-btn\').addEventListener(\'click\', async () => {\n' +
'        const inputEl = document.getElementById(\'log-input\');\n' +
'        let val = inputEl.value.trim();\n' +
'        if (val === \'\') return alert(\'Enter a value.\');\n' +
'\n' +
'        const { item, dateStr } = loggingContext;\n' +
'        if (item.type === \'float\') val = parseFloat(parseFloat(val).toFixed(2)); \n' +
'        else val = parseInt(val, 10);\n' +
'\n' +
'        const formData = new FormData();\n' +
'        formData.append(\'itemId\', item.id);\n' +
'        formData.append(\'dateStr\', dateStr);\n' +
'        formData.append(\'value\', val);\n' +
'\n' +
'        const res = await fetch(API_URL + \'grow/log\', { \n' +
'            method: \'POST\', \n' +
'            body: new URLSearchParams(formData) \n' +
'        });\n' +
'        \n' +
'        if (res.ok) {\n' +
'            await fetchData();\n' +
'            \n' +
'            const activeItems = db.items.filter(g => isItemActive(g, dateStr));\n' +
'            const dayData = db.progress[dateStr] || {};\n' +
'            const isAllCompleted = activeItems.length > 0 && activeItems.every(g => dayData[g.id] !== undefined);\n' +
'            \n' +
'            if (isAllCompleted) {\n' +
'                closeModal(\'log-modal\');\n' +
'                showBubble(document.querySelector(\'.day-cell[data-date="\' + dateStr + \'"]\'), dateStr);\n' +
'            } else openLogModal(dateStr);\n' +
'        }\n' +
'    });\n' +
'\n' +
'    function openModalObj(id) {\n' +
'        const modal = document.getElementById(id);\n' +
'        modal.style.display = \'flex\';\n' +
'        setTimeout(() => modal.classList.add(\'show\'), 10);\n' +
'    }\n' +
'    \n' +
'    function closeModal(id) { \n' +
'        const modal = document.getElementById(id);\n' +
'        modal.classList.remove(\'show\');\n' +
'        setTimeout(() => modal.style.display = \'none\', 300);\n' +
'    }\n' +
'\n' +
'    function showLogList() { \n' +
'        document.getElementById(\'log-list-view\').style.display = \'block\'; \n' +
'        document.getElementById(\'log-question-view\').style.display = \'none\'; \n' +
'    }\n' +
'    \n' +
'    window.addEventListener(\'click\', (e) => { \n' +
'        if (e.target.classList.contains(\'modal\')) closeModal(e.target.id); \n' +
'    });\n' +
'</script>\n' +
'</body>\n' +
'</html>';
    fs.writeFileSync(path.join(viewsDir, 'index.ejs'), growEJS);
    console.log('✅ EJS template written');
}
writeGrowEJS();

// ==========================================
// 📱 API ROUTES FOR GROW TRACKER
// ==========================================

app.get('/', async (req, res) => {
    try {
        const currentIST = getCurrentISTDisplay();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const now = new Date();
        res.render('index', { 
            currentDate: currentIST.displayDate,
            currentTime: currentIST.displayTime,
            currentMonth: monthNames[now.getMonth()] + ' ' + now.getFullYear()
        });
    } catch (error) {
        console.error('Error rendering index:', error);
        res.status(500).send(error.message);
    }
});

app.get('/api/grow/data', async (req, res) => {
    try {
        const data = await db.collection('grow').findOne({ type: 'tracker' });
        if (!data) {
            const defaultData = { type: 'tracker', items: [], progress: {} };
            await db.collection('grow').insertOne(defaultData);
            res.json(defaultData);
        } else {
            res.json(data);
        }
    } catch (error) {
        console.error('Error fetching grow data:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/grow', async (req, res) => {
    try {
        const { title, description, startDate, endCount, color, hasData, type, question, start, end } = req.body;
        
        const newItem = {
            id: generateId(),
            title: title,
            description: description || '',
            startDate: startDate,
            endCount: parseInt(endCount),
            color: color,
            hasData: hasData === 'true',
            type: type || 'boolean'
        };

        if (hasData === 'true') {
            newItem.question = question || '';
            if (type !== 'boolean') {
                if (start && start !== '') newItem.start = type === 'float' ? parseFloat(start) : parseInt(start);
                if (end && end !== '') newItem.end = type === 'float' ? parseFloat(end) : parseInt(end);
            }
        }

        await db.collection('grow').updateOne(
            { type: 'tracker' },
            { $push: { items: newItem } },
            { upsert: true }
        );

        // Send notification to bot
        try {
            await bot.telegram.sendMessage(CHAT_ID, `🌱 <b>Growth Added:</b> ${title}`, { parse_mode: 'HTML' });
        } catch (e) {
            console.error('Bot notification error:', e);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error adding grow item:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/grow/:id/update', async (req, res) => {
    try {
        const { id, title, description, startDate, endCount, color, hasData, type, question, start, end } = req.body;
        
        const updatedItem = {
            id: id,
            title: title,
            description: description || '',
            startDate: startDate,
            endCount: parseInt(endCount),
            color: color,
            hasData: hasData === 'true',
            type: type || 'boolean'
        };

        if (hasData === 'true') {
            updatedItem.question = question || '';
            if (type !== 'boolean') {
                if (start && start !== '') updatedItem.start = type === 'float' ? parseFloat(start) : parseInt(start);
                if (end && end !== '') updatedItem.end = type === 'float' ? parseFloat(end) : parseInt(end);
            }
        }

        const result = await db.collection('grow').updateOne(
            { type: 'tracker', 'items.id': id },
            { $set: { 'items.$': updatedItem } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Item not found' });
        }

        // Send notification to bot
        try {
            await bot.telegram.sendMessage(CHAT_ID, `✏️ <b>Growth Updated:</b> ${title}`, { parse_mode: 'HTML' });
        } catch (e) {
            console.error('Bot notification error:', e);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating grow item:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/grow/:id/delete', async (req, res) => {
    try {
        // Get item title before deletion
        const tracker = await db.collection('grow').findOne({ type: 'tracker' });
        const item = tracker?.items.find(i => i.id === req.params.id);
        const title = item?.title || 'Unknown';

        // Remove from items
        await db.collection('grow').updateOne(
            { type: 'tracker' },
            { $pull: { items: { id: req.params.id } } }
        );

        // Remove from progress
        if (tracker && tracker.progress) {
            const progress = tracker.progress;
            let modified = false;
            
            Object.keys(progress).forEach(date => {
                if (progress[date] && progress[date][req.params.id] !== undefined) {
                    delete progress[date][req.params.id];
                    modified = true;
                }
            });
            
            if (modified) {
                await db.collection('grow').updateOne(
                    { type: 'tracker' },
                    { $set: { progress: progress } }
                );
            }
        }

        // Send notification to bot
        try {
            await bot.telegram.sendMessage(CHAT_ID, `🗑️ <b>Growth Deleted:</b> ${title}`, { parse_mode: 'HTML' });
        } catch (e) {
            console.error('Bot notification error:', e);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting grow item:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/grow/log', async (req, res) => {
    try {
        const { itemId, dateStr, value } = req.body;
        
        let parsedValue = value;
        if (value === 'true') parsedValue = true;
        else if (value === 'false') parsedValue = false;
        else if (!isNaN(parseFloat(value))) parsedValue = parseFloat(value);

        const tracker = await db.collection('grow').findOne({ type: 'tracker' });
        const item = tracker?.items.find(i => i.id === itemId);
        const title = item?.title || 'Unknown';

        // Create the update path
        const updatePath = `progress.${dateStr}.${itemId}`;
        
        // Ensure progress object exists
        await db.collection('grow').updateOne(
            { type: 'tracker' },
            { $set: { [updatePath]: parsedValue } }
        );

        // Send notification to bot
        try {
            await bot.telegram.sendMessage(CHAT_ID, `✅ <b>Growth Completed:</b> ${title} for ${dateStr}`, { parse_mode: 'HTML' });
        } catch (e) {
            console.error('Bot notification error:', e);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error logging grow completion:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 🚀 BOOTSTRAP
// ==========================================
async function start() {
    try {
        console.log('🚀 Starting Grow Tracker...');
        
        if (await connectDB()) {
            console.log('✅ Database connected');
            
            // Start web server
            app.listen(PORT, '0.0.0.0', () => {
                console.log('🌱 Grow Tracker web interface running on port ' + PORT);
                console.log('🌍 Public Web URL: ' + WEB_APP_URL);
                console.log('🕐 IST Time: ' + getCurrentISTDisplay().dateTime);
            });
            
            // Start bot
            await bot.launch();
            console.log('🤖 Bot Started Successfully - Notifications Only Mode!');
        } else {
            console.error('❌ Failed to connect to database, retrying in 5 seconds...');
            setTimeout(start, 5000);
        }
    } catch (error) {
        console.error('Startup error:', error);
        setTimeout(start, 10000);
    }
}

// Error handlers for bot
bot.catch((err, ctx) => {
    console.error('Bot error:', err);
});

// Graceful shutdown
process.once('SIGINT', () => { 
    console.log('Shutting down...');
    bot.stop('SIGINT'); 
    if (client) client.close();
    process.exit(0); 
});
process.once('SIGTERM', () => { 
    console.log('Shutting down...');
    bot.stop('SIGTERM'); 
    if (client) client.close();
    process.exit(0); 
});

start();
