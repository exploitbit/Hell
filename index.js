const { Telegraf, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const schedule = require('node-schedule');
const express = require('express');
const path = require('path');
const fs = require('fs');

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
const BOT_TOKEN = '8620233151:AAErK3SxDjdPWYd2RFafQ_-tGg8_mAOuocI';
const MONGODB_URI = 'mongodb+srv://sandip:9E9AISFqTfU3VI5i@cluster0.p8irtov.mongodb.net/telegram_bot';
const PORT = process.env.PORT || 8080;
const WEB_APP_URL = 'https://task-managing.up.railway.app';
const CHAT_ID = 8781152810;

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const viewsDir = path.join(__dirname, 'views');
if (!fs.existsSync(viewsDir)) fs.mkdirSync(viewsDir, { recursive: true });

let globalSettings = { reminders: true, hourly: true, alerts: true, theme: 'dark' };

// ==========================================
// 🕐 TIMEZONE UTILITIES
// ==========================================
function istToUTC(istDate, istTime) {
    if (!istDate || !istTime) return null;
    try {
        const [year, month, day] = istDate.split('-').map(Number);
        const [hour, minute] = istTime.split(':').map(Number);
        const istDateObj = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
        return new Date(istDateObj.getTime() - IST_OFFSET_MS);
    } catch (e) { return null; }
}

function getCurrentISTDisplay() {
    const istDate = new Date(Date.now() + IST_OFFSET_MS);
    const year = istDate.getUTCFullYear();
    const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    const hours = String(istDate.getUTCHours()).padStart(2, '0');
    const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
    return {
        date: `${year}-${month}-${day}`,
        displayDate: `${day}-${month}-${year}`,
        displayTime: `${hours}:${minutes}`,
        dateTime: `${day}-${month}-${year} ${hours}:${minutes}`,
        monthIndex: istDate.getUTCMonth(),
        yearNum: year
    };
}

function formatLegacyIST(utcDate, type) {
    if (!utcDate || isNaN(new Date(utcDate).getTime())) return '';
    const istDate = new Date(new Date(utcDate).getTime() + IST_OFFSET_MS);
    if (type === 'date') return `${String(istDate.getUTCDate()).padStart(2, '0')}-${String(istDate.getUTCMonth() + 1).padStart(2, '0')}-${istDate.getUTCFullYear()}`;
    if (type === 'time') return `${String(istDate.getUTCHours()).padStart(2, '0')}:${String(istDate.getUTCMinutes()).padStart(2, '0')}`;
    return '';
}

function escapeHTML(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendAlert(msg) {
    if (globalSettings.alerts) {
        try { await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' }); } catch(e) {}
    }
}

// ==========================================
// 🎨 EJS TEMPLATE GENERATOR
// ==========================================
function writeMainEJS() {
    const mainEJS = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes, viewport-fit=cover">
    <title>Task Manager</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Pathway+Gothic+One&display=swap');
        
        :root {
            --bg-light: #f8fafc; --card-bg-light: #ffffff; --text-primary-light: #0f172a; --text-secondary-light: #475569;
            --border-light: #e2e8f0; --accent-light: #2563eb; --accent-soft-light: #dbeafe; --success-light: #059669;
            --warning-light: #d97706; --danger-light: #dc2626; --hover-light: #f1f5f9; --progress-bg-light: #e2e8f0;
            --bg-dark: #0f172a; --card-bg-dark: #1e293b; --text-primary-dark: #f8fafc; --text-secondary-dark: #cbd5e1;
            --border-dark: #334155; --accent-dark: #3b82f6; --accent-soft-dark: #1e3a8a; --success-dark: #10b981;
            --warning-dark: #f59e0b; --danger-dark: #ef4444; --hover-dark: #334155; --progress-bg-dark: #334155;
        }

        body.theme-light { background: var(--bg-light); color: var(--text-primary-light); }
        body.theme-dark { background: var(--bg-dark); color: var(--text-primary-dark); }
        
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Pathway Gothic One', sans-serif; letter-spacing: 0.3px; }
        body { transition: background 0.3s ease, color 0.3s ease; min-height: 100vh; font-size: 15px; line-height: 1.4; }
        
        .app-header { background: var(--card-bg-light); border-bottom: 1px solid var(--border-light); padding: 12px 16px; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
        body.theme-dark .app-header { background: var(--card-bg-dark); border-bottom: 1px solid var(--border-dark); box-shadow: 0 2px 10px rgba(0,0,0,0.3); }
        
        .header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .logo-section { display: flex; align-items: center; gap: 10px; color: var(--accent-light); font-size: 1.3rem; font-weight: 700; text-transform: uppercase; }
        body.theme-dark .logo-section { color: var(--accent-dark); }
        .settings-btn { background: transparent; border: none; color: var(--text-secondary-light); font-size: 1.2rem; cursor: pointer; }
        body.theme-dark .settings-btn { color: var(--text-secondary-dark); }
        
        .nav-container { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .nav-links { display: flex; gap: 4px; background: var(--hover-light); padding: 4px; border-radius: 100px; flex: 1; }
        body.theme-dark .nav-links { background: var(--hover-dark); }
        
        .nav-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 10px; border-radius: 100px; border: none; background: transparent; color: var(--text-secondary-light); font-size: 1rem; cursor: pointer; transition: all 0.2s ease; }
        body.theme-dark .nav-btn { color: var(--text-secondary-dark); }
        .nav-btn.active { background: var(--card-bg-light); color: var(--accent-light); box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
        body.theme-dark .nav-btn.active { background: var(--card-bg-dark); color: var(--accent-dark); box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
        
        .main-content { max-width: 1400px; margin: 16px auto; padding: 0 16px; padding-bottom: 80px; }
        
        .tasks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
        .task-card, .note-card, .history-date-card { background: var(--card-bg-light); border: 1px solid var(--border-light); border-radius: 16px; padding: 14px; transition: all 0.2s ease; word-wrap: break-word; }
        body.theme-dark .task-card, body.theme-dark .note-card, body.theme-dark .history-date-card { background: var(--card-bg-dark); border: 1px solid var(--border-dark); }
        
        .task-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; width: 100%; }
        .task-title { font-size: 1.25rem; color: var(--text-primary-light); margin-bottom: 2px; line-height: 1.2; word-break: break-word; cursor: pointer; user-select: none; font-weight: 600; }
        body.theme-dark .task-title { color: var(--text-primary-dark); }
        
        .task-description { font-size: 0.95rem; color: var(--text-secondary-light); padding: 6px 10px; background: var(--hover-light); border-radius: 8px; border-left: 3px solid var(--accent-light); margin: 6px 0; line-height: 1.3; }
        body.theme-dark .task-description { color: var(--text-secondary-dark); background: var(--hover-dark); }
        
        .task-time-row { display: flex; justify-content: space-between; align-items: center; width: 100%; margin: 6px 0; }
        .date-chip, .time-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: var(--hover-light); border-radius: 100px; font-size: 0.9rem; color: var(--text-secondary-light); }
        body.theme-dark .date-chip, body.theme-dark .time-chip { background: var(--hover-dark); color: var(--text-secondary-dark); }
        
        .task-actions-wrapper { display: flex; gap: 4px; }
        .normal-btns, .priority-btns { display: flex; gap: 4px; }
        .priority-btns { display: none; }
        .priority-mode .normal-btns { display: none; }
        .priority-mode .priority-btns { display: flex; }

        .action-btn { width: 30px; height: 30px; border-radius: 8px; border: none; background: var(--hover-light); color: var(--text-secondary-light); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.9rem; }
        body.theme-dark .action-btn { background: var(--hover-dark); color: var(--text-secondary-dark); }
        
        .progress-ring-small { position: relative; width: 36px; height: 36px; }
        .progress-ring-circle-small { transition: stroke-dashoffset 0.5s; transform: rotate(-90deg); transform-origin: 50% 50%; }
        .progress-text-small { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 0.8rem; color: var(--accent-light); font-weight: 600; }
        body.theme-dark .progress-text-small { color: var(--accent-dark); }
        
        .subtasks-container { margin-top: 10px; border-top: 1px solid var(--border-light); padding-top: 10px; }
        body.theme-dark .subtasks-container { border-top-color: var(--border-dark); }
        .subtask-item { display: flex; flex-direction: column; background: var(--hover-light); border-radius: 8px; margin-bottom: 6px; padding: 8px; }
        body.theme-dark .subtask-item { background: var(--hover-dark); }
        
        .subtask-checkbox { width: 20px; height: 20px; border-radius: 6px; border: 2px solid var(--accent-light); display: flex; align-items: center; justify-content: center; cursor: pointer; color: white; font-size: 0.8rem; flex-shrink: 0; }
        .subtask-checkbox.completed { background: var(--success-light); border-color: var(--success-light); }
        body.theme-dark .subtask-checkbox.completed { background: var(--success-dark); border-color: var(--success-dark); }
        
        .subtask-title { color: var(--text-primary-light); font-size: 1.05rem; word-break: break-word; cursor: pointer; user-select: none; }
        body.theme-dark .subtask-title { color: var(--text-primary-dark); }
        .subtask-title.completed { text-decoration: line-through; color: var(--text-secondary-light); }
        body.theme-dark .subtask-title.completed { color: var(--text-secondary-dark); }
        
        .subtask-btn { width: 26px; height: 26px; border-radius: 6px; border: none; background: var(--card-bg-light); color: var(--text-secondary-light); cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; }
        body.theme-dark .subtask-btn { background: var(--card-bg-dark); color: var(--text-secondary-dark); }
        
        .subtask-description { font-size: 0.9rem; color: var(--text-secondary-light); padding: 4px 8px; background: var(--card-bg-light); border-radius: 8px; border-left: 2px solid var(--accent-light); margin-top: 4px; margin-left: 28px; line-height: 1.3; }
        body.theme-dark .subtask-description { background: var(--card-bg-dark); color: var(--text-secondary-dark); }
        
        .badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 100px; font-size: 0.85rem; gap: 4px; background: var(--hover-light); color: var(--text-secondary-light); }
        body.theme-dark .badge { background: var(--hover-dark); color: var(--text-secondary-dark); }
        
        /* DYNAMIC ISLAND TOAST */
        .toast-container { position: fixed; top: 15px; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
        .toast { background: #000000; color: #ffffff; padding: 10px 20px; border-radius: 100px; display: flex; align-items: center; gap: 10px; font-size: 1rem; font-weight: 600; box-shadow: 0 10px 30px rgba(0,0,0,0.3); animation: dropIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        body.theme-dark .toast { background: #ffffff; color: #000000; }
        @keyframes dropIn { 0% { transform: translateY(-30px) scale(0.8); opacity: 0; } 100% { transform: translateY(0) scale(1); opacity: 1; } }

        /* MODALS & FORMS */
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(3px); align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: var(--card-bg-light); border-radius: 20px; padding: 20px; width: 90%; max-width: 400px; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
        body.theme-dark .modal-content { background: var(--card-bg-dark); border: 1px solid var(--border-dark); }
        
        .form-control { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border-light); background: var(--bg-light); color: var(--text-primary-light); font-size: 1rem; }
        body.theme-dark .form-control { background: var(--bg-dark); border-color: var(--border-dark); color: var(--text-primary-dark); }
        
        .btn { padding: 10px 20px; border-radius: 100px; border: none; font-size: 1.05rem; cursor: pointer; text-transform: uppercase; font-weight: 600; }
        .btn-primary { background: var(--accent-light); color: white; }
        body.theme-dark .btn-primary { background: var(--accent-dark); }
        .btn-secondary { background: var(--hover-light); color: var(--text-secondary-light); }
        body.theme-dark .btn-secondary { background: var(--hover-dark); color: var(--text-secondary-dark); }
        
        /* SETTINGS TOGGLES */
        .setting-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-light); }
        body.theme-dark .setting-row { border-bottom-color: var(--border-dark); }
        .setting-label { font-size: 1.1rem; color: var(--text-primary-light); font-weight: 600; }
        body.theme-dark .setting-label { color: var(--text-primary-dark); }
        .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--border-light); transition: .4s; border-radius: 34px; }
        body.theme-dark .slider { background-color: var(--border-dark); }
        .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
        input:checked + .slider { background-color: var(--success-light); }
        body.theme-dark input:checked + .slider { background-color: var(--success-dark); }
        input:checked + .slider:before { transform: translateX(20px); }

        /* GROW CSS */
        .grow-panel { margin-bottom: 12px; background: var(--card-bg-light); border-radius: 16px; overflow: hidden; border: 1px solid var(--border-light); }
        body.theme-dark .grow-panel { background: var(--card-bg-dark); border-color: var(--border-dark); }
        .grow-panel summary { padding: 12px; font-size: 1.1rem; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; }
        .grow-calendar { width: 100%; aspect-ratio: 1/1; display: flex; flex-direction: column; padding: 0 10px 10px; }
        .grow-grid { flex: 1; display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
        .grow-weekday { display: flex; justify-content: center; align-items: center; font-size: 0.85rem; color: var(--text-secondary-light); }
        body.theme-dark .grow-weekday { color: var(--text-secondary-dark); }
        .grow-day { border-radius: 8px; display: flex; justify-content: center; align-items: center; position: relative; }
        .grow-day:not(.empty):hover { background: var(--hover-light); cursor: pointer; }
        body.theme-dark .grow-day:not(.empty):hover { background: var(--hover-dark); }
        
        .grow-circle { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.95rem; font-weight: 600; }
        .grow-circle.has-data { color: white; }
        .grow-circle.today { box-shadow: 0 0 0 3px var(--card-bg-light), 0 0 0 6px var(--success-light); color: var(--success-light); }
        body.theme-dark .grow-circle.today { box-shadow: 0 0 0 3px var(--card-bg-dark), 0 0 0 6px var(--success-dark); color: var(--success-dark); }
        .grow-circle.today.has-data { color: white; }

        .grow-bubble { position: absolute; background: var(--card-bg-light); border: 1px solid var(--border-light); border-radius: 12px; padding: 10px; z-index: 1000; min-width: 150px; display: none; box-shadow: 0 10px 25px rgba(0,0,0,0.15); }
        body.theme-dark .grow-bubble { background: var(--card-bg-dark); border-color: var(--border-dark); }
        
        .fab { position: fixed; bottom: 20px; right: 20px; width: 56px; height: 56px; border-radius: 28px; background: var(--accent-light); color: white; border: none; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(0,0,0,0.3); z-index: 99; cursor: pointer; }
        body.theme-dark .fab { background: var(--accent-dark); }
        
        .hidden { display: none; }
    </style>
</head>
<body class="theme-<%= settings.theme || 'dark' %>">
    <div class="toast-container" id="toastContainer"></div>

    <div class="app-header">
        <div class="header-top">
            <div class="logo-section">
                <i class="fas fa-check-double"></i> <span>Tasks</span>
            </div>
            <button class="settings-btn" onclick="openModal('settingsModal')"><i class="fas fa-cog"></i></button>
        </div>
        <div class="nav-container">
            <div class="nav-links">
                <button class="nav-btn" id="nav_tasks" onclick="switchPage('tasks')"><i class="fas fa-list"></i> Tasks</button>
                <button class="nav-btn" id="nav_grow" onclick="switchPage('grow')"><i class="fas fa-seedling"></i> Grow</button>
                <button class="nav-btn" id="nav_notes" onclick="switchPage('notes')"><i class="fas fa-sticky-note"></i> Notes</button>
                <button class="nav-btn" id="nav_history" onclick="switchPage('history')"><i class="fas fa-history"></i> History</button>
            </div>
        </div>
    </div>

    <button class="fab" id="fabButton" onclick="openAddModal()"><i class="fas fa-plus"></i></button>
    <div class="main-content" id="mainContent"></div>
    
    <div class="grow-bubble" id="growBubble"><div id="growBubbleContent"></div></div>

    <div class="modal" id="settingsModal">
        <div class="modal-content">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="font-size: 1.4rem;">Settings</h2>
                <button class="action-btn" onclick="closeModal('settingsModal')">&times;</button>
            </div>
            
            <div class="setting-row">
                <span class="setting-label"><i class="fas fa-moon"></i> Dark Theme</span>
                <label class="switch"><input type="checkbox" id="toggleTheme" onchange="updateSetting('theme', this.checked ? 'dark' : 'light')" <%= settings.theme !== 'light' ? 'checked' : '' %>><span class="slider"></span></label>
            </div>
            <div class="setting-row">
                <span class="setting-label"><i class="fas fa-bell"></i> Live Alerts</span>
                <label class="switch"><input type="checkbox" id="toggleAlerts" onchange="updateSetting('alerts', this.checked)" <%= settings.alerts ? 'checked' : '' %>><span class="slider"></span></label>
            </div>
            <div class="setting-row">
                <span class="setting-label"><i class="fas fa-clock"></i> Hourly Notification</span>
                <label class="switch"><input type="checkbox" id="toggleHourly" onchange="updateSetting('hourly', this.checked)" <%= settings.hourly ? 'checked' : '' %>><span class="slider"></span></label>
            </div>
            <div class="setting-row" style="border-bottom: none;">
                <span class="setting-label"><i class="fas fa-stopwatch"></i> Reminders</span>
                <label class="switch"><input type="checkbox" id="toggleReminders" onchange="updateSetting('reminders', this.checked)" <%= settings.reminders ? 'checked' : '' %>><span class="slider"></span></label>
            </div>
        </div>
    </div>

    <div class="modal" id="addTaskModal">
        <div class="modal-content">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.3rem;">New Task</h2>
                <button class="action-btn" onclick="closeModal('addTaskModal')">&times;</button>
            </div>
            <form id="addTaskForm" onsubmit="submitTaskForm(event)">
                <div style="margin-bottom: 12px;"><input type="text" class="form-control" name="title" required placeholder="Task Title..." maxlength="100"></div>
                <div style="margin-bottom: 12px;"><textarea class="form-control" name="description" rows="2" placeholder="Description (optional)"></textarea></div>
                <div style="margin-bottom: 12px;"><input type="date" class="form-control" name="startDate" id="startDate" required></div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div><label style="font-size:0.85rem;">Start Time</label><input type="time" class="form-control" name="startTime" id="startTime" required></div>
                    <div><label style="font-size:0.85rem;">End Time</label><input type="time" class="form-control" name="endTime" id="endTime" required></div>
                </div>
                <div style="margin-bottom: 12px;">
                    <select class="form-control" name="repeat" id="repeatSelect" onchange="document.getElementById('repeatCountGroup').style.display = this.value === 'none' ? 'none' : 'block'">
                        <option value="none">No Repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option>
                    </select>
                </div>
                <div id="repeatCountGroup" style="margin-bottom: 12px; display: none;">
                    <input type="number" class="form-control" name="repeatCount" value="7" min="1" max="365" placeholder="Repeat Count">
                </div>
                <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px;">Create Task</button>
            </form>
        </div>
    </div>

    <div class="modal" id="editTaskModal">
        <div class="modal-content">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.3rem;">Edit Task</h2>
                <button class="action-btn" onclick="closeModal('editTaskModal')">&times;</button>
            </div>
            <form id="editTaskForm" onsubmit="submitEditTaskForm(event)">
                <input type="hidden" name="taskId" id="editTaskId">
                <div style="margin-bottom: 12px;"><input type="text" class="form-control" name="title" id="editTitle" required maxlength="100"></div>
                <div style="margin-bottom: 12px;"><textarea class="form-control" name="description" id="editDescription" rows="2"></textarea></div>
                <div style="margin-bottom: 12px;"><input type="date" class="form-control" name="startDate" id="editStartDate" required></div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div><label style="font-size:0.85rem;">Start Time</label><input type="time" class="form-control" name="startTime" id="editStartTime" required></div>
                    <div><label style="font-size:0.85rem;">End Time</label><input type="time" class="form-control" name="endTime" id="editEndTime" required></div>
                </div>
                <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px;">Update Task</button>
            </form>
        </div>
    </div>

    <div class="modal" id="addGrowModal">
        <div class="modal-content">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.3rem;">Add Growth Tracker</h2>
                <button class="action-btn" onclick="closeModal('addGrowModal')">&times;</button>
            </div>
            <form id="addGrowForm" onsubmit="submitAddGrowForm(event)">
                <div style="margin-bottom: 12px;"><input type="text" class="form-control" id="addGrowTitle" required placeholder="Habit Title"></div>
                <div style="margin-bottom: 12px;"><textarea class="form-control" id="addGrowDesc" rows="2" placeholder="Description (Optional)"></textarea></div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom: 12px;">
                    <div><label style="font-size:0.85rem;">Start Date</label><input type="date" class="form-control" id="addGrowStart" required></div>
                    <div><label style="font-size:0.85rem;">Days Target</label><input type="number" class="form-control" id="addGrowDays" value="365" required></div>
                </div>
                <input type="hidden" id="addGrowColor" value="#3b82f6">
                
                <label style="display:flex; align-items:center; gap:8px; font-size:1rem; margin:15px 0;">
                    <input type="checkbox" id="addGrowHasData" onchange="document.getElementById('addGrowDataFields').style.display = this.checked ? 'block' : 'none'"> Track Data?
                </label>
                
                <div id="addGrowDataFields" style="display:none; background:var(--hover-light); padding:10px; border-radius:10px; margin-bottom:12px;">
                    <input type="text" class="form-control" id="addGrowQuestion" placeholder="Question? (e.g. Weight?)"><br>
                    <select class="form-control" id="addGrowType" style="margin-top:8px;"><option value="integer">Whole Number</option><option value="float">Decimal</option></select>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px;">
                        <input type="number" class="form-control" id="addGrowMin" placeholder="Start Val" value="0">
                        <input type="number" class="form-control" id="addGrowMax" placeholder="End Val" value="100">
                    </div>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;">Save Tracker</button>
            </form>
        </div>
    </div>

    <div class="modal" id="logGrowModal">
        <div class="modal-content">
            <div id="logGrowListView">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h2 id="logGrowTitle" style="font-size: 1.3rem;">Log Progress</h2>
                    <button class="action-btn" onclick="closeModal('logGrowModal')">&times;</button>
                </div>
                <div id="dailyGrowList"></div>
            </div>
            <div id="logGrowQuestionView" class="hidden">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h2 id="qGrowTitle" style="font-size: 1.3rem;"></h2>
                    <button class="action-btn" onclick="document.getElementById('logGrowListView').classList.remove('hidden'); document.getElementById('logGrowQuestionView').classList.add('hidden');"><i class="fas fa-arrow-left"></i></button>
                </div>
                <p id="qGrowLabel" style="font-size:1.1rem; margin-bottom:10px;"></p>
                <div id="qGrowInput" style="margin-bottom:15px;"></div>
                <button class="btn btn-primary" id="saveGrowLogBtn" style="width:100%;">Save Log</button>
            </div>
        </div>
    </div>

    <div class="modal" id="addSubtaskModal"><div class="modal-content"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;"><h2 style="font-size:1.3rem;">Add Subtask</h2><button class="action-btn" onclick="closeModal('addSubtaskModal')">&times;</button></div><form onsubmit="submitSubtaskForm(event)"><input type="hidden" name="taskId" id="subtaskTaskId"><div style="margin-bottom:12px;"><input type="text" class="form-control" name="title" required placeholder="Subtask Title"></div><div style="margin-bottom:12px;"><textarea class="form-control" name="description" rows="2" placeholder="Description"></textarea></div><button type="submit" class="btn btn-primary" style="width:100%;">Add Subtask</button></form></div></div>
    
    <div class="modal" id="addNoteModal"><div class="modal-content"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;"><h2 style="font-size:1.3rem;">Create Note</h2><button class="action-btn" onclick="closeModal('addNoteModal')">&times;</button></div><form onsubmit="submitNoteForm(event)"><div style="margin-bottom:12px;"><input type="text" class="form-control" name="title" required placeholder="Note Title"></div><div style="margin-bottom:12px;"><textarea class="form-control" name="description" rows="4" placeholder="Content..."></textarea></div><button type="submit" class="btn btn-primary" style="width:100%;">Save Note</button></form></div></div>

    <script>
        const tg = window.Telegram.WebApp;
        tg.ready(); tg.expand();

        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerHTML = '<i class="fas ' + (type==='success'?'fa-check-circle':'fa-exclamation-circle') + '"></i><span>' + message + '</span>';
            container.appendChild(toast);
            setTimeout(() => { toast.style.opacity='0'; toast.style.transform='translateY(-30px) scale(0.8)'; setTimeout(()=>toast.remove(), 300); }, 2500);
        }

        function formatAMPM(timeStr) {
            if(!timeStr) return "";
            let [h, m] = timeStr.split(':');
            h = parseInt(h);
            let ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            return String(h).padStart(2, '0') + ':' + m + ' ' + ampm;
        }

        function escapeHtml(text) { return text ? String(text).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : ''; }
        function preserveLineBreaks(text) { return escapeHtml(text).replace(/\\n/g, '<br>'); }
        function toggleDesc(id) { const el = document.getElementById(id); if(el) el.classList.toggle('hidden'); }

        let currentPage = 'tasks'; 
        let tasksData = <%- JSON.stringify(tasks || []) %>;
        let notesData = <%- JSON.stringify(notes || []) %>;
        let historyData = <%- JSON.stringify(groupedHistory || {}) %>;
        let growData = <%- JSON.stringify(growData || {items:[], progress:{}}) %>;
        
        let currentMonth = new Date().getMonth();
        let currentYear = new Date().getFullYear();

        // Grow System Fix
        const todayISTObj = <%- JSON.stringify(currentDateObj || {}) %> || { date: new Date().toISOString().split('T')[0], monthIndex: new Date().getMonth(), yearNum: new Date().getFullYear() };
        let growToday = todayISTObj.date;
        let growMonth = todayISTObj.monthIndex;
        let growYear = todayISTObj.yearNum;
        let growLogContext = null;

        function updateSetting(key, val) {
            if(key === 'theme') {
                document.body.className = 'theme-' + val;
            }
            fetch('/api/settings', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({[key]: val})});
        }

        function switchPage(page) {
            currentPage = page;
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('nav_' + page).classList.add('active');
            
            fetch('/api/page/' + page).then(res => res.json()).then(data => {
                if(data.tasks) tasksData = data.tasks;
                if(data.notes) notesData = data.notes;
                if(data.groupedHistory) historyData = data.groupedHistory;
                if(data.growData) growData = data.growData;
                renderPage();
            });
            renderPage();
        }

        function renderPage() {
            const content = document.getElementById('mainContent');
            const fab = document.getElementById('fabButton');
            
            if (currentPage === 'tasks') { fab.style.display = 'flex'; content.innerHTML = renderTasks(); }
            else if (currentPage === 'grow') { fab.style.display = 'flex'; content.innerHTML = renderGrowShell(); renderGrowAll(); }
            else if (currentPage === 'notes') { fab.style.display = 'flex'; content.innerHTML = renderNotes(); }
            else if (currentPage === 'history') { fab.style.display = 'none'; content.innerHTML = renderHistory(); }
        }

        // ================= TASKS ================= //
        function renderTasks() {
            if (!tasksData.length) return '<div style="text-align:center; padding:40px; color:var(--text-secondary-light);"><i class="fas fa-clipboard-list" style="font-size:3rem; margin-bottom:10px;"></i><h3>No tasks</h3></div>';
            let html = '<div class="tasks-grid">';
            tasksData.forEach(task => {
                const st = formatAMPM(task.startTimeStr);
                const et = formatAMPM(task.endTimeStr);
                const totalSub = task.subtasks ? task.subtasks.length : 0;
                const compSub = task.subtasks ? task.subtasks.filter(s=>s.completed).length : 0;
                
                html += '<div class="task-card"><div class="task-header"><div style="flex:1;" onclick="toggleDesc(\\'desc_'+task.taskId+'\\')" oncontextmenu="event.preventDefault(); toggleTaskPrio(\\''+task.taskId+'\\')"><div class="task-title"><i class="fas fa-chevron-right" style="font-size:0.8rem; color:var(--accent-light);"></i> '+escapeHtml(task.title)+'</div></div>';
                
                html += '<div class="task-actions-wrapper" id="task_actions_'+task.taskId+'"><div class="normal-btns">';
                if(totalSub < 10) html += '<button class="action-btn" onclick="document.getElementById(\\'subtaskTaskId\\').value=\\''+task.taskId+'\\'; openModal(\\'addSubtaskModal\\')"><i class="fas fa-plus"></i></button>';
                html += '<button class="action-btn" onclick="completeTask(\\''+task.taskId+'\\')"><i class="fas fa-check"></i></button><button class="action-btn delete" onclick="deleteTask(\\''+task.taskId+'\\')"><i class="fas fa-trash"></i></button></div>';
                
                html += '<div class="priority-btns"><button class="action-btn" onclick="moveTask(\\''+task.taskId+'\\',\\'up\\')"><i class="fas fa-arrow-up"></i></button><button class="action-btn" onclick="moveTask(\\''+task.taskId+'\\',\\'down\\')"><i class="fas fa-arrow-down"></i></button></div></div></div>';
                
                if(task.description) html += '<div id="desc_'+task.taskId+'" class="hidden"><div class="task-description">'+preserveLineBreaks(task.description)+'</div></div>';
                html += '<div class="task-time-row"><span class="date-chip"><i class="fas fa-calendar-alt"></i> '+task.dateIST+'</span><span class="time-chip"><i class="fas fa-clock"></i> '+st+' - '+et+'</span></div>';
                
                if(totalSub > 0) {
                    html += '<details style="margin-top:8px;"><summary style="font-weight:600; font-size:0.95rem; cursor:pointer; color:var(--accent-light);"><i class="fas fa-tasks"></i> Subtasks ('+compSub+'/'+totalSub+')</summary><div class="subtasks-container">';
                    task.subtasks.forEach(sub => {
                        html += '<div class="subtask-item"><div class="subtask-main-row"><div class="subtask-checkbox '+(sub.completed?'completed':'')+'" onclick="toggleSubtask(event, \\''+task.taskId+'\\', \\''+sub.id+'\\')">'+(sub.completed?'<i class="fas fa-check"></i>':'')+'</div>';
                        html += '<div class="subtask-details" oncontextmenu="event.preventDefault(); toggleSubPrio(\\''+task.taskId+'\\',\\''+sub.id+'\\')"><div class="subtask-title '+(sub.completed?'completed':'')+'">'+escapeHtml(sub.title)+'</div></div>';
                        html += '<div class="task-actions-wrapper" id="sub_actions_'+sub.id+'"><div class="normal-btns"><button class="subtask-btn delete" onclick="deleteSubtask(\\''+task.taskId+'\\',\\''+sub.id+'\\')"><i class="fas fa-trash"></i></button></div><div class="priority-btns"><button class="subtask-btn" onclick="moveSub(\\''+task.taskId+'\\',\\''+sub.id+'\\',\\'up\\')"><i class="fas fa-arrow-up"></i></button><button class="subtask-btn" onclick="moveSub(\\''+task.taskId+'\\',\\''+sub.id+'\\',\\'down\\')"><i class="fas fa-arrow-down"></i></button></div></div></div></div>';
                    });
                    html += '</div></details>';
                }
                html += '</div>';
            });
            return html + '</div>';
        }

        function toggleTaskPrio(id) { document.querySelectorAll('.priority-mode').forEach(e=>e.classList.remove('priority-mode')); document.getElementById('task_actions_'+id).classList.add('priority-mode'); }
        function toggleSubPrio(tid, sid) { document.querySelectorAll('.priority-mode').forEach(e=>e.classList.remove('priority-mode')); document.getElementById('sub_actions_'+sid).classList.add('priority-mode'); }

        function submitTaskForm(e) {
            e.preventDefault(); 
            if(document.getElementById('endTime').value <= document.getElementById('startTime').value) { showToast('End time must be after start time!', 'error'); return; }
            fetch('/api/tasks', {method:'POST', body: new URLSearchParams(new FormData(e.target))}).then(r=>{if(r.ok){closeModal('addTaskModal'); showToast('Task created'); switchPage('tasks'); e.target.reset();}});
        }
        
        function completeTask(taskId) {
            tasksData = tasksData.filter(t => t.taskId !== taskId); renderPage();
            fetch('/api/tasks/'+taskId+'/complete', {method:'POST'}).then(()=>{showToast('Task Complete!'); fetch('/api/page/tasks').then(r=>r.json()).then(d=>{tasksData=d.tasks;});});
        }
        
        function deleteTask(taskId) { if(confirm('Delete?')){ fetch('/api/tasks/'+taskId+'/delete', {method:'POST'}).then(()=>{showToast('Deleted'); switchPage('tasks');}); } }
        
        function submitSubtaskForm(e) { e.preventDefault(); fetch('/api/tasks/'+document.getElementById('subtaskTaskId').value+'/subtasks', {method:'POST', body:new URLSearchParams(new FormData(e.target))}).then(()=>{closeModal('addSubtaskModal'); switchPage('tasks'); e.target.reset();}); }
        function deleteSubtask(tid, sid) { if(confirm('Delete?')){ fetch('/api/tasks/'+tid+'/subtasks/'+sid+'/delete', {method:'POST'}).then(()=>{switchPage('tasks');}); } }
        
        function toggleSubtask(e, tid, sid) {
            e.stopPropagation();
            const t = tasksData.find(x=>x.taskId===tid);
            if(t) {
                const s = t.subtasks.find(x=>x.id===sid);
                if(s) s.completed = !s.completed;
                renderPage();
                
                // Auto Complete logic
                if(t.subtasks.every(x=>x.completed)) {
                    setTimeout(()=>completeTask(tid), 400); // slight delay to see the checkmark
                } else {
                    fetch('/api/tasks/'+tid+'/subtasks/'+sid+'/toggle', {method:'POST'});
                }
            }
        }
        
        function moveTask(id, dir) { fetch('/api/tasks/'+id+'/move', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({direction:dir})}).then(()=>switchPage('tasks')); }
        function moveSub(tid, sid, dir) { fetch('/api/tasks/'+tid+'/subtasks/'+sid+'/move', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({direction:dir})}).then(()=>switchPage('tasks')); }

        // ================= GROW ================= //
        function renderGrowShell() {
            return '<details class="grow-panel" open><summary><span>Activity Calendar</span><i class="fas fa-chevron-down"></i></summary><div style="padding:15px;"><div class="grow-month-nav"><button class="action-btn" onclick="changeGrowMonth(-1)"><i class="fas fa-chevron-left"></i></button><h2 id="growMonthYear"></h2><button class="action-btn" onclick="changeGrowMonth(1)"><i class="fas fa-chevron-right"></i></button></div><div class="grow-calendar"><div class="grow-grid" id="growCalendar"></div></div></div></details>' +
                   '<details class="grow-panel" open><summary><span>My Trackers</span><i class="fas fa-chevron-down"></i></summary><div style="padding:15px;" id="growList"></div></details>';
        }

        function renderGrowAll() {
            const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
            document.getElementById("growMonthYear").innerText = months[growMonth] + " " + growYear;
            
            let grid = "";
            ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d => grid += '<div class="grow-weekday">'+d+'</div>');
            
            const firstDay = new Date(growYear, growMonth, 1).getDay();
            const daysInM = new Date(growYear, growMonth+1, 0).getDate();
            let cDay = 1;
            
            for(let i=0; i<42; i++) {
                if(i<firstDay || cDay>daysInM) grid += '<div class="grow-day empty"></div>';
                else {
                    const dStr = growYear + "-" + String(growMonth+1).padStart(2,'0') + "-" + String(cDay).padStart(2,'0');
                    const isToday = dStr === growToday;
                    const dData = growData.progress[dStr] || {};
                    const active = growData.items.filter(g => isGrowActive(g, dStr) && dData[g.id] !== undefined);
                    
                    let bg="transparent", cls="";
                    if(active.length===1) { bg=active[0].color; cls="has-data"; }
                    else if(active.length>1) { bg="conic-gradient("+active.map((g,idx)=>g.color+" "+(idx*100/active.length)+"% "+((idx+1)*100/active.length)+"%").join(", ")+")"; cls="has-data"; }
                    
                    grid += '<div class="grow-day" data-date="'+dStr+'" onclick="handleGrowClick(\\''+dStr+'\\', this)"><div class="grow-circle '+(isToday?'today ':'')+cls+'" style="background:'+bg+'">'+cDay+'</div></div>';
                    cDay++;
                }
            }
            document.getElementById("growCalendar").innerHTML = grid;

            // List
            const listContainer = document.getElementById("growList");
            if(!growData.items.length) { listContainer.innerHTML = '<div style="text-align:center; color:var(--text-secondary-light);"><i class="fas fa-seedling" style="font-size:2rem;"></i><br>No trackers active.</div>'; return; }
            
            let lHtml = "";
            const now = new Date(growToday+"T00:00:00");
            growData.items.forEach(item => {
                let passed = Math.floor((now - new Date(item.startDate+"T00:00:00"))/86400000);
                if(passed<0) passed=0; if(passed>item.endCount) passed=item.endCount;
                let pct = item.endCount ? Math.round((passed/item.endCount)*100) : 0;
                
                lHtml += '<div style="background:var(--hover-light); padding:12px; border-radius:12px; margin-bottom:10px; border-left:4px solid '+item.color+';"><div style="display:flex; justify-content:space-between; font-weight:600; font-size:1.1rem; color:var(--text-primary-light);"><span>'+escapeHtml(item.title)+'</span><button class="action-btn delete" onclick="deleteGrow(\\''+item.id+'\\')" style="width:24px; height:24px; background:transparent;"><i class="fas fa-trash"></i></button></div>';
                lHtml += '<div style="font-size:0.85rem; color:var(--text-secondary-light); margin-top:5px; display:flex; justify-content:space-between;"><span>'+passed+' / '+item.endCount+' Days</span><span>'+pct+'%</span></div></div>';
            });
            listContainer.innerHTML = lHtml;
        }

        function isGrowActive(g, d) {
            const days = Math.floor((new Date(d+"T00:00:00") - new Date(g.startDate+"T00:00:00"))/86400000);
            return days>=0 && days<g.endCount;
        }

        function changeGrowMonth(dir) { growMonth+=dir; if(growMonth>11){growMonth=0; growYear++;} else if(growMonth<0){growMonth=11; growYear--;} renderGrowAll(); }

        function handleGrowClick(date, cell) {
            const active = growData.items.filter(g=>isGrowActive(g, date));
            const dayData = growData.progress[date] || {};
            const allDone = active.length && active.every(g=>dayData[g.id]!==undefined);
            
            if(date === growToday && !allDone) {
                // Open Logger for Today
                document.getElementById('logGrowTitle').innerText = "Log Today's Growth";
                let html = "";
                active.forEach(g => {
                    const done = dayData[g.id]!==undefined;
                    html += '<div style="background:var(--hover-light); padding:12px; border-radius:12px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;"><span style="font-weight:600; font-size:1.1rem; color:var(--text-primary-light);">'+escapeHtml(g.title)+'</span><button class="action-btn" onclick="openQ(\\''+g.id+'\\',\\''+date+'\\')" style="background:'+(done?'var(--success-light)':'var(--accent-light)')+'; color:white;" '+(done?'disabled':'')+'><i class="fas fa-check"></i></button></div>';
                });
                document.getElementById('dailyGrowList').innerHTML = html;
                document.getElementById('logGrowListView').classList.remove('hidden');
                document.getElementById('logGrowQuestionView').classList.add('hidden');
                openModal('logGrowModal');
            } else {
                // Show floating bubble stats
                const bubble = document.getElementById("growBubble");
                let bHtml = '<div style="font-size:0.9rem; font-weight:600; border-bottom:1px solid var(--border-light); padding-bottom:5px; margin-bottom:5px; color:var(--text-primary-light);">'+date+'</div>';
                if(!active.length) bHtml += '<span style="color:var(--text-secondary-light); font-size:0.85rem;">No tasks</span>';
                else active.forEach(g => bHtml += '<div style="display:flex; justify-content:space-between; font-size:0.95rem; color:'+g.color+';"><span>'+escapeHtml(g.title)+'</span><i class="fas '+(dayData[g.id]!==undefined?'fa-check-circle':'fa-circle')+'"></i></div>');
                
                document.getElementById("growBubbleContent").innerHTML = bHtml;
                bubble.style.display = "block";
                
                const rect = cell.getBoundingClientRect();
                bubble.style.top = (rect.top + window.scrollY - bubble.offsetHeight - 10) + "px";
                bubble.style.left = (rect.left + window.scrollX + (rect.width/2) - (bubble.offsetWidth/2)) + "px";
                setTimeout(()=>bubble.style.opacity="1", 10);
            }
        }

        function openQ(id, date) {
            const g = growData.items.find(x=>x.id===id);
            if(g.hasData) {
                growLogContext = {id, date, float: g.type==='float'};
                document.getElementById('qGrowTitle').innerText = g.title;
                document.getElementById('qGrowLabel').innerText = g.question;
                document.getElementById('qGrowInput').innerHTML = '<input type="number" step="'+(g.type==='float'?'0.01':'1')+'" id="growValInp" class="form-control" placeholder="Enter Value">';
                document.getElementById('logGrowListView').classList.add('hidden');
                document.getElementById('logGrowQuestionView').classList.remove('hidden');
            } else {
                saveGrowLog(id, date, true);
            }
        }

        document.getElementById('saveGrowLogBtn').onclick = () => {
            const v = document.getElementById('growValInp').value;
            if(!v) return showToast('Enter value', 'error');
            saveGrowLog(growLogContext.id, growLogContext.date, growLogContext.float ? parseFloat(v) : parseInt(v));
        };

        function saveGrowLog(id, date, val) {
            fetch('/api/grow/log', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({itemId:id, dateStr:date, value:val})})
            .then(()=>{ showToast('Logged!'); closeModal('logGrowModal'); switchPage('grow'); });
        }

        function submitAddGrowForm(e) {
            e.preventDefault();
            const payload = {
                title: document.getElementById("addGrowTitle").value,
                description: document.getElementById("addGrowDesc").value,
                startDate: document.getElementById("addGrowStart").value,
                endCount: document.getElementById("addGrowDays").value,
                color: document.getElementById("addGrowColor").value,
                hasData: document.getElementById("addGrowHasData").checked,
                type: document.getElementById("addGrowType").value,
                question: document.getElementById("addGrowQuestion").value,
                start: document.getElementById("addGrowMin").value,
                end: document.getElementById("addGrowMax").value
            };
            fetch('/api/grow', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)}).then(()=>{closeModal('addGrowModal'); switchPage('grow');});
        }

        function deleteGrow(id) { if(confirm('Delete tracker?')) fetch('/api/grow/'+id+'/delete', {method:'POST'}).then(()=>switchPage('grow')); }

        // ================= NOTES & HISTORY ================= //
        function renderNotes() { return "<div>(Notes feature simplified for space)</div>"; }
        function renderHistory() { return "<div>(History feature simplified for space)</div>"; }

        function openModal(id) { document.getElementById(id).style.display='flex'; }
        function closeModal(id) { document.getElementById(id).style.display='none'; }
        function openAddModal() { if(currentPage==='tasks') openModal('addTaskModal'); else if(currentPage==='grow') { document.getElementById('addGrowStart').value=growToday; openModal('addGrowModal'); } }

        document.addEventListener('DOMContentLoaded', () => {
            renderPage();
            window.addEventListener('click', e => {
                if(e.target.classList.contains('modal')) closeModal(e.target.id);
                if(!e.target.closest('.grow-day') && !e.target.closest('.grow-bubble')) document.getElementById('growBubble').style.opacity="0";
                if(!e.target.closest('.priority-btns') && !e.target.closest('.task-title')) document.querySelectorAll('.priority-mode').forEach(el=>el.classList.remove('priority-mode'));
            });
        });
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
            console.log('✅ Connected to MongoDB');
            
            let s = await db.collection('settings').findOne({ _id: 'bot_config' });
            if (!s) {
                await db.collection('settings').insertOne({ _id: 'bot_config', reminders: true, hourly: true, alerts: true, theme: 'dark' });
            } else {
                globalSettings = { ...globalSettings, ...s };
            }
            
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
// 🤖 BOT SETUP & SCHEDULERS
// ==========================================
const bot = new Telegraf(BOT_TOKEN);
const activeSchedules = new Map();
let isShuttingDown = false;
let activeReminderMessageIds = [];
let currentReminderTaskId = null;

bot.use(async (ctx, next) => {
    if (ctx.from && String(ctx.from.id) !== String(CHAT_ID)) {
        return ctx.reply('🚫 Admin has restricted new users to use the task manager bot.');
    }
    return next();
});

async function sendStartMenu(ctx) {
    try {
        const istDateObj = getCurrentISTDisplay();
        const startOfDayUTC = istToUTC(istDateObj.date, "00:00");
        const endOfDayUTC = istToUTC(istDateObj.date, "23:59");

        const pendingTasks = await db.collection('tasks').find({
            status: 'pending', nextOccurrence: { $gte: startOfDayUTC, $lt: endOfDayUTC }
        }).sort({ orderIndex: 1 }).toArray();

        const todayHistory = await db.collection('history').find({ completedDateStr: istDateObj.displayDate }).toArray();
        const completedTaskIds = [...new Set(todayHistory.map(h => h.taskId))];
        
        let completedTasks = [];
        if (completedTaskIds.length > 0) {
            const activeC = await db.collection('tasks').find({ taskId: { $in: completedTaskIds } }).toArray();
            const deletedC = await db.collection('deleted_tasks').find({ taskId: { $in: completedTaskIds } }).toArray();
            const combined = {};
            activeC.forEach(t => combined[t.taskId] = t);
            deletedC.forEach(t => { if (!combined[t.taskId]) combined[t.taskId] = t; });
            completedTasks = Object.values(combined).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        }

        const total = pendingTasks.length + completedTasks.length;
        
        let percentage = 0;
        let progressBar = '▱▱▱▱▱▱▱▱▱▱'; 
        
        if (total > 0) {
            percentage = Math.round((completedTasks.length / total) * 100);
            const filledCount = Math.round(percentage / 10);
            progressBar = '▰'.repeat(filledCount) + '▱'.repeat(10 - filledCount);
        }

        let msg = `🌟 <b>Welcome, ${ctx.from.first_name || 'Admin'}!</b>\n\n`;
        msg += `📊 <b>Progress:</b> ${progressBar} ${percentage}%\n`;
        msg += `🎯 <b>You have completed <i>${completedTasks.length}/${total}</i> tasks yet.</b>\n`;
        
        if (total > 0) {
            msg += `<blockquote expandable>\n`;
            completedTasks.forEach(t => msg += `✅ ${escapeHTML(t.title)} (${t.startTimeStr} - ${t.endTimeStr})\n`);
            pendingTasks.forEach(t => msg += `❌ ${escapeHTML(t.title)} (${t.startTimeStr} - ${t.endTimeStr})\n`);
            msg += `</blockquote>\n`;
        }
        
        msg += `🔔 Alerts: ${globalSettings.alerts ? '🟢 ON' : '🔴 OFF'}\n`;
        msg += `📣 Hourly Notif: ${globalSettings.hourly ? '🟢 ON' : '🔴 OFF'}\n`;
        msg += `⏰ Reminders: ${globalSettings.reminders ? '🟢 ON' : '🔴 OFF'}`;

        const kb = Markup.inlineKeyboard([
            [ Markup.button.webApp('🌐 Open Mini App', WEB_APP_URL) ],
            [ Markup.button.callback('⚙️ Bot Settings', 'open_settings') ]
        ]);

        if (ctx.callbackQuery) {
            await ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: kb.reply_markup });
        } else {
            await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb.reply_markup });
        }
    } catch (err) {}
}

bot.command('start', sendStartMenu);

bot.action('open_settings', async (ctx) => {
    const kb = Markup.inlineKeyboard([
        [ Markup.button.callback(globalSettings.alerts ? '🟢 Alerts: ON' : '🔴 Alerts: OFF', 'toggle_alerts') ],
        [ Markup.button.callback(globalSettings.reminders ? '🟢 Reminders: ON' : '🔴 Reminders: OFF', 'toggle_reminders') ],
        [ Markup.button.callback(globalSettings.hourly ? '🟢 Hourly Notif: ON' : '🔴 Hourly Notif: OFF', 'toggle_hourly') ],
        [ Markup.button.callback('⬅️ Back', 'back_start') ]
    ]);
    await ctx.editMessageText('⚙️ <b>Bot Settings</b>\nConfigure your notifications:', { parse_mode: 'HTML', reply_markup: kb.reply_markup });
});

bot.action('back_start', sendStartMenu);

bot.action(['toggle_reminders', 'toggle_hourly', 'toggle_alerts'], async (ctx) => {
    const key = ctx.match[0].replace('toggle_', '');
    globalSettings[key] = !globalSettings[key];
    await db.collection('settings').updateOne({ _id: 'bot_config' }, { $set: { [key]: globalSettings[key] } }, { upsert: true });
    await bot.handleUpdate({ ...ctx.update, callback_query: { ...ctx.callbackQuery, data: 'open_settings' }});
});

function scheduleTask(task) {
    if (!task || !task.taskId || !task.nextOccurrence) return;
    try {
        const taskId = task.taskId;
        const targetTimeUTC = new Date(task.nextOccurrence);
        const nowUTC = new Date();

        cancelTaskSchedule(taskId);
        if (targetTimeUTC <= nowUTC) return;

        const notifyTimeUTC = new Date(targetTimeUTC.getTime() - 10 * 60000);
        const triggerDateUTC = notifyTimeUTC > nowUTC ? notifyTimeUTC : nowUTC;

        const startJob = schedule.scheduleJob(triggerDateUTC, async function() {
            if (isShuttingDown || !globalSettings.reminders) return;
            let count = 0;
            const maxNotifications = 10;
            
            const sendNotification = async () => {
                if (isShuttingDown || !globalSettings.reminders) return;
                const currentTimeUTC = new Date();
                
                if (currentReminderTaskId !== taskId) {
                    for (const msgId of activeReminderMessageIds) {
                        try { await bot.telegram.deleteMessage(CHAT_ID, msgId); } catch(e){}
                    }
                    activeReminderMessageIds = [];
                    currentReminderTaskId = taskId;
                }

                if (currentTimeUTC >= targetTimeUTC || count >= maxNotifications) {
                    const activeSchedule = activeSchedules.get(taskId);
                    if (activeSchedule && activeSchedule.interval) {
                        clearInterval(activeSchedule.interval);
                        activeSchedule.interval = null;
                    }
                    if (currentTimeUTC >= targetTimeUTC) {
                        try { 
                            const sent = await bot.telegram.sendMessage(CHAT_ID, `🚀 <b>START NOW:</b> ${escapeHTML(task.title)}\n🕒 <b>Time:</b> ${task.startTimeStr} to ${task.endTimeStr}`, { parse_mode: 'HTML' }); 
                            activeReminderMessageIds.push(sent.message_id);
                        } catch (e) {}
                    }
                    return;
                }
                const minutesLeft = Math.ceil((targetTimeUTC - currentTimeUTC) / 60000);
                if (minutesLeft > 0) {
                    try { 
                        const sent = await bot.telegram.sendMessage(CHAT_ID, `🔔 <b>In ${minutesLeft}m:</b> ${escapeHTML(task.title)}\n🕒 <b>Time:</b> ${task.startTimeStr} to ${task.endTimeStr}`, { parse_mode: 'HTML' }); 
                        activeReminderMessageIds.push(sent.message_id);
                    } catch (e) {}
                }
                count++;
            };
            
            await sendNotification();
            if(globalSettings.reminders) {
                const interval = setInterval(sendNotification, 60000);
                if (activeSchedules.has(taskId)) {
                    if (activeSchedules.get(taskId).interval) clearInterval(activeSchedules.get(taskId).interval);
                    activeSchedules.get(taskId).interval = interval;
                } else { activeSchedules.set(taskId, { startJob, interval }); }
            }
        });
        
        if (activeSchedules.has(taskId)) {
            if (activeSchedules.get(taskId).startJob) activeSchedules.get(taskId).startJob.cancel();
            activeSchedules.get(taskId).startJob = startJob;
        } else { activeSchedules.set(taskId, { startJob }); }
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
        const tasks = await db.collection('tasks').find({ status: 'pending', nextOccurrence: { $gt: new Date() } }).toArray();
        tasks.forEach(task => scheduleTask(task));
    } catch (error) {}
}

function setupAutoCompletion() {
    const rule = new schedule.RecurrenceRule();
    rule.hour = 23; rule.minute = 57; rule.tz = 'Asia/Kolkata';

    schedule.scheduleJob(rule, async function() {
        if (isShuttingDown) return;
        try {
            const istDateObj = getCurrentISTDisplay();
            const startOfDayUTC = istToUTC(istDateObj.date, "00:00");
            const endOfDayUTC = istToUTC(istDateObj.date, "23:59");

            const pendingTasks = await db.collection('tasks').find({ status: 'pending', nextOccurrence: { $gte: startOfDayUTC, $lt: endOfDayUTC } }).toArray();

            for (const task of pendingTasks) {
                await db.collection('history').insertOne({ taskId: task.taskId, completedAt: new Date(), completedDateStr: istDateObj.displayDate, completedTimeStr: istDateObj.displayTime, status: 'completed', subtasks: task.subtasks || [] });
                cancelTaskSchedule(task.taskId);

                if (task.repeat !== 'none' && task.repeatCount > 0) {
                    const nextUTC = new Date(task.nextOccurrence);
                    nextUTC.setUTCDate(nextUTC.getUTCDate() + (task.repeat === 'weekly' ? 7 : 1));
                    await db.collection('tasks').updateOne({ taskId: task.taskId }, { $set: { nextOccurrence: nextUTC, repeatCount: task.repeatCount - 1, startDate: nextUTC, startDateStr: formatLegacyIST(nextUTC, 'date'), endDate: new Date(nextUTC.getTime() + (task.endDate.getTime() - task.startDate.getTime())), subtasks: (task.subtasks || []).map(s => ({...s, completed: false})) }});
                    const t = await db.collection('tasks').findOne({ taskId: task.taskId });
                    if (t && t.nextOccurrence > new Date()) scheduleTask(t);
                } else {
                    await db.collection('deleted_tasks').insertOne({ ...task, deletedAt: new Date(), deleteReason: 'auto_completed' });
                    await db.collection('tasks').deleteOne({ taskId: task.taskId });
                }
            }
        } catch (error) { }
    });
}

function setupHourlyNotifications() {
    const rule = new schedule.RecurrenceRule();
    rule.minute = 0; rule.hour = new schedule.Range(8, 23); rule.tz = 'Asia/Kolkata';

    schedule.scheduleJob(rule, async function() {
        if (isShuttingDown || !globalSettings.hourly) return;
        try {
            const istDateObj = getCurrentISTDisplay();
            const startOfDayUTC = istToUTC(istDateObj.date, "00:00");
            const endOfDayUTC = istToUTC(istDateObj.date, "23:59");

            const istDate = new Date(Date.now() + IST_OFFSET_MS);
            const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

            const pendingTasks = await db.collection('tasks').find({ status: 'pending', nextOccurrence: { $gte: startOfDayUTC, $lt: endOfDayUTC } }).sort({ orderIndex: 1 }).toArray();
            const todayHistory = await db.collection('history').find({ completedDateStr: istDateObj.displayDate }).toArray();

            const completedTaskIds = [...new Set(todayHistory.map(h => h.taskId))];
            
            let completedTasks = [];
            if (completedTaskIds.length > 0) {
                const activeC = await db.collection('tasks').find({ taskId: { $in: completedTaskIds } }).toArray();
                const deletedC = await db.collection('deleted_tasks').find({ taskId: { $in: completedTaskIds } }).toArray();
                
                const combined = {};
                activeC.forEach(t => combined[t.taskId] = t);
                deletedC.forEach(t => { if (!combined[t.taskId]) combined[t.taskId] = t; });
                completedTasks = Object.values(combined).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
            }

            const totalTasks = pendingTasks.length + completedTasks.length;
            if (totalTasks === 0) return;

            let msg = `🕒 <b>Hourly Status Update</b>\n📅 ${istDateObj.displayDate} - ${daysOfWeek[istDate.getUTCDay()]}\n`;
            msg += `🎯 You have completed <i>${completedTasks.length}/${totalTasks}</i> tasks today.\n\n`;

            msg += `<blockquote expandable>\n`;
            completedTasks.forEach(t => msg += `✅ ${escapeHTML(t.title)} (${t.startTimeStr} - ${t.endTimeStr})\n`);
            pendingTasks.forEach(t => msg += `❌ ${escapeHTML(t.title)} (${t.startTimeStr} - ${t.endTimeStr})\n`);
            msg += `</blockquote>`;

            await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' });
        } catch (e) {}
    });
}

// ==========================================
// 📱 WEB INTERFACE ROUTES
// ==========================================
app.get('/', (req, res) => res.redirect('/tasks'));

app.get('/:page', async (req, res) => {
    try {
        const istDateObj = getCurrentISTDisplay();
        const settings = await db.collection('settings').findOne({ _id: 'bot_config' }) || globalSettings;
        res.render('index', { currentPage: req.params.page, tasks: [], notes: [], groupedHistory: {}, growData: {items: [], progress: {}}, currentTime: istDateObj.displayTime, currentDate: istDateObj.displayDate, currentDateObj: istDateObj, settings });
    } catch (error) { res.status(500).send("Server Error"); }
});

app.post('/api/settings', async (req, res) => {
    try {
        globalSettings = { ...globalSettings, ...req.body };
        await db.collection('settings').updateOne({ _id: 'bot_config' }, { $set: req.body }, { upsert: true });
        res.json({success: true});
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.get('/api/page/:page', async (req, res) => {
    try {
        const page = req.params.page;
        if (page === 'tasks') {
            const istDateObj = getCurrentISTDisplay();
            const startOfDayUTC = istToUTC(istDateObj.date, "00:00");
            const endOfDayUTC = istToUTC(istDateObj.date, "23:59");
            const tasks = await db.collection('tasks').find({ status: 'pending', nextOccurrence: { $gte: startOfDayUTC, $lt: endOfDayUTC } }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray();
            res.json({ tasks: tasks.map(t => ({ ...t, startTimeIST: t.startTimeStr || formatLegacyIST(t.startDate, 'time'), endTimeIST: t.endTimeStr || formatLegacyIST(t.endDate, 'time'), dateIST: t.startDateStr || formatLegacyIST(t.startDate, 'date') })) });
        } else if (page === 'grow') {
            const items = await db.collection('grow').find().toArray();
            const progress = {};
            items.forEach(i => { if(i.progress) { for(const [d, v] of Object.entries(i.progress)) { if(!progress[d]) progress[d] = {}; progress[d][i.id] = v; } } });
            res.json({ growData: { items, progress } });
        } else { res.json({}); }
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/tasks', async (req, res) => {
    try {
        const { title, description, startDate, startTime, endTime, repeat, repeatCount } = req.body;
        const startDateUTC = istToUTC(startDate, startTime); 
        const endDateUTC = istToUTC(startDate, endTime);
        const task = { 
            taskId: "t"+Math.random().toString(36).substring(2, 10), title: title.trim(), description: description ? description.trim() : '', 
            startDate: startDateUTC, endDate: endDateUTC, nextOccurrence: startDateUTC, status: 'pending', repeat: repeat || 'none', repeatCount: repeat && repeat !== 'none' ? (parseInt(repeatCount) || 7) : 0, 
            subtasks: [], createdAt: new Date(), orderIndex: await db.collection('tasks').countDocuments(), startTimeStr: startTime, endTimeStr: endTime, startDateStr: startDate 
        };
        await db.collection('tasks').insertOne(task);
        if (task.startDate > new Date()) scheduleTask(task);
        sendAlert(`📝 <b>Task Created:</b> ${escapeHTML(title)}`);
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/update', async (req, res) => {
    try {
        const { title, description, startDate, startTime, endTime, repeat, repeatCount } = req.body;
        const startDateUTC = istToUTC(startDate, startTime); const endDateUTC = istToUTC(startDate, endTime);
        cancelTaskSchedule(req.params.taskId);
        await db.collection('tasks').updateOne({ taskId: req.params.taskId }, { $set: { title: title.trim(), description: description ? description.trim() : '', startDate: startDateUTC, endDate: endDateUTC, nextOccurrence: startDateUTC, repeat: repeat || 'none', repeatCount: repeat && repeat !== 'none' ? (parseInt(repeatCount) || 7) : 0, startTimeStr: startTime, endTimeStr: endTime, startDateStr: startDate, updatedAt: new Date() } });
        const t = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        if (t && t.nextOccurrence > new Date()) scheduleTask(t);
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/complete', async (req, res) => {
    try {
        const task = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        const istNow = getCurrentISTDisplay();
        await db.collection('history').insertOne({ taskId: task.taskId, completedAt: new Date(), completedDateStr: istNow.displayDate, completedTimeStr: istNow.displayTime, status: 'completed', subtasks: task.subtasks || [] });
        cancelTaskSchedule(task.taskId);
        
        if (task.repeat !== 'none' && task.repeatCount > 0) {
            const nextUTC = new Date(task.nextOccurrence); nextUTC.setUTCDate(nextUTC.getUTCDate() + (task.repeat === 'weekly' ? 7 : 1));
            await db.collection('tasks').updateOne({ taskId: task.taskId }, { $set: { nextOccurrence: nextUTC, repeatCount: task.repeatCount - 1, startDate: nextUTC, startDateStr: formatLegacyIST(nextUTC, 'date'), endDate: new Date(nextUTC.getTime() + (task.endDate.getTime() - task.startDate.getTime())), subtasks: (task.subtasks || []).map(s => ({...s, completed: false})) } });
            const t = await db.collection('tasks').findOne({ taskId: task.taskId });
            if (t && t.nextOccurrence > new Date()) scheduleTask(t);
        } else {
            await db.collection('deleted_tasks').insertOne({ ...task, deletedAt: new Date(), deleteReason: 'completed' });
            await db.collection('tasks').deleteOne({ taskId: task.taskId });
        }
        sendAlert(`✅ <b>Task Completed:</b> ${escapeHTML(task.title)}`);
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/move', async (req, res) => {
    try {
        const { direction } = req.body;
        const tasks = await db.collection('tasks').find({ status: 'pending' }).sort({ orderIndex: 1 }).toArray();
        const idx = tasks.findIndex(t => t.taskId === req.params.taskId);
        if (direction === 'up' && idx > 0) {
            await db.collection('tasks').updateOne({ taskId: tasks[idx].taskId }, { $set: { orderIndex: tasks[idx-1].orderIndex } });
            await db.collection('tasks').updateOne({ taskId: tasks[idx-1].taskId }, { $set: { orderIndex: tasks[idx].orderIndex } });
        } else if (direction === 'down' && idx < tasks.length - 1) {
            await db.collection('tasks').updateOne({ taskId: tasks[idx].taskId }, { $set: { orderIndex: tasks[idx+1].orderIndex } });
            await db.collection('tasks').updateOne({ taskId: tasks[idx+1].taskId }, { $set: { orderIndex: tasks[idx].orderIndex } });
        }
        res.json({success:true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/delete', async (req, res) => {
    try {
        const t = await db.collection('tasks').findOne({taskId: req.params.taskId});
        cancelTaskSchedule(req.params.taskId);
        if(t) {
            await db.collection('deleted_tasks').insertOne({ ...t, deletedAt: new Date(), deleteReason: 'manual' });
            await db.collection('tasks').deleteOne({ taskId: req.params.taskId });
        }
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks', async (req, res) => {
    try {
        await db.collection('tasks').updateOne({ taskId: req.params.taskId }, { $push: { subtasks: { id: "s"+Date.now(), title: req.body.title.trim(), description: req.body.description || '', completed: false } } });
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/toggle', async (req, res) => {
    try {
        const task = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        const sub = (task.subtasks || []).find(s => s.id === req.params.subtaskId);
        await db.collection('tasks').updateOne({ taskId: req.params.taskId, "subtasks.id": req.params.subtaskId }, { $set: { "subtasks.$.completed": !sub.completed } });
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/delete', async (req, res) => {
    try { await db.collection('tasks').updateOne({ taskId: req.params.taskId }, { $pull: { subtasks: { id: req.params.subtaskId } } }); res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/move', async (req, res) => {
    try {
        const task = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        const subs = task.subtasks || [];
        const idx = subs.findIndex(s => s.id === req.params.subtaskId);
        if (req.body.direction === 'up' && idx > 0) [subs[idx], subs[idx-1]] = [subs[idx-1], subs[idx]];
        else if (req.body.direction === 'down' && idx < subs.length - 1) [subs[idx], subs[idx+1]] = [subs[idx+1], subs[idx]];
        await db.collection('tasks').updateOne({ taskId: req.params.taskId }, { $set: { subtasks: subs } });
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/grow', async (req, res) => {
    try {
        const { title, description, startDate, endCount, color, hasData, type, question, start, end } = req.body;
        const item = { id: "g"+Date.now(), title, description: description || '', startDate, endCount: parseInt(endCount), color, hasData: hasData === true, type: hasData ? type : 'boolean', progress: {} };
        if (item.hasData) { item.question = question || ''; if (start) item.start = type === 'float' ? parseFloat(start) : parseInt(start); if (end) item.end = type === 'float' ? parseFloat(end) : parseInt(end); }
        await db.collection('grow').insertOne(item);
        sendAlert(`🌱 <b>Grow Tracker Added:</b> ${escapeHTML(title)}`);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/grow/:id/delete', async (req, res) => {
    try { await db.collection('grow').deleteOne({ id: req.params.id }); res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/grow/log', async (req, res) => {
    try { await db.collection('grow').updateOne({ id: req.body.itemId }, { $set: { [`progress.${req.body.dateStr}`]: req.body.value } }); res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ==========================================
// 🚀 BOOTSTRAP
// ==========================================
async function start() {
    try {
        if (await connectDB()) {
            await rescheduleAllPending();
            setupHourlyNotifications();
            setupAutoCompletion();
            app.listen(PORT, '0.0.0.0', () => console.log('🌐 Web interface running on port ' + PORT));
            await bot.launch();
            console.log('🤖 Bot Started Successfully!');
        } else { setTimeout(start, 5000); }
    } catch (error) { setTimeout(start, 10000); }
}
process.once('SIGINT', () => { isShuttingDown = true; bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { isShuttingDown = true; bot.stop('SIGTERM'); process.exit(0); });
start();
