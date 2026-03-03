const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');
const express = require('express');
const path = require('path');
const fs = require('fs');

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
const BOT_TOKEN = '8716545255:AAHNcyDFzOdVUQz38iutCVEN3DARA5YJLBM';
const MONGODB_URI = 'mongodb+srv://sandip:9E9AISFqTfU3VI5i@cluster0.p8irtov.mongodb.net/tggrow';
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
        db = client.db('tggrow');
        console.log('✅ Connected to MongoDB - tggrow database');
        
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
    await ctx.reply('🌱 <b>Grow Tracker</b>\n\nTrack your daily growth using the Web App below.', { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
});

// ==========================================
// 📱 EJS TEMPLATE - ULTRA COMPACT WITH PROGRESS BARS
// ==========================================
const growEJS = '<!DOCTYPE html>' +
'<html lang="en">' +
'<head>' +
'    <meta charset="UTF-8">' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">' +
'    <title>🌱 Grow</title>' +
'    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">' +
'    <style>' +
'        :root {' +
'            --bg: #f5f7fa;' +
'            --surface: #fff;' +
'            --text: #1e293b;' +
'            --text2: #475569;' +
'            --border: #e2e8f0;' +
'            --accent: #059669;' +
'            --danger: #dc2626;' +
'            --hover: #f1f5f9;' +
'        }' +
'        @media (prefers-color-scheme: dark) {' +
'            :root {' +
'                --bg: #0f172a;' +
'                --surface: #1e293b;' +
'                --text: #f8fafc;' +
'                --text2: #cbd5e1;' +
'                --border: #334155;' +
'                --accent: #34d399;' +
'                --hover: #2d3b4f;' +
'            }' +
'        }' +
'        * { margin: 0; padding: 0; box-sizing: border-box; font-family: system-ui; }' +
'        body { background: var(--bg); color: var(--text); padding: 10px 8px 80px; min-height: 100vh; font-size: 10px; }' +
'        .header { max-width: 600px; margin: 0 auto 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 8px 16px; display: flex; justify-content: space-between; align-items: center; }' +
'        .header h1 { font-size: 1rem; font-weight: 700; color: var(--accent); display: flex; align-items: center; gap: 4px; }' +
'        .time { display: flex; align-items: center; gap: 6px; padding: 3px 8px; background: var(--hover); border-radius: 100px; font-size: 0.65rem; }' +
'        .panel { max-width: 600px; margin: 0 auto 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }' +
'        .panel summary { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; font-size: 0.85rem; font-weight: 600; cursor: pointer; background: var(--surface); }' +
'        .panel summary i { transition: transform 0.3s; }' +
'        .panel[open] summary i { transform: rotate(180deg); }' +
'        .panel-body { padding: 12px; }' +
'        .graph-container { width: 100%; aspect-ratio: 1; display: flex; flex-direction: column; }' +
'        .graph { display: flex; justify-content: space-around; align-items: flex-end; flex: 1; }' +
'        .bar { display: flex; flex-direction: column; align-items: center; width: 10%; max-width: 30px; height: 100%; }' +
'        .bar-track { width: 100%; height: 90%; border-radius: 4px; position: relative; display: flex; align-items: flex-end; background: #e2e8f0; }' +
'        .bar-fill { width: 100%; border-radius: 4px; transition: height 0.3s; }' +
'        .bar-label { position: absolute; top: 0; bottom: 0; left: 0; right: 0; writing-mode: vertical-rl; transform: rotate(180deg); display: flex; align-items: center; justify-content: flex-end; padding-top: 4px; color: #fff; font-size: 0.6rem; font-weight: 600; text-shadow: 0 1px 3px #000; pointer-events: none; }' +
'        .bar-pct { font-size: 0.55rem; font-weight: 700; margin-bottom: 3px; }' +
'        .month-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }' +
'        .month-nav h2 { font-size: 0.8rem; font-weight: 600; background: var(--hover); padding: 3px 10px; border-radius: 30px; border: 1px solid var(--border); }' +
'        .nav-btn { background: var(--bg); border: 1px solid var(--border); width: 24px; height: 24px; border-radius: 50%; cursor: pointer; font-size: 0.6rem; color: var(--text2); display: flex; align-items: center; justify-content: center; }' +
'        .calendar { width: 100%; aspect-ratio: 1; display: flex; flex-direction: column; }' +
'        .grid { flex: 1; display: grid; grid-template-columns: repeat(7, 1fr); grid-template-rows: auto repeat(6, 1fr); gap: 2px; }' +
'        .weekday { display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 0.5rem; color: var(--text2); }' +
'        .day { display: flex; align-items: center; justify-content: center; border-radius: 8px; }' +
'        .day.empty { pointer-events: none; }' +
'        .day:hover:not(.empty) { background: var(--hover); cursor: pointer; }' +
'        .circle { width: 100%; max-width: 32px; aspect-ratio: 1; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 0.7rem; transition: transform 0.2s; }' +
'        .day:hover .circle { transform: scale(1.1); }' +
'        .circle.has-data { color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.2); text-shadow: 0 1px 2px rgba(0,0,0,0.5); }' +
'        .circle.today { box-shadow: 0 0 0 2px var(--surface), 0 0 0 3px var(--accent); }' +
'        .bubble { position: absolute; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 8px; z-index: 100; min-width: 130px; max-width: 180px; pointer-events: none; box-shadow: 0 10px 20px rgba(0,0,0,0.2); display: none; opacity: 0; font-size: 0.65rem; }' +
'        .bubble.show { opacity: 1; }' +
'        .tail { position: absolute; width: 8px; height: 8px; background: var(--surface); border: 1px solid var(--border); transform: rotate(45deg); z-index: -1; }' +
'        .bubble-date { font-size: 0.6rem; font-weight: 600; color: var(--text2); margin-bottom: 3px; border-bottom: 1px solid var(--border); padding-bottom: 3px; }' +
'        .bubble-item { display: flex; justify-content: space-between; align-items: center; padding: 2px 0; font-size: 0.6rem; font-weight: 500; }' +
'        .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 8px; margin-bottom: 6px; }' +
'        .card summary { display: flex; justify-content: space-between; align-items: flex-start; cursor: pointer; list-style: none; }' +
'        .title-section { display: flex; align-items: center; gap: 4px; flex: 1; }' +
'        .title-section i { font-size: 0.6rem; color: var(--text2); transition: transform 0.2s; }' +
'        details[open] .title-section i { transform: rotate(90deg); }' +
'        .title { font-weight: 600; font-size: 0.8rem; }' +
'        .actions { display: flex; gap: 2px; }' +
'        .btn-icon { width: 22px; height: 22px; border-radius: 6px; border: none; background: var(--hover); color: var(--text2); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.6rem; }' +
'        .btn-icon:hover { background: var(--accent); color: white; }' +
'        .btn-icon.del:hover { background: var(--danger); }' +
'        .desc-container { width: 100%; margin-top: 6px; }' +
'        .desc { font-size: 0.7rem; color: var(--text2); padding: 4px 8px; background: var(--hover); border-radius: 6px; border-left: 2px solid; word-break: break-word; }' +
'        .meta { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }' +
'        .badge { display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; background: var(--hover); border-radius: 30px; font-size: 0.6rem; font-weight: 500; }' +
'        .dot { width: 14px; height: 14px; border-radius: 50%; border: 1px solid var(--border); }' +
'        .progress-bar-container { margin-top: 8px; width: 100%; }' +
'        .progress-bar { width: 100%; height: 4px; background: var(--hover); border-radius: 10px; overflow: hidden; margin: 4px 0; }' +
'        .progress-fill { height: 100%; background: var(--accent); border-radius: 10px; transition: width 0.3s; }' +
'        .progress-stats { display: flex; justify-content: space-between; font-size: 0.6rem; color: var(--text2); }' +
'        .fab { position: fixed; bottom: 16px; right: 16px; width: 42px; height: 42px; border-radius: 50%; background: var(--accent); color: white; border: none; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; cursor: pointer; box-shadow: 0 4px 12px rgba(5,150,105,0.4); z-index: 1000; }' +
'        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); align-items: center; justify-content: center; z-index: 2000; padding: 12px; }' +
'        .modal.show { display: flex; }' +
'        .modal-content { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 14px; width: 100%; max-width: 340px; max-height: 80vh; overflow-y: auto; }' +
'        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }' +
'        .modal-header h2 { font-size: 0.9rem; font-weight: 600; }' +
'        .close { background: var(--hover); border: none; width: 24px; height: 24px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; }' +
'        .form-group { margin-bottom: 8px; }' +
'        .form-group label { display: block; font-weight: 500; margin-bottom: 2px; font-size: 0.65rem; }' +
'        .form-control { width: 100%; padding: 6px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem; outline: none; background: var(--bg); color: var(--text); }' +
'        .palette { display: flex; justify-content: space-between; margin-top: 4px; }' +
'        .swatch { width: 22px; height: 22px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; }' +
'        .swatch.selected { transform: scale(1.1); box-shadow: 0 0 0 2px var(--surface), 0 0 0 3px var(--text); }' +
'        .swatch.hidden { display: none; }' +
'        .checkbox { display: flex; align-items: center; gap: 4px; margin: 6px 0; font-size: 0.65rem; }' +
'        .hidden-fields { display: none; background: var(--hover); padding: 8px; border-radius: 8px; margin-bottom: 8px; }' +
'        .btn-submit { width: 100%; padding: 8px; background: var(--accent); color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 0.75rem; cursor: pointer; margin-top: 6px; }' +
'        .empty { text-align: center; color: var(--text2); padding: 20px; font-size: 0.75rem; background: var(--hover); border-radius: 12px; }' +
'        #log-question-view { display: none; }' +
'    </style>' +
'</head>' +
'<body>' +
'    <div class="header">' +
'        <h1><i class="fas fa-seedling"></i> Grow</h1>' +
'        <div class="time"><i class="fas fa-calendar-alt"></i> <span id="currentDate"><%= currentDate %></span> <i class="fas fa-clock"></i> <span id="currentTime"><%= currentTime %></span></div>' +
'    </div>' +
'    <details class="panel">' +
'        <summary><span>Overview</span><i class="fas fa-chevron-down"></i></summary>' +
'        <div class="panel-body" id="graphs"></div>' +
'    </details>' +
'    <details class="panel" open>' +
'        <summary><span>Calendar</span><i class="fas fa-chevron-down"></i></summary>' +
'        <div class="panel-body">' +
'            <div class="month-nav">' +
'                <button class="nav-btn" onclick="changeMonth(-1)"><i class="fas fa-chevron-left"></i></button>' +
'                <h2 id="monthYear"><%= currentMonth %></h2>' +
'                <button class="nav-btn" onclick="changeMonth(1)"><i class="fas fa-chevron-right"></i></button>' +
'            </div>' +
'            <div class="calendar"><div class="grid" id="calendar"></div></div>' +
'        </div>' +
'    </details>' +
'    <details class="panel" open>' +
'        <summary><span>Growth</span><i class="fas fa-chevron-down"></i></summary>' +
'        <div class="panel-body" id="list"></div>' +
'    </details>' +
'    <div class="bubble" id="bubble"><div id="bubbleContent"></div><div class="tail" id="tail"></div></div>' +
'    <button class="fab" onclick="openAddModal()"><i class="fas fa-plus"></i></button>' +
'    <div class="modal" id="addModal">' +
'        <div class="modal-content">' +
'            <div class="modal-header"><h2>Add Growth</h2><button class="close" onclick="closeModal(\'addModal\')"><i class="fas fa-times"></i></button></div>' +
'            <form id="addForm">' +
'                <div class="form-group"><label>Title</label><input type="text" class="form-control" id="addTitle" required></div>' +
'                <div class="form-group"><label>Description</label><textarea class="form-control" id="addDesc" rows="2"></textarea></div>' +
'                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
'                    <div class="form-group"><label>Start</label><input type="date" class="form-control" id="addStart" required></div>' +
'                    <div class="form-group"><label>Days</label><input type="number" class="form-control" id="addDays" value="365" required></div>' +
'                </div>' +
'                <div class="form-group"><label>Color</label><div class="palette" id="addPalette"></div><input type="hidden" id="addColor" required></div>' +
'                <label class="checkbox"><input type="checkbox" id="addHasData" onchange="toggleDataFields(\'add\')"> Track numbers?</label>' +
'                <div class="hidden-fields" id="addDataFields">' +
'                    <div class="form-group"><label>Question</label><input type="text" class="form-control" id="addQuestion"></div>' +
'                    <div class="form-group"><label>Type</label><select class="form-control" id="addType" onchange="toggleGoalFields(\'add\')"><option value="float">Decimal</option><option value="integer">Whole</option></select></div>' +
'                    <div id="addGoalWrapper" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
'                        <div class="form-group"><label>Min</label><input type="number" step="0.01" class="form-control" id="addMin" value="0"></div>' +
'                        <div class="form-group"><label>Max</label><input type="number" step="0.01" class="form-control" id="addMax" value="100"></div>' +
'                    </div>' +
'                </div>' +
'                <button type="submit" class="btn-submit">Create</button>' +
'            </form>' +
'        </div>' +
'    </div>' +
'    <div class="modal" id="editModal">' +
'        <div class="modal-content">' +
'            <div class="modal-header"><h2>Edit</h2><button class="close" onclick="closeModal(\'editModal\')"><i class="fas fa-times"></i></button></div>' +
'            <form id="editForm">' +
'                <input type="hidden" id="editId">' +
'                <div class="form-group"><label>Title</label><input type="text" class="form-control" id="editTitle" required></div>' +
'                <div class="form-group"><label>Description</label><textarea class="form-control" id="editDesc" rows="2"></textarea></div>' +
'                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
'                    <div class="form-group"><label>Start</label><input type="date" class="form-control" id="editStart" required></div>' +
'                    <div class="form-group"><label>Days</label><input type="number" class="form-control" id="editDays" required></div>' +
'                </div>' +
'                <div class="form-group"><label>Color</label><div class="palette" id="editPalette"></div><input type="hidden" id="editColor" required></div>' +
'                <label class="checkbox"><input type="checkbox" id="editHasData" onchange="toggleDataFields(\'edit\')"> Track numbers?</label>' +
'                <div class="hidden-fields" id="editDataFields">' +
'                    <div class="form-group"><label>Question</label><input type="text" class="form-control" id="editQuestion"></div>' +
'                    <div class="form-group"><label>Type</label><select class="form-control" id="editType" onchange="toggleGoalFields(\'edit\')"><option value="float">Decimal</option><option value="integer">Whole</option></select></div>' +
'                    <div id="editGoalWrapper" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
'                        <div class="form-group"><label>Min</label><input type="number" step="0.01" class="form-control" id="editMin"></div>' +
'                        <div class="form-group"><label>Max</label><input type="number" step="0.01" class="form-control" id="editMax"></div>' +
'                    </div>' +
'                </div>' +
'                <button type="submit" class="btn-submit">Update</button>' +
'            </form>' +
'        </div>' +
'    </div>' +
'    <div class="modal" id="logModal">' +
'        <div class="modal-content">' +
'            <div id="logListView">' +
'                <div class="modal-header"><h2 id="logTitle">Log</h2><button class="close" onclick="closeModal(\'logModal\')"><i class="fas fa-times"></i></button></div>' +
'                <div id="dailyList"></div>' +
'            </div>' +
'            <div id="logQuestionView">' +
'                <div class="modal-header"><h2 id="qTitle"></h2><button class="close" onclick="showLogList()"><i class="fas fa-arrow-left"></i></button></div>' +
'                <div id="qDesc"></div>' +
'                <div class="form-group"><label id="qLabel"></label><div id="qInput"></div></div>' +
'                <button class="btn-submit" id="saveLogBtn">Save</button>' +
'            </div>' +
'        </div>' +
'    </div>' +
'    <script>' +
'        const API = "/api/";' +
'        let data = { items: [], progress: {} };' +
'        let today = "", month = 0, year = 2026, logContext = null;' +
'        const colors = ["#ec4899","#a855f7","#38bdf8","#ef4444","#f97316","#16a34a","#84cc16","#3b82f6"];' +
'        function getIST() {' +
'            const d = new Date();' +
'            const ist = new Date(d.getTime() + 5.5*3600000);' +
'            return {' +
'                date: ist.getUTCFullYear()+"-"+String(ist.getUTCMonth()+1).padStart(2,"0")+"-"+String(ist.getUTCDate()).padStart(2,"0"),' +
'                month: ist.getUTCMonth(),' +
'                year: ist.getUTCFullYear(),' +
'                time: String(ist.getUTCHours()).padStart(2,"0")+":"+String(ist.getUTCMinutes()).padStart(2,"0")' +
'            };' +
'        }' +
'        document.addEventListener("DOMContentLoaded", function() {' +
'            const ist = getIST();' +
'            today = ist.date;' +
'            month = ist.month;' +
'            year = ist.year;' +
'            fetchData();' +
'            document.getElementById("calendar").addEventListener("click", function(e) {' +
'                const cell = e.target.closest(".day");' +
'                if(cell && !cell.classList.contains("empty")) {' +
'                    const d = cell.dataset.date;' +
'                    const active = data.items.filter(g => isActive(g, d));' +
'                    const dayData = data.progress[d] || {};' +
'                    const allDone = active.length && active.every(g => dayData[g.id] !== undefined);' +
'                    if(d === today && !allDone) openLogModal(d);' +
'                    else showBubble(cell, d);' +
'                }' +
'            });' +
'            document.addEventListener("click", function(e) {' +
'                if(!e.target.closest(".day") && !e.target.closest(".bubble"))' +
'                    document.getElementById("bubble").classList.remove("show");' +
'            });' +
'            setInterval(function() {' +
'                const ist = getIST();' +
'                document.getElementById("currentTime").innerHTML = ist.time;' +
'                document.getElementById("currentDate").innerHTML = ist.date.split("-").reverse().join("-");' +
'            }, 1000);' +
'        });' +
'        async function fetchData() {' +
'            try {' +
'                const res = await fetch(API + "grow/data");' +
'                data = await res.json();' +
'                if(!data.items) data.items = [];' +
'                if(!data.progress) data.progress = {};' +
'                renderAll();' +
'            } catch(e) { console.log("Error"); }' +
'        }' +
'        function renderAll() { renderCalendar(); renderGraphs(); renderList(); }' +
'        function isActive(item, d) {' +
'            const start = new Date(item.startDate + "T00:00:00");' +
'            const target = new Date(d + "T00:00:00");' +
'            const days = Math.floor((target - start) / 86400000);' +
'            return days >= 0 && days < item.endCount;' +
'        }' +
'        function escape(s) { if(!s) return ""; return s.replace(/[&<>"]/g, function(c) { return c=="&"?"&amp;":c=="<"?"&lt;":c==">"?"&gt;":c=="\\""?"&quot;":c; }); }' +
'        function renderList() {' +
'            const container = document.getElementById("list");' +
'            if(!data.items.length) { container.innerHTML = "<div class=\\"empty\\"><i class=\\"fas fa-seedling\\"></i><br>Add growth</div>"; return; }' +
'            let html = "";' +
'            const now = new Date(today + "T00:00:00");' +
'            for(let i=0; i<data.items.length; i++) {' +
'                const item = data.items[i];' +
'                const start = new Date(item.startDate + "T00:00:00");' +
'                let passed = Math.floor((now - start) / 86400000);' +
'                let left = item.endCount - passed;' +
'                if(passed < 0) left = item.endCount;' +
'                if(left < 0) left = 0;' +
'                html += "<div class=\\"card\\">";' +
'                html += "<details>";' +
'                html += "<summary class=\\"card summary\\" style=\\"list-style:none\\">";' +
'                html += "<div class=\\"title-section\\"><i class=\\"fas fa-chevron-right\\"></i><span class=\\"title\\">"+escape(item.title)+"</span></div>";' +
'                html += "<div class=\\"actions\\">";' +
'                html += "<button class=\\"btn-icon\\" onclick=\\"event.preventDefault(); event.stopPropagation(); openEdit(\\\""+item.id+"\\\")\\" title=\\"Edit\\"><i class=\\"fas fa-pencil-alt\\"></i></button>";' +
'                html += "<button class=\\"btn-icon del\\" onclick=\\"event.preventDefault(); event.stopPropagation(); del(\\\""+item.id+"\\\")\\" title=\\"Delete\\"><i class=\\"fas fa-trash\\"></i></button>";' +
'                html += "</div></summary>";' +
'                if(item.description) html += "<div class=\\"desc-container\\"><div class=\\"desc\\" style=\\"border-left-color:"+item.color+"\\">"+escape(item.description)+"</div></div>";' +
'                if(item.hasData && item.type !== "boolean") {' +
'                    const todayProgress = data.progress[today] && data.progress[today][item.id];' +
'                    if(todayProgress !== undefined && item.start !== undefined && item.end !== undefined) {' +
'                        const min = Math.min(item.start, item.end);' +
'                        const max = Math.max(item.start, item.end);' +
'                        const range = max - min;' +
'                        const pct = range ? ((todayProgress - min) / range) * 100 : 0;' +
'                        const clamped = Math.min(100, Math.max(0, pct));' +
'                        html += "<div class=\\"progress-bar-container\\">";' +
'                        html += "<div class=\\"progress-stats\\"><span>"+item.question+"</span><span>"+todayProgress+"</span></div>";' +
'                        html += "<div class=\\"progress-bar\\"><div class=\\"progress-fill\\" style=\\"width:"+clamped+"%\\"></div></div>";' +
'                        html += "<div class=\\"progress-stats\\"><span>Min: "+item.start+"</span><span>Max: "+item.end+"</span></div>";' +
'                        html += "</div>";' +
'                    }' +
'                }' +
'                html += "</details>";' +
'                html += "<div class=\\"meta\\"><span class=\\"badge\\"><i class=\\"fas fa-calendar-alt\\"></i> "+item.startDate+"</span><span class=\\"badge\\"><i class=\\"fas fa-hourglass-half\\"></i> "+left+"d</span><div class=\\"dot\\" style=\\"background:"+item.color+"\\"></div></div>";' +
'                html += "</div>";' +
'            }' +
'            container.innerHTML = html;' +
'        }' +
'        async function del(id) { if(confirm("Delete?")) { await fetch(API+"grow/"+id+"/delete", {method:"POST"}); await fetchData(); } }' +
'        function openEdit(id) {' +
'            const item = data.items.find(g => g.id === id);' +
'            if(!item) return;' +
'            document.getElementById("editId").value = item.id;' +
'            document.getElementById("editTitle").value = item.title;' +
'            document.getElementById("editDesc").value = item.description || "";' +
'            document.getElementById("editStart").value = item.startDate;' +
'            document.getElementById("editDays").value = item.endCount;' +
'            document.getElementById("editHasData").checked = item.hasData || false;' +
'            toggleDataFields("edit");' +
'            if(item.hasData) {' +
'                document.getElementById("editQuestion").value = item.question || "";' +
'                document.getElementById("editType").value = item.type || "float";' +
'                toggleGoalFields("edit");' +
'                document.getElementById("editMin").value = item.start !== undefined ? item.start : 0;' +
'                document.getElementById("editMax").value = item.end !== undefined ? item.end : 100;' +
'            }' +
'            initEditPalette(item.color);' +
'            document.getElementById("editModal").classList.add("show");' +
'        }' +
'        document.getElementById("editForm").addEventListener("submit", async function(e) {' +
'            e.preventDefault();' +
'            const id = document.getElementById("editId").value;' +
'            const fd = new FormData();' +
'            fd.append("id", id);' +
'            fd.append("title", document.getElementById("editTitle").value.trim());' +
'            fd.append("description", document.getElementById("editDesc").value.trim());' +
'            fd.append("startDate", document.getElementById("editStart").value);' +
'            fd.append("endCount", document.getElementById("editDays").value);' +
'            fd.append("color", document.getElementById("editColor").value);' +
'            fd.append("hasData", document.getElementById("editHasData").checked ? "true" : "false");' +
'            fd.append("type", document.getElementById("editType").value);' +
'            fd.append("question", document.getElementById("editQuestion").value.trim());' +
'            fd.append("start", document.getElementById("editMin").value);' +
'            fd.append("end", document.getElementById("editMax").value);' +
'            await fetch(API+"grow/"+id+"/update", {method:"POST", body: new URLSearchParams(fd)});' +
'            document.getElementById("editModal").classList.remove("show");' +
'            await fetchData();' +
'        });' +
'        function renderGraphs() {' +
'            const container = document.getElementById("graphs");' +
'            if(!data.items.length) { container.innerHTML = "<div class=\\"empty\\">No data</div>"; return; }' +
'            let html = "<div class=\\"graph-container\\"><div class=\\"graph\\">";' +
'            const now = new Date(today + "T00:00:00");' +
'            for(let i=0; i<data.items.length; i++) {' +
'                const item = data.items[i];' +
'                const start = new Date(item.startDate + "T00:00:00");' +
'                let total = Math.floor((now - start) / 86400000) + 1;' +
'                if(total < 1) total = 0;' +
'                if(total > item.endCount) total = item.endCount;' +
'                let completed = 0;' +
'                for(let d in data.progress) {' +
'                    const dObj = new Date(d + "T00:00:00");' +
'                    if(dObj >= start && dObj <= now && data.progress[d] && data.progress[d][item.id] !== undefined) completed++;' +
'                }' +
'                let pct = total ? Math.min(100, completed/total*100) : 0;' +
'                html += "<div class=\\"bar\\"><div class=\\"bar-pct\\">"+Math.round(pct)+"%</div>";' +
'                html += "<div class=\\"bar-track\\"><div class=\\"bar-fill\\" style=\\"height:"+pct+"%;background:"+item.color+"\\"></div>";' +
'                html += "<div class=\\"bar-label\\">"+escape(item.title)+"</div></div></div>";' +
'            }' +
'            html += "</div></div>";' +
'            container.innerHTML = html;' +
'        }' +
'        function changeMonth(dir) {' +
'            month += dir;' +
'            if(month > 11) { month = 0; year++; }' +
'            else if(month < 0) { month = 11; year--; }' +
'            renderCalendar();' +
'        }' +
'        function renderCalendar() {' +
'            const grid = document.getElementById("calendar");' +
'            const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];' +
'            document.getElementById("monthYear").innerText = months[month] + " " + year;' +
'            const first = new Date(year, month, 1).getDay();' +
'            const days = new Date(year, month+1, 0).getDate();' +
'            let html = "";' +
'            ["Su","Mo","Tu","We","Th","Fr","Sa"].forEach(d => html += "<div class=\\"weekday\\">"+d+"</div>");' +
'            for(let i=0; i<first; i++) html += "<div class=\\"day empty\\"></div>";' +
'            for(let i=1; i<=days; i++) {' +
'                const date = year+"-"+String(month+1).padStart(2,"0")+"-"+String(i).padStart(2,"0");' +
'                const isToday = date === today;' +
'                const dayData = data.progress[date] || {};' +
'                const colors = [];' +
'                for(let j=0; j<data.items.length; j++) {' +
'                    const g = data.items[j];' +
'                    if(isActive(g, date) && dayData[g.id] !== undefined) colors.push(g.color);' +
'                }' +
'                let bg = "transparent", cls = "";' +
'                if(colors.length === 1) { bg = colors[0]; cls = "has-data"; }' +
'                else if(colors.length > 1) {' +
'                    let stops = "";' +
'                    for(let j=0; j<colors.length; j++) {' +
'                        stops += colors[j] + " " + (j*100/colors.length) + "% " + ((j+1)*100/colors.length) + "%";' +
'                        if(j < colors.length-1) stops += ", ";' +
'                    }' +
'                    bg = "conic-gradient(" + stops + ")";' +
'                    cls = "has-data";' +
'                }' +
'                html += "<div class=\\"day\\" data-date=\\""+date+"\\"><div class=\\"circle "+(isToday?"today ":"")+cls+"\\" style=\\"background:"+bg+"\\">"+i+"</div></div>";' +
'            }' +
'            grid.innerHTML = html;' +
'            document.getElementById("bubble").classList.remove("show");' +
'        }' +
'        function showBubble(cell, date) {' +
'            const bubble = document.getElementById("bubble");' +
'            const content = document.getElementById("bubbleContent");' +
'            const tail = document.getElementById("tail");' +
'            const active = data.items.filter(g => isActive(g, date));' +
'            const dayData = data.progress[date] || {};' +
'            const d = new Date(date+"T00:00:00");' +
'            let html = "<div class=\\"bubble-date\\">"+d.toLocaleDateString("en-US",{month:"short",day:"numeric"})+"</div>";' +
'            if(!active.length) html += "<div style=\\"text-align:center\\">None</div>";' +
'            else for(let i=0; i<active.length; i++) {' +
'                const g = active[i];' +
'                html += "<div class=\\"bubble-item\\" style=\\"color:"+g.color+"\\"><span>"+escape(g.title)+"</span><i class=\\"fas "+(dayData[g.id]!==undefined?"fa-check-circle":"fa-circle")+"\\"></i></div>";' +
'            }' +
'            content.innerHTML = html;' +
'            bubble.style.display = "block";' +
'            const b = bubble.getBoundingClientRect(), c = cell.getBoundingClientRect();' +
'            let x = (window.innerWidth/2) - b.width/2;' +
'            let y = c.top - b.height - 5;' +
'            let below = false;' +
'            if(y < 10) { y = c.bottom + 5; below = true; }' +
'            bubble.style.left = x + "px";' +
'            bubble.style.top = y + "px";' +
'            let tailX = (c.left + c.width/2) - x;' +
'            tailX = Math.max(10, Math.min(b.width-10, tailX));' +
'            tail.style.left = tailX + "px";' +
'            if(below) { tail.style.top = "-4px"; tail.style.transform = "rotate(225deg)"; }' +
'            else { tail.style.bottom = "-4px"; tail.style.transform = "rotate(45deg)"; }' +
'            setTimeout(() => bubble.classList.add("show"), 10);' +
'        }' +
'        function initAddPalette() {' +
'            const container = document.getElementById("addPalette");' +
'            const input = document.getElementById("addColor");' +
'            const used = data.items.map(g => g.color);' +
'            let html = "", first = null;' +
'            for(let i=0; i<colors.length; i++) {' +
'                const c = colors[i];' +
'                const isUsed = used.includes(c);' +
'                if(!isUsed && !first) first = c;' +
'                html += "<div class=\\"swatch "+(isUsed?"hidden":"")+"\\" style=\\"background:"+c+"\\" data-color=\\""+c+"\\"></div>";' +
'            }' +
'            container.innerHTML = html;' +
'            if(first) {' +
'                input.value = first;' +
'                container.querySelector("[data-color=\\""+first+"\\"]").classList.add("selected");' +
'            }' +
'            container.onclick = function(e) {' +
'                if(e.target.classList.contains("swatch") && !e.target.classList.contains("hidden")) {' +
'                    Array.from(container.children).forEach(el => el.classList.remove("selected"));' +
'                    e.target.classList.add("selected");' +
'                    input.value = e.target.dataset.color;' +
'                }' +
'            };' +
'        }' +
'        function initEditPalette(current) {' +
'            const container = document.getElementById("editPalette");' +
'            const input = document.getElementById("editColor");' +
'            let html = "";' +
'            for(let i=0; i<colors.length; i++) {' +
'                const c = colors[i];' +
'                html += "<div class=\\"swatch "+(c===current?"selected":"")+"\\" style=\\"background:"+c+"\\" data-color=\\""+c+"\\"></div>";' +
'            }' +
'            container.innerHTML = html;' +
'            input.value = current;' +
'            container.onclick = function(e) {' +
'                if(e.target.classList.contains("swatch")) {' +
'                    Array.from(container.children).forEach(el => el.classList.remove("selected"));' +
'                    e.target.classList.add("selected");' +
'                    input.value = e.target.dataset.color;' +
'                }' +
'            };' +
'        }' +
'        function openAddModal() {' +
'            document.getElementById("addStart").value = today;' +
'            document.getElementById("addType").value = "float";' +
'            toggleGoalFields("add");' +
'            initAddPalette();' +
'            document.getElementById("addModal").classList.add("show");' +
'        }' +
'        function toggleDataFields(mode) {' +
'            const prefix = mode === "add" ? "add" : "edit";' +
'            const checked = document.getElementById(prefix+"HasData").checked;' +
'            document.getElementById(prefix+"DataFields").style.display = checked ? "block" : "none";' +
'        }' +
'        function toggleGoalFields(mode) {' +
'            const prefix = mode === "add" ? "add" : "edit";' +
'            const type = document.getElementById(prefix+"Type").value;' +
'            document.getElementById(prefix+"GoalWrapper").style.display = "grid";' +
'        }' +
'        document.getElementById("addForm").addEventListener("submit", async function(e) {' +
'            e.preventDefault();' +
'            const fd = new FormData();' +
'            fd.append("title", document.getElementById("addTitle").value.trim());' +
'            fd.append("description", document.getElementById("addDesc").value.trim());' +
'            fd.append("startDate", document.getElementById("addStart").value);' +
'            fd.append("endCount", document.getElementById("addDays").value);' +
'            fd.append("color", document.getElementById("addColor").value);' +
'            fd.append("hasData", document.getElementById("addHasData").checked ? "true" : "false");' +
'            fd.append("type", document.getElementById("addType").value);' +
'            fd.append("question", document.getElementById("addQuestion").value.trim());' +
'            fd.append("start", document.getElementById("addMin").value);' +
'            fd.append("end", document.getElementById("addMax").value);' +
'            await fetch(API + "grow", {method:"POST", body: new URLSearchParams(fd)});' +
'            document.getElementById("addModal").classList.remove("show");' +
'            document.getElementById("addForm").reset();' +
'            document.getElementById("addDataFields").style.display = "none";' +
'            await fetchData();' +
'        });' +
'        function openLogModal(date) {' +
'            const active = data.items.filter(g => isActive(g, date));' +
'            const d = new Date(date+"T00:00:00");' +
'            document.getElementById("logTitle").innerText = d.toLocaleDateString("en-US",{month:"long",day:"numeric"});' +
'            let html = "";' +
'            const dayData = data.progress[date] || {};' +
'            for(let i=0; i<active.length; i++) {' +
'                const item = active[i];' +
'                const done = dayData[item.id] !== undefined;' +
'                html += "<div class=\\"card\\">";' +
'                html += "<details>";' +
'                html += "<summary class=\\"card summary\\" style=\\"list-style:none\\">";' +
'                html += "<div class=\\"title-section\\"><i class=\\"fas fa-chevron-right\\"></i><div class=\\"dot\\" style=\\"background:"+item.color+"\\"></div><span class=\\"title\\">"+escape(item.title)+"</span></div>";' +
'                html += "<div class=\\"actions\\">";' +
'                html += "<button class=\\"btn-icon\\" onclick=\\"event.preventDefault(); event.stopPropagation(); handleLogClick(\\\""+item.id+"\\\",\\\""+date+"\\\")\\" style=\\"background:"+(done?"var(--hover)":item.color)+";color:"+(done?"var(--text2)":"white")+"\\""+(done?" disabled":"")+"><i class=\\"fas fa-check\\"></i></button>";' +
'                html += "</div></summary>";' +
'                if(item.description) html += "<div class=\\"desc-container\\"><div class=\\"desc\\" style=\\"border-left-color:"+item.color+"\\">"+escape(item.description)+"</div></div>";' +
'                html += "</details></div>";' +
'            }' +
'            document.getElementById("dailyList").innerHTML = html;' +
'            showLogList();' +
'            document.getElementById("logModal").classList.add("show");' +
'        }' +
'        window.handleLogClick = function(id, date) {' +
'            const item = data.items.find(g => g.id === id);' +
'            if(item.hasData) openLogQuestion(item, date);' +
'            else saveLog(item, date, true);' +
'        };' +
'        function openLogQuestion(item, date) {' +
'            logContext = {item, date};' +
'            document.getElementById("qTitle").innerText = item.title;' +
'            document.getElementById("qDesc").innerHTML = item.description ? "<div class=\\"desc\\" style=\\"border-left-color:"+item.color+";margin-bottom:8px\\">"+escape(item.description)+"</div>" : "";' +
'            document.getElementById("qLabel").innerText = item.question;' +
'            const wrapper = document.getElementById("qInput");' +
'            const step = item.type === "float" ? "0.01" : "1";' +
'            wrapper.innerHTML = "<input type=\\"number\\" step=\\""+step+"\\" class=\\"form-control\\" id=\\"logValue\\" placeholder=\\"Enter value\\">";' +
'            document.getElementById("logListView").style.display = "none";' +
'            document.getElementById("logQuestionView").style.display = "block";' +
'        }' +
'        async function saveLog(item, date, val) {' +
'            const fd = new FormData();' +
'            fd.append("itemId", item.id);' +
'            fd.append("dateStr", date);' +
'            fd.append("value", val === true ? "true" : val);' +
'            await fetch(API + "grow/log", {method:"POST", body: new URLSearchParams(fd)});' +
'            await fetchData();' +
'            const active = data.items.filter(g => isActive(g, date));' +
'            const dayData = data.progress[date] || {};' +
'            const allDone = active.length && active.every(g => dayData[g.id] !== undefined);' +
'            if(allDone) {' +
'                document.getElementById("logModal").classList.remove("show");' +
'                showBubble(document.querySelector(".day[data-date=\\""+date+"\\"]"), date);' +
'            } else openLogModal(date);' +
'        }' +
'        document.getElementById("saveLogBtn").addEventListener("click", async function() {' +
'            const input = document.getElementById("logValue");' +
'            if(!input || !input.value) return alert("Enter value");' +
'            const {item, date} = logContext;' +
'            const val = item.type === "float" ? parseFloat(input.value) : parseInt(input.value);' +
'            await saveLog(item, date, val);' +
'        });' +
'        function showLogList() { document.getElementById("logListView").style.display = "block"; document.getElementById("logQuestionView").style.display = "none"; }' +
'        window.closeModal = function(id) { document.getElementById(id).classList.remove("show"); };' +
'        window.addEventListener("click", function(e) { if(e.target.classList.contains("modal")) e.target.classList.remove("show"); });' +
'    </script>' +
'</body>' +
'</html>';

fs.writeFileSync(path.join(viewsDir, 'index.ejs'), growEJS);

// ==========================================
// 📱 API ROUTES
// ==========================================
app.get('/', async (req, res) => {
    const ist = new Date(new Date().getTime() + 5.5*3600000);
    res.render('index', {
        currentDate: String(ist.getUTCDate()).padStart(2,'0')+'-'+String(ist.getUTCMonth()+1).padStart(2,'0')+'-'+ist.getUTCFullYear(),
        currentTime: String(ist.getUTCHours()).padStart(2,'0')+':'+String(ist.getUTCMinutes()).padStart(2,'0'),
        currentMonth: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][ist.getUTCMonth()] + ' ' + ist.getUTCFullYear()
    });
});

app.get('/api/grow/data', async (req, res) => {
    try {
        const data = await db.collection('grow').findOne({ type: 'tracker' });
        if (!data) {
            const def = { items: [], progress: {} };
            await db.collection('grow').insertOne({ type: 'tracker', ...def });
            res.json(def);
        } else {
            const { type, ...rest } = data;
            res.json(rest);
        }
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/grow', async (req, res) => {
    try {
        const { title, description, startDate, endCount, color, hasData, type, question, start, end } = req.body;
        const item = {
            id: generateId(),
            title: title,
            description: description || '',
            startDate: startDate,
            endCount: parseInt(endCount),
            color: color,
            hasData: hasData === 'true',
            type: type || 'float'
        };
        if (hasData === 'true') {
            item.question = question || '';
            if (start && start !== '') item.start = type === 'float' ? parseFloat(start) : parseInt(start);
            if (end && end !== '') item.end = type === 'float' ? parseFloat(end) : parseInt(end);
        }
        await db.collection('grow').updateOne(
            { type: 'tracker' },
            { $push: { items: item } },
            { upsert: true }
        );
        try { await bot.telegram.sendMessage(CHAT_ID, `🌱 Added: ${title}`, { parse_mode: 'HTML' }); } catch(e) {}
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/grow/:id/update', async (req, res) => {
    try {
        const { id, title, description, startDate, endCount, color, hasData, type, question, start, end } = req.body;
        const item = {
            id: id,
            title: title,
            description: description || '',
            startDate: startDate,
            endCount: parseInt(endCount),
            color: color,
            hasData: hasData === 'true',
            type: type || 'float'
        };
        if (hasData === 'true') {
            item.question = question || '';
            if (start && start !== '') item.start = type === 'float' ? parseFloat(start) : parseInt(start);
            if (end && end !== '') item.end = type === 'float' ? parseFloat(end) : parseInt(end);
        }
        await db.collection('grow').updateOne(
            { type: 'tracker', 'items.id': id },
            { $set: { 'items.$': item } }
        );
        try { await bot.telegram.sendMessage(CHAT_ID, `✏️ Updated: ${title}`, { parse_mode: 'HTML' }); } catch(e) {}
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/grow/:id/delete', async (req, res) => {
    try {
        const tracker = await db.collection('grow').findOne({ type: 'tracker' });
        const item = tracker?.items.find(i => i.id === req.params.id);
        await db.collection('grow').updateOne(
            { type: 'tracker' },
            { $pull: { items: { id: req.params.id } } }
        );
        if (tracker?.progress) {
            const prog = { ...tracker.progress };
            Object.keys(prog).forEach(date => { if (prog[date] && prog[date][req.params.id] !== undefined) delete prog[date][req.params.id]; });
            await db.collection('grow').updateOne(
                { type: 'tracker' },
                { $set: { progress: prog } }
            );
        }
        try { await bot.telegram.sendMessage(CHAT_ID, `🗑️ Deleted: ${item?.title || 'Unknown'}`, { parse_mode: 'HTML' }); } catch(e) {}
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/grow/log', async (req, res) => {
    try {
        const { itemId, dateStr, value } = req.body;
        let parsed = value;
        if (value === 'true') parsed = true;
        else if (value === 'false') parsed = false;
        else if (!isNaN(parseFloat(value))) parsed = parseFloat(value);
        
        const tracker = await db.collection('grow').findOne({ type: 'tracker' });
        const item = tracker?.items.find(i => i.id === itemId);
        
        await db.collection('grow').updateOne(
            { type: 'tracker' },
            { $set: { [`progress.${dateStr}.${itemId}`]: parsed } }
        );
        
        try { await bot.telegram.sendMessage(CHAT_ID, `✅ Completed: ${item?.title || 'Unknown'}`, { parse_mode: 'HTML' }); } catch(e) {}
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ==========================================
// 🚀 START
// ==========================================
async function start() {
    if (await connectDB()) {
        app.listen(PORT, '0.0.0.0', () => {
            console.log('🚀 Server running on port ' + PORT);
            console.log('📁 Database: tggrow');
        });
        await bot.launch();
        console.log('🤖 Bot running');
    } else {
        console.log('❌ Failed to connect, retrying...');
        setTimeout(start, 5000);
    }
}

process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });

start();
