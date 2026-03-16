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

let globalSettings = { reminders: true, hourly: true, alerts: true, theme: 'light' };

// ==========================================
// 🕐 TIMEZONE UTILITIES
// ==========================================
function convert12to24(timeStr, ampm) {
    if (!timeStr) return "00:00";
    let [h, m] = timeStr.split(':');
    h = parseInt(h || 0);
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
}

function convert24to12(time24) {
    if (!time24) return { time: '12:00', ampm: 'AM', full: '12:00 AM' };
    let [h, m] = time24.split(':');
    h = parseInt(h);
    let ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; h = h ? h : 12;
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return { time, ampm, full: `${time} ${ampm}` };
}

function istToUTC(istDate, istTime24) {
    if (!istDate || !istTime24) return null;
    try {
        const [year, month, day] = istDate.split('-').map(Number);
        const [hour, minute] = istTime24.split(':').map(Number);
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
    const t12 = convert24to12(`${hours}:${minutes}`);
    return { date: `${year}-${month}-${day}`, displayDate: `${day}-${month}-${year}`, displayTime: t12.full, dateTime: `${day}-${month}-${year} ${t12.full}` };
}

function formatLegacyIST(utcDate, type) {
    if (!utcDate || isNaN(new Date(utcDate).getTime())) return '';
    const istDate = new Date(new Date(utcDate).getTime() + IST_OFFSET_MS);
    if (type === 'date') return `${String(istDate.getUTCDate()).padStart(2, '0')}-${String(istDate.getUTCMonth() + 1).padStart(2, '0')}-${istDate.getUTCFullYear()}`;
    if (type === 'time') return convert24to12(`${String(istDate.getUTCHours()).padStart(2, '0')}:${String(istDate.getUTCMinutes()).padStart(2, '0')}`).full;
    return '';
}

function escapeHTML(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ==========================================
// 🎨 EJS TEMPLATE GENERATOR
// ==========================================
function writeMainEJS() {
    const mainEJS = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes, viewport-fit=cover"><title>Task Manager</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"><script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
        :root { --bg: #f5f7fa; --card-bg: #ffffff; --text-primary: #1e293b; --text-secondary: #475569; --border: #e2e8f0; --accent: #2563eb; --accent-soft: #dbeafe; --success: #059669; --warning: #d97706; --danger: #dc2626; --hover: #f1f5f9; --progress-bg: #e2e8f0; }
        [data-theme="dark"] { --bg: #0f172a; --card-bg: #1e293b; --text-primary: #f8fafc; --text-secondary: #cbd5e1; --border: #334155; --accent: #60a5fa; --accent-soft: #1e3a5f; --success: #34d399; --warning: #fbbf24; --danger: #f87171; --hover: #2d3b4f; --progress-bg: #334155; }
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Space Grotesk', sans-serif; letter-spacing: 0.1px; }
        body { background: var(--bg); color: var(--text-primary); transition: background 0.2s, color 0.2s; min-height: 100vh; font-size: 13px; line-height: 1.4; }
        
        .app-header { background: var(--card-bg); border-bottom: 1px solid var(--border); padding: 8px 12px; position: sticky; top: 0; z-index: 100; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .logo-section { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 1.1rem; color: var(--accent); }
        .header-title { font-weight: 600; font-size: 1.05rem; position: absolute; left: 50%; transform: translateX(-50%); }
        .settings-btn { background: transparent; border: none; color: var(--text-secondary); font-size: 1.2rem; cursor: pointer; transition: color 0.2s; padding: 4px; }
        .settings-btn:hover { color: var(--accent); }
        .settings-dropdown { position: absolute; top: 40px; right: 10px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); width: 200px; padding: 8px; display: none; z-index: 101; opacity: 0; transform: translateY(-10px); transition: all 0.2s; }
        .settings-dropdown.show { display: block; opacity: 1; transform: translateY(0); }
        .setting-item { display: flex; justify-content: space-between; align-items: center; padding: 8px; font-size: 0.85rem; font-weight: 500; color: var(--text-primary); cursor: pointer; border-radius: 8px; transition: background 0.2s; }
        .setting-item:hover { background: var(--hover); }
        .toggle-switch { width: 34px; height: 18px; background: var(--border); border-radius: 100px; position: relative; transition: 0.2s; }
        .toggle-switch::after { content: ''; position: absolute; width: 14px; height: 14px; background: white; border-radius: 50%; top: 2px; left: 2px; transition: 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
        .setting-item.active .toggle-switch { background: var(--success); }
        .setting-item.active .toggle-switch::after { left: 18px; }

        .nav-container { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px; }
        .nav-links { display: flex; gap: 2px; background: var(--hover); padding: 3px; border-radius: 100px; flex: 1; overflow-x: auto; }
        .nav-btn { display: flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 100px; border: none; background: transparent; color: var(--text-secondary); font-size: 0.8rem; font-weight: 500; cursor: pointer; transition: all 0.2s ease; white-space: nowrap; }
        .nav-btn.active { background: var(--card-bg); color: var(--accent); box-shadow: 0 2px 6px rgba(0,0,0,0.05); font-weight: 600; }
        .time-badge { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: var(--accent-soft); border-radius: 100px; font-size: 0.75rem; font-weight: 600; color: var(--accent); }
        
        .main-content { max-width: 1400px; margin: 16px auto; padding: 0 16px 80px 16px; }
        .tasks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
        .task-card, .note-card, .history-date-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 14px; transition: all 0.2s ease; word-wrap: break-word; overflow-wrap: break-word; }
        .note-card { margin-bottom: 12px; }
        
        .task-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; width: 100%; }
        .task-title { font-size: 1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; line-height: 1.3; word-break: break-word; cursor: pointer; display: inline-block; user-select: none; }
        .task-description { font-size: 0.8rem; color: var(--text-secondary); padding: 6px 8px; background: var(--hover); border-radius: 10px; border-left: 3px solid var(--accent); white-space: pre-wrap; margin: 8px 0 4px 0; }
        .task-time-row { display: flex; justify-content: space-between; align-items: center; width: 100%; margin: 8px 0 4px 0; }
        .date-chip, .time-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: var(--hover); border-radius: 100px; font-size: 0.75rem; font-weight: 500; color: var(--text-secondary); }
        
        .task-actions-wrapper { display: flex; gap: 4px; flex-shrink: 0; }
        .normal-btns, .priority-btns { display: flex; gap: 4px; }
        .priority-btns { display: none; }
        .priority-mode .normal-btns { display: none; }
        .priority-mode .priority-btns { display: flex; }
        .action-btn { width: 28px; height: 28px; border-radius: 8px; border: none; background: var(--hover); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; font-size: 0.8rem; }
        .action-btn:hover { background: var(--accent); color: white; }
        .action-btn.delete:hover { background: var(--danger); }
        
        .progress-ring-small { position: relative; width: 36px; height: 36px; }
        .progress-ring-circle-small { transition: stroke-dashoffset 0.5s; transform: rotate(-90deg); transform-origin: 50% 50%; }
        .progress-text-small { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 0.7rem; font-weight: 600; color: var(--accent); }
        
        .subtasks-container { margin-top: 10px; border-top: 1px solid var(--border); padding-top: 10px; width: 100%; }
        .subtask-item { display: flex; flex-direction: column; background: var(--hover); border-radius: 10px; margin-bottom: 6px; padding: 8px; }
        .subtask-main-row { display: flex; align-items: flex-start; gap: 8px; width: 100%; }
        .subtask-checkbox { width: 18px; height: 18px; border-radius: 6px; border: 2px solid var(--accent); background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; color: white; font-size: 0.7rem; flex-shrink: 0; margin-top: 2px; }
        .subtask-checkbox.completed { background: var(--success); border-color: var(--success); }
        .subtask-title { font-weight: 500; color: var(--text-primary); font-size: 0.85rem; word-break: break-word; cursor: pointer; user-select: none; }
        .subtask-title.completed { text-decoration: line-through; color: var(--text-secondary); }
        .subtask-btn { width: 24px; height: 24px; border-radius: 6px; border: none; background: var(--card-bg); color: var(--text-secondary); cursor: pointer; font-size: 0.75rem; display: flex; align-items: center; justify-content: center; }
        .subtask-btn:hover { background: var(--accent); color: white; }
        .subtask-btn.delete:hover { background: var(--danger); }
        .subtask-description { font-size: 0.75rem; color: var(--text-secondary); padding: 4px 6px; background: var(--card-bg); border-radius: 8px; border-left: 2px solid var(--accent); margin-top: 6px; margin-left: 26px; }
        
        .badge { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 100px; font-size: 0.7rem; font-weight: 500; gap: 4px; background: var(--hover); color: var(--text-secondary); }
        .note-title { font-size: 1rem; font-weight: 600; color: var(--text-primary); flex: 1; cursor: pointer; }
        .note-content { font-size: 0.85rem; color: var(--text-secondary); padding: 6px; background: var(--hover); border-radius: 10px; border-left: 3px solid var(--accent); margin: 4px 0 8px 0; }
        .note-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); font-size: 0.7rem; color: var(--text-secondary); }
        
        .history-header { display: flex; justify-content: center; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
        .month-btn { padding: 6px 12px; border-radius: 100px; border: 1px solid var(--border); background: var(--card-bg); color: var(--text-primary); font-size: 0.8rem; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 4px; }
        .history-details summary { display: flex; align-items: center; width: 100%; cursor: pointer; list-style: none; font-weight: 600; font-size: 0.95rem; }
        .history-details summary::-webkit-details-marker { display: none; }
        .history-tasks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-top: 12px; }
        .history-task-card { background: var(--hover); border-radius: 12px; padding: 12px; border-left: 3px solid var(--success); }
        .history-task-title { font-size: 0.9rem; font-weight: 600; color: var(--text-primary); cursor: pointer; flex: 1; }
        .history-task-time { font-size: 0.75rem; color: var(--text-secondary); margin-left: auto; padding-left: 8px; }
        .history-description { font-size: 0.8rem; color: var(--text-secondary); padding: 4px 6px; background: var(--card-bg); border-radius: 8px; border-left: 2px solid var(--success); margin: 6px 0; }
        .history-subtask { padding: 4px 4px 4px 20px; border-left: 2px solid var(--border); margin: 4px 0; }
        
        .fab { position: fixed; bottom: 24px; right: 24px; width: 52px; height: 52px; border-radius: 26px; background: var(--accent); color: white; border: none; font-size: 1.3rem; cursor: pointer; box-shadow: 0 4px 12px rgba(37,99,235,0.3); transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; z-index: 99; }
        .fab:hover { transform: scale(1.05); }
        
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: var(--card-bg); border: 1px solid var(--border); border-radius: 20px; padding: 20px; width: 90%; max-width: 480px; max-height: 85vh; overflow-y: auto; }
        .form-control { width: 100%; padding: 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); color: var(--text-primary); font-size: 0.85rem; font-family: 'Space Grotesk', sans-serif; resize: vertical; }
        textarea.form-control { min-height: 70px; }
        .btn { padding: 10px 18px; border-radius: 100px; border: none; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
        .btn-primary { background: var(--accent); color: white; }
        .btn-secondary { background: var(--hover); color: var(--text-secondary); }
        
        /* Dynamic Island Toast */
        .toast-container { position: fixed; top: 15px; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; flex-direction: column; align-items: center; pointer-events: none; }
        .toast { background: rgba(0,0,0,0.85); backdrop-filter: blur(10px); color: white; padding: 8px 16px; border-radius: 30px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); font-size: 0.8rem; font-weight: 500; transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55); transform: translateY(-30px) scale(0.9); opacity: 0; }
        .toast.show { transform: translateY(0) scale(1); opacity: 1; }
        [data-theme="dark"] .toast { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.1); }
        
        .empty-state { text-align: center; padding: 30px 20px; color: var(--text-secondary); background: var(--hover); border-radius: 20px; }
        .task-title-container { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .task-title-container i { font-size: 0.8rem; color: var(--accent); }
        .hidden { display: none; }
        .flex-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .w-100 { width: 100%; }

        /* Grow CSS */
        .grow-panel { max-width: 600px; margin: 0 auto 12px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
        .grow-panel summary { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; font-size: 0.95rem; font-weight: 600; cursor: pointer; list-style: none; }
        .grow-panel summary::-webkit-details-marker { display: none; }
        .grow-panel > summary > i { transition: transform 0.3s; color: var(--text-secondary); }
        .grow-panel[open] > summary > i { transform: rotate(180deg); }
        .grow-panel-body { padding: 14px; border-top: 1px solid var(--border); }
        .grow-graph-container { width: 100%; aspect-ratio: 1; display: flex; flex-direction: column; }
        .grow-graph { display: flex; justify-content: space-around; align-items: flex-end; flex: 1; margin-top: 10px;}
        .grow-bar { display: flex; flex-direction: column; align-items: center; width: 10%; max-width: 35px; height: 100%; }
        .grow-bar-track { width: 100%; height: 90%; border-radius: 6px; position: relative; display: flex; align-items: flex-end; background: var(--hover); overflow: hidden; border: 1px solid var(--border); }
        .grow-bar-fill { width: 100%; border-radius: 4px; transition: height 0.6s ease; }
        .grow-bar-label { position: absolute; top: 0; bottom: 0; left: 0; right: 0; writing-mode: vertical-rl; transform: rotate(180deg); display: flex; align-items: center; justify-content: center; text-align: center; color: var(--text-primary); font-size: 0.75rem; font-weight: 600; pointer-events: none; }
        .grow-bar-pct { font-size: 0.7rem; font-weight: 600; margin-bottom: 5px; color: var(--text-primary); }
        .grow-month-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .grow-month-nav h2 { font-size: 0.9rem; font-weight: 600; background: var(--hover); padding: 5px 14px; border-radius: 30px; border: 1px solid var(--border); }
        .grow-calendar { width: 100%; aspect-ratio: 1 / 1; display: flex; flex-direction: column; }
        .grow-grid { flex: 1; width: 100%; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: auto repeat(6, minmax(0, 1fr)); gap: 4px; }
        .grow-weekday { display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; }
        .grow-day { display: flex; align-items: center; justify-content: center; border-radius: 10px; position: relative; width: 100%; height: 100%; }
        .grow-day.empty { pointer-events: none; background: transparent; }
        .grow-day:hover:not(.empty) { background: var(--hover); cursor: pointer; }
        .grow-circle { width: 100%; max-width: 34px; aspect-ratio: 1 / 1; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 0.85rem; transition: transform 0.2s; margin: auto; }
        .grow-day:hover .grow-circle { transform: scale(1.1); }
        .grow-circle.has-data { color: #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.2); text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
        .grow-circle.today { box-shadow: 0 0 0 2px var(--card-bg), 0 0 0 4px var(--success); color: var(--success); }
        .grow-circle.today.has-data { color: #fff; }
        .grow-bubble { position: absolute; background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 10px; z-index: 1000; min-width: 150px; max-width: 200px; box-shadow: 0 10px 25px rgba(0,0,0,0.25); display: none; opacity: 0; transition: opacity 0.2s; }
        .grow-bubble.show { opacity: 1; }
        .grow-tail { position: absolute; width: 12px; height: 12px; background: var(--card-bg); border: 1px solid var(--border); transform: rotate(45deg); z-index: -1; }
        .grow-tail.placement-top { border-top: none; border-left: none; bottom: -6px; top: auto; }
        .grow-tail.placement-bottom { border-bottom: none; border-right: none; top: -6px; bottom: auto; }
        .grow-bubble-date { font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 5px; border-bottom: 1px solid var(--border); padding-bottom: 5px; }
        .grow-bubble-item { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; font-size: 0.8rem; font-weight: 500; }
        .grow-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 10px; margin-bottom: 10px; transition: 0.2s;}
        .grow-card summary { display: flex; justify-content: space-between; align-items: center; cursor: pointer; list-style: none; outline: none; padding: 4px 0;}
        .grow-title-section { display: flex; align-items: center; gap: 8px; flex: 1;}
        .grow-title-section i { font-size: 0.8rem; color: var(--text-secondary); transition: transform 0.2s; }
        details[open] .grow-title-section i { transform: rotate(90deg); }
        .grow-title { font-size: 0.95rem; font-weight: 600; color: var(--text-primary); }
        .grow-progress-bar-container { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border); width: 100%; }
        .grow-progress-bar { width: 100%; height: 6px; background: var(--hover); border-radius: 10px; overflow: hidden; margin: 6px 0; border: 1px solid var(--border); }
        .grow-progress-fill { height: 100%; border-radius: 10px; transition: width 0.5s ease-out; }
        .grow-progress-stats { display: flex; justify-content: space-between; gap: 8px; font-size: 0.7rem; color: var(--text-secondary); align-items: center;}
        .grow-progress-stats strong { color: var(--text-primary); font-size: 0.75rem; font-weight: 600;}
        .grow-palette { display: flex; justify-content: space-between; margin-top: 6px; }
        .grow-swatch { width: 24px; height: 24px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: 0.1s;}
        .grow-swatch.selected { transform: scale(1.15); box-shadow: 0 0 0 2px var(--card-bg), 0 0 0 4px var(--text-primary); }
        .grow-swatch.hidden { display: none; }
        .grow-checkbox { display: flex; align-items: center; gap: 6px; margin: 10px 0; font-size: 0.85rem; font-weight: 500; cursor: pointer; color: var(--text-primary);}
        .grow-hidden-fields { display: none; background: var(--hover); padding: 10px; border-radius: 10px; margin-bottom: 10px; }
        
        @media (max-width: 768px) { .nav-container { flex-direction: column; align-items: stretch; gap: 8px; } .nav-links { width: 100%; justify-content: stretch; gap: 2px; } .nav-btn { flex: 1; justify-content: center; padding: 8px 6px; font-size: 0.85rem; } .time-badge { justify-content: center; } .tasks-grid, .history-tasks-grid { grid-template-columns: 1fr; } }
    </style>
</head>
<body data-theme="<%= settings.theme %>">
    <div class="toast-container" id="toastContainer"></div>
    <div class="app-header">
        <div class="header-top">
            <div class="logo-section"><i class="fas fa-layer-group"></i> <span>GTM</span></div>
            <div class="header-title" id="pageTitleDisplay">Tasks</div>
            <div style="position:relative;">
                <button class="settings-btn" onclick="toggleSettings()"><i class="fas fa-cog"></i></button>
                <div class="settings-dropdown" id="settingsDropdown">
                    <div style="font-size:0.75rem; font-weight:700; color:var(--text-secondary); margin-bottom:6px; padding:0 4px; text-transform:uppercase;">Preferences</div>
                    <div class="setting-item <%= settings.theme === 'dark' ? 'active' : '' %>" onclick="toggleSetting('theme')"><span>Dark Mode</span><div class="toggle-switch"></div></div>
                    <div class="setting-item <%= settings.alerts ? 'active' : '' %>" onclick="toggleSetting('alerts')"><span>Alerts</span><div class="toggle-switch"></div></div>
                    <div class="setting-item <%= settings.hourly ? 'active' : '' %>" onclick="toggleSetting('hourly')"><span>Hourly Notifs</span><div class="toggle-switch"></div></div>
                    <div class="setting-item <%= settings.reminders ? 'active' : '' %>" onclick="toggleSetting('reminders')"><span>Reminders</span><div class="toggle-switch"></div></div>
                </div>
            </div>
        </div>
        <div class="nav-container">
            <div class="nav-links">
                <button class="nav-btn <%= currentPage === 'tasks' ? 'active' : '' %>" onclick="switchPage('tasks', 'Tasks')"><i class="fas fa-tasks"></i> <span>Tasks</span></button>
                <button class="nav-btn <%= currentPage === 'grow' ? 'active' : '' %>" onclick="switchPage('grow', 'Grow')"><i class="fas fa-seedling"></i> <span>Grow</span></button>
                <button class="nav-btn <%= currentPage === 'notes' ? 'active' : '' %>" onclick="switchPage('notes', 'Notes')"><i class="fas fa-note-sticky"></i> <span>Notes</span></button>
                <button class="nav-btn <%= currentPage === 'history' ? 'active' : '' %>" onclick="switchPage('history', 'History')"><i class="fas fa-history"></i> <span>History</span></button>
            </div>
            <div class="time-badge"><i class="fas fa-calendar-alt"></i> <span id="currentDateDisplay"><%= currentDate %></span> <span style="margin-left: 4px;"><i class="fas fa-clock"></i> <span id="currentTimeDisplay"><%= currentTime %></span></span></div>
        </div>
    </div>
    <button class="fab" id="fabButton" onclick="openAddModal()" title="Add New"><i class="fas fa-plus"></i></button>
    <div class="main-content" id="mainContent"></div>
    <div class="grow-bubble" id="growBubble"><div id="growBubbleContent"></div><div id="growTail"></div></div>

    <div class="modal" id="addTaskModal"><div class="modal-content"><div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;"><h2 style="font-size: 1.1rem;">Create New Task</h2><button class="action-btn" onclick="closeModal('addTaskModal')">&times;</button></div><form id="addTaskForm" onsubmit="submitTaskForm(event)"><div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.85rem; font-weight: 600;">Title *</label><input type="text" class="form-control" name="title" required maxlength="100"></div><div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.85rem; font-weight: 600;">Description</label><textarea class="form-control" name="description" rows="3"></textarea></div><div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.85rem; font-weight: 600;">Start Date</label><input type="date" class="form-control" name="startDate" id="startDate" required></div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;"><div><label style="font-size: 0.85rem; font-weight: 600;">Start Time</label><div style="display:flex; gap:4px;"><input type="text" pattern="(1[0-2]|0?[1-9]):[0-5][0-9]" placeholder="HH:MM" name="startTimeText" id="startTimeText" class="form-control" required style="width:65%"><select class="form-control" name="startTimeAmPm" id="startTimeAmPm" style="width:35%; padding:8px;"><option value="AM">AM</option><option value="PM">PM</option></select></div></div><div><label style="font-size: 0.85rem; font-weight: 600;">End Time</label><div style="display:flex; gap:4px;"><input type="text" pattern="(1[0-2]|0?[1-9]):[0-5][0-9]" placeholder="HH:MM" name="endTimeText" id="endTimeText" class="form-control" required style="width:65%"><select class="form-control" name="endTimeAmPm" id="endTimeAmPm" style="width:35%; padding:8px;"><option value="AM">AM</option><option value="PM">PM</option></select></div></div></div><div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.85rem; font-weight: 600;">Repeat</label><select class="form-control" name="repeat" id="repeatSelect"><option value="none">No Repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></div><div class="form-group" id="repeatCountGroup" style="margin-bottom: 10px; display: none;"><label style="font-size: 0.85rem; font-weight: 600;">Repeat Count (1-365)</label><input type="number" class="form-control" name="repeatCount" value="7" min="1" max="365"></div><div style="display: flex; gap: 10px; margin-top: 14px;"><button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('addTaskModal')">Cancel</button><button type="submit" class="btn btn-primary" style="flex: 1;">Create Task</button></div></form></div></div>
    <div class="modal" id="editTaskModal"><div class="modal-content"><div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;"><h2 style="font-size: 1.1rem;">Edit Task</h2><button class="action-btn" onclick="closeModal('editTaskModal')">&times;</button></div><form id="editTaskForm" onsubmit="submitEditTaskForm(event)"><input type="hidden" name="taskId" id="editTaskId"><div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.85rem; font-weight: 600;">Title *</label><input type="text" class="form-control" name="title" id="editTitle" required maxlength="100"></div><div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.85rem; font-weight: 600;">Description</label><textarea class="form-control" name="description" id="editDescription" rows="3"></textarea></div><div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.85rem; font-weight: 600;">Start Date</label><input type="date" class="form-control" name="startDate" id="editStartDate" required></div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;"><div><label style="font-size: 0.85rem; font-weight: 600;">Start Time</label><div style="display:flex; gap:4px;"><input type="text" pattern="(1[0-2]|0?[1-9]):[0-5][0-9]" placeholder="HH:MM" name="startTimeText" id="editStartTimeText" class="form-control" required style="width:65%"><select class="form-control" name="startTimeAmPm" id="editStartTimeAmPm" style="width:35%; padding:8px;"><option value="AM">AM</option><option value="PM">PM</option></select></div></div><div><label style="font-size: 0.85rem; font-weight: 600;">End Time</label><div style="display:flex; gap:4px;"><input type="text" pattern="(1[0-2]|0?[1-9]):[0-5][0-9]" placeholder="HH:MM" name="endTimeText" id="editEndTimeText" class="form-control" required style="width:65%"><select class="form-control" name="endTimeAmPm" id="editEndTimeAmPm" style="width:35%; padding:8px;"><option value="AM">AM</option><option value="PM">PM</option></select></div></div></div><div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.85rem; font-weight: 600;">Repeat</label><select class="form-control" name="repeat" id="editRepeatSelect"><option value="none">No Repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></div><div class="form-group" id="editRepeatCountGroup" style="margin-bottom: 10px; display: none;"><label style="font-size: 0.85rem; font-weight: 600;">Repeat Count</label><input type="number" class="form-control" name="repeatCount" id="editRepeatCount" min="1" max="365"></div><div style="display: flex; gap: 10px; margin-top: 14px;"><button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('editTaskModal')">Cancel</button><button type="submit" class="btn btn-primary" style="flex: 1;">Update</button></div></form></div></div>
    
    <div class="modal" id="addGrowModal"><div class="modal-content"><div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;"><h2 style="font-size: 1.1rem;">Add New Growth</h2><button class="action-btn" onclick="closeModal('addGrowModal')">&times;</button></div><form id="addGrowForm"><div class="form-group"><label>Title</label><input type="text" class="form-control" id="addGrowTitle" required></div><div class="form-group" style="margin-top: 10px;"><label>Description (Optional)</label><textarea class="form-control" id="addGrowDesc" rows="2"></textarea></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px; margin-top: 10px;"><div class="form-group"><label>Start Date</label><input type="date" class="form-control" id="addGrowStart" required></div><div class="form-group"><label>Duration (Days)</label><input type="number" class="form-control" id="addGrowDays" value="365" required></div></div><div class="form-group" style="margin-top: 10px;"><label>Color Tag</label><div class="grow-palette" id="addGrowPalette"></div><input type="hidden" id="addGrowColor" required></div><label class="grow-checkbox"><input type="checkbox" id="addGrowHasData" onchange="toggleGrowDataFields('add')"> Track Quantitative Data?</label><div class="grow-hidden-fields" id="addGrowDataFields"><div class="form-group"><label>Question Prompt</label><input type="text" class="form-control" id="addGrowQuestion"></div><div class="form-group" style="margin-top: 10px;"><label>Data Type</label><select class="form-control" id="addGrowType"><option value="integer">Whole Number</option><option value="float">Decimal (Float)</option></select></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px; margin-top: 10px;"><div class="form-group"><label>Start Value</label><input type="number" step="0.01" class="form-control" id="addGrowMin" value="0"></div><div class="form-group"><label>Target Value</label><input type="number" step="0.01" class="form-control" id="addGrowMax" value="100"></div></div></div><button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 14px;">Create Tracker</button></form></div></div>
    <div class="modal" id="editGrowModal"><div class="modal-content"><div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;"><h2 style="font-size: 1.1rem;">Edit Growth</h2><button class="action-btn" onclick="closeModal('editGrowModal')">&times;</button></div><form id="editGrowForm"><input type="hidden" id="editGrowId"><div class="form-group"><label>Title</label><input type="text" class="form-control" id="editGrowTitle" required></div><div class="form-group" style="margin-top: 10px;"><label>Description</label><textarea class="form-control" id="editGrowDesc" rows="2"></textarea></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px; margin-top: 10px;"><div class="form-group"><label>Start Date</label><input type="date" class="form-control" id="editGrowStart" required></div><div class="form-group"><label>Duration (Days)</label><input type="number" class="form-control" id="editGrowDays" required></div></div><div class="form-group" style="margin-top: 10px;"><label>Color</label><div class="grow-palette" id="editGrowPalette"></div><input type="hidden" id="editGrowColor" required></div><label class="grow-checkbox"><input type="checkbox" id="editGrowHasData" onchange="toggleGrowDataFields('edit')"> Track Quantitative Data?</label><div class="grow-hidden-fields" id="editGrowDataFields"><div class="form-group"><label>Question Prompt</label><input type="text" class="form-control" id="editGrowQuestion"></div><div class="form-group" style="margin-top: 10px;"><label>Data Type</label><select class="form-control" id="editGrowType"><option value="integer">Whole Number</option><option value="float">Decimal (Float)</option></select></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px; margin-top: 10px;"><div class="form-group"><label>Start Value</label><input type="number" step="0.01" class="form-control" id="editGrowMin"></div><div class="form-group"><label>Target Value</label><input type="number" step="0.01" class="form-control" id="editGrowMax"></div></div></div><button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 14px;">Update Tracker</button></form></div></div>
    <div class="modal" id="logGrowModal"><div class="modal-content"><div id="logGrowListView"><div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;"><h2 id="logGrowTitle" style="font-size: 1.1rem;">Log Progress</h2><button class="action-btn" onclick="closeModal('logGrowModal')">&times;</button></div><div id="dailyGrowList"></div></div><div id="logGrowQuestionView" style="display: none;"><div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;"><h2 id="qGrowTitle" style="font-size: 1.1rem;"></h2><button class="action-btn" onclick="showGrowLogList()"><i class="fas fa-arrow-left"></i></button></div><div id="qGrowDesc"></div><div class="form-group" style="margin-bottom: 10px;"><label id="qGrowLabel" style="font-size:0.9rem; font-weight:600;"></label><div id="qGrowInput"></div></div><button class="btn btn-primary" id="saveGrowLogBtn" style="width: 100%;">Save Value</button></div></div></div>

    <div class="modal" id="addSubtaskModal"><div class="modal-content"><div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;"><h2 style="font-size: 1.1rem;">Add Subtask</h2><button class="action-btn" onclick="closeModal('addSubtaskModal')">&times;</button></div><form id="addSubtaskForm" onsubmit="submitSubtaskForm(event)"><input type="hidden" name="taskId" id="subtaskTaskId"><div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.85rem; font-weight: 600;">Title *</label><input type="text" class="form-control" name="title" required maxlength="100"></div><div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.85rem; font-weight: 600;">Description</label><textarea class="form-control" name="description" rows="3"></textarea></div><div style="display: flex; gap: 10px; margin-top: 14px;"><button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('addSubtaskModal')">Cancel</button><button type="submit" class="btn btn-primary" style="flex: 1;">Add</button></div></form></div></div>
    <div class="modal" id="editSubtaskModal"><div class="modal-content"><div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;"><h2 style="font-size: 1.1rem;">Edit Subtask</h2><button class="action-btn" onclick="closeModal('editSubtaskModal')">&times;</button></div><form id="editSubtaskForm" onsubmit="submitEditSubtaskForm(event)"><input type="hidden" name="taskId" id="editSubtaskTaskId"><input type="hidden" name="subtaskId" id="editSubtaskId"><div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.85rem; font-weight: 600;">Title *</label><input type="text" class="form-control" name="title" id="editSubtaskTitle" required maxlength="100"></div><div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.85rem; font-weight: 600;">Description</label><textarea class="form-control" name="description" id="editSubtaskDescription" rows="3"></textarea></div><div style="display: flex; gap: 10px; margin-top: 14px;"><button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('editSubtaskModal')">Cancel</button><button type="submit" class="btn btn-primary" style="flex: 1;">Update</button></div></form></div></div>
    <div class="modal" id="addNoteModal"><div class="modal-content"><div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;"><h2 style="font-size: 1.1rem;">Create Note</h2><button class="action-btn" onclick="closeModal('addNoteModal')">&times;</button></div><form id="addNoteForm" onsubmit="submitNoteForm(event)"><div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.85rem; font-weight: 600;">Title *</label><input type="text" class="form-control" name="title" required maxlength="200"></div><div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.85rem; font-weight: 600;">Content</label><textarea class="form-control" name="description" rows="4"></textarea></div><div style="display: flex; gap: 10px; margin-top: 14px;"><button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('addNoteModal')">Cancel</button><button type="submit" class="btn btn-primary" style="flex: 1;">Save</button></div></form></div></div>
    <div class="modal" id="editNoteModal"><div class="modal-content"><div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;"><h2 style="font-size: 1.1rem;">Edit Note</h2><button class="action-btn" onclick="closeModal('editNoteModal')">&times;</button></div><form id="editNoteForm" onsubmit="submitEditNoteForm(event)"><input type="hidden" name="noteId" id="editNoteId"><div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.85rem; font-weight: 600;">Title *</label><input type="text" class="form-control" name="title" id="editNoteTitle" required maxlength="200"></div><div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.85rem; font-weight: 600;">Content</label><textarea class="form-control" name="description" id="editNoteDescription" rows="4"></textarea></div><div style="display: flex; gap: 10px; margin-top: 14px;"><button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeModal('editNoteModal')">Cancel</button><button type="submit" class="btn btn-primary" style="flex: 1;">Update</button></div></form></div></div>

    <script>
        const tg = window.Telegram.WebApp;
        tg.ready(); tg.expand();

        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast show';
            let icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
            toast.innerHTML = '<i class="fas ' + icon + '"></i><span>' + message + '</span>';
            container.appendChild(toast);
            setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
        }

        let currentPage = '<%= currentPage %>';
        let tasksData = <%- JSON.stringify(tasks || []) %>;
        let notesData = <%- JSON.stringify(notes || []) %>;
        let historyData = <%- JSON.stringify(groupedHistory || {}) %>;
        let growTrackerData = <%- JSON.stringify(growData || {items: [], progress: {}}) %>;
        
        let currentMonth = new Date().getMonth(); let currentYear = new Date().getFullYear();
        let growToday = "", growMonth = 0, growYear = 2026, growLogContext = null;
        const growColors = ["#ec4899","#a855f7","#38bdf8","#ef4444","#f97316","#16a34a","#84cc16","#3b82f6", "#eab308", "#14b8a6"];

        function getGrowIST() {
            const d = new Date(); const ist = new Date(d.getTime() + 5.5*3600000);
            return { date: ist.getUTCFullYear()+"-"+String(ist.getUTCMonth()+1).padStart(2,"0")+"-"+String(ist.getUTCDate()).padStart(2,"0"), month: ist.getUTCMonth(), year: ist.getUTCFullYear(), time: String(ist.getUTCHours()).padStart(2,"0")+":"+String(ist.getUTCMinutes()).padStart(2,"0") };
        }

        function switchPage(page, title) {
            currentPage = page; document.getElementById('pageTitleDisplay').innerText = title; updateActiveNav(); renderPage(); 
            fetch('/api/page/' + page).then(async res => { if (!res.ok) throw new Error(await res.text()); return res.json(); }).then(data => {
                if(data.tasks) tasksData = data.tasks; if(data.notes) notesData = data.notes; if(data.groupedHistory) historyData = data.groupedHistory; if(data.growData) growTrackerData = data.growData;
                renderPage(); 
            }).catch(err => { console.error(err); });
        }

        function updateActiveNav() { document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active')); document.querySelectorAll('.nav-btn').forEach(btn => { if (btn.innerText.toLowerCase().includes(currentPage)) btn.classList.add('active'); }); }
        function toggleSettings() { document.getElementById('settingsDropdown').classList.toggle('show'); }
        function toggleSetting(key) {
            fetch('/api/settings/toggle', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({key}) })
            .then(res => res.json()).then(data => {
                if(key === 'theme') { document.body.setAttribute('data-theme', data.val); }
                const items = document.querySelectorAll('.setting-item');
                items.forEach(el => { if(el.innerText.toLowerCase().includes(key.replace('alerts','alert').toLowerCase())) { if(data.val) el.classList.add('active'); else el.classList.remove('active'); } });
            }).catch(e => console.error(e));
        }

        function renderPage() {
            const content = document.getElementById('mainContent'); const fabButton = document.getElementById('fabButton');
            if (currentPage === 'tasks') { fabButton.style.display = 'flex'; content.innerHTML = renderTasksPage(); } 
            else if (currentPage === 'grow') { fabButton.style.display = 'flex'; content.innerHTML = renderGrowPageStaticShell(); renderGrowAll(); }
            else if (currentPage === 'notes') { fabButton.style.display = 'flex'; content.innerHTML = renderNotesPage(); } 
            else if (currentPage === 'history') { fabButton.style.display = 'none'; content.innerHTML = renderHistoryPage(); }
        }

        function hasContent(text) { return text && text.trim().length > 0; }
        function escapeHtml(text) { if (!text) return ''; const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }; return text.replace(/[&<>"']/g, function(m) { return map[m]; }); }
        function preserveLineBreaks(text) { return escapeHtml(text).replace(/\\n/g, '<br>'); }
        function escapeJsString(str) { if (!str) return ''; return str.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'").replace(/"/g, '\\\\"').replace(/\\n/g, '\\\\n').replace(/\\r/g, '\\\\r').replace(/\\t/g, '\\\\t'); }
        function toggleDescription(elementId) { const element = document.getElementById(elementId); if (element) { if (element.classList.contains('hidden')) element.classList.remove('hidden'); else element.classList.add('hidden'); } }

        function renderGrowPageStaticShell() {
            return '<details class="grow-panel"><summary><span>Progress Overview</span><i class="fas fa-chevron-down"></i></summary><div class="grow-panel-body" id="growGraphs"></div></details><details class="grow-panel" open><summary><span>Activity Calendar</span><i class="fas fa-chevron-down"></i></summary><div class="grow-panel-body"><div class="grow-month-nav"><button class="action-btn" onclick="changeGrowMonth(-1)"><i class="fas fa-chevron-left"></i></button><h2 id="growMonthYear">' + ["January","February","March","April","May","June","July","August","September","October","November","December"][growMonth] + ' ' + growYear + '</h2><button class="action-btn" onclick="changeGrowMonth(1)"><i class="fas fa-chevron-right"></i></button></div><div class="grow-calendar"><div class="grow-grid" id="growCalendar"></div></div></div></details><details class="grow-panel" open><summary><span>Manage Growth</span><i class="fas fa-chevron-down"></i></summary><div class="grow-panel-body" id="growList"></div></details>';
        }

        function renderGrowAll() {
            renderGrowCalendar(); renderGrowGraphs(); renderGrowList();
            const fabBtn = document.getElementById("fabButton");
            if(growTrackerData.items && growTrackerData.items.length >= 10) fabBtn.style.opacity = "0.5"; else fabBtn.style.opacity = "1";
            const cal = document.getElementById("growCalendar");
            if(cal) {
                cal.onclick = function(e) {
                    const cell = e.target.closest(".grow-day");
                    if(cell && !cell.classList.contains("empty")) {
                        const d = cell.dataset.date;
                        const active = (growTrackerData.items || []).filter(g => isGrowActive(g, d));
                        const dayData = (growTrackerData.progress || {})[d] || {};
                        const allDone = active.length && active.every(g => dayData[g.id] !== undefined);
                        if(d === growToday && !allDone) openLogGrowModal(d); else showGrowBubble(cell, d);
                    }
                };
            }
        }
        
        function isGrowActive(item, d) { const start = new Date(item.startDate + "T00:00:00"); const target = new Date(d + "T00:00:00"); const days = Math.floor((target - start) / 86400000); return days >= 0 && days < (parseInt(item.endCount)||1); }

        function renderGrowList() {
            const container = document.getElementById("growList");
            if(!growTrackerData.items || !growTrackerData.items.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-seedling" style="font-size:2rem;margin-bottom:8px;"></i><br>No items tracked. Click + to add.</div>'; return; }
            let html = ""; const now = new Date(growToday + "T00:00:00");
            for(let i=0; i<growTrackerData.items.length; i++) {
                const item = growTrackerData.items[i]; const start = new Date(item.startDate + "T00:00:00");
                let passed = Math.floor((now - start) / 86400000); if(isNaN(passed) || passed < 0) passed = 0;
                let endC = parseInt(item.endCount)||1;
                html += '<div class="grow-card"><details><summary><div class="grow-title-section"><i class="fas fa-chevron-right"></i><span class="grow-title">' + escapeHtml(item.title) + '</span></div><div class="task-actions-wrapper"><button class="action-btn" onclick="event.preventDefault(); openEditGrowModal(\\'' + item.id + '\\')" title="Edit"><i class="fas fa-pencil"></i></button><button class="action-btn delete" onclick="event.preventDefault(); deleteGrowTracker(\\'' + item.id + '\\')" title="Delete"><i class="fas fa-trash"></i></button></div></summary>';
                if(item.description) html += '<div class="task-description">' + escapeHtml(item.description) + '</div>';
                let timePct = Math.max(0, Math.min(100, (passed / endC) * 100));
                html += '<div class="grow-progress-bar-container"><div class="grow-progress-stats"><span><strong>Time Elapsed</strong></span><span>' + passed + ' / ' + endC + ' Days</span></div><div class="grow-progress-bar"><div class="grow-progress-fill" style="width:' + timePct + '%; background:' + item.color + 'cc"></div></div><div class="grow-progress-stats"><span>Started: ' + item.startDate + '</span><span>' + Math.round(timePct) + '% Complete</span></div></div>';
                if(item.hasData && item.type !== "boolean") {
                    html += '<hr style="border: none; border-top: 1px dashed var(--border); margin: 12px 0 8px 0;">';
                    let latestValue = item.start !== undefined ? item.start : 0;
                    let sortedDates = Object.keys(growTrackerData.progress || {}).sort();
                    for(let d of sortedDates) { if(growTrackerData.progress[d][item.id] !== undefined && typeof growTrackerData.progress[d][item.id] === 'number') latestValue = growTrackerData.progress[d][item.id]; }
                    if(item.start !== undefined && item.end !== undefined) {
                        const min = Math.min(item.start, item.end); const max = Math.max(item.start, item.end); const range = max - min;
                        let pct = range === 0 ? 0 : ((latestValue - min) / range) * 100; pct = Math.max(0, Math.min(100, pct));
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
            let html = "<div class='grow-graph-container'><div class='grow-graph'>"; const now = new Date(growToday + "T00:00:00");
            for(let i=0; i<growTrackerData.items.length; i++) {
                const item = growTrackerData.items[i]; const start = new Date(item.startDate + "T00:00:00");
                let endC = parseInt(item.endCount)||1;
                let totalDaysSoFar = Math.floor((now - start) / 86400000) + 1;
                if(isNaN(totalDaysSoFar) || totalDaysSoFar < 1) totalDaysSoFar = 0; if(totalDaysSoFar > endC) totalDaysSoFar = endC;
                let completed = 0; const prog = growTrackerData.progress || {};
                for(let d in prog) { const dObj = new Date(d + "T00:00:00"); if(dObj >= start && dObj <= now && prog[d] && prog[d][item.id] !== undefined) completed++; }
                let pct = totalDaysSoFar ? Math.min(100, completed/totalDaysSoFar*100) : 0;
                html += '<div class="grow-bar"><div class="grow-bar-pct">' + Math.round(pct) + '%</div><div class="grow-bar-track" style="background:' + item.color + '40"><div class="grow-bar-fill" style="height:' + pct + '%; background:' + item.color + '"></div><div class="grow-bar-label">' + escapeHtml(item.title) + '</div></div></div>';
            }
            html += "</div></div>"; container.innerHTML = html;
        }

        function changeGrowMonth(dir) { growMonth += dir; if(growMonth > 11) { growMonth = 0; growYear++; } else if(growMonth < 0) { growMonth = 11; growYear--; } renderGrowCalendar(); }

        function renderGrowCalendar() {
            const grid = document.getElementById("growCalendar"); if(!grid) return;
            const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
            document.getElementById("growMonthYear").innerText = months[growMonth] + " " + growYear;
            const firstDay = new Date(growYear, growMonth, 1).getDay(); const daysInMonth = new Date(growYear, growMonth+1, 0).getDate();
            let html = ""; ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d => html += '<div class="grow-weekday">' + d + '</div>');
            let currentDay = 1; const prog = growTrackerData.progress || {};
            for(let i = 0; i < 42; i++) {
                if(i < firstDay || currentDay > daysInMonth) { html += '<div class="grow-day empty"></div>'; } 
                else {
                    const date = growYear + "-" + String(growMonth+1).padStart(2,"0") + "-" + String(currentDay).padStart(2,"0");
                    const isToday = date === growToday; const dayData = prog[date] || {}; const activeColors = [];
                    for(let j=0; j<(growTrackerData.items||[]).length; j++) { const g = growTrackerData.items[j]; if(isGrowActive(g, date) && dayData[g.id] !== undefined) activeColors.push(g.color); }
                    let bg = "transparent", cls = "";
                    if(activeColors.length === 1) { bg = activeColors[0]; cls = "has-data"; } else if(activeColors.length > 1) {
                        let stops = ""; for(let j=0; j<activeColors.length; j++) { stops += activeColors[j] + " " + (j*100/activeColors.length) + "% " + ((j+1)*100/activeColors.length) + "%"; if(j < activeColors.length-1) stops += ", "; }
                        bg = "conic-gradient(" + stops + ")"; cls = "has-data";
                    }
                    html += '<div class="grow-day" data-date="' + date + '"><div class="grow-circle ' + (isToday?'today ':'') + cls + '" style="background:' + bg + '">' + currentDay + '</div></div>'; currentDay++;
                }
            }
            grid.innerHTML = html;
        }

        function hideGrowBubble() { const bubble = document.getElementById("growBubble"); if(bubble && bubble.classList.contains("show")) { bubble.classList.remove("show"); setTimeout(() => bubble.style.display = "none", 200); } }

        function showGrowBubble(cell, date) {
            const bubble = document.getElementById("growBubble"); const content = document.getElementById("growBubbleContent"); const tail = document.getElementById("growTail");
            const active = (growTrackerData.items || []).filter(g => isGrowActive(g, date)); const dayData = (growTrackerData.progress || {})[date] || {}; const d = new Date(date+"T00:00:00");
            let html = '<div class="grow-bubble-date">' + d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) + '</div>';
            if(!active.length) html += "<div style='text-align:center;font-size:0.75rem;color:var(--text-secondary);'>No tasks active.</div>";
            else { for(let i=0; i<active.length; i++) { const g = active[i]; const isDone = dayData[g.id] !== undefined; html += '<div class="grow-bubble-item" style="color:' + g.color + '"><span>' + escapeHtml(g.title) + '</span><i class="fas ' + (isDone?'fa-check-circle':'fa-circle') + '"></i></div>'; } }
            content.innerHTML = html; bubble.style.display = "block"; bubble.style.opacity = "0";
            const bRect = bubble.getBoundingClientRect(); const cRect = cell.getBoundingClientRect();
            let top = cRect.top + window.scrollY - bRect.height - 12; let left = cRect.left + window.scrollX + (cRect.width / 2) - (bRect.width / 2); let placement = 'top';
            if(cRect.top - bRect.height < 20) { top = cRect.bottom + window.scrollY + 12; placement = 'bottom'; }
            if(left < 10) left = 10; if(left + bRect.width > window.innerWidth - 10) left = window.innerWidth - bRect.width - 10;
            bubble.style.top = top + "px"; bubble.style.left = left + "px";
            let tailLeft = (cRect.left + window.scrollX + cRect.width / 2) - left; tailLeft = Math.max(12, Math.min(bRect.width - 24, tailLeft));
            tail.className = "grow-tail placement-" + placement; tail.style.left = (tailLeft - 6) + "px";
            setTimeout(() => { bubble.style.opacity = "1"; bubble.classList.add("show"); }, 10);
        }

        function initAddGrowPalette() {
            const container = document.getElementById("addGrowPalette"); const input = document.getElementById("addGrowColor"); const used = (growTrackerData.items || []).map(g => g.color);
            let html = "", first = null;
            for(let i=0; i<growColors.length; i++) { const c = growColors[i]; const isUsed = used.includes(c); if(!isUsed && !first) first = c; html += '<div class="grow-swatch ' + (isUsed?'hidden':'') + '" style="background:' + c + '" data-color="' + c + '"></div>'; }
            container.innerHTML = html; if(first) { input.value = first; const firstSwatch = container.querySelector('[data-color="' + first + '"]'); if(firstSwatch) firstSwatch.classList.add("selected"); }
            container.onclick = function(e) { if(e.target.classList.contains("grow-swatch") && !e.target.classList.contains("hidden")) { Array.from(container.children).forEach(el => el.classList.remove("selected")); e.target.classList.add("selected"); input.value = e.target.dataset.color; } };
        }

        function initEditGrowPalette(current) {
            const container = document.getElementById("editGrowPalette"); const input = document.getElementById("editGrowColor"); let html = "";
            for(let i=0; i<growColors.length; i++) { const c = growColors[i]; html += '<div class="grow-swatch ' + (c===current?'selected':'') + '" style="background:' + c + '" data-color="' + c + '"></div>'; }
            container.innerHTML = html; input.value = current;
            container.onclick = function(e) { if(e.target.classList.contains("grow-swatch")) { Array.from(container.children).forEach(el => el.classList.remove("selected")); e.target.classList.add("selected"); input.value = e.target.dataset.color; } };
        }

        window.toggleGrowDataFields = function(mode) { const prefix = mode === "add" ? "addGrow" : "editGrow"; document.getElementById(prefix+"DataFields").style.display = document.getElementById(prefix+"HasData").checked ? "block" : "none"; };

        window.openAddGrowModal = function() { if (growTrackerData.items && growTrackerData.items.length >= 10) { showToast("All colors occupied! Cannot add more.", "error"); return; } document.getElementById("addGrowStart").value = growToday; document.getElementById("addGrowType").value = "integer"; initAddGrowPalette(); openModal("addGrowModal"); };
        window.openEditGrowModal = function(id) {
            const item = growTrackerData.items.find(g => g.id === id); if(!item) return;
            document.getElementById("editGrowId").value = item.id; document.getElementById("editGrowTitle").value = item.title; document.getElementById("editGrowDesc").value = item.description || ""; document.getElementById("editGrowStart").value = item.startDate; document.getElementById("editGrowDays").value = item.endCount; document.getElementById("editGrowHasData").checked = item.hasData || false;
            toggleGrowDataFields("edit");
            if(item.hasData) { document.getElementById("editGrowQuestion").value = item.question || ""; document.getElementById("editGrowType").value = item.type || "float"; document.getElementById("editGrowMin").value = item.start !== undefined ? item.start : 0; document.getElementById("editGrowMax").value = item.end !== undefined ? item.end : 100; }
            initEditGrowPalette(item.color); openModal("editGrowModal");
        };

        document.getElementById("addGrowForm").addEventListener("submit", function(e) { e.preventDefault(); 
            const payload = { title: document.getElementById("addGrowTitle").value.trim(), description: document.getElementById("addGrowDesc").value.trim(), startDate: document.getElementById("addGrowStart").value, endCount: parseInt(document.getElementById("addGrowDays").value), color: document.getElementById("addGrowColor").value, hasData: document.getElementById("addGrowHasData").checked, type: document.getElementById("addGrowType").value, question: document.getElementById("addGrowQuestion").value.trim(), start: document.getElementById("addGrowMin").value, end: document.getElementById("addGrowMax").value };
            fetch("/api/grow", { method:"POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload) }).then(res => { if(res.ok) { closeModal("addGrowModal"); document.getElementById("addGrowForm").reset(); showToast("Tracker created!"); switchPage("grow", "Grow"); } else throw new Error("Failed"); }).catch(e => { showToast("Failed to create tracker", "error"); });
        });

        document.getElementById("editGrowForm").addEventListener("submit", function(e) { e.preventDefault();
            const id = document.getElementById("editGrowId").value; const payload = { title: document.getElementById("editGrowTitle").value.trim(), description: document.getElementById("editGrowDesc").value.trim(), startDate: document.getElementById("editGrowStart").value, endCount: parseInt(document.getElementById("editGrowDays").value), color: document.getElementById("editGrowColor").value, hasData: document.getElementById("editGrowHasData").checked, type: document.getElementById("editGrowType").value, question: document.getElementById("editGrowQuestion").value.trim(), start: document.getElementById("editGrowMin").value, end: document.getElementById("editGrowMax").value };
            fetch("/api/grow/" + id + "/update", { method:"POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload) }).then(res => { if(res.ok) { closeModal("editGrowModal"); showToast("Tracker updated!"); switchPage("grow", "Grow"); } else throw new Error("Failed"); }).catch(e => { showToast("Failed to update", "error"); });
        });

        window.deleteGrowTracker = function(id) { if(confirm("Delete this tracker and all its logs?")) { fetch("/api/grow/" + id + "/delete", {method:"POST"}).then(res => { if(res.ok) { showToast("Tracker deleted!"); switchPage("grow", "Grow"); } else throw new Error("Failed"); }).catch(e => { showToast("Error deleting tracker", "error"); }); } };

        window.openLogGrowModal = function(date) {
            const active = growTrackerData.items.filter(g => isGrowActive(g, date)); const d = new Date(date+"T00:00:00"); document.getElementById("logGrowTitle").innerText = d.toLocaleDateString("en-US",{month:"long",day:"numeric"});
            let html = ""; const dayData = (growTrackerData.progress || {})[date] || {};
            for(let i=0; i<active.length; i++) { const item = active[i]; const done = dayData[item.id] !== undefined; html += '<div class="grow-card"><details style="display:contents;"><summary style="outline:none; list-style:none;"><div class="grow-title-section"><i class="fas fa-chevron-right"></i><span class="grow-title">' + escapeHtml(item.title) + '</span></div><div class="task-actions-wrapper"><button class="action-btn" onclick="event.preventDefault(); handleGrowLogClick(\\'' + item.id + '\\',\\'' + date + '\\')" style="background:' + (done?'var(--hover)':'var(--accent)') + ';color:' + (done?'var(--text-secondary)':'white') + '; width:32px; height:32px;" ' + (done?'disabled':'') + '><i class="fas fa-check"></i></button></div></summary>' + (item.description ? '<div class="task-description">' + escapeHtml(item.description) + '</div>' : '') + '</details></div>'; }
            document.getElementById("dailyGrowList").innerHTML = html; showGrowLogList(); openModal("logGrowModal");
        };

        window.handleGrowLogClick = function(id, date) { const item = growTrackerData.items.find(g => g.id === id); if(item.hasData) { openLogGrowQuestion(item, date); } else { saveGrowLog(item, date, true); } };

        function openLogGrowQuestion(item, date) { growLogContext = {item, date}; document.getElementById("qGrowTitle").innerText = item.title; document.getElementById("qGrowDesc").innerHTML = item.description ? '<div class="task-description" style="margin-bottom:12px;">' + escapeHtml(item.description) + '</div>' : ""; document.getElementById("qGrowLabel").innerText = item.question; const wrapper = document.getElementById("qGrowInput"); wrapper.innerHTML = '<input type="number" step="' + (item.type === "float" ? "0.01" : "1") + '" class="form-control" id="logGrowValue" placeholder="Enter numerical value">'; document.getElementById("logGrowListView").style.display = "none"; document.getElementById("logGrowQuestionView").style.display = "block"; }

        function saveGrowLog(item, date, val) { fetch("/api/grow/log", { method:"POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ itemId: item.id, dateStr: date, value: val }) }).then(res => { if(res.ok) { showToast("Progress logged!"); switchPage("grow", "Grow"); closeModal("logGrowModal"); } else throw new Error("Failed"); }).catch (err => { showToast("Failed to save progress.", "error"); }); }

        document.getElementById("saveGrowLogBtn").addEventListener("click", function() { const input = document.getElementById("logGrowValue"); if(!input || !input.value) { showToast("Please enter a valid numerical value.", "error"); return; } const {item, date} = growLogContext; saveGrowLog(item, date, item.type === "float" ? parseFloat(input.value) : parseInt(input.value)); });
        window.showGrowLogList = function() { document.getElementById("logGrowListView").style.display = "block"; document.getElementById("logGrowQuestionView").style.display = "none"; };
        window.toggleTaskPriorityMode = function(taskId) { document.querySelectorAll('.priority-mode').forEach(el => { if(el.id !== 'task_actions_' + taskId) el.classList.remove('priority-mode'); }); document.getElementById('task_actions_' + taskId).classList.add('priority-mode'); };
        window.toggleSubtaskPriorityMode = function(taskId, subtaskId) { document.querySelectorAll('.priority-mode').forEach(el => { if(el.id !== 'subtask_actions_' + taskId + '_' + subtaskId) el.classList.remove('priority-mode'); }); document.getElementById('subtask_actions_' + taskId + '_' + subtaskId).classList.add('priority-mode'); };
        window.moveTask = function(taskId, direction) { fetch('/api/tasks/' + taskId + '/move', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({direction}) }).then(res => { if(res.ok) switchPage('tasks', 'Tasks'); else throw new Error(''); }).catch(e => showToast('Error moving', 'error')); };
        window.moveSubtask = function(taskId, subtaskId, direction) { fetch('/api/tasks/' + taskId + '/subtasks/' + subtaskId + '/move', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({direction}) }).then(res => { if(res.ok) switchPage('tasks', 'Tasks'); else throw new Error(''); }).catch(e => showToast('Error moving', 'error')); };

        function renderTasksPage() {
            let html = '<div class="tasks-grid">';
            if (!tasksData || tasksData.length === 0) { html += '<div class="empty-state" style="grid-column: 1/-1;"><i class="fas fa-clipboard-list" style="font-size: 2.5rem;"></i><h3 style="margin-top: 10px; font-size:1rem;">No tasks</h3></div>'; } 
            else {
                tasksData.forEach((task) => {
                    const hasDescription = hasContent(task.description); const progress = task.subtaskProgress || 0; const circleOffset = (2 * Math.PI * 16) - (progress / 100) * (2 * Math.PI * 16);
                    const totalSubtasks = task.subtasks ? task.subtasks.length : 0; const completedSubtasks = task.subtasks ? task.subtasks.filter(s => s.completed).length : 0;
                    const descriptionId = 'task_desc_' + task.taskId; const escapedTitle = escapeHtml(task.title);
                    html += '<div class="task-card"><div class="task-header"><div class="task-title-section"><div class="task-title-container" onclick="toggleDescription(\\'' + descriptionId + '\\')" oncontextmenu="event.preventDefault(); toggleTaskPriorityMode(\\'' + task.taskId + '\\')"><i class="fas fa-chevron-right" id="' + descriptionId + '_icon"></i><span class="task-title">' + escapedTitle + '</span></div></div><div class="task-actions-wrapper" id="task_actions_' + task.taskId + '"><div class="normal-btns">';
                    if (totalSubtasks < 10) html += '<button class="action-btn" onclick="openAddSubtaskModal(\\'' + task.taskId + '\\')"><i class="fas fa-plus"></i></button>';
                    html += '<button class="action-btn" onclick="openEditTaskModal(\\'' + task.taskId + '\\')"><i class="fas fa-pencil-alt"></i></button><button class="action-btn" onclick="completeTask(\\'' + task.taskId + '\\')"><i class="fas fa-check"></i></button><button class="action-btn delete" onclick="deleteTask(\\'' + task.taskId + '\\')"><i class="fas fa-trash"></i></button></div><div class="priority-btns"><button class="action-btn" onclick="moveTask(\\'' + task.taskId + '\\', \\'up\\')"><i class="fas fa-arrow-up"></i></button><button class="action-btn" onclick="moveTask(\\'' + task.taskId + '\\', \\'down\\')"><i class="fas fa-arrow-down"></i></button></div></div></div>';
                    if (hasDescription) html += '<div id="' + descriptionId + '" class="task-description-container hidden"><div class="task-description">' + preserveLineBreaks(task.description) + '</div></div>';
                    let displayDate = task.dateIST || task.startDateStr; if (displayDate && displayDate.includes('-') && displayDate.split('-')[0].length === 4) { const parts = displayDate.split('-'); displayDate = parts[2] + '-' + parts[1] + '-' + parts[0]; }
                    html += '<div class="task-time-row"><span class="date-chip"><i class="fas fa-calendar-alt"></i> ' + displayDate + '</span><span class="time-chip"><i class="fas fa-clock"></i> ' + (task.startTimeIST || task.startTimeStr) + ' - ' + (task.endTimeIST || task.endTimeStr) + '</span></div>';
                    if (totalSubtasks > 0) {
                        html += '<details class="task-subtasks"><summary class="flex-row" style="cursor: pointer;"><div class="progress-ring-small"><svg width="36" height="36"><circle class="progress-ring-circle-small" stroke="var(--progress-bg)" stroke-width="3" fill="transparent" r="16" cx="18" cy="18"/><circle class="progress-ring-circle-small" stroke="var(--accent)" stroke-width="3" fill="transparent" r="16" cx="18" cy="18" style="stroke-dasharray: ' + (2*Math.PI*16) + '; stroke-dashoffset: ' + circleOffset + '; "/></svg><span class="progress-text-small">' + progress + '%</span></div><span style="font-size: 0.8rem; color: var(--text-secondary); font-weight:500;">' + completedSubtasks + '/' + totalSubtasks + ' subtasks</span></summary><div class="subtasks-container w-100">';
                        task.subtasks.forEach((subtask) => {
                            const subtaskDescId = 'subtask_desc_' + task.taskId + '_' + subtask.id; const escapedSubtaskTitle = escapeHtml(subtask.title);
                            html += '<div class="subtask-item"><div class="subtask-main-row"><div class="subtask-checkbox ' + (subtask.completed ? 'completed' : '') + '" onclick="toggleSubtask(event, \\'' + task.taskId + '\\', \\'' + subtask.id + '\\')">' + (subtask.completed ? '<i class="fas fa-check"></i>' : '') + '</div><div class="subtask-details"><div class="subtask-title-container" onclick="toggleDescription(\\'' + subtaskDescId + '\\')" oncontextmenu="event.preventDefault(); toggleSubtaskPriorityMode(\\'' + task.taskId + '\\', \\'' + subtask.id + '\\')"><span class="subtask-title ' + (subtask.completed ? 'completed' : '') + '">' + escapedSubtaskTitle + '</span></div></div><div class="task-actions-wrapper" id="subtask_actions_' + task.taskId + '_' + subtask.id + '"><div class="normal-btns"><button class="subtask-btn" onclick="editSubtask(\\'' + task.taskId + '\\', \\'' + subtask.id + '\\', \\'' + escapedSubtaskTitle.replace(/'/g, "\\\\'") + '\\', \\'' + escapeJsString(subtask.description || '').replace(/'/g, "\\\\'") + '\\')"><i class="fas fa-pencil-alt"></i></button><button class="subtask-btn delete" onclick="deleteSubtask(\\'' + task.taskId + '\\', \\'' + subtask.id + '\\')"><i class="fas fa-trash"></i></button></div><div class="priority-btns"><button class="subtask-btn" onclick="moveSubtask(\\'' + task.taskId + '\\', \\'' + subtask.id + '\\', \\'up\\')"><i class="fas fa-arrow-up"></i></button><button class="subtask-btn" onclick="moveSubtask(\\'' + task.taskId + '\\', \\'' + subtask.id + '\\', \\'down\\')"><i class="fas fa-arrow-down"></i></button></div></div></div>';
                            if (hasContent(subtask.description)) html += '<div id="' + subtaskDescId + '" class="subtask-description-container hidden"><div class="subtask-description">' + preserveLineBreaks(subtask.description) + '</div></div>';
                            html += '</div>';
                        }); html += '</div></details>';
                    } else { html += '<div class="flex-row" style="margin-top: 6px;"><span style="font-size: 0.8rem; font-weight:500; color: var(--text-secondary);"><i class="fas fa-tasks"></i> No subtasks</span></div>'; }
                    html += '<div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;"><span class="badge"><i class="fas fa-repeat"></i> ' + (task.repeat && task.repeat !== 'none' ? (task.repeat === 'daily' ? 'Daily' : 'Weekly') : 'No Repeat') + '</span><span class="badge"><i class="fas fa-hourglass-half"></i> ' + task.durationFormatted + '</span>';
                    if (task.repeatCount > 0) html += '<span class="badge"><i class="fas fa-hashtag"></i> ' + task.repeatCount + ' left</span>'; html += '</div></div>';
                });
            } html += '</div>'; return html;
        }

        function renderNotesPage() {
            let html = '<div class="tasks-grid">'; if (!notesData || notesData.length === 0) { html += '<div class="empty-state" style="grid-column: 1/-1;"><i class="fas fa-note-sticky" style="font-size: 2.5rem;"></i><h3 style="margin-top: 10px; font-size:1rem;">No notes</h3></div>'; } 
            else {
                notesData.forEach(note => {
                    const noteDescId = 'note_desc_' + note.noteId; const escapedNoteTitle = escapeHtml(note.title);
                    html += '<div class="note-card"><div class="note-header"><div class="task-title-container" onclick="toggleDescription(\\'' + noteDescId + '\\')"><i class="fas fa-chevron-right" id="' + noteDescId + '_icon"></i><span class="note-title">' + escapedNoteTitle + '</span></div><div style="display: flex; gap: 4px;"><button class="action-btn" onclick="moveNote(\\'' + note.noteId + '\\', \\'up\\')"><i class="fas fa-arrow-up"></i></button><button class="action-btn" onclick="moveNote(\\'' + note.noteId + '\\', \\'down\\')"><i class="fas fa-arrow-down"></i></button><button class="action-btn" onclick="openEditNoteModal(\\'' + note.noteId + '\\', \\'' + escapedNoteTitle.replace(/'/g, "\\\\'") + '\\', \\'' + escapeJsString(note.description || '').replace(/'/g, "\\\\'") + '\\')"><i class="fas fa-pencil-alt"></i></button><button class="action-btn delete" onclick="deleteNote(\\'' + note.noteId + '\\')"><i class="fas fa-trash"></i></button></div></div>';
                    if (hasContent(note.description)) html += '<div id="' + noteDescId + '" class="note-content-container hidden"><div class="note-content">' + preserveLineBreaks(note.description) + '</div></div>';
                    html += '<div class="note-meta"><span><i class="fas fa-clock"></i> ' + note.createdAtIST + '</span>' + (note.updatedAtIST !== note.createdAtIST ? '<span><i class="fas fa-pencil-alt"></i> ' + note.updatedAtIST + '</span>' : '') + '</div></div>';
                });
            } html += '</div>'; return html;
        }

        function renderHistoryPage() {
            let html = '<div class="history-header"><div class="month-selector"><button class="month-btn" onclick="changeMonth(-1)"><i class="fas fa-chevron-left"></i> Prev</button><span style="font-weight: 600; font-size:0.9rem;">' + new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' }) + ' ' + currentYear + '</span><button class="month-btn" onclick="changeMonth(1)">Next <i class="fas fa-chevron-right"></i></button></div></div><div class="history-grid">';
            const filteredHistory = filterHistoryByMonth(historyData, currentYear, currentMonth); const dates = Object.keys(filteredHistory).sort().reverse();
            if (dates.length === 0) { html += '<div class="empty-state"><i class="fas fa-history" style="font-size: 2.5rem;"></i><h3 style="margin-top: 10px; font-size:1rem;">No history</h3></div>'; } 
            else {
                dates.forEach(date => {
                    const tasks = filteredHistory[date]; let displayDateHeader = date; if (date.includes('-') && date.split('-')[0].length === 4) { const parts = date.split('-'); displayDateHeader = parts[2] + '-' + parts[1] + '-' + parts[0]; }
                    html += '<div class="history-date-card"><details class="history-details"><summary><i class="fas fa-calendar-alt"></i><span style="font-weight: 600;">' + displayDateHeader + '</span><span class="badge" style="margin-left: auto;">' + tasks.length + ' task(s)</span></summary><div class="history-tasks-grid">';
                    tasks.forEach(task => {
                        const historyDescId = 'history_desc_' + task.taskId + '_' + task.completedAt; const escapedHistoryTitle = escapeHtml(task.title);
                        html += '<div class="history-task-card"><div class="history-task-header"><div class="task-title-container" onclick="toggleDescription(\\'' + historyDescId + '\\')"><i class="fas fa-chevron-right"></i><span class="history-task-title">' + escapedHistoryTitle + '</span></div><span class="history-task-time"><i class="fas fa-check-circle" style="color: var(--success);"></i> ' + task.completedTimeIST + '</span></div>';
                        if (hasContent(task.description)) html += '<div id="' + historyDescId + '" class="history-description-container hidden"><div class="history-description">' + preserveLineBreaks(task.description) + '</div></div>';
                        html += '<div style="display: flex; gap: 6px; margin: 8px 0; flex-wrap: wrap;"><span class="badge"><i class="fas fa-clock"></i> ' + task.startTimeIST + ' - ' + task.endTimeIST + '</span><span class="badge"><i class="fas fa-hourglass-half"></i> ' + task.durationFormatted + '</span>' + (task.repeat && task.repeat !== 'none' ? '<span class="badge"><i class="fas fa-repeat"></i> ' + (task.repeat === 'daily' ? 'Daily' : 'Weekly') + '</span>' : '') + '</div>';
                        if (task.subtasks && task.subtasks.length > 0) {
                            html += '<details style="margin-top: 8px;"><summary style="cursor: pointer; color: var(--accent); font-weight: 600; font-size: 0.8rem;"><i class="fas fa-tasks"></i> Subtasks (' + task.subtasks.filter(s => s.completed).length + '/' + task.subtasks.length + ')</summary><div style="margin-top: 6px;">';
                            task.subtasks.forEach(subtask => {
                                const historySubtaskDescId = 'history_subtask_desc_' + task.taskId + '_' + task.completedAt + '_' + subtask.id; const textStyle = subtask.completed ? '' : 'text-decoration: line-through; opacity: 0.7;'; const iconClass = subtask.completed ? 'fa-check-circle' : 'fa-times-circle'; const iconColor = subtask.completed ? 'var(--success)' : 'var(--danger)';
                                html += '<div class="history-subtask"><div style="display: flex; align-items: flex-start; gap: 6px;"><span style="color: ' + iconColor + '"><i class="fas ' + iconClass + '"></i></span><div style="flex: 1;"><div class="task-title-container" onclick="toggleDescription(\\'' + historySubtaskDescId + '\\')"><span style="font-weight: 500; font-size: 0.8rem; ' + textStyle + '">' + escapeHtml(subtask.title) + '</span></div>' + (hasContent(subtask.description) ? '<div id="' + historySubtaskDescId + '" class="history-description-container hidden"><div class="history-description" style="border-left-color: var(--accent);">' + preserveLineBreaks(subtask.description) + '</div></div>' : '') + '</div></div></div>';
                            }); html += '</div></details>';
                        } html += '</div>';
                    }); html += '</div></details></div>';
                });
            } html += '</div>'; return html;
        }

        function filterHistoryByMonth(history, year, month) { const filtered = {}; Object.keys(history).forEach(dateStr => { let parts; if(dateStr.includes('-') && dateStr.split('-')[0].length === 4) parts = dateStr.split('-'); else parts = dateStr.split('-').reverse(); const yearNum = parseInt(parts[0]); const monthNum = parseInt(parts[1]); if (yearNum === year && monthNum - 1 === month) filtered[dateStr] = history[dateStr]; }); return filtered; }
        function changeMonth(delta) { currentMonth += delta; if (currentMonth < 0) { currentMonth = 11; currentYear--; } else if (currentMonth > 11) { currentMonth = 0; currentYear++; } renderPage(); }

        function openModal(modalId) { document.getElementById(modalId).style.display = 'flex'; document.body.style.overflow = 'hidden'; }
        function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; document.body.style.overflow = 'auto'; }
        function openAddModal() { if (currentPage === 'tasks') openAddTaskModal(); else if (currentPage === 'notes') openAddNoteModal(); else if (currentPage === 'grow') openAddGrowModal(); }

        function openAddTaskModal() { const istNow = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000); document.getElementById('startDate').value = istNow.getUTCFullYear() + '-' + String(istNow.getUTCMonth() + 1).padStart(2, '0') + '-' + String(istNow.getUTCDate()).padStart(2, '0'); document.getElementById('startTimeText').value = "10:00"; document.getElementById('endTimeText').value = "11:00"; openModal('addTaskModal'); }
        function openEditTaskModal(taskId) {
            fetch('/api/tasks/' + taskId).then(res => res.json()).then(task => {
                document.getElementById('editTaskId').value = task.taskId; document.getElementById('editTitle').value = task.title; document.getElementById('editDescription').value = task.description || ''; document.getElementById('editStartDate').value = task.startDateStr || task.startDateIST; 
                let s12 = parse12HFromString(task.startTimeIST || task.startTimeStr); document.getElementById('editStartTimeText').value = s12.time; document.getElementById('editStartTimeAmPm').value = s12.ampm;
                let e12 = parse12HFromString(task.endTimeIST || task.endTimeStr); document.getElementById('editEndTimeText').value = e12.time; document.getElementById('editEndTimeAmPm').value = e12.ampm;
                document.getElementById('editRepeatSelect').value = task.repeat || 'none'; document.getElementById('editRepeatCount').value = task.repeatCount || 7; document.getElementById('editRepeatCountGroup').style.display = task.repeat !== 'none' ? 'block' : 'none'; openModal('editTaskModal');
            }).catch(err => { showToast('Error loading task', 'error'); });
        }
        function parse12HFromString(str) { 
            if(!str) return {time:"12:00", ampm:"PM"};
            if(str.includes('AM') || str.includes('PM')) { const p=str.split(' '); return {time: p[0], ampm: p[1]}; }
            let [h, m] = str.split(':'); h = parseInt(h); let ampm = h >= 12 ? 'PM' : 'AM'; h = h % 12; h = h ? h : 12; return {time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, ampm};
        }

        function openAddSubtaskModal(taskId) { document.getElementById('subtaskTaskId').value = taskId; openModal('addSubtaskModal'); }
        function editSubtask(taskId, subtaskId, title, description) { document.getElementById('editSubtaskTaskId').value = taskId; document.getElementById('editSubtaskId').value = subtaskId; document.getElementById('editSubtaskTitle').value = title; document.getElementById('editSubtaskDescription').value = description || ''; openModal('editSubtaskModal'); }
        function openAddNoteModal() { openModal('addNoteModal'); }
        function openEditNoteModal(noteId, title, description) { document.getElementById('editNoteId').value = noteId; document.getElementById('editNoteTitle').value = title; document.getElementById('editNoteDescription').value = description || ''; openModal('editNoteModal'); }

        function submitTaskForm(event) { event.preventDefault(); fetch('/api/tasks', { method: 'POST', body: new URLSearchParams(new FormData(event.target)) }).then(res => { if(res.ok){ closeModal('addTaskModal'); showToast('Task created!'); switchPage('tasks', 'Tasks'); } else { return res.text().then(t => {throw new Error(t);}); } }).catch(err => { showToast(err.message || 'Error creating task', 'error'); }); }
        function submitEditTaskForm(event) { event.preventDefault(); fetch('/api/tasks/' + new FormData(event.target).get('taskId') + '/update', { method: 'POST', body: new URLSearchParams(new FormData(event.target)) }).then(res => { if(res.ok){ closeModal('editTaskModal'); showToast('Task updated!'); switchPage('tasks', 'Tasks'); } else { return res.text().then(t => {throw new Error(t);}); } }).catch(err => { showToast(err.message || 'Error updating task', 'error'); }); }
        function submitSubtaskForm(event) { event.preventDefault(); fetch('/api/tasks/' + new FormData(event.target).get('taskId') + '/subtasks', { method: 'POST', body: new URLSearchParams(new FormData(event.target)) }).then(res => { if(res.ok){ closeModal('addSubtaskModal'); showToast('Subtask added!'); switchPage('tasks', 'Tasks'); } else throw new Error(''); }).catch(err => { showToast('Error adding subtask', 'error'); }); }
        function submitEditSubtaskForm(event) { event.preventDefault(); fetch('/api/tasks/' + new FormData(event.target).get('taskId') + '/subtasks/' + new FormData(event.target).get('subtaskId') + '/update', { method: 'POST', body: new URLSearchParams(new FormData(event.target)) }).then(res => { if(res.ok){ closeModal('editSubtaskModal'); showToast('Subtask updated!'); switchPage('tasks', 'Tasks'); } else throw new Error(''); }).catch(err => { showToast('Error updating subtask', 'error'); }); }
        function submitNoteForm(event) { event.preventDefault(); fetch('/api/notes', { method: 'POST', body: new URLSearchParams(new FormData(event.target)) }).then(res => { if(res.ok){ closeModal('addNoteModal'); showToast('Note created!'); switchPage('notes', 'Notes'); } else throw new Error(''); }).catch(err => { showToast('Error creating note', 'error'); }); }
        function submitEditNoteForm(event) { event.preventDefault(); fetch('/api/notes/' + new FormData(event.target).get('noteId') + '/update', { method: 'POST', body: new URLSearchParams(new FormData(event.target)) }).then(res => { if(res.ok){ closeModal('editNoteModal'); showToast('Note updated!'); switchPage('notes', 'Notes'); } else throw new Error(''); }).catch(err => { showToast('Error updating note', 'error'); }); }
        
        function toggleSubtask(event, taskId, subtaskId) { 
            if (event) event.stopPropagation();
            const task = tasksData.find(t => t.taskId === taskId);
            if (task) { const sub = (task.subtasks || []).find(s => s.id === subtaskId); if (sub) sub.completed = !sub.completed; task.subtaskProgress = task.subtasks.length > 0 ? Math.round((task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100) : 0; renderPage(); }
            fetch('/api/tasks/' + taskId + '/subtasks/' + subtaskId + '/toggle', { method: 'POST' }).then(res => res.json()).then(data => { 
                if(data.taskCompleted) { showToast('Task auto-completed!'); switchPage('tasks', 'Tasks'); } 
                else { fetch('/api/page/tasks').then(r=>r.json()).then(d => { if(d.tasks) tasksData = d.tasks; renderPage(); }); }
            }).catch(err => { showToast('Error toggling', 'error'); }); 
        }
        
        function deleteSubtask(taskId, subtaskId) { if (!confirm('Delete this subtask?')) return; fetch('/api/tasks/' + taskId + '/subtasks/' + subtaskId + '/delete', { method: 'POST' }).then(res => { if(res.ok){ showToast('Subtask deleted'); switchPage('tasks', 'Tasks'); } else throw new Error(''); }).catch(err => { showToast('Error deleting', 'error'); }); }
        function completeTask(taskId) { if (!confirm('Complete this task?')) return; tasksData = tasksData.filter(t => t.taskId !== taskId); renderPage(); fetch('/api/tasks/' + taskId + '/complete', { method: 'POST' }).then(res => { if(res.ok){ showToast('Task completed!'); fetch('/api/page/tasks').then(r=>r.json()).then(d => { if(d.tasks) tasksData = d.tasks; renderPage(); }); } else { return res.text().then(t => {throw new Error(t);}); } }).catch(err => { showToast(err.message || 'Error completing task', 'error'); }); }
        function deleteTask(taskId) { if (!confirm('Delete this task?')) return; fetch('/api/tasks/' + taskId + '/delete', { method: 'POST' }).then(res => { if(res.ok){ showToast('Task deleted'); switchPage('tasks', 'Tasks'); } else throw new Error(''); }).catch(err => { showToast('Error deleting', 'error'); }); }
        function deleteNote(noteId) { if (!confirm('Delete this note?')) return; fetch('/api/notes/' + noteId + '/delete', { method: 'POST' }).then(res => { if(res.ok){ showToast('Note deleted'); switchPage('notes', 'Notes'); } else throw new Error(''); }).catch(err => { showToast('Error deleting', 'error'); }); }
        function moveNote(noteId, direction) { const formData = new FormData(); formData.append('direction', direction); fetch('/api/notes/' + noteId + '/move', { method: 'POST', body: new URLSearchParams(formData) }).then(res => { if(res.ok){ switchPage('notes', 'Notes'); } else throw new Error(''); }).catch(err => { showToast('Error moving', 'error'); }); }

        document.addEventListener('DOMContentLoaded', function() {
            let gIst = getGrowIST(); growToday = gIst.date; growMonth = gIst.month; growYear = gIst.year;
            document.getElementById('pageTitleDisplay').innerText = currentPage.charAt(0).toUpperCase() + currentPage.slice(1);
            renderPage(); updateActiveNav();
            setInterval(() => { const now = new Date(); const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000); const t12 = parse12HFromString(`${String(istNow.getUTCHours()).padStart(2, '0')}:${String(istNow.getUTCMinutes()).padStart(2, '0')}`); document.getElementById('currentTimeDisplay').innerHTML = `${t12.time} ${t12.ampm}`; document.getElementById('currentDateDisplay').innerHTML = String(istNow.getUTCDate()).padStart(2, '0') + '-' + String(istNow.getUTCMonth() + 1).padStart(2, '0') + '-' + istNow.getUTCFullYear(); }, 1000);
            document.getElementById('repeatSelect').addEventListener('change', function() { document.getElementById('repeatCountGroup').style.display = this.value === 'none' ? 'none' : 'block'; }); document.getElementById('editRepeatSelect').addEventListener('change', function() { document.getElementById('editRepeatCountGroup').style.display = this.value === 'none' ? 'none' : 'block'; });
            window.addEventListener('click', function(event) { 
                if (event.target.classList.contains('modal')) { event.target.style.display = 'none'; document.body.style.overflow = 'auto'; } 
                if(!event.target.closest(".grow-day") && !event.target.closest(".grow-bubble")) { hideGrowBubble(); }
                if (!event.target.closest('.task-title-container') && !event.target.closest('.priority-btns')) { document.querySelectorAll('.priority-mode').forEach(el => el.classList.remove('priority-mode')); }
                if (!event.target.closest('.settings-dropdown') && !event.target.closest('.settings-btn')) { document.getElementById('settingsDropdown').classList.remove('show'); }
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
            if (!s) { await db.collection('settings').insertOne({ _id: 'bot_config', reminders: true, hourly: true, alerts: true, theme: 'light' }); } 
            else { globalSettings = { reminders: s.reminders!==false, hourly: s.hourly!==false, alerts: s.alerts!==false, theme: s.theme||'light' }; }
            return true;
        } catch (error) { retries--; if (retries === 0) return false; await new Promise(resolve => setTimeout(resolve, 5000)); }
    }
    return false;
}

// ==========================================
// 🛠️ UTILITY FUNCTIONS
// ==========================================
function generateId(type = 'task') { return type.charAt(0) + Math.random().toString(36).substring(2, 10); }
function generateSubtaskId() { return 'sub_' + Date.now().toString(36); }
function calculateDuration(startDate, endDate) { if (!startDate || !endDate) return 0; return Math.round((endDate - startDate) / 60000); }
function formatDuration(minutes) { if (isNaN(minutes) || minutes < 0) return '0 mins'; const hours = Math.floor(minutes / 60); const mins = minutes % 60; if (hours === 0) return mins + ' mins'; if (mins === 0) return hours + ' hours'; return hours + 'h ' + mins + 'm'; }
function calculateSubtaskProgress(subtasks) { if (!subtasks || subtasks.length === 0) return 0; return Math.round((subtasks.filter(s => s.completed).length / subtasks.length) * 100); }
async function sendAlert(message) { if(globalSettings.alerts) { try { await bot.telegram.sendMessage(CHAT_ID, message, { parse_mode: 'HTML' }); } catch(e){} } }

// ==========================================
// 🤖 BOT SETUP & SCHEDULERS
// ==========================================
const bot = new Telegraf(BOT_TOKEN);
const activeSchedules = new Map();
let isShuttingDown = false, activeReminderMessageIds = [], currentReminderTaskId = null;

bot.use(async (ctx, next) => { if (ctx.from && String(ctx.from.id) !== String(CHAT_ID)) return ctx.reply('🚫 Restricted access.'); return next(); });

async function sendStartMenu(ctx) {
    try {
        const istDateObj = getCurrentISTDisplay(); const startOfDayUTC = istToUTC(istDateObj.date, "00:00"); const endOfDayUTC = istToUTC(istDateObj.date, "23:59");
        const pendingTasks = await db.collection('tasks').find({ status: 'pending', nextOccurrence: { $gte: startOfDayUTC, $lt: endOfDayUTC } }).sort({ orderIndex: 1 }).toArray();
        const todayHistory = await db.collection('history').find({ completedDateStr: istDateObj.displayDate }).toArray(); const completedTaskIds = [...new Set(todayHistory.map(h => h.taskId))];
        let completedTasks = [];
        if (completedTaskIds.length > 0) {
            const activeC = await db.collection('tasks').find({ taskId: { $in: completedTaskIds } }).toArray(); const deletedC = await db.collection('deleted_tasks').find({ taskId: { $in: completedTaskIds } }).toArray();
            const combined = {}; activeC.forEach(t => combined[t.taskId] = t); deletedC.forEach(t => { if (!combined[t.taskId]) combined[t.taskId] = t; });
            completedTasks = Object.values(combined).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        }
        const total = pendingTasks.length + completedTasks.length; let percentage = total > 0 ? Math.round((completedTasks.length / total) * 100) : 0;
        const filledCount = Math.round(percentage / 10); const progressBar = total > 0 ? '▰'.repeat(filledCount) + '▱'.repeat(10 - filledCount) : '▱▱▱▱▱▱▱▱▱▱'; 
        let msg = `🌟 <b>Welcome, ${ctx.from.first_name || 'Admin'}!</b>\n\n📊 <b>Progress:</b> ${progressBar} ${percentage}%\n🎯 <b>You have completed <i>${completedTasks.length}/${total}</i> tasks yet.</b>\n`;
        if (total > 0) {
            msg += `<blockquote expandable>\n`;
            completedTasks.forEach(t => msg += `✅ ${escapeHTML(t.title)} (${convert24to12(t.startTimeStr).full} - ${convert24to12(t.endTimeStr).full})\n`);
            pendingTasks.forEach(t => msg += `❌ ${escapeHTML(t.title)} (${convert24to12(t.startTimeStr).full} - ${convert24to12(t.endTimeStr).full})\n`);
            msg += `</blockquote>\n`;
        }
        msg += `🔔 Hourly: ${globalSettings.hourly ? '🟢 ON' : '🔴 OFF'} | ⏰ Reminders: ${globalSettings.reminders ? '🟢 ON' : '🔴 OFF'}\n📢 Alerts: ${globalSettings.alerts ? '🟢 ON' : '🔴 OFF'}`;
        const kb = Markup.inlineKeyboard([[ Markup.button.webApp('🌐 Open Mini App', WEB_APP_URL) ], [ Markup.button.callback('⚙️ Settings', 'open_settings') ]]);
        if (ctx.callbackQuery) await ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: kb.reply_markup }); else await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb.reply_markup });
    } catch (err) { console.error("Start Menu Error:", err); }
}

bot.command('start', sendStartMenu);
bot.action('open_settings', async (ctx) => {
    const kb = Markup.inlineKeyboard([[ Markup.button.callback(globalSettings.reminders ? '🟢 Reminders: ON' : '🔴 Reminders: OFF', 'toggle_reminders') ], [ Markup.button.callback(globalSettings.hourly ? '🟢 Hourly Notifications: ON' : '🔴 Hourly Notifications: OFF', 'toggle_hourly') ], [ Markup.button.callback(globalSettings.alerts ? '🟢 Alerts: ON' : '🔴 Alerts: OFF', 'toggle_alerts') ], [ Markup.button.callback('⬅️ Back', 'back_start') ]]);
    await ctx.editMessageText('⚙️ <b>Bot Settings</b>\nConfigure your automated notifications:', { parse_mode: 'HTML', reply_markup: kb.reply_markup });
});
bot.action('back_start', sendStartMenu);
bot.action('toggle_reminders', async (ctx) => { globalSettings.reminders = !globalSettings.reminders; await db.collection('settings').updateOne({ _id: 'bot_config' }, { $set: { reminders: globalSettings.reminders } }, { upsert: true }); await bot.handleUpdate({ ...ctx.update, callback_query: { ...ctx.callbackQuery, data: 'open_settings' }}); });
bot.action('toggle_hourly', async (ctx) => { globalSettings.hourly = !globalSettings.hourly; await db.collection('settings').updateOne({ _id: 'bot_config' }, { $set: { hourly: globalSettings.hourly } }, { upsert: true }); await bot.handleUpdate({ ...ctx.update, callback_query: { ...ctx.callbackQuery, data: 'open_settings' }}); });
bot.action('toggle_alerts', async (ctx) => { globalSettings.alerts = !globalSettings.alerts; await db.collection('settings').updateOne({ _id: 'bot_config' }, { $set: { alerts: globalSettings.alerts } }, { upsert: true }); await bot.handleUpdate({ ...ctx.update, callback_query: { ...ctx.callbackQuery, data: 'open_settings' }}); });

function scheduleTask(task) {
    if (!task || !task.taskId || !task.nextOccurrence) return;
    try {
        const taskId = task.taskId; const targetTimeUTC = new Date(task.nextOccurrence); const nowUTC = new Date(); cancelTaskSchedule(taskId);
        if (targetTimeUTC <= nowUTC) return; const notifyTimeUTC = new Date(targetTimeUTC.getTime() - 10 * 60000); const triggerDateUTC = notifyTimeUTC > nowUTC ? notifyTimeUTC : nowUTC;
        const startJob = schedule.scheduleJob(triggerDateUTC, async function() {
            if (isShuttingDown || !globalSettings.reminders) return;
            let count = 0; const maxNotifications = 10;
            const sendNotification = async () => {
                if (isShuttingDown || !globalSettings.reminders) return; const currentTimeUTC = new Date();
                if (currentReminderTaskId !== taskId) { for (const msgId of activeReminderMessageIds) { try { await bot.telegram.deleteMessage(CHAT_ID, msgId); } catch(e){} } activeReminderMessageIds = []; currentReminderTaskId = taskId; }
                if (currentTimeUTC >= targetTimeUTC || count >= maxNotifications) {
                    const activeSchedule = activeSchedules.get(taskId); if (activeSchedule && activeSchedule.interval) { clearInterval(activeSchedule.interval); activeSchedule.interval = null; }
                    if (currentTimeUTC >= targetTimeUTC) { try { const sent = await bot.telegram.sendMessage(CHAT_ID, `🚀 <b>START NOW:</b> ${escapeHTML(task.title)}\n🕒 <b>Time:</b> ${convert24to12(task.startTimeStr).full} to ${convert24to12(task.endTimeStr).full}`, { parse_mode: 'HTML' }); activeReminderMessageIds.push(sent.message_id); } catch (e) {} }
                    return;
                }
                const minutesLeft = Math.ceil((targetTimeUTC - currentTimeUTC) / 60000);
                if (minutesLeft > 0) { try { const sent = await bot.telegram.sendMessage(CHAT_ID, `🔔 <b>In ${minutesLeft}m:</b> ${escapeHTML(task.title)}\n🕒 <b>Time:</b> ${convert24to12(task.startTimeStr).full} to ${convert24to12(task.endTimeStr).full}`, { parse_mode: 'HTML' }); activeReminderMessageIds.push(sent.message_id); } catch (e) {} }
                count++;
            };
            await sendNotification();
            if(globalSettings.reminders) {
                const interval = setInterval(sendNotification, 60000);
                if (activeSchedules.has(taskId)) { if (activeSchedules.get(taskId).interval) clearInterval(activeSchedules.get(taskId).interval); activeSchedules.get(taskId).interval = interval; } else { activeSchedules.set(taskId, { startJob, interval }); }
            }
        });
        if (activeSchedules.has(taskId)) { if (activeSchedules.get(taskId).startJob) activeSchedules.get(taskId).startJob.cancel(); activeSchedules.get(taskId).startJob = startJob; } else { activeSchedules.set(taskId, { startJob }); }
    } catch (error) {}
}

function cancelTaskSchedule(taskId) { if (activeSchedules.has(taskId)) { const s = activeSchedules.get(taskId); if (s.startJob) try { s.startJob.cancel(); } catch (e) {} if (s.interval) try { clearInterval(s.interval); } catch (e) {} activeSchedules.delete(taskId); } }
async function rescheduleAllPending() { try { const tasks = await db.collection('tasks').find({ status: 'pending', nextOccurrence: { $gt: new Date() } }).toArray(); tasks.forEach(task => scheduleTask(task)); } catch (error) {} }

async function completeTaskLogic(task, istNow) {
    await db.collection('history').insertOne({ taskId: task.taskId, completedAt: new Date(), completedDateStr: istNow.displayDate, completedTimeStr: istNow.displayTime, status: 'completed', subtasks: task.subtasks || [] });
    cancelTaskSchedule(task.taskId);
    if (task.repeat !== 'none' && task.repeatCount > 0) {
        const nextUTC = new Date(task.nextOccurrence); nextUTC.setUTCDate(nextUTC.getUTCDate() + (task.repeat === 'weekly' ? 7 : 1));
        const nextISTDisplay = formatLegacyIST(nextUTC, 'date');
        await db.collection('tasks').updateOne({ taskId: task.taskId }, { $set: { nextOccurrence: nextUTC, repeatCount: task.repeatCount - 1, startDate: nextUTC, startDateStr: nextISTDisplay, endDate: new Date(nextUTC.getTime() + (task.endDate.getTime() - task.startDate.getTime())), subtasks: (task.subtasks || []).map(s => ({...s, completed: false})) } });
        const t = await db.collection('tasks').findOne({ taskId: task.taskId }); if (t && t.nextOccurrence > new Date()) scheduleTask(t);
        return false; // Repeated, not deleted completely
    } else {
        await db.collection('deleted_tasks').insertOne({ ...task, deletedAt: new Date(), deleteReason: 'completed' });
        await db.collection('tasks').deleteOne({ taskId: task.taskId });
        return true; // Deleted completely
    }
}

function setupAutoCompletion() {
    const rule = new schedule.RecurrenceRule(); rule.hour = 23; rule.minute = 57; rule.tz = 'Asia/Kolkata';
    schedule.scheduleJob(rule, async function() {
        if (isShuttingDown) return;
        try {
            const istDateObj = getCurrentISTDisplay(); const startOfDayUTC = istToUTC(istDateObj.date, "00:00"); const endOfDayUTC = istToUTC(istDateObj.date, "23:59");
            const pendingTasks = await db.collection('tasks').find({ status: 'pending', nextOccurrence: { $gte: startOfDayUTC, $lt: endOfDayUTC } }).toArray();
            for (const task of pendingTasks) { await completeTaskLogic(task, istDateObj); }
        } catch (error) { console.error('❌ Auto-completion Error:', error); }
    });
}

function setupHourlyNotifications() {
    const rule = new schedule.RecurrenceRule(); rule.minute = 0; rule.hour = new schedule.Range(8, 23); rule.tz = 'Asia/Kolkata';
    schedule.scheduleJob(rule, async function() {
        if (isShuttingDown || !globalSettings.hourly) return;
        try {
            const istDateObj = getCurrentISTDisplay(); const startOfDayUTC = istToUTC(istDateObj.date, "00:00"); const endOfDayUTC = istToUTC(istDateObj.date, "23:59");
            const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; const dayOfWeek = daysOfWeek[new Date(Date.now() + IST_OFFSET_MS).getUTCDay()];
            const pendingTasks = await db.collection('tasks').find({ status: 'pending', nextOccurrence: { $gte: startOfDayUTC, $lt: endOfDayUTC } }).sort({ orderIndex: 1 }).toArray();
            const todayHistory = await db.collection('history').find({ completedDateStr: istDateObj.displayDate }).toArray(); const completedTaskIds = [...new Set(todayHistory.map(h => h.taskId))];
            let completedTasks = [];
            if (completedTaskIds.length > 0) {
                const activeC = await db.collection('tasks').find({ taskId: { $in: completedTaskIds } }).toArray(); const deletedC = await db.collection('deleted_tasks').find({ taskId: { $in: completedTaskIds } }).toArray();
                const combined = {}; activeC.forEach(t => combined[t.taskId] = t); deletedC.forEach(t => { if (!combined[t.taskId]) combined[t.taskId] = t; }); completedTasks = Object.values(combined).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
            }
            if (pendingTasks.length + completedTasks.length === 0) return;
            let msg = `🕒 <b>Hourly Status Update</b>\n📅 ${istDateObj.displayDate} - ${dayOfWeek}\n🎯 You have completed <i>${completedTasks.length}/${pendingTasks.length + completedTasks.length}</i> tasks today.\n\n<blockquote expandable>\n`;
            completedTasks.forEach(t => { msg += `✅ ${escapeHTML(t.title)} (${convert24to12(t.startTimeStr).full} - ${convert24to12(t.endTimeStr).full})\n`; });
            pendingTasks.forEach(t => { msg += `❌ ${escapeHTML(t.title)} (${convert24to12(t.startTimeStr).full} - ${convert24to12(t.endTimeStr).full})\n`; }); msg += `</blockquote>`;
            await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' });
        } catch (e) {}
    });
}

async function getHydratedHistory() {
    const historyList = await db.collection('history').find().sort({ completedAt: -1 }).limit(500).toArray(); if (historyList.length === 0) return {};
    const taskIds = [...new Set(historyList.map(h => h.taskId))]; const activeTasks = await db.collection('tasks').find({ taskId: { $in: taskIds } }).toArray(); const deletedTasks = await db.collection('deleted_tasks').find({ taskId: { $in: taskIds } }).toArray();
    const taskDict = {}; activeTasks.forEach(t => taskDict[t.taskId] = t); deletedTasks.forEach(t => { if (!taskDict[t.taskId]) taskDict[t.taskId] = t; });
    const groupedHistory = {};
    historyList.forEach(item => {
        const baseTask = taskDict[item.taskId] || { title: 'Deleted Task', description: '', startTimeStr: '??:??', endTimeStr: '??:??' }; const combined = { ...baseTask, ...item }; 
        const dateKey = combined.completedDateStr || formatLegacyIST(combined.completedAt, 'date'); if (!groupedHistory[dateKey]) groupedHistory[dateKey] = [];
        groupedHistory[dateKey].push({ ...combined, completedTimeIST: combined.completedTimeStr || formatLegacyIST(combined.completedAt, 'time'), startTimeIST: convert24to12(combined.startTimeStr).full, endTimeIST: convert24to12(combined.endTimeStr).full, durationFormatted: formatDuration(calculateDuration(combined.startDate, combined.endDate)) });
    });
    return groupedHistory;
}

// ==========================================
// 📱 WEB INTERFACE ROUTES
// ==========================================
app.get('/', (req, res) => res.redirect('/tasks'));

app.get('/tasks', async (req, res) => {
    try {
        const istDateObj = getCurrentISTDisplay(); const startOfDayUTC = istToUTC(istDateObj.date, "00:00"); const endOfDayUTC = istToUTC(istDateObj.date, "23:59");
        const tasks = await db.collection('tasks').find({ status: 'pending', nextOccurrence: { $gte: startOfDayUTC, $lt: endOfDayUTC } }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray();
        res.render('index', { currentPage: 'tasks', tasks: tasks.map(task => ({ ...task, taskId: task.taskId, startTimeIST: convert24to12(task.startTimeStr).full, endTimeIST: convert24to12(task.endTimeStr).full, dateIST: task.startDateStr || formatLegacyIST(task.startDate, 'date'), durationFormatted: formatDuration(calculateDuration(task.startDate, task.endDate)), subtaskProgress: calculateSubtaskProgress(task.subtasks), subtasks: task.subtasks || [] })), notes: [], groupedHistory: {}, growData: {items: [], progress: {}}, currentTime: istDateObj.displayTime, currentDate: istDateObj.displayDate, settings: globalSettings });
    } catch (error) { res.status(500).send("Server Error"); }
});

app.get('/grow', async (req, res) => {
    try {
        const istDateObj = getCurrentISTDisplay(); const items = await db.collection('grow').find().toArray(); const progress = {};
        items.forEach(i => { if(i.progress) { for(const [d, v] of Object.entries(i.progress)) { if(!progress[d]) progress[d] = {}; progress[d][i.id] = v; } } });
        res.render('index', { currentPage: 'grow', tasks: [], notes: [], groupedHistory: {}, growData: {items, progress}, currentTime: istDateObj.displayTime, currentDate: istDateObj.displayDate, settings: globalSettings });
    } catch (error) { res.status(500).send("Server Error"); }
});

app.get('/notes', async (req, res) => {
    try {
        const notes = await db.collection('notes').find().sort({ orderIndex: 1, createdAt: -1 }).toArray(); const istDateObj = getCurrentISTDisplay();
        res.render('index', { currentPage: 'notes', tasks: [], notes: notes.map(n => ({ ...n, createdAtIST: formatLegacyIST(n.createdAt, 'date') + ' ' + formatLegacyIST(n.createdAt, 'time'), updatedAtIST: n.updatedAt ? formatLegacyIST(n.updatedAt, 'date') + ' ' + formatLegacyIST(n.updatedAt, 'time') : '' })), groupedHistory: {}, growData: {items: [], progress: {}}, currentTime: istDateObj.displayTime, currentDate: istDateObj.displayDate, settings: globalSettings });
    } catch (error) { res.status(500).send("Server Error"); }
});

app.get('/history', async (req, res) => {
    try { const groupedHistory = await getHydratedHistory(); const istDateObj = getCurrentISTDisplay(); res.render('index', { currentPage: 'history', tasks: [], notes: [], groupedHistory, growData: {items: [], progress: {}}, currentTime: istDateObj.displayTime, currentDate: istDateObj.displayDate, settings: globalSettings }); } catch (error) { res.status(500).send("Server Error"); }
});

app.get('/api/page/:page', async (req, res) => {
    try {
        const page = req.params.page;
        if (page === 'tasks') {
            const istDateObj = getCurrentISTDisplay(); const startOfDayUTC = istToUTC(istDateObj.date, "00:00"); const endOfDayUTC = istToUTC(istDateObj.date, "23:59");
            const tasks = await db.collection('tasks').find({ status: 'pending', nextOccurrence: { $gte: startOfDayUTC, $lt: endOfDayUTC } }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray();
            res.json({ tasks: tasks.map(t => ({ ...t, startTimeIST: convert24to12(t.startTimeStr).full, endTimeIST: convert24to12(t.endTimeStr).full, dateIST: t.startDateStr || formatLegacyIST(t.startDate, 'date'), durationFormatted: formatDuration(calculateDuration(t.startDate, t.endDate)), subtaskProgress: calculateSubtaskProgress(t.subtasks) })) });
        } else if (page === 'grow') {
            const items = await db.collection('grow').find().toArray(); const progress = {}; items.forEach(i => { if(i.progress) { for(const [d, v] of Object.entries(i.progress)) { if(!progress[d]) progress[d] = {}; progress[d][i.id] = v; } } }); res.json({ growData: { items, progress } });
        } else if (page === 'notes') {
            const notes = await db.collection('notes').find().sort({ orderIndex: 1, createdAt: -1 }).toArray(); res.json({ notes: notes.map(n => ({ ...n, createdAtIST: formatLegacyIST(n.createdAt, 'date') + ' ' + formatLegacyIST(n.createdAt, 'time'), updatedAtIST: n.updatedAt ? formatLegacyIST(n.updatedAt, 'date') + ' ' + formatLegacyIST(n.updatedAt, 'time') : '' })) });
        } else if (page === 'history') { const groupedHistory = await getHydratedHistory(); res.json({ groupedHistory }); } else { res.status(404).json({ error: 'Not found' }); }
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/settings/toggle', async (req, res) => {
    try {
        const { key } = req.body; if(!['theme','alerts','hourly','reminders'].includes(key)) return res.status(400).send();
        if(key === 'theme') { globalSettings.theme = globalSettings.theme === 'dark' ? 'light' : 'dark'; } else { globalSettings[key] = !globalSettings[key]; }
        await db.collection('settings').updateOne({ _id: 'bot_config' }, { $set: { [key]: globalSettings[key] } }, { upsert: true });
        res.json({ success: true, val: globalSettings[key] });
    } catch (e) { res.status(500).send(); }
});

// ==========================================
// 🌱 GROW BACKEND ROUTES
// ==========================================
app.post('/api/grow', async (req, res) => {
    try {
        const { title, description, startDate, endCount, color, hasData, type, question, start, end } = req.body;
        const item = { id: generateId('g'), title, description: description || '', startDate, endCount: parseInt(endCount), color, hasData: hasData === true, type: hasData ? type : 'boolean', progress: {} };
        if (item.hasData) { item.question = question || ''; if (start !== undefined && start !== '') item.start = type === 'float' ? parseFloat(start) : parseInt(start); if (end !== undefined && end !== '') item.end = type === 'float' ? parseFloat(end) : parseInt(end); }
        await db.collection('grow').insertOne(item); sendAlert(`🌱 <b>Grow Tracker Added:</b> ${escapeHTML(title)}`); res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/grow/:id/update', async (req, res) => {
    try {
        const { id, title, description, startDate, endCount, color, hasData, type, question, start, end } = req.body;
        const currentItem = await db.collection('grow').findOne({ id }); if (currentItem && currentItem.color !== color) { const conflictingItem = await db.collection('grow').findOne({ id: { $ne: id }, color }); if (conflictingItem) { await db.collection('grow').updateOne({ id: conflictingItem.id }, { $set: { color: currentItem.color } }); } }
        const updatedFields = { title, description: description || '', startDate, endCount: parseInt(endCount), color, hasData: hasData === true, type: hasData ? type : 'boolean' };
        if (updatedFields.hasData) { updatedFields.question = question || ''; if (start !== undefined && start !== '') updatedFields.start = type === 'float' ? parseFloat(start) : parseInt(start); if (end !== undefined && end !== '') updatedFields.end = type === 'float' ? parseFloat(end) : parseInt(end); }
        await db.collection('grow').updateOne({ id: req.params.id }, { $set: updatedFields }); sendAlert(`🌱 <b>Grow Tracker Edited:</b> ${escapeHTML(title)}`); res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/grow/:id/delete', async (req, res) => {
    try { const item = await db.collection('grow').findOne({ id: req.params.id }); await db.collection('grow').deleteOne({ id: req.params.id }); sendAlert(`🗑️ <b>Grow Tracker Deleted:</b> ${item ? escapeHTML(item.title) : 'Unknown'}`); res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/grow/log', async (req, res) => {
    try { const { itemId, dateStr, value } = req.body; const item = await db.collection('grow').findOne({ id: itemId }); await db.collection('grow').updateOne({ id: itemId }, { $set: { [`progress.${dateStr}`]: value } }); sendAlert(`✅ <b>Grow Logged:</b> ${item ? escapeHTML(item.title) : 'Unknown'} for ${dateStr}`); res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); }
});

// ==========================================
// 🚀 TASKS / NOTES BACKEND ROUTES
// ==========================================
app.get('/api/tasks/:taskId', async (req, res) => {
    try { const task = await db.collection('tasks').findOne({ taskId: req.params.taskId }); if (!task) return res.status(404).json({ error: 'Not found' }); res.json({ ...task, startDateIST: task.startDateStr || formatLegacyIST(task.startDate, 'date'), startTimeIST: convert24to12(task.startTimeStr).full, endTimeIST: convert24to12(task.endTimeStr).full }); } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/tasks', async (req, res) => {
    try {
        const { title, description, startDate, startTimeText, startTimeAmPm, endTimeText, endTimeAmPm, repeat, repeatCount } = req.body;
        const startTime24 = convert12to24(startTimeText, startTimeAmPm); const endTime24 = convert12to24(endTimeText, endTimeAmPm);
        const startDateUTC = istToUTC(startDate, startTime24); const endDateUTC = istToUTC(startDate, endTime24);
        if (!startDateUTC || !endDateUTC || endDateUTC <= startDateUTC) return res.status(400).send('End time must be after start time.');
        
        const task = { taskId: generateId('t'), title: title.trim(), description: description ? description.trim() : '', startDate: startDateUTC, endDate: endDateUTC, nextOccurrence: startDateUTC, status: 'pending', repeat: repeat || 'none', repeatCount: repeat && repeat !== 'none' ? (parseInt(repeatCount) || 7) : 0, subtasks: [], createdAt: new Date(), orderIndex: (await db.collection('tasks').countDocuments()) || 0, startTimeStr: startTime24, endTimeStr: endTime24, startDateStr: startDate };
        await db.collection('tasks').insertOne(task); if (task.startDate > new Date()) scheduleTask(task); sendAlert(`➕ <b>Task Added:</b> ${escapeHTML(title)}`); res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/update', async (req, res) => {
    try {
        const { title, description, startDate, startTimeText, startTimeAmPm, endTimeText, endTimeAmPm, repeat, repeatCount } = req.body;
        const startTime24 = convert12to24(startTimeText, startTimeAmPm); const endTime24 = convert12to24(endTimeText, endTimeAmPm);
        const startDateUTC = istToUTC(startDate, startTime24); const endDateUTC = istToUTC(startDate, endTime24);
        if (!startDateUTC || endDateUTC <= startDateUTC) return res.status(400).send('End time must be after start time.');
        cancelTaskSchedule(req.params.taskId);
        await db.collection('tasks').updateOne({ taskId: req.params.taskId }, { $set: { title: title.trim(), description: description ? description.trim() : '', startDate: startDateUTC, endDate: endDateUTC, nextOccurrence: startDateUTC, repeat: repeat || 'none', repeatCount: repeat && repeat !== 'none' ? (parseInt(repeatCount) || 7) : 0, startTimeStr: startTime24, endTimeStr: endTime24, startDateStr: startDate, updatedAt: new Date() } });
        const t = await db.collection('tasks').findOne({ taskId: req.params.taskId }); if (t && t.nextOccurrence > new Date()) scheduleTask(t); sendAlert(`✏️ <b>Task Edited:</b> ${escapeHTML(title)}`); res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/complete', async (req, res) => {
    try {
        const task = await db.collection('tasks').findOne({ taskId: req.params.taskId }); if (!task) return res.status(400).send('Task not found');
        await completeTaskLogic(task, getCurrentISTDisplay()); sendAlert(`✅ <b>Task Completed:</b> ${escapeHTML(task.title)}`); res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/move', async (req, res) => {
    try { const { direction } = req.body; const tasks = await db.collection('tasks').find({ status: 'pending' }).sort({ orderIndex: 1 }).toArray(); const idx = tasks.findIndex(t => t.taskId === req.params.taskId); if (direction === 'up' && idx > 0) { await db.collection('tasks').updateOne({ taskId: tasks[idx].taskId }, { $set: { orderIndex: tasks[idx-1].orderIndex } }); await db.collection('tasks').updateOne({ taskId: tasks[idx-1].taskId }, { $set: { orderIndex: tasks[idx].orderIndex } }); } else if (direction === 'down' && idx < tasks.length - 1) { await db.collection('tasks').updateOne({ taskId: tasks[idx].taskId }, { $set: { orderIndex: tasks[idx+1].orderIndex } }); await db.collection('tasks').updateOne({ taskId: tasks[idx+1].taskId }, { $set: { orderIndex: tasks[idx].orderIndex } }); } res.json({success:true}); } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/delete', async (req, res) => {
    try { const t = await db.collection('tasks').findOne({taskId: req.params.taskId}); cancelTaskSchedule(req.params.taskId); if(t) { await db.collection('deleted_tasks').insertOne({ ...t, deletedAt: new Date(), deleteReason: 'manual' }); await db.collection('tasks').deleteOne({ taskId: req.params.taskId }); sendAlert(`🗑️ <b>Task Deleted:</b> ${escapeHTML(t.title)}`); } res.json({success: true}); } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks', async (req, res) => {
    try { if (!req.body.title) return res.status(400).send('Empty title'); await db.collection('tasks').updateOne({ taskId: req.params.taskId }, { $push: { subtasks: { id: generateSubtaskId(), title: req.body.title.trim(), description: req.body.description || '', completed: false, createdAt: new Date() } } }); sendAlert(`➕ <b>Subtask Added:</b> ${escapeHTML(req.body.title)}`); res.json({success: true}); } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/update', async (req, res) => {
    try { if (!req.body.title) return res.status(400).send('Empty title'); await db.collection('tasks').updateOne({ taskId: req.params.taskId, "subtasks.id": req.params.subtaskId }, { $set: { "subtasks.$.title": req.body.title.trim(), "subtasks.$.description": req.body.description || '' } }); sendAlert(`✏️ <b>Subtask Edited:</b> ${escapeHTML(req.body.title)}`); res.json({success: true}); } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/toggle', async (req, res) => {
    try {
        const task = await db.collection('tasks').findOne({ taskId: req.params.taskId }); const sub = (task.subtasks || []).find(s => s.id === req.params.subtaskId); sub.completed = !sub.completed;
        await db.collection('tasks').updateOne({ taskId: req.params.taskId, "subtasks.id": req.params.subtaskId }, { $set: { "subtasks.$.completed": sub.completed } });
        let taskCompleted = false; if(task.subtasks.every(s => s.completed)) { await completeTaskLogic(task, getCurrentISTDisplay()); taskCompleted = true; sendAlert(`✅ <b>Task Auto-Completed:</b> ${escapeHTML(task.title)}`); }
        res.json({success: true, taskCompleted});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/delete', async (req, res) => { try { await db.collection('tasks').updateOne({ taskId: req.params.taskId }, { $pull: { subtasks: { id: req.params.subtaskId } } }); res.json({success: true}); } catch (error) { res.status(500).send(error.message); } });
app.post('/api/tasks/:taskId/subtasks/:subtaskId/move', async (req, res) => {
    try {
        const task = await db.collection('tasks').findOne({ taskId: req.params.taskId }); const subs = task.subtasks || []; const idx = subs.findIndex(s => s.id === req.params.subtaskId); const { direction } = req.body;
        if (direction === 'up' && idx > 0) { [subs[idx], subs[idx-1]] = [subs[idx-1], subs[idx]]; } else if (direction === 'down' && idx < subs.length - 1) { [subs[idx], subs[idx+1]] = [subs[idx+1], subs[idx]]; }
        await db.collection('tasks').updateOne({ taskId: req.params.taskId }, { $set: { subtasks: subs } }); res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/notes', async (req, res) => { try { if (!req.body.title) return res.status(400).send('Empty title'); const note = { noteId: generateId('n'), title: req.body.title.trim(), description: req.body.description || '', createdAt: new Date(), updatedAt: new Date(), orderIndex: await db.collection('notes').countDocuments() }; await db.collection('notes').insertOne(note); sendAlert(`🗒️ <b>Note Added:</b> ${escapeHTML(note.title)}`); res.json({success: true}); } catch (error) { res.status(500).send(error.message); } });
app.post('/api/notes/:noteId/update', async (req, res) => { try { if (!req.body.title) return res.status(400).send('Empty title'); await db.collection('notes').updateOne({ noteId: req.params.noteId }, { $set: { title: req.body.title.trim(), description: req.body.description || '', updatedAt: new Date() } }); res.json({success: true}); } catch (error) { res.status(500).send(error.message); } });
app.post('/api/notes/:noteId/delete', async (req, res) => { try { await db.collection('notes').deleteOne({ noteId: req.params.noteId }); res.json({success: true}); } catch (error) { res.status(500).send(error.message); } });
app.post('/api/notes/:noteId/move', async (req, res) => {
    try {
        const notes = await db.collection('notes').find().sort({ orderIndex: 1 }).toArray(); const idx = notes.findIndex(n => n.noteId === req.params.noteId);
        if (req.body.direction === 'up' && idx > 0) { await db.collection('notes').updateOne({ noteId: notes[idx].noteId }, { $set: { orderIndex: notes[idx-1].orderIndex } }); await db.collection('notes').updateOne({ noteId: notes[idx-1].noteId }, { $set: { orderIndex: notes[idx].orderIndex } }); } else if (req.body.direction === 'down' && idx < notes.length - 1) { await db.collection('notes').updateOne({ noteId: notes[idx].noteId }, { $set: { orderIndex: notes[idx+1].orderIndex } }); await db.collection('notes').updateOne({ noteId: notes[idx+1].noteId }, { $set: { orderIndex: notes[idx].orderIndex } }); }
        res.json({success: true});
    } catch (error) { res.status(500).send(error.message); }
});

// ==========================================
// 🚀 BOOTSTRAP
// ==========================================
async function start() {
    try {
        if (await connectDB()) {
            await rescheduleAllPending(); setupHourlyNotifications(); setupAutoCompletion();
            app.listen(PORT, '0.0.0.0', () => { console.log('🌐 Web interface running on port ' + PORT); console.log('🌍 Public Web URL: ' + WEB_APP_URL); console.log('🕐 IST Time: ' + getCurrentISTDisplay().dateTime); });
            await bot.launch(); console.log('🤖 Bot Started Successfully!');
        } else { setTimeout(start, 5000); }
    } catch (error) { console.log("Error starting server:", error); setTimeout(start, 10000); }
}

process.once('SIGINT', () => { isShuttingDown = true; bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { isShuttingDown = true; bot.stop('SIGTERM'); process.exit(0); });

start();
