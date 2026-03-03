const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');
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

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const viewsDir = path.join(__dirname, 'views');
if (!fs.existsSync(viewsDir)) fs.mkdirSync(viewsDir, { recursive: true });

// ==========================================
// 🗄️ DATABASE CONNECTION
// ==========================================
let db;
let client;

async function connectDB() {
    try {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db('telegram_bot');
        console.log('✅ Connected to MongoDB');
        
        const exists = await db.collection('grow').findOne({ type: 'tracker' });
        if (!exists) {
            await db.collection('grow').insertOne({ type: 'tracker', items: [], progress: {} });
        }
        return true;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        return false;
    }
}

// ==========================================
// 🛠️ UTILITY
// ==========================================
function generateId() { return 'g' + Date.now() + Math.random().toString(36).substring(2, 6); }

const paletteColors = ['#ec4899', '#a855f7', '#38bdf8', '#ef4444', '#f97316', '#16a34a', '#84cc16', '#3b82f6'];

// ==========================================
// 🤖 BOT SETUP
// ==========================================
const bot = new Telegraf(BOT_TOKEN);

bot.command('start', async (ctx) => {
    const keyboard = Markup.inlineKeyboard([[Markup.button.webApp('🌱 Open Grow Tracker', WEB_APP_URL)]]);
    await ctx.reply('🌱 <b>Grow Tracker</b>\n\nTrack your daily progress using the Web App below.', { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
});

// ==========================================
// 📱 EJS TEMPLATE
// ==========================================
const growEJS = '<!DOCTYPE html>' +
'<html lang="en">' +
'<head>' +
'    <meta charset="UTF-8">' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">' +
'    <title>🌱 Grow Tracker</title>' +
'    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">' +
'    <style>' +
'        :root {' +
'            --bg-color: #f5f7fa;' +
'            --surface-color: #ffffff;' +
'            --text-primary: #1e293b;' +
'            --text-secondary: #475569;' +
'            --border-color: #e2e8f0;' +
'            --accent-color: #059669;' +
'            --danger-color: #dc2626;' +
'            --hover-color: #f1f5f9;' +
'            --shadow-soft: 0 4px 20px -5px rgba(0,0,0,0.08);' +
'            --modal-backdrop: rgba(15, 23, 42, 0.5);' +
'            --ring-today: #059669;' +
'        }' +
'        @media (prefers-color-scheme: dark) {' +
'            :root {' +
'                --bg-color: #0f172a;' +
'                --surface-color: #1e293b;' +
'                --text-primary: #f8fafc;' +
'                --text-secondary: #cbd5e1;' +
'                --border-color: #334155;' +
'                --accent-color: #34d399;' +
'                --danger-color: #f87171;' +
'                --hover-color: #2d3b4f;' +
'                --shadow-soft: 0 4px 20px -5px rgba(0,0,0,0.5);' +
'                --modal-backdrop: rgba(0, 0, 0, 0.8);' +
'                --ring-today: #34d399;' +
'            }' +
'        }' +
'        * { margin: 0; padding: 0; box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }' +
'        body { background: var(--bg-color); color: var(--text-primary); padding: 15px 10px 100px; min-height: 100vh; font-size: 11px; }' +
'        .app-header { max-width: 600px; margin: 0 auto 15px; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 16px; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; }' +
'        .app-header h1 { font-size: 1.1rem; font-weight: 700; color: var(--accent-color); display: flex; align-items: center; gap: 6px; }' +
'        .time-badge { display: flex; align-items: center; gap: 8px; padding: 4px 10px; background: var(--hover-color); border-radius: 100px; font-size: 0.7rem; color: var(--text-secondary); }' +
'        .panel-wrapper { max-width: 600px; margin: 0 auto 15px; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 16px; box-shadow: var(--shadow-soft); overflow: hidden; }' +
'        .panel-summary { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; font-size: 0.95rem; font-weight: 700; cursor: pointer; list-style: none; background: var(--surface-color); }' +
'        .panel-summary i.chevron { transition: transform 0.3s; }' +
'        details[open] .panel-summary i.chevron { transform: rotate(180deg); }' +
'        .panel-body { padding: 16px; }' +
'        .graphs-grid-container { width: 100%; aspect-ratio: 1; display: flex; flex-direction: column; }' +
'        .chart-wrapper { display: flex; justify-content: space-around; align-items: flex-end; flex: 1; padding-top: 10px; }' +
'        .bar-col { display: flex; flex-direction: column; align-items: center; width: 10%; max-width: 35px; height: 100%; }' +
'        .bar-track { width: 100%; height: 90%; border-radius: 6px; position: relative; display: flex; align-items: flex-end; }' +
'        .bar-fill { width: 100%; border-radius: 6px; transition: height 0.3s; }' +
'        .bar-label-inner { position: absolute; top: 0; bottom: 0; left: 0; right: 0; writing-mode: vertical-rl; transform: rotate(180deg); display: flex; align-items: center; justify-content: flex-end; padding-top: 6px; color: #fff; font-size: 0.65rem; font-weight: 700; text-shadow: 0 1px 3px rgba(0,0,0,0.8); pointer-events: none; }' +
'        .bar-percent { font-size: 0.6rem; font-weight: 800; margin-bottom: 4px; }' +
'        .month-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }' +
'        .month-nav h1 { font-size: 0.85rem; font-weight: 700; background: var(--hover-color); padding: 4px 12px; border-radius: 50px; border: 1px solid var(--border-color); }' +
'        .nav-btn { background: var(--bg-color); border: 1px solid var(--border-color); width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 0.7rem; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; }' +
'        .grid-container { width: 100%; aspect-ratio: 1; display: flex; flex-direction: column; }' +
'        .calendar-grid { flex: 1; display: grid; grid-template-columns: repeat(7, 1fr); grid-template-rows: auto repeat(6, 1fr); gap: 4px; }' +
'        .weekday { display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.55rem; color: var(--text-secondary); text-transform: uppercase; }' +
'        .day-cell { display: flex; align-items: center; justify-content: center; border-radius: 10px; }' +
'        .day-cell.empty { pointer-events: none; }' +
'        .day-cell:hover:not(.empty) { background: var(--hover-color); cursor: pointer; }' +
'        .day-circle { width: 100%; max-width: 36px; aspect-ratio: 1; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 0.8rem; transition: transform 0.2s; }' +
'        .day-cell:hover .day-circle { transform: scale(1.1); }' +
'        .day-circle.has-data { color: #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.1); text-shadow: 0 1px 3px rgba(0,0,0,0.7); }' +
'        .day-circle.today { box-shadow: 0 0 0 2px var(--surface-color), 0 0 0 4px var(--ring-today); }' +
'        .speech-bubble { position: absolute; background: var(--surface-color); backdrop-filter: blur(10px); border: 1px solid var(--border-color); border-radius: 12px; padding: 10px; z-index: 100; min-width: 150px; max-width: 200px; pointer-events: none; box-shadow: 0 15px 30px rgba(0,0,0,0.2); display: none; opacity: 0; font-size: 0.75rem; }' +
'        .speech-bubble.show { opacity: 1; }' +
'        .speech-tail { position: absolute; width: 10px; height: 10px; background: var(--surface-color); border: 1px solid var(--border-color); transform: rotate(45deg); z-index: -1; }' +
'        .speech-date { font-size: 0.65rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }' +
'        .speech-item { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; font-size: 0.7rem; font-weight: 600; }' +
'        .grow-card { background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 14px; padding: 12px; margin-bottom: 8px; }' +
'        .grow-summary { display: flex; justify-content: space-between; align-items: flex-start; cursor: pointer; list-style: none; }' +
'        .grow-title-section { display: flex; align-items: center; gap: 6px; flex: 1; }' +
'        .grow-title-section .chevron-icon { font-size: 0.65rem; color: var(--text-secondary); transition: transform 0.2s; }' +
'        details[open] .chevron-icon { transform: rotate(90deg); }' +
'        .grow-title { font-weight: 700; font-size: 0.9rem; }' +
'        .grow-actions { display: flex; gap: 4px; flex-shrink: 0; }' +
'        .action-btn { width: 26px; height: 26px; border-radius: 8px; border: none; background: var(--hover-color); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.7rem; }' +
'        .action-btn:hover { background: var(--accent-color); color: white; }' +
'        .action-btn.delete:hover { background: var(--danger-color); }' +
'        .grow-description-container { width: 100%; margin-top: 8px; }' +
'        .grow-description { font-size: 0.75rem; color: var(--text-secondary); padding: 6px 10px; background: var(--hover-color); border-radius: 8px; border-left: 3px solid; word-break: break-word; }' +
'        .grow-meta-row { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }' +
'        .badge { display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; background: var(--hover-color); border-radius: 100px; font-size: 0.65rem; font-weight: 600; color: var(--text-secondary); }' +
'        .color-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--border-color); }' +
'        .fab { position: fixed; bottom: 20px; right: 20px; width: 48px; height: 48px; border-radius: 50%; background: var(--accent-color); color: white; border: none; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; cursor: pointer; box-shadow: 0 8px 20px rgba(5,150,105,0.4); z-index: 1000; }' +
'        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-backdrop); backdrop-filter: blur(4px); align-items: center; justify-content: center; z-index: 2000; padding: 15px; opacity: 0; }' +
'        .modal.show { opacity: 1; }' +
'        .modal-content { background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 20px; padding: 16px; width: 100%; max-width: 380px; max-height: 85vh; overflow-y: auto; transform: scale(0.95); transition: 0.3s; }' +
'        .modal.show .modal-content { transform: scale(1); }' +
'        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; }' +
'        .modal-header h2 { font-size: 1rem; font-weight: 700; }' +
'        .close-btn { background: var(--hover-color); border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: var(--text-secondary); }' +
'        .form-group { margin-bottom: 12px; }' +
'        .form-group label { display: block; font-weight: 600; margin-bottom: 4px; font-size: 0.7rem; }' +
'        .form-control { width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 0.75rem; outline: none; background: var(--bg-color); color: var(--text-primary); }' +
'        .color-palette { display: flex; justify-content: space-between; margin-top: 6px; }' +
'        .color-swatch { width: 24px; height: 24px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; }' +
'        .color-swatch.selected { transform: scale(1.1); box-shadow: 0 0 0 2px var(--surface-color), 0 0 0 4px var(--text-primary); }' +
'        .color-swatch.hidden { display: none; }' +
'        .checkbox-group { display: flex; align-items: center; gap: 6px; margin: 10px 0; font-size: 0.7rem; }' +
'        .hidden-fields { display: none; background: var(--hover-color); padding: 12px; border-radius: 10px; margin-bottom: 10px; }' +
'        .btn-submit { width: 100%; padding: 12px; background: var(--accent-color); color: white; border: none; border-radius: 10px; font-weight: 700; font-size: 0.8rem; cursor: pointer; margin-top: 8px; }' +
'        .empty-state { text-align: center; color: var(--text-secondary); padding: 30px; font-size: 0.8rem; background: var(--hover-color); border-radius: 16px; }' +
'        #log-question-view { display: none; }' +
'    </style>' +
'</head>' +
'<body>' +
'    <div class="app-header">' +
'        <h1><i class="fas fa-seedling"></i> Grow Tracker</h1>' +
'        <div class="time-badge">' +
'            <i class="fas fa-calendar-alt"></i> <span id="currentDateDisplay"><%= currentDate %></span>' +
'            <span><i class="fas fa-clock"></i> <span id="currentTimeDisplay"><%= currentTime %></span></span>' +
'        </div>' +
'    </div>' +
'    <details class="panel-wrapper">' +
'        <summary class="panel-summary"><span>Overview</span><i class="fas fa-chevron-down chevron"></i></summary>' +
'        <div class="panel-body" id="graphs-container"></div>' +
'    </details>' +
'    <details class="panel-wrapper" open>' +
'        <summary class="panel-summary"><span>Calendar</span><i class="fas fa-chevron-down chevron"></i></summary>' +
'        <div class="panel-body">' +
'            <div class="month-nav">' +
'                <button class="nav-btn" onclick="changeMonth(-1)"><i class="fas fa-chevron-left"></i></button>' +
'                <h1 id="month-year-display"><%= currentMonth %></h1>' +
'                <button class="nav-btn" onclick="changeMonth(1)"><i class="fas fa-chevron-right"></i></button>' +
'            </div>' +
'            <div class="grid-container"><div class="calendar-grid" id="calendar-grid"></div></div>' +
'        </div>' +
'    </details>' +
'    <details class="panel-wrapper" open>' +
'        <summary class="panel-summary"><span>Manage Growth</span><i class="fas fa-chevron-down chevron"></i></summary>' +
'        <div class="panel-body" id="grow-manage-list"></div>' +
'    </details>' +
'    <div class="speech-bubble" id="speech-bubble"><div id="speech-content"></div><div class="speech-tail" id="speech-tail"></div></div>' +
'    <button class="fab" onclick="openAddModal()"><i class="fas fa-plus"></i></button>' +
'    <div class="modal" id="add-modal">' +
'        <div class="modal-content">' +
'            <div class="modal-header"><h2>Add Growth</h2><button class="close-btn" onclick="closeModal(\'add-modal\')"><i class="fas fa-times"></i></button></div>' +
'            <form id="add-grow-form">' +
'                <div class="form-group"><label>Title</label><input type="text" class="form-control" id="g-title" required></div>' +
'                <div class="form-group"><label>Description</label><textarea class="form-control" id="g-desc" rows="2"></textarea></div>' +
'                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">' +
'                    <div class="form-group"><label>Start Date</label><input type="date" class="form-control" id="g-start-date" required></div>' +
'                    <div class="form-group"><label>Duration (Days)</label><input type="number" class="form-control" id="g-end-count" value="365" required></div>' +
'                </div>' +
'                <div class="form-group"><label>Color</label><div class="color-palette" id="color-palette"></div><input type="hidden" id="g-color" required></div>' +
'                <label class="checkbox-group"><input type="checkbox" id="g-has-data" onchange="toggleDataFields(\'add\')">Require data logging?</label>' +
'                <div class="hidden-fields" id="data-fields">' +
'                    <div class="form-group"><label>Question</label><input type="text" class="form-control" id="g-question"></div>' +
'                    <div class="form-group"><label>Type</label><select class="form-control" id="g-type" onchange="toggleStartGoalData(\'add\')"><option value="boolean">Yes/No</option><option value="float">Number (Decimal)</option><option value="integer">Number (Whole)</option></select></div>' +
'                    <div id="start-goal-wrapper" style="display: none; grid-template-columns: 1fr 1fr; gap: 10px;">' +
'                        <div class="form-group"><label>Start</label><input type="number" step="0.01" class="form-control" id="g-start-data"></div>' +
'                        <div class="form-group"><label>Goal</label><input type="number" step="0.01" class="form-control" id="g-goal-data"></div>' +
'                    </div>' +
'                </div>' +
'                <button type="submit" class="btn-submit" id="create-btn">Create</button>' +
'            </form>' +
'        </div>' +
'    </div>' +
'    <div class="modal" id="edit-modal">' +
'        <div class="modal-content">' +
'            <div class="modal-header"><h2>Edit Growth</h2><button class="close-btn" onclick="closeModal(\'edit-modal\')"><i class="fas fa-times"></i></button></div>' +
'            <form id="edit-grow-form">' +
'                <input type="hidden" id="edit-g-id">' +
'                <div class="form-group"><label>Title</label><input type="text" class="form-control" id="edit-g-title" required></div>' +
'                <div class="form-group"><label>Description</label><textarea class="form-control" id="edit-g-desc" rows="2"></textarea></div>' +
'                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">' +
'                    <div class="form-group"><label>Start Date</label><input type="date" class="form-control" id="edit-g-start-date" required></div>' +
'                    <div class="form-group"><label>Duration</label><input type="number" class="form-control" id="edit-g-end-count" required></div>' +
'                </div>' +
'                <div class="form-group"><label>Color</label><div class="color-palette" id="edit-color-palette"></div><input type="hidden" id="edit-g-color" required></div>' +
'                <label class="checkbox-group"><input type="checkbox" id="edit-g-has-data" onchange="toggleDataFields(\'edit\')">Require data logging?</label>' +
'                <div class="hidden-fields" id="edit-data-fields">' +
'                    <div class="form-group"><label>Question</label><input type="text" class="form-control" id="edit-g-question"></div>' +
'                    <div class="form-group"><label>Type</label><select class="form-control" id="edit-g-type" onchange="toggleStartGoalData(\'edit\')"><option value="boolean">Yes/No</option><option value="float">Number (Decimal)</option><option value="integer">Number (Whole)</option></select></div>' +
'                    <div id="edit-start-goal-wrapper" style="display: none; grid-template-columns: 1fr 1fr; gap: 10px;">' +
'                        <div class="form-group"><label>Start</label><input type="number" step="0.01" class="form-control" id="edit-g-start-data"></div>' +
'                        <div class="form-group"><label>Goal</label><input type="number" step="0.01" class="form-control" id="edit-g-goal-data"></div>' +
'                    </div>' +
'                </div>' +
'                <button type="submit" class="btn-submit">Update</button>' +
'            </form>' +
'        </div>' +
'    </div>' +
'    <div class="modal" id="log-modal">' +
'        <div class="modal-content">' +
'            <div id="log-list-view">' +
'                <div class="modal-header"><h2 id="log-modal-title">Log</h2><button class="close-btn" onclick="closeModal(\'log-modal\')"><i class="fas fa-times"></i></button></div>' +
'                <div id="daily-grow-list"></div>' +
'            </div>' +
'            <div id="log-question-view">' +
'                <div class="modal-header"><h2 id="l-title"></h2><button class="close-btn" onclick="showLogList()"><i class="fas fa-arrow-left"></i></button></div>' +
'                <div id="l-desc-container"></div>' +
'                <div class="form-group"><label id="l-question"></label><div id="l-input-wrapper"></div></div>' +
'                <button class="btn-submit" id="save-log-btn">Save</button>' +
'            </div>' +
'        </div>' +
'    </div>' +
'    <script>' +
'        const API_URL = "/api/";' +
'        let db = { items: [], progress: {} };' +
'        let todayStr = "";' +
'        let currentMonth = 0, currentYear = 2026;' +
'        let loggingContext = null;' +
'        const paletteColors = ["#ec4899", "#a855f7", "#38bdf8", "#ef4444", "#f97316", "#16a34a", "#84cc16", "#3b82f6"];' +
'        function getISTDate() {' +
'            const d = new Date();' +
'            const ist = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));' +
'            return {' +
'                date: ist.getUTCFullYear() + "-" + String(ist.getUTCMonth() + 1).padStart(2,"0") + "-" + String(ist.getUTCDate()).padStart(2,"0"),' +
'                month: ist.getUTCMonth(),' +
'                year: ist.getUTCFullYear(),' +
'                time: String(ist.getUTCHours()).padStart(2,"0") + ":" + String(ist.getUTCMinutes()).padStart(2,"0")' +
'            };' +
'        }' +
'        document.addEventListener("DOMContentLoaded", () => {' +
'            const ist = getISTDate();' +
'            todayStr = ist.date;' +
'            currentMonth = ist.month;' +
'            currentYear = ist.year;' +
'            fetchData();' +
'            document.getElementById("calendar-grid").addEventListener("click", (e) => {' +
'                const cell = e.target.closest(".day-cell");' +
'                if(cell && !cell.classList.contains("empty")) {' +
'                    const dateStr = cell.dataset.date;' +
'                    const active = db.items.filter(g => isActive(g, dateStr));' +
'                    const dayData = db.progress[dateStr] || {};' +
'                    const allDone = active.length > 0 && active.every(g => dayData[g.id] !== undefined);' +
'                    if(dateStr === todayStr && !allDone) openLogModal(dateStr);' +
'                    else showBubble(cell, dateStr);' +
'                }' +
'            });' +
'            document.addEventListener("click", (e) => {' +
'                if (!e.target.closest(".day-cell") && !e.target.closest(".speech-bubble")) {' +
'                    document.getElementById("speech-bubble").classList.remove("show");' +
'                }' +
'            });' +
'            setInterval(() => {' +
'                const ist = getISTDate();' +
'                document.getElementById("currentTimeDisplay").innerHTML = ist.time;' +
'                document.getElementById("currentDateDisplay").innerHTML = ist.date.split("-").reverse().join("-");' +
'            }, 1000);' +
'        });' +
'        async function fetchData() {' +
'            try {' +
'                const res = await fetch(API_URL + "grow/data");' +
'                db = await res.json();' +
'                if (!db.items) db.items = [];' +
'                if (!db.progress) db.progress = {};' +
'                renderAll();' +
'            } catch(e) { console.error("Error loading data"); }' +
'        }' +
'        function renderAll() { renderCalendar(); renderGraphs(); renderGrowList(); }' +
'        function isActive(item, dateStr) {' +
'            const start = new Date(item.startDate + "T00:00:00");' +
'            const target = new Date(dateStr + "T00:00:00");' +
'            const days = Math.floor((target - start) / (86400000));' +
'            return days >= 0 && days < item.endCount;' +
'        }' +
'        function renderGrowList() {' +
'            const container = document.getElementById("grow-manage-list");' +
'            if(db.items.length === 0) {' +
'                container.innerHTML = "<div class=\"empty-state\"><i class=\"fas fa-seedling\"></i><br>No growth yet</div>";' +
'                return;' +
'            }' +
'            let html = "";' +
'            const today = new Date(todayStr + "T00:00:00");' +
'            db.items.forEach(item => {' +
'                const start = new Date(item.startDate + "T00:00:00");' +
'                let passed = Math.floor((today - start) / 86400000);' +
'                let left = item.endCount - passed;' +
'                if(passed < 0) left = item.endCount;' +
'                if(left < 0) left = 0;' +
'                html += "<div class=\"grow-card\">";' +
'                html += "<details class=\"grow-details\">";' +
'                html += "<summary class=\"grow-summary\">";' +
'                html += "<div class=\"grow-title-section\"><i class=\"fas fa-chevron-right chevron-icon\"></i><span class=\"grow-title\">" + item.title + "</span></div>";' +
'                html += "<div class=\"grow-actions\">";' +
'                html += "<button class=\"action-btn\" onclick=\"event.preventDefault(); event.stopPropagation(); openEditModal(\\\"" + item.id + "\\\")\"><i class=\"fas fa-pencil-alt\"></i></button>";' +
'                html += "<button class=\"action-btn delete\" onclick=\"event.preventDefault(); event.stopPropagation(); deleteGrow(\\\"" + item.id + "\\\")\"><i class=\"fas fa-trash\"></i></button>";' +
'                html += "</div></summary>";' +
'                if(item.description) html += "<div class=\"grow-description-container\"><div class=\"grow-description\" style=\"border-left-color:" + item.color + "\">" + item.description + "</div></div>";' +
'                html += "</details>";' +
'                html += "<div class=\"grow-meta-row\"><span class=\"badge\"><i class=\"fas fa-calendar-alt\"></i> " + item.startDate + "</span><span class=\"badge\"><i class=\"fas fa-hourglass-half\"></i> " + left + " left</span><div class=\"color-dot\" style=\"background:" + item.color + "\"></div></div>";' +
'                html += "</div>";' +
'            });' +
'            container.innerHTML = html;' +
'        }' +
'        async function deleteGrow(id) {' +
'            if(!confirm("Delete this growth?")) return;' +
'            await fetch(API_URL + "grow/" + id + "/delete", { method: "POST" });' +
'            await fetchData();' +
'        }' +
'        function openEditModal(id) {' +
'            const item = db.items.find(g => g.id === id);' +
'            if(!item) return;' +
'            document.getElementById("edit-g-id").value = item.id;' +
'            document.getElementById("edit-g-title").value = item.title;' +
'            document.getElementById("edit-g-desc").value = item.description || "";' +
'            document.getElementById("edit-g-start-date").value = item.startDate;' +
'            document.getElementById("edit-g-end-count").value = item.endCount;' +
'            document.getElementById("edit-g-has-data").checked = item.hasData;' +
'            toggleDataFields("edit");' +
'            if(item.hasData) {' +
'                document.getElementById("edit-g-question").value = item.question || "";' +
'                document.getElementById("edit-g-type").value = item.type || "boolean";' +
'                toggleStartGoalData("edit");' +
'                if(item.type !== "boolean") {' +
'                    document.getElementById("edit-g-start-data").value = item.start !== undefined ? item.start : "";' +
'                    document.getElementById("edit-g-goal-data").value = item.end !== undefined ? item.end : "";' +
'                }' +
'            }' +
'            initEditPalette(item.color);' +
'            openModal("edit-modal");' +
'        }' +
'        document.getElementById("edit-grow-form").addEventListener("submit", async (e) => {' +
'            e.preventDefault();' +
'            const id = document.getElementById("edit-g-id").value;' +
'            const fd = new FormData();' +
'            fd.append("id", id);' +
'            fd.append("title", document.getElementById("edit-g-title").value.trim());' +
'            fd.append("description", document.getElementById("edit-g-desc").value.trim());' +
'            fd.append("startDate", document.getElementById("edit-g-start-date").value);' +
'            fd.append("endCount", document.getElementById("edit-g-end-count").value);' +
'            fd.append("color", document.getElementById("edit-g-color").value);' +
'            fd.append("hasData", document.getElementById("edit-g-has-data").checked ? "true" : "false");' +
'            fd.append("type", document.getElementById("edit-g-type").value);' +
'            fd.append("question", document.getElementById("edit-g-question").value.trim());' +
'            fd.append("start", document.getElementById("edit-g-start-data").value);' +
'            fd.append("end", document.getElementById("edit-g-goal-data").value);' +
'            await fetch(API_URL + "grow/" + id + "/update", { method: "POST", body: new URLSearchParams(fd) });' +
'            closeModal("edit-modal");' +
'            await fetchData();' +
'        });' +
'        function renderGraphs() {' +
'            const container = document.getElementById("graphs-container");' +
'            if(db.items.length === 0) { container.innerHTML = "<div class=\"empty-state\">No data</div>"; return; }' +
'            let html = "<div class=\"graphs-grid-container\"><div class=\"chart-wrapper\">";' +
'            const today = new Date(todayStr + "T00:00:00");' +
'            db.items.forEach(item => {' +
'                const start = new Date(item.startDate + "T00:00:00");' +
'                let total = Math.floor((today - start) / 86400000) + 1;' +
'                if(total < 1) total = 0;' +
'                if(total > item.endCount) total = item.endCount;' +
'                let completed = 0;' +
'                Object.keys(db.progress).forEach(d => {' +
'                    const dObj = new Date(d + "T00:00:00");' +
'                    if(dObj >= start && dObj <= today && db.progress[d] && db.progress[d][item.id] !== undefined) completed++;' +
'                });' +
'                let pct = total > 0 ? Math.min(100, (completed / total) * 100) : 0;' +
'                html += "<div class=\"bar-col\"><div class=\"bar-percent\">" + Math.round(pct) + "%</div>";' +
'                html += "<div class=\"bar-track\" style=\"background:" + item.color + "40\">";' +
'                html += "<div class=\"bar-fill\" style=\"height:" + pct + "%;background:" + item.color + "\"></div>";' +
'                html += "<div class=\"bar-label-inner\">" + item.title + "</div></div></div>";' +
'            });' +
'            html += "</div></div>";' +
'            container.innerHTML = html;' +
'        }' +
'        function changeMonth(dir) {' +
'            currentMonth += dir;' +
'            if(currentMonth > 11) { currentMonth = 0; currentYear++; }' +
'            else if(currentMonth < 0) { currentMonth = 11; currentYear--; }' +
'            renderCalendar();' +
'        }' +
'        function renderCalendar() {' +
'            const grid = document.getElementById("calendar-grid");' +
'            const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];' +
'            document.getElementById("month-year-display").innerText = months[currentMonth] + " " + currentYear;' +
'            const first = new Date(currentYear, currentMonth, 1).getDay();' +
'            const days = new Date(currentYear, currentMonth + 1, 0).getDate();' +
'            let html = "";' +
'            ["Su","Mo","Tu","We","Th","Fr","Sa"].forEach(d => html += "<div class=\"weekday\">" + d + "</div>");' +
'            for(let i=0; i<first; i++) html += "<div class=\"day-cell empty\"></div>";' +
'            for(let i=1; i<=days; i++) {' +
'                const date = currentYear + "-" + String(currentMonth+1).padStart(2,"0") + "-" + String(i).padStart(2,"0");' +
'                const isToday = date === todayStr;' +
'                const dayData = db.progress[date] || {};' +
'                const colors = [];' +
'                db.items.forEach(g => { if(isActive(g, date) && dayData[g.id] !== undefined) colors.push(g.color); });' +
'                let bg = "transparent", cls = "";' +
'                if(colors.length === 1) { bg = colors[0]; cls = "has-data"; }' +
'                else if(colors.length > 1) {' +
'                    const step = 100 / colors.length;' +
'                    const stops = colors.map((c,idx) => c + " " + (idx*step) + "% " + ((idx+1)*step) + "%").join(", ");' +
'                    bg = "conic-gradient(" + stops + ")";' +
'                    cls = "has-data";' +
'                }' +
'                html += "<div class=\"day-cell\" data-date=\"" + date + "\"><div class=\"day-circle " + (isToday?"today ":"") + cls + "\" style=\"background:" + bg + "\">" + i + "</div></div>";' +
'            }' +
'            grid.innerHTML = html;' +
'            document.getElementById("speech-bubble").classList.remove("show");' +
'        }' +
'        function showBubble(cell, date) {' +
'            const bubble = document.getElementById("speech-bubble");' +
'            const content = document.getElementById("speech-content");' +
'            const tail = document.getElementById("speech-tail");' +
'            const active = db.items.filter(g => isActive(g, date));' +
'            const dayData = db.progress[date] || {};' +
'            const d = new Date(date + "T00:00:00");' +
'            let html = "<div class=\"speech-date\">" + d.toLocaleDateString("en-US",{month:"short",day:"numeric"}) + "</div>";' +
'            if(active.length === 0) html += "<div style=\"text-align:center\">No active</div>";' +
'            else active.forEach(g => html += "<div class=\"speech-item\" style=\"color:" + g.color + "\"><span>" + g.title + "</span><i class=\"fas " + (dayData[g.id]!==undefined?"fa-check-circle":"fa-circle") + "\"></i></div>");' +
'            content.innerHTML = html;' +
'            bubble.style.display = "block";' +
'            const bRect = bubble.getBoundingClientRect();' +
'            const cRect = cell.getBoundingClientRect();' +
'            let x = (window.innerWidth/2) - (bRect.width/2);' +
'            let y = cRect.top - bRect.height - 6;' +
'            let below = false;' +
'            if(y < 10) { y = cRect.bottom + 6; below = true; }' +
'            bubble.style.left = x + "px";' +
'            bubble.style.top = y + "px";' +
'            let tailX = (cRect.left + cRect.width/2) - x;' +
'            tailX = Math.max(12, Math.min(bRect.width-12, tailX));' +
'            tail.style.left = tailX + "px";' +
'            if(below) { tail.style.top = "-5px"; tail.style.transform = "rotate(225deg)"; }' +
'            else { tail.style.bottom = "-5px"; tail.style.transform = "rotate(45deg)"; }' +
'            setTimeout(() => bubble.classList.add("show"), 10);' +
'        }' +
'        function initPalette() {' +
'            const container = document.getElementById("color-palette");' +
'            const input = document.getElementById("g-color");' +
'            const used = db.items.map(g => g.color);' +
'            let html = "", first = null;' +
'            paletteColors.forEach(c => {' +
'                const isUsed = used.includes(c);' +
'                if(!isUsed && !first) first = c;' +
'                html += "<div class=\"color-swatch " + (isUsed?"hidden":"") + "\" style=\"background:" + c + "\" data-color=\"" + c + "\"></div>";' +
'            });' +
'            container.innerHTML = html;' +
'            if(first) {' +
'                input.value = first;' +
'                container.querySelector("[data-color=\"" + first + "\"]").classList.add("selected");' +
'                document.getElementById("create-btn").disabled = false;' +
'            } else document.getElementById("create-btn").disabled = true;' +
'            container.onclick = (e) => {' +
'                if(e.target.classList.contains("color-swatch") && !e.target.classList.contains("hidden")) {' +
'                    container.querySelectorAll(".color-swatch").forEach(el => el.classList.remove("selected"));' +
'                    e.target.classList.add("selected");' +
'                    input.value = e.target.dataset.color;' +
'                }' +
'            };' +
'        }' +
'        function initEditPalette(current) {' +
'            const container = document.getElementById("edit-color-palette");' +
'            const input = document.getElementById("edit-g-color");' +
'            let html = "";' +
'            paletteColors.forEach(c => html += "<div class=\"color-swatch " + (c===current?"selected":"") + "\" style=\"background:" + c + "\" data-color=\"" + c + "\"></div>");' +
'            container.innerHTML = html;' +
'            input.value = current;' +
'            container.onclick = (e) => {' +
'                if(e.target.classList.contains("color-swatch")) {' +
'                    container.querySelectorAll(".color-swatch").forEach(el => el.classList.remove("selected"));' +
'                    e.target.classList.add("selected");' +
'                    input.value = e.target.dataset.color;' +
'                }' +
'            };' +
'        }' +
'        function openAddModal() {' +
'            document.getElementById("g-start-date").value = todayStr;' +
'            document.getElementById("g-type").value = "boolean";' +
'            toggleStartGoalData("add");' +
'            initPalette();' +
'            openModal("add-modal");' +
'        }' +
'        function toggleDataFields(mode) {' +
'            const prefix = mode === "add" ? "g" : "edit-g";' +
'            const checked = document.getElementById(prefix + "-has-data").checked;' +
'            document.getElementById(mode === "add" ? "data-fields" : "edit-data-fields").style.display = checked ? "block" : "none";' +
'            toggleStartGoalData(mode);' +
'        }' +
'        function toggleStartGoalData(mode) {' +
'            const prefix = mode === "add" ? "g" : "edit-g";' +
'            const type = document.getElementById(prefix + "-type").value;' +
'            const wrapper = document.getElementById(mode === "add" ? "start-goal-wrapper" : "edit-start-goal-wrapper");' +
'            wrapper.style.display = type === "boolean" ? "none" : "grid";' +
'        }' +
'        document.getElementById("add-grow-form").addEventListener("submit", async (e) => {' +
'            e.preventDefault();' +
'            const fd = new FormData();' +
'            fd.append("title", document.getElementById("g-title").value.trim());' +
'            fd.append("description", document.getElementById("g-desc").value.trim());' +
'            fd.append("startDate", document.getElementById("g-start-date").value);' +
'            fd.append("endCount", document.getElementById("g-end-count").value);' +
'            fd.append("color", document.getElementById("g-color").value);' +
'            fd.append("hasData", document.getElementById("g-has-data").checked ? "true" : "false");' +
'            fd.append("type", document.getElementById("g-type").value);' +
'            fd.append("question", document.getElementById("g-question").value.trim());' +
'            fd.append("start", document.getElementById("g-start-data").value);' +
'            fd.append("end", document.getElementById("g-goal-data").value);' +
'            await fetch(API_URL + "grow", { method: "POST", body: new URLSearchParams(fd) });' +
'            closeModal("add-modal");' +
'            document.getElementById("add-grow-form").reset();' +
'            document.getElementById("data-fields").style.display = "none";' +
'            await fetchData();' +
'        });' +
'        function openLogModal(date) {' +
'            const active = db.items.filter(g => isActive(g, date));' +
'            const d = new Date(date + "T00:00:00");' +
'            document.getElementById("log-modal-title").innerText = d.toLocaleDateString("en-US",{month:"long",day:"numeric"});' +
'            const container = document.getElementById("daily-grow-list");' +
'            let html = "";' +
'            const dayData = db.progress[date] || {};' +
'            active.forEach(item => {' +
'                const done = dayData[item.id] !== undefined;' +
'                html += "<div class=\"grow-card\">";' +
'                html += "<details class=\"grow-details\">";' +
'                html += "<summary class=\"grow-summary\">";' +
'                html += "<div class=\"grow-title-section\"><i class=\"fas fa-chevron-right chevron-icon\"></i><div class=\"color-dot\" style=\"background:" + item.color + "\"></div><span class=\"grow-title\">" + item.title + "</span></div>";' +
'                html += "<div class=\"grow-actions\">";' +
'                html += "<button class=\"action-btn\" onclick=\"event.preventDefault(); event.stopPropagation(); handleLog(\\\"" + item.id + "\\\", \\\"" + date + "\\\")\" style=\"background:" + (done?"var(--hover-color)":item.color) + ";color:" + (done?"var(--text-secondary)":"white") + "\"" + (done?" disabled":"") + "><i class=\"fas fa-check\"></i></button>";' +
'                html += "</div></summary>";' +
'                if(item.description) html += "<div class=\"grow-description-container\"><div class=\"grow-description\" style=\"border-left-color:" + item.color + "\">" + item.description + "</div></div>";' +
'                html += "</details></div>";' +
'            });' +
'            container.innerHTML = html;' +
'            showLogList();' +
'            openModal("log-modal");' +
'        }' +
'        window.handleLog = (id, date) => {' +
'            const item = db.items.find(g => g.id === id);' +
'            if(item.hasData && item.type !== "boolean") openLogQuestion(item, date);' +
'            else saveLog(item, date, true);' +
'        };' +
'        function openLogQuestion(item, date) {' +
'            loggingContext = { item, date };' +
'            document.getElementById("l-title").innerText = item.title;' +
'            document.getElementById("l-desc-container").innerHTML = item.description ? "<div class=\"grow-description\" style=\"border-left-color:" + item.color + ";margin-bottom:10px\">" + item.description + "</div>" : "";' +
'            document.getElementById("l-question").innerText = item.question;' +
'            const wrapper = document.getElementById("l-input-wrapper");' +
'            wrapper.innerHTML = item.type === "float" ? "<input type=\"number\" step=\"0.01\" class=\"form-control\" id=\"log-input\">" : "<input type=\"number\" step=\"1\" class=\"form-control\" id=\"log-input\">";' +
'            document.getElementById("log-list-view").style.display = "none";' +
'            document.getElementById("log-question-view").style.display = "block";' +
'        }' +
'        async function saveLog(item, date, val) {' +
'            const fd = new FormData();' +
'            fd.append("itemId", item.id);' +
'            fd.append("dateStr", date);' +
'            fd.append("value", val === true ? "true" : val);' +
'            await fetch(API_URL + "grow/log", { method: "POST", body: new URLSearchParams(fd) });' +
'            await fetchData();' +
'            const active = db.items.filter(g => isActive(g, date));' +
'            const dayData = db.progress[date] || {};' +
'            const allDone = active.length > 0 && active.every(g => dayData[g.id] !== undefined);' +
'            if(allDone) {' +
'                closeModal("log-modal");' +
'                showBubble(document.querySelector(".day-cell[data-date=\"" + date + "\"]"), date);' +
'            } else openLogModal(date);' +
'        }' +
'        document.getElementById("save-log-btn").addEventListener("click", async () => {' +
'            const input = document.getElementById("log-input");' +
'            if(!input.value) return alert("Enter value");' +
'            const { item, date } = loggingContext;' +
'            let val = item.type === "float" ? parseFloat(input.value) : parseInt(input.value);' +
'            await saveLog(item, date, val);' +
'        });' +
'        function openModal(id) { document.getElementById(id).style.display = "flex"; setTimeout(() => document.getElementById(id).classList.add("show"), 10); }' +
'        function closeModal(id) { document.getElementById(id).classList.remove("show"); setTimeout(() => document.getElementById(id).style.display = "none", 200); }' +
'        function showLogList() { document.getElementById("log-list-view").style.display = "block"; document.getElementById("log-question-view").style.display = "none"; }' +
'        window.addEventListener("click", (e) => { if(e.target.classList.contains("modal")) closeModal(e.target.id); });' +
'    </script>' +
'</body>' +
'</html>';

fs.writeFileSync(path.join(viewsDir, 'index.ejs'), growEJS);

// ==========================================
// 📱 API ROUTES
// ==========================================
app.get('/', async (req, res) => {
    const ist = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
    res.render('index', {
        currentDate: String(ist.getUTCDate()).padStart(2,'0') + '-' + String(ist.getUTCMonth()+1).padStart(2,'0') + '-' + ist.getUTCFullYear(),
        currentTime: String(ist.getUTCHours()).padStart(2,'0') + ':' + String(ist.getUTCMinutes()).padStart(2,'0'),
        currentMonth: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][ist.getUTCMonth()] + ' ' + ist.getUTCFullYear()
    });
});

app.get('/api/grow/data', async (req, res) => {
    const data = await db.collection('grow').findOne({ type: 'tracker' }) || { items: [], progress: {} };
    res.json(data);
});

app.post('/api/grow', async (req, res) => {
    const { title, description, startDate, endCount, color, hasData, type, question, start, end } = req.body;
    const item = {
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
        item.question = question || '';
        if (type !== 'boolean') {
            if (start) item.start = type === 'float' ? parseFloat(start) : parseInt(start);
            if (end) item.end = type === 'float' ? parseFloat(end) : parseInt(end);
        }
    }
    await db.collection('grow').updateOne({ type: 'tracker' }, { $push: { items: item } }, { upsert: true });
    try { await bot.telegram.sendMessage(CHAT_ID, `🌱 Added: ${title}`, { parse_mode: 'HTML' }); } catch(e) {}
    res.json({ success: true });
});

app.post('/api/grow/:id/update', async (req, res) => {
    const { id, title, description, startDate, endCount, color, hasData, type, question, start, end } = req.body;
    const item = {
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
        item.question = question || '';
        if (type !== 'boolean') {
            if (start) item.start = type === 'float' ? parseFloat(start) : parseInt(start);
            if (end) item.end = type === 'float' ? parseFloat(end) : parseInt(end);
        }
    }
    await db.collection('grow').updateOne({ type: 'tracker', 'items.id': id }, { $set: { 'items.$': item } });
    try { await bot.telegram.sendMessage(CHAT_ID, `✏️ Updated: ${title}`, { parse_mode: 'HTML' }); } catch(e) {}
    res.json({ success: true });
});

app.post('/api/grow/:id/delete', async (req, res) => {
    const tracker = await db.collection('grow').findOne({ type: 'tracker' });
    const item = tracker?.items.find(i => i.id === req.params.id);
    await db.collection('grow').updateOne({ type: 'tracker' }, { $pull: { items: { id: req.params.id } } });
    if (tracker?.progress) {
        const progress = { ...tracker.progress };
        Object.keys(progress).forEach(date => { if (progress[date] && progress[date][req.params.id] !== undefined) delete progress[date][req.params.id]; });
        await db.collection('grow').updateOne({ type: 'tracker' }, { $set: { progress: progress } });
    }
    try { await bot.telegram.sendMessage(CHAT_ID, `🗑️ Deleted: ${item?.title || 'Unknown'}`, { parse_mode: 'HTML' }); } catch(e) {}
    res.json({ success: true });
});

app.post('/api/grow/log', async (req, res) => {
    const { itemId, dateStr, value } = req.body;
    const parsed = value === 'true' ? true : value === 'false' ? false : isNaN(parseFloat(value)) ? value : parseFloat(value);
    const tracker = await db.collection('grow').findOne({ type: 'tracker' });
    const item = tracker?.items.find(i => i.id === itemId);
    await db.collection('grow').updateOne({ type: 'tracker' }, { $set: { [`progress.${dateStr}.${itemId}`]: parsed } });
    try { await bot.telegram.sendMessage(CHAT_ID, `✅ Completed: ${item?.title || 'Unknown'}`, { parse_mode: 'HTML' }); } catch(e) {}
    res.json({ success: true });
});

// ==========================================
// 🚀 START
// ==========================================
async function start() {
    if (await connectDB()) {
        app.listen(PORT, '0.0.0.0', () => console.log('🚀 Server running on port ' + PORT));
        await bot.launch();
        console.log('🤖 Bot running');
    } else setTimeout(start, 5000);
}

process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });

start();
