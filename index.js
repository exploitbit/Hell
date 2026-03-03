const { Telegraf, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const express = require('express');
const path = require('path');
const fs = require('fs');

// ==========================================
// ⚙️ CONFIGURATION - DIRECT HARDCODED VALUES
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

function getTomorrowStartUTC() {
    return new Date(getTodayStartUTC().getTime() + 24 * 60 * 60 * 1000);
}

function formatISTDate(utcDate) {
    return utcDate ? utcToISTDisplay(utcDate).displayDate : '';
}

function formatISTTime(utcDate) {
    return utcDate ? utcToISTDisplay(utcDate).displayTime : '';
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
            client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000, maxPoolSize: 10 });
            await client.connect();
            db = client.db('telegram_bot');
            console.log('✅ Connected to MongoDB');
            return true;
        } catch (error) {
            retries--;
            if (retries === 0) return false;
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    return false;
}

// ==========================================
// 🛠️ UTILITY FUNCTIONS
// ==========================================
function generateId() { return 'g' + Date.now(); }

// 8 Exact Colors
const paletteColors = ['#ec4899', '#a855f7', '#38bdf8', '#ef4444', '#f97316', '#16a34a', '#84cc16', '#3b82f6'];

// ==========================================
// 🤖 BOT SETUP (NOTIFICATIONS ONLY)
// ==========================================
const bot = new Telegraf(BOT_TOKEN);

bot.command('start', async (ctx) => {
    const keyboard = Markup.inlineKeyboard([[Markup.button.webApp('🌱 Open Grow Tracker', WEB_APP_URL)]]);
    await ctx.reply('🌱 <b>Grow Tracker</b>\n\nTrack your daily progress using the Web App below. I will send you notifications here.', { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
});

// ==========================================
// 📱 WEB INTERFACE - GROW TRACKER UI
// ==========================================

// Write the EJS template
function writeGrowEJS() {
    const growEJS = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>🌱 Grow Tracker</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        /* === THEME VARIABLES - SYSTEM DEFAULT ONLY === */
        :root {
            --bg-color: #f5f7fa;
            --surface-color: #ffffff;
            --text-primary: #1e293b;
            --text-secondary: #475569;
            --border-color: #e2e8f0;
            --accent-color: #059669; /* Green for grow theme */
            --success-color: #059669;
            --danger-color: #dc2626;
            --hover-color: #f1f5f9;
            --shadow-soft: 0 4px 20px -5px rgba(0,0,0,0.08);
            --modal-backdrop: rgba(15, 23, 42, 0.5);
            --ring-today: #059669;
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --bg-color: #0f172a;
                --surface-color: #1e293b;
                --text-primary: #f8fafc;
                --text-secondary: #cbd5e1;
                --border-color: #334155;
                --accent-color: #34d399;
                --success-color: #34d399;
                --danger-color: #f87171;
                --hover-color: #2d3b4f;
                --shadow-soft: 0 4px 20px -5px rgba(0,0,0,0.5);
                --modal-backdrop: rgba(0, 0, 0, 0.8);
                --ring-today: #34d399;
            }
        }

        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
        
        body { 
            background: var(--bg-color); color: var(--text-primary); 
            padding: 20px 10px 120px 10px; min-height: 100vh;
            transition: background 0.3s, color 0.3s; 
            font-size: 12px;
        }

        /* Detail/Summary Panels */
        .panel-wrapper {
            max-width: 600px; margin: 0 auto 15px auto;
            background: var(--surface-color);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            box-shadow: var(--shadow-soft);
            overflow: hidden;
        }

        .panel-summary {
            display: flex; justify-content: space-between; align-items: center;
            padding: 15px 20px; font-size: 1.1rem; font-weight: 700; color: var(--text-primary);
            cursor: pointer; list-style: none; user-select: none;
            background: var(--surface-color); border-bottom: 1px solid transparent;
        }
        .panel-summary::-webkit-details-marker { display: none; }
        .panel-summary i.chevron { transition: transform 0.3s; color: var(--text-secondary); }
        details[open] .panel-summary i.chevron { transform: rotate(180deg); }
        details[open] .panel-summary { border-bottom: 1px solid var(--border-color); }

        .panel-body { padding: 20px; }

        /* ================= GRAPHS STYLING ================= */
        .graphs-grid-container {
            width: 100%;
            aspect-ratio: 1 / 1;
            display: flex; flex-direction: column;
        }
        .chart-wrapper {
            display: flex; justify-content: space-around; align-items: flex-end;
            flex: 1; padding-top: 10px;
        }
        .bar-col {
            display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
            width: 10%; max-width: 35px; height: 100%;
        }
        .bar-track {
            width: 100%; height: 90%; border-radius: 6px;
            position: relative;
            display: flex; align-items: flex-end;
        }
        .bar-fill {
            width: 100%; border-radius: 6px;
            transition: height 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .bar-label-inner {
            position: absolute;
            top: 0; bottom: 0; left: 0; right: 0;
            writing-mode: vertical-rl;
            transform: rotate(180deg);
            display: flex; align-items: center; justify-content: flex-end;
            padding-top: 8px;
            color: #ffffff; font-size: 0.75rem; font-weight: 700;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            text-shadow: 0px 1px 3px rgba(0,0,0,0.8), 0px 0px 2px rgba(0,0,0,0.5);
            pointer-events: none; z-index: 10;
        }
        .bar-percent { font-size: 0.7rem; font-weight: 800; color: var(--text-primary); margin-bottom: 5px; }

        /* ================= CALENDAR STYLING ================= */
        .month-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; }
        .month-nav h1 { 
            font-size: 0.95rem; font-weight: 700; color: var(--text-primary); 
            margin: 0; text-transform: uppercase; letter-spacing: 1px; 
            background: var(--hover-color); padding: 6px 16px; 
            border-radius: 50px; border: 1px solid var(--border-color);
        }
        .nav-btn {
            background: var(--bg-color); border: 1px solid var(--border-color); width: 30px; height: 30px; border-radius: 50%;
            cursor: pointer; font-size: 0.8rem; color: var(--text-secondary); display: flex; align-items: center; justify-content: center;
        }

        .grid-container { width: 100%; aspect-ratio: 1 / 1; display: flex; flex-direction: column; }
        .calendar-grid { flex: 1; display: grid; grid-template-columns: repeat(7, 1fr); grid-template-rows: auto repeat(6, 1fr); gap: 6px; }
        .weekday { display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.65rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px; }
        
        .day-cell { display: flex; align-items: center; justify-content: center; border-radius: 12px; position: relative; }
        .day-cell.empty { pointer-events: none; }
        .day-cell:hover:not(.empty) { background: var(--hover-color); cursor: pointer; }

        .day-circle {
            width: 100%; max-width: 40px; aspect-ratio: 1; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-weight: 700; font-size: 0.9rem; color: var(--text-primary);
            transition: transform 0.2s ease; position: relative;
        }
        .day-cell:hover:not(.empty) .day-circle { transform: scale(1.1); }
        
        .day-circle.has-data {
            color: #ffffff; box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            text-shadow: 0px 1px 3px rgba(0,0,0,0.7), 0px 0px 2px rgba(0,0,0,0.5);
        }
        .day-circle.today { box-shadow: 0 0 0 2px var(--surface-color), 0 0 0 4px var(--ring-today); color: var(--ring-today); font-weight: 800; }
        .day-circle.today.has-data { color: #ffffff; }

        /* Dynamic Speech Bubble */
        .speech-bubble {
            position: absolute; background: var(--surface-color);
            backdrop-filter: blur(10px); border: 1px solid var(--border-color); 
            border-radius: 12px; padding: 12px; z-index: 100; min-width: 160px; max-width: 220px;
            pointer-events: none; box-shadow: 0 15px 30px rgba(0,0,0,0.2); display: none; opacity: 0;
        }
        .speech-bubble.show { opacity: 1; }
        .speech-tail { position: absolute; width: 12px; height: 12px; background: var(--surface-color); border: 1px solid var(--border-color); z-index: -1; }
        .speech-date { font-size: 0.7rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; text-transform: uppercase;}
        .speech-item { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 0.8rem; font-weight: 600; }

        /* ================= MANAGE GROW CARDS ================= */
        .grow-card {
            background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 14px; 
            padding: 14px; margin-bottom: 10px; transition: all 0.2s ease;
        }
        
        .grow-summary {
            display: flex; justify-content: space-between; align-items: flex-start;
            cursor: pointer; outline: none; list-style: none;
        }
        .grow-summary::-webkit-details-marker { display: none; }
        
        .grow-title-section { display: flex; align-items: center; gap: 8px; flex: 1; padding-top: 6px; }
        .grow-title-section .chevron-icon { font-size: 0.75rem; color: var(--text-secondary); transition: transform 0.2s; }
        details.grow-details[open] .chevron-icon { transform: rotate(90deg); }
        .grow-title { font-weight: 700; font-size: 1rem; color: var(--text-primary); }
        
        .grow-actions { display: flex; gap: 6px; flex-shrink: 0; margin-left: 10px; }
        .action-btn { 
            width: 30px; height: 30px; border-radius: 8px; border: none; 
            background: var(--hover-color); color: var(--text-secondary); 
            display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; 
        }
        .action-btn:hover { background: var(--accent-color); color: white; }
        .action-btn.delete:hover { background: var(--danger-color); color: white; }

        .grow-description-container { width: 100%; margin-top: 12px; }
        .grow-description { 
            font-size: 0.85rem; color: var(--text-secondary); padding: 8px 12px; 
            background: var(--hover-color); border-radius: 10px; border-left: 3px solid; 
            word-break: break-word; white-space: pre-wrap; line-height: 1.4; 
        }

        .grow-meta-row { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; width: 100%; }
        .badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--hover-color); border-radius: 100px; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); }
        .color-dot { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--border-color); flex-shrink: 0; }
        
        /* ================= UI ELEMENTS ================= */
        .fab {
            position: fixed; bottom: 20px; right: 20px; z-index: 1000;
            width: 54px; height: 54px; border-radius: 50%;
            background: var(--accent-color); color: white; border: none;
            display: flex; align-items: center; justify-content: center; font-size: 1.4rem;
            cursor: pointer; box-shadow: 0 8px 20px rgba(5,150,105,0.4); transition: 0.2s;
        }

        .modal {
            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: var(--modal-backdrop); backdrop-filter: blur(4px);
            align-items: center; justify-content: center; z-index: 2000; padding: 15px; opacity: 0;
        }
        .modal.show { opacity: 1; }
        .modal-content {
            background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 20px; 
            padding: 20px; width: 100%; max-width: 400px; max-height: 85vh; overflow-y: auto; 
            box-shadow: 0 25px 50px rgba(0,0,0,0.25); transform: scale(0.95); transition: 0.3s ease;
        }
        .modal.show .modal-content { transform: scale(1); }

        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;}
        .modal-header h2 { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); }
        .close-btn { background: var(--hover-color); border: none; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; color: var(--text-secondary); transition: 0.2s; }
        .close-btn:hover { background: var(--danger-color); color: white; }

        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 0.8rem; color: var(--text-primary); }
        .form-control { width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 10px; font-size: 0.85rem; outline: none; background: var(--bg-color); color: var(--text-primary); }
        .form-control:focus { border-color: var(--accent-color); }
        
        .color-palette { display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: 8px; }
        .color-swatch { width: 26px; height: 26px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: 0.1s;}
        .color-swatch.selected { transform: scale(1.15); box-shadow: 0 0 0 2px var(--surface-color), 0 0 0 4px var(--text-primary); }
        .color-swatch.hidden { display: none; }
        
        .checkbox-group { display: flex; align-items: center; gap: 8px; margin: 15px 0; font-weight: 600; font-size: 0.85rem; cursor: pointer; color: var(--text-primary); }
        .checkbox-group input { width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-color); }
        .hidden-fields { display: none; background: var(--hover-color); padding: 15px; border-radius: 12px; margin-bottom: 15px; }
        
        .btn-submit { width: 100%; padding: 14px; background: var(--accent-color); color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 0.95rem; cursor: pointer; margin-top: 10px; transition: 0.2s; }
        .btn-submit:hover { background: #047857; }

        .empty-state { text-align: center; color: var(--text-secondary); padding: 30px; font-size: 0.9rem; background: var(--hover-color); border-radius: 16px; }
        
        .log-card { background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 14px; padding: 12px; margin-bottom: 10px; }
        
        #log-question-view { display: none; }
        
        .app-header { 
            max-width: 600px; margin: 0 auto 15px auto; 
            background: var(--surface-color);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 12px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .app-header h1 { 
            font-size: 1.2rem; 
            font-weight: 700; 
            color: var(--accent-color);
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .time-badge { 
            display: flex; 
            align-items: center; 
            gap: 8px; 
            padding: 6px 12px; 
            background: var(--hover-color); 
            border-radius: 100px; 
            font-size: 0.75rem; 
            font-weight: 500; 
            color: var(--text-secondary);
        }
    </style>
</head>
<body>

    <div class="app-header">
        <h1><i class="fas fa-seedling"></i> Grow Tracker</h1>
        <div class="time-badge">
            <i class="fas fa-calendar-alt"></i> <span id="currentDateDisplay"><%= currentDate %></span>
            <span style="margin-left: 4px;"><i class="fas fa-clock"></i> <span id="currentTimeDisplay"><%= currentTime %></span></span>
        </div>
    </div>

    <details class="panel-wrapper">
        <summary class="panel-summary">
            <span>Grow Overview</span>
            <i class="fas fa-chevron-down chevron"></i>
        </summary>
        <div class="panel-body" id="graphs-container"></div>
    </details>

    <details class="panel-wrapper" open>
        <summary class="panel-summary">
            <span>Grow Calendar</span>
            <i class="fas fa-chevron-down chevron"></i>
        </summary>
        <div class="panel-body">
            <div class="month-nav">
                <button class="nav-btn" onclick="changeMonth(-1)"><i class="fas fa-chevron-left"></i></button>
                <h1 id="month-year-display"><%= currentMonth %></h1>
                <button class="nav-btn" onclick="changeMonth(1)"><i class="fas fa-chevron-right"></i></button>
            </div>
            <div class="grid-container">
                <div class="calendar-grid" id="calendar-grid"></div>
            </div>
        </div>
    </details>
    
    <details class="panel-wrapper" open>
        <summary class="panel-summary">
            <span>Manage Growth</span>
            <i class="fas fa-chevron-down chevron"></i>
        </summary>
        <div class="panel-body" id="grow-manage-list"></div>
    </details>
    
    <div class="speech-bubble" id="speech-bubble">
        <div id="speech-content"></div>
        <div class="speech-tail" id="speech-tail"></div>
    </div>

    <button class="fab" onclick="openAddModal()"><i class="fas fa-plus"></i></button>

    <div class="modal" id="add-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Add New Growth</h2>
                <button class="close-btn" onclick="closeModal('add-modal')"><i class="fas fa-times"></i></button>
            </div>
            <form id="add-grow-form">
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" class="form-control" id="g-title" required placeholder="e.g. Daily Workout">
                </div>
                <div class="form-group">
                    <label>Description (Optional)</label>
                    <textarea class="form-control" id="g-desc" rows="2" placeholder="Brief details..."></textarea>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="form-group"><label>Start Date</label><input type="date" class="form-control" id="g-start-date" required></div>
                    <div class="form-group"><label>Duration (Days)</label><input type="number" class="form-control" id="g-end-count" value="365" required></div>
                </div>
                <div class="form-group">
                    <label>Color</label>
                    <div class="color-palette" id="color-palette"></div>
                    <input type="hidden" id="g-color" value="" required>
                    <small id="color-error" style="color:var(--danger-color); display:none; font-weight:600; margin-top:5px;">All 8 colors are used! Max limit reached.</small>
                </div>
                
                <label class="checkbox-group"><input type="checkbox" id="g-has-data" onchange="toggleDataFields('add')">Require specific data logging?</label>
                
                <div class="hidden-fields" id="data-fields">
                    <div class="form-group"><label>Question</label><input type="text" class="form-control" id="g-question" placeholder="e.g. Current weight?"></div>
                    <div class="form-group">
                        <label>Type</label>
                        <select class="form-control" id="g-type" onchange="toggleStartGoalData('add')">
                            <option value="boolean">Boolean (Yes/No)</option>
                            <option value="float">Float (Decimals)</option>
                            <option value="integer">Integer (Whole numbers)</option>
                        </select>
                    </div>
                    <div id="start-goal-wrapper" style="display: none; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div class="form-group"><label>Start Data</label><input type="number" step="0.01" class="form-control" id="g-start-data"></div>
                        <div class="form-group"><label>End Data</label><input type="number" step="0.01" class="form-control" id="g-goal-data"></div>
                    </div>
                </div>
                <button type="submit" class="btn-submit" id="create-btn">Create Growth</button>
            </form>
        </div>
    </div>

    <div class="modal" id="edit-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Edit Growth</h2>
                <button class="close-btn" onclick="closeModal('edit-modal')"><i class="fas fa-times"></i></button>
            </div>
            <form id="edit-grow-form">
                <input type="hidden" id="edit-g-id">
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" class="form-control" id="edit-g-title" required>
                </div>
                <div class="form-group">
                    <label>Description (Optional)</label>
                    <textarea class="form-control" id="edit-g-desc" rows="2"></textarea>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="form-group"><label>Start Date</label><input type="date" class="form-control" id="edit-g-start-date" required></div>
                    <div class="form-group"><label>Duration (Days)</label><input type="number" class="form-control" id="edit-g-end-count" required></div>
                </div>
                <div class="form-group">
                    <label>Color (Interchanges if occupied)</label>
                    <div class="color-palette" id="edit-color-palette"></div>
                    <input type="hidden" id="edit-g-color" required>
                </div>
                
                <label class="checkbox-group"><input type="checkbox" id="edit-g-has-data" onchange="toggleDataFields('edit')">Require specific data logging?</label>
                
                <div class="hidden-fields" id="edit-data-fields">
                    <div class="form-group"><label>Question</label><input type="text" class="form-control" id="edit-g-question"></div>
                    <div class="form-group">
                        <label>Type</label>
                        <select class="form-control" id="edit-g-type" onchange="toggleStartGoalData('edit')">
                            <option value="boolean">Boolean (Yes/No)</option>
                            <option value="float">Float (Decimals)</option>
                            <option value="integer">Integer (Whole numbers)</option>
                        </select>
                    </div>
                    <div id="edit-start-goal-wrapper" style="display: none; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div class="form-group"><label>Start Data</label><input type="number" step="0.01" class="form-control" id="edit-g-start-data"></div>
                        <div class="form-group"><label>End Data</label><input type="number" step="0.01" class="form-control" id="edit-g-goal-data"></div>
                    </div>
                </div>
                <button type="submit" class="btn-submit" id="update-btn">Update Growth</button>
            </form>
        </div>
    </div>

    <div class="modal" id="log-modal">
        <div class="modal-content">
            <div id="log-list-view">
                <div class="modal-header">
                    <h2 id="log-modal-title">Log Growth</h2>
                    <button class="close-btn" onclick="closeModal('log-modal')"><i class="fas fa-times"></i></button>
                </div>
                <div id="daily-grow-list"></div>
            </div>
            <div id="log-question-view">
                <div class="modal-header">
                    <h2 id="l-title"></h2>
                    <button class="close-btn" onclick="showLogList()"><i class="fas fa-arrow-left"></i></button>
                </div>
                <div id="l-desc-container"></div>
                <div class="form-group">
                    <label id="l-question" style="font-size: 0.85rem; color: var(--text-primary);"></label>
                    <div id="l-input-wrapper"></div>
                </div>
                <button class="btn-submit" id="save-log-btn">Save Growth</button>
            </div>
        </div>
    </div>

<script>
    const API_URL = '/api/';
    let db = null;
    let todayStr = '';
    let currentMonth = 0;
    let currentYear = 2026;
    let loggingContext = null;

    // 8 Exact Colors
    const paletteColors = ['#ec4899', '#a855f7', '#38bdf8', '#ef4444', '#f97316', '#16a34a', '#84cc16', '#3b82f6'];

    document.addEventListener('DOMContentLoaded', () => {
        calculateISTDate();
        fetchData();

        // Calendar Click
        document.getElementById('calendar-grid').addEventListener('click', (e) => {
            const cell = e.target.closest('.day-cell');
            if(cell && !cell.classList.contains('empty')) {
                const dateStr = cell.dataset.date;
                const activeItems = db.items.filter(g => isItemActive(g, dateStr));
                const dayData = db.progress[dateStr] || {};
                const isAllCompleted = activeItems.length > 0 && activeItems.every(g => dayData[g.id] !== undefined);
                
                if(dateStr === todayStr && !isAllCompleted) openLogModal(dateStr);
                else showBubble(cell, dateStr);
            }
        });
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.day-cell') && !e.target.closest('.speech-bubble')) {
                document.getElementById('speech-bubble').classList.remove('show');
            }
        });
        
        // Update time display
        setInterval(() => {
            const now = new Date();
            const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
            document.getElementById('currentTimeDisplay').innerHTML = String(istNow.getUTCHours()).padStart(2, '0') + ':' + String(istNow.getUTCMinutes()).padStart(2, '0');
            document.getElementById('currentDateDisplay').innerHTML = String(istNow.getUTCDate()).padStart(2, '0') + '-' + String(istNow.getUTCMonth() + 1).padStart(2, '0') + '-' + istNow.getUTCFullYear();
        }, 1000);
    });

    function calculateISTDate() {
        const istString = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
        const istDate = new Date(istString);
        todayStr = `${istDate.getFullYear()}-${String(istDate.getMonth() + 1).padStart(2, '0')}-${String(istDate.getDate()).padStart(2, '0')}`;
        currentMonth = istDate.getMonth(); 
        currentYear = istDate.getFullYear();
    }

    async function fetchData() {
        try {
            const res = await fetch(API_URL + 'grow/data');
            db = await res.json();
            
            if (Array.isArray(db.progress)) db.progress = {};
            if (!Array.isArray(db.items)) db.items = [];
            
            updateAllViews();
        } catch(e) { 
            console.error("Load Error", e);
            db = { items: [], progress: {} };
        }
    }

    function updateAllViews() {
        renderCalendar();
        renderGraphs();
        renderGrowList();
    }

    // ==================== MANAGE GROW LIST ====================
    function renderGrowList() {
        const container = document.getElementById('grow-manage-list');
        if(db.items.length === 0) {
            container.innerHTML = \`<div class="empty-state"><i class="fas fa-seedling" style="font-size:2rem; margin-bottom:10px;"></i><br>No growth tracked yet. Start your journey with the + button.</div>\`;
            return;
        }

        let html = '';
        const todayObj = new Date(todayStr + "T00:00:00");

        db.items.forEach(item => {
            const startObj = new Date(item.startDate + "T00:00:00");
            let daysPassed = Math.floor((todayObj - startObj) / (1000 * 60 * 60 * 24));
            let daysLeft = item.endCount - daysPassed;
            if(daysPassed < 0) daysLeft = item.endCount; 
            if(daysLeft < 0) daysLeft = 0;

            html += \`
                <div class="grow-card">
                    <details class="grow-details">
                        <summary class="grow-summary">
                            <div class="grow-title-section">
                                <i class="fas fa-chevron-right chevron-icon"></i>
                                <span class="grow-title">\${item.title}</span>
                            </div>
                            <div class="grow-actions">
                                <button class="action-btn" onclick="event.preventDefault(); event.stopPropagation(); openEditModal('\${item.id}')"><i class="fas fa-pencil-alt"></i></button>
                                <button class="action-btn delete" onclick="event.preventDefault(); event.stopPropagation(); deleteGrow('\${item.id}')"><i class="fas fa-trash"></i></button>
                            </div>
                        </summary>
                        \${item.description ? \`
                        <div class="grow-description-container">
                            <div class="grow-description" style="border-left-color: \${item.color};">\${item.description}</div>
                        </div>\` : ''}
                    </details>
                    
                    <div class="grow-meta-row">
                        <span class="badge"><i class="fas fa-calendar-alt"></i> \${item.startDate}</span>
                        <span class="badge"><i class="fas fa-hourglass-half"></i> \${daysLeft} left</span>
                        <div class="color-dot" style="background:\${item.color};"></div>
                    </div>
                </div>
            \`;
        });
        container.innerHTML = html;
    }

    async function deleteGrow(itemId) {
        if(!confirm("Are you sure you want to delete this growth and ALL its history?")) return;
        
        const res = await fetch(API_URL + 'grow/' + itemId + '/delete', { method: 'POST' });
        if (res.ok) {
            await fetchData();
        }
    }

    function openEditModal(itemId) {
        const item = db.items.find(g => g.id === itemId);
        if(!item) return;

        document.getElementById('edit-g-id').value = item.id;
        document.getElementById('edit-g-title').value = item.title;
        document.getElementById('edit-g-desc').value = item.description || '';
        document.getElementById('edit-g-start-date').value = item.startDate;
        document.getElementById('edit-g-end-count').value = item.endCount;
        
        document.getElementById('edit-g-has-data').checked = item.hasData;
        toggleDataFields('edit');

        if(item.hasData) {
            document.getElementById('edit-g-question').value = item.question || '';
            document.getElementById('edit-g-type').value = item.type || 'boolean';
            toggleStartGoalData('edit');
            
            if(item.type !== 'boolean') {
                document.getElementById('edit-g-start-data').value = item.start !== undefined ? item.start : '';
                document.getElementById('edit-g-goal-data').value = item.end !== undefined ? item.end : '';
            }
        }

        initEditColorPalette(item.color);
        openModalObj('edit-modal');
    }

    document.getElementById('edit-grow-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const itemId = document.getElementById('edit-g-id').value;
        
        const formData = new FormData();
        formData.append('id', itemId);
        formData.append('title', document.getElementById('edit-g-title').value.trim());
        formData.append('description', document.getElementById('edit-g-desc').value.trim());
        formData.append('startDate', document.getElementById('edit-g-start-date').value);
        formData.append('endCount', document.getElementById('edit-g-end-count').value);
        formData.append('color', document.getElementById('edit-g-color').value);
        formData.append('hasData', document.getElementById('edit-g-has-data').checked ? 'true' : 'false');
        formData.append('type', document.getElementById('edit-g-type').value);
        formData.append('question', document.getElementById('edit-g-question').value.trim());
        formData.append('start', document.getElementById('edit-g-start-data').value);
        formData.append('end', document.getElementById('edit-g-goal-data').value);

        const res = await fetch(API_URL + 'grow/' + itemId + '/update', { 
            method: 'POST', 
            body: new URLSearchParams(formData) 
        });
        
        if (res.ok) {
            closeModal('edit-modal');
            await fetchData();
        }
    });

    // ==================== VERTICAL BAR GRAPHS ====================
    function renderGraphs() {
        const container = document.getElementById('graphs-container');
        if (db.items.length === 0) {
            container.innerHTML = \`<div class="empty-state">No growth added yet.</div>\`;
            return;
        }

        let html = \`<div class="graphs-grid-container"><div class="chart-wrapper">\`;
        
        db.items.forEach(item => {
            const start = new Date(item.startDate + "T00:00:00");
            const todayObj = new Date(todayStr + "T00:00:00");
            
            let totalDaysSoFar = Math.floor((todayObj - start) / (1000 * 60 * 60 * 24)) + 1;
            if (totalDaysSoFar < 1) totalDaysSoFar = 0;
            if (totalDaysSoFar > item.endCount) totalDaysSoFar = item.endCount;

            let completedCount = 0;
            Object.keys(db.progress).forEach(dateStr => {
                const dObj = new Date(dateStr + "T00:00:00");
                if (dObj >= start && dObj <= todayObj) {
                    if (db.progress[dateStr][item.id] !== undefined) completedCount++;
                }
            });

            let percentage = 0;
            if (totalDaysSoFar > 0) {
                percentage = (completedCount / totalDaysSoFar) * 100;
                if (percentage > 100) percentage = 100;
            }

            const lightColor = item.color + '40'; 

            html += \`
                <div class="bar-col">
                    <div class="bar-percent">\${Math.round(percentage)}%</div>
                    <div class="bar-track" style="background-color: \${lightColor};" title="\${item.title}: \${completedCount}/\${totalDaysSoFar} Days">
                        <div class="bar-fill" style="height: \${percentage}%; background-color: \${item.color};"></div>
                        <div class="bar-label-inner">\${item.title}</div>
                    </div>
                </div>
            \`;
        });
        
        html += \`</div></div>\`;
        container.innerHTML = html;
    }

    // ==================== CALENDAR RENDER ====================
    function changeMonth(dir) {
        currentMonth += dir;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        else if (currentMonth < 0) { currentMonth = 11; currentYear--; }
        renderCalendar();
    }

    function renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        document.getElementById('month-year-display').innerText = \`\${monthNames[currentMonth]} \${currentYear}\`;
        
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        
        let html = '';
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(d => { html += \`<div class="weekday">\${d}</div>\`; });
        
        for (let i = 0; i < firstDay; i++) html += \`<div class="day-cell empty"></div>\`;
        
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = \`\${currentYear}-\${String(currentMonth + 1).padStart(2, '0')}-\${String(i).padStart(2, '0')}\`;
            const isToday = dateStr === todayStr;
            const dayData = db.progress[dateStr] || {};
            
            const completedColors = [];
            db.items.forEach(g => {
                if (isItemActive(g, dateStr) && dayData[g.id] !== undefined) completedColors.push(g.color);
            });

            let bgStyle = 'transparent';
            let dataClass = '';
            
            if (completedColors.length === 1) {
                bgStyle = completedColors[0];
                dataClass = 'has-data';
            } else if (completedColors.length > 1) {
                const step = 100 / completedColors.length;
                const stops = completedColors.map((col, idx) => \`\${col} \${idx * step}% \${(idx + 1) * step}%\`);
                bgStyle = \`conic-gradient(\${stops.join(', ')})\`;
                dataClass = 'has-data';
            }

            html += \`
                <div class="day-cell" data-date="\${dateStr}">
                    <div class="day-circle \${isToday ? 'today' : ''} \${dataClass}" style="background: \${bgStyle}">
                        \${i}
                    </div>
                </div>\`;
        }
        
        grid.innerHTML = html;
        document.getElementById('speech-bubble').classList.remove('show');
    }

    function isItemActive(item, dateStr) {
        const start = new Date(item.startDate + "T00:00:00");
        const target = new Date(dateStr + "T00:00:00");
        const diffDays = Math.floor((target - start) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays < item.endCount;
    }

    // Centered Speech Bubble
    function showBubble(cellEl, dateStr) {
        const bubble = document.getElementById('speech-bubble');
        const content = document.getElementById('speech-content');
        const tail = document.getElementById('speech-tail');
        
        const activeItems = db.items.filter(g => isItemActive(g, dateStr));
        const dayData = db.progress[dateStr] || {};
        
        const dObj = new Date(dateStr + "T00:00:00");
        let html = \`<div class="speech-date">\${dObj.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}</div>\`;
        
        if(activeItems.length === 0) {
            html += \`<div style="font-size:0.75rem; color:var(--text-muted); text-align:center;">No growth active.</div>\`;
        } else {
            activeItems.forEach(g => {
                const isDone = dayData[g.id] !== undefined;
                html += \`
                    <div class="speech-item" style="color:\${g.color}">
                        <span>\${g.title}</span>
                        <i class="fas \${isDone ? 'fa-check-circle' : 'fa-circle'}"></i>
                    </div>\`;
            });
        }

        content.innerHTML = html;
        bubble.style.display = 'block';

        const bRect = bubble.getBoundingClientRect();
        const cellRect = cellEl.getBoundingClientRect();
        
        let bubbleX = (window.innerWidth / 2) - (bRect.width / 2);
        let bubbleY = cellRect.top - bRect.height - 6.5; 
        let placeBelow = false;

        if (bubbleY < 10) { 
            bubbleY = cellRect.bottom + 6.5; 
            placeBelow = true; 
        }

        bubble.style.left = bubbleX + 'px';
        bubble.style.top = bubbleY + 'px';
        
        let tailX = (cellRect.left + cellRect.width / 2) - bubbleX;
        tailX = Math.max(15, Math.min(bRect.width - 15, tailX)); 
        
        tail.style.left = tailX + 'px';
        
        if (placeBelow) {
            tail.style.top = '-6.5px'; tail.style.bottom = 'auto';
            tail.style.transform = 'translateX(-50%) rotate(225deg)'; 
        } else {
            tail.style.bottom = '-6.5px'; tail.style.top = 'auto';
            tail.style.transform = 'translateX(-50%) rotate(45deg)'; 
        }
        
        setTimeout(() => bubble.classList.add('show'), 10);
    }

    function initColorPalette() {
        const container = document.getElementById('color-palette');
        const input = document.getElementById('g-color');
        const usedColors = db.items.map(g => g.color);
        let html = ''; let firstAvail = null;
        
        paletteColors.forEach((hex) => {
            const isUsed = usedColors.includes(hex);
            if(!isUsed && !firstAvail) firstAvail = hex;
            html += \`<div class="color-swatch \${isUsed ? 'hidden' : ''}" style="background-color: \${hex};" data-color="\${hex}"></div>\`;
        });
        
        container.innerHTML = html;
        if(firstAvail) {
            input.value = firstAvail;
            container.querySelector(\`[data-color="\${firstAvail}"]\`).classList.add('selected');
            document.getElementById('color-error').style.display = 'none';
            document.getElementById('create-btn').disabled = false;
        } else {
            document.getElementById('color-error').style.display = 'block';
            document.getElementById('create-btn').disabled = true;
        }
        
        container.onclick = (e) => handlePaletteClick(e, container, input, false);
    }

    function initEditColorPalette(currentColor) {
        const container = document.getElementById('edit-color-palette');
        const input = document.getElementById('edit-g-color');
        let html = ''; 
        
        paletteColors.forEach((hex) => {
            const isSelected = hex === currentColor ? 'selected' : '';
            html += \`<div class="color-swatch \${isSelected}" style="background-color: \${hex};" data-color="\${hex}"></div>\`;
        });
        
        container.innerHTML = html;
        input.value = currentColor;
        container.onclick = (e) => handlePaletteClick(e, container, input, true);
    }

    function handlePaletteClick(e, container, inputElement, isEditMode) {
        if(e.target.classList.contains('color-swatch') && (isEditMode || !e.target.classList.contains('hidden'))) {
            container.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('selected'));
            e.target.classList.add('selected');
            inputElement.value = e.target.dataset.color;
        }
    }

    function openAddModal() {
        document.getElementById('g-start-date').value = todayStr;
        document.getElementById('g-type').value = 'boolean';
        toggleStartGoalData('add');
        initColorPalette(); 
        openModalObj('add-modal');
    }

    function toggleDataFields(mode) {
        const prefix = mode === 'add' ? 'g' : 'edit-g';
        const hasData = document.getElementById(\`\${prefix}-has-data\`).checked;
        document.getElementById(mode === 'add' ? 'data-fields' : 'edit-data-fields').style.display = hasData ? 'block' : 'none';
        document.getElementById(\`\${prefix}-question\`).required = hasData;
        toggleStartGoalData(mode);
    }

    function toggleStartGoalData(mode) {
        const prefix = mode === 'add' ? 'g' : 'edit-g';
        const type = document.getElementById(\`\${prefix}-type\`).value;
        const wrapper = document.getElementById(mode === 'add' ? 'start-goal-wrapper' : 'edit-start-goal-wrapper');
        if (type === 'boolean') {
            wrapper.style.display = 'none';
        } else {
            wrapper.style.display = 'grid';
        }
    }

    document.getElementById('add-grow-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData();
        formData.append('title', document.getElementById('g-title').value.trim());
        formData.append('description', document.getElementById('g-desc').value.trim());
        formData.append('startDate', document.getElementById('g-start-date').value);
        formData.append('endCount', document.getElementById('g-end-count').value);
        formData.append('color', document.getElementById('g-color').value);
        formData.append('hasData', document.getElementById('g-has-data').checked ? 'true' : 'false');
        formData.append('type', document.getElementById('g-type').value);
        formData.append('question', document.getElementById('g-question').value.trim());
        formData.append('start', document.getElementById('g-start-data').value);
        formData.append('end', document.getElementById('g-goal-data').value);

        const res = await fetch(API_URL + 'grow', { 
            method: 'POST', 
            body: new URLSearchParams(formData) 
        });
        
        if (res.ok) {
            closeModal('add-modal');
            document.getElementById('add-grow-form').reset();
            document.getElementById('data-fields').style.display = 'none';
            await fetchData();
        }
    });

    // Logging Progress Logic
    function openLogModal(dateStr) {
        const activeItems = db.items.filter(g => isItemActive(g, dateStr));
        const dateObj = new Date(dateStr + "T00:00:00");
        document.getElementById('log-modal-title').innerText = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const listContainer = document.getElementById('daily-grow-list');
        
        let html = '';
        const dayData = db.progress[dateStr] || {};

        activeItems.forEach(item => {
            const isDone = dayData[item.id] !== undefined;
            html += \`
                <div class="grow-card">
                    <details class="grow-details" style="display: contents;">
                        <summary class="grow-summary">
                            <div class="grow-title-section">
                                <i class="fas fa-chevron-right chevron-icon"></i>
                                <div class="color-dot" style="background:\${item.color};"></div>
                                <span class="grow-title">\${item.title}</span>
                            </div>
                            <div class="grow-actions">
                                <button class="action-btn" onclick="event.preventDefault(); event.stopPropagation(); handleLogAction(event, '\${item.id}', '\${dateStr}')" style="background: \${isDone ? 'var(--hover-color)' : item.color}; color: \${isDone ? 'var(--text-secondary)' : 'white'};" \${isDone ? 'disabled' : ''}>
                                    <i class="fas fa-check"></i>
                                </button>
                            </div>
                        </summary>
                        \${item.description ? \`
                        <div class="grow-description-container">
                            <div class="grow-description" style="border-left-color: \${item.color};">\${item.description}</div>
                        </div>\` : ''}
                    </details>
                </div>\`;
        });
        listContainer.innerHTML = html;
        showLogList();
        openModalObj('log-modal');
    }

    window.handleLogAction = (e, itemId, dateStr) => {
        const btn = e.currentTarget;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.style.background = 'var(--hover-color)';
        btn.style.color = 'var(--text-muted)';
        btn.disabled = true;

        const item = db.items.find(g => g.id === itemId);
        if (item.hasData && item.type !== 'boolean') openLogQuestion(item, dateStr);
        else saveDirectComplete(item, dateStr);
    };

    function openLogQuestion(item, dateStr) {
        loggingContext = { item, dateStr };
        document.getElementById('l-title').innerText = item.title;
        
        const descElement = document.getElementById('l-desc-container');
        if(item.description) {
            descElement.innerHTML = \`<div class="grow-description" style="border-left-color: \${item.color}; margin-bottom: 15px;">\${item.description}</div>\`;
        } else {
            descElement.innerHTML = '';
        }
        
        document.getElementById('l-question').innerText = item.question;

        const wrapper = document.getElementById('l-input-wrapper');
        if (item.type === 'float') wrapper.innerHTML = \`<input type="number" step="0.01" class="form-control" id="log-input" placeholder="0.00">\`;
        else wrapper.innerHTML = \`<input type="number" step="1" class="form-control" id="log-input" placeholder="0">\`;

        document.getElementById('log-list-view').style.display = 'none';
        document.getElementById('log-question-view').style.display = 'block';
    }

    async function saveDirectComplete(item, dateStr) {
        const formData = new FormData();
        formData.append('itemId', item.id);
        formData.append('dateStr', dateStr);
        formData.append('value', 'true');

        const res = await fetch(API_URL + 'grow/log', { 
            method: 'POST', 
            body: new URLSearchParams(formData) 
        });
        
        if (res.ok) {
            await fetchData();
            
            const activeItems = db.items.filter(g => isItemActive(g, dateStr));
            const dayData = db.progress[dateStr] || {};
            const isAllCompleted = activeItems.length > 0 && activeItems.every(g => dayData[g.id] !== undefined);
            
            if (isAllCompleted) {
                closeModal('log-modal');
                showBubble(document.querySelector(\`.day-cell[data-date="\${dateStr}"]\`), dateStr);
            } else openLogModal(dateStr);
        }
    }

    document.getElementById('save-log-btn').addEventListener('click', async () => {
        const inputEl = document.getElementById('log-input');
        let val = inputEl.value.trim();
        if (val === '') return alert('Enter a value.');

        const { item, dateStr } = loggingContext;
        if (item.type === 'float') val = parseFloat(parseFloat(val).toFixed(2)); 
        else val = parseInt(val, 10);

        const formData = new FormData();
        formData.append('itemId', item.id);
        formData.append('dateStr', dateStr);
        formData.append('value', val);

        const res = await fetch(API_URL + 'grow/log', { 
            method: 'POST', 
            body: new URLSearchParams(formData) 
        });
        
        if (res.ok) {
            await fetchData();
            
            const activeItems = db.items.filter(g => isItemActive(g, dateStr));
            const dayData = db.progress[dateStr] || {};
            const isAllCompleted = activeItems.length > 0 && activeItems.every(g => dayData[g.id] !== undefined);
            
            if (isAllCompleted) {
                closeModal('log-modal');
                showBubble(document.querySelector(\`.day-cell[data-date="\${dateStr}"]\`), dateStr);
            } else openLogModal(dateStr);
        }
    });

    function openModalObj(id) {
        const modal = document.getElementById(id);
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
    }
    
    function closeModal(id) { 
        const modal = document.getElementById(id);
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }

    function showLogList() { 
        document.getElementById('log-list-view').style.display = 'block'; 
        document.getElementById('log-question-view').style.display = 'none'; 
    }
    
    window.addEventListener('click', (e) => { 
        if (e.target.classList.contains('modal')) closeModal(e.target.id); 
    });
</script>
</body>
</html>`;
    fs.writeFileSync(path.join(viewsDir, 'index.ejs'), growEJS);
}
writeGrowEJS();

// ==========================================
// 📱 API ROUTES FOR GROW TRACKER
// ==========================================

app.get('/', async (req, res) => {
    try {
        const data = await db.collection('grow').findOne({ type: 'tracker' }) || { items: [], progress: {} };
        const currentIST = getCurrentISTDisplay();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const now = new Date();
        res.render('index', { 
            currentDate: currentIST.displayDate,
            currentTime: currentIST.displayTime,
            currentMonth: monthNames[now.getMonth()] + ' ' + now.getFullYear()
        });
    } catch (error) {
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
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/grow', async (req, res) => {
    try {
        const { title, description, startDate, endCount, color, hasData, type, question, start, end } = req.body;
        
        const newItem = {
            id: 'g' + Date.now(),
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
                if (start) newItem.start = type === 'float' ? parseFloat(start) : parseInt(start);
                if (end) newItem.end = type === 'float' ? parseFloat(end) : parseInt(end);
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
        } catch (e) {}

        res.json({ success: true });
    } catch (error) {
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
                if (start) updatedItem.start = type === 'float' ? parseFloat(start) : parseInt(start);
                if (end) updatedItem.end = type === 'float' ? parseFloat(end) : parseInt(end);
            }
        }

        await db.collection('grow').updateOne(
            { type: 'tracker', 'items.id': id },
            { $set: { 'items.$': updatedItem } }
        );

        // Send notification to bot
        try {
            await bot.telegram.sendMessage(CHAT_ID, `✏️ <b>Growth Updated:</b> ${title}`, { parse_mode: 'HTML' });
        } catch (e) {}

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/grow/:id/delete', async (req, res) => {
    try {
        const item = await db.collection('grow').findOne(
            { type: 'tracker', 'items.id': req.params.id },
            { projection: { 'items.$': 1 } }
        );
        const title = item?.items[0]?.title || 'Unknown';

        await db.collection('grow').updateOne(
            { type: 'tracker' },
            { $pull: { items: { id: req.params.id } } }
        );

        // Also remove from progress
        const tracker = await db.collection('grow').findOne({ type: 'tracker' });
        if (tracker && tracker.progress) {
            const progress = tracker.progress;
            Object.keys(progress).forEach(date => {
                if (progress[date][req.params.id] !== undefined) {
                    delete progress[date][req.params.id];
                }
            });
            await db.collection('grow').updateOne(
                { type: 'tracker' },
                { $set: { progress: progress } }
            );
        }

        // Send notification to bot
        try {
            await bot.telegram.sendMessage(CHAT_ID, `🗑️ <b>Growth Deleted:</b> ${title}`, { parse_mode: 'HTML' });
        } catch (e) {}

        res.json({ success: true });
    } catch (error) {
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

        const updatePath = `progress.${dateStr}.${itemId}`;
        
        await db.collection('grow').updateOne(
            { type: 'tracker' },
            { $set: { [updatePath]: parsedValue } },
            { upsert: true }
        );

        // Send notification to bot
        try {
            await bot.telegram.sendMessage(CHAT_ID, `✅ <b>Growth Completed:</b> ${title} for ${dateStr}`, { parse_mode: 'HTML' });
        } catch (e) {}

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 🚀 BOOTSTRAP
// ==========================================
async function start() {
    try {
        if (await connectDB()) {
            
            // Initialize database with default structure if needed
            const exists = await db.collection('grow').findOne({ type: 'tracker' });
            if (!exists) {
                await db.collection('grow').insertOne({ 
                    type: 'tracker', 
                    items: [], 
                    progress: {} 
                });
            }
            
            app.listen(PORT, '0.0.0.0', () => {
                console.log('🌱 Grow Tracker web interface running on port ' + PORT);
                console.log('🌍 Public Web URL: ' + WEB_APP_URL);
                console.log('🕐 IST Time: ' + getCurrentISTDisplay().dateTime);
            });
            
            await bot.launch();
            console.log('🤖 Bot Started Successfully - Notifications Only Mode!');
        } else {
            setTimeout(start, 5000);
        }
    } catch (error) {
        console.error('Startup error:', error);
        setTimeout(start, 10000);
    }
}

// Graceful shutdown
process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });

start();
