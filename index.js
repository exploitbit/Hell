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
// For auto-complete job at 23:59
let autoCompleteJob = null;

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

// Get IST date for a specific date (for history grouping)
function getISTDateForHistory(date) {
    const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
    istDate.setHours(0, 0, 0, 0);
    return istDate;
}

// Get IST date from any date (for completedAt timestamp)
function getCurrentISTDateTime() {
    const now = new Date();
    // Convert to IST (UTC+5:30)
    return new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
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

// Calculate subtask completion percentage
function calculateSubtaskProgress(subtasks) {
    if (!subtasks || subtasks.length === 0) return 0;
    const completed = subtasks.filter(s => s.completed).length;
    return Math.round((completed / subtasks.length) * 100);
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
        await db.collection('tasks').createIndex({ userId: 1, orderIndex: 1 });
        await db.collection('history').createIndex({ userId: 1, completedAt: -1 });
        await db.collection('history').createIndex({ originalTaskId: 1 });
        await db.collection('history').createIndex({ userId: 1, completedDate: -1 });
        await db.collection('notes').createIndex({ userId: 1 });
        await db.collection('notes').createIndex({ noteId: 1 }, { unique: true });
        await db.collection('notes').createIndex({ userId: 1, orderIndex: 1 });
        
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
                                `🚀 <b>𝙏𝘼𝙎𝙆 𝙎𝙏𝘼𝙍𝙏𝙀𝘿 𝙉𝙊𝙒!</b>\n` +
                                `📌 <b>Title: ${task.title}</b>\n\n` +
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
                        `🔔 <b>𝗥𝗘𝗠𝗜𝗡𝗗𝗘𝗥 (${count + 1}/${maxNotifications})</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
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
// ⏰ AUTO-COMPLETE PENDING TASKS AT 23:59 IST
// ==========================================

async function autoCompletePendingTasks() {
    console.log(`⏰ Running auto-complete for pending tasks at 23:59 IST...`);
    
    try {
        const today = getTodayIST();
        const tomorrow = getTomorrowIST();
        
        // Find all pending tasks scheduled for today
        const pendingTasks = await db.collection('tasks').find({
            status: 'pending',
            nextOccurrence: {
                $gte: today,
                $lt: tomorrow
            }
        }).toArray();
        
        console.log(`📋 Found ${pendingTasks.length} pending tasks to auto-complete`);
        
        for (const task of pendingTasks) {
            await autoCompleteTask(task);
        }
        
        console.log(`✅ Auto-completed ${pendingTasks.length} tasks`);
    } catch (error) {
        console.error('❌ Error in auto-complete:', error);
    }
}

async function autoCompleteTask(task) {
    try {
        const taskId = task.taskId;
        
        // Get current IST date and time for completedAt
        const completedAtIST = getCurrentISTDateTime();
        const completedDateIST = getISTDateForHistory(completedAtIST);
        
        // Create history entry
        const historyItem = {
            ...task,
            _id: undefined,
            completedAt: completedAtIST,
            completedDate: completedDateIST,
            originalTaskId: task.taskId,
            status: 'completed',
            completedFromDate: task.nextOccurrence,
            autoCompleted: true // Mark as auto-completed
        };
        
        await db.collection('history').insertOne(historyItem);
        
        // Stop notifications
        cancelTaskSchedule(taskId);
        
        // Handle repetition
        if (task.repeat !== 'none' && task.repeatCount > 0) {
            const nextOccurrence = new Date(task.nextOccurrence);
            const daysToAdd = task.repeat === 'weekly' ? 7 : 1;
            nextOccurrence.setDate(nextOccurrence.getDate() + daysToAdd);
            
            await db.collection('tasks').updateOne({ taskId }, {
                $set: {
                    nextOccurrence: nextOccurrence,
                    repeatCount: task.repeatCount - 1,
                    startDate: nextOccurrence,
                    endDate: new Date(nextOccurrence.getTime() + 
                        (task.endDate.getTime() - task.startDate.getTime()))
                }
            });
            
            const updatedTask = await db.collection('tasks').findOne({ taskId });
            if (updatedTask.nextOccurrence > new Date()) {
                scheduleTask(updatedTask);
            }
        } else {
            // Not repeating -> delete from active tasks
            await db.collection('tasks').deleteOne({ taskId });
        }
        
        // Notify user
        try {
            await bot.telegram.sendMessage(task.userId,
                `⏰ <b>𝗔𝗨𝗧𝗢-𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗧𝗔𝗦𝗞</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 <b>${task.title}</b>\n` +
                `✅ Automatically completed at 23:59\n` +
                `📅 ${formatDate(completedAtIST)}\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {
            console.error('Error sending auto-complete notification:', e);
        }
        
    } catch (error) {
        console.error(`Error auto-completing task ${task.taskId}:`, error);
    }
}

function scheduleAutoComplete() {
    // Cancel existing job if any
    if (autoCompleteJob) {
        autoCompleteJob.cancel();
    }
    
    // Schedule at 23:59 IST daily
    // Convert to UTC: 23:59 IST = 18:29 UTC
    autoCompleteJob = schedule.scheduleJob('29 18 * * *', async () => {
        await autoCompletePendingTasks();
    });
    
    console.log('✅ Auto-complete scheduler started (23:59 IST daily)');
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
        
        // Get pending tasks for today (sorted by orderIndex, then nextOccurrence)
        const pendingTasks = await db.collection('tasks').find({
            userId: userId,
            status: 'pending',
            nextOccurrence: {
                $gte: todayIST,
                $lt: tomorrowIST
            }
        }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray();
        
        let summaryText = `
🕰️ <b>𝗛𝗔𝗟𝗙 𝗛𝗢𝗨𝗥𝗟𝗬 𝗦𝗨𝗠𝗠𝗔𝗥𝗬</b>
⏰ ${getCurrentIST()} ‧ 📅 ${formatDate(new Date())}
━━━━━━━━━━━━━━━━━━━━
✅ <b>𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗧𝗢𝗗𝗔𝗬:</b> (${completedTasks.length} task${completedTasks.length !== 1 ? 's' : ''})`;
        
        if (completedTasks.length > 0) {
            completedTasks.forEach((task, index) => {
                summaryText += `\n${index + 1}‧ ${task.title} ‧ ${formatTime(task.completedAt)}`;
            });
        } else {
            summaryText += `\n📭 No tasks completed yet.`;
        }
        
        summaryText += `\n\n⏳ <b>𝗣𝗘𝗡𝗗𝗜𝗡𝗚 𝗧𝗢𝗗𝗔𝗬:</b> (${pendingTasks.length} task${pendingTasks.length !== 1 ? 's' : ''})`;
        
        if (pendingTasks.length > 0) {
            pendingTasks.forEach((task, index) => {
                summaryText += `\n${index + 1}‧ ${task.title} ‧ ${formatTime(task.nextOccurrence)}`;
            });
        } else {
            summaryText += `\n📭 No pending tasks for today`;
        }
        
        summaryText += `\n━━━━━━━━━━━━━━━━━━━━\n⏰ Next update in 30 minutes`;
        
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
// 📱 MAIN MENU & START (WITH REORDER BUTTONS)
// ==========================================

bot.command('start', async (ctx) => {
    ctx.session = {}; 
    const text = `
┌─━━━━━━━━━━━━━━━─┐
│    ✧ 𝗧𝗔𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 ✧    │ 
└─━━━━━━━━━━━━━━━─┘
⏰ Current Time: ${getCurrentIST()} 
📅 Today: ${formatDate(new Date())}

🌟 <b>Welcome to Task Manager!</b>`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('📋 Today\'s Tasks', 'view_today_tasks_1')
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
            Markup.button.callback('🔄 Reorder Tasks', 'reorder_tasks_menu'),
            Markup.button.callback('🔄 Reorder Notes', 'reorder_notes_menu')
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
┌─━━━━━━━━━━━━━━━─┐
│    ✧ 𝗧𝗔𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 ✧    │ 
└─━━━━━━━━━━━━━━━─┘
⏰ Current Time: ${getCurrentIST()} 
📅 Today: ${formatDate(new Date())}

🌟 <b>Select an option:</b>`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('📋 Today\'s Tasks', 'view_today_tasks_1')
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
            Markup.button.callback('🔄 Reorder Tasks', 'reorder_tasks_menu'),
            Markup.button.callback('🔄 Reorder Notes', 'reorder_notes_menu')
        ],
        [
            Markup.button.callback('📥 Download', 'download_menu'),
            Markup.button.callback('🗑️ Delete', 'delete_menu')
        ]
    ]);

    await safeEdit(ctx, text, keyboard);
}

// ==========================================
// 📅 TASK VIEWS - WITH PAGINATION (10 PER PAGE)
// ==========================================

// View Today's Tasks with Pagination
bot.action(/^view_today_tasks_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    const today = getTodayIST();
    const tomorrow = getTomorrowIST();
    
    // Items per page
    const perPage = 10;
    const skip = (page - 1) * perPage;
    
    // Get total count
    const totalTasks = await db.collection('tasks').countDocuments({ 
        userId: userId,
        status: 'pending',
        nextOccurrence: { 
            $gte: today,
            $lt: tomorrow
        }
    });
    
    const totalPages = Math.ceil(totalTasks / perPage);
    
    // Get tasks sorted by orderIndex (priority), then by time
    const tasks = await db.collection('tasks')
        .find({ 
            userId: userId,
            status: 'pending',
            nextOccurrence: { 
                $gte: today,
                $lt: tomorrow
            }
        })
        .sort({ orderIndex: 1, nextOccurrence: 1 })
        .skip(skip)
        .limit(perPage)
        .toArray();

    let text = `
📋 <b>𝗧𝗢𝗗𝗔𝗬'𝗦 𝗧𝗔𝗦𝗞𝗦</b>

━━━━━━━━━━━━━━━━━━━━
📅 Date: ${formatDate(today)}
📊 Total: ${totalTasks} task${totalTasks !== 1 ? 's' : ''}
📄 Page: ${page}/${totalPages}
━━━━━━━━━━━━━━━━━━━━

Select a task to view details:`;

    if (tasks.length === 0) {
        text = `
📋 <b>𝗧𝗢𝗗𝗔𝗬'𝗦 𝗧𝗔𝗦𝗞𝗦</b>

━━━━━━━━━━━━━━━━━━━━
📅 Date: ${formatDate(today)}
📭 <i>No tasks scheduled for today!</i>
━━━━━━━━━━━━━━━━━━━━`;
    }

    const buttons = [];
    
    // Add task buttons (10 per page)
    tasks.forEach((t, index) => {
        const taskNum = skip + index + 1;
        let taskTitle = t.title;
        
        // Add progress indicator if task has subtasks
        if (t.subtasks && t.subtasks.length > 0) {
            const progress = calculateSubtaskProgress(t.subtasks);
            taskTitle += ` [${progress}%]`;
        }
        
        buttons.push([
            Markup.button.callback(
                `${taskNum}. ${taskTitle}`, 
                `task_det_${t.taskId}`
            )
        ]);
    });

    // Add pagination buttons if needed
    if (totalPages > 1) {
        const paginationRow = [];
        
        if (page > 1) {
            paginationRow.push(Markup.button.callback('◀️ Back', `view_today_tasks_${page - 1}`));
        }
        
        paginationRow.push(Markup.button.callback(`📄 ${page}/${totalPages}`, 'no_action'));
        
        if (page < totalPages) {
            paginationRow.push(Markup.button.callback('Next ▶️', `view_today_tasks_${page + 1}`));
        }
        
        buttons.push(paginationRow);
    }

    buttons.push([
        Markup.button.callback('➕ Add Task', 'add_task'),
        Markup.button.callback('🔙 Back', 'main_menu')
    ]);

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
        createdAt: new Date(),
        subtasks: [] // Initialize empty subtasks array
    };
    
    const text = `🎯 <b>𝗖𝗥𝗘𝗔𝗧𝗘 𝗡𝗘𝗪 𝗧𝗔𝗦𝗞</b>\n━━━━━━━━━━━━━━━━━━━━\nEnter the <b>Title</b> of your task:`;
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
    
    const text = `📝 <b>𝗖𝗥𝗘𝗔𝗧𝗘 𝗡𝗘𝗪 𝗡𝗢𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\nEnter the <b>Title</b> for your note:`;
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
            `📝 <i>Describe your task (Max 100 words):</i>`,
            { parse_mode: 'HTML' }
        );
    }
    else if (step === 'task_desc') {
        if (text.split(/\s+/).length > 100) return ctx.reply('❌ Too long! Keep it under 100 words.');
        ctx.session.task.description = text;
        ctx.session.step = 'task_date';
        await ctx.reply(
            `📅 <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗗𝗔𝗧𝗘</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📆 Today: ${formatDate(new Date())}\n` +
            `📝 <i>Enter the date (DD-MM-YYYY):</i>`,
            { parse_mode: 'HTML' }
        );
    }
    else if (step === 'task_date') {
        // Validate date format DD-MM-YYYY
        if (!/^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-\d{4}$/.test(text)) {
            return ctx.reply('❌ Invalid date format. Use DD-MM-YYYY');
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
            `⏰ <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗦𝗧𝗔𝗥𝗧 𝗧𝗜𝗠𝗘</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🕒 Current Time: ${getCurrentIST()}\n` +
            `📝 <i>Enter start time in HH:MM</i>`,
            { parse_mode: 'HTML' }
        );
    }
    else if (step === 'task_start') {
        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
            return ctx.reply('❌ Invalid format. Use HH:MM (24-hour).');
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
            `🏁 <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗘𝗡𝗗 𝗧𝗜𝗠𝗘</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `⏰ Start Time: ${text}\n` +
            `📝 <i>End time must be after start time and before 23:59</i>` +
            `📝 Enter end time in 24-hour format (HH:MM):`,
            { parse_mode: 'HTML' }
        );
    }
    else if (step === 'task_end') {
        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
            return ctx.reply('❌ Invalid format. Use HH:MM (24-hour).');
        }
        
        const [eh, em] = text.split(':').map(Number);
        
        // Check if end time is valid (before 23:59)
        if (eh > 23 || (eh === 23 && em > 59)) {
            return ctx.reply('❌ End time must be before 23:59');
        }
        
        const [sh, sm] = ctx.session.task.startTimeStr.split(':').map(Number);
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
            `🔄 <b>𝗥𝗘𝗣𝗘𝗔𝗧 𝗢𝗣𝗧𝗜𝗢𝗡𝗦</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `How should this task repeat?\n\n` +
            `📅 Task Date: ${formatDate(startDate)} (${dayName})\n` +
            `⏰ Time: ${ctx.session.task.startTimeStr} - ${text}\n\n`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('❌ No Repeat', 'repeat_none')],
                    [Markup.button.callback('📅 Daily', 'repeat_daily')],
                    [Markup.button.callback(`📅 Weekly on ${dayName}`, 'repeat_weekly')],
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
            `📝 <b>𝗘𝗡𝗧𝗘𝗥 𝗡𝗢𝗧𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📝 <i>Enter note content (Max 400 words)</i>`,
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
            // Get current highest orderIndex for notes
            const highestNote = await db.collection('notes').findOne(
                { userId: ctx.from.id },
                { sort: { orderIndex: -1 } }
            );
            const nextOrderIndex = highestNote ? highestNote.orderIndex + 1 : 0;
            
            ctx.session.note.orderIndex = nextOrderIndex;
            
            // Save note data to variables before clearing session
            const noteTitle = ctx.session.note.title;
            const noteContent = ctx.session.note.content;
            
            await db.collection('notes').insertOne(ctx.session.note);
            
            // Clear session
            ctx.session.step = null;
            delete ctx.session.note;
            
            await ctx.reply(
                `✅ <b>𝗡𝗢𝗧𝗘 𝗦𝗔𝗩𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬!</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 <b>${noteTitle}</b>\n` +
                `${formatBlockquote(noteContent)}\n` +
                `📅 Saved on: ${formatDateTime(new Date())}`,
                { parse_mode: 'HTML' }
            );
            
            // ADDED: Return to main menu after success
            await showMainMenu(ctx);
            
        } catch (error) {
            console.error('Error saving note:', error);
            await ctx.reply('❌ Failed to save note. Please try again.');
        }
    }

    // --- SUBTASK ADDITION FLOW ---
    else if (step === 'add_subtasks') {
        const taskId = ctx.session.addSubtasksTaskId;
        
        // Get current task
        const task = await db.collection('tasks').findOne({ taskId });
        if (!task) {
            ctx.session.step = null;
            delete ctx.session.addSubtasksTaskId;
            return ctx.reply('❌ Task not found.');
        }
        
        const currentSubtasks = task.subtasks || [];
        const availableSlots = 10 - currentSubtasks.length;
        
        if (availableSlots <= 0) {
            ctx.session.step = null;
            delete ctx.session.addSubtasksTaskId;
            return ctx.reply('❌ Maximum subtasks limit (10) reached for this task.');
        }
        
        // Split input by new lines and filter empty lines
        const lines = text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        
        if (lines.length === 0) {
            return ctx.reply('❌ Please enter at least one subtask title.');
        }
        
        if (lines.length > availableSlots) {
            return ctx.reply(`❌ You can only add ${availableSlots} more subtask${availableSlots !== 1 ? 's' : ''}. Please enter ${availableSlots} or fewer.`);
        }
        
        // Create new subtasks
        const newSubtasks = lines.map(title => ({
            id: generateId(8),
            title: title,
            completed: false,
            createdAt: new Date()
        }));
        
        // Update task with new subtasks
        await db.collection('tasks').updateOne(
            { taskId },
            { 
                $push: { 
                    subtasks: { 
                        $each: newSubtasks 
                    } 
                } 
            }
        );
        
        // Clear session
        ctx.session.step = null;
        delete ctx.session.addSubtasksTaskId;
        
        await ctx.reply(
            `✅ <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞𝗦 𝗔𝗗𝗗𝗘𝗗</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📌 <b>${task.title}</b>\n` +
            `➕ Added ${newSubtasks.length} new subtask${newSubtasks.length !== 1 ? 's' : ''}\n` +
            `📊 Now has ${currentSubtasks.length + newSubtasks.length}/10 subtasks\n` +
            `━━━━━━━━━━━━━━━━━━━━`,
            { parse_mode: 'HTML' }
        );
        
        // Return to task detail
        await showTaskDetail(ctx, taskId);
    }

    // --- EDIT SUBTASK FLOW ---
    else if (step === 'edit_subtask_title') {
        const { taskId, subtaskId } = ctx.session.editSubtask;
        
        if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
        
        try {
            // Update subtask title
            await db.collection('tasks').updateOne(
                { taskId, "subtasks.id": subtaskId },
                { $set: { "subtasks.$.title": text } }
            );
            
            // Clear session
            ctx.session.step = null;
            delete ctx.session.editSubtask;
            
            await ctx.reply(`✅ <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞 𝗨𝗣𝗗𝗔𝗧𝗘𝗗!</b>`, { parse_mode: 'HTML' });
            await showTaskDetail(ctx, taskId);
        } catch (error) {
            console.error('Error editing subtask:', error);
            await ctx.reply('❌ Failed to update subtask.');
        }
    }

    // --- EDIT TASK FLOW ---
    else if (step === 'edit_task_title') {
        const taskId = ctx.session.editTaskId;
        if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
        
        try {
            // 1. Update the task in the tasks collection
            await db.collection('tasks').updateOne(
                { taskId: taskId }, 
                { $set: { title: text } }
            );
            
            // 2. Update ALL history entries with the same originalTaskId
            const result = await db.collection('history').updateMany(
                { originalTaskId: taskId }, 
                { $set: { title: text } }
            );
            
            console.log(`Updated ${result.modifiedCount} history entries for task ${taskId}`);
            
            ctx.session.step = null;
            delete ctx.session.editTaskId;
            await ctx.reply(`✅ <b>TITLE UPDATED!</b>\n\nAlso updated ${result.modifiedCount} history entry${result.modifiedCount !== 1 ? 's' : ''}`, { parse_mode: 'HTML' });
            await showTaskDetail(ctx, taskId);
        } catch (error) {
            console.error('Error updating title:', error);
            await ctx.reply('❌ Failed to update title.');
        }
    }
    else if (step === 'edit_task_desc') {
        const taskId = ctx.session.editTaskId;
        if (text.split(/\s+/).length > 100) return ctx.reply('❌ Too long! Max 100 words.');
        
        try {
            // 1. Update the task in the tasks collection
            await db.collection('tasks').updateOne(
                { taskId: taskId }, 
                { $set: { description: text } }
            );
            
            // 2. Update ALL history entries with the same originalTaskId
            const result = await db.collection('history').updateMany(
                { originalTaskId: taskId }, 
                { $set: { description: text } }
            );
            
            console.log(`Updated ${result.modifiedCount} history entries for task ${taskId}`);
            
            ctx.session.step = null;
            delete ctx.session.editTaskId;
            await ctx.reply(`✅ <b>DESCRIPTION UPDATED!</b>\n\nAlso updated ${result.modifiedCount} history entry${result.modifiedCount !== 1 ? 's' : ''}`, { parse_mode: 'HTML' });
            await showTaskDetail(ctx, taskId);
        } catch (error) {
            console.error('Error updating description:', error);
            await ctx.reply('❌ Failed to update description.');
        }
    }
    else if (step === 'edit_task_start') {
        const taskId = ctx.session.editTaskId;
        
        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
            return ctx.reply('❌ Invalid Format. Use HH:MM (24-hour)');
        }
        
        try {
            // Get current task to know end time
            const task = await db.collection('tasks').findOne({ taskId });
            if (!task) {
                ctx.session.step = null;
                delete ctx.session.editTaskId;
                return ctx.reply('❌ Task not found.');
            }
            
            const dateObj = new Date(task.startDate);
            const dateObjIST = new Date(dateObj.getTime() + (5.5 * 60 * 60 * 1000));
            const year = dateObjIST.getUTCFullYear();
            const month = dateObjIST.getUTCMonth() + 1;
            const day = dateObjIST.getUTCDate();
            const [h, m] = text.split(':').map(Number);
            
            // Create new IST date
            const newStartDate = createISTDate(year, month, day, h, m);
            
            // Check if new start time is after end time
            if (newStartDate >= task.endDate) {
                return ctx.reply('❌ Start time must be before end time. Current end time is ' + formatTime(task.endDate));
            }
            
            // Calculate duration to preserve it
            const duration = task.endDate.getTime() - task.startDate.getTime();
            const newEndDate = new Date(newStartDate.getTime() + duration);
            
            // 1. Update the task in the tasks collection
            await db.collection('tasks').updateOne(
                { taskId: taskId }, 
                { 
                    $set: { 
                        startDate: newStartDate,
                        endDate: newEndDate,
                        nextOccurrence: newStartDate
                    } 
                }
            );
            
            // 2. Update ALL history entries with the same originalTaskId
            const result = await db.collection('history').updateMany(
                { originalTaskId: taskId }, 
                { 
                    $set: { 
                        startDate: newStartDate,
                        endDate: newEndDate
                    } 
                }
            );
            
            console.log(`Updated ${result.modifiedCount} history entries for task ${taskId}`);
            
            // Reschedule the task
            const updatedTask = await db.collection('tasks').findOne({ taskId });
            scheduleTask(updatedTask);
            
            ctx.session.step = null;
            delete ctx.session.editTaskId;
            await ctx.reply(`✅ <b>START TIME UPDATED!</b>\n\nEnd time adjusted to: ${formatTime(newEndDate)}\nAlso updated ${result.modifiedCount} history entry${result.modifiedCount !== 1 ? 's' : ''}`, { parse_mode: 'HTML' });
            await showTaskDetail(ctx, taskId);
        } catch (error) {
            console.error('Error updating start time:', error);
            await ctx.reply('❌ Failed to update start time.');
        }
    }
    else if (step === 'edit_task_end') {
        const taskId = ctx.session.editTaskId;
        
        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
            return ctx.reply('❌ Invalid Format. Use HH:MM (24-hour)');
        }
        
        const [eh, em] = text.split(':').map(Number);
        
        // Check if end time is valid (before 23:59)
        if (eh > 23 || (eh === 23 && em > 59)) {
            return ctx.reply('❌ End time must be before 23:59');
        }
        
        try {
            // Get current task to know start time
            const task = await db.collection('tasks').findOne({ taskId });
            if (!task) {
                ctx.session.step = null;
                delete ctx.session.editTaskId;
                return ctx.reply('❌ Task not found.');
            }
            
            const dateObj = new Date(task.endDate);
            const dateObjIST = new Date(dateObj.getTime() + (5.5 * 60 * 60 * 1000));
            const year = dateObjIST.getUTCFullYear();
            const month = dateObjIST.getUTCMonth() + 1;
            const day = dateObjIST.getUTCDate();
            
            // Create new IST date
            const newEndDate = createISTDate(year, month, day, eh, em);
            
            // Check if new end time is before start time
            if (newEndDate <= task.startDate) {
                return ctx.reply('❌ End time must be after start time. Current start time is ' + formatTime(task.startDate));
            }
            
            // 1. Update the task in the tasks collection
            await db.collection('tasks').updateOne(
                { taskId: taskId }, 
                { 
                    $set: { 
                        endDate: newEndDate
                    } 
                }
            );
            
            // 2. Update ALL history entries with the same originalTaskId
            const result = await db.collection('history').updateMany(
                { originalTaskId: taskId }, 
                { 
                    $set: { 
                        endDate: newEndDate
                    } 
                }
            );
            
            console.log(`Updated ${result.modifiedCount} history entries for task ${taskId}`);
            
            ctx.session.step = null;
            delete ctx.session.editTaskId;
            await ctx.reply(`✅ <b>END TIME UPDATED!</b>\n\nAlso updated ${result.modifiedCount} history entry${result.modifiedCount !== 1 ? 's' : ''}`, { parse_mode: 'HTML' });
            await showTaskDetail(ctx, taskId);
        } catch (error) {
            console.error('Error updating end time:', error);
            await ctx.reply('❌ Failed to update end time.');
        }
    }
    else if (step === 'edit_task_repeat_count') {
        const taskId = ctx.session.editTaskId;
        const count = parseInt(text);
        
        if (isNaN(count) || count < 0 || count > 365) {
            return ctx.reply('❌ Invalid Number. Enter 0-365');
        }
        
        try {
            // 1. Update the task in the tasks collection
            await db.collection('tasks').updateOne(
                { taskId: taskId }, 
                { 
                    $set: { 
                        repeatCount: count,
                        ...(count === 0 && { repeat: 'none' })
                    } 
                }
            );
            
            // 2. Update ALL history entries with the same originalTaskId
            const result = await db.collection('history').updateMany(
                { originalTaskId: taskId }, 
                { 
                    $set: { 
                        repeatCount: count,
                        ...(count === 0 && { repeat: 'none' })
                    } 
                }
            );
            
            console.log(`Updated ${result.modifiedCount} history entries for task ${taskId}`);
            
            ctx.session.step = null;
            delete ctx.session.editTaskId;
            await ctx.reply(`✅ <b>REPEAT COUNT UPDATED!</b>\n\nAlso updated ${result.modifiedCount} history entry${result.modifiedCount !== 1 ? 's' : ''}`, { parse_mode: 'HTML' });
            await showTaskDetail(ctx, taskId);
        } catch (error) {
            console.error('Error updating repeat count:', error);
            await ctx.reply('❌ Failed to update repeat count.');
        }
    }
    
    // --- EDIT NOTE FLOW (FIXED) ---
    else if (step === 'edit_note_title') {
        const noteId = ctx.session.editNoteId;
        if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
        
        try {
            await db.collection('notes').updateOne(
                { noteId: noteId }, 
                { $set: { title: text, updatedAt: new Date() } }
            );
            
            // Store the updated note before clearing session
            const updatedNote = await db.collection('notes').findOne({ noteId: noteId });
            
            // Clear session BEFORE sending reply
            ctx.session.step = null;
            delete ctx.session.editNoteId;
            
            // Send success message
            await ctx.reply(
                `✅ <b>𝗡𝗢𝗧𝗘 𝗧𝗜𝗧𝗟𝗘 𝗨𝗣𝗗𝗔𝗧𝗘𝗗!</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 <b>${updatedNote.title}</b>\n` +
                `${formatBlockquote(updatedNote.content)}\n` +
                `📅 Updated: ${formatDateTime(new Date())}`,
                { parse_mode: 'HTML' }
            );
            
            // Go back to note detail
            await showNoteDetail(ctx, noteId);
            
        } catch (error) {
            console.error('Error updating note title:', error);
            // Clear session even on error
            ctx.session.step = null;
            delete ctx.session.editNoteId;
            await ctx.reply('❌ Failed to update title.');
        }
    }
    else if (step === 'edit_note_content') {
        const noteId = ctx.session.editNoteId;
        if (text.split(/\s+/).length > 400) {
            return ctx.reply('❌ Too long! Max 400 words.');
        }
        
        try {
            await db.collection('notes').updateOne(
                { noteId: noteId }, 
                { $set: { content: text, updatedAt: new Date() } }
            );
            
            // Store the updated note before clearing session
            const updatedNote = await db.collection('notes').findOne({ noteId: noteId });
            
            // Clear session BEFORE sending reply
            ctx.session.step = null;
            delete ctx.session.editNoteId;
            
            // Send success message
            await ctx.reply(
                `✅ <b>𝗡𝗢𝗧𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧 𝗨𝗣𝗗𝗔𝗧𝗘𝗗!</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 <b>${updatedNote.title}</b>\n` +
                `${formatBlockquote(updatedNote.content)}\n` +
                `📅 Updated: ${formatDateTime(new Date())}`,
                { parse_mode: 'HTML' }
            );
            
            // Go back to note detail
            await showNoteDetail(ctx, noteId);
            
        } catch (error) {
            console.error('Error updating note content:', error);
            // Clear session even on error
            ctx.session.step = null;
            delete ctx.session.editNoteId;
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
        `🔢 <b>𝗗𝗔𝗜𝗟𝗬 𝗥𝗘𝗣𝗘𝗔𝗧</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📝 <i>How many times should this task repeat?</i>`,
        { parse_mode: 'HTML' }
    );
});

bot.action('repeat_weekly', async (ctx) => {
    ctx.session.task.repeat = 'weekly';
    ctx.session.step = 'task_repeat_count';
    await ctx.reply(
        `🔢 <b>𝗪𝗘𝗘𝗞𝗟𝗬 𝗥𝗘𝗣𝗘𝗔𝗧</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📝 <i>How many times should this task repeat?</i>`,
        { parse_mode: 'HTML' }
    );
});

async function saveTask(ctx) {
    const task = ctx.session.task;
    
    // Get current highest orderIndex for tasks
    const highestTask = await db.collection('tasks').findOne(
        { userId: task.userId },
        { sort: { orderIndex: -1 } }
    );
    const nextOrderIndex = highestTask ? highestTask.orderIndex + 1 : 0;
    
    // Ensure required fields
    task.status = 'pending';
    task.createdAt = new Date();
    task.orderIndex = nextOrderIndex; // Add order index
    task.subtasks = task.subtasks || []; // Ensure subtasks array exists
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
            [
                Markup.button.callback('📋 Today\'s Tasks', 'view_today_tasks_1'),
                Markup.button.callback('🔙 Back', 'main_menu')
            ]
        ]);
        
        await safeEdit(ctx, msg, keyboard);
    } catch (error) {
        console.error('Error saving task:', error);
        await ctx.reply('❌ Failed to save task. Please try again.');
    }
}

// --- TASK DETAILS (WITH SUBTASKS) ---
bot.action(/^task_det_(.+)$/, async (ctx) => {
    await showTaskDetail(ctx, ctx.match[1]);
});

async function showTaskDetail(ctx, taskId) {
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) {
        const text = '❌ <b>𝗧𝗔𝗦𝗞 𝗡𝗢𝗧 𝗙𝗢𝗨𝗡𝗗</b>\n\nThis task may have been completed or deleted.';
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📋 Today\'s Tasks', 'view_today_tasks_1'),
            Markup.button.callback('🔙 Back', 'main_menu')]
        ]);
        return safeEdit(ctx, text, keyboard);
    }

    // Calculate subtask progress
    const subtasks = task.subtasks || [];
    const progress = calculateSubtaskProgress(subtasks);
    const completedSubtasks = subtasks.filter(s => s.completed).length;
    const totalSubtasks = subtasks.length;
    
    let text = `
📌 <b>𝗧𝗔𝗦𝗞 𝗗𝗘𝗧𝗔𝗜𝗟𝗦</b>
━━━━━━━━━━━━━━━━━━━━
🆔 <b>Task ID:</b> <code>${task.taskId}</code>
📛 <b>Title:</b> ${task.title}
${formatBlockquote(task.description)}
📅 <b>Next Occurrence:</b> ${formatDateTime(task.nextOccurrence)}
⏰ <b>Time:</b> ${formatTime(task.startDate)} - ${formatTime(task.endDate)}
🔄 <b>Repeat:</b> ${task.repeat === 'none' ? 'No Repeat' : task.repeat} 
🔢 <b>Remaining Repeats:</b> ${task.repeatCount || 0}
🏷️ <b>Priority Order:</b> ${task.orderIndex + 1}
📊 <b>Status:</b> ${task.status === 'pending' ? '⏳ Pending' : '✅ Completed'}
`;

    // Add subtask progress bar
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
        text += `\n📋 <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞𝗦:</b> No subtasks yet\n━━━━━━━━━━━━━━━━━━━━\n`;
    }

    // Add subtask buttons
    const buttons = [];
    
    // Add each subtask as a button
    subtasks.forEach((subtask, index) => {
        const status = subtask.completed ? '✅' : '⭕';
        const buttonRow = [
            Markup.button.callback(
                `${status} ${index + 1}. ${subtask.title}`, 
                `subtask_det_${taskId}_${subtask.id}`
            )
        ];
        buttons.push(buttonRow);
    });
    
    // Add action buttons row
    const actionRow = [];
    
    // Add subtask button if less than 10
    if (totalSubtasks < 10) {
        actionRow.push(Markup.button.callback('➕', `add_subtask_${taskId}`));
    }
    
    actionRow.push(Markup.button.callback('✏️', `edit_menu_${taskId}`));
    actionRow.push(Markup.button.callback('🗑️', `delete_task_${taskId}`));
    
    if (actionRow.length > 0) {
        buttons.push(actionRow);
    }
    
    // Navigation buttons
    buttons.push([
        Markup.button.callback('✅ Tick', `complete_${taskId}`),
        Markup.button.callback('📋 Tasks', 'view_today_tasks_1')
    ]);
    
    buttons.push([
        Markup.button.callback('🔙 Back', 'view_today_tasks_1')
    ]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

// --- SUBTASK DETAILS ---
bot.action(/^subtask_det_(.+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
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
    const text = `
📋 <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞 𝗗𝗘𝗧𝗔𝗜𝗟𝗦</b>
━━━━━━━━━━━━━━━━━━━━
📌 <b>Task:</b> ${task.title}
🔖 <b>Subtask:</b> ${subtask.title}
📊 <b>Status:</b> ${status}
🆔 <b>ID:</b> <code>${subtask.id}</code>
📅 <b>Created:</b> ${formatDateTime(subtask.createdAt)}
━━━━━━━━━━━━━━━━━━━━`;

    const buttons = [];
    
    if (!subtask.completed) {
        // If not completed: show Complete + Edit + Delete in one row
        buttons.push([
            Markup.button.callback('✅', `subtask_complete_${taskId}_${subtaskId}`),
            Markup.button.callback('✏️', `subtask_edit_${taskId}_${subtaskId}`),
            Markup.button.callback('🗑️', `subtask_delete_${taskId}_${subtaskId}`)
        ]);
    } else {
        // If completed: show only Edit + Delete in one row
        buttons.push([
            Markup.button.callback('✏️ Edit', `subtask_edit_${taskId}_${subtaskId}`),
            Markup.button.callback('🗑️ Delete', `subtask_delete_${taskId}_${subtaskId}`)
        ]);
    }
    
    buttons.push([Markup.button.callback('🔙 Back to Task', `task_det_${taskId}`)]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

// --- SUBTASK COMPLETE ---
bot.action(/^subtask_complete_(.+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
    try {
        // Mark subtask as completed
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

// --- SUBTASK EDIT ---
bot.action(/^subtask_edit_(.+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
    ctx.session.step = 'edit_subtask_title';
    ctx.session.editSubtask = { taskId, subtaskId };
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗦𝗨𝗕𝗧𝗔𝗦𝗞 𝗧𝗜𝗧𝗟𝗘</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new title for the subtask:`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${taskId}`)]])
    );
});

// --- SUBTASK DELETE ---
bot.action(/^subtask_delete_(.+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
    try {
        // Remove subtask from array
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

// --- ADD SUBTASK ---
bot.action(/^add_subtask_(.+)$/, async (ctx) => {
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
    
    ctx.session.step = 'add_subtasks';
    ctx.session.addSubtasksTaskId = taskId;
    
    await ctx.reply(
        `➕ <b>𝗔𝗗𝗗 𝗦𝗨𝗕𝗧𝗔𝗦𝗞𝗦</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📌 <b>${task.title}</b>\n` +
        `📊 Current: ${currentSubtasks.length}/10 subtasks\n` +
        `➕ Available: ${availableSlots} more\n\n` +
        `<i>Enter subtask titles (one per line):</i>\n`,
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${taskId}`)]])
        }
    );
});

// --- COMPLETE TASK (with subtask verification) ---
bot.action(/^complete_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) return ctx.answerCbQuery('Task not found');

    // Check if all subtasks are completed
    const subtasks = task.subtasks || [];
    const incompleteSubtasks = subtasks.filter(s => !s.completed);
    
    if (incompleteSubtasks.length > 0) {
        return ctx.answerCbQuery(`❌ Complete all ${incompleteSubtasks.length} pending subtasks first!`);
    }

    // Get current IST date and time for completedAt
    const completedAtIST = getCurrentISTDateTime();
    // Also store a date-only version for grouping
    const completedDateIST = getISTDateForHistory(completedAtIST);
    
    // 1. Create History Copy with subtasks
    const historyItem = {
        ...task,
        _id: undefined,
        completedAt: completedAtIST, // Store in IST
        completedDate: completedDateIST, // Store date-only for grouping
        originalTaskId: task.taskId,
        status: 'completed',
        completedFromDate: task.nextOccurrence,
        subtasks: task.subtasks // Include subtasks in history
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
            
            // Reset subtasks for next occurrence (all incomplete)
            const resetSubtasks = (task.subtasks || []).map(s => ({
                ...s,
                completed: false
            }));
            
            // Update the task with next occurrence and reset subtasks
            await db.collection('tasks').updateOne({ taskId }, {
                $set: {
                    nextOccurrence: nextOccurrence,
                    repeatCount: task.repeatCount - 1,
                    startDate: nextOccurrence,
                    endDate: new Date(nextOccurrence.getTime() + 
                        (task.endDate.getTime() - task.startDate.getTime())),
                    subtasks: resetSubtasks
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
    const text = `✏️ <b>𝗘𝗗𝗜𝗧 𝗧𝗔𝗦𝗞</b>\n━━━━━━━━━━━━━━━━━━━━\nSelect what you want to edit:`;
    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('🏷 Title', `edit_task_title_${taskId}`), 
            Markup.button.callback('📝 Description', `edit_task_desc_${taskId}`)
        ],
        [
            Markup.button.callback('⏰ Start Time', `edit_task_start_${taskId}`), 
            Markup.button.callback('🏁 End Time', `edit_task_end_${taskId}`)
        ],
        [
            Markup.button.callback('🔄 Repeat', `edit_rep_${taskId}`), 
            Markup.button.callback('🔢 Count', `edit_task_count_${taskId}`)
        ],
        [Markup.button.callback('🔙 Back', `task_det_${taskId}`)]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

// Direct edit action handlers
bot.action(/^edit_task_title_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_title';
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗧𝗜𝗧𝗟𝗘</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new title:`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${taskId}`)]])
    );
});

bot.action(/^edit_task_desc_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_desc';
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗗𝗘𝗦𝗖𝗥𝗜𝗣𝗧𝗜𝗢𝗡</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new description (Max 100 words):`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${taskId}`)]])
    );
});

bot.action(/^edit_task_start_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return showMainMenu(ctx);
    }
    
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_start';
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗦𝗧𝗔𝗥𝗧 𝗧𝗜𝗠𝗘</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new start time (HH:MM, 24-hour):\n` +
        `📝 Current end time: ${formatTime(task.endDate)}\n` +
        `⚠️ New start time must be before end time`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${taskId}`)]])
    );
});

bot.action(/^edit_task_end_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return showMainMenu(ctx);
    }
    
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_end';
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗘𝗡𝗗 𝗧𝗜𝗠𝗘</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new end time (HH:MM, 24-hour):\n` +
        `📝 Current start time: ${formatTime(task.startDate)}\n` +
        `⚠️ End time must be after start time and before 23:59`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${taskId}`)]])
    );
});

bot.action(/^edit_task_count_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return showMainMenu(ctx);
    }
    
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_repeat_count';
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗥𝗘𝗣𝗘𝗔𝗧 𝗖𝗢𝗨𝗡𝗧</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new repeat count (0-365):\n` +
        `📝 Current count: ${task.repeatCount || 0}`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${taskId}`)]])
    );
});

bot.action(/^edit_rep_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const text = `🔄 <b>𝗖𝗛𝗔𝗡𝗚𝗘 𝗥𝗘𝗣𝗘𝗔𝗧 𝗠𝗢𝗗𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\nSelect new repeat mode:`;
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
            // Keep existing count or set to 10 if not exists
            const task = await db.collection('tasks').findOne({ taskId });
            updates.repeatCount = task?.repeatCount || 10;
        }
        
        // 1. Update the task in the tasks collection
        await db.collection('tasks').updateOne({ taskId }, { $set: updates });
        
        // 2. Update ALL history entries with the same originalTaskId
        const result = await db.collection('history').updateMany(
            { originalTaskId: taskId }, 
            { $set: updates }
        );
        
        console.log(`Updated ${result.modifiedCount} history entries for task ${taskId}`);
        
        await ctx.answerCbQuery(`✅ Updated to ${mode} (also updated ${result.modifiedCount} history entries)`);
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
        
        // Also delete all history entries for this task
        const historyResult = await db.collection('history').deleteMany({ originalTaskId: taskId });
        console.log(`Deleted ${historyResult.deletedCount} history entries for task ${taskId}`);
        
        cancelTaskSchedule(taskId);
        await ctx.answerCbQuery(`✅ Task Deleted (also deleted ${historyResult.deletedCount} history entries)`);
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error deleting task:', error);
        await ctx.answerCbQuery('❌ Error deleting task');
    }
});


// ==========================================
// 🔄 REORDER TASKS SYSTEM (SHOWS ALL TASKS, NO DATES)
// ==========================================

bot.action('reorder_tasks_menu', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
        // Get ALL pending tasks (not just today's)
        const tasks = await db.collection('tasks')
            .find({ 
                userId: userId,
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
        
        let text = '<b>🔼🔽 Reorder ALL Tasks</b>\n\n';
        text += 'Select a task to move:\n\n';
        
        const keyboard = [];
        
        tasks.forEach((task, index) => {
            // Show only task title (no date)
            keyboard.push([{ 
                text: `${index + 1}. ${task.title}`, 
                callback_data: `reorder_task_select_${task.taskId}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Reorder tasks menu error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

bot.action(/^reorder_task_select_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const userId = ctx.from.id;
        
        // Get ALL tasks for reordering
        const tasks = await db.collection('tasks')
            .find({ 
                userId: userId,
                status: 'pending'
            })
            .sort({ orderIndex: 1, nextOccurrence: 1 })
            .toArray();
        
        const selectedIndex = tasks.findIndex(t => t.taskId === taskId);
        
        if (selectedIndex === -1) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
        // Store selected task info in session
        ctx.session.reorderTask = {
            selectedTaskId: taskId,
            selectedIndex: selectedIndex,
            tasks: tasks
        };
        
        // Display current order with selected task highlighted
        let text = '<b>🔼🔽 Reorder ALL Tasks</b>\n\n';
        text += 'Current order (selected task is highlighted):\n\n';
        
        tasks.forEach((task, index) => {
            // Show only task title (no date)
            if (index === selectedIndex) {
                text += `<blockquote>${index + 1}. ${task.title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${task.title}\n`;
            }
        });
        
        const keyboard = [];
        
        // Show move buttons only if applicable
        if (selectedIndex > 0) {
            keyboard.push([{ text: '🔼 Move Up', callback_data: 'reorder_task_up' }]);
        }
        
        if (selectedIndex < tasks.length - 1) {
            if (selectedIndex > 0) {
                // If both buttons exist, put them in same row
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
        
        // Swap with previous task
        const temp = tasks[selectedIndex];
        tasks[selectedIndex] = tasks[selectedIndex - 1];
        tasks[selectedIndex - 1] = temp;
        
        // Update selected index
        ctx.session.reorderTask.selectedIndex = selectedIndex - 1;
        ctx.session.reorderTask.tasks = tasks;
        
        // Redisplay with new order
        let text = '<b>🔼🔽 Reorder ALL Tasks</b>\n\n';
        text += 'Current order (selected task is highlighted):\n\n';
        
        tasks.forEach((task, index) => {
            // Show only task title (no date)
            if (index === ctx.session.reorderTask.selectedIndex) {
                text += `<blockquote>${index + 1}. ${task.title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${task.title}\n`;
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
        
        // Swap with next task
        const temp = tasks[selectedIndex];
        tasks[selectedIndex] = tasks[selectedIndex + 1];
        tasks[selectedIndex + 1] = temp;
        
        // Update selected index
        ctx.session.reorderTask.selectedIndex = selectedIndex + 1;
        ctx.session.reorderTask.tasks = tasks;
        
        // Redisplay with new order
        let text = '<b>🔼🔽 Reorder ALL Tasks</b>\n\n';
        text += 'Current order (selected task is highlighted):\n\n';
        
        tasks.forEach((task, index) => {
            // Show only task title (no date)
            if (index === ctx.session.reorderTask.selectedIndex) {
                text += `<blockquote>${index + 1}. ${task.title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${task.title}\n`;
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
        const userId = ctx.from.id;
        
        // Update orderIndex for all tasks
        for (let i = 0; i < tasks.length; i++) {
            await db.collection('tasks').updateOne(
                { taskId: tasks[i].taskId, userId: userId },
                { $set: { orderIndex: i } }
            );
        }
        
        // Clear session
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
    const userId = ctx.from.id;
    
    try {
        const notes = await db.collection('notes')
            .find({ userId: userId })
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
        
        let text = '<b>🔼🔽 Reorder Notes</b>\n\n';
        text += 'Select a note to move:\n\n';
        
        const keyboard = [];
        
        notes.forEach((note, index) => {
            keyboard.push([{ 
                text: `${index + 1}. ${note.title}`, 
                callback_data: `reorder_note_select_${note.noteId}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]);
        
        await safeEdit(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Reorder notes menu error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

bot.action(/^reorder_note_select_(.+)$/, async (ctx) => {
    try {
        const noteId = ctx.match[1];
        const userId = ctx.from.id;
        
        const notes = await db.collection('notes')
            .find({ userId: userId })
            .sort({ orderIndex: 1, createdAt: -1 })
            .toArray();
        
        const selectedIndex = notes.findIndex(n => n.noteId === noteId);
        
        if (selectedIndex === -1) {
            await ctx.answerCbQuery('❌ Note not found');
            return;
        }
        
        // Store selected note info in session
        ctx.session.reorderNote = {
            selectedNoteId: noteId,
            selectedIndex: selectedIndex,
            notes: notes
        };
        
        // Display current order with selected note highlighted
        let text = '<b>🔼🔽 Reorder Notes</b>\n\n';
        text += 'Current order (selected note is highlighted):\n\n';
        
        notes.forEach((note, index) => {
            if (index === selectedIndex) {
                text += `<blockquote>${index + 1}. ${note.title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${note.title}\n`;
            }
        });
        
        const keyboard = [];
        
        // Show move buttons only if applicable
        if (selectedIndex > 0) {
            keyboard.push([{ text: '🔼 Move Up', callback_data: 'reorder_note_up' }]);
        }
        
        if (selectedIndex < notes.length - 1) {
            if (selectedIndex > 0) {
                // If both buttons exist, put them in same row
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
        
        // Swap with previous note
        const temp = notes[selectedIndex];
        notes[selectedIndex] = notes[selectedIndex - 1];
        notes[selectedIndex - 1] = temp;
        
        // Update selected index
        ctx.session.reorderNote.selectedIndex = selectedIndex - 1;
        ctx.session.reorderNote.notes = notes;
        
        // Redisplay with new order
        let text = '<b>🔼🔽 Reorder Notes</b>\n\n';
        text += 'Current order (selected note is highlighted):\n\n';
        
        notes.forEach((note, index) => {
            if (index === ctx.session.reorderNote.selectedIndex) {
                text += `<blockquote>${index + 1}. ${note.title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${note.title}\n`;
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
        
        // Swap with next note
        const temp = notes[selectedIndex];
        notes[selectedIndex] = notes[selectedIndex + 1];
        notes[selectedIndex + 1] = temp;
        
        // Update selected index
        ctx.session.reorderNote.selectedIndex = selectedIndex + 1;
        ctx.session.reorderNote.notes = notes;
        
        // Redisplay with new order
        let text = '<b>🔼🔽 Reorder Notes</b>\n\n';
        text += 'Current order (selected note is highlighted):\n\n';
        
        notes.forEach((note, index) => {
            if (index === ctx.session.reorderNote.selectedIndex) {
                text += `<blockquote>${index + 1}. ${note.title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${note.title}\n`;
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
        const userId = ctx.from.id;
        
        // Update orderIndex for all notes
        for (let i = 0; i < notes.length; i++) {
            await db.collection('notes').updateOne(
                { noteId: notes[i].noteId, userId: userId },
                { $set: { orderIndex: i } }
            );
        }
        
        // Clear session
        delete ctx.session.reorderNote;
        
        await ctx.answerCbQuery('✅ Note order saved!');
        await showMainMenu(ctx);
        
    } catch (error) {
        console.error('Save note order error:', error);
        await ctx.answerCbQuery('❌ Failed to save order');
    }
});

// ==========================================
// 📜 VIEW HISTORY - WITH PAGINATION AND SUBTASKS
// ==========================================

bot.action(/^view_history_dates_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    
    // Items per page
    const perPage = 10;
    const skip = (page - 1) * perPage;
    
    // Get distinct dates from completedDate field (which stores IST date only)
    const dates = await db.collection('history').aggregate([
        { $match: { userId } },
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
        { $sort: { completedDate: -1 } }, // Sort by date descending (newest first)
        { 
            $facet: {
                metadata: [{ $count: "total" }],
                data: [{ $skip: skip }, { $limit: perPage }]
            }
        }
    ]).toArray();

    const totalDates = dates[0]?.metadata[0]?.total || 0;
    const dateList = dates[0]?.data || [];
    const totalPages = Math.ceil(totalDates / perPage);

    const text = `📜 <b>𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗧𝗔𝗦𝗞𝗦 𝗛𝗜𝗦𝗧𝗢𝗥𝗬</b>\n━━━━━━━━━━━━━━━━━━━━\n📊 Total: ${totalDates} date${totalDates !== 1 ? 's' : ''}\n📄 Page: ${page}/${totalPages}\n━━━━━━━━━━━━━━━━━━━━\nSelect a date to view:`;
    
    const buttons = dateList.map(d => {
        const date = new Date(d.completedDate);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return [Markup.button.callback(`📅 ${formatDate(date)} (${d.count})`, `hist_list_${dateStr}_1`)];
    });
    
    // Add pagination buttons if needed
    if (totalPages > 1) {
        const paginationRow = [];
        
        if (page > 1) {
            paginationRow.push(Markup.button.callback('◀️ Previous', `view_history_dates_${page - 1}`));
        }
        
        paginationRow.push(Markup.button.callback(`📄 ${page}/${totalPages}`, 'no_action'));
        
        if (page < totalPages) {
            paginationRow.push(Markup.button.callback('Next ▶️', `view_history_dates_${page + 1}`));
        }
        
        buttons.push(paginationRow);
    }
    
    buttons.push([Markup.button.callback('🔙 Back', 'main_menu')]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^hist_list_([\d-]+)_(\d+)$/, async (ctx) => {
    const dateStr = ctx.match[1];
    const page = parseInt(ctx.match[2]);
    const userId = ctx.from.id;

    const [year, month, day] = dateStr.split('-').map(Number);
    
    // Create IST date for the selected day
    const selectedDate = new Date(year, month - 1, day);
    const selectedDateIST = new Date(selectedDate.getTime() + (5.5 * 60 * 60 * 1000));
    selectedDateIST.setHours(0, 0, 0, 0);
    
    const nextDay = new Date(selectedDateIST);
    nextDay.setDate(nextDay.getDate() + 1);

    // Items per page
    const perPage = 10;
    const skip = (page - 1) * perPage;
    
    // Get total count - match by completedDate (IST date only)
    const totalTasks = await db.collection('history').countDocuments({
        userId: userId,
        completedDate: {
            $gte: selectedDateIST,
            $lt: nextDay
        }
    });
    
    const totalPages = Math.ceil(totalTasks / perPage);

    const tasks = await db.collection('history').find({
        userId: userId,
        completedDate: {
            $gte: selectedDateIST,
            $lt: nextDay
        }
    }).sort({ completedAt: -1 }).skip(skip).limit(perPage).toArray();

    const date = new Date(year, month - 1, day);
    const text = `📅 <b>𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗢𝗡 ${formatDate(date).toUpperCase()}</b>\n━━━━━━━━━━━━━━━━━━━━\n📊 Total: ${totalTasks} task${totalTasks !== 1 ? 's' : ''}\n📄 Page: ${page}/${totalPages}\n━━━━━━━━━━━━━━━━━━━━\nSelect a task to view details:`;
    
    const buttons = tasks.map((t, index) => {
        const taskNum = skip + index + 1;
        let taskTitle = t.title;
        
        // Add subtask indicator to history list
        if (t.subtasks && t.subtasks.length > 0) {
            const completed = t.subtasks.filter(s => s.completed).length;
            taskTitle += ` [${completed}/${t.subtasks.length}]`;
        }
        
        return [
            Markup.button.callback(`✅ ${taskNum}. ${taskTitle} (${formatTime(t.completedAt)})`, `hist_det_${t._id}`)
        ];
    });
    
    // Add pagination buttons if needed
    if (totalPages > 1) {
        const paginationRow = [];
        
        if (page > 1) {
            paginationRow.push(Markup.button.callback('◀️ Previous', `hist_list_${dateStr}_${page - 1}`));
        }
        
        paginationRow.push(Markup.button.callback(`📄 ${page}/${totalPages}`, 'no_action'));
        
        if (page < totalPages) {
            paginationRow.push(Markup.button.callback('Next ▶️', `hist_list_${dateStr}_${page + 1}`));
        }
        
        buttons.push(paginationRow);
    }
    
    buttons.push([Markup.button.callback('🔙 Back to Dates', 'view_history_dates_1')]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^hist_det_(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const task = await db.collection('history').findOne({ _id: new ObjectId(id) });

    if (!task) return ctx.answerCbQuery('Task not found');

    let text = `
📜 <b>𝗛𝗜𝗦𝗧𝗢𝗥𝗬 𝗗𝗘𝗧𝗔𝗜𝗟</b>
━━━━━━━━━━━━━━━━━━━━
📌 <b>${task.title}</b>
${formatBlockquote(task.description)}
✅ <b>Completed At:</b> ${formatDateTime(task.completedAt)}
${task.autoCompleted ? '🤖 <b>Auto-completed at 23:59</b>\n' : ''}
⏰ <b>Original Time:</b> ${formatTime(task.startDate)} - ${formatTime(task.endDate)}
🔄 <b>Repeat Type:</b> ${task.repeat === 'none' ? 'No Repeat' : task.repeat}
━━━━━━━━━━━━━━━━━━━━
`;

    // Show subtasks if they exist
    if (task.subtasks && task.subtasks.length > 0) {
        text += `📋 <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞𝗦:</b>\n`;
        task.subtasks.forEach((subtask, index) => {
            const status = subtask.completed ? '✅' : '❌';
            text += `${status} ${index + 1}. ${subtask.title}\n`;
        });
        text += `━━━━━━━━━━━━━━━━━━━━\n`;
    }

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Back to History', 'view_history_dates_1')]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

// ==========================================
// 🗒️ VIEW NOTES - WITH PAGINATION
// ==========================================

bot.action(/^view_notes_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    
    // Items per page
    const perPage = 10;
    const skip = (page - 1) * perPage;
    
    // Get total count
    const totalNotes = await db.collection('notes').countDocuments({ userId });
    const totalPages = Math.ceil(totalNotes / perPage);
    
    const notes = await db.collection('notes').find({ userId })
        .sort({ orderIndex: 1, createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .toArray();

    const text = `🗒️ <b>𝗬𝗢𝗨𝗥 𝗡𝗢𝗧𝗘𝗦</b>\n━━━━━━━━━━━━━━━━━━━━\n📊 Total: ${totalNotes} note${totalNotes !== 1 ? 's' : ''}\n📄 Page: ${page}/${totalPages}\n━━━━━━━━━━━━━━━━━━━━\nSelect a note to view:`;
    
    const buttons = notes.map((n, index) => {
        const noteNum = skip + index + 1;
        return [
            Markup.button.callback(`📄 ${noteNum}. ${n.title}`, `note_det_${n.noteId}`)
        ];
    });
    
    // Add pagination buttons if needed
    if (totalPages > 1) {
        const paginationRow = [];
        
        if (page > 1) {
            paginationRow.push(Markup.button.callback('◀️ Previous', `view_notes_${page - 1}`));
        }
        
        paginationRow.push(Markup.button.callback(`📄 ${page}/${totalPages}`, 'no_action'));
        
        if (page < totalPages) {
            paginationRow.push(Markup.button.callback('Next ▶️', `view_notes_${page + 1}`));
        }
        
        buttons.push(paginationRow);
    }
    
    buttons.push([Markup.button.callback('🔙 Back', 'main_menu')]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^note_det_(.+)$/, async (ctx) => {
    await showNoteDetail(ctx, ctx.match[1]);
});

async function showNoteDetail(ctx, noteId) {
    const note = await db.collection('notes').findOne({ noteId });
    if (!note) {
        const text = '❌ <b>𝗡𝗢𝗧𝗘 𝗡𝗢𝗧 𝗙𝗢𝗨𝗡𝗗</b>\n\nThis note may have been deleted.';
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🗒️ Notes', 'view_notes_1'),
            Markup.button.callback('🔙 Back', 'main_menu')]
        ]);
        return safeEdit(ctx, text, keyboard);
    }

    const text = `
📝 <b>𝗡𝗢𝗧𝗘 𝗗𝗘𝗧𝗔𝗜𝗟𝗦</b>
━━━━━━━━━━━━━━━━━━━━
📌 <b>${note.title}</b>
${formatBlockquote(note.content)}
📅 <b>Created:</b> ${formatDateTime(note.createdAt)}
${note.updatedAt ? `✏️ <b>Updated:</b> ${formatDateTime(note.updatedAt)}` : ''}
🏷️ <b>Order:</b> ${note.orderIndex + 1}
━━━━━━━━━━━━━━━━━━━━`;
    
    const buttons = [
        [
            Markup.button.callback('✏️ Edit Title', `edit_note_title_${note.noteId}`), 
            Markup.button.callback('✏️ Edit Content', `edit_note_content_${note.noteId}`)
        ],
        [
            Markup.button.callback('🗑️ Delete', `delete_note_${note.noteId}`),
            Markup.button.callback('🔙 Back to Notes', 'view_notes_1')
        ]
    ];

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

// ==========================================
// ✏️ EDIT NOTE HANDLERS (FIXED)
// ==========================================

bot.action(/^edit_note_title_(.+)$/, async (ctx) => {
    const noteId = ctx.match[1];
    
    // Check if note exists
    const note = await db.collection('notes').findOne({ noteId });
    if (!note) {
        await ctx.answerCbQuery('❌ Note not found');
        return;
    }
    
    ctx.session.editNoteId = noteId;
    ctx.session.step = 'edit_note_title';
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗡𝗢𝗧𝗘 𝗧𝗜𝗧𝗟𝗘</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new title:`,
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `note_det_${noteId}`)]])
        }
    );
});

bot.action(/^edit_note_content_(.+)$/, async (ctx) => {
    const noteId = ctx.match[1];
    
    // Check if note exists
    const note = await db.collection('notes').findOne({ noteId });
    if (!note) {
        await ctx.answerCbQuery('❌ Note not found');
        return;
    }
    
    ctx.session.editNoteId = noteId;
    ctx.session.step = 'edit_note_content';
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗡𝗢𝗧𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Enter new content (Max 400 words):`,
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `note_det_${noteId}`)]])
        }
    );
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

// ==========================================
// 📥 DOWNLOAD DATA MENU (FIXED FILE SENDING)
// ==========================================

bot.action('download_menu', async (ctx) => {
    const text = `📥 <b>𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗 𝗬𝗢𝗨𝗥 𝗗𝗔𝗧𝗔</b>\n━━━━━━━━━━━━━━━━━━━━\n📁 <i>Files will be sent as JSON documents</i>`;
    
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
    try {
        await ctx.answerCbQuery('⏳ Fetching tasks...');
        const userId = ctx.from.id;
        const tasks = await db.collection('tasks').find({ userId }).toArray();
        
        // Create JSON data
        const tasksData = {
            total: tasks.length,
            downloadedAt: new Date().toISOString(),
            userId: userId,
            data: tasks.length > 0 ? tasks : []
        };
        
        const tasksJson = JSON.stringify(tasksData, null, 2);
        const tasksBuff = Buffer.from(tasksJson, 'utf-8');
        
        // Send file with proper options
        await ctx.replyWithDocument({
            source: tasksBuff,
            filename: `tasks_${userId}_${Date.now()}.json`
        }, {
            caption: `📋 <b>Your Tasks Data</b>\nTotal: ${tasks.length} task${tasks.length !== 1 ? 's' : ''}\n📅 ${formatDateTime(new Date())}`,
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery(`✅ Sent ${tasks.length} tasks`);
    } catch (error) {
        console.error('Error downloading tasks:', error);
        await ctx.answerCbQuery('❌ Error sending tasks file');
        await ctx.reply('❌ Failed to send tasks file. Please try again.');
    }
});

bot.action('download_history', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Fetching history...');
        const userId = ctx.from.id;
        const history = await db.collection('history').find({ userId }).toArray();
        
        // Create JSON data
        const historyData = {
            total: history.length,
            downloadedAt: new Date().toISOString(),
            userId: userId,
            data: history.length > 0 ? history : []
        };
        
        const historyJson = JSON.stringify(historyData, null, 2);
        const histBuff = Buffer.from(historyJson, 'utf-8');
        
        // Send file with proper options
        await ctx.replyWithDocument({
            source: histBuff,
            filename: `history_${userId}_${Date.now()}.json`
        }, {
            caption: `📜 <b>Your History Data</b>\nTotal: ${history.length} item${history.length !== 1 ? 's' : ''}\n📅 ${formatDateTime(new Date())}`,
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery(`✅ Sent ${history.length} history items`);
    } catch (error) {
        console.error('Error downloading history:', error);
        await ctx.answerCbQuery('❌ Error sending history file');
        await ctx.reply('❌ Failed to send history file. Please try again.');
    }
});

bot.action('download_notes', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Fetching notes...');
        const userId = ctx.from.id;
        const notes = await db.collection('notes').find({ userId }).toArray();
        
        // Create JSON data
        const notesData = {
            total: notes.length,
            downloadedAt: new Date().toISOString(),
            userId: userId,
            data: notes.length > 0 ? notes : []
        };
        
        const notesJson = JSON.stringify(notesData, null, 2);
        const notesBuff = Buffer.from(notesJson, 'utf-8');
        
        // Send file with proper options
        await ctx.replyWithDocument({
            source: notesBuff,
            filename: `notes_${userId}_${Date.now()}.json`
        }, {
            caption: `🗒️ <b>Your Notes Data</b>\nTotal: ${notes.length} note${notes.length !== 1 ? 's' : ''}\n📅 ${formatDateTime(new Date())}`,
            parse_mode: 'HTML'
        });
        
        await ctx.answerCbQuery(`✅ Sent ${notes.length} notes`);
    } catch (error) {
        console.error('Error downloading notes:', error);
        await ctx.answerCbQuery('❌ Error sending notes file');
        await ctx.reply('❌ Failed to send notes file. Please try again.');
    }
});

bot.action('download_all', async (ctx) => {
    try {
        await ctx.answerCbQuery('⏳ Preparing all data...');
        const userId = ctx.from.id;
        const timestamp = Date.now();
        
        // Fetch all data
        const tasks = await db.collection('tasks').find({ userId }).toArray();
        const history = await db.collection('history').find({ userId }).toArray();
        const notes = await db.collection('notes').find({ userId }).toArray();
        
        const totalItems = tasks.length + history.length + notes.length;
        
        // Send tasks file
        if (tasks.length > 0 || true) { // Always send file, even if empty
            const tasksData = {
                total: tasks.length,
                downloadedAt: new Date().toISOString(),
                userId: userId,
                data: tasks
            };
            const tasksBuff = Buffer.from(JSON.stringify(tasksData, null, 2), 'utf-8');
            await ctx.replyWithDocument({
                source: tasksBuff,
                filename: `tasks_${userId}_${timestamp}.json`
            }, {
                caption: `📋 <b>Tasks</b> (${tasks.length} item${tasks.length !== 1 ? 's' : ''})`,
                parse_mode: 'HTML'
            });
        }
        
        // Send history file
        if (history.length > 0 || true) { // Always send file, even if empty
            const historyData = {
                total: history.length,
                downloadedAt: new Date().toISOString(),
                userId: userId,
                data: history
            };
            const histBuff = Buffer.from(JSON.stringify(historyData, null, 2), 'utf-8');
            await ctx.replyWithDocument({
                source: histBuff,
                filename: `history_${userId}_${timestamp}.json`
            }, {
                caption: `📜 <b>History</b> (${history.length} item${history.length !== 1 ? 's' : ''})`,
                parse_mode: 'HTML'
            });
        }
        
        // Send notes file
        if (notes.length > 0 || true) { // Always send file, even if empty
            const notesData = {
                total: notes.length,
                downloadedAt: new Date().toISOString(),
                userId: userId,
                data: notes
            };
            const notesBuff = Buffer.from(JSON.stringify(notesData, null, 2), 'utf-8');
            await ctx.replyWithDocument({
                source: notesBuff,
                filename: `notes_${userId}_${timestamp}.json`
            }, {
                caption: `🗒️ <b>Notes</b> (${notes.length} item${notes.length !== 1 ? 's' : ''})`,
                parse_mode: 'HTML'
            });
        }
        
        // Send summary
        await ctx.reply(
            `📦 <b>ALL DATA DOWNLOAD COMPLETE</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
            `📋 Tasks: ${tasks.length} item${tasks.length !== 1 ? 's' : ''}\n` +
            `📜 History: ${history.length} item${history.length !== 1 ? 's' : ''}\n` +
            `🗒️ Notes: ${notes.length} item${notes.length !== 1 ? 's' : ''}\n` +
            `📊 Total: ${totalItems} items\n` +
            `📁 3 JSON files sent\n` +
            `📅 ${formatDateTime(new Date())}\n━━━━━━━━━━━━━━━━━━━━`,
            { parse_mode: 'HTML' }
        );
        
        await ctx.answerCbQuery(`✅ Sent ${totalItems} items across 3 files`);
    } catch (error) {
        console.error('Error downloading all data:', error);
        await ctx.answerCbQuery('❌ Error sending files');
        await ctx.reply('❌ Failed to send files. Please try again.');
    }
});

// ==========================================
// 🗑️ DELETE DATA MENU (FIXED)
// ==========================================

bot.action('delete_menu', async (ctx) => {
    try {
        const text = `🗑️ <b>𝗗𝗘𝗟𝗘𝗧𝗘 𝗗𝗔𝗧𝗔</b>\n━━━━━━━━━━━━━━━━━━━━\n⚠️ <b>Select what you want to delete:</b>`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📋 Delete All Tasks', 'delete_tasks_confirm')],
            [Markup.button.callback('📜 Delete All History', 'delete_history_confirm')],
            [Markup.button.callback('🗒️ Delete All Notes', 'delete_notes_confirm')],
            [Markup.button.callback('🔥 Delete EVERYTHING', 'delete_all_confirm')],
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, text, keyboard);
    } catch (error) {
        console.error('Error in delete_menu:', error);
        await ctx.answerCbQuery('❌ Error loading delete menu');
    }
});

bot.action('delete_tasks_confirm', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const taskCount = await db.collection('tasks').countDocuments({ userId });
        
        const text = `⚠️ <b>𝗖𝗢𝗡𝗙𝗜𝗥𝗠 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ${taskCount} task${taskCount !== 1 ? 's' : ''}?\n\n⚠️ <b>This action cannot be undone!</b>\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, DELETE ALL TASKS', 'delete_tasks_final')],
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
        const userId = ctx.from.id;
        
        // Get all tasks before deletion for backup
        const tasks = await db.collection('tasks').find({ userId }).toArray();
        
        // Cancel all schedules first
        tasks.forEach(t => cancelTaskSchedule(t.taskId));
        
        // Delete from database
        const result = await db.collection('tasks').deleteMany({ userId });
        
        // Send backup file if there were tasks
        if (tasks.length > 0) {
            const backupBuff = Buffer.from(JSON.stringify(tasks, null, 2));
            try {
                await ctx.replyWithDocument({ 
                    source: backupBuff, 
                    filename: `tasks_backup_${Date.now()}.json` 
                });
            } catch (sendError) {
                console.error('Error sending backup:', sendError);
            }
        }
        
        // Show success message
        const successText = `✅ <b>𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${result.deletedCount} task${result.deletedCount !== 1 ? 's' : ''}\n${tasks.length > 0 ? '📁 Backup file sent!\n' : ''}━━━━━━━━━━━━━━━━━━━━`;
        
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

bot.action('delete_history_confirm', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const historyCount = await db.collection('history').countDocuments({ userId });
        
        const text = `⚠️ <b>𝗖𝗢𝗡𝗙𝗜𝗥𝗠 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ${historyCount} history item${historyCount !== 1 ? 's' : ''}?\n\n⚠️ <b>This action cannot be undone!</b>\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, DELETE ALL HISTORY', 'delete_history_final')],
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
        const userId = ctx.from.id;
        
        // Get all history before deletion for backup
        const history = await db.collection('history').find({ userId }).toArray();
        
        // Delete from database
        const result = await db.collection('history').deleteMany({ userId });
        
        // Send backup file if there were history items
        if (history.length > 0) {
            const backupBuff = Buffer.from(JSON.stringify(history, null, 2));
            try {
                await ctx.replyWithDocument({ 
                    source: backupBuff, 
                    filename: `history_backup_${Date.now()}.json` 
                });
            } catch (sendError) {
                console.error('Error sending backup:', sendError);
            }
        }
        
        // Show success message
        const successText = `✅ <b>𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${result.deletedCount} history item${result.deletedCount !== 1 ? 's' : ''}\n${history.length > 0 ? '📁 Backup file sent!\n' : ''}━━━━━━━━━━━━━━━━━━━━`;
        
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

bot.action('delete_notes_confirm', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const notesCount = await db.collection('notes').countDocuments({ userId });
        
        const text = `⚠️ <b>𝗖𝗢𝗡𝗙𝗜𝗥𝗠 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ${notesCount} note${notesCount !== 1 ? 's' : ''}?\n\n⚠️ <b>This action cannot be undone!</b>\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, DELETE ALL NOTES', 'delete_notes_final')],
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
        const userId = ctx.from.id;
        
        // Get all notes before deletion for backup
        const notes = await db.collection('notes').find({ userId }).toArray();
        
        // Delete from database
        const result = await db.collection('notes').deleteMany({ userId });
        
        // Send backup file if there were notes
        if (notes.length > 0) {
            const backupBuff = Buffer.from(JSON.stringify(notes, null, 2));
            try {
                await ctx.replyWithDocument({ 
                    source: backupBuff, 
                    filename: `notes_backup_${Date.now()}.json` 
                });
            } catch (sendError) {
                console.error('Error sending backup:', sendError);
            }
        }
        
        // Show success message
        const successText = `✅ <b>𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${result.deletedCount} note${result.deletedCount !== 1 ? 's' : ''}\n${notes.length > 0 ? '📁 Backup file sent!\n' : ''}━━━━━━━━━━━━━━━━━━━━`;
        
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

bot.action('delete_all_confirm', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const tasksCount = await db.collection('tasks').countDocuments({ userId });
        const historyCount = await db.collection('history').countDocuments({ userId });
        const notesCount = await db.collection('notes').countDocuments({ userId });
        const totalCount = tasksCount + historyCount + notesCount;
        
        const text = `⚠️ <b>𝗙𝗜𝗡𝗔𝗟 𝗪𝗔𝗥𝗡𝗜𝗡𝗚</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ${totalCount} items?\n\n📋 Tasks: ${tasksCount}\n📜 History: ${historyCount}\n🗒️ Notes: ${notesCount}\n\n<b>⚠️ THIS ACTION CANNOT BE UNDONE!</b>\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔥 YES, DELETE EVERYTHING', 'delete_all_final')],
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
        const userId = ctx.from.id;
        
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
        const timestamp = Date.now();
        
        // 4. Send backup files for each collection that had data
        if (tasks.length > 0) {
            const tasksBuff = Buffer.from(JSON.stringify(tasks, null, 2));
            await ctx.replyWithDocument({ 
                source: tasksBuff, 
                filename: `all_backup_tasks_${timestamp}.json` 
            });
        }
        
        if (history.length > 0) {
            const histBuff = Buffer.from(JSON.stringify(history, null, 2));
            await ctx.replyWithDocument({ 
                source: histBuff, 
                filename: `all_backup_history_${timestamp}.json` 
            });
        }
        
        if (notes.length > 0) {
            const notesBuff = Buffer.from(JSON.stringify(notes, null, 2));
            await ctx.replyWithDocument({ 
                source: notesBuff, 
                filename: `all_backup_notes_${timestamp}.json` 
            });
        }
        
        // Show success message
        const successText = `✅ <b>𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${totalDeleted} items total\n\n📋 Tasks: ${tasksResult.deletedCount}\n📜 History: ${historyResult.deletedCount}\n🗒️ Notes: ${notesResult.deletedCount}\n\n${(tasks.length + history.length + notes.length) > 0 ? '📁 Backup files sent!\n' : ''}━━━━━━━━━━━━━━━━━━━━`;
        
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

// Dummy action for pagination
bot.action('no_action', async (ctx) => {
    await ctx.answerCbQuery();
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
            
            // Start auto-complete scheduler
            scheduleAutoComplete();
            
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
    
    // Cancel auto-complete job
    if (autoCompleteJob) {
        autoCompleteJob.cancel();
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
    
    // Cancel auto-complete job
    if (autoCompleteJob) {
        autoCompleteJob.cancel();
    }
    
    bot.stop('SIGTERM');
    if (client) client.close();
    console.log('👋 Bot stopped gracefully');
    process.exit(0);
});

// Start the bot
start();
