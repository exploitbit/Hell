const { Telegraf, session, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');
const schedule = require('node-schedule');
require('dotenv').config();

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
// Replace these with your actual values if not using .env
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

function generateTaskId() {
    return Math.random().toString(36).substring(2, 12).toUpperCase();
}

function generateNoteId() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

function formatTime(date) {
    return new Date(date).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
}

function getDayName(date) {
    return new Date(date).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' });
}

// Safe Message Editor
async function safeEdit(ctx, text, extra) {
    try {
        // We spread ...extra to ensure reply_markup is at the top level of the options object
        await ctx.editMessageText(text, { parse_mode: 'HTML', ...extra });
    } catch (err) {
        if (err.description && err.description.includes("message is not modified")) return;
        try {
            await ctx.reply(text, { parse_mode: 'HTML', ...extra });
        } catch (e) { console.error('SafeEdit Error:', e); }
    }
}

// ==========================================
// 🗄️ DATABASE CONNECTION
// ==========================================

async function connectDB() {
    try {
        await client.connect();
        db = client.db('telegram_task_bot');
        console.log('✅ Connected to MongoDB');
        
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
// ⏰ SCHEDULER LOGIC
// ==========================================

function scheduleTask(task) {
    try {
        const taskId = task.taskId;
        const userId = task.userId;
        const startTime = new Date(task.startDate);
        const now = new Date();

        // 1. Clear existing schedules
        cancelTaskSchedule(taskId);

        // 2. Notification triggers 10 mins before start
        const notifyTime = new Date(startTime.getTime() - 10 * 60000);

        // Skip if task is in the past
        if (startTime <= now) return;

        console.log(`⏰ Scheduled: ${task.title} (Notify: ${formatTime(notifyTime)})`);

        // 3. Schedule the trigger
        const triggerDate = notifyTime > now ? notifyTime : now;

        const startJob = schedule.scheduleJob(triggerDate, function() {
            let count = 0;
            const maxNotifications = 10;
            
            const sendReminder = async () => {
                const currentTime = new Date();
                
                // Stop if task started or max notifications reached
                if (currentTime >= startTime || count >= maxNotifications) {
                    clearInterval(activeSchedules.get(taskId)?.interval);
                    try {
                        await bot.telegram.sendMessage(userId, `🚀 <b>TASK STARTED:</b> ${task.title}\n\nGood luck!`, { parse_mode: 'HTML' });
                    } catch (e) {}
                    return;
                }

                const minutesLeft = Math.ceil((startTime - currentTime) / 60000);
                if (minutesLeft <= 0) return;

                try {
                    await bot.telegram.sendMessage(userId, 
                        `🔔 <b>Reminder (${count + 1}/10)</b>\n` +
                        `📌 ${task.title}\n` +
                        `⏳ Starts in: <b>${minutesLeft} mins</b>`, 
                        { parse_mode: 'HTML' }
                    );
                } catch (e) {}
                
                count++;
            };

            // Send first msg immediately
            sendReminder();

            // Loop every minute
            const interval = setInterval(sendReminder, 60000);
            
            if (activeSchedules.has(taskId)) {
                activeSchedules.get(taskId).interval = interval;
            } else {
                activeSchedules.set(taskId, { interval });
            }
        });

        activeSchedules.set(taskId, { startJob });

    } catch (error) {
        console.error(`Scheduler Error:`, error);
    }
}

function cancelTaskSchedule(taskId) {
    if (activeSchedules.has(taskId)) {
        const s = activeSchedules.get(taskId);
        if (s.startJob) s.startJob.cancel();
        if (s.interval) clearInterval(s.interval);
        activeSchedules.delete(taskId);
    }
}

async function rescheduleAllPending() {
    const tasks = await db.collection('tasks').find({ 
        status: 'pending', 
        startDate: { $gt: new Date() } 
    }).toArray();
    tasks.forEach(task => scheduleTask(task));
    console.log(`✅ Rescheduled ${tasks.length} tasks.`);
}

// ==========================================
// 📱 MAIN MENU
// ==========================================

bot.command('start', async (ctx) => {
    ctx.session = {}; 
    await showMainMenu(ctx);
});

async function showMainMenu(ctx) {
    const text = `👋 <b>Task Manager Bot</b>\n\n` +
                 `Organize your life with persistent tasks and notes.\n` +
                 `Select an option below:`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('➕ Add Task', 'add_task'), Markup.button.callback('📝 Add Note', 'add_note')],
        [Markup.button.callback('📋 View Tasks', 'view_tasks_1'), Markup.button.callback('🗒️ View Notes', 'view_notes_1')],
        [Markup.button.callback('📜 History', 'view_history_dates_1'), Markup.button.callback('📥 Download Data', 'download_data')],
        [Markup.button.callback('🗑️ Delete All Data', 'delete_all_confirm')]
    ]);

    await safeEdit(ctx, text, keyboard);
}

// ==========================================
// ➕ ADD TASK WIZARD
// ==========================================

bot.action('add_task', async (ctx) => {
    ctx.session.step = 'task_title';
    ctx.session.task = { 
        taskId: generateTaskId(), 
        userId: ctx.from.id,
        status: 'pending'
    };
    await safeEdit(ctx, `✏️ <b>Task Creation</b>\n\nEnter the <b>Title</b> of the task (e.g., "Gym Workout"):`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'main_menu')]]));
});

bot.action('add_note', async (ctx) => {
    ctx.session.step = 'note_title';
    ctx.session.note = { 
        noteId: generateNoteId(), 
        userId: ctx.from.id 
    };
    await safeEdit(ctx, `📝 <b>Note Creation</b>\n\nEnter the <b>Title</b> of the note:`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'main_menu')]]));
});

// ==========================================
// 📨 TEXT INPUT HANDLER (CRITICAL FIXES HERE)
// ==========================================

bot.on('text', async (ctx) => {
    if (!ctx.session || !ctx.session.step) return;
    const text = ctx.message.text.trim();
    const step = ctx.session.step;

    // --- TASK FLOW ---
    if (step === 'task_title') {
        ctx.session.task.title = text;
        ctx.session.step = 'task_desc';
        await ctx.reply(`📄 Enter <b>Description</b> (Max 100 words):`, { parse_mode: 'HTML' });
    }
    else if (step === 'task_desc') {
        if (text.split(/\s+/).length > 100) return ctx.reply('❌ Too long! Keep it under 100 words.');
        ctx.session.task.description = text;
        ctx.session.step = 'task_start';
        await ctx.reply(`⏰ Enter <b>Start Time</b> (HH:MM, e.g., 14:30):`);
    }
    else if (step === 'task_start') {
        if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) return ctx.reply('❌ Invalid format. Use HH:MM.');
        
        const now = new Date();
        const [h, m] = text.split(':').map(Number);
        const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
        
        ctx.session.task.startDate = startDate;
        ctx.session.task.startTimeStr = text; 
        ctx.session.step = 'task_end';
        await ctx.reply(`🏁 Enter <b>End Time</b> (HH:MM, must be after ${text}):`);
    }
    else if (step === 'task_end') {
        if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) return ctx.reply('❌ Invalid format. Use HH:MM.');
        
        const [sh, sm] = ctx.session.task.startTimeStr.split(':').map(Number);
        const [eh, em] = text.split(':').map(Number);

        if (eh < sh || (eh === sh && em <= sm)) return ctx.reply('❌ End time must be after Start time.');
        
        const endDate = new Date(ctx.session.task.startDate);
        endDate.setHours(eh, em);
        
        ctx.session.task.endDate = endDate;
        ctx.session.step = null; // Exit text input

        // --- FIX: BUTTON DISPLAY ---
        const dayName = getDayName(ctx.session.task.startDate);
        
        // We use the spread operator ...Markup.inlineKeyboard(...) inside the options object
        // OR pass the markup as the second argument if not using extra options like parse_mode.
        // The safest way in Telegraf 4 is passing the markup object directly or merging it.
        
        await ctx.reply(`🔄 <b>Repeat this task?</b>\n\nChoose an option:`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('❌ None', 'repeat_none')],
                [Markup.button.callback('📅 Daily', 'repeat_daily')],
                [Markup.button.callback(`📅 Weekly (${dayName})`, 'repeat_weekly')]
            ])
        });
    }
    else if (step === 'task_repeat_end_date') {
        if (!/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return ctx.reply('❌ Invalid format. Use DD/MM/YYYY.');
        
        const [d, m, y] = text.split('/').map(Number);
        const repeatEnd = new Date(y, m - 1, d, 23, 59, 59);
        
        if (isNaN(repeatEnd.getTime()) || repeatEnd < new Date()) return ctx.reply('❌ Date must be in the future.');

        ctx.session.task.repeatEndDate = repeatEnd;
        await saveTask(ctx);
    }

    // --- NOTE FLOW ---
    else if (step === 'note_title') {
        ctx.session.note.title = text;
        ctx.session.step = 'note_content';
        await ctx.reply(`📝 Enter <b>Note Content</b> (Max 400 words):`, { parse_mode: 'HTML' });
    }
    else if (step === 'note_content') {
        if (text.split(/\s+/).length > 400) return ctx.reply('❌ Too long! Keep it under 400 words.');
        
        ctx.session.note.content = text;
        ctx.session.note.createdAt = new Date();
        
        await db.collection('notes').insertOne(ctx.session.note);
        ctx.session.step = null;
        
        await ctx.reply('✅ <b>Note Saved!</b>', { parse_mode: 'HTML' });
        await showMainMenu(ctx);
    }
    
    // --- EDIT TASK FLOW ---
    else if (step && step.startsWith('edit_')) {
        const taskId = ctx.session.editTaskId;
        const field = step.replace('edit_', '');
        
        const updates = {};
        if (field === 'title') updates.title = text;
        if (field === 'desc') updates.description = text;
        
        if (field === 'start' || field === 'end') {
             if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) return ctx.reply('❌ Invalid Format (HH:MM)');
             
             const task = await db.collection('tasks').findOne({ taskId });
             const dateObj = new Date(field === 'start' ? task.startDate : task.endDate);
             const [h, m] = text.split(':');
             dateObj.setHours(h, m);
             
             updates[field === 'start' ? 'startDate' : 'endDate'] = dateObj;
        }

        await db.collection('tasks').updateOne({ taskId }, { $set: updates });
        
        if (field === 'start') {
            const updatedTask = await db.collection('tasks').findOne({ taskId });
            scheduleTask(updatedTask);
        }

        ctx.session.step = null;
        await ctx.reply(`✅ <b>${field.toUpperCase()} Updated!</b>`, { parse_mode: 'HTML' });
        await showTaskDetail(ctx, taskId);
    }
});

// ==========================================
// 🕹️ BUTTON ACTIONS
// ==========================================

bot.action('repeat_none', async (ctx) => {
    ctx.session.task.repeat = 'none';
    await saveTask(ctx);
});

bot.action('repeat_daily', async (ctx) => {
    ctx.session.task.repeat = 'daily';
    ctx.session.step = 'task_repeat_end_date';
    await ctx.reply(`📅 <b>Daily Repeat Selected</b>\n\nUntil when? Enter End Date (DD/MM/YYYY):`, { parse_mode: 'HTML' });
});

bot.action('repeat_weekly', async (ctx) => {
    ctx.session.task.repeat = 'weekly';
    ctx.session.step = 'task_repeat_end_date';
    await ctx.reply(`📅 <b>Weekly Repeat Selected</b>\n\nUntil when? Enter End Date (DD/MM/YYYY):`, { parse_mode: 'HTML' });
});

async function saveTask(ctx) {
    const task = ctx.session.task;
    await db.collection('tasks').insertOne(task);
    scheduleTask(task);
    
    ctx.session.step = null;
    const msg = `✅ <b>Task Saved Successfully!</b>\n\n` +
                `📌 ${task.title}\n` +
                `⏰ ${formatTime(task.startDate)} - ${formatTime(task.endDate)}\n` +
                `🔄 Repeat: ${task.repeat}`;
                
    await safeEdit(ctx, msg, Markup.inlineKeyboard([[Markup.button.callback('🔙 Main Menu', 'main_menu')]]));
}

// --- VIEW TASKS LIST ---
bot.action(/^view_tasks_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const limit = 10;
    const skip = (page - 1) * limit;

    const tasks = await db.collection('tasks')
        .find({ userId: ctx.from.id, status: 'pending' })
        .sort({ startDate: 1 })
        .skip(skip).limit(limit).toArray();

    const count = await db.collection('tasks').countDocuments({ userId: ctx.from.id, status: 'pending' });
    const totalPages = Math.ceil(count / limit) || 1;

    let text = `📋 <b>Pending Tasks (Page ${page}/${totalPages})</b>\n\n`;
    if (tasks.length === 0) text += "<i>No tasks found.</i>";

    const buttons = [];
    tasks.forEach(t => {
        text += `▫️ ${t.title} (${formatTime(t.startDate)})\n`;
        buttons.push([Markup.button.callback(`📌 ${t.title}`, `task_det_${t.taskId}`)]);
    });

    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('⬅️ Prev', `view_tasks_${page - 1}`));
    if (page < totalPages) nav.push(Markup.button.callback('Next ➡️', `view_tasks_${page + 1}`));
    buttons.push(nav);
    buttons.push([Markup.button.callback('🔙 Main Menu', 'main_menu')]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

// --- TASK DETAILS ---
bot.action(/^task_det_(.+)$/, async (ctx) => {
    await showTaskDetail(ctx, ctx.match[1]);
});

async function showTaskDetail(ctx, taskId) {
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) return safeEdit(ctx, '❌ Task not found or deleted.', Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'view_tasks_1')]]));

    const text = `📌 <b>Task Details</b>\n\n` +
                 `🆔 ID: <code>${task.taskId}</code>\n` +
                 `🏷 Title: <b>${task.title}</b>\n` +
                 `📝 Desc: ${task.description}\n` +
                 `📅 Date: ${formatDate(task.startDate)}\n` +
                 `⏰ Time: ${formatTime(task.startDate)} - ${formatTime(task.endDate)}\n` +
                 `🔄 Repeat: ${task.repeat}`;

    const buttons = [
        [Markup.button.callback('✅ Mark as Complete', `complete_${taskId}`)],
        [Markup.button.callback('✏️ Edit', `edit_menu_${taskId}`), Markup.button.callback('🗑️ Delete', `delete_${taskId}`)],
        [Markup.button.callback('🔙 Back List', 'view_tasks_1')]
    ];
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

// --- COMPLETE TASK (Repeat Logic) ---
bot.action(/^complete_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) return;

    // 1. Move Current to History
    await db.collection('tasks').updateOne({ taskId }, { 
        $set: { status: 'completed', completedAt: new Date() } 
    });
    cancelTaskSchedule(taskId);

    // 2. Schedule Next Occurrence
    if (task.repeat !== 'none' && task.repeatEndDate) {
        const nextStart = new Date(task.startDate);
        const nextEnd = new Date(task.endDate);

        const daysToAdd = task.repeat === 'weekly' ? 7 : 1;
        nextStart.setDate(nextStart.getDate() + daysToAdd);
        nextEnd.setDate(nextEnd.getDate() + daysToAdd);

        if (nextStart <= new Date(task.repeatEndDate)) {
            const newTask = {
                ...task,
                _id: undefined, 
                taskId: generateTaskId(),
                startDate: nextStart,
                endDate: nextEnd,
                status: 'pending',
                completedAt: undefined
            };
            
            await db.collection('tasks').insertOne(newTask);
            scheduleTask(newTask);
            await ctx.answerCbQuery('✅ Completed! Next instance scheduled.');
        } else {
            await ctx.answerCbQuery('✅ Completed! Repeat Ended.');
        }
    } else {
        await ctx.answerCbQuery('✅ Task Completed!');
    }
    await showMainMenu(ctx);
});

// --- EDIT MENU ---
bot.action(/^edit_menu_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    await safeEdit(ctx, `✏️ <b>Edit Task</b>\nSelect what to change:`, Markup.inlineKeyboard([
        [Markup.button.callback('🏷 Title', `edit_do_${taskId}_title`), Markup.button.callback('📝 Desc', `edit_do_${taskId}_desc`)],
        [Markup.button.callback('⏰ Start Time', `edit_do_${taskId}_start`), Markup.button.callback('🏁 End Time', `edit_do_${taskId}_end`)],
        [Markup.button.callback('🔙 Back', `task_det_${taskId}`)]
    ]));
});

bot.action(/^edit_do_(.+)_(.+)$/, async (ctx) => {
    ctx.session.editTaskId = ctx.match[1];
    const field = ctx.match[2];
    ctx.session.step = `edit_${field}`;
    
    let msg = '';
    if (field === 'title') msg = 'Enter new Title:';
    if (field === 'desc') msg = 'Enter new Description:';
    if (field === 'start') msg = 'Enter new Start Time (HH:MM):';
    if (field === 'end') msg = 'Enter new End Time (HH:MM):';

    await ctx.reply(`✏️ ${msg}`, Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${ctx.match[1]}`)]]));
});

// --- DELETE TASK ---
bot.action(/^delete_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    await db.collection('tasks').deleteOne({ taskId });
    cancelTaskSchedule(taskId);
    await ctx.answerCbQuery('🗑️ Deleted');
    await showMainMenu(ctx);
});

// ==========================================
// 📜 VIEW HISTORY
// ==========================================

bot.action(/^view_history_dates_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const limit = 10;
    const skip = (page - 1) * limit;

    const dates = await db.collection('tasks').aggregate([
        { $match: { userId: ctx.from.id, status: 'completed' } },
        { $group: { 
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt", timezone: "Asia/Kolkata" } },
            count: { $sum: 1 }
        }},
        { $sort: { _id: -1 } },
        { $skip: skip },
        { $limit: limit }
    ]).toArray();

    const allGroups = await db.collection('tasks').aggregate([
        { $match: { userId: ctx.from.id, status: 'completed' } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt" } } } }
    ]).toArray();
    const totalPages = Math.ceil(allGroups.length / limit) || 1;

    let text = `📜 <b>History Dates (Page ${page}/${totalPages})</b>\n\n`;
    if (dates.length === 0) text += "<i>No history yet.</i>";

    const buttons = [];
    dates.forEach(d => {
        buttons.push([Markup.button.callback(`📅 ${d._id} (${d.count} tasks)`, `hist_list_${d._id}_1`)]);
    });

    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('⬅️', `view_history_dates_${page - 1}`));
    if (page < totalPages) nav.push(Markup.button.callback('➡️', `view_history_dates_${page + 1}`));
    buttons.push(nav);
    buttons.push([Markup.button.callback('🔙 Main Menu', 'main_menu')]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^hist_list_([\d-]+)_(\d+)$/, async (ctx) => {
    const dateStr = ctx.match[1];
    const page = parseInt(ctx.match[2]);
    const limit = 10;
    const skip = (page - 1) * limit;

    const tasks = await db.collection('tasks').find({
        userId: ctx.from.id,
        status: 'completed',
        $expr: {
            $eq: [{ $dateToString: { format: "%Y-%m-%d", date: "$completedAt", timezone: "Asia/Kolkata" } }, dateStr]
        }
    }).sort({ completedAt: -1 }).skip(skip).limit(limit).toArray();

    const count = await db.collection('tasks').countDocuments({
        userId: ctx.from.id, status: 'completed',
        $expr: {
            $eq: [{ $dateToString: { format: "%Y-%m-%d", date: "$completedAt", timezone: "Asia/Kolkata" } }, dateStr]
        }
    });
    const totalPages = Math.ceil(count / limit) || 1;

    let text = `📅 <b>Tasks on ${dateStr} (Page ${page}/${totalPages})</b>\n\n`;
    
    const buttons = [];
    tasks.forEach(t => {
        text += `✅ ${t.title} (${formatTime(t.completedAt)})\n`;
        buttons.push([Markup.button.callback(`🔍 ${t.title}`, `task_det_${t.taskId}`)]);
    });

    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('⬅️', `hist_list_${dateStr}_${page - 1}`));
    if (page < totalPages) nav.push(Markup.button.callback('➡️', `hist_list_${dateStr}_${page + 1}`));
    buttons.push(nav);
    buttons.push([Markup.button.callback('🔙 Back to Dates', 'view_history_dates_1')]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

// ==========================================
// 🗒️ VIEW NOTES
// ==========================================

bot.action(/^view_notes_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const limit = 10;
    const skip = (page - 1) * limit;

    const notes = await db.collection('notes').find({ userId: ctx.from.id })
        .sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();

    const count = await db.collection('notes').countDocuments({ userId: ctx.from.id });
    const totalPages = Math.ceil(count / limit) || 1;

    let text = `🗒️ <b>Notes (Page ${page}/${totalPages})</b>\n\n`;
    if (notes.length === 0) text += "<i>No notes found.</i>";

    const buttons = [];
    notes.forEach(n => {
        text += `• ${n.title}\n`;
        buttons.push([Markup.button.callback(`📄 ${n.title}`, `note_det_${n.noteId}`)]);
    });

    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('⬅️', `view_notes_${page - 1}`));
    if (page < totalPages) nav.push(Markup.button.callback('➡️', `view_notes_${page + 1}`));
    buttons.push(nav);
    buttons.push([Markup.button.callback('🔙 Main Menu', 'main_menu')]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^note_det_(.+)$/, async (ctx) => {
    const note = await db.collection('notes').findOne({ noteId: ctx.match[1] });
    if (!note) return ctx.answerCbQuery('Note not found');

    const text = `📝 <b>Note Details</b>\n\n` +
                 `📌 <b>${note.title}</b>\n` +
                 `📅 ${formatDate(note.createdAt)}\n\n` +
                 `<i>${note.content}</i>`;
    
    await safeEdit(ctx, text, Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'view_notes_1')]]));
});

// ==========================================
// 📥 DATA MANAGEMENT
// ==========================================

bot.action('download_data', async (ctx) => {
    const userId = ctx.from.id;
    const tasks = await db.collection('tasks').find({ userId }).toArray();
    const notes = await db.collection('notes').find({ userId }).toArray();
    
    const active = tasks.filter(t => t.status === 'pending');
    const history = tasks.filter(t => t.status === 'completed');

    const activeBuff = Buffer.from(JSON.stringify(active, null, 2));
    const histBuff = Buffer.from(JSON.stringify(history, null, 2));
    const notesBuff = Buffer.from(JSON.stringify(notes, null, 2));

    await ctx.replyWithDocument({ source: activeBuff, filename: 'active_tasks.json' });
    await ctx.replyWithDocument({ source: histBuff, filename: 'history.json' });
    await ctx.replyWithDocument({ source: notesBuff, filename: 'notes.json' });
    
    await ctx.answerCbQuery('✅ Files Sent');
});

bot.action('delete_all_confirm', async (ctx) => {
    await safeEdit(ctx, '⚠️ <b>WARNING: DELETE ALL DATA?</b>\n\nThis cannot be undone.', Markup.inlineKeyboard([
        [Markup.button.callback('🔥 YES, DELETE EVERYTHING', 'delete_all_final')],
        [Markup.button.callback('🔙 Cancel', 'main_menu')]
    ]));
});

bot.action('delete_all_final', async (ctx) => {
    const userId = ctx.from.id;
    const tasks = await db.collection('tasks').find({ userId, status: 'pending' }).toArray();
    tasks.forEach(t => cancelTaskSchedule(t.taskId));
    
    await db.collection('tasks').deleteMany({ userId });
    await db.collection('notes').deleteMany({ userId });
    
    await ctx.answerCbQuery('🗑️ All data wiped.');
    await showMainMenu(ctx);
});

bot.action('main_menu', async (ctx) => {
    ctx.session.step = null;
    await showMainMenu(ctx);
});

// ==========================================
// 🚀 BOOTSTRAP
// ==========================================

async function start() {
    if (await connectDB()) {
        await rescheduleAllPending();
        bot.launch();
        console.log('🤖 Bot Started!');
    }
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

start();
