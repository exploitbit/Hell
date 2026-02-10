const { Telegraf, session, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const schedule = require('node-schedule');
require('dotenv').config();

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const MONGODB_URI = process.env.MONGODB_URI || 'YOUR_MONGODB_URI_HERE';

const bot = new Telegraf(BOT_TOKEN);

// MongoDB Client
const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
});

let db;
// Map to store active jobs: key = taskId, value = { startJob, interval }
const activeSchedules = new Map();
// For hourly summary job
let hourlySummaryJob = null;

// Initialize Session
bot.use(session());

// ==========================================
// 🛠️ UTILITY FUNCTIONS - FIXED FOR IST TIMEZONE
// ==========================================

function generateId(length = 10) {
    return Math.random().toString(36).substring(2, 2 + length).toUpperCase();
}

// Get Current IST Time String (corrected)
function getCurrentIST() {
    const now = new Date();
    // Convert to IST (UTC+5:30)
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    return istTime.toLocaleTimeString('en-IN', {
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false
    });
}

// Get current date in IST (YYYY-MM-DD)
function getCurrentISTDate() {
    const now = new Date();
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    const year = istTime.getUTCFullYear();
    const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istTime.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Convert date to IST string
function formatDate(date) {
    const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
    return istDate.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        weekday: 'long'
    });
}

// Convert time to IST string
function formatTime(date) {
    const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
    return istDate.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function formatDateTime(date) {
    return `${formatDate(date)} at ${formatTime(date)}`;
}

function getDayName(date) {
    const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
    return istDate.toLocaleDateString('en-IN', {
        weekday: 'long'
    });
}

// Create IST Date from string inputs (corrected)
function createISTDate(year, month, day, hour = 0, minute = 0) {
    // Create date in local timezone as IST
    const date = new Date(year, month - 1, day, hour, minute, 0);
    // Subtract 5.5 hours to store as UTC (since IST is UTC+5:30)
    return new Date(date.getTime() - (5.5 * 60 * 60 * 1000));
}

// Check if two dates are the same day (in IST)
function isSameDay(date1, date2) {
    const d1 = new Date(date1.getTime() + (5.5 * 60 * 60 * 1000));
    const d2 = new Date(date2.getTime() + (5.5 * 60 * 60 * 1000));
    d1.setHours(0, 0, 0, 0);
    d2.setHours(0, 0, 0, 0);
    
    return d1.getTime() === d2.getTime();
}

// Get today's date at 00:00:00 in IST
function getTodayIST() {
    const now = new Date();
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    istTime.setHours(0, 0, 0, 0);
    // Convert back to UTC for storage
    return new Date(istTime.getTime() - (5.5 * 60 * 60 * 1000));
}

// Get tomorrow's date at 00:00:00 in IST
function getTomorrowIST() {
    const today = getTodayIST();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
}

// SIMPLIFIED safeEdit function
async function safeEdit(ctx, text, keyboard = null) {
    try {
        const options = { 
            parse_mode: 'HTML',
            ...(keyboard && { reply_markup: keyboard.reply_markup })
        };
        await ctx.editMessageText(text, options);
    } catch (err) {
        if (err.description && err.description.includes("message is not modified")) return;
        try {
            const options = { 
                parse_mode: 'HTML',
                ...(keyboard && { reply_markup: keyboard.reply_markup })
            };
            await ctx.reply(text, options);
        } catch (e) { 
            console.error('SafeEdit Error:', e);
            // Last resort: send without keyboard
            await ctx.reply(text, { parse_mode: 'HTML' });
        }
    }
}

// Format text in blockquote
function formatBlockquote(text) {
    if (!text || text.trim() === '') return '';
    return `<blockquote>${text}</blockquote>`;
}

// ==========================================
// 🗄️ DATABASE CONNECTION
// ==========================================

async function connectDB() {
    try {
        await client.connect();
        db = client.db('telegram_task_bot');
        console.log('✅ Connected to MongoDB');
        
        // Indexes
        await db.collection('tasks').createIndex({ userId: 1, status: 1 });
        await db.collection('tasks').createIndex({ taskId: 1 }, { unique: true });
        await db.collection('tasks').createIndex({ userId: 1, nextOccurrence: 1 });
        await db.collection('history').createIndex({ userId: 1, completedAt: -1 });
        await db.collection('notes').createIndex({ userId: 1 });
        await db.collection('notes').createIndex({ noteId: 1 }, { unique: true });
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error);
        return false;
    }
}

// ==========================================
// ⏰ FIXED SCHEDULER LOGIC (IST COMPATIBLE)
// ==========================================

function scheduleTask(task) {
    try {
        const taskId = task.taskId;
        const userId = task.userId;
        const startTime = new Date(task.startDate);
        const now = new Date();

        // 1. Clear existing schedules
        cancelTaskSchedule(taskId);

        // Skip if task start time has passed
        if (startTime <= now) {
            console.log(`⏰ Skipping task ${task.title} - start time has passed`);
            return;
        }

        // 2. Calculate notification start time (10 mins before)
        const notifyTime = new Date(startTime.getTime() - 10 * 60000);
        
        // If notify time is in the past, start immediately
        const triggerDate = notifyTime > now ? notifyTime : now;

        console.log(`⏰ Scheduled: ${task.title} for ${formatDateTime(startTime)}`);

        // Schedule the main notification job
        const startJob = schedule.scheduleJob(triggerDate, async function() {
            console.log(`🔔 Starting notifications for task: ${task.title}`);
            
            let count = 0;
            const maxNotifications = 10;
            
            // Send first notification immediately
            const sendNotification = async () => {
                const currentTime = new Date();
                
                // Stop if task started or max notifications reached
                if (currentTime >= startTime || count >= maxNotifications) {
                    const activeSchedule = activeSchedules.get(taskId);
                    if (activeSchedule && activeSchedule.interval) {
                        clearInterval(activeSchedule.interval);
                        activeSchedule.interval = null;
                    }
                    
                    // Send final "task started" message
                    if (currentTime >= startTime) {
                        try {
                            await bot.telegram.sendMessage(userId, 
                                `🚀 <b>TASK STARTED NOW!</b>\n\n` +
                                `📌 <b>${task.title}</b>\n\n` +
                                `Time to work! ⏰`, 
                                { parse_mode: 'HTML' }
                            );
                        } catch (e) {
                            console.error('Error sending start message:', e);
                        }
                    }
                    
                    return;
                }

                const minutesLeft = Math.ceil((startTime - currentTime) / 60000);
                if (minutesLeft <= 0) return;

                try {
                    await bot.telegram.sendMessage(userId, 
                        `🔔 <b>REMINDER (${count + 1}/${maxNotifications})</b>\n\n` +
                        `📌 <b>${task.title}</b>\n` +
                        `⏳ Starts in: <b>${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}</b>\n` +
                        `⏰ Start Time: ${formatTime(startTime)}\n` +
                        `📅 Date: ${formatDate(startTime)}\n` +
                        `━━━━━━━━━━━━━━━━━━━━`, 
                        { parse_mode: 'HTML' }
                    );
                    console.log(`📤 Sent notification ${count + 1} for task: ${task.title}`);
                } catch (e) {
                    console.error('Error sending notification:', e);
                }
                
                count++;
            };

            // Send first notification immediately
            await sendNotification();
            
            // Set up interval for remaining notifications (every minute)
            const interval = setInterval(sendNotification, 60000);
            
            // Store the interval in active schedules
            if (activeSchedules.has(taskId)) {
                activeSchedules.get(taskId).interval = interval;
            } else {
                activeSchedules.set(taskId, { startJob, interval });
            }
        });

        // Store the job
        if (activeSchedules.has(taskId)) {
            activeSchedules.get(taskId).startJob = startJob;
        } else {
            activeSchedules.set(taskId, { startJob });
        }

    } catch (error) {
        console.error(`❌ Scheduler Error for task ${task.taskId}:`, error);
    }
}

function cancelTaskSchedule(taskId) {
    if (activeSchedules.has(taskId)) {
        const s = activeSchedules.get(taskId);
        if (s.startJob) {
            s.startJob.cancel();
            console.log(`🗑️ Cancelled job for task ${taskId}`);
        }
        if (s.interval) {
            clearInterval(s.interval);
            console.log(`🗑️ Cleared interval for task ${taskId}`);
        }
        activeSchedules.delete(taskId);
    }
}

async function rescheduleAllPending() {
    try {
        const tasks = await db.collection('tasks').find({ 
            status: 'pending',
            startDate: { $gt: new Date() }
        }).toArray();
        
        console.log(`🔄 Rescheduling ${tasks.length} pending tasks...`);
        tasks.forEach(task => scheduleTask(task));
        console.log(`✅ Rescheduled ${tasks.length} tasks.`);
    } catch (error) {
        console.error('❌ Error rescheduling tasks:', error);
    }
}

// ==========================================
// ⏰ HOURLY SUMMARY SCHEDULER
// ==========================================

async function sendHourlySummary(userId) {
    try {
        const todayIST = getTodayIST();
        const tomorrowIST = getTomorrowIST();
        
        // Get completed tasks today
        const completedTasks = await db.collection('history').find({
            userId: userId,
            completedAt: {
                $gte: todayIST,
                $lt: tomorrowIST
            }
        }).sort({ completedAt: 1 }).toArray();
        
        // Get pending tasks for today
        const pendingTasks = await db.collection('tasks').find({
            userId: userId,
            status: 'pending',
            nextOccurrence: {
                $gte: todayIST,
                $lt: tomorrowIST
            }
        }).sort({ nextOccurrence: 1 }).toArray();
        
        let summaryText = `
🕰️ <b>𝗛𝗢𝗨𝗥𝗟𝗬 𝗦𝗨𝗠𝗠𝗔𝗥𝗬</b>
⏰ ${getCurrentIST()} ‧ 📅 ${formatDate(new Date())}
━━━━━━━━━━━━━━━━━━━━

✅ <b>𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗧𝗢𝗗𝗔𝗬:</b> ${completedTasks.length} task${completedTasks.length !== 1 ? 's' : ''}`;
        
        if (completedTasks.length > 0) {
            completedTasks.forEach((task, index) => {
                summaryText += `\n${index + 1}‧ ${task.title} ‧ ${formatTime(task.completedAt)}`;
            });
        } else {
            summaryText += `\n📭 No tasks completed yet today`;
        }
        
        summaryText += `\n\n⏳ <b>𝗣𝗘𝗡𝗗𝗜𝗡𝗚 𝗧𝗢𝗗𝗔𝗬:</b> ${pendingTasks.length} task${pendingTasks.length !== 1 ? 's' : ''}`;
        
        if (pendingTasks.length > 0) {
            pendingTasks.forEach((task, index) => {
                summaryText += `\n${index + 1}‧ ${task.title} ‧ ${formatTime(task.nextOccurrence)}`;
            });
        } else {
            summaryText += `\n📭 No pending tasks for today`;
        }
        
        summaryText += `\n\n━━━━━━━━━━━━━━━━━━━━\n⏰ Next update in 30 minutes`;
        
        try {
            await bot.telegram.sendMessage(userId, summaryText, { parse_mode: 'HTML' });
        } catch (e) {
            if (e.code !== 403) { // Not "bot blocked by user"
                console.error('Error sending hourly summary:', e);
            }
        }
        
    } catch (error) {
        console.error('Error generating hourly summary:', error);
    }
}

function scheduleHourlySummary() {
    // Cancel existing job if any
    if (hourlySummaryJob) {
        hourlySummaryJob.cancel();
    }
    
    // Schedule to run every 30 minutes
    hourlySummaryJob = schedule.scheduleJob('*/30 * * * *', async () => {
        console.log(`⏰ Sending hourly summaries...`);
        try {
            // Get all unique users
            const users = await db.collection('tasks').distinct('userId');
            for (const userId of users) {
                await sendHourlySummary(userId);
            }
        } catch (error) {
            console.error('Error sending hourly summaries:', error);
        }
    });
    
    console.log('✅ Hourly summary scheduler started');
}

// ==========================================
// 📱 MAIN MENU & START
// ==========================================

bot.command('start', async (ctx) => {
    ctx.session = {}; 
    const text = `
┌─━━━━━━━━━━━━━━━━─┐
│    🩵 𝗧𝗔𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 🩵   │
│      🧸‧₊˚✧ ༘⋆‧   │
├─━━━━━━━━━━━━━━━━─┤
│ ⏰ Time: ${getCurrentIST()}   │
│ 📅 Today: ${formatDate(new Date())} │
└─━━━━━━━━━━━━━━━━─┘

🌟 <b>Welcome to your Personal Task Manager!</b>

Manage tasks, set reminders, take notes, and stay organized. Get notified 10 minutes before each task!

<b>Quick Actions:</b>`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('📋 Today\'s Tasks', 'view_today_tasks')
        ],
        [
            Markup.button.callback('➕ Add Task', 'add_task'),
            Markup.button.callback('📝 Add Note', 'add_note')
        ],
        [
            Markup.button.callback('📜 History', 'view_history_dates_1'),
            Markup.button.callback('🗒️ Notes', 'view_notes_1')
        ],
        [
            Markup.button.callback('📥 Download', 'download_menu'),
            Markup.button.callback('🗑️ Delete', 'delete_menu')
        ]
    ]);

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
});

// MAIN MENU ACTION
bot.action('main_menu', async (ctx) => {
    await showMainMenu(ctx);
});

async function showMainMenu(ctx) {
    const text = `
┌─━━━━━━━━━━━━━━━━─┐
│    🩵 𝗧𝗔𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 🩵   │
│      🧸‧₊˚✧ ༘⋆‧   │
├─━━━━━━━━━━━━━━━━─┤
│ ⏰ Time: ${getCurrentIST()}   │
│ 📅 Today: ${formatDate(new Date())} │
└─━━━━━━━━━━━━━━━━─┘

🌟 <b>Select an option:</b>`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('📋 Today\'s Tasks', 'view_today_tasks')
        ],
        [
            Markup.button.callback('➕ Add Task', 'add_task'),
            Markup.button.callback('📝 Add Note', 'add_note')
        ],
        [
            Markup.button.callback('📜 History', 'view_history_dates_1'),
            Markup.button.callback('🗒️ Notes', 'view_notes_1')
        ],
        [
            Markup.button.callback('📥 Download', 'download_menu'),
            Markup.button.callback('🗑️ Delete', 'delete_menu')
        ]
    ]);

    await safeEdit(ctx, text, keyboard);
}

// ==========================================
// 📅 TASK VIEWS - FIXED
// ==========================================

// View Today's Tasks (Pending only, nextOccurrence is today)
bot.action('view_today_tasks', async (ctx) => {
    const userId = ctx.from.id;
    const today = getTodayIST();
    const tomorrow = getTomorrowIST();
    
    const tasks = await db.collection('tasks')
        .find({ 
            userId: userId,
            status: 'pending',
            nextOccurrence: { 
                $gte: today,
                $lt: tomorrow
            }
        })
        .sort({ nextOccurrence: 1 })
        .toArray();

    let text = `
📋 <b>𝗧𝗢𝗗𝗔𝗬'𝗦 𝗧𝗔𝗦𝗞𝗦</b>

━━━━━━━━━━━━━━━━━━━━
📅 Date: ${formatDate(today)}
📊 Total: ${tasks.length} task${tasks.length !== 1 ? 's' : ''}
━━━━━━━━━━━━━━━━━━━━

Select a task to view details:`;

    if (tasks.length === 0) {
        text = `
📋 <b>𝗧𝗢𝗗𝗔𝗬'𝗦 𝗧𝗔𝗦𝗞𝗦</b>

━━━━━━━━━━━━━━━━━━━━
📅 Date: ${formatDate(today)}
📭 <i>No tasks scheduled for today!</i>
<i>Use "Add Task" to create new tasks.</i>
━━━━━━━━━━━━━━━━━━━━`;
    }

    const buttons = [];
    tasks.forEach(t => {
        buttons.push([
            Markup.button.callback(
                `⏰ ${formatTime(t.nextOccurrence)} ‧ ${t.title}`, 
                `task_det_${t.taskId}`
            )
        ]);
    });

    buttons.push([
        Markup.button.callback('➕ Add Task', 'add_task')
    ]);
    buttons.push([Markup.button.callback('🔙 Back', 'main_menu')]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

// ==========================================
// ➕ ADD TASK WIZARD
// ==========================================

bot.action('add_task', async (ctx) => {
    ctx.session.step = 'task_title';
    ctx.session.task = { 
        taskId: generateId(10), 
        userId: ctx.from.id,
        status: 'pending',
        createdAt: new Date()
    };
    
    const text = `🎯 <b>𝗖𝗥𝗘𝗔𝗧𝗘 𝗡𝗘𝗪 𝗧𝗔𝗦𝗞</b>\n\n━━━━━━━━━━━━━━━━━━━━\nEnter the <b>Title</b> of your task:\n\n📝 <i>Example: "Morning Yoga Session"</i>`;
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'main_menu')]]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action('add_note', async (ctx) => {
    ctx.session.step = 'note_title';
    ctx.session.note = { 
        noteId: generateId(8), 
        userId: ctx.from.id,
        createdAt: new Date()
    };
    
    const text = `📝 <b>𝗖𝗥𝗘𝗔𝗧𝗘 𝗡𝗘𝗪 𝗡𝗢𝗧𝗘</b>\n\n━━━━━━━━━━━━━━━━━━━━\nEnter the <b>Title</b> for your note:\n\n📝 <i>Example: "Meeting Points"</i>`;
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'main_menu')]]);
    
    await safeEdit(ctx, text, keyboard);
});

// ==========================================
// 📨 TEXT INPUT HANDLER (FIXED TIMEZONE)
// ==========================================

bot.on('text', async (ctx) => {
    if (!ctx.session || !ctx.session.step) return;
    const text = ctx.message.text.trim();
    const step = ctx.session.step;

    console.log(`Text handler step: ${step}`);

    // --- TASK FLOW ---
    if (step === 'task_title') {
        if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
        ctx.session.task.title = text;
        ctx.session.step = 'task_desc';
        await ctx.reply(
            `📄 <b>𝗘𝗡𝗧𝗘𝗥 𝗗𝗘𝗦𝗖𝗥𝗜𝗣𝗧𝗜𝗢𝗡</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Describe your task (Max 100 words):\n\n` +
            `📝 <i>Example: "Complete 30 minutes of yoga with 10 minutes of meditation"</i>`,
            { parse_mode: 'HTML' }
        );
    }
    else if (step === 'task_desc') {
        if (text.split(/\s+/).length > 100) return ctx.reply('❌ Too long! Keep it under 100 words.');
        ctx.session.task.description = text;
        ctx.session.step = 'task_date';
        await ctx.reply(
            `📅 <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗗𝗔𝗧𝗘</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Enter the date (DD-MM-YYYY):\n\n` +
            `📆 Today: ${formatDate(new Date())}\n` +
            `📝 <i>Format: DD-MM-YYYY (Example: 15-02-2024)</i>`,
            { parse_mode: 'HTML' }
        );
    }
    else if (step === 'task_date') {
        // Validate date format DD-MM-YYYY
        if (!/^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-\d{4}$/.test(text)) {
            return ctx.reply('❌ Invalid date format. Use DD-MM-YYYY (e.g., 15-02-2024)');
        }
        
        const [day, month, year] = text.split('-').map(Number);
        
        // Validate date
        const date = new Date(year, month - 1, day);
        if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
            return ctx.reply('❌ Invalid date. Please check the day, month, and year.');
        }
        
        // Check if date is in the past (in IST)
        const now = new Date();
        const nowIST = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        date.setHours(0, 0, 0, 0);
        if (date < new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate())) {
            return ctx.reply('❌ Date cannot be in the past. Please select today or a future date.');
        }
        
        ctx.session.task.dateStr = text;
        ctx.session.task.year = year;
        ctx.session.task.month = month;
        ctx.session.task.day = day;
        ctx.session.step = 'task_start';
        
        await ctx.reply(
            `⏰ <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗦𝗧𝗔𝗥𝗧 𝗧𝗜𝗠𝗘</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Enter start time in 24-hour format (HH:MM):\n\n` +
            `🕒 Current Time: ${getCurrentIST()}\n` +
            `📝 <i>Example: 14:30 for 2:30 PM</i>`,
            { parse_mode: 'HTML' }
        );
    }
    else if (step === 'task_start') {
        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
            return ctx.reply('❌ Invalid format. Use HH:MM (24-hour). Example: 14:30');
        }
        
        const [h, m] = text.split(':').map(Number);
        const { year, month, day } = ctx.session.task;
        
        // Create IST date using corrected function
        const startDate = createISTDate(year, month, day, h, m);
        
        // Check if time is in the past for today's date (IST comparison)
        const now = new Date();
        const nowIST = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        const startDateIST = new Date(startDate.getTime() + (5.5 * 60 * 60 * 1000));
        
        if (isSameDay(startDateIST, nowIST)) {
            const currentTimeIST = nowIST.getHours() * 60 + nowIST.getMinutes();
            const startTimeIST = startDateIST.getHours() * 60 + startDateIST.getMinutes();
            
            if (startTimeIST <= currentTimeIST) {
                return ctx.reply('❌ Start time is in the past. Please enter a future time.');
            }
        }
        
        ctx.session.task.startDate = startDate;
        ctx.session.task.startTimeStr = text; 
        ctx.session.task.nextOccurrence = startDate; // Set initial next occurrence
        ctx.session.step = 'task_end';
        
        await ctx.reply(
            `🏁 <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗘𝗡𝗗 𝗧𝗜𝗠𝗘</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Enter end time in 24-hour format (HH:MM):\n\n` +
            `⏰ Start Time: ${text}\n` +
            `📝 <i>End time must be after start time</i>`,
            { parse_mode: 'HTML' }
        );
    }
    else if (step === 'task_end') {
        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
            return ctx.reply('❌ Invalid format. Use HH:MM (24-hour). Example: 15:30');
        }
        
        const [sh, sm] = ctx.session.task.startTimeStr.split(':').map(Number);
        const [eh, em] = text.split(':').map(Number);
        const { year, month, day } = ctx.session.task;
        
        // Create IST dates using corrected function
        const startDate = createISTDate(year, month, day, sh, sm);
        const endDate = createISTDate(year, month, day, eh, em);
        
        if (endDate <= startDate) {
            return ctx.reply('❌ End time must be after Start time.');
        }
        
        ctx.session.task.endDate = endDate;
        ctx.session.step = null;

        const dayName = getDayName(startDate);
        
        await ctx.reply(
            `🔄 <b>𝗥𝗘𝗣𝗘𝗔𝗧 𝗢𝗣𝗧𝗜𝗢𝗡𝗦</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `How should this task repeat?\n\n` +
            `📅 Task Date: ${formatDate(startDate)} (${dayName})\n` +
            `⏰ Time: ${ctx.session.task.startTimeStr} - ${text}\n\n` +
            `Select repeat type:`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('❌ No Repeat', 'repeat_none')],
                    [Markup.button.callback('📅 Daily', 'repeat_daily')],
                    [Markup.button.callback(`📅 Weekly (${dayName})`, 'repeat_weekly')],
                    [Markup.button.callback('🔙 Cancel', 'main_menu')]
                ])
            }
        );
    }
    else if (step === 'edit_task_repeat_count') {
    const taskId = ctx.session.editTaskId;
    
    // Check if task exists
    const taskExists = await db.collection('tasks').findOne({ taskId });
    if (!taskExists) {
        ctx.session.step = null;
        delete ctx.session.editTaskId;
        return ctx.reply('❌ Task not found. It may have been deleted.');
    }
    
    const count = parseInt(text);
    if (isNaN(count) || count < 0 || count > 365) {
        return ctx.reply('❌ Invalid Number. Enter 0-365');
    }
    
    // Rest of the code remains the same...
    const updates = { repeatCount: count };
    if (count === 0) updates.repeat = 'none';

    try {
        await db.collection('tasks').updateOne({ taskId }, { $set: updates });
        
        ctx.session.step = null;
        delete ctx.session.editTaskId;
        await ctx.reply(`✅ <b>COUNT UPDATED!</b>`, { parse_mode: 'HTML' });
        
        // Show updated task details
        const updatedTask = await db.collection('tasks').findOne({ taskId });
        if (updatedTask) {
            await showTaskDetail(ctx, taskId);
        } else {
            await ctx.reply('❌ Task not found after update.');
            await showMainMenu(ctx);
        }
    } catch (error) {
        console.error('Error updating repeat count:', error);
        await ctx.reply('❌ Failed to update. Please try again.');
    }
}

    // --- NOTE FLOW ---
    else if (step === 'note_title') {
        if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
        ctx.session.note.title = text;
        ctx.session.step = 'note_content';
        await ctx.reply(
            `📝 <b>𝗘𝗡𝗧𝗘𝗥 𝗡𝗢𝗧𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Enter your note content (Max 400 words):\n\n` +
            `📝 <i>You can add detailed information here...</i>`,
            { parse_mode: 'HTML' }
        );
    }
    else if (step === 'note_content') {
        if (text.split(/\s+/).length > 400) {
            return ctx.reply('❌ Too long! Keep it under 400 words.');
        }
        
        ctx.session.note.content = text;
        ctx.session.note.createdAt = new Date();
        
        try {
            // Save note data to variables before clearing session
            const noteTitle = ctx.session.note.title;
            const noteContent = ctx.session.note.content;
            
            await db.collection('notes').insertOne(ctx.session.note);
            
            // Clear session
            ctx.session.step = null;
            delete ctx.session.note;
            
            await ctx.reply(
                `✅ <b>𝗡𝗢𝗧𝗘 𝗦𝗔𝗩𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬!</b>\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 <b>${noteTitle}</b>\n\n` +
                `${formatBlockquote(noteContent)}\n\n` +
                `📅 Saved on: ${formatDateTime(new Date())}`,
                { parse_mode: 'HTML' }
            );
            await showMainMenu(ctx);
        } catch (error) {
            console.error('Error saving note:', error);
            await ctx.reply('❌ Failed to save note. Please try again.');
        }
    }

    // --- EDIT TASK FLOW ---
    else if (step && step.startsWith('edit_task_')) {
        const taskId = ctx.session.editTaskId;
        const field = step.replace('edit_task_', '');
        
        // Check if task still exists
        const taskExists = await db.collection('tasks').findOne({ taskId });
        if (!taskExists) {
            ctx.session.step = null;
            delete ctx.session.editTaskId;
            return ctx.reply('❌ Task not found. It may have been deleted.');
        }
        
        const updates = {};
        if (field === 'title') {
            if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
            updates.title = text;
        }
        if (field === 'desc') {
            if (text.split(/\s+/).length > 100) return ctx.reply('❌ Too long! Max 100 words.');
            updates.description = text;
        }
        
        if (field === 'start' || field === 'end') {
            if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
                return ctx.reply('❌ Invalid Format. Use HH:MM (24-hour)');
            }
             
            const task = await db.collection('tasks').findOne({ taskId });
            const dateObj = new Date(field === 'start' ? task.startDate : task.endDate);
            
            // Convert to IST to get current date components
            const dateObjIST = new Date(dateObj.getTime() + (5.5 * 60 * 60 * 1000));
            const year = dateObjIST.getUTCFullYear();
            const month = dateObjIST.getUTCMonth() + 1;
            const day = dateObjIST.getUTCDate();
            const [h, m] = text.split(':').map(Number);
            
            // Create new IST date
            const newDate = createISTDate(year, month, day, h, m);
             
            updates[field === 'start' ? 'startDate' : 'endDate'] = newDate;
            
            // If updating start time, also update nextOccurrence
            if (field === 'start') {
                updates.nextOccurrence = newDate;
            }
        }

        if (field === 'repeat_count') {
            const count = parseInt(text);
            if (isNaN(count) || count < 0 || count > 365) {
                return ctx.reply('❌ Invalid Number. Enter 0-365');
            }
            updates.repeatCount = count;
            if (count === 0) updates.repeat = 'none';
        }

        try {
            await db.collection('tasks').updateOne({ taskId }, { $set: updates });
            
            // Reschedule if start time changed
            if (field === 'start') {
                const updatedTask = await db.collection('tasks').findOne({ taskId });
                scheduleTask(updatedTask);
            }

            ctx.session.step = null;
            delete ctx.session.editTaskId;
            await ctx.reply(`✅ <b>${field.toUpperCase()} UPDATED!</b>`, { parse_mode: 'HTML' });
            
            // Show updated task details
            const updatedTask = await db.collection('tasks').findOne({ taskId });
            if (updatedTask) {
                await showTaskDetail(ctx, taskId);
            } else {
                await ctx.reply('❌ Task not found after update.');
                await showMainMenu(ctx);
            }
        } catch (error) {
            console.error('Error updating task:', error);
            await ctx.reply('❌ Failed to update. Please try again.');
        }
    }
    
    // --- EDIT NOTE FLOW ---
    else if (step === 'edit_note_title') {
        if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
        
        try {
            const noteId = ctx.session.editNoteId;
            const noteExists = await db.collection('notes').findOne({ noteId });
            if (!noteExists) {
                ctx.session.step = null;
                delete ctx.session.editNoteId;
                return ctx.reply('❌ Note not found. It may have been deleted.');
            }
            
            await db.collection('notes').updateOne(
                { noteId: noteId }, 
                { $set: { title: text, updatedAt: new Date() } }
            );
            
            ctx.session.step = null;
            delete ctx.session.editNoteId;
            
            const updatedNote = await db.collection('notes').findOne({ noteId: noteId });
            await ctx.reply(
                `✅ <b>𝗡𝗢𝗧𝗘 𝗧𝗜𝗧𝗟𝗘 𝗨𝗣𝗗𝗔𝗧𝗘𝗗!</b>\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 <b>${updatedNote.title}</b>\n\n` +
                `${formatBlockquote(updatedNote.content)}\n\n` +
                `📅 Updated: ${formatDateTime(new Date())}`,
                { parse_mode: 'HTML' }
            );
            await showMainMenu(ctx);
        } catch (error) {
            console.error('Error updating note title:', error);
            await ctx.reply('❌ Failed to update title.');
        }
    }
    else if (step === 'edit_note_content') {
        if (text.split(/\s+/).length > 400) {
            return ctx.reply('❌ Too long! Max 400 words.');
        }
        
        try {
            const noteId = ctx.session.editNoteId;
            const noteExists = await db.collection('notes').findOne({ noteId });
            if (!noteExists) {
                ctx.session.step = null;
                delete ctx.session.editNoteId;
                return ctx.reply('❌ Note not found. It may have been deleted.');
            }
            
            await db.collection('notes').updateOne(
                { noteId: noteId }, 
                { $set: { content: text, updatedAt: new Date() } }
            );
            
            ctx.session.step = null;
            delete ctx.session.editNoteId;
            
            const updatedNote = await db.collection('notes').findOne({ noteId: noteId });
            await ctx.reply(
                `✅ <b>𝗡𝗢𝗧𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧 𝗨𝗣𝗗𝗔𝗧𝗘𝗗!</b>\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 <b>${updatedNote.title}</b>\n\n` +
                `${formatBlockquote(updatedNote.content)}\n\n` +
                `📅 Updated: ${formatDateTime(new Date())}`,
                { parse_mode: 'HTML' }
            );
            await showMainMenu(ctx);
        } catch (error) {
            console.error('Error updating note content:', error);
            await ctx.reply('❌ Failed to update content.');
        }
    }
});

// ==========================================
// 🕹️ BUTTON ACTIONS
// ==========================================

bot.action('repeat_none', async (ctx) => {
    ctx.session.task.repeat = 'none';
    ctx.session.task.repeatCount = 0;
    await saveTask(ctx);
});

bot.action('repeat_daily', async (ctx) => {
    ctx.session.task.repeat = 'daily';
    ctx.session.step = 'task_repeat_count';
    await ctx.reply(
        `🔢 <b>𝗗𝗔𝗜𝗟𝗬 𝗥𝗘𝗣𝗘𝗔𝗧</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `How many times should this task repeat?\n\n` +
        `📝 <i>Enter a number (e.g., 10 for 10 days):</i>`,
        { parse_mode: 'HTML' }
    );
});

bot.action('repeat_weekly', async (ctx) => {
    ctx.session.task.repeat = 'weekly';
    ctx.session.step = 'task_repeat_count';
    await ctx.reply(
        `🔢 <b>𝗪𝗘𝗘𝗞𝗟𝗬 𝗥𝗘𝗣𝗘𝗔𝗧</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `How many times should this task repeat?\n\n` +
        `📝 <i>Enter a number (e.g., 5 for 5 weeks):</i>`,
        { parse_mode: 'HTML' }
    );
});

async function saveTask(ctx) {
    const task = ctx.session.task;
    
    // Ensure required fields
    task.status = 'pending';
    task.createdAt = new Date();
    if (!task.nextOccurrence) {
        task.nextOccurrence = task.startDate;
    }
    
    try {
        await db.collection('tasks').insertOne(task);
        scheduleTask(task);
        
        ctx.session.step = null;
        delete ctx.session.task;
        const msg = `
✅ <b>𝗧𝗔𝗦𝗞 𝗖𝗥𝗘𝗔𝗧𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬!</b>

━━━━━━━━━━━━━━━━━━━━
📌 <b>${task.title}</b>

${formatBlockquote(task.description)}

📅 <b>Date:</b> ${formatDate(task.startDate)}
⏰ <b>Time:</b> ${task.startTimeStr} - ${formatTime(task.endDate)}
🔄 <b>Repeat:</b> ${task.repeat} (${task.repeatCount || 0} times)
📊 <b>Status:</b> ⏳ Pending

🔔 <i>Notifications will start 10 minutes before the task.</i>
━━━━━━━━━━━━━━━━━━━━`;
                
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📋 Today\'s Tasks', 'view_today_tasks')],
            [Markup.button.callback('🔙 Back', 'main_menu')]
        ]);
        
        await safeEdit(ctx, msg, keyboard);
    } catch (error) {
        console.error('Error saving task:', error);
        await ctx.reply('❌ Failed to save task. Please try again.');
    }
}

// --- TASK DETAILS ---
bot.action(/^task_det_(.+)$/, async (ctx) => {
    await showTaskDetail(ctx, ctx.match[1]);
});

async function showTaskDetail(ctx, taskId) {
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) {
        const text = '❌ <b>𝗧𝗔𝗦𝗞 𝗡𝗢𝗧 𝗙𝗢𝗨𝗡𝗗</b>\n\nThis task may have been completed or deleted.';
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📋 Today\'s Tasks', 'view_today_tasks')],
            [Markup.button.callback('🔙 Back', 'main_menu')]
        ]);
        return safeEdit(ctx, text, keyboard);
    }

    const text = `
📌 <b>𝗧𝗔𝗦𝗞 𝗗𝗘𝗧𝗔𝗜𝗟𝗦</b>

━━━━━━━━━━━━━━━━━━━━
🆔 <b>Task ID:</b> <code>${task.taskId}</code>
📛 <b>Title:</b> ${task.title}

${formatBlockquote(task.description)}

📅 <b>Next Occurrence:</b> ${formatDateTime(task.nextOccurrence)}
⏰ <b>Time:</b> ${formatTime(task.startDate)} - ${formatTime(task.endDate)}
🔄 <b>Repeat:</b> ${task.repeat === 'none' ? 'No Repeat' : task.repeat} 
🔢 <b>Remaining Repeats:</b> ${task.repeatCount || 0}
📊 <b>Status:</b> ${task.status === 'pending' ? '⏳ Pending' : '✅ Completed'}

📝 <b>Created:</b> ${formatDateTime(task.createdAt)}
━━━━━━━━━━━━━━━━━━━━`;

    const buttons = [
        [Markup.button.callback('✅ Mark Complete', `complete_${taskId}`)],
        [
            Markup.button.callback('✏️ Edit', `edit_menu_${taskId}`), 
            Markup.button.callback('🗑️ Delete', `delete_task_${taskId}`)
        ],
        [
            Markup.button.callback('📋 Today\'s Tasks', 'view_today_tasks')
        ],
        [Markup.button.callback('🔙 Back', 'view_today_tasks')]
    ];
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

// --- COMPLETE TASK (with next occurrence logic) ---
bot.action(/^complete_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) return ctx.answerCbQuery('Task not found');

    // 1. Create History Copy
    const historyItem = {
        ...task,
        _id: undefined,
        completedAt: new Date(),
        originalTaskId: task.taskId,
        status: 'completed',
        completedFromDate: task.nextOccurrence
    };
    
    try {
        await db.collection('history').insertOne(historyItem);
        
        // Stop Notification for current occurrence
        cancelTaskSchedule(taskId);

        // 2. Handle Repetition
        if (task.repeat !== 'none' && task.repeatCount > 0) {
            const nextOccurrence = new Date(task.nextOccurrence);
            
            // Calculate next occurrence based on repeat type
            const daysToAdd = task.repeat === 'weekly' ? 7 : 1;
            nextOccurrence.setDate(nextOccurrence.getDate() + daysToAdd);
            
            // Update the task with next occurrence
            await db.collection('tasks').updateOne({ taskId }, {
                $set: {
                    nextOccurrence: nextOccurrence,
                    repeatCount: task.repeatCount - 1,
                    startDate: nextOccurrence,
                    endDate: new Date(nextOccurrence.getTime() + 
                        (task.endDate.getTime() - task.startDate.getTime()))
                }
            });
            
            // Reschedule for next occurrence
            const updatedTask = await db.collection('tasks').findOne({ taskId });
            
            // Only schedule if next occurrence is in the future
            if (updatedTask.nextOccurrence > new Date()) {
                scheduleTask(updatedTask);
                await ctx.answerCbQuery('✅ Completed! Next occurrence scheduled.');
            } else {
                await ctx.answerCbQuery('✅ Completed! No future occurrences.');
            }
        } else {
            // Not repeating or count finished -> Delete from active tasks
            await db.collection('tasks').deleteOne({ taskId });
            await ctx.answerCbQuery('✅ Task Completed & Moved to History!');
        }
        
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error completing task:', error);
        await ctx.answerCbQuery('❌ Error completing task');
    }
});

// --- EDIT MENU ---
bot.action(/^edit_menu_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const text = `✏️ <b>𝗘𝗗𝗜𝗧 𝗧𝗔𝗦𝗞</b>\n\n━━━━━━━━━━━━━━━━━━━━\nSelect what you want to edit:`;
    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('🏷 Title', `edit_task_${taskId}_title`), 
            Markup.button.callback('📝 Description', `edit_task_${taskId}_desc`)
        ],
        [
            Markup.button.callback('⏰ Start Time', `edit_task_${taskId}_start`), 
            Markup.button.callback('🏁 End Time', `edit_task_${taskId}_end`)
        ],
        [
            Markup.button.callback('🔄 Repeat', `edit_rep_${taskId}`), 
            Markup.button.callback('🔢 Count', `edit_task_${taskId}_repeat_count`)
        ],
        [Markup.button.callback('🔙 Back', `task_det_${taskId}`)]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action(/^edit_task_(.+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const field = ctx.match[2];
    
    // Check if task exists before allowing edit
    const taskExists = await db.collection('tasks').findOne({ taskId });
    if (!taskExists) {
        await ctx.answerCbQuery('❌ Task not found');
        return showMainMenu(ctx);
    }
    
    ctx.session.editTaskId = taskId;
    ctx.session.step = `edit_task_${field}`;
    
    let msg = '';
    if (field === 'title') msg = 'Enter new Title:';
    if (field === 'desc') msg = 'Enter new Description (Max 100 words):';
    if (field === 'start') msg = 'Enter new Start Time (HH:MM, 24-hour):';
    if (field === 'end') msg = 'Enter new End Time (HH:MM, 24-hour):';
    if (field === 'repeat_count') msg = 'Enter new Repeat Count (0-365):';

    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 ${field.toUpperCase()}</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${msg}`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${taskId}`)]])
    );
});

bot.action(/^edit_rep_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const text = `🔄 <b>𝗖𝗛𝗔𝗡𝗚𝗘 𝗥𝗘𝗣𝗘𝗔𝗧 𝗠𝗢𝗗𝗘</b>\n\n━━━━━━━━━━━━━━━━━━━━\nSelect new repeat mode:`;
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('❌ No Repeat', `set_rep_${taskId}_none`)],
        [Markup.button.callback('📅 Daily', `set_rep_${taskId}_daily`)],
        [Markup.button.callback('📅 Weekly', `set_rep_${taskId}_weekly`)],
        [Markup.button.callback('🔙 Back', `edit_menu_${taskId}`)]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action(/^set_rep_(.+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const mode = ctx.match[2];
    
    try {
        const updates = { repeat: mode };
        if (mode === 'none') {
            updates.repeatCount = 0;
        } else {
            updates.repeatCount = 10; // Default 10 repeats
        }
        
        await db.collection('tasks').updateOne({ taskId }, { $set: updates });
        await ctx.answerCbQuery(`✅ Updated to ${mode}`);
        await showTaskDetail(ctx, taskId);
    } catch (error) {
        console.error('Error updating repeat mode:', error);
        await ctx.answerCbQuery('❌ Error updating');
    }
});

// --- DELETE TASK ---
bot.action(/^delete_task_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    try {
        await db.collection('tasks').deleteOne({ taskId });
        cancelTaskSchedule(taskId);
        await ctx.answerCbQuery('✅ Task Deleted');
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error deleting task:', error);
        await ctx.answerCbQuery('❌ Error deleting task');
    }
});

// ==========================================
// 📜 VIEW HISTORY
// ==========================================

bot.action(/^view_history_dates_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    
    const dates = await db.collection('history').aggregate([
        { $match: { userId } },
        { $group: { 
            _id: { 
                year: { $year: "$completedAt" },
                month: { $month: "$completedAt" },
                day: { $dayOfMonth: "$completedAt" }
            },
            count: { $sum: 1 }
        }},
        { $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 } },
        { $skip: (page - 1) * 5 },
        { $limit: 5 }
    ]).toArray();

    const text = `📜 <b>𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗧𝗔𝗦𝗞𝗦 𝗛𝗜𝗦𝗧𝗢𝗥𝗬</b>\n\n━━━━━━━━━━━━━━━━━━━━\nSelect a date to view:`;
    
    const buttons = dates.map(d => {
        const dateStr = `${d._id.year}-${String(d._id.month).padStart(2, '0')}-${String(d._id.day).padStart(2, '0')}`;
        const date = new Date(d._id.year, d._id.month - 1, d._id.day);
        return [Markup.button.callback(`📅 ${formatDate(date)} (${d.count})`, `hist_list_${dateStr}_1`)];
    });
    
    buttons.push([Markup.button.callback('🔙 Back', 'main_menu')]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^hist_list_([\d-]+)_(\d+)$/, async (ctx) => {
    const dateStr = ctx.match[1];
    const page = parseInt(ctx.match[2]);
    const userId = ctx.from.id;

    const [year, month, day] = dateStr.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    const tasks = await db.collection('history').find({
        userId: userId,
        completedAt: {
            $gte: startDate,
            $lt: endDate
        }
    }).sort({ completedAt: -1 }).skip((page - 1) * 5).limit(5).toArray();

    const date = new Date(year, month - 1, day);
    const text = `📅 <b>𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗢𝗡 ${formatDate(date).toUpperCase()}</b>\n\n━━━━━━━━━━━━━━━━━━━━\nSelect a task to view details:`;
    
    const buttons = tasks.map(t => [
        Markup.button.callback(`✅ ${t.title} (${formatTime(t.completedAt)})`, `hist_det_${t._id}`)
    ]);
    
    buttons.push([Markup.button.callback('🔙 Back to Dates', 'view_history_dates_1')]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^hist_det_(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const task = await db.collection('history').findOne({ _id: new ObjectId(id) });

    if (!task) return ctx.answerCbQuery('Task not found');

    const text = `
📜 <b>𝗛𝗜𝗦𝗧𝗢𝗥𝗬 𝗗𝗘𝗧𝗔𝗜𝗟</b>

━━━━━━━━━━━━━━━━━━━━
📌 <b>${task.title}</b>

${formatBlockquote(task.description)}

✅ <b>Completed At:</b> ${formatDateTime(task.completedAt)}
⏰ <b>Original Time:</b> ${formatTime(task.startDate)} - ${formatTime(task.endDate)}
🔄 <b>Repeat Type:</b> ${task.repeat === 'none' ? 'No Repeat' : task.repeat}
━━━━━━━━━━━━━━━━━━━━`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Back to History', 'view_history_dates_1')]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

// ==========================================
// 🗒️ VIEW NOTES (COMPLETELY REWRITTEN EDITING)
// ==========================================

bot.action(/^view_notes_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    
    const notes = await db.collection('notes').find({ userId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * 5)
        .limit(5)
        .toArray();

    const text = `🗒️ <b>𝗬𝗢𝗨𝗥 𝗡𝗢𝗧𝗘𝗦</b>\n\n━━━━━━━━━━━━━━━━━━━━\nSelect a note to view:`;
    
    const buttons = notes.map(n => [
        Markup.button.callback(`📄 ${n.title}`, `note_det_${n.noteId}`)
    ]);
    
    buttons.push([Markup.button.callback('🔙 Back', 'main_menu')]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^note_det_(.+)$/, async (ctx) => {
    const note = await db.collection('notes').findOne({ noteId: ctx.match[1] });
    if (!note) return ctx.answerCbQuery('Note not found');

    const text = `
📝 <b>𝗡𝗢𝗧𝗘 𝗗𝗘𝗧𝗔𝗜𝗟𝗦</b>

━━━━━━━━━━━━━━━━━━━━
📌 <b>${note.title}</b>

${formatBlockquote(note.content)}

📅 <b>Created:</b> ${formatDateTime(note.createdAt)}
${note.updatedAt ? `✏️ <b>Updated:</b> ${formatDateTime(note.updatedAt)}` : ''}
━━━━━━━━━━━━━━━━━━━━`;
    
    const buttons = [
        [
            Markup.button.callback('✏️ Edit Title', `edit_note_title_${note.noteId}`), 
            Markup.button.callback('✏️ Edit Content', `edit_note_content_${note.noteId}`)
        ],
        [Markup.button.callback('🗑️ Delete', `delete_note_${note.noteId}`)],
        [Markup.button.callback('🔙 Back to Notes', 'view_notes_1')]
    ];

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^delete_note_(.+)$/, async (ctx) => {
    try {
        await db.collection('notes').deleteOne({ noteId: ctx.match[1] });
        await ctx.answerCbQuery('✅ Note Deleted');
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error deleting note:', error);
        await ctx.answerCbQuery('❌ Error deleting note');
    }
});

// NEW SIMPLIFIED NOTE EDITING SYSTEM
bot.action(/^edit_note_title_(.+)$/, async (ctx) => {
    const noteId = ctx.match[1];
    ctx.session.editNoteId = noteId;
    ctx.session.step = 'edit_note_title';
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗡𝗢𝗧𝗘 𝗧𝗜𝗧𝗟𝗘</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new title for your note:`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `note_det_${noteId}`)]])
    );
});

bot.action(/^edit_note_content_(.+)$/, async (ctx) => {
    const noteId = ctx.match[1];
    ctx.session.editNoteId = noteId;
    ctx.session.step = 'edit_note_content';
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗡𝗢𝗧𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new content for your note (Max 400 words):`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `note_det_${noteId}`)]])
    );
});

// ==========================================
// 📥 DOWNLOAD DATA MENU
// ==========================================

bot.action('download_menu', async (ctx) => {
    const text = `📥 <b>𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗 𝗬𝗢𝗨𝗥 𝗗𝗔𝗧𝗔</b>\n\n━━━━━━━━━━━━━━━━━━━━\nSelect what you want to download:\n\n📁 <i>Files will be sent as JSON documents</i>`;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📋 Active Tasks', 'download_tasks')],
        [Markup.button.callback('📜 History', 'download_history')],
        [Markup.button.callback('🗒️ Notes', 'download_notes')],
        [Markup.button.callback('📦 All Data (3 files)', 'download_all')],
        [Markup.button.callback('🔙 Back', 'main_menu')]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action('download_tasks', async (ctx) => {
    const userId = ctx.from.id;
    const tasks = await db.collection('tasks').find({ userId }).toArray();
    
    // Always send file, even if empty
    const tasksData = tasks.length > 0 ? tasks : [];
    const tasksBuff = Buffer.from(JSON.stringify(tasksData, null, 2));
    
    await ctx.replyWithDocument({ source: tasksBuff, filename: 'active_tasks.json' });
    await ctx.answerCbQuery(`✅ Sent ${tasks.length} tasks`);
});

bot.action('download_history', async (ctx) => {
    const userId = ctx.from.id;
    const history = await db.collection('history').find({ userId }).toArray();
    
    // Always send file, even if empty
    const historyData = history.length > 0 ? history : [];
    const histBuff = Buffer.from(JSON.stringify(historyData, null, 2));
    
    await ctx.replyWithDocument({ source: histBuff, filename: 'history.json' });
    await ctx.answerCbQuery(`✅ Sent ${history.length} history items`);
});

bot.action('download_notes', async (ctx) => {
    const userId = ctx.from.id;
    const notes = await db.collection('notes').find({ userId }).toArray();
    
    // Always send file, even if empty
    const notesData = notes.length > 0 ? notes : [];
    const notesBuff = Buffer.from(JSON.stringify(notesData, null, 2));
    
    await ctx.replyWithDocument({ source: notesBuff, filename: 'notes.json' });
    await ctx.answerCbQuery(`✅ Sent ${notes.length} notes`);
});

bot.action('download_all', async (ctx) => {
    const userId = ctx.from.id;
    
    // Fetch all data
    const tasks = await db.collection('tasks').find({ userId }).toArray();
    const history = await db.collection('history').find({ userId }).toArray();
    const notes = await db.collection('notes').find({ userId }).toArray();
    
    // Send tasks file (always send, even if empty)
    const tasksData = tasks.length > 0 ? tasks : [];
    const tasksBuff = Buffer.from(JSON.stringify(tasksData, null, 2));
    await ctx.replyWithDocument({ source: tasksBuff, filename: 'active_tasks.json' });
    
    // Send history file (always send, even if empty)
    const historyData = history.length > 0 ? history : [];
    const histBuff = Buffer.from(JSON.stringify(historyData, null, 2));
    await ctx.replyWithDocument({ source: histBuff, filename: 'history.json' });
    
    // Send notes file (always send, even if empty)
    const notesData = notes.length > 0 ? notes : [];
    const notesBuff = Buffer.from(JSON.stringify(notesData, null, 2));
    await ctx.replyWithDocument({ source: notesBuff, filename: 'notes.json' });
    
    const totalItems = tasks.length + history.length + notes.length;
    await ctx.answerCbQuery(`✅ Sent ${totalItems} items across 3 files`);
});

// ==========================================
// 🗑️ DELETE DATA MENU (FIXED)
// ==========================================

bot.action('delete_menu', async (ctx) => {
    const text = `🗑️ <b>𝗗𝗘𝗟𝗘𝗧𝗘 𝗗𝗔𝗧𝗔</b>\n\n━━━━━━━━━━━━━━━━━━━━\n⚠️ <b>WARNING: This action cannot be undone!</b>\n\nSelect what you want to delete:`;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📋 Delete All Tasks', 'delete_tasks_confirm')],
        [Markup.button.callback('📜 Delete All History', 'delete_history_confirm')],
        [Markup.button.callback('🗒️ Delete All Notes', 'delete_notes_confirm')],
        [Markup.button.callback('🔥 Delete EVERYTHING', 'delete_all_confirm')],
        [Markup.button.callback('🔙 Back', 'main_menu')]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

// DELETE TASKS CONFIRMATION
bot.action('delete_tasks_confirm', async (ctx) => {
    const text = `⚠️ <b>𝗖𝗢𝗡𝗙𝗜𝗥𝗠 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡</b>\n\n━━━━━━━━━━━━━━━━━━━━\nAre you sure you want to delete ALL tasks?\n\n📋 This will delete all your active tasks\n🔔 All notifications will be cancelled\n❌ This action cannot be undone!\n\n━━━━━━━━━━━━━━━━━━━━`;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ YES, DELETE ALL TASKS', 'delete_tasks_final')],
        [Markup.button.callback('🔙 Cancel', 'delete_menu')]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

// DELETE TASKS FINAL
bot.action('delete_tasks_final', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
        // Get all tasks to cancel schedules
        const tasks = await db.collection('tasks').find({ userId }).toArray();
        tasks.forEach(t => cancelTaskSchedule(t.taskId));
        
        // Delete from database
        const result = await db.collection('tasks').deleteMany({ userId });
        
        // Send backup file
        const backupData = tasks.length > 0 ? tasks : [];
        const backupBuff = Buffer.from(JSON.stringify(backupData, null, 2));
        await ctx.replyWithDocument({ 
            source: backupBuff, 
            filename: `tasks_backup_${new Date().getTime()}.json` 
        });
        
        await ctx.answerCbQuery(`✅ Deleted ${result.deletedCount} tasks`);
        
        // Show success message
        const successText = `✅ <b>𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${result.deletedCount} tasks\n📁 Backup file has been sent\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
    } catch (error) {
        console.error('Error deleting tasks:', error);
        await ctx.answerCbQuery('❌ Error deleting tasks');
        await showMainMenu(ctx);
    }
});

// DELETE HISTORY CONFIRMATION
bot.action('delete_history_confirm', async (ctx) => {
    const text = `⚠️ <b>𝗖𝗢𝗡𝗙𝗜𝗥𝗠 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡</b>\n\n━━━━━━━━━━━━━━━━━━━━\nAre you sure you want to delete ALL history?\n\n📜 This will delete all your completed task history\n📊 All statistics will be lost\n❌ This action cannot be undone!\n\n━━━━━━━━━━━━━━━━━━━━`;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ YES, DELETE ALL HISTORY', 'delete_history_final')],
        [Markup.button.callback('🔙 Cancel', 'delete_menu')]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

// DELETE HISTORY FINAL
bot.action('delete_history_final', async (ctx) => {
    const userId = ctx.from.id;
    try {
        // Get data before deletion for backup
        const history = await db.collection('history').find({ userId }).toArray();
        
        // Delete from database
        const result = await db.collection('history').deleteMany({ userId });
        
        // Send backup file
        const backupData = history.length > 0 ? history : [];
        const backupBuff = Buffer.from(JSON.stringify(backupData, null, 2));
        await ctx.replyWithDocument({ 
            source: backupBuff, 
            filename: `history_backup_${new Date().getTime()}.json` 
        });
        
        await ctx.answerCbQuery(`✅ Deleted ${result.deletedCount} history items`);
        
        // Show success message
        const successText = `✅ <b>𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${result.deletedCount} history items\n📁 Backup file has been sent\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
    } catch (error) {
        console.error('Error deleting history:', error);
        await ctx.answerCbQuery('❌ Error deleting history');
        await showMainMenu(ctx);
    }
});

// DELETE NOTES CONFIRMATION
bot.action('delete_notes_confirm', async (ctx) => {
    const text = `⚠️ <b>𝗖𝗢𝗡𝗙𝗜𝗥𝗠 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡</b>\n\n━━━━━━━━━━━━━━━━━━━━\nAre you sure you want to delete ALL notes?\n\n🗒️ This will delete all your saved notes\n📝 All your personal notes will be lost\n❌ This action cannot be undone!\n\n━━━━━━━━━━━━━━━━━━━━`;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ YES, DELETE ALL NOTES', 'delete_notes_final')],
        [Markup.button.callback('🔙 Cancel', 'delete_menu')]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

// DELETE NOTES FINAL
bot.action('delete_notes_final', async (ctx) => {
    const userId = ctx.from.id;
    try {
        // Get data before deletion for backup
        const notes = await db.collection('notes').find({ userId }).toArray();
        
        // Delete from database
        const result = await db.collection('notes').deleteMany({ userId });
        
        // Send backup file
        const backupData = notes.length > 0 ? notes : [];
        const backupBuff = Buffer.from(JSON.stringify(backupData, null, 2));
        await ctx.replyWithDocument({ 
            source: backupBuff, 
            filename: `notes_backup_${new Date().getTime()}.json` 
        });
        
        await ctx.answerCbQuery(`✅ Deleted ${result.deletedCount} notes`);
        
        // Show success message
        const successText = `✅ <b>𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${result.deletedCount} notes\n📁 Backup file has been sent\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
    } catch (error) {
        console.error('Error deleting notes:', error);
        await ctx.answerCbQuery('❌ Error deleting notes');
        await showMainMenu(ctx);
    }
});

// DELETE ALL CONFIRMATION
bot.action('delete_all_confirm', async (ctx) => {
    const text = `⚠️ <b>𝗙𝗜𝗡𝗔𝗟 𝗪𝗔𝗥𝗡𝗜𝗡𝗚</b>\n\n━━━━━━━━━━━━━━━━━━━━\nAre you sure you want to delete ALL data?\n\n📋 All active tasks\n📜 All completed history\n🗒️ All saved notes\n\n🔔 All notifications will be cancelled\n📊 All statistics will be lost\n❌ This action cannot be undone!\n\n━━━━━━━━━━━━━━━━━━━━`;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔥 YES, DELETE EVERYTHING', 'delete_all_final')],
        [Markup.button.callback('🔙 Cancel', 'delete_menu')]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

// DELETE ALL FINAL
bot.action('delete_all_final', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
        // 1. Get all data for backup FIRST
        const tasks = await db.collection('tasks').find({ userId }).toArray();
        const history = await db.collection('history').find({ userId }).toArray();
        const notes = await db.collection('notes').find({ userId }).toArray();
        
        // 2. Stop all schedulers
        tasks.forEach(t => cancelTaskSchedule(t.taskId));
        
        // 3. Delete everything
        const tasksResult = await db.collection('tasks').deleteMany({ userId });
        const historyResult = await db.collection('history').deleteMany({ userId });
        const notesResult = await db.collection('notes').deleteMany({ userId });
        
        const totalDeleted = tasksResult.deletedCount + historyResult.deletedCount + notesResult.deletedCount;
        
        // 4. Send backup files
        const timestamp = new Date().getTime();
        
        // Tasks backup
        const tasksData = tasks.length > 0 ? tasks : [];
        const tasksBuff = Buffer.from(JSON.stringify(tasksData, null, 2));
        await ctx.replyWithDocument({ 
            source: tasksBuff, 
            filename: `all_backup_tasks_${timestamp}.json` 
        });
        
        // History backup
        const historyData = history.length > 0 ? history : [];
        const histBuff = Buffer.from(JSON.stringify(historyData, null, 2));
        await ctx.replyWithDocument({ 
            source: histBuff, 
            filename: `all_backup_history_${timestamp}.json` 
        });
        
        // Notes backup
        const notesData = notes.length > 0 ? notes : [];
        const notesBuff = Buffer.from(JSON.stringify(notesData, null, 2));
        await ctx.replyWithDocument({ 
            source: notesBuff, 
            filename: `all_backup_notes_${timestamp}.json` 
        });
        
        await ctx.answerCbQuery(`✅ Deleted ${totalDeleted} items total`);
        
        // Show success message
        const successText = `✅ <b>𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡</b>\n\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${totalDeleted} items total\n📁 3 backup files have been sent\n🔔 All notifications cancelled\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
    } catch (error) {
        console.error('Error deleting all data:', error);
        await ctx.answerCbQuery('❌ Error deleting data');
        await showMainMenu(ctx);
    }
});

// ==========================================
// 🚀 BOOTSTRAP
// ==========================================

async function start() {
    try {
        if (await connectDB()) {
            await rescheduleAllPending();
            
            // Start hourly summary scheduler
            scheduleHourlySummary();
            
            await bot.launch();
            console.log('🤖 Bot Started Successfully!');
            console.log(`⏰ Current IST Time: ${getCurrentIST()}`);
            console.log(`📊 Currently tracking ${activeSchedules.size} tasks`);
            
            // Send initial hourly summary to all users
            setTimeout(async () => {
                try {
                    const users = await db.collection('tasks').distinct('userId');
                    for (const userId of users) {
                        await sendHourlySummary(userId);
                    }
                } catch (error) {
                    console.error('Error sending initial summary:', error);
                }
            }, 5000);
            
            // Set up keep-alive for Railway
            const PORT = process.env.PORT || 3000;
            if (process.env.RAILWAY_ENVIRONMENT || process.env.PORT) {
                const http = require('http');
                const server = http.createServer((req, res) => {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('✅ Task Manager Bot is running with scheduler...');
                });
                
                server.listen(PORT, () => {
                    console.log(`🚂 Server listening on port ${PORT}`);
                });
            }
        } else {
            console.error('❌ Failed to connect to database. Retrying in 5 seconds...');
            setTimeout(start, 5000);
        }
    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        setTimeout(start, 10000);
    }
}

// Graceful Stop
process.once('SIGINT', () => {
    console.log('🛑 SIGINT received, stopping bot gracefully...');
    
    // Cancel all scheduled jobs
    for (const [taskId, schedule] of activeSchedules) {
        if (schedule.startJob) schedule.startJob.cancel();
        if (schedule.interval) clearInterval(schedule.interval);
    }
    
    // Cancel hourly summary job
    if (hourlySummaryJob) {
        hourlySummaryJob.cancel();
    }
    
    bot.stop('SIGINT');
    if (client) client.close();
    console.log('👋 Bot stopped gracefully');
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('🛑 SIGTERM received, stopping bot gracefully...');
    
    // Cancel all scheduled jobs
    for (const [taskId, schedule] of activeSchedules) {
        if (schedule.startJob) schedule.startJob.cancel();
        if (schedule.interval) clearInterval(schedule.interval);
    }
    
    // Cancel hourly summary job
    if (hourlySummaryJob) {
        hourlySummaryJob.cancel();
    }
    
    bot.stop('SIGTERM');
    if (client) client.close();
    console.log('👋 Bot stopped gracefully');
    process.exit(0);
});

// Start the bot
start();
