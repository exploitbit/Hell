const { Telegraf, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const schedule = require('node-schedule');
const express = require('express');
const path = require('path');
const fs = require('fs');

// ==========================================
// ⚙️ CONFIGURATION - DIRECT HARDCODED VALUES
// ==========================================
const BOT_TOKEN = '8388773187:AAEWqg9L-JhIsIYtpbxJ0wxqdT2ImWmFni4';
const MONGODB_URI = 'mongodb+srv://sandip:9E9AISFqTfU3VI5i@cluster0.p8irtov.mongodb.net/telegram_bot';
const PORT = process.env.PORT || 8080;
const WEB_APP_URL = 'https://web-production-820965.up.railway.app';
const CHAT_ID = 8469993808;

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
// 🎨 MONOLITHIC EJS TEMPLATE GENERATOR
// ==========================================
function writeMainEJS() {
    const mainEJS = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes, viewport-fit=cover">
    <title>Global Task Manager</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        /* === SYSTEM-LEVEL THEME VARIABLES === */
        :root {
            --bg-color: #f5f7fa;
            --surface-color: #ffffff;
            --text-primary: #1e293b;
            --text-secondary: #475569;
            --border-color: #e2e8f0;
            --accent-color: #2563eb;
            --success-color: #059669;
            --danger-color: #dc2626;
            --hover-color: #f1f5f9;
            --shadow-soft: 0 4px 20px -5px rgba(0,0,0,0.08);
            --modal-backdrop: rgba(15, 23, 42, 0.5);
            --ring-today: #3b82f6;
        }

        /* Native Dark Mode Support */
        @media (prefers-color-scheme: dark) {
            :root {
                --bg-color: #0f172a;
                --surface-color: #1e293b;
                --text-primary: #f8fafc;
                --text-secondary: #cbd5e1;
                --border-color: #334155;
                --accent-color: #60a5fa;
                --success-color: #34d399;
                --danger-color: #f87171;
                --hover-color: #2d3b4f;
                --shadow-soft: 0 4px 20px -5px rgba(0,0,0,0.5);
                --modal-backdrop: rgba(0, 0, 0, 0.8);
                --ring-today: #60a5fa;
            }
        }

        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
        
        body { 
            background: var(--bg-color); color: var(--text-primary); 
            padding: 20px 10px 120px 10px; min-height: 100vh;
            font-size: 12px; line-height: 1.4;
            -webkit-tap-highlight-color: transparent;
        }

        /* Top Nav */
        .app-header { background: var(--surface-color); border-bottom: 1px solid var(--border-color); padding: 10px 16px; position: sticky; top: 0; z-index: 100; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border-radius: 16px; margin-bottom: 15px;}
        .nav-container { max-width: 1400px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
        .nav-links { display: flex; gap: 4px; background: var(--hover-color); padding: 3px; border-radius: 100px; width: 100%;}
        .nav-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 12px; border-radius: 100px; border: none; background: transparent; color: var(--text-secondary); font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: 0.2s; }
        .nav-btn.active { background: var(--surface-color); color: var(--accent-color); box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
        .time-badge { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 6px 12px; background: var(--hover-color); border-radius: 100px; font-size: 0.75rem; font-weight: 600; color: var(--accent-color); width: 100%; margin-top: 5px;}
        
        .main-content { max-width: 1400px; margin: 0 auto; padding-bottom: 80px; }
        
        /* Shared Panels */
        .panel-wrapper { max-width: 100%; margin: 0 auto 15px auto; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 16px; box-shadow: var(--shadow-soft); overflow: hidden; }
        .panel-summary { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; font-size: 1.1rem; font-weight: 700; color: var(--text-primary); cursor: pointer; list-style: none; user-select: none; background: var(--surface-color); border-bottom: 1px solid transparent; }
        .panel-summary::-webkit-details-marker { display: none; }
        .panel-summary i.chevron { transition: transform 0.3s; color: var(--text-secondary); }
        details[open] .panel-summary i.chevron { transform: rotate(180deg); }
        details[open] .panel-summary { border-bottom: 1px solid var(--border-color); }
        .panel-body { padding: 18px; }

        /* Graphs 1:1 */
        .graphs-grid-container { width: 100%; aspect-ratio: 1 / 1; display: flex; flex-direction: column; }
        .chart-wrapper { display: flex; justify-content: space-around; align-items: flex-end; flex: 1; padding-top: 10px; }
        .bar-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; width: 10%; max-width: 35px; height: 100%; position: relative;}
        .bar-track { width: 100%; height: 90%; border-radius: 6px; position: relative; display: flex; align-items: flex-end; }
        .bar-fill { width: 100%; border-radius: 6px; transition: height 0.8s; position: relative; }
        .bar-label-inner { position: absolute; top: 0; left: 0; right: 0; bottom: 0; writing-mode: vertical-rl; transform: rotate(180deg); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 0.75rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-shadow: 0px 1px 3px rgba(0,0,0,0.8); pointer-events: none; z-index: 10; padding: 5px 0; }
        .bar-percent { font-size: 0.7rem; font-weight: 800; color: var(--text-primary); margin-bottom: 5px; }

        /* Calendar */
        .month-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; }
        .month-nav h1 { font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin: 0; text-transform: uppercase; letter-spacing: 1px; background: var(--hover-color); padding: 6px 16px; border-radius: 50px; border: 1px solid var(--border-color); }
        .nav-btn-cal { background: var(--bg-color); border: 1px solid var(--border-color); width: 30px; height: 30px; border-radius: 50%; cursor: pointer; font-size: 0.8rem; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; }
        .grid-container { width: 100%; aspect-ratio: 1 / 1; display: flex; flex-direction: column; position: relative; }
        .calendar-grid { flex: 1; display: grid; grid-template-columns: repeat(7, 1fr); grid-template-rows: auto repeat(6, 1fr); gap: 6px; }
        .weekday { display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.65rem; color: var(--text-secondary); text-transform: uppercase; }
        .day-cell { display: flex; align-items: center; justify-content: center; border-radius: 12px; position: relative; }
        .day-cell.empty { pointer-events: none; }
        .day-cell:hover:not(.empty) { background: var(--hover-color); cursor: pointer; }
        .day-circle { width: 100%; max-width: 40px; aspect-ratio: 1; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.95rem; color: var(--text-primary); transition: transform 0.2s; position: relative; }
        .day-cell:hover:not(.empty) .day-circle { transform: scale(1.1); }
        .day-circle.has-data { color: #ffffff; box-shadow: 0 2px 5px rgba(0,0,0,0.1); text-shadow: 0px 1px 3px rgba(0,0,0,0.7); }
        .day-circle.today { box-shadow: 0 0 0 2px var(--surface-color), 0 0 0 4px var(--ring-today); color: var(--ring-today); font-weight: 800; }
        .day-circle.today.has-data { color: #ffffff; }

        /* Dynamic 360 Speech Bubble */
        .speech-bubble { position: absolute; background: var(--surface-color); backdrop-filter: blur(10px); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; z-index: 1000; min-width: 160px; max-width: 220px; pointer-events: none; box-shadow: 0 15px 30px rgba(0,0,0,0.2); display: none; opacity: 0; transition: opacity 0.2s; }
        .speech-bubble.show { opacity: 1; }
        .speech-tail { position: absolute; width: 12px; height: 12px; background: var(--surface-color); border-right: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); z-index: -1; }
        .speech-date { font-size: 0.7rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; text-transform: uppercase; text-align:center;}
        .speech-item { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 0.8rem; font-weight: 600; }

        /* Progress/Tasks Lists */
        .tasks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; margin-top: 10px; }
        .task-card, .note-card, .history-date-card { background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 14px; padding: 14px; transition: 0.2s; width: 100%; box-shadow: var(--shadow-soft); margin-bottom: 10px;}
        .task-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; width: 100%; flex-wrap: wrap; }
        
        details.task-details { display: contents; }
        details.task-details summary { font-weight: 700; font-size: 0.95rem; cursor: pointer; color: var(--text-primary); outline: none; list-style: none; display: flex; align-items: center; gap: 8px; flex: 1; order: 1; }
        details.task-details summary i { font-size: 0.7rem; color: var(--text-secondary); transition: transform 0.2s; }
        details.task-details[open] summary i { transform: rotate(90deg); }
        
        .task-actions { display: flex; gap: 6px; flex-shrink: 0; margin-left: 10px; order: 2; }
        .action-btn { width: 30px; height: 30px; border-radius: 8px; border: none; background: var(--hover-color); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; }
        .action-btn:hover { background: var(--accent-color); color: white; }
        .action-btn.delete:hover { background: var(--danger-color); color: white; }

        .task-description-container { width: 100%; order: 3; margin: 10px 0 4px 0; }
        details.task-details:not([open]) .task-description-container { display: none; }
        .task-description { font-size: 0.85rem; color: var(--text-secondary); padding: 8px 12px; background: var(--hover-color); border-radius: 10px; border-left: 3px solid; word-break: break-word; white-space: pre-wrap; width: 100%; box-sizing: border-box; line-height: 1.4; }

        .task-meta-row { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; width: 100%; }
        .badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--hover-color); border-radius: 100px; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); }
        .color-dot { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--border-color); flex-shrink: 0; }
        
        .progress-ring-small { position: relative; width: 40px; height: 40px; }
        .progress-ring-circle-small { transition: stroke-dashoffset 0.5s; transform: rotate(-90deg); transform-origin: 50% 50%; }
        .progress-text-small { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 0.7rem; font-weight: 700; color: var(--accent-color); }
        
        .subtasks-container { margin-top: 12px; border-top: 1px solid var(--border-color); padding-top: 12px; width: 100%; }
        .subtask-item { display: flex; flex-direction: column; background: var(--hover-color); border-radius: 10px; margin-bottom: 8px; padding: 8px; width: 100%; }
        .subtask-main-row { display: flex; align-items: flex-start; gap: 8px; width: 100%; }
        .subtask-checkbox { width: 20px; height: 20px; border-radius: 6px; border: 2px solid var(--accent-color); background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; color: white; font-size: 0.7rem; flex-shrink: 0; margin-top: 1px; }
        .subtask-checkbox.completed { background: var(--success-color); border-color: var(--success-color); }
        .subtask-details { flex: 1; min-width: 0; }
        .subtask-title { font-weight: 600; color: var(--text-primary); margin-bottom: 2px; font-size: 0.85rem; word-break: break-word; cursor: pointer; }
        .subtask-title.completed { text-decoration: line-through; color: var(--text-secondary); }

        /* Notes & History */
        .note-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; width: 100%; }
        .note-title { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); word-break: break-word; flex: 1; cursor: pointer; }
        .note-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); font-size: 0.7rem; color: var(--text-secondary); }
        
        .history-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
        .month-selector { display: flex; align-items: center; gap: 12px; }
        .month-btn { padding: 6px 12px; border-radius: 100px; border: 1px solid var(--border-color); background: var(--surface-color); color: var(--text-primary); font-size: 0.8rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; }
        
        /* Modals & Forms */
        .fab { position: fixed; bottom: 20px; right: 20px; z-index: 1000; width: 54px; height: 54px; border-radius: 50%; background: var(--accent-color); color: white; border: none; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; cursor: pointer; box-shadow: 0 8px 20px rgba(37,99,235,0.4); transition: 0.2s; }
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-backdrop); backdrop-filter: blur(4px); align-items: center; justify-content: center; z-index: 2000; padding: 15px; opacity: 0; transition: opacity 0.3s ease;}
        .modal.show { opacity: 1; }
        .modal-content { background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 20px; padding: 20px; width: 100%; max-width: 400px; max-height: 85vh; overflow-y: auto; box-shadow: 0 25px 50px rgba(0,0,0,0.25); transform: scale(0.95); transition: 0.3s ease; }
        .modal.show .modal-content { transform: scale(1); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;}
        .modal-header h2 { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); }
        .close-btn { background: var(--hover-color); border: none; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; color: var(--text-secondary); transition: 0.2s; }
        .close-btn:hover { background: var(--danger-color); color: white; }

        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 0.8rem; color: var(--text-primary); }
        .form-control { width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 12px; font-size: 0.9rem; outline: none; background: var(--bg-color); color: var(--text-primary); }
        .form-control:focus { border-color: var(--accent-color); }
        textarea.form-control { min-height: 80px; resize: vertical; }
        
        .color-palette { display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: 8px; gap: 4px; }
        .color-swatch { width: 26px; height: 26px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: 0.1s;}
        .color-swatch.selected { transform: scale(1.15); box-shadow: 0 0 0 2px var(--surface-color), 0 0 0 4px var(--text-primary); }
        .color-swatch.hidden { display: none; }
        
        .checkbox-group { display: flex; align-items: center; gap: 8px; margin: 15px 0; font-weight: 600; font-size: 0.85rem; cursor: pointer; color: var(--text-primary); }
        .checkbox-group input { width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-color); }
        .hidden-fields { display: none; background: var(--hover-color); padding: 15px; border-radius: 12px; margin-bottom: 15px; }
        
        .btn { padding: 12px 20px; border-radius: 100px; border: none; font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: 0.2s; }
        .btn-secondary { background: var(--hover-color); color: var(--text-secondary); }
        .btn-submit { width: 100%; padding: 14px; background: var(--accent-color); color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 0.95rem; cursor: pointer; margin-top: 10px; transition: 0.2s; }
        .btn-submit:hover { background: #1d4ed8; }

        .toast-container { position: fixed; top: 20px; right: 20px; z-index: 9999; }
        .toast { background: var(--text-primary); color: var(--bg-color); padding: 10px 20px; border-radius: 100px; margin-bottom: 10px; display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 0.85rem; font-weight: 600; animation: slideIn 0.3s ease; }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .loader { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); display: none; align-items: center; justify-content: center; z-index: 9998; }
        .spinner { width: 48px; height: 48px; border: 4px solid var(--border-color); border-top: 4px solid var(--accent-color); border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .empty-state { text-align: center; padding: 40px 20px; color: var(--text-secondary); background: var(--hover-color); border-radius: 24px; grid-column: 1/-1;}
        .hidden { display: none; }
        
        @media (max-width: 768px) { 
            .nav-container { flex-direction: column; align-items: stretch; } 
            .nav-links { width: 100%; justify-content: stretch; } 
            .nav-btn { flex: 1; justify-content: center; padding: 8px 12px; } 
            .time-badge { justify-content: center; } 
            .tasks-grid, .history-tasks-grid { grid-template-columns: 1fr; } 
        }
    </style>
</head>
<body>
    <div class="loader" id="loader"><div class="spinner"></div></div>
    <div class="toast-container" id="toastContainer"></div>

    <div class="app-header">
        <div class="nav-container">
            <div class="nav-links">
                <button class="nav-btn" id="nav-tasks" onclick="switchPage('tasks')">
                    <i class="fas fa-tasks"></i> <span>Tasks</span>
                </button>
                <button class="nav-btn active" id="nav-progress" onclick="switchPage('progress')">
                    <i class="fas fa-chart-line"></i> <span>Progress</span>
                </button>
                <button class="nav-btn" id="nav-notes" onclick="switchPage('notes')">
                    <i class="fas fa-note-sticky"></i> <span>Notes</span>
                </button>
                <button class="nav-btn" id="nav-history" onclick="switchPage('history')">
                    <i class="fas fa-history"></i> <span>History</span>
                </button>
            </div>
            <div class="time-badge">
                <i class="fas fa-calendar-alt"></i> <span id="currentDateDisplay"></span>
                <span style="margin-left: 4px;"><i class="fas fa-clock"></i> <span id="currentTimeDisplay"></span></span>
            </div>
        </div>
    </div>

    <button class="fab" id="fabButton" onclick="openAddModal()" title="Add New"><i class="fas fa-plus"></i></button>
    
    <div class="main-content" id="mainContent"></div>

    <div class="speech-bubble" id="speech-bubble">
        <div id="speech-content"></div>
        <div class="speech-tail" id="speech-tail"></div>
    </div>

    <div class="modal" id="add-progress-modal">
        <div class="modal-content">
            <div class="modal-header"><h2>Add New Progress</h2><button class="close-btn" onclick="closeModal('add-progress-modal')"><i class="fas fa-times"></i></button></div>
            <form id="add-progress-form">
                <div class="form-group"><label>Title</label><input type="text" class="form-control" id="p-title" required></div>
                <div class="form-group"><label>Description</label><textarea class="form-control" id="p-desc" rows="2"></textarea></div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="form-group"><label>Start Date</label><input type="date" class="form-control" id="p-start-date" required></div>
                    <div class="form-group"><label>Duration (Days)</label><input type="number" class="form-control" id="p-end-count" value="365" required min="1"></div>
                </div>
                <div class="form-group">
                    <label>Color</label><div class="color-palette" id="color-palette"></div>
                    <input type="hidden" id="p-color" required><small id="color-error" style="color:var(--danger-color); display:none; font-weight:600; margin-top:5px;">All 8 colors are used!</small>
                </div>
                <label class="checkbox-group"><input type="checkbox" id="p-has-data" onchange="toggleDataFields('add')">Require numerical logging?</label>
                <div class="hidden-fields" id="data-fields">
                    <div class="form-group"><label>Question</label><input type="text" class="form-control" id="p-question"></div>
                    <div class="form-group"><label>Type</label><select class="form-control" id="p-type" onchange="toggleStartDataFields('add')"><option value="boolean">Boolean</option><option value="float">Float</option><option value="integer">Integer</option></select></div>
                    <div id="start-goal-wrapper" style="display: none; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div class="form-group"><label>Start Data</label><input type="number" step="0.01" class="form-control" id="p-start-data"></div>
                        <div class="form-group"><label>End Data</label><input type="number" step="0.01" class="form-control" id="p-goal-data"></div>
                    </div>
                </div>
                <button type="submit" class="btn-submit" id="create-btn">Save Progress</button>
            </form>
        </div>
    </div>

    <div class="modal" id="edit-progress-modal">
        <div class="modal-content">
            <div class="modal-header"><h2>Edit Progress</h2><button class="close-btn" onclick="closeModal('edit-progress-modal')"><i class="fas fa-times"></i></button></div>
            <form id="edit-progress-form">
                <input type="hidden" id="edit-p-id">
                <div class="form-group"><label>Title</label><input type="text" class="form-control" id="edit-p-title" required></div>
                <div class="form-group"><label>Description</label><textarea class="form-control" id="edit-p-desc" rows="2"></textarea></div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="form-group"><label>Start Date</label><input type="date" class="form-control" id="edit-p-start-date" required></div>
                    <div class="form-group"><label>Duration</label><input type="number" class="form-control" id="edit-p-end-count" required></div>
                </div>
                <div class="form-group"><label>Color (Swaps if occupied)</label><div class="color-palette" id="edit-color-palette"></div><input type="hidden" id="edit-p-color" required></div>
                <label class="checkbox-group"><input type="checkbox" id="edit-p-has-data" onchange="toggleDataFields('edit')">Require numerical logging?</label>
                <div class="hidden-fields" id="edit-data-fields">
                    <div class="form-group"><label>Question</label><input type="text" class="form-control" id="edit-p-question"></div>
                    <div class="form-group"><label>Type</label><select class="form-control" id="edit-p-type" onchange="toggleStartDataFields('edit')"><option value="boolean">Boolean</option><option value="float">Float</option><option value="integer">Integer</option></select></div>
                    <div id="edit-start-goal-wrapper" style="display: none; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div class="form-group"><label>Start Data</label><input type="number" step="0.01" class="form-control" id="edit-p-start-data"></div>
                        <div class="form-group"><label>End Data</label><input type="number" step="0.01" class="form-control" id="edit-p-goal-data"></div>
                    </div>
                </div>
                <button type="submit" class="btn-submit">Update Progress</button>
            </form>
        </div>
    </div>

    <div class="modal" id="log-modal">
        <div class="modal-content">
            <div id="log-list-view">
                <div class="modal-header"><h2 id="log-modal-title">Log Progress</h2><button class="close-btn" onclick="closeModal('log-modal')"><i class="fas fa-times"></i></button></div>
                <div id="daily-progress-list"></div>
            </div>
            <div id="log-question-view" style="display: none;">
                <div class="modal-header"><h2 id="l-title"></h2><button class="close-btn" onclick="showLogList()"><i class="fas fa-arrow-left"></i></button></div>
                <div id="l-desc-container"></div>
                <div class="form-group"><label id="l-question"></label><div id="l-input-wrapper"></div></div>
                <button class="btn-submit" id="save-log-btn">Save</button>
            </div>
        </div>
    </div>

    <div class="modal" id="addTaskModal"><div class="modal-content"><div class="modal-header"><h2>Create Task</h2><button class="close-btn" onclick="closeModal('addTaskModal')">&times;</button></div><form id="addTaskForm" onsubmit="submitTaskForm(event)"><input type="text" class="form-control" name="title" required placeholder="Title" style="margin-bottom:10px;"><textarea class="form-control" name="description" placeholder="Description" style="margin-bottom:10px;"></textarea><input type="date" class="form-control" name="startDate" id="startDate" required style="margin-bottom:10px;"><input type="time" class="form-control" name="startTime" id="startTime" required style="margin-bottom:10px;"><input type="time" class="form-control" name="endTime" id="endTime" required style="margin-bottom:10px;"><button class="btn-submit">Create Task</button></form></div></div>
    <div class="modal" id="addNoteModal"><div class="modal-content"><div class="modal-header"><h2>Create Note</h2><button class="close-btn" onclick="closeModal('addNoteModal')">&times;</button></div><form id="addNoteForm" onsubmit="submitNoteForm(event)"><input type="text" class="form-control" name="title" required placeholder="Title" style="margin-bottom:10px;"><textarea class="form-control" name="description" placeholder="Content" style="margin-bottom:10px; height:150px;"></textarea><button class="btn-submit">Save Note</button></form></div></div>

    <script>
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();

        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast';
            let icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
            toast.innerHTML = '<i class="fas ' + icon + '"></i><span>' + message + '</span>';
            container.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; setTimeout(() => toast.remove(), 300); }, 3000);
        }

        function showLoader() { document.getElementById('loader').style.display = 'flex'; }
        function hideLoader() { document.getElementById('loader').style.display = 'none'; }

        let currentPage = 'progress';
        let tasksData = []; let notesData = []; let historyData = {}; 
        let progressData = { items: [], progress: {} };
        
        let currentMonth = new Date().getMonth();
        let currentYear = new Date().getFullYear();
        let todayStr = '';
        let loggingContext = null;

        const paletteColors = ['#ec4899', '#a855f7', '#38bdf8', '#ef4444', '#f97316', '#16a34a', '#84cc16', '#3b82f6'];

        function calculateISTDate() {
            const now = new Date();
            const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
            todayStr = istDate.toISOString().split('T')[0];
            currentMonth = istDate.getMonth();
            currentYear = istDate.getFullYear();
        }
        
        setInterval(() => {
            const istNow = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
            document.getElementById('currentTimeDisplay').innerHTML = String(istNow.getUTCHours()).padStart(2, '0') + ':' + String(istNow.getUTCMinutes()).padStart(2, '0');
            document.getElementById('currentDateDisplay').innerHTML = String(istNow.getUTCDate()).padStart(2, '0') + '-' + String(istNow.getUTCMonth() + 1).padStart(2, '0') + '-' + istNow.getUTCFullYear();
        }, 1000);

        document.addEventListener('DOMContentLoaded', () => {
            calculateISTDate();
            switchPage('progress');
        });

        function switchPage(page) {
            showLoader();
            currentPage = page;
            document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById('nav-' + page).classList.add('active');
            
            fetch('/api/page/' + page).then(res => res.json()).then(data => {
                if (page === 'tasks') tasksData = data.tasks || [];
                if (page === 'notes') notesData = data.notes || [];
                if (page === 'history') historyData = data.groupedHistory || {};
                if (page === 'progress') progressData = data.progress || { items: [], progress: {} };
                renderPage();
                hideLoader();
            }).catch(err => { showToast('Error loading page data'); hideLoader(); });
        }

        function renderPage() {
            const content = document.getElementById('mainContent');
            document.getElementById('fabButton').style.display = currentPage === 'history' ? 'none' : 'flex';
            
            if (currentPage === 'progress') {
                content.innerHTML = renderProgressGraphs() + renderProgressCalendar() + renderProgressList();
                bindCalendarEvents();
            } else if (currentPage === 'tasks') {
                let html = '<h1 class="page-title">Tasks</h1><div class="tasks-grid">';
                if(tasksData.length===0) html += '<div class="empty-state">No Tasks</div>';
                tasksData.forEach(t => { html += '<div class="task-card"><div class="task-header"><span class="task-title">' + escapeHtml(t.title) + '</span><div class="task-actions"><button class="action-btn" onclick="completeTask(\\'' + t.taskId + '\\')"><i class="fas fa-check"></i></button><button class="action-btn delete" onclick="deleteTask(\\'' + t.taskId + '\\')"><i class="fas fa-trash"></i></button></div></div></div>'; });
                content.innerHTML = html + '</div>';
            } else if (currentPage === 'notes') {
                let html = '<h1 class="page-title">Notes</h1><div class="tasks-grid">';
                if(notesData.length===0) html += '<div class="empty-state">No Notes</div>';
                notesData.forEach(n => { html += '<div class="note-card"><div class="note-header"><span class="note-title">' + escapeHtml(n.title) + '</span><button class="action-btn delete" onclick="deleteNote(\\'' + n.noteId + '\\')"><i class="fas fa-trash"></i></button></div><div class="note-content-container"><div class="note-content">' + preserveLineBreaks(n.description) + '</div></div></div>'; });
                content.innerHTML = html + '</div>';
            } else if (currentPage === 'history') {
                content.innerHTML = '<div class="empty-state">History loaded. Switch to tasks to view complete history.</div>';
            }
        }

        function escapeHtml(text) { return text ? text.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : ''; }
        function preserveLineBreaks(text) { return escapeHtml(text).replace(/\\n/g, '<br>'); }

        // ================= PROGRESS RENDERERS =================
        function renderProgressGraphs() {
            if (!progressData.items || progressData.items.length === 0) return '<details class="panel-wrapper" open><summary class="panel-summary"><span>Progress Overview</span><i class="fas fa-chevron-down chevron"></i></summary><div class="panel-body"><div class="empty-state">No progress added yet.</div></div></details>';

            let barsHtml = '<div class="graphs-grid-container"><div class="chart-wrapper">';
            progressData.items.forEach(item => {
                const start = new Date(item.startDate + "T00:00:00");
                const todayObj = new Date(todayStr + "T00:00:00");
                let totalDaysSoFar = Math.floor((todayObj - start) / (1000 * 60 * 60 * 24)) + 1;
                if (totalDaysSoFar < 1) totalDaysSoFar = 0;
                if (totalDaysSoFar > item.endCount) totalDaysSoFar = item.endCount;

                let completedCount = 0;
                Object.keys(progressData.progress || {}).forEach(dateStr => {
                    const dObj = new Date(dateStr + "T00:00:00");
                    if (dObj >= start && dObj <= todayObj && progressData.progress[dateStr][item.id] !== undefined) completedCount++;
                });

                let percentage = totalDaysSoFar > 0 ? Math.min((completedCount / totalDaysSoFar) * 100, 100) : 0;
                const lightColor = item.color + '40';

                barsHtml += '<div class="bar-col"><div class="bar-percent">' + Math.round(percentage) + '%</div><div class="bar-track" style="background-color: ' + lightColor + ';"><div class="bar-fill" style="height: ' + percentage + '%; background-color: ' + item.color + ';"><div class="bar-label-inner">' + escapeHtml(item.title) + '</div></div></div></div>';
            });
            return '<details class="panel-wrapper" open><summary class="panel-summary"><span>Progress Overview</span><i class="fas fa-chevron-down chevron"></i></summary><div class="panel-body">' + barsHtml + '</div></div></details>';
        }

        function changeMonth(dir) {
            currentMonth += dir;
            if (currentMonth > 11) { currentMonth = 0; currentYear++; }
            else if (currentMonth < 0) { currentMonth = 11; currentYear--; }
            renderPage();
        }

        function renderProgressCalendar() {
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            const firstDay = new Date(currentYear, currentMonth, 1).getDay();
            const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
            
            let html = '';
            ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(d => { html += '<div class="weekday">' + d + '</div>'; });
            for (let i = 0; i < firstDay; i++) html += '<div class="day-cell empty"></div>';
            
            for (let i = 1; i <= daysInMonth; i++) {
                const dateStr = currentYear + '-' + String(currentMonth + 1).padStart(2, '0') + '-' + String(i).padStart(2, '0');
                const isToday = dateStr === todayStr;
                const dayData = (progressData.progress && progressData.progress[dateStr]) || {};
                
                const completedColors = [];
                (progressData.items || []).forEach(g => {
                    if (isItemActive(g, dateStr) && dayData[g.id] !== undefined) completedColors.push(g.color);
                });

                let bgStyle = 'transparent'; let dataClass = '';
                if (completedColors.length === 1) { bgStyle = completedColors[0]; dataClass = 'has-data'; } 
                else if (completedColors.length > 1) {
                    const step = 100 / completedColors.length;
                    const stops = completedColors.map((col, idx) => col + ' ' + (idx * step) + '% ' + ((idx + 1) * step) + '%');
                    bgStyle = 'conic-gradient(' + stops.join(', ') + ')';
                    dataClass = 'has-data';
                }

                html += '<div class="day-cell" data-date="' + dateStr + '"><div class="day-circle ' + (isToday ? 'today ' : '') + dataClass + '" style="background: ' + bgStyle + '">' + i + '</div></div>';
            }

            return '<details class="panel-wrapper" open><summary class="panel-summary"><span>Progress Calendar</span><i class="fas fa-chevron-down chevron"></i></summary><div class="panel-body"><div class="month-nav"><button class="nav-btn-cal" onclick="changeMonth(-1)"><i class="fas fa-chevron-left"></i></button><h1>' + monthNames[currentMonth] + ' ' + currentYear + '</h1><button class="nav-btn-cal" onclick="changeMonth(1)"><i class="fas fa-chevron-right"></i></button></div><div class="grid-container" id="calendar-master-container"><div class="calendar-grid" id="calendar-grid">' + html + '</div></div></div></details>';
        }

        function renderProgressList() {
            if (!progressData.items || progressData.items.length === 0) return '';
            let html = '<details class="panel-wrapper" open><summary class="panel-summary"><span>Manage Progress</span><i class="fas fa-chevron-down chevron"></i></summary><div class="panel-body">';
            const todayObj = new Date(todayStr + "T00:00:00");

            progressData.items.forEach(item => {
                const startObj = new Date(item.startDate + "T00:00:00");
                let daysPassed = Math.floor((todayObj - startObj) / (1000 * 60 * 60 * 24));
                let daysLeft = item.endCount - daysPassed;
                if(daysPassed < 0) daysLeft = item.endCount; 
                if(daysLeft < 0) daysLeft = 0;

                html += '<div class="task-card"><div class="task-header"><details class="task-details"><summary><i class="fas fa-chevron-right chevron-icon"></i><span class="progress-title">' + escapeHtml(item.title) + '</span></summary>' + (item.description ? '<div class="task-description-container"><div class="task-description" style="border-left-color: ' + item.color + ';">' + preserveLineBreaks(item.description) + '</div></div>' : '') + '</details><div class="task-actions"><button class="action-btn" onclick="openEditProgressModal(\\'' + item.id + '\\')"><i class="fas fa-pencil-alt"></i></button><button class="action-btn delete" onclick="deleteProgress(\\'' + item.id + '\\')"><i class="fas fa-trash"></i></button></div></div><div class="task-meta-row"><span class="badge"><i class="fas fa-calendar-alt"></i> ' + item.startDate + '</span><span class="badge"><i class="fas fa-hourglass-half"></i> ' + daysLeft + ' left</span><div class="color-dot" style="background:' + item.color + ';"></div></div></div>';
            });
            return html + '</div></details>';
        }

        function isItemActive(item, dateStr) {
            const start = new Date(item.startDate + "T00:00:00");
            const target = new Date(dateStr + "T00:00:00");
            const diffDays = Math.floor((target - start) / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays < item.endCount;
        }

        // ================= PROGRESS INTERACTIONS =================
        function bindCalendarEvents() {
            document.getElementById('calendar-grid')?.addEventListener('click', (e) => {
                const cell = e.target.closest('.day-cell');
                if(cell && !cell.classList.contains('empty')) {
                    const dateStr = cell.dataset.date;
                    const activeItems = progressData.items.filter(g => isItemActive(g, dateStr));
                    const dayData = progressData.progress[dateStr] || {};
                    const isAllCompleted = activeItems.length > 0 && activeItems.every(g => dayData[g.id] !== undefined);
                    
                    if(dateStr === todayStr && !isAllCompleted) openLogModal(dateStr);
                    else showBubble(cell, dateStr);
                }
            });
        }

        function showBubble(cellEl, dateStr) {
            const bubble = document.getElementById('speech-bubble');
            const content = document.getElementById('speech-content');
            const tail = document.getElementById('speech-tail');
            
            const activeItems = progressData.items.filter(g => isItemActive(g, dateStr));
            const dayData = progressData.progress[dateStr] || {};
            
            const dObj = new Date(dateStr + "T00:00:00");
            let html = '<div class="speech-date">' + dObj.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) + '</div>';
            
            if(activeItems.length === 0) html += '<div style="font-size:0.75rem; color:var(--text-secondary); text-align:center;">No progress active.</div>';
            else {
                activeItems.forEach(g => {
                    const isDone = dayData[g.id] !== undefined;
                    html += '<div class="speech-item" style="color:' + g.color + '"><span>' + escapeHtml(g.title) + '</span><i class="fas ' + (isDone ? 'fa-check-circle' : 'fa-circle') + '"></i></div>';
                });
            }

            content.innerHTML = html;
            bubble.style.display = 'block';

            // Absolute Positioning Math fixing Scroll issues
            const bRect = bubble.getBoundingClientRect();
            const gridRect = document.getElementById('calendar-master-container').getBoundingClientRect();
            const cellRect = cellEl.getBoundingClientRect();
            
            const sX = window.scrollX || document.documentElement.scrollLeft; 
            const sY = window.scrollY || document.documentElement.scrollTop;

            const gridAbsX = gridRect.left + sX;
            const gridAbsY = gridRect.top + sY;
            const cellAbsX = cellRect.left + sX;
            const cellAbsY = cellRect.top + sY;

            // Center bubble horizontally in grid layout
            const bubbleX = gridAbsX + (gridRect.width / 2) - (bRect.width / 2);
            const bubbleY = gridAbsY + (gridRect.height / 2) - (bRect.height / 2);

            bubble.style.left = bubbleX + 'px';
            bubble.style.top = bubbleY + 'px';

            // Point Tail exactly at the cell
            const bCenterX = bubbleX + bRect.width / 2;
            const bCenterY = bubbleY + bRect.height / 2;
            const cCenterX = cellAbsX + cellRect.width / 2;
            const cCenterY = cellAbsY + cellRect.height / 2;

            const diffX = cCenterX - bCenterX;
            const diffY = cCenterY - bCenterY;

            tail.style.top = ''; tail.style.bottom = ''; tail.style.left = ''; tail.style.right = '';

            if (Math.abs(diffX) > Math.abs(diffY)) {
                let yPos = (cCenterY - bubbleY) - 6; 
                tail.style.top = Math.max(12, Math.min(bRect.height - 24, yPos)) + 'px';
                if (diffX > 0) { tail.style.right = '-6px'; tail.style.transform = 'rotate(-45deg)'; } 
                else { tail.style.left = '-6px'; tail.style.transform = 'rotate(135deg)'; }
            } else {
                let xPos = (cCenterX - bubbleX) - 6; 
                tail.style.left = Math.max(12, Math.min(bRect.width - 24, xPos)) + 'px';
                if (diffY > 0) { tail.style.bottom = '-6px'; tail.style.transform = 'rotate(45deg)'; } 
                else { tail.style.top = '-6px'; tail.style.transform = 'rotate(225deg)'; }
            }
            
            setTimeout(() => bubble.classList.add('show'), 10);
        }

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.day-cell') && !e.target.closest('.speech-bubble')) {
                const bubble = document.getElementById('speech-bubble');
                if (bubble) bubble.classList.remove('show');
            }
        });

        // ================= PROGRESS MODALS =================
        function initColorPalette() {
            const container = document.getElementById('color-palette');
            const input = document.getElementById('p-color');
            if(!container) return;
            const used = progressData.items.map(g => g.color);
            let html = ''; let firstAvail = null;
            paletteColors.forEach(hex => {
                const isUsed = used.includes(hex);
                if(!isUsed && !firstAvail) firstAvail = hex;
                html += '<div class="color-swatch ' + (isUsed ? 'hidden' : '') + '" style="background-color: ' + hex + ';" data-color="' + hex + '"></div>';
            });
            container.innerHTML = html;
            if(firstAvail) {
                input.value = firstAvail;
                container.querySelector('[data-color="' + firstAvail + '"]').classList.add('selected');
                document.getElementById('color-error').style.display = 'none';
                document.getElementById('create-btn').disabled = false;
            } else {
                document.getElementById('color-error').style.display = 'block';
                document.getElementById('create-btn').disabled = true;
            }
            container.onclick = (e) => {
                if(e.target.classList.contains('color-swatch') && !e.target.classList.contains('hidden')) {
                    container.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('selected'));
                    e.target.classList.add('selected'); input.value = e.target.dataset.color;
                }
            };
        }

        function initEditColorPalette(currentColor) {
            const container = document.getElementById('edit-color-palette');
            const input = document.getElementById('edit-p-color');
            let html = ''; 
            paletteColors.forEach(hex => {
                html += '<div class="color-swatch ' + (hex === currentColor ? 'selected' : '') + '" style="background-color: ' + hex + ';" data-color="' + hex + '"></div>';
            });
            container.innerHTML = html;
            input.value = currentColor;
            container.onclick = (e) => {
                if(e.target.classList.contains('color-swatch')) {
                    container.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('selected'));
                    e.target.classList.add('selected'); input.value = e.target.dataset.color;
                }
            };
        }

        function openAddModal() {
            if (currentPage === 'tasks') {
                openAddTaskModal();
            } else if (currentPage === 'progress') {
                document.getElementById('p-start-date').value = todayStr;
                document.getElementById('p-type').value = 'boolean';
                toggleStartDataFields('add');
                initColorPalette(); 
                openModalObj('add-progress-modal');
            } else if (currentPage === 'notes') openModalObj('addNoteModal');
        }

        function openEditProgressModal(itemId) {
            const item = progressData.items.find(g => g.id === itemId);
            if(!item) return;
            document.getElementById('edit-p-id').value = item.id;
            document.getElementById('edit-p-title').value = item.title;
            document.getElementById('edit-p-desc').value = item.description || '';
            document.getElementById('edit-p-start-date').value = item.startDate;
            document.getElementById('edit-p-end-count').value = item.endCount;
            document.getElementById('edit-p-has-data').checked = item.hasData;
            toggleDataFields('edit');
            if(item.hasData) {
                document.getElementById('edit-p-question').value = item.question || '';
                document.getElementById('edit-p-type').value = item.type || 'boolean';
                toggleStartDataFields('edit');
                if(item.type !== 'boolean') {
                    document.getElementById('edit-p-start-data').value = item.start !== undefined ? item.start : '';
                    document.getElementById('edit-p-goal-data').value = item.end !== undefined ? item.end : '';
                }
            }
            initEditColorPalette(item.color);
            openModalObj('edit-progress-modal');
        }

        function toggleDataFields(mode) {
            const prefix = mode === 'add' ? 'p' : 'edit-p';
            const hasData = document.getElementById(prefix + '-has-data').checked;
            document.getElementById(mode === 'add' ? 'data-fields' : 'edit-data-fields').style.display = hasData ? 'block' : 'none';
            document.getElementById(prefix + '-question').required = hasData;
            toggleStartDataFields(mode);
        }

        function toggleStartDataFields(mode) {
            const prefix = mode === 'add' ? 'p' : 'edit-p';
            const type = document.getElementById(prefix + '-type').value;
            document.getElementById(mode === 'add' ? 'start-goal-wrapper' : 'edit-start-goal-wrapper').style.display = type === 'boolean' ? 'none' : 'grid';
        }

        document.getElementById('add-progress-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const hasData = document.getElementById('p-has-data').checked;
            const type = document.getElementById('p-type').value;
            const newItem = {
                id: 'p' + Date.now(),
                title: document.getElementById('p-title').value.trim(),
                description: document.getElementById('p-desc').value.trim(),
                startDate: document.getElementById('p-start-date').value,
                endCount: parseInt(document.getElementById('p-end-count').value),
                color: document.getElementById('p-color').value,
                hasData: hasData, type: hasData ? type : 'boolean'
            };
            if (hasData) {
                newItem.question = document.getElementById('p-question').value.trim();
                if (type !== 'boolean') {
                    newItem.start = type === 'float' ? parseFloat(document.getElementById('p-start-data').value) : parseInt(document.getElementById('p-start-data').value);
                    newItem.end = type === 'float' ? parseFloat(document.getElementById('p-goal-data').value) : parseInt(document.getElementById('p-goal-data').value);
                }
            }
            progressData.items.push(newItem);
            closeModal('add-progress-modal');
            document.getElementById('add-progress-form').reset();
            renderPage();
            fetch('/api/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newItem) });
        });

        document.getElementById('edit-progress-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const itemId = document.getElementById('edit-p-id').value;
            const itemIndex = progressData.items.findIndex(g => g.id === itemId);
            if(itemIndex === -1) return;
            const newColor = document.getElementById('edit-p-color').value;
            if (progressData.items[itemIndex].color !== newColor) {
                const conf = progressData.items.find(g => g.id !== itemId && g.color === newColor);
                if (conf) conf.color = progressData.items[itemIndex].color; 
            }
            const hasData = document.getElementById('edit-p-has-data').checked;
            const type = document.getElementById('edit-p-type').value;
            progressData.items[itemIndex].title = document.getElementById('edit-p-title').value.trim();
            progressData.items[itemIndex].description = document.getElementById('edit-p-desc').value.trim();
            progressData.items[itemIndex].startDate = document.getElementById('edit-p-start-date').value;
            progressData.items[itemIndex].endCount = parseInt(document.getElementById('edit-p-end-count').value);
            progressData.items[itemIndex].color = newColor;
            progressData.items[itemIndex].hasData = hasData;
            progressData.items[itemIndex].type = hasData ? type : 'boolean';
            if (hasData) {
                progressData.items[itemIndex].question = document.getElementById('edit-p-question').value.trim();
                if (type !== 'boolean') {
                    progressData.items[itemIndex].start = type === 'float' ? parseFloat(document.getElementById('edit-p-start-data').value) : parseInt(document.getElementById('edit-p-start-data').value);
                    progressData.items[itemIndex].end = type === 'float' ? parseFloat(document.getElementById('edit-p-goal-data').value) : parseInt(document.getElementById('edit-p-goal-data').value);
                }
            }
            closeModal('edit-progress-modal');
            renderPage();
            fetch('/api/progress/' + itemId + '/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(progressData.items[itemIndex]) });
        });

        function deleteProgress(itemId) {
            if(!confirm("Are you sure you want to delete this progress and ALL its history?")) return;
            progressData.items = progressData.items.filter(g => g.id !== itemId);
            Object.keys(progressData.progress).forEach(date => {
                if(progressData.progress[date][itemId] !== undefined) delete progressData.progress[date][itemId];
            });
            renderPage();
            fetch('/api/progress/' + itemId + '/delete', { method: 'POST' });
        }

        function openLogModal(dateStr) {
            const activeItems = progressData.items.filter(g => isItemActive(g, dateStr));
            document.getElementById('log-modal-title').innerText = new Date(dateStr + "T00:00:00").toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            let html = '';
            const dayData = progressData.progress[dateStr] || {};
            activeItems.forEach(item => {
                const isDone = dayData[item.id] !== undefined;
                html += '<div class="task-card"><div class="task-header"><details class="task-details"><summary><i class="fas fa-chevron-right chevron-icon"></i><div class="color-dot" style="background:' + item.color + ';"></div><span class="progress-title">' + escapeHtml(item.title) + '</span></summary>' + (item.description ? '<div class="task-description-container"><div class="task-description" style="border-left-color: ' + item.color + ';">' + preserveLineBreaks(item.description) + '</div></div>' : '') + '</details><button class="action-btn" onclick="event.preventDefault(); handleLogAction(event, \\'' + item.id + '\\', \\'' + dateStr + '\\')" style="background: ' + (isDone ? 'var(--hover-color)' : item.color) + '; color: ' + (isDone ? 'var(--text-secondary)' : 'white') + ';" ' + (isDone ? 'disabled' : '') + '><i class="fas fa-check"></i></button></div></div>';
            });
            document.getElementById('daily-progress-list').innerHTML = html;
            showLogList();
            openModalObj('log-modal');
        }

        window.handleLogAction = (e, itemId, dateStr) => {
            const btn = e.currentTarget;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.style.background = 'var(--hover-color)';
            btn.style.color = 'var(--text-secondary)';
            btn.disabled = true;

            const item = progressData.items.find(g => g.id === itemId);
            if (item.hasData && item.type !== 'boolean') {
                loggingContext = { item, dateStr };
                document.getElementById('l-title').innerText = item.title;
                document.getElementById('l-desc-container').innerHTML = item.description ? '<div class="task-description" style="border-left-color: ' + item.color + '; margin-bottom: 15px;">' + preserveLineBreaks(item.description) + '</div>' : '';
                document.getElementById('l-question').innerText = item.question;
                document.getElementById('l-input-wrapper').innerHTML = item.type === 'float' ? '<input type="number" step="0.01" class="form-control" id="log-input" placeholder="0.00">' : '<input type="number" step="1" class="form-control" id="log-input" placeholder="0">';
                document.getElementById('log-list-view').style.display = 'none';
                document.getElementById('log-question-view').style.display = 'block';
            } else {
                saveDirectComplete(item, dateStr, true);
            }
        };

        function saveDirectComplete(item, dateStr, val) {
            if (!progressData.progress[dateStr]) progressData.progress[dateStr] = {};
            progressData.progress[dateStr][item.id] = val; 
            
            // Optimistic UI Updates instantly
            renderPage();
            const activeItems = progressData.items.filter(g => isItemActive(g, dateStr));
            const dayData = progressData.progress[dateStr] || {};
            const isAllCompleted = activeItems.length > 0 && activeItems.every(g => dayData[g.id] !== undefined);
            
            if (isAllCompleted) {
                closeModal('log-modal');
                setTimeout(() => { const cell = document.querySelector('.day-cell[data-date="' + dateStr + '"]'); if (cell) showBubble(cell, dateStr); }, 300);
            } else openLogModal(dateStr);

            // Silent Background Save
            fetch('/api/progress/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: item.id, date: dateStr, value: val }) });
        }

        document.getElementById('save-log-btn')?.addEventListener('click', () => {
            const valStr = document.getElementById('log-input').value.trim();
            if (valStr === '') return alert('Enter a value.');
            const { item, dateStr } = loggingContext;
            const val = item.type === 'float' ? parseFloat(parseFloat(valStr).toFixed(2)) : parseInt(valStr, 10);
            saveDirectComplete(item, dateStr, val);
        });

        // ==================== TASKS API ====================
        function openAddTaskModal() {
            const istNow = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
            document.getElementById('startDate').value = todayStr;
            document.getElementById('startTime').value = String(istNow.getUTCHours()).padStart(2, '0') + ':' + String(istNow.getUTCMinutes()).padStart(2, '0');
            document.getElementById('endTime').value = String(istNow.getUTCHours() + 1).padStart(2, '0') + ':' + String(istNow.getUTCMinutes()).padStart(2, '0');
            openModalObj('addTaskModal');
        }
        function completeTask(taskId) {
            if (!confirm('Complete this task?')) return;
            fetch('/api/tasks/' + taskId + '/complete', { method: 'POST' }).then(() => switchPage('tasks'));
        }
        function deleteTask(taskId) {
            if (!confirm('Delete this task?')) return;
            fetch('/api/tasks/' + taskId + '/delete', { method: 'POST' }).then(() => switchPage('tasks'));
        }
        function deleteNote(noteId) {
            if (!confirm('Delete this note?')) return;
            fetch('/api/notes/' + noteId + '/delete', { method: 'POST' }).then(() => switchPage('notes'));
        }
        function submitTaskForm(e) {
            e.preventDefault();
            fetch('/api/tasks', { method: 'POST', body: new URLSearchParams(new FormData(e.target)) }).then(() => { closeModal('addTaskModal'); switchPage('tasks'); });
        }
        function submitNoteForm(e) {
            e.preventDefault();
            fetch('/api/notes', { method: 'POST', body: new URLSearchParams(new FormData(e.target)) }).then(() => { closeModal('addNoteModal'); switchPage('notes'); });
        }

        // Modals
        function openModalObj(id) { const m = document.getElementById(id); if(m){ m.style.display = 'flex'; setTimeout(() => m.classList.add('show'), 10); document.body.style.overflow = 'hidden'; } }
        function closeModal(id) { const m = document.getElementById(id); if(m){ m.classList.remove('show'); setTimeout(() => { m.style.display = 'none'; document.body.style.overflow = 'auto'; }, 300); } }
        function showLogList() { document.getElementById('log-list-view').style.display = 'block'; document.getElementById('log-question-view').style.display = 'none'; }
    </script>
</body>
</html>`;
    fs.writeFileSync(path.join(viewsDir, 'index.ejs'), mainEJS);
}
writeMainEJS();

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
            const collections = await db.listCollections().toArray();
            const names = collections.map(c => c.name);
            if (!names.includes('progress_items')) await db.createCollection('progress_items');
            if (!names.includes('progress_logs')) await db.createCollection('progress_logs');
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
function generateId() { return Math.random().toString(36).substring(2, 10); }
function calculateDuration(startDate, endDate) { return Math.round((endDate - startDate) / 60000); }
function formatDuration(minutes) {
    if (minutes < 0) return '0 mins';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return mins + ' mins';
    if (mins === 0) return hours + ' hours';
    return hours + 'h ' + mins + 'm';
}
function calculateSubtaskProgress(subtasks) {
    if (!subtasks || subtasks.length === 0) return 0;
    return Math.round((subtasks.filter(s => s.completed).length / subtasks.length) * 100);
}

// ==========================================
// 🤖 BOT SETUP & SCHEDULER
// ==========================================
const bot = new Telegraf(BOT_TOKEN);
const activeSchedules = new Map();
let isShuttingDown = false;

bot.command('start', async (ctx) => {
    const keyboard = Markup.inlineKeyboard([[Markup.button.webApp('🌐 Open Web App', WEB_APP_URL)]]);
    await ctx.reply('🌟 <b>Global Task Manager</b>\n\nManage your tasks, notes, and progress directly using the Web App below.', { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
});

function scheduleTask(task) {
    if (!task || !task.taskId || !task.startDate) return;
    try {
        const taskId = task.taskId;
        const startTimeUTC = new Date(task.startDate);
        const nowUTC = new Date();

        cancelTaskSchedule(taskId);
        if (startTimeUTC <= new Date(nowUTC.getTime() + 10 * 60000)) return;

        const notifyTimeUTC = new Date(startTimeUTC.getTime() - 10 * 60000);
        const triggerDateUTC = notifyTimeUTC > nowUTC ? notifyTimeUTC : nowUTC;

        const startJob = schedule.scheduleJob(triggerDateUTC, async function() {
            if (isShuttingDown) return;
            let count = 0;
            
            const sendNotification = async () => {
                if (isShuttingDown) return;
                const currentTimeUTC = new Date();
                
                if (currentTimeUTC >= startTimeUTC || count >= 10) {
                    cancelTaskSchedule(taskId);
                    if (currentTimeUTC >= startTimeUTC) {
                        try { await bot.telegram.sendMessage(CHAT_ID, `🚀 <b>START NOW:</b> ${task.title}\n📅 <b>Date:</b> ${task.startDateStr} at ${task.startTimeStr}\n📝 <b>Desc:</b> ${task.description || 'N/A'}`, { parse_mode: 'HTML' }); } catch (e) {}
                    }
                    return;
                }
                const minutesLeft = Math.ceil((startTimeUTC - currentTimeUTC) / 60000);
                if (minutesLeft > 0) {
                    try { await bot.telegram.sendMessage(CHAT_ID, `🔔 <b>In ${minutesLeft}m:</b> ${task.title}`, { parse_mode: 'HTML' }); } catch (e) {}
                }
                count++;
            };
            await sendNotification();
            const interval = setInterval(sendNotification, 60000);
            activeSchedules.set(taskId, { startJob, interval });
        });
        activeSchedules.set(taskId, { startJob });
    } catch (error) {}
}

function cancelTaskSchedule(taskId) {
    if (activeSchedules.has(taskId)) {
        const s = activeSchedules.get(taskId);
        if (s.startJob) try { s.startJob.cancel(); } catch (e) {}
        if (s.interval) try { clearInterval(s.interval); } catch (e) {}
        activeSchedules.delete(taskId);
    }
}

async function rescheduleAllPending() {
    try {
        const tasks = await db.collection('tasks').find({ status: 'pending', startDate: { $gt: new Date(Date.now() + 10 * 60000) } }).toArray();
        tasks.forEach(task => scheduleTask(task));
    } catch (error) {}
}

async function autoCompletePendingTasks() {
    try {
        const pendingTasks = await db.collection('tasks').find({ status: 'pending', nextOccurrence: { $gte: getTodayStartUTC(), $lt: getTomorrowStartUTC() } }).toArray();
        for (const task of pendingTasks) {
            await db.collection('history').insertOne({ ...task, _id: undefined, completedAt: new Date(), completedDate: getTodayStartUTC(), originalTaskId: task.taskId, status: 'completed', autoCompleted: true });
            cancelTaskSchedule(task.taskId);
            
            if (task.repeat !== 'none' && task.repeatCount > 0) {
                const nextOccurrenceUTC = new Date(task.nextOccurrence);
                nextOccurrenceUTC.setUTCDate(nextOccurrenceUTC.getUTCDate() + (task.repeat === 'weekly' ? 7 : 1));
                await db.collection('tasks').updateOne({ taskId: task.taskId }, { $set: { nextOccurrence: nextOccurrenceUTC, repeatCount: task.repeatCount - 1, startDate: nextOccurrenceUTC, endDate: new Date(nextOccurrenceUTC.getTime() + (task.endDate.getTime() - task.startDate.getTime())) } });
                const updatedTask = await db.collection('tasks').findOne({ taskId: task.taskId });
                if (updatedTask && updatedTask.nextOccurrence > new Date(Date.now() + 10 * 60000)) scheduleTask(updatedTask);
            } else {
                await db.collection('tasks').deleteOne({ taskId: task.taskId });
            }
            try { await bot.telegram.sendMessage(CHAT_ID, `✅ <b>Auto-Completed:</b> ${task.title}`, { parse_mode: 'HTML' }); } catch (e) {}
        }
    } catch (error) {}
}

let autoCompleteJob;
function scheduleAutoComplete() {
    if (autoCompleteJob) autoCompleteJob.cancel();
    autoCompleteJob = schedule.scheduleJob('29 18 * * *', async () => { if (!isShuttingDown) await autoCompletePendingTasks(); }); 
}

// ==========================================
// 📱 WEB INTERFACE ROUTES
// ==========================================
app.get('/', (req, res) => res.render('index'));

app.get('/api/page/:page', async (req, res) => {
    try {
        const page = req.params.page;
        if (page === 'tasks') {
            const tasks = await db.collection('tasks').find({ status: 'pending', nextOccurrence: { $gte: getTodayStartUTC(), $lt: getTomorrowStartUTC() } }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray();
            res.json({ tasks: tasks.map(task => ({ ...task, startTimeIST: utcToISTDisplay(task.startDate).displayTime, endTimeIST: utcToISTDisplay(task.endDate).displayTime, dateIST: utcToISTDisplay(task.startDate).displayDate, durationFormatted: formatDuration(calculateDuration(task.startDate, task.endDate)), subtaskProgress: calculateSubtaskProgress(task.subtasks) })) });
        } else if (page === 'progress') {
            const progressItems = await db.collection('progress_items').find().sort({ createdAt: 1 }).toArray();
            const progressLogs = await db.collection('progress_logs').find().toArray();
            const progress = { items: progressItems, progress: {} };
            progressLogs.forEach(log => {
                if (!progress.progress[log.date]) progress.progress[log.date] = {};
                progress.progress[log.date][log.itemId] = log.value;
            });
            res.json({ progress });
        } else if (page === 'notes') {
            const notes = await db.collection('notes').find().sort({ orderIndex: 1, createdAt: -1 }).toArray();
            res.json({ notes: notes.map(note => ({ ...note, createdAtIST: utcToISTDisplay(note.createdAt).dateTime, updatedAtIST: note.updatedAt ? utcToISTDisplay(note.updatedAt).dateTime : utcToISTDisplay(note.createdAt).dateTime })) });
        } else if (page === 'history') {
            const history = await db.collection('history').find().sort({ completedAt: -1 }).limit(500).toArray();
            const groupedHistory = {};
            history.forEach(item => {
                const dateKey = utcToISTDisplay(item.completedAt).displayDate;
                if (!groupedHistory[dateKey]) groupedHistory[dateKey] = [];
                groupedHistory[dateKey].push({ ...item, completedTimeIST: utcToISTDisplay(item.completedAt).displayTime, startTimeIST: utcToISTDisplay(item.startDate).displayTime, endTimeIST: utcToISTDisplay(item.endDate).displayTime, durationFormatted: formatDuration(calculateDuration(item.startDate, item.endDate)) });
            });
            res.json({ groupedHistory });
        } else { res.status(404).json({ error: 'Not found' }); }
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// TASKS ROUTES
app.post('/api/tasks', async (req, res) => {
    try {
        const { title, description, startDate, startTime, endTime, repeat, repeatCount } = req.body;
        const startDateUTC = istToUTC(startDate, startTime); const endDateUTC = istToUTC(startDate, endTime);
        
        const task = { taskId: generateId(), title: title.trim(), description: description ? description.trim() : '', startDate: startDateUTC, endDate: endDateUTC, nextOccurrence: startDateUTC, status: 'pending', repeat: repeat || 'none', repeatCount: repeat && repeat !== 'none' ? (parseInt(repeatCount) || 7) : 0, subtasks: [], createdAt: new Date(), orderIndex: (await db.collection('tasks').countDocuments()) || 0, startTimeStr: startTime, endTimeStr: endTime, startDateStr: startDate };
        await db.collection('tasks').insertOne(task);
        if (task.startDate > new Date(Date.now() + 10 * 60000)) scheduleTask(task);
        try { await bot.telegram.sendMessage(CHAT_ID, `➕ <b>Task Added:</b> ${task.title}\n📅 <b>Date:</b> ${task.startDateStr} at ${task.startTimeStr}\n📝 <b>Desc:</b> ${task.description || 'N/A'}`, { parse_mode: 'HTML' }); } catch(e){}
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/tasks/:taskId/complete', async (req, res) => {
    try {
        const task = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        await db.collection('history').insertOne({ ...task, _id: undefined, completedAt: new Date(), completedDate: getTodayStartUTC(), originalTaskId: task.taskId, status: 'completed' });
        cancelTaskSchedule(task.taskId);
        if (task.repeat !== 'none' && task.repeatCount > 0) {
            const nextUTC = new Date(task.nextOccurrence); nextUTC.setUTCDate(nextUTC.getUTCDate() + (task.repeat === 'weekly' ? 7 : 1));
            await db.collection('tasks').updateOne({ taskId: task.taskId }, { $set: { nextOccurrence: nextUTC, repeatCount: task.repeatCount - 1, startDate: nextUTC, endDate: new Date(nextUTC.getTime() + (task.endDate.getTime() - task.startDate.getTime())), subtasks: (task.subtasks || []).map(s => ({...s, completed: false})) } });
            const t = await db.collection('tasks').findOne({ taskId: task.taskId });
            if (t && t.nextOccurrence > new Date(Date.now() + 10 * 60000)) scheduleTask(t);
            try { await bot.telegram.sendMessage(CHAT_ID, `✅ <b>Task Completed:</b> ${task.title}\n🔄 <b>Next:</b> ${utcToISTDisplay(nextUTC).dateTime}`, { parse_mode: 'HTML' }); } catch(e){}
        } else {
            await db.collection('tasks').deleteOne({ taskId: task.taskId });
            try { await bot.telegram.sendMessage(CHAT_ID, `✅ <b>Task Completed:</b> ${task.title}\n🎉 <b>Awesome Job!</b>`, { parse_mode: 'HTML' }); } catch(e){}
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/tasks/:taskId/delete', async (req, res) => {
    try {
        const t = await db.collection('tasks').findOne({taskId: req.params.taskId});
        cancelTaskSchedule(req.params.taskId);
        await db.collection('tasks').deleteOne({ taskId: req.params.taskId });
        if(t) try { await bot.telegram.sendMessage(CHAT_ID, `🗑️ <b>Task Deleted:</b> ${t.title}`, { parse_mode: 'HTML' }); } catch(e){}
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// PROGRESS ROUTES
app.post('/api/progress', async (req, res) => {
    try {
        const item = req.body;
        item.createdAt = new Date(); item.updatedAt = new Date();
        await db.collection('progress_items').insertOne(item);
        try { await bot.telegram.sendMessage(CHAT_ID, `📊 <b>New Progress Added:</b> ${item.title}\n🎯 <b>Target:</b> ${item.endCount} days\n📝 <b>Desc:</b> ${item.description || 'N/A'}\n🔢 <b>Type:</b> ${item.type}`, { parse_mode: 'HTML' }); } catch(e){}
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/progress/:itemId/delete', async (req, res) => {
    try {
        const item = await db.collection('progress_items').findOne({ id: req.params.itemId });
        await db.collection('progress_items').deleteOne({ id: req.params.itemId });
        await db.collection('progress_logs').deleteMany({ itemId: req.params.itemId });
        if (item) try { await bot.telegram.sendMessage(CHAT_ID, `🗑️ <b>Progress Goal Deleted:</b> ${item.title}`, { parse_mode: 'HTML' }); } catch(e){}
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/progress/log', async (req, res) => {
    try {
        const { itemId, date, value } = req.body;
        const exist = await db.collection('progress_logs').findOne({ itemId, date });
        if (exist) await db.collection('progress_logs').updateOne({ itemId, date }, { $set: { value, updatedAt: new Date() } });
        else await db.collection('progress_logs').insertOne({ itemId, date, value, createdAt: new Date() });
        const item = await db.collection('progress_items').findOne({ id: itemId });
        if (item) try { await bot.telegram.sendMessage(CHAT_ID, `✅ <b>Progress Logged:</b> ${item.title}\n📈 <b>Value Recorded:</b> ${value}\n📅 <b>Date:</b> ${date}\n📝 <b>Details:</b> ${item.description || 'N/A'}`, { parse_mode: 'HTML' }); } catch(e){}
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// NOTES ROUTES
app.post('/api/notes', async (req, res) => {
    try {
        if (!req.body.title) return res.status(400).send('Empty title');
        const note = { noteId: generateId(), title: req.body.title.trim(), description: req.body.description || '', createdAt: new Date(), updatedAt: new Date(), orderIndex: await db.collection('notes').countDocuments() };
        await db.collection('notes').insertOne(note);
        try { await bot.telegram.sendMessage(CHAT_ID, `📝 <b>Note Added:</b> ${note.title}\n📄 <b>Content:</b> ${note.description ? note.description.substring(0, 50) + '...' : 'N/A'}`, { parse_mode: 'HTML' }); } catch(e){}
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/notes/:noteId/delete', async (req, res) => {
    try {
        const note = await db.collection('notes').findOne({ noteId: req.params.noteId });
        await db.collection('notes').deleteOne({ noteId: req.params.noteId });
        if (note) try { await bot.telegram.sendMessage(CHAT_ID, `🗑️ <b>Note Deleted:</b> ${note.title}`, { parse_mode: 'HTML' }); } catch(e){}
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ==========================================
// 🚀 BOOTSTRAP
// ==========================================
async function start() {
    try {
        if (await connectDB()) {
            await rescheduleAllPending();
            scheduleAutoComplete();
            app.listen(PORT, '0.0.0.0', () => {
                console.log('🌐 Web interface running on port ' + PORT);
                console.log('🕐 IST Time: ' + getCurrentISTDisplay().dateTime);
            });
            await bot.launch();
            console.log('🤖 Bot Started Successfully - Notifications Only Mode!');
        } else { setTimeout(start, 5000); }
    } catch (error) { setTimeout(start, 10000); }
}

process.once('SIGINT', () => { isShuttingDown = true; bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { isShuttingDown = true; bot.stop('SIGTERM'); process.exit(0); });

start();
