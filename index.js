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
        await db.collection('history').createIndex({ userId: 1, completedAt: -1 });
        await db.collection('notes').createIndex({ userId: 1 });
        
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

        console.log(`⏰ Scheduled: ${task.title} for ${startTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

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
                                `🚀 <b>TASK STARTED:</b> ${task.title}\n\nTime to work!`, 
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
                        `🔔 <b>Reminder (${count + 1}/${maxNotifications})</b>\n` +
                        `📌 ${task.title}\n` +
                        `⏳ Starts in: <b>${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}</b>\n` +
                        `⏰ Start Time: ${formatTime(task.startDate)}\n` +
                        `📅 Date: ${formatDate(task.startDate)}`, 
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
// 📱 MAIN MENU
// ==========================================

bot.command('start', async (ctx) => {
    ctx.session = {}; 
    await showMainMenu(ctx);
});

async function showMainMenu(ctx) {
    const text = `👋 <b>Task Manager Bot</b>\n\n` +
                 `Current Time: <b>${getCurrentIST()}</b>\n` +
                 `Select an option below:`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('➕ Add Task', 'add_task'), Markup.button.callback('📝 Add Note', 'add_note')],
        [Markup.button.callback('📋 View Tasks', 'view_tasks_1'), Markup.button.callback('🗒️ View Notes', 'view_notes_1')],
        [Markup.button.callback('📜 History', 'view_history_dates_1'), Markup.button.callback('📥 Download Data', 'download_menu')],
        [Markup.button.callback('🗑️ Delete Data', 'delete_menu')]
    ]);

    await ctx.reply(text, { 
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup 
    });
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
    await ctx.editMessageText(`✏️ <b>Task Creation</b>\n\nEnter the <b>Title</b> of the task (e.g., "Gym"):`, { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'main_menu')]]).reply_markup
    });
});

bot.action('add_note', async (ctx) => {
    ctx.session.step = 'note_title';
    ctx.session.note = { 
        noteId: generateId(5), 
        userId: ctx.from.id,
        createdAt: new Date()
    };
    await ctx.editMessageText(`📝 <b>Note Creation</b>\n\nEnter the <b>Title</b> of the note:`, { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'main_menu')]]).reply_markup
    });
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
        await ctx.reply(`📄 Enter <b>Description</b> (Max 100 words):`, { parse_mode: 'HTML' });
    }
    else if (step === 'task_desc') {
        if (text.split(/\s+/).length > 100) return ctx.reply('❌ Too long! Keep it under 100 words.');
        ctx.session.task.description = text;
        ctx.session.step = 'task_date';
        await ctx.reply(`📅 Enter <b>Date</b> (DD-MM-YYYY)\nToday: ${formatDate(new Date())}:`);
    }
    else if (step === 'task_date') {
        // Validate date format DD-MM-YYYY
        if (!/^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-\d{4}$/.test(text)) {
            return ctx.reply('❌ Invalid date format. Use DD-MM-YYYY (e.g., 15-02-2024)');
        }
        
        const [day, month, year] = text.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        
        // Check if date is valid
        if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
            return ctx.reply('❌ Invalid date. Please check the day, month, and year.');
        }
        
        ctx.session.task.dateStr = text;
        ctx.session.step = 'task_start';
        await ctx.reply(`⏰ Enter <b>Start Time</b> (HH:MM, 24-hour format)\nCurrent Time: ${getCurrentIST()}:`);
    }
    else if (step === 'task_start') {
        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) return ctx.reply('❌ Invalid format. Use HH:MM (24-hour).');
        
        const [h, m] = text.split(':').map(Number);
        const [day, month, year] = ctx.session.task.dateStr.split('-').map(Number);
        
        // Create start date in LOCAL time (no UTC conversion)
        const startDate = new Date(year, month - 1, day, h, m, 0);
        
        // Check if time is in the past
        const now = new Date();
        if (startDate <= now) {
            return ctx.reply('❌ Start time is in the past. Please enter a future time.');
        }
        
        ctx.session.task.startDate = startDate;
        ctx.session.task.startTimeStr = text; 
        ctx.session.step = 'task_end';
        await ctx.reply(`🏁 Enter <b>End Time</b> (HH:MM, 24-hour format)\nMust be after ${text}:`);
    }
    else if (step === 'task_end') {
        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) return ctx.reply('❌ Invalid format. Use HH:MM (24-hour).');
        
        const [sh, sm] = ctx.session.task.startTimeStr.split(':').map(Number);
        const [eh, em] = text.split(':').map(Number);
        
        // Create end date using the same date as start
        const [day, month, year] = ctx.session.task.dateStr.split('-').map(Number);
        const startDate = new Date(year, month - 1, day, sh, sm, 0);
        const endDate = new Date(year, month - 1, day, eh, em, 0);
        
        if (endDate <= startDate) return ctx.reply('❌ End time must be after Start time.');
        
        ctx.session.task.endDate = endDate;
        ctx.session.step = null;

        const dayName = getDayName(startDate);
        
        await ctx.reply(`🔄 <b>Repeat this task?</b>\n\nChoose an option:`, {
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('❌ None', 'repeat_none')],
                [Markup.button.callback('📅 Daily', 'repeat_daily')],
                [Markup.button.callback(`📅 Weekly (${dayName})`, 'repeat_weekly')]
            ]).reply_markup
        });
    }
    else if (step === 'task_repeat_count') {
        const count = parseInt(text);
        if (isNaN(count) || count < 1 || count > 365) return ctx.reply('❌ Please enter a valid number between 1 and 365.');
        
        ctx.session.task.repeatCount = count;
        await saveTask(ctx);
    }

    // --- NOTE FLOW ---
    else if (step === 'note_title') {
        if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
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
             if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) return ctx.reply('❌ Invalid Format (HH:MM)');
             
             const task = await db.collection('tasks').findOne({ taskId });
             const dateObj = new Date(field === 'start' ? task.startDate : task.endDate);
             const [h, m] = text.split(':').map(Number);
             
             // Update time in LOCAL timezone
             dateObj.setHours(h, m, 0, 0);
             
             updates[field === 'start' ? 'startDate' : 'endDate'] = dateObj;
        }

        if (field === 'repeat_count') {
             const count = parseInt(text);
             if (isNaN(count) || count < 0 || count > 365) return ctx.reply('❌ Invalid Number (0-365)');
             updates.repeatCount = count;
             if (count === 0) updates.repeat = 'none';
        }

        await db.collection('tasks').updateOne({ taskId }, { $set: updates });
        
        // Reschedule if start time changed
        if (field === 'start') {
            const updatedTask = await db.collection('tasks').findOne({ taskId });
            scheduleTask(updatedTask);
        }

        ctx.session.step = null;
        await ctx.reply(`✅ <b>${field.toUpperCase()} Updated!</b>`, { parse_mode: 'HTML' });
        await showTaskDetail(ctx, taskId);
    }
    
    // --- EDIT NOTE FLOW ---
    else if (step === 'edit_note_title') {
        if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
        
        await db.collection('notes').updateOne(
            { noteId: ctx.session.editNoteId }, 
            { $set: { title: text, updatedAt: new Date() } }
        );
        ctx.session.step = null;
        ctx.session.editNoteId = null;
        await ctx.reply('✅ Title Updated');
        await showMainMenu(ctx);
    }
    else if (step === 'edit_note_content') {
        if (text.length === 0) return ctx.reply('❌ Content cannot be empty.');
        
        await db.collection('notes').updateOne(
            { noteId: ctx.session.editNoteId }, 
            { $set: { content: text, updatedAt: new Date() } }
        );
        ctx.session.step = null;
        ctx.session.editNoteId = null;
        await ctx.reply('✅ Content Updated');
        await showMainMenu(ctx);
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
    await ctx.reply(`🔢 <b>Daily Repeat Selected</b>\n\nHow many times should it repeat? (e.g., 10 for 10 days):`, { parse_mode: 'HTML' });
});

bot.action('repeat_weekly', async (ctx) => {
    ctx.session.task.repeat = 'weekly';
    ctx.session.step = 'task_repeat_count';
    await ctx.reply(`🔢 <b>Weekly Repeat Selected</b>\n\nHow many times should it repeat? (e.g., 5 for 5 weeks):`, { parse_mode: 'HTML' });
});

async function saveTask(ctx) {
    const task = ctx.session.task;
    // Ensure task status is pending
    task.status = 'pending';
    task.createdAt = new Date();
    task.nextOccurrence = task.startDate; // Initialize next occurrence
    
    await db.collection('tasks').insertOne(task);
    scheduleTask(task);
    
    ctx.session.step = null;
    const msg = `✅ <b>Task Saved Successfully!</b>\n\n` +
                `📌 ${task.title}\n` +
                `📅 ${formatDate(task.startDate)}\n` +
                `⏰ ${formatTime(task.startDate)} - ${formatTime(task.endDate)}\n` +
                `🔄 Repeat: ${task.repeat} (${task.repeatCount} times)\n\n` +
                `🔔 You will receive notifications starting 10 minutes before the task.`;
                
    await ctx.editMessageText(msg, { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Main Menu', 'main_menu')]]).reply_markup
    });
}

// --- VIEW TASKS LIST ---
bot.action(/^view_tasks_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const limit = 10;
    const skip = (page - 1) * limit;

    // Only show tasks that haven't started yet or are for today/future
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    
    const tasks = await db.collection('tasks')
        .find({ 
            userId: ctx.from.id, 
            status: 'pending',
            startDate: { $gt: now } // Only future tasks
        })
        .sort({ startDate: 1 })
        .skip(skip).limit(limit).toArray();

    const count = await db.collection('tasks').countDocuments({ 
        userId: ctx.from.id, 
        status: 'pending',
        startDate: { $gt: now }
    });
    const totalPages = Math.ceil(count / limit) || 1;

    let text = `📋 <b>Pending Tasks (Page ${page}/${totalPages})</b>\nSelect a task to view details:`;
    if (tasks.length === 0) text = "<i>No pending tasks found.</i>";

    const buttons = [];
    tasks.forEach(t => {
        buttons.push([Markup.button.callback(`📌 ${t.title} (${formatTime(t.startDate)})`, `task_det_${t.taskId}`)]);
    });

    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('⬅️ Prev', `view_tasks_${page - 1}`));
    if (page < totalPages) nav.push(Markup.button.callback('Next ➡️', `view_tasks_${page + 1}`));
    if (nav.length > 0) buttons.push(nav);
    buttons.push([Markup.button.callback('🔙 Main Menu', 'main_menu')]);

    await ctx.editMessageText(text, { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });
});

// --- TASK DETAILS ---
bot.action(/^task_det_(.+)$/, async (ctx) => {
    await showTaskDetail(ctx, ctx.match[1]);
});

async function showTaskDetail(ctx, taskId) {
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) {
        await ctx.editMessageText('❌ Task not found or completed.', { 
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'view_tasks_1')]]).reply_markup
        });
        return;
    }

    const text = `📌 <b>Task Details</b>\n\n` +
                 `🆔 ID: <code>${task.taskId}</code>\n` +
                 `🏷 Title: <b>${task.title}</b>\n` +
                 `📝 Description:\n<blockquote>${task.description || 'No description'}</blockquote>\n` +
                 `📅 Date: ${formatDate(task.startDate)}\n` +
                 `⏰ Time: ${formatTime(task.startDate)} - ${formatTime(task.endDate)}\n` +
                 `🔄 Repeat: ${task.repeat} (${task.repeatCount || 0} left)\n` +
                 (task.nextOccurrence ? `📅 Next Occurrence: ${formatDate(task.nextOccurrence)}\n` : '') +
                 `📊 Status: ${task.status}`;

    const buttons = [
        [Markup.button.callback('✅ Mark as Complete', `complete_${taskId}`)],
        [Markup.button.callback('✏️ Edit', `edit_menu_${taskId}`), Markup.button.callback('🗑️ Delete', `delete_${taskId}`)],
        [Markup.button.callback('🔙 Back List', 'view_tasks_1')]
    ];
    
    await ctx.editMessageText(text, { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });
}

// --- COMPLETE TASK ---
bot.action(/^complete_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return;
    }

    // 1. Create History Copy
    const historyItem = {
        ...task,
        _id: undefined,
        completedAt: new Date(),
        originalTaskId: task.taskId,
        status: 'completed'
    };
    await db.collection('history').insertOne(historyItem);
    
    // Stop Notification
    cancelTaskSchedule(taskId);

    // 2. Handle Repetition
    if (task.repeat !== 'none' && task.repeatCount > 0) {
        const nextStart = new Date(task.startDate);
        const nextEnd = new Date(task.endDate);

        const daysToAdd = task.repeat === 'weekly' ? 7 : 1;
        nextStart.setDate(nextStart.getDate() + daysToAdd);
        nextEnd.setDate(nextEnd.getDate() + daysToAdd);

        // Update the existing task with next occurrence
        await db.collection('tasks').updateOne({ taskId }, {
            $set: {
                startDate: nextStart,
                endDate: nextEnd,
                repeatCount: task.repeatCount - 1,
                nextOccurrence: nextStart,
                status: 'pending'
            }
        });
        
        const updatedTask = await db.collection('tasks').findOne({ taskId });
        scheduleTask(updatedTask);
        
        await ctx.answerCbQuery(`✅ Completed! Next occurrence: ${formatDate(nextStart)}`);
    } else {
        // Not repeating - delete from tasks
        await db.collection('tasks').deleteOne({ taskId });
        await ctx.answerCbQuery('✅ Task Finished & Moved to History!');
    }
    
    await showMainMenu(ctx);
});

// --- EDIT MENU ---
bot.action(/^edit_menu_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    await ctx.editMessageText(`✏️ <b>Edit Task</b>\nSelect what to change:`, { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🏷 Title', `edit_do_${taskId}_title`), Markup.button.callback('📝 Desc', `edit_do_${taskId}_desc`)],
            [Markup.button.callback('⏰ Start', `edit_do_${taskId}_start`), Markup.button.callback('🏁 End', `edit_do_${taskId}_end`)],
            [Markup.button.callback('🔄 Repeat Mode', `edit_rep_${taskId}`), Markup.button.callback('🔢 Repeat Count', `edit_do_${taskId}_repeat_count`)],
            [Markup.button.callback('🔙 Back', `task_det_${taskId}`)]
        ]).reply_markup
    });
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
    if (field === 'repeat_count') msg = 'Enter new Repeat Count number:';

    await ctx.reply(`✏️ ${msg}`, { 
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${ctx.match[1]}`)]]).reply_markup
    });
});

bot.action(/^edit_rep_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    await ctx.editMessageText(`🔄 <b>Change Repeat Mode</b>`, { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('❌ None', `set_rep_${taskId}_none`)],
            [Markup.button.callback('📅 Daily', `set_rep_${taskId}_daily`)],
            [Markup.button.callback('📅 Weekly', `set_rep_${taskId}_weekly`)],
            [Markup.button.callback('🔙 Back', `edit_menu_${taskId}`)]
        ]).reply_markup
    });
});

bot.action(/^set_rep_(.+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const mode = ctx.match[2];
    
    const updates = { repeat: mode };
    if (mode === 'none') {
        updates.repeatCount = 0;
    } else {
        // If changing to repeat mode, set a default count
        updates.repeatCount = 10;
    }
    
    await db.collection('tasks').updateOne({ taskId }, { $set: updates });
    await ctx.answerCbQuery(`✅ Updated to ${mode}`);
    await showTaskDetail(ctx, taskId);
});

// --- DELETE TASK ---
bot.action(/^delete_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    await db.collection('tasks').deleteOne({ taskId });
    cancelTaskSchedule(taskId);
    await ctx.answerCbQuery('✅ Task Deleted');
    await showMainMenu(ctx);
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

    let text = `📜 <b>History Dates (Page ${page}/${totalPages})</b>\nSelect a date to view completed tasks:`;
    if (dates.length === 0) text = "<i>No history yet.</i>";

    const buttons = [];
    dates.forEach(d => {
        buttons.push([Markup.button.callback(`📅 ${d._id} (${d.count} tasks)`, `hist_list_${d._id}_1`)]);
    });

    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('⬅️', `view_history_dates_${page - 1}`));
    if (page < totalPages) nav.push(Markup.button.callback('➡️', `view_history_dates_${page + 1}`));
    if (nav.length > 0) buttons.push(nav);
    buttons.push([Markup.button.callback('🔙 Main Menu', 'main_menu')]);

    await ctx.editMessageText(text, { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });
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

    let text = `📅 <b>Completed on ${dateStr} (Page ${page}/${totalPages})</b>`;
    
    const buttons = [];
    tasks.forEach(t => {
        buttons.push([Markup.button.callback(`✅ ${t.title} (${formatTime(t.completedAt)})`, `hist_det_${t._id}`)]);
    });

    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('⬅️', `hist_list_${dateStr}_${page - 1}`));
    if (page < totalPages) nav.push(Markup.button.callback('➡️', `hist_list_${dateStr}_${page + 1}`));
    if (nav.length > 0) buttons.push(nav);
    buttons.push([Markup.button.callback('🔙 Back to Dates', 'view_history_dates_1')]);

    await ctx.editMessageText(text, { 
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });
});

bot.action(/^hist_det_(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const task = await db.collection('history').findOne({ _id: new ObjectId(id) });

    if (!task) {
        await ctx.answerCbQuery('Not found');
        return;
    }

    const text = `📜 <b>History Detail</b>\n\n` +
                 `📌 ${task.title}\n` +
                 `📝 Description:\n<blockquote>${task.description || 'No description'}</blockquote>\n` +
                 `✅ Completed At: ${formatDate(task.completedAt)} ${formatTime(task.completedAt)}`;

    await ctx.editMessageText(text, { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', `view_history_dates_1`)]]).reply_markup
    });
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

    let text = `🗒️ <b>Your Notes (Page ${page}/${totalPages})</b>`;
    if (notes.length === 0) text = "<i>No notes found.</i>";

    const buttons = [];
    notes.forEach(n => {
        buttons.push([Markup.button.callback(`📄 ${n.title}`, `note_det_${n.noteId}`)]);
    });

    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('⬅️', `view_notes_${page - 1}`));
    if (page < totalPages) nav.push(Markup.button.callback('➡️', `view_notes_${page + 1}`));
    if (nav.length > 0) buttons.push(nav);
    buttons.push([Markup.button.callback('🔙 Main Menu', 'main_menu')]);

    await ctx.editMessageText(text, { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });
});

bot.action(/^note_det_(.+)$/, async (ctx) => {
    const note = await db.collection('notes').findOne({ noteId: ctx.match[1] });
    if (!note) {
        await ctx.answerCbQuery('Note not found');
        return;
    }

    const text = `📝 <b>Note Details</b>\n\n` +
                 `📌 <b>${note.title}</b>\n` +
                 `📅 ${formatDate(note.createdAt)}\n\n` +
                 `Content:\n<blockquote>${note.content}</blockquote>`;
    
    const buttons = [
        [Markup.button.callback('✏️ Edit', `edit_note_${note.noteId}`), Markup.button.callback('🗑️ Delete', `del_note_${note.noteId}`)],
        [Markup.button.callback('🔙 Back', 'view_notes_1')]
    ];

    await ctx.editMessageText(text, { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });
});

bot.action(/^del_note_(.+)$/, async (ctx) => {
    await db.collection('notes').deleteOne({ noteId: ctx.match[1] });
    await ctx.answerCbQuery('✅ Note Deleted');
    await showMainMenu(ctx);
});

bot.action(/^edit_note_(.+)$/, async (ctx) => {
    ctx.session.editNoteId = ctx.match[1];
    await ctx.editMessageText(`✏️ Select what to edit:`, { 
        reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('Title', 'edit_nt_title'), Markup.button.callback('Content', 'edit_nt_content')],
            [Markup.button.callback('🔙 Back', `note_det_${ctx.match[1]}`)]
        ]).reply_markup
    });
});

bot.action('edit_nt_title', async (ctx) => {
    ctx.session.step = 'edit_note_title';
    await ctx.reply('Enter new Title:', { 
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('Cancel', `note_det_${ctx.session.editNoteId}`)]]).reply_markup
    });
});

bot.action('edit_nt_content', async (ctx) => {
    ctx.session.step = 'edit_note_content';
    await ctx.reply('Enter new Content:', { 
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('Cancel', `note_det_${ctx.session.editNoteId}`)]]).reply_markup
    });
});

// ==========================================
// 📥 DOWNLOAD DATA MENU
// ==========================================

bot.action('download_menu', async (ctx) => {
    await ctx.editMessageText('📥 <b>Download Data</b>\n\nSelect what you want to download:', { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('📋 All Tasks (Active)', 'download_tasks')],
            [Markup.button.callback('📜 All History', 'download_history')],
            [Markup.button.callback('🗒️ All Notes', 'download_notes')],
            [Markup.button.callback('📦 Everything (All Data)', 'download_all')],
            [Markup.button.callback('🔙 Main Menu', 'main_menu')]
        ]).reply_markup
    });
});

bot.action('download_tasks', async (ctx) => {
    const userId = ctx.from.id;
    const tasks = await db.collection('tasks').find({ userId }).toArray();
    
    if (tasks.length === 0) {
        await ctx.answerCbQuery('❌ No tasks found');
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
        await ctx.answerCbQuery('❌ No history found');
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
        await ctx.answerCbQuery('❌ No notes found');
        return;
    }
    
    const notesBuff = Buffer.from(JSON.stringify(notes, null, 2));
    await ctx.replyWithDocument({ source: notesBuff, filename: 'notes.json' });
    await ctx.answerCbQuery('✅ Notes file sent');
});

bot.action('download_all', async (ctx) => {
    const userId = ctx.from.id;
    
    const tasks = await db.collection('tasks').find({ userId }).toArray();
    const history = await db.collection('history').find({ userId }).toArray();
    const notes = await db.collection('notes').find({ userId }).toArray();
    
    // Send 3 separate files
    if (tasks.length > 0) {
        const tasksBuff = Buffer.from(JSON.stringify(tasks, null, 2));
        await ctx.replyWithDocument({ source: tasksBuff, filename: 'active_tasks.json' });
    }
    
    if (history.length > 0) {
        const histBuff = Buffer.from(JSON.stringify(history, null, 2));
        await ctx.replyWithDocument({ source: histBuff, filename: 'history.json' });
    }
    
    if (notes.length > 0) {
        const notesBuff = Buffer.from(JSON.stringify(notes, null, 2));
        await ctx.replyWithDocument({ source: notesBuff, filename: 'notes.json' });
    }
    
    if (tasks.length === 0 && history.length === 0 && notes.length === 0) {
        await ctx.answerCbQuery('❌ No data found to download');
    } else {
        await ctx.answerCbQuery('✅ All data files sent');
    }
});

// ==========================================
// 🗑️ DELETE DATA MENU
// ==========================================

bot.action('delete_menu', async (ctx) => {
    await ctx.editMessageText('🗑️ <b>Delete Data</b>\n\n⚠️ <b>WARNING: This cannot be undone!</b>\nSelect what you want to delete:', { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('📋 Delete All Tasks', 'delete_tasks_confirm')],
            [Markup.button.callback('📜 Delete All History', 'delete_history_confirm')],
            [Markup.button.callback('🗒️ Delete All Notes', 'delete_notes_confirm')],
            [Markup.button.callback('🔥 Delete EVERYTHING', 'delete_all_confirm')],
            [Markup.button.callback('🔙 Main Menu', 'main_menu')]
        ]).reply_markup
    });
});

bot.action('delete_tasks_confirm', async (ctx) => {
    await ctx.editMessageText('⚠️ <b>Delete ALL Tasks?</b>\n\nThis will delete all your active tasks and stop their notifications.\nThis action cannot be undone!', { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, Delete Tasks', 'delete_tasks_final')],
            [Markup.button.callback('🔙 Cancel', 'delete_menu')]
        ]).reply_markup
    });
});

bot.action('delete_tasks_final', async (ctx) => {
    const userId = ctx.from.id;
    
    // Get all tasks to cancel schedules
    const tasks = await db.collection('tasks').find({ userId }).toArray();
    tasks.forEach(t => cancelTaskSchedule(t.taskId));
    
    // Delete from database
    const result = await db.collection('tasks').deleteMany({ userId });
    
    await ctx.answerCbQuery(`✅ Deleted ${result.deletedCount} tasks`);
    await showMainMenu(ctx);
});

bot.action('delete_history_confirm', async (ctx) => {
    await ctx.editMessageText('⚠️ <b>Delete ALL History?</b>\n\nThis will delete all your completed task history.\nThis action cannot be undone!', { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, Delete History', 'delete_history_final')],
            [Markup.button.callback('🔙 Cancel', 'delete_menu')]
        ]).reply_markup
    });
});

bot.action('delete_history_final', async (ctx) => {
    const userId = ctx.from.id;
    const result = await db.collection('history').deleteMany({ userId });
    await ctx.answerCbQuery(`✅ Deleted ${result.deletedCount} history items`);
    await showMainMenu(ctx);
});

bot.action('delete_notes_confirm', async (ctx) => {
    await ctx.editMessageText('⚠️ <b>Delete ALL Notes?</b>\n\nThis will delete all your saved notes.\nThis action cannot be undone!', { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, Delete Notes', 'delete_notes_final')],
            [Markup.button.callback('🔙 Cancel', 'delete_menu')]
        ]).reply_markup
    });
});

bot.action('delete_notes_final', async (ctx) => {
    const userId = ctx.from.id;
    const result = await db.collection('notes').deleteMany({ userId });
    await ctx.answerCbQuery(`✅ Deleted ${result.deletedCount} notes`);
    await showMainMenu(ctx);
});

bot.action('delete_all_confirm', async (ctx) => {
    await ctx.editMessageText('⚠️ <b>WARNING: DELETE ALL DATA?</b>\n\nThis will delete:\n• All active tasks\n• All completed history\n• All saved notes\n\nThis action cannot be undone!', { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🔥 YES, DELETE EVERYTHING', 'delete_all_final')],
            [Markup.button.callback('🔙 Cancel', 'delete_menu')]
        ]).reply_markup
    });
});

bot.action('delete_all_final', async (ctx) => {
    const userId = ctx.from.id;
    
    // First, download data before deleting
    const tasks = await db.collection('tasks').find({ userId }).toArray();
    const history = await db.collection('history').find({ userId }).toArray();
    const notes = await db.collection('notes').find({ userId }).toArray();
    
    // Send data files before deletion
    if (tasks.length > 0) {
        const tasksBuff = Buffer.from(JSON.stringify(tasks, null, 2));
        await ctx.replyWithDocument({ source: tasksBuff, filename: 'tasks_backup.json' });
    }
    
    if (history.length > 0) {
        const histBuff = Buffer.from(JSON.stringify(history, null, 2));
        await ctx.replyWithDocument({ source: histBuff, filename: 'history_backup.json' });
    }
    
    if (notes.length > 0) {
        const notesBuff = Buffer.from(JSON.stringify(notes, null, 2));
        await ctx.replyWithDocument({ source: notesBuff, filename: 'notes_backup.json' });
    }
    
    // Stop all schedulers
    tasks.forEach(t => cancelTaskSchedule(t.taskId));
    
    // Delete everything
    const tasksResult = await db.collection('tasks').deleteMany({ userId });
    const historyResult = await db.collection('history').deleteMany({ userId });
    const notesResult = await db.collection('notes').deleteMany({ userId });
    
    const totalDeleted = tasksResult.deletedCount + historyResult.deletedCount + notesResult.deletedCount;
    
    await ctx.answerCbQuery(`✅ Deleted ${totalDeleted} items total`);
    await showMainMenu(ctx);
});

bot.action('main_menu', async (ctx) => {
    ctx.session.step = null;
    ctx.session.editNoteId = null;
    ctx.session.editTaskId = null;
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
        
        // Send startup message
        console.log(`✅ Scheduler is active. Currently tracking ${activeSchedules.size} tasks.`);
    }
}

// Graceful Stop
process.once('SIGINT', () => {
    console.log('🛑 Stopping bot gracefully...');
    
    // Cancel all scheduled jobs
    for (const [taskId, schedule] of activeSchedules) {
        if (schedule.startJob) schedule.startJob.cancel();
        if (schedule.interval) clearInterval(schedule.interval);
    }
    
    bot.stop('SIGINT');
    if (client) client.close();
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('🛑 Stopping bot gracefully...');
    
    // Cancel all scheduled jobs
    for (const [taskId, schedule] of activeSchedules) {
        if (schedule.startJob) schedule.startJob.cancel();
        if (schedule.interval) clearInterval(schedule.interval);
    }
    
    bot.stop('SIGTERM');
    if (client) client.close();
    process.exit(0);
});

start();
