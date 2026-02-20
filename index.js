const { Telegraf, session: telegrafSession, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const schedule = require('node-schedule');
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// ==========================================
// ⚙️ CONFIGURATION - DIRECT HARDCODED VALUES
// ==========================================
const BOT_TOKEN = '8388773187:AAGeJLg_0U2qj9sg9awJ9aQVdF9klxEiRw4';
const MONGODB_URI = 'mongodb+srv://sandip:9E9AISFqTfU3VI5i@cluster0.p8irtov.mongodb.net/telegram_bot';
const PORT = process.env.PORT || 8080;
const WEB_APP_URL = 'https://task-manager-bot.up.railway.app';
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

if (!fs.existsSync(viewsDir)) {
    fs.mkdirSync(viewsDir, { recursive: true });
}

if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

// ==========================================
// 🕐 TIMEZONE UTILITY FUNCTIONS
// ==========================================

function istToUTC(istDate, istTime) {
    if (!istDate || !istTime) return null;
    
    const [year, month, day] = istDate.split('-').map(Number);
    const [hour, minute] = istTime.split(':').map(Number);
    
    const istDateObj = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    const utcDateObj = new Date(istDateObj.getTime() - IST_OFFSET_MS);
    
    return utcDateObj;
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
    const now = new Date();
    return new Date(now.getTime() + IST_OFFSET_MS);
}

function getTodayStartUTC() {
    const now = new Date();
    const istNow = new Date(now.getTime() + IST_OFFSET_MS);
    
    const istStartOfDay = new Date(Date.UTC(
        istNow.getUTCFullYear(),
        istNow.getUTCMonth(),
        istNow.getUTCDate(),
        0, 0, 0
    ));
    
    return new Date(istStartOfDay.getTime() - IST_OFFSET_MS);
}

function getTomorrowStartUTC() {
    const tomorrow = new Date(getTodayStartUTC().getTime() + 24 * 60 * 60 * 1000);
    return tomorrow;
}

function getAutoCompleteTimeUTC() {
    const now = new Date();
    const istNow = new Date(now.getTime() + IST_OFFSET_MS);
    
    const istMidnight = new Date(Date.UTC(
        istNow.getUTCFullYear(),
        istNow.getUTCMonth(),
        istNow.getUTCDate(),
        23, 59, 0
    ));
    
    return new Date(istMidnight.getTime() - IST_OFFSET_MS);
}

function isValidFutureISTTime(istDate, istTime) {
    const targetUTC = istToUTC(istDate, istTime);
    if (!targetUTC) return false;
    
    const nowUTC = new Date();
    const tenMinutesFromNowUTC = new Date(nowUTC.getTime() + 10 * 60 * 1000);
    
    return targetUTC > tenMinutesFromNowUTC;
}

function formatISTDate(utcDate) {
    if (!utcDate) return '';
    const ist = utcToISTDisplay(utcDate);
    return ist.displayDate;
}

function formatISTTime(utcDate) {
    if (!utcDate) return '';
    const ist = utcToISTDisplay(utcDate);
    return ist.displayTime;
}

function formatISTDateTime(utcDate) {
    if (!utcDate) return '';
    const ist = utcToISTDisplay(utcDate);
    return ist.dateTime;
}

function getCurrentISTDisplay() {
    const ist = getCurrentIST();
    return utcToISTDisplay(ist);
}

function formatDateUTC(dateObj) {
    return formatISTDate(dateObj);
}

function formatTimeUTC(dateObj) {
    return formatISTTime(dateObj);
}

// ==========================================
// 🎨 EJS TEMPLATE - WITH GROW TAB AND PROGRESS TRACKING
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

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

        body {
            background: var(--bg-light);
            color: var(--text-primary-light);
            transition: all 0.2s ease;
            min-height: 100vh;
            font-size: 13px;
            line-height: 1.4;
        }

        @media (prefers-color-scheme: dark) {
            body {
                background: var(--bg-dark);
                color: var(--text-primary-dark);
            }
        }

        .app-header {
            background: var(--card-bg-light);
            border-bottom: 1px solid var(--border-light);
            padding: 10px 16px;
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        @media (prefers-color-scheme: dark) {
            .app-header {
                background: var(--card-bg-dark);
                border-bottom: 1px solid var(--border-dark);
            }
        }

        .nav-container {
            max-width: 1400px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 8px;
        }

        .nav-links {
            display: flex;
            gap: 4px;
            background: var(--hover-light);
            padding: 3px;
            border-radius: 100px;
        }

        @media (prefers-color-scheme: dark) {
            .nav-links {
                background: var(--hover-dark);
            }
        }

        .nav-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            border-radius: 100px;
            border: none;
            background: transparent;
            color: var(--text-secondary-light);
            font-weight: 600;
            font-size: 0.85rem;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        @media (prefers-color-scheme: dark) {
            .nav-btn {
                color: var(--text-secondary-dark);
            }
        }

        .nav-btn.active {
            background: var(--card-bg-light);
            color: var(--accent-light);
            box-shadow: 0 2px 6px rgba(0,0,0,0.05);
        }

        @media (prefers-color-scheme: dark) {
            .nav-btn.active {
                background: var(--card-bg-dark);
                color: var(--accent-dark);
                box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            }
        }

        .time-badge {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            background: var(--accent-soft-light);
            border-radius: 100px;
            font-size: 0.75rem;
            font-weight: 500;
            color: var(--accent-light);
        }

        @media (prefers-color-scheme: dark) {
            .time-badge {
                background: var(--accent-soft-dark);
                color: var(--accent-dark);
            }
        }

        .main-content {
            max-width: 1400px;
            margin: 16px auto;
            padding: 0 16px;
            padding-bottom: 80px;
        }

        .page-title {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 16px;
        }

        .tasks-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 16px;
            margin-top: 16px;
        }

        .task-card, .note-card, .history-date-card, .progress-card {
            background: var(--card-bg-light);
            border: 1px solid var(--border-light);
            border-radius: 16px;
            padding: 16px;
            transition: all 0.2s ease;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        @media (prefers-color-scheme: dark) {
            .task-card, .note-card, .history-date-card, .progress-card {
                background: var(--card-bg-dark);
                border: 1px solid var(--border-dark);
            }
        }

        .progress-bar-container {
            display: flex;
            align-items: center;
            gap: 12px;
            margin: 12px 0;
            padding: 8px;
            background: var(--hover-light);
            border-radius: 12px;
        }

        @media (prefers-color-scheme: dark) {
            .progress-bar-container {
                background: var(--hover-dark);
            }
        }

        .vertical-progress {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 60px;
        }

        .progress-bar-vertical {
            width: 40px;
            height: 120px;
            background: var(--progress-bg-light);
            border-radius: 20px;
            position: relative;
            overflow: hidden;
        }

        @media (prefers-color-scheme: dark) {
            .progress-bar-vertical {
                background: var(--progress-bg-dark);
            }
        }

        .progress-fill {
            position: absolute;
            bottom: 0;
            width: 100%;
            background: var(--accent-light);
            transition: height 0.3s ease;
        }

        .progress-info {
            flex: 1;
        }

        .progress-title {
            font-weight: 700;
            font-size: 0.95rem;
            margin-bottom: 4px;
            cursor: pointer;
        }

        .progress-stats {
            font-size: 0.75rem;
            color: var(--text-secondary-light);
        }

        .calendar-container {
            margin-top: 20px;
            background: var(--card-bg-light);
            border-radius: 16px;
            padding: 16px;
        }

        @media (prefers-color-scheme: dark) {
            .calendar-container {
                background: var(--card-bg-dark);
            }
        }

        .calendar-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .calendar-month {
            font-weight: 700;
            font-size: 1.1rem;
        }

        .calendar-nav {
            display: flex;
            gap: 8px;
        }

        .calendar-nav-btn {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 1px solid var(--border-light);
            background: transparent;
            color: var(--text-primary-light);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        @media (prefers-color-scheme: dark) {
            .calendar-nav-btn {
                border-color: var(--border-dark);
                color: var(--text-primary-dark);
            }
        }

        .calendar-weekdays {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 4px;
            margin-bottom: 8px;
            font-weight: 600;
            font-size: 0.7rem;
            text-align: center;
            color: var(--text-secondary-light);
        }

        .calendar-days {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 4px;
        }

        .calendar-day {
            aspect-ratio: 1;
            border-radius: 8px;
            background: var(--hover-light);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
            cursor: pointer;
            position: relative;
            overflow: hidden;
        }

        @media (prefers-color-scheme: dark) {
            .calendar-day {
                background: var(--hover-dark);
            }
        }

        .calendar-day.today {
            border: 2px solid var(--accent-light);
        }

        .calendar-day.future {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .calendar-day-number {
            font-weight: 600;
            z-index: 2;
        }

        .calendar-day-progress {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            flex-wrap: wrap;
        }

        .progress-segment {
            height: 100%;
            transition: all 0.2s ease;
        }

        .calendar-day.completed .calendar-day-number {
            color: white;
            text-shadow: 0 1px 2px rgba(0,0,0,0.3);
        }

        .progress-detail-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(4px);
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }

        .progress-detail-content {
            background: var(--card-bg-light);
            border-radius: 24px;
            padding: 24px;
            width: 90%;
            max-width: 400px;
            max-height: 70vh;
            overflow-y: auto;
        }

        @media (prefers-color-scheme: dark) {
            .progress-detail-content {
                background: var(--card-bg-dark);
            }
        }

        .progress-item-detail {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            border-bottom: 1px solid var(--border-light);
        }

        @media (prefers-color-scheme: dark) {
            .progress-item-detail {
                border-bottom-color: var(--border-dark);
            }
        }

        .progress-color-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .progress-item-info {
            flex: 1;
        }

        .progress-item-title {
            font-weight: 600;
            font-size: 0.85rem;
        }

        .progress-item-question {
            font-size: 0.75rem;
            color: var(--text-secondary-light);
            margin-top: 2px;
        }

        .progress-item-value {
            font-weight: 700;
            font-size: 0.85rem;
        }

        .progress-item-answer {
            font-size: 0.75rem;
            color: var(--accent-light);
            font-weight: 600;
        }

        .progress-item-actions {
            display: flex;
            gap: 4px;
        }

        .progress-complete-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: var(--success-light);
            color: white;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .progress-complete-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .progress-strikethrough {
            text-decoration: line-through;
            opacity: 0.6;
        }

        .fab {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 56px;
            height: 56px;
            border-radius: 28px;
            background: var(--accent-light);
            color: white;
            border: none;
            font-size: 1.3rem;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(37,99,235,0.3);
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99;
        }

        @media (prefers-color-scheme: dark) {
            .fab {
                background: var(--accent-dark);
                box-shadow: 0 4px 12px rgba(96,165,250,0.3);
            }
        }

        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(4px);
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }

        .modal-content {
            background: var(--card-bg-light);
            border: 1px solid var(--border-light);
            border-radius: 24px;
            padding: 24px;
            width: 90%;
            max-width: 500px;
            max-height: 85vh;
            overflow-y: auto;
        }

        @media (prefers-color-scheme: dark) {
            .modal-content {
                background: var(--card-bg-dark);
                border: 1px solid var(--border-dark);
            }
        }

        .form-control {
            width: 100%;
            padding: 12px;
            border-radius: 12px;
            border: 1px solid var(--border-light);
            background: var(--bg-light);
            color: var(--text-primary-light);
            font-size: 0.9rem;
            font-family: 'Inter', sans-serif;
            resize: vertical;
        }

        textarea.form-control {
            min-height: 80px;
        }

        @media (prefers-color-scheme: dark) {
            .form-control {
                background: var(--bg-dark);
                border: 1px solid var(--border-dark);
                color: var(--text-primary-dark);
            }
        }

        .btn {
            padding: 12px 20px;
            border-radius: 100px;
            border: none;
            font-weight: 600;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .btn-primary {
            background: var(--accent-light);
            color: white;
        }

        @media (prefers-color-scheme: dark) {
            .btn-primary {
                background: var(--accent-dark);
            }
        }

        .btn-secondary {
            background: var(--hover-light);
            color: var(--text-secondary-light);
        }

        @media (prefers-color-scheme: dark) {
            .btn-secondary {
                background: var(--hover-dark);
                color: var(--text-secondary-dark);
            }
        }

        .toast-container {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
        }

        .toast {
            background: #1e293b;
            color: white;
            padding: 10px 20px;
            border-radius: 100px;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 0.85rem;
            font-weight: 500;
        }

        @media (prefers-color-scheme: dark) {
            .toast {
                background: #0f172a;
            }
        }

        .loader {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(4px);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 9998;
        }

        .spinner {
            width: 48px;
            height: 48px;
            border: 4px solid var(--border-light);
            border-top: 4px solid var(--accent-light);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--text-secondary-light);
            background: var(--hover-light);
            border-radius: 24px;
        }

        @media (prefers-color-scheme: dark) {
            .empty-state {
                background: var(--hover-dark);
                color: var(--text-secondary-dark);
            }
        }

        details {
            margin-bottom: 16px;
        }

        summary {
            cursor: pointer;
            padding: 8px;
            background: var(--hover-light);
            border-radius: 8px;
            font-weight: 600;
        }

        @media (prefers-color-scheme: dark) {
            summary {
                background: var(--hover-dark);
            }
        }

        .color-picker {
            width: 40px;
            height: 40px;
            border-radius: 8px;
            border: 2px solid var(--border-light);
            cursor: pointer;
        }

        .hidden {
            display: none;
        }
    </style>
</head>
<body>
    <div class="loader" id="loader">
        <div class="spinner"></div>
    </div>

    <div class="toast-container" id="toastContainer"></div>

    <div class="app-header">
        <div class="nav-container">
            <div class="nav-links">
                <button class="nav-btn <%= currentPage === 'tasks' ? 'active' : '' %>" onclick="switchPage('tasks')">
                    <i class="fas fa-tasks"></i>
                    <span>Tasks</span>
                </button>
                <button class="nav-btn <%= currentPage === 'grow' ? 'active' : '' %>" onclick="switchPage('grow')">
                    <i class="fas fa-chart-line"></i>
                    <span>Grow</span>
                </button>
                <button class="nav-btn <%= currentPage === 'notes' ? 'active' : '' %>" onclick="switchPage('notes')">
                    <i class="fas fa-note-sticky"></i>
                    <span>Notes</span>
                </button>
                <button class="nav-btn <%= currentPage === 'history' ? 'active' : '' %>" onclick="switchPage('history')">
                    <i class="fas fa-history"></i>
                    <span>History</span>
                </button>
            </div>
            <div class="time-badge">
                <i class="fas fa-calendar-alt"></i>
                <span id="currentDateDisplay"><%= currentDate %></span>
                <span style="margin-left: 4px;"><i class="fas fa-clock"></i> <span id="currentTimeDisplay"><%= currentTime %></span></span>
            </div>
        </div>
    </div>

    <button class="fab" id="fabButton" onclick="openAddModal()" title="Add New">
        <i class="fas fa-plus"></i>
    </button>

    <div class="main-content" id="mainContent"></div>

    <!-- Add Task Modal -->
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
                    <textarea class="form-control" name="description" rows="3" placeholder="Enter description (supports line breaks)"></textarea>
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

    <!-- Edit Task Modal -->
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
                    <textarea class="form-control" name="description" id="editDescription" rows="3" placeholder="Enter description (supports line breaks)"></textarea>
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
                    <label style="font-size: 0.85rem; font-weight: 600;">Repeat Count (1-365)</label>
                    <input type="number" class="form-control" name="repeatCount" id="editRepeatCount" min="1" max="365">
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('editTaskModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Update Task</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Add Subtask Modal -->
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
                    <textarea class="form-control" name="description" rows="3" placeholder="Enter description (supports line breaks)"></textarea>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('addSubtaskModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Add Subtask</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Edit Subtask Modal -->
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
                    <textarea class="form-control" name="description" id="editSubtaskDescription" rows="3" placeholder="Enter description (supports line breaks)"></textarea>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('editSubtaskModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Update Subtask</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Add Note Modal -->
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
                    <textarea class="form-control" name="description" rows="4" placeholder="Enter note content (supports line breaks)"></textarea>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('addNoteModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Save Note</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Edit Note Modal -->
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
                    <textarea class="form-control" name="description" id="editNoteDescription" rows="4" placeholder="Enter note content (supports line breaks)"></textarea>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('editNoteModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Update Note</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Add Progress Modal -->
    <div class="modal" id="addProgressModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;">Create Progress Tracker</h2>
                <button class="action-btn" onclick="closeModal('addProgressModal')">&times;</button>
            </div>
            <form id="addProgressForm" onsubmit="submitProgressForm(event)">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Title *</label>
                    <input type="text" class="form-control" name="title" required maxlength="100">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Description</label>
                    <textarea class="form-control" name="description" rows="2" placeholder="Enter description"></textarea>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Total Rounds (Days) *</label>
                    <input type="number" class="form-control" name="totalRounds" required min="1" max="3650" value="365">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Question (Optional)</label>
                    <input type="text" class="form-control" name="question" placeholder="e.g., How many kgs did you lose?">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Question Type</label>
                    <select class="form-control" name="questionType">
                        <option value="number">Number</option>
                        <option value="text">Text</option>
                        <option value="boolean">Yes/No</option>
                    </select>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Color</label>
                    <input type="color" class="form-control" name="color" value="#2563eb" style="height: 40px;">
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('addProgressModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Create Tracker</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Edit Progress Modal -->
    <div class="modal" id="editProgressModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;">Edit Progress Tracker</h2>
                <button class="action-btn" onclick="closeModal('editProgressModal')">&times;</button>
            </div>
            <form id="editProgressForm" onsubmit="submitEditProgressForm(event)">
                <input type="hidden" name="progressId" id="editProgressId">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Title *</label>
                    <input type="text" class="form-control" name="title" id="editProgressTitle" required maxlength="100">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Description</label>
                    <textarea class="form-control" name="description" id="editProgressDescription" rows="2"></textarea>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Total Rounds (Days) *</label>
                    <input type="number" class="form-control" name="totalRounds" id="editProgressTotalRounds" required min="1" max="3650">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Question</label>
                    <input type="text" class="form-control" name="question" id="editProgressQuestion">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Question Type</label>
                    <select class="form-control" name="questionType" id="editProgressQuestionType">
                        <option value="number">Number</option>
                        <option value="text">Text</option>
                        <option value="boolean">Yes/No</option>
                    </select>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Color</label>
                    <input type="color" class="form-control" name="color" id="editProgressColor" style="height: 40px;">
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('editProgressModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Update Tracker</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Progress Detail Modal -->
    <div class="modal" id="progressDetailModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;" id="progressDetailDate"></h2>
                <button class="action-btn" onclick="closeModal('progressDetailModal')">&times;</button>
            </div>
            <div id="progressDetailList"></div>
            <div style="margin-top: 16px;">
                <button class="btn btn-secondary" style="width: 100%;" onclick="closeModal('progressDetailModal')">Close</button>
            </div>
        </div>
    </div>

    <!-- Answer Question Modal -->
    <div class="modal" id="answerQuestionModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;" id="answerQuestionTitle"></h2>
                <button class="action-btn" onclick="closeModal('answerQuestionModal')">&times;</button>
            </div>
            <form id="answerQuestionForm" onsubmit="submitAnswerForm(event)">
                <input type="hidden" name="progressId" id="answerProgressId">
                <input type="hidden" name="date" id="answerDate">
                <input type="hidden" name="questionType" id="answerQuestionType">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;" id="answerQuestionLabel"></label>
                    <input type="text" class="form-control" name="answer" id="answerInput" required>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('answerQuestionModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Save Answer</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        // ==========================================
        // TELEGRAM WEB APP INTEGRATION
        // ==========================================
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();

        // ==========================================
        // TOAST NOTIFICATION SYSTEM
        // ==========================================
        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast';
            if (type === 'error') toast.style.background = '#dc2626';
            else if (type === 'warning') toast.style.background = '#d97706';
            
            let icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
            
            toast.innerHTML = '<i class="fas ' + icon + '"></i><span>' + message + '</span>';
            container.appendChild(toast);
            
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                toast.style.transition = 'all 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        function showLoader() {
            document.getElementById('loader').style.display = 'flex';
        }

        function hideLoader() {
            document.getElementById('loader').style.display = 'none';
        }

        // ==========================================
        // PAGE SWITCHING
        // ==========================================
        let currentPage = '<%= currentPage %>';
        let tasksData = <%- JSON.stringify(tasks || []) %>;
        let notesData = <%- JSON.stringify(notes || []) %>;
        let historyData = <%- JSON.stringify(groupedHistory || {}) %>;
        let progressData = <%- JSON.stringify(progress || []) %>;
        let progressEntriesData = <%- JSON.stringify(progressEntries || {}) %>;
        let currentMonth = new Date().getMonth();
        let currentYear = new Date().getFullYear();
        let selectedProgressDate = null;

        function switchPage(page) {
            showLoader();
            fetch('/api/page/' + page)
                .then(res => res.json())
                .then(data => {
                    currentPage = page;
                    tasksData = data.tasks || [];
                    notesData = data.notes || [];
                    historyData = data.groupedHistory || {};
                    progressData = data.progress || [];
                    progressEntriesData = data.progressEntries || {};
                    renderPage();
                    updateActiveNav();
                    hideLoader();
                })
                .catch(err => {
                    console.error(err);
                    showToast('Error loading page', 'error');
                    hideLoader();
                });
        }

        function updateActiveNav() {
            document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(btn => {
                if (btn.innerText.toLowerCase().includes(currentPage)) {
                    btn.classList.add('active');
                }
            });
        }

        function renderPage() {
            const content = document.getElementById('mainContent');
            const fabButton = document.getElementById('fabButton');
            
            if (currentPage === 'tasks') {
                fabButton.style.display = 'flex';
                content.innerHTML = renderTasksPage();
            } else if (currentPage === 'grow') {
                fabButton.style.display = 'flex';
                content.innerHTML = renderGrowPage();
            } else if (currentPage === 'notes') {
                fabButton.style.display = 'flex';
                content.innerHTML = renderNotesPage();
            } else if (currentPage === 'history') {
                fabButton.style.display = 'none';
                content.innerHTML = renderHistoryPage();
            }
        }

        // ==========================================
        // CONDITIONAL RENDERING HELPERS
        // ==========================================
        function hasContent(text) {
            return text && text.trim().length > 0;
        }

        function escapeHtml(text) {
            if (!text) return '';
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return text.replace(/[&<>"']/g, function(m) { return map[m]; });
        }

        function preserveLineBreaks(text) {
            if (!text) return '';
            return escapeHtml(text).replace(/\\n/g, '<br>');
        }

        function escapeJsString(str) {
            if (!str) return '';
            return str
                .replace(/\\\\/g, '\\\\\\\\')
                .replace(/'/g, "\\\\'")
                .replace(/"/g, '\\\\"')
                .replace(/\\n/g, '\\\\n')
                .replace(/\\r/g, '\\\\r')
                .replace(/\\t/g, '\\\\t');
        }

        function toggleDescription(elementId) {
            const element = document.getElementById(elementId);
            if (element) {
                if (element.classList.contains('hidden')) {
                    element.classList.remove('hidden');
                } else {
                    element.classList.add('hidden');
                }
            }
        }

        // ==========================================
        // RENDER TASKS PAGE
        // ==========================================
        function renderTasksPage() {
            let html = \`
                <h1 class="page-title">Today's Tasks</h1>
                <div class="tasks-grid">
            \`;

            if (!tasksData || tasksData.length === 0) {
                html += \`
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <i class="fas fa-clipboard-list" style="font-size: 2rem;"></i>
                        <h3 style="margin-top: 12px;">No tasks for today</h3>
                        <p style="margin-top: 8px; font-size: 0.85rem;">Click the + button to add your first task!</p>
                    </div>
                \`;
            } else {
                tasksData.forEach((task, taskIndex) => {
                    const hasDescription = hasContent(task.description);
                    const progress = task.subtaskProgress || 0;
                    const circleCircumference = 2 * Math.PI * 16;
                    const circleOffset = circleCircumference - (progress / 100) * circleCircumference;
                    const completedSubtasks = task.subtasks ? task.subtasks.filter(s => s.completed).length : 0;
                    const totalSubtasks = task.subtasks ? task.subtasks.length : 0;
                    const descriptionId = 'task_desc_' + task.taskId;
                    const escapedTitle = escapeHtml(task.title);
                    
                    html += \`
                        <div class="task-card">
                            <div class="task-header">
                                <div class="task-title-section">
                                    <div class="task-title-container" onclick="toggleDescription('\${descriptionId}')">
                                        <i class="fas fa-chevron-right"></i>
                                        <span class="task-title">\${escapedTitle}</span>
                                    </div>
                                </div>
                                <div class="task-actions">
                                    \${totalSubtasks < 10 ? \`
                                        <button class="action-btn" onclick="openAddSubtaskModal('\${task.taskId}')" title="Add Subtask">
                                            <i class="fas fa-plus"></i>
                                        </button>
                                    \` : ''}
                                    <button class="action-btn" onclick="openEditTaskModal('\${task.taskId}')" title="Edit Task">
                                        <i class="fas fa-pencil-alt"></i>
                                    </button>
                                    <button class="action-btn" onclick="completeTask('\${task.taskId}')" title="Complete Task">
                                        <i class="fas fa-check"></i>
                                    </button>
                                    <button class="action-btn delete" onclick="deleteTask('\${task.taskId}')" title="Delete Task">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>

                            \${hasDescription ? \`
                                <div id="\${descriptionId}" class="task-description-container hidden">
                                    <div class="task-description">\${preserveLineBreaks(task.description)}</div>
                                </div>
                            \` : ''}

                            <div class="task-time-row">
                                <span class="date-chip">
                                    <i class="fas fa-calendar-alt"></i> \${task.dateIST}
                                </span>
                                <span class="time-chip">
                                    <i class="fas fa-clock"></i> \${task.startTimeIST}-\${task.endTimeIST}
                                </span>
                            </div>

                            \${totalSubtasks > 0 ? \`
                                <details class="task-subtasks" open>
                                    <summary class="flex-row">
                                        <div class="progress-ring-small">
                                            <svg width="40" height="40">
                                                <circle class="progress-ring-circle-small" stroke="var(--progress-bg-light)" stroke-width="3" fill="transparent" r="16" cx="20" cy="20"/>
                                                <circle class="progress-ring-circle-small" stroke="var(--accent-light)" stroke-width="3" fill="transparent" r="16" cx="20" cy="20"
                                                    style="stroke-dasharray: \${circleCircumference}; stroke-dashoffset: \${circleOffset};"/>
                                            </svg>
                                            <span class="progress-text-small">\${progress}%</span>
                                        </div>
                                        <span style="font-size: 0.8rem; color: var(--text-secondary-light);">
                                            \${completedSubtasks}/\${totalSubtasks} subtasks
                                        </span>
                                    </summary>
                                    <div class="subtasks-container w-100">
                                        \${task.subtasks.sort((a, b) => {
                                            if (a.completed === b.completed) return 0;
                                            return a.completed ? 1 : -1;
                                        }).map((subtask, subtaskIndex) => {
                                            const subtaskHasDesc = hasContent(subtask.description);
                                            const subtaskDescId = 'subtask_desc_' + task.taskId + '_' + subtask.id;
                                            const escapedSubtaskTitle = escapeHtml(subtask.title);
                                            
                                            return \`
                                                <div class="subtask-item">
                                                    <div class="subtask-main-row">
                                                        <div class="subtask-checkbox \${subtask.completed ? 'completed' : ''}" onclick="toggleSubtask('\${task.taskId}', '\${subtask.id}')">
                                                            \${subtask.completed ? '<i class="fas fa-check"></i>' : ''}
                                                        </div>
                                                        <div class="subtask-details">
                                                            <div class="subtask-title-container" onclick="toggleDescription('\${subtaskDescId}')">
                                                                <span class="subtask-title \${subtask.completed ? 'completed' : ''}">
                                                                    \${escapedSubtaskTitle}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div class="subtask-actions">
                                                            <button class="subtask-btn" onclick="editSubtask('\${task.taskId}', '\${subtask.id}', '\${escapeJsString(subtask.title)}', '\${escapeJsString(subtask.description || '')}')">
                                                                <i class="fas fa-pencil-alt"></i>
                                                            </button>
                                                            <button class="subtask-btn delete" onclick="deleteSubtask('\${task.taskId}', '\${subtask.id}')">
                                                                <i class="fas fa-trash"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    \${subtaskHasDesc ? \`
                                                        <div id="\${subtaskDescId}" class="subtask-description-container hidden">
                                                            <div class="subtask-description">\${preserveLineBreaks(subtask.description)}</div>
                                                        </div>
                                                    \` : ''}
                                                </div>
                                            \`;
                                        }).join('')}
                                    </div>
                                </details>
                            \` : \`
                                <div class="flex-row" style="margin-top: 8px;">
                                    <span style="font-size: 0.8rem; color: var(--text-secondary-light);">
                                        <i class="fas fa-tasks"></i> No subtasks
                                    </span>
                                </div>
                            \`}

                            <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
                                <span class="badge">
                                    <i class="fas fa-repeat"></i> \${task.repeat && task.repeat !== 'none' ? (task.repeat === 'daily' ? 'Daily' : 'Weekly') : 'No Repeat'}
                                </span>
                                <span class="badge">
                                    <i class="fas fa-hourglass-half"></i> \${task.durationFormatted}
                                </span>
                                \${task.repeatCount > 0 ? \`
                                    <span class="badge">
                                        <i class="fas fa-hashtag"></i> \${task.repeatCount} left
                                    </span>
                                \` : ''}
                            </div>
                        </div>
                    \`;
                });
            }

            html += \`</div>\`;
            return html;
        }

        // ==========================================
        // RENDER GROW PAGE - PROGRESS TRACKING
        // ==========================================
        function renderGrowPage() {
            let html = \`
                <h1 class="page-title">Growth & Progress</h1>
            \`;

            if (!progressData || progressData.length === 0) {
                html += \`
                    <div class="empty-state">
                        <i class="fas fa-chart-line" style="font-size: 2rem;"></i>
                        <h3 style="margin-top: 12px;">No progress trackers yet</h3>
                        <p style="margin-top: 8px; font-size: 0.85rem;">Click the + button to create your first tracker!</p>
                    </div>
                \`;
            } else {
                const today = new Date();
                const todayStr = today.toISOString().split('T')[0];
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];

                // Progress Bars Section
                html += \`
                    <details open>
                        <summary><i class="fas fa-chart-bar"></i> Progress Overview</summary>
                        <div class="tasks-grid" style="margin-top: 12px;">
                \`;

                progressData.forEach(progress => {
                    const progressId = progress.progressId;
                    const totalRounds = progress.totalRounds || 365;
                    const entries = progressEntriesData[progressId] || [];
                    const completedDays = entries.length;
                    const percentage = Math.round((completedDays / totalRounds) * 100);
                    
                    const escapedTitle = escapeHtml(progress.title);
                    const escapedDescription = escapeHtml(progress.description || '');
                    const hasDesc = hasContent(escapedDescription);
                    const descriptionId = 'progress_desc_' + progressId;
                    
                    html += \`
                        <div class="progress-card">
                            <div class="progress-bar-container">
                                <div class="vertical-progress">
                                    <div class="progress-bar-vertical">
                                        <div class="progress-fill" style="height: \${percentage}%; background: \${progress.color || '#2563eb'};"></div>
                                    </div>
                                    <span style="font-size: 0.7rem; font-weight: 700; margin-top: 4px;">\${percentage}%</span>
                                </div>
                                <div class="progress-info">
                                    <div class="progress-title" onclick="toggleDescription('\${descriptionId}')">
                                        \${escapedTitle}
                                    </div>
                                    <div class="progress-stats">
                                        \${completedDays}/\${totalRounds} days completed
                                    </div>
                                    \${progress.question ? \`
                                        <div style="font-size: 0.7rem; color: var(--accent-light); margin-top: 4px;">
                                            <i class="fas fa-question-circle"></i> \${escapeHtml(progress.question)}
                                        </div>
                                    \` : ''}
                                </div>
                                <div style="display: flex; gap: 4px;">
                                    <button class="action-btn" onclick="openEditProgressModal('\${progressId}')" title="Edit">
                                        <i class="fas fa-pencil-alt"></i>
                                    </button>
                                    <button class="action-btn delete" onclick="deleteProgress('\${progressId}')" title="Delete">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                            \${hasDesc ? \`
                                <div id="\${descriptionId}" class="task-description-container hidden" style="margin-top: 8px;">
                                    <div class="task-description">\${preserveLineBreaks(escapedDescription)}</div>
                                </div>
                            \` : ''}
                        </div>
                    \`;
                });

                html += \`
                        </div>
                    </details>
                \`;

                // Calendar Section
                html += \`
                    <div style="margin-top: 24px;">
                        <details open>
                            <summary><i class="fas fa-calendar-alt"></i> Progress Calendar</summary>
                            <div class="calendar-container">
                                <div class="calendar-header">
                                    <span class="calendar-month">\${new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' })} \${currentYear}</span>
                                    <div class="calendar-nav">
                                        <button class="calendar-nav-btn" onclick="changeProgressMonth(-1)">
                                            <i class="fas fa-chevron-left"></i>
                                        </button>
                                        <button class="calendar-nav-btn" onclick="changeProgressMonth(1)">
                                            <i class="fas fa-chevron-right"></i>
                                        </button>
                                    </div>
                                </div>
                                <div class="calendar-weekdays">
                                    <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
                                </div>
                                <div class="calendar-days" id="progressCalendarDays"></div>
                            </div>
                        </details>
                    </div>
                \`;
            }

            return html;
        }

        function renderCalendar() {
            const calendarEl = document.getElementById('progressCalendarDays');
            if (!calendarEl) return;

            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            const firstDay = new Date(currentYear, currentMonth, 1);
            const lastDay = new Date(currentYear, currentMonth + 1, 0);
            const startOffset = firstDay.getDay();
            
            let days = '';
            const progressColors = progressData.reduce((acc, p) => {
                acc[p.progressId] = p.color || '#2563eb';
                return acc;
            }, {});

            for (let i = 0; i < startOffset; i++) {
                days += '<div class="calendar-day" style="background: transparent;"></div>';
            }

            for (let d = 1; d <= lastDay.getDate(); d++) {
                const dateStr = \`\${currentYear}-\${String(currentMonth + 1).padStart(2, '0')}-\${String(d).padStart(2, '0')}\`;
                const dateObj = new Date(currentYear, currentMonth, d);
                const isToday = dateStr === todayStr;
                const isFuture = dateObj > today;
                const isPast = dateObj < today;
                const isYesterday = dateStr === yesterdayStr;
                
                let dayClass = 'calendar-day';
                if (isToday) dayClass += ' today';
                if (isFuture) dayClass += ' future';
                
                const completedProgresses = [];
                const incompleteProgresses = [];
                
                progressData.forEach(progress => {
                    const entries = progressEntriesData[progress.progressId] || [];
                    const entry = entries.find(e => e.date === dateStr);
                    
                    if (entry) {
                        completedProgresses.push({
                            id: progress.progressId,
                            color: progress.color || '#2563eb',
                            title: progress.title,
                            question: progress.question,
                            answer: entry.answer,
                            questionType: progress.questionType
                        });
                    } else if (isPast && dateObj < today && !isFuture) {
                        incompleteProgresses.push({
                            id: progress.progressId,
                            color: progress.color || '#2563eb',
                            title: progress.title,
                            question: progress.question,
                            questionType: progress.questionType
                        });
                    }
                });

                const totalProgresses = completedProgresses.length;
                
                let progressSegments = '';
                if (totalProgresses > 0) {
                    const segmentWidth = 100 / totalProgresses;
                    completedProgresses.forEach((p, index) => {
                        progressSegments += \`<div class="progress-segment" style="width: \${segmentWidth}%; background: \${p.color};"></div>\`;
                    });
                }

                days += \`
                    <div class="\${dayClass}" onclick="openProgressDayDetail('\${dateStr}')">
                        <span class="calendar-day-number">\${d}</span>
                        \${totalProgresses > 0 ? \`
                            <div class="calendar-day-progress">
                                \${progressSegments}
                            </div>
                        \` : ''}
                    </div>
                \`;
            }

            calendarEl.innerHTML = days;
        }

        function changeProgressMonth(delta) {
            currentMonth += delta;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            } else if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            renderPage();
        }

        function openProgressDayDetail(dateStr) {
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            const selectedDate = new Date(dateStr);
            const isFuture = selectedDate > today;
            
            if (isFuture) {
                showToast('Cannot view future dates', 'warning');
                return;
            }

            selectedProgressDate = dateStr;
            
            const modal = document.getElementById('progressDetailModal');
            document.getElementById('progressDetailDate').innerHTML = \`Progress for \${formatDateDisplay(dateStr)}\`;
            
            const completedList = [];
            const incompleteList = [];
            
            progressData.forEach(progress => {
                const entries = progressEntriesData[progress.progressId] || [];
                const entry = entries.find(e => e.date === dateStr);
                
                if (entry) {
                    completedList.push({
                        id: progress.progressId,
                        title: progress.title,
                        color: progress.color || '#2563eb',
                        question: progress.question,
                        answer: entry.answer,
                        questionType: progress.questionType
                    });
                } else if (selectedDate < today && dateStr !== todayStr) {
                    incompleteList.push({
                        id: progress.progressId,
                        title: progress.title,
                        color: progress.color || '#2563eb',
                        question: progress.question,
                        questionType: progress.questionType
                    });
                }
            });

            let detailHtml = '';
            
            if (completedList.length > 0) {
                detailHtml += '<h3 style="margin-bottom: 12px;">Completed</h3>';
                completedList.forEach(p => {
                    const answerDisplay = p.answer ? 
                        \`<div class="progress-item-answer">\${escapeHtml(p.answer)}</div>\` : '';
                    
                    detailHtml += \`
                        <div class="progress-item-detail">
                            <div class="progress-color-dot" style="background: \${p.color};"></div>
                            <div class="progress-item-info">
                                <div class="progress-item-title">\${escapeHtml(p.title)}</div>
                                \${p.question ? \`<div class="progress-item-question">\${escapeHtml(p.question)}</div>\` : ''}
                                \${answerDisplay}
                            </div>
                        </div>
                    \`;
                });
            }

            if (incompleteList.length > 0) {
                detailHtml += '<h3 style="margin: 16px 0 12px;">Incomplete</h3>';
                incompleteList.forEach(p => {
                    const isYesterday = dateStr === new Date(today.getTime() - 86400000).toISOString().split('T')[0];
                    
                    detailHtml += \`
                        <div class="progress-item-detail">
                            <div class="progress-color-dot" style="background: \${p.color};"></div>
                            <div class="progress-item-info">
                                <div class="progress-item-title progress-strikethrough">\${escapeHtml(p.title)}</div>
                                \${p.question ? \`<div class="progress-item-question">\${escapeHtml(p.question)}</div>\` : ''}
                            </div>
                            \${isYesterday ? \`
                                <button class="progress-complete-btn" onclick="completeProgressForDate('\${p.id}', '\${dateStr}')">
                                    <i class="fas fa-check"></i>
                                </button>
                            \` : ''}
                        </div>
                    \`;
                });
            }

            if (completedList.length === 0 && incompleteList.length === 0) {
                detailHtml = '<p class="empty-state">No progress entries for this date</p>';
            }

            document.getElementById('progressDetailList').innerHTML = detailHtml;
            modal.style.display = 'flex';
        }

        function completeProgressForDate(progressId, dateStr) {
            const progress = progressData.find(p => p.progressId === progressId);
            if (!progress) return;

            if (progress.question && progress.question.trim() !== '') {
                document.getElementById('answerProgressId').value = progressId;
                document.getElementById('answerDate').value = dateStr;
                document.getElementById('answerQuestionType').value = progress.questionType || 'number';
                document.getElementById('answerQuestionTitle').innerHTML = escapeHtml(progress.title);
                document.getElementById('answerQuestionLabel').innerHTML = progress.question;
                
                const input = document.getElementById('answerInput');
                input.type = progress.questionType === 'number' ? 'number' : 'text';
                input.placeholder = progress.questionType === 'number' ? 'Enter number' : 
                                   progress.questionType === 'boolean' ? 'Enter yes/no' : 'Enter answer';
                
                closeModal('progressDetailModal');
                openModal('answerQuestionModal');
            } else {
                submitProgressCompletion(progressId, dateStr, '');
            }
        }

        function submitProgressCompletion(progressId, dateStr, answer) {
            showLoader();
            const formData = new FormData();
            formData.append('progressId', progressId);
            formData.append('date', dateStr);
            formData.append('answer', answer);
            
            fetch('/api/progress/complete', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(res => {
                if (res.ok) {
                    showToast('Progress marked as completed!');
                    closeModal('answerQuestionModal');
                    closeModal('progressDetailModal');
                    switchPage('grow');
                } else {
                    return res.text().then(text => { throw new Error(text); });
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error: ' + err.message, 'error');
                hideLoader();
            });
        }

        function formatDateDisplay(dateStr) {
            const [year, month, day] = dateStr.split('-');
            return \`\${day}-\${month}-\${year}\`;
        }

        // ==========================================
        // RENDER NOTES PAGE
        // ==========================================
        function renderNotesPage() {
            let html = \`
                <h1 class="page-title">Notes</h1>
                <div class="tasks-grid">
            \`;

            if (!notesData || notesData.length === 0) {
                html += \`
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <i class="fas fa-note-sticky" style="font-size: 2rem;"></i>
                        <h3 style="margin-top: 12px;">No notes yet</h3>
                        <p style="margin-top: 8px; font-size: 0.85rem;">Click the + button to create your first note!</p>
                    </div>
                \`;
            } else {
                notesData.forEach(note => {
                    const hasDescription = hasContent(note.description);
                    const noteDescId = 'note_desc_' + note.noteId;
                    const escapedNoteTitle = escapeHtml(note.title);
                    
                    html += \`
                        <div class="note-card">
                            <div class="note-header">
                                <div class="task-title-container" onclick="toggleDescription('\${noteDescId}')">
                                    <i class="fas fa-chevron-right"></i>
                                    <span class="note-title">\${escapedNoteTitle}</span>
                                </div>
                                <div style="display: flex; gap: 4px;">
                                    <button class="action-btn" onclick="moveNote('\${note.noteId}', 'up')" title="Move Up">
                                        <i class="fas fa-arrow-up"></i>
                                    </button>
                                    <button class="action-btn" onclick="moveNote('\${note.noteId}', 'down')" title="Move Down">
                                        <i class="fas fa-arrow-down"></i>
                                    </button>
                                    <button class="action-btn" onclick="openEditNoteModal('\${note.noteId}', '\${escapeJsString(note.title)}', '\${escapeJsString(note.description || '')}')">
                                        <i class="fas fa-pencil-alt"></i>
                                    </button>
                                    <button class="action-btn delete" onclick="deleteNote('\${note.noteId}')">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                            
                            \${hasDescription ? \`
                                <div id="\${noteDescId}" class="note-content-container hidden">
                                    <div class="note-content">\${preserveLineBreaks(note.description)}</div>
                                </div>
                            \` : ''}
                            
                            <div class="note-meta">
                                <span><i class="fas fa-clock"></i> \${note.createdAtIST}</span>
                                \${note.updatedAtIST !== note.createdAtIST ? \`
                                    <span><i class="fas fa-pencil-alt"></i> \${note.updatedAtIST}</span>
                                \` : ''}
                            </div>
                        </div>
                    \`;
                });
            }

            html += \`</div>\`;
            return html;
        }

        // ==========================================
        // RENDER HISTORY PAGE
        // ==========================================
        function renderHistoryPage() {
            let html = \`
                <h1 class="page-title">Task History</h1>
                <div class="history-header">
                    <div class="month-selector">
                        <button class="month-btn" onclick="changeMonth(-1)">
                            <i class="fas fa-chevron-left"></i> Prev
                        </button>
                        <span style="font-weight: 600; font-size: 1rem;">
                            \${new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' })} \${currentYear}
                        </span>
                        <button class="month-btn" onclick="changeMonth(1)">
                            Next <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </div>
                <div class="history-grid">
            \`;

            const filteredHistory = filterHistoryByMonth(historyData, currentYear, currentMonth);
            const dates = Object.keys(filteredHistory).sort().reverse();

            if (dates.length === 0) {
                html += \`
                    <div class="empty-state">
                        <i class="fas fa-history" style="font-size: 2rem;"></i>
                        <h3 style="margin-top: 12px;">No completed tasks</h3>
                        <p style="margin-top: 8px; font-size: 0.85rem;">No tasks completed in this month</p>
                    </div>
                \`;
            } else {
                dates.forEach(date => {
                    const tasks = filteredHistory[date];
                    html += \`
                        <div class="history-date-card">
                            <details class="history-details" open>
                                <summary>
                                    <i class="fas fa-calendar-alt"></i>
                                    <span style="font-weight: 600;">\${date}</span>
                                    <span class="badge" style="margin-left: auto;">
                                        \${tasks.length} task\${tasks.length !== 1 ? 's' : ''}
                                    </span>
                                </summary>
                                <div class="history-tasks-grid">
                    \`;

                    tasks.forEach(task => {
                        const hasDescription = hasContent(task.description);
                        const historyDescId = 'history_desc_' + task._id;
                        const escapedHistoryTitle = escapeHtml(task.title);
                        
                        html += \`
                            <div class="history-task-card">
                                <div class="history-task-header">
                                    <div class="task-title-container" onclick="toggleDescription('\${historyDescId}')">
                                        <i class="fas fa-chevron-right"></i>
                                        <span class="history-task-title">\${escapedHistoryTitle}</span>
                                    </div>
                                    <span class="history-task-time">
                                        <i class="fas fa-check-circle" style="color: var(--success-light);"></i> \${task.completedTimeIST}
                                    </span>
                                </div>
                                
                                \${hasDescription ? \`
                                    <div id="\${historyDescId}" class="history-description-container hidden">
                                        <div class="history-description">\${preserveLineBreaks(task.description)}</div>
                                    </div>
                                \` : ''}
                                
                                <div style="display: flex; gap: 6px; margin: 8px 0; flex-wrap: wrap;">
                                    <span class="badge">
                                        <i class="fas fa-clock"></i> \${task.startTimeIST || formatTime(task.startDate)}-\${task.endTimeIST || formatTime(task.endDate)}
                                    </span>
                                    <span class="badge">
                                        <i class="fas fa-hourglass-half"></i> \${task.durationFormatted}
                                    </span>
                                    \${task.repeat && task.repeat !== 'none' ? \`
                                        <span class="badge">
                                            <i class="fas fa-repeat"></i> \${task.repeat === 'daily' ? 'Daily' : 'Weekly'}
                                        </span>
                                    \` : ''}
                                </div>
                                \${task.subtasks && task.subtasks.length > 0 ? \`
                                    <details style="margin-top: 8px;">
                                        <summary style="cursor: pointer; color: var(--accent-light); font-weight: 600; font-size: 0.8rem;">
                                            <i class="fas fa-tasks"></i> Subtasks (\${task.subtasks.filter(s => s.completed).length}/\${task.subtasks.length})
                                        </summary>
                                        <div style="margin-top: 8px;">
                                            \${task.subtasks.map(subtask => {
                                                const subtaskHasDesc = hasContent(subtask.description);
                                                const historySubtaskDescId = 'history_subtask_desc_' + task._id + '_' + subtask.id;
                                                
                                                return \`
                                                    <div class="history-subtask">
                                                        <div style="display: flex; align-items: flex-start; gap: 6px;">
                                                            <span style="color: \${subtask.completed ? 'var(--success-light)' : 'var(--text-secondary-light)'};">
                                                                <i class="fas fa-\${subtask.completed ? 'check-circle' : 'circle'}"></i>
                                                            </span>
                                                            <div style="flex: 1;">
                                                                <div class="task-title-container" onclick="toggleDescription('\${historySubtaskDescId}')">
                                                                    <span style="font-weight: 600; font-size: 0.8rem;">
                                                                        \${escapeHtml(subtask.title)}
                                                                    </span>
                                                                </div>
                                                                \${subtaskHasDesc ? \`
                                                                    <div id="\${historySubtaskDescId}" class="history-description-container hidden">
                                                                        <div class="history-description" style="border-left-color: var(--accent-light);">\${preserveLineBreaks(subtask.description)}</div>
                                                                    </div>
                                                                \` : ''}
                                                            </div>
                                                        </div>
                                                    </div>
                                                \`;
                                            }).join('')}
                                        </div>
                                    </details>
                                \` : ''}
                            </div>
                        \`;
                    });

                    html += \`
                                </div>
                            </details>
                        </div>
                    \`;
                });
            }

            html += \`</div>\`;
            return html;
        }

        function filterHistoryByMonth(history, year, month) {
            const filtered = {};
            Object.keys(history).forEach(date => {
                const [day, monthNum, yearNum] = date.split('-').map(Number);
                if (yearNum === year && monthNum - 1 === month) {
                    filtered[date] = history[date];
                }
            });
            return filtered;
        }

        function changeMonth(delta) {
            currentMonth += delta;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            } else if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            renderPage();
        }

        function formatTime(dateString) {
            const date = new Date(dateString);
            return date.toISOString().split('T')[1].substring(0, 5);
        }

        // ==========================================
        // MODAL FUNCTIONS
        // ==========================================
        function openModal(modalId) {
            document.getElementById(modalId).style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

        function closeModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        function openAddModal() {
            if (currentPage === 'tasks') {
                openAddTaskModal();
            } else if (currentPage === 'grow') {
                openAddProgressModal();
            } else if (currentPage === 'notes') {
                openAddNoteModal();
            }
        }

        function openAddTaskModal() {
            const now = new Date();
            const istOffset = 5.5 * 60 * 60 * 1000;
            const istNow = new Date(now.getTime() + istOffset);
            
            const year = istNow.getUTCFullYear();
            const month = String(istNow.getUTCMonth() + 1).padStart(2, '0');
            const day = String(istNow.getUTCDate()).padStart(2, '0');
            const hours = String(istNow.getUTCHours()).padStart(2, '0');
            const minutes = String(istNow.getUTCMinutes()).padStart(2, '0');
            
            document.getElementById('startDate').value = \`\${year}-\${month}-\${day}\`;
            document.getElementById('startTime').value = \`\${hours}:\${minutes}\`;
            
            const endHours = String(istNow.getUTCHours() + 1).padStart(2, '0');
            document.getElementById('endTime').value = \`\${endHours}:\${minutes}\`;
            
            openModal('addTaskModal');
        }

        function openEditTaskModal(taskId) {
            fetch('/api/tasks/' + taskId)
                .then(res => res.json())
                .then(task => {
                    document.getElementById('editTaskId').value = task.taskId;
                    document.getElementById('editTitle').value = task.title;
                    document.getElementById('editDescription').value = task.description || '';
                    
                    document.getElementById('editStartDate').value = task.startDateIST || task.startDate;
                    document.getElementById('editStartTime').value = task.startTimeIST || task.startTime;
                    document.getElementById('editEndTime').value = task.endTimeIST || task.endTime;
                    
                    document.getElementById('editRepeatSelect').value = task.repeat || 'none';
                    document.getElementById('editRepeatCount').value = task.repeatCount || 7;
                    document.getElementById('editRepeatCountGroup').style.display = 
                        task.repeat !== 'none' ? 'block' : 'none';
                    
                    openModal('editTaskModal');
                })
                .catch(err => {
                    console.error(err);
                    showToast('Error loading task details', 'error');
                });
        }

        function openAddSubtaskModal(taskId) {
            document.getElementById('subtaskTaskId').value = taskId;
            openModal('addSubtaskModal');
        }

        function editSubtask(taskId, subtaskId, title, description) {
            document.getElementById('editSubtaskTaskId').value = taskId;
            document.getElementById('editSubtaskId').value = subtaskId;
            document.getElementById('editSubtaskTitle').value = title;
            document.getElementById('editSubtaskDescription').value = description || '';
            openModal('editSubtaskModal');
        }

        function openAddNoteModal() {
            openModal('addNoteModal');
        }

        function openEditNoteModal(noteId, title, description) {
            document.getElementById('editNoteId').value = noteId;
            document.getElementById('editNoteTitle').value = title;
            document.getElementById('editNoteDescription').value = description || '';
            openModal('editNoteModal');
        }

        function openAddProgressModal() {
            openModal('addProgressModal');
        }

        function openEditProgressModal(progressId) {
            fetch('/api/progress/' + progressId)
                .then(res => res.json())
                .then(progress => {
                    document.getElementById('editProgressId').value = progress.progressId;
                    document.getElementById('editProgressTitle').value = progress.title;
                    document.getElementById('editProgressDescription').value = progress.description || '';
                    document.getElementById('editProgressTotalRounds').value = progress.totalRounds || 365;
                    document.getElementById('editProgressQuestion').value = progress.question || '';
                    document.getElementById('editProgressQuestionType').value = progress.questionType || 'number';
                    document.getElementById('editProgressColor').value = progress.color || '#2563eb';
                    
                    openModal('editProgressModal');
                })
                .catch(err => {
                    console.error(err);
                    showToast('Error loading progress details', 'error');
                });
        }

        // ==========================================
        // FORM SUBMISSIONS
        // ==========================================
        function submitTaskForm(event) {
            event.preventDefault();
            showLoader();
            const formData = new FormData(event.target);
            
            fetch('/api/tasks', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(res => {
                if (res.ok) {
                    closeModal('addTaskModal');
                    showToast('Task created successfully!');
                    switchPage('tasks');
                } else {
                    return res.text().then(text => { throw new Error(text); });
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error creating task: ' + err.message, 'error');
                hideLoader();
            });
        }

        function submitEditTaskForm(event) {
            event.preventDefault();
            showLoader();
            const formData = new FormData(event.target);
            const taskId = formData.get('taskId');
            
            fetch('/api/tasks/' + taskId + '/update', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(res => {
                if (res.ok) {
                    closeModal('editTaskModal');
                    showToast('Task updated successfully!');
                    switchPage('tasks');
                } else {
                    return res.text().then(text => { throw new Error(text); });
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error updating task: ' + err.message, 'error');
                hideLoader();
            });
        }

        function submitSubtaskForm(event) {
            event.preventDefault();
            showLoader();
            const formData = new FormData(event.target);
            const taskId = formData.get('taskId');
            
            fetch('/api/tasks/' + taskId + '/subtasks', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(res => {
                if (res.ok) {
                    closeModal('addSubtaskModal');
                    showToast('Subtask added successfully!');
                    switchPage('tasks');
                } else {
                    return res.text().then(text => { throw new Error(text); });
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error adding subtask: ' + err.message, 'error');
                hideLoader();
            });
        }

        function submitEditSubtaskForm(event) {
            event.preventDefault();
            showLoader();
            const formData = new FormData(event.target);
            const taskId = formData.get('taskId');
            const subtaskId = formData.get('subtaskId');
            
            fetch('/api/tasks/' + taskId + '/subtasks/' + subtaskId + '/update', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(res => {
                if (res.ok) {
                    closeModal('editSubtaskModal');
                    showToast('Subtask updated successfully!');
                    switchPage('tasks');
                } else {
                    return res.text().then(text => { throw new Error(text); });
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error updating subtask: ' + err.message, 'error');
                hideLoader();
            });
        }

        function submitNoteForm(event) {
            event.preventDefault();
            showLoader();
            const formData = new FormData(event.target);
            
            fetch('/api/notes', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(res => {
                if (res.ok) {
                    closeModal('addNoteModal');
                    showToast('Note created successfully!');
                    switchPage('notes');
                } else {
                    return res.text().then(text => { throw new Error(text); });
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error creating note: ' + err.message, 'error');
                hideLoader();
            });
        }

        function submitEditNoteForm(event) {
            event.preventDefault();
            showLoader();
            const formData = new FormData(event.target);
            const noteId = formData.get('noteId');
            
            fetch('/api/notes/' + noteId + '/update', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(res => {
                if (res.ok) {
                    closeModal('editNoteModal');
                    showToast('Note updated successfully!');
                    switchPage('notes');
                } else {
                    return res.text().then(text => { throw new Error(text); });
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error updating note: ' + err.message, 'error');
                hideLoader();
            });
        }

        function submitProgressForm(event) {
            event.preventDefault();
            showLoader();
            const formData = new FormData(event.target);
            
            fetch('/api/progress', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(res => {
                if (res.ok) {
                    closeModal('addProgressModal');
                    showToast('Progress tracker created!');
                    switchPage('grow');
                } else {
                    return res.text().then(text => { throw new Error(text); });
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error creating tracker: ' + err.message, 'error');
                hideLoader();
            });
        }

        function submitEditProgressForm(event) {
            event.preventDefault();
            showLoader();
            const formData = new FormData(event.target);
            const progressId = formData.get('progressId');
            
            fetch('/api/progress/' + progressId + '/update', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(res => {
                if (res.ok) {
                    closeModal('editProgressModal');
                    showToast('Progress tracker updated!');
                    switchPage('grow');
                } else {
                    return res.text().then(text => { throw new Error(text); });
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error updating tracker: ' + err.message, 'error');
                hideLoader();
            });
        }

        function submitAnswerForm(event) {
            event.preventDefault();
            const progressId = document.getElementById('answerProgressId').value;
            const date = document.getElementById('answerDate').value;
            const answer = document.getElementById('answerInput').value;
            const questionType = document.getElementById('answerQuestionType').value;
            
            if (questionType === 'boolean') {
                const normalized = answer.toLowerCase();
                if (normalized !== 'yes' && normalized !== 'no' && normalized !== 'y' && normalized !== 'n') {
                    showToast('Please enter yes or no', 'warning');
                    return;
                }
            }
            
            submitProgressCompletion(progressId, date, answer);
        }

        // ==========================================
        // ACTION FUNCTIONS
        // ==========================================
        function toggleSubtask(taskId, subtaskId) {
            showLoader();
            fetch('/api/tasks/' + taskId + '/subtasks/' + subtaskId + '/toggle', {
                method: 'POST'
            })
            .then(res => {
                if (res.ok) {
                    showToast('Subtask toggled');
                    switchPage('tasks');
                } else {
                    throw new Error('Failed to toggle subtask');
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error toggling subtask', 'error');
                hideLoader();
            });
        }

        function deleteSubtask(taskId, subtaskId) {
            if (!confirm('Delete this subtask?')) return;
            showLoader();
            fetch('/api/tasks/' + taskId + '/subtasks/' + subtaskId + '/delete', {
                method: 'POST'
            })
            .then(res => {
                if (res.ok) {
                    showToast('Subtask deleted');
                    switchPage('tasks');
                } else {
                    throw new Error('Failed to delete subtask');
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error deleting subtask', 'error');
                hideLoader();
            });
        }

        function completeTask(taskId) {
            if (!confirm('Complete this task?')) return;
            showLoader();
            fetch('/api/tasks/' + taskId + '/complete', {
                method: 'POST'
            })
            .then(res => {
                if (res.ok) {
                    showToast('Task completed!');
                    switchPage('tasks');
                } else {
                    return res.text().then(text => { throw new Error(text); });
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error completing task: ' + err.message, 'error');
                hideLoader();
            });
        }

        function deleteTask(taskId) {
            if (!confirm('Delete this task? This will affect all users!')) return;
            showLoader();
            fetch('/api/tasks/' + taskId + '/delete', {
                method: 'POST'
            })
            .then(res => {
                if (res.ok) {
                    showToast('Task deleted');
                    switchPage('tasks');
                } else {
                    throw new Error('Failed to delete task');
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error deleting task', 'error');
                hideLoader();
            });
        }

        function deleteProgress(progressId) {
            if (!confirm('Delete this progress tracker?')) return;
            showLoader();
            fetch('/api/progress/' + progressId + '/delete', {
                method: 'POST'
            })
            .then(res => {
                if (res.ok) {
                    showToast('Progress tracker deleted');
                    switchPage('grow');
                } else {
                    throw new Error('Failed to delete progress');
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error deleting progress', 'error');
                hideLoader();
            });
        }

        function deleteNote(noteId) {
            if (!confirm('Delete this note? This will affect all users!')) return;
            showLoader();
            fetch('/api/notes/' + noteId + '/delete', {
                method: 'POST'
            })
            .then(res => {
                if (res.ok) {
                    showToast('Note deleted');
                    switchPage('notes');
                } else {
                    throw new Error('Failed to delete note');
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error deleting note', 'error');
                hideLoader();
            });
        }

        function moveNote(noteId, direction) {
            showLoader();
            const formData = new FormData();
            formData.append('direction', direction);
            
            fetch('/api/notes/' + noteId + '/move', {
                method: 'POST',
                body: new URLSearchParams(formData)
            })
            .then(res => {
                if (res.ok) {
                    showToast('Note moved');
                    switchPage('notes');
                } else {
                    throw new Error('Failed to move note');
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error moving note', 'error');
                hideLoader();
            });
        }

        // ==========================================
        // INITIALIZATION
        // ==========================================
        document.addEventListener('DOMContentLoaded', function() {
            renderPage();
            updateActiveNav();
            
            setInterval(() => {
                const now = new Date();
                const istOffset = 5.5 * 60 * 60 * 1000;
                const istNow = new Date(now.getTime() + istOffset);
                
                const hours = String(istNow.getUTCHours()).padStart(2, '0');
                const minutes = String(istNow.getUTCMinutes()).padStart(2, '0');
                const day = String(istNow.getUTCDate()).padStart(2, '0');
                const month = String(istNow.getUTCMonth() + 1).padStart(2, '0');
                const year = istNow.getUTCFullYear();
                
                document.getElementById('currentTimeDisplay').innerHTML = \`\${hours}:\${minutes}\`;
                document.getElementById('currentDateDisplay').innerHTML = \`\${day}-\${month}-\${year}\`;
            }, 1000);
            
            document.getElementById('repeatSelect').addEventListener('change', function() {
                document.getElementById('repeatCountGroup').style.display = 
                    this.value === 'none' ? 'none' : 'block';
            });
            
            document.getElementById('editRepeatSelect').addEventListener('change', function() {
                document.getElementById('editRepeatCountGroup').style.display = 
                    this.value === 'none' ? 'none' : 'block';
            });
            
            window.addEventListener('click', function(event) {
                if (event.target.classList.contains('modal')) {
                    event.target.style.display = 'none';
                    document.body.style.overflow = 'auto';
                }
            });
        });
    </script>
</body>
</html>`;

    fs.writeFileSync(path.join(viewsDir, 'index.ejs'), mainEJS);
    console.log('✅ EJS template file created successfully with Grow tab and progress tracking');
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
            client = new MongoClient(MONGODB_URI, {
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 15000,
                socketTimeoutMS: 45000,
                maxPoolSize: 10,
                minPoolSize: 2
            });
            
            await client.connect();
            db = client.db('telegram_bot');
            console.log('✅ Connected to MongoDB - Global Mode');
            console.log('🕐 Timezone: IST (UTC+5:30) - Translation Layer Active');
            
            try {
                await db.collection('tasks').createIndex({ taskId: 1 }, { unique: true });
                await db.collection('tasks').createIndex({ nextOccurrence: 1 });
                await db.collection('tasks').createIndex({ orderIndex: 1 });
                await db.collection('history').createIndex({ completedAt: -1 });
                await db.collection('history').createIndex({ originalTaskId: 1 });
                await db.collection('history').createIndex({ completedDate: -1 });
                await db.collection('notes').createIndex({ noteId: 1 }, { unique: true });
                await db.collection('notes').createIndex({ orderIndex: 1 });
                await db.collection('progress').createIndex({ progressId: 1 }, { unique: true });
                await db.collection('progressEntries').createIndex({ progressId: 1, date: 1 }, { unique: true });
                console.log('✅ Indexes created');
            } catch (indexError) {
                console.warn('⚠️ Index creation warning:', indexError.message);
            }
            
            return true;
        } catch (error) {
            retries--;
            console.error('❌ MongoDB Connection Error (' + retries + ' retries left):', error.message);
            if (retries === 0) {
                console.error('❌ Failed to connect to MongoDB after multiple attempts');
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    return false;
}

app.get('/health', (req, res) => {
    const now = new Date();
    const ist = utcToISTDisplay(now);
    res.status(200).json({ 
        status: 'OK', 
        time: now.toISOString(),
        istTime: ist.dateTime,
        uptime: process.uptime()
    });
});

// ==========================================
// 🛠️ UTILITY FUNCTIONS
// ==========================================
function generateId(type = 'task') {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    const length = type === 'task' ? 10 : type === 'progress' ? 10 : 8;
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateSubtaskId() {
    return 'sub_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
}

async function reindexNotes() {
    try {
        const notes = await db.collection('notes')
            .find()
            .sort({ orderIndex: 1 })
            .toArray();
        
        for (let i = 0; i < notes.length; i++) {
            await db.collection('notes').updateOne(
                { noteId: notes[i].noteId },
                { $set: { orderIndex: i } }
            );
        }
        console.log('✅ Notes reindexed successfully');
    } catch (error) {
        console.error('❌ Error reindexing notes:', error.message);
    }
}

async function safeEdit(ctx, text, keyboard = null) {
    try {
        const options = { 
            parse_mode: 'HTML',
            ...(keyboard && { reply_markup: keyboard.reply_markup })
        };
        await ctx.editMessageText(text, options);
    } catch (err) {
        if (err.description && (
            err.description.includes("message is not modified") || 
            err.description.includes("message can't be edited")
        )) {
            try {
                const options = { 
                    parse_mode: 'HTML',
                    ...(keyboard && { reply_markup: keyboard.reply_markup })
                };
                await ctx.reply(text, options);
            } catch (e) { 
                console.error('SafeEdit Reply Error:', e.message);
            }
            return;
        }
        console.error('SafeEdit Error:', err.message);
    }
}

function hasContent(text) {
    return text && text.trim().length > 0;
}

function formatBlockquote(text) {
    if (!hasContent(text)) return '';
    const words = text.split(/\s+/).length;
    if (words > 100 || text.split('\n').length > 4) {
        return '<blockquote expandable>' + text + '</blockquote>';
    }
    return '<blockquote>' + text + '</blockquote>';
}

function calculateSubtaskProgress(subtasks) {
    if (!subtasks || subtasks.length === 0) return 0;
    const completed = subtasks.filter(s => s.completed).length;
    return Math.round((completed / subtasks.length) * 100);
}

function calculateDuration(startDate, endDate) {
    return Math.round((endDate - startDate) / 60000);
}

function formatDuration(minutes) {
    if (minutes < 0) return '0 mins';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return mins + ' min' + (mins !== 1 ? 's' : '');
    if (mins === 0) return hours + ' hour' + (hours !== 1 ? 's' : '');
    return hours + ' hour' + (hours !== 1 ? 's' : '') + ' ' + mins + ' min' + (mins !== 1 ? 's' : '');
}

// ==========================================
// ⏰ SCHEDULER LOGIC
// ==========================================
function scheduleTask(task) {
    if (!task || !task.taskId || !task.startDate) return;
    
    try {
        const taskId = task.taskId;
        const startTimeUTC = new Date(task.startDate);
        const nowUTC = new Date();

        cancelTaskSchedule(taskId);

        const tenMinutesFromNowUTC = new Date(nowUTC.getTime() + 10 * 60000);
        if (startTimeUTC <= tenMinutesFromNowUTC) {
            console.log('⏰ Not scheduling task ' + task.title + ' - start time is within 10 minutes or in past');
            return;
        }

        const notifyTimeUTC = new Date(startTimeUTC.getTime() - 10 * 60000);
        const triggerDateUTC = notifyTimeUTC > nowUTC ? notifyTimeUTC : nowUTC;

        const startTimeIST = utcToISTDisplay(startTimeUTC);
        console.log('⏰ Scheduled: ' + task.title + ' for IST: ' + startTimeIST.dateTime + ' | UTC: ' + startTimeUTC.toISOString());

        const startJob = schedule.scheduleJob(triggerDateUTC, async function() {
            if (isShuttingDown) return;
            
            console.log('🔔 Starting notifications for task: ' + task.title + ' (IST: ' + utcToISTDisplay(new Date()).dateTime + ')');
            
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
                        try {
                            await bot.telegram.sendMessage(CHAT_ID, 
                                '🚀 <b>𝙏𝘼𝙎𝙆 𝙎𝙏𝘼𝙍𝙏𝙀𝘿 𝙉𝙊𝙒!</b>\n' +
                                '📌 <b>Title: ' + task.title + '</b>\n\n' +
                                '⏰ IST: ' + utcToISTDisplay(startTimeUTC).displayTime + '\n' +
                                'Time to work! ⏰', 
                                { parse_mode: 'HTML' }
                            );
                        } catch (e) {
                            console.error('Error sending start message:', e.message);
                        }
                    }
                    
                    return;
                }

                const minutesLeft = Math.ceil((startTimeUTC - currentTimeUTC) / 60000);
                if (minutesLeft <= 0) return;

                try {
                    await bot.telegram.sendMessage(CHAT_ID, 
                        '🔔 <b>𝗥𝗘𝗠𝗜𝗡𝗗𝗘𝗥 (' + (count + 1) + '/' + maxNotifications + ')</b>\n' +
                        '━━━━━━━━━━━━━━━━━━━━\n' +
                        '📌 <b>' + task.title + '</b>\n' +
                        '⏳ Starts in: <b>' + minutesLeft + ' minute' + (minutesLeft !== 1 ? 's' : '') + '</b>\n' +
                        '⏰ IST: ' + utcToISTDisplay(startTimeUTC).displayTime + '\n' +
                        '📅 Date: ' + utcToISTDisplay(startTimeUTC).displayDate + '\n' +
                        '━━━━━━━━━━━━━━━━━━━━', 
                        { parse_mode: 'HTML' }
                    );
                } catch (e) {
                    console.error('Error sending notification:', e.message);
                }
                
                count++;
            };

            await sendNotification();
            
            const interval = setInterval(sendNotification, 60000);
            
            if (activeSchedules.has(taskId)) {
                if (activeSchedules.get(taskId).interval) {
                    clearInterval(activeSchedules.get(taskId).interval);
                }
                activeSchedules.get(taskId).interval = interval;
            } else {
                activeSchedules.set(taskId, { startJob, interval });
            }
        });

        if (activeSchedules.has(taskId)) {
            if (activeSchedules.get(taskId).startJob) {
                activeSchedules.get(taskId).startJob.cancel();
            }
            activeSchedules.get(taskId).startJob = startJob;
        } else {
            activeSchedules.set(taskId, { startJob });
        }

    } catch (error) {
        console.error('❌ Scheduler Error for task ' + (task?.taskId || 'unknown') + ':', error.message);
    }
}

function cancelTaskSchedule(taskId) {
    if (activeSchedules.has(taskId)) {
        const s = activeSchedules.get(taskId);
        if (s.startJob) {
            try { s.startJob.cancel(); } catch (e) {}
        }
        if (s.interval) {
            try { clearInterval(s.interval); } catch (e) {}
        }
        activeSchedules.delete(taskId);
        console.log('🗑️ Cleared schedules for task ' + taskId);
    }
}

async function rescheduleAllPending() {
    try {
        const tenMinutesFromNowUTC = new Date(Date.now() + 10 * 60000);
        const tasks = await db.collection('tasks').find({ 
            status: 'pending',
            startDate: { $gt: tenMinutesFromNowUTC }
        }).toArray();
        
        console.log('🔄 Rescheduling ' + tasks.length + ' pending tasks...');
        tasks.forEach(task => scheduleTask(task));
        console.log('✅ Rescheduled ' + tasks.length + ' tasks.');
    } catch (error) {
        console.error('❌ Error rescheduling tasks:', error.message);
    }
}

async function autoCompletePendingTasks() {
    console.log('⏰ Running auto-complete for pending tasks at 23:59 IST...');
    
    try {
        const todayStartUTC = getTodayStartUTC();
        const tomorrowStartUTC = getTomorrowStartUTC();
        
        const pendingTasks = await db.collection('tasks').find({
            status: 'pending',
            nextOccurrence: {
                $gte: todayStartUTC,
                $lt: tomorrowStartUTC
            }
        }).toArray();
        
        console.log('📋 Found ' + pendingTasks.length + ' pending tasks to auto-complete');
        
        for (const task of pendingTasks) {
            await autoCompleteTask(task);
        }
        
        console.log('✅ Auto-completed ' + pendingTasks.length + ' tasks');
    } catch (error) {
        console.error('❌ Error in auto-complete:', error.message);
    }
}

async function autoCompleteTask(task) {
    try {
        const taskId = task.taskId;
        const completedAtUTC = new Date();
        const completedDateUTC = getTodayStartUTC();
        
        const historyItem = {
            ...task,
            _id: undefined,
            completedAt: completedAtUTC,
            completedDate: completedDateUTC,
            originalTaskId: task.taskId,
            status: 'completed',
            completedFromDate: task.nextOccurrence,
            autoCompleted: true
        };
        
        delete historyItem._id;
        
        await db.collection('history').insertOne(historyItem);
        
        cancelTaskSchedule(taskId);
        
        if (task.repeat !== 'none' && task.repeatCount > 0) {
            const nextOccurrenceUTC = new Date(task.nextOccurrence);
            const daysToAdd = task.repeat === 'weekly' ? 7 : 1;
            nextOccurrenceUTC.setUTCDate(nextOccurrenceUTC.getUTCDate() + daysToAdd);
            
            await db.collection('tasks').updateOne({ taskId }, {
                $set: {
                    nextOccurrence: nextOccurrenceUTC,
                    repeatCount: task.repeatCount - 1,
                    startDate: nextOccurrenceUTC,
                    endDate: new Date(nextOccurrenceUTC.getTime() + 
                        (task.endDate.getTime() - task.startDate.getTime()))
                }
            });
            
            const updatedTask = await db.collection('tasks').findOne({ taskId });
            const tenMinutesFromNowUTC = new Date(Date.now() + 10 * 60000);
            if (updatedTask && updatedTask.nextOccurrence > tenMinutesFromNowUTC) {
                scheduleTask(updatedTask);
            }
        } else {
            await db.collection('tasks').deleteOne({ taskId });
        }
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                '⏰ <b>𝗔𝗨𝗧𝗢-𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗧𝗔𝗦𝗞</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '📌 <b>' + task.title + '</b>\n' +
                '✅ Automatically completed at 23:59 IST\n' +
                '📅 ' + utcToISTDisplay(completedAtUTC).displayDate + '\n' +
                '━━━━━━━━━━━━━━━━━━━━',
                { parse_mode: 'HTML' }
            );
        } catch (e) {
            console.error('Error sending auto-complete notification:', e.message);
        }
        
    } catch (error) {
        console.error('Error auto-completing task ' + task.taskId + ':', error.message);
    }
}

function scheduleAutoComplete() {
    if (autoCompleteJob) {
        autoCompleteJob.cancel();
    }
    
    autoCompleteJob = schedule.scheduleJob('29 18 * * *', async () => {
        if (!isShuttingDown) await autoCompletePendingTasks();
    });
    
    console.log('✅ Auto-complete scheduler started (23:59 IST / 18:29 UTC daily)');
}

// ==========================================
// 📱 WEB INTERFACE ROUTES
// ==========================================
app.get('/', (req, res) => {
    res.redirect('/tasks');
});

app.get('/tasks', async (req, res) => {
    try {
        const todayStartUTC = getTodayStartUTC();
        const tomorrowStartUTC = getTomorrowStartUTC();
        
        const tasks = await db.collection('tasks').find({
            status: 'pending',
            nextOccurrence: {
                $gte: todayStartUTC,
                $lt: tomorrowStartUTC
            }
        }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray();
        
        console.log('📊 Tasks found: ' + tasks.length);
        
        const currentIST = getCurrentISTDisplay();
        
        res.render('index', {
            currentPage: 'tasks',
            tasks: tasks.map(task => {
                const startIST = utcToISTDisplay(task.startDate);
                const endIST = utcToISTDisplay(task.endDate);
                
                return {
                    ...task,
                    taskId: task.taskId,
                    startTimeIST: startIST.displayTime,
                    endTimeIST: endIST.displayTime,
                    dateIST: startIST.displayDate,
                    startTimeUTC: formatTimeUTC(task.startDate),
                    endTimeUTC: formatTimeUTC(task.endDate),
                    dateUTC: formatDateUTC(task.startDate),
                    duration: calculateDuration(task.startDate, task.endDate),
                    durationFormatted: formatDuration(calculateDuration(task.startDate, task.endDate)),
                    subtaskProgress: calculateSubtaskProgress(task.subtasks),
                    subtasks: task.subtasks || []
                };
            }),
            notes: [],
            groupedHistory: {},
            progress: [],
            progressEntries: {},
            currentTime: currentIST.displayTime,
            currentDate: currentIST.displayDate,
            formatDateUTC: formatDateUTC,
            formatTimeUTC: formatTimeUTC
        });
    } catch (error) {
        console.error('Error loading tasks:', error);
        res.status(500).send('Error loading tasks: ' + error.message);
    }
});

app.get('/grow', async (req, res) => {
    try {
        const progress = await db.collection('progress')
            .find()
            .sort({ createdAt: -1 })
            .toArray();
        
        const progressEntries = {};
        const entries = await db.collection('progressEntries')
            .find()
            .toArray();
        
        entries.forEach(entry => {
            if (!progressEntries[entry.progressId]) {
                progressEntries[entry.progressId] = [];
            }
            progressEntries[entry.progressId].push(entry);
        });
        
        console.log('📊 Progress trackers found: ' + progress.length);
        
        const currentIST = getCurrentISTDisplay();
        
        res.render('index', {
            currentPage: 'grow',
            tasks: [],
            notes: [],
            groupedHistory: {},
            progress: progress,
            progressEntries: progressEntries,
            currentTime: currentIST.displayTime,
            currentDate: currentIST.displayDate,
            formatDateUTC: formatDateUTC,
            formatTimeUTC: formatTimeUTC
        });
    } catch (error) {
        console.error('Error loading progress:', error);
        res.status(500).send('Error loading progress: ' + error.message);
    }
});

app.get('/notes', async (req, res) => {
    try {
        const notes = await db.collection('notes').find()
            .sort({ orderIndex: 1, createdAt: -1 })
            .toArray();
        
        console.log('📝 Notes found: ' + notes.length);
        
        const currentIST = getCurrentISTDisplay();
        
        res.render('index', {
            currentPage: 'notes',
            tasks: [],
            notes: notes.map(note => ({
                ...note,
                noteId: note.noteId,
                createdAtIST: utcToISTDisplay(note.createdAt).dateTime,
                updatedAtIST: note.updatedAt ? utcToISTDisplay(note.updatedAt).dateTime : utcToISTDisplay(note.createdAt).dateTime
            })),
            groupedHistory: {},
            progress: [],
            progressEntries: {},
            currentTime: currentIST.displayTime,
            currentDate: currentIST.displayDate,
            formatDateUTC: formatDateUTC,
            formatTimeUTC: formatTimeUTC
        });
    } catch (error) {
        console.error('Error loading notes:', error);
        res.status(500).send('Error loading notes: ' + error.message);
    }
});

app.get('/history', async (req, res) => {
    try {
        const history = await db.collection('history').find()
            .sort({ completedAt: -1 })
            .limit(500)
            .toArray();
        
        const groupedHistory = {};
        history.forEach(item => {
            const istCompleted = utcToISTDisplay(item.completedAt);
            const dateKey = istCompleted.displayDate;
            
            if (!groupedHistory[dateKey]) {
                groupedHistory[dateKey] = [];
            }
            
            const startIST = utcToISTDisplay(item.startDate);
            const endIST = utcToISTDisplay(item.endDate);
            
            groupedHistory[dateKey].push({
                ...item,
                completedTimeIST: istCompleted.displayTime,
                startTimeIST: startIST.displayTime,
                endTimeIST: endIST.displayTime,
                durationFormatted: formatDuration(calculateDuration(item.startDate, item.endDate))
            });
        });
        
        console.log('📜 History entries: ' + history.length);
        
        const currentIST = getCurrentISTDisplay();
        
        res.render('index', {
            currentPage: 'history',
            tasks: [],
            notes: [],
            groupedHistory: groupedHistory,
            progress: [],
            progressEntries: {},
            currentTime: currentIST.displayTime,
            currentDate: currentIST.displayDate,
            formatDateUTC: formatDateUTC,
            formatTimeUTC: formatTimeUTC
        });
    } catch (error) {
        console.error('Error loading history:', error);
        res.status(500).send('Error loading history: ' + error.message);
    }
});

app.get('/api/page/:page', async (req, res) => {
    try {
        const page = req.params.page;
        
        if (page === 'tasks') {
            const todayStartUTC = getTodayStartUTC();
            const tomorrowStartUTC = getTomorrowStartUTC();
            
            const tasks = await db.collection('tasks').find({
                status: 'pending',
                nextOccurrence: {
                    $gte: todayStartUTC,
                    $lt: tomorrowStartUTC
                }
            }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray();
            
            res.json({
                tasks: tasks.map(task => {
                    const startIST = utcToISTDisplay(task.startDate);
                    const endIST = utcToISTDisplay(task.endDate);
                    
                    return {
                        ...task,
                        taskId: task.taskId,
                        startTimeIST: startIST.displayTime,
                        endTimeIST: endIST.displayTime,
                        dateIST: startIST.displayDate,
                        startTimeUTC: formatTimeUTC(task.startDate),
                        endTimeUTC: formatTimeUTC(task.endDate),
                        dateUTC: formatDateUTC(task.startDate),
                        duration: calculateDuration(task.startDate, task.endDate),
                        durationFormatted: formatDuration(calculateDuration(task.startDate, task.endDate)),
                        subtaskProgress: calculateSubtaskProgress(task.subtasks),
                        subtasks: task.subtasks || []
                    };
                }),
                notes: [],
                groupedHistory: {},
                progress: [],
                progressEntries: {}
            });
        } else if (page === 'grow') {
            const progress = await db.collection('progress')
                .find()
                .sort({ createdAt: -1 })
                .toArray();
            
            const progressEntries = {};
            const entries = await db.collection('progressEntries')
                .find()
                .toArray();
            
            entries.forEach(entry => {
                if (!progressEntries[entry.progressId]) {
                    progressEntries[entry.progressId] = [];
                }
                progressEntries[entry.progressId].push(entry);
            });
            
            res.json({
                tasks: [],
                notes: [],
                groupedHistory: {},
                progress: progress,
                progressEntries: progressEntries
            });
        } else if (page === 'notes') {
            const notes = await db.collection('notes').find()
                .sort({ orderIndex: 1, createdAt: -1 })
                .toArray();
            
            res.json({
                tasks: [],
                notes: notes.map(note => ({
                    ...note,
                    noteId: note.noteId,
                    createdAtIST: utcToISTDisplay(note.createdAt).dateTime,
                    updatedAtIST: note.updatedAt ? utcToISTDisplay(note.updatedAt).dateTime : utcToISTDisplay(note.createdAt).dateTime
                })),
                groupedHistory: {},
                progress: [],
                progressEntries: {}
            });
        } else if (page === 'history') {
            const history = await db.collection('history').find()
                .sort({ completedAt: -1 })
                .limit(500)
                .toArray();
            
            const groupedHistory = {};
            history.forEach(item => {
                const istCompleted = utcToISTDisplay(item.completedAt);
                const dateKey = istCompleted.displayDate;
                
                if (!groupedHistory[dateKey]) {
                    groupedHistory[dateKey] = [];
                }
                
                const startIST = utcToISTDisplay(item.startDate);
                const endIST = utcToISTDisplay(item.endDate);
                
                groupedHistory[dateKey].push({
                    ...item,
                    completedTimeIST: istCompleted.displayTime,
                    startTimeIST: startIST.displayTime,
                    endTimeIST: endIST.displayTime,
                    durationFormatted: formatDuration(calculateDuration(item.startDate, item.endDate))
                });
            });
            
            res.json({
                tasks: [],
                notes: [],
                groupedHistory,
                progress: [],
                progressEntries: {}
            });
        } else {
            res.status(404).json({ error: 'Page not found' });
        }
    } catch (error) {
        console.error('Error in /api/page:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/tasks/:taskId', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const task = await db.collection('tasks').findOne({ taskId });
        
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        const startIST = utcToISTDisplay(task.startDate);
        const endIST = utcToISTDisplay(task.endDate);
        
        res.json({
            ...task,
            taskId: task.taskId,
            startDateIST: startIST.date,
            startTimeIST: startIST.time,
            endTimeIST: endIST.time,
            startTimeUTC: formatTimeUTC(task.startDate),
            endTimeUTC: formatTimeUTC(task.endDate),
            dateUTC: formatDateUTC(task.startDate)
        });
    } catch (error) {
        console.error('Error fetching task:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/progress/:progressId', async (req, res) => {
    try {
        const progressId = req.params.progressId;
        const progress = await db.collection('progress').findOne({ progressId });
        
        if (!progress) {
            return res.status(404).json({ error: 'Progress tracker not found' });
        }
        
        res.json(progress);
    } catch (error) {
        console.error('Error fetching progress:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/tasks', async (req, res) => {
    try {
        const { title, description, startDate, startTime, endTime, repeat, repeatCount } = req.body;
        
        if (!title || !startDate || !startTime || !endTime) {
            return res.status(400).send('Missing required fields');
        }
        
        const startDateUTC = istToUTC(startDate, startTime);
        const endDateUTC = istToUTC(startDate, endTime);
        
        if (!startDateUTC || !endDateUTC) {
            return res.status(400).send('Invalid date/time format');
        }
        
        if (endDateUTC <= startDateUTC) {
            return res.status(400).send('End time must be after start time');
        }
        
        const nowUTC = new Date();
        const tenMinutesFromNowUTC = new Date(nowUTC.getTime() + 10 * 60000);
        
        if (startDateUTC <= tenMinutesFromNowUTC) {
            return res.status(400).send('Start time must be at least 10 minutes from now (IST)');
        }
        
        const highestTask = await db.collection('tasks').findOne(
            {},
            { sort: { orderIndex: -1 } }
        );
        const nextOrderIndex = highestTask ? highestTask.orderIndex + 1 : 0;
        
        const task = {
            taskId: generateId('task'),
            title: title.trim(),
            description: description ? description.trim() : '',
            startDate: startDateUTC,
            endDate: endDateUTC,
            nextOccurrence: startDateUTC,
            status: 'pending',
            repeat: repeat || 'none',
            repeatCount: repeat && repeat !== 'none' ? (parseInt(repeatCount) || 7) : 0,
            subtasks: [],
            createdAt: new Date(),
            orderIndex: nextOrderIndex,
            startTimeStr: startTime,
            endTimeStr: endTime,
            startDateStr: startDate
        };
        
        await db.collection('tasks').insertOne(task);
        console.log('✅ Task created: ' + task.title + ' (' + task.taskId + ')');
        
        if (task.startDate > tenMinutesFromNowUTC) {
            scheduleTask(task);
        }
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).send('Error creating task: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/update', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const { title, description, startDate, startTime, endTime, repeat, repeatCount } = req.body;
        
        const task = await db.collection('tasks').findOne({ taskId });
        if (!task) {
            return res.status(404).send('Task not found');
        }
        
        const startDateUTC = istToUTC(startDate, startTime);
        const endDateUTC = istToUTC(startDate, endTime);
        
        if (!startDateUTC || !endDateUTC) {
            return res.status(400).send('Invalid date/time format');
        }
        
        if (endDateUTC <= startDateUTC) {
            return res.status(400).send('End time must be after start time');
        }
        
        const nowUTC = new Date();
        const tenMinutesFromNowUTC = new Date(nowUTC.getTime() + 10 * 60000);
        
        if (startDateUTC <= tenMinutesFromNowUTC) {
            return res.status(400).send('Start time must be at least 10 minutes from now (IST)');
        }
        
        cancelTaskSchedule(taskId);
        
        await db.collection('tasks').updateOne(
            { taskId },
            {
                $set: {
                    title: title.trim(),
                    description: description ? description.trim() : '',
                    startDate: startDateUTC,
                    endDate: endDateUTC,
                    nextOccurrence: startDateUTC,
                    repeat: repeat || 'none',
                    repeatCount: repeat && repeat !== 'none' ? (parseInt(repeatCount) || 7) : 0,
                    startTimeStr: startTime,
                    endTimeStr: endTime,
                    startDateStr: startDate,
                    updatedAt: new Date()
                }
            }
        );
        
        const updatedTask = await db.collection('tasks').findOne({ taskId });
        if (updatedTask && updatedTask.startDate > tenMinutesFromNowUTC) {
            scheduleTask(updatedTask);
        }
        
        console.log('✅ Task updated: ' + updatedTask.title + ' (' + taskId + ')');
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).send('Error updating task: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/complete', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        
        const task = await db.collection('tasks').findOne({ taskId });
        if (!task) {
            return res.status(404).send('Task not found');
        }
        
        const subtasks = task.subtasks || [];
        const incompleteSubtasks = subtasks.filter(s => !s.completed);
        
        if (incompleteSubtasks.length > 0) {
            return res.status(400).json({ 
                error: 'Complete all subtasks first',
                incompleteCount: incompleteSubtasks.length 
            });
        }
        
        const completedAtUTC = new Date();
        const completedDateUTC = getTodayStartUTC();
        
        const historyItem = {
            ...task,
            _id: undefined,
            completedAt: completedAtUTC,
            completedDate: completedDateUTC,
            originalTaskId: task.taskId,
            status: 'completed',
            completedFromDate: task.nextOccurrence,
            subtasks: task.subtasks
        };
        
        delete historyItem._id;
        
        await db.collection('history').insertOne(historyItem);
        
        cancelTaskSchedule(taskId);
        
        if (task.repeat !== 'none' && task.repeatCount > 0) {
            const nextOccurrenceUTC = new Date(task.nextOccurrence);
            const daysToAdd = task.repeat === 'weekly' ? 7 : 1;
            nextOccurrenceUTC.setUTCDate(nextOccurrenceUTC.getUTCDate() + daysToAdd);
            
            const resetSubtasks = (task.subtasks || []).map(s => ({
                ...s,
                completed: false
            }));
            
            await db.collection('tasks').updateOne({ taskId }, {
                $set: {
                    nextOccurrence: nextOccurrenceUTC,
                    repeatCount: task.repeatCount - 1,
                    startDate: nextOccurrenceUTC,
                    endDate: new Date(nextOccurrenceUTC.getTime() + 
                        (task.endDate.getTime() - task.startDate.getTime())),
                    subtasks: resetSubtasks
                }
            });
            
            const updatedTask = await db.collection('tasks').findOne({ taskId });
            const tenMinutesFromNowUTC = new Date(Date.now() + 10 * 60000);
            if (updatedTask && updatedTask.nextOccurrence > tenMinutesFromNowUTC) {
                scheduleTask(updatedTask);
            }
            
            const nextIST = utcToISTDisplay(nextOccurrenceUTC);
            
            try {
                await bot.telegram.sendMessage(CHAT_ID,
                    '✅ <b>𝗧𝗔𝗦𝗞 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗</b>\n' +
                    '━━━━━━━━━━━━━━━━━━━━\n' +
                    '📌 <b>' + task.title + '</b>\n' +
                    '🔄 Next occurrence: ' + nextIST.displayDate + ' at ' + nextIST.displayTime + ' IST\n' +
                    '📊 Remaining repeats: ' + (task.repeatCount - 1) + '\n' +
                    '━━━━━━━━━━━━━━━━━━━━',
                    { parse_mode: 'HTML' }
                );
            } catch (e) {}
        } else {
            await db.collection('tasks').deleteOne({ taskId });
            
            const completedIST = utcToISTDisplay(completedAtUTC);
            
            try {
                await bot.telegram.sendMessage(CHAT_ID,
                    '✅ <b>𝗧𝗔𝗦𝗞 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗</b>\n' +
                    '━━━━━━━━━━━━━━━━━━━━\n' +
                    '📌 <b>' + task.title + '</b>\n' +
                    '📅 Completed at: ' + completedIST.dateTime + ' IST\n' +
                    '━━━━━━━━━━━━━━━━━━━━',
                    { parse_mode: 'HTML' }
                );
            } catch (e) {}
        }
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error completing task:', error);
        res.status(500).send('Error completing task: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/delete', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        
        cancelTaskSchedule(taskId);
        await db.collection('tasks').deleteOne({ taskId });
        
        console.log('🗑️ Task deleted: ' + taskId);
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).send('Error deleting task: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/subtasks', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const { title, description } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).send('Subtask title cannot be empty');
        }
        
        const task = await db.collection('tasks').findOne({ taskId });
        if (!task) {
            return res.status(404).send('Task not found');
        }
        
        const currentSubtasks = task.subtasks || [];
        if (currentSubtasks.length >= 10) {
            return res.status(400).send('Maximum subtasks limit (10) reached');
        }
        
        const subtask = {
            id: generateSubtaskId(),
            title: title.trim(),
            description: description ? description.trim() : '',
            completed: false,
            createdAt: new Date()
        };
        
        await db.collection('tasks').updateOne(
            { taskId },
            { $push: { subtasks: subtask } }
        );
        
        console.log('➕ Subtask added to ' + task.title + ': ' + subtask.title);
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error adding subtask:', error);
        res.status(500).send('Error adding subtask: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/update', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const subtaskId = req.params.subtaskId;
        const { title, description } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).send('Subtask title cannot be empty');
        }
        
        const result = await db.collection('tasks').updateOne(
            { taskId, "subtasks.id": subtaskId },
            { 
                $set: { 
                    "subtasks.$.title": title.trim(),
                    "subtasks.$.description": description ? description.trim() : '',
                    "subtasks.$.updatedAt": new Date()
                } 
            }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).send('Task or subtask not found');
        }
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error updating subtask:', error);
        res.status(500).send('Error updating subtask: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/toggle', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const subtaskId = req.params.subtaskId;
        
        const task = await db.collection('tasks').findOne({ taskId });
        if (!task) {
            return res.status(404).send('Task not found');
        }
        
        const subtask = (task.subtasks || []).find(s => s.id === subtaskId);
        if (!subtask) {
            return res.status(404).send('Subtask not found');
        }
        
        await db.collection('tasks').updateOne(
            { taskId, "subtasks.id": subtaskId },
            { $set: { "subtasks.$.completed": !subtask.completed } }
        );
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error toggling subtask:', error);
        res.status(500).send('Error toggling subtask: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/delete', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const subtaskId = req.params.subtaskId;
        
        const result = await db.collection('tasks').updateOne(
            { taskId },
            { $pull: { subtasks: { id: subtaskId } } }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).send('Task not found');
        }
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error deleting subtask:', error);
        res.status(500).send('Error deleting subtask: ' + error.message);
    }
});

app.post('/api/notes', async (req, res) => {
    try {
        const { title, description } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).send('Note title cannot be empty');
        }
        
        const highestNote = await db.collection('notes').findOne(
            {},
            { sort: { orderIndex: -1 } }
        );
        const nextOrderIndex = highestNote ? highestNote.orderIndex + 1 : 0;
        
        const note = {
            noteId: generateId('note'),
            title: title.trim(),
            description: description ? description.trim() : '',
            createdAt: new Date(),
            updatedAt: new Date(),
            orderIndex: nextOrderIndex
        };
        
        await db.collection('notes').insertOne(note);
        
        console.log('📝 Note created: ' + note.title + ' (' + note.noteId + ')');
        
        res.redirect('/notes');
    } catch (error) {
        console.error('Error creating note:', error);
        res.status(500).send('Error creating note: ' + error.message);
    }
});

app.post('/api/notes/:noteId/update', async (req, res) => {
    try {
        const noteId = req.params.noteId;
        const { title, description } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).send('Note title cannot be empty');
        }
        
        const result = await db.collection('notes').updateOne(
            { noteId },
            { 
                $set: { 
                    title: title.trim(), 
                    description: description ? description.trim() : '',
                    updatedAt: new Date() 
                } 
            }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).send('Note not found');
        }
        
        console.log('✏️ Note updated: ' + noteId);
        
        res.redirect('/notes');
    } catch (error) {
        console.error('Error updating note:', error);
        res.status(500).send('Error updating note: ' + error.message);
    }
});

app.post('/api/notes/:noteId/delete', async (req, res) => {
    try {
        const noteId = req.params.noteId;
        
        const result = await db.collection('notes').deleteOne({ noteId });
        
        if (result.deletedCount === 0) {
            return res.status(404).send('Note not found');
        }
        
        console.log('🗑️ Note deleted: ' + noteId);
        
        await reindexNotes();
        
        res.redirect('/notes');
    } catch (error) {
        console.error('Error deleting note:', error);
        res.status(500).send('Error deleting note: ' + error.message);
    }
});

app.post('/api/notes/:noteId/move', async (req, res) => {
    try {
        const noteId = req.params.noteId;
        const { direction } = req.body;
        
        const notes = await db.collection('notes')
            .find()
            .sort({ orderIndex: 1 })
            .toArray();
        
        const currentIndex = notes.findIndex(n => n.noteId === noteId);
        if (currentIndex === -1) {
            return res.status(404).send('Note not found');
        }
        
        if (direction === 'up' && currentIndex > 0) {
            const tempOrder = notes[currentIndex].orderIndex;
            notes[currentIndex].orderIndex = notes[currentIndex - 1].orderIndex;
            notes[currentIndex - 1].orderIndex = tempOrder;
            
            await db.collection('notes').updateOne(
                { noteId: notes[currentIndex].noteId },
                { $set: { orderIndex: notes[currentIndex].orderIndex } }
            );
            
            await db.collection('notes').updateOne(
                { noteId: notes[currentIndex - 1].noteId },
                { $set: { orderIndex: notes[currentIndex - 1].orderIndex } }
            );
        } else if (direction === 'down' && currentIndex < notes.length - 1) {
            const tempOrder = notes[currentIndex].orderIndex;
            notes[currentIndex].orderIndex = notes[currentIndex + 1].orderIndex;
            notes[currentIndex + 1].orderIndex = tempOrder;
            
            await db.collection('notes').updateOne(
                { noteId: notes[currentIndex].noteId },
                { $set: { orderIndex: notes[currentIndex].orderIndex } }
            );
            
            await db.collection('notes').updateOne(
                { noteId: notes[currentIndex + 1].noteId },
                { $set: { orderIndex: notes[currentIndex + 1].orderIndex } }
            );
        }
        
        res.redirect('/notes');
    } catch (error) {
        console.error('Error moving note:', error);
        res.status(500).send('Error moving note: ' + error.message);
    }
});

app.post('/api/progress', async (req, res) => {
    try {
        const { title, description, totalRounds, question, questionType, color } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).send('Title cannot be empty');
        }
        
        const progress = {
            progressId: generateId('progress'),
            title: title.trim(),
            description: description ? description.trim() : '',
            totalRounds: parseInt(totalRounds) || 365,
            question: question ? question.trim() : '',
            questionType: questionType || 'number',
            color: color || '#2563eb',
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        await db.collection('progress').insertOne(progress);
        
        console.log('📊 Progress tracker created: ' + progress.title + ' (' + progress.progressId + ')');
        
        res.redirect('/grow');
    } catch (error) {
        console.error('Error creating progress:', error);
        res.status(500).send('Error creating progress: ' + error.message);
    }
});

app.post('/api/progress/:progressId/update', async (req, res) => {
    try {
        const progressId = req.params.progressId;
        const { title, description, totalRounds, question, questionType, color } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).send('Title cannot be empty');
        }
        
        const result = await db.collection('progress').updateOne(
            { progressId },
            { 
                $set: { 
                    title: title.trim(),
                    description: description ? description.trim() : '',
                    totalRounds: parseInt(totalRounds) || 365,
                    question: question ? question.trim() : '',
                    questionType: questionType || 'number',
                    color: color || '#2563eb',
                    updatedAt: new Date()
                } 
            }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).send('Progress tracker not found');
        }
        
        console.log('✏️ Progress tracker updated: ' + progressId);
        
        res.redirect('/grow');
    } catch (error) {
        console.error('Error updating progress:', error);
        res.status(500).send('Error updating progress: ' + error.message);
    }
});

app.post('/api/progress/:progressId/delete', async (req, res) => {
    try {
        const progressId = req.params.progressId;
        
        await db.collection('progress').deleteOne({ progressId });
        await db.collection('progressEntries').deleteMany({ progressId });
        
        console.log('🗑️ Progress tracker deleted: ' + progressId);
        
        res.redirect('/grow');
    } catch (error) {
        console.error('Error deleting progress:', error);
        res.status(500).send('Error deleting progress: ' + error.message);
    }
});

app.post('/api/progress/complete', async (req, res) => {
    try {
        const { progressId, date, answer } = req.body;
        
        if (!progressId || !date) {
            return res.status(400).send('Missing required fields');
        }
        
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        if (date === todayStr) {
            return res.status(400).send('Cannot mark progress for today');
        }
        
        if (date > todayStr) {
            return res.status(400).send('Cannot mark progress for future dates');
        }
        
        const progress = await db.collection('progress').findOne({ progressId });
        if (!progress) {
            return res.status(404).send('Progress tracker not found');
        }
        
        const existing = await db.collection('progressEntries').findOne({
            progressId: progressId,
            date: date
        });
        
        if (existing) {
            return res.status(400).send('Progress already marked for this date');
        }
        
        const entry = {
            progressId: progressId,
            date: date,
            answer: answer || '',
            createdAt: new Date()
        };
        
        await db.collection('progressEntries').insertOne(entry);
        
        console.log('✅ Progress completed for ' + progress.title + ' on ' + date);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error completing progress:', error);
        res.status(500).send('Error completing progress: ' + error.message);
    }
});

// ==========================================
// 🤖 BOT COMMANDS - UPDATED WITH REARRANGED BUTTONS
// ==========================================
const bot = new Telegraf(BOT_TOKEN);
const activeSchedules = new Map();
let hourlySummaryJob = null;
let autoCompleteJob = null;
let isShuttingDown = false;

bot.use(telegrafSession());

bot.use((ctx, next) => {
    if (!ctx.session) {
        ctx.session = {};
    }
    return next();
});

bot.use((ctx, next) => {
    if (ctx.from && ctx.from.id.toString() === CHAT_ID.toString()) {
        return next();
    }
    return;
});

bot.command('start', async (ctx) => {
    ctx.session = {};
    
    const now = new Date();
    const nowIST = utcToISTDisplay(now);
    
    const text = `
┌─━━━━━━━━━━━━━━━─┐
│    ✧ 𝗧𝗔𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 ✧    │ 
└─━━━━━━━━━━━━━━━─┘
⏰ Current IST: ${nowIST.displayTime}
📅 Today: ${nowIST.displayDate}

🌟 <b>Welcome to Global Task Manager!</b>`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('📋 Tasks', 'tasks_menu'),
            Markup.button.callback('🌱 Grow', 'grow_menu')
        ],
        [
            Markup.button.callback('🗒️ Notes', 'notes_menu'),
            Markup.button.callback('📜 History', 'history_menu')
        ],
        [
            Markup.button.callback('📥 Download', 'download_menu'),
            Markup.button.callback('🗑️ Delete', 'delete_menu')
        ],
        [Markup.button.webApp('🌐 Open Web App', WEB_APP_URL)]
    ]);

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
});

bot.action('main_menu', async (ctx) => {
    await showMainMenu(ctx);
});

async function showMainMenu(ctx) {
    const now = new Date();
    const nowIST = utcToISTDisplay(now);
    
    const text = `
┌─━━━━━━━━━━━━━━━─┐
│    ✧ 𝗧𝗔𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 ✧    │ 
└─━━━━━━━━━━━━━━━─┘
⏰ Current IST: ${nowIST.displayTime}
📅 Today: ${nowIST.displayDate}

🌟 <b>Select an option:</b>`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('📋 Tasks', 'tasks_menu'),
            Markup.button.callback('🌱 Grow', 'grow_menu')
        ],
        [
            Markup.button.callback('🗒️ Notes', 'notes_menu'),
            Markup.button.callback('📜 History', 'history_menu')
        ],
        [
            Markup.button.callback('📥 Download', 'download_menu'),
            Markup.button.callback('🗑️ Delete', 'delete_menu')
        ],
        [Markup.button.webApp('🌐 Open Web App', WEB_APP_URL)]
    ]);

    await safeEdit(ctx, text, keyboard);
}

// ==========================================
// 📋 TASKS MENU
// ==========================================
bot.action('tasks_menu', async (ctx) => {
    const text = '📋 <b>𝗧𝗔𝗦𝗞𝗦 𝗠𝗘𝗡𝗨</b>\n━━━━━━━━━━━━━━━━━━━━\nSelect an option:';
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📋 Today\'s Tasks', 'view_today_tasks_1')],
        [Markup.button.callback('➕ Add Task', 'add_task')],
        [Markup.button.callback('🔄 Reorder Tasks', 'reorder_tasks_menu')],
        [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action(/^view_today_tasks_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const todayStartUTC = getTodayStartUTC();
    const tomorrowStartUTC = getTomorrowStartUTC();
    
    const perPage = 10;
    const skip = (page - 1) * perPage;
    
    const totalTasks = await db.collection('tasks').countDocuments({ 
        status: 'pending',
        nextOccurrence: { 
            $gte: todayStartUTC,
            $lt: tomorrowStartUTC
        }
    });
    
    const totalPages = Math.max(1, Math.ceil(totalTasks / perPage));
    
    const tasks = await db.collection('tasks')
        .find({ 
            status: 'pending',
            nextOccurrence: { 
                $gte: todayStartUTC,
                $lt: tomorrowStartUTC
            }
        })
        .sort({ orderIndex: 1, nextOccurrence: 1 })
        .skip(skip)
        .limit(perPage)
        .toArray();

    const todayIST = utcToISTDisplay(todayStartUTC);

    let text = `
📋 <b>𝗧𝗢𝗗𝗔𝗬\'S 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦</b>

━━━━━━━━━━━━━━━━━━━━
📅 Date: ${todayIST.displayDate} IST
📊 Total: ${totalTasks} task${totalTasks !== 1 ? 's' : ''}
📄 Page: ${page}/${totalPages}
━━━━━━━━━━━━━━━━━━━━

Select a task to view details:`;

    if (tasks.length === 0) {
        text = `
📋 <b>𝗧𝗢𝗗𝗔𝗬\'S 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦</b>

━━━━━━━━━━━━━━━━━━━━
📅 Date: ${todayIST.displayDate} IST
📭 <i>No tasks scheduled for today!</i>
━━━━━━━━━━━━━━━━━━━━`;
    }

    const buttons = [];
    
    tasks.forEach((t, index) => {
        const taskNum = skip + index + 1;
        let taskTitle = t.title;
        
        if (t.subtasks && t.subtasks.length > 0) {
            const progress = calculateSubtaskProgress(t.subtasks);
            taskTitle += ' [' + progress + '%]';
        }
        
        if (taskTitle.length > 30) {
            taskTitle = taskTitle.substring(0, 27) + '...';
        }
        
        const taskTimeIST = utcToISTDisplay(t.startDate).displayTime;
        
        buttons.push([
            Markup.button.callback(
                taskNum + '. ' + taskTitle + ' (' + taskTimeIST + ')', 
                'task_det_' + t.taskId
            )
        ]);
    });

    if (totalPages > 1) {
        const paginationRow = [];
        if (page > 1) {
            paginationRow.push(Markup.button.callback('◀️ Back', 'view_today_tasks_' + (page - 1)));
        }
        paginationRow.push(Markup.button.callback('📄 ' + page + '/' + totalPages, 'no_action'));
        if (page < totalPages) {
            paginationRow.push(Markup.button.callback('Next ▶️', 'view_today_tasks_' + (page + 1)));
        }
        buttons.push(paginationRow);
    }

    buttons.push([
        Markup.button.callback('➕ Add Task', 'add_task'),
        Markup.button.callback('🔙 Back to Tasks', 'tasks_menu')
    ]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

// ==========================================
// 🌱 GROW MENU
// ==========================================
bot.action('grow_menu', async (ctx) => {
    const text = '🌱 <b>𝗚𝗥𝗢𝗪 𝗠𝗘𝗡𝗨</b>\n━━━━━━━━━━━━━━━━━━━━\nSelect an option:';
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.webApp('🌱 Open Grow Dashboard', WEB_APP_URL + '/grow')],
        [Markup.button.callback('➕ Add Progress Tracker', 'add_progress')],
        [Markup.button.callback('📊 View Progress', 'view_progress')],
        [Markup.button.callback('🔄 Reorder Progress', 'reorder_progress_menu')],
        [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action('add_progress', async (ctx) => {
    ctx.session.step = 'progress_title';
    ctx.session.progress = { 
        progressId: generateId('progress'), 
        createdAt: new Date(),
        color: '#2563eb'
    };
    
    const text = '🌱 <b>𝗖𝗥𝗘𝗔𝗧𝗘 𝗡𝗘𝗪 𝗣𝗥𝗢𝗚𝗥𝗘𝗦𝗦 𝗧𝗥𝗔𝗖𝗞𝗘𝗥</b>\n━━━━━━━━━━━━━━━━━━━━\nEnter the <b>Title</b> (max 100 characters):';
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'grow_menu')]]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action('view_progress', async (ctx) => {
    try {
        const progress = await db.collection('progress')
            .find()
            .sort({ createdAt: -1 })
            .toArray();

        if (progress.length === 0) {
            const text = '📊 <b>𝗡𝗢 𝗣𝗥𝗢𝗚𝗥𝗘𝗦𝗦 𝗧𝗥𝗔𝗖𝗞𝗘𝗥𝗦</b>\n━━━━━━━━━━━━━━━━━━━━\nNo progress trackers found.';
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('➕ Create One', 'add_progress')],
                [Markup.button.callback('🔙 Back to Grow', 'grow_menu')]
            ]);
            return safeEdit(ctx, text, keyboard);
        }

        let text = '📊 <b>𝗣𝗥𝗢𝗚𝗥𝗘𝗦𝗦 𝗧𝗥𝗔𝗖𝗞𝗘𝗥𝗦</b>\n━━━━━━━━━━━━━━━━━━━━\n\n';
        
        for (const p of progress) {
            const entries = await db.collection('progressEntries').countDocuments({ progressId: p.progressId });
            const percentage = Math.round((entries / p.totalRounds) * 100);
            text += `📌 <b>${p.title}</b>\n`;
            text += `📊 Progress: ${entries}/${p.totalRounds} days (${percentage}%)\n`;
            if (p.question) text += `❓ Question: ${p.question}\n`;
            text += '━━━━━━━━━━━━━━━━━━━━\n\n';
        }

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.webApp('📊 View in Web App', WEB_APP_URL + '/grow')],
            [Markup.button.callback('🔙 Back to Grow', 'grow_menu')]
        ]);

        await safeEdit(ctx, text, keyboard);
    } catch (error) {
        console.error('Error viewing progress:', error);
        await ctx.answerCbQuery('❌ Error loading progress');
    }
});

// ==========================================
// 🗒️ NOTES MENU
// ==========================================
bot.action('notes_menu', async (ctx) => {
    const text = '🗒️ <b>𝗡𝗢𝗧𝗘𝗦 𝗠𝗘𝗡𝗨</b>\n━━━━━━━━━━━━━━━━━━━━\nSelect an option:';
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🗒️ View Notes', 'view_notes_1')],
        [Markup.button.callback('➕ Add Note', 'add_note')],
        [Markup.button.callback('🔄 Reorder Notes', 'reorder_notes_menu')],
        [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

// ==========================================
// 📜 HISTORY MENU
// ==========================================
bot.action('history_menu', async (ctx) => {
    const text = '📜 <b>𝗛𝗜𝗦𝗧𝗢𝗥𝗬 𝗠𝗘𝗡𝗨</b>\n━━━━━━━━━━━━━━━━━━━━\nSelect an option:';
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📜 View History', 'view_history_dates_1')],
        [Markup.button.callback('📊 Summary', 'history_summary')],
        [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action('history_summary', async (ctx) => {
    try {
        const todayStartUTC = getTodayStartUTC();
        const weekAgoUTC = new Date(todayStartUTC.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const history = await db.collection('history').find({
            completedAt: { $gte: weekAgoUTC }
        }).toArray();
        
        const todayIST = utcToISTDisplay(todayStartUTC);
        const weekAgoIST = utcToISTDisplay(weekAgoUTC);
        
        let text = `📊 <b>𝗛𝗜𝗦𝗧𝗢𝗥𝗬 𝗦𝗨𝗠𝗠𝗔𝗥𝗬</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
        text += `📅 ${weekAgoIST.displayDate} - ${todayIST.displayDate} IST\n`;
        text += `📊 Total Completed: ${history.length}\n`;
        text += '━━━━━━━━━━━━━━━━━━━━\n';
        
        const tasksByDate = {};
        history.forEach(h => {
            const date = utcToISTDisplay(h.completedAt).displayDate;
            tasksByDate[date] = (tasksByDate[date] || 0) + 1;
        });
        
        Object.keys(tasksByDate).sort().reverse().forEach(date => {
            text += `${date}: ${tasksByDate[date]} task${tasksByDate[date] !== 1 ? 's' : ''}\n`;
        });
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to History', 'history_menu')]
        ]);
        
        await safeEdit(ctx, text, keyboard);
    } catch (error) {
        console.error('Error in history summary:', error);
        await ctx.answerCbQuery('❌ Error loading summary');
    }
});

// ==========================================
// ➕ ADD TASK WIZARD
// ==========================================
bot.action('add_task', async (ctx) => {
    ctx.session.step = 'task_title';
    ctx.session.task = { 
        taskId: generateId('task'), 
        status: 'pending',
        createdAt: new Date(),
        subtasks: []
    };
    
    const text = '🎯 <b>𝗖𝗥𝗘𝗔𝗧𝗘 𝗡𝗘𝗪 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞</b>\n━━━━━━━━━━━━━━━━━━━━\nEnter the <b>Title</b> of your task (max 100 characters):';
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'tasks_menu')]]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action('add_note', async (ctx) => {
    ctx.session.step = 'note_title';
    ctx.session.note = { 
        noteId: generateId('note'), 
        createdAt: new Date()
    };
    
    const text = '📝 <b>𝗖𝗥𝗘𝗔𝗧𝗘 𝗡𝗘𝗪 𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\nEnter the <b>Title</b> for your note (max 200 characters):';
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'notes_menu')]]);
    
    await safeEdit(ctx, text, keyboard);
});

// ==========================================
// 📨 TEXT INPUT HANDLER (ADD PROGRESS)
// ==========================================
bot.on('text', async (ctx) => {
    if (!ctx.session || !ctx.session.step) return;
    
    try {
        const text = ctx.message.text.trim();
        const step = ctx.session.step;

        if (step === 'progress_title') {
            if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
            if (text.length > 100) return ctx.reply('❌ Title too long. Max 100 characters.');
            
            ctx.session.progress.title = text;
            ctx.session.step = 'progress_desc';
            await ctx.reply(
                '📄 <b>𝗘𝗡𝗧𝗘𝗥 𝗗𝗘𝗦𝗖𝗥𝗜𝗣𝗧𝗜𝗢𝗡</b>\n\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '📝 <i>Describe your progress tracker:</i>\n' +
                'Enter "-" for no description',
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'progress_desc') {
            const description = text === '-' ? '' : text;
            ctx.session.progress.description = description;
            ctx.session.step = 'progress_rounds';
            
            await ctx.reply(
                '🔢 <b>𝗘𝗡𝗧𝗘𝗥 𝗧𝗢𝗧𝗔𝗟 𝗥𝗢𝗨𝗡𝗗𝗦</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                'Enter the total number of days/rounds (1-3650):',
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'progress_rounds') {
            const rounds = parseInt(text);
            if (isNaN(rounds) || rounds < 1 || rounds > 3650) {
                return ctx.reply('❌ Invalid number. Please enter a number between 1 and 3650.');
            }
            
            ctx.session.progress.totalRounds = rounds;
            ctx.session.step = 'progress_question';
            
            await ctx.reply(
                '❓ <b>𝗔𝗗𝗗 𝗔 𝗤𝗨𝗘𝗦𝗧𝗜𝗢𝗡</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                'Enter a question to ask when marking progress (e.g., "How many kgs lost?")\n' +
                'Enter "-" for no question',
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'progress_question') {
            const question = text === '-' ? '' : text;
            ctx.session.progress.question = question;
            ctx.session.step = 'progress_question_type';
            
            await ctx.reply(
                '❓ <b>𝗤𝗨𝗘𝗦𝗧𝗜𝗢𝗡 𝗧𝗬𝗣𝗘</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                'Select question type:',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔢 Number', 'progress_type_number')],
                    [Markup.button.callback('📝 Text', 'progress_type_text')],
                    [Markup.button.callback('✅ Yes/No', 'progress_type_boolean')],
                    [Markup.button.callback('🔙 Cancel', 'grow_menu')]
                ])
            );
        }
        else if (step === 'progress_color') {
            ctx.session.progress.color = text;
            await saveProgress(ctx);
        }
        else if (step === 'task_title') {
            if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
            if (text.length > 100) return ctx.reply('❌ Title too long. Max 100 characters.');
            
            ctx.session.task.title = text;
            ctx.session.step = 'task_desc';
            await ctx.reply(
                '📄 <b>𝗘𝗡𝗧𝗘𝗥 𝗗𝗘𝗦𝗖𝗥𝗜𝗣𝗧𝗜𝗢𝗡</b>\n\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '📝 <i>Describe your task (Max 100 words):</i>\n' +
                'Enter "-" for no description',
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'task_desc') {
            const description = text === '-' ? '' : text;
            if (description.length > 0 && description.split(/\s+/).length > 100) {
                return ctx.reply('❌ Too long! Keep it under 100 words.');
            }
            ctx.session.task.description = description;
            ctx.session.step = 'task_date';
            
            const nowIST = getCurrentISTDisplay();
            
            await ctx.reply(
                '📅 <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗗𝗔𝗧𝗘</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '📆 Today (IST): ' + nowIST.displayDate + '\n' +
                '📝 <i>Enter the date (DD-MM-YYYY) in IST:</i>',
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'task_date') {
            if (!/^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-\d{4}$/.test(text)) {
                return ctx.reply('❌ Invalid date format. Use DD-MM-YYYY');
            }
            
            const [day, month, year] = text.split('-').map(Number);
            const istDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            const todayIST = getCurrentIST();
            const inputDateIST = new Date(Date.UTC(year, month - 1, day));
            
            if (inputDateIST < new Date(Date.UTC(todayIST.getUTCFullYear(), todayIST.getUTCMonth(), todayIST.getUTCDate()))) {
                return ctx.reply('❌ Date cannot be in the past (IST). Please select today or a future date.');
            }
            
            ctx.session.task.dateStr = istDateStr;
            ctx.session.task.dateDDMMYY = text;
            ctx.session.step = 'task_start';
            
            await ctx.reply(
                '⏰ <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗦𝗧𝗔𝗥𝗧 𝗧𝗜𝗠𝗘</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '🕒 Current IST: ' + getCurrentISTDisplay().displayTime + '\n' +
                '📝 <i>Enter start time in HH:MM (24-hour IST):</i>',
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'task_start') {
            if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
                return ctx.reply('❌ Invalid format. Use HH:MM (24-hour).');
            }
            
            const istDateStr = ctx.session.task.dateStr;
            const targetUTC = istToUTC(istDateStr, text);
            const nowUTC = new Date();
            const tenMinutesFromNowUTC = new Date(nowUTC.getTime() + 10 * 60000);
            
            if (targetUTC <= tenMinutesFromNowUTC) {
                return ctx.reply('❌ Start time must be at least 10 minutes from now (IST). Please enter a future time.');
            }
            
            ctx.session.task.startDate = targetUTC;
            ctx.session.task.startTimeStr = text;
            ctx.session.task.nextOccurrence = targetUTC;
            ctx.session.step = 'task_end';
            
            await ctx.reply(
                '⏱️ <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗘𝗡𝗗 𝗧𝗜𝗠𝗘</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '⏰ Start Time (IST): ' + text + '\n' +
                '📝 <i>Enter end time in HH:MM format (24-hour IST):</i>',
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'task_end') {
            if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
                return ctx.reply('❌ Invalid format. Use HH:MM (24-hour).');
            }
            
            const istDateStr = ctx.session.task.dateStr;
            const endDateUTC = istToUTC(istDateStr, text);
            
            if (endDateUTC <= ctx.session.task.startDate) {
                return ctx.reply('❌ End time must be after Start time.');
            }
            
            ctx.session.task.endDate = endDateUTC;
            ctx.session.task.endTimeStr = text;
            ctx.session.step = null;

            const duration = calculateDuration(ctx.session.task.startDate, endDateUTC);
            const startIST = utcToISTDisplay(ctx.session.task.startDate);
            
            await ctx.reply(
                '🔄 <b>𝗥𝗘𝗣𝗘𝗔𝗧 𝗢𝗣𝗧𝗜𝗢𝗡𝗦</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                'How should this task repeat?\n\n' +
                '📅 Task Date: ' + startIST.displayDate + ' IST\n' +
                '⏰ Time: ' + ctx.session.task.startTimeStr + ' - ' + text + ' IST\n' +
                '⏱️ Duration: ' + formatDuration(duration) + '\n\n',
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('❌ No Repeat', 'repeat_none')],
                        [Markup.button.callback('📅 Daily', 'repeat_daily')],
                        [Markup.button.callback('📅 Weekly', 'repeat_weekly')],
                        [Markup.button.callback('🔙 Cancel', 'tasks_menu')]
                    ])
                }
            );
        }
        else if (step === 'task_repeat_count') {
            const count = parseInt(text);
            if (isNaN(count) || count < 1 || count > 365) {
                return ctx.reply('❌ Please enter a valid number between 1 and 365.');
            }
            ctx.session.task.repeatCount = count;
            await saveTask(ctx);
        }
        else if (step === 'note_title') {
            if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
            if (text.length > 200) return ctx.reply('❌ Title too long. Max 200 characters.');
            
            ctx.session.note.title = text;
            ctx.session.step = 'note_content';
            await ctx.reply(
                '📝 <b>𝗘𝗡𝗧𝗘𝗥 𝗡𝗢𝗧𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '📝 <i>Enter note content (Max 400 words)</i>\n' +
                'Enter "-" for empty content',
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'note_content') {
            const content = text === '-' ? '' : text;
            if (content.length > 0 && content.split(/\s+/).length > 400) {
                return ctx.reply('❌ Too long! Keep it under 400 words.');
            }
            
            ctx.session.note.description = content;
            ctx.session.note.createdAt = new Date();
            ctx.session.note.updatedAt = new Date();
            
            try {
                const highestNote = await db.collection('notes').findOne(
                    {},
                    { sort: { orderIndex: -1 } }
                );
                const nextOrderIndex = highestNote ? highestNote.orderIndex + 1 : 0;
                ctx.session.note.orderIndex = nextOrderIndex;
                
                const noteTitle = ctx.session.note.title;
                const noteContent = ctx.session.note.description;
                
                await db.collection('notes').insertOne(ctx.session.note);
                
                ctx.session.step = null;
                delete ctx.session.note;
                
                await ctx.reply(
                    '✅ <b>𝗡𝗢𝗧𝗘 𝗦𝗔𝗩𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬!</b>\n' +
                    '━━━━━━━━━━━━━━━━━━━━\n' +
                    '📌 <b>' + noteTitle + '</b>\n' +
                    (hasContent(noteContent) ? formatBlockquote(noteContent) : '') + '\n' +
                    '📅 Saved on: ' + utcToISTDisplay(new Date()).dateTime + ' IST',
                    { parse_mode: 'HTML' }
                );
                
                await showMainMenu(ctx);
                
                try {
                    await bot.telegram.sendMessage(CHAT_ID,
                        '📝 <b>𝗡𝗘𝗪 𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘 𝗔𝗗𝗗𝗘𝗗</b>\n' +
                        '━━━━━━━━━━━━━━━━━━━━\n' +
                        '📌 <b>' + noteTitle + '</b>\n' +
                        (hasContent(noteContent) ? formatBlockquote(noteContent) : '') + '\n' +
                        '📅 ' + utcToISTDisplay(new Date()).dateTime + ' IST\n' +
                        '━━━━━━━━━━━━━━━━━━━━',
                        { parse_mode: 'HTML' }
                    );
                } catch (e) {}
                
            } catch (error) {
                console.error('Error saving note:', error);
                await ctx.reply('❌ Failed to save note. Please try again.');
            }
        }
    } catch (error) {
        console.error('Text handler error:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
    }
});

// Progress type selection
bot.action('progress_type_number', async (ctx) => {
    ctx.session.progress.questionType = 'number';
    ctx.session.step = 'progress_color';
    await ctx.reply(
        '🎨 <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗖𝗢𝗟𝗢𝗥</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Enter a color code (e.g., #2563eb for blue, #dc2626 for red, #059669 for green):',
        { parse_mode: 'HTML' }
    );
});

bot.action('progress_type_text', async (ctx) => {
    ctx.session.progress.questionType = 'text';
    ctx.session.step = 'progress_color';
    await ctx.reply(
        '🎨 <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗖𝗢𝗟𝗢𝗥</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Enter a color code (e.g., #2563eb for blue, #dc2626 for red, #059669 for green):',
        { parse_mode: 'HTML' }
    );
});

bot.action('progress_type_boolean', async (ctx) => {
    ctx.session.progress.questionType = 'boolean';
    ctx.session.step = 'progress_color';
    await ctx.reply(
        '🎨 <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗖𝗢𝗟𝗢𝗥</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Enter a color code (e.g., #2563eb for blue, #dc2626 for red, #059669 for green):',
        { parse_mode: 'HTML' }
    );
});

async function saveProgress(ctx) {
    const progress = ctx.session.progress;
    
    try {
        await db.collection('progress').insertOne(progress);
        
        ctx.session.step = null;
        delete ctx.session.progress;
        
        await ctx.reply(
            '✅ <b>𝗣𝗥𝗢𝗚𝗥𝗘𝗦𝗦 𝗧𝗥𝗔𝗖𝗞𝗘𝗥 𝗖𝗥𝗘𝗔𝗧𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬!</b>\n' +
            '━━━━━━━━━━━━━━━━━━━━\n' +
            '📌 <b>' + progress.title + '</b>\n' +
            (hasContent(progress.description) ? progress.description + '\n' : '') +
            '📊 Total Rounds: ' + progress.totalRounds + '\n' +
            (progress.question ? '❓ Question: ' + progress.question + '\n' : '') +
            '━━━━━━━━━━━━━━━━━━━━',
            { parse_mode: 'HTML' }
        );
        
        await showMainMenu(ctx);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                '🌱 <b>𝗡𝗘𝗪 𝗣𝗥𝗢𝗚𝗥𝗘𝗦𝗦 𝗧𝗥𝗔𝗖𝗞𝗘𝗥 𝗔𝗗𝗗𝗘𝗗</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '📌 <b>' + progress.title + '</b>\n' +
                (hasContent(progress.description) ? progress.description + '\n' : '') +
                '📊 Total Rounds: ' + progress.totalRounds + '\n' +
                '━━━━━━━━━━━━━━━━━━━━',
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    } catch (error) {
        console.error('Error saving progress:', error);
        await ctx.reply('❌ Failed to save progress tracker. Please try again.');
    }
}

async function saveTask(ctx) {
    const task = ctx.session.task;
    
    try {
        const highestTask = await db.collection('tasks').findOne(
            {},
            { sort: { orderIndex: -1 } }
        );
        const nextOrderIndex = highestTask ? highestTask.orderIndex + 1 : 0;
        
        task.status = 'pending';
        task.createdAt = new Date();
        task.orderIndex = nextOrderIndex;
        task.subtasks = task.subtasks || [];
        if (!task.nextOccurrence) {
            task.nextOccurrence = task.startDate;
        }
        
        await db.collection('tasks').insertOne(task);
        
        const tenMinutesFromNowUTC = new Date(Date.now() + 10 * 60000);
        if (task.startDate > tenMinutesFromNowUTC) {
            scheduleTask(task);
        }
        
        ctx.session.step = null;
        delete ctx.session.task;
        
        const duration = calculateDuration(task.startDate, task.endDate);
        const startIST = utcToISTDisplay(task.startDate);
        const endIST = utcToISTDisplay(task.endDate);
        
        const msg = `
✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞 𝗖𝗥𝗘𝗔𝗧𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬!</b>
━━━━━━━━━━━━━━━━━━━━
📌 <b>${task.title}</b>
${hasContent(task.description) ? formatBlockquote(task.description) : ''}
📅 <b>Date:</b> ${startIST.displayDate} IST
⏰ <b>Time:</b> ${task.startTimeStr} - ${task.endTimeStr} IST
⏱️ <b>Duration:</b> ${formatDuration(duration)}
🔄 <b>Repeat:</b> ${task.repeat} (${task.repeatCount || 0} times)
📊 <b>Status:</b> ⏳ Pending

🔔 <i>Notifications will start 10 minutes before the task (10 reminders).</i>
━━━━━━━━━━━━━━━━━━━━`;
                
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('📋 Tasks', 'tasks_menu'),
                Markup.button.callback('🔙 Back', 'main_menu')
            ]
        ]);
        
        await safeEdit(ctx, msg, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                '✅ <b>𝗡𝗘𝗪 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞 𝗔𝗗𝗗𝗘𝗗</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '📌 <b>' + task.title + '</b>\n' +
                (hasContent(task.description) ? formatBlockquote(task.description) : '') + '\n' +
                '📅 ' + startIST.displayDate + ' IST\n' +
                '⏰ ' + task.startTimeStr + ' - ' + task.endTimeStr + ' IST\n' +
                '━━━━━━━━━━━━━━━━━━━━',
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    } catch (error) {
        console.error('Error saving task:', error);
        await ctx.reply('❌ Failed to save task. Please try again.');
    }
}

bot.action('repeat_none', async (ctx) => {
    ctx.session.task.repeat = 'none';
    ctx.session.task.repeatCount = 0;
    await saveTask(ctx);
});

bot.action('repeat_daily', async (ctx) => {
    ctx.session.task.repeat = 'daily';
    ctx.session.step = 'task_repeat_count';
    await ctx.reply(
        '🔢 <b>𝗗𝗔𝗜𝗟𝗬 𝗥𝗘𝗣𝗘𝗔𝗧</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        '📝 <i>How many times should this task repeat? (1-365)</i>',
        { parse_mode: 'HTML' }
    );
});

bot.action('repeat_weekly', async (ctx) => {
    ctx.session.task.repeat = 'weekly';
    ctx.session.step = 'task_repeat_count';
    await ctx.reply(
        '🔢 <b>𝗪𝗘𝗘𝗞𝗟𝗬 𝗥𝗘𝗣𝗘𝗔𝗧</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        '📝 <i>How many times should this task repeat? (1-365)</i>',
        { parse_mode: 'HTML' }
    );
});

// ==========================================
// 🔍 TASK DETAIL
// ==========================================
bot.action(/^task_det_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    await showTaskDetail(ctx, taskId);
});

async function showTaskDetail(ctx, taskId) {
    if (!taskId) {
        await ctx.answerCbQuery('❌ Invalid task ID');
        return;
    }
    
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) {
        const text = '❌ <b>𝗧𝗔𝗦𝗞 𝗡𝗢𝗧 𝗙𝗢𝗨𝗡𝗗</b>\n\nThis task may have been completed or deleted.';
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📋 Today\'s Tasks', 'view_today_tasks_1'),
            Markup.button.callback('🔙 Back', 'main_menu')]
        ]);
        return safeEdit(ctx, text, keyboard);
    }

    const subtasks = task.subtasks || [];
    const progress = calculateSubtaskProgress(subtasks);
    const completedSubtasks = subtasks.filter(s => s.completed).length;
    const totalSubtasks = subtasks.length;
    const duration = calculateDuration(task.startDate, task.endDate);
    
    const startIST = utcToISTDisplay(task.startDate);
    const nextIST = utcToISTDisplay(task.nextOccurrence);
    
    let text = `
📌 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞 𝗗𝗘𝗧𝗔𝗜𝗟𝗦</b>
━━━━━━━━━━━━━━━━━━━━
🆔 <b>Task ID:</b> <code>${task.taskId}</code>
📛 <b>Title:</b> ${task.title}
${hasContent(task.description) ? formatBlockquote(task.description) : ''}
📅 <b>Next Occurrence:</b> ${nextIST.displayDate} IST
⏰ <b>Time:</b> ${startIST.displayTime} - ${utcToISTDisplay(task.endDate).displayTime} IST
⏱️ <b>Duration:</b> ${formatDuration(duration)}
🔄 <b>Repeat:</b> ${task.repeat === 'none' ? 'No Repeat' : task.repeat} 
🔢 <b>Remaining Repeats:</b> ${task.repeatCount || 0}
🏷️ <b>Priority Order:</b> ${task.orderIndex + 1}
📊 <b>Status:</b> ${task.status === 'pending' ? '⏳ Pending' : '✅ Completed'}
`;

    if (totalSubtasks > 0) {
        const barLength = 10;
        const filledBars = Math.round((progress / 100) * barLength);
        const emptyBars = barLength - filledBars;
        const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
        
        text += `
📋 <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞𝗦:</b> ${completedSubtasks}/${totalSubtasks}
${progressBar} ${progress}%
━━━━━━━━━━━━━━━━━━━━
`;
    } else {
        text += `
📋 <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞𝗦:</b> No subtasks yet
━━━━━━━━━━━━━━━━━━━━
`;
    }

    const buttons = [];
    
    subtasks.sort((a, b) => {
        if (a.completed === b.completed) return 0;
        return a.completed ? 1 : -1;
    }).forEach((subtask, index) => {
        const status = subtask.completed ? '✅' : '⭕';
        let title = subtask.title;
        if (title.length > 30) title = title.substring(0, 27) + '...';
        
        const buttonRow = [
            Markup.button.callback(
                status + ' ' + (index + 1) + '. ' + title, 
                'subtask_det_' + taskId + '_' + subtask.id
            )
        ];
        buttons.push(buttonRow);
    });
    
    const actionRow = [];
    
    if (totalSubtasks < 10) {
        actionRow.push(Markup.button.callback('➕', 'add_subtask_' + taskId));
    }
    
    actionRow.push(Markup.button.callback('✏️', 'edit_menu_' + taskId));
    actionRow.push(Markup.button.callback('🗑️', 'delete_task_' + taskId));
    actionRow.push(Markup.button.callback('✅', 'complete_' + taskId));
    
    buttons.push(actionRow);
    
    buttons.push([
        Markup.button.callback('📋 Tasks', 'tasks_menu'),
        Markup.button.callback('🔙 Back', 'tasks_menu')
    ]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

// ==========================================
// 🔍 SUBTASK DETAIL
// ==========================================
bot.action(/^subtask_det_([^_]+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
    if (!taskId || !subtaskId) {
        await ctx.answerCbQuery('❌ Invalid request');
        return;
    }
    
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return;
    }
    
    const subtask = (task.subtasks || []).find(s => s.id === subtaskId);
    if (!subtask) {
        await ctx.answerCbQuery('❌ Subtask not found');
        return;
    }
    
    const status = subtask.completed ? '✅ Completed' : '⭕ Pending';
    const hasDesc = hasContent(subtask.description);
    
    let text = `
📋 <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞 𝗗𝗘𝗧𝗔𝗜𝗟𝗦</b>
━━━━━━━━━━━━━━━━━━━━
📌 <b>Task:</b> ${task.title}
🔖 <b>Subtask:</b> ${subtask.title}
${hasDesc ? formatBlockquote(subtask.description) : ''}
📊 <b>Status:</b> ${status}
🆔 <b>ID:</b> <code>${subtask.id}</code>
📅 <b>Created:</b> ${utcToISTDisplay(subtask.createdAt).dateTime} IST
━━━━━━━━━━━━━━━━━━━━`;

    const buttons = [];
    const actionRow = [];

    if (!subtask.completed) {
        actionRow.push(Markup.button.callback('✅', 'subtask_complete_' + taskId + '_' + subtaskId));
    }

    actionRow.push(Markup.button.callback('✏️', 'subtask_edit_' + taskId + '_' + subtaskId));
    actionRow.push(Markup.button.callback('🗑️', 'subtask_delete_' + taskId + '_' + subtaskId));

    buttons.push(actionRow);
    buttons.push([Markup.button.callback('🔙 Back to Task', 'task_det_' + taskId)]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^subtask_complete_([^_]+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
    try {
        const task = await db.collection('tasks').findOne({ taskId });
        if (!task) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
        await db.collection('tasks').updateOne(
            { taskId, "subtasks.id": subtaskId },
            { $set: { "subtasks.$.completed": true } }
        );
        
        await ctx.answerCbQuery('✅ Subtask completed!');
        await showTaskDetail(ctx, taskId);
    } catch (error) {
        console.error('Error completing subtask:', error);
        await ctx.answerCbQuery('❌ Error completing subtask');
    }
});

bot.action(/^subtask_edit_([^_]+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return;
    }
    
    ctx.session.step = 'edit_subtask_title';
    ctx.session.editSubtask = { taskId, subtaskId };
    
    await ctx.reply(
        '✏️ <b>𝗘𝗗𝗜𝗧 𝗦𝗨𝗕𝗧𝗔𝗦𝗞</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Enter new title for the subtask:',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'task_det_' + taskId)]])
    );
});

bot.action(/^subtask_delete_([^_]+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
    try {
        const task = await db.collection('tasks').findOne({ taskId });
        if (!task) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
        await db.collection('tasks').updateOne(
            { taskId },
            { $pull: { subtasks: { id: subtaskId } } }
        );
        
        await ctx.answerCbQuery('🗑️ Subtask deleted');
        await showTaskDetail(ctx, taskId);
    } catch (error) {
        console.error('Error deleting subtask:', error);
        await ctx.answerCbQuery('❌ Error deleting subtask');
    }
});

bot.action(/^add_subtask_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return;
    }
    
    const currentSubtasks = task.subtasks || [];
    const availableSlots = 10 - currentSubtasks.length;
    
    if (availableSlots <= 0) {
        await ctx.answerCbQuery('❌ Maximum subtasks limit (10) reached');
        return;
    }
    
    ctx.session.step = 'add_subtask';
    ctx.session.addSubtasksTaskId = taskId;
    
    await ctx.reply(
        '➕ <b>𝗔𝗗𝗗 𝗦𝗨𝗕𝗧𝗔𝗦𝗞</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        '📌 <b>' + task.title + '</b>\n' +
        '📊 Current: ' + currentSubtasks.length + '/10 subtasks\n\n' +
        '<i>Enter subtask title:</i>\n',
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'task_det_' + taskId)]])
        }
    );
});

bot.action(/^complete_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) return ctx.answerCbQuery('Task not found');

    const subtasks = task.subtasks || [];
    const incompleteSubtasks = subtasks.filter(s => !s.completed);
    
    if (incompleteSubtasks.length > 0) {
        return ctx.answerCbQuery('❌ Complete all ' + incompleteSubtasks.length + ' pending subtasks first!');
    }

    const completedAtUTC = new Date();
    const completedDateUTC = getTodayStartUTC();
    
    const historyItem = {
        ...task,
        _id: undefined,
        completedAt: completedAtUTC,
        completedDate: completedDateUTC,
        originalTaskId: task.taskId,
        status: 'completed',
        completedFromDate: task.nextOccurrence,
        subtasks: task.subtasks
    };
    
    delete historyItem._id;
    
    try {
        await db.collection('history').insertOne(historyItem);
        
        cancelTaskSchedule(taskId);

        if (task.repeat !== 'none' && task.repeatCount > 0) {
            const nextOccurrenceUTC = new Date(task.nextOccurrence);
            const daysToAdd = task.repeat === 'weekly' ? 7 : 1;
            nextOccurrenceUTC.setUTCDate(nextOccurrenceUTC.getUTCDate() + daysToAdd);
            
            const resetSubtasks = (task.subtasks || []).map(s => ({
                ...s,
                completed: false
            }));
            
            await db.collection('tasks').updateOne({ taskId }, {
                $set: {
                    nextOccurrence: nextOccurrenceUTC,
                    repeatCount: task.repeatCount - 1,
                    startDate: nextOccurrenceUTC,
                    endDate: new Date(nextOccurrenceUTC.getTime() + 
                        (task.endDate.getTime() - task.startDate.getTime())),
                    subtasks: resetSubtasks
                }
            });
            
            const updatedTask = await db.collection('tasks').findOne({ taskId });
            const tenMinutesFromNowUTC = new Date(Date.now() + 10 * 60000);
            
            if (updatedTask && updatedTask.nextOccurrence > tenMinutesFromNowUTC) {
                scheduleTask(updatedTask);
                await ctx.answerCbQuery('✅ Completed! Next occurrence scheduled.');
            } else {
                await ctx.answerCbQuery('✅ Completed! No future occurrences.');
            }
            
            const nextIST = utcToISTDisplay(nextOccurrenceUTC);
            
            try {
                await bot.telegram.sendMessage(CHAT_ID,
                    '✅ <b>𝗧𝗔𝗦𝗞 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗</b>\n' +
                    '━━━━━━━━━━━━━━━━━━━━\n' +
                    '📌 <b>' + task.title + '</b>\n' +
                    '🔄 Next: ' + nextIST.displayDate + ' at ' + nextIST.displayTime + ' IST\n' +
                    '📊 Remaining: ' + (task.repeatCount - 1) + '\n' +
                    '━━━━━━━━━━━━━━━━━━━━',
                    { parse_mode: 'HTML' }
                );
            } catch (e) {}
        } else {
            await db.collection('tasks').deleteOne({ taskId });
            await ctx.answerCbQuery('✅ Task Completed & Moved to History!');
            
            const completedIST = utcToISTDisplay(completedAtUTC);
            
            try {
                await bot.telegram.sendMessage(CHAT_ID,
                    '✅ <b>𝗧𝗔𝗦𝗞 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗</b>\n' +
                    '━━━━━━━━━━━━━━━━━━━━\n' +
                    '📌 <b>' + task.title + '</b>\n' +
                    '📅 Completed at: ' + completedIST.dateTime + ' IST\n' +
                    '━━━━━━━━━━━━━━━━━━━━',
                    { parse_mode: 'HTML' }
                );
            } catch (e) {}
        }
        
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error completing task:', error);
        await ctx.answerCbQuery('❌ Error completing task');
    }
});

bot.action(/^edit_menu_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const text = '✏️ <b>𝗘𝗗𝗜𝗧 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞</b>\n━━━━━━━━━━━━━━━━━━━━\nSelect what you want to edit:';
    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('🏷 Title', 'edit_task_title_' + taskId), 
            Markup.button.callback('📝 Description', 'edit_task_desc_' + taskId)
        ],
        [
            Markup.button.callback('⏰ Start Time', 'edit_task_start_' + taskId), 
            Markup.button.callback('⏱️ End Time', 'edit_task_end_' + taskId)
        ],
        [
            Markup.button.callback('🔄 Repeat', 'edit_rep_' + taskId), 
            Markup.button.callback('🔢 Count', 'edit_task_count_' + taskId)
        ],
        [Markup.button.callback('🔙 Back', 'task_det_' + taskId)]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action(/^edit_task_title_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_title';
    
    await ctx.reply(
        '✏️ <b>𝗘𝗗𝗜𝗧 𝗧𝗜𝗧𝗟𝗘</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Enter new title:',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'task_det_' + taskId)]])
    );
});

bot.action(/^edit_task_desc_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_desc';
    
    await ctx.reply(
        '✏️ <b>𝗘𝗗𝗜𝗧 𝗗𝗘𝗦𝗖𝗥𝗜𝗣𝗧𝗜𝗢𝗡</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Enter new description (Max 100 words, enter "-" for empty):',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'task_det_' + taskId)]])
    );
});

bot.action(/^edit_task_start_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return showMainMenu(ctx);
    }
    
    const startIST = utcToISTDisplay(task.startDate);
    
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_start';
    
    await ctx.reply(
        '✏️ <b>𝗘𝗗𝗜𝗧 𝗦𝗧𝗔𝗥𝗧 𝗧𝗜𝗠𝗘</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Current start time: ' + startIST.displayTime + ' IST\n' +
        'Enter new start time (HH:MM, 24-hour IST):\n' +
        '⚠️ Duration will be preserved',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'task_det_' + taskId)]])
    );
});

bot.action(/^edit_task_end_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return showMainMenu(ctx);
    }
    
    const endIST = utcToISTDisplay(task.endDate);
    
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_end';
    
    await ctx.reply(
        '✏️ <b>𝗘𝗗𝗜𝗧 𝗘𝗡𝗗 𝗧𝗜𝗠𝗘</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Current end time: ' + endIST.displayTime + ' IST\n' +
        'Enter new end time (HH:MM, 24-hour IST):',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'task_det_' + taskId)]])
    );
});

bot.action(/^edit_task_count_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return showMainMenu(ctx);
    }
    
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_repeat_count';
    
    await ctx.reply(
        '✏️ <b>𝗘𝗗𝗜𝗧 𝗥𝗘𝗣𝗘𝗔𝗧 𝗖𝗢𝗨𝗡𝗧</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Enter new repeat count (0-365):\n' +
        '📝 Current count: ' + (task.repeatCount || 0),
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'task_det_' + taskId)]])
    );
});

bot.action(/^edit_rep_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const text = '🔄 <b>𝗖𝗛𝗔𝗡𝗚𝗘 𝗥𝗘𝗣𝗘𝗔𝗧 𝗠𝗢𝗗𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\nSelect new repeat mode:';
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('❌ No Repeat', 'set_rep_' + taskId + '_none')],
        [Markup.button.callback('📅 Daily', 'set_rep_' + taskId + '_daily')],
        [Markup.button.callback('📅 Weekly', 'set_rep_' + taskId + '_weekly')],
        [Markup.button.callback('🔙 Back', 'edit_menu_' + taskId)]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action(/^set_rep_([^_]+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const mode = ctx.match[2];
    
    try {
        const updates = { repeat: mode };
        if (mode === 'none') {
            updates.repeatCount = 0;
        } else {
            const task = await db.collection('tasks').findOne({ taskId });
            updates.repeatCount = task?.repeatCount || 7;
        }
        
        await db.collection('tasks').updateOne({ taskId }, { $set: updates });
        
        await db.collection('history').updateMany(
            { originalTaskId: taskId }, 
            { $set: updates }
        );
        
        await ctx.answerCbQuery('✅ Updated to ' + mode);
        await showTaskDetail(ctx, taskId);
    } catch (error) {
        console.error('Error updating repeat mode:', error);
        await ctx.answerCbQuery('❌ Error updating');
    }
});

bot.action(/^delete_task_([^_]+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    try {
        const task = await db.collection('tasks').findOne({ taskId });
        const taskTitle = task?.title || 'Task';
        
        await db.collection('tasks').deleteOne({ taskId });
        await db.collection('history').deleteMany({ originalTaskId: taskId });
        cancelTaskSchedule(taskId);
        await ctx.answerCbQuery('✅ Task Deleted');
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                '🗑️ <b>𝗧𝗔𝗦𝗞 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '📌 <b>' + taskTitle + '</b>\n' +
                '🗑️ Task was deleted\n' +
                '━━━━━━━━━━━━━━━━━━━━',
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
        
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error deleting task:', error);
        await ctx.answerCbQuery('❌ Error deleting task');
    }
});

// ==========================================
// 🔄 REORDER TASKS SYSTEM
// ==========================================
bot.action('reorder_tasks_menu', async (ctx) => {
    try {
        const tasks = await db.collection('tasks')
            .find({ 
                status: 'pending'
            })
            .sort({ orderIndex: 1, nextOccurrence: 1 })
            .toArray();

        if (tasks.length === 0) {
            await ctx.answerCbQuery('📭 No tasks to reorder');
            return;
        }

        if (tasks.length === 1) {
            await ctx.answerCbQuery('❌ Need at least 2 tasks to reorder');
            return;
        }
        
        let text = '<b>🔼🔽 Reorder ALL GLOBAL Tasks</b>\n\n';
        text += 'Select a task to move:\n\n';
        
        const keyboard = [];
        
        tasks.forEach((task, index) => {
            let title = task.title;
            if (title.length > 35) title = title.substring(0, 32) + '...';
            
            keyboard.push([{ 
                text: (index + 1) + '. ' + title, 
                callback_data: 'reorder_task_select_' + task.taskId 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to Tasks', callback_data: 'tasks_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Reorder tasks menu error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

bot.action(/^reorder_task_select_([^_]+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        
        const tasks = await db.collection('tasks')
            .find({ 
                status: 'pending'
            })
            .sort({ orderIndex: 1, nextOccurrence: 1 })
            .toArray();
        
        const selectedIndex = tasks.findIndex(t => t.taskId === taskId);
        
        if (selectedIndex === -1) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
        ctx.session.reorderTask = {
            selectedTaskId: taskId,
            selectedIndex: selectedIndex,
            tasks: tasks
        };
        
        let text = '<b>🔼🔽 Reorder ALL GLOBAL Tasks</b>\n\n';
        text += 'Current order (selected task is highlighted):\n\n';
        
        tasks.forEach((task, index) => {
            let title = task.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === selectedIndex) {
                text += '<blockquote>' + (index + 1) + '. ' + title + '</blockquote>\n';
            } else {
                text += (index + 1) + '. ' + title + '\n';
            }
        });
        
        const keyboard = [];
        
        if (selectedIndex > 0) {
            keyboard.push([{ text: '🔼 Move Up', callback_data: 'reorder_task_up' }]);
        }
        
        if (selectedIndex < tasks.length - 1) {
            if (selectedIndex > 0) {
                keyboard[keyboard.length - 1].push({ text: '🔽 Move Down', callback_data: 'reorder_task_down' });
            } else {
                keyboard.push([{ text: '🔽 Move Down', callback_data: 'reorder_task_down' }]);
            }
        }
        
        keyboard.push([{ text: '✅ Save Order', callback_data: 'reorder_task_save' }, { text: '🔙 Back', callback_data: 'reorder_tasks_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML'
        });
        
    } catch (error) {
        console.error('Select task for reorder error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('reorder_task_up', async (ctx) => {
    try {
        if (!ctx.session.reorderTask) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const selectedIndex = ctx.session.reorderTask.selectedIndex;
        const tasks = [...ctx.session.reorderTask.tasks];
        
        if (selectedIndex <= 0) {
            await ctx.answerCbQuery('❌ Already at top');
            return;
        }
        
        const temp = tasks[selectedIndex];
        tasks[selectedIndex] = tasks[selectedIndex - 1];
        tasks[selectedIndex - 1] = temp;
        
        ctx.session.reorderTask.selectedIndex = selectedIndex - 1;
        ctx.session.reorderTask.tasks = tasks;
        
        let text = '<b>🔼🔽 Reorder ALL GLOBAL Tasks</b>\n\n';
        text += 'Current order (selected task is highlighted):\n\n';
        
        tasks.forEach((task, index) => {
            let title = task.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === ctx.session.reorderTask.selectedIndex) {
                text += '<blockquote>' + (index + 1) + '. ' + title + '</blockquote>\n';
            } else {
                text += (index + 1) + '. ' + title + '\n';
            }
        });
        
        const keyboard = [];
        const newIndex = ctx.session.reorderTask.selectedIndex;
        
        if (newIndex > 0) {
            keyboard.push([{ text: '🔼 Move Up', callback_data: 'reorder_task_up' }]);
        }
        
        if (newIndex < tasks.length - 1) {
            if (newIndex > 0) {
                keyboard[keyboard.length - 1].push({ text: '🔽 Move Down', callback_data: 'reorder_task_down' });
            } else {
                keyboard.push([{ text: '🔽 Move Down', callback_data: 'reorder_task_down' }]);
            }
        }
        
        keyboard.push([{ text: '✅ Save Order', callback_data: 'reorder_task_save' }, { text: '🔙 Back', callback_data: 'reorder_tasks_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery('✅ Moved up');
        
    } catch (error) {
        console.error('Move task up error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('reorder_task_down', async (ctx) => {
    try {
        if (!ctx.session.reorderTask) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const selectedIndex = ctx.session.reorderTask.selectedIndex;
        const tasks = [...ctx.session.reorderTask.tasks];
        
        if (selectedIndex >= tasks.length - 1) {
            await ctx.answerCbQuery('❌ Already at bottom');
            return;
        }
        
        const temp = tasks[selectedIndex];
        tasks[selectedIndex] = tasks[selectedIndex + 1];
        tasks[selectedIndex + 1] = temp;
        
        ctx.session.reorderTask.selectedIndex = selectedIndex + 1;
        ctx.session.reorderTask.tasks = tasks;
        
        let text = '<b>🔼🔽 Reorder ALL GLOBAL Tasks</b>\n\n';
        text += 'Current order (selected task is highlighted):\n\n';
        
        tasks.forEach((task, index) => {
            let title = task.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === ctx.session.reorderTask.selectedIndex) {
                text += '<blockquote>' + (index + 1) + '. ' + title + '</blockquote>\n';
            } else {
                text += (index + 1) + '. ' + title + '\n';
            }
        });
        
        const keyboard = [];
        const newIndex = ctx.session.reorderTask.selectedIndex;
        
        if (newIndex > 0) {
            keyboard.push([{ text: '🔼 Move Up', callback_data: 'reorder_task_up' }]);
        }
        
        if (newIndex < tasks.length - 1) {
            if (newIndex > 0) {
                keyboard[keyboard.length - 1].push({ text: '🔽 Move Down', callback_data: 'reorder_task_down' });
            } else {
                keyboard.push([{ text: '🔽 Move Down', callback_data: 'reorder_task_down' }]);
            }
        }
        
        keyboard.push([{ text: '✅ Save Order', callback_data: 'reorder_task_save' }, { text: '🔙 Back', callback_data: 'reorder_tasks_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery('✅ Moved down');
        
    } catch (error) {
        console.error('Move task down error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('reorder_task_save', async (ctx) => {
    try {
        if (!ctx.session.reorderTask) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const tasks = ctx.session.reorderTask.tasks;
        
        for (let i = 0; i < tasks.length; i++) {
            await db.collection('tasks').updateOne(
                { taskId: tasks[i].taskId },
                { $set: { orderIndex: i } }
            );
        }
        
        delete ctx.session.reorderTask;
        
        await ctx.answerCbQuery('✅ Task order saved!');
        await showMainMenu(ctx);
        
    } catch (error) {
        console.error('Save task order error:', error);
        await ctx.answerCbQuery('❌ Failed to save order');
    }
});

// ==========================================
// 🔄 REORDER NOTES SYSTEM
// ==========================================
bot.action('reorder_notes_menu', async (ctx) => {
    try {
        const notes = await db.collection('notes')
            .find()
            .sort({ orderIndex: 1, createdAt: -1 })
            .toArray();

        if (notes.length === 0) {
            await ctx.answerCbQuery('📭 No notes to reorder');
            return;
        }

        if (notes.length === 1) {
            await ctx.answerCbQuery('❌ Need at least 2 notes to reorder');
            return;
        }
        
        let text = '<b>🔼🔽 Reorder Global Notes</b>\n\n';
        text += 'Select a note to move:\n\n';
        
        const keyboard = [];
        
        notes.forEach((note, index) => {
            let title = note.title;
            if (title.length > 35) title = title.substring(0, 32) + '...';
            
            keyboard.push([{ 
                text: (index + 1) + '. ' + title, 
                callback_data: 'reorder_note_select_' + note.noteId 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to Notes', callback_data: 'notes_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Reorder notes menu error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

bot.action(/^reorder_note_select_([^_]+)$/, async (ctx) => {
    try {
        const noteId = ctx.match[1];
        
        const notes = await db.collection('notes')
            .find()
            .sort({ orderIndex: 1, createdAt: -1 })
            .toArray();
        
        const selectedIndex = notes.findIndex(n => n.noteId === noteId);
        
        if (selectedIndex === -1) {
            await ctx.answerCbQuery('❌ Note not found');
            return;
        }
        
        ctx.session.reorderNote = {
            selectedNoteId: noteId,
            selectedIndex: selectedIndex,
            notes: notes
        };
        
        let text = '<b>🔼🔽 Reorder Global Notes</b>\n\n';
        text += 'Current order (selected note is highlighted):\n\n';
        
        notes.forEach((note, index) => {
            let title = note.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === selectedIndex) {
                text += '<blockquote>' + (index + 1) + '. ' + title + '</blockquote>\n';
            } else {
                text += (index + 1) + '. ' + title + '\n';
            }
        });
        
        const keyboard = [];
        
        if (selectedIndex > 0) {
            keyboard.push([{ text: '🔼 Move Up', callback_data: 'reorder_note_up' }]);
        }
        
        if (selectedIndex < notes.length - 1) {
            if (selectedIndex > 0) {
                keyboard[keyboard.length - 1].push({ text: '🔽 Move Down', callback_data: 'reorder_note_down' });
            } else {
                keyboard.push([{ text: '🔽 Move Down', callback_data: 'reorder_note_down' }]);
            }
        }
        
        keyboard.push([{ text: '✅ Save Order', callback_data: 'reorder_note_save' }, { text: '🔙 Back', callback_data: 'reorder_notes_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML'
        });
        
    } catch (error) {
        console.error('Select note for reorder error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('reorder_note_up', async (ctx) => {
    try {
        if (!ctx.session.reorderNote) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const selectedIndex = ctx.session.reorderNote.selectedIndex;
        const notes = [...ctx.session.reorderNote.notes];
        
        if (selectedIndex <= 0) {
            await ctx.answerCbQuery('❌ Already at top');
            return;
        }
        
        const temp = notes[selectedIndex];
        notes[selectedIndex] = notes[selectedIndex - 1];
        notes[selectedIndex - 1] = temp;
        
        ctx.session.reorderNote.selectedIndex = selectedIndex - 1;
        ctx.session.reorderNote.notes = notes;
        
        let text = '<b>🔼🔽 Reorder Global Notes</b>\n\n';
        text += 'Current order (selected note is highlighted):\n\n';
        
        notes.forEach((note, index) => {
            let title = note.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === ctx.session.reorderNote.selectedIndex) {
                text += '<blockquote>' + (index + 1) + '. ' + title + '</blockquote>\n';
            } else {
                text += (index + 1) + '. ' + title + '\n';
            }
        });
        
        const keyboard = [];
        const newIndex = ctx.session.reorderNote.selectedIndex;
        
        if (newIndex > 0) {
            keyboard.push([{ text: '🔼 Move Up', callback_data: 'reorder_note_up' }]);
        }
        
        if (newIndex < notes.length - 1) {
            if (newIndex > 0) {
                keyboard[keyboard.length - 1].push({ text: '🔽 Move Down', callback_data: 'reorder_note_down' });
            } else {
                keyboard.push([{ text: '🔽 Move Down', callback_data: 'reorder_note_down' }]);
            }
        }
        
        keyboard.push([{ text: '✅ Save Order', callback_data: 'reorder_note_save' }, { text: '🔙 Back', callback_data: 'reorder_notes_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery('✅ Moved up');
        
    } catch (error) {
        console.error('Move note up error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('reorder_note_down', async (ctx) => {
    try {
        if (!ctx.session.reorderNote) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const selectedIndex = ctx.session.reorderNote.selectedIndex;
        const notes = [...ctx.session.reorderNote.notes];
        
        if (selectedIndex >= notes.length - 1) {
            await ctx.answerCbQuery('❌ Already at bottom');
            return;
        }
        
        const temp = notes[selectedIndex];
        notes[selectedIndex] = notes[selectedIndex + 1];
        notes[selectedIndex + 1] = temp;
        
        ctx.session.reorderNote.selectedIndex = selectedIndex + 1;
        ctx.session.reorderNote.notes = notes;
        
        let text = '<b>🔼🔽 Reorder Global Notes</b>\n\n';
        text += 'Current order (selected note is highlighted):\n\n';
        
        notes.forEach((note, index) => {
            let title = note.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === ctx.session.reorderNote.selectedIndex) {
                text += '<blockquote>' + (index + 1) + '. ' + title + '</blockquote>\n';
            } else {
                text += (index + 1) + '. ' + title + '\n';
            }
        });
        
        const keyboard = [];
        const newIndex = ctx.session.reorderNote.selectedIndex;
        
        if (newIndex > 0) {
            keyboard.push([{ text: '🔼 Move Up', callback_data: 'reorder_note_up' }]);
        }
        
        if (newIndex < notes.length - 1) {
            if (newIndex > 0) {
                keyboard[keyboard.length - 1].push({ text: '🔽 Move Down', callback_data: 'reorder_note_down' });
            } else {
                keyboard.push([{ text: '🔽 Move Down', callback_data: 'reorder_note_down' }]);
            }
        }
        
        keyboard.push([{ text: '✅ Save Order', callback_data: 'reorder_note_save' }, { text: '🔙 Back', callback_data: 'reorder_notes_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery('✅ Moved down');
        
    } catch (error) {
        console.error('Move note down error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

bot.action('reorder_note_save', async (ctx) => {
    try {
        if (!ctx.session.reorderNote) {
            await ctx.answerCbQuery('❌ Session expired');
            return;
        }
        
        const notes = ctx.session.reorderNote.notes;
        
        for (let i = 0; i < notes.length; i++) {
            await db.collection('notes').updateOne(
                { noteId: notes[i].noteId },
                { $set: { orderIndex: i } }
            );
        }
        
        delete ctx.session.reorderNote;
        
        await ctx.answerCbQuery('✅ Note order saved!');
        await showMainMenu(ctx);
        
    } catch (error) {
        console.error('Save note order error:', error);
        await ctx.answerCbQuery('❌ Failed to save order');
    }
});

// ==========================================
// 📜 VIEW HISTORY
// ==========================================
bot.action(/^view_history_dates_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    
    const perPage = 10;
    const skip = (page - 1) * perPage;
    
    const dates = await db.collection('history').aggregate([
        { 
            $group: { 
                _id: { 
                    year: { $year: "$completedDate" },
                    month: { $month: "$completedDate" },
                    day: { $dayOfMonth: "$completedDate" }
                },
                count: { $sum: 1 },
                completedDate: { $first: "$completedDate" }
            }
        },
        { $sort: { completedDate: -1 } },
        { 
            $facet: {
                metadata: [{ $count: "total" }],
                data: [{ $skip: skip }, { $limit: perPage }]
            }
        }
    ]).toArray();

    const totalDates = dates[0]?.metadata[0]?.total || 0;
    const dateList = dates[0]?.data || [];
    const totalPages = Math.max(1, Math.ceil(totalDates / perPage));

    let text = '📜 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦 𝗛𝗜𝗦𝗧𝗢𝗥𝗬</b>\n━━━━━━━━━━━━━━━━━━━━\n📊 Total: ' + totalDates + ' date' + (totalDates !== 1 ? 's' : '') + '\n📄 Page: ' + page + '/' + totalPages + '\n━━━━━━━━━━━━━━━━━━━━\n';
    
    if (dateList.length === 0) {
        text += '📭 No history available.';
    } else {
        text += 'Select a date to view:';
    }
    
    const buttons = dateList.map(d => {
        const date = new Date(d.completedDate);
        const dateStr = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        
        const istDate = utcToISTDisplay(date);
        
        return [Markup.button.callback('📅 ' + istDate.displayDate + ' (' + d.count + ')', 'hist_list_' + dateStr + '_1')];
    });
    
    if (totalPages > 1) {
        const paginationRow = [];
        if (page > 1) {
            paginationRow.push(Markup.button.callback('◀️ Previous', 'view_history_dates_' + (page - 1)));
        }
        paginationRow.push(Markup.button.callback('📄 ' + page + '/' + totalPages, 'no_action'));
        if (page < totalPages) {
            paginationRow.push(Markup.button.callback('Next ▶️', 'view_history_dates_' + (page + 1)));
        }
        buttons.push(paginationRow);
    }
    
    buttons.push([Markup.button.callback('🔙 Back to History', 'history_menu')]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^hist_list_([\d-]+)_(\d+)$/, async (ctx) => {
    const dateStr = ctx.match[1];
    const page = parseInt(ctx.match[2]);

    const [year, month, day] = dateStr.split('-').map(Number);
    
    const selectedDate = new Date(Date.UTC(year, month - 1, day));
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));

    const perPage = 10;
    const skip = (page - 1) * perPage;
    
    const totalTasks = await db.collection('history').countDocuments({
        completedDate: {
            $gte: selectedDate,
            $lt: nextDay
        }
    });
    
    const totalPages = Math.max(1, Math.ceil(totalTasks / perPage));

    const tasks = await db.collection('history').find({
        completedDate: {
            $gte: selectedDate,
            $lt: nextDay
        }
    }).sort({ completedAt: -1 }).skip(skip).limit(perPage).toArray();

    const istDate = utcToISTDisplay(selectedDate);
    
    let text = '📅 <b>𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗢𝗡 ' + istDate.displayDate.toUpperCase() + ' IST</b>\n━━━━━━━━━━━━━━━━━━━━\n📊 Total: ' + totalTasks + ' task' + (totalTasks !== 1 ? 's' : '') + '\n📄 Page: ' + page + '/' + totalPages + '\n━━━━━━━━━━━━━━━━━━━━\n';
    
    if (tasks.length === 0) {
        text += '📭 No tasks completed on this date.';
    } else {
        text += 'Select a task to view details:';
    }
    
    const buttons = tasks.map((t, index) => {
        const taskNum = skip + index + 1;
        let taskTitle = t.title;
        
        if (t.subtasks && t.subtasks.length > 0) {
            const completed = t.subtasks.filter(s => s.completed).length;
            taskTitle += ' [' + completed + '/' + t.subtasks.length + ']';
        }
        
        if (taskTitle.length > 40) taskTitle = taskTitle.substring(0, 37) + '...';
        
        const completedIST = utcToISTDisplay(t.completedAt);
        
        return [
            Markup.button.callback('✅ ' + taskNum + '. ' + taskTitle + ' (' + completedIST.displayTime + ' IST)', 'hist_det_' + t._id)
        ];
    });
    
    if (totalPages > 1) {
        const paginationRow = [];
        if (page > 1) {
            paginationRow.push(Markup.button.callback('◀️ Previous', 'hist_list_' + dateStr + '_' + (page - 1)));
        }
        paginationRow.push(Markup.button.callback('📄 ' + page + '/' + totalPages, 'no_action'));
        if (page < totalPages) {
            paginationRow.push(Markup.button.callback('Next ▶️', 'hist_list_' + dateStr + '_' + (page + 1)));
        }
        buttons.push(paginationRow);
    }
    
    buttons.push([Markup.button.callback('🔙 Back to Dates', 'view_history_dates_1')]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^hist_det_(.+)$/, async (ctx) => {
    try {
        const id = ctx.match[1];
        const task = await db.collection('history').findOne({ _id: new ObjectId(id) });

        if (!task) {
            await ctx.answerCbQuery('Task not found');
            return;
        }

        const duration = calculateDuration(task.startDate, task.endDate);
        const completedIST = utcToISTDisplay(task.completedAt);
        const startIST = utcToISTDisplay(task.startDate);
        const endIST = utcToISTDisplay(task.endDate);

        let text = `
📜 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗛𝗜𝗦𝗧𝗢𝗥𝗬 𝗗𝗘𝗧𝗔𝗜𝗟</b>
━━━━━━━━━━━━━━━━━━━━
📌 <b>${task.title}</b>
${hasContent(task.description) ? formatBlockquote(task.description) : ''}
✅ <b>Completed At:</b> ${completedIST.dateTime} IST
${task.autoCompleted ? '🤖 <b>Auto-completed at 23:59 IST</b>\n' : ''}
⏰ <b>Original Time:</b> ${startIST.displayTime} - ${endIST.displayTime} IST
⏱️ <b>Duration:</b> ${formatDuration(duration)}
🔄 <b>Repeat Type:</b> ${task.repeat === 'none' ? 'No Repeat' : task.repeat}
${task.repeatCount > 0 ? '🔢 <b>Remaining Repeats:</b> ' + task.repeatCount + '\n' : ''}
━━━━━━━━━━━━━━━━━━━━
`;

        if (task.subtasks && task.subtasks.length > 0) {
            text += '📋 <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞𝗦:</b>\n';
            task.subtasks.sort((a, b) => {
                if (a.completed === b.completed) return 0;
                return a.completed ? 1 : -1;
            }).forEach((subtask, index) => {
                const status = subtask.completed ? '✅' : '❌';
                let title = subtask.title;
                if (title.length > 40) title = title.substring(0, 37) + '...';
                text += status + ' ' + (index + 1) + '. ' + title + '\n';
                if (hasContent(subtask.description)) {
                    text += '   ' + formatBlockquote(subtask.description) + '\n';
                }
            });
            text += '━━━━━━━━━━━━━━━━━━━━\n';
        }

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to History', 'view_history_dates_1')]
        ]);
        
        await safeEdit(ctx, text, keyboard);
    } catch (error) {
        console.error('Error showing history detail:', error);
        await ctx.answerCbQuery('❌ Error loading history detail');
    }
});

// ==========================================
// 🗒️ VIEW NOTES
// ==========================================
bot.action(/^view_notes_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    
    const perPage = 10;
    const skip = (page - 1) * perPage;
    
    const totalNotes = await db.collection('notes').countDocuments({});
    const totalPages = Math.max(1, Math.ceil(totalNotes / perPage));
    
    const notes = await db.collection('notes').find()
        .sort({ orderIndex: 1, createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .toArray();

    let text = '🗒️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘𝗦</b>\n━━━━━━━━━━━━━━━━━━━━\n📊 Total: ' + totalNotes + ' note' + (totalNotes !== 1 ? 's' : '') + '\n📄 Page: ' + page + '/' + totalPages + '\n━━━━━━━━━━━━━━━━━━━━\n';
    
    if (notes.length === 0) {
        text += '📭 No notes yet.';
    } else {
        text += 'Select a note to view:';
    }
    
    const buttons = notes.map((n, index) => {
        const noteNum = skip + index + 1;
        let title = n.title;
        if (title.length > 40) title = title.substring(0, 37) + '...';
        
        return [
            Markup.button.callback('📄 ' + noteNum + '. ' + title, 'note_det_' + n.noteId)
        ];
    });
    
    if (totalPages > 1) {
        const paginationRow = [];
        if (page > 1) {
            paginationRow.push(Markup.button.callback('◀️ Previous', 'view_notes_' + (page - 1)));
        }
        paginationRow.push(Markup.button.callback('📄 ' + page + '/' + totalPages, 'no_action'));
        if (page < totalPages) {
            paginationRow.push(Markup.button.callback('Next ▶️', 'view_notes_' + (page + 1)));
        }
        buttons.push(paginationRow);
    }
    
    buttons.push([Markup.button.callback('🔙 Back to Notes', 'notes_menu')]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^note_det_([^_]+)$/, async (ctx) => {
    await showNoteDetail(ctx, ctx.match[1]);
});

async function showNoteDetail(ctx, noteId) {
    if (!noteId) {
        await ctx.answerCbQuery('❌ Invalid note ID');
        return;
    }
    
    const note = await db.collection('notes').findOne({ noteId });
    if (!note) {
        const text = '❌ <b>𝗡𝗢𝗧𝗘 𝗡𝗢𝗧 𝗙𝗢𝗨𝗡𝗗</b>\n\nThis note may have been deleted.';
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🗒️ Notes', 'view_notes_1'),
            Markup.button.callback('🔙 Back', 'main_menu')]
        ]);
        return safeEdit(ctx, text, keyboard);
    }

    let contentDisplay = note.description || '';
    
    const createdIST = utcToISTDisplay(note.createdAt);
    const updatedIST = note.updatedAt ? utcToISTDisplay(note.updatedAt) : createdIST;
    
    const text = `
📝 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘 𝗗𝗘𝗧𝗔𝗜𝗟𝗦</b>
━━━━━━━━━━━━━━━━━━━━
📌 <b>${note.title}</b>
${hasContent(contentDisplay) ? formatBlockquote(contentDisplay) : ''}
📅 <b>Created:</b> ${createdIST.dateTime} IST
${note.updatedAt ? '✏️ <b>Updated:</b> ' + updatedIST.dateTime + ' IST' : ''}
🏷️ <b>Order:</b> ${note.orderIndex + 1}
━━━━━━━━━━━━━━━━━━━━`;
    
    const buttons = [
        [
            Markup.button.callback('✏️ Edit Title', 'edit_note_title_' + note.noteId), 
            Markup.button.callback('✏️ Edit Content', 'edit_note_content_' + note.noteId)
        ],
        [
            Markup.button.callback('🗑️ Delete', 'delete_note_' + note.noteId),
            Markup.button.callback('🔙 Back to Notes', 'view_notes_1')
        ]
    ];

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

bot.action(/^edit_note_title_([^_]+)$/, async (ctx) => {
    const noteId = ctx.match[1];
    
    const note = await db.collection('notes').findOne({ noteId });
    if (!note) {
        await ctx.answerCbQuery('❌ Note not found');
        return;
    }
    
    ctx.session.editNoteId = noteId;
    ctx.session.step = 'edit_note_title';
    
    await ctx.reply(
        '✏️ <b>𝗘𝗗𝗜𝗧 𝗡𝗢𝗧𝗘 𝗧𝗜𝗧𝗟𝗘</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Enter new title:',
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'note_det_' + noteId)]])
        }
    );
});

bot.action(/^edit_note_content_([^_]+)$/, async (ctx) => {
    const noteId = ctx.match[1];
    
    const note = await db.collection('notes').findOne({ noteId });
    if (!note) {
        await ctx.answerCbQuery('❌ Note not found');
        return;
    }
    
    ctx.session.editNoteId = noteId;
    ctx.session.step = 'edit_note_content';
    
    await ctx.reply(
        '✏️ <b>𝗘𝗗𝗜𝗧 𝗡𝗢𝗧𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        'Enter new content (Max 400 words, enter "-" for empty):',
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'note_det_' + noteId)]])
        }
    );
});

bot.action(/^delete_note_([^_]+)$/, async (ctx) => {
    try {
        const noteId = ctx.match[1];
        const note = await db.collection('notes').findOne({ noteId });
        const noteTitle = note?.title || 'Note';
        
        await db.collection('notes').deleteOne({ noteId: noteId });
        await reindexNotes();
        await ctx.answerCbQuery('✅ Note Deleted');
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                '🗑️ <b>𝗡𝗢𝗧𝗘 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '📌 <b>' + noteTitle + '</b>\n' +
                '🗑️ Note was deleted\n' +
                '━━━━━━━━━━━━━━━━━━━━',
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
        
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error deleting note:', error);
        await ctx.answerCbQuery('❌ Error deleting note');
    }
});

// ==========================================
// 📥 DOWNLOAD MENU
// ==========================================
bot.action('download_menu', async (ctx) => {
    const text = '📥 <b>𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗 𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗔𝗧𝗔</b>\n━━━━━━━━━━━━━━━━━━━━\n📁 <i>Files will be sent as JSON documents</i>';
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📋 Active Tasks', 'download_tasks')],
        [Markup.button.callback('📜 History', 'download_history')],
        [Markup.button.callback('🗒️ Notes', 'download_notes')],
        [Markup.button.callback('🌱 Progress', 'download_progress')],
        [Markup.button.callback('📦 All Data', 'download_all')],
        [Markup.button.callback('🔙 Back', 'main_menu')]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action('download_tasks', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Fetching tasks...');
        const tasks = await db.collection('tasks').find().toArray();
        
        const tasksData = {
            total: tasks.length,
            downloadedAt: new Date().toISOString(),
            downloadedAtIST: utcToISTDisplay(new Date()).dateTime,
            data: tasks.length > 0 ? tasks : []
        };
        
        const tasksJson = JSON.stringify(tasksData, null, 2);
        const tasksBuff = Buffer.from(tasksJson, 'utf-8');
        
        await ctx.replyWithDocument({
            source: tasksBuff,
            filename: 'global_tasks_' + Date.now() + '.json'
        }, {
            caption: '📋 <b>Global Tasks Data</b>\nTotal: ' + tasks.length + ' task' + (tasks.length !== 1 ? 's' : '') + '\n📅 ' + utcToISTDisplay(new Date()).dateTime + ' IST',
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery('✅ Sent ' + tasks.length + ' tasks');
    } catch (error) {
        console.error('Error downloading tasks:', error);
        await ctx.answerCbQuery('❌ Error sending tasks file');
        await ctx.reply('❌ Failed to send tasks file. Please try again.');
    }
});

bot.action('download_history', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Fetching history...');
        const history = await db.collection('history').find().toArray();
        
        const historyData = {
            total: history.length,
            downloadedAt: new Date().toISOString(),
            downloadedAtIST: utcToISTDisplay(new Date()).dateTime,
            data: history.length > 0 ? history : []
        };
        
        const historyJson = JSON.stringify(historyData, null, 2);
        const histBuff = Buffer.from(historyJson, 'utf-8');
        
        await ctx.replyWithDocument({
            source: histBuff,
            filename: 'global_history_' + Date.now() + '.json'
        }, {
            caption: '📜 <b>Global History Data</b>\nTotal: ' + history.length + ' item' + (history.length !== 1 ? 's' : '') + '\n📅 ' + utcToISTDisplay(new Date()).dateTime + ' IST',
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery('✅ Sent ' + history.length + ' history items');
    } catch (error) {
        console.error('Error downloading history:', error);
        await ctx.answerCbQuery('❌ Error sending history file');
        await ctx.reply('❌ Failed to send history file. Please try again.');
    }
});

bot.action('download_notes', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Fetching notes...');
        const notes = await db.collection('notes').find().toArray();
        
        const notesData = {
            total: notes.length,
            downloadedAt: new Date().toISOString(),
            downloadedAtIST: utcToISTDisplay(new Date()).dateTime,
            data: notes.length > 0 ? notes : []
        };
        
        const notesJson = JSON.stringify(notesData, null, 2);
        const notesBuff = Buffer.from(notesJson, 'utf-8');
        
        await ctx.replyWithDocument({
            source: notesBuff,
            filename: 'global_notes_' + Date.now() + '.json'
        }, {
            caption: '🗒️ <b>Global Notes Data</b>\nTotal: ' + notes.length + ' note' + (notes.length !== 1 ? 's' : '') + '\n📅 ' + utcToISTDisplay(new Date()).dateTime + ' IST',
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery('✅ Sent ' + notes.length + ' notes');
    } catch (error) {
        console.error('Error downloading notes:', error);
        await ctx.answerCbQuery('❌ Error sending notes file');
        await ctx.reply('❌ Failed to send notes file. Please try again.');
    }
});

bot.action('download_progress', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Fetching progress...');
        const [progress, entries] = await Promise.all([
            db.collection('progress').find().toArray(),
            db.collection('progressEntries').find().toArray()
        ]);
        
        const progressData = {
            total: progress.length,
            entries: entries.length,
            downloadedAt: new Date().toISOString(),
            downloadedAtIST: utcToISTDisplay(new Date()).dateTime,
            progress: progress,
            entries: entries
        };
        
        const progressJson = JSON.stringify(progressData, null, 2);
        const progressBuff = Buffer.from(progressJson, 'utf-8');
        
        await ctx.replyWithDocument({
            source: progressBuff,
            filename: 'global_progress_' + Date.now() + '.json'
        }, {
            caption: '🌱 <b>Global Progress Data</b>\nTrackers: ' + progress.length + ', Entries: ' + entries.length + '\n📅 ' + utcToISTDisplay(new Date()).dateTime + ' IST',
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery('✅ Sent ' + progress.length + ' trackers with ' + entries.length + ' entries');
    } catch (error) {
        console.error('Error downloading progress:', error);
        await ctx.answerCbQuery('❌ Error sending progress file');
        await ctx.reply('❌ Failed to send progress file. Please try again.');
    }
});

bot.action('download_all', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Preparing all data...');
        const timestamp = Date.now();
        
        const [tasks, history, notes, progress, entries] = await Promise.all([
            db.collection('tasks').find().toArray(),
            db.collection('history').find().toArray(),
            db.collection('notes').find().toArray(),
            db.collection('progress').find().toArray(),
            db.collection('progressEntries').find().toArray()
        ]);
        
        const totalItems = tasks.length + history.length + notes.length + progress.length + entries.length;
        const nowIST = utcToISTDisplay(new Date());
        
        if (tasks.length > 0) {
            const tasksData = {
                total: tasks.length,
                downloadedAt: new Date().toISOString(),
                downloadedAtIST: nowIST.dateTime,
                data: tasks
            };
            const tasksBuff = Buffer.from(JSON.stringify(tasksData, null, 2), 'utf-8');
            await ctx.replyWithDocument({
                source: tasksBuff,
                filename: 'global_tasks_' + timestamp + '.json'
            }, {
                caption: '📋 <b>Tasks</b> (' + tasks.length + ' item' + (tasks.length !== 1 ? 's' : '') + ') - ' + nowIST.displayTime + ' IST',
                parse_mode: 'HTML'
            });
        }
        
        if (history.length > 0) {
            const historyData = {
                total: history.length,
                downloadedAt: new Date().toISOString(),
                downloadedAtIST: nowIST.dateTime,
                data: history
            };
            const histBuff = Buffer.from(JSON.stringify(historyData, null, 2), 'utf-8');
            await ctx.replyWithDocument({
                source: histBuff,
                filename: 'global_history_' + timestamp + '.json'
            }, {
                caption: '📜 <b>History</b> (' + history.length + ' item' + (history.length !== 1 ? 's' : '') + ') - ' + nowIST.displayTime + ' IST',
                parse_mode: 'HTML'
            });
        }
        
        if (notes.length > 0) {
            const notesData = {
                total: notes.length,
                downloadedAt: new Date().toISOString(),
                downloadedAtIST: nowIST.dateTime,
                data: notes
            };
            const notesBuff = Buffer.from(JSON.stringify(notesData, null, 2), 'utf-8');
            await ctx.replyWithDocument({
                source: notesBuff,
                filename: 'global_notes_' + timestamp + '.json'
            }, {
                caption: '🗒️ <b>Notes</b> (' + notes.length + ' item' + (notes.length !== 1 ? 's' : '') + ') - ' + nowIST.displayTime + ' IST',
                parse_mode: 'HTML'
            });
        }
        
        if (progress.length > 0 || entries.length > 0) {
            const progressData = {
                totalTrackers: progress.length,
                totalEntries: entries.length,
                downloadedAt: new Date().toISOString(),
                downloadedAtIST: nowIST.dateTime,
                progress: progress,
                entries: entries
            };
            const progressBuff = Buffer.from(JSON.stringify(progressData, null, 2), 'utf-8');
            await ctx.replyWithDocument({
                source: progressBuff,
                filename: 'global_progress_' + timestamp + '.json'
            }, {
                caption: '🌱 <b>Progress</b> (Trackers: ' + progress.length + ', Entries: ' + entries.length + ') - ' + nowIST.displayTime + ' IST',
                parse_mode: 'HTML'
            });
        }
        
        await ctx.reply(
            '📦 <b>ALL GLOBAL DATA DOWNLOAD COMPLETE</b>\n━━━━━━━━━━━━━━━━━━━━\n' +
            '📋 Tasks: ' + tasks.length + ' item' + (tasks.length !== 1 ? 's' : '') + '\n' +
            '📜 History: ' + history.length + ' item' + (history.length !== 1 ? 's' : '') + '\n' +
            '🗒️ Notes: ' + notes.length + ' item' + (notes.length !== 1 ? 's' : '') + '\n' +
            '🌱 Progress: ' + progress.length + ' tracker' + (progress.length !== 1 ? 's' : '') + '\n' +
            '📊 Entries: ' + entries.length + ' entry' + (entries.length !== 1 ? 's' : '') + '\n' +
            '📁 ' + [tasks, history, notes, progress].filter(a => a.length > 0).length + ' JSON files sent\n' +
            '📅 ' + nowIST.dateTime + ' IST\n' +
            '━━━━━━━━━━━━━━━━━━━━',
            { parse_mode: 'HTML' }
        );
        
        await ctx.answerCbQuery('✅ Sent ' + totalItems + ' items across ' + [tasks, history, notes, progress].filter(a => a.length > 0).length + ' files');
    } catch (error) {
        console.error('Error downloading all data:', error);
        await ctx.answerCbQuery('❌ Error sending files');
        await ctx.reply('❌ Failed to send files. Please try again.');
    }
});

// ==========================================
// 🗑️ DELETE MENU
// ==========================================
bot.action('delete_menu', async (ctx) => {
    try {
        const text = '🗑️ <b>𝗗𝗘𝗟𝗘𝗧𝗘 𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗔𝗧𝗔</b>\n━━━━━━━━━━━━━━━━━━━━\n⚠️ <b>⚠️ WARNING: This will delete data for EVERYONE!</b>\n━━━━━━━━━━━━━━━━━━━━\n<b>Select what to delete:</b>';
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📋 Delete All Tasks', 'delete_tasks_confirm')],
            [Markup.button.callback('📜 Delete All History', 'delete_history_confirm')],
            [Markup.button.callback('🗒️ Delete All Notes', 'delete_notes_confirm')],
            [Markup.button.callback('🌱 Delete All Progress', 'delete_progress_confirm')],
            [Markup.button.callback('🔥 Delete EVERYTHING', 'delete_all_confirm')],
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, text, keyboard);
    } catch (error) {
        console.error('Error in delete_menu:', error);
        await ctx.answerCbQuery('❌ Error loading delete menu');
    }
});

bot.action('delete_progress_confirm', async (ctx) => {
    try {
        const progressCount = await db.collection('progress').countDocuments({});
        const entriesCount = await db.collection('progressEntries').countDocuments({});
        
        const text = '⚠️ <b>⚠️ FINAL WARNING ⚠️</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ' + progressCount + ' GLOBAL progress tracker' + (progressCount !== 1 ? 's' : '') + ' with ' + entriesCount + ' entries?\n\n<b>This will affect ALL users!</b>\n\n⚠️ <b>This action cannot be undone!</b>\n━━━━━━━━━━━━━━━━━━━━';
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, DELETE ALL GLOBAL PROGRESS', 'delete_progress_final')],
            [Markup.button.callback('🔙 Cancel', 'delete_menu')]
        ]);
        
        await safeEdit(ctx, text, keyboard);
    } catch (error) {
        console.error('Error in delete_progress_confirm:', error);
        await ctx.answerCbQuery('❌ Error loading confirmation');
    }
});

bot.action('delete_progress_final', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Processing...');
        
        const progress = await db.collection('progress').find().toArray();
        const entries = await db.collection('progressEntries').find().toArray();
        
        const progressResult = await db.collection('progress').deleteMany({});
        const entriesResult = await db.collection('progressEntries').deleteMany({});
        
        if (progress.length > 0 || entries.length > 0) {
            const backupData = {
                progress: progress,
                entries: entries,
                deletedAt: new Date().toISOString()
            };
            const backupBuff = Buffer.from(JSON.stringify(backupData, null, 2));
            try {
                await ctx.replyWithDocument({ 
                    source: backupBuff, 
                    filename: 'global_progress_backup_' + Date.now() + '.json' 
                });
            } catch (sendError) {
                console.error('Error sending backup:', sendError);
            }
        }
        
        const successText = '✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ' + progressResult.deletedCount + ' progress trackers and ' + entriesResult.deletedCount + ' entries\n' + ((progress.length + entries.length) > 0 ? '📁 Backup file sent!\n' : '') + '━━━━━━━━━━━━━━━━━━━━';
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                '🗑️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗣𝗥𝗢𝗚𝗥𝗘𝗦𝗦 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '🗑️ All ' + progressResult.deletedCount + ' trackers with ' + entriesResult.deletedCount + ' entries deleted\n' +
                '━━━━━━━━━━━━━━━━━━━━',
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    } catch (error) {
        console.error('Error deleting progress:', error);
        await ctx.answerCbQuery('❌ Error deleting progress');
        await showMainMenu(ctx);
    }
});

bot.action('delete_tasks_confirm', async (ctx) => {
    try {
        const taskCount = await db.collection('tasks').countDocuments({});
        
        const text = '⚠️ <b>⚠️ FINAL WARNING ⚠️</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ' + taskCount + ' GLOBAL task' + (taskCount !== 1 ? 's' : '') + '?\n\n<b>This will affect ALL users!</b>\n\n⚠️ <b>This action cannot be undone!</b>\n━━━━━━━━━━━━━━━━━━━━';
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, DELETE ALL GLOBAL TASKS', 'delete_tasks_final')],
            [Markup.button.callback('🔙 Cancel', 'delete_menu')]
        ]);
        
        await safeEdit(ctx, text, keyboard);
    } catch (error) {
        console.error('Error in delete_tasks_confirm:', error);
        await ctx.answerCbQuery('❌ Error loading confirmation');
    }
});

bot.action('delete_tasks_final', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Processing...');
        
        const tasks = await db.collection('tasks').find().toArray();
        
        tasks.forEach(t => cancelTaskSchedule(t.taskId));
        
        const result = await db.collection('tasks').deleteMany({});
        
        if (tasks.length > 0) {
            const backupBuff = Buffer.from(JSON.stringify(tasks, null, 2));
            try {
                await ctx.replyWithDocument({ 
                    source: backupBuff, 
                    filename: 'global_tasks_backup_' + Date.now() + '.json' 
                });
            } catch (sendError) {
                console.error('Error sending backup:', sendError);
            }
        }
        
        const successText = '✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ' + result.deletedCount + ' global task' + (result.deletedCount !== 1 ? 's' : '') + '\n' + (tasks.length > 0 ? '📁 Backup file sent!\n' : '') + '━━━━━━━━━━━━━━━━━━━━';
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                '🗑️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '🗑️ All ' + result.deletedCount + ' tasks have been deleted\n' +
                '━━━━━━━━━━━━━━━━━━━━',
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    } catch (error) {
        console.error('Error deleting tasks:', error);
        await ctx.answerCbQuery('❌ Error deleting tasks');
        await showMainMenu(ctx);
    }
});

bot.action('delete_history_confirm', async (ctx) => {
    try {
        const historyCount = await db.collection('history').countDocuments({});
        
        const text = '⚠️ <b>⚠️ FINAL WARNING ⚠️</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ' + historyCount + ' GLOBAL history item' + (historyCount !== 1 ? 's' : '') + '?\n\n<b>This will affect ALL users!</b>\n\n⚠️ <b>This action cannot be undone!</b>\n━━━━━━━━━━━━━━━━━━━━';
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, DELETE ALL GLOBAL HISTORY', 'delete_history_final')],
            [Markup.button.callback('🔙 Cancel', 'delete_menu')]
        ]);
        
        await safeEdit(ctx, text, keyboard);
    } catch (error) {
        console.error('Error in delete_history_confirm:', error);
        await ctx.answerCbQuery('❌ Error loading confirmation');
    }
});

bot.action('delete_history_final', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Processing...');
        
        const history = await db.collection('history').find().toArray();
        
        const result = await db.collection('history').deleteMany({});
        
        if (history.length > 0) {
            const backupBuff = Buffer.from(JSON.stringify(history, null, 2));
            try {
                await ctx.replyWithDocument({ 
                    source: backupBuff, 
                    filename: 'global_history_backup_' + Date.now() + '.json' 
                });
            } catch (sendError) {
                console.error('Error sending backup:', sendError);
            }
        }
        
        const successText = '✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ' + result.deletedCount + ' global history item' + (result.deletedCount !== 1 ? 's' : '') + '\n' + (history.length > 0 ? '📁 Backup file sent!\n' : '') + '━━━━━━━━━━━━━━━━━━━━';
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                '🗑️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗛𝗜𝗦𝗧𝗢𝗥𝗬 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '🗑️ All ' + result.deletedCount + ' history items have been deleted\n' +
                '━━━━━━━━━━━━━━━━━━━━',
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    } catch (error) {
        console.error('Error deleting history:', error);
        await ctx.answerCbQuery('❌ Error deleting history');
        await showMainMenu(ctx);
    }
});

bot.action('delete_notes_confirm', async (ctx) => {
    try {
        const notesCount = await db.collection('notes').countDocuments({});
        
        const text = '⚠️ <b>⚠️ FINAL WARNING ⚠️</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ' + notesCount + ' GLOBAL note' + (notesCount !== 1 ? 's' : '') + '?\n\n<b>This will affect ALL users!</b>\n\n⚠️ <b>This action cannot be undone!</b>\n━━━━━━━━━━━━━━━━━━━━';
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, DELETE ALL GLOBAL NOTES', 'delete_notes_final')],
            [Markup.button.callback('🔙 Cancel', 'delete_menu')]
        ]);
        
        await safeEdit(ctx, text, keyboard);
    } catch (error) {
        console.error('Error in delete_notes_confirm:', error);
        await ctx.answerCbQuery('❌ Error loading confirmation');
    }
});

bot.action('delete_notes_final', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Processing...');
        
        const notes = await db.collection('notes').find().toArray();
        
        const result = await db.collection('notes').deleteMany({});
        
        if (notes.length > 0) {
            const backupBuff = Buffer.from(JSON.stringify(notes, null, 2));
            try {
                await ctx.replyWithDocument({ 
                    source: backupBuff, 
                    filename: 'global_notes_backup_' + Date.now() + '.json' 
                });
            } catch (sendError) {
                console.error('Error sending backup:', sendError);
            }
        }
        
        const successText = '✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ' + result.deletedCount + ' global note' + (result.deletedCount !== 1 ? 's' : '') + '\n' + (notes.length > 0 ? '📁 Backup file sent!\n' : '') + '━━━━━━━━━━━━━━━━━━━━';
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                '🗑️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘𝗦 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '🗑️ All ' + result.deletedCount + ' notes have been deleted\n' +
                '━━━━━━━━━━━━━━━━━━━━',
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    } catch (error) {
        console.error('Error deleting notes:', error);
        await ctx.answerCbQuery('❌ Error deleting notes');
        await showMainMenu(ctx);
    }
});

bot.action('delete_all_confirm', async (ctx) => {
    try {
        const [tasksCount, historyCount, notesCount, progressCount, entriesCount] = await Promise.all([
            db.collection('tasks').countDocuments({}),
            db.collection('history').countDocuments({}),
            db.collection('notes').countDocuments({}),
            db.collection('progress').countDocuments({}),
            db.collection('progressEntries').countDocuments({})
        ]);
        const totalCount = tasksCount + historyCount + notesCount + progressCount + entriesCount;
        
        const text = '⚠️ <b>⚠️ ⚠️ ⚠️ FINAL WARNING ⚠️ ⚠️ ⚠️</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ' + totalCount + ' GLOBAL items?\n\n<b>⚠️ THIS WILL DELETE EVERYTHING FOR EVERYONE!</b>\n\n📋 Tasks: ' + tasksCount + '\n📜 History: ' + historyCount + '\n🗒️ Notes: ' + notesCount + '\n🌱 Progress Trackers: ' + progressCount + '\n📊 Progress Entries: ' + entriesCount + '\n\n<b>⚠️ THIS ACTION CANNOT BE UNDONE!</b>\n━━━━━━━━━━━━━━━━━━━━';
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔥 YES, DELETE EVERYTHING GLOBAL', 'delete_all_final')],
            [Markup.button.callback('🔙 Cancel', 'delete_menu')]
        ]);
        
        await safeEdit(ctx, text, keyboard);
    } catch (error) {
        console.error('Error in delete_all_confirm:', error);
        await ctx.answerCbQuery('❌ Error loading confirmation');
    }
});

bot.action('delete_all_final', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Processing...');
        
        const [tasks, history, notes, progress, entries] = await Promise.all([
            db.collection('tasks').find().toArray(),
            db.collection('history').find().toArray(),
            db.collection('notes').find().toArray(),
            db.collection('progress').find().toArray(),
            db.collection('progressEntries').find().toArray()
        ]);
        
        tasks.forEach(t => cancelTaskSchedule(t.taskId));
        
        const [tasksResult, historyResult, notesResult, progressResult, entriesResult] = await Promise.all([
            db.collection('tasks').deleteMany({}),
            db.collection('history').deleteMany({}),
            db.collection('notes').deleteMany({}),
            db.collection('progress').deleteMany({}),
            db.collection('progressEntries').deleteMany({})
        ]);
        
        const totalDeleted = tasksResult.deletedCount + historyResult.deletedCount + notesResult.deletedCount + progressResult.deletedCount + entriesResult.deletedCount;
        const timestamp = Date.now();
        
        if (tasks.length > 0) {
            const tasksBuff = Buffer.from(JSON.stringify(tasks, null, 2));
            await ctx.replyWithDocument({ 
                source: tasksBuff, 
                filename: 'global_all_backup_tasks_' + timestamp + '.json' 
            });
        }
        
        if (history.length > 0) {
            const histBuff = Buffer.from(JSON.stringify(history, null, 2));
            await ctx.replyWithDocument({ 
                source: histBuff, 
                filename: 'global_all_backup_history_' + timestamp + '.json' 
            });
        }
        
        if (notes.length > 0) {
            const notesBuff = Buffer.from(JSON.stringify(notes, null, 2));
            await ctx.replyWithDocument({ 
                source: notesBuff, 
                filename: 'global_all_backup_notes_' + timestamp + '.json' 
            });
        }
        
        if (progress.length > 0 || entries.length > 0) {
            const progressData = {
                progress: progress,
                entries: entries,
                deletedAt: new Date().toISOString()
            };
            const progressBuff = Buffer.from(JSON.stringify(progressData, null, 2));
            await ctx.replyWithDocument({ 
                source: progressBuff, 
                filename: 'global_all_backup_progress_' + timestamp + '.json' 
            });
        }
        
        const successText = '✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ' + totalDeleted + ' items total\n\n📋 Tasks: ' + tasksResult.deletedCount + '\n📜 History: ' + historyResult.deletedCount + '\n🗒️ Notes: ' + notesResult.deletedCount + '\n🌱 Trackers: ' + progressResult.deletedCount + '\n📊 Entries: ' + entriesResult.deletedCount + '\n\n' + ((tasks.length + history.length + notes.length + progress.length + entries.length) > 0 ? '📁 Backup files sent!\n' : '') + '━━━━━━━━━━━━━━━━━━━━';
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                '🔥 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗔𝗟𝗟 𝗗𝗔𝗧𝗔 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                '🗑️ All ' + totalDeleted + ' items have been deleted\n' +
                '━━━━━━━━━━━━━━━━━━━━',
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    } catch (error) {
        console.error('Error deleting all data:', error);
        await ctx.answerCbQuery('❌ Error deleting data');
        await showMainMenu(ctx);
    }
});

// Dummy action for pagination
bot.action('no_action', async (ctx) => {
    await ctx.answerCbQuery();
});

// ==========================================
// ⏰ HALF HOURLY SUMMARY
// ==========================================
async function sendHalfHourlySummary() {
    try {
        const todayStartUTC = getTodayStartUTC();
        const tomorrowStartUTC = getTomorrowStartUTC();
        
        const [completedTasks, pendingTasks] = await Promise.all([
            db.collection('history').find({
                completedAt: {
                    $gte: todayStartUTC,
                    $lt: tomorrowStartUTC
                }
            }).sort({ completedAt: 1 }).toArray(),
            
            db.collection('tasks').find({
                status: 'pending',
                nextOccurrence: {
                    $gte: todayStartUTC,
                    $lt: tomorrowStartUTC
                }
            }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray()
        ]);
        
        const nowIST = getCurrentISTDisplay();
        
        let summaryText = `
🕰️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗛𝗔𝗟𝗙 𝗛𝗢𝗨𝗥𝗟𝗬 𝗦𝗨𝗠𝗠𝗔𝗥𝗬</b>
⏰ ${nowIST.displayTime} IST ‧ 📅 ${nowIST.displayDate}
━━━━━━━━━━━━━━━━━━━━
✅ <b>𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗧𝗢𝗗𝗔𝗬:</b> (${completedTasks.length} task${completedTasks.length !== 1 ? 's' : ''})`;

        if (completedTasks.length > 0) {
            completedTasks.slice(0, 5).forEach((task, index) => {
                const completedIST = utcToISTDisplay(task.completedAt);
                summaryText += '\n' + (index + 1) + '‧ ' + task.title + ' ‧ ' + completedIST.displayTime + ' IST';
            });
            if (completedTasks.length > 5) {
                summaryText += '\n...and ' + (completedTasks.length - 5) + ' more';
            }
        } else {
            summaryText += '\n📭 No tasks completed today.';
        }
        
        summaryText += '\n\n⏳ <b>𝗣𝗘𝗡𝗗𝗜𝗡𝗚 𝗧𝗢𝗗𝗔𝗬:</b> (' + pendingTasks.length + ' task' + (pendingTasks.length !== 1 ? 's' : '') + ')';
        
        if (pendingTasks.length > 0) {
            pendingTasks.slice(0, 5).forEach((task, index) => {
                const taskIST = utcToISTDisplay(task.nextOccurrence);
                summaryText += '\n' + (index + 1) + '‧ ' + task.title + ' ‧ ' + taskIST.displayTime + ' IST';
            });
            if (pendingTasks.length > 5) {
                summaryText += '\n...and ' + (pendingTasks.length - 5) + ' more';
            }
        } else {
            summaryText += '\n📭 No pending tasks for today';
        }
        
        summaryText += '\n━━━━━━━━━━━━━━━━━━━━\n⏰ Next update in 30 minutes';
        
        try {
            await bot.telegram.sendMessage(CHAT_ID, summaryText, { parse_mode: 'HTML' });
        } catch (e) {
            console.error('Error sending half-hourly summary:', e.message);
        }
        
    } catch (error) {
        console.error('Error generating half-hourly summary:', error.message);
    }
}

function scheduleHalfHourlySummary() {
    if (hourlySummaryJob) {
        hourlySummaryJob.cancel();
    }
    
    hourlySummaryJob = schedule.scheduleJob('*/30 * * * *', async () => {
        if (isShuttingDown) return;
        console.log('⏰ Sending global half-hourly summaries at ' + utcToISTDisplay(new Date()).displayTime + ' IST...');
        await sendHalfHourlySummary();
    });
    
    console.log('✅ Global half-hourly summary scheduler started');
}

// ==========================================
// 🚀 BOOTSTRAP
// ==========================================
async function start() {
    try {
        if (await connectDB()) {
            await rescheduleAllPending();
            scheduleHalfHourlySummary();
            scheduleAutoComplete();
            
            const server = app.listen(PORT, '0.0.0.0', () => {
                const nowIST = getCurrentISTDisplay();
                console.log('🌐 Web interface running on port ' + PORT);
                console.log('📱 Web URL: http://localhost:' + PORT);
                console.log('🌍 Public Web URL: ' + WEB_APP_URL);
                console.log('🕐 Server Time (UTC): ' + new Date().toISOString());
                console.log('🕐 IST Time: ' + nowIST.dateTime);
            }).on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.error('❌ Port ' + PORT + ' is already in use. Trying port ' + (PORT + 1) + '...');
                    app.listen(PORT + 1, '0.0.0.0', () => {
                        console.log('🌐 Web interface running on port ' + (PORT + 1));
                        console.log('📱 Web URL: http://localhost:' + (PORT + 1));
                    });
                } else {
                    console.error('❌ Express server error:', err);
                }
            });
            
            await bot.launch();
            console.log('🤖 Bot Started Successfully!');
            console.log('👤 Bot only responding to user ID: ' + CHAT_ID);
            console.log('🕐 Timezone: IST (UTC+5:30) - Translation Layer Active');
            console.log('⏰ Current IST: ' + getCurrentISTDisplay().dateTime);
            console.log('📊 Currently tracking ' + activeSchedules.size + ' tasks');
            
            setTimeout(async () => {
                try {
                    const todayStartUTC = getTodayStartUTC();
                    const tomorrowStartUTC = getTomorrowStartUTC();
                    
                    const tasks = await db.collection('tasks').find({
                        nextOccurrence: {
                            $gte: todayStartUTC,
                            $lt: tomorrowStartUTC
                        }
                    }).toArray();
                    
                    const nowIST = getCurrentISTDisplay();
                    
                    if (tasks.length > 0) {
                        await bot.telegram.sendMessage(CHAT_ID,
                            '📋 <b>𝗧𝗢𝗗𝗔𝗬\'S 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦</b>\n' +
                            '━━━━━━━━━━━━━━━━━━━━\n' +
                            '📊 Total: ' + tasks.length + ' task' + (tasks.length !== 1 ? 's' : '') + '\n' +
                            '📅 ' + nowIST.displayDate + ' IST\n' +
                            '━━━━━━━━━━━━━━━━━━━━',
                            { parse_mode: 'HTML' }
                        );
                    }
                } catch (error) {
                    console.error('Error sending initial summary:', error.message);
                }
            }, 5000);
        } else {
            console.error('❌ Failed to connect to database. Retrying in 5 seconds...');
            setTimeout(start, 5000);
        }
    } catch (error) {
        console.error('❌ Failed to start bot:', error.message);
        setTimeout(start, 10000);
    }
}

// ==========================================
// 🛑 GRACEFUL SHUTDOWN
// ==========================================
function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log('🛑 ' + signal + ' received, stopping bot gracefully...');
    
    for (const [taskId, schedule] of activeSchedules) {
        try {
            if (schedule.startJob) schedule.startJob.cancel();
            if (schedule.interval) clearInterval(schedule.interval);
        } catch (e) {
            console.error('Error cleaning up task ' + taskId + ':', e.message);
        }
    }
    
    if (hourlySummaryJob) {
        try { hourlySummaryJob.cancel(); } catch (e) {}
    }
    
    if (autoCompleteJob) {
        try { autoCompleteJob.cancel(); } catch (e) {}
    }
    
    bot.stop(signal).catch(e => console.error('Error stopping bot:', e.message));
    
    if (client) {
        client.close().catch(e => console.error('Error closing MongoDB:', e.message));
    }
    
    console.log('👋 Bot stopped gracefully');
    process.exit(0);
}

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
    console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

start();
