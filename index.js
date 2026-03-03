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
const WEB_APP_URL = 'https://tasks-managing.up.railway.app';
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

// ==========================================
// 🤖 BOT SETUP
// ==========================================
const bot = new Telegraf(BOT_TOKEN);

bot.command('start', async (ctx) => {
    const keyboard = Markup.inlineKeyboard([[Markup.button.webApp('🌱 Open Grow Tracker', WEB_APP_URL)]]);
    await ctx.reply('🌱 <b>Grow Tracker</b>\n\nTrack your daily growth using the Web App below.', { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
});

// ==========================================
// 📱 EJS TEMPLATE
// ==========================================
const growEJS = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>🌱 Grow Tracker</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --bg: #f5f7fa;
            --surface: #ffffff;
            --text: #1e293b;
            --text2: #475569;
            --border: #e2e8f0;
            --accent: #059669;
            --danger: #dc2626;
            --hover: #f1f5f9;
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --bg: #0f172a;
                --surface: #1e293b;
                --text: #f8fafc;
                --text2: #cbd5e1;
                --border: #334155;
                --accent: #34d399;
                --hover: #2d3b4f;
            }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: system-ui, sans-serif; }
        
        body { background: var(--bg); color: var(--text); padding: 15px 12px 100px; min-height: 100vh; font-size: 13px; }
        
        .header { max-width: 600px; margin: 0 auto 15px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 1.3rem; font-weight: 700; color: var(--accent); display: flex; align-items: center; gap: 6px; }
        .time { display: flex; align-items: center; gap: 6px; padding: 5px 12px; background: var(--hover); border-radius: 100px; font-size: 0.8rem; font-weight: 600; }
        
        .panel { max-width: 600px; margin: 0 auto 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
        .panel summary { display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; font-size: 1rem; font-weight: 700; cursor: pointer; background: var(--surface); list-style: none; }
        .panel summary::-webkit-details-marker { display: none; }
        .panel summary i { transition: transform 0.3s; color: var(--text2); }
        .panel[open] summary i { transform: rotate(180deg); }
        .panel-body { padding: 16px; border-top: 1px solid var(--border); }
        
        /* Graphs */
        .graph-container { width: 100%; aspect-ratio: 1; display: flex; flex-direction: column; }
        .graph { display: flex; justify-content: space-around; align-items: flex-end; flex: 1; margin-top: 10px;}
        .bar { display: flex; flex-direction: column; align-items: center; width: 10%; max-width: 35px; height: 100%; }
        .bar-track { width: 100%; height: 90%; border-radius: 6px; position: relative; display: flex; align-items: flex-end; background: var(--hover); overflow: hidden; border: 1px solid var(--border); }
        .bar-fill { width: 100%; border-radius: 4px; transition: height 0.6s ease; }
        
        /* Bar Label Text - Auto Black/White based on theme */
        .bar-label { 
            position: absolute; top: 0; bottom: 0; left: 0; right: 0; 
            writing-mode: vertical-rl; transform: rotate(180deg); 
            display: flex; align-items: center; justify-content: flex-end; 
            padding-top: 10px; 
            color: var(--text); 
            font-size: 0.8rem; font-weight: 700; pointer-events: none; 
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; 
        }
        
        .bar-pct { font-size: 0.75rem; font-weight: 700; margin-bottom: 5px; color: var(--text); }
        
        /* Calendar */
        .month-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .month-nav h2 { font-size: 1rem; font-weight: 700; background: var(--hover); padding: 5px 14px; border-radius: 30px; border: 1px solid var(--border); }
        .nav-btn { background: var(--bg); border: 1px solid var(--border); width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 0.8rem; color: var(--text2); display: flex; align-items: center; justify-content: center; transition: 0.2s;}
        .nav-btn:hover { background: var(--hover); color: var(--text); }
        .calendar { width: 100%; display: flex; flex-direction: column; }
        .grid { flex: 1; display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
        .weekday { display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.7rem; color: var(--text2); text-transform: uppercase; padding-bottom: 4px;}
        .day { display: flex; align-items: center; justify-content: center; border-radius: 10px; position: relative; aspect-ratio: 1;}
        .day.empty { pointer-events: none; }
        .day:hover:not(.empty) { background: var(--hover); cursor: pointer; }
        .circle { width: 100%; max-width: 36px; height: 100%; max-height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem; transition: transform 0.2s; }
        .day:hover .circle { transform: scale(1.1); }
        .circle.has-data { color: #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.2); text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
        .circle.today { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent); color: var(--accent); }
        .circle.today.has-data { color: #fff; }
        
        /* Bubble */
        .bubble { position: fixed; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 10px; z-index: 1000; min-width: 160px; max-width: 200px; pointer-events: none; box-shadow: 0 10px 25px rgba(0,0,0,0.25); display: none; opacity: 0; transition: opacity 0.2s; }
        .bubble.show { opacity: 1; }
        .tail { position: absolute; width: 12px; height: 12px; background: var(--surface); transform: rotate(45deg); z-index: -1; }
        .bubble-date { font-size: 0.75rem; font-weight: 700; color: var(--text2); margin-bottom: 5px; border-bottom: 1px solid var(--border); padding-bottom: 5px; }
        .bubble-item { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 0.8rem; font-weight: 600; }
        
        /* Growth List */
        .card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 12px; margin-bottom: 10px; transition: 0.2s;}
        
        /* Fixed Button Alignment */
        .card summary { display: flex; justify-content: space-between; align-items: flex-start; cursor: pointer; list-style: none; outline: none; padding: 4px 0;}
        .card summary::-webkit-details-marker { display: none; }
        .title-section { display: flex; align-items: flex-start; gap: 8px; flex: 1; padding-top: 4px;}
        .title-section i { font-size: 0.8rem; color: var(--text2); transition: transform 0.2s; margin-top: 2px; }
        details[open] .title-section i { transform: rotate(90deg); }
        .title { font-weight: 700; font-size: 1rem; color: var(--text); line-height: 1.3; }
        
        .actions { display: flex; gap: 6px; margin-left: 10px; align-items: flex-start; flex-shrink: 0; }
        .btn-icon { width: 32px; height: 32px; border-radius: 8px; border: none; background: var(--hover); color: var(--text2); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.85rem; transition: 0.2s; flex-shrink: 0; }
        .btn-icon:hover { background: var(--accent); color: white; }
        .btn-icon.del:hover { background: var(--danger); }
        
        .desc-container { width: 100%; margin-top: 10px; }
        .desc { font-size: 0.85rem; color: var(--text2); padding: 8px 12px; background: var(--hover); border-radius: 8px; border-left: 3px solid; word-break: break-word; line-height: 1.4;}
        .meta { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
        .badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--hover); border-radius: 30px; font-size: 0.75rem; font-weight: 600; color: var(--text2);}
        .dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--border); }
        
        /* Progress Bars */
        .progress-bar-container { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border); width: 100%; }
        .progress-bar { width: 100%; height: 8px; background: var(--hover); border-radius: 10px; overflow: hidden; margin: 8px 0; border: 1px solid var(--border); }
        .progress-fill { height: 100%; background: var(--accent); border-radius: 10px; transition: width 0.5s ease-out; }
        .progress-stats { display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text2); font-weight: 600; align-items: center;}
        .progress-stats strong { color: var(--text); font-size: 0.85rem;}
        
        /* Modern Toast & Glass Loader */
        .toast { position: fixed; top: -100px; left: 50%; transform: translateX(-50%); background: var(--surface); color: var(--text); padding: 12px 24px; border-radius: 30px; box-shadow: 0 10px 40px rgba(0,0,0,0.25); transition: top 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55); z-index: 10000; font-weight: 600; font-size: 0.9rem; border: 1px solid var(--border); display: flex; align-items: center; gap: 10px; white-space: nowrap; }
        .toast.show { top: 25px; }
        .toast.success { border-left: 4px solid var(--accent); }
        .toast.error { border-left: 4px solid var(--danger); }
        
        .global-loader { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.5); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); z-index: 9999; display: none; flex-direction: column; align-items: center; justify-content: center; }
        .global-loader.show { display: flex; }
        .spinner { width: 45px; height: 45px; border: 4px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @media (prefers-color-scheme: dark) { .global-loader { background: rgba(15, 23, 42, 0.6); } }
        
        /* FAB & Modals */
        .fab { position: fixed; bottom: 20px; right: 20px; width: 56px; height: 56px; border-radius: 50%; background: var(--accent); color: white; border: none; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; cursor: pointer; box-shadow: 0 6px 16px rgba(5,150,105,0.4); z-index: 1000; transition: transform 0.2s;}
        .fab:active { transform: scale(0.9); }
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(3px); align-items: center; justify-content: center; z-index: 2000; padding: 15px; }
        .modal.show { display: flex; }
        .modal-content { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 20px; width: 100%; max-width: 380px; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.2); animation: modalIn 0.3s ease;}
        @keyframes modalIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid var(--border); padding-bottom: 10px; }
        .modal-header h2 { font-size: 1.1rem; font-weight: 700; color: var(--text); }
        .close { background: var(--hover); border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; color: var(--text2); transition: 0.2s;}
        .close:hover { background: var(--danger); color: white; }
        
        /* Form Inputs */
        .form-group { margin-bottom: 12px; }
        .form-group label { display: block; font-weight: 600; margin-bottom: 4px; font-size: 0.8rem; color: var(--text); }
        .form-control { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.85rem; outline: none; background: var(--bg); color: var(--text); transition: border 0.2s;}
        .form-control:focus { border-color: var(--accent); }
        .palette { display: flex; justify-content: space-between; margin-top: 6px; }
        .swatch { width: 26px; height: 26px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: 0.1s;}
        .swatch.selected { transform: scale(1.15); box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--text); }
        .swatch.hidden { display: none; }
        .checkbox { display: flex; align-items: center; gap: 8px; margin: 12px 0; font-size: 0.85rem; font-weight: 600; cursor: pointer; color: var(--text);}
        .checkbox input { width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer; }
        .hidden-fields { display: none; background: var(--hover); padding: 12px; border-radius: 10px; margin-bottom: 12px; }
        .btn-submit { width: 100%; padding: 12px; background: var(--accent); color: white; border: none; border-radius: 10px; font-weight: 700; font-size: 0.9rem; cursor: pointer; margin-top: 10px; transition: 0.2s; display: flex; justify-content: center; align-items: center; gap: 8px;}
        .btn-submit:active { transform: scale(0.98); }
        .empty { text-align: center; color: var(--text2); padding: 30px; font-size: 0.9rem; background: var(--hover); border-radius: 12px; }
        #logQuestionView { display: none; }
    </style>
</head>
<body>
    <div id="toast" class="toast"></div>
    
    <div id="globalLoader" class="global-loader">
        <div class="spinner"></div>
    </div>

    <div class="header">
        <h1><i class="fas fa-seedling"></i> Grow</h1>
        <div class="time"><i class="fas fa-calendar-alt"></i> <span id="currentDate"><%= currentDate %></span> &nbsp;<i class="fas fa-clock"></i> <span id="currentTime"><%= currentTime %></span></div>
    </div>
    
    <details class="panel">
        <summary><span>Progress Overview</span><i class="fas fa-chevron-down"></i></summary>
        <div class="panel-body" id="graphs"></div>
    </details>
    
    <details class="panel" open>
        <summary><span>Activity Calendar</span><i class="fas fa-chevron-down"></i></summary>
        <div class="panel-body">
            <div class="month-nav">
                <button class="nav-btn" onclick="changeMonth(-1)"><i class="fas fa-chevron-left"></i></button>
                <h2 id="monthYear"><%= currentMonth %></h2>
                <button class="nav-btn" onclick="changeMonth(1)"><i class="fas fa-chevron-right"></i></button>
            </div>
            <div class="calendar"><div class="grid" id="calendar"></div></div>
        </div>
    </details>
    
    <details class="panel" open>
        <summary><span>Manage Growth</span><i class="fas fa-chevron-down"></i></summary>
        <div class="panel-body" id="list"></div>
    </details>
    
    <div class="bubble" id="bubble"><div id="bubbleContent"></div><div class="tail" id="tail"></div></div>
    
    <button class="fab" id="fabBtn" onclick="openAddModal()"><i class="fas fa-plus"></i></button>
    
    <div class="modal" id="addModal">
        <div class="modal-content">
            <div class="modal-header"><h2>Add New Growth</h2><button class="close" onclick="closeModal('addModal')"><i class="fas fa-times"></i></button></div>
            <form id="addForm">
                <div class="form-group"><label>Title</label><input type="text" class="form-control" id="addTitle" required placeholder="E.g. Daily Walk"></div>
                <div class="form-group"><label>Description (Optional)</label><textarea class="form-control" id="addDesc" rows="2" placeholder="Brief details..."></textarea></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div class="form-group"><label>Start Date</label><input type="date" class="form-control" id="addStart" required></div>
                    <div class="form-group"><label>Duration (Days)</label><input type="number" class="form-control" id="addDays" value="365" required></div>
                </div>
                <div class="form-group"><label>Color Tag</label><div class="palette" id="addPalette"></div><input type="hidden" id="addColor" required></div>
                
                <label class="checkbox"><input type="checkbox" id="addHasData" onchange="toggleDataFields('add')"> Track Quantitative Data?</label>
                
                <div class="hidden-fields" id="addDataFields">
                    <div class="form-group"><label>Question Prompt</label><input type="text" class="form-control" id="addQuestion" placeholder="E.g. Weight lost?"></div>
                    <div class="form-group"><label>Data Type</label><select class="form-control" id="addType"><option value="integer">Whole Number</option><option value="float">Decimal (Float)</option></select></div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                        <div class="form-group"><label>Start Value</label><input type="number" step="0.01" class="form-control" id="addMin" value="0"></div>
                        <div class="form-group"><label>Target Value</label><input type="number" step="0.01" class="form-control" id="addMax" value="100"></div>
                    </div>
                </div>
                <button type="submit" class="btn-submit">Create Tracker</button>
            </form>
        </div>
    </div>
    
    <div class="modal" id="editModal">
        <div class="modal-content">
            <div class="modal-header"><h2>Edit Growth</h2><button class="close" onclick="closeModal('editModal')"><i class="fas fa-times"></i></button></div>
            <form id="editForm">
                <input type="hidden" id="editId">
                <div class="form-group"><label>Title</label><input type="text" class="form-control" id="editTitle" required></div>
                <div class="form-group"><label>Description (Optional)</label><textarea class="form-control" id="editDesc" rows="2"></textarea></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div class="form-group"><label>Start Date</label><input type="date" class="form-control" id="editStart" required></div>
                    <div class="form-group"><label>Duration (Days)</label><input type="number" class="form-control" id="editDays" required></div>
                </div>
                <div class="form-group"><label>Color Tag (Auto-Swaps)</label><div class="palette" id="editPalette"></div><input type="hidden" id="editColor" required></div>
                
                <label class="checkbox"><input type="checkbox" id="editHasData" onchange="toggleDataFields('edit')"> Track Quantitative Data?</label>
                
                <div class="hidden-fields" id="editDataFields">
                    <div class="form-group"><label>Question Prompt</label><input type="text" class="form-control" id="editQuestion"></div>
                    <div class="form-group"><label>Data Type</label><select class="form-control" id="editType"><option value="integer">Whole Number</option><option value="float">Decimal (Float)</option></select></div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                        <div class="form-group"><label>Start Value</label><input type="number" step="0.01" class="form-control" id="editMin"></div>
                        <div class="form-group"><label>Target Value</label><input type="number" step="0.01" class="form-control" id="editMax"></div>
                    </div>
                </div>
                <button type="submit" class="btn-submit">Update Tracker</button>
            </form>
        </div>
    </div>
    
    <div class="modal" id="logModal">
        <div class="modal-content">
            <div id="logListView">
                <div class="modal-header"><h2 id="logTitle">Log Progress</h2><button class="close" onclick="closeModal('logModal')"><i class="fas fa-times"></i></button></div>
                <div id="dailyList"></div>
            </div>
            <div id="logQuestionView">
                <div class="modal-header"><h2 id="qTitle"></h2><button class="close" onclick="showLogList()"><i class="fas fa-arrow-left"></i></button></div>
                <div id="qDesc"></div>
                <div class="form-group"><label id="qLabel" style="font-size:0.9rem; color:var(--text);"></label><div id="qInput"></div></div>
                <button class="btn-submit" id="saveLogBtn">Save Value</button>
            </div>
        </div>
    </div>
    
    <script>
        const API = "/api/";
        let data = { items: [], progress: {} };
        let today = "", month = 0, year = 2026, logContext = null;
        const colors = ["#ec4899","#a855f7","#38bdf8","#ef4444","#f97316","#16a34a","#84cc16","#3b82f6"];
        
        function getIST() {
            const d = new Date();
            const ist = new Date(d.getTime() + 5.5*3600000);
            return {
                date: ist.getUTCFullYear()+"-"+String(ist.getUTCMonth()+1).padStart(2,"0")+"-"+String(ist.getUTCDate()).padStart(2,"0"),
                month: ist.getUTCMonth(),
                year: ist.getUTCFullYear(),
                time: String(ist.getUTCHours()).padStart(2,"0")+":"+String(ist.getUTCMinutes()).padStart(2,"0")
            };
        }
        
        function showToast(msg, type="success") {
            const toast = document.getElementById("toast");
            toast.innerHTML = \`<i class="fas \${type==='success'?'fa-check-circle':'fa-exclamation-circle'}" style="color:var(--\${type==='success'?'accent':'danger'})"></i> \${msg}\`;
            toast.className = \`toast show \${type}\`;
            setTimeout(() => toast.classList.remove("show"), 3000);
        }
        
        function showLoader() { document.getElementById("globalLoader").classList.add("show"); }
        function hideLoader() { document.getElementById("globalLoader").classList.remove("show"); }
        
        document.addEventListener("DOMContentLoaded", async function() {
            const ist = getIST();
            today = ist.date;
            month = ist.month;
            year = ist.year;
            
            showLoader();
            await fetchData();
            hideLoader();
            
            document.getElementById("calendar").addEventListener("click", function(e) {
                const cell = e.target.closest(".day");
                if(cell && !cell.classList.contains("empty")) {
                    const d = cell.dataset.date;
                    const active = data.items.filter(g => isActive(g, d));
                    const dayData = data.progress[d] || {};
                    const allDone = active.length && active.every(g => dayData[g.id] !== undefined);
                    if(d === today && !allDone) openLogModal(d);
                    else showBubble(cell, d);
                }
            });
            
            document.addEventListener("click", function(e) {
                if(!e.target.closest(".day") && !e.target.closest(".bubble")) {
                    hideBubble();
                }
            });
            
            setInterval(function() {
                const istObj = getIST();
                document.getElementById("currentTime").innerHTML = istObj.time;
                document.getElementById("currentDate").innerHTML = istObj.date.split("-").reverse().join("-");
            }, 1000);
        });
        
        async function fetchData() {
            try {
                const res = await fetch(API + "grow/data");
                data = await res.json();
                if(!data.items) data.items = [];
                if(!data.progress) data.progress = {};
                renderAll();
            } catch(e) { 
                showToast("Error!", "error"); 
            }
        }
        
        function renderAll() { renderCalendar(); renderGraphs(); renderList(); }
        
        function isActive(item, d) {
            const start = new Date(item.startDate + "T00:00:00");
            const target = new Date(d + "T00:00:00");
            const days = Math.floor((target - start) / 86400000);
            return days >= 0 && days < item.endCount;
        }
        
        function escape(s) { if(!s) return ""; return s.replace(/[&<>"]/g, function(c) { return c=="&"?"&amp;":c=="<"?"&lt;":c==">"?"&gt;":c=="\\""?"&quot;":c; }); }
        
        function renderList() {
            const container = document.getElementById("list");
            if(!data.items.length) { container.innerHTML = "<div class='empty'><i class='fas fa-seedling' style='font-size:2rem;margin-bottom:10px;'></i><br>No items tracked. Click + to add.</div>"; return; }
            let html = "";
            const now = new Date(today + "T00:00:00");
            
            for(let i=0; i<data.items.length; i++) {
                const item = data.items[i];
                const start = new Date(item.startDate + "T00:00:00");
                
                let passed = Math.floor((now - start) / 86400000);
                if(passed < 0) passed = 0; 
                let left = item.endCount - passed;
                if(left < 0) left = 0;
                
                html += \`<div class="card">
                    <details>
                        <summary>
                            <div class="title-section"><i class="fas fa-chevron-right"></i><span class="title">\${escape(item.title)}</span></div>
                            <div class="actions">
                                <button class="btn-icon" onclick="event.preventDefault(); openEdit('\${item.id}')" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                                <button class="btn-icon del" onclick="event.preventDefault(); del('\${item.id}')" title="Delete"><i class="fas fa-trash"></i></button>
                            </div>
                        </summary>\`;
                        
                if(item.description) {
                    html += \`<div class="desc-container"><div class="desc" style="border-left-color:\${item.color}">\${escape(item.description)}</div></div>\`;
                }
                
                let timePct = item.endCount > 0 ? (passed / item.endCount) * 100 : 0;
                timePct = Math.max(0, Math.min(100, timePct));
                
                html += \`<div class="progress-bar-container">
                    <div class="progress-stats"><span><strong>Time Elapsed</strong></span><span>\${passed} / \${item.endCount} Days</span></div>
                    <div class="progress-bar"><div class="progress-fill" style="width:\${timePct}%; background:\${item.color}cc"></div></div>
                    <div class="progress-stats"><span>Started: \${item.startDate}</span><span>\${Math.round(timePct)}% Complete</span></div>
                </div>\`;

                if(item.hasData && item.type !== "boolean") {
                    let latestValue = item.start !== undefined ? item.start : 0;
                    let sortedDates = Object.keys(data.progress).sort();
                    for(let d of sortedDates) {
                        if(data.progress[d][item.id] !== undefined && typeof data.progress[d][item.id] === 'number') {
                            latestValue = data.progress[d][item.id];
                        }
                    }
                    if(item.start !== undefined && item.end !== undefined) {
                        const min = Math.min(item.start, item.end);
                        const max = Math.max(item.start, item.end);
                        const range = max - min;
                        let pct = range === 0 ? 0 : ((latestValue - min) / range) * 100;
                        pct = Math.max(0, Math.min(100, pct));
                        
                        html += \`<div class="progress-bar-container" style="border-top: none; padding-top: 5px;">
                            <div class="progress-stats"><span><strong>\${escape(item.question)}</strong></span><span>Current: \${latestValue}</span></div>
                            <div class="progress-bar"><div class="progress-fill" style="width:\${pct}%; background:\${item.color}"></div></div>
                            <div class="progress-stats"><span>Start: \${item.start}</span><span>Goal: \${item.end}</span></div>
                        </div>\`;
                    }
                }
                
                html += \`</details>
                    <div class="meta">
                        <div>
                            <span class="badge"><i class="fas fa-calendar-alt"></i> \${item.startDate}</span>
                            <span class="badge"><i class="fas fa-hourglass-half"></i> \${left} days left</span>
                        </div>
                        <div class="dot" style="background:\${item.color}"></div>
                    </div>
                </div>\`;
            }
            container.innerHTML = html;
        }
        
        async function del(id) { 
            if(confirm("Delete tracker?")) { 
                showLoader();
                try {
                    await fetch(API+"grow/"+id+"/delete", {method:"POST"}); 
                    await fetchData(); 
                    showToast("Grow deleted!", "success");
                } catch(e) {
                    showToast("Error!", "error");
                }
                hideLoader();
            } 
        }
        
        window.openEdit = function(id) {
            const item = data.items.find(g => g.id === id);
            if(!item) return;
            document.getElementById("editId").value = item.id;
            document.getElementById("editTitle").value = item.title;
            document.getElementById("editDesc").value = item.description || "";
            document.getElementById("editStart").value = item.startDate;
            document.getElementById("editDays").value = item.endCount;
            document.getElementById("editHasData").checked = item.hasData || false;
            
            toggleDataFields("edit");
            if(item.hasData) {
                document.getElementById("editQuestion").value = item.question || "";
                document.getElementById("editType").value = item.type || "float";
                document.getElementById("editMin").value = item.start !== undefined ? item.start : 0;
                document.getElementById("editMax").value = item.end !== undefined ? item.end : 100;
            }
            initEditPalette(item.color);
            document.getElementById("editModal").classList.add("show");
        }
        
        document.getElementById("editForm").addEventListener("submit", async function(e) {
            e.preventDefault();
            showLoader();
            
            const id = document.getElementById("editId").value;
            const payload = {
                id: id,
                title: document.getElementById("editTitle").value.trim(),
                description: document.getElementById("editDesc").value.trim(),
                startDate: document.getElementById("editStart").value,
                endCount: parseInt(document.getElementById("editDays").value),
                color: document.getElementById("editColor").value,
                hasData: document.getElementById("editHasData").checked,
                type: document.getElementById("editType").value,
                question: document.getElementById("editQuestion").value.trim(),
                start: document.getElementById("editMin").value,
                end: document.getElementById("editMax").value
            };
            
            try {
                await fetch(API+"grow/"+id+"/update", {
                    method:"POST", 
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(payload)
                });
                document.getElementById("editModal").classList.remove("show");
                await fetchData();
                showToast("Grow updated!", "success");
            } catch(e) {
                showToast("Error!", "error");
            }
            hideLoader();
        });
        
        function renderGraphs() {
            const container = document.getElementById("graphs");
            if(!data.items.length) { container.innerHTML = "<div class='empty'>No data available.</div>"; return; }
            let html = "<div class='graph-container'><div class='graph'>";
            const now = new Date(today + "T00:00:00");
            
            for(let i=0; i<data.items.length; i++) {
                const item = data.items[i];
                const start = new Date(item.startDate + "T00:00:00");
                let totalDaysSoFar = Math.floor((now - start) / 86400000) + 1;
                if(totalDaysSoFar < 1) totalDaysSoFar = 0;
                if(totalDaysSoFar > item.endCount) totalDaysSoFar = item.endCount;
                
                let completed = 0;
                for(let d in data.progress) {
                    const dObj = new Date(d + "T00:00:00");
                    if(dObj >= start && dObj <= now && data.progress[d] && data.progress[d][item.id] !== undefined) completed++;
                }
                
                let pct = totalDaysSoFar ? Math.min(100, completed/totalDaysSoFar*100) : 0;
                
                html += \`<div class="bar">
                    <div class="bar-pct">\${Math.round(pct)}%</div>
                    <div class="bar-track" style="background:\${item.color}40">
                        <div class="bar-fill" style="height:\${pct}%; background:\${item.color}"></div>
                        <div class="bar-label">\${escape(item.title)}</div>
                    </div>
                </div>\`;
            }
            html += "</div></div>";
            container.innerHTML = html;
        }
        
        window.changeMonth = function(dir) {
            month += dir;
            if(month > 11) { month = 0; year++; }
            else if(month < 0) { month = 11; year--; }
            renderCalendar();
        }
        
        function renderCalendar() {
            const grid = document.getElementById("calendar");
            const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
            document.getElementById("monthYear").innerText = months[month] + " " + year;
            const first = new Date(year, month, 1).getDay();
            const days = new Date(year, month+1, 0).getDate();
            let html = "";
            
            ["Su","Mo","Tu","We","Th","Fr","Sa"].forEach(d => html += \`<div class="weekday">\${d}</div>\`);
            for(let i=0; i<first; i++) html += \`<div class="day empty"></div>\`;
            
            for(let i=1; i<=days; i++) {
                const date = year+"-"+String(month+1).padStart(2,"0")+"-"+String(i).padStart(2,"0");
                const isToday = date === today;
                const dayData = data.progress[date] || {};
                const activeColors = [];
                
                for(let j=0; j<data.items.length; j++) {
                    const g = data.items[j];
                    if(isActive(g, date) && dayData[g.id] !== undefined) activeColors.push(g.color);
                }
                
                let bg = "transparent", cls = "";
                if(activeColors.length === 1) { 
                    bg = activeColors[0]; cls = "has-data"; 
                } else if(activeColors.length > 1) {
                    let stops = "";
                    for(let j=0; j<activeColors.length; j++) {
                        stops += activeColors[j] + " " + (j*100/activeColors.length) + "% " + ((j+1)*100/activeColors.length) + "%";
                        if(j < activeColors.length-1) stops += ", ";
                    }
                    bg = "conic-gradient(" + stops + ")";
                    cls = "has-data";
                }
                
                html += \`<div class="day" data-date="\${date}"><div class="circle \${isToday?'today ':''}\${cls}" style="background:\${bg}">\${i}</div></div>\`;
            }
            grid.innerHTML = html;
            hideBubble();
        }
        
        function hideBubble() {
            const bubble = document.getElementById("bubble");
            bubble.classList.remove("show");
            setTimeout(() => bubble.style.display = "none", 200);
        }

        function showBubble(cell, date) {
            const bubble = document.getElementById("bubble");
            const content = document.getElementById("bubbleContent");
            const tail = document.getElementById("tail");
            const active = data.items.filter(g => isActive(g, date));
            const dayData = data.progress[date] || {};
            const d = new Date(date+"T00:00:00");
            
            let html = \`<div class="bubble-date">\${d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>\`;
            if(!active.length) html += "<div style='text-align:center;font-size:0.8rem;color:var(--text2);'>No tasks active.</div>";
            else {
                for(let i=0; i<active.length; i++) {
                    const g = active[i];
                    const isDone = dayData[g.id] !== undefined;
                    html += \`<div class="bubble-item" style="color:\${g.color}"><span>\${escape(g.title)}</span><i class="fas \${isDone?'fa-check-circle':'fa-circle'}"></i></div>\`;
                }
            }
            content.innerHTML = html;
            
            bubble.style.display = "block";
            bubble.style.opacity = "0";
            
            const bRect = bubble.getBoundingClientRect();
            const cRect = cell.getBoundingClientRect();
            
            let top = cRect.top - bRect.height - 12; 
            let left = cRect.left + (cRect.width / 2) - (bRect.width / 2);
            let placement = 'top';
            
            if(top < 20) { 
                top = cRect.bottom + 12;
                placement = 'bottom';
            }
            
            if(left < 10) left = 10;
            if(left + bRect.width > window.innerWidth - 10) left = window.innerWidth - bRect.width - 10;
            
            bubble.style.top = top + "px";
            bubble.style.left = left + "px";
            
            let tailLeft = (cRect.left + cRect.width / 2) - left;
            tailLeft = Math.max(12, Math.min(bRect.width - 24, tailLeft)); 
            tail.style.left = (tailLeft - 6) + "px"; 
            
            if(placement === 'top') {
                tail.style.bottom = "-6px";
                tail.style.top = "auto";
                tail.style.borderTop = "none";
                tail.style.borderLeft = "none";
                tail.style.borderBottom = "1px solid var(--border)";
                tail.style.borderRight = "1px solid var(--border)";
            } else {
                tail.style.top = "-6px";
                tail.style.bottom = "auto";
                tail.style.borderTop = "1px solid var(--border)";
                tail.style.borderLeft = "1px solid var(--border)";
                tail.style.borderBottom = "none";
                tail.style.borderRight = "none";
            }
            
            setTimeout(() => {
                bubble.style.opacity = "1";
                bubble.classList.add("show");
            }, 10);
            
            window.addEventListener('scroll', hideBubble, { once: true });
        }
        
        function initAddPalette() {
            const container = document.getElementById("addPalette");
            const input = document.getElementById("addColor");
            const used = data.items.map(g => g.color);
            let html = "", first = null;
            
            for(let i=0; i<colors.length; i++) {
                const c = colors[i];
                const isUsed = used.includes(c);
                if(!isUsed && !first) first = c;
                html += \`<div class="swatch \${isUsed?'hidden':''}" style="background:\${c}" data-color="\${c}"></div>\`;
            }
            container.innerHTML = html;
            
            if(first) {
                input.value = first;
                const firstSwatch = container.querySelector(\`[data-color="\${first}"]\`);
                if(firstSwatch) firstSwatch.classList.add("selected");
            }
            
            container.onclick = function(e) {
                if(e.target.classList.contains("swatch") && !e.target.classList.contains("hidden")) {
                    Array.from(container.children).forEach(el => el.classList.remove("selected"));
                    e.target.classList.add("selected");
                    input.value = e.target.dataset.color;
                }
            };
        }
        
        function initEditPalette(current) {
            const container = document.getElementById("editPalette");
            const input = document.getElementById("editColor");
            let html = "";
            for(let i=0; i<colors.length; i++) {
                const c = colors[i];
                html += \`<div class="swatch \${c===current?'selected':''}" style="background:\${c}" data-color="\${c}"></div>\`;
            }
            container.innerHTML = html;
            input.value = current;
            
            container.onclick = function(e) {
                if(e.target.classList.contains("swatch")) {
                    Array.from(container.children).forEach(el => el.classList.remove("selected"));
                    e.target.classList.add("selected");
                    input.value = e.target.dataset.color;
                }
            };
        }
        
        window.openAddModal = function() {
            document.getElementById("addStart").value = today;
            document.getElementById("addType").value = "integer";
            initAddPalette();
            document.getElementById("addModal").classList.add("show");
        }
        
        window.toggleDataFields = function(mode) {
            const prefix = mode === "add" ? "add" : "edit";
            const checked = document.getElementById(prefix+"HasData").checked;
            document.getElementById(prefix+"DataFields").style.display = checked ? "block" : "none";
        }
        
        document.getElementById("addForm").addEventListener("submit", async function(e) {
            e.preventDefault();
            showLoader();
            
            const payload = {
                title: document.getElementById("addTitle").value.trim(),
                description: document.getElementById("addDesc").value.trim(),
                startDate: document.getElementById("addStart").value,
                endCount: parseInt(document.getElementById("addDays").value),
                color: document.getElementById("addColor").value,
                hasData: document.getElementById("addHasData").checked,
                type: document.getElementById("addType").value,
                question: document.getElementById("addQuestion").value.trim(),
                start: document.getElementById("addMin").value,
                end: document.getElementById("addMax").value
            };
            
            try {
                await fetch(API + "grow", {
                    method:"POST", 
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(payload)
                });
                
                document.getElementById("addModal").classList.remove("show");
                document.getElementById("addForm").reset();
                document.getElementById("addDataFields").style.display = "none";
                await fetchData();
                showToast("Grow added!", "success");
            } catch(e) {
                showToast("Error!", "error");
            }
            hideLoader();
        });
        
        function openLogModal(date) {
            const active = data.items.filter(g => isActive(g, date));
            const d = new Date(date+"T00:00:00");
            document.getElementById("logTitle").innerText = d.toLocaleDateString("en-US",{month:"long",day:"numeric"});
            let html = "";
            const dayData = data.progress[date] || {};
            
            for(let i=0; i<active.length; i++) {
                const item = active[i];
                const done = dayData[item.id] !== undefined;
                
                html += \`<div class="card">
                    <details style="display:contents;">
                        <summary style="outline:none; list-style:none;">
                            <div class="title-section"><i class="fas fa-chevron-right"></i><div class="dot" style="background:\${item.color}"></div><span class="title">\${escape(item.title)}</span></div>
                            <div class="actions">
                                <button class="btn-icon" onclick="event.preventDefault(); handleLogClick('\${item.id}','\${date}')" style="background:\${done?'var(--hover)':item.color};color:\${done?'var(--text2)':'white'}; width:36px; height:36px;" \${done?'disabled':''}><i class="fas fa-check"></i></button>
                            </div>
                        </summary>\`;
                if(item.description) html += \`<div class="desc-container"><div class="desc" style="border-left-color:\${item.color}">\${escape(item.description)}</div></div>\`;
                html += \`</details></div>\`;
            }
            document.getElementById("dailyList").innerHTML = html;
            showLogList();
            document.getElementById("logModal").classList.add("show");
        }
        
        window.handleLogClick = function(id, date) {
            const item = data.items.find(g => g.id === id);
            if(item.hasData) {
                openLogQuestion(item, date);
            } else {
                saveLog(item, date, true);
            }
        };
        
        function openLogQuestion(item, date) {
            logContext = {item, date};
            document.getElementById("qTitle").innerText = item.title;
            document.getElementById("qDesc").innerHTML = item.description ? \`<div class="desc" style="border-left-color:\${item.color};margin-bottom:12px;">\${escape(item.description)}</div>\` : "";
            document.getElementById("qLabel").innerText = item.question;
            
            const wrapper = document.getElementById("qInput");
            const step = item.type === "float" ? "0.01" : "1";
            wrapper.innerHTML = \`<input type="number" step="\${step}" class="form-control" id="logValue" placeholder="Enter numerical value">\`;
            
            document.getElementById("logListView").style.display = "none";
            document.getElementById("logQuestionView").style.display = "block";
        }
        
        async function saveLog(item, date, val) {
            showLoader();
            try {
                const payload = { itemId: item.id, dateStr: date, value: val };
                await fetch(API + "grow/log", {
                    method:"POST", 
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(payload)
                });
                await fetchData();
                showToast("Progress logged!", "success");
                
                const active = data.items.filter(g => isActive(g, date));
                const dayData = data.progress[date] || {};
                const allDone = active.length && active.every(g => dayData[g.id] !== undefined);
                
                if(allDone) {
                    document.getElementById("logModal").classList.remove("show");
                    showBubble(document.querySelector(\`.day[data-date="\${date}"]\`), date);
                } else {
                    openLogModal(date); 
                }
            } catch (err) {
                showToast("Error!", "error");
            }
            hideLoader();
        }
        
        document.getElementById("saveLogBtn").addEventListener("click", async function() {
            const input = document.getElementById("logValue");
            if(!input || !input.value) {
                showToast("Please enter a valid value.", "error");
                return;
            }
            const {item, date} = logContext;
            const val = item.type === "float" ? parseFloat(input.value) : parseInt(input.value);
            await saveLog(item, date, val);
        });
        
        window.showLogList = function() { document.getElementById("logListView").style.display = "block"; document.getElementById("logQuestionView").style.display = "none"; }
        window.closeModal = function(id) { document.getElementById(id).classList.remove("show"); };
        window.addEventListener("click", function(e) { if(e.target.classList.contains("modal")) e.target.classList.remove("show"); });
    </script>
</body>
</html>`;

fs.writeFileSync(path.join(viewsDir, 'index.ejs'), growEJS);

// ==========================================
// 📱 API ROUTES
// ==========================================
app.get('/', async (req, res) => {
    const ist = new Date(new Date().getTime() + 5.5*3600000);
    res.render('index', {
        currentDate: String(ist.getUTCDate()).padStart(2,'0')+'-'+String(ist.getUTCMonth()+1).padStart(2,'0')+'-'+ist.getUTCFullYear(),
        currentTime: String(ist.getUTCHours()).padStart(2,'0')+':'+String(ist.getUTCMinutes()).padStart(2,'0'),
        currentMonth: ["January","February","March","April","May","June","July","August","September","October","November","December"][ist.getUTCMonth()] + ' ' + ist.getUTCFullYear()
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
            const { type, _id, ...rest } = data;
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
            hasData: hasData === true,
            type: hasData ? type : 'boolean'
        };
        
        if (item.hasData) {
            item.question = question || '';
            if (start !== undefined && start !== '') item.start = type === 'float' ? parseFloat(start) : parseInt(start);
            if (end !== undefined && end !== '') item.end = type === 'float' ? parseFloat(end) : parseInt(end);
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
        const tracker = await db.collection('grow').findOne({ type: 'tracker' });
        if (!tracker) return res.status(404).json({ error: 'Tracker context not found' });
        
        const currentItem = tracker.items.find(i => i.id === id);
        
        if (currentItem && currentItem.color !== color) {
            const conflictingItem = tracker.items.find(i => i.id !== id && i.color === color);
            if (conflictingItem) {
                await db.collection('grow').updateOne(
                    { type: 'tracker', 'items.id': conflictingItem.id },
                    { $set: { 'items.$.color': currentItem.color } }
                );
            }
        }
        
        const updatedItem = {
            id: id,
            title: title,
            description: description || '',
            startDate: startDate,
            endCount: parseInt(endCount),
            color: color,
            hasData: hasData === true,
            type: hasData ? type : 'boolean'
        };
        
        if (updatedItem.hasData) {
            updatedItem.question = question || '';
            if (start !== undefined && start !== '') updatedItem.start = type === 'float' ? parseFloat(start) : parseInt(start);
            if (end !== undefined && end !== '') updatedItem.end = type === 'float' ? parseFloat(end) : parseInt(end);
        }
        
        await db.collection('grow').updateOne(
            { type: 'tracker', 'items.id': id },
            { $set: { 'items.$': updatedItem } }
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
        const tracker = await db.collection('grow').findOne({ type: 'tracker' });
        const item = tracker?.items.find(i => i.id === itemId);
        
        await db.collection('grow').updateOne(
            { type: 'tracker' },
            { $set: { [`progress.${dateStr}.${itemId}`]: value } }
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
