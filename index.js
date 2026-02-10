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

// Get current date in IST (YYYY-MM-DD)
function getCurrentISTDate() {
    const now = new Date();
    return now.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).split('/').reverse().join('-');
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

// Check if two dates are the same day (in IST)
function isSameDay(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    d1.setHours(0, 0, 0, 0);
    d2.setHours(0, 0, 0, 0);
    
    return d1.getTime() === d2.getTime();
}

// Get today's date at 00:00:00 in IST
function getTodayIST() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
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
        const today = getTodayIST();
        
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
// 📱 MAIN MENU & START
// ==========================================

bot.command('start', async (ctx) => {
    ctx.session = {}; 
    const text = `
┌──────────────────────────┐
│     📋 TASK MANAGER      │
│         🤖 BOT           │
├──────────────────────────┤
│ ⏰ Current Time: ${getCurrentIST()}  │
│ 📅 Today: ${formatDate(new Date())} │
└──────────────────────────┘

🌟 <b>Welcome to your Personal Task Manager!</b>

Manage your tasks, set reminders, take notes, and stay organized. Get notified 10 minutes before each task starts!

<b>Quick Actions:</b>`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('📋 View Today\'s Tasks', 'view_today_tasks'),
            Markup.button.callback('📅 View Next Tasks', 'view_next_tasks')
        ],
        [
            Markup.button.callback('➕ Add Task', 'add_task'),
            Markup.button.callback('📝 Add Note', 'add_note')
        ],
        [
            Markup.button.callback('📜 View History', 'view_history_dates_1'),
            Markup.button.callback('🗒️ View Notes', 'view_notes_1')
        ],
        [
            Markup.button.callback('📥 Download Data', 'download_menu'),
            Markup.button.callback('🗑️ Delete Data', 'delete_menu')
        ]
    ]);

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
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
            Markup.button.callback('📋 View Today\'s Tasks', 'view_today_tasks'),
            Markup.button.callback('📅 View Next Tasks', 'view_next_tasks')
        ],
        [
            Markup.button.callback('➕ Add Task', 'add_task'),
            Markup.button.callback('📝 Add Note', 'add_note')
        ],
        [
            Markup.button.callback('📜 View History', 'view_history_dates_1'),
            Markup.button.callback('🗒️ View Notes', 'view_notes_1')
        ],
        [
            Markup.button.callback('📥 Download Data', 'download_menu'),
            Markup.button.callback('🗑️ Delete Data', 'delete_menu')
        ]
    ]);

    await safeEdit(ctx, text, keyboard);
}

// ==========================================
// 📅 TASK VIEWS
// ==========================================

// View Today's Tasks (Pending only, nextOccurrence is today)
bot.action('view_today_tasks', async (ctx) => {
    const userId = ctx.from.id;
    const today = getTodayIST();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
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
📋 <b>TODAY'S TASKS</b>

━━━━━━━━━━━━━━━━━━━━
📅 Date: ${formatDate(today)}
📊 Total: ${tasks.length} task${tasks.length !== 1 ? 's' : ''}
━━━━━━━━━━━━━━━━━━━━

Select a task to view details:`;

    if (tasks.length === 0) {
        text = `
📋 <b>TODAY'S TASKS</b>

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
                `⏰ ${formatTime(t.nextOccurrence)} - ${t.title}`, 
                `task_det_${t.taskId}`
            )
        ]);
    });

    buttons.push([
        Markup.button.callback('➕ Add Task', 'add_task'),
        Markup.button.callback('📅 View Next Tasks', 'view_next_tasks')
    ]);
    buttons.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

// View Next Tasks (All pending tasks including completed but repeating ones)
bot.action('view_next_tasks', async (ctx) => {
    const userId = ctx.from.id;
    const today = getTodayIST();
    
    const tasks = await db.collection('tasks')
        .find({ 
            userId: userId,
            status: 'pending',
            nextOccurrence: { $gte: today }
        })
        .sort({ nextOccurrence: 1 })
        .toArray();

    let text = `
📅 <b>UPCOMING TASKS</b>

━━━━━━━━━━━━━━━━━━━━
📊 Total: ${tasks.length} task${tasks.length !== 1 ? 's' : ''}
📈 Includes completed tasks that repeat
━━━━━━━━━━━━━━━━━━━━

Select a task to view details:`;

    if (tasks.length === 0) {
        text = `
📅 <b>UPCOMING TASKS</b>

━━━━━━━━━━━━━━━━━━━━
📭 <i>No upcoming tasks found!</i>
<i>Use "Add Task" to create new tasks.</i>
━━━━━━━━━━━━━━━━━━━━`;
    }

    const buttons = [];
    tasks.forEach(t => {
        const isToday = isSameDay(t.nextOccurrence, today);
        const datePrefix = isToday ? '⏰ TODAY' : `📅 ${formatDate(t.nextOccurrence)}`;
        buttons.push([
            Markup.button.callback(
                `${datePrefix} - ${t.title}`, 
                `task_det_${t.taskId}`
            )
        ]);
    });

    buttons.push([
        Markup.button.callback('📋 View Today\'s Tasks', 'view_today_tasks'),
        Markup.button.callback('➕ Add Task', 'add_task')
    ]);
    buttons.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

// ==========================================
// 🗑️ DELETE DATA MENU (FIXED - SIMPLIFIED APPROACH)
// ==========================================

// DELETE MENU - Shows options
bot.action('delete_menu', async (ctx) => {
    const text = `🗑️ <b>DELETE DATA</b>\n\n━━━━━━━━━━━━━━━━━━━━\n⚠️ <b>WARNING: This action cannot be undone!</b>\n\nSelect what you want to delete:`;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📋 Delete All Tasks', 'delete_tasks_confirm')],
        [Markup.button.callback('📜 Delete All History', 'delete_history_confirm')],
        [Markup.button.callback('🗒️ Delete All Notes', 'delete_notes_confirm')],
        [Markup.button.callback('🔥 Delete EVERYTHING', 'delete_all_confirm')],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

// DELETE TASKS CONFIRMATION
bot.action('delete_tasks_confirm', async (ctx) => {
    const text = `⚠️ <b>CONFIRM DELETION</b>\n\n━━━━━━━━━━━━━━━━━━━━\nAre you sure you want to delete ALL tasks?\n\n📋 This will delete all your active tasks\n🔔 All notifications will be cancelled\n❌ This action cannot be undone!\n\n━━━━━━━━━━━━━━━━━━━━`;
    
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
        const successText = `✅ <b>DELETION COMPLETE</b>\n\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${result.deletedCount} tasks\n📁 Backup file has been sent\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
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
    const text = `⚠️ <b>CONFIRM DELETION</b>\n\n━━━━━━━━━━━━━━━━━━━━\nAre you sure you want to delete ALL history?\n\n📜 This will delete all your completed task history\n📊 All statistics will be lost\n❌ This action cannot be undone!\n\n━━━━━━━━━━━━━━━━━━━━`;
    
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
        const successText = `✅ <b>DELETION COMPLETE</b>\n\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${result.deletedCount} history items\n📁 Backup file has been sent\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
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
    const text = `⚠️ <b>CONFIRM DELETION</b>\n\n━━━━━━━━━━━━━━━━━━━━\nAre you sure you want to delete ALL notes?\n\n🗒️ This will delete all your saved notes\n📝 All your personal notes will be lost\n❌ This action cannot be undone!\n\n━━━━━━━━━━━━━━━━━━━━`;
    
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
        const successText = `✅ <b>DELETION COMPLETE</b>\n\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${result.deletedCount} notes\n📁 Backup file has been sent\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
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
    const text = `⚠️ <b>FINAL WARNING</b>\n\n━━━━━━━━━━━━━━━━━━━━\nAre you sure you want to delete ALL data?\n\n📋 All active tasks\n📜 All completed history\n🗒️ All saved notes\n\n🔔 All notifications will be cancelled\n📊 All statistics will be lost\n❌ This action cannot be undone!\n\n━━━━━━━━━━━━━━━━━━━━`;
    
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
        const successText = `✅ <b>COMPLETE DELETION</b>\n\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${totalDeleted} items total\n📁 3 backup files have been sent\n🔔 All notifications cancelled\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
    } catch (error) {
        console.error('Error deleting all data:', error);
        await ctx.answerCbQuery('❌ Error deleting data');
        await showMainMenu(ctx);
    }
});

// ==========================================
// 🔄 REST OF THE BOT CODE (SIMPLIFIED)
// ==========================================

// Main menu action
bot.action('main_menu', async (ctx) => {
    ctx.session.step = null;
    await showMainMenu(ctx);
});

// Add task action
bot.action('add_task', async (ctx) => {
    ctx.session.step = 'task_title';
    ctx.session.task = { 
        taskId: generateId(10), 
        userId: ctx.from.id,
        status: 'pending',
        createdAt: new Date()
    };
    
    const text = `🎯 <b>CREATE NEW TASK</b>\n\n━━━━━━━━━━━━━━━━━━━━\nEnter the <b>Title</b> of your task:\n\n📝 <i>Example: "Morning Yoga Session"</i>`;
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'main_menu')]]);
    
    await safeEdit(ctx, text, keyboard);
});

// Add note action
bot.action('add_note', async (ctx) => {
    ctx.session.step = 'note_title';
    ctx.session.note = { 
        noteId: generateId(8), 
        userId: ctx.from.id,
        createdAt: new Date()
    };
    
    const text = `📝 <b>CREATE NEW NOTE</b>\n\n━━━━━━━━━━━━━━━━━━━━\nEnter the <b>Title</b> for your note:\n\n📝 <i>Example: "Meeting Points"</i>`;
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'main_menu')]]);
    
    await safeEdit(ctx, text, keyboard);
});

// Download menu
bot.action('download_menu', async (ctx) => {
    const text = `📥 <b>DOWNLOAD YOUR DATA</b>\n\n━━━━━━━━━━━━━━━━━━━━\nSelect what you want to download:\n\n📁 <i>Files will be sent as JSON documents</i>`;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📋 Active Tasks', 'download_tasks')],
        [Markup.button.callback('📜 History', 'download_history')],
        [Markup.button.callback('🗒️ Notes', 'download_notes')],
        [Markup.button.callback('📦 All Data (3 files)', 'download_all')],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

// View history
bot.action(/^view_history_dates_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    
    const dates = await db.collection('history').aggregate([
        { $match: { userId } },
        { $group: { 
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt", timezone: "Asia/Kolkata" } },
            count: { $sum: 1 }
        }},
        { $sort: { _id: -1 } },
        { $skip: (page - 1) * 5 },
        { $limit: 5 }
    ]).toArray();

    const text = `📜 <b>COMPLETED TASKS HISTORY</b>\n\n━━━━━━━━━━━━━━━━━━━━\nSelect a date to view:`;
    
    const buttons = dates.map(d => [
        Markup.button.callback(`📅 ${formatDate(new Date(d._id))} (${d.count})`, `hist_list_${d._id}_1`)
    ]);
    
    buttons.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

// View notes
bot.action(/^view_notes_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    
    const notes = await db.collection('notes').find({ userId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * 5)
        .limit(5)
        .toArray();

    const text = `🗒️ <b>YOUR NOTES</b>\n\n━━━━━━━━━━━━━━━━━━━━\nSelect a note to view:`;
    
    const buttons = notes.map(n => [
        Markup.button.callback(`📄 ${n.title}`, `note_det_${n.noteId}`)
    ]);
    
    buttons.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

// Download actions (simplified)
bot.action('download_tasks', async (ctx) => {
    const userId = ctx.from.id;
    const tasks = await db.collection('tasks').find({ userId }).toArray();
    const data = tasks.length > 0 ? tasks : [];
    const buffer = Buffer.from(JSON.stringify(data, null, 2));
    
    await ctx.replyWithDocument({ source: buffer, filename: 'tasks.json' });
    await ctx.answerCbQuery(`✅ Sent ${tasks.length} tasks`);
});

bot.action('download_history', async (ctx) => {
    const userId = ctx.from.id;
    const history = await db.collection('history').find({ userId }).toArray();
    const data = history.length > 0 ? history : [];
    const buffer = Buffer.from(JSON.stringify(data, null, 2));
    
    await ctx.replyWithDocument({ source: buffer, filename: 'history.json' });
    await ctx.answerCbQuery(`✅ Sent ${history.length} history items`);
});

bot.action('download_notes', async (ctx) => {
    const userId = ctx.from.id;
    const notes = await db.collection('notes').find({ userId }).toArray();
    const data = notes.length > 0 ? notes : [];
    const buffer = Buffer.from(JSON.stringify(data, null, 2));
    
    await ctx.replyWithDocument({ source: buffer, filename: 'notes.json' });
    await ctx.answerCbQuery(`✅ Sent ${notes.length} notes`);
});

bot.action('download_all', async (ctx) => {
    const userId = ctx.from.id;
    
    const tasks = await db.collection('tasks').find({ userId }).toArray();
    const history = await db.collection('history').find({ userId }).toArray();
    const notes = await db.collection('notes').find({ userId }).toArray();
    
    // Send all three files
    await ctx.replyWithDocument({ 
        source: Buffer.from(JSON.stringify(tasks.length > 0 ? tasks : [], null, 2)), 
        filename: 'tasks.json' 
    });
    
    await ctx.replyWithDocument({ 
        source: Buffer.from(JSON.stringify(history.length > 0 ? history : [], null, 2)), 
        filename: 'history.json' 
    });
    
    await ctx.replyWithDocument({ 
        source: Buffer.from(JSON.stringify(notes.length > 0 ? notes : [], null, 2)), 
        filename: 'notes.json' 
    });
    
    const total = tasks.length + history.length + notes.length;
    await ctx.answerCbQuery(`✅ Sent ${total} items across 3 files`);
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
