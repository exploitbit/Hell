const { Telegraf, session, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');
const schedule = require('node-schedule');
require('dotenv').config();

// ==========================================
// CONFIGURATION
// ==========================================
const BOT_TOKEN = process.env.BOT_TOKEN || '8365287371:AAHBks0ToDhlNOU1LPvWlY7PW59qAtKcwG8';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://sandip:9E9AISFqTfU3VI5i@cluster0.p8irtov.mongodb.net/two_telegram_bot';
const ADMIN_IDS = [8469993808]; // Add your admin ID here

const bot = new Telegraf(BOT_TOKEN);

// MongoDB Client
let db, client;
let isDbConnected = false;

// Store active schedules: Map<taskId, { job: Job, interval: Interval }>
const scheduledJobs = new Map();

// Initialize Session
bot.use(session());

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function isAdmin(userId) {
    return ADMIN_IDS.includes(Number(userId));
}

function generateTaskId() {
    return Math.random().toString(36).substring(2, 12).toUpperCase();
}

function generateNoteId() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Format Date for Display (IST)
function formatDateIST(date) {
    return new Date(date).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
}

function formatTimeIST(date) {
    return new Date(date).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
}

// Safe Message Sender
async function safeEditMessage(ctx, text, extra = {}) {
    try {
        await ctx.editMessageText(text, { parse_mode: 'HTML', ...extra });
    } catch (err) {
        try {
            await ctx.reply(text, { parse_mode: 'HTML', ...extra });
        } catch (e) {
            console.error('Error sending message:', e);
        }
    }
}

// ==========================================
// DATABASE CONNECTION
// ==========================================

async function connectDB() {
    try {
        client = new MongoClient(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
        });
        await client.connect();
        db = client.db();
        isDbConnected = true;
        console.log('✅ Connected to MongoDB');
        
        // Create indexes
        await db.collection('tasks').createIndex({ userId: 1, status: 1 });
        await db.collection('tasks').createIndex({ taskId: 1 }, { unique: true });
        await db.collection('notes').createIndex({ userId: 1 });
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error);
        return false;
    }
}

// ==========================================
// SCHEDULER LOGIC (Fixed)
// ==========================================

// Schedule notifications for a specific task
function scheduleTaskNotifications(task) {
    try {
        const taskId = task.taskId;
        const userId = task.userId;
        const startTime = new Date(task.startDate);
        const now = new Date();

        // 1. Clear existing jobs for this task if any
        cancelTaskSchedule(taskId);

        // 2. Calculate Notification Start Time (10 minutes before)
        const notifyStartTime = new Date(startTime.getTime() - 10 * 60000);

        // If task is in the past, don't schedule
        if (startTime <= now) return;

        console.log(`⏰ Scheduling Task ${taskId}: Notify at ${formatTimeIST(notifyStartTime)} for Start at ${formatTimeIST(startTime)}`);

        // 3. Determine when to start the job
        // If notify time is in the future, schedule job there.
        // If notify time is passed (but start time is future), start immediately.
        const triggerDate = notifyStartTime > now ? notifyStartTime : now;

        const startJob = schedule.scheduleJob(triggerDate, function() {
            // This function runs when the 10-minute window starts
            
            let notificationCount = 0;
            const maxNotifications = 10;
            
            const sendReminder = async () => {
                const currentTime = new Date();
                
                // Stop if we passed start time or hit 10 msgs
                if (currentTime >= startTime || notificationCount >= maxNotifications) {
                    clearInterval(scheduledJobs.get(taskId)?.interval);
                    
                    // Send final "Started" msg if strictly at/after start time
                    if (currentTime >= startTime) {
                         try {
                            await bot.telegram.sendMessage(userId, `🚀 <b>TASK STARTED:</b> ${task.title}\n⏰ Time: ${formatTimeIST(startTime)}`, { parse_mode: 'HTML' });
                        } catch (e) {}
                    }
                    return;
                }

                const timeDiff = startTime - currentTime;
                const minutesLeft = Math.ceil(timeDiff / 60000);
                
                if (minutesLeft <= 0) return;

                try {
                    await bot.telegram.sendMessage(userId, 
                        `🔔 <b>Task Reminder (${notificationCount + 1}/10)</b>\n\n` +
                        `📌 <b>${task.title}</b>\n` +
                        `⏳ Starts in: <b>${minutesLeft} minutes</b>\n` +
                        `⏰ Time: ${formatTimeIST(task.startDate)}`,
                        { parse_mode: 'HTML' }
                    );
                } catch (e) {
                    console.error(`Failed to send notification to ${userId}:`, e.message);
                }
                
                notificationCount++;
            };

            // Send first immediate msg
            sendReminder();

            // Set interval for subsequent messages (every 60s)
            const interval = setInterval(sendReminder, 60000);
            
            // Update map with interval so we can cancel it later
            if (scheduledJobs.has(taskId)) {
                scheduledJobs.get(taskId).interval = interval;
            } else {
                scheduledJobs.set(taskId, { interval });
            }
        });

        // Store the main schedule job
        scheduledJobs.set(taskId, { job: startJob });

    } catch (error) {
        console.error('Error scheduling task:', error);
    }
}

function cancelTaskSchedule(taskId) {
    if (scheduledJobs.has(taskId)) {
        const scheduleData = scheduledJobs.get(taskId);
        if (scheduleData.job) scheduleData.job.cancel();
        if (scheduleData.interval) clearInterval(scheduleData.interval);
        scheduledJobs.delete(taskId);
        console.log(`🛑 Cancelled schedule for ${taskId}`);
    }
}

// Reschedule all pending tasks on startup
async function rescheduleAllTasks() {
    if (!db) return;
    const tasks = await db.collection('tasks').find({ 
        status: 'pending',
        startDate: { $gt: new Date() }
    }).toArray();

    tasks.forEach(task => scheduleTaskNotifications(task));
    console.log(`♻️ Rescheduled ${tasks.length} pending tasks.`);
}

// ==========================================
// BOT MENU & FLOW
// ==========================================

bot.command('start', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Authorization failed.");
    ctx.session = {}; // Reset session
    await showMainMenu(ctx);
});

async function showMainMenu(ctx) {
    const text = `👋 <b>Task Manager Bot</b>\n\n` +
                 `Current Time (IST): <b>${formatTimeIST(new Date())}</b>\n` +
                 `Select an option:`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('➕ Add Task', 'add_task'), Markup.button.callback('📝 Add Note', 'add_note')],
        [Markup.button.callback('📋 View Tasks', 'view_tasks_1'), Markup.button.callback('🗒️ View Notes', 'view_notes_1')],
        [Markup.button.callback('📜 History', 'view_history_1'), Markup.button.callback('📥 Download', 'download_menu')],
        [Markup.button.callback('🗑️ Delete Data', 'delete_menu')]
    ]);

    await safeEditMessage(ctx, text, keyboard);
}

// ==========================================
// ADD TASK
// ==========================================

bot.action('add_task', async (ctx) => {
    ctx.session.step = 'task_title';
    ctx.session.taskData = { 
        taskId: generateTaskId(), 
        userId: ctx.from.id,
        status: 'pending'
    };
    await safeEditMessage(ctx, `✏️ <b>New Task</b>\n\nEnter <b>Title</b>:`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'main_menu')]]));
});

bot.action('add_note', async (ctx) => {
    ctx.session.step = 'note_title';
    ctx.session.noteData = { 
        noteId: generateNoteId(), 
        userId: ctx.from.id 
    };
    await safeEditMessage(ctx, `📝 <b>New Note</b>\n\nEnter <b>Title</b>:`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'main_menu')]]));
});

// ==========================================
// TEXT HANDLER (WIZARD)
// ==========================================

bot.on('text', async (ctx) => {
    if (!ctx.session || !ctx.session.step) return;
    const text = ctx.message.text.trim();
    const step = ctx.session.step;

    // --- TASK STEPS ---
    if (step === 'task_title') {
        ctx.session.taskData.title = text;
        ctx.session.step = 'task_desc';
        await ctx.reply(`📄 Enter <b>Description</b> (Max 100 words):`);
    } 
    else if (step === 'task_desc') {
        if (text.split(/\s+/).length > 100) return ctx.reply('❌ Too long. Max 100 words.');
        ctx.session.taskData.description = text;
        ctx.session.step = 'task_start';
        await ctx.reply(`⏰ Enter <b>Start Time</b> (HH:MM):`);
    } 
    else if (step === 'task_start') {
        if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) return ctx.reply('❌ Invalid format. Use HH:MM.');
        
        const now = new Date();
        const [h, m] = text.split(':').map(Number);
        
        // Construct date (handling IST logic if simpler, but Date obj uses local server time usually UTC)
        // We assume input is meant for IST.
        // Simple approach: create date for Today with given time.
        const startDate = new Date();
        startDate.setHours(h, m, 0, 0);

        // If time passed today, assume user implies tomorrow
        if (startDate < now) {
            startDate.setDate(startDate.getDate() + 1);
        }

        ctx.session.taskData.startDate = startDate;
        ctx.session.taskData.startTimeStr = text;
        ctx.session.step = 'task_end';
        await ctx.reply(`🏁 Enter <b>End Time</b> (HH:MM):`);
    } 
    else if (step === 'task_end') {
        if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) return ctx.reply('❌ Invalid format.');
        
        const [sh, sm] = ctx.session.taskData.startTimeStr.split(':').map(Number);
        const [eh, em] = text.split(':').map(Number);

        if (eh < sh || (eh === sh && em <= sm)) return ctx.reply('❌ End must be after Start.');

        const endDate = new Date(ctx.session.taskData.startDate);
        endDate.setHours(eh, em, 0, 0);
        
        ctx.session.taskData.endDate = endDate;
        ctx.session.step = null;
        
        // Repeat Menu
        const day = ctx.session.taskData.startDate.toLocaleDateString('en-US', { weekday: 'long' });
        await ctx.reply(`🔄 <b>Repeat?</b>`, Markup.inlineKeyboard([
            [Markup.button.callback('None', 'rep_none')],
            [Markup.button.callback('Daily', 'rep_daily')],
            [Markup.button.callback(`Weekly (${day})`, 'rep_weekly')]
        ]));
    }
    // Repeat Date Step
    else if (step === 'rep_end_date') {
        if (!/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return ctx.reply('❌ Use DD/MM/YYYY');
        const [d, m, y] = text.split('/').map(Number);
        const date = new Date(y, m-1, d, 23, 59);
        
        if (isNaN(date) || date < new Date()) return ctx.reply('❌ Invalid date.');
        ctx.session.taskData.repeatEndDate = date;
        await finalizeTask(ctx);
    }
    // --- NOTE STEPS ---
    else if (step === 'note_title') {
        ctx.session.noteData.title = text;
        ctx.session.step = 'note_content';
        await ctx.reply(`📝 Enter <b>Content</b>:`);
    }
    else if (step === 'note_content') {
        ctx.session.noteData.content = text;
        ctx.session.noteData.createdAt = new Date();
        await db.collection('notes').insertOne(ctx.session.noteData);
        await ctx.reply('✅ Note Saved!');
        await showMainMenu(ctx);
    }
});

// Repeat Actions
bot.action('rep_none', async (ctx) => {
    ctx.session.taskData.repeat = 'none';
    await finalizeTask(ctx);
});
bot.action('rep_daily', async (ctx) => {
    ctx.session.taskData.repeat = 'daily';
    ctx.session.step = 'rep_end_date';
    await ctx.reply('📅 Enter Repeat End Date (DD/MM/YYYY):');
});
bot.action('rep_weekly', async (ctx) => {
    ctx.session.taskData.repeat = 'weekly';
    ctx.session.step = 'rep_end_date';
    await ctx.reply('📅 Enter Repeat End Date (DD/MM/YYYY):');
});

async function finalizeTask(ctx) {
    const task = ctx.session.taskData;
    await db.collection('tasks').insertOne(task);
    scheduleTaskNotifications(task);
    
    await ctx.reply(`✅ <b>Task Saved!</b>\nNotifications scheduled from 10 mins before start.`, { parse_mode: 'HTML' });
    await showMainMenu(ctx);
}

// ==========================================
// VIEW / DELETE MENU LOGIC
// ==========================================

// DELETE MENU
bot.action('delete_menu', async (ctx) => {
    await safeEditMessage(ctx, '🗑️ <b>Delete Data</b>\nSelect what to delete:', Markup.inlineKeyboard([
        [Markup.button.callback('❌ Delete All Data', 'del_all_confirm')],
        [Markup.button.callback('📋 Delete Tasks (Pending)', 'del_tasks_confirm')],
        [Markup.button.callback('📜 Delete History (Completed)', 'del_hist_confirm')],
        [Markup.button.callback('🗒️ Delete Notes', 'del_notes_confirm')],
        [Markup.button.callback('🔙 Back', 'main_menu')]
    ]));
});

// Delete Tasks
bot.action('del_tasks_confirm', async (ctx) => {
    const pendingTasks = await db.collection('tasks').find({ userId: ctx.from.id, status: 'pending' }).toArray();
    pendingTasks.forEach(t => cancelTaskSchedule(t.taskId)); // Stop schedulers
    
    const res = await db.collection('tasks').deleteMany({ userId: ctx.from.id, status: 'pending' });
    await ctx.answerCbQuery(`Deleted ${res.deletedCount} pending tasks.`);
    await showMainMenu(ctx);
});

// Delete History
bot.action('del_hist_confirm', async (ctx) => {
    const res = await db.collection('tasks').deleteMany({ userId: ctx.from.id, status: 'completed' });
    await ctx.answerCbQuery(`Deleted ${res.deletedCount} completed tasks.`);
    await showMainMenu(ctx);
});

// Delete Notes
bot.action('del_notes_confirm', async (ctx) => {
    const res = await db.collection('notes').deleteMany({ userId: ctx.from.id });
    await ctx.answerCbQuery(`Deleted ${res.deletedCount} notes.`);
    await showMainMenu(ctx);
});

// Delete All
bot.action('del_all_confirm', async (ctx) => {
    // 1. Cancel all schedules for this user
    const userTasks = await db.collection('tasks').find({ userId: ctx.from.id }).toArray();
    userTasks.forEach(t => cancelTaskSchedule(t.taskId));
    
    // 2. Delete DB entries
    await db.collection('tasks').deleteMany({ userId: ctx.from.id });
    await db.collection('notes').deleteMany({ userId: ctx.from.id });
    
    await ctx.answerCbQuery('All data deleted successfully.');
    await showMainMenu(ctx);
});


// DOWNLOAD MENU
bot.action('download_menu', async (ctx) => {
    await safeEditMessage(ctx, '📥 <b>Download Data</b>\nSelect what to download:', Markup.inlineKeyboard([
        [Markup.button.callback('📦 Download All', 'dl_all')],
        [Markup.button.callback('📋 Download Tasks', 'dl_tasks')],
        [Markup.button.callback('📜 Download History', 'dl_hist')],
        [Markup.button.callback('🗒️ Download Notes', 'dl_notes')],
        [Markup.button.callback('🔙 Back', 'main_menu')]
    ]));
});

async function sendJson(ctx, data, filename) {
    if (!data || data.length === 0) return ctx.answerCbQuery('No data found.');
    const buffer = Buffer.from(JSON.stringify(data, null, 2));
    await ctx.replyWithDocument({ source: buffer, filename: `${filename}.json` });
}

bot.action('dl_tasks', async (ctx) => {
    const data = await db.collection('tasks').find({ userId: ctx.from.id, status: 'pending' }).toArray();
    await sendJson(ctx, data, 'pending_tasks');
});
bot.action('dl_hist', async (ctx) => {
    const data = await db.collection('tasks').find({ userId: ctx.from.id, status: 'completed' }).toArray();
    await sendJson(ctx, data, 'task_history');
});
bot.action('dl_notes', async (ctx) => {
    const data = await db.collection('notes').find({ userId: ctx.from.id }).toArray();
    await sendJson(ctx, data, 'notes');
});
bot.action('dl_all', async (ctx) => {
    const tasks = await db.collection('tasks').find({ userId: ctx.from.id }).toArray();
    const notes = await db.collection('notes').find({ userId: ctx.from.id }).toArray();
    const allData = { tasks, notes };
    await sendJson(ctx, allData, 'full_backup');
});

// ==========================================
// VIEW FUNCTIONS (Pagination)
// ==========================================

// View Tasks
bot.action(/^view_tasks_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const limit = 10;
    const skip = (page - 1) * limit;
    
    const tasks = await db.collection('tasks').find({ userId: ctx.from.id, status: 'pending' })
        .sort({ startDate: 1 }).skip(skip).limit(limit).toArray();
        
    const count = await db.collection('tasks').countDocuments({ userId: ctx.from.id, status: 'pending' });
    const totalPages = Math.ceil(count / limit) || 1;
    
    let text = `📋 <b>Pending Tasks (Page ${page}/${totalPages})</b>\n\n`;
    const buttons = [];
    
    tasks.forEach(t => {
        buttons.push([Markup.button.callback(`📌 ${t.title} (${formatTimeIST(t.startDate)})`, `task_det_${t.taskId}`)]);
    });
    
    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('⬅️', `view_tasks_${page-1}`));
    if (page < totalPages) nav.push(Markup.button.callback('➡️', `view_tasks_${page+1}`));
    buttons.push(nav);
    buttons.push([Markup.button.callback('🔙 Back', 'main_menu')]);
    
    await safeEditMessage(ctx, text, Markup.inlineKeyboard(buttons));
});

// Task Detail
bot.action(/^task_det_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) return ctx.answerCbQuery('Task not found');
    
    const msg = `📌 <b>${task.title}</b>\n` +
                `📝 ${task.description}\n` +
                `⏰ ${formatTimeIST(task.startDate)} - ${formatTimeIST(task.endDate)}\n` +
                `🔄 Repeat: ${task.repeat}`;
                
    await safeEditMessage(ctx, msg, Markup.inlineKeyboard([
        [Markup.button.callback('✅ Complete', `comp_${taskId}`)],
        [Markup.button.callback('🗑️ Delete', `del_one_${taskId}`)],
        [Markup.button.callback('🔙 Back', 'view_tasks_1')]
    ]));
});

bot.action(/^comp_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    
    // Mark completed
    await db.collection('tasks').updateOne({ taskId }, { $set: { status: 'completed', completedAt: new Date() }});
    cancelTaskSchedule(taskId); // Stop notifications
    
    // Handle Repeat
    if (task && task.repeat !== 'none' && task.repeatEndDate) {
        const nextStart = new Date(task.startDate);
        const nextEnd = new Date(task.endDate);
        
        if (task.repeat === 'daily') {
            nextStart.setDate(nextStart.getDate() + 1);
            nextEnd.setDate(nextEnd.getDate() + 1);
        } else if (task.repeat === 'weekly') {
            nextStart.setDate(nextStart.getDate() + 7);
            nextEnd.setDate(nextEnd.getDate() + 7);
        }
        
        if (nextStart <= new Date(task.repeatEndDate)) {
            const newTask = { ...task, _id: undefined, taskId: generateTaskId(), startDate: nextStart, endDate: nextEnd, status: 'pending' };
            await db.collection('tasks').insertOne(newTask);
            scheduleTaskNotifications(newTask);
            await ctx.answerCbQuery('Marked done. Next task scheduled.');
        }
    } else {
        await ctx.answerCbQuery('Task completed.');
    }
    await showMainMenu(ctx);
});

bot.action(/^del_one_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    await db.collection('tasks').deleteOne({ taskId });
    cancelTaskSchedule(taskId);
    await ctx.answerCbQuery('Task deleted.');
    await showMainMenu(ctx);
});

// View Notes
bot.action(/^view_notes_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const limit = 10;
    const skip = (page - 1) * limit;
    
    const notes = await db.collection('notes').find({ userId: ctx.from.id })
        .sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
        
    const count = await db.collection('notes').countDocuments({ userId: ctx.from.id });
    const totalPages = Math.ceil(count / limit) || 1;
    
    let text = `🗒️ <b>Notes (Page ${page}/${totalPages})</b>\n\n`;
    const buttons = [];
    
    notes.forEach(n => {
        buttons.push([Markup.button.callback(`📄 ${n.title}`, `note_det_${n.noteId}`)]);
    });
    
    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('⬅️', `view_notes_${page-1}`));
    if (page < totalPages) nav.push(Markup.button.callback('➡️', `view_notes_${page+1}`));
    buttons.push(nav);
    buttons.push([Markup.button.callback('🔙 Back', 'main_menu')]);
    
    await safeEditMessage(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^note_det_(.+)$/, async (ctx) => {
    const note = await db.collection('notes').findOne({ noteId: ctx.match[1] });
    if (!note) return ctx.answerCbQuery('Note not found');
    
    const msg = `📝 <b>${note.title}</b>\n\n${note.content}`;
    await safeEditMessage(ctx, msg, Markup.inlineKeyboard([
        [Markup.button.callback('🗑️ Delete', `del_note_one_${note.noteId}`)],
        [Markup.button.callback('🔙 Back', 'view_notes_1')]
    ]));
});

bot.action(/^del_note_one_(.+)$/, async (ctx) => {
    await db.collection('notes').deleteOne({ noteId: ctx.match[1] });
    await ctx.answerCbQuery('Note deleted.');
    await showMainMenu(ctx);
});

// View History
bot.action(/^view_history_(\d+)$/, async (ctx) => {
    // Simply view completed tasks
    const page = parseInt(ctx.match[1]);
    const limit = 10;
    const skip = (page - 1) * limit;
    
    const tasks = await db.collection('tasks').find({ userId: ctx.from.id, status: 'completed' })
        .sort({ completedAt: -1 }).skip(skip).limit(limit).toArray();
        
    const count = await db.collection('tasks').countDocuments({ userId: ctx.from.id, status: 'completed' });
    const totalPages = Math.ceil(count / limit) || 1;
    
    let text = `📜 <b>History (Page ${page}/${totalPages})</b>\n\n`;
    const buttons = [];
    
    tasks.forEach(t => {
        buttons.push([Markup.button.callback(`✅ ${t.title} (${formatTimeIST(t.completedAt)})`, `hist_det_${t.taskId}`)]);
    });
    
    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('⬅️', `view_history_${page-1}`));
    if (page < totalPages) nav.push(Markup.button.callback('➡️', `view_history_${page+1}`));
    buttons.push(nav);
    buttons.push([Markup.button.callback('🔙 Back', 'main_menu')]);
    
    await safeEditMessage(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^hist_det_(.+)$/, async (ctx) => {
    const task = await db.collection('tasks').findOne({ taskId: ctx.match[1] });
    if (!task) return;
    const msg = `✅ <b>${task.title}</b>\nCompleted: ${formatDateIST(task.completedAt)}\n\n${task.description}`;
    await safeEditMessage(ctx, msg, Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'view_history_1')]]));
});

bot.action('main_menu', async (ctx) => {
    await showMainMenu(ctx);
});

// ==========================================
// STARTUP
// ==========================================

async function start() {
    if (await connectDB()) {
        await rescheduleAllTasks();
        bot.launch();
        console.log('🚀 Bot Started with Scheduler!');
    }
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

start();
