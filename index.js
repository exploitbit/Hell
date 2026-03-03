const { Telegraf, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const schedule = require('node-schedule');
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
// 🎨 EJS TEMPLATE - EXACTLY AS BEFORE
// ==========================================
function formatDateUTC(dateObj) { return formatISTDate(dateObj); }
function formatTimeUTC(dateObj) { return formatISTTime(dateObj); }

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
        :root {
            --bg-light: #f5f7fa;
            --card-bg-light: #ffffff;
            --text-primary-light: #1e293b;
            --text-secondary-light: #475569;
            --border-light: #e2e8f0;
            --accent-light: #2563eb;
            --accent-soft-light: #dbeafe;
            --success-light: #059669;
            --warning-light: #d97706;
            --danger-light: #dc2626;
            --hover-light: #f1f5f9;
            --progress-bg-light: #e2e8f0;
            
            --bg-dark: #0f172a;
            --card-bg-dark: #1e293b;
            --text-primary-dark: #f8fafc;
            --text-secondary-dark: #cbd5e1;
            --border-dark: #334155;
            --accent-dark: #60a5fa;
            --accent-soft-dark: #1e3a5f;
            --success-dark: #34d399;
            --warning-dark: #fbbf24;
            --danger-dark: #f87171;
            --hover-dark: #2d3b4f;
            --progress-bg-dark: #334155;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        body { background: var(--bg-light); color: var(--text-primary-light); transition: all 0.2s ease; min-height: 100vh; font-size: 13px; line-height: 1.4; }
        @media (prefers-color-scheme: dark) { body { background: var(--bg-dark); color: var(--text-primary-dark); } }
        .app-header { background: var(--card-bg-light); border-bottom: 1px solid var(--border-light); padding: 10px 16px; position: sticky; top: 0; z-index: 100; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        @media (prefers-color-scheme: dark) { .app-header { background: var(--card-bg-dark); border-bottom: 1px solid var(--border-dark); } }
        .nav-container { max-width: 1400px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
        .nav-links { display: flex; gap: 4px; background: var(--hover-light); padding: 3px; border-radius: 100px; }
        @media (prefers-color-scheme: dark) { .nav-links { background: var(--hover-dark); } }
        .nav-btn { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 100px; border: none; background: transparent; color: var(--text-secondary-light); font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s ease; }
        @media (prefers-color-scheme: dark) { .nav-btn { color: var(--text-secondary-dark); } }
        .nav-btn.active { background: var(--card-bg-light); color: var(--accent-light); box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
        @media (prefers-color-scheme: dark) { .nav-btn.active { background: var(--card-bg-dark); color: var(--accent-dark); box-shadow: 0 2px 6px rgba(0,0,0,0.2); } }
        .time-badge { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--accent-soft-light); border-radius: 100px; font-size: 0.75rem; font-weight: 500; color: var(--accent-light); }
        @media (prefers-color-scheme: dark) { .time-badge { background: var(--accent-soft-dark); color: var(--accent-dark); } }
        .main-content { max-width: 1400px; margin: 16px auto; padding: 0 16px; padding-bottom: 80px; }
        .page-title { font-size: 1.5rem; font-weight: 700; margin-bottom: 16px; }
        .tasks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; margin-top: 16px; }
        .task-card, .note-card, .history-date-card { background: var(--card-bg-light); border: 1px solid var(--border-light); border-radius: 16px; padding: 16px; transition: all 0.2s ease; word-wrap: break-word; overflow-wrap: break-word; }
        @media (prefers-color-scheme: dark) { .task-card, .note-card, .history-date-card { background: var(--card-bg-dark); border: 1px solid var(--border-dark); } }
        .note-card { margin-bottom: 12px; }
        .task-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; width: 100%; }
        .task-title-section { flex: 1; min-width: 0; }
        .task-title { font-size: 1.1rem; font-weight: 700; color: var(--text-primary-light); margin-bottom: 4px; line-height: 1.3; word-break: break-word; cursor: pointer; display: inline-block; }
        @media (prefers-color-scheme: dark) { .task-title { color: var(--text-primary-dark); } }
        .task-description-container { margin: 8px 0 4px 0; width: 100%; }
        .task-description { font-size: 0.85rem; color: var(--text-secondary-light); padding: 4px 6px; background: var(--hover-light); border-radius: 10px; border-left: 3px solid var(--accent-light); word-break: break-word; white-space: pre-wrap; width: 100%; box-sizing: border-box; line-height: 1.4; }
        @media (prefers-color-scheme: dark) { .task-description { color: var(--text-secondary-dark); background: var(--hover-dark); } }
        .task-time-row { display: flex; justify-content: space-between; align-items: center; width: 100%; margin: 8px 0 4px 0; }
        .date-chip, .time-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: var(--hover-light); border-radius: 100px; font-size: 0.75rem; font-weight: 500; color: var(--text-secondary-light); width: fit-content; }
        @media (prefers-color-scheme: dark) { .date-chip, .time-chip { background: var(--hover-dark); color: var(--text-secondary-dark); } }
        .task-actions { display: flex; gap: 4px; flex-shrink: 0; }
        .action-btn { width: 30px; height: 30px; border-radius: 8px; border: none; background: var(--hover-light); color: var(--text-secondary-light); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; font-size: 0.8rem; }
        @media (prefers-color-scheme: dark) { .action-btn { background: var(--hover-dark); color: var(--text-secondary-dark); } }
        .action-btn:hover { background: var(--accent-light); color: white; }
        .action-btn.delete:hover { background: var(--danger-light); }
        .progress-section { display: flex; align-items: center; gap: 12px; margin: 12px 0; cursor: pointer; }
        .progress-ring-small { position: relative; width: 40px; height: 40px; }
        .progress-ring-circle-small { transition: stroke-dashoffset 0.5s; transform: rotate(-90deg); transform-origin: 50% 50%; }
        .progress-text-small { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 0.7rem; font-weight: 700; color: var(--accent-light); }
        @media (prefers-color-scheme: dark) { .progress-text-small { color: var(--accent-dark); } }
        .subtasks-container { margin-top: 12px; border-top: 1px solid var(--border-light); padding-top: 12px; width: 100%; }
        @media (prefers-color-scheme: dark) { .subtasks-container { border-top-color: var(--border-dark); } }
        .subtask-item { display: flex; flex-direction: column; background: var(--hover-light); border-radius: 10px; margin-bottom: 8px; padding: 8px; width: 100%; }
        @media (prefers-color-scheme: dark) { .subtask-item { background: var(--hover-dark); } }
        .subtask-main-row { display: flex; align-items: flex-start; gap: 8px; width: 100%; }
        .subtask-checkbox { width: 20px; height: 20px; border-radius: 6px; border: 2px solid var(--accent-light); background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; color: white; font-size: 0.7rem; flex-shrink: 0; margin-top: 1px; }
        .subtask-checkbox.completed { background: var(--success-light); border-color: var(--success-light); }
        .subtask-details { flex: 1; min-width: 0; }
        .subtask-title { font-weight: 600; color: var(--text-primary-light); margin-bottom: 2px; font-size: 0.85rem; word-break: break-word; cursor: pointer; }
        .subtask-title.completed { text-decoration: line-through; color: var(--text-secondary-light); }
        .subtask-actions { display: flex; gap: 4px; flex-shrink: 0; }
        .subtask-btn { width: 26px; height: 26px; border-radius: 6px; border: none; background: var(--card-bg-light); color: var(--text-secondary-light); cursor: pointer; transition: all 0.2s ease; font-size: 0.75rem; display: flex; align-items: center; justify-content: center; }
        @media (prefers-color-scheme: dark) { .subtask-btn { background: var(--card-bg-dark); color: var(--text-secondary-dark); } }
        .subtask-btn:hover { background: var(--accent-light); color: white; }
        .subtask-btn.delete:hover { background: var(--danger-light); }
        .subtask-description-container { margin-top: 6px; margin-left: 28px; width: calc(100% - 28px); }
        .subtask-description { font-size: 0.8rem; color: var(--text-secondary-light); padding: 4px 6px; background: var(--card-bg-light); border-radius: 8px; border-left: 2px solid var(--accent-light); word-break: break-word; white-space: pre-wrap; width: 100%; box-sizing: border-box; max-width: 100%; line-height: 1.4; }
        @media (prefers-color-scheme: dark) { .subtask-description { background: var(--card-bg-dark); color: var(--text-secondary-dark); } }
        .badge { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 100px; font-size: 0.7rem; font-weight: 600; gap: 4px; background: var(--hover-light); color: var(--text-secondary-light); width: fit-content; }
        @media (prefers-color-scheme: dark) { .badge { background: var(--hover-dark); color: var(--text-secondary-dark); } }
        .note-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; width: 100%; }
        .note-title { font-size: 1.1rem; font-weight: 700; color: var(--text-primary-light); word-break: break-word; flex: 1; cursor: pointer; }
        @media (prefers-color-scheme: dark) { .note-title { color: var(--text-primary-dark); } }
        .note-content-container { margin: 4px 0 8px 0; width: 100%; }
        .note-content { font-size: 0.85rem; color: var(--text-secondary-light); padding: 4px 6px; background: var(--hover-light); border-radius: 10px; border-left: 3px solid var(--accent-light); word-break: break-word; white-space: pre-wrap; width: 100%; box-sizing: border-box; max-width: 100%; line-height: 1.4; }
        @media (prefers-color-scheme: dark) { .note-content { color: var(--text-secondary-dark); background: var(--hover-dark); } }
        .note-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-light); font-size: 0.7rem; color: var(--text-secondary-light); }
        @media (prefers-color-scheme: dark) { .note-meta { border-top-color: var(--border-dark); color: var(--text-secondary-dark); } }
        .history-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
        .month-selector { display: flex; align-items: center; gap: 12px; }
        .month-btn { padding: 6px 12px; border-radius: 100px; border: 1px solid var(--border-light); background: var(--card-bg-light); color: var(--text-primary-light); font-size: 0.8rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; }
        @media (prefers-color-scheme: dark) { .month-btn { background: var(--card-bg-dark); border-color: var(--border-dark); color: var(--text-primary-dark); } }
        .history-date-card { margin-bottom: 16px; }
        .history-tasks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-top: 12px; }
        .history-task-card { background: var(--hover-light); border-radius: 12px; padding: 12px; border-left: 3px solid var(--success-light); word-break: break-word; width: 100%; }
        @media (prefers-color-scheme: dark) { .history-task-card { background: var(--hover-dark); } }
        .history-task-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
        .history-task-title { font-size: 0.95rem; font-weight: 700; color: var(--text-primary-light); cursor: pointer; word-break: break-word; flex: 1; }
        @media (prefers-color-scheme: dark) { .history-task-title { color: var(--text-primary-dark); } }
        .history-task-time { font-size: 0.7rem; color: var(--text-secondary-light); flex-shrink: 0; margin-left: auto; padding-left: 8px; }
        .history-description-container { margin: 6px 0 8px 0; width: 100%; }
        .history-description { font-size: 0.8rem; color: var(--text-secondary-light); padding: 4px 6px; background: var(--card-bg-light); border-radius: 8px; border-left: 2px solid var(--success-light); word-break: break-word; white-space: pre-wrap; width: 100%; box-sizing: border-box; max-width: 100%; line-height: 1.4; }
        @media (prefers-color-scheme: dark) { .history-description { background: var(--card-bg-dark); color: var(--text-secondary-dark); } }
        .history-subtask { padding: 6px 6px 6px 20px; border-left: 2px solid var(--border-light); margin: 6px 0; width: 100%; }
        @media (prefers-color-scheme: dark) { .history-subtask { border-left-color: var(--border-dark); } }
        .fab { position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px; border-radius: 28px; background: var(--accent-light); color: white; border: none; font-size: 1.3rem; cursor: pointer; box-shadow: 0 4px 12px rgba(37,99,235,0.3); transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; z-index: 99; }
        @media (prefers-color-scheme: dark) { .fab { background: var(--accent-dark); box-shadow: 0 4px 12px rgba(96,165,250,0.3); } }
        .fab:hover { transform: scale(1.05); }
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: var(--card-bg-light); border: 1px solid var(--border-light); border-radius: 24px; padding: 24px; width: 90%; max-width: 500px; max-height: 85vh; overflow-y: auto; }
        @media (prefers-color-scheme: dark) { .modal-content { background: var(--card-bg-dark); border: 1px solid var(--border-dark); } }
        .form-control { width: 100%; padding: 12px; border-radius: 12px; border: 1px solid var(--border-light); background: var(--bg-light); color: var(--text-primary-light); font-size: 0.9rem; font-family: 'Inter', sans-serif; resize: vertical; }
        textarea.form-control { min-height: 80px; }
        @media (prefers-color-scheme: dark) { .form-control { background: var(--bg-dark); border: 1px solid var(--border-dark); color: var(--text-primary-dark); } }
        .btn { padding: 12px 20px; border-radius: 100px; border: none; font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: all 0.2s ease; }
        .btn-primary { background: var(--accent-light); color: white; }
        @media (prefers-color-scheme: dark) { .btn-primary { background: var(--accent-dark); } }
        .btn-secondary { background: var(--hover-light); color: var(--text-secondary-light); }
        @media (prefers-color-scheme: dark) { .btn-secondary { background: var(--hover-dark); color: var(--text-secondary-dark); } }
        .toast-container { position: fixed; top: 20px; right: 20px; z-index: 9999; }
        .toast { background: #1e293b; color: white; padding: 10px 20px; border-radius: 100px; margin-bottom: 10px; display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 0.85rem; font-weight: 500; }
        @media (prefers-color-scheme: dark) { .toast { background: #0f172a; } }
        .loader { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); display: none; align-items: center; justify-content: center; z-index: 9998; }
        .spinner { width: 48px; height: 48px; border: 4px solid var(--border-light); border-top: 4px solid var(--accent-light); border-radius: 50%; animation: spin 1s linear infinite; }
        @media (prefers-color-scheme: dark) { .spinner { border: 4px solid var(--border-dark); border-top: 4px solid var(--accent-dark); } }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .empty-state { text-align: center; padding: 40px 20px; color: var(--text-secondary-light); background: var(--hover-light); border-radius: 24px; }
        @media (prefers-color-scheme: dark) { .empty-state { background: var(--hover-dark); color: var(--text-secondary-dark); } }
        .task-title-container { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .task-title-container i { font-size: 0.8rem; color: var(--accent-light); }
        .hidden { display: none; }
        .fit-content { width: fit-content; }
        @media (max-width: 768px) { .nav-container { flex-direction: column; align-items: stretch; } .nav-links { width: 100%; justify-content: stretch; } .nav-btn { flex: 1; justify-content: center; padding: 8px 12px; } .time-badge { justify-content: center; } .tasks-grid, .history-tasks-grid { grid-template-columns: 1fr; } }
        .word-break { word-break: break-word; overflow-wrap: break-word; }
        .flex-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .w-100 { width: 100%; }
    </style>
</head>
<body>
    <div class="loader" id="loader"><div class="spinner"></div></div>
    <div class="toast-container" id="toastContainer"></div>

    <div class="app-header">
        <div class="nav-container">
            <div class="nav-links">
                <button class="nav-btn <%= currentPage === 'tasks' ? 'active' : '' %>" onclick="switchPage('tasks')">
                    <i class="fas fa-tasks"></i> <span>Tasks</span>
                </button>
                <button class="nav-btn <%= currentPage === 'notes' ? 'active' : '' %>" onclick="switchPage('notes')">
                    <i class="fas fa-note-sticky"></i> <span>Notes</span>
                </button>
                <button class="nav-btn <%= currentPage === 'history' ? 'active' : '' %>" onclick="switchPage('history')">
                    <i class="fas fa-history"></i> <span>History</span>
                </button>
            </div>
            <div class="time-badge">
                <i class="fas fa-calendar-alt"></i> <span id="currentDateDisplay"><%= currentDate %></span>
                <span style="margin-left: 4px;"><i class="fas fa-clock"></i> <span id="currentTimeDisplay"><%= currentTime %></span></span>
            </div>
        </div>
    </div>

    <button class="fab" id="fabButton" onclick="openAddModal()" title="Add New"><i class="fas fa-plus"></i></button>
    <div class="main-content" id="mainContent"></div>

    <div class="modal" id="addTaskModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;">Create New Task</h2>
                <button class="action-btn" onclick="closeModal('addTaskModal')">&times;</button>
            </div>
            <form id="addTaskForm" onsubmit="submitTaskForm(event)">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Title *</label>
                    <input type="text" class="form-control" name="title" required maxlength="100">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Description</label>
                    <textarea class="form-control" name="description" rows="3" placeholder="Enter description"></textarea>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Start Date</label>
                    <input type="date" class="form-control" name="startDate" id="startDate" required>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div>
                        <label style="font-size: 0.85rem; font-weight: 600;">Start Time</label>
                        <input type="time" class="form-control" name="startTime" id="startTime" required>
                    </div>
                    <div>
                        <label style="font-size: 0.85rem; font-weight: 600;">End Time</label>
                        <input type="time" class="form-control" name="endTime" id="endTime" required>
                    </div>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Repeat</label>
                    <select class="form-control" name="repeat" id="repeatSelect">
                        <option value="none">No Repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                    </select>
                </div>
                <div class="form-group" id="repeatCountGroup" style="margin-bottom: 12px; display: none;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Repeat Count (1-365)</label>
                    <input type="number" class="form-control" name="repeatCount" value="7" min="1" max="365">
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('addTaskModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Create Task</button>
                </div>
            </form>
        </div>
    </div>

    <div class="modal" id="editTaskModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;">Edit Task</h2>
                <button class="action-btn" onclick="closeModal('editTaskModal')">&times;</button>
            </div>
            <form id="editTaskForm" onsubmit="submitEditTaskForm(event)">
                <input type="hidden" name="taskId" id="editTaskId">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Title *</label>
                    <input type="text" class="form-control" name="title" id="editTitle" required maxlength="100">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Description</label>
                    <textarea class="form-control" name="description" id="editDescription" rows="3"></textarea>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Start Date</label>
                    <input type="date" class="form-control" name="startDate" id="editStartDate" required>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div>
                        <label style="font-size: 0.85rem; font-weight: 600;">Start Time</label>
                        <input type="time" class="form-control" name="startTime" id="editStartTime" required>
                    </div>
                    <div>
                        <label style="font-size: 0.85rem; font-weight: 600;">End Time</label>
                        <input type="time" class="form-control" name="endTime" id="editEndTime" required>
                    </div>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Repeat</label>
                    <select class="form-control" name="repeat" id="editRepeatSelect">
                        <option value="none">No Repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                    </select>
                </div>
                <div class="form-group" id="editRepeatCountGroup" style="margin-bottom: 12px; display: none;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Repeat Count</label>
                    <input type="number" class="form-control" name="repeatCount" id="editRepeatCount" min="1" max="365">
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('editTaskModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Update</button>
                </div>
            </form>
        </div>
    </div>

    <div class="modal" id="addSubtaskModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;">Add Subtask</h2>
                <button class="action-btn" onclick="closeModal('addSubtaskModal')">&times;</button>
            </div>
            <form id="addSubtaskForm" onsubmit="submitSubtaskForm(event)">
                <input type="hidden" name="taskId" id="subtaskTaskId">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Title *</label>
                    <input type="text" class="form-control" name="title" required maxlength="100">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Description</label>
                    <textarea class="form-control" name="description" rows="3"></textarea>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('addSubtaskModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Add</button>
                </div>
            </form>
        </div>
    </div>

    <div class="modal" id="editSubtaskModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;">Edit Subtask</h2>
                <button class="action-btn" onclick="closeModal('editSubtaskModal')">&times;</button>
            </div>
            <form id="editSubtaskForm" onsubmit="submitEditSubtaskForm(event)">
                <input type="hidden" name="taskId" id="editSubtaskTaskId">
                <input type="hidden" name="subtaskId" id="editSubtaskId">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Title *</label>
                    <input type="text" class="form-control" name="title" id="editSubtaskTitle" required maxlength="100">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Description</label>
                    <textarea class="form-control" name="description" id="editSubtaskDescription" rows="3"></textarea>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('editSubtaskModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Update</button>
                </div>
            </form>
        </div>
    </div>

    <div class="modal" id="addNoteModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;">Create Note</h2>
                <button class="action-btn" onclick="closeModal('addNoteModal')">&times;</button>
            </div>
            <form id="addNoteForm" onsubmit="submitNoteForm(event)">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Title *</label>
                    <input type="text" class="form-control" name="title" required maxlength="200">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Content</label>
                    <textarea class="form-control" name="description" rows="4"></textarea>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('addNoteModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Save</button>
                </div>
            </form>
        </div>
    </div>

    <div class="modal" id="editNoteModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;">Edit Note</h2>
                <button class="action-btn" onclick="closeModal('editNoteModal')">&times;</button>
            </div>
            <form id="editNoteForm" onsubmit="submitEditNoteForm(event)">
                <input type="hidden" name="noteId" id="editNoteId">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Title *</label>
                    <input type="text" class="form-control" name="title" id="editNoteTitle" required maxlength="200">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Content</label>
                    <textarea class="form-control" name="description" id="editNoteDescription" rows="4"></textarea>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('editNoteModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Update</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();

        // CHROME NOTIFICATION SUPPORT
        function setupBrowserNotifications() {
            if (!("Notification" in window)) return;
            if (Notification.permission !== "granted" && Notification.permission !== "denied") {
                Notification.requestPermission();
            }
        }
        function showBrowserNotification(title, bodyText) {
            if ("Notification" in window && Notification.permission === "granted") {
                const n = new Notification(title, { body: bodyText, icon: "https://telegram.org/favicon.ico" });
                setTimeout(() => n.close(), 5000);
            }
        }
        setupBrowserNotifications();

        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast';
            if (type === 'error') toast.style.background = '#dc2626';
            else if (type === 'warning') toast.style.background = '#d97706';
            let icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
            toast.innerHTML = '<i class="fas ' + icon + '"></i><span>' + message + '</span>';
            container.appendChild(toast);
            showBrowserNotification("Task Manager", message);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                toast.style.transition = 'all 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        function showLoader() { document.getElementById('loader').style.display = 'flex'; }
        function hideLoader() { document.getElementById('loader').style.display = 'none'; }

        let currentPage = '<%= currentPage %>';
        let tasksData = <%- JSON.stringify(tasks || []) %>;
        let notesData = <%- JSON.stringify(notes || []) %>;
        let historyData = <%- JSON.stringify(groupedHistory || {}) %>;
        let currentMonth = new Date().getMonth();
        let currentYear = new Date().getFullYear();

        function switchPage(page) {
            showLoader();
            fetch('/api/page/' + page).then(res => res.json()).then(data => {
                currentPage = page;
                tasksData = data.tasks || [];
                notesData = data.notes || [];
                historyData = data.groupedHistory || {};
                renderPage();
                updateActiveNav();
                hideLoader();
            }).catch(err => { showToast('Error loading page', 'error'); hideLoader(); });
        }

        function updateActiveNav() {
            document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(btn => {
                if (btn.innerText.toLowerCase().includes(currentPage)) btn.classList.add('active');
            });
        }

        function renderPage() {
            const content = document.getElementById('mainContent');
            const fabButton = document.getElementById('fabButton');
            if (currentPage === 'tasks') { fabButton.style.display = 'flex'; content.innerHTML = renderTasksPage(); } 
            else if (currentPage === 'notes') { fabButton.style.display = 'flex'; content.innerHTML = renderNotesPage(); } 
            else if (currentPage === 'history') { fabButton.style.display = 'none'; content.innerHTML = renderHistoryPage(); }
        }

        function hasContent(text) { return text && text.trim().length > 0; }
        function escapeHtml(text) {
            if (!text) return '';
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
            return text.replace(/[&<>"']/g, function(m) { return map[m]; });
        }
        function preserveLineBreaks(text) { return escapeHtml(text).replace(/\\n/g, '<br>'); }
        function escapeJsString(str) {
            if (!str) return '';
            return str.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'").replace(/"/g, '\\\\"').replace(/\\n/g, '\\\\n').replace(/\\r/g, '\\\\r').replace(/\\t/g, '\\\\t');
        }
        function toggleDescription(elementId) {
            const element = document.getElementById(elementId);
            if (element) {
                if (element.classList.contains('hidden')) element.classList.remove('hidden');
                else element.classList.add('hidden');
            }
        }

        function renderTasksPage() {
            let html = '<h1 class="page-title">Today\\'s Tasks</h1><div class="tasks-grid">';
            if (!tasksData || tasksData.length === 0) {
                html += '<div class="empty-state" style="grid-column: 1/-1;"><i class="fas fa-clipboard-list" style="font-size: 2rem;"></i><h3 style="margin-top: 12px;">No tasks</h3></div>';
            } else {
                tasksData.forEach((task) => {
                    const hasDescription = hasContent(task.description);
                    const progress = task.subtaskProgress || 0;
                    const circleCircumference = 2 * Math.PI * 16;
                    const circleOffset = circleCircumference - (progress / 100) * circleCircumference;
                    const completedSubtasks = task.subtasks ? task.subtasks.filter(s => s.completed).length : 0;
                    const totalSubtasks = task.subtasks ? task.subtasks.length : 0;
                    const descriptionId = 'task_desc_' + task.taskId;
                    const escapedTitle = escapeHtml(task.title);
                    const escapedDescription = escapeJsString(task.description || '');
                    
                    html += '<div class="task-card"><div class="task-header"><div class="task-title-section"><div class="task-title-container" onclick="toggleDescription(\\'' + descriptionId + '\\')"><i class="fas fa-chevron-right" id="' + descriptionId + '_icon"></i><span class="task-title">' + escapedTitle + '</span></div></div><div class="task-actions">';
                    if (totalSubtasks < 10) html += '<button class="action-btn" onclick="openAddSubtaskModal(\\'' + task.taskId + '\\')"><i class="fas fa-plus"></i></button>';
                    html += '<button class="action-btn" onclick="openEditTaskModal(\\'' + task.taskId + '\\')"><i class="fas fa-pencil-alt"></i></button><button class="action-btn" onclick="completeTask(\\'' + task.taskId + '\\')"><i class="fas fa-check"></i></button><button class="action-btn delete" onclick="deleteTask(\\'' + task.taskId + '\\')"><i class="fas fa-trash"></i></button></div></div>';
                    if (hasDescription) html += '<div id="' + descriptionId + '" class="task-description-container hidden"><div class="task-description">' + preserveLineBreaks(task.description) + '</div></div>';
                    html += '<div class="task-time-row"><span class="date-chip"><i class="fas fa-calendar-alt"></i> ' + task.dateIST + '</span><span class="time-chip"><i class="fas fa-clock"></i> ' + task.startTimeIST + '-' + task.endTimeIST + '</span></div>';
                    
                    if (totalSubtasks > 0) {
                        html += '<details class="task-subtasks"><summary class="flex-row" style="cursor: pointer;"><div class="progress-ring-small"><svg width="40" height="40"><circle class="progress-ring-circle-small" stroke="var(--progress-bg-light)" stroke-width="3" fill="transparent" r="16" cx="20" cy="20"/><circle class="progress-ring-circle-small" stroke="var(--accent-light)" stroke-width="3" fill="transparent" r="16" cx="20" cy="20" style="stroke-dasharray: ' + circleCircumference + '; stroke-dashoffset: ' + circleOffset + '; "/></svg><span class="progress-text-small">' + progress + '%</span></div><span style="font-size: 0.8rem; color: var(--text-secondary-light);">' + completedSubtasks + '/' + totalSubtasks + ' subtasks</span></summary><div class="subtasks-container w-100">';
                        task.subtasks.sort((a, b) => { if (a.completed === b.completed) return 0; return a.completed ? 1 : -1; }).forEach((subtask) => {
                            const subtaskHasDesc = hasContent(subtask.description);
                            const subtaskDescId = 'subtask_desc_' + task.taskId + '_' + subtask.id;
                            const escapedSubtaskTitle = escapeHtml(subtask.title);
                            const escapedSubtaskDescription = escapeJsString(subtask.description || '');
                            html += '<div class="subtask-item"><div class="subtask-main-row"><div class="subtask-checkbox ' + (subtask.completed ? 'completed' : '') + '" onclick="toggleSubtask(\\'' + task.taskId + '\\', \\'' + subtask.id + '\\')">' + (subtask.completed ? '<i class="fas fa-check"></i>' : '') + '</div><div class="subtask-details"><div class="subtask-title-container" onclick="toggleDescription(\\'' + subtaskDescId + '\\')"><span class="subtask-title ' + (subtask.completed ? 'completed' : '') + '">' + escapedSubtaskTitle + '</span></div></div><div class="subtask-actions"><button class="subtask-btn" onclick="editSubtask(\\'' + task.taskId + '\\', \\'' + subtask.id + '\\', \\'' + escapedSubtaskTitle.replace(/'/g, "\\\\'") + '\\', \\'' + escapedSubtaskDescription.replace(/'/g, "\\\\'") + '\\')"><i class="fas fa-pencil-alt"></i></button><button class="subtask-btn delete" onclick="deleteSubtask(\\'' + task.taskId + '\\', \\'' + subtask.id + '\\')"><i class="fas fa-trash"></i></button></div></div>';
                            if (subtaskHasDesc) html += '<div id="' + subtaskDescId + '" class="subtask-description-container hidden"><div class="subtask-description">' + preserveLineBreaks(subtask.description) + '</div></div>';
                            html += '</div>';
                        });
                        html += '</div></details>';
                    } else {
                        html += '<div class="flex-row" style="margin-top: 8px;"><span style="font-size: 0.8rem; color: var(--text-secondary-light);"><i class="fas fa-tasks"></i> No subtasks</span></div>';
                    }
                    html += '<div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;"><span class="badge"><i class="fas fa-repeat"></i> ' + (task.repeat && task.repeat !== 'none' ? (task.repeat === 'daily' ? 'Daily' : 'Weekly') : 'No Repeat') + '</span><span class="badge"><i class="fas fa-hourglass-half"></i> ' + task.durationFormatted + '</span>';
                    if (task.repeatCount > 0) html += '<span class="badge"><i class="fas fa-hashtag"></i> ' + task.repeatCount + ' left</span>';
                    html += '</div></div>';
                });
            }
            html += '</div>';
            return html;
        }

        function renderNotesPage() {
            let html = '<h1 class="page-title">Notes</h1><div class="tasks-grid">';
            if (!notesData || notesData.length === 0) {
                html += '<div class="empty-state" style="grid-column: 1/-1;"><i class="fas fa-note-sticky" style="font-size: 2rem;"></i><h3 style="margin-top: 12px;">No notes</h3></div>';
            } else {
                notesData.forEach(note => {
                    const hasDescription = hasContent(note.description);
                    const noteDescId = 'note_desc_' + note.noteId;
                    const escapedNoteTitle = escapeHtml(note.title);
                    const escapedNoteDescription = escapeJsString(note.description || '');
                    html += '<div class="note-card"><div class="note-header"><div class="task-title-container" onclick="toggleDescription(\\'' + noteDescId + '\\')"><i class="fas fa-chevron-right" id="' + noteDescId + '_icon"></i><span class="note-title">' + escapedNoteTitle + '</span></div><div style="display: flex; gap: 4px;"><button class="action-btn" onclick="moveNote(\\'' + note.noteId + '\\', \\'up\\')"><i class="fas fa-arrow-up"></i></button><button class="action-btn" onclick="moveNote(\\'' + note.noteId + '\\', \\'down\\')"><i class="fas fa-arrow-down"></i></button><button class="action-btn" onclick="openEditNoteModal(\\'' + note.noteId + '\\', \\'' + escapedNoteTitle.replace(/'/g, "\\\\'") + '\\', \\'' + escapedNoteDescription.replace(/'/g, "\\\\'") + '\\')"><i class="fas fa-pencil-alt"></i></button><button class="action-btn delete" onclick="deleteNote(\\'' + note.noteId + '\\')"><i class="fas fa-trash"></i></button></div></div>';
                    if (hasDescription) html += '<div id="' + noteDescId + '" class="note-content-container hidden"><div class="note-content">' + preserveLineBreaks(note.description) + '</div></div>';
                    html += '<div class="note-meta"><span><i class="fas fa-clock"></i> ' + note.createdAtIST + '</span>' + (note.updatedAtIST !== note.createdAtIST ? '<span><i class="fas fa-pencil-alt"></i> ' + note.updatedAtIST + '</span>' : '') + '</div></div>';
                });
            }
            html += '</div>';
            return html;
        }

        function renderHistoryPage() {
            let html = '<h1 class="page-title">History</h1><div class="history-header"><div class="month-selector"><button class="month-btn" onclick="changeMonth(-1)"><i class="fas fa-chevron-left"></i> Prev</button><span style="font-weight: 600;">' + new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' }) + ' ' + currentYear + '</span><button class="month-btn" onclick="changeMonth(1)">Next <i class="fas fa-chevron-right"></i></button></div></div><div class="history-grid">';
            const filteredHistory = filterHistoryByMonth(historyData, currentYear, currentMonth);
            const dates = Object.keys(filteredHistory).sort().reverse();
            if (dates.length === 0) {
                html += '<div class="empty-state"><i class="fas fa-history" style="font-size: 2rem;"></i><h3 style="margin-top: 12px;">No history</h3></div>';
            } else {
                dates.forEach(date => {
                    const tasks = filteredHistory[date];
                    html += '<div class="history-date-card"><details class="history-details"><summary><i class="fas fa-calendar-alt"></i><span style="font-weight: 600;">' + date + '</span><span class="badge" style="margin-left: auto;">' + tasks.length + ' tasks</span></summary><div class="history-tasks-grid">';
                    tasks.forEach(task => {
                        const hasDescription = hasContent(task.description);
                        const historyDescId = 'history_desc_' + task._id;
                        const escapedHistoryTitle = escapeHtml(task.title);
                        html += '<div class="history-task-card"><div class="history-task-header"><div class="task-title-container" onclick="toggleDescription(\\'' + historyDescId + '\\')"><i class="fas fa-chevron-right"></i><span class="history-task-title">' + escapedHistoryTitle + '</span></div><span class="history-task-time"><i class="fas fa-check-circle" style="color: var(--success-light);"></i> ' + task.completedTimeIST + '</span></div>';
                        if (hasDescription) html += '<div id="' + historyDescId + '" class="history-description-container hidden"><div class="history-description">' + preserveLineBreaks(task.description) + '</div></div>';
                        html += '<div style="display: flex; gap: 6px; margin: 8px 0; flex-wrap: wrap;"><span class="badge"><i class="fas fa-clock"></i> ' + (task.startTimeIST || formatTime(task.startDate)) + '-' + (task.endTimeIST || formatTime(task.endDate)) + '</span><span class="badge"><i class="fas fa-hourglass-half"></i> ' + task.durationFormatted + '</span>' + (task.repeat && task.repeat !== 'none' ? '<span class="badge"><i class="fas fa-repeat"></i> ' + (task.repeat === 'daily' ? 'Daily' : 'Weekly') + '</span>' : '') + '</div>';
                        if (task.subtasks && task.subtasks.length > 0) {
                            html += '<details style="margin-top: 8px;"><summary style="cursor: pointer; color: var(--accent-light); font-weight: 600; font-size: 0.8rem;"><i class="fas fa-tasks"></i> Subtasks (' + task.subtasks.filter(s => s.completed).length + '/' + task.subtasks.length + ')</summary><div style="margin-top: 8px;">';
                            task.subtasks.forEach(subtask => {
                                const subtaskHasDesc = hasContent(subtask.description);
                                const historySubtaskDescId = 'history_subtask_desc_' + task._id + '_' + subtask.id;
                                html += '<div class="history-subtask"><div style="display: flex; align-items: flex-start; gap: 6px;"><span style="color: ' + (subtask.completed ? 'var(--success-light)' : 'var(--text-secondary-light)') + '"><i class="fas fa-' + (subtask.completed ? 'check-circle' : 'circle') + '"></i></span><div style="flex: 1;"><div class="task-title-container" onclick="toggleDescription(\\'' + historySubtaskDescId + '\\')"><span style="font-weight: 600; font-size: 0.8rem;">' + escapeHtml(subtask.title) + '</span></div>' + (subtaskHasDesc ? '<div id="' + historySubtaskDescId + '" class="history-description-container hidden"><div class="history-description" style="border-left-color: var(--accent-light);">' + preserveLineBreaks(subtask.description) + '</div></div>' : '') + '</div></div></div>';
                            });
                            html += '</div></details>';
                        }
                        html += '</div>';
                    });
                    html += '</div></details></div>';
                });
            }
            html += '</div>';
            return html;
        }

        function filterHistoryByMonth(history, year, month) {
            const filtered = {};
            Object.keys(history).forEach(date => {
                const [day, monthNum, yearNum] = date.split('-').map(Number);
                if (yearNum === year && monthNum - 1 === month) filtered[date] = history[date];
            });
            return filtered;
        }

        function changeMonth(delta) {
            currentMonth += delta;
            if (currentMonth < 0) { currentMonth = 11; currentYear--; } 
            else if (currentMonth > 11) { currentMonth = 0; currentYear++; }
            renderPage();
        }

        function formatTime(dateString) { return new Date(dateString).toISOString().split('T')[1].substring(0, 5); }

        function openModal(modalId) { document.getElementById(modalId).style.display = 'flex'; document.body.style.overflow = 'hidden'; }
        function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; document.body.style.overflow = 'auto'; }

        function openAddModal() { if (currentPage === 'tasks') openAddTaskModal(); else if (currentPage === 'notes') openAddNoteModal(); }

        function openAddTaskModal() {
            const now = new Date();
            const istOffset = 5.5 * 60 * 60 * 1000;
            const istNow = new Date(now.getTime() + istOffset);
            const year = istNow.getUTCFullYear();
            const month = String(istNow.getUTCMonth() + 1).padStart(2, '0');
            const day = String(istNow.getUTCDate()).padStart(2, '0');
            const hours = String(istNow.getUTCHours()).padStart(2, '0');
            const minutes = String(istNow.getUTCMinutes()).padStart(2, '0');
            
            document.getElementById('startDate').value = year + '-' + month + '-' + day;
            document.getElementById('startTime').value = hours + ':' + minutes;
            document.getElementById('endTime').value = String(istNow.getUTCHours() + 1).padStart(2, '0') + ':' + minutes;
            openModal('addTaskModal');
        }

        function openEditTaskModal(taskId) {
            fetch('/api/tasks/' + taskId).then(res => res.json()).then(task => {
                document.getElementById('editTaskId').value = task.taskId;
                document.getElementById('editTitle').value = task.title;
                document.getElementById('editDescription').value = task.description || '';
                document.getElementById('editStartDate').value = task.startDateIST || task.startDate;
                document.getElementById('editStartTime').value = task.startTimeIST || task.startTime;
                document.getElementById('editEndTime').value = task.endTimeIST || task.endTime;
                document.getElementById('editRepeatSelect').value = task.repeat || 'none';
                document.getElementById('editRepeatCount').value = task.repeatCount || 7;
                document.getElementById('editRepeatCountGroup').style.display = task.repeat !== 'none' ? 'block' : 'none';
                openModal('editTaskModal');
            }).catch(err => { showToast('Error loading task', 'error'); });
        }

        function openAddSubtaskModal(taskId) { document.getElementById('subtaskTaskId').value = taskId; openModal('addSubtaskModal'); }
        function editSubtask(taskId, subtaskId, title, description) { document.getElementById('editSubtaskTaskId').value = taskId; document.getElementById('editSubtaskId').value = subtaskId; document.getElementById('editSubtaskTitle').value = title; document.getElementById('editSubtaskDescription').value = description || ''; openModal('editSubtaskModal'); }
        function openAddNoteModal() { openModal('addNoteModal'); }
        function openEditNoteModal(noteId, title, description) { document.getElementById('editNoteId').value = noteId; document.getElementById('editNoteTitle').value = title; document.getElementById('editNoteDescription').value = description || ''; openModal('editNoteModal'); }

        function submitTaskForm(event) {
            event.preventDefault(); showLoader();
            fetch('/api/tasks', { method: 'POST', body: new URLSearchParams(new FormData(event.target)) })
            .then(res => { if(res.ok){ closeModal('addTaskModal'); showToast('Task created!'); switchPage('tasks'); } else throw new Error(''); })
            .catch(err => { showToast('Error creating task', 'error'); hideLoader(); });
        }

        function submitEditTaskForm(event) {
            event.preventDefault(); showLoader();
            const formData = new FormData(event.target);
            fetch('/api/tasks/' + formData.get('taskId') + '/update', { method: 'POST', body: new URLSearchParams(formData) })
            .then(res => { if(res.ok){ closeModal('editTaskModal'); showToast('Task updated!'); switchPage('tasks'); } else throw new Error(''); })
            .catch(err => { showToast('Error updating task', 'error'); hideLoader(); });
        }

        function submitSubtaskForm(event) {
            event.preventDefault(); showLoader();
            const formData = new FormData(event.target);
            fetch('/api/tasks/' + formData.get('taskId') + '/subtasks', { method: 'POST', body: new URLSearchParams(formData) })
            .then(res => { if(res.ok){ closeModal('addSubtaskModal'); showToast('Subtask added!'); switchPage('tasks'); } else throw new Error(''); })
            .catch(err => { showToast('Error adding subtask', 'error'); hideLoader(); });
        }

        function submitEditSubtaskForm(event) {
            event.preventDefault(); showLoader();
            const formData = new FormData(event.target);
            fetch('/api/tasks/' + formData.get('taskId') + '/subtasks/' + formData.get('subtaskId') + '/update', { method: 'POST', body: new URLSearchParams(formData) })
            .then(res => { if(res.ok){ closeModal('editSubtaskModal'); showToast('Subtask updated!'); switchPage('tasks'); } else throw new Error(''); })
            .catch(err => { showToast('Error updating subtask', 'error'); hideLoader(); });
        }

        function submitNoteForm(event) {
            event.preventDefault(); showLoader();
            fetch('/api/notes', { method: 'POST', body: new URLSearchParams(new FormData(event.target)) })
            .then(res => { if(res.ok){ closeModal('addNoteModal'); showToast('Note created!'); switchPage('notes'); } else throw new Error(''); })
            .catch(err => { showToast('Error creating note', 'error'); hideLoader(); });
        }

        function submitEditNoteForm(event) {
            event.preventDefault(); showLoader();
            const formData = new FormData(event.target);
            fetch('/api/notes/' + formData.get('noteId') + '/update', { method: 'POST', body: new URLSearchParams(formData) })
            .then(res => { if(res.ok){ closeModal('editNoteModal'); showToast('Note updated!'); switchPage('notes'); } else throw new Error(''); })
            .catch(err => { showToast('Error updating note', 'error'); hideLoader(); });
        }

        function toggleSubtask(taskId, subtaskId) {
            showLoader();
            fetch('/api/tasks/' + taskId + '/subtasks/' + subtaskId + '/toggle', { method: 'POST' })
            .then(res => { if(res.ok){ showToast('Subtask toggled'); switchPage('tasks'); } else throw new Error(''); })
            .catch(err => { showToast('Error toggling', 'error'); hideLoader(); });
        }

        function deleteSubtask(taskId, subtaskId) {
            if (!confirm('Delete this subtask?')) return;
            showLoader();
            fetch('/api/tasks/' + taskId + '/subtasks/' + subtaskId + '/delete', { method: 'POST' })
            .then(res => { if(res.ok){ showToast('Subtask deleted'); switchPage('tasks'); } else throw new Error(''); })
            .catch(err => { showToast('Error deleting', 'error'); hideLoader(); });
        }

        function completeTask(taskId) {
            if (!confirm('Complete this task?')) return;
            showLoader();
            fetch('/api/tasks/' + taskId + '/complete', { method: 'POST' })
            .then(res => { if(res.ok){ showToast('Task completed!'); switchPage('tasks'); } else { return res.text().then(t => {throw new Error(t);}); } })
            .catch(err => { showToast(err.message || 'Error completing task', 'error'); hideLoader(); });
        }

        function deleteTask(taskId) {
            if (!confirm('Delete this task?')) return;
            showLoader();
            fetch('/api/tasks/' + taskId + '/delete', { method: 'POST' })
            .then(res => { if(res.ok){ showToast('Task deleted'); switchPage('tasks'); } else throw new Error(''); })
            .catch(err => { showToast('Error deleting', 'error'); hideLoader(); });
        }

        function deleteNote(noteId) {
            if (!confirm('Delete this note?')) return;
            showLoader();
            fetch('/api/notes/' + noteId + '/delete', { method: 'POST' })
            .then(res => { if(res.ok){ showToast('Note deleted'); switchPage('notes'); } else throw new Error(''); })
            .catch(err => { showToast('Error deleting', 'error'); hideLoader(); });
        }

        function moveNote(noteId, direction) {
            showLoader();
            const formData = new FormData(); formData.append('direction', direction);
            fetch('/api/notes/' + noteId + '/move', { method: 'POST', body: new URLSearchParams(formData) })
            .then(res => { if(res.ok){ showToast('Moved'); switchPage('notes'); } else throw new Error(''); })
            .catch(err => { showToast('Error moving', 'error'); hideLoader(); });
        }

        document.addEventListener('DOMContentLoaded', function() {
            renderPage(); updateActiveNav();
            setInterval(() => {
                const now = new Date();
                const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
                document.getElementById('currentTimeDisplay').innerHTML = String(istNow.getUTCHours()).padStart(2, '0') + ':' + String(istNow.getUTCMinutes()).padStart(2, '0');
                document.getElementById('currentDateDisplay').innerHTML = String(istNow.getUTCDate()).padStart(2, '0') + '-' + String(istNow.getUTCMonth() + 1).padStart(2, '0') + '-' + istNow.getUTCFullYear();
            }, 1000);
            document.getElementById('repeatSelect').addEventListener('change', function() { document.getElementById('repeatCountGroup').style.display = this.value === 'none' ? 'none' : 'block'; });
            document.getElementById('editRepeatSelect').addEventListener('change', function() { document.getElementById('editRepeatCountGroup').style.display = this.value === 'none' ? 'none' : 'block'; });
            window.addEventListener('click', function(event) { if (event.target.classList.contains('modal')) { event.target.style.display = 'none'; document.body.style.overflow = 'auto'; } });
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
function generateId(type = 'task') { return Math.random().toString(36).substring(2, 10); }
function generateSubtaskId() { return 'sub_' + Date.now().toString(36); }
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
// 🤖 BOT SETUP & SCHEDULER (NOTIFICATIONS ONLY)
// ==========================================
const bot = new Telegraf(BOT_TOKEN);
const activeSchedules = new Map();
let isShuttingDown = false;

bot.command('start', async (ctx) => {
    const keyboard = Markup.inlineKeyboard([[Markup.button.webApp('🌐 Open Web App', WEB_APP_URL)]]);
    await ctx.reply('🌟 <b>Global Task Manager</b>\n\nManage your tasks using the Web App below. I will send you notifications here.', { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
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
            const maxNotifications = 10;
            
            const sendNotification = async () => {
                if (isShuttingDown) return;
                const currentTimeUTC = new Date();
                
                if (currentTimeUTC >= startTimeUTC || count >= maxNotifications) {
                    const activeSchedule = activeSchedules.get(taskId);
                    if (activeSchedule && activeSchedule.interval) {
                        clearInterval(activeSchedule.interval);
                        activeSchedule.interval = null;
                    }
                    if (currentTimeUTC >= startTimeUTC) {
                        try { await bot.telegram.sendMessage(CHAT_ID, `🚀 <b>START NOW:</b> ${task.title}`, { parse_mode: 'HTML' }); } catch (e) {}
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
            
            if (activeSchedules.has(taskId)) {
                if (activeSchedules.get(taskId).interval) clearInterval(activeSchedules.get(taskId).interval);
                activeSchedules.get(taskId).interval = interval;
            } else { activeSchedules.set(taskId, { startJob, interval }); }
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
        const tasks = await db.collection('tasks').find({ status: 'pending', startDate: { $gt: new Date(Date.now() + 10 * 60000) } }).toArray();
        tasks.forEach(task => scheduleTask(task));
    } catch (error) {}
}

async function autoCompletePendingTasks() {
    try {
        const pendingTasks = await db.collection('tasks').find({ status: 'pending', nextOccurrence: { $gte: getTodayStartUTC(), $lt: getTomorrowStartUTC() } }).toArray();
        for (const task of pendingTasks) {
            const historyItem = { ...task, _id: undefined, completedAt: new Date(), completedDate: getTodayStartUTC(), originalTaskId: task.taskId, status: 'completed', autoCompleted: true };
            await db.collection('history').insertOne(historyItem);
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
    autoCompleteJob = schedule.scheduleJob('29 18 * * *', async () => { if (!isShuttingDown) await autoCompletePendingTasks(); }); // 23:59 IST
}

// ==========================================
// 📱 WEB INTERFACE ROUTES
// ==========================================
app.get('/', (req, res) => res.redirect('/tasks'));

app.get('/tasks', async (req, res) => {
    try {
        const tasks = await db.collection('tasks').find({ status: 'pending', nextOccurrence: { $gte: getTodayStartUTC(), $lt: getTomorrowStartUTC() } }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray();
        const currentIST = getCurrentISTDisplay();
        res.render('index', {
            currentPage: 'tasks',
            tasks: tasks.map(task => {
                const startIST = utcToISTDisplay(task.startDate); const endIST = utcToISTDisplay(task.endDate);
                return { ...task, taskId: task.taskId, startTimeIST: startIST.displayTime, endTimeIST: endIST.displayTime, dateIST: startIST.displayDate, durationFormatted: formatDuration(calculateDuration(task.startDate, task.endDate)), subtaskProgress: calculateSubtaskProgress(task.subtasks), subtasks: task.subtasks || [] };
            }),
            notes: [], groupedHistory: {}, currentTime: currentIST.displayTime, currentDate: currentIST.displayDate
        });
    } catch (error) { res.status(500).send(error.message); }
});

app.get('/notes', async (req, res) => {
    try {
        const notes = await db.collection('notes').find().sort({ orderIndex: 1, createdAt: -1 }).toArray();
        const currentIST = getCurrentISTDisplay();
        res.render('index', { currentPage: 'notes', tasks: [], notes: notes.map(note => ({ ...note, createdAtIST: utcToISTDisplay(note.createdAt).dateTime, updatedAtIST: note.updatedAt ? utcToISTDisplay(note.updatedAt).dateTime : utcToISTDisplay(note.createdAt).dateTime })), groupedHistory: {}, currentTime: currentIST.displayTime, currentDate: currentIST.displayDate });
    } catch (error) { res.status(500).send(error.message); }
});

app.get('/history', async (req, res) => {
    try {
        const history = await db.collection('history').find().sort({ completedAt: -1 }).limit(500).toArray();
        const groupedHistory = {};
        history.forEach(item => {
            const dateKey = utcToISTDisplay(item.completedAt).displayDate;
            if (!groupedHistory[dateKey]) groupedHistory[dateKey] = [];
            groupedHistory[dateKey].push({ ...item, completedTimeIST: utcToISTDisplay(item.completedAt).displayTime, startTimeIST: utcToISTDisplay(item.startDate).displayTime, endTimeIST: utcToISTDisplay(item.endDate).displayTime, durationFormatted: formatDuration(calculateDuration(item.startDate, item.endDate)) });
        });
        const currentIST = getCurrentISTDisplay();
        res.render('index', { currentPage: 'history', tasks: [], notes: [], groupedHistory, currentTime: currentIST.displayTime, currentDate: currentIST.displayDate });
    } catch (error) { res.status(500).send(error.message); }
});

app.get('/api/page/:page', async (req, res) => {
    try {
        const page = req.params.page;
        if (page === 'tasks') {
            const tasks = await db.collection('tasks').find({ status: 'pending', nextOccurrence: { $gte: getTodayStartUTC(), $lt: getTomorrowStartUTC() } }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray();
            res.json({ tasks: tasks.map(task => ({ ...task, startTimeIST: utcToISTDisplay(task.startDate).displayTime, endTimeIST: utcToISTDisplay(task.endDate).displayTime, dateIST: utcToISTDisplay(task.startDate).displayDate, durationFormatted: formatDuration(calculateDuration(task.startDate, task.endDate)), subtaskProgress: calculateSubtaskProgress(task.subtasks) })), notes: [], groupedHistory: {} });
        } else if (page === 'notes') {
            const notes = await db.collection('notes').find().sort({ orderIndex: 1, createdAt: -1 }).toArray();
            res.json({ tasks: [], notes: notes.map(note => ({ ...note, createdAtIST: utcToISTDisplay(note.createdAt).dateTime, updatedAtIST: note.updatedAt ? utcToISTDisplay(note.updatedAt).dateTime : utcToISTDisplay(note.createdAt).dateTime })), groupedHistory: {} });
        } else if (page === 'history') {
            const history = await db.collection('history').find().sort({ completedAt: -1 }).limit(500).toArray();
            const groupedHistory = {};
            history.forEach(item => {
                const dateKey = utcToISTDisplay(item.completedAt).displayDate;
                if (!groupedHistory[dateKey]) groupedHistory[dateKey] = [];
                groupedHistory[dateKey].push({ ...item, completedTimeIST: utcToISTDisplay(item.completedAt).displayTime, startTimeIST: utcToISTDisplay(item.startDate).displayTime, endTimeIST: utcToISTDisplay(item.endDate).displayTime, durationFormatted: formatDuration(calculateDuration(item.startDate, item.endDate)) });
            });
            res.json({ tasks: [], notes: [], groupedHistory });
        } else { res.status(404).json({ error: 'Not found' }); }
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/tasks/:taskId', async (req, res) => {
    try {
        const task = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        if (!task) return res.status(404).json({ error: 'Not found' });
        res.json({ ...task, startDateIST: utcToISTDisplay(task.startDate).date, startTimeIST: utcToISTDisplay(task.startDate).time, endTimeIST: utcToISTDisplay(task.endDate).time });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/tasks', async (req, res) => {
    try {
        const { title, description, startDate, startTime, endTime, repeat, repeatCount } = req.body;
        const startDateUTC = istToUTC(startDate, startTime); const endDateUTC = istToUTC(startDate, endTime);
        if (!startDateUTC || !endDateUTC || endDateUTC <= startDateUTC || startDateUTC <= new Date(Date.now() + 10 * 60000)) return res.status(400).send('Invalid times');
        
        const task = { taskId: generateId('task'), title: title.trim(), description: description ? description.trim() : '', startDate: startDateUTC, endDate: endDateUTC, nextOccurrence: startDateUTC, status: 'pending', repeat: repeat || 'none', repeatCount: repeat && repeat !== 'none' ? (parseInt(repeatCount) || 7) : 0, subtasks: [], createdAt: new Date(), orderIndex: (await db.collection('tasks').countDocuments()) || 0, startTimeStr: startTime, endTimeStr: endTime, startDateStr: startDate };
        await db.collection('tasks').insertOne(task);
        if (task.startDate > new Date(Date.now() + 10 * 60000)) scheduleTask(task);
        try { await bot.telegram.sendMessage(CHAT_ID, `➕ <b>Added:</b> ${task.title}`, { parse_mode: 'HTML' }); } catch(e){}
        res.redirect('/tasks');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/update', async (req, res) => {
    try {
        const { title, description, startDate, startTime, endTime, repeat, repeatCount } = req.body;
        const startDateUTC = istToUTC(startDate, startTime); const endDateUTC = istToUTC(startDate, endTime);
        if (!startDateUTC || endDateUTC <= startDateUTC || startDateUTC <= new Date(Date.now() + 10 * 60000)) return res.status(400).send('Invalid times');
        cancelTaskSchedule(req.params.taskId);
        await db.collection('tasks').updateOne({ taskId: req.params.taskId }, { $set: { title: title.trim(), description: description ? description.trim() : '', startDate: startDateUTC, endDate: endDateUTC, nextOccurrence: startDateUTC, repeat: repeat || 'none', repeatCount: repeat && repeat !== 'none' ? (parseInt(repeatCount) || 7) : 0, startTimeStr: startTime, endTimeStr: endTime, startDateStr: startDate, updatedAt: new Date() } });
        const t = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        if (t && t.startDate > new Date(Date.now() + 10 * 60000)) scheduleTask(t);
        res.redirect('/tasks');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/complete', async (req, res) => {
    try {
        const task = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        if (!task || (task.subtasks || []).some(s => !s.completed)) return res.status(400).send('Complete subtasks first');
        await db.collection('history').insertOne({ ...task, _id: undefined, completedAt: new Date(), completedDate: getTodayStartUTC(), originalTaskId: task.taskId, status: 'completed' });
        cancelTaskSchedule(task.taskId);
        if (task.repeat !== 'none' && task.repeatCount > 0) {
            const nextUTC = new Date(task.nextOccurrence); nextUTC.setUTCDate(nextUTC.getUTCDate() + (task.repeat === 'weekly' ? 7 : 1));
            await db.collection('tasks').updateOne({ taskId: task.taskId }, { $set: { nextOccurrence: nextUTC, repeatCount: task.repeatCount - 1, startDate: nextUTC, endDate: new Date(nextUTC.getTime() + (task.endDate.getTime() - task.startDate.getTime())), subtasks: (task.subtasks || []).map(s => ({...s, completed: false})) } });
            const t = await db.collection('tasks').findOne({ taskId: task.taskId });
            if (t && t.nextOccurrence > new Date(Date.now() + 10 * 60000)) scheduleTask(t);
            try { await bot.telegram.sendMessage(CHAT_ID, `✅ <b>Completed:</b> ${task.title}\n🔄 Next: ${utcToISTDisplay(nextUTC).dateTime}`, { parse_mode: 'HTML' }); } catch(e){}
        } else {
            await db.collection('tasks').deleteOne({ taskId: task.taskId });
            try { await bot.telegram.sendMessage(CHAT_ID, `✅ <b>Completed:</b> ${task.title}`, { parse_mode: 'HTML' }); } catch(e){}
        }
        res.redirect('/tasks');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/delete', async (req, res) => {
    try {
        const t = await db.collection('tasks').findOne({taskId: req.params.taskId});
        cancelTaskSchedule(req.params.taskId);
        await db.collection('tasks').deleteOne({ taskId: req.params.taskId });
        if(t) try { await bot.telegram.sendMessage(CHAT_ID, `🗑️ <b>Deleted:</b> ${t.title}`, { parse_mode: 'HTML' }); } catch(e){}
        res.redirect('/tasks');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks', async (req, res) => {
    try {
        if (!req.body.title) return res.status(400).send('Empty title');
        await db.collection('tasks').updateOne({ taskId: req.params.taskId }, { $push: { subtasks: { id: generateSubtaskId(), title: req.body.title.trim(), description: req.body.description || '', completed: false, createdAt: new Date() } } });
        res.redirect('/tasks');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/update', async (req, res) => {
    try {
        if (!req.body.title) return res.status(400).send('Empty title');
        await db.collection('tasks').updateOne({ taskId: req.params.taskId, "subtasks.id": req.params.subtaskId }, { $set: { "subtasks.$.title": req.body.title.trim(), "subtasks.$.description": req.body.description || '' } });
        res.redirect('/tasks');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/toggle', async (req, res) => {
    try {
        const task = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        const sub = (task.subtasks || []).find(s => s.id === req.params.subtaskId);
        await db.collection('tasks').updateOne({ taskId: req.params.taskId, "subtasks.id": req.params.subtaskId }, { $set: { "subtasks.$.completed": !sub.completed } });
        res.redirect('/tasks');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/delete', async (req, res) => {
    try {
        await db.collection('tasks').updateOne({ taskId: req.params.taskId }, { $pull: { subtasks: { id: req.params.subtaskId } } });
        res.redirect('/tasks');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/notes', async (req, res) => {
    try {
        if (!req.body.title) return res.status(400).send('Empty title');
        const note = { noteId: generateId('note'), title: req.body.title.trim(), description: req.body.description || '', createdAt: new Date(), updatedAt: new Date(), orderIndex: await db.collection('notes').countDocuments() };
        await db.collection('notes').insertOne(note);
        res.redirect('/notes');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/notes/:noteId/update', async (req, res) => {
    try {
        if (!req.body.title) return res.status(400).send('Empty title');
        await db.collection('notes').updateOne({ noteId: req.params.noteId }, { $set: { title: req.body.title.trim(), description: req.body.description || '', updatedAt: new Date() } });
        res.redirect('/notes');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/notes/:noteId/delete', async (req, res) => {
    try {
        await db.collection('notes').deleteOne({ noteId: req.params.noteId });
        res.redirect('/notes');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/notes/:noteId/move', async (req, res) => {
    try {
        const notes = await db.collection('notes').find().sort({ orderIndex: 1 }).toArray();
        const idx = notes.findIndex(n => n.noteId === req.params.noteId);
        if (req.body.direction === 'up' && idx > 0) {
            const t = notes[idx].orderIndex; notes[idx].orderIndex = notes[idx-1].orderIndex; notes[idx-1].orderIndex = t;
            await db.collection('notes').updateOne({ noteId: notes[idx].noteId }, { $set: { orderIndex: notes[idx].orderIndex } });
            await db.collection('notes').updateOne({ noteId: notes[idx-1].noteId }, { $set: { orderIndex: notes[idx-1].orderIndex } });
        } else if (req.body.direction === 'down' && idx < notes.length - 1) {
            const t = notes[idx].orderIndex; notes[idx].orderIndex = notes[idx+1].orderIndex; notes[idx+1].orderIndex = t;
            await db.collection('notes').updateOne({ noteId: notes[idx].noteId }, { $set: { orderIndex: notes[idx].orderIndex } });
            await db.collection('notes').updateOne({ noteId: notes[idx+1].noteId }, { $set: { orderIndex: notes[idx+1].orderIndex } });
        }
        res.redirect('/notes');
    } catch (error) { res.status(500).send(error.message); }
});

// ==========================================
// 🚀 BOOTSTRAP
// ==========================================
async function start() {
    try {
        if (await connectDB()) {
            await rescheduleAllPending();
            scheduleAutoComplete();
            
            // Fixed the server launch crash by removing the `.on('error')` fallback
            app.listen(PORT, '0.0.0.0', () => {
                console.log('🌐 Web interface running on port ' + PORT);
                console.log('🌍 Public Web URL: ' + WEB_APP_URL);
                console.log('🕐 IST Time: ' + getCurrentISTDisplay().dateTime);
            });
            
            await bot.launch();
            console.log('🤖 Bot Started Successfully - Notifications Only Mode!');
        } else {
            setTimeout(start, 5000);
        }
    } catch (error) {
        setTimeout(start, 10000);
    }
}

// Graceful shutdown
process.once('SIGINT', () => { isShuttingDown = true; bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { isShuttingDown = true; bot.stop('SIGTERM'); process.exit(0); });

start();
