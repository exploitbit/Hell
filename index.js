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

let globalSettings = { notifications: true, alerts: true, reminders: true };

// ==========================================
// 🕐 TIMEZONE & UTILITIES
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
        dayName: istDate.toLocaleDateString('en-US', { weekday: 'long' })
    };
}

function formatLegacyIST(utcDate, type) {
    if (!utcDate || isNaN(new Date(utcDate).getTime())) return '';
    const istDate = new Date(new Date(utcDate).getTime() + IST_OFFSET_MS);
    if (type === 'date') return `${String(istDate.getUTCDate()).padStart(2, '0')}-${String(istDate.getUTCMonth() + 1).padStart(2, '0')}-${istDate.getUTCFullYear()}`;
    if (type === 'time') return `${String(istDate.getUTCHours()).padStart(2, '0')}:${String(istDate.getUTCMinutes()).padStart(2, '0')}`;
    return '';
}

function f12(timeStr) {
    if (!timeStr) return '';
    let [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function generateId(type = 'task') { return type.charAt(0) + Math.random().toString(36).substring(2, 10); }

// ==========================================
// 🔄 TASK LIFECYCLE MANAGEMENT
// ==========================================
async function cleanExpiredTasks() {
    const istDateObj = getCurrentISTDisplay();
    const startOfDayUTC = istToUTC(istDateObj.date, "00:00");
    
    const expiredTasks = await db.collection('tasks').find({ status: 'pending', endDate: { $lt: startOfDayUTC } }).toArray();
    if (expiredTasks.length > 0) {
        for (let t of expiredTasks) {
            await db.collection('deleted_tasks').insertOne({ ...t, deletedAt: new Date(), deleteReason: 'expired' });
            await db.collection('tasks').deleteOne({ taskId: t.taskId });
            cancelTaskSchedule(t.taskId);
        }
    }
}

async function getActiveTasksForToday() {
    await cleanExpiredTasks();
    const istDateObj = getCurrentISTDisplay();
    const currentDayOfWeek = new Date(Date.now() + IST_OFFSET_MS).getUTCDay(); 
    const startOfDayUTC = istToUTC(istDateObj.date, "00:00");
    const endOfDayUTC = istToUTC(istDateObj.date, "23:59");

    const dStatus = await db.collection('daily_status').findOne({ _id: 'current' });
    let currentType = null;
    if (dStatus && dStatus.dateStr === istDateObj.displayDate) currentType = dStatus.type;

    if (!currentType) return { pendingTasks: [], completedTasks: [], todayHistory: [], totalToday: 0 };

    const pending = await db.collection('tasks').find({
        status: 'pending',
        selectedDays: currentDayOfWeek,
        dayTypes: currentType, 
        startDate: { $lte: endOfDayUTC },
        endDate: { $gte: startOfDayUTC }
    }).sort({ orderIndex: 1 }).toArray();

    const todayHistory = await db.collection('history').find({ completedDateStr: istDateObj.displayDate }).toArray();
    const completedTaskIds = todayHistory.map(h => h.taskId);

    const toShow = pending.filter(t => !completedTaskIds.includes(t.taskId));
    const completed = pending.filter(t => completedTaskIds.includes(t.taskId));

    let finalCompleted = [...completed];
    const historicalIds = todayHistory.filter(h => !completedTaskIds.includes(h.taskId)).map(h => h.taskId);
    if(historicalIds.length > 0) {
        const delTasks = await db.collection('deleted_tasks').find({ taskId: { $in: historicalIds } }).toArray();
        finalCompleted.push(...delTasks);
    }

    return { pendingTasks: toShow, completedTasks: finalCompleted, todayHistory, totalToday: toShow.length + finalCompleted.length };
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
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
        
        :root {
            --bg-light: #f5f7fa; --card-bg-light: #ffffff; --text-primary-light: #1e293b; --text-secondary-light: #475569;
            --border-light: #e2e8f0; --accent-light: #2563eb; --accent-soft-light: #dbeafe; --success-light: #059669;
            --warning-light: #d97706; --danger-light: #dc2626; --hover-light: #f1f5f9; --progress-bg-light: #e2e8f0;
            --bg-dark: #0f172a; --card-bg-dark: #1e293b; --text-primary-dark: #f8fafc; --text-secondary-dark: #cbd5e1;
            --border-dark: #334155; --accent-dark: #60a5fa; --accent-soft-dark: #1e3a5f; --success-dark: #34d399;
            --warning-dark: #fbbf24; --danger-dark: #f87171; --hover-dark: #2d3b4f; --progress-bg-dark: #334155;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif; }
        
        body { 
            background: var(--bg-light); color: var(--text-primary-light); transition: background-color 0.2s ease, color 0.2s ease; 
            min-height: 100vh; font-size: 13px; line-height: 1.4; 
            -webkit-touch-callout: none; -webkit-user-select: none; -khtml-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none;
        }
        
        input, textarea, [contenteditable] { -webkit-user-select: auto; user-select: auto; }

        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) { background: var(--bg-dark); color: var(--text-primary-dark); } }
        body[data-theme="dark"] { background: var(--bg-dark); color: var(--text-primary-dark); }
        
        .hidden { display: none; }
        .flex-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .w-100 { width: 100%; }

        .empty-state { text-align: center; padding: 40px 20px; color: var(--text-secondary-light); background: var(--hover-light); border-radius: 20px; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .empty-state { background: var(--hover-dark); color: var(--text-secondary-dark); } }
        body[data-theme="dark"] .empty-state { background: var(--hover-dark); color: var(--text-secondary-dark); }
        body[data-theme="light"] .empty-state { background: var(--hover-light); color: var(--text-secondary-light); }

        .app-header { background: var(--card-bg-light); border-bottom: 1px solid var(--border-light); padding: 10px 12px; position: sticky; top: 0; z-index: 100; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .app-header { background: var(--card-bg-dark); border-bottom: 1px solid var(--border-dark); } }
        body[data-theme="dark"] .app-header { background: var(--card-bg-dark); border-color: var(--border-dark); color: var(--text-primary-dark); }
        body[data-theme="light"] .app-header { background: var(--card-bg-light); border-color: var(--border-light); color: var(--text-primary-light); }

        .header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .header-title { font-weight: 600; font-size: 1.1rem; text-transform: capitalize; }
        .header-icon { font-size: 1.2rem; cursor: pointer; color: var(--accent-light); padding: 4px; }
        
        .nav-links { display: flex; gap: 2px; background: var(--hover-light); padding: 3px; border-radius: 100px; width: 100%; justify-content: space-between;}
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .nav-links { background: var(--hover-dark); } }
        body[data-theme="dark"] .nav-links { background: var(--hover-dark); color: var(--text-secondary-dark); }
        body[data-theme="light"] .nav-links { background: var(--hover-light); color: var(--text-secondary-light); }
        
        .nav-btn { display: flex; align-items: center; justify-content: center; gap: 4px; padding: 6px 10px; border-radius: 100px; border: none; background: transparent; color: var(--text-secondary-light); font-size: 0.9rem; cursor: pointer; transition: all 0.2s ease; flex: 1; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .nav-btn { color: var(--text-secondary-dark); } }
        .nav-btn.active { background: var(--card-bg-light); color: var(--accent-light); box-shadow: 0 2px 6px rgba(0,0,0,0.05); font-weight: 600;}
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .nav-btn.active { background: var(--card-bg-dark); color: var(--accent-dark); box-shadow: 0 2px 6px rgba(0,0,0,0.2); } }
        body[data-theme="dark"] .nav-btn.active { background: var(--card-bg-dark); color: var(--accent-dark); box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
        body[data-theme="light"] .nav-btn.active { background: var(--card-bg-light); color: var(--accent-light); box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
        
        .main-content { max-width: 1400px; margin: 16px auto; padding: 0 16px; padding-bottom: 80px; }

        .action-btn { width: 28px; height: 28px; border-radius: 8px; border: none; background: var(--hover-light); color: var(--text-secondary-light); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; font-size: 0.9rem; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .action-btn { background: var(--hover-dark); color: var(--text-secondary-dark); } }
        body[data-theme="dark"] .action-btn { background: var(--hover-dark); color: var(--text-secondary-dark); }
        body[data-theme="light"] .action-btn { background: var(--hover-light); color: var(--text-secondary-light); }
        .action-btn:hover { background: var(--accent-light); color: white; }
        .action-btn.delete:hover { background: var(--danger-light); }

        .btn { padding: 10px 18px; border-radius: 100px; border: none; font-size: 0.95rem; font-weight: 500; cursor: pointer; transition: all 0.2s ease; font-family: 'Poppins', sans-serif;}
        .btn-primary { background: var(--accent-light); color: white; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .btn-primary { background: var(--accent-dark); } }
        .btn-secondary { background: var(--hover-light); color: var(--text-secondary-light); }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .btn-secondary { background: var(--hover-dark); color: var(--text-secondary-dark); } }
        body[data-theme="dark"] .btn-secondary { background: var(--hover-dark); color: var(--text-secondary-dark); }
        body[data-theme="light"] .btn-secondary { background: var(--hover-light); color: var(--text-secondary-light); }

        .fab { position: fixed; bottom: 24px; right: 24px; width: 50px; height: 50px; border-radius: 25px; background: var(--accent-light); color: white; border: none; font-size: 1.4rem; cursor: pointer; box-shadow: 0 4px 12px rgba(37,99,235,0.3); transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; z-index: 99; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .fab { background: var(--accent-dark); box-shadow: 0 4px 12px rgba(96,165,250,0.3); } }
        .fab:hover { transform: scale(1.05); }

        .badge { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 100px; font-size: 0.75rem; gap: 4px; background: var(--hover-light); color: var(--text-secondary-light); width: fit-content; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .badge { background: var(--hover-dark); color: var(--text-secondary-dark); } }
        body[data-theme="dark"] .badge { background: var(--hover-dark); color: var(--text-secondary-dark); }
        body[data-theme="light"] .badge { background: var(--hover-light); color: var(--text-secondary-light); }

        /* DAY BOXES CSS */
        .day-box { display: inline-flex; align-items: center; justify-content: center; padding: 2px 6px; border-radius: 4px; background: var(--hover-light); border: 1px solid var(--border-light); font-size: 0.7rem; font-weight: 600; color: var(--text-secondary-light); margin-right: 2px; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .day-box { background: var(--hover-dark); border-color: var(--border-dark); color: var(--text-secondary-dark); } }
        body[data-theme="dark"] .day-box { background: var(--hover-dark); border-color: var(--border-dark); color: var(--text-secondary-dark); }

        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: var(--card-bg-light); border: 1px solid var(--border-light); border-radius: 20px; padding: 20px; width: 90%; max-width: 500px; max-height: 85vh; overflow-y: auto; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .modal-content { background: var(--card-bg-dark); border: 1px solid var(--border-dark); } }
        body[data-theme="dark"] .modal-content { background: var(--card-bg-dark); border-color: var(--border-dark); color: var(--text-primary-dark); }
        body[data-theme="light"] .modal-content { background: var(--card-bg-light); border-color: var(--border-light); color: var(--text-primary-light); }

        #settingsAppModal { align-items: flex-start !important; justify-content: flex-end !important; background: transparent !important; backdrop-filter: none !important; padding-top: 55px; padding-right: 12px; }
        #settingsAppModal .modal-content { width: 170px; max-width: 170px; margin: 0; padding: 12px; border-radius: 16px; box-shadow: 0 8px 25px rgba(0,0,0,0.15); transform-origin: top right; animation: dropdownPop 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
        body[data-theme="dark"] #settingsAppModal .modal-content { box-shadow: 0 8px 25px rgba(0,0,0,0.5); }
        @keyframes dropdownPop { from { opacity: 0; transform: scale(0.9) translateY(-10px); } to { opacity: 1; transform: scale(1) translateY(0); } }

        .form-control { width: 100%; padding: 10px; border-radius: 10px; border: 1px solid var(--border-light); background: var(--bg-light); color: var(--text-primary-light); font-size: 0.95rem; font-family: 'Poppins', sans-serif; resize: vertical; }
        textarea.form-control { min-height: 80px; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .form-control { background: var(--bg-dark); border: 1px solid var(--border-dark); color: var(--text-primary-dark); } }
        body[data-theme="dark"] .form-control { background: var(--card-bg-dark); border-color: var(--border-dark); color: var(--text-primary-dark); }
        body[data-theme="light"] .form-control { background: var(--card-bg-light); border-color: var(--border-light); color: var(--text-primary-light); }

        .settings-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-light); }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .settings-row { border-color: var(--border-dark); } }
        .settings-row:last-child { border-bottom: none; }
        .settings-label { font-size: 0.95rem; font-weight: 500; }

        .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .4s; border-radius: 34px; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .slider { background-color: var(--border-dark); } }
        .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider { background-color: var(--success-light); }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) input:checked + .slider { background-color: var(--success-dark); } }
        input:checked + .slider:before { transform: translateX(20px); }

        .toast-container { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; flex-direction: column; align-items: center; pointer-events: none; }
        .toast { background: #000; color: #fff; padding: 10px 20px; border-radius: 30px; margin-bottom: 10px; display: flex; align-items: center; gap: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); font-size: 0.95rem; font-weight: 500; transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55); opacity: 0; transform: translateY(-20px) scale(0.9); }
        .toast.show { opacity: 1; transform: translateY(0) scale(1); }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .toast { background: #222; } }

        /* Day Selector CSS - MONDAY START */
        .day-selector { display: flex; justify-content: space-between; margin-bottom: 12px; }
        .day-circle { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--hover-light); color: var(--text-secondary-light); cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: 0.2s; border: 1px solid var(--border-light); }
        .day-circle.selected { background: var(--accent-light); color: white; border-color: var(--accent-light); }
        body[data-theme="dark"] .day-circle { background: var(--card-bg-dark); border-color: var(--border-dark); color: var(--text-secondary-dark); }
        body[data-theme="dark"] .day-circle.selected { background: var(--accent-dark); color: var(--bg-dark); border-color: var(--accent-dark); }

        /* TASKS CSS */
        .tasks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
        .task-card { background: var(--card-bg-light); border: 1px solid var(--border-light); border-radius: 16px; padding: 14px; transition: all 0.2s ease; word-wrap: break-word; overflow-wrap: break-word; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .task-card { background: var(--card-bg-dark); border: 1px solid var(--border-dark); } }
        body[data-theme="dark"] .task-card { background: var(--card-bg-dark); border-color: var(--border-dark); color: var(--text-primary-dark); }
        body[data-theme="light"] .task-card { background: var(--card-bg-light); border-color: var(--border-light); color: var(--text-primary-light); }

        .task-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; width: 100%; }
        .task-title-section { flex: 1; min-width: 0; }
        .task-title-container { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .task-title-container i { font-size: 0.85rem; color: var(--accent-light); }
        
        .task-title { font-size: 1.1rem; font-weight: 600; color: var(--text-primary-light); margin-bottom: 4px; line-height: 1.3; word-break: break-word; cursor: pointer; display: inline-block; user-select: none; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .task-title { color: var(--text-primary-dark); } }
        body[data-theme="dark"] .task-title { color: var(--text-primary-dark); }
        body[data-theme="light"] .task-title { color: var(--text-primary-light); }
        
        .task-description-container { margin: 8px 0 4px 0; width: 100%; }
        .task-description { font-size: 0.85rem; color: var(--text-secondary-light); padding: 6px 8px; background: var(--hover-light); border-radius: 10px; border-left: 3px solid var(--accent-light); word-break: break-word; white-space: pre-wrap; width: 100%; box-sizing: border-box; line-height: 1.4; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .task-description { color: var(--text-secondary-dark); background: var(--hover-dark); } }
        body[data-theme="dark"] .task-description { background: var(--hover-dark); color: var(--text-secondary-dark); }
        body[data-theme="light"] .task-description { background: var(--hover-light); color: var(--text-secondary-light); }

        .task-time-row { display: flex; justify-content: space-between; align-items: center; width: 100%; margin: 8px 0 4px 0; }
        .date-chip, .time-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: var(--hover-light); border-radius: 100px; font-size: 0.8rem; color: var(--text-secondary-light); width: fit-content; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .date-chip, body:not([data-theme="light"]) .time-chip { background: var(--hover-dark); color: var(--text-secondary-dark); } }
        body[data-theme="dark"] .date-chip, body[data-theme="dark"] .time-chip { background: var(--hover-dark); color: var(--text-secondary-dark); }
        body[data-theme="light"] .date-chip, body[data-theme="light"] .time-chip { background: var(--hover-light); color: var(--text-secondary-light); }

        .task-actions-wrapper { display: flex; gap: 4px; flex-shrink: 0; }
        .normal-btns, .priority-btns { display: flex; gap: 4px; }
        .priority-btns { display: none; }
        .priority-mode .normal-btns { display: none; }
        .priority-mode .priority-btns { display: flex; }

        .progress-ring-small { position: relative; width: 34px; height: 34px; }
        .progress-ring-circle-small { transition: stroke-dashoffset 0.5s; transform: rotate(-90deg); transform-origin: 50% 50%; }
        .progress-text-small { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 0.7rem; color: var(--accent-light); font-weight: 600; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .progress-text-small { color: var(--accent-dark); } }
        
        .subtasks-container { margin-top: 10px; border-top: 1px solid var(--border-light); padding-top: 10px; width: 100%; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .subtasks-container { border-top-color: var(--border-dark); } }
        
        .subtask-item { display: flex; flex-direction: column; background: var(--hover-light); border-radius: 10px; margin-bottom: 6px; padding: 6px; width: 100%; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .subtask-item { background: var(--hover-dark); } }
        body[data-theme="dark"] .subtask-item { background: var(--hover-dark); color: var(--text-secondary-dark); }
        body[data-theme="light"] .subtask-item { background: var(--hover-light); color: var(--text-secondary-light); }

        .subtask-main-row { display: flex; align-items: flex-start; gap: 8px; width: 100%; }
        .subtask-checkbox { width: 20px; height: 20px; border-radius: 6px; border: 2px solid var(--accent-light); background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; color: white; font-size: 0.75rem; flex-shrink: 0; margin-top: 1px; }
        .subtask-checkbox.completed { background: var(--success-light); border-color: var(--success-light); }
        .subtask-details { flex: 1; min-width: 0; }
        
        .subtask-title { color: var(--text-primary-light); margin-bottom: 2px; font-size: 0.95rem; font-weight: 500; word-break: break-word; cursor: pointer; user-select: none; }
        .subtask-title.completed { text-decoration: line-through; color: var(--text-secondary-light); opacity: 0.7; }
        body[data-theme="dark"] .subtask-title { color: var(--text-primary-dark); }
        body[data-theme="light"] .subtask-title { color: var(--text-primary-light); }

        .subtask-btn { width: 26px; height: 26px; border-radius: 6px; border: none; background: var(--card-bg-light); color: var(--text-secondary-light); cursor: pointer; transition: all 0.2s ease; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .subtask-btn { background: var(--card-bg-dark); color: var(--text-secondary-dark); } }
        body[data-theme="dark"] .subtask-btn { background: var(--card-bg-dark); border-color: var(--border-dark); color: var(--text-primary-dark); }
        body[data-theme="light"] .subtask-btn { background: var(--card-bg-light); border-color: var(--border-light); color: var(--text-primary-light); }
        .subtask-btn:hover { background: var(--accent-light); color: white; }
        .subtask-btn.delete:hover { background: var(--danger-light); }
        
        .subtask-description-container { margin-top: 6px; margin-left: 28px; width: calc(100% - 28px); }
        .subtask-description { font-size: 0.8rem; color: var(--text-secondary-light); padding: 4px 6px; background: var(--card-bg-light); border-radius: 8px; border-left: 2px solid var(--accent-light); word-break: break-word; white-space: pre-wrap; width: 100%; box-sizing: border-box; line-height: 1.4; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .subtask-description { background: var(--card-bg-dark); color: var(--text-secondary-dark); } }

        /* GROW CSS */
        .grow-panel { max-width: 600px; margin: 0 auto 12px; background: var(--card-bg-light); border: 1px solid var(--border-light); border-radius: 16px; overflow: hidden; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-panel { background: var(--card-bg-dark); border-color: var(--border-dark); } }
        body[data-theme="dark"] .grow-panel { background: var(--card-bg-dark); border-color: var(--border-dark); color: var(--text-primary-dark); }
        body[data-theme="light"] .grow-panel { background: var(--card-bg-light); border-color: var(--border-light); color: var(--text-primary-light); }

        .grow-panel summary { display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; font-size: 1.05rem; font-weight: 600; cursor: pointer; background: transparent; list-style: none; }
        .grow-panel summary::-webkit-details-marker { display: none; }
        .grow-panel > summary > i { transition: transform 0.3s; color: var(--text-secondary-light); }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-panel > summary > i { color: var(--text-secondary-dark); } }
        .grow-panel[open] > summary > i { transform: rotate(180deg); }
        .grow-panel-body { padding: 14px; border-top: 1px solid var(--border-light); overflow: hidden;}
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-panel-body { border-top-color: var(--border-dark); } }
        
        .grow-graph-container { width: 100%; aspect-ratio: 1; display: flex; flex-direction: column; }
        .grow-graph { display: flex; justify-content: space-around; align-items: flex-end; flex: 1; margin-top: 10px;}
        .grow-bar { display: flex; flex-direction: column; align-items: center; width: 10%; max-width: 35px; height: 100%; }
        .grow-bar-track { width: 100%; height: 90%; border-radius: 6px; position: relative; display: flex; align-items: flex-end; background: var(--hover-light); overflow: hidden; border: 1px solid var(--border-light); }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-bar-track { background: var(--hover-dark); border-color: var(--border-dark); } }
        body[data-theme="dark"] .grow-bar-track { background: var(--hover-dark); color: var(--text-secondary-dark); }
        body[data-theme="light"] .grow-bar-track { background: var(--hover-light); color: var(--text-secondary-light); }

        .grow-bar-fill { width: 100%; border-radius: 4px; transition: height 0.6s ease; }
        .grow-bar-label { position: absolute; top: 0; bottom: 0; left: 0; right: 0; writing-mode: vertical-rl; transform: rotate(180deg); display: flex; align-items: center; justify-content: center; text-align: center; color: var(--text-primary-light); font-size: 0.8rem; font-weight: 500; pointer-events: none; line-height: 1.5; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-bar-label { color: var(--text-primary-dark); } }
        .grow-bar-pct { font-size: 0.75rem; font-weight: 500; margin-bottom: 5px; color: var(--text-primary-light); }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-bar-pct { color: var(--text-primary-dark); } }
        
        .grow-month-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .grow-month-nav h2 { font-size: 1.05rem; font-weight: 600; background: var(--hover-light); padding: 5px 14px; border-radius: 30px; border: 1px solid var(--border-light); }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-month-nav h2 { background: var(--hover-dark); border-color: var(--border-dark); } }
        
        .grow-calendar { width: 100%; aspect-ratio: 1 / 1; display: flex; flex-direction: column; overflow: hidden; position: relative;}
        .grow-grid { flex: 1; width: 100%; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: auto repeat(6, minmax(0, 1fr)); gap: 4px; transition: transform 0.25s ease-out, opacity 0.25s ease-out; }
        .grow-weekday { display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary-light); text-transform: uppercase; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-weekday { color: var(--text-secondary-dark); } }
        .grow-day { display: flex; align-items: center; justify-content: center; border-radius: 10px; position: relative; width: 100%; height: 100%; }
        .grow-day.empty { pointer-events: none; background: transparent; }
        .grow-day:hover:not(.empty) { background: var(--hover-light); cursor: pointer; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-day:hover:not(.empty) { background: var(--hover-dark); } }
        body[data-theme="dark"] .grow-day:hover:not(.empty) { background: var(--hover-dark); color: var(--text-secondary-dark); }
        body[data-theme="light"] .grow-day:hover:not(.empty) { background: var(--hover-light); color: var(--text-secondary-light); }
        
        .grow-circle { width: 100%; max-width: 32px; aspect-ratio: 1 / 1; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.95rem; font-weight: 500; transition: transform 0.2s; margin: auto; }
        .grow-day:hover .grow-circle { transform: scale(1.1); }
        .grow-circle.has-data { color: #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.2); text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
        .grow-circle.today { box-shadow: 0 0 0 2px var(--card-bg-light), 0 0 0 4px var(--success-light); color: var(--success-light); }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-circle.today { box-shadow: 0 0 0 2px var(--card-bg-dark), 0 0 0 4px var(--success-dark); color: var(--success-dark); } }
        .grow-circle.today.has-data { color: #fff; }

        .grow-bubble { position: absolute; background: var(--card-bg-light); border: 1px solid var(--border-light); border-radius: 12px; padding: 10px; z-index: 1000; min-width: 160px; max-width: 200px; pointer-events: none; box-shadow: 0 10px 25px rgba(0,0,0,0.25); display: none; opacity: 0; transition: opacity 0.2s; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-bubble { background: var(--card-bg-dark); border-color: var(--border-dark); } }
        body[data-theme="dark"] .grow-bubble { background: var(--card-bg-dark); border-color: var(--border-dark); color: var(--text-primary-dark); }
        body[data-theme="light"] .grow-bubble { background: var(--card-bg-light); border-color: var(--border-light); color: var(--text-primary-light); }
        .grow-bubble.show { opacity: 1; }
        
        .grow-tail { position: absolute; width: 12px; height: 12px; background: var(--card-bg-light); border: 1px solid var(--border-light); transform: rotate(45deg); z-index: -1; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-tail { background: var(--card-bg-dark); border-color: var(--border-dark); } }
        .grow-tail.placement-top { border-top: none; border-left: none; bottom: -6px; top: auto; }
        .grow-tail.placement-bottom { border-bottom: none; border-right: none; top: -6px; bottom: auto; }

        .grow-bubble-date { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary-light); margin-bottom: 5px; border-bottom: 1px solid var(--border-light); padding-bottom: 5px; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-bubble-date { color: var(--text-secondary-dark); border-color: var(--border-dark); } }
        .grow-bubble-item { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 0.85rem; font-weight: 500;}
        
        .grow-card { background: var(--card-bg-light); border: 1px solid var(--border-light); border-radius: 12px; padding: 12px; margin-bottom: 10px; transition: 0.2s;}
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-card { background: var(--card-bg-dark); border-color: var(--border-dark); } }
        body[data-theme="dark"] .grow-card { background: var(--card-bg-dark); border-color: var(--border-dark); color: var(--text-primary-dark); }
        body[data-theme="light"] .grow-card { background: var(--card-bg-light); border-color: var(--border-light); color: var(--text-primary-light); }

        .grow-card summary { display: flex; justify-content: space-between; align-items: center; cursor: pointer; list-style: none; outline: none; padding: 4px 0;}
        .grow-card summary::-webkit-details-marker { display: none; }
        .grow-title-section { display: flex; align-items: center; gap: 8px; flex: 1;}
        .grow-title-section i { font-size: 0.85rem; color: var(--text-secondary-light); transition: transform 0.2s; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-title-section i { color: var(--text-secondary-dark); } }
        details[open] .grow-title-section i { transform: rotate(90deg); }
        .grow-title { font-size: 0.95rem; font-weight: 600; color: var(--text-primary-light); }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-title { color: var(--text-primary-dark); } }
        
        .grow-progress-bar-container { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border-light); width: 100%; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-progress-bar-container { border-top-color: var(--border-dark); } }
        .grow-progress-bar { width: 100%; height: 8px; background: var(--hover-light); border-radius: 10px; overflow: hidden; margin: 6px 0; border: 1px solid var(--border-light); }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-progress-bar { background: var(--hover-dark); border-color: var(--border-dark); } }
        .grow-progress-fill { height: 100%; border-radius: 10px; transition: width 0.5s ease-out; }
        .grow-progress-stats { display: flex; justify-content: space-between; gap: 8px; font-size: 0.8rem; color: var(--text-secondary-light); align-items: center;}
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-progress-stats { color: var(--text-secondary-dark); } }
        .grow-progress-stats strong { color: var(--text-primary-light); font-weight: 600; font-size: 0.85rem; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-progress-stats strong { color: var(--text-primary-dark); } }
        .grow-progress-stats span:last-child { white-space: nowrap; flex-shrink: 0; text-align: right; }
        .grow-progress-stats span:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        .grow-palette { display: flex; justify-content: space-between; margin-top: 6px; }
        .grow-swatch { width: 24px; height: 24px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: 0.1s;}
        .grow-swatch.selected { transform: scale(1.15); box-shadow: 0 0 0 2px var(--card-bg-light), 0 0 0 4px var(--text-primary-light); }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-swatch.selected { box-shadow: 0 0 0 2px var(--card-bg-dark), 0 0 0 4px var(--text-primary-dark); } }
        .grow-swatch.hidden { display: none; }
        
        .grow-checkbox { display: flex; align-items: center; gap: 8px; margin: 10px 0; font-size: 0.9rem; font-weight: 500; cursor: pointer; color: var(--text-primary-light);}
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-checkbox { color: var(--text-primary-dark); } }
        .grow-hidden-fields { display: none; background: var(--hover-light); padding: 12px; border-radius: 10px; margin-bottom: 12px; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .grow-hidden-fields { background: var(--hover-dark); } }
        
        #qGrowLabel, #qGrowDesc .task-description { color: var(--text-primary-light) !important; }
        body[data-theme="dark"] #qGrowLabel, body[data-theme="dark"] #qGrowDesc .task-description { color: var(--text-primary-dark) !important; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) #qGrowLabel, body:not([data-theme="light"]) #qGrowDesc .task-description { color: var(--text-primary-dark) !important; } }

        /* HISTORY CSS */
        .history-header { display: flex; justify-content: center; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; width: 100%; }
        .month-selector { display: flex; align-items: center; gap: 12px; }
        .month-btn { padding: 6px 12px; border-radius: 100px; border: 1px solid var(--border-light); background: var(--card-bg-light); color: var(--text-primary-light); font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; gap: 4px; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .month-btn { background: var(--card-bg-dark); border-color: var(--border-dark); color: var(--text-primary-dark); } }
        
        .history-date-card { margin-bottom: 12px; background: var(--card-bg-light); border: 1px solid var(--border-light); border-radius: 16px; padding: 14px; transition: all 0.2s ease; word-wrap: break-word; overflow-wrap: break-word; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .history-date-card { background: var(--card-bg-dark); border: 1px solid var(--border-dark); } }
        body[data-theme="dark"] .history-date-card { background: var(--card-bg-dark); border-color: var(--border-dark); color: var(--text-primary-dark); }
        body[data-theme="light"] .history-date-card { background: var(--card-bg-light); border-color: var(--border-light); color: var(--text-primary-light); }

        .history-details summary { display: flex; align-items: center; width: 100%; cursor: pointer; list-style: none; font-size: 1rem; font-weight: 600; }
        .history-details summary::-webkit-details-marker { display: none; }
        .history-details summary i.fa-calendar-alt { margin-right: 8px; color: var(--accent-light); }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .history-details summary i.fa-calendar-alt { color: var(--accent-dark); } }
        
        .history-tasks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-top: 12px; }
        .history-task-card { background: var(--hover-light); border-radius: 12px; padding: 12px; border-left: 3px solid var(--success-light); word-break: break-word; width: 100%; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .history-task-card { background: var(--hover-dark); } }
        body[data-theme="dark"] .history-task-card { background: var(--hover-dark); color: var(--text-secondary-dark); }
        body[data-theme="light"] .history-task-card { background: var(--hover-light); color: var(--text-secondary-light); }

        .history-task-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
        .history-task-title { font-size: 0.95rem; font-weight: 600; color: var(--text-primary-light); cursor: pointer; word-break: break-word; flex: 1; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .history-task-title { color: var(--text-primary-dark); } }
        body[data-theme="dark"] .history-task-title { color: var(--text-primary-dark); }
        body[data-theme="light"] .history-task-title { color: var(--text-primary-light); }

        .history-task-time { font-size: 0.8rem; color: var(--text-secondary-light); flex-shrink: 0; margin-left: auto; padding-left: 8px; }
        .history-description-container { margin: 6px 0 8px 0; width: 100%; }
        .history-description { font-size: 0.85rem; color: var(--text-secondary-light); padding: 4px 6px; background: var(--card-bg-light); border-radius: 8px; border-left: 2px solid var(--success-light); word-break: break-word; white-space: pre-wrap; line-height: 1.4; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .history-description { background: var(--card-bg-dark); color: var(--text-secondary-dark); } }
        
        .history-subtask { padding: 6px 6px 6px 20px; border-left: 2px solid var(--border-light); margin: 6px 0; width: 100%; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .history-subtask { border-left-color: var(--border-dark); } }

        /* NOTES CSS */
        .note-card { margin-bottom: 12px; background: var(--card-bg-light); border: 1px solid var(--border-light); border-radius: 16px; padding: 14px; transition: all 0.2s ease; word-wrap: break-word; overflow-wrap: break-word; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .note-card { background: var(--card-bg-dark); border: 1px solid var(--border-dark); } }
        body[data-theme="dark"] .note-card { background: var(--card-bg-dark); border-color: var(--border-dark); color: var(--text-primary-dark); }
        body[data-theme="light"] .note-card { background: var(--card-bg-light); border-color: var(--border-light); color: var(--text-primary-light); }

        .note-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; width: 100%; }
        .note-title { font-size: 1.1rem; font-weight: 600; color: var(--text-primary-light); word-break: break-word; flex: 1; cursor: pointer; user-select: none; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .note-title { color: var(--text-primary-dark); } }
        body[data-theme="dark"] .note-title { color: var(--text-primary-dark); }
        body[data-theme="light"] .note-title { color: var(--text-primary-light); }

        .note-content-container { margin: 4px 0 8px 0; width: 100%; }
        .note-content { font-size: 0.85rem; color: var(--text-secondary-light); padding: 6px 8px; background: var(--hover-light); border-radius: 10px; border-left: 3px solid var(--accent-light); word-break: break-word; white-space: pre-wrap; width: 100%; box-sizing: border-box; line-height: 1.4; }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .note-content { color: var(--text-secondary-dark); background: var(--hover-dark); } }
        
        .note-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-light); font-size: 0.75rem; color: var(--text-secondary-light); }
        @media (prefers-color-scheme: dark) { body:not([data-theme="light"]) .note-meta { border-top-color: var(--border-dark); color: var(--text-secondary-dark); } }

    </style>
</head>
<body>
    <div class="toast-container" id="toastContainer"></div>

    <div class="app-header">
        <div class="header-top">
            <div class="header-icon" onclick="switchPage('tasks')"><i class="fas fa-tasks"></i></div>
            <div class="header-title" id="pageTitleDisplay"><%= currentPage %></div>
            <div class="header-icon" onclick="openSettingsModal()"><i class="fas fa-cog"></i></div>
        </div>
        <div class="nav-links">
            <button class="nav-btn <%= currentPage === 'tasks' ? 'active' : '' %>" onclick="switchPage('tasks')">
                <i class="fas fa-list-check"></i> <span>Tasks</span>
            </button>
            <button class="nav-btn <%= currentPage === 'grow' ? 'active' : '' %>" onclick="switchPage('grow')">
                <i class="fas fa-seedling"></i> <span>Grow</span>
            </button>
            <button class="nav-btn <%= currentPage === 'notes' ? 'active' : '' %>" onclick="switchPage('notes')">
                <i class="fas fa-note-sticky"></i> <span>Notes</span>
            </button>
            <button class="nav-btn <%= currentPage === 'history' ? 'active' : '' %>" onclick="switchPage('history')">
                <i class="fas fa-history"></i> <span>History</span>
            </button>
        </div>
    </div>

    <button class="fab" id="fabButton" onclick="openAddModal()" title="Add New"><i class="fas fa-plus"></i></button>
    <div class="main-content" id="mainContent"></div>
    
    <div class="grow-bubble" id="growBubble"><div id="growBubbleContent"></div><div id="growTail"></div></div>

    <div class="modal" id="dailyStatusModal" style="background: var(--bg-light); z-index: 9999;">
        <div class="modal-content" style="text-align: center; margin-top: 15vh; border:none; box-shadow:none; background:transparent;">
            <i class="fas fa-calendar-day" style="font-size: 3rem; color: var(--accent-light); margin-bottom:16px;"></i>
            <h2 style="font-size:1.5rem; margin-bottom:8px;">Good Morning!</h2>
            <p style="color:var(--text-secondary-light); margin-bottom:24px; font-size:1rem;">Is today a Working Day or a Holiday?</p>
            <div style="display:flex; gap:16px; flex-wrap:wrap;">
                <button class="btn btn-primary" style="flex:1; min-width:140px; padding:14px; font-size:1rem;" onclick="setDailyStatus('WD')">💼 Working Day</button>
                <button class="btn btn-secondary" style="flex:1; min-width:140px; padding:14px; font-size:1rem; background:var(--danger-light); color:white;" onclick="setDailyStatus('HOL')">🏖️ Holiday</button>
            </div>
        </div>
    </div>

    <div class="modal" id="settingsAppModal">
        <div class="modal-content">
            <div class="settings-row">
                <span class="settings-label">Dark Theme</span>
                <label class="switch"><input type="checkbox" id="themeToggle" onchange="toggleTheme()"><span class="slider"></span></label>
            </div>
            <div class="settings-row">
                <span class="settings-label">Notifications</span>
                <label class="switch"><input type="checkbox" id="notifToggle" onchange="updateSettings()"><span class="slider"></span></label>
            </div>
            <div class="settings-row">
                <span class="settings-label">Alerts</span>
                <label class="switch"><input type="checkbox" id="alertsToggle" onchange="updateSettings()"><span class="slider"></span></label>
            </div>
            <div class="settings-row">
                <span class="settings-label">Reminders</span>
                <label class="switch"><input type="checkbox" id="remindersToggle" onchange="updateSettings()"><span class="slider"></span></label>
            </div>
        </div>
    </div>

    <div class="modal" id="addTaskModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;">Create New Task</h2>
                <button class="action-btn" onclick="closeModal('addTaskModal')">&times;</button>
            </div>
            <form id="addTaskForm" onsubmit="submitTaskForm(event)">
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.95rem; font-weight: 500;">Title *</label>
                    <input type="text" class="form-control" name="title" required maxlength="100">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.95rem; font-weight: 500;">Description</label>
                    <textarea class="form-control" name="description" rows="3" placeholder="Enter description"></textarea>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.95rem; font-weight: 500;">Day Type *</label>
                    <div style="display:flex; gap:16px; margin-top:4px;">
                        <label><input type="checkbox" name="dayTypes" value="WD" checked> Working Day</label>
                        <label><input type="checkbox" name="dayTypes" value="HOL"> Holiday</label>
                    </div>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.95rem; font-weight: 500;">Select Days *</label>
                    <div class="day-selector" id="addDaySelector">
                        <div class="day-circle" data-day="1">MO</div>
                        <div class="day-circle" data-day="2">TU</div>
                        <div class="day-circle" data-day="3">WE</div>
                        <div class="day-circle" data-day="4">TH</div>
                        <div class="day-circle" data-day="5">FR</div>
                        <div class="day-circle" data-day="6">SA</div>
                        <div class="day-circle" data-day="0">SU</div>
                    </div>
                    <input type="hidden" name="selectedDays" id="addSelectedDays" required>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div><label style="font-size: 0.95rem; font-weight: 500;">Start Time</label><input type="time" class="form-control" name="startTime" id="startTime" required></div>
                    <div><label style="font-size: 0.95rem; font-weight: 500;">End Time</label><input type="time" class="form-control" name="endTime" id="endTime" required></div>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.95rem; font-weight: 500;">Weeks to Repeat</label>
                    <input type="number" class="form-control" name="repeatWeeks" id="addRepeatWeeks" value="1" min="1" max="52" required>
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
                    <label style="font-size: 0.95rem; font-weight: 500;">Title *</label>
                    <input type="text" class="form-control" name="title" id="editTitle" required maxlength="100">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.95rem; font-weight: 500;">Description</label>
                    <textarea class="form-control" name="description" id="editDescription" rows="3"></textarea>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.95rem; font-weight: 500;">Day Type *</label>
                    <div style="display:flex; gap:16px; margin-top:4px;">
                        <label><input type="checkbox" name="dayTypes" value="WD"> Working Day</label>
                        <label><input type="checkbox" name="dayTypes" value="HOL"> Holiday</label>
                    </div>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.95rem; font-weight: 500;">Select Days *</label>
                    <div class="day-selector" id="editDaySelector">
                        <div class="day-circle" data-day="1">MO</div>
                        <div class="day-circle" data-day="2">TU</div>
                        <div class="day-circle" data-day="3">WE</div>
                        <div class="day-circle" data-day="4">TH</div>
                        <div class="day-circle" data-day="5">FR</div>
                        <div class="day-circle" data-day="6">SA</div>
                        <div class="day-circle" data-day="0">SU</div>
                    </div>
                    <input type="hidden" name="selectedDays" id="editSelectedDays" required>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div><label style="font-size: 0.95rem; font-weight: 500;">Start Time</label><input type="time" class="form-control" name="startTime" id="editStartTime" required></div>
                    <div><label style="font-size: 0.95rem; font-weight: 500;">End Time</label><input type="time" class="form-control" name="endTime" id="editEndTime" required></div>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.95rem; font-weight: 500;">Weeks to Repeat</label>
                    <input type="number" class="form-control" name="repeatWeeks" id="editRepeatWeeks" min="1" max="52" required>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('editTaskModal')">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Update</button>
                </div>
            </form>
        </div>
    </div>

    <div class="modal" id="addGrowModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;">Add New Growth</h2>
                <button class="action-btn" onclick="closeModal('addGrowModal')">&times;</button>
            </div>
            <form id="addGrowForm">
                <div class="form-group"><label style="font-weight: 500;">Title</label><input type="text" class="form-control" id="addGrowTitle" required placeholder="E.g. Daily Walk"></div>
                <div class="form-group" style="margin-top: 12px;"><label style="font-weight: 500;">Description (Optional)</label><textarea class="form-control" id="addGrowDesc" rows="2" placeholder="Brief details..."></textarea></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px; margin-top: 12px;">
                    <div class="form-group"><label style="font-weight: 500;">Start Date</label><input type="date" class="form-control" id="addGrowStart" required></div>
                    <div class="form-group"><label style="font-weight: 500;">Duration (Days)</label><input type="number" class="form-control" id="addGrowDays" value="365" required></div>
                </div>
                <div class="form-group" style="margin-top: 12px;"><label style="font-weight: 500;">Color Tag</label><div class="grow-palette" id="addGrowPalette"></div><input type="hidden" id="addGrowColor" required></div>
                
                <label class="grow-checkbox"><input type="checkbox" id="addGrowHasData" onchange="toggleGrowDataFields('add')"> Track Quantitative Data?</label>
                
                <div class="grow-hidden-fields" id="addGrowDataFields">
                    <div class="form-group"><label style="font-weight: 500;">Question Prompt</label><input type="text" class="form-control" id="addGrowQuestion" placeholder="E.g. Weight lost?"></div>
                    <div class="form-group" style="margin-top: 12px;"><label style="font-weight: 500;">Data Type</label><select class="form-control" id="addGrowType"><option value="integer">Whole Number</option><option value="float">Decimal (Float)</option></select></div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px; margin-top: 12px;">
                        <div class="form-group"><label style="font-weight: 500;">Start Value</label><input type="number" step="0.01" class="form-control" id="addGrowMin" value="0"></div>
                        <div class="form-group"><label style="font-weight: 500;">Target Value</label><input type="number" step="0.01" class="form-control" id="addGrowMax" value="100"></div>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 16px;">Create Tracker</button>
            </form>
        </div>
    </div>

    <div class="modal" id="editGrowModal">
        <div class="modal-content">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 1.2rem;">Edit Growth</h2>
                <button class="action-btn" onclick="closeModal('editGrowModal')">&times;</button>
            </div>
            <form id="editGrowForm">
                <input type="hidden" id="editGrowId">
                <div class="form-group"><label style="font-weight: 500;">Title</label><input type="text" class="form-control" id="editGrowTitle" required></div>
                <div class="form-group" style="margin-top: 12px;"><label style="font-weight: 500;">Description (Optional)</label><textarea class="form-control" id="editGrowDesc" rows="2"></textarea></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px; margin-top: 12px;">
                    <div class="form-group"><label style="font-weight: 500;">Start Date</label><input type="date" class="form-control" id="editGrowStart" required></div>
                    <div class="form-group"><label style="font-weight: 500;">Duration (Days)</label><input type="number" class="form-control" id="editGrowDays" required></div>
                </div>
                <div class="form-group" style="margin-top: 12px;"><label style="font-weight: 500;">Color Tag (Auto-Swaps)</label><div class="grow-palette" id="editGrowPalette"></div><input type="hidden" id="editGrowColor" required></div>
                
                <label class="grow-checkbox"><input type="checkbox" id="editGrowHasData" onchange="toggleGrowDataFields('edit')"> Track Quantitative Data?</label>
                
                <div class="grow-hidden-fields" id="editGrowDataFields">
                    <div class="form-group"><label style="font-weight: 500;">Question Prompt</label><input type="text" class="form-control" id="editGrowQuestion"></div>
                    <div class="form-group" style="margin-top: 12px;"><label style="font-weight: 500;">Data Type</label><select class="form-control" id="editGrowType"><option value="integer">Whole Number</option><option value="float">Decimal (Float)</option></select></div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px; margin-top: 12px;">
                        <div class="form-group"><label style="font-weight: 500;">Start Value</label><input type="number" step="0.01" class="form-control" id="editGrowMin"></div>
                        <div class="form-group"><label style="font-weight: 500;">Target Value</label><input type="number" step="0.01" class="form-control" id="editGrowMax"></div>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 16px;">Update Tracker</button>
            </form>
        </div>
    </div>

    <div class="modal" id="logGrowModal">
        <div class="modal-content">
            <div id="logGrowListView">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h2 id="logGrowTitle" style="font-size: 1.2rem;">Log Progress</h2>
                    <button class="action-btn" onclick="closeModal('logGrowModal')">&times;</button>
                </div>
                <div id="dailyGrowList"></div>
            </div>
            <div id="logGrowQuestionView" style="display: none;">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h2 id="qGrowTitle" style="font-size: 1.2rem;"></h2>
                    <button class="action-btn" onclick="showGrowLogList()"><i class="fas fa-arrow-left"></i></button>
                </div>
                <div id="qGrowDesc"></div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label id="qGrowLabel"></label>
                    <div id="qGrowInput" style="margin-top: 10px;"></div>
                </div>
                <button class="btn btn-primary" id="saveGrowLogBtn" style="width: 100%;">Save Value</button>
            </div>
        </div>
    </div>

    <div class="modal" id="addSubtaskModal"><div class="modal-content"><div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;"><h2 style="font-size: 1.2rem;">Add Subtask</h2><button class="action-btn" onclick="closeModal('addSubtaskModal')">&times;</button></div><form id="addSubtaskForm" onsubmit="submitSubtaskForm(event)"><input type="hidden" name="taskId" id="subtaskTaskId"><div class="form-group" style="margin-bottom: 12px;"><label style="font-size: 0.95rem; font-weight: 500;">Title *</label><input type="text" class="form-control" name="title" required maxlength="100"></div><div class="form-group" style="margin-bottom: 12px;"><label style="font-size: 0.95rem; font-weight: 500;">Description</label><textarea class="form-control" name="description" rows="3"></textarea></div><div style="display: flex; gap: 12px; margin-top: 16px;"><button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('addSubtaskModal')">Cancel</button><button type="submit" class="btn btn-primary" style="flex: 1;">Add</button></div></form></div></div>
    <div class="modal" id="editSubtaskModal"><div class="modal-content"><div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;"><h2 style="font-size: 1.2rem;">Edit Subtask</h2><button class="action-btn" onclick="closeModal('editSubtaskModal')">&times;</button></div><form id="editSubtaskForm" onsubmit="submitEditSubtaskForm(event)"><input type="hidden" name="taskId" id="editSubtaskTaskId"><input type="hidden" name="subtaskId" id="editSubtaskId"><div class="form-group" style="margin-bottom: 12px;"><label style="font-size: 0.95rem; font-weight: 500;">Title *</label><input type="text" class="form-control" name="title" id="editSubtaskTitle" required maxlength="100"></div><div class="form-group" style="margin-bottom: 12px;"><label style="font-size: 0.95rem; font-weight: 500;">Description</label><textarea class="form-control" name="description" id="editSubtaskDescription" rows="3"></textarea></div><div style="display: flex; gap: 12px; margin-top: 16px;"><button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('editSubtaskModal')">Cancel</button><button type="submit" class="btn btn-primary" style="flex: 1;">Update</button></div></form></div></div>
    <div class="modal" id="addNoteModal"><div class="modal-content"><div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;"><h2 style="font-size: 1.2rem;">Create Note</h2><button class="action-btn" onclick="closeModal('addNoteModal')">&times;</button></div><form id="addNoteForm" onsubmit="submitNoteForm(event)"><div class="form-group" style="margin-bottom: 12px;"><label style="font-size: 0.95rem; font-weight: 500;">Title *</label><input type="text" class="form-control" name="title" required maxlength="200"></div><div class="form-group" style="margin-bottom: 12px;"><label style="font-size: 0.95rem; font-weight: 500;">Content</label><textarea class="form-control" name="description" rows="4"></textarea></div><div style="display: flex; gap: 12px; margin-top: 16px;"><button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('addNoteModal')">Cancel</button><button type="submit" class="btn btn-primary" style="flex: 1;">Save</button></div></form></div></div>
    <div class="modal" id="editNoteModal"><div class="modal-content"><div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;"><h2 style="font-size: 1.2rem;">Edit Note</h2><button class="action-btn" onclick="closeModal('editNoteModal')">&times;</button></div><form id="editNoteForm" onsubmit="submitEditNoteForm(event)"><input type="hidden" name="noteId" id="editNoteId"><div class="form-group" style="margin-bottom: 12px;"><label style="font-size: 0.95rem; font-weight: 500;">Title *</label><input type="text" class="form-control" name="title" id="editNoteTitle" required maxlength="200"></div><div class="form-group" style="margin-bottom: 12px;"><label style="font-size: 0.95rem; font-weight: 500;">Content</label><textarea class="form-control" name="description" id="editNoteDescription" rows="4"></textarea></div><div style="display: flex; gap: 12px; margin-top: 16px;"><button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('editNoteModal')">Cancel</button><button type="submit" class="btn btn-primary" style="flex: 1;">Update</button></div></form></div></div>

    <script>
        const tg = window.Telegram.WebApp;
        tg.ready(); tg.expand();

        let globalAppVars = { notifications: <%= globalSettings.notifications %>, alerts: <%= globalSettings.alerts %>, reminders: <%= globalSettings.reminders %> };

        function f12(tStr) {
            if (!tStr) return '';
            let [h, m] = tStr.split(':').map(Number);
            let ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            return h + ':' + String(m).padStart(2, '0') + ' ' + ampm;
        }

        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast';
            if (type === 'error') toast.style.background = '#dc2626';
            else if (type === 'warning') toast.style.background = '#d97706';
            let icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
            toast.innerHTML = '<i class="fas ' + icon + '"></i><span>' + message + '</span>';
            container.appendChild(toast);
            
            void toast.offsetWidth; 
            toast.classList.add('show');
            
            setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3000);
        }

        let currentPage = '<%= currentPage || "tasks" %>';
        let tasksData = <%- JSON.stringify(tasks || []) %>;
        let notesData = <%- JSON.stringify(notes || []) %>;
        let historyData = <%- JSON.stringify(groupedHistory || {}) %>;
        let growTrackerData = <%- JSON.stringify(growData || {items: [], progress: {}}) %>;
        let dailyStatus = <%- JSON.stringify(dailyStatus || null) %>;
        
        let currentMonth = new Date().getMonth();
        let currentYear = new Date().getFullYear();

        let growToday = "", growMonth = 0, growYear = 2026, growLogContext = null;
        
        const growColors = ["#ec4899","#a855f7","#38bdf8","#ef4444","#f97316","#16a34a","#84cc16","#3b82f6", "#eab308", "#14b8a6"];
        
        function getDayBoxes(daysArr) {
            if (!daysArr || daysArr.length === 0) return '';
            const map = {1:'MO', 2:'TU', 3:'WE', 4:'TH', 5:'FR', 6:'SA', 0:'SU'};
            const sortOrder = {1:1, 2:2, 3:3, 4:4, 5:5, 6:6, 0:7};
            
            const sortedDays = [...daysArr].sort((a, b) => sortOrder[a] - sortOrder[b]);
            return '<div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:4px;">' + 
                   sortedDays.map(d => '<span class="day-box">' + map[d] + '</span>').join('') + 
                   '</div>';
        }

        function setupDaySelector(selectorId, inputId) {
            const container = document.getElementById(selectorId);
            const input = document.getElementById(inputId);
            container.addEventListener('click', function(e) {
                if (e.target.classList.contains('day-circle')) {
                    e.target.classList.toggle('selected');
                    updateSelectedDays(selectorId, inputId);
                }
            });
        }

        function updateSelectedDays(selectorId, inputId) {
            const container = document.getElementById(selectorId);
            const input = document.getElementById(inputId);
            const selected = [];
            container.querySelectorAll('.day-circle.selected').forEach(el => {
                selected.push(parseInt(el.getAttribute('data-day')));
            });
            input.value = JSON.stringify(selected);
        }

        function getGrowIST() {
            const d = new Date();
            const ist = new Date(d.getTime() + 5.5*3600000);
            return {
                date: ist.getUTCFullYear()+"-"+String(ist.getUTCMonth()+1).padStart(2,"0")+"-"+String(ist.getUTCDate()).padStart(2,"0"),
                month: ist.getUTCMonth(),
                year: ist.getUTCFullYear(),
                time: String(ist.getUTCHours()).padStart(2,"0")+":"+String(ist.getUTCMinutes()).padStart(2,"0")
            };
        }

        function switchPage(page) {
            currentPage = page;
            updateActiveNav(); 
            document.getElementById('pageTitleDisplay').innerText = page;
            renderPage(); 
            
            fetch('/api/page/' + page).then(async res => {
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            }).then(data => {
                if(data.tasks) tasksData = data.tasks;
                if(data.notes) notesData = data.notes;
                if(data.groupedHistory) historyData = data.groupedHistory;
                if(data.growData) growTrackerData = data.growData;
                renderPage(); 
            }).catch(err => { console.error(err); });
        }

        function updateActiveNav() {
            document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(btn => {
                if (btn.innerText.toLowerCase().includes(currentPage)) btn.classList.add('active');
            });
        }

        function setDailyStatus(type) {
            fetch('/api/daily_status', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({type}) })
            .then(res => {
                if(res.ok) {
                    document.getElementById('dailyStatusModal').style.display = 'none';
                    window.location.reload();
                }
            });
        }

        function renderPage() {
            const content = document.getElementById('mainContent');
            const fabButton = document.getElementById('fabButton');
            
            if (currentPage === 'tasks') { fabButton.style.display = 'flex'; content.innerHTML = renderTasksPage(); } 
            else if (currentPage === 'grow') { 
                fabButton.style.display = 'flex'; 
                content.innerHTML = renderGrowPageStaticShell();
                renderGrowAll();
                setupGrowSwipeGestures();
            }
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

        // ==========================================
        // 🌱 GROW FRONTEND LOGIC 
        // ==========================================
        function renderGrowPageStaticShell() {
            return '<details class="grow-panel"><summary><span>Progress Overview</span><i class="fas fa-chevron-down"></i></summary>' +
                '<div class="grow-panel-body" id="growGraphs"></div></details>' +
                '<details class="grow-panel" open><summary><span>Activity Calendar</span><i class="fas fa-chevron-down"></i></summary>' +
                '<div class="grow-panel-body"><div class="grow-month-nav"><button class="action-btn" onclick="animateGrowMonth(-1)"><i class="fas fa-chevron-left"></i></button><h2 id="growMonthYear">...</h2><button class="action-btn" onclick="animateGrowMonth(1)"><i class="fas fa-chevron-right"></i></button></div>' +
                '<div class="grow-calendar" id="growCalendarContainer"><div class="grow-grid" id="growCalendar"></div></div></div></details>' +
                '<details class="grow-panel" open><summary><span>Manage Growth</span><i class="fas fa-chevron-down"></i></summary>' +
                '<div class="grow-panel-body" id="growList"></div></details>';
        }

        function renderGrowAll() {
            renderGrowCalendar(); renderGrowGraphs(); renderGrowList();
            const fabBtn = document.getElementById("fabButton");
            if(growTrackerData.items && growTrackerData.items.length >= 10) { fabBtn.style.opacity = "0.5"; } else { fabBtn.style.opacity = "1"; }
            const cal = document.getElementById("growCalendar");
            if(cal) {
                cal.onclick = function(e) {
                    const cell = e.target.closest(".grow-day");
                    if(cell && !cell.classList.contains("empty")) {
                        const d = cell.dataset.date;
                        const active = (growTrackerData.items || []).filter(g => isGrowActive(g, d));
                        const dayData = (growTrackerData.progress || {})[d] || {};
                        const allDone = active.length && active.every(g => dayData[g.id] !== undefined);
                        if(d === growToday && !allDone) { openLogGrowModal(d); } else { showGrowBubble(cell, d); }
                    }
                };
            }
        }

        function setupGrowSwipeGestures() {
            let touchstartX = 0; let touchendX = 0;
            const container = document.getElementById('growCalendarContainer');
            if(container) {
                container.addEventListener('touchstart', e => { touchstartX = e.changedTouches[0].screenX; }, {passive: true});
                container.addEventListener('touchend', e => {
                    touchendX = e.changedTouches[0].screenX;
                    if (touchendX < touchstartX - 50) animateGrowMonth(1); 
                    if (touchendX > touchstartX + 50) animateGrowMonth(-1);
                }, {passive: true});
            }
        }

        function animateGrowMonth(dir) {
            const grid = document.getElementById("growCalendar");
            if(!grid) return;
            grid.style.transform = dir > 0 ? 'translateX(-30px)' : 'translateX(30px)';
            grid.style.opacity = '0';
            setTimeout(() => {
                changeGrowMonth(dir); 
                grid.style.transition = 'none';
                grid.style.transform = dir > 0 ? 'translateX(30px)' : 'translateX(-30px)';
                setTimeout(() => {
                    grid.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';
                    grid.style.transform = 'translateX(0)';
                    grid.style.opacity = '1';
                }, 30);
            }, 250);
        }
        
        function isGrowActive(item, d) {
            const start = new Date(item.startDate + "T00:00:00");
            const target = new Date(d + "T00:00:00");
            const days = Math.floor((target - start) / 86400000);
            return days >= 0 && days < item.endCount;
        }

        function renderGrowList() {
            const container = document.getElementById("growList");
            if(!growTrackerData.items || !growTrackerData.items.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-seedling" style="font-size:2.5rem;margin-bottom:10px;"></i><br>No items tracked. Click + to add.</div>'; return; }
            let html = "";
            const now = new Date(growToday + "T00:00:00");
            
            for(let i=0; i<growTrackerData.items.length; i++) {
                const item = growTrackerData.items[i];
                const start = new Date(item.startDate + "T00:00:00");
                let passed = Math.floor((now - start) / 86400000);
                if(passed < 0) passed = 0;
                let left = item.endCount - passed;
                if(left < 0) left = 0;
                
                html += '<div class="grow-card"><details><summary><div class="grow-title-section"><i class="fas fa-chevron-right"></i><span class="grow-title">' + escapeHtml(item.title) + '</span></div><div class="task-actions-wrapper"><button class="action-btn" onclick="event.preventDefault(); openEditGrowModal(\\'' + item.id + '\\')" title="Edit"><i class="fas fa-pencil"></i></button><button class="action-btn delete" onclick="event.preventDefault(); deleteGrowTracker(\\'' + item.id + '\\')" title="Delete"><i class="fas fa-trash"></i></button></div></summary>';
                if(item.description) { html += '<div class="task-description-container"><div class="task-description" style="border-left-color:var(--accent-light)">' + escapeHtml(item.description) + '</div></div>'; }
                
                let timePct = item.endCount > 0 ? (passed / item.endCount) * 100 : 0;
                timePct = Math.max(0, Math.min(100, timePct));
                
                html += '<div class="grow-progress-bar-container"><div class="grow-progress-stats"><span><strong>Time Elapsed</strong></span><span>' + passed + ' / ' + item.endCount + ' Days</span></div><div class="grow-progress-bar"><div class="grow-progress-fill" style="width:' + timePct + '%; background:' + item.color + 'cc"></div></div><div class="grow-progress-stats"><span>Started: ' + item.startDate + '</span><span>' + Math.round(timePct) + '% Complete</span></div></div>';

                if(item.hasData && item.type !== "boolean") {
                    html += '<hr style="border: none; border-top: 1px solid var(--border-light); margin: 12px 0 8px 0;">';
                    let latestValue = item.start !== undefined ? item.start : 0;
                    let sortedDates = Object.keys(growTrackerData.progress || {}).sort();
                    for(let d of sortedDates) { if(growTrackerData.progress[d][item.id] !== undefined && typeof growTrackerData.progress[d][item.id] === 'number') { latestValue = growTrackerData.progress[d][item.id]; } }
                    if(item.start !== undefined && item.end !== undefined) {
                        const min = Math.min(item.start, item.end); const max = Math.max(item.start, item.end); const range = max - min;
                        let pct = range === 0 ? 0 : ((latestValue - min) / range) * 100;
                        pct = Math.max(0, Math.min(100, pct));
                        html += '<div class="grow-progress-bar-container" style="border-top: none; padding-top: 0; margin-top: 0;"><div class="grow-progress-stats"><span><strong>' + escapeHtml(item.question) + '</strong></span><span>Current: ' + latestValue + '</span></div><div class="grow-progress-bar"><div class="grow-progress-fill" style="width:' + pct + '%; background:' + item.color + '"></div></div><div class="grow-progress-stats"><span>Start: ' + item.start + '</span><span>Goal: ' + item.end + '</span></div></div>';
                    }
                }
                html += '</details></div>';
            }
            container.innerHTML = html;
        }

        function renderGrowGraphs() {
            const container = document.getElementById("growGraphs");
            if(!growTrackerData.items || !growTrackerData.items.length) { container.innerHTML = "<div class='empty-state'>No data available.</div>"; return; }
            let html = "<div class='grow-graph-container'><div class='grow-graph'>";
            const now = new Date(growToday + "T00:00:00");
            
            for(let i=0; i<growTrackerData.items.length; i++) {
                const item = growTrackerData.items[i];
                const start = new Date(item.startDate + "T00:00:00");
                let totalDaysSoFar = Math.floor((now - start) / 86400000) + 1;
                if(totalDaysSoFar < 1) totalDaysSoFar = 0;
                if(totalDaysSoFar > item.endCount) totalDaysSoFar = item.endCount;
                
                let completed = 0;
                const prog = growTrackerData.progress || {};
                for(let d in prog) {
                    const dObj = new Date(d + "T00:00:00");
                    if(dObj >= start && dObj <= now && prog[d] && prog[d][item.id] !== undefined) completed++;
                }
                let pct = totalDaysSoFar ? Math.min(100, completed/totalDaysSoFar*100) : 0;
                html += '<div class="grow-bar"><div class="grow-bar-pct">' + Math.round(pct) + '%</div><div class="grow-bar-track" style="background:' + item.color + '40"><div class="grow-bar-fill" style="height:' + pct + '%; background:' + item.color + '"></div><div class="grow-bar-label">' + escapeHtml(item.title) + '</div></div></div>';
            }
            html += "</div></div>"; container.innerHTML = html;
        }

        function changeGrowMonth(dir) { growMonth += dir; if(growMonth > 11) { growMonth = 0; growYear++; } else if(growMonth < 0) { growMonth = 11; growYear--; } renderGrowCalendar(); }

        function renderGrowCalendar() {
            const grid = document.getElementById("growCalendar");
            if(!grid) return;
            const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
            document.getElementById("growMonthYear").innerText = months[growMonth] + " " + growYear;
            
            const firstDay = new Date(growYear, growMonth, 1).getDay(); // 0(Su) to 6(Sa)
            let adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;   // Now 0(Mo) to 6(Su)

            const daysInMonth = new Date(growYear, growMonth+1, 0).getDate();
            
            let html = "";
            ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(d => html += '<div class="grow-weekday">' + d + '</div>');
            
            let currentDay = 1;
            const prog = growTrackerData.progress || {};
            
            for(let i = 0; i < 42; i++) {
                if(i < adjustedFirstDay || currentDay > daysInMonth) { html += '<div class="grow-day empty"></div>'; } 
                else {
                    const date = growYear + "-" + String(growMonth+1).padStart(2,"0") + "-" + String(currentDay).padStart(2,"0");
                    const isToday = date === growToday;
                    const dayData = prog[date] || {};
                    const activeColors = [];
                    
                    for(let j=0; j<(growTrackerData.items||[]).length; j++) {
                        const g = growTrackerData.items[j];
                        if(isGrowActive(g, date) && dayData[g.id] !== undefined) activeColors.push(g.color);
                    }
                    
                    let bg = "transparent", cls = "";
                    if(activeColors.length === 1) { bg = activeColors[0]; cls = "has-data"; } 
                    else if(activeColors.length > 1) {
                        let stops = "";
                        for(let j=0; j<activeColors.length; j++) { stops += activeColors[j] + " " + (j*100/activeColors.length) + "% " + ((j+1)*100/activeColors.length) + "%"; if(j < activeColors.length-1) stops += ", "; }
                        bg = "conic-gradient(" + stops + ")"; cls = "has-data";
                    }
                    html += '<div class="grow-day" data-date="' + date + '"><div class="grow-circle ' + (isToday?'today ':'') + cls + '" style="background:' + bg + '">' + currentDay + '</div></div>';
                    currentDay++;
                }
            }
            grid.innerHTML = html;
        }

        function hideGrowBubble() { const bubble = document.getElementById("growBubble"); if(bubble && bubble.classList.contains("show")) { bubble.classList.remove("show"); setTimeout(() => bubble.style.display = "none", 200); } }

        function showGrowBubble(cell, date) {
            const bubble = document.getElementById("growBubble"); const content = document.getElementById("growBubbleContent"); const tail = document.getElementById("growTail");
            const active = (growTrackerData.items || []).filter(g => isGrowActive(g, date)); const dayData = (growTrackerData.progress || {})[date] || {}; const d = new Date(date+"T00:00:00");
            
            let html = '<div class="grow-bubble-date">' + d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) + '</div>';
            if(!active.length) html += "<div style='text-align:center;font-size:0.8rem;color:var(--text-secondary-light);'>No tasks active.</div>";
            else { for(let i=0; i<active.length; i++) { const g = active[i]; const isDone = dayData[g.id] !== undefined; html += '<div class="grow-bubble-item" style="color:' + g.color + '"><span>' + escapeHtml(g.title) + '</span><i class="fas ' + (isDone?'fa-check-circle':'fa-circle') + '"></i></div>'; } }
            content.innerHTML = html;
            bubble.style.display = "block"; bubble.style.opacity = "0";
            
            const bRect = bubble.getBoundingClientRect(); const cRect = cell.getBoundingClientRect();
            let top = cRect.top + window.scrollY - bRect.height - 12; 
            let left = cRect.left + window.scrollX + (cRect.width / 2) - (bRect.width / 2);
            let placement = 'top';
            if(cRect.top - bRect.height < 20) { top = cRect.bottom + window.scrollY + 12; placement = 'bottom'; }
            if(left < 10) left = 10;
            if(left + bRect.width > window.innerWidth - 10) left = window.innerWidth - bRect.width - 10;
            bubble.style.top = top + "px"; bubble.style.left = left + "px";
            
            let tailLeft = (cRect.left + window.scrollX + cRect.width / 2) - left;
            tailLeft = Math.max(12, Math.min(bRect.width - 24, tailLeft));
            tail.className = "grow-tail placement-" + placement; tail.style.left = (tailLeft - 6) + "px";
            setTimeout(() => { bubble.style.opacity = "1"; bubble.classList.add("show"); }, 10);
        }

        function initAddGrowPalette() {
            const container = document.getElementById("addGrowPalette"); const input = document.getElementById("addGrowColor");
            const used = (growTrackerData.items || []).map(g => g.color); let html = "", first = null;
            for(let i=0; i<growColors.length; i++) { const c = growColors[i]; const isUsed = used.includes(c); if(!isUsed && !first) first = c; html += '<div class="grow-swatch ' + (isUsed?'hidden':'') + '" style="background:' + c + '" data-color="' + c + '"></div>'; }
            container.innerHTML = html;
            if(first) { input.value = first; const firstSwatch = container.querySelector('[data-color="' + first + '"]'); if(firstSwatch) firstSwatch.classList.add("selected"); }
            container.onclick = function(e) { if(e.target.classList.contains("grow-swatch") && !e.target.classList.contains("hidden")) { Array.from(container.children).forEach(el => el.classList.remove("selected")); e.target.classList.add("selected"); input.value = e.target.dataset.color; } };
        }

        function initEditGrowPalette(current) {
            const container = document.getElementById("editGrowPalette"); const input = document.getElementById("editGrowColor"); let html = "";
            for(let i=0; i<growColors.length; i++) { const c = growColors[i]; html += '<div class="grow-swatch ' + (c===current?'selected':'') + '" style="background:' + c + '" data-color="' + c + '"></div>'; }
            container.innerHTML = html; input.value = current;
            container.onclick = function(e) { if(e.target.classList.contains("grow-swatch")) { Array.from(container.children).forEach(el => el.classList.remove("selected")); e.target.classList.add("selected"); input.value = e.target.dataset.color; } };
        }

        window.toggleGrowDataFields = function(mode) { const prefix = mode === "add" ? "addGrow" : "editGrow"; const checked = document.getElementById(prefix+"HasData").checked; document.getElementById(prefix+"DataFields").style.display = checked ? "block" : "none"; };
        window.openAddGrowModal = function() { if (growTrackerData.items && growTrackerData.items.length >= 10) { showToast("Failed", "error"); return; } document.getElementById("addGrowStart").value = growToday; document.getElementById("addGrowType").value = "integer"; initAddGrowPalette(); openModal("addGrowModal"); };
        window.openEditGrowModal = function(id) {
            const item = growTrackerData.items.find(g => g.id === id); if(!item) return;
            document.getElementById("editGrowId").value = item.id; document.getElementById("editGrowTitle").value = item.title; document.getElementById("editGrowDesc").value = item.description || ""; document.getElementById("editGrowStart").value = item.startDate; document.getElementById("editGrowDays").value = item.endCount; document.getElementById("editGrowHasData").checked = item.hasData || false;
            toggleGrowDataFields("edit");
            if(item.hasData) { document.getElementById("editGrowQuestion").value = item.question || ""; document.getElementById("editGrowType").value = item.type || "float"; document.getElementById("editGrowMin").value = item.start !== undefined ? item.start : 0; document.getElementById("editGrowMax").value = item.end !== undefined ? item.end : 100; }
            initEditGrowPalette(item.color); openModal("editGrowModal");
        };

        document.getElementById("addGrowForm").addEventListener("submit", function(e) {
            e.preventDefault(); 
            const payload = { title: document.getElementById("addGrowTitle").value.trim(), description: document.getElementById("addGrowDesc").value.trim(), startDate: document.getElementById("addGrowStart").value, endCount: parseInt(document.getElementById("addGrowDays").value), color: document.getElementById("addGrowColor").value, hasData: document.getElementById("addGrowHasData").checked, type: document.getElementById("addGrowType").value, question: document.getElementById("addGrowQuestion").value.trim(), start: document.getElementById("addGrowMin").value, end: document.getElementById("addGrowMax").value };
            fetch("/api/grow", { method:"POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload) }).then(res => { if(res.ok) { closeModal("addGrowModal"); document.getElementById("addGrowForm").reset(); showToast("Success"); switchPage("grow"); } else throw new Error("Failed"); }).catch(e => { showToast("Failed", "error"); });
        });

        document.getElementById("editGrowForm").addEventListener("submit", function(e) {
            e.preventDefault(); const id = document.getElementById("editGrowId").value;
            const payload = { id: id, title: document.getElementById("editGrowTitle").value.trim(), description: document.getElementById("editGrowDesc").value.trim(), startDate: document.getElementById("editGrowStart").value, endCount: parseInt(document.getElementById("editGrowDays").value), color: document.getElementById("editGrowColor").value, hasData: document.getElementById("editGrowHasData").checked, type: document.getElementById("editGrowType").value, question: document.getElementById("editGrowQuestion").value.trim(), start: document.getElementById("editGrowMin").value, end: document.getElementById("editGrowMax").value };
            fetch("/api/grow/" + id + "/update", { method:"POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload) }).then(res => { if(res.ok) { closeModal("editGrowModal"); showToast("Success"); switchPage("grow"); } else throw new Error("Failed"); }).catch(e => { showToast("Failed", "error"); });
        });

        window.deleteGrowTracker = function(id) { if(confirm("Delete this tracker and all its logs?")) { fetch("/api/grow/" + id + "/delete", {method:"POST"}).then(res => { if(res.ok) { showToast("Success"); switchPage("grow"); } else throw new Error("Failed"); }).catch(e => { showToast("Failed", "error"); }); } };
        window.openLogGrowModal = function(date) {
            const active = growTrackerData.items.filter(g => isGrowActive(g, date)); const d = new Date(date+"T00:00:00");
            document.getElementById("logGrowTitle").innerText = d.toLocaleDateString("en-US",{month:"long",day:"numeric"}); let html = ""; const dayData = (growTrackerData.progress || {})[date] || {};
            for(let i=0; i<active.length; i++) { const item = active[i]; const done = dayData[item.id] !== undefined; html += '<div class="grow-card"><details style="display:contents;"><summary style="outline:none; list-style:none;"><div class="grow-title-section"><i class="fas fa-chevron-right"></i><span class="grow-title">' + escapeHtml(item.title) + '</span></div><div class="task-actions-wrapper"><button class="action-btn" onclick="event.preventDefault(); handleGrowLogClick(\\'' + item.id + '\\',\\'' + date + '\\')" style="background:' + (done?'var(--hover-light)':'var(--accent-light)') + ';color:' + (done?'var(--text-secondary-light)':'white') + '; width:32px; height:32px;" ' + (done?'disabled':'') + '><i class="fas fa-check"></i></button></div></summary>'; if(item.description) html += '<div class="task-description-container"><div class="task-description" style="border-left-color:var(--accent-light)">' + escapeHtml(item.description) + '</div></div>'; html += '</details></div>'; }
            document.getElementById("dailyGrowList").innerHTML = html; showGrowLogList(); openModal("logGrowModal");
        };

        window.handleGrowLogClick = function(id, date) { const item = growTrackerData.items.find(g => g.id === id); if(item.hasData) { openLogGrowQuestion(item, date); } else { saveGrowLog(item, date, true); } };
        function openLogGrowQuestion(item, date) {
            growLogContext = {item, date}; document.getElementById("qGrowTitle").innerText = item.title;
            const displayQuestion = (item.question && item.question.trim() !== "") ? item.question : "Please enter your data for today:";
            document.getElementById("qGrowDesc").innerHTML = '<div class="task-description" style="border-left-color:var(--accent-light); margin-bottom:16px; font-size: 1rem; font-weight: 500; color: var(--text-primary-light);">' + escapeHtml(displayQuestion) + '</div>'; document.getElementById("qGrowLabel").innerText = ""; 
            const wrapper = document.getElementById("qGrowInput"); const step = item.type === "float" ? "0.01" : "1"; wrapper.innerHTML = '<input type="number" step="' + step + '" class="form-control" id="logGrowValue" placeholder="Enter numerical value" autofocus>';
            document.getElementById("logGrowListView").style.display = "none"; document.getElementById("logGrowQuestionView").style.display = "block"; setTimeout(() => { const input = document.getElementById("logGrowValue"); if(input) input.focus(); }, 100);
        }

        function saveGrowLog(item, date, val) { const payload = { itemId: item.id, dateStr: date, value: val }; fetch("/api/grow/log", { method:"POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload) }).then(res => { if(res.ok) { showToast("Success"); switchPage("grow"); closeModal("logGrowModal"); } else throw new Error("Failed"); }).catch (err => { showToast("Failed", "error"); }); }
        document.getElementById("saveGrowLogBtn").addEventListener("click", function() { const input = document.getElementById("logGrowValue"); if(!input || !input.value) { showToast("Failed", "error"); return; } const {item, date} = growLogContext; const val = item.type === "float" ? parseFloat(input.value) : parseInt(input.value); saveGrowLog(item, date, val); });
        window.showGrowLogList = function() { document.getElementById("logGrowListView").style.display = "block"; document.getElementById("logGrowQuestionView").style.display = "none"; };

        // Priority Mode Toggles
        window.toggleTaskPriorityMode = function(taskId) { document.querySelectorAll('.priority-mode').forEach(el => { if(el.id !== 'task_actions_' + taskId) el.classList.remove('priority-mode'); }); document.getElementById('task_actions_' + taskId).classList.add('priority-mode'); };
        window.toggleSubtaskPriorityMode = function(taskId, subtaskId) { document.querySelectorAll('.priority-mode').forEach(el => { if(el.id !== 'subtask_actions_' + taskId + '_' + subtaskId) el.classList.remove('priority-mode'); }); document.getElementById('subtask_actions_' + taskId + '_' + subtaskId).classList.add('priority-mode'); };
        window.toggleNotePriorityMode = function(noteId) { document.querySelectorAll('.priority-mode').forEach(el => { if(el.id !== 'note_actions_' + noteId) el.classList.remove('priority-mode'); }); document.getElementById('note_actions_' + noteId).classList.add('priority-mode'); };

        window.moveTask = function(taskId, direction) { fetch('/api/tasks/' + taskId + '/move', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({direction}) }).then(res => { if(res.ok) switchPage('tasks'); else throw new Error(''); }).catch(e => showToast('Failed', 'error')); };
        window.moveSubtask = function(taskId, subtaskId, direction) { fetch('/api/tasks/' + taskId + '/subtasks/' + subtaskId + '/move', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({direction}) }).then(res => { if(res.ok) switchPage('tasks'); else throw new Error(''); }).catch(e => showToast('Failed', 'error')); };

        function renderTasksPage() {
            let html = '<div class="tasks-grid">';
            if (!tasksData || tasksData.length === 0) {
                html += '<div class="empty-state" style="grid-column: 1/-1;"><i class="fas fa-clipboard-list" style="font-size: 2.5rem;"></i><h3 style="margin-top: 12px; font-size:1.1rem;">No tasks</h3></div>';
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
                    
                    html += '<div class="task-card"><div class="task-header"><div class="task-title-section"><div class="task-title-container" onclick="toggleDescription(\\'' + descriptionId + '\\')" oncontextmenu="event.preventDefault(); toggleTaskPriorityMode(\\'' + task.taskId + '\\')"><i class="fas fa-chevron-right" id="' + descriptionId + '_icon"></i><span class="task-title">' + escapedTitle + '</span></div></div><div class="task-actions-wrapper" id="task_actions_' + task.taskId + '">';
                    
                    html += '<div class="normal-btns">';
                    if (totalSubtasks < 10) html += '<button class="action-btn" onclick="openAddSubtaskModal(\\'' + task.taskId + '\\')"><i class="fas fa-plus"></i></button>';
                    html += '<button class="action-btn" onclick="openEditTaskModal(\\'' + task.taskId + '\\')"><i class="fas fa-pencil-alt"></i></button><button class="action-btn" onclick="completeTask(\\'' + task.taskId + '\\')"><i class="fas fa-check"></i></button><button class="action-btn delete" onclick="deleteTask(\\'' + task.taskId + '\\')"><i class="fas fa-trash"></i></button></div>';
                    
                    html += '<div class="priority-btns">';
                    html += '<button class="action-btn" onclick="moveTask(\\'' + task.taskId + '\\', \\'up\\')"><i class="fas fa-arrow-up"></i></button>';
                    html += '<button class="action-btn" onclick="moveTask(\\'' + task.taskId + '\\', \\'down\\')"><i class="fas fa-arrow-down"></i></button></div></div></div>';
                    
                    if (hasDescription) html += '<div id="' + descriptionId + '" class="task-description-container hidden"><div class="task-description">' + preserveLineBreaks(task.description) + '</div></div>';
                    
                    const time12 = f12(task.startTimeStr) + ' - ' + f12(task.endTimeStr);
                    html += '<div class="task-time-row"><span class="time-chip"><i class="fas fa-clock"></i> ' + time12 + '</span>';
                    html += '<span class="badge" style="margin-left:auto;"><i class="fas fa-sync"></i> ' + (task.repeatWeeks == 1 ? '1 Week' : task.repeatWeeks + ' Weeks') + '</span></div>';
                    
                    if (totalSubtasks > 0) {
                        html += '<details class="task-subtasks"><summary class="flex-row" style="cursor: pointer;"><div class="progress-ring-small"><svg width="34" height="34"><circle class="progress-ring-circle-small" stroke="var(--progress-bg-light)" stroke-width="3" fill="transparent" r="14" cx="17" cy="17"/><circle class="progress-ring-circle-small" stroke="var(--accent-light)" stroke-width="3" fill="transparent" r="14" cx="17" cy="17" style="stroke-dasharray: ' + circleCircumference + '; stroke-dashoffset: ' + circleOffset + '; "/></svg><span class="progress-text-small">' + progress + '%</span></div><span style="font-size: 0.85rem; font-weight: 500; color: var(--text-secondary-light);">' + completedSubtasks + '/' + totalSubtasks + ' subtasks</span></summary><div class="subtasks-container w-100">';
                        task.subtasks.forEach((subtask) => {
                            const subtaskHasDesc = hasContent(subtask.description);
                            const subtaskDescId = 'subtask_desc_' + task.taskId + '_' + subtask.id;
                            const escapedSubtaskTitle = escapeHtml(subtask.title);
                            const escapedSubtaskDescription = escapeJsString(subtask.description || '');
                            html += '<div class="subtask-item"><div class="subtask-main-row"><div class="subtask-checkbox ' + (subtask.completed ? 'completed' : '') + '" onclick="toggleSubtask(\\'' + task.taskId + '\\', \\'' + subtask.id + '\\')">' + (subtask.completed ? '<i class="fas fa-check"></i>' : '') + '</div><div class="subtask-details"><div class="subtask-title-container" onclick="toggleDescription(\\'' + subtaskDescId + '\\')" oncontextmenu="event.preventDefault(); toggleSubtaskPriorityMode(\\'' + task.taskId + '\\', \\'' + subtask.id + '\\')"><span class="subtask-title ' + (subtask.completed ? 'completed' : '') + '">' + escapedSubtaskTitle + '</span></div></div><div class="task-actions-wrapper" id="subtask_actions_' + task.taskId + '_' + subtask.id + '">';
                            
                            html += '<div class="normal-btns"><button class="subtask-btn" onclick="editSubtask(\\'' + task.taskId + '\\', \\'' + subtask.id + '\\', \\'' + escapedSubtaskTitle.replace(/'/g, "\\\\'") + '\\', \\'' + escapedSubtaskDescription.replace(/'/g, "\\\\'") + '\\')"><i class="fas fa-pencil-alt"></i></button><button class="subtask-btn delete" onclick="deleteSubtask(\\'' + task.taskId + '\\', \\'' + subtask.id + '\\')"><i class="fas fa-trash"></i></button></div>';
                            
                            html += '<div class="priority-btns"><button class="subtask-btn" onclick="moveSubtask(\\'' + task.taskId + '\\', \\'' + subtask.id + '\\', \\'up\\')"><i class="fas fa-arrow-up"></i></button><button class="subtask-btn" onclick="moveSubtask(\\'' + task.taskId + '\\', \\'' + subtask.id + '\\', \\'down\\')"><i class="fas fa-arrow-down"></i></button></div></div></div>';
                            
                            if (subtaskHasDesc) html += '<div id="' + subtaskDescId + '" class="subtask-description-container hidden"><div class="subtask-description">' + preserveLineBreaks(subtask.description) + '</div></div>';
                            html += '</div>';
                        });
                        html += '</div></details>';
                    } else { html += '<div class="flex-row" style="margin-top: 8px;"><span style="font-size: 0.85rem; color: var(--text-secondary-light);"><i class="fas fa-tasks"></i> No subtasks</span></div>'; }
                    
                    html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; flex-wrap:wrap; gap:8px;">';
                    html += '<div>' + getDayBoxes(task.selectedDays) + '</div>';
                    html += '<span class="badge" style="font-weight:bold; letter-spacing:1px;">' + (task.dayTypes || []).join('/') + '</span>';
                    html += '</div></div>';
                });
            }
            html += '</div>';
            return html;
        }

        function renderNotesPage() {
            let html = '<div class="tasks-grid">';
            if (!notesData || notesData.length === 0) { html += '<div class="empty-state" style="grid-column: 1/-1;"><i class="fas fa-note-sticky" style="font-size: 2.5rem;"></i><h3 style="margin-top: 12px; font-size:1.1rem;">No notes</h3></div>'; } 
            else {
                notesData.forEach(note => {
                    const hasDescription = hasContent(note.description);
                    const noteDescId = 'note_desc_' + note.noteId;
                    const escapedNoteTitle = escapeHtml(note.title);
                    const escapedNoteDescription = escapeJsString(note.description || '');
                    
                    html += '<div class="note-card"><div class="note-header"><div class="task-title-container" onclick="toggleDescription(\\'' + noteDescId + '\\')" oncontextmenu="event.preventDefault(); toggleNotePriorityMode(\\'' + note.noteId + '\\')"><i class="fas fa-chevron-right" id="' + noteDescId + '_icon"></i><span class="note-title">' + escapedNoteTitle + '</span></div>';
                    
                    html += '<div class="task-actions-wrapper" id="note_actions_' + note.noteId + '">';
                    html += '<div class="normal-btns"><button class="action-btn" onclick="openEditNoteModal(\\'' + note.noteId + '\\', \\'' + escapedNoteTitle.replace(/'/g, "\\\\'") + '\\', \\'' + escapedNoteDescription.replace(/'/g, "\\\\'") + '\\')"><i class="fas fa-pencil-alt"></i></button><button class="action-btn delete" onclick="deleteNote(\\'' + note.noteId + '\\')"><i class="fas fa-trash"></i></button></div>';
                    
                    html += '<div class="priority-btns"><button class="action-btn" onclick="moveNote(\\'' + note.noteId + '\\', \\'up\\')"><i class="fas fa-arrow-up"></i></button><button class="action-btn" onclick="moveNote(\\'' + note.noteId + '\\', \\'down\\')"><i class="fas fa-arrow-down"></i></button></div></div></div>';
                    
                    if (hasDescription) html += '<div id="' + noteDescId + '" class="note-content-container hidden"><div class="note-content">' + preserveLineBreaks(note.description) + '</div></div>';
                    html += '<div class="note-meta"><span><i class="fas fa-clock"></i> ' + note.createdAtIST + '</span>' + (note.updatedAtIST !== note.createdAtIST ? '<span><i class="fas fa-pencil-alt"></i> ' + note.updatedAtIST + '</span>' : '') + '</div></div>';
                });
            }
            html += '</div>'; return html;
        }

        function renderHistoryPage() {
            let html = '<div class="history-header"><div class="month-selector"><button class="month-btn" onclick="changeMonth(-1)"><i class="fas fa-chevron-left"></i> Prev</button><span style="font-weight: 600; font-size:1.05rem;">' + new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' }) + ' ' + currentYear + '</span><button class="month-btn" onclick="changeMonth(1)">Next <i class="fas fa-chevron-right"></i></button></div></div>';
            html += '<div class="history-grid">';
            
            const filteredHistory = filterHistoryByMonth(historyData, currentYear, currentMonth);
            const dates = Object.keys(filteredHistory).sort().reverse();
            
            if (dates.length === 0) { html += '<div class="empty-state"><i class="fas fa-history" style="font-size: 2.5rem;"></i><h3 style="margin-top: 12px; font-size:1.1rem;">No history</h3></div>'; } 
            else {
                dates.forEach(date => {
                    const tasks = filteredHistory[date];
                    let displayDateHeader = date;
                    if (date.includes('-') && date.split('-')[0].length === 4) {
                        const parts = date.split('-'); displayDateHeader = parts[2] + '-' + parts[1] + '-' + parts[0];
                    }
                    html += '<div class="history-date-card"><details class="history-details">';
                    
                    const taskText = tasks.length === 1 ? '1 Task' : tasks.length + ' Tasks';
                    const dailyType = tasks[0].dailyType || 'WD';

                    html += '<summary style="display:flex; justify-content:space-between; align-items:center; width:100%;"><span style="font-weight: 600;"><i class="fas fa-calendar-alt"></i> ' + displayDateHeader + '</span><span class="badge" style="font-weight:bold;">' + dailyType + '</span><span class="badge" style="margin-left: auto;">' + taskText + '</span></summary>';
                    html += '<div class="history-tasks-grid">';
                    
                    tasks.forEach(task => {
                        const hasDescription = hasContent(task.description);
                        const historyDescId = 'history_desc_' + task.taskId + '_' + task.completedAt;
                        const escapedHistoryTitle = escapeHtml(task.title);
                        html += '<div class="history-task-card"><div class="history-task-header"><div class="task-title-container" onclick="toggleDescription(\\'' + historyDescId + '\\')"><i class="fas fa-chevron-right"></i><span class="history-task-title">' + escapedHistoryTitle + '</span></div><span class="history-task-time"><i class="fas fa-check-circle" style="color: var(--success-light);"></i> ' + f12(task.completedTimeIST) + '</span></div>';
                        if (hasDescription) html += '<div id="' + historyDescId + '" class="history-description-container hidden"><div class="history-description">' + preserveLineBreaks(task.description) + '</div></div>';
                        
                        html += '<div style="display: flex; gap: 6px; margin: 8px 0 4px 0; flex-wrap: wrap;"><span class="badge"><i class="fas fa-clock"></i> ' + f12(task.startTimeStr || task.startTimeIST) + '-' + f12(task.endTimeStr || task.endTimeIST) + '</span>';
                        html += '<span class="badge"><i class="fas fa-sync"></i> ' + (task.repeatWeeks == 1 ? '1 Week' : (task.repeatWeeks||1) + ' Weeks') + '</span></div>';

                        html += getDayBoxes(task.selectedDays);

                        if (task.subtasks && task.subtasks.length > 0) {
                            html += '<details style="margin-top: 8px;"><summary style="cursor: pointer; color: var(--accent-light); font-weight: 600; font-size: 0.85rem;"><i class="fas fa-tasks"></i> Subtasks (' + task.subtasks.filter(s => s.completed).length + '/' + task.subtasks.length + ')</summary><div style="margin-top: 8px;">';
                            task.subtasks.forEach(subtask => {
                                const subtaskHasDesc = hasContent(subtask.description);
                                const historySubtaskDescId = 'history_subtask_desc_' + task.taskId + '_' + task.completedAt + '_' + subtask.id;
                                const textStyle = subtask.completed ? '' : 'text-decoration: line-through; opacity: 0.7;';
                                const iconClass = subtask.completed ? 'fa-check-circle' : 'fa-times-circle';
                                const iconColor = subtask.completed ? 'var(--success-light)' : 'var(--danger-light)';
                                
                                html += '<div class="history-subtask"><div style="display: flex; align-items: flex-start; gap: 6px;"><span style="color: ' + iconColor + '"><i class="fas ' + iconClass + '"></i></span><div style="flex: 1;"><div class="task-title-container" onclick="toggleDescription(\\'' + historySubtaskDescId + '\\')"><span style="font-weight: 500; font-size: 0.85rem; ' + textStyle + '">' + escapeHtml(subtask.title) + '</span></div>' + (subtaskHasDesc ? '<div id="' + historySubtaskDescId + '" class="history-description-container hidden"><div class="history-description" style="border-left-color: var(--accent-light);">' + preserveLineBreaks(subtask.description) + '</div></div>' : '') + '</div></div></div>';
                            });
                            html += '</div></details>';
                        }
                        html += '</div>';
                    });
                    html += '</div></details></div>';
                });
            }
            html += '</div>'; return html;
        }

        function filterHistoryByMonth(history, year, month) {
            const filtered = {};
            Object.keys(history).forEach(dateStr => {
                let parts;
                if(dateStr.includes('-') && dateStr.split('-')[0].length === 4) parts = dateStr.split('-'); 
                else parts = dateStr.split('-').reverse(); 
                const yearNum = parseInt(parts[0]);
                const monthNum = parseInt(parts[1]);
                if (yearNum === year && monthNum - 1 === month) filtered[dateStr] = history[dateStr];
            });
            return filtered;
        }

        function changeMonth(delta) { currentMonth += delta; if (currentMonth < 0) { currentMonth = 11; currentYear--; } else if (currentMonth > 11) { currentMonth = 0; currentYear++; } renderPage(); }

        function openModal(modalId) { document.getElementById(modalId).style.display = 'flex'; document.body.style.overflow = 'hidden'; }
        function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; document.body.style.overflow = 'auto'; }
        function openAddModal() { if (currentPage === 'tasks') openAddTaskModal(); else if (currentPage === 'notes') openAddNoteModal(); else if (currentPage === 'grow') openAddGrowModal(); }

        function openSettingsModal() {
            document.getElementById('notifToggle').checked = globalAppVars.notifications;
            document.getElementById('alertsToggle').checked = globalAppVars.alerts;
            document.getElementById('remindersToggle').checked = globalAppVars.reminders;
            document.getElementById('themeToggle').checked = document.body.getAttribute('data-theme') === 'dark';
            openModal('settingsAppModal');
        }

        function toggleTheme() {
            const isDark = document.getElementById('themeToggle').checked;
            if (isDark) document.body.setAttribute('data-theme', 'dark');
            else document.body.setAttribute('data-theme', 'light');
        }

        function updateSettings() {
            globalAppVars.notifications = document.getElementById('notifToggle').checked;
            globalAppVars.alerts = document.getElementById('alertsToggle').checked;
            globalAppVars.reminders = document.getElementById('remindersToggle').checked;
            fetch('/api/settings/update', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(globalAppVars) }).then(() => showToast('Success'));
        }

        function openAddTaskModal() {
            const istNow = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
            const hours = String(istNow.getUTCHours()).padStart(2, '0');
            const minutes = String(istNow.getUTCMinutes()).padStart(2, '0');
            
            document.getElementById('startTime').value = hours + ':' + minutes;
            document.getElementById('endTime').value = String(istNow.getUTCHours() + 1).padStart(2, '0') + ':' + minutes;
            
            document.querySelectorAll('#addDaySelector .day-circle').forEach(el => el.classList.remove('selected'));
            document.querySelector('#addDaySelector .day-circle[data-day="' + istNow.getUTCDay() + '"]').classList.add('selected');
            updateSelectedDays('addDaySelector', 'addSelectedDays');
            document.getElementById('addRepeatWeeks').value = 1;
            openModal('addTaskModal');
        }

        function openEditTaskModal(taskId) {
            fetch('/api/tasks/' + taskId).then(res => res.json()).then(task => {
                document.getElementById('editTaskId').value = task.taskId;
                document.getElementById('editTitle').value = task.title;
                document.getElementById('editDescription').value = task.description || '';
                document.getElementById('editStartTime').value = task.startTimeStr || task.startTimeIST;
                document.getElementById('editEndTime').value = task.endTimeStr || task.endTimeIST;
                document.getElementById('editRepeatWeeks').value = task.repeatWeeks || 1;
                
                document.querySelectorAll('#editTaskForm input[name="dayTypes"]').forEach(cb => cb.checked = false);
                if (task.dayTypes) {
                    task.dayTypes.forEach(dt => { const cb = document.querySelector('#editTaskForm input[name="dayTypes"][value="'+dt+'"]'); if(cb) cb.checked = true; });
                } else {
                    document.querySelector('#editTaskForm input[name="dayTypes"][value="WD"]').checked = true;
                }

                document.querySelectorAll('#editDaySelector .day-circle').forEach(el => el.classList.remove('selected'));
                if (task.selectedDays && Array.isArray(task.selectedDays)) {
                    task.selectedDays.forEach(d => {
                        const circle = document.querySelector('#editDaySelector .day-circle[data-day="' + d + '"]');
                        if (circle) circle.classList.add('selected');
                    });
                }
                updateSelectedDays('editDaySelector', 'editSelectedDays');
                openModal('editTaskModal');
            }).catch(err => { showToast('Failed', 'error'); });
        }

        function openAddSubtaskModal(taskId) { document.getElementById('subtaskTaskId').value = taskId; openModal('addSubtaskModal'); }
        function editSubtask(taskId, subtaskId, title, description) { document.getElementById('editSubtaskTaskId').value = taskId; document.getElementById('editSubtaskId').value = subtaskId; document.getElementById('editSubtaskTitle').value = title; document.getElementById('editSubtaskDescription').value = description || ''; openModal('editSubtaskModal'); }
        function openAddNoteModal() { openModal('addNoteModal'); }
        function openEditNoteModal(noteId, title, description) { document.getElementById('editNoteId').value = noteId; document.getElementById('editNoteTitle').value = title; document.getElementById('editNoteDescription').value = description || ''; openModal('editNoteModal'); }

        function submitTaskForm(event) {
            event.preventDefault(); 
            const selected = document.getElementById('addSelectedDays').value;
            if (!selected || selected === '[]') { showToast('Please select at least one day.', 'error'); return; }
            
            const dtCheckboxes = event.target.querySelectorAll('input[name="dayTypes"]:checked');
            if (dtCheckboxes.length === 0) { showToast('Select at least one Day Type (WD or HOL).', 'error'); return; }

            const payload = {
                title: event.target.title.value, description: event.target.description.value,
                startTime: event.target.startTime.value, endTime: event.target.endTime.value,
                selectedDays: selected, repeatWeeks: event.target.repeatWeeks.value,
                dayTypes: Array.from(dtCheckboxes).map(cb=>cb.value)
            };

            fetch('/api/tasks', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) })
            .then(res => { if(res.ok){ closeModal('addTaskModal'); showToast('Success'); switchPage('tasks'); } else { return res.text().then(t => {throw new Error(t);}); } })
            .catch(err => { showToast('Failed', 'error'); });
        }

        function submitEditTaskForm(event) {
            event.preventDefault(); 
            const selected = document.getElementById('editSelectedDays').value;
            if (!selected || selected === '[]') { showToast('Please select at least one day.', 'error'); return; }
            
            const dtCheckboxes = event.target.querySelectorAll('input[name="dayTypes"]:checked');
            if (dtCheckboxes.length === 0) { showToast('Select at least one Day Type (WD or HOL).', 'error'); return; }

            const payload = {
                taskId: event.target.taskId.value,
                title: event.target.title.value, description: event.target.description.value,
                startTime: event.target.startTime.value, endTime: event.target.endTime.value,
                selectedDays: selected, repeatWeeks: event.target.repeatWeeks.value,
                dayTypes: Array.from(dtCheckboxes).map(cb=>cb.value)
            };

            fetch('/api/tasks/' + payload.taskId + '/update', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) })
            .then(res => { if(res.ok){ closeModal('editTaskModal'); showToast('Success'); switchPage('tasks'); } else { return res.text().then(t => {throw new Error(t);}); } })
            .catch(err => { showToast('Failed', 'error'); });
        }

        function submitSubtaskForm(event) { event.preventDefault(); const formData = new FormData(event.target); fetch('/api/tasks/' + formData.get('taskId') + '/subtasks', { method: 'POST', body: new URLSearchParams(formData) }).then(res => { if(res.ok){ closeModal('addSubtaskModal'); showToast('Success'); switchPage('tasks'); } else throw new Error(''); }).catch(err => { showToast('Failed', 'error'); }); }
        function submitEditSubtaskForm(event) { event.preventDefault(); const formData = new FormData(event.target); fetch('/api/tasks/' + formData.get('taskId') + '/subtasks/' + formData.get('subtaskId') + '/update', { method: 'POST', body: new URLSearchParams(formData) }).then(res => { if(res.ok){ closeModal('editSubtaskModal'); showToast('Success'); switchPage('tasks'); } else throw new Error(''); }).catch(err => { showToast('Failed', 'error'); }); }
        function submitNoteForm(event) { event.preventDefault(); fetch('/api/notes', { method: 'POST', body: new URLSearchParams(new FormData(event.target)) }).then(res => { if(res.ok){ closeModal('addNoteModal'); showToast('Success'); switchPage('notes'); } else throw new Error(''); }).catch(err => { showToast('Failed', 'error'); }); }
        function submitEditNoteForm(event) { event.preventDefault(); const formData = new FormData(event.target); fetch('/api/notes/' + formData.get('noteId') + '/update', { method: 'POST', body: new URLSearchParams(formData) }).then(res => { if(res.ok){ closeModal('editNoteModal'); showToast('Success'); switchPage('notes'); } else throw new Error(''); }).catch(err => { showToast('Failed', 'error'); }); }
        function toggleSubtask(taskId, subtaskId) { fetch('/api/tasks/' + taskId + '/subtasks/' + subtaskId + '/toggle', { method: 'POST' }).then(res => { if(res.ok){ showToast('Success'); switchPage('tasks'); } else throw new Error(''); }).catch(err => { showToast('Failed', 'error'); }); }
        function deleteSubtask(taskId, subtaskId) { if (!confirm('Delete this subtask?')) return; fetch('/api/tasks/' + taskId + '/subtasks/' + subtaskId + '/delete', { method: 'POST' }).then(res => { if(res.ok){ showToast('Success'); switchPage('tasks'); } else throw new Error(''); }).catch(err => { showToast('Failed', 'error'); }); }
        
        function completeTask(taskId) {
            if (!confirm('Complete this task?')) return;
            fetch('/api/tasks/' + taskId + '/complete', { method: 'POST' })
            .then(res => { if(res.ok){ showToast('Success'); switchPage('tasks'); } else { return res.text().then(t => {throw new Error(t);}); } })
            .catch(err => { showToast('Failed', 'error'); });
        }
        
        function deleteTask(taskId) { if (!confirm('Delete this task?')) return; fetch('/api/tasks/' + taskId + '/delete', { method: 'POST' }).then(res => { if(res.ok){ showToast('Success'); switchPage('tasks'); } else throw new Error(''); }).catch(err => { showToast('Failed', 'error'); }); }
        function deleteNote(noteId) { if (!confirm('Delete this note?')) return; fetch('/api/notes/' + noteId + '/delete', { method: 'POST' }).then(res => { if(res.ok){ showToast('Success'); switchPage('notes'); } else throw new Error(''); }).catch(err => { showToast('Failed', 'error'); }); }
        function moveNote(noteId, direction) { const formData = new FormData(); formData.append('direction', direction); fetch('/api/notes/' + noteId + '/move', { method: 'POST', body: new URLSearchParams(formData) }).then(res => { if(res.ok){ switchPage('notes'); } else throw new Error(''); }).catch(err => { showToast('Failed', 'error'); }); }

        document.addEventListener('DOMContentLoaded', function() {
            setupDaySelector('addDaySelector', 'addSelectedDays');
            setupDaySelector('editDaySelector', 'editSelectedDays');

            const themeToggle = document.getElementById('themeToggle');
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                if (themeToggle) themeToggle.checked = true;
                document.body.setAttribute('data-theme', 'dark');
            } else {
                if (themeToggle) themeToggle.checked = false;
                document.body.setAttribute('data-theme', 'light');
            }

            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
                const newColorScheme = event.matches ? "dark" : "light";
                if (themeToggle) themeToggle.checked = event.matches;
                document.body.setAttribute('data-theme', newColorScheme);
            });
            
            const gIst = getGrowIST();
            growToday = gIst.date; growMonth = gIst.month; growYear = gIst.year;

            document.getElementById('pageTitleDisplay').innerText = currentPage;
            renderPage(); updateActiveNav();

            if (!dailyStatus || dailyStatus.dateStr !== growToday) {
                document.getElementById('dailyStatusModal').style.display = 'block';
            }
            
            window.addEventListener('click', function(event) { 
                if (event.target.classList.contains('modal') && event.target.id !== 'dailyStatusModal') { event.target.style.display = 'none'; document.body.style.overflow = 'auto'; } 
                if(!event.target.closest(".grow-day") && !event.target.closest(".grow-bubble")) hideGrowBubble();
                if (!event.target.closest('.task-title-container') && !event.target.closest('.priority-btns')) document.querySelectorAll('.priority-mode').forEach(el => el.classList.remove('priority-mode'));
            });
            window.oncontextmenu = function(event) { event.preventDefault(); };
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
                await db.collection('settings').insertOne({ _id: 'bot_config', notifications: true, alerts: true, reminders: true });
                globalSettings = { notifications: true, alerts: true, reminders: true };
            } else {
                globalSettings = { notifications: s.notifications !== false, alerts: s.alerts !== false, reminders: s.reminders !== false };
            }
            
            const exists = await db.collection('grow').findOne({ type: 'tracker' });
            if (!exists) await db.collection('grow').insertOne({ type: 'tracker', items: [], progress: {} });

            return true;
        } catch (error) {
            retries--;
            if (retries === 0) return false;
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    return false;
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

// ==========================================
// 🤖 BOT SETUP & CRON SCHEDULERS
// ==========================================
const bot = new Telegraf(BOT_TOKEN);
const activeSchedules = new Map();
let isShuttingDown = false;
let lastHourlyMessageId = null;

bot.use(async (ctx, next) => {
    if (ctx.from && ctx.from.id !== CHAT_ID) {
        try { await ctx.reply('🚫 Admin has restricted new users to use the task manager bot.'); } catch(e){}
        return;
    }
    return next();
});

async function sendStartMenu(ctx) {
    try {
        const { pendingTasks, completedTasks, totalToday } = await getActiveTasksForToday();
        
        let percentage = 0;
        let progressBar = '░░░░░░░░░░░░░░░░░░░░'; 
        
        if (totalToday > 0) {
            percentage = Math.round((completedTasks.length / totalToday) * 100);
            const filledCount = Math.floor(percentage / 5); 
            progressBar = '█'.repeat(filledCount) + '░'.repeat(20 - filledCount);
        }

        let msg = `<i>Welcome, <b><a href="tg://user?id=${ctx.from.id}">${(ctx.from.username || ctx.from.first_name || 'Admin').toUpperCase()}</a></b>!</i>\n`;
        msg += `${progressBar} ${percentage}%\n`;
        msg += `⚙️Completed: <i><b>${completedTasks.length}/${totalToday}</b></i> tasks.\n\n`;
        
        msg += `<blockquote expandable>`;
        if (totalToday === 0) {
            msg += `No tasks scheduled for today.`;
        } else {
            completedTasks.forEach(t => msg += `✅ ${escapeHTML(t.title)} (${f12(t.startTimeStr)} - ${f12(t.endTimeStr)})\n`);
            pendingTasks.forEach(t => msg += `❌ ${escapeHTML(t.title)} (${f12(t.startTimeStr)} - ${f12(t.endTimeStr)})\n`);
        }
        msg += `</blockquote>\n`;
        
        msg += `Notifications:  ${globalSettings.notifications ? '🔔 ON' : '🔕 OFF'}\n`;
        msg += `Alerts : ${globalSettings.alerts ? '🔔 ON' : '🔕 OFF'}\n`;
        msg += `Reminders : ${globalSettings.reminders ? '🔔 ON' : '🔕 OFF'}`;

        const kb = { inline_keyboard: [ [ { text: '🌐 Task Manager', web_app: { url: WEB_APP_URL } } ], [ { text: '⚙️ Settings', callback_data: 'open_settings' } ] ] };

        if (ctx.callbackQuery) await ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: kb });
        else await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb });
    } catch (err) { console.error("Start Menu Error:", err); }
}

bot.command('start', sendStartMenu);

bot.action('open_settings', async (ctx) => {
    const gs = globalSettings;
    const kb = {
        inline_keyboard: [
            [ { text: gs.notifications ? '🔔 Notifications: ON' : '🔕 Notifications: OFF', callback_data: 'tgl_notif' } ],
            [ { text: gs.alerts ? '🔔 Alerts: ON' : '🔕 Alerts: OFF', callback_data: 'tgl_alerts' } ],
            [ { text: gs.reminders ? '🔔 Reminders: ON' : '🔕 Reminders: OFF', callback_data: 'tgl_reminders' } ],
            [ { text: '⬅️ Back', callback_data: 'back_start' }, { text: '🌐 Tasks', web_app: { url: WEB_APP_URL } } ]
        ]
    };
    await ctx.editMessageText('⚙️ <b>Bot Settings:</b>\n\n<i>Toggle your preferences below:</i>', { parse_mode: 'HTML', reply_markup: kb });
});

bot.action('back_start', sendStartMenu);

async function toggleSetting(ctx, key) {
    globalSettings[key] = !globalSettings[key];
    await db.collection('settings').updateOne({ _id: 'bot_config' }, { $set: { [key]: globalSettings[key] } }, { upsert: true });
    await bot.handleUpdate({ ...ctx.update, callback_query: { ...ctx.callbackQuery, data: 'open_settings' }});
}

bot.action('tgl_notif', ctx => toggleSetting(ctx, 'notifications'));
bot.action('tgl_alerts', ctx => toggleSetting(ctx, 'alerts'));
bot.action('tgl_reminders', ctx => toggleSetting(ctx, 'reminders'));

// 12:01 AM Daily Status Ask
function setupDailyBotPrompt() {
    const rule = new schedule.RecurrenceRule();
    rule.hour = 0; rule.minute = 1; rule.tz = 'Asia/Kolkata';

    schedule.scheduleJob(rule, async function() {
        const istDateObj = getCurrentISTDisplay();
        const kb = { inline_keyboard: [[{text:'💼 Working Day', callback_data:'set_wd'}, {text:'🏖️ Holiday', callback_data:'set_hol'}]] };
        try { await bot.telegram.sendMessage(CHAT_ID, `Good Morning! 🌅\nIs today (${istDateObj.displayDate}) a Working Day or Holiday?`, {reply_markup: kb}); } catch(e){}
    });
}
setupDailyBotPrompt();

bot.action('set_wd', async ctx => {
    const istDateObj = getCurrentISTDisplay();
    await db.collection('daily_status').updateOne({_id:'current'}, {$set:{dateStr: istDateObj.displayDate, type: 'WD'}}, {upsert:true});
    await ctx.editMessageText(`✅ Today (${istDateObj.displayDate}) successfully set as a Working Day (WD).`);
});

bot.action('set_hol', async ctx => {
    const istDateObj = getCurrentISTDisplay();
    await db.collection('daily_status').updateOne({_id:'current'}, {$set:{dateStr: istDateObj.displayDate, type: 'HOL'}}, {upsert:true});
    await ctx.editMessageText(`✅ Today (${istDateObj.displayDate}) successfully set as a Holiday (HOL).`);
});


function scheduleTask(task) {
    cancelTaskSchedule(task.taskId);
    if (new Date() > new Date(task.endDate)) return; 
    if (!task.selectedDays || task.selectedDays.length === 0) return;

    const [h, m] = task.startTimeStr.split(':').map(Number);
    let notifyMins = m - 10;
    let notifyH = h;
    if (notifyMins < 0) { notifyMins += 60; notifyH -= 1; }
    if (notifyH < 0) notifyH += 24;

    const daysStr = task.selectedDays.join(',');
    const cronExp10Min = `${notifyMins} ${notifyH} * * ${daysStr}`;

    const startJob = schedule.scheduleJob({ rule: cronExp10Min, tz: 'Asia/Kolkata' }, async function() {
        if (isShuttingDown || !globalSettings.reminders) return;
        const istDateObj = getCurrentISTDisplay();
        
        const dStatus = await db.collection('daily_status').findOne({_id:'current'});
        if (!dStatus || dStatus.dateStr !== istDateObj.displayDate || !(task.dayTypes || ['WD']).includes(dStatus.type)) return;

        const hist = await db.collection('history').findOne({ taskId: task.taskId, completedDateStr: istDateObj.displayDate });
        if (hist) return; 

        let count = 0;
        const sendRem = async () => {
            if (isShuttingDown || !globalSettings.reminders) return;
            const histCheck = await db.collection('history').findOne({ taskId: task.taskId, completedDateStr: istDateObj.displayDate });
            if (histCheck) {
                if(activeSchedules.has(task.taskId) && activeSchedules.get(task.taskId).interval) clearInterval(activeSchedules.get(task.taskId).interval);
                return;
            }
            
            let minsLeft = 10 - count;
            if (minsLeft === 0) {
                try { await bot.telegram.sendMessage(CHAT_ID, `🚀 <b>START NOW:</b> ${escapeHTML(task.title)}\n🕒 <b>Time:</b> ${f12(task.startTimeStr)} to ${f12(task.endTimeStr)}`, { parse_mode: 'HTML' }); } catch(e){}
            } else {
                try { await bot.telegram.sendMessage(CHAT_ID, `🔔 <b>In ${minsLeft}m:</b> ${escapeHTML(task.title)}\n🕒 <b>Time:</b> ${f12(task.startTimeStr)} to ${f12(task.endTimeStr)}`, { parse_mode: 'HTML' }); } catch(e){}
            }
            
            count++;
            if(count >= 11) { // 10,9,8,7,6,5,4,3,2,1,0 -> 11 iterations
                if(activeSchedules.has(task.taskId) && activeSchedules.get(task.taskId).interval) clearInterval(activeSchedules.get(task.taskId).interval);
            }
        };
        
        await sendRem(); 
        const iv = setInterval(sendRem, 60000); 
        if(activeSchedules.has(task.taskId)) activeSchedules.get(task.taskId).interval = iv;
    });

    activeSchedules.set(task.taskId, { startJob });
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
        const tasks = await db.collection('tasks').find({ status: 'pending' }).toArray();
        tasks.forEach(task => scheduleTask(task));
    } catch (error) {}
}

// Hourly Updates
function setupHourlyNotifications() {
    const rule = new schedule.RecurrenceRule();
    rule.minute = 0; rule.hour = new schedule.Range(8, 23); rule.tz = 'Asia/Kolkata';

    schedule.scheduleJob(rule, async function() {
        if (isShuttingDown || !globalSettings.notifications) return;
        if (lastHourlyMessageId) { try { await bot.telegram.deleteMessage(CHAT_ID, lastHourlyMessageId); } catch(e){} lastHourlyMessageId = null; }
        
        try {
            const istDateObj = getCurrentISTDisplay();
            const { pendingTasks, completedTasks, totalToday } = await getActiveTasksForToday();
            if (totalToday === 0) return;

            let percentage = Math.round((completedTasks.length / totalToday) * 100);
            const filledCount = Math.floor(percentage / 5);
            let progressBar = '█'.repeat(filledCount) + '░'.repeat(20 - filledCount);
            
            let msg = `${istDateObj.displayDate} - ${istDateObj.dayName}\n${progressBar} ${percentage}%\n`;
            msg += `⚙️ Completed: <i><b>${completedTasks.length}/${totalToday}</b></i> tasks\n\n<blockquote expandable>`;
            completedTasks.forEach(t => msg += `✅ ${escapeHTML(t.title)} (${f12(t.startTimeStr)})\n`);
            pendingTasks.forEach(t => msg += `❌ ${escapeHTML(t.title)} (${f12(t.startTimeStr)})\n`);
            msg += `</blockquote>`;

            const sentMsg = await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' });
            lastHourlyMessageId = sentMsg.message_id;
        } catch (e) {}
    });
}

// End of Day Autocompletion
function setupAutoCompletion() {
    const rule = new schedule.RecurrenceRule();
    rule.hour = 23; rule.minute = 57; rule.tz = 'Asia/Kolkata';

    schedule.scheduleJob(rule, async function() {
        if (isShuttingDown) return;
        try {
            const istDateObj = getCurrentISTDisplay();
            const { pendingTasks } = await getActiveTasksForToday();
            
            const dStatus = await db.collection('daily_status').findOne({_id:'current'});
            const typeToSave = (dStatus && dStatus.dateStr === istDateObj.displayDate) ? dStatus.type : 'WD'; 

            for (const task of pendingTasks) {
                const historySubtasks = (task.subtasks || []).map(s => ({ id: s.id, completed: s.completed }));
                await db.collection('history').insertOne({
                    taskId: task.taskId,
                    completedAt: new Date(),
                    completedDateStr: istDateObj.displayDate,
                    completedTimeStr: istDateObj.displayTime,
                    status: 'completed',
                    dailyType: typeToSave,
                    subtasks: historySubtasks
                });
            }
            if (pendingTasks.length > 0) {
                try { await bot.telegram.sendMessage(CHAT_ID, `🌙 <b>Auto-completed</b> ${pendingTasks.length} tasks.\n🕒 <b>Time:</b> ${istDateObj.displayTime}\n📅 <b>Date:</b> ${istDateObj.displayDate}\n🗓 <b>Day:</b> ${istDateObj.dayName}\n`, { parse_mode: 'HTML' }); } catch(e){}
            }
            await cleanExpiredTasks();
        } catch (error) {}
    });
}

// ==========================================
// 🛠️ SHARED HISTORY HYDRATION TOOL
// ==========================================
async function getHydratedHistory() {
    const historyList = await db.collection('history').find().sort({ completedAt: -1 }).limit(500).toArray();
    if (historyList.length === 0) return {};

    const taskIds = [...new Set(historyList.map(h => h.taskId))];
    const activeTasks = await db.collection('tasks').find({ taskId: { $in: taskIds } }).toArray();
    const deletedTasks = await db.collection('deleted_tasks').find({ taskId: { $in: taskIds } }).toArray();

    const taskDict = {};
    activeTasks.forEach(t => taskDict[t.taskId] = t);
    deletedTasks.forEach(t => { if (!taskDict[t.taskId]) taskDict[t.taskId] = t; });

    const groupedHistory = {};
    historyList.forEach(item => {
        const baseTask = taskDict[item.taskId] || { title: 'Deleted Task', description: '', startTimeStr: '??:??', endTimeStr: '??:??', subtasks: [], deleted_subtasks: [] };
        const combined = { ...baseTask, ...item }; 

        if (item.subtasks && Array.isArray(item.subtasks)) {
            combined.subtasks = item.subtasks.map(hSub => {
                const baseSub = (baseTask.subtasks || []).find(s => s.id === hSub.id) || (baseTask.deleted_subtasks || []).find(s => s.id === hSub.id) || { title: 'Deleted Subtask', description: '' };
                return { ...baseSub, completed: hSub.completed };
            });
        } else combined.subtasks = [];

        const dateKey = combined.completedDateStr || formatLegacyIST(combined.completedAt, 'date');
        if (!groupedHistory[dateKey]) groupedHistory[dateKey] = [];
        groupedHistory[dateKey].push({
            ...combined,
            dailyType: combined.dailyType || 'WD',
            repeatWeeks: combined.repeatWeeks || 1, 
            completedTimeIST: combined.completedTimeStr || formatLegacyIST(combined.completedAt, 'time'),
        });
    });
    return groupedHistory;
}

// ==========================================
// 📱 WEB INTERFACE ROUTES
// ==========================================
app.post('/api/daily_status', async (req, res) => {
    try {
        const istDateObj = getCurrentISTDisplay();
        await db.collection('daily_status').updateOne({_id:'current'}, {$set: {dateStr: istDateObj.displayDate, type: req.body.type}}, {upsert:true});
        res.json({success:true});
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/settings/update', async (req, res) => {
    try {
        globalSettings = { ...globalSettings, ...req.body };
        await db.collection('settings').updateOne({ _id: 'bot_config' }, { $set: globalSettings }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (req, res) => res.redirect('/tasks'));

app.get('/tasks', async (req, res) => {
    try {
        const istDateObj = getCurrentISTDisplay();
        const dStatus = await db.collection('daily_status').findOne({_id:'current'});
        const { pendingTasks } = await getActiveTasksForToday();
        
        res.render('index', {
            currentPage: 'tasks', globalSettings,
            tasks: pendingTasks.map(task => ({
                ...task, 
                subtasks: task.subtasks || [],
                selectedDays: task.selectedDays || [],
            })),
            notes: [], groupedHistory: {}, growData: {items: [], progress: {}}, dailyStatus: dStatus
        });
    } catch (error) { res.status(500).send("Server Error"); }
});

app.get('/grow', async (req, res) => {
    try {
        const dStatus = await db.collection('daily_status').findOne({_id:'current'});
        const data = await db.collection('grow').findOne({ type: 'tracker' });
        const cleanData = data ? { items: data.items || [], progress: data.progress || {} } : { items: [], progress: {} };
        res.render('index', { currentPage: 'grow', globalSettings, tasks: [], notes: [], groupedHistory: {}, growData: cleanData, dailyStatus: dStatus });
    } catch (error) { res.status(500).send("Server Error"); }
});

app.get('/notes', async (req, res) => {
    try {
        const dStatus = await db.collection('daily_status').findOne({_id:'current'});
        const notes = await db.collection('notes').find().sort({ orderIndex: 1, createdAt: -1 }).toArray();
        res.render('index', { currentPage: 'notes', globalSettings, tasks: [], notes: notes.map(n => ({ ...n, createdAtIST: formatLegacyIST(n.createdAt, 'date') + ' ' + formatLegacyIST(n.createdAt, 'time'), updatedAtIST: n.updatedAt ? formatLegacyIST(n.updatedAt, 'date') + ' ' + formatLegacyIST(n.updatedAt, 'time') : '' })), groupedHistory: {}, growData: {items: [], progress: {}}, dailyStatus: dStatus });
    } catch (error) { res.status(500).send("Server Error"); }
});

app.get('/history', async (req, res) => {
    try {
        const dStatus = await db.collection('daily_status').findOne({_id:'current'});
        const groupedHistory = await getHydratedHistory();
        res.render('index', { currentPage: 'history', globalSettings, tasks: [], notes: [], groupedHistory, growData: {items: [], progress: {}}, dailyStatus: dStatus });
    } catch (error) { res.status(500).send("Server Error"); }
});

app.get('/api/page/:page', async (req, res) => {
    try {
        const page = req.params.page;
        if (page === 'tasks') {
            const { pendingTasks } = await getActiveTasksForToday();
            res.json({ tasks: pendingTasks });
        } else if (page === 'grow') {
            const data = await db.collection('grow').findOne({ type: 'tracker' });
            res.json({ growData: data ? { items: data.items || [], progress: data.progress || {} } : { items: [], progress: {} } });
        } else if (page === 'notes') {
            const notes = await db.collection('notes').find().sort({ orderIndex: 1, createdAt: -1 }).toArray();
            res.json({ notes: notes.map(n => ({ ...n, createdAtIST: formatLegacyIST(n.createdAt, 'date') + ' ' + formatLegacyIST(n.createdAt, 'time'), updatedAtIST: n.updatedAt ? formatLegacyIST(n.updatedAt, 'date') + ' ' + formatLegacyIST(n.updatedAt, 'time') : '' })) });
        } else if (page === 'history') {
            const groupedHistory = await getHydratedHistory();
            res.json({ groupedHistory });
        } else { res.status(404).json({ error: 'Not found' }); }
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ==========================================
// 🌱 GROW BACKEND ROUTES 
// ==========================================
app.post('/api/grow', async (req, res) => {
    try {
        const { title, description, startDate, endCount, color, hasData, type, question, start, end } = req.body;
        const item = { id: generateId('g'), title: title, description: description || '', startDate: startDate, endCount: parseInt(endCount), color: color, hasData: hasData === true, type: hasData ? type : 'boolean' };
        if (item.hasData) { item.question = question || ''; if (start !== undefined && start !== '') item.start = type === 'float' ? parseFloat(start) : parseInt(start); if (end !== undefined && end !== '') item.end = type === 'float' ? parseFloat(end) : parseInt(end); }
        await db.collection('grow').updateOne({ type: 'tracker' }, { $push: { items: item } }, { upsert: true });
        
        if(globalSettings.alerts) {
            let msg = `🌱 <b>Grow Added</b>\n📌 <b>Title:</b> ${escapeHTML(item.title)}\n⏳ <b>Duration:</b> ${item.endCount} Days`;
            try{ await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' }); }catch(e){}
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/grow/:id/update', async (req, res) => {
    try {
        const { id, title, description, startDate, endCount, color, hasData, type, question, start, end } = req.body;
        const updatedItem = { id: id, title: title, description: description || '', startDate: startDate, endCount: parseInt(endCount), color: color, hasData: hasData === true, type: hasData ? type : 'boolean' };
        if (updatedItem.hasData) { updatedItem.question = question || ''; if (start !== undefined && start !== '') updatedItem.start = type === 'float' ? parseFloat(start) : parseInt(start); if (end !== undefined && end !== '') updatedItem.end = type === 'float' ? parseFloat(end) : parseInt(end); }
        await db.collection('grow').updateOne({ type: 'tracker', 'items.id': id }, { $set: { 'items.$': updatedItem } });
        
        if(globalSettings.alerts) {
            let msg = `✏️ <b>Grow Edited</b>\n📌 <b>Title:</b> ${escapeHTML(updatedItem.title)}`;
            try{ await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' }); }catch(e){}
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/grow/:id/delete', async (req, res) => {
    try {
        const tracker = await db.collection('grow').findOne({ type: 'tracker' });
        const item = tracker?.items.find(i => i.id === req.params.id);
        await db.collection('grow').updateOne({ type: 'tracker' }, { $pull: { items: { id: req.params.id } } });
        
        if(globalSettings.alerts && item) {
            let msg = `🗑️ <b>Grow Deleted</b>\n📌 <b>Title:</b> ${escapeHTML(item.title)}`;
            try{ await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' }); }catch(e){}
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/grow/log', async (req, res) => {
    try {
        const { itemId, dateStr, value } = req.body;
        await db.collection('grow').updateOne({ type: 'tracker' }, { $set: { [`progress.${dateStr}.${itemId}`]: value } });
        
        if(globalSettings.alerts) {
            const tracker = await db.collection('grow').findOne({ type: 'tracker' });
            const item = tracker?.items.find(i => i.id === itemId);
            if(item) {
                let msg = `📈 <b>Grow Logged</b>\n📌 <b>Title:</b> ${escapeHTML(item.title)}\n📅 <b>Date:</b> ${dateStr}\n🔢 <b>Value:</b> ${value}`;
                try{ await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' }); }catch(e){}
            }
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ==========================================
// 🚀 TASKS / NOTES BACKEND ROUTES
// ==========================================
app.get('/api/tasks/:taskId', async (req, res) => {
    try {
        const task = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        if (!task) return res.status(404).json({ error: 'Not found' });
        res.json(task);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/tasks', async (req, res) => {
    try {
        const { title, description, startTime, endTime, selectedDays, repeatWeeks, dayTypes } = req.body;
        
        const daysArr = JSON.parse(selectedDays || '[]');
        if (daysArr.length === 0) return res.status(400).send('Select at least one day.');
        if (!dayTypes || dayTypes.length === 0) return res.status(400).send('Select at least one Day Type.');
        
        const repeatWks = parseInt(repeatWeeks) || 1;
        const nowUTC = new Date();
        const endDateUTC = new Date(nowUTC.getTime() + (repeatWks * 7 * 24 * 60 * 60 * 1000));
        
        const task = { 
            taskId: generateId('t'), title: title.trim(), description: description ? description.trim() : '', 
            selectedDays: daysArr, dayTypes: dayTypes, repeatWeeks: repeatWks,
            startDate: nowUTC, endDate: endDateUTC, 
            status: 'pending', subtasks: [], createdAt: new Date(), orderIndex: (await db.collection('tasks').countDocuments()) || 0, 
            startTimeStr: startTime, endTimeStr: endTime
        };
        
        await db.collection('tasks').insertOne(task);
        scheduleTask(task);
        
        if(globalSettings.alerts) {
            let msg = `➕ <b>Task Added</b>\n📌 <b>Title:</b> ${escapeHTML(task.title)}\n🕒 <b>Time:</b> ${f12(task.startTimeStr)} - ${f12(task.endTimeStr)}\n🔄 <b>Repeats:</b> ${repeatWks} Week(s)`;
            try{ await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' }); }catch(e){}
        }
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/update', async (req, res) => {
    try {
        const { title, description, startTime, endTime, selectedDays, repeatWeeks, dayTypes } = req.body;
        
        const daysArr = JSON.parse(selectedDays || '[]');
        if (daysArr.length === 0) return res.status(400).send('Select at least one day.');
        if (!dayTypes || dayTypes.length === 0) return res.status(400).send('Select at least one Day Type.');
        
        const repeatWks = parseInt(repeatWeeks) || 1;
        const nowUTC = new Date();
        const endDateUTC = new Date(nowUTC.getTime() + (repeatWks * 7 * 24 * 60 * 60 * 1000));
        
        await db.collection('tasks').updateOne(
            { taskId: req.params.taskId }, 
            { $set: { title: title.trim(), description: description ? description.trim() : '', 
                selectedDays: daysArr, dayTypes: dayTypes, repeatWeeks: repeatWks,
                endDate: endDateUTC, startTimeStr: startTime, endTimeStr: endTime, updatedAt: new Date() } }
        );
        const t = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        if (t) {
            scheduleTask(t);
            if(globalSettings.alerts) {
                let msg = `✏️ <b>Task Edited</b>\n📌 <b>Title:</b> ${escapeHTML(t.title)}\n🕒 <b>Time:</b> ${f12(t.startTimeStr)} - ${f12(t.endTimeStr)}`;
                try{ await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' }); }catch(e){}
            }
        }
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/complete', async (req, res) => {
    try {
        const task = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        if (!task) return res.status(400).send('Task not found');
        
        const istNow = getCurrentISTDisplay();
        const historySubtasks = (task.subtasks || []).map(s => ({ id: s.id, completed: s.completed }));

        const dStatus = await db.collection('daily_status').findOne({_id:'current'});
        const typeToSave = (dStatus && dStatus.dateStr === istNow.displayDate) ? dStatus.type : 'WD'; 

        await db.collection('history').insertOne({ 
            taskId: task.taskId, 
            completedAt: new Date(), 
            completedDateStr: istNow.displayDate, 
            completedTimeStr: istNow.displayTime, 
            status: 'completed',
            dailyType: typeToSave,
            subtasks: historySubtasks 
        });
        
        if(globalSettings.alerts) {
            let msg = `✅ <b>Task Completed</b>\n📌 <b>Title:</b> ${escapeHTML(task.title)}\n🕒 <b>Time:</b> ${f12(task.startTimeStr)} - ${f12(task.endTimeStr)}`;
            try{ await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' }); }catch(e){}
        }
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
            const inHistory = await db.collection('history').findOne({ taskId: req.params.taskId });
            if (inHistory) await db.collection('deleted_tasks').insertOne({ ...t, deletedAt: new Date(), deleteReason: 'manual' });
            await db.collection('tasks').deleteOne({ taskId: req.params.taskId });
            
            if(globalSettings.alerts) {
                let msg = `🗑️ <b>Task Deleted</b>\n📌 <b>Title:</b> ${escapeHTML(t.title)}`;
                try{ await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' }); }catch(e){}
            }
        }
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks', async (req, res) => {
    try {
        if (!req.body.title) return res.status(400).send('Empty title');
        await db.collection('tasks').updateOne({ taskId: req.params.taskId }, { $push: { subtasks: { id: generateId('s'), title: req.body.title.trim(), description: req.body.description || '', completed: false, createdAt: new Date() } } });
        
        if(globalSettings.alerts) {
            const parent = await db.collection('tasks').findOne({taskId: req.params.taskId});
            if(parent) {
                let msg = `➕ <b>Subtask Added</b>\n📂 <b>Task:</b> ${escapeHTML(parent.title)}\n📌 <b>Subtask:</b> ${escapeHTML(req.body.title.trim())}`;
                try{ await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' }); }catch(e){}
            }
        }
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/update', async (req, res) => {
    try {
        if (!req.body.title) return res.status(400).send('Empty title');
        await db.collection('tasks').updateOne({ taskId: req.params.taskId, "subtasks.id": req.params.subtaskId }, { $set: { "subtasks.$.title": req.body.title.trim(), "subtasks.$.description": req.body.description || '' } });
        
        if(globalSettings.alerts) {
            const parent = await db.collection('tasks').findOne({taskId: req.params.taskId});
            if(parent) {
                let msg = `✏️ <b>Subtask Edited</b>\n📂 <b>Task:</b> ${escapeHTML(parent.title)}\n📌 <b>Subtask:</b> ${escapeHTML(req.body.title.trim())}`;
                try{ await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' }); }catch(e){}
            }
        }
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/toggle', async (req, res) => {
    try {
        const task = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        const sub = (task.subtasks || []).find(s => s.id === req.params.subtaskId);
        await db.collection('tasks').updateOne({ taskId: req.params.taskId, "subtasks.id": req.params.subtaskId }, { $set: { "subtasks.$.completed": !sub.completed } });
        
        if(globalSettings.alerts) {
            let msg = `${!sub.completed ? '✅' : '🔄'} <b>Subtask Toggled</b>\n📂 <b>Task:</b> ${escapeHTML(task.title)}\n📌 <b>Subtask:</b> ${escapeHTML(sub.title)}`;
            try{ await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' }); }catch(e){}
        }
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/delete', async (req, res) => {
    try {
        const task = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        const subtask = (task.subtasks || []).find(s => s.id === req.params.subtaskId);
        const inHistory = await db.collection('history').findOne({ taskId: req.params.taskId, "subtasks.id": req.params.subtaskId });
        
        if (inHistory && subtask) await db.collection('tasks').updateOne({ taskId: req.params.taskId }, { $pull: { subtasks: { id: req.params.subtaskId } }, $push: { deleted_subtasks: subtask } });
        else await db.collection('tasks').updateOne({ taskId: req.params.taskId }, { $pull: { subtasks: { id: req.params.subtaskId } } });
        
        if(globalSettings.alerts && subtask) {
            let msg = `🗑️ <b>Subtask Deleted</b>\n📂 <b>Task:</b> ${escapeHTML(task.title)}\n📌 <b>Subtask:</b> ${escapeHTML(subtask.title)}`;
            try{ await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' }); }catch(e){}
        }
        res.json({success: true});
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

app.post('/api/notes', async (req, res) => {
    try {
        if (!req.body.title) return res.status(400).send('Empty title');
        await db.collection('notes').insertOne({ noteId: generateId('n'), title: req.body.title.trim(), description: req.body.description || '', createdAt: new Date(), updatedAt: new Date(), orderIndex: await db.collection('notes').countDocuments() });
        
        if(globalSettings.alerts) {
            let msg = `📝 <b>Note Added</b>\n📌 <b>Title:</b> ${escapeHTML(req.body.title.trim())}`;
            try{ await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' }); }catch(e){}
        }
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/notes/:noteId/update', async (req, res) => {
    try {
        if (!req.body.title) return res.status(400).send('Empty title');
        await db.collection('notes').updateOne({ noteId: req.params.noteId }, { $set: { title: req.body.title.trim(), description: req.body.description || '', updatedAt: new Date() } });
        
        if(globalSettings.alerts) {
            let msg = `✏️ <b>Note Edited</b>\n📌 <b>Title:</b> ${escapeHTML(req.body.title.trim())}`;
            try{ await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' }); }catch(e){}
        }
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/notes/:noteId/delete', async (req, res) => {
    try {
        const doc = await db.collection('notes').findOne({noteId: req.params.noteId});
        await db.collection('notes').deleteOne({ noteId: req.params.noteId });
        
        if(globalSettings.alerts && doc) {
            let msg = `🗑️ <b>Note Deleted</b>\n📌 <b>Title:</b> ${escapeHTML(doc.title)}`;
            try{ await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' }); }catch(e){}
        }
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/notes/:noteId/move', async (req, res) => {
    try {
        const notes = await db.collection('notes').find().sort({ orderIndex: 1 }).toArray();
        const idx = notes.findIndex(n => n.noteId === req.params.noteId);
        if (req.body.direction === 'up' && idx > 0) {
            await db.collection('notes').updateOne({ noteId: notes[idx].noteId }, { $set: { orderIndex: notes[idx-1].orderIndex } });
            await db.collection('notes').updateOne({ noteId: notes[idx-1].noteId }, { $set: { orderIndex: notes[idx].orderIndex } });
        } else if (req.body.direction === 'down' && idx < notes.length - 1) {
            await db.collection('notes').updateOne({ noteId: notes[idx].noteId }, { $set: { orderIndex: notes[idx+1].orderIndex } });
            await db.collection('notes').updateOne({ noteId: notes[idx+1].noteId }, { $set: { orderIndex: notes[idx].orderIndex } });
        }
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

// ==========================================
// 🚀 BOOTSTRAP
// ==========================================
async function start() {
    try {
        if (await connectDB()) {
            await cleanExpiredTasks();
            await rescheduleAllPending();
            setupHourlyNotifications();
            setupAutoCompletion();
            
            app.listen(PORT, '0.0.0.0', () => {
                console.log('🌐 Web interface running on port ' + PORT);
                console.log('🕐 IST Time: ' + getCurrentISTDisplay().dateTime);
            });
            
            await bot.launch();
            console.log('🤖 Bot Started Successfully!');
        } else {
            setTimeout(start, 5000);
        }
    } catch (error) {
        console.log("Error starting server:", error);
        setTimeout(start, 10000);
    }
}

process.once('SIGINT', () => { isShuttingDown = true; bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { isShuttingDown = true; bot.stop('SIGTERM'); process.exit(0); });

start();
