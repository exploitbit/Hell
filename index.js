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

// Initialize Session
bot.use(session());

// ==========================================
// 🛠️ UTILITY FUNCTIONS
// ==========================================

function generateId(length = 10) {
    return Math.random().toString(36).substring(2, 2 + length).toUpperCase();
}

// Get Current IST Time String
function getCurrentIST() {
    return new Date().toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
}

// Get current IST Date (YYYY-MM-DD)
function getCurrentISTDate() {
    return new Date().toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).split('/').reverse().join('-'); // Format: YYYY-MM-DD
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        weekday: 'long'
    });
}

function formatTime(date) {
    return new Date(date).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function formatDateTime(date) {
    return `${formatDate(date)} at ${formatTime(date)}`;
}

function getDayName(date) {
    return new Date(date).toLocaleDateString('en-IN', {
        weekday: 'long',
        timeZone: 'Asia/Kolkata'
    });
}

// Create IST date from components (NO timezone conversion)
function createISTDate(year, month, day, hour = 0, minute = 0) {
    // Create date in local timezone, but treat it as IST
    // Since we're showing times in IST, we store them as-is
    return new Date(year, month - 1, day, hour, minute, 0);
}

// Check if two dates are the same day (in IST)
function isSameDay(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

async function safeEdit(ctx, text, extra) {
    try {
        await ctx.editMessageText(text, { parse_mode: 'HTML', ...extra });
    } catch (err) {
        if (err.description && err.description.includes("message is not modified")) return;
        try {
            await ctx.reply(text, { parse_mode: 'HTML', ...extra });
        } catch (e) { console.error('SafeEdit Error:', e); }
    }
}

// Format text in blockquote
function formatBlockquote(text) {
    if (!text) return '';
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
// ⏰ FIXED SCHEDULER LOGIC
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
                        `⏰ Start Time: ${formatTime(task.startDate)}\n` +
                        `📅 Date: ${formatDate(task.startDate)}\n` +
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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tasks = await db.collection('tasks').find({ 
            userId: { $exists: true },
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
// 📱 MAIN MENU
// ==========================================

bot.command('start', async (ctx) => {
    ctx.session = {}; 
    await showMainMenu(ctx);
});

async function showMainMenu(ctx) {
    const text = `
┌──────────────────────────┐
│     📋 TASK MANAGER      │
│         🤖 BOT           │
├──────────────────────────┤
│ ⏰ Current Time: ${getCurrentIST()}  │
│ 📅 Today: ${formatDate(new Date())} │
└──────────────────────────┘

🌟 <b>Select an option:</b>`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('➕ Add Task', 'add_task'), 
            Markup.button.callback('📝 Add Note', 'add_note')
        ],
        [
            Markup.button.callback('📋 View Tasks', 'view_tasks_1'), 
            Markup.button.callback('🗒️ View Notes', 'view_notes_1')
        ],
        [
            Markup.button.callback('📜 View History', 'view_history_dates_1'), 
            Markup.button.callback('📥 Download Data', 'download_menu')
        ],
        [Markup.button.callback('🗑️ Delete Data', 'delete_menu')]
    ]);

    await safeEdit(ctx, text, keyboard);
}

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
    await safeEdit(ctx, 
        `🎯 <b>CREATE NEW TASK</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter the <b>Title</b> of your task:\n\n` +
        `📝 <i>Example: "Morning Yoga Session"</i>`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'main_menu')]])
    );
});

bot.action('add_note', async (ctx) => {
    ctx.session.step = 'note_title';
    ctx.session.note = { 
        noteId: generateId(8), 
        userId: ctx.from.id,
        createdAt: new Date()
    };
    await safeEdit(ctx, 
        `📝 <b>CREATE NEW NOTE</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter the <b>Title</b> for your note:\n\n` +
        `📝 <i>Example: "Meeting Points"</i>`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'main_menu')]])
    );
});

// ==========================================
// 📨 TEXT INPUT HANDLER
// ==========================================

bot.on('text', async (ctx) => {
    if (!ctx.session || !ctx.session.step) return;
    const text = ctx.message.text.trim();
    const step = ctx.session.step;

    // --- TASK FLOW ---
    if (step === 'task_title') {
        if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
        ctx.session.task.title = text;
        ctx.session.step = 'task_desc';
        await ctx.reply(
            `📄 <b>ENTER DESCRIPTION</b>\n\n` +
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
            `📅 <b>SELECT DATE</b>\n\n` +
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
        
        // Check if date is in the past
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        date.setHours(0, 0, 0, 0);
        if (date < today) {
            return ctx.reply('❌ Date cannot be in the past. Please select today or a future date.');
        }
        
        ctx.session.task.dateStr = text;
        ctx.session.task.year = year;
        ctx.session.task.month = month;
        ctx.session.task.day = day;
        ctx.session.step = 'task_start';
        
        await ctx.reply(
            `⏰ <b>SELECT START TIME</b>\n\n` +
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
        
        // Create date in IST (NO timezone conversion - use as-is)
        const startDate = new Date(year, month - 1, day, h, m, 0);
        
        // Check if time is in the past for today's date
        const now = new Date();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        startDate.setHours(0, 0, 0, 0);
        
        if (isSameDay(startDate, today)) {
            const currentHour = new Date().getHours();
            const currentMinute = new Date().getMinutes();
            
            if (h < currentHour || (h === currentHour && m <= currentMinute)) {
                return ctx.reply('❌ Start time is in the past. Please enter a future time.');
            }
        }
        
        ctx.session.task.startDate = startDate;
        ctx.session.task.startTimeStr = text; 
        ctx.session.step = 'task_end';
        
        await ctx.reply(
            `🏁 <b>SELECT END TIME</b>\n\n` +
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
        
        // Create dates (NO timezone conversion)
        const startDate = new Date(year, month - 1, day, sh, sm, 0);
        const endDate = new Date(year, month - 1, day, eh, em, 0);
        
        if (endDate <= startDate) {
            return ctx.reply('❌ End time must be after Start time.');
        }
        
        ctx.session.task.endDate = endDate;
        ctx.session.task.nextOccurrence = startDate; // Initial next occurrence
        ctx.session.step = null;

        const dayName = getDayName(startDate);
        
        await ctx.reply(
            `🔄 <b>REPEAT OPTIONS</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `How should this task repeat?\n\n` +
            `📅 Task Date: ${formatDate(startDate)} (${dayName})\n` +
            `⏰ Time: ${ctx.session.task.startTimeStr} - ${text}\n\n` +
            `Select repeat type:`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('❌ No Repeat', 'repeat_none')],
                    [Markup.button.callback('📅 Repeat Daily', 'repeat_daily')],
                    [Markup.button.callback(`📅 Repeat Weekly (${dayName})`, 'repeat_weekly')],
                    [Markup.button.callback('🔙 Cancel', 'main_menu')]
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

    // --- NOTE FLOW ---
    else if (step === 'note_title') {
        if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
        ctx.session.note.title = text;
        ctx.session.step = 'note_content';
        await ctx.reply(
            `📝 <b>ENTER NOTE CONTENT</b>\n\n` +
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
            await db.collection('notes').insertOne(ctx.session.note);
            ctx.session.step = null;
            
            await ctx.reply(
                `✅ <b>NOTE SAVED SUCCESSFULLY!</b>\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 <b>${ctx.session.note.title}</b>\n\n` +
                `${formatBlockquote(text)}\n\n` +
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
    else if (step && step.startsWith('edit_')) {
        const taskId = ctx.session.editTaskId;
        const field = step.replace('edit_', '');
        
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
            const [h, m] = text.split(':').map(Number);
            
            // Update only hours and minutes (NO timezone conversion)
            dateObj.setHours(h, m, 0, 0);
             
            updates[field === 'start' ? 'startDate' : 'endDate'] = dateObj;
            
            // If updating start time, also update nextOccurrence
            if (field === 'start') {
                updates.nextOccurrence = dateObj;
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
            await ctx.reply(`✅ <b>${field.toUpperCase()} UPDATED SUCCESSFULLY!</b>`, { parse_mode: 'HTML' });
            await showTaskDetail(ctx, taskId);
        } catch (error) {
            console.error('Error updating task:', error);
            await ctx.reply('❌ Failed to update. Please try again.');
        }
    }
    
    // --- EDIT NOTE FLOW ---
    else if (step === 'edit_note_title') {
        if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
        
        try {
            await db.collection('notes').updateOne(
                { noteId: ctx.session.editNoteId }, 
                { $set: { title: text, updatedAt: new Date() } }
            );
            ctx.session.step = null;
            await ctx.reply('✅ <b>TITLE UPDATED!</b>', { parse_mode: 'HTML' });
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
            await db.collection('notes').updateOne(
                { noteId: ctx.session.editNoteId }, 
                { $set: { content: text, updatedAt: new Date() } }
            );
            ctx.session.step = null;
            await ctx.reply('✅ <b>CONTENT UPDATED!</b>', { parse_mode: 'HTML' });
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
        `🔢 <b>DAILY REPEAT</b>\n\n` +
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
        `🔢 <b>WEEKLY REPEAT</b>\n\n` +
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
        const msg = `
✅ <b>TASK CREATED SUCCESSFULLY!</b>

━━━━━━━━━━━━━━━━━━━━
📌 <b>${task.title}</b>

${formatBlockquote(task.description)}

📅 <b>Date:</b> ${formatDate(task.startDate)}
⏰ <b>Time:</b> ${formatTime(task.startDate)} - ${formatTime(task.endDate)}
🔄 <b>Repeat:</b> ${task.repeat} (${task.repeatCount || 0} times)
📊 <b>Status:</b> ⏳ Pending

🔔 <i>Notifications will start 10 minutes before the task.</i>
━━━━━━━━━━━━━━━━━━━━`;
                
        await safeEdit(ctx, msg, Markup.inlineKeyboard([
            [Markup.button.callback('📋 View All Tasks', 'view_tasks_1')],
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
        ]));
    } catch (error) {
        console.error('Error saving task:', error);
        await ctx.reply('❌ Failed to save task. Please try again.');
    }
}

// --- VIEW TASKS LIST ---
bot.action(/^view_tasks_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const limit = 8;
    const skip = (page - 1) * limit;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Only show tasks where nextOccurrence is today or in the future
    const tasks = await db.collection('tasks')
        .find({ 
            userId: ctx.from.id, 
            status: 'pending',
            nextOccurrence: { $gte: today }
        })
        .sort({ nextOccurrence: 1 })
        .skip(skip).limit(limit).toArray();

    const count = await db.collection('tasks').countDocuments({ 
        userId: ctx.from.id, 
        status: 'pending',
        nextOccurrence: { $gte: today }
    });
    const totalPages = Math.ceil(count / limit) || 1;

    let text = `
📋 <b>YOUR ACTIVE TASKS</b>

━━━━━━━━━━━━━━━━━━━━
📊 Page ${page} of ${totalPages}
📈 Total Tasks: ${count}
━━━━━━━━━━━━━━━━━━━━

Select a task to view details:`;

    if (tasks.length === 0) {
        text = `
📋 <b>YOUR ACTIVE TASKS</b>

━━━━━━━━━━━━━━━━━━━━
📭 <i>No active tasks found.</i>
<i>Create your first task using "Add Task"!</i>
━━━━━━━━━━━━━━━━━━━━`;
    }

    const buttons = [];
    tasks.forEach(t => {
        const isToday = isSameDay(t.nextOccurrence, new Date());
        const datePrefix = isToday ? '⏰ TODAY' : `📅 ${formatDate(t.nextOccurrence)}`;
        buttons.push([
            Markup.button.callback(
                `${datePrefix} - ${t.title}`, 
                `task_det_${t.taskId}`
            )
        ]);
    });

    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('⬅️ Previous', `view_tasks_${page - 1}`));
    if (page < totalPages) nav.push(Markup.button.callback('Next ➡️', `view_tasks_${page + 1}`));
    if (nav.length > 0) buttons.push(nav);
    buttons.push([
        Markup.button.callback('➕ Add New Task', 'add_task'),
        Markup.button.callback('🏠 Main Menu', 'main_menu')
    ]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

// --- TASK DETAILS ---
bot.action(/^task_det_(.+)$/, async (ctx) => {
    await showTaskDetail(ctx, ctx.match[1]);
});

async function showTaskDetail(ctx, taskId) {
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) {
        return safeEdit(ctx, 
            '❌ <b>TASK NOT FOUND</b>\n\nThis task may have been completed or deleted.',
            Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Tasks', 'view_tasks_1')]])
        );
    }

    const text = `
📌 <b>TASK DETAILS</b>

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
        [Markup.button.callback('✅ Mark as Complete', `complete_${taskId}`)],
        [
            Markup.button.callback('✏️ Edit', `edit_menu_${taskId}`), 
            Markup.button.callback('🗑️ Delete', `delete_${taskId}`)
        ],
        [Markup.button.callback('🔙 Back to Tasks', 'view_tasks_1')]
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
        completedFromDate: task.nextOccurrence // Store which occurrence was completed
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
                    startDate: nextOccurrence, // Also update start date for scheduling
                    // Adjust end date accordingly
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
    await safeEdit(ctx, 
        `✏️ <b>EDIT TASK</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Select what you want to edit:`,
        Markup.inlineKeyboard([
            [
                Markup.button.callback('🏷 Title', `edit_do_${taskId}_title`), 
                Markup.button.callback('📝 Desc', `edit_do_${taskId}_desc`)
            ],
            [
                Markup.button.callback('⏰ Start Time', `edit_do_${taskId}_start`), 
                Markup.button.callback('🏁 End Time', `edit_do_${taskId}_end`)
            ],
            [
                Markup.button.callback('🔄 Repeat Mode', `edit_rep_${taskId}`), 
                Markup.button.callback('🔢 Repeat Count', `edit_do_${taskId}_repeat_count`)
            ],
            [Markup.button.callback('🔙 Back', `task_det_${taskId}`)]
        ])
    );
});

bot.action(/^edit_do_(.+)_(.+)$/, async (ctx) => {
    ctx.session.editTaskId = ctx.match[1];
    const field = ctx.match[2];
    ctx.session.step = `edit_${field}`;
    
    let msg = '';
    if (field === 'title') msg = 'Enter new Title:';
    if (field === 'desc') msg = 'Enter new Description (Max 100 words):';
    if (field === 'start') msg = 'Enter new Start Time (HH:MM, 24-hour):';
    if (field === 'end') msg = 'Enter new End Time (HH:MM, 24-hour):';
    if (field === 'repeat_count') msg = 'Enter new Repeat Count (0-365):';

    await ctx.reply(
        `✏️ <b>EDIT ${field.toUpperCase()}</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${msg}`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${ctx.match[1]}`)]])
    );
});

bot.action(/^edit_rep_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    await safeEdit(ctx, 
        `🔄 <b>CHANGE REPEAT MODE</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Select new repeat mode:`,
        Markup.inlineKeyboard([
            [Markup.button.callback('❌ No Repeat', `set_rep_${taskId}_none`)],
            [Markup.button.callback('📅 Daily', `set_rep_${taskId}_daily`)],
            [Markup.button.callback('📅 Weekly', `set_rep_${taskId}_weekly`)],
            [Markup.button.callback('🔙 Back', `edit_menu_${taskId}`)]
        ])
    );
});

bot.action(/^set_rep_(.+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const mode = ctx.match[2];
    
    const updates = { repeat: mode };
    if (mode === 'none') {
        updates.repeatCount = 0;
    } else {
        updates.repeatCount = 10; // Default 10 repeats
    }
    
    await db.collection('tasks').updateOne({ taskId }, { $set: updates });
    await ctx.answerCbQuery(`✅ Updated to ${mode}`);
    await showTaskDetail(ctx, taskId);
});

// --- DELETE TASK ---
bot.action(/^delete_(.+)$/, async (ctx) => {
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
    const limit = 10;
    const skip = (page - 1) * limit;

    const dates = await db.collection('history').aggregate([
        { $match: { userId: ctx.from.id } },
        { $group: { 
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt", timezone: "Asia/Kolkata" } },
            count: { $sum: 1 }
        }},
        { $sort: { _id: -1 } },
        { $skip: skip },
        { $limit: limit }
    ]).toArray();

    const allGroups = await db.collection('history').aggregate([
        { $match: { userId: ctx.from.id } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt", timezone: "Asia/Kolkata" } } } }
    ]).toArray();
    const totalPages = Math.ceil(allGroups.length / limit) || 1;

    let text = `
📜 <b>COMPLETED TASKS HISTORY</b>

━━━━━━━━━━━━━━━━━━━━
📊 Page ${page} of ${totalPages}
📈 Total Dates: ${allGroups.length}
━━━━━━━━━━━━━━━━━━━━

Select a date to view completed tasks:`;

    if (dates.length === 0) {
        text = `
📜 <b>COMPLETED TASKS HISTORY</b>

━━━━━━━━━━━━━━━━━━━━
📭 <i>No completed tasks yet.</i>
<i>Complete some tasks to see history here!</i>
━━━━━━━━━━━━━━━━━━━━`;
    }

    const buttons = [];
    dates.forEach(d => {
        const date = new Date(d._id);
        buttons.push([
            Markup.button.callback(
                `📅 ${formatDate(date)} (${d.count} tasks)`, 
                `hist_list_${d._id}_1`
            )
        ]);
    });

    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('⬅️', `view_history_dates_${page - 1}`));
    if (page < totalPages) nav.push(Markup.button.callback('➡️', `view_history_dates_${page + 1}`));
    if (nav.length > 0) buttons.push(nav);
    buttons.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^hist_list_([\d-]+)_(\d+)$/, async (ctx) => {
    const dateStr = ctx.match[1];
    const page = parseInt(ctx.match[2]);
    const limit = 10;
    const skip = (page - 1) * limit;

    const tasks = await db.collection('history').find({
        userId: ctx.from.id,
        $expr: {
            $eq: [{ $dateToString: { format: "%Y-%m-%d", date: "$completedAt", timezone: "Asia/Kolkata" } }, dateStr]
        }
    }).sort({ completedAt: -1 }).skip(skip).limit(limit).toArray();

    const count = await db.collection('history').countDocuments({
        userId: ctx.from.id,
        $expr: {
            $eq: [{ $dateToString: { format: "%Y-%m-%d", date: "$completedAt", timezone: "Asia/Kolkata" } }, dateStr]
        }
    });
    const totalPages = Math.ceil(count / limit) || 1;

    const date = new Date(dateStr);
    let text = `
📅 <b>COMPLETED ON ${formatDate(date).toUpperCase()}</b>

━━━━━━━━━━━━━━━━━━━━
📊 Page ${page} of ${totalPages}
📈 Total Tasks: ${count}
━━━━━━━━━━━━━━━━━━━━`;
    
    const buttons = [];
    tasks.forEach(t => {
        const time = formatTime(t.completedAt);
        buttons.push([
            Markup.button.callback(
                `✅ ${t.title} (${time})`, 
                `hist_det_${t._id}`
            )
        ]);
    });

    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('⬅️', `hist_list_${dateStr}_${page - 1}`));
    if (page < totalPages) nav.push(Markup.button.callback('➡️', `hist_list_${dateStr}_${page + 1}`));
    if (nav.length > 0) buttons.push(nav);
    buttons.push([Markup.button.callback('🔙 Back to Dates', 'view_history_dates_1')]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^hist_det_(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const task = await db.collection('history').findOne({ _id: new ObjectId(id) });

    if (!task) return ctx.answerCbQuery('Task not found');

    const text = `
📜 <b>HISTORY DETAIL</b>

━━━━━━━━━━━━━━━━━━━━
📌 <b>${task.title}</b>

${formatBlockquote(task.description)}

✅ <b>Completed At:</b> ${formatDateTime(task.completedAt)}
⏰ <b>Original Time:</b> ${formatTime(task.startDate)} - ${formatTime(task.endDate)}
🔄 <b>Repeat Type:</b> ${task.repeat === 'none' ? 'No Repeat' : task.repeat}
━━━━━━━━━━━━━━━━━━━━`;

    await safeEdit(ctx, text, Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Back to History', 'view_history_dates_1')]
    ]));
});

// ==========================================
// 🗒️ VIEW NOTES
// ==========================================

bot.action(/^view_notes_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const limit = 8;
    const skip = (page - 1) * limit;

    const notes = await db.collection('notes').find({ userId: ctx.from.id })
        .sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();

    const count = await db.collection('notes').countDocuments({ userId: ctx.from.id });
    const totalPages = Math.ceil(count / limit) || 1;

    let text = `
🗒️ <b>YOUR NOTES</b>

━━━━━━━━━━━━━━━━━━━━
📊 Page ${page} of ${totalPages}
📈 Total Notes: ${count}
━━━━━━━━━━━━━━━━━━━━

Select a note to view:`;

    if (notes.length === 0) {
        text = `
🗒️ <b>YOUR NOTES</b>

━━━━━━━━━━━━━━━━━━━━
📭 <i>No notes found.</i>
<i>Create your first note using "Add Note"!</i>
━━━━━━━━━━━━━━━━━━━━`;
    }

    const buttons = [];
    notes.forEach(n => {
        const preview = n.title.length > 30 ? n.title.substring(0, 30) + '...' : n.title;
        buttons.push([Markup.button.callback(`📄 ${preview}`, `note_det_${n.noteId}`)]);
    });

    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('⬅️', `view_notes_${page - 1}`));
    if (page < totalPages) nav.push(Markup.button.callback('➡️', `view_notes_${page + 1}`));
    if (nav.length > 0) buttons.push(nav);
    buttons.push([
        Markup.button.callback('📝 Add New Note', 'add_note'),
        Markup.button.callback('🏠 Main Menu', 'main_menu')
    ]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^note_det_(.+)$/, async (ctx) => {
    const note = await db.collection('notes').findOne({ noteId: ctx.match[1] });
    if (!note) return ctx.answerCbQuery('Note not found');

    const text = `
📝 <b>NOTE DETAILS</b>

━━━━━━━━━━━━━━━━━━━━
📌 <b>${note.title}</b>

${formatBlockquote(note.content)}

📅 <b>Created:</b> ${formatDateTime(note.createdAt)}
${note.updatedAt ? `✏️ <b>Updated:</b> ${formatDateTime(note.updatedAt)}` : ''}
━━━━━━━━━━━━━━━━━━━━`;
    
    const buttons = [
        [
            Markup.button.callback('✏️ Edit', `edit_note_${note.noteId}`), 
            Markup.button.callback('🗑️ Delete', `del_note_${note.noteId}`)
        ],
        [Markup.button.callback('🔙 Back to Notes', 'view_notes_1')]
    ];

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^del_note_(.+)$/, async (ctx) => {
    try {
        await db.collection('notes').deleteOne({ noteId: ctx.match[1] });
        await ctx.answerCbQuery('✅ Note Deleted');
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error deleting note:', error);
        await ctx.answerCbQuery('❌ Error deleting note');
    }
});

bot.action(/^edit_note_(.+)$/, async (ctx) => {
    ctx.session.editNoteId = ctx.match[1];
    await safeEdit(ctx, 
        `✏️ <b>EDIT NOTE</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Select what you want to edit:`,
        Markup.inlineKeyboard([
            [
                Markup.button.callback('📝 Title', 'edit_nt_title'), 
                Markup.button.callback('📄 Content', 'edit_nt_content')
            ],
            [Markup.button.callback('🔙 Back', `note_det_${ctx.match[1]}`)]
        ])
    );
});

bot.action('edit_nt_title', async (ctx) => {
    ctx.session.step = 'edit_note_title';
    await ctx.reply(
        `✏️ <b>EDIT NOTE TITLE</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new title:`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `note_det_${ctx.session.editNoteId}`)]])
    );
});

bot.action('edit_nt_content', async (ctx) => {
    ctx.session.step = 'edit_note_content';
    await ctx.reply(
        `✏️ <b>EDIT NOTE CONTENT</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new content (Max 400 words):`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `note_det_${ctx.session.editNoteId}`)]])
    );
});

// ==========================================
// 📥 DOWNLOAD DATA MENU
// ==========================================

bot.action('download_menu', async (ctx) => {
    await safeEdit(ctx, 
        `📥 <b>DOWNLOAD YOUR DATA</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Select what you want to download:\n\n` +
        `📁 <i>Files will be sent as JSON documents</i>`,
        Markup.inlineKeyboard([
            [Markup.button.callback('📋 Active Tasks', 'download_tasks')],
            [Markup.button.callback('📜 History', 'download_history')],
            [Markup.button.callback('🗒️ Notes', 'download_notes')],
            [Markup.button.callback('📦 All Data (3 files)', 'download_all')],
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
        ])
    );
});

bot.action('download_tasks', async (ctx) => {
    const userId = ctx.from.id;
    const tasks = await db.collection('tasks').find({ userId }).toArray();
    
    if (tasks.length === 0) {
        await ctx.answerCbQuery('No tasks found');
        return;
    }
    
    const tasksBuff = Buffer.from(JSON.stringify(tasks, null, 2));
    await ctx.replyWithDocument({ source: tasksBuff, filename: 'active_tasks.json' });
    await ctx.answerCbQuery('✅ Tasks file sent');
});

bot.action('download_history', async (ctx) => {
    const userId = ctx.from.id;
    const history = await db.collection('history').find({ userId }).toArray();
    
    if (history.length === 0) {
        await ctx.answerCbQuery('No history found');
        return;
    }
    
    const histBuff = Buffer.from(JSON.stringify(history, null, 2));
    await ctx.replyWithDocument({ source: histBuff, filename: 'history.json' });
    await ctx.answerCbQuery('✅ History file sent');
});

bot.action('download_notes', async (ctx) => {
    const userId = ctx.from.id;
    const notes = await db.collection('notes').find({ userId }).toArray();
    
    if (notes.length === 0) {
        await ctx.answerCbQuery('No notes found');
        return;
    }
    
    const notesBuff = Buffer.from(JSON.stringify(notes, null, 2));
    await ctx.replyWithDocument({ source: notesBuff, filename: 'notes.json' });
    await ctx.answerCbQuery('✅ Notes file sent');
});

bot.action('download_all', async (ctx) => {
    const userId = ctx.from.id;
    
    // Send all three files separately
    const tasks = await db.collection('tasks').find({ userId }).toArray();
    const history = await db.collection('history').find({ userId }).toArray();
    const notes = await db.collection('notes').find({ userId }).toArray();
    
    // Send tasks file
    if (tasks.length > 0) {
        const tasksBuff = Buffer.from(JSON.stringify(tasks, null, 2));
        await ctx.replyWithDocument({ source: tasksBuff, filename: 'active_tasks.json' });
    }
    
    // Send history file
    if (history.length > 0) {
        const histBuff = Buffer.from(JSON.stringify(history, null, 2));
        await ctx.replyWithDocument({ source: histBuff, filename: 'history.json' });
    }
    
    // Send notes file
    if (notes.length > 0) {
        const notesBuff = Buffer.from(JSON.stringify(notes, null, 2));
        await ctx.replyWithDocument({ source: notesBuff, filename: 'notes.json' });
    }
    
    if (tasks.length === 0 && history.length === 0 && notes.length === 0) {
        await ctx.answerCbQuery('No data found to download');
    } else {
        await ctx.answerCbQuery('✅ All data files sent');
    }
});

// ==========================================
// 🗑️ DELETE DATA MENU (FIXED)
// ==========================================

bot.action('delete_menu', async (ctx) => {
    await safeEdit(ctx, 
        `🗑️ <b>DELETE DATA</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ <b>WARNING: This action cannot be undone!</b>\n\n` +
        `Select what you want to delete:`,
        Markup.inlineKeyboard([
            [Markup.button.callback('📋 Delete All Tasks', 'delete_tasks_confirm')],
            [Markup.button.callback('📜 Delete All History', 'delete_history_confirm')],
            [Markup.button.callback('🗒️ Delete All Notes', 'delete_notes_confirm')],
            [Markup.button.callback('🔥 Delete EVERYTHING', 'delete_all_confirm')],
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
        ])
    );
});

bot.action('delete_tasks_confirm', async (ctx) => {
    await safeEdit(ctx, 
        `⚠️ <b>CONFIRM DELETION</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Are you sure you want to delete ALL tasks?\n\n` +
        `📋 This will delete all your active tasks\n` +
        `🔔 All notifications will be cancelled\n` +
        `❌ This action cannot be undone!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━`,
        Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, DELETE ALL TASKS', 'delete_tasks_final')],
            [Markup.button.callback('🔙 Cancel', 'delete_menu')]
        ])
    );
});

bot.action('delete_tasks_final', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
        // Get all tasks to cancel schedules
        const tasks = await db.collection('tasks').find({ userId }).toArray();
        tasks.forEach(t => cancelTaskSchedule(t.taskId));
        
        // Delete from database
        const result = await db.collection('tasks').deleteMany({ userId });
        
        await ctx.answerCbQuery(`✅ Deleted ${result.deletedCount} tasks`);
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error deleting tasks:', error);
        await ctx.answerCbQuery('❌ Error deleting tasks');
    }
});

bot.action('delete_history_confirm', async (ctx) => {
    await safeEdit(ctx, 
        `⚠️ <b>CONFIRM DELETION</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Are you sure you want to delete ALL history?\n\n` +
        `📜 This will delete all your completed task history\n` +
        `📊 All statistics will be lost\n` +
        `❌ This action cannot be undone!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━`,
        Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, DELETE ALL HISTORY', 'delete_history_final')],
            [Markup.button.callback('🔙 Cancel', 'delete_menu')]
        ])
    );
});

bot.action('delete_history_final', async (ctx) => {
    const userId = ctx.from.id;
    try {
        const result = await db.collection('history').deleteMany({ userId });
        await ctx.answerCbQuery(`✅ Deleted ${result.deletedCount} history items`);
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error deleting history:', error);
        await ctx.answerCbQuery('❌ Error deleting history');
    }
});

bot.action('delete_notes_confirm', async (ctx) => {
    await safeEdit(ctx, 
        `⚠️ <b>CONFIRM DELETION</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Are you sure you want to delete ALL notes?\n\n` +
        `🗒️ This will delete all your saved notes\n` +
        `📝 All your personal notes will be lost\n` +
        `❌ This action cannot be undone!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━`,
        Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, DELETE ALL NOTES', 'delete_notes_final')],
            [Markup.button.callback('🔙 Cancel', 'delete_menu')]
        ])
    );
});

bot.action('delete_notes_final', async (ctx) => {
    const userId = ctx.from.id;
    try {
        const result = await db.collection('notes').deleteMany({ userId });
        await ctx.answerCbQuery(`✅ Deleted ${result.deletedCount} notes`);
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error deleting notes:', error);
        await ctx.answerCbQuery('❌ Error deleting notes');
    }
});

bot.action('delete_all_confirm', async (ctx) => {
    await safeEdit(ctx, 
        `⚠️ <b>FINAL WARNING</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Are you sure you want to delete ALL data?\n\n` +
        `📋 All active tasks\n` +
        `📜 All completed history\n` +
        `🗒️ All saved notes\n\n` +
        `🔔 All notifications will be cancelled\n` +
        `📊 All statistics will be lost\n` +
        `❌ This action cannot be undone!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🔥 YES, DELETE EVERYTHING', 'delete_all_final')],
            [Markup.button.callback('🔙 Cancel', 'delete_menu')]
        ])
    );
});

bot.action('delete_all_final', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
        // 1. Stop all schedulers
        const tasks = await db.collection('tasks').find({ userId }).toArray();
        tasks.forEach(t => cancelTaskSchedule(t.taskId));
        
        // 2. Delete everything
        const tasksResult = await db.collection('tasks').deleteMany({ userId });
        const historyResult = await db.collection('history').deleteMany({ userId });
        const notesResult = await db.collection('notes').deleteMany({ userId });
        
        const totalDeleted = tasksResult.deletedCount + historyResult.deletedCount + notesResult.deletedCount;
        
        // 3. Send backup files before confirming deletion
        if (tasksResult.deletedCount > 0) {
            const tasksBuff = Buffer.from(JSON.stringify(tasks, null, 2));
            await ctx.replyWithDocument({ source: tasksBuff, filename: 'backup_tasks_deleted.json' });
        }
        
        // For history and notes, we need to fetch them before deletion
        const history = await db.collection('history').find({ userId }).toArray();
        const notes = await db.collection('notes').find({ userId }).toArray();
        
        if (history.length > 0) {
            const histBuff = Buffer.from(JSON.stringify(history, null, 2));
            await ctx.replyWithDocument({ source: histBuff, filename: 'backup_history_deleted.json' });
        }
        
        if (notes.length > 0) {
            const notesBuff = Buffer.from(JSON.stringify(notes, null, 2));
            await ctx.replyWithDocument({ source: notesBuff, filename: 'backup_notes_deleted.json' });
        }
        
        await ctx.answerCbQuery(`✅ Deleted ${totalDeleted} items total`);
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error deleting all data:', error);
        await ctx.answerCbQuery('❌ Error deleting data');
    }
});

// ==========================================
// 🚀 BOOTSTRAP
// ==========================================

async function start() {
    try {
        if (await connectDB()) {
            await rescheduleAllPending();
            await bot.launch();
            console.log('🤖 Bot Started Successfully!');
            console.log(`⏰ Current IST Time: ${getCurrentIST()}`);
            console.log(`📊 Currently tracking ${activeSchedules.size} tasks`);
            
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
    
    bot.stop('SIGTERM');
    if (client) client.close();
    console.log('👋 Bot stopped gracefully');
    process.exit(0);
});

// Start the bot
start();
