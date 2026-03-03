const { Telegraf, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const schedule = require('node-schedule');
const express = require('express');
const path = require('path');
const fs = require('fs');

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
const BOT_TOKEN = '8716545255:AAHNcyDFzOdVUQz38iutCVEN3DARA5YJLBM';
const MONGODB_URI = 'mongodb+srv://sandip:9E9AISFqTfU3VI5i@cluster0.p8irtov.mongodb.net/telegram_bot';
const PORT = process.env.PORT || 8080;
const WEB_APP_URL = 'https://task-managing.up.railway.app';
const CHAT_ID = 8781152810;

// ==========================================
// 🕐 TIMEZONE CONSTANTS (IST = UTC+5:30)
// ==========================================
const IST_OFFSET_HOURS = 5;
const IST_OFFSET_MINUTES = 30;
const IST_OFFSET_MS = (IST_OFFSET_HOURS * 60 + IST_OFFSET_MINUTES) * 60 * 1000;

const app = express();

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
// 🕐 NATIVE IST TIMEZONE UTILITIES
// ==========================================
function istToUTC(istDate, istTime) {
    if (!istDate || !istTime) return null;
    const [year, month, day] = istDate.split('-').map(Number);
    const [hour, minute] = istTime.split(':').map(Number);
    const istDateObj = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    return new Date(istDateObj.getTime() - IST_OFFSET_MS);
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
        time: `${hours}:${minutes}`,
        dateTime: `${day}-${month}-${year} at ${hours}:${minutes}`,
        displayDate: `${day}-${month}-${year}`,
        displayTime: `${hours}:${minutes}`
    };
}

function formatLegacyIST(utcDate, type) {
    if (!utcDate) return '';
    const istDate = new Date(utcDate.getTime() + IST_OFFSET_MS);
    if (type === 'date') return `${String(istDate.getUTCDate()).padStart(2, '0')}-${String(istDate.getUTCMonth() + 1).padStart(2, '0')}-${istDate.getUTCFullYear()}`;
    if (type === 'time') return `${String(istDate.getUTCHours()).padStart(2, '0')}:${String(istDate.getUTCMinutes()).padStart(2, '0')}`;
    return '';
}

function generateId() { return 'g' + Date.now() + Math.random().toString(36).substring(2, 6); }

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
            
            // Initialize grow collection if needed
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
function generateTaskId() { return Math.random().toString(36).substring(2, 10); }
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
// 🤖 BOT SETUP & SCHEDULER
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
        if (startTimeUTC <= nowUTC) return;

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
        const tasks = await db.collection('tasks').find({ status: 'pending', startDate: { $gt: new Date() } }).toArray();
        tasks.forEach(task => scheduleTask(task));
    } catch (error) {}
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
    <title>Global Task Manager</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        :root {
            --bg-light: #f5f7fa; --card-bg-light: #ffffff; --text-primary-light: #1e293b; --text-secondary-light: #475569;
            --border-light: #e2e8f0; --accent-light: #2563eb; --accent-soft-light: #dbeafe; --success-light: #059669;
            --warning-light: #d97706; --danger-light: #dc2626; --hover-light: #f1f5f9; --progress-bg-light: #e2e8f0;
            --bg-dark: #0f172a; --card-bg-dark: #1e293b; --text-primary-dark: #f8fafc; --text-secondary-dark: #cbd5e1;
            --border-dark: #334155; --accent-dark: #60a5fa; --accent-soft-dark: #1e3a5f; --success-dark: #34d399;
            --warning-dark: #fbbf24; --danger-dark: #f87171; --hover-dark: #2d3b4f; --progress-bg-dark: #334155;
            
            /* Grow tracker specific colors */
            --grow-accent: #059669; --grow-accent-dark: #34d399;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        body { background: var(--bg-light); color: var(--text-primary-light); transition: all 0.2s ease; min-height: 100vh; font-size: 13px; line-height: 1.4; }
        @media (prefers-color-scheme: dark) { body { background: var(--bg-dark); color: var(--text-primary-dark); } }
        
        .app-header { background: var(--card-bg-light); border-bottom: 1px solid var(--border-light); padding: 10px 12px; position: sticky; top: 0; z-index: 100; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        @media (prefers-color-scheme: dark) { .app-header { background: var(--card-bg-dark); border-bottom: 1px solid var(--border-dark); } }
        
        .nav-container { max-width: 1400px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px; }
        .nav-links { display: flex; gap: 2px; background: var(--hover-light); padding: 3px; border-radius: 100px; }
        @media (prefers-color-scheme: dark) { .nav-links { background: var(--hover-dark); } }
        
        .nav-btn { display: flex; align-items: center; gap: 4px; padding: 6px 10px; border-radius: 100px; border: none; background: transparent; color: var(--text-secondary-light); font-weight: 600; font-size: 0.8rem; cursor: pointer; transition: all 0.2s ease; }
        @media (prefers-color-scheme: dark) { .nav-btn { color: var(--text-secondary-dark); } }
        .nav-btn.active { background: var(--card-bg-light); color: var(--accent-light); box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
        @media (prefers-color-scheme: dark) { .nav-btn.active { background: var(--card-bg-dark); color: var(--accent-dark); box-shadow: 0 2px 6px rgba(0,0,0,0.2); } }
        
        .time-badge { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: var(--accent-soft-light); border-radius: 100px; font-size: 0.75rem; font-weight: 600; color: var(--accent-light); }
        @media (prefers-color-scheme: dark) { .time-badge { background: var(--accent-soft-dark); color: var(--accent-dark); } }
        
        .main-content { max-width: 1400px; margin: 16px auto; padding: 0 16px; padding-bottom: 80px; }
        .page-title { font-size: 1.5rem; font-weight: 700; margin-bottom: 16px; text-align: center; }
        
        /* ===== GROW TRACKER STYLES (MERGED) ===== */
        .grow-panel { max-width: 600px; margin: 0 auto 12px; background: var(--card-bg-light); border: 1px solid var(--border-light); border-radius: 16px; overflow: hidden; }
        @media (prefers-color-scheme: dark) { .grow-panel { background: var(--card-bg-dark); border-color: var(--border-dark); } }
        .grow-panel summary { display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; font-size: 1rem; font-weight: 700; cursor: pointer; background: var(--card-bg-light); list-style: none; }
        @media (prefers-color-scheme: dark) { .grow-panel summary { background: var(--card-bg-dark); } }
        .grow-panel summary::-webkit-details-marker { display: none; }
        .grow-panel > summary > i { transition: transform 0.3s; color: var(--text-secondary-light); }
        @media (prefers-color-scheme: dark) { .grow-panel > summary > i { color: var(--text-secondary-dark); } }
        .grow-panel[open] > summary > i { transform: rotate(180deg); }
        .grow-panel-body { padding: 16px; border-top: 1px solid var(--border-light); }
        @media (prefers-color-scheme: dark) { .grow-panel-body { border-top-color: var(--border-dark); } }
        
        .grow-graph-container { width: 100%; aspect-ratio: 1; display: flex; flex-direction: column; }
        .grow-graph { display: flex; justify-content: space-around; align-items: flex-end; flex: 1; margin-top: 10px;}
        .grow-bar { display: flex; flex-direction: column; align-items: center; width: 10%; max-width: 35px; height: 100%; }
        .grow-bar-track { width: 100%; height: 90%; border-radius: 6px; position: relative; display: flex; align-items: flex-end; background: var(--hover-light); overflow: hidden; border: 1px solid var(--border-light); }
        @media (prefers-color-scheme: dark) { .grow-bar-track { background: var(--hover-dark); border-color: var(--border-dark); } }
        .grow-bar-fill { width: 100%; border-radius: 4px; transition: height 0.6s ease; }
        .grow-bar-label { position: absolute; top: 0; bottom: 0; left: 0; right: 0; writing-mode: vertical-rl; transform: rotate(180deg); display: flex; align-items: center; justify-content: center; text-align: center; color: var(--text-primary-light); font-size: 0.85rem; font-weight: 700; pointer-events: none; }
        @media (prefers-color-scheme: dark) { .grow-bar-label { color: var(--text-primary-dark); } }
        .grow-bar-pct { font-size: 0.75rem; font-weight: 700; margin-bottom: 5px; color: var(--text-primary-light); }
        @media (prefers-color-scheme: dark) { .grow-bar-pct { color: var(--text-primary-dark); } }
        
        .grow-month-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .grow-month-nav h2 { font-size: 1rem; font-weight: 700; background: var(--hover-light); padding: 5px 14px; border-radius: 30px; border: 1px solid var(--border-light); }
        @media (prefers-color-scheme: dark) { .grow-month-nav h2 { background: var(--hover-dark); border-color: var(--border-dark); } }
        .grow-nav-btn { background: var(--bg-light); border: 1px solid var(--border-light); width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 0.8rem; color: var(--text-secondary-light); display: flex; align-items: center; justify-content: center; transition: 0.2s;}
        @media (prefers-color-scheme: dark) { .grow-nav-btn { background: var(--bg-dark); border-color: var(--border-dark); color: var(--text-secondary-dark); } }
        .grow-nav-btn:hover { background: var(--hover-light); color: var(--text-primary-light); }
        @media (prefers-color-scheme: dark) { .grow-nav-btn:hover { background: var(--hover-dark); color: var(--text-primary-dark); } }
        
        .grow-calendar { width: 100%; aspect-ratio: 1 / 1; display: flex; flex-direction: column; }
        .grow-grid { flex: 1; width: 100%; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: auto repeat(6, minmax(0, 1fr)); gap: 4px; }
        .grow-weekday { display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.75rem; color: var(--text-secondary-light); text-transform: uppercase; }
        @media (prefers-color-scheme: dark) { .grow-weekday { color: var(--text-secondary-dark); } }
        .grow-day { display: flex; align-items: center; justify-content: center; border-radius: 10px; position: relative; width: 100%; height: 100%; }
        .grow-day.empty { pointer-events: none; background: transparent; }
        .grow-day:hover:not(.empty) { background: var(--hover-light); cursor: pointer; }
        @media (prefers-color-scheme: dark) { .grow-day:hover:not(.empty) { background: var(--hover-dark); } }
        
        .grow-circle { width: 100%; max-width: 36px; aspect-ratio: 1 / 1; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem; transition: transform 0.2s; margin: auto; }
        .grow-day:hover .grow-circle { transform: scale(1.1); }
        .grow-circle.has-data { color: #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.2); text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
        .grow-circle.today { box-shadow: 0 0 0 2px var(--card-bg-light), 0 0 0 4px var(--grow-accent); color: var(--grow-accent); }
        @media (prefers-color-scheme: dark) { .grow-circle.today { box-shadow: 0 0 0 2px var(--card-bg-dark), 0 0 0 4px var(--grow-accent-dark); color: var(--grow-accent-dark); } }
        .grow-circle.today.has-data { color: #fff; }

        .grow-bubble { position: fixed; background: var(--card-bg-light); border: 1px solid var(--border-light); border-radius: 12px; padding: 10px; z-index: 1000; min-width: 160px; max-width: 200px; pointer-events: none; box-shadow: 0 10px 25px rgba(0,0,0,0.25); display: none; opacity: 0; transition: opacity 0.2s; }
        @media (prefers-color-scheme: dark) { .grow-bubble { background: var(--card-bg-dark); border-color: var(--border-dark); } }
        .grow-bubble.show { opacity: 1; }
        .grow-tail { position: absolute; width: 12px; height: 12px; background: var(--card-bg-light); transform: rotate(45deg); z-index: -1; }
        @media (prefers-color-scheme: dark) { .grow-tail { background: var(--card-bg-dark); } }
        .grow-bubble-date { font-size: 0.75rem; font-weight: 700; color: var(--text-secondary-light); margin-bottom: 5px; border-bottom: 1px solid var(--border-light); padding-bottom: 5px; }
        @media (prefers-color-scheme: dark) { .grow-bubble-date { border-bottom-color: var(--border-dark); color: var(--text-secondary-dark); } }
        .grow-bubble-item { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 0.8rem; font-weight: 600; }
        
        .grow-card { background: var(--card-bg-light); border: 1px solid var(--border-light); border-radius: 14px; padding: 12px; margin-bottom: 10px; transition: 0.2s;}
        @media (prefers-color-scheme: dark) { .grow-card { background: var(--card-bg-dark); border-color: var(--border-dark); } }
        .grow-card summary { display: flex; justify-content: space-between; align-items: center; cursor: pointer; list-style: none; outline: none; padding: 4px 0;}
        .grow-card summary::-webkit-details-marker { display: none; }
        .grow-title-section { display: flex; align-items: center; gap: 8px; flex: 1;}
        .grow-title-section i { font-size: 0.8rem; color: var(--text-secondary-light); transition: transform 0.2s; }
        @media (prefers-color-scheme: dark) { .grow-title-section i { color: var(--text-secondary-dark); } }
        details[open] .grow-title-section i { transform: rotate(90deg); }
        .grow-title { font-weight: 700; font-size: 1rem; color: var(--text-primary-light); }
        @media (prefers-color-scheme: dark) { .grow-title { color: var(--text-primary-dark); } }
        .grow-actions { display: flex; gap: 6px; margin-left: 10px; align-items: center; }
        .grow-btn-icon { width: 32px; height: 32px; border-radius: 8px; border: none; background: var(--hover-light); color: var(--text-secondary-light); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.85rem; transition: 0.2s; padding: 0; margin: 0;}
        @media (prefers-color-scheme: dark) { .grow-btn-icon { background: var(--hover-dark); color: var(--text-secondary-dark); } }
        .grow-btn-icon:hover { background: var(--grow-accent); color: white; }
        @media (prefers-color-scheme: dark) { .grow-btn-icon:hover { background: var(--grow-accent-dark); } }
        .grow-btn-icon.del:hover { background: var(--danger-light); }
        .grow-desc-container { width: 100%; margin-top: 10px; }
        .grow-desc { font-size: 0.85rem; color: var(--text-secondary-light); padding: 8px 12px; background: var(--hover-light); border-radius: 8px; border-left: 3px solid; word-break: break-word; line-height: 1.4;}
        @media (prefers-color-scheme: dark) { .grow-desc { background: var(--hover-dark); color: var(--text-secondary-dark); } }
        
        .grow-progress-bar-container { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border-light); width: 100%; }
        @media (prefers-color-scheme: dark) { .grow-progress-bar-container { border-top-color: var(--border-dark); } }
        .grow-progress-bar { width: 100%; height: 8px; background: var(--hover-light); border-radius: 10px; overflow: hidden; margin: 8px 0; border: 1px solid var(--border-light); }
        @media (prefers-color-scheme: dark) { .grow-progress-bar { background: var(--hover-dark); border-color: var(--border-dark); } }
        .grow-progress-fill { height: 100%; border-radius: 10px; transition: width 0.5s ease-out; }
        .grow-progress-stats { display: flex; justify-content: space-between; gap: 8px; font-size: 0.75rem; color: var(--text-secondary-light); font-weight: 600; align-items: center;}
        @media (prefers-color-scheme: dark) { .grow-progress-stats { color: var(--text-secondary-dark); } }
        .grow-progress-stats strong { color: var(--text-primary-light); font-size: 0.85rem;}
        @media (prefers-color-scheme: dark) { .grow-progress-stats strong { color: var(--text-primary-dark); } }
        .grow-progress-stats span:last-child { white-space: nowrap; flex-shrink: 0; text-align: right; }
        .grow-progress-stats span:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        .grow-palette { display: flex; justify-content: space-between; margin-top: 6px; }
        .grow-swatch { width: 26px; height: 26px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: 0.1s;}
        .grow-swatch.selected { transform: scale(1.15); box-shadow: 0 0 0 2px var(--card-bg-light), 0 0 0 4px var(--text-primary-light); }
        @media (prefers-color-scheme: dark) { .grow-swatch.selected { box-shadow: 0 0 0 2px var(--card-bg-dark), 0 0 0 4px var(--text-primary-dark); } }
        .grow-swatch.hidden { display: none; }
        .grow-checkbox { display: flex; align-items: center; gap: 8px; margin: 12px 0; font-size: 0.85rem; font-weight: 600; cursor: pointer; color: var(--text-primary-light);}
        @media (prefers-color-scheme: dark) { .grow-checkbox { color: var(--text-primary-dark); } }
        .grow-checkbox input { width: 18px; height: 18px; accent-color: var(--grow-accent); cursor: pointer; }
        .grow-hidden-fields { display: none; background: var(--hover-light); padding: 12px; border-radius: 10px; margin-bottom: 12px; }
        @media (prefers-color-scheme: dark) { .grow-hidden-fields { background: var(--hover-dark); } }
        .grow-empty { text-align: center; color: var(--text-secondary-light); padding: 30px; font-size: 0.9rem; background: transparent; border-radius: 12px; }
        @media (prefers-color-scheme: dark) { .grow-empty { color: var(--text-secondary-dark); } }
        .grow-log-list-view { display: block; }
        .grow-log-question-view { display: none; }
        
        /* Tasks/Notes common styles */
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
        
        .history-header { display: flex; justify-content: center; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; width: 100%; }
        .month-selector { display: flex; align-items: center; gap: 12px; }
        .month-btn { padding: 6px 12px; border-radius: 100px; border: 1px solid var(--border-light); background: var(--card-bg-light); color: var(--text-primary-light); font-size: 0.8rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; }
        @media (prefers-color-scheme: dark) { .month-btn { background: var(--card-bg-dark); border-color: var(--border-dark); color: var(--text-primary-dark); } }
        
        .history-date-card { margin-bottom: 16px; }
        .history-details summary { display: flex; align-items: center; width: 100%; cursor: pointer; list-style: none; }
        .history-details summary::-webkit-details-marker { display: none; }
        .history-details summary i.fa-calendar-alt { margin-right: 8px; color: var(--accent-light); }
        @media (prefers-color-scheme: dark) { .history-details summary i.fa-calendar-alt { color: var(--accent-dark); } }
        
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
        .modal-content { background: var(--card-bg-light); border: 1px solid var(--border-light); border-radius: 24px; padding: 24px; width: 90%; max-width: 500px; max-height: 85vh; overflow-y: auto; animation: modalIn 0.3s ease; }
        @media (prefers-color-scheme: dark) { .modal-content { background: var(--card-bg-dark); border: 1px solid var(--border-dark); } }
        @keyframes modalIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid var(--border-light); padding-bottom: 10px; }
        @media (prefers-color-scheme: dark) { .modal-header { border-bottom-color: var(--border-dark); } }
        .modal-header h2 { font-size: 1.1rem; font-weight: 700; color: var(--text-primary-light); }
        @media (prefers-color-scheme: dark) { .modal-header h2 { color: var(--text-primary-dark); } }
        .close { background: var(--hover-light); border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; color: var(--text-secondary-light); transition: 0.2s;}
        @media (prefers-color-scheme: dark) { .close { background: var(--hover-dark); color: var(--text-secondary-dark); } }
        .close:hover { background: var(--danger-light); color: white; }
        
        .form-control { width: 100%; padding: 10px; border: 1px solid var(--border-light); border-radius: 8px; font-size: 0.85rem; outline: none; background: var(--bg-light); color: var(--text-primary-light); transition: border 0.2s; resize: vertical; }
        textarea.form-control { min-height: 80px; }
        @media (prefers-color-scheme: dark) { .form-control { background: var(--bg-dark); border: 1px solid var(--border-dark); color: var(--text-primary-dark); } }
        .form-control:focus { border-color: var(--accent-light); }
        @media (prefers-color-scheme: dark) { .form-control:focus { border-color: var(--accent-dark); } }
        
        .btn { padding: 12px 20px; border-radius: 100px; border: none; font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: all 0.2s ease; }
        .btn-primary { background: var(--accent-light); color: white; }
        @media (prefers-color-scheme: dark) { .btn-primary { background: var(--accent-dark); } }
        .btn-secondary { background: var(--hover-light); color: var(--text-secondary-light); }
        @media (prefers-color-scheme: dark) { .btn-secondary { background: var(--hover-dark); color: var(--text-secondary-dark); } }
        .btn-submit { width: 100%; padding: 12px; background: var(--grow-accent); color: white; border: none; border-radius: 10px; font-weight: 700; font-size: 0.9rem; cursor: pointer; margin-top: 10px; transition: 0.2s; display: flex; justify-content: center; align-items: center; gap: 8px;}
        .btn-submit:active { transform: scale(0.98); }
        
        .toast-container { position: fixed; top: -100px; left: 50%; transform: translateX(-50%); background: var(--card-bg-light); color: var(--text-primary-light); padding: 12px 24px; border-radius: 30px; box-shadow: 0 10px 40px rgba(0,0,0,0.25); transition: top 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55); z-index: 10000; font-weight: 600; font-size: 0.9rem; border: 1px solid var(--border-light); display: flex; align-items: center; gap: 10px; }
        @media (prefers-color-scheme: dark) { .toast-container { background: var(--card-bg-dark); color: var(--text-primary-dark); border-color: var(--border-dark); } }
        .toast-container.show { top: 25px; }
        .toast-container.success { border-left: 4px solid var(--grow-accent); }
        .toast-container.error { border-left: 4px solid var(--danger-light); }
        
        .global-loader { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.5); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); z-index: 9999; display: none; flex-direction: column; align-items: center; justify-content: center; }
        @media (prefers-color-scheme: dark) { .global-loader { background: rgba(15, 23, 42, 0.6); } }
        .global-loader.show { display: flex; }
        .spinner { width: 45px; height: 45px; border: 4px solid var(--border-light); border-top-color: var(--grow-accent); border-radius: 50%; animation: spin 1s linear infinite; }
        @media (prefers-color-scheme: dark) { .spinner { border-color: var(--border-dark); border-top-color: var(--grow-accent-dark); } }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        
        .empty-state { text-align: center; padding: 40px 20px; color: var(--text-secondary-light); background: var(--hover-light); border-radius: 24px; }
        @media (prefers-color-scheme: dark) { .empty-state { background: var(--hover-dark); color: var(--text-secondary-dark); } }
        
        .task-title-container { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .task-title-container i { font-size: 0.8rem; color: var(--accent-light); }
        .hidden { display: none; }
        .fit-content { width: fit-content; }
        .word-break { word-break: break-word; overflow-wrap: break-word; }
        .flex-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .w-100 { width: 100%; }
        
        @media (max-width: 768px) { 
            .nav-container { flex-direction: column; align-items: stretch; gap: 8px; } 
            .nav-links { width: 100%; justify-content: stretch; gap: 2px; } 
            .nav-btn { flex: 1; justify-content: center; padding: 8px 6px; font-size: 0.8rem; } 
            .time-badge { justify-content: center; } 
            .tasks-grid, .history-tasks-grid { grid-template-columns: 1fr; } 
        }
    </style>
</head>
<body>
    <div id="toast" class="toast-container"></div>
    
    <div id="globalLoader" class="global-loader">
        <div class="spinner"></div>
        <div style="margin-top:12px; font-weight:600; color:var(--text-primary-light); font-size:0.9rem;">Processing...</div>
    </div>

    <div class="app-header">
        <div class="nav-container">
            <div class="nav-links">
                <button class="nav-btn <%= currentPage === 'tasks' ? 'active' : '' %>" onclick="switchPage('tasks')">
                    <i class="fas fa-tasks"></i> <span>Tasks</span>
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
            <div class="time-badge">
                <i class="fas fa-calendar-alt"></i> <span id="currentDateDisplay"><%= currentDate %></span>
                <span style="margin-left: 4px;"><i class="fas fa-clock"></i> <span id="currentTimeDisplay"><%= currentTime %></span></span>
            </div>
        </div>
    </div>

    <button class="fab" id="fabButton" onclick="openAddModal()" title="Add New"><i class="fas fa-plus"></i></button>
    <div class="main-content" id="mainContent"></div>

    <!-- Task Modals -->
    <div class="modal" id="addTaskModal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Create New Task</h2>
                <button class="close" onclick="closeModal('addTaskModal')">&times;</button>
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
                    <div><label style="font-size: 0.85rem; font-weight: 600;">Start Time</label><input type="time" class="form-control" name="startTime" id="startTime" required></div>
                    <div><label style="font-size: 0.85rem; font-weight: 600;">End Time</label><input type="time" class="form-control" name="endTime" id="endTime" required></div>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Repeat</label>
                    <select class="form-control" name="repeat" id="repeatSelect">
                        <option value="none">No Repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option>
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
            <div class="modal-header">
                <h2>Edit Task</h2>
                <button class="close" onclick="closeModal('editTaskModal')">&times;</button>
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
                    <div><label style="font-size: 0.85rem; font-weight: 600;">Start Time</label><input type="time" class="form-control" name="startTime" id="editStartTime" required></div>
                    <div><label style="font-size: 0.85rem; font-weight: 600;">End Time</label><input type="time" class="form-control" name="endTime" id="editEndTime" required></div>
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Repeat</label>
                    <select class="form-control" name="repeat" id="editRepeatSelect">
                        <option value="none">No Repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option>
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

    <!-- Subtask Modals -->
    <div class="modal" id="addSubtaskModal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Add Subtask</h2>
                <button class="close" onclick="closeModal('addSubtaskModal')">&times;</button>
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
            <div class="modal-header">
                <h2>Edit Subtask</h2>
                <button class="close" onclick="closeModal('editSubtaskModal')">&times;</button>
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

    <!-- Note Modals -->
    <div class="modal" id="addNoteModal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Create Note</h2>
                <button class="close" onclick="closeModal('addNoteModal')">&times;</button>
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
            <div class="modal-header">
                <h2>Edit Note</h2>
                <button class="close" onclick="closeModal('editNoteModal')">&times;</button>
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

    <!-- Grow Tracker Modals -->
    <div class="modal" id="growAddModal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Add New Growth</h2>
                <button class="close" onclick="closeModal('growAddModal')">&times;</button>
            </div>
            <form id="growAddForm">
                <div class="form-group"><label>Title</label><input type="text" class="form-control" id="growAddTitle" required placeholder="E.g. Daily Walk"></div>
                <div class="form-group"><label>Description (Optional)</label><textarea class="form-control" id="growAddDesc" rows="2" placeholder="Brief details..."></textarea></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div class="form-group"><label>Start Date</label><input type="date" class="form-control" id="growAddStart" required></div>
                    <div class="form-group"><label>Duration (Days)</label><input type="number" class="form-control" id="growAddDays" value="365" required></div>
                </div>
                <div class="form-group"><label>Color Tag</label><div class="grow-palette" id="growAddPalette"></div><input type="hidden" id="growAddColor" required></div>
                
                <label class="grow-checkbox"><input type="checkbox" id="growAddHasData" onchange="growToggleDataFields('add')"> Track Quantitative Data?</label>
                
                <div class="grow-hidden-fields" id="growAddDataFields">
                    <div class="form-group"><label>Question Prompt</label><input type="text" class="form-control" id="growAddQuestion" placeholder="E.g. Weight lost?"></div>
                    <div class="form-group"><label>Data Type</label><select class="form-control" id="growAddType"><option value="integer">Whole Number</option><option value="float">Decimal (Float)</option></select></div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                        <div class="form-group"><label>Start Value</label><input type="number" step="0.01" class="form-control" id="growAddMin" value="0"></div>
                        <div class="form-group"><label>Target Value</label><input type="number" step="0.01" class="form-control" id="growAddMax" value="100"></div>
                    </div>
                </div>
                <button type="submit" class="btn-submit">Create Tracker</button>
            </form>
        </div>
    </div>
    
    <div class="modal" id="growEditModal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Edit Growth</h2>
                <button class="close" onclick="closeModal('growEditModal')">&times;</button>
            </div>
            <form id="growEditForm">
                <input type="hidden" id="growEditId">
                <div class="form-group"><label>Title</label><input type="text" class="form-control" id="growEditTitle" required></div>
                <div class="form-group"><label>Description (Optional)</label><textarea class="form-control" id="growEditDesc" rows="2"></textarea></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div class="form-group"><label>Start Date</label><input type="date" class="form-control" id="growEditStart" required></div>
                    <div class="form-group"><label>Duration (Days)</label><input type="number" class="form-control" id="growEditDays" required></div>
                </div>
                <div class="form-group"><label>Color Tag</label><div class="grow-palette" id="growEditPalette"></div><input type="hidden" id="growEditColor" required></div>
                
                <label class="grow-checkbox"><input type="checkbox" id="growEditHasData" onchange="growToggleDataFields('edit')"> Track Quantitative Data?</label>
                
                <div class="grow-hidden-fields" id="growEditDataFields">
                    <div class="form-group"><label>Question Prompt</label><input type="text" class="form-control" id="growEditQuestion"></div>
                    <div class="form-group"><label>Data Type</label><select class="form-control" id="growEditType"><option value="integer">Whole Number</option><option value="float">Decimal (Float)</option></select></div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                        <div class="form-group"><label>Start Value</label><input type="number" step="0.01" class="form-control" id="growEditMin"></div>
                        <div class="form-group"><label>Target Value</label><input type="number" step="0.01" class="form-control" id="growEditMax"></div>
                    </div>
                </div>
                <button type="submit" class="btn-submit">Update Tracker</button>
            </form>
        </div>
    </div>
    
    <div class="modal" id="growLogModal">
        <div class="modal-content">
            <div id="growLogListView">
                <div class="modal-header">
                    <h2 id="growLogTitle">Log Progress</h2>
                    <button class="close" onclick="closeModal('growLogModal')">&times;</button>
                </div>
                <div id="growDailyList"></div>
            </div>
            <div id="growLogQuestionView">
                <div class="modal-header">
                    <h2 id="growQTitle"></h2>
                    <button class="close" onclick="growShowLogList()">&times;</button>
                </div>
                <div id="growQDesc"></div>
                <div class="form-group"><label id="growQLabel" style="font-size:0.9rem;"></label><div id="growQInput"></div></div>
                <button class="btn-submit" id="growSaveLogBtn">Save Value</button>
            </div>
        </div>
    </div>
    
    <div class="grow-bubble" id="growBubble"><div id="growBubbleContent"></div><div class="grow-tail" id="growTail"></div></div>

    <script>
        const tg = window.Telegram.WebApp;
        tg.ready(); tg.expand();

        function showToast(msg, type = "success") {
            const toast = document.getElementById("toast");
            toast.innerHTML = \`<i class="fas \${type==='success'?'fa-check-circle':'fa-exclamation-circle'}" style="color:var(--\${type==='success'?'grow-accent':'danger-light'})"></i> \${msg}\`;
            toast.className = \`toast-container show \${type}\`;
            setTimeout(() => toast.classList.remove("show"), 3000);
        }

        function showLoader() { document.getElementById('globalLoader').classList.add('show'); }
        function hideLoader() { document.getElementById('globalLoader').classList.remove('show'); }

        let currentPage = '<%= currentPage %>';
        let tasksData = <%- JSON.stringify(tasks || []) %>;
        let notesData = <%- JSON.stringify(notes || []) %>;
        let historyData = <%- JSON.stringify(groupedHistory || {}) %>;
        
        // Grow tracker data
        let growData = { items: [], progress: {} };
        let growToday = "", growMonth = 0, growYear = 2026, growLogContext = null;
        const growColors = ["#ec4899","#a855f7","#38bdf8","#ef4444","#f97316","#16a34a","#84cc16","#3b82f6"];
        
        let currentMonth = new Date().getMonth();
        let currentYear = new Date().getFullYear();

        function getIST() {
            const d = new Date();
            const ist = new Date(d.getTime() + 5.5*3600000);
            return {
                date: ist.getUTCFullYear() + "-" + String(ist.getUTCMonth()+1).padStart(2,"0") + "-" + String(ist.getUTCDate()).padStart(2,"0"),
                month: ist.getUTCMonth(),
                year: ist.getUTCFullYear(),
                time: String(ist.getUTCHours()).padStart(2,"0") + ":" + String(ist.getUTCMinutes()).padStart(2,"0")
            };
        }

        function switchPage(page) {
            showLoader();
            fetch('/api/page/' + page).then(res => res.json()).then(data => {
                currentPage = page;
                if(data.tasks) tasksData = data.tasks;
                if(data.notes) notesData = data.notes;
                if(data.groupedHistory) historyData = data.groupedHistory;
                renderPage(); updateActiveNav(); hideLoader();
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
            
            if (currentPage === 'tasks') { 
                fabButton.style.display = 'flex'; 
                content.innerHTML = renderTasksPage(); 
            } else if (currentPage === 'grow') { 
                fabButton.style.display = 'none'; 
                content.innerHTML = renderGrowPage(); 
                growInit();
            } else if (currentPage === 'notes') { 
                fabButton.style.display = 'flex'; 
                content.innerHTML = renderNotesPage(); 
            } else if (currentPage === 'history') { 
                fabButton.style.display = 'none'; 
                content.innerHTML = renderHistoryPage(); 
            }
        }

        // ===== GROW TRACKER FUNCTIONS =====
        async function growInit() {
            const ist = getIST();
            growToday = ist.date;
            growMonth = ist.month;
            growYear = ist.year;
            
            showLoader();
            await growFetchData();
            hideLoader();
            
            document.getElementById("mainContent").addEventListener("click", function(e) {
                const cell = e.target.closest(".grow-day");
                if(cell && !cell.classList.contains("empty")) {
                    const d = cell.dataset.date;
                    const active = growData.items.filter(g => growIsActive(g, d));
                    const dayData = growData.progress[d] || {};
                    const allDone = active.length && active.every(g => dayData[g.id] !== undefined);
                    
                    if(d === growToday && !allDone) {
                        growOpenLogModal(d);
                    } else {
                        growShowBubble(cell, d);
                    }
                }
            });

            document.addEventListener("click", function(e) {
                if(!e.target.closest(".grow-day") && !e.target.closest(".grow-bubble")) {
                    growHideBubble();
                }
            });
        }

        async function growFetchData() {
            try {
                const res = await fetch("/api/grow/data");
                growData = await res.json();
                if(!growData.items) growData.items = [];
                if(!growData.progress) growData.progress = {};
                growRenderAll();
            } catch(e) { 
                showToast("Failed to fetch data", "error"); 
            }
        }

        function growRenderAll() { 
            growRenderCalendar(); 
            growRenderGraphs(); 
            growRenderList(); 
        }

        function growIsActive(item, d) {
            const start = new Date(item.startDate + "T00:00:00");
            const target = new Date(d + "T00:00:00");
            const days = Math.floor((target - start) / 86400000);
            return days >= 0 && days < item.endCount;
        }

        function escapeHtml(text) {
            if (!text) return '';
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
            return text.replace(/[&<>"']/g, function(m) { return map[m]; });
        }

        function preserveLineBreaks(text) { return escapeHtml(text).replace(/\\n/g, '<br>'); }

        function growRenderList() {
            const container = document.getElementById("growList");
            if(!container) return;
            if(!growData.items.length) { container.innerHTML = "<div class='grow-empty'><i class='fas fa-seedling' style='font-size:2rem;margin-bottom:10px;'></i><br>No items tracked. Click + to add.</div>"; return; }
            let html = "";
            const now = new Date(growToday + "T00:00:00");
            
            for(let i=0; i<growData.items.length; i++) {
                const item = growData.items[i];
                const start = new Date(item.startDate + "T00:00:00");
                
                let passed = Math.floor((now - start) / 86400000);
                if(passed < 0) passed = 0;
                let left = item.endCount - passed;
                if(left < 0) left = 0;
                
                html += \`<div class="grow-card">
                    <details>
                        <summary>
                            <div class="grow-title-section"><i class="fas fa-chevron-right"></i><span class="grow-title">\${escapeHtml(item.title)}</span></div>
                            <div class="grow-actions">
                                <button class="grow-btn-icon" onclick="event.preventDefault(); growOpenEdit('\${item.id}')" title="Edit"><i class="fas fa-pencil"></i></button>
                                <button class="grow-btn-icon del" onclick="event.preventDefault(); growDelete('\${item.id}')" title="Delete"><i class="fas fa-trash"></i></button>
                            </div>
                        </summary>\`;
                        
                if(item.description) {
                    html += \`<div class="grow-desc-container"><div class="grow-desc" style="border-left-color:var(--grow-accent)">\${escapeHtml(item.description)}</div></div>\`;
                }
                
                let timePct = item.endCount > 0 ? (passed / item.endCount) * 100 : 0;
                timePct = Math.max(0, Math.min(100, timePct));
                
                html += \`<div class="grow-progress-bar-container">
                    <div class="grow-progress-stats"><span><strong>Time Elapsed</strong></span><span>\${passed} / \${item.endCount} Days</span></div>
                    <div class="grow-progress-bar"><div class="grow-progress-fill" style="width:\${timePct}%; background:\${item.color}cc"></div></div>
                    <div class="grow-progress-stats"><span>Started: \${item.startDate}</span><span>\${Math.round(timePct)}% Complete</span></div>
                </div>\`;

                if(item.hasData && item.type !== "boolean") {
                    html += \`<hr style="border: none; border-top: 1px solid var(--border-light); margin: 16px 0 8px 0;">\`;
                    
                    let latestValue = item.start !== undefined ? item.start : 0;
                    let sortedDates = Object.keys(growData.progress).sort();
                    for(let d of sortedDates) {
                        if(growData.progress[d][item.id] !== undefined && typeof growData.progress[d][item.id] === 'number') {
                            latestValue = growData.progress[d][item.id];
                        }
                    }
                    if(item.start !== undefined && item.end !== undefined) {
                        const min = Math.min(item.start, item.end);
                        const max = Math.max(item.start, item.end);
                        const range = max - min;
                        let pct = range === 0 ? 0 : ((latestValue - min) / range) * 100;
                        pct = Math.max(0, Math.min(100, pct));
                        
                        html += \`<div class="grow-progress-bar-container" style="border-top: none; padding-top: 0; margin-top: 0;">
                            <div class="grow-progress-stats"><span><strong>\${escapeHtml(item.question)}</strong></span><span>Current: \${latestValue}</span></div>
                            <div class="grow-progress-bar"><div class="grow-progress-fill" style="width:\${pct}%; background:\${item.color}"></div></div>
                            <div class="grow-progress-stats"><span>Start: \${item.start}</span><span>Goal: \${item.end}</span></div>
                        </div>\`;
                    }
                }
                
                html += \`</details></div>\`;
            }
            container.innerHTML = html;
        }

        async function growDelete(id) { 
            if(confirm("Delete this tracker and all its logs?")) { 
                showLoader();
                try {
                    await fetch("/api/grow/"+id+"/delete", {method:"POST"}); 
                    await growFetchData(); 
                    showToast("Tracker deleted successfully!", "success");
                } catch(e) {
                    showToast("Error deleting tracker", "error");
                }
                hideLoader();
            } 
        }

        function growOpenEdit(id) {
            const item = growData.items.find(g => g.id === id);
            if(!item) return;
            document.getElementById("growEditId").value = item.id;
            document.getElementById("growEditTitle").value = item.title;
            document.getElementById("growEditDesc").value = item.description || "";
            document.getElementById("growEditStart").value = item.startDate;
            document.getElementById("growEditDays").value = item.endCount;
            document.getElementById("growEditHasData").checked = item.hasData || false;
            
            growToggleDataFields("edit");
            if(item.hasData) {
                document.getElementById("growEditQuestion").value = item.question || "";
                document.getElementById("growEditType").value = item.type || "float";
                document.getElementById("growEditMin").value = item.start !== undefined ? item.start : 0;
                document.getElementById("growEditMax").value = item.end !== undefined ? item.end : 100;
            }
            growInitEditPalette(item.color);
            openModal('growEditModal');
        }

        function growRenderGraphs() {
            const container = document.getElementById("growGraphs");
            if(!container) return;
            if(!growData.items.length) { container.innerHTML = "<div class='grow-empty'>No data available.</div>"; return; }
            let html = "<div class='grow-graph-container'><div class='grow-graph'>";
            const now = new Date(growToday + "T00:00:00");
            
            for(let i=0; i<growData.items.length; i++) {
                const item = growData.items[i];
                const start = new Date(item.startDate + "T00:00:00");
                let totalDaysSoFar = Math.floor((now - start) / 86400000) + 1;
                if(totalDaysSoFar < 1) totalDaysSoFar = 0;
                if(totalDaysSoFar > item.endCount) totalDaysSoFar = item.endCount;
                
                let completed = 0;
                for(let d in growData.progress) {
                    const dObj = new Date(d + "T00:00:00");
                    if(dObj >= start && dObj <= now && growData.progress[d] && growData.progress[d][item.id] !== undefined) completed++;
                }
                
                let pct = totalDaysSoFar ? Math.min(100, completed/totalDaysSoFar*100) : 0;
                
                html += \`<div class="grow-bar">
                    <div class="grow-bar-pct">\${Math.round(pct)}%</div>
                    <div class="grow-bar-track" style="background:\${item.color}40">
                        <div class="grow-bar-fill" style="height:\${pct}%; background:\${item.color}"></div>
                        <div class="grow-bar-label">\${escapeHtml(item.title)}</div>
                    </div>
                </div>\`;
            }
            html += "</div></div>";
            container.innerHTML = html;
        }

        function growChangeMonth(dir) {
            growMonth += dir;
            if(growMonth > 11) { growMonth = 0; growYear++; }
            else if(growMonth < 0) { growMonth = 11; growYear--; }
            growRenderCalendar();
        }

        function growRenderCalendar() {
            const grid = document.getElementById("growCalendar");
            if(!grid) return;
            const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
            const monthYearEl = document.getElementById("growMonthYear");
            if(monthYearEl) monthYearEl.innerText = months[growMonth] + " " + growYear;
            
            const firstDay = new Date(growYear, growMonth, 1).getDay();
            const daysInMonth = new Date(growYear, growMonth+1, 0).getDate();
            
            let html = "";
            
            ["Su","Mo","Tu","We","Th","Fr","Sa"].forEach(d => html += \`<div class="grow-weekday">\${d}</div>\`);
            
            let currentDay = 1;
            for(let i = 0; i < 42; i++) {
                if(i < firstDay || currentDay > daysInMonth) {
                    html += \`<div class="grow-day empty"></div>\`;
                } else {
                    const date = growYear + "-" + String(growMonth+1).padStart(2,"0") + "-" + String(currentDay).padStart(2,"0");
                    const isToday = date === growToday;
                    const dayData = growData.progress[date] || {};
                    const activeColors = [];
                    
                    for(let j=0; j<growData.items.length; j++) {
                        const g = growData.items[j];
                        if(growIsActive(g, date) && dayData[g.id] !== undefined) activeColors.push(g.color);
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
                    
                    html += \`<div class="grow-day" data-date="\${date}"><div class="grow-circle \${isToday?'today ':''}\${cls}" style="background:\${bg}">\${currentDay}</div></div>\`;
                    currentDay++;
                }
            }
            grid.innerHTML = html;
        }

        function growHideBubble() {
            const bubble = document.getElementById("growBubble");
            if(bubble) {
                bubble.classList.remove("show");
                setTimeout(() => bubble.style.display = "none", 200);
            }
        }

        function growShowBubble(cell, date) {
            const bubble = document.getElementById("growBubble");
            const content = document.getElementById("growBubbleContent");
            const tail = document.getElementById("growTail");
            const active = growData.items.filter(g => growIsActive(g, date));
            const dayData = growData.progress[date] || {};
            const d = new Date(date+"T00:00:00");
            
            let html = \`<div class="grow-bubble-date">\${d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>\`;
            if(!active.length) html += "<div style='text-align:center;font-size:0.8rem;color:var(--text-secondary-light);'>No tasks active.</div>";
            else {
                for(let i=0; i<active.length; i++) {
                    const g = active[i];
                    const isDone = dayData[g.id] !== undefined;
                    html += \`<div class="grow-bubble-item" style="color:\${g.color}"><span>\${escapeHtml(g.title)}</span><i class="fas \${isDone?'fa-check-circle':'fa-circle'}"></i></div>\`;
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
                tail.style.borderBottom = "1px solid var(--border-light)";
                tail.style.borderRight = "1px solid var(--border-light)";
            } else {
                tail.style.top = "-6px";
                tail.style.bottom = "auto";
                tail.style.borderTop = "1px solid var(--border-light)";
                tail.style.borderLeft = "1px solid var(--border-light)";
                tail.style.borderBottom = "none";
                tail.style.borderRight = "none";
            }
            
            setTimeout(() => {
                bubble.style.opacity = "1";
                bubble.classList.add("show");
            }, 10);
        }

        function growInitAddPalette() {
            const container = document.getElementById("growAddPalette");
            if(!container) return;
            const input = document.getElementById("growAddColor");
            const used = growData.items.map(g => g.color);
            let html = "", first = null;
            
            for(let i=0; i<growColors.length; i++) {
                const c = growColors[i];
                const isUsed = used.includes(c);
                if(!isUsed && !first) first = c;
                html += \`<div class="grow-swatch \${isUsed?'hidden':''}" style="background:\${c}" data-color="\${c}"></div>\`;
            }
            container.innerHTML = html;
            
            if(first) {
                input.value = first;
                const firstSwatch = container.querySelector(\`[data-color="\${first}"]\`);
                if(firstSwatch) firstSwatch.classList.add("selected");
            }
            
            container.onclick = function(e) {
                if(e.target.classList.contains("grow-swatch") && !e.target.classList.contains("hidden")) {
                    Array.from(container.children).forEach(el => el.classList.remove("selected"));
                    e.target.classList.add("selected");
                    input.value = e.target.dataset.color;
                }
            };
        }

        function growInitEditPalette(current) {
            const container = document.getElementById("growEditPalette");
            if(!container) return;
            const input = document.getElementById("growEditColor");
            let html = "";
            for(let i=0; i<growColors.length; i++) {
                const c = growColors[i];
                html += \`<div class="grow-swatch \${c===current?'selected':''}" style="background:\${c}" data-color="\${c}"></div>\`;
            }
            container.innerHTML = html;
            input.value = current;
            
            container.onclick = function(e) {
                if(e.target.classList.contains("grow-swatch")) {
                    Array.from(container.children).forEach(el => el.classList.remove("selected"));
                    e.target.classList.add("selected");
                    input.value = e.target.dataset.color;
                }
            };
        }

        function growOpenAddModal() {
            if (growData.items.length >= 8) {
                showToast("All colors occupied! Cannot add more.", "error");
                return;
            }
            document.getElementById("growAddStart").value = growToday;
            document.getElementById("growAddType").value = "integer";
            growInitAddPalette();
            openModal('growAddModal');
        }

        function growToggleDataFields(mode) {
            const prefix = mode === "add" ? "growAdd" : "growEdit";
            const checked = document.getElementById(prefix+"HasData").checked;
            document.getElementById(prefix+"DataFields").style.display = checked ? "block" : "none";
        }

        function growOpenLogModal(date) {
            const active = growData.items.filter(g => growIsActive(g, date));
            const d = new Date(date+"T00:00:00");
            document.getElementById("growLogTitle").innerText = d.toLocaleDateString("en-US",{month:"long",day:"numeric"});
            let html = "";
            const dayData = growData.progress[date] || {};
            
            for(let i=0; i<active.length; i++) {
                const item = active[i];
                const done = dayData[item.id] !== undefined;
                
                html += \`<div class="grow-card">
                    <details style="display:contents;">
                        <summary style="outline:none; list-style:none;">
                            <div class="grow-title-section"><i class="fas fa-chevron-right"></i><span class="grow-title">\${escapeHtml(item.title)}</span></div>
                            <div class="grow-actions">
                                <button class="grow-btn-icon" onclick="event.preventDefault(); growHandleLogClick('\${item.id}','\${date}')" style="background:\${done?'var(--hover-light)':'var(--grow-accent)'};color:\${done?'var(--text-secondary-light)':'white'}; width:36px; height:36px;" \${done?'disabled':''}><i class="fas fa-check"></i></button>
                            </div>
                        </summary>\`;
                if(item.description) html += \`<div class="grow-desc-container"><div class="grow-desc" style="border-left-color:var(--grow-accent)">\${escapeHtml(item.description)}</div></div>\`;
                html += \`</details></div>\`;
            }
            document.getElementById("growDailyList").innerHTML = html;
            growShowLogList();
            openModal('growLogModal');
        }

        function growHandleLogClick(id, date) {
            const item = growData.items.find(g => g.id === id);
            if(item.hasData) {
                growOpenLogQuestion(item, date);
            } else {
                growSaveLog(item, date, true);
            }
        }

        function growOpenLogQuestion(item, date) {
            growLogContext = {item, date};
            document.getElementById("growQTitle").innerText = item.title;
            document.getElementById("growQDesc").innerHTML = item.description ? \`<div class="grow-desc" style="border-left-color:var(--grow-accent);margin-bottom:12px;">\${escapeHtml(item.description)}</div>\` : "";
            document.getElementById("growQLabel").innerText = item.question;
            
            const wrapper = document.getElementById("growQInput");
            const step = item.type === "float" ? "0.01" : "1";
            wrapper.innerHTML = \`<input type="number" step="\${step}" class="form-control" id="growLogValue" placeholder="Enter numerical value">\`;
            
            document.getElementById("growLogListView").style.display = "none";
            document.getElementById("growLogQuestionView").style.display = "block";
        }

        async function growSaveLog(item, date, val) {
            showLoader();
            try {
                const payload = { itemId: item.id, dateStr: date, value: val };
                await fetch("/api/grow/log", {
                    method:"POST", 
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(payload)
                });
                await growFetchData();
                showToast("Growth progress logged successfully!", "success");
                
                const active = growData.items.filter(g => growIsActive(g, date));
                const dayData = growData.progress[date] || {};
                const allDone = active.length && active.every(g => dayData[g.id] !== undefined);
                
                if(allDone) {
                    closeModal('growLogModal');
                    const cell = document.querySelector(\`.grow-day[data-date="\${date}"]\`);
                    if(cell) growShowBubble(cell, date);
                } else {
                    growOpenLogModal(date); 
                }
            } catch (err) {
                showToast("Failed to save progress.", "error");
            }
            hideLoader();
        }

        function growShowLogList() { 
            document.getElementById("growLogListView").style.display = "block"; 
            document.getElementById("growLogQuestionView").style.display = "none"; 
        }

        function renderGrowPage() {
            return \`
                <details class="grow-panel">
                    <summary><span>Progress Overview</span><i class="fas fa-chevron-down"></i></summary>
                    <div class="grow-panel-body" id="growGraphs"></div>
                </details>
                
                <details class="grow-panel" open>
                    <summary><span>Activity Calendar</span><i class="fas fa-chevron-down"></i></summary>
                    <div class="grow-panel-body">
                        <div class="grow-month-nav">
                            <button class="grow-nav-btn" onclick="growChangeMonth(-1)"><i class="fas fa-chevron-left"></i></button>
                            <h2 id="growMonthYear"></h2>
                            <button class="grow-nav-btn" onclick="growChangeMonth(1)"><i class="fas fa-chevron-right"></i></button>
                        </div>
                        <div class="grow-calendar"><div class="grow-grid" id="growCalendar"></div></div>
                    </div>
                </details>
                
                <details class="grow-panel" open>
                    <summary><span>Manage Growth</span><i class="fas fa-chevron-down"></i></summary>
                    <div class="grow-panel-body" id="growList"></div>
                </details>
                
                <button class="fab" style="background: var(--grow-accent);" onclick="growOpenAddModal()"><i class="fas fa-plus"></i></button>
            \`;
        }

        // ===== TASKS PAGE FUNCTIONS =====
        function renderTasksPage() {
            let html = '<h1 class="page-title">Today\'s Tasks</h1><div class="tasks-grid">';
            if (!tasksData || tasksData.length === 0) {
                html += '<div class="empty-state" style="grid-column: 1/-1;"><i class="fas fa-clipboard-list" style="font-size: 2rem;"></i><h3 style="margin-top: 12px;">No tasks</h3></div>';
            } else {
                tasksData.forEach((task) => {
                    const hasDescription = task.description && task.description.trim().length > 0;
                    const progress = task.subtaskProgress || 0;
                    const circleCircumference = 2 * Math.PI * 16;
                    const circleOffset = circleCircumference - (progress / 100) * circleCircumference;
                    const completedSubtasks = task.subtasks ? task.subtasks.filter(s => s.completed).length : 0;
                    const totalSubtasks = task.subtasks ? task.subtasks.length : 0;
                    const descriptionId = 'task_desc_' + task.taskId;
                    const escapedTitle = escapeHtml(task.title);
                    
                    html += '<div class="task-card"><div class="task-header"><div class="task-title-section"><div class="task-title-container" onclick="toggleDescription(\\'' + descriptionId + '\\')"><i class="fas fa-chevron-right" id="' + descriptionId + '_icon"></i><span class="task-title">' + escapedTitle + '</span></div></div><div class="task-actions">';
                    if (totalSubtasks < 10) html += '<button class="action-btn" onclick="openAddSubtaskModal(\\'' + task.taskId + '\\')"><i class="fas fa-plus"></i></button>';
                    html += '<button class="action-btn" onclick="openEditTaskModal(\\'' + task.taskId + '\\')"><i class="fas fa-pencil-alt"></i></button><button class="action-btn" onclick="completeTask(\\'' + task.taskId + '\\')"><i class="fas fa-check"></i></button><button class="action-btn delete" onclick="deleteTask(\\'' + task.taskId + '\\')"><i class="fas fa-trash"></i></button></div></div>';
                    if (hasDescription) html += '<div id="' + descriptionId + '" class="task-description-container hidden"><div class="task-description">' + preserveLineBreaks(task.description) + '</div></div>';
                    
                    let displayDate = task.dateIST || task.startDateStr;
                    if (displayDate && displayDate.includes('-') && displayDate.split('-')[0].length === 4) {
                        const parts = displayDate.split('-');
                        displayDate = parts[2] + '-' + parts[1] + '-' + parts[0];
                    }
                    html += '<div class="task-time-row"><span class="date-chip"><i class="fas fa-calendar-alt"></i> ' + displayDate + '</span><span class="time-chip"><i class="fas fa-clock"></i> ' + (task.startTimeIST || task.startTimeStr) + '-' + (task.endTimeIST || task.endTimeStr) + '</span></div>';
                    
                    if (totalSubtasks > 0) {
                        html += '<details class="task-subtasks"><summary class="flex-row" style="cursor: pointer;"><div class="progress-ring-small"><svg width="40" height="40"><circle class="progress-ring-circle-small" stroke="var(--progress-bg-light)" stroke-width="3" fill="transparent" r="16" cx="20" cy="20"/><circle class="progress-ring-circle-small" stroke="var(--accent-light)" stroke-width="3" fill="transparent" r="16" cx="20" cy="20" style="stroke-dasharray: ' + circleCircumference + '; stroke-dashoffset: ' + circleOffset + '; "/></svg><span class="progress-text-small">' + progress + '%</span></div><span style="font-size: 0.8rem; color: var(--text-secondary-light);">' + completedSubtasks + '/' + totalSubtasks + ' subtasks</span></summary><div class="subtasks-container w-100">';
                        task.subtasks.sort((a, b) => { if (a.completed === b.completed) return 0; return a.completed ? 1 : -1; }).forEach((subtask) => {
                            const subtaskHasDesc = subtask.description && subtask.description.trim().length > 0;
                            const subtaskDescId = 'subtask_desc_' + task.taskId + '_' + subtask.id;
                            const escapedSubtaskTitle = escapeHtml(subtask.title);
                            html += '<div class="subtask-item"><div class="subtask-main-row"><div class="subtask-checkbox ' + (subtask.completed ? 'completed' : '') + '" onclick="toggleSubtask(\\'' + task.taskId + '\\', \\'' + subtask.id + '\\')">' + (subtask.completed ? '<i class="fas fa-check"></i>' : '') + '</div><div class="subtask-details"><div class="subtask-title-container" onclick="toggleDescription(\\'' + subtaskDescId + '\\')"><span class="subtask-title ' + (subtask.completed ? 'completed' : '') + '">' + escapedSubtaskTitle + '</span></div></div><div class="subtask-actions"><button class="subtask-btn" onclick="editSubtask(\\'' + task.taskId + '\\', \\'' + subtask.id + '\\', \\'' + escapedSubtaskTitle.replace(/'/g, "\\\\'") + '\\', \\'' + (subtask.description || '').replace(/'/g, "\\\\'") + '\\')"><i class="fas fa-pencil-alt"></i></button><button class="subtask-btn delete" onclick="deleteSubtask(\\'' + task.taskId + '\\', \\'' + subtask.id + '\\')"><i class="fas fa-trash"></i></button></div></div>';
                            if (subtaskHasDesc) html += '<div id="' + subtaskDescId + '" class="subtask-description-container hidden"><div class="subtask-description">' + preserveLineBreaks(subtask.description) + '</div></div>';
                            html += '</div>';
                        });
                        html += '</div></details>';
                    } else { html += '<div class="flex-row" style="margin-top: 8px;"><span style="font-size: 0.8rem; color: var(--text-secondary-light);"><i class="fas fa-tasks"></i> No subtasks</span></div>'; }
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
            if (!notesData || notesData.length === 0) { html += '<div class="empty-state" style="grid-column: 1/-1;"><i class="fas fa-note-sticky" style="font-size: 2rem;"></i><h3 style="margin-top: 12px;">No notes</h3></div>'; } 
            else {
                notesData.forEach(note => {
                    const hasDescription = note.description && note.description.trim().length > 0;
                    const noteDescId = 'note_desc_' + note.noteId;
                    const escapedNoteTitle = escapeHtml(note.title);
                    html += '<div class="note-card"><div class="note-header"><div class="task-title-container" onclick="toggleDescription(\\'' + noteDescId + '\\')"><i class="fas fa-chevron-right" id="' + noteDescId + '_icon"></i><span class="note-title">' + escapedNoteTitle + '</span></div><div style="display: flex; gap: 4px;"><button class="action-btn" onclick="moveNote(\\'' + note.noteId + '\\', \\'up\\')"><i class="fas fa-arrow-up"></i></button><button class="action-btn" onclick="moveNote(\\'' + note.noteId + '\\', \\'down\\')"><i class="fas fa-arrow-down"></i></button><button class="action-btn" onclick="openEditNoteModal(\\'' + note.noteId + '\\', \\'' + escapedNoteTitle.replace(/'/g, "\\\\'") + '\\', \\'' + (note.description || '').replace(/'/g, "\\\\'") + '\\')"><i class="fas fa-pencil-alt"></i></button><button class="action-btn delete" onclick="deleteNote(\\'' + note.noteId + '\\')"><i class="fas fa-trash"></i></button></div></div>';
                    if (hasDescription) html += '<div id="' + noteDescId + '" class="note-content-container hidden"><div class="note-content">' + preserveLineBreaks(note.description) + '</div></div>';
                    html += '<div class="note-meta"><span><i class="fas fa-clock"></i> ' + note.createdAtIST + '</span>' + (note.updatedAtIST !== note.createdAtIST ? '<span><i class="fas fa-pencil-alt"></i> ' + note.updatedAtIST + '</span>' : '') + '</div></div>';
                });
            }
            html += '</div>'; return html;
        }

        function renderHistoryPage() {
            let html = '<h1 class="page-title">History</h1>';
            html += '<div class="history-header"><div class="month-selector"><button class="month-btn" onclick="changeMonth(-1)"><i class="fas fa-chevron-left"></i> Prev</button><span style="font-weight: 600;">' + new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' }) + ' ' + currentYear + '</span><button class="month-btn" onclick="changeMonth(1)">Next <i class="fas fa-chevron-right"></i></button></div></div>';
            html += '<div class="history-grid">';
            
            const filteredHistory = filterHistoryByMonth(historyData, currentYear, currentMonth);
            const dates = Object.keys(filteredHistory).sort().reverse();
            
            if (dates.length === 0) { html += '<div class="empty-state"><i class="fas fa-history" style="font-size: 2rem;"></i><h3 style="margin-top: 12px;">No history</h3></div>'; } 
            else {
                dates.forEach(date => {
                    const tasks = filteredHistory[date];
                    let displayDateHeader = date;
                    if (date.includes('-') && date.split('-')[0].length === 4) {
                        const parts = date.split('-'); displayDateHeader = parts[2] + '-' + parts[1] + '-' + parts[0];
                    }
                    html += '<div class="history-date-card"><details class="history-details">';
                    html += '<summary><i class="fas fa-calendar-alt"></i><span style="font-weight: 600;">' + displayDateHeader + '</span><span class="badge" style="margin-left: auto;">' + tasks.length + ' task(s)</span></summary>';
                    html += '<div class="history-tasks-grid">';
                    
                    tasks.forEach(task => {
                        const hasDescription = task.description && task.description.trim().length > 0;
                        const historyDescId = 'history_desc_' + task._id;
                        const escapedHistoryTitle = escapeHtml(task.title);
                        html += '<div class="history-task-card"><div class="history-task-header"><div class="task-title-container" onclick="toggleDescription(\\'' + historyDescId + '\\')"><i class="fas fa-chevron-right"></i><span class="history-task-title">' + escapedHistoryTitle + '</span></div><span class="history-task-time"><i class="fas fa-check-circle" style="color: var(--success-light);"></i> ' + task.completedTimeIST + '</span></div>';
                        if (hasDescription) html += '<div id="' + historyDescId + '" class="history-description-container hidden"><div class="history-description">' + preserveLineBreaks(task.description) + '</div></div>';
                        html += '<div style="display: flex; gap: 6px; margin: 8px 0; flex-wrap: wrap;"><span class="badge"><i class="fas fa-clock"></i> ' + task.startTimeIST + '-' + task.endTimeIST + '</span><span class="badge"><i class="fas fa-hourglass-half"></i> ' + task.durationFormatted + '</span>' + (task.repeat && task.repeat !== 'none' ? '<span class="badge"><i class="fas fa-repeat"></i> ' + (task.repeat === 'daily' ? 'Daily' : 'Weekly') + '</span>' : '') + '</div>';
                        if (task.subtasks && task.subtasks.length > 0) {
                            html += '<details style="margin-top: 8px;"><summary style="cursor: pointer; color: var(--accent-light); font-weight: 600; font-size: 0.8rem;"><i class="fas fa-tasks"></i> Subtasks (' + task.subtasks.filter(s => s.completed).length + '/' + task.subtasks.length + ')</summary><div style="margin-top: 8px;">';
                            task.subtasks.forEach(subtask => {
                                const subtaskHasDesc = subtask.description && subtask.description.trim().length > 0;
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

        function changeMonth(delta) {
            currentMonth += delta;
            if (currentMonth < 0) { currentMonth = 11; currentYear--; } else if (currentMonth > 11) { currentMonth = 0; currentYear++; }
            renderPage();
        }

        function openModal(modalId) { document.getElementById(modalId).style.display = 'flex'; document.body.style.overflow = 'hidden'; }
        function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; document.body.style.overflow = 'auto'; }
        function openAddModal() { if (currentPage === 'tasks') openAddTaskModal(); else if (currentPage === 'notes') openAddNoteModal(); }

        function openAddTaskModal() {
            const istNow = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
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
                document.getElementById('editStartDate').value = task.startDateStr || task.startDateIST;
                document.getElementById('editStartTime').value = task.startTimeStr || task.startTimeIST;
                document.getElementById('editEndTime').value = task.endTimeStr || task.endTimeIST;
                document.getElementById('editRepeatSelect').value = task.repeat || 'none';
                document.getElementById('editRepeatCount').value = task.repeatCount || 7;
                document.getElementById('editRepeatCountGroup').style.display = task.repeat !== 'none' ? 'block' : 'none';
                openModal('editTaskModal');
            }).catch(err => { showToast('Error loading task', 'error'); });
        }

        function openAddSubtaskModal(taskId) { document.getElementById('subtaskTaskId').value = taskId; openModal('addSubtaskModal'); }
        function editSubtask(taskId, subtaskId, title, description) { 
            document.getElementById('editSubtaskTaskId').value = taskId; 
            document.getElementById('editSubtaskId').value = subtaskId; 
            document.getElementById('editSubtaskTitle').value = title; 
            document.getElementById('editSubtaskDescription').value = description || ''; 
            openModal('editSubtaskModal'); 
        }
        function openAddNoteModal() { openModal('addNoteModal'); }
        function openEditNoteModal(noteId, title, description) { 
            document.getElementById('editNoteId').value = noteId; 
            document.getElementById('editNoteTitle').value = title; 
            document.getElementById('editNoteDescription').value = description || ''; 
            openModal('editNoteModal'); 
        }

        function submitTaskForm(event) {
            event.preventDefault(); showLoader();
            fetch('/api/tasks', { method: 'POST', body: new URLSearchParams(new FormData(event.target)) })
            .then(res => { if(res.ok){ closeModal('addTaskModal'); showToast('Task created!'); switchPage('tasks'); } else { return res.text().then(t => {throw new Error(t);}); } })
            .catch(err => { showToast(err.message || 'Error creating task', 'error'); hideLoader(); });
        }

        function submitEditTaskForm(event) {
            event.preventDefault(); showLoader();
            const formData = new FormData(event.target);
            fetch('/api/tasks/' + formData.get('taskId') + '/update', { method: 'POST', body: new URLSearchParams(formData) })
            .then(res => { if(res.ok){ closeModal('editTaskModal'); showToast('Task updated!'); switchPage('tasks'); } else { return res.text().then(t => {throw new Error(t);}); } })
            .catch(err => { showToast(err.message || 'Error updating task', 'error'); hideLoader(); });
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
            const formData = new FormData(); 
            formData.append('direction', direction); 
            fetch('/api/notes/' + noteId + '/move', { method: 'POST', body: new URLSearchParams(formData) })
            .then(res => { if(res.ok){ showToast('Moved'); switchPage('notes'); } else throw new Error(''); })
            .catch(err => { showToast('Error moving', 'error'); hideLoader(); }); 
        }

        function toggleDescription(elementId) {
            const element = document.getElementById(elementId);
            if (element) {
                if (element.classList.contains('hidden')) element.classList.remove('hidden');
                else element.classList.add('hidden');
            }
        }

        document.addEventListener('DOMContentLoaded', function() {
            renderPage(); 
            updateActiveNav();
            setInterval(() => {
                const now = new Date();
                const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
                document.getElementById('currentTimeDisplay').innerHTML = String(istNow.getUTCHours()).padStart(2, '0') + ':' + String(istNow.getUTCMinutes()).padStart(2, '0');
                document.getElementById('currentDateDisplay').innerHTML = String(istNow.getUTCDate()).padStart(2, '0') + '-' + String(istNow.getUTCMonth() + 1).padStart(2, '0') + '-' + istNow.getUTCFullYear();
            }, 1000);
            document.getElementById('repeatSelect').addEventListener('change', function() { document.getElementById('repeatCountGroup').style.display = this.value === 'none' ? 'none' : 'block'; });
            document.getElementById('editRepeatSelect').addEventListener('change', function() { document.getElementById('editRepeatCountGroup').style.display = this.value === 'none' ? 'none' : 'block'; });
            window.addEventListener('click', function(event) { if (event.target.classList.contains('modal')) { event.target.style.display = 'none'; document.body.style.overflow = 'auto'; } });
            
            // Grow form listeners
            document.getElementById('growAddForm')?.addEventListener('submit', async function(e) {
                e.preventDefault();
                showLoader();
                
                const payload = {
                    title: document.getElementById('growAddTitle').value.trim(),
                    description: document.getElementById('growAddDesc').value.trim(),
                    startDate: document.getElementById('growAddStart').value,
                    endCount: parseInt(document.getElementById('growAddDays').value),
                    color: document.getElementById('growAddColor').value,
                    hasData: document.getElementById('growAddHasData').checked,
                    type: document.getElementById('growAddType').value,
                    question: document.getElementById('growAddQuestion').value.trim(),
                    start: document.getElementById('growAddMin').value,
                    end: document.getElementById('growAddMax').value
                };
                
                try {
                    await fetch("/api/grow", {
                        method:"POST", 
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify(payload)
                    });
                    
                    closeModal('growAddModal');
                    document.getElementById('growAddForm').reset();
                    document.getElementById('growAddDataFields').style.display = "none";
                    await growFetchData();
                    showToast("New tracker created successfully!", "success");
                } catch(e) {
                    showToast("Failed to create tracker", "error");
                }
                hideLoader();
            });

            document.getElementById('growEditForm')?.addEventListener('submit', async function(e) {
                e.preventDefault();
                showLoader();
                
                const id = document.getElementById('growEditId').value;
                const payload = {
                    id: id,
                    title: document.getElementById('growEditTitle').value.trim(),
                    description: document.getElementById('growEditDesc').value.trim(),
                    startDate: document.getElementById('growEditStart').value,
                    endCount: parseInt(document.getElementById('growEditDays').value),
                    color: document.getElementById('growEditColor').value,
                    hasData: document.getElementById('growEditHasData').checked,
                    type: document.getElementById('growEditType').value,
                    question: document.getElementById('growEditQuestion').value.trim(),
                    start: document.getElementById('growEditMin').value,
                    end: document.getElementById('growEditMax').value
                };
                
                try {
                    await fetch("/api/grow/"+id+"/update", {
                        method:"POST", 
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify(payload)
                    });
                    closeModal('growEditModal');
                    await growFetchData();
                    showToast("Tracker updated!", "success");
                } catch(e) {
                    showToast("Failed to update", "error");
                }
                hideLoader();
            });

            document.getElementById('growSaveLogBtn')?.addEventListener('click', async function() {
                const input = document.getElementById('growLogValue');
                if(!input || !input.value) {
                    showToast("Please enter a valid numerical value.", "error");
                    return;
                }
                const {item, date} = growLogContext;
                const val = item.type === "float" ? parseFloat(input.value) : parseInt(input.value);
                await growSaveLog(item, date, val);
            });
        });
    </script>
</body>
</html>`;
    
    fs.writeFileSync(path.join(viewsDir, 'index.ejs'), mainEJS);
}
writeMainEJS();

// ==========================================
// 📱 WEB INTERFACE ROUTES
// ==========================================
app.get('/', (req, res) => res.redirect('/tasks'));

app.get('/tasks', async (req, res) => {
    try {
        const istDateObj = getCurrentISTDisplay();
        const startOfDayUTC = istToUTC(istDateObj.date, "00:00");
        const endOfDayUTC = istToUTC(istDateObj.date, "23:59");
        
        const tasks = await db.collection('tasks').find({ status: 'pending', nextOccurrence: { $gte: startOfDayUTC, $lt: endOfDayUTC } }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray();
        res.render('index', {
            currentPage: 'tasks',
            tasks: tasks.map(task => ({
                ...task, 
                taskId: task.taskId, 
                startTimeIST: task.startTimeStr || formatLegacyIST(task.startDate, 'time'), 
                endTimeIST: task.endTimeStr || formatLegacyIST(task.endDate, 'time'), 
                dateIST: task.startDateStr || formatLegacyIST(task.startDate, 'date'), 
                durationFormatted: formatDuration(calculateDuration(task.startDate, task.endDate)), 
                subtaskProgress: calculateSubtaskProgress(task.subtasks), 
                subtasks: task.subtasks || []
            })),
            notes: [], groupedHistory: {}, currentTime: istDateObj.displayTime, currentDate: istDateObj.displayDate
        });
    } catch (error) { res.status(500).send(error.message); }
});

app.get('/grow', async (req, res) => {
    try {
        const istDateObj = getCurrentISTDisplay();
        res.render('index', { currentPage: 'grow', tasks: [], notes: [], groupedHistory: {}, currentTime: istDateObj.displayTime, currentDate: istDateObj.displayDate });
    } catch (error) { res.status(500).send(error.message); }
});

app.get('/notes', async (req, res) => {
    try {
        const notes = await db.collection('notes').find().sort({ orderIndex: 1, createdAt: -1 }).toArray();
        const istDateObj = getCurrentISTDisplay();
        res.render('index', { 
            currentPage: 'notes', 
            tasks: [], 
            notes: notes.map(n => ({ 
                ...n, 
                createdAtIST: formatLegacyIST(n.createdAt, 'date') + ' ' + formatLegacyIST(n.createdAt, 'time'), 
                updatedAtIST: n.updatedAt ? formatLegacyIST(n.updatedAt, 'date') + ' ' + formatLegacyIST(n.updatedAt, 'time') : '' 
            })), 
            groupedHistory: {}, 
            currentTime: istDateObj.displayTime, 
            currentDate: istDateObj.displayDate 
        });
    } catch (error) { res.status(500).send(error.message); }
});

app.get('/history', async (req, res) => {
    try {
        const history = await db.collection('history').find().sort({ completedAt: -1 }).limit(500).toArray();
        const groupedHistory = {};
        history.forEach(item => {
            const dateKey = item.completedDateStr || formatLegacyIST(item.completedAt, 'date');
            if (!groupedHistory[dateKey]) groupedHistory[dateKey] = [];
            groupedHistory[dateKey].push({ 
                ...item, 
                completedTimeIST: item.completedTimeStr || formatLegacyIST(item.completedAt, 'time'), 
                startTimeIST: item.startTimeStr || formatLegacyIST(item.startDate, 'time'), 
                endTimeIST: item.endTimeStr || formatLegacyIST(item.endDate, 'time'), 
                durationFormatted: formatDuration(calculateDuration(item.startDate, item.endDate)) 
            });
        });
        const istDateObj = getCurrentISTDisplay();
        res.render('index', { 
            currentPage: 'history', 
            tasks: [], 
            notes: [], 
            groupedHistory, 
            currentTime: istDateObj.displayTime, 
            currentDate: istDateObj.displayDate 
        });
    } catch (error) { res.status(500).send(error.message); }
});

app.get('/api/page/:page', async (req, res) => {
    try {
        const page = req.params.page;
        if (page === 'tasks') {
            const istDateObj = getCurrentISTDisplay();
            const startOfDayUTC = istToUTC(istDateObj.date, "00:00");
            const endOfDayUTC = istToUTC(istDateObj.date, "23:59");
            const tasks = await db.collection('tasks').find({ status: 'pending', nextOccurrence: { $gte: startOfDayUTC, $lt: endOfDayUTC } }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray();
            res.json({ tasks: tasks.map(task => ({ 
                ...task, 
                startTimeIST: task.startTimeStr || formatLegacyIST(task.startDate, 'time'), 
                endTimeIST: task.endTimeStr || formatLegacyIST(task.endDate, 'time'), 
                dateIST: task.startDateStr || formatLegacyIST(task.startDate, 'date'), 
                durationFormatted: formatDuration(calculateDuration(task.startDate, task.endDate)), 
                subtaskProgress: calculateSubtaskProgress(task.subtasks) 
            })) });
        } else if (page === 'grow') {
            res.json({});
        } else if (page === 'notes') {
            const notes = await db.collection('notes').find().sort({ orderIndex: 1, createdAt: -1 }).toArray();
            res.json({ notes: notes.map(n => ({ 
                ...n, 
                createdAtIST: formatLegacyIST(n.createdAt, 'date') + ' ' + formatLegacyIST(n.createdAt, 'time'), 
                updatedAtIST: n.updatedAt ? formatLegacyIST(n.updatedAt, 'date') + ' ' + formatLegacyIST(n.updatedAt, 'time') : '' 
            })) });
        } else if (page === 'history') {
            const history = await db.collection('history').find().sort({ completedAt: -1 }).limit(500).toArray();
            const groupedHistory = {};
            history.forEach(item => {
                const dateKey = item.completedDateStr || formatLegacyIST(item.completedAt, 'date');
                if (!groupedHistory[dateKey]) groupedHistory[dateKey] = [];
                groupedHistory[dateKey].push({ 
                    ...item, 
                    completedTimeIST: item.completedTimeStr || formatLegacyIST(item.completedAt, 'time'), 
                    startTimeIST: item.startTimeStr || formatLegacyIST(item.startDate, 'time'), 
                    endTimeIST: item.endTimeStr || formatLegacyIST(item.endDate, 'time'), 
                    durationFormatted: formatDuration(calculateDuration(item.startDate, item.endDate)) 
                });
            });
            res.json({ groupedHistory });
        } else { res.status(404).json({ error: 'Not found' }); }
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/tasks/:taskId', async (req, res) => {
    try {
        const task = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        if (!task) return res.status(404).json({ error: 'Not found' });
        res.json({ 
            ...task, 
            startDateIST: task.startDateStr || formatLegacyIST(task.startDate, 'date'), 
            startTimeIST: task.startTimeStr || formatLegacyIST(task.startDate, 'time'), 
            endTimeIST: task.endTimeStr || formatLegacyIST(task.endDate, 'time') 
        });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/tasks', async (req, res) => {
    try {
        const { title, description, startDate, startTime, endTime, repeat, repeatCount } = req.body;
        const startDateUTC = istToUTC(startDate, startTime); 
        const endDateUTC = istToUTC(startDate, endTime);
        
        if (!startDateUTC || !endDateUTC || endDateUTC <= startDateUTC) {
            return res.status(400).send('End time must be after start time.');
        }
        
        const task = { 
            taskId: generateTaskId(), 
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
            orderIndex: (await db.collection('tasks').countDocuments()) || 0, 
            startTimeStr: startTime, 
            endTimeStr: endTime, 
            startDateStr: startDate 
        };
        await db.collection('tasks').insertOne(task);
        if (task.startDate > new Date()) scheduleTask(task);
        try { await bot.telegram.sendMessage(CHAT_ID, `➕ <b>Added:</b> ${task.title}`, { parse_mode: 'HTML' }); } catch(e){}
        res.redirect('/tasks');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/update', async (req, res) => {
    try {
        const { title, description, startDate, startTime, endTime, repeat, repeatCount } = req.body;
        const startDateUTC = istToUTC(startDate, startTime); 
        const endDateUTC = istToUTC(startDate, endTime);
        
        if (!startDateUTC || endDateUTC <= startDateUTC) { return res.status(400).send('End time must be after start time.'); }
        
        cancelTaskSchedule(req.params.taskId);
        await db.collection('tasks').updateOne(
            { taskId: req.params.taskId }, 
            { $set: { 
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
            } }
        );
        const t = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        if (t && t.startDate > new Date()) scheduleTask(t);
        res.redirect('/tasks');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/complete', async (req, res) => {
    try {
        const task = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        if (!task || (task.subtasks || []).some(s => !s.completed)) return res.status(400).send('Complete subtasks first');
        
        const istNow = getCurrentISTDisplay();
        await db.collection('history').insertOne({ 
            ...task, 
            _id: undefined, 
            completedAt: new Date(), 
            completedDateStr: istNow.displayDate, 
            completedTimeStr: istNow.displayTime, 
            originalTaskId: task.taskId, 
            status: 'completed' 
        });
        cancelTaskSchedule(task.taskId);
        
        if (task.repeat !== 'none' && task.repeatCount > 0) {
            const nextUTC = new Date(task.nextOccurrence); 
            nextUTC.setUTCDate(nextUTC.getUTCDate() + (task.repeat === 'weekly' ? 7 : 1));
            const nextISTDisplay = formatLegacyIST(nextUTC, 'date');
            
            await db.collection('tasks').updateOne(
                { taskId: task.taskId }, 
                { $set: { 
                    nextOccurrence: nextUTC, 
                    repeatCount: task.repeatCount - 1, 
                    startDate: nextUTC, 
                    startDateStr: nextISTDisplay, 
                    endDate: new Date(nextUTC.getTime() + (task.endDate.getTime() - task.startDate.getTime())), 
                    subtasks: (task.subtasks || []).map(s => ({...s, completed: false})) 
                } }
            );
            const t = await db.collection('tasks').findOne({ taskId: task.taskId });
            if (t && t.nextOccurrence > new Date()) scheduleTask(t);
            try { await bot.telegram.sendMessage(CHAT_ID, `✅ <b>Completed:</b> ${task.title}\n🔄 Next: ${nextISTDisplay}`, { parse_mode: 'HTML' }); } catch(e){}
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
        await db.collection('tasks').updateOne(
            { taskId: req.params.taskId }, 
            { $push: { subtasks: { 
                id: generateSubtaskId(), 
                title: req.body.title.trim(), 
                description: req.body.description || '', 
                completed: false, 
                createdAt: new Date() 
            } } }
        );
        res.redirect('/tasks');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/update', async (req, res) => {
    try {
        if (!req.body.title) return res.status(400).send('Empty title');
        await db.collection('tasks').updateOne(
            { taskId: req.params.taskId, "subtasks.id": req.params.subtaskId }, 
            { $set: { 
                "subtasks.$.title": req.body.title.trim(), 
                "subtasks.$.description": req.body.description || '' 
            } }
        );
        res.redirect('/tasks');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/toggle', async (req, res) => {
    try {
        const task = await db.collection('tasks').findOne({ taskId: req.params.taskId });
        const sub = (task.subtasks || []).find(s => s.id === req.params.subtaskId);
        await db.collection('tasks').updateOne(
            { taskId: req.params.taskId, "subtasks.id": req.params.subtaskId }, 
            { $set: { "subtasks.$.completed": !sub.completed } }
        );
        res.redirect('/tasks');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/delete', async (req, res) => {
    try {
        await db.collection('tasks').updateOne(
            { taskId: req.params.taskId }, 
            { $pull: { subtasks: { id: req.params.subtaskId } } }
        );
        res.redirect('/tasks');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/notes', async (req, res) => {
    try {
        if (!req.body.title) return res.status(400).send('Empty title');
        const note = { 
            noteId: generateTaskId(), 
            title: req.body.title.trim(), 
            description: req.body.description || '', 
            createdAt: new Date(), 
            updatedAt: new Date(), 
            orderIndex: await db.collection('notes').countDocuments() 
        };
        await db.collection('notes').insertOne(note);
        res.redirect('/notes');
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/notes/:noteId/update', async (req, res) => {
    try {
        if (!req.body.title) return res.status(400).send('Empty title');
        await db.collection('notes').updateOne(
            { noteId: req.params.noteId }, 
            { $set: { 
                title: req.body.title.trim(), 
                description: req.body.description || '', 
                updatedAt: new Date() 
            } }
        );
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
            const t = notes[idx].orderIndex; 
            notes[idx].orderIndex = notes[idx-1].orderIndex; 
            notes[idx-1].orderIndex = t;
            await db.collection('notes').updateOne({ noteId: notes[idx].noteId }, { $set: { orderIndex: notes[idx].orderIndex } });
            await db.collection('notes').updateOne({ noteId: notes[idx-1].noteId }, { $set: { orderIndex: notes[idx-1].orderIndex } });
        } else if (req.body.direction === 'down' && idx < notes.length - 1) {
            const t = notes[idx].orderIndex; 
            notes[idx].orderIndex = notes[idx+1].orderIndex; 
            notes[idx+1].orderIndex = t;
            await db.collection('notes').updateOne({ noteId: notes[idx].noteId }, { $set: { orderIndex: notes[idx].orderIndex } });
            await db.collection('notes').updateOne({ noteId: notes[idx+1].noteId }, { $set: { orderIndex: notes[idx+1].orderIndex } });
        }
        res.redirect('/notes');
    } catch (error) { res.status(500).send(error.message); }
});

// ==========================================
// 🌱 GROW TRACKER API ROUTES
// ==========================================
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
// 🚀 BOOTSTRAP
// ==========================================
async function start() {
    try {
        if (await connectDB()) {
            await rescheduleAllPending();
            
            app.listen(PORT, '0.0.0.0', () => {
                console.log('🌐 Web interface running on port ' + PORT);
                console.log('🌍 Public Web URL: ' + WEB_APP_URL);
                console.log('🕐 IST Time: ' + getCurrentISTDisplay().dateTime);
            });
            
            await bot.launch();
            console.log('🤖 Bot Started Successfully!');
        } else {
            setTimeout(start, 5000);
        }
    } catch (error) {
        setTimeout(start, 10000);
    }
}

process.once('SIGINT', () => { isShuttingDown = true; bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { isShuttingDown = true; bot.stop('SIGTERM'); process.exit(0); });

start();
