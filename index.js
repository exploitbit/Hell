const { Telegraf, session: telegrafSession, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const schedule = require('node-schedule');
const express = require('express');
const path = require('path');
const crypto = require('crypto');

// ==========================================
// ⚙️ CONFIGURATION - DIRECT HARDCODED VALUES
// ==========================================
const BOT_TOKEN = '8388773187:AAGeJLg_0U2qj9sg9awJ9aQVdF9klxEiRw4';
const MONGODB_URI = 'mongodb+srv://sandip:9E9AISFqTfU3VI5i@cluster0.p8irtov.mongodb.net/telegram_bot';
const PORT = 3000;
const WEB_APP_URL = 'https://web-production-e5ea9.up.railway.app';

// Initialize Express app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 🗄️ DATABASE CONNECTION - GLOBAL NO USER ID
// ==========================================
let db;
let client;

async function connectDB() {
    let retries = 5;
    while (retries > 0) {
        try {
            client = new MongoClient(MONGODB_URI, {
                serverSelectionTimeoutMS: 10000,
                connectTimeoutMS: 15000,
                socketTimeoutMS: 45000,
                maxPoolSize: 50,
                minPoolSize: 5
            });
            
            await client.connect();
            db = client.db('telegram_bot');
            console.log('✅ Connected to MongoDB - Global Mode');
            
            // Create indexes for global access
            try {
                await db.collection('tasks').createIndex({ taskId: 1 }, { unique: true });
                await db.collection('tasks').createIndex({ nextOccurrence: 1 });
                await db.collection('tasks').createIndex({ orderIndex: 1 });
                await db.collection('history').createIndex({ completedAt: -1 });
                await db.collection('history').createIndex({ originalTaskId: 1 });
                await db.collection('history').createIndex({ completedDate: -1 });
                await db.collection('notes').createIndex({ noteId: 1 }, { unique: true });
                await db.collection('notes').createIndex({ orderIndex: 1 });
                console.log('✅ Indexes created');
            } catch (indexError) {
                console.warn('⚠️ Index creation warning:', indexError.message);
            }
            
            return true;
        } catch (error) {
            retries--;
            console.error(`❌ MongoDB Connection Error (${retries} retries left):`, error.message);
            if (retries === 0) {
                console.error('❌ Failed to connect to MongoDB after multiple attempts');
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    return false;
}

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Telegram Bot
const bot = new Telegraf(BOT_TOKEN);

// Map to store active jobs: key = taskId, value = { startJob, interval }
const activeSchedules = new Map();
let hourlySummaryJob = null;
let autoCompleteJob = null;
let isShuttingDown = false;

// ==========================================
// 🛠️ UTC UTILITY FUNCTIONS - NO TIMEZONE
// ==========================================

function generateId(prefix = '', length = 8) {
    return prefix + Math.random().toString(36).substring(2, 2 + length) + '_' + Date.now();
}

async function safeEdit(ctx, text, keyboard = null) {
    try {
        const options = { 
            parse_mode: 'HTML',
            ...(keyboard && { reply_markup: keyboard.reply_markup })
        };
        await ctx.editMessageText(text, options);
    } catch (err) {
        if (err.description && (
            err.description.includes("message is not modified") || 
            err.description.includes("message can't be edited")
        )) {
            try {
                const options = { 
                    parse_mode: 'HTML',
                    ...(keyboard && { reply_markup: keyboard.reply_markup })
                };
                await ctx.reply(text, options);
            } catch (e) { 
                console.error('SafeEdit Reply Error:', e.message);
            }
            return;
        }
        console.error('SafeEdit Error:', err.message);
    }
}

function formatBlockquote(text) {
    if (!text || text.trim() === '') return '';
    return `<blockquote>${text}</blockquote>`;
}

function calculateSubtaskProgress(subtasks) {
    if (!subtasks || subtasks.length === 0) return 0;
    const completed = subtasks.filter(s => s.completed).length;
    return Math.round((completed / subtasks.length) * 100);
}

function calculateDuration(startDate, endDate) {
    return Math.round((endDate - startDate) / 60000);
}

function formatDuration(minutes) {
    if (minutes < 0) return '0 mins';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} min${mins !== 1 ? 's' : ''}`;
    if (mins === 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
    return `${hours} hour${hours !== 1 ? 's' : ''} ${mins} min${mins !== 1 ? 's' : ''}`;
}

function formatDateUTC(utcDate) {
    return utcDate.toISOString().split('T')[0].split('-').reverse().join('-');
}

function formatTimeUTC(utcDate) {
    return utcDate.toISOString().split('T')[1].substring(0, 5);
}

function formatDateTimeUTC(utcDate) {
    return `${formatDateUTC(utcDate)} at ${formatTimeUTC(utcDate)} UTC`;
}

function getTodayUTC() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getTomorrowUTC() {
    const today = getTodayUTC();
    return new Date(today.getTime() + 24 * 60 * 60 * 1000);
}

// ==========================================
// ⏰ SCHEDULER LOGIC
// ==========================================

function scheduleTask(task) {
    if (!task || !task.taskId || !task.startDate) return;
    
    try {
        const taskId = task.taskId;
        const startTime = new Date(task.startDate);
        const now = new Date();

        cancelTaskSchedule(taskId);

        if (startTime <= now) {
            console.log(`⏰ Skipping task ${task.title} - start time has passed`);
            return;
        }

        const notifyTime = new Date(startTime.getTime() - 10 * 60000);
        const triggerDate = notifyTime > now ? notifyTime : now;

        console.log(`⏰ Scheduled: ${task.title} for ${formatDateTimeUTC(startTime)}`);

        const startJob = schedule.scheduleJob(triggerDate, async function() {
            if (isShuttingDown) return;
            
            console.log(`🔔 Starting notifications for task: ${task.title}`);
            
            let count = 0;
            const maxNotifications = 10;
            
            const sendNotification = async () => {
                if (isShuttingDown) return;
                
                const currentTime = new Date();
                
                if (currentTime >= startTime || count >= maxNotifications) {
                    const activeSchedule = activeSchedules.get(taskId);
                    if (activeSchedule && activeSchedule.interval) {
                        clearInterval(activeSchedule.interval);
                        activeSchedule.interval = null;
                    }
                    
                    if (currentTime >= startTime) {
                        try {
                            await bot.telegram.sendMessage(-1001234567890, 
                                `🚀 <b>𝙏𝘼𝙎𝙆 𝙎𝙏𝘼𝙍𝙏𝙀𝘿 𝙉𝙊𝙒!</b>\n` +
                                `📌 <b>Title: ${task.title}</b>\n\n` +
                                `Time to work! ⏰`, 
                                { parse_mode: 'HTML' }
                            );
                        } catch (e) {
                            console.error('Error sending start message:', e.message);
                        }
                    }
                    
                    return;
                }

                const minutesLeft = Math.ceil((startTime - currentTime) / 60000);
                if (minutesLeft <= 0) return;

                try {
                    await bot.telegram.sendMessage(-1001234567890, 
                        `🔔 <b>𝗥𝗘𝗠𝗜𝗡𝗗𝗘𝗥 (${count + 1}/${maxNotifications})</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `📌 <b>${task.title}</b>\n` +
                        `⏳ Starts in: <b>${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}</b>\n` +
                        `⏰ Start Time: ${formatTimeUTC(startTime)} UTC\n` +
                        `📅 Date: ${formatDateUTC(startTime)}\n` +
                        `━━━━━━━━━━━━━━━━━━━━`, 
                        { parse_mode: 'HTML' }
                    );
                } catch (e) {
                    console.error('Error sending notification:', e.message);
                }
                
                count++;
            };

            await sendNotification();
            
            const interval = setInterval(sendNotification, 60000);
            
            if (activeSchedules.has(taskId)) {
                if (activeSchedules.get(taskId).interval) {
                    clearInterval(activeSchedules.get(taskId).interval);
                }
                activeSchedules.get(taskId).interval = interval;
            } else {
                activeSchedules.set(taskId, { startJob, interval });
            }
        });

        if (activeSchedules.has(taskId)) {
            if (activeSchedules.get(taskId).startJob) {
                activeSchedules.get(taskId).startJob.cancel();
            }
            activeSchedules.get(taskId).startJob = startJob;
        } else {
            activeSchedules.set(taskId, { startJob });
        }

    } catch (error) {
        console.error(`❌ Scheduler Error for task ${task?.taskId}:`, error.message);
    }
}

function cancelTaskSchedule(taskId) {
    if (activeSchedules.has(taskId)) {
        const s = activeSchedules.get(taskId);
        if (s.startJob) {
            try { s.startJob.cancel(); } catch (e) {}
        }
        if (s.interval) {
            try { clearInterval(s.interval); } catch (e) {}
        }
        activeSchedules.delete(taskId);
        console.log(`🗑️ Cleared schedules for task ${taskId}`);
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
        console.error('❌ Error rescheduling tasks:', error.message);
    }
}

// ==========================================
// ⏰ AUTO-COMPLETE PENDING TASKS AT 23:59 UTC
// ==========================================

async function autoCompletePendingTasks() {
    console.log(`⏰ Running auto-complete for pending tasks at 23:59 UTC...`);
    
    try {
        const todayUTC = getTodayUTC();
        const tomorrowUTC = getTomorrowUTC();
        
        const pendingTasks = await db.collection('tasks').find({
            status: 'pending',
            nextOccurrence: {
                $gte: todayUTC,
                $lt: tomorrowUTC
            }
        }).toArray();
        
        console.log(`📋 Found ${pendingTasks.length} pending tasks to auto-complete`);
        
        for (const task of pendingTasks) {
            await autoCompleteTask(task);
        }
        
        console.log(`✅ Auto-completed ${pendingTasks.length} tasks`);
    } catch (error) {
        console.error('❌ Error in auto-complete:', error.message);
    }
}

async function autoCompleteTask(task) {
    try {
        const taskId = task.taskId;
        const completedAtUTC = new Date();
        const completedDateUTC = getTodayUTC();
        
        const historyItem = {
            ...task,
            _id: undefined,
            completedAt: completedAtUTC,
            completedDate: completedDateUTC,
            originalTaskId: task.taskId,
            status: 'completed',
            completedFromDate: task.nextOccurrence,
            autoCompleted: true
        };
        
        delete historyItem._id;
        
        await db.collection('history').insertOne(historyItem);
        
        cancelTaskSchedule(taskId);
        
        if (task.repeat !== 'none' && task.repeatCount > 0) {
            const nextOccurrence = new Date(task.nextOccurrence);
            const daysToAdd = task.repeat === 'weekly' ? 7 : 1;
            nextOccurrence.setUTCDate(nextOccurrence.getUTCDate() + daysToAdd);
            
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
            if (updatedTask && updatedTask.nextOccurrence > new Date()) {
                scheduleTask(updatedTask);
            }
        } else {
            await db.collection('tasks').deleteOne({ taskId });
        }
        
        try {
            await bot.telegram.sendMessage(-1001234567890,
                `⏰ <b>𝗔𝗨𝗧𝗢-𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗧𝗔𝗦𝗞</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 <b>${task.title}</b>\n` +
                `✅ Automatically completed at 23:59 UTC\n` +
                `📅 ${formatDateUTC(completedAtUTC)}\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {
            console.error('Error sending auto-complete notification:', e.message);
        }
        
    } catch (error) {
        console.error(`Error auto-completing task ${task.taskId}:`, error.message);
    }
}

function scheduleAutoComplete() {
    if (autoCompleteJob) {
        autoCompleteJob.cancel();
    }
    
    autoCompleteJob = schedule.scheduleJob('59 23 * * *', async () => {
        if (!isShuttingDown) await autoCompletePendingTasks();
    });
    
    console.log('✅ Auto-complete scheduler started (23:59 UTC daily)');
}

// ==========================================
// 📱 WEB INTERFACE ROUTES - NO SESSION, GLOBAL DATA
// ==========================================

// NO SESSION MIDDLEWARE - Everyone sees same data

app.get('/', (req, res) => {
    res.redirect('/tasks');
});

app.get('/tasks', async (req, res) => {
    try {
        const todayUTC = getTodayUTC();
        const tomorrowUTC = getTomorrowUTC();
        
        const [tasks, completedTasks] = await Promise.all([
            db.collection('tasks').find({
                status: 'pending',
                nextOccurrence: {
                    $gte: todayUTC,
                    $lt: tomorrowUTC
                }
            }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray(),
            
            db.collection('history').find({
                completedAt: {
                    $gte: todayUTC,
                    $lt: tomorrowUTC
                }
            }).sort({ completedAt: -1 }).toArray()
        ]);
        
        console.log(`📊 Tasks found: ${tasks.length}, Completed: ${completedTasks.length}`);
        
        res.render('tasks', {
            tasks: tasks.map(task => ({
                ...task,
                startTimeUTC: formatTimeUTC(task.startDate),
                endTimeUTC: formatTimeUTC(task.endDate),
                dateUTC: formatDateUTC(task.startDate),
                duration: calculateDuration(task.startDate, task.endDate),
                durationFormatted: formatDuration(calculateDuration(task.startDate, task.endDate)),
                subtaskProgress: calculateSubtaskProgress(task.subtasks)
            })),
            completedTasks: completedTasks.map(task => ({
                ...task,
                completedTimeUTC: formatTimeUTC(task.completedAt),
                dateUTC: formatDateUTC(task.completedAt)
            })),
            currentTime: formatTimeUTC(new Date()),
            currentDate: formatDateUTC(new Date())
        });
    } catch (error) {
        console.error('Error loading tasks:', error);
        res.status(500).send('Error loading tasks: ' + error.message);
    }
});

app.get('/notes', async (req, res) => {
    try {
        const notes = await db.collection('notes').find()
            .sort({ orderIndex: 1, createdAt: -1 })
            .toArray();
        
        console.log(`📝 Notes found: ${notes.length}`);
        
        res.render('notes', {
            notes: notes.map(note => ({
                ...note,
                createdAtUTC: formatDateTimeUTC(note.createdAt),
                updatedAtUTC: note.updatedAt ? formatDateTimeUTC(note.updatedAt) : null
            }))
        });
    } catch (error) {
        console.error('Error loading notes:', error);
        res.status(500).send('Error loading notes: ' + error.message);
    }
});

app.get('/history', async (req, res) => {
    try {
        const history = await db.collection('history').find()
            .sort({ completedAt: -1 })
            .limit(100)
            .toArray();
        
        const groupedHistory = {};
        history.forEach(item => {
            const dateKey = formatDateUTC(item.completedAt);
            if (!groupedHistory[dateKey]) {
                groupedHistory[dateKey] = [];
            }
            groupedHistory[dateKey].push({
                ...item,
                completedTimeUTC: formatTimeUTC(item.completedAt)
            });
        });
        
        console.log(`📜 History entries: ${history.length}`);
        
        res.render('history', { groupedHistory });
    } catch (error) {
        console.error('Error loading history:', error);
        res.status(500).send('Error loading history: ' + error.message);
    }
});

app.post('/api/tasks', async (req, res) => {
    try {
        const { title, description, startDate, startTime, duration, repeat, repeatCount } = req.body;
        
        if (!title || !startDate || !startTime || !duration) {
            return res.status(400).send('Missing required fields');
        }
        
        const [year, month, day] = startDate.split('-').map(Number);
        const [hour, minute] = startTime.split(':').map(Number);
        
        const startDateUTC = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
        const endDateUTC = new Date(startDateUTC.getTime() + (parseInt(duration) * 60 * 1000));
        
        const highestTask = await db.collection('tasks').findOne(
            {},
            { sort: { orderIndex: -1 } }
        );
        const nextOrderIndex = highestTask ? highestTask.orderIndex + 1 : 0;
        
        const task = {
            taskId: generateId('task_'),
            title: title.trim(),
            description: description ? description.trim() : '',
            startDate: startDateUTC,
            endDate: endDateUTC,
            nextOccurrence: startDateUTC,
            status: 'pending',
            repeat: repeat || 'none',
            repeatCount: repeat && repeat !== 'none' ? (parseInt(repeatCount) || 10) : 0,
            subtasks: [],
            createdAt: new Date(),
            orderIndex: nextOrderIndex,
            startTimeStr: startTime
        };
        
        await db.collection('tasks').insertOne(task);
        console.log(`✅ Task created: ${task.title} (${task.taskId})`);
        
        if (task.startDate > new Date()) {
            scheduleTask(task);
        }
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).send('Error creating task: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/complete', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        
        const task = await db.collection('tasks').findOne({ taskId });
        if (!task) {
            return res.status(404).send('Task not found');
        }
        
        const subtasks = task.subtasks || [];
        const incompleteSubtasks = subtasks.filter(s => !s.completed);
        
        if (incompleteSubtasks.length > 0) {
            return res.status(400).json({ 
                error: 'Complete all subtasks first',
                incompleteCount: incompleteSubtasks.length 
            });
        }
        
        const completedAtUTC = new Date();
        const completedDateUTC = getTodayUTC();
        
        const historyItem = {
            ...task,
            _id: undefined,
            completedAt: completedAtUTC,
            completedDate: completedDateUTC,
            originalTaskId: task.taskId,
            status: 'completed',
            completedFromDate: task.nextOccurrence,
            subtasks: task.subtasks
        };
        
        delete historyItem._id;
        
        await db.collection('history').insertOne(historyItem);
        
        cancelTaskSchedule(taskId);
        
        if (task.repeat !== 'none' && task.repeatCount > 0) {
            const nextOccurrence = new Date(task.nextOccurrence);
            const daysToAdd = task.repeat === 'weekly' ? 7 : 1;
            nextOccurrence.setUTCDate(nextOccurrence.getUTCDate() + daysToAdd);
            
            const resetSubtasks = (task.subtasks || []).map(s => ({
                ...s,
                completed: false
            }));
            
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
            
            const updatedTask = await db.collection('tasks').findOne({ taskId });
            if (updatedTask && updatedTask.nextOccurrence > new Date()) {
                scheduleTask(updatedTask);
            }
            
            try {
                await bot.telegram.sendMessage(-1001234567890,
                    `✅ <b>𝗧𝗔𝗦𝗞 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 <b>${task.title}</b>\n` +
                    `🔄 Next occurrence: ${formatDateUTC(nextOccurrence)}\n` +
                    `📊 Remaining repeats: ${task.repeatCount - 1}\n` +
                    `━━━━━━━━━━━━━━━━━━━━`,
                    { parse_mode: 'HTML' }
                );
            } catch (e) {}
        } else {
            await db.collection('tasks').deleteOne({ taskId });
            
            try {
                await bot.telegram.sendMessage(-1001234567890,
                    `✅ <b>𝗧𝗔𝗦𝗞 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 <b>${task.title}</b>\n` +
                    `📅 Completed at: ${formatDateTimeUTC(completedAtUTC)}\n` +
                    `━━━━━━━━━━━━━━━━━━━━`,
                    { parse_mode: 'HTML' }
                );
            } catch (e) {}
        }
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error completing task:', error);
        res.status(500).send('Error completing task: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/delete', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        
        cancelTaskSchedule(taskId);
        await db.collection('tasks').deleteOne({ taskId });
        
        console.log(`🗑️ Task deleted: ${taskId}`);
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).send('Error deleting task: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/subtasks', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const { title, description } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).send('Subtask title cannot be empty');
        }
        
        const task = await db.collection('tasks').findOne({ taskId });
        if (!task) {
            return res.status(404).send('Task not found');
        }
        
        const currentSubtasks = task.subtasks || [];
        if (currentSubtasks.length >= 10) {
            return res.status(400).send('Maximum subtasks limit (10) reached');
        }
        
        const subtask = {
            id: generateId('sub_'),
            title: title.trim(),
            description: description ? description.trim() : '',
            completed: false,
            createdAt: new Date()
        };
        
        await db.collection('tasks').updateOne(
            { taskId },
            { $push: { subtasks: subtask } }
        );
        
        console.log(`➕ Subtask added to ${task.title}: ${subtask.title}`);
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error adding subtask:', error);
        res.status(500).send('Error adding subtask: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/toggle', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const subtaskId = req.params.subtaskId;
        
        const task = await db.collection('tasks').findOne({ taskId });
        if (!task) {
            return res.status(404).send('Task not found');
        }
        
        const subtask = (task.subtasks || []).find(s => s.id === subtaskId);
        if (!subtask) {
            return res.status(404).send('Subtask not found');
        }
        
        await db.collection('tasks').updateOne(
            { taskId, "subtasks.id": subtaskId },
            { $set: { "subtasks.$.completed": !subtask.completed } }
        );
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error toggling subtask:', error);
        res.status(500).send('Error toggling subtask: ' + error.message);
    }
});

app.post('/api/tasks/:taskId/subtasks/:subtaskId/delete', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        const subtaskId = req.params.subtaskId;
        
        await db.collection('tasks').updateOne(
            { taskId },
            { $pull: { subtasks: { id: subtaskId } } }
        );
        
        res.redirect('/tasks');
    } catch (error) {
        console.error('Error deleting subtask:', error);
        res.status(500).send('Error deleting subtask: ' + error.message);
    }
});

app.post('/api/notes', async (req, res) => {
    try {
        const { title, description } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).send('Note title cannot be empty');
        }
        
        const highestNote = await db.collection('notes').findOne(
            {},
            { sort: { orderIndex: -1 } }
        );
        const nextOrderIndex = highestNote ? highestNote.orderIndex + 1 : 0;
        
        const note = {
            noteId: generateId('note_'),
            title: title.trim(),
            description: description ? description.trim() : '',
            createdAt: new Date(),
            updatedAt: new Date(),
            orderIndex: nextOrderIndex
        };
        
        await db.collection('notes').insertOne(note);
        
        console.log(`📝 Note created: ${note.title} (${note.noteId})`);
        
        res.redirect('/notes');
    } catch (error) {
        console.error('Error creating note:', error);
        res.status(500).send('Error creating note: ' + error.message);
    }
});

app.post('/api/notes/:noteId/update', async (req, res) => {
    try {
        const noteId = req.params.noteId;
        const { title, description } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).send('Note title cannot be empty');
        }
        
        await db.collection('notes').updateOne(
            { noteId },
            { 
                $set: { 
                    title: title.trim(), 
                    description: description ? description.trim() : '',
                    updatedAt: new Date() 
                } 
            }
        );
        
        console.log(`✏️ Note updated: ${noteId}`);
        
        res.redirect('/notes');
    } catch (error) {
        console.error('Error updating note:', error);
        res.status(500).send('Error updating note: ' + error.message);
    }
});

app.post('/api/notes/:noteId/delete', async (req, res) => {
    try {
        const noteId = req.params.noteId;
        
        await db.collection('notes').deleteOne({ noteId });
        
        console.log(`🗑️ Note deleted: ${noteId}`);
        
        res.redirect('/notes');
    } catch (error) {
        console.error('Error deleting note:', error);
        res.status(500).send('Error deleting note: ' + error.message);
    }
});

app.post('/api/notes/:noteId/move', async (req, res) => {
    try {
        const noteId = req.params.noteId;
        const { direction } = req.body;
        
        const notes = await db.collection('notes')
            .find()
            .sort({ orderIndex: 1 })
            .toArray();
        
        const currentIndex = notes.findIndex(n => n.noteId === noteId);
        if (currentIndex === -1) {
            return res.status(404).send('Note not found');
        }
        
        if (direction === 'up' && currentIndex > 0) {
            const tempOrder = notes[currentIndex].orderIndex;
            notes[currentIndex].orderIndex = notes[currentIndex - 1].orderIndex;
            notes[currentIndex - 1].orderIndex = tempOrder;
            
            await db.collection('notes').updateOne(
                { noteId: notes[currentIndex].noteId },
                { $set: { orderIndex: notes[currentIndex].orderIndex } }
            );
            
            await db.collection('notes').updateOne(
                { noteId: notes[currentIndex - 1].noteId },
                { $set: { orderIndex: notes[currentIndex - 1].orderIndex } }
            );
        } else if (direction === 'down' && currentIndex < notes.length - 1) {
            const tempOrder = notes[currentIndex].orderIndex;
            notes[currentIndex].orderIndex = notes[currentIndex + 1].orderIndex;
            notes[currentIndex + 1].orderIndex = tempOrder;
            
            await db.collection('notes').updateOne(
                { noteId: notes[currentIndex].noteId },
                { $set: { orderIndex: notes[currentIndex].orderIndex } }
            );
            
            await db.collection('notes').updateOne(
                { noteId: notes[currentIndex + 1].noteId },
                { $set: { orderIndex: notes[currentIndex + 1].orderIndex } }
            );
        }
        
        res.redirect('/notes');
    } catch (error) {
        console.error('Error moving note:', error);
        res.status(500).send('Error moving note: ' + error.message);
    }
});

// ==========================================
// 🤖 BOT COMMANDS - GLOBAL, NO USER ID
// ==========================================

const CHAT_ID = -1001234567890; // Replace with your group/channel ID

bot.use(telegrafSession());

bot.use((ctx, next) => {
    if (!ctx.session) {
        ctx.session = {};
    }
    return next();
});

bot.command('start', async (ctx) => {
    ctx.session = {};
    
    const text = `
┌─━━━━━━━━━━━━━━━─┐
│    ✧ 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 ✧    │ 
└─━━━━━━━━━━━━━━━─┘
⏰ Current Time: ${formatTimeUTC(new Date())} UTC
📅 Today: ${formatDateUTC(new Date())}

🌟 <b>Welcome to Global Task Manager!</b>
🌍 Everyone sees the same tasks and notes
📢 All notifications will be sent here`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📋 Today\'s Tasks', 'view_today_tasks_1')],
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
        ],
        [Markup.button.url('🌐 Open Web App', WEB_APP_URL)]
    ]);

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
});

bot.action('main_menu', async (ctx) => {
    await showMainMenu(ctx);
});

async function showMainMenu(ctx) {
    const text = `
┌─━━━━━━━━━━━━━━━─┐
│    ✧ 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 ✧    │ 
└─━━━━━━━━━━━━━━━─┘
⏰ Current Time: ${formatTimeUTC(new Date())} UTC
📅 Today: ${formatDateUTC(new Date())}

🌟 <b>Select an option:</b>`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📋 Today\'s Tasks', 'view_today_tasks_1')],
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
        ],
        [Markup.button.url('🌐 Open Web App', WEB_APP_URL)]
    ]);

    await safeEdit(ctx, text, keyboard);
}

// ==========================================
// 📅 TASK VIEWS - WITH PAGINATION
// ==========================================

bot.action(/^view_today_tasks_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const todayUTC = getTodayUTC();
    const tomorrowUTC = getTomorrowUTC();
    
    const perPage = 10;
    const skip = (page - 1) * perPage;
    
    const totalTasks = await db.collection('tasks').countDocuments({ 
        status: 'pending',
        nextOccurrence: { 
            $gte: todayUTC,
            $lt: tomorrowUTC
        }
    });
    
    const totalPages = Math.max(1, Math.ceil(totalTasks / perPage));
    
    const tasks = await db.collection('tasks')
        .find({ 
            status: 'pending',
            nextOccurrence: { 
                $gte: todayUTC,
                $lt: tomorrowUTC
            }
        })
        .sort({ orderIndex: 1, nextOccurrence: 1 })
        .skip(skip)
        .limit(perPage)
        .toArray();

    let text = `
📋 <b>𝗧𝗢𝗗𝗔𝗬'𝗦 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦</b>

━━━━━━━━━━━━━━━━━━━━
📅 Date: ${formatDateUTC(todayUTC)}
📊 Total: ${totalTasks} task${totalTasks !== 1 ? 's' : ''}
📄 Page: ${page}/${totalPages}
━━━━━━━━━━━━━━━━━━━━

Select a task to view details:`;

    if (tasks.length === 0) {
        text = `
📋 <b>𝗧𝗢𝗗𝗔𝗬'𝗦 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦</b>

━━━━━━━━━━━━━━━━━━━━
📅 Date: ${formatDateUTC(todayUTC)}
📭 <i>No tasks scheduled for today!</i>
━━━━━━━━━━━━━━━━━━━━`;
    }

    const buttons = [];
    
    tasks.forEach((t, index) => {
        const taskNum = skip + index + 1;
        let taskTitle = t.title;
        
        if (t.subtasks && t.subtasks.length > 0) {
            const progress = calculateSubtaskProgress(t.subtasks);
            taskTitle += ` [${progress}%]`;
        }
        
        if (taskTitle.length > 30) {
            taskTitle = taskTitle.substring(0, 27) + '...';
        }
        
        buttons.push([
            Markup.button.callback(
                `${taskNum}. ${taskTitle}`, 
                `task_det_${t.taskId}`
            )
        ]);
    });

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
// ➕ ADD TASK WIZARD - WITH BOT-STYLE TEXT BOXES
// ==========================================

bot.action('add_task', async (ctx) => {
    ctx.session.step = 'task_title';
    ctx.session.task = { 
        taskId: generateId('task_'), 
        status: 'pending',
        createdAt: new Date(),
        subtasks: []
    };
    
    const text = `🎯 <b>𝗖𝗥𝗘𝗔𝗧𝗘 𝗡𝗘𝗪 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞</b>\n━━━━━━━━━━━━━━━━━━━━\nEnter the <b>Title</b> of your task (max 100 characters):`;
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'main_menu')]]);
    
    await safeEdit(ctx, text, keyboard);
});

bot.action('add_note', async (ctx) => {
    ctx.session.step = 'note_title';
    ctx.session.note = { 
        noteId: generateId('note_'), 
        createdAt: new Date()
    };
    
    const text = `📝 <b>𝗖𝗥𝗘𝗔𝗧𝗘 𝗡𝗘𝗪 𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\nEnter the <b>Title</b> for your note (max 200 characters):`;
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'main_menu')]]);
    
    await safeEdit(ctx, text, keyboard);
});

// ==========================================
// 📨 TEXT INPUT HANDLER - BOT-STYLE VALIDATION
// ==========================================

bot.on('text', async (ctx) => {
    if (!ctx.session || !ctx.session.step) return;
    
    try {
        const text = ctx.message.text.trim();
        const step = ctx.session.step;

        if (step === 'task_title') {
            if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
            if (text.length > 100) return ctx.reply('❌ Title too long. Max 100 characters.');
            
            ctx.session.task.title = text;
            ctx.session.step = 'task_desc';
            await ctx.reply(
                `📄 <b>𝗘𝗡𝗧𝗘𝗥 𝗗𝗘𝗦𝗖𝗥𝗜𝗣𝗧𝗜𝗢𝗡</b>\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📝 <i>Describe your task (Max 100 words):</i>\n` +
                `Enter "-" for no description`,
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'task_desc') {
            const description = text === '-' ? '' : text;
            if (description.length > 0 && description.split(/\s+/).length > 100) {
                return ctx.reply('❌ Too long! Keep it under 100 words.');
            }
            ctx.session.task.description = description;
            ctx.session.step = 'task_date';
            await ctx.reply(
                `📅 <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗗𝗔𝗧𝗘</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📆 Today (UTC): ${formatDateUTC(new Date())}\n` +
                `📝 <i>Enter the date (DD-MM-YYYY) in UTC:</i>`,
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'task_date') {
            if (!/^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-\d{4}$/.test(text)) {
                return ctx.reply('❌ Invalid date format. Use DD-MM-YYYY');
            }
            
            const [day, month, year] = text.split('-').map(Number);
            
            const today = getTodayUTC();
            const inputDate = new Date(Date.UTC(year, month - 1, day));
            
            if (inputDate < today) {
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
                `🕒 Current UTC Time: ${formatTimeUTC(new Date())}\n` +
                `📝 <i>Enter start time in HH:MM (24-hour UTC):</i>`,
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'task_start') {
            if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
                return ctx.reply('❌ Invalid format. Use HH:MM (24-hour).');
            }
            
            const [h, m] = text.split(':').map(Number);
            const { year, month, day } = ctx.session.task;
            
            const startDateUTC = new Date(Date.UTC(year, month - 1, day, h, m, 0));
            
            const now = new Date();
            
            if (startDateUTC <= now) {
                return ctx.reply('❌ Start time is in the past. Please enter a future time.');
            }
            
            ctx.session.task.startDate = startDateUTC;
            ctx.session.task.startTimeStr = text;
            ctx.session.task.nextOccurrence = startDateUTC;
            ctx.session.step = 'task_duration';
            
            await ctx.reply(
                `⏱️ <b>𝗦𝗘𝗟𝗘𝗖𝗧 𝗗𝗨𝗥𝗔𝗧𝗜𝗢𝗡</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `⏰ Start Time: ${text} UTC\n` +
                `📝 <i>Enter task duration in minutes (e.g., 15, 30, 60, 90, 120):</i>\n` +
                `📝 <i>Or enter end time in HH:MM format</i>`,
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'task_duration') {
            let endDateUTC;
            let endTimeStr;
            
            if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
                const [eh, em] = text.split(':').map(Number);
                const { year, month, day } = ctx.session.task;
                endDateUTC = new Date(Date.UTC(year, month - 1, day, eh, em, 0));
                endTimeStr = text;
            } else {
                const duration = parseInt(text);
                if (isNaN(duration) || duration < 1 || duration > 1440) {
                    return ctx.reply('❌ Please enter a valid duration between 1 and 1440 minutes, or end time in HH:MM format.');
                }
                endDateUTC = new Date(ctx.session.task.startDate.getTime() + duration * 60000);
                endTimeStr = endDateUTC.toISOString().split('T')[1].substring(0, 5);
            }
            
            if (endDateUTC <= ctx.session.task.startDate) {
                return ctx.reply('❌ End time must be after Start time.');
            }
            
            ctx.session.task.endDate = endDateUTC;
            ctx.session.task.endTimeStr = endTimeStr;
            ctx.session.step = null;

            const duration = calculateDuration(ctx.session.task.startDate, endDateUTC);
            
            await ctx.reply(
                `🔄 <b>𝗥𝗘𝗣𝗘𝗔𝗧 𝗢𝗣𝗧𝗜𝗢𝗡𝗦</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `How should this task repeat?\n\n` +
                `📅 Task Date: ${formatDateUTC(ctx.session.task.startDate)}\n` +
                `⏰ Time: ${ctx.session.task.startTimeStr} - ${endTimeStr} UTC\n` +
                `⏱️ Duration: ${formatDuration(duration)}\n\n`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('❌ No Repeat', 'repeat_none')],
                        [Markup.button.callback('📅 Daily', 'repeat_daily')],
                        [Markup.button.callback('📅 Weekly', 'repeat_weekly')],
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
        else if (step === 'note_title') {
            if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
            if (text.length > 200) return ctx.reply('❌ Title too long. Max 200 characters.');
            
            ctx.session.note.title = text;
            ctx.session.step = 'note_content';
            await ctx.reply(
                `📝 <b>𝗘𝗡𝗧𝗘𝗥 𝗡𝗢𝗧𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📝 <i>Enter note content (Max 400 words)</i>\n` +
                `Enter "-" for empty content`,
                { parse_mode: 'HTML' }
            );
        }
        else if (step === 'note_content') {
            const content = text === '-' ? '' : text;
            if (content.length > 0 && content.split(/\s+/).length > 400) {
                return ctx.reply('❌ Too long! Keep it under 400 words.');
            }
            
            ctx.session.note.content = content;
            ctx.session.note.createdAt = new Date();
            ctx.session.note.updatedAt = new Date();
            
            try {
                const highestNote = await db.collection('notes').findOne(
                    {},
                    { sort: { orderIndex: -1 } }
                );
                const nextOrderIndex = highestNote ? highestNote.orderIndex + 1 : 0;
                ctx.session.note.orderIndex = nextOrderIndex;
                
                const noteTitle = ctx.session.note.title;
                const noteContent = ctx.session.note.content;
                
                await db.collection('notes').insertOne(ctx.session.note);
                
                ctx.session.step = null;
                delete ctx.session.note;
                
                await ctx.reply(
                    `✅ <b>𝗡𝗢𝗧𝗘 𝗦𝗔𝗩𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬!</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 <b>${noteTitle}</b>\n` +
                    `${formatBlockquote(noteContent)}\n` +
                    `📅 Saved on: ${formatDateTimeUTC(new Date())} UTC`,
                    { parse_mode: 'HTML' }
                );
                
                await showMainMenu(ctx);
                
                try {
                    await bot.telegram.sendMessage(CHAT_ID,
                        `📝 <b>𝗡𝗘𝗪 𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘 𝗔𝗗𝗗𝗘𝗗</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `📌 <b>${noteTitle}</b>\n` +
                        `${formatBlockquote(noteContent)}\n` +
                        `📅 ${formatDateTimeUTC(new Date())} UTC\n` +
                        `━━━━━━━━━━━━━━━━━━━━`,
                        { parse_mode: 'HTML' }
                    );
                } catch (e) {}
                
            } catch (error) {
                console.error('Error saving note:', error);
                await ctx.reply('❌ Failed to save note. Please try again.');
            }
        }
        else if (step === 'add_subtasks') {
            const taskId = ctx.session.addSubtasksTaskId;
            
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
            
            const lines = text.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
            
            if (lines.length === 0) {
                return ctx.reply('❌ Please enter at least one subtask title.');
            }
            
            if (lines.length > availableSlots) {
                return ctx.reply(`❌ You can only add ${availableSlots} more subtask${availableSlots !== 1 ? 's' : ''}. Please enter ${availableSlots} or fewer.`);
            }
            
            const newSubtasks = lines.map(title => ({
                id: generateId('sub_'),
                title: title.substring(0, 100),
                description: '',
                completed: false,
                createdAt: new Date()
            }));
            
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
            
            await showTaskDetail(ctx, taskId);
        }
        else if (step === 'edit_subtask_title') {
            const { taskId, subtaskId } = ctx.session.editSubtask;
            
            if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
            if (text.length > 100) return ctx.reply('❌ Title too long. Max 100 characters.');
            
            try {
                await db.collection('tasks').updateOne(
                    { taskId, "subtasks.id": subtaskId },
                    { $set: { "subtasks.$.title": text } }
                );
                
                ctx.session.step = null;
                delete ctx.session.editSubtask;
                
                await ctx.reply(`✅ <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞 𝗨𝗣𝗗𝗔𝗧𝗘𝗗!</b>`, { parse_mode: 'HTML' });
                await showTaskDetail(ctx, taskId);
            } catch (error) {
                console.error('Error editing subtask:', error);
                await ctx.reply('❌ Failed to update subtask.');
            }
        }
        else if (step === 'edit_task_title') {
            const taskId = ctx.session.editTaskId;
            if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
            if (text.length > 100) return ctx.reply('❌ Title too long. Max 100 characters.');
            
            try {
                await db.collection('tasks').updateOne(
                    { taskId: taskId }, 
                    { $set: { title: text } }
                );
                
                await db.collection('history').updateMany(
                    { originalTaskId: taskId }, 
                    { $set: { title: text } }
                );
                
                ctx.session.step = null;
                delete ctx.session.editTaskId;
                await ctx.reply(`✅ <b>TITLE UPDATED!</b>`, { parse_mode: 'HTML' });
                await showTaskDetail(ctx, taskId);
                
                try {
                    await bot.telegram.sendMessage(CHAT_ID,
                        `✏️ <b>𝗧𝗔𝗦𝗞 𝗧𝗜𝗧𝗟𝗘 𝗨𝗣𝗗𝗔𝗧𝗘𝗗</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `📌 New Title: <b>${text}</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━`,
                        { parse_mode: 'HTML' }
                    );
                } catch (e) {}
            } catch (error) {
                console.error('Error updating title:', error);
                await ctx.reply('❌ Failed to update title.');
            }
        }
        else if (step === 'edit_task_desc') {
            const taskId = ctx.session.editTaskId;
            const description = text === '-' ? '' : text;
            if (description.length > 0 && description.split(/\s+/).length > 100) {
                return ctx.reply('❌ Too long! Max 100 words.');
            }
            
            try {
                await db.collection('tasks').updateOne(
                    { taskId: taskId }, 
                    { $set: { description: description } }
                );
                
                await db.collection('history').updateMany(
                    { originalTaskId: taskId }, 
                    { $set: { description: description } }
                );
                
                ctx.session.step = null;
                delete ctx.session.editTaskId;
                await ctx.reply(`✅ <b>DESCRIPTION UPDATED!</b>`, { parse_mode: 'HTML' });
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
                const task = await db.collection('tasks').findOne({ taskId });
                if (!task) {
                    ctx.session.step = null;
                    delete ctx.session.editTaskId;
                    return ctx.reply('❌ Task not found.');
                }
                
                const utcDate = new Date(task.startDate);
                const year = utcDate.getUTCFullYear();
                const month = utcDate.getUTCMonth();
                const day = utcDate.getUTCDate();
                const [h, m] = text.split(':').map(Number);
                
                const newStartDateUTC = new Date(Date.UTC(year, month, day, h, m, 0));
                
                const duration = task.endDate.getTime() - task.startDate.getTime();
                const newEndDateUTC = new Date(newStartDateUTC.getTime() + duration);
                
                await db.collection('tasks').updateOne(
                    { taskId: taskId }, 
                    { 
                        $set: { 
                            startDate: newStartDateUTC,
                            endDate: newEndDateUTC,
                            nextOccurrence: newStartDateUTC,
                            startTimeStr: text
                        } 
                    }
                );
                
                await db.collection('history').updateMany(
                    { originalTaskId: taskId }, 
                    { 
                        $set: { 
                            startDate: newStartDateUTC,
                            endDate: newEndDateUTC
                        } 
                    }
                );
                
                const updatedTask = await db.collection('tasks').findOne({ taskId });
                if (updatedTask) {
                    cancelTaskSchedule(taskId);
                    if (updatedTask.nextOccurrence > new Date()) {
                        scheduleTask(updatedTask);
                    }
                }
                
                ctx.session.step = null;
                delete ctx.session.editTaskId;
                await ctx.reply(`✅ <b>START TIME UPDATED!</b>\n\nEnd time adjusted to: ${formatTimeUTC(newEndDateUTC)} UTC`, { parse_mode: 'HTML' });
                await showTaskDetail(ctx, taskId);
            } catch (error) {
                console.error('Error updating start time:', error);
                await ctx.reply('❌ Failed to update start time.');
            }
        }
        else if (step === 'edit_task_duration') {
            const taskId = ctx.session.editTaskId;
            
            try {
                const task = await db.collection('tasks').findOne({ taskId });
                if (!task) {
                    ctx.session.step = null;
                    delete ctx.session.editTaskId;
                    return ctx.reply('❌ Task not found.');
                }
                
                let newEndDateUTC;
                
                if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(text)) {
                    const [eh, em] = text.split(':').map(Number);
                    const utcDate = new Date(task.endDate);
                    const year = utcDate.getUTCFullYear();
                    const month = utcDate.getUTCMonth();
                    const day = utcDate.getUTCDate();
                    
                    newEndDateUTC = new Date(Date.UTC(year, month, day, eh, em, 0));
                    
                    if (newEndDateUTC <= task.startDate) {
                        return ctx.reply('❌ End time must be after start time.');
                    }
                } else {
                    const duration = parseInt(text);
                    if (isNaN(duration) || duration < 1 || duration > 1440) {
                        return ctx.reply('❌ Please enter a valid duration between 1 and 1440 minutes, or end time in HH:MM format.');
                    }
                    newEndDateUTC = new Date(task.startDate.getTime() + duration * 60000);
                }
                
                await db.collection('tasks').updateOne(
                    { taskId: taskId }, 
                    { $set: { endDate: newEndDateUTC } }
                );
                
                await db.collection('history').updateMany(
                    { originalTaskId: taskId }, 
                    { $set: { endDate: newEndDateUTC } }
                );
                
                ctx.session.step = null;
                delete ctx.session.editTaskId;
                await ctx.reply(`✅ <b>DURATION UPDATED!</b>\n\nNew end time: ${formatTimeUTC(newEndDateUTC)} UTC`, { parse_mode: 'HTML' });
                await showTaskDetail(ctx, taskId);
            } catch (error) {
                console.error('Error updating duration:', error);
                await ctx.reply('❌ Failed to update duration.');
            }
        }
        else if (step === 'edit_task_repeat_count') {
            const taskId = ctx.session.editTaskId;
            const count = parseInt(text);
            
            if (isNaN(count) || count < 0 || count > 365) {
                return ctx.reply('❌ Invalid Number. Enter 0-365');
            }
            
            try {
                await db.collection('tasks').updateOne(
                    { taskId: taskId }, 
                    { 
                        $set: { 
                            repeatCount: count,
                            ...(count === 0 && { repeat: 'none' })
                        } 
                    }
                );
                
                await db.collection('history').updateMany(
                    { originalTaskId: taskId }, 
                    { 
                        $set: { 
                            repeatCount: count,
                            ...(count === 0 && { repeat: 'none' })
                        } 
                    }
                );
                
                ctx.session.step = null;
                delete ctx.session.editTaskId;
                await ctx.reply(`✅ <b>REPEAT COUNT UPDATED!</b>`, { parse_mode: 'HTML' });
                await showTaskDetail(ctx, taskId);
            } catch (error) {
                console.error('Error updating repeat count:', error);
                await ctx.reply('❌ Failed to update repeat count.');
            }
        }
        else if (step === 'edit_note_title') {
            const noteId = ctx.session.editNoteId;
            if (text.length === 0) return ctx.reply('❌ Title cannot be empty.');
            if (text.length > 200) return ctx.reply('❌ Title too long. Max 200 characters.');
            
            try {
                await db.collection('notes').updateOne(
                    { noteId: noteId }, 
                    { $set: { title: text, updatedAt: new Date() } }
                );
                
                const updatedNote = await db.collection('notes').findOne({ noteId: noteId });
                
                ctx.session.step = null;
                delete ctx.session.editNoteId;
                
                await ctx.reply(
                    `✅ <b>𝗡𝗢𝗧𝗘 𝗧𝗜𝗧𝗟𝗘 𝗨𝗣𝗗𝗔𝗧𝗘𝗗!</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 <b>${updatedNote.title}</b>\n` +
                    `${formatBlockquote(updatedNote.content)}\n` +
                    `📅 Updated: ${formatDateTimeUTC(new Date())} UTC`,
                    { parse_mode: 'HTML' }
                );
                
                await showNoteDetail(ctx, noteId);
                
            } catch (error) {
                console.error('Error updating note title:', error);
                ctx.session.step = null;
                delete ctx.session.editNoteId;
                await ctx.reply('❌ Failed to update title.');
            }
        }
        else if (step === 'edit_note_content') {
            const noteId = ctx.session.editNoteId;
            const content = text === '-' ? '' : text;
            if (content.length > 0 && content.split(/\s+/).length > 400) {
                return ctx.reply('❌ Too long! Max 400 words.');
            }
            
            try {
                await db.collection('notes').updateOne(
                    { noteId: noteId }, 
                    { $set: { content: content, updatedAt: new Date() } }
                );
                
                const updatedNote = await db.collection('notes').findOne({ noteId: noteId });
                
                ctx.session.step = null;
                delete ctx.session.editNoteId;
                
                await ctx.reply(
                    `✅ <b>𝗡𝗢𝗧𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧 𝗨𝗣𝗗𝗔𝗧𝗘𝗗!</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 <b>${updatedNote.title}</b>\n` +
                    `${formatBlockquote(updatedNote.content)}\n` +
                    `📅 Updated: ${formatDateTimeUTC(new Date())} UTC`,
                    { parse_mode: 'HTML' }
                );
                
                await showNoteDetail(ctx, noteId);
                
            } catch (error) {
                console.error('Error updating note content:', error);
                ctx.session.step = null;
                delete ctx.session.editNoteId;
                await ctx.reply('❌ Failed to update content.');
            }
        }
    } catch (error) {
        console.error('Text handler error:', error);
        await ctx.reply('❌ An error occurred. Please try again.');
    }
});

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
        `📝 <i>How many times should this task repeat? (1-365)</i>`,
        { parse_mode: 'HTML' }
    );
});

bot.action('repeat_weekly', async (ctx) => {
    ctx.session.task.repeat = 'weekly';
    ctx.session.step = 'task_repeat_count';
    await ctx.reply(
        `🔢 <b>𝗪𝗘𝗘𝗞𝗟𝗬 𝗥𝗘𝗣𝗘𝗔𝗧</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📝 <i>How many times should this task repeat? (1-365)</i>`,
        { parse_mode: 'HTML' }
    );
});

async function saveTask(ctx) {
    const task = ctx.session.task;
    
    try {
        const highestTask = await db.collection('tasks').findOne(
            {},
            { sort: { orderIndex: -1 } }
        );
        const nextOrderIndex = highestTask ? highestTask.orderIndex + 1 : 0;
        
        task.status = 'pending';
        task.createdAt = new Date();
        task.orderIndex = nextOrderIndex;
        task.subtasks = task.subtasks || [];
        if (!task.nextOccurrence) {
            task.nextOccurrence = task.startDate;
        }
        
        await db.collection('tasks').insertOne(task);
        scheduleTask(task);
        
        ctx.session.step = null;
        delete ctx.session.task;
        
        const duration = calculateDuration(task.startDate, task.endDate);
        
        const msg = `
✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞 𝗖𝗥𝗘𝗔𝗧𝗘𝗗 𝗦𝗨𝗖𝗖𝗘𝗦𝗦𝗙𝗨𝗟𝗟𝗬!</b>
━━━━━━━━━━━━━━━━━━━━
📌 <b>${task.title}</b>
${formatBlockquote(task.description)}
📅 <b>Date:</b> ${formatDateUTC(task.startDate)}
⏰ <b>Time:</b> ${task.startTimeStr} - ${task.endTimeStr} UTC
⏱️ <b>Duration:</b> ${formatDuration(duration)}
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
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                `✅ <b>𝗡𝗘𝗪 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞 𝗔𝗗𝗗𝗘𝗗</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 <b>${task.title}</b>\n` +
                `${formatBlockquote(task.description)}\n` +
                `📅 ${formatDateUTC(task.startDate)}\n` +
                `⏰ ${task.startTimeStr} - ${task.endTimeStr} UTC\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    } catch (error) {
        console.error('Error saving task:', error);
        await ctx.reply('❌ Failed to save task. Please try again.');
    }
}

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

    const subtasks = task.subtasks || [];
    const progress = calculateSubtaskProgress(subtasks);
    const completedSubtasks = subtasks.filter(s => s.completed).length;
    const totalSubtasks = subtasks.length;
    const duration = calculateDuration(task.startDate, task.endDate);
    
    let text = `
📌 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞 𝗗𝗘𝗧𝗔𝗜𝗟𝗦</b>
━━━━━━━━━━━━━━━━━━━━
🆔 <b>Task ID:</b> <code>${task.taskId}</code>
📛 <b>Title:</b> ${task.title}
${formatBlockquote(task.description)}
📅 <b>Next Occurrence:</b> ${formatDateTimeUTC(task.nextOccurrence)}
⏰ <b>Time:</b> ${formatTimeUTC(task.startDate)} - ${formatTimeUTC(task.endDate)} UTC
⏱️ <b>Duration:</b> ${formatDuration(duration)}
🔄 <b>Repeat:</b> ${task.repeat === 'none' ? 'No Repeat' : task.repeat} 
🔢 <b>Remaining Repeats:</b> ${task.repeatCount || 0}
🏷️ <b>Priority Order:</b> ${task.orderIndex + 1}
📊 <b>Status:</b> ${task.status === 'pending' ? '⏳ Pending' : '✅ Completed'}
`;

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

    const buttons = [];
    
    subtasks.forEach((subtask, index) => {
        const status = subtask.completed ? '✅' : '⭕';
        let title = subtask.title;
        if (title.length > 30) title = title.substring(0, 27) + '...';
        
        const buttonRow = [
            Markup.button.callback(
                `${status} ${index + 1}. ${title}`, 
                `subtask_det_${taskId}_${subtask.id}`
            )
        ];
        buttons.push(buttonRow);
    });
    
    const actionRow = [];
    
    if (totalSubtasks < 10) {
        actionRow.push(Markup.button.callback('➕', `add_subtask_${taskId}`));
    }
    
    actionRow.push(Markup.button.callback('✏️', `edit_menu_${taskId}`));
    actionRow.push(Markup.button.callback('🗑️', `delete_task_${taskId}`));
    actionRow.push(Markup.button.callback('✅', `complete_${taskId}`));
    
    buttons.push(actionRow);
    
    buttons.push([
        Markup.button.callback('📋 Tasks', 'view_today_tasks_1'),
        Markup.button.callback('🔙 Back', 'view_today_tasks_1')
    ]);

    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

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
📅 <b>Created:</b> ${formatDateTimeUTC(subtask.createdAt)} UTC
━━━━━━━━━━━━━━━━━━━━`;

    const buttons = [];
    
    if (!subtask.completed) {
        buttons.push([
            Markup.button.callback('✅', `subtask_complete_${taskId}_${subtaskId}`),
            Markup.button.callback('✏️', `subtask_edit_${taskId}_${subtaskId}`),
            Markup.button.callback('🗑️', `subtask_delete_${taskId}_${subtaskId}`)
        ]);
    } else {
        buttons.push([
            Markup.button.callback('✏️', `subtask_edit_${taskId}_${subtaskId}`),
            Markup.button.callback('🗑️', `subtask_delete_${taskId}_${subtaskId}`)
        ]);
    }
    
    buttons.push([Markup.button.callback('🔙 Back to Task', `task_det_${taskId}`)]);
    
    await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

bot.action(/^subtask_complete_(.+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
    try {
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

bot.action(/^subtask_delete_(.+)_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const subtaskId = ctx.match[2];
    
    try {
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

bot.action(/^complete_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    if (!task) return ctx.answerCbQuery('Task not found');

    const subtasks = task.subtasks || [];
    const incompleteSubtasks = subtasks.filter(s => !s.completed);
    
    if (incompleteSubtasks.length > 0) {
        return ctx.answerCbQuery(`❌ Complete all ${incompleteSubtasks.length} pending subtasks first!`);
    }

    const completedAtUTC = new Date();
    const completedDateUTC = getTodayUTC();
    
    const historyItem = {
        ...task,
        _id: undefined,
        completedAt: completedAtUTC,
        completedDate: completedDateUTC,
        originalTaskId: task.taskId,
        status: 'completed',
        completedFromDate: task.nextOccurrence,
        subtasks: task.subtasks
    };
    
    delete historyItem._id;
    
    try {
        await db.collection('history').insertOne(historyItem);
        
        cancelTaskSchedule(taskId);

        if (task.repeat !== 'none' && task.repeatCount > 0) {
            const nextOccurrence = new Date(task.nextOccurrence);
            const daysToAdd = task.repeat === 'weekly' ? 7 : 1;
            nextOccurrence.setUTCDate(nextOccurrence.getUTCDate() + daysToAdd);
            
            const resetSubtasks = (task.subtasks || []).map(s => ({
                ...s,
                completed: false
            }));
            
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
            
            const updatedTask = await db.collection('tasks').findOne({ taskId });
            
            if (updatedTask && updatedTask.nextOccurrence > new Date()) {
                scheduleTask(updatedTask);
                await ctx.answerCbQuery('✅ Completed! Next occurrence scheduled.');
            } else {
                await ctx.answerCbQuery('✅ Completed! No future occurrences.');
            }
            
            try {
                await bot.telegram.sendMessage(CHAT_ID,
                    `✅ <b>𝗧𝗔𝗦𝗞 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 <b>${task.title}</b>\n` +
                    `🔄 Next: ${formatDateUTC(nextOccurrence)}\n` +
                    `📊 Remaining: ${task.repeatCount - 1}\n` +
                    `━━━━━━━━━━━━━━━━━━━━`,
                    { parse_mode: 'HTML' }
                );
            } catch (e) {}
        } else {
            await db.collection('tasks').deleteOne({ taskId });
            await ctx.answerCbQuery('✅ Task Completed & Moved to History!');
            
            try {
                await bot.telegram.sendMessage(CHAT_ID,
                    `✅ <b>𝗧𝗔𝗦𝗞 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 <b>${task.title}</b>\n` +
                    `📅 Completed at: ${formatDateTimeUTC(completedAtUTC)} UTC\n` +
                    `━━━━━━━━━━━━━━━━━━━━`,
                    { parse_mode: 'HTML' }
                );
            } catch (e) {}
        }
        
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error completing task:', error);
        await ctx.answerCbQuery('❌ Error completing task');
    }
});

bot.action(/^edit_menu_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const text = `✏️ <b>𝗘𝗗𝗜𝗧 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞</b>\n━━━━━━━━━━━━━━━━━━━━\nSelect what you want to edit:`;
    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('🏷 Title', `edit_task_title_${taskId}`), 
            Markup.button.callback('📝 Description', `edit_task_desc_${taskId}`)
        ],
        [
            Markup.button.callback('⏰ Start Time', `edit_task_start_${taskId}`), 
            Markup.button.callback('⏱️ Duration', `edit_task_duration_${taskId}`)
        ],
        [
            Markup.button.callback('🔄 Repeat', `edit_rep_${taskId}`), 
            Markup.button.callback('🔢 Count', `edit_task_count_${taskId}`)
        ],
        [Markup.button.callback('🔙 Back', `task_det_${taskId}`)]
    ]);
    
    await safeEdit(ctx, text, keyboard);
});

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
        `Enter new description (Max 100 words, enter "-" for empty):`,
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
        `Enter new start time (HH:MM, 24-hour UTC):\n` +
        `📝 Current duration: ${formatDuration(calculateDuration(task.startDate, task.endDate))}\n` +
        `⚠️ Duration will be preserved`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `task_det_${taskId}`)]])
    );
});

bot.action(/^edit_task_duration_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const task = await db.collection('tasks').findOne({ taskId });
    
    if (!task) {
        await ctx.answerCbQuery('❌ Task not found');
        return showMainMenu(ctx);
    }
    
    ctx.session.editTaskId = taskId;
    ctx.session.step = 'edit_task_duration';
    
    const currentDuration = calculateDuration(task.startDate, task.endDate);
    
    await ctx.reply(
        `✏️ <b>𝗘𝗗𝗜𝗧 𝗗𝗨𝗥𝗔𝗧𝗜𝗢𝗡</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Current duration: ${formatDuration(currentDuration)}\n\n` +
        `Enter new duration in minutes (e.g., 15, 30, 60, 90, 120):\n` +
        `Or enter end time in HH:MM format:`,
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
            const task = await db.collection('tasks').findOne({ taskId });
            updates.repeatCount = task?.repeatCount || 10;
        }
        
        await db.collection('tasks').updateOne({ taskId }, { $set: updates });
        
        await db.collection('history').updateMany(
            { originalTaskId: taskId }, 
            { $set: updates }
        );
        
        await ctx.answerCbQuery(`✅ Updated to ${mode}`);
        await showTaskDetail(ctx, taskId);
    } catch (error) {
        console.error('Error updating repeat mode:', error);
        await ctx.answerCbQuery('❌ Error updating');
    }
});

bot.action(/^delete_task_(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    try {
        const task = await db.collection('tasks').findOne({ taskId });
        const taskTitle = task?.title || 'Task';
        
        await db.collection('tasks').deleteOne({ taskId });
        await db.collection('history').deleteMany({ originalTaskId: taskId });
        cancelTaskSchedule(taskId);
        await ctx.answerCbQuery(`✅ Task Deleted`);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                `🗑️ <b>𝗧𝗔𝗦𝗞 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 <b>${taskTitle}</b>\n` +
                `🗑️ Task was deleted\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
        
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error deleting task:', error);
        await ctx.answerCbQuery('❌ Error deleting task');
    }
});

// ==========================================
// 🔄 REORDER TASKS SYSTEM
// ==========================================

bot.action('reorder_tasks_menu', async (ctx) => {
    try {
        const tasks = await db.collection('tasks')
            .find({ 
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
        
        let text = '<b>🔼🔽 Reorder ALL GLOBAL Tasks</b>\n\n';
        text += 'Select a task to move:\n\n';
        
        const keyboard = [];
        
        tasks.forEach((task, index) => {
            let title = task.title;
            if (title.length > 35) title = title.substring(0, 32) + '...';
            
            keyboard.push([{ 
                text: `${index + 1}. ${title}`, 
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
        
        const tasks = await db.collection('tasks')
            .find({ 
                status: 'pending'
            })
            .sort({ orderIndex: 1, nextOccurrence: 1 })
            .toArray();
        
        const selectedIndex = tasks.findIndex(t => t.taskId === taskId);
        
        if (selectedIndex === -1) {
            await ctx.answerCbQuery('❌ Task not found');
            return;
        }
        
        ctx.session.reorderTask = {
            selectedTaskId: taskId,
            selectedIndex: selectedIndex,
            tasks: tasks
        };
        
        let text = '<b>🔼🔽 Reorder ALL GLOBAL Tasks</b>\n\n';
        text += 'Current order (selected task is highlighted):\n\n';
        
        tasks.forEach((task, index) => {
            let title = task.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === selectedIndex) {
                text += `<blockquote>${index + 1}. ${title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${title}\n`;
            }
        });
        
        const keyboard = [];
        
        if (selectedIndex > 0) {
            keyboard.push([{ text: '🔼 Move Up', callback_data: 'reorder_task_up' }]);
        }
        
        if (selectedIndex < tasks.length - 1) {
            if (selectedIndex > 0) {
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
        
        const temp = tasks[selectedIndex];
        tasks[selectedIndex] = tasks[selectedIndex - 1];
        tasks[selectedIndex - 1] = temp;
        
        ctx.session.reorderTask.selectedIndex = selectedIndex - 1;
        ctx.session.reorderTask.tasks = tasks;
        
        let text = '<b>🔼🔽 Reorder ALL GLOBAL Tasks</b>\n\n';
        text += 'Current order (selected task is highlighted):\n\n';
        
        tasks.forEach((task, index) => {
            let title = task.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === ctx.session.reorderTask.selectedIndex) {
                text += `<blockquote>${index + 1}. ${title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${title}\n`;
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
        
        const temp = tasks[selectedIndex];
        tasks[selectedIndex] = tasks[selectedIndex + 1];
        tasks[selectedIndex + 1] = temp;
        
        ctx.session.reorderTask.selectedIndex = selectedIndex + 1;
        ctx.session.reorderTask.tasks = tasks;
        
        let text = '<b>🔼🔽 Reorder ALL GLOBAL Tasks</b>\n\n';
        text += 'Current order (selected task is highlighted):\n\n';
        
        tasks.forEach((task, index) => {
            let title = task.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === ctx.session.reorderTask.selectedIndex) {
                text += `<blockquote>${index + 1}. ${title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${title}\n`;
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
        
        for (let i = 0; i < tasks.length; i++) {
            await db.collection('tasks').updateOne(
                { taskId: tasks[i].taskId },
                { $set: { orderIndex: i } }
            );
        }
        
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
    try {
        const notes = await db.collection('notes')
            .find()
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
        
        let text = '<b>🔼🔽 Reorder Global Notes</b>\n\n';
        text += 'Select a note to move:\n\n';
        
        const keyboard = [];
        
        notes.forEach((note, index) => {
            let title = note.title;
            if (title.length > 35) title = title.substring(0, 32) + '...';
            
            keyboard.push([{ 
                text: `${index + 1}. ${title}`, 
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
        
        const notes = await db.collection('notes')
            .find()
            .sort({ orderIndex: 1, createdAt: -1 })
            .toArray();
        
        const selectedIndex = notes.findIndex(n => n.noteId === noteId);
        
        if (selectedIndex === -1) {
            await ctx.answerCbQuery('❌ Note not found');
            return;
        }
        
        ctx.session.reorderNote = {
            selectedNoteId: noteId,
            selectedIndex: selectedIndex,
            notes: notes
        };
        
        let text = '<b>🔼🔽 Reorder Global Notes</b>\n\n';
        text += 'Current order (selected note is highlighted):\n\n';
        
        notes.forEach((note, index) => {
            let title = note.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === selectedIndex) {
                text += `<blockquote>${index + 1}. ${title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${title}\n`;
            }
        });
        
        const keyboard = [];
        
        if (selectedIndex > 0) {
            keyboard.push([{ text: '🔼 Move Up', callback_data: 'reorder_note_up' }]);
        }
        
        if (selectedIndex < notes.length - 1) {
            if (selectedIndex > 0) {
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
        
        const temp = notes[selectedIndex];
        notes[selectedIndex] = notes[selectedIndex - 1];
        notes[selectedIndex - 1] = temp;
        
        ctx.session.reorderNote.selectedIndex = selectedIndex - 1;
        ctx.session.reorderNote.notes = notes;
        
        let text = '<b>🔼🔽 Reorder Global Notes</b>\n\n';
        text += 'Current order (selected note is highlighted):\n\n';
        
        notes.forEach((note, index) => {
            let title = note.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === ctx.session.reorderNote.selectedIndex) {
                text += `<blockquote>${index + 1}. ${title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${title}\n`;
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
        
        const temp = notes[selectedIndex];
        notes[selectedIndex] = notes[selectedIndex + 1];
        notes[selectedIndex + 1] = temp;
        
        ctx.session.reorderNote.selectedIndex = selectedIndex + 1;
        ctx.session.reorderNote.notes = notes;
        
        let text = '<b>🔼🔽 Reorder Global Notes</b>\n\n';
        text += 'Current order (selected note is highlighted):\n\n';
        
        notes.forEach((note, index) => {
            let title = note.title;
            if (title.length > 30) title = title.substring(0, 27) + '...';
            
            if (index === ctx.session.reorderNote.selectedIndex) {
                text += `<blockquote>${index + 1}. ${title}</blockquote>\n`;
            } else {
                text += `${index + 1}. ${title}\n`;
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
        
        for (let i = 0; i < notes.length; i++) {
            await db.collection('notes').updateOne(
                { noteId: notes[i].noteId },
                { $set: { orderIndex: i } }
            );
        }
        
        delete ctx.session.reorderNote;
        
        await ctx.answerCbQuery('✅ Note order saved!');
        await showMainMenu(ctx);
        
    } catch (error) {
        console.error('Save note order error:', error);
        await ctx.answerCbQuery('❌ Failed to save order');
    }
});

// ==========================================
// 📜 VIEW HISTORY - WITH PAGINATION
// ==========================================

bot.action(/^view_history_dates_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    
    const perPage = 10;
    const skip = (page - 1) * perPage;
    
    const dates = await db.collection('history').aggregate([
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
        { $sort: { completedDate: -1 } },
        { 
            $facet: {
                metadata: [{ $count: "total" }],
                data: [{ $skip: skip }, { $limit: perPage }]
            }
        }
    ]).toArray();

    const totalDates = dates[0]?.metadata[0]?.total || 0;
    const dateList = dates[0]?.data || [];
    const totalPages = Math.max(1, Math.ceil(totalDates / perPage));

    let text = `📜 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦 𝗛𝗜𝗦𝗧𝗢𝗥𝗬</b>\n━━━━━━━━━━━━━━━━━━━━\n📊 Total: ${totalDates} date${totalDates !== 1 ? 's' : ''}\n📄 Page: ${page}/${totalPages}\n━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (dateList.length === 0) {
        text += '📭 No history available.';
    } else {
        text += 'Select a date to view:';
    }
    
    const buttons = dateList.map(d => {
        const date = new Date(d.completedDate);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return [Markup.button.callback(`📅 ${formatDateUTC(date)} (${d.count})`, `hist_list_${dateStr}_1`)];
    });
    
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

    const [year, month, day] = dateStr.split('-').map(Number);
    
    const selectedDate = new Date(Date.UTC(year, month - 1, day));
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));

    const perPage = 10;
    const skip = (page - 1) * perPage;
    
    const totalTasks = await db.collection('history').countDocuments({
        completedDate: {
            $gte: selectedDate,
            $lt: nextDay
        }
    });
    
    const totalPages = Math.max(1, Math.ceil(totalTasks / perPage));

    const tasks = await db.collection('history').find({
        completedDate: {
            $gte: selectedDate,
            $lt: nextDay
        }
    }).sort({ completedAt: -1 }).skip(skip).limit(perPage).toArray();

    const date = new Date(year, month - 1, day);
    let text = `📅 <b>𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗢𝗡 ${formatDateUTC(date).toUpperCase()}</b>\n━━━━━━━━━━━━━━━━━━━━\n📊 Total: ${totalTasks} task${totalTasks !== 1 ? 's' : ''}\n📄 Page: ${page}/${totalPages}\n━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (tasks.length === 0) {
        text += '📭 No tasks completed on this date.';
    } else {
        text += 'Select a task to view details:';
    }
    
    const buttons = tasks.map((t, index) => {
        const taskNum = skip + index + 1;
        let taskTitle = t.title;
        
        if (t.subtasks && t.subtasks.length > 0) {
            const completed = t.subtasks.filter(s => s.completed).length;
            taskTitle += ` [${completed}/${t.subtasks.length}]`;
        }
        
        if (taskTitle.length > 40) taskTitle = taskTitle.substring(0, 37) + '...';
        
        return [
            Markup.button.callback(`✅ ${taskNum}. ${taskTitle} (${formatTimeUTC(t.completedAt)} UTC)`, `hist_det_${t._id}`)
        ];
    });
    
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
    try {
        const id = ctx.match[1];
        const task = await db.collection('history').findOne({ _id: new ObjectId(id) });

        if (!task) {
            await ctx.answerCbQuery('Task not found');
            return;
        }

        const duration = calculateDuration(task.startDate, task.endDate);

        let text = `
📜 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗛𝗜𝗦𝗧𝗢𝗥𝗬 𝗗𝗘𝗧𝗔𝗜𝗟</b>
━━━━━━━━━━━━━━━━━━━━
📌 <b>${task.title}</b>
${formatBlockquote(task.description)}
✅ <b>Completed At:</b> ${formatDateTimeUTC(task.completedAt)} UTC
${task.autoCompleted ? '🤖 <b>Auto-completed at 23:59 UTC</b>\n' : ''}
⏰ <b>Original Time:</b> ${formatTimeUTC(task.startDate)} - ${formatTimeUTC(task.endDate)} UTC
⏱️ <b>Duration:</b> ${formatDuration(duration)}
🔄 <b>Repeat Type:</b> ${task.repeat === 'none' ? 'No Repeat' : task.repeat}
━━━━━━━━━━━━━━━━━━━━
`;

        if (task.subtasks && task.subtasks.length > 0) {
            text += `📋 <b>𝗦𝗨𝗕𝗧𝗔𝗦𝗞𝗦:</b>\n`;
            task.subtasks.forEach((subtask, index) => {
                const status = subtask.completed ? '✅' : '❌';
                let title = subtask.title;
                if (title.length > 40) title = title.substring(0, 37) + '...';
                text += `${status} ${index + 1}. ${title}\n`;
            });
            text += `━━━━━━━━━━━━━━━━━━━━\n`;
        }

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to History', 'view_history_dates_1')]
        ]);
        
        await safeEdit(ctx, text, keyboard);
    } catch (error) {
        console.error('Error showing history detail:', error);
        await ctx.answerCbQuery('❌ Error loading history detail');
    }
});

// ==========================================
// 🗒️ VIEW NOTES - WITH PAGINATION
// ==========================================

bot.action(/^view_notes_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    
    const perPage = 10;
    const skip = (page - 1) * perPage;
    
    const totalNotes = await db.collection('notes').countDocuments({});
    const totalPages = Math.max(1, Math.ceil(totalNotes / perPage));
    
    const notes = await db.collection('notes').find()
        .sort({ orderIndex: 1, createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .toArray();

    let text = `🗒️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘𝗦</b>\n━━━━━━━━━━━━━━━━━━━━\n📊 Total: ${totalNotes} note${totalNotes !== 1 ? 's' : ''}\n📄 Page: ${page}/${totalPages}\n━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (notes.length === 0) {
        text += '📭 No notes yet.';
    } else {
        text += 'Select a note to view:';
    }
    
    const buttons = notes.map((n, index) => {
        const noteNum = skip + index + 1;
        let title = n.title;
        if (title.length > 40) title = title.substring(0, 37) + '...';
        
        return [
            Markup.button.callback(`📄 ${noteNum}. ${title}`, `note_det_${n.noteId}`)
        ];
    });
    
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

    let contentDisplay = note.content || '<i>Empty note</i>';
    
    const text = `
📝 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘 𝗗𝗘𝗧𝗔𝗜𝗟𝗦</b>
━━━━━━━━━━━━━━━━━━━━
📌 <b>${note.title}</b>
${formatBlockquote(contentDisplay)}
📅 <b>Created:</b> ${formatDateTimeUTC(note.createdAt)} UTC
${note.updatedAt ? `✏️ <b>Updated:</b> ${formatDateTimeUTC(note.updatedAt)} UTC` : ''}
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
// ✏️ EDIT NOTE HANDLERS
// ==========================================

bot.action(/^edit_note_title_(.+)$/, async (ctx) => {
    const noteId = ctx.match[1];
    
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
        `Enter new content (Max 400 words, enter "-" for empty):`,
        { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', `note_det_${noteId}`)]])
        }
    );
});

bot.action(/^delete_note_(.+)$/, async (ctx) => {
    try {
        const noteId = ctx.match[1];
        const note = await db.collection('notes').findOne({ noteId });
        const noteTitle = note?.title || 'Note';
        
        await db.collection('notes').deleteOne({ noteId: noteId });
        await ctx.answerCbQuery('✅ Note Deleted');
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                `🗑️ <b>𝗡𝗢𝗧𝗘 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 <b>${noteTitle}</b>\n` +
                `🗑️ Note was deleted\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
        
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Error deleting note:', error);
        await ctx.answerCbQuery('❌ Error deleting note');
    }
});

// ==========================================
// 📥 DOWNLOAD DATA MENU
// ==========================================

bot.action('download_menu', async (ctx) => {
    const text = `📥 <b>𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗 𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗔𝗧𝗔</b>\n━━━━━━━━━━━━━━━━━━━━\n📁 <i>Files will be sent as JSON documents</i>`;
    
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
        const tasks = await db.collection('tasks').find().toArray();
        
        const tasksData = {
            total: tasks.length,
            downloadedAt: new Date().toISOString(),
            data: tasks.length > 0 ? tasks : []
        };
        
        const tasksJson = JSON.stringify(tasksData, null, 2);
        const tasksBuff = Buffer.from(tasksJson, 'utf-8');
        
        await ctx.replyWithDocument({
            source: tasksBuff,
            filename: `global_tasks_${Date.now()}.json`
        }, {
            caption: `📋 <b>Global Tasks Data</b>\nTotal: ${tasks.length} task${tasks.length !== 1 ? 's' : ''}\n📅 ${formatDateTimeUTC(new Date())} UTC`,
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
        const history = await db.collection('history').find().toArray();
        
        const historyData = {
            total: history.length,
            downloadedAt: new Date().toISOString(),
            data: history.length > 0 ? history : []
        };
        
        const historyJson = JSON.stringify(historyData, null, 2);
        const histBuff = Buffer.from(historyJson, 'utf-8');
        
        await ctx.replyWithDocument({
            source: histBuff,
            filename: `global_history_${Date.now()}.json`
        }, {
            caption: `📜 <b>Global History Data</b>\nTotal: ${history.length} item${history.length !== 1 ? 's' : ''}\n📅 ${formatDateTimeUTC(new Date())} UTC`,
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
        const notes = await db.collection('notes').find().toArray();
        
        const notesData = {
            total: notes.length,
            downloadedAt: new Date().toISOString(),
            data: notes.length > 0 ? notes : []
        };
        
        const notesJson = JSON.stringify(notesData, null, 2);
        const notesBuff = Buffer.from(notesJson, 'utf-8');
        
        await ctx.replyWithDocument({
            source: notesBuff,
            filename: `global_notes_${Date.now()}.json`
        }, {
            caption: `🗒️ <b>Global Notes Data</b>\nTotal: ${notes.length} note${notes.length !== 1 ? 's' : ''}\n📅 ${formatDateTimeUTC(new Date())} UTC`,
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
        const timestamp = Date.now();
        
        const [tasks, history, notes] = await Promise.all([
            db.collection('tasks').find().toArray(),
            db.collection('history').find().toArray(),
            db.collection('notes').find().toArray()
        ]);
        
        const totalItems = tasks.length + history.length + notes.length;
        
        if (tasks.length > 0) {
            const tasksData = {
                total: tasks.length,
                downloadedAt: new Date().toISOString(),
                data: tasks
            };
            const tasksBuff = Buffer.from(JSON.stringify(tasksData, null, 2), 'utf-8');
            await ctx.replyWithDocument({
                source: tasksBuff,
                filename: `global_tasks_${timestamp}.json`
            }, {
                caption: `📋 <b>Tasks</b> (${tasks.length} item${tasks.length !== 1 ? 's' : ''})`,
                parse_mode: 'HTML'
            });
        }
        
        if (history.length > 0) {
            const historyData = {
                total: history.length,
                downloadedAt: new Date().toISOString(),
                data: history
            };
            const histBuff = Buffer.from(JSON.stringify(historyData, null, 2), 'utf-8');
            await ctx.replyWithDocument({
                source: histBuff,
                filename: `global_history_${timestamp}.json`
            }, {
                caption: `📜 <b>History</b> (${history.length} item${history.length !== 1 ? 's' : ''})`,
                parse_mode: 'HTML'
            });
        }
        
        if (notes.length > 0) {
            const notesData = {
                total: notes.length,
                downloadedAt: new Date().toISOString(),
                data: notes
            };
            const notesBuff = Buffer.from(JSON.stringify(notesData, null, 2), 'utf-8');
            await ctx.replyWithDocument({
                source: notesBuff,
                filename: `global_notes_${timestamp}.json`
            }, {
                caption: `🗒️ <b>Notes</b> (${notes.length} item${notes.length !== 1 ? 's' : ''})`,
                parse_mode: 'HTML'
            });
        }
        
        await ctx.reply(
            `📦 <b>ALL GLOBAL DATA DOWNLOAD COMPLETE</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
            `📋 Tasks: ${tasks.length} item${tasks.length !== 1 ? 's' : ''}\n` +
            `📜 History: ${history.length} item${history.length !== 1 ? 's' : ''}\n` +
            `🗒️ Notes: ${notes.length} item${notes.length !== 1 ? 's' : ''}\n` +
            `📊 Total: ${totalItems} items\n` +
            `📁 ${[tasks, history, notes].filter(a => a.length > 0).length} JSON files sent\n` +
            `📅 ${formatDateTimeUTC(new Date())} UTC\n━━━━━━━━━━━━━━━━━━━━`,
            { parse_mode: 'HTML' }
        );
        
        await ctx.answerCbQuery(`✅ Sent ${totalItems} items across ${[tasks, history, notes].filter(a => a.length > 0).length} files`);
    } catch (error) {
        console.error('Error downloading all data:', error);
        await ctx.answerCbQuery('❌ Error sending files');
        await ctx.reply('❌ Failed to send files. Please try again.');
    }
});

// ==========================================
// 🗑️ DELETE DATA MENU - GLOBAL
// ==========================================

bot.action('delete_menu', async (ctx) => {
    try {
        const text = `🗑️ <b>𝗗𝗘𝗟𝗘𝗧𝗘 𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗔𝗧𝗔</b>\n━━━━━━━━━━━━━━━━━━━━\n⚠️ <b>⚠️ WARNING: This will delete data for EVERYONE!</b>\n━━━━━━━━━━━━━━━━━━━━\n<b>Select what to delete:</b>`;
        
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
        const taskCount = await db.collection('tasks').countDocuments({});
        
        const text = `⚠️ <b>⚠️ FINAL WARNING ⚠️</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ${taskCount} GLOBAL task${taskCount !== 1 ? 's' : ''}?\n\n<b>This will affect ALL users!</b>\n\n⚠️ <b>This action cannot be undone!</b>\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, DELETE ALL GLOBAL TASKS', 'delete_tasks_final')],
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
        
        const tasks = await db.collection('tasks').find().toArray();
        
        tasks.forEach(t => cancelTaskSchedule(t.taskId));
        
        const result = await db.collection('tasks').deleteMany({});
        
        if (tasks.length > 0) {
            const backupBuff = Buffer.from(JSON.stringify(tasks, null, 2));
            try {
                await ctx.replyWithDocument({ 
                    source: backupBuff, 
                    filename: `global_tasks_backup_${Date.now()}.json` 
                });
            } catch (sendError) {
                console.error('Error sending backup:', sendError);
            }
        }
        
        const successText = `✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${result.deletedCount} global task${result.deletedCount !== 1 ? 's' : ''}\n${tasks.length > 0 ? '📁 Backup file sent!\n' : ''}━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                `🗑️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `🗑️ All ${result.deletedCount} tasks have been deleted\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    } catch (error) {
        console.error('Error deleting tasks:', error);
        await ctx.answerCbQuery('❌ Error deleting tasks');
        await showMainMenu(ctx);
    }
});

bot.action('delete_history_confirm', async (ctx) => {
    try {
        const historyCount = await db.collection('history').countDocuments({});
        
        const text = `⚠️ <b>⚠️ FINAL WARNING ⚠️</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ${historyCount} GLOBAL history item${historyCount !== 1 ? 's' : ''}?\n\n<b>This will affect ALL users!</b>\n\n⚠️ <b>This action cannot be undone!</b>\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, DELETE ALL GLOBAL HISTORY', 'delete_history_final')],
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
        
        const history = await db.collection('history').find().toArray();
        
        const result = await db.collection('history').deleteMany({});
        
        if (history.length > 0) {
            const backupBuff = Buffer.from(JSON.stringify(history, null, 2));
            try {
                await ctx.replyWithDocument({ 
                    source: backupBuff, 
                    filename: `global_history_backup_${Date.now()}.json` 
                });
            } catch (sendError) {
                console.error('Error sending backup:', sendError);
            }
        }
        
        const successText = `✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${result.deletedCount} global history item${result.deletedCount !== 1 ? 's' : ''}\n${history.length > 0 ? '📁 Backup file sent!\n' : ''}━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                `🗑️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗛𝗜𝗦𝗧𝗢𝗥𝗬 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `🗑️ All ${result.deletedCount} history items have been deleted\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    } catch (error) {
        console.error('Error deleting history:', error);
        await ctx.answerCbQuery('❌ Error deleting history');
        await showMainMenu(ctx);
    }
});

bot.action('delete_notes_confirm', async (ctx) => {
    try {
        const notesCount = await db.collection('notes').countDocuments({});
        
        const text = `⚠️ <b>⚠️ FINAL WARNING ⚠️</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ${notesCount} GLOBAL note${notesCount !== 1 ? 's' : ''}?\n\n<b>This will affect ALL users!</b>\n\n⚠️ <b>This action cannot be undone!</b>\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ YES, DELETE ALL GLOBAL NOTES', 'delete_notes_final')],
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
        
        const notes = await db.collection('notes').find().toArray();
        
        const result = await db.collection('notes').deleteMany({});
        
        if (notes.length > 0) {
            const backupBuff = Buffer.from(JSON.stringify(notes, null, 2));
            try {
                await ctx.replyWithDocument({ 
                    source: backupBuff, 
                    filename: `global_notes_backup_${Date.now()}.json` 
                });
            } catch (sendError) {
                console.error('Error sending backup:', sendError);
            }
        }
        
        const successText = `✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${result.deletedCount} global note${result.deletedCount !== 1 ? 's' : ''}\n${notes.length > 0 ? '📁 Backup file sent!\n' : ''}━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                `🗑️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗡𝗢𝗧𝗘𝗦 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `🗑️ All ${result.deletedCount} notes have been deleted\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
    } catch (error) {
        console.error('Error deleting notes:', error);
        await ctx.answerCbQuery('❌ Error deleting notes');
        await showMainMenu(ctx);
    }
});

bot.action('delete_all_confirm', async (ctx) => {
    try {
        const [tasksCount, historyCount, notesCount] = await Promise.all([
            db.collection('tasks').countDocuments({}),
            db.collection('history').countDocuments({}),
            db.collection('notes').countDocuments({})
        ]);
        const totalCount = tasksCount + historyCount + notesCount;
        
        const text = `⚠️ <b>⚠️ ⚠️ ⚠️ FINAL WARNING ⚠️ ⚠️ ⚠️</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Delete ALL ${totalCount} GLOBAL items?\n\n<b>⚠️ THIS WILL DELETE EVERYTHING FOR EVERYONE!</b>\n\n📋 Tasks: ${tasksCount}\n📜 History: ${historyCount}\n🗒️ Notes: ${notesCount}\n\n<b>⚠️ THIS ACTION CANNOT BE UNDONE!</b>\n━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔥 YES, DELETE EVERYTHING GLOBAL', 'delete_all_final')],
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
        
        const [tasks, history, notes] = await Promise.all([
            db.collection('tasks').find().toArray(),
            db.collection('history').find().toArray(),
            db.collection('notes').find().toArray()
        ]);
        
        tasks.forEach(t => cancelTaskSchedule(t.taskId));
        
        const [tasksResult, historyResult, notesResult] = await Promise.all([
            db.collection('tasks').deleteMany({}),
            db.collection('history').deleteMany({}),
            db.collection('notes').deleteMany({})
        ]);
        
        const totalDeleted = tasksResult.deletedCount + historyResult.deletedCount + notesResult.deletedCount;
        const timestamp = Date.now();
        
        if (tasks.length > 0) {
            const tasksBuff = Buffer.from(JSON.stringify(tasks, null, 2));
            await ctx.replyWithDocument({ 
                source: tasksBuff, 
                filename: `global_all_backup_tasks_${timestamp}.json` 
            });
        }
        
        if (history.length > 0) {
            const histBuff = Buffer.from(JSON.stringify(history, null, 2));
            await ctx.replyWithDocument({ 
                source: histBuff, 
                filename: `global_all_backup_history_${timestamp}.json` 
            });
        }
        
        if (notes.length > 0) {
            const notesBuff = Buffer.from(JSON.stringify(notes, null, 2));
            await ctx.replyWithDocument({ 
                source: notesBuff, 
                filename: `global_all_backup_notes_${timestamp}.json` 
            });
        }
        
        const successText = `✅ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘 𝗗𝗘𝗟𝗘𝗧𝗜𝗢𝗡</b>\n━━━━━━━━━━━━━━━━━━━━\n🗑️ Deleted ${totalDeleted} items total\n\n📋 Tasks: ${tasksResult.deletedCount}\n📜 History: ${historyResult.deletedCount}\n🗒️ Notes: ${notesResult.deletedCount}\n\n${(tasks.length + history.length + notes.length) > 0 ? '📁 Backup files sent!\n' : ''}━━━━━━━━━━━━━━━━━━━━`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Main Menu', 'main_menu')]
        ]);
        
        await safeEdit(ctx, successText, keyboard);
        
        try {
            await bot.telegram.sendMessage(CHAT_ID,
                `🔥 <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗔𝗟𝗟 𝗗𝗔𝗧𝗔 𝗗𝗘𝗟𝗘𝗧𝗘𝗗</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `🗑️ All ${totalDeleted} items have been deleted\n` +
                `━━━━━━━━━━━━━━━━━━━━`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {}
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
            scheduleHourlySummary();
            scheduleAutoComplete();
            
            // Start Express server
            const server = app.listen(PORT, '0.0.0.0', () => {
                console.log(`🌐 Web interface running on port ${PORT}`);
                console.log(`📱 Web URL: http://localhost:${PORT}`);
            }).on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.error(`❌ Port ${PORT} is already in use. Trying port ${PORT + 1}...`);
                    app.listen(PORT + 1, '0.0.0.0', () => {
                        console.log(`🌐 Web interface running on port ${PORT + 1}`);
                        console.log(`📱 Web URL: http://localhost:${PORT + 1}`);
                    });
                } else {
                    console.error('❌ Express server error:', err);
                }
            });
            
            // Start Telegram bot
            await bot.launch();
            console.log('🤖 Bot Started Successfully!');
            console.log(`⏰ Current UTC Time: ${formatTimeUTC(new Date())}`);
            console.log(`📊 Currently tracking ${activeSchedules.size} tasks`);
            
            // Send initial summary
            setTimeout(async () => {
                try {
                    const tasks = await db.collection('tasks').find({
                        nextOccurrence: {
                            $gte: getTodayUTC(),
                            $lt: getTomorrowUTC()
                        }
                    }).toArray();
                    
                    if (tasks.length > 0) {
                        await bot.telegram.sendMessage(CHAT_ID,
                            `📋 <b>𝗧𝗢𝗗𝗔𝗬'𝗦 𝗚𝗟𝗢𝗕𝗔𝗟 𝗧𝗔𝗦𝗞𝗦</b>\n` +
                            `━━━━━━━━━━━━━━━━━━━━\n` +
                            `📊 Total: ${tasks.length} task${tasks.length !== 1 ? 's' : ''}\n` +
                            `📅 ${formatDateUTC(new Date())} UTC\n` +
                            `━━━━━━━━━━━━━━━━━━━━`,
                            { parse_mode: 'HTML' }
                        );
                    }
                } catch (error) {
                    console.error('Error sending initial summary:', error.message);
                }
            }, 5000);
        } else {
            console.error('❌ Failed to connect to database. Retrying in 5 seconds...');
            setTimeout(start, 5000);
        }
    } catch (error) {
        console.error('❌ Failed to start bot:', error.message);
        setTimeout(start, 10000);
    }
}

// ==========================================
// ⏰ HOURLY SUMMARY - MODIFIED FOR GLOBAL
// ==========================================

async function sendHourlySummary() {
    try {
        const todayUTC = getTodayUTC();
        const tomorrowUTC = getTomorrowUTC();
        
        const [completedTasks, pendingTasks] = await Promise.all([
            db.collection('history').find({
                completedAt: {
                    $gte: todayUTC,
                    $lt: tomorrowUTC
                }
            }).sort({ completedAt: 1 }).toArray(),
            
            db.collection('tasks').find({
                status: 'pending',
                nextOccurrence: {
                    $gte: todayUTC,
                    $lt: tomorrowUTC
                }
            }).sort({ orderIndex: 1, nextOccurrence: 1 }).toArray()
        ]);
        
        let summaryText = `
🕰️ <b>𝗚𝗟𝗢𝗕𝗔𝗟 𝗛𝗔𝗟𝗙 𝗛𝗢𝗨𝗥𝗟𝗬 𝗦𝗨𝗠𝗠𝗔𝗥𝗬</b>
⏰ ${formatTimeUTC(new Date())} UTC ‧ 📅 ${formatDateUTC(new Date())}
━━━━━━━━━━━━━━━━━━━━
✅ <b>𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗧𝗢𝗗𝗔𝗬:</b> (${completedTasks.length} task${completedTasks.length !== 1 ? 's' : ''})`;
        
        if (completedTasks.length > 0) {
            completedTasks.slice(0, 5).forEach((task, index) => {
                summaryText += `\n${index + 1}‧ ${task.title} ‧ ${formatTimeUTC(task.completedAt)} UTC`;
            });
            if (completedTasks.length > 5) {
                summaryText += `\n...and ${completedTasks.length - 5} more`;
            }
        } else {
            summaryText += `\n📭 No tasks completed yet.`;
        }
        
        summaryText += `\n\n⏳ <b>𝗣𝗘𝗡𝗗𝗜𝗡𝗚 𝗧𝗢𝗗𝗔𝗬:</b> (${pendingTasks.length} task${pendingTasks.length !== 1 ? 's' : ''})`;
        
        if (pendingTasks.length > 0) {
            pendingTasks.slice(0, 5).forEach((task, index) => {
                summaryText += `\n${index + 1}‧ ${task.title} ‧ ${formatTimeUTC(task.nextOccurrence)} UTC`;
            });
            if (pendingTasks.length > 5) {
                summaryText += `\n...and ${pendingTasks.length - 5} more`;
            }
        } else {
            summaryText += `\n📭 No pending tasks for today`;
        }
        
        summaryText += `\n━━━━━━━━━━━━━━━━━━━━\n⏰ Next update in 30 minutes`;
        
        try {
            await bot.telegram.sendMessage(CHAT_ID, summaryText, { parse_mode: 'HTML' });
        } catch (e) {
            console.error('Error sending hourly summary:', e.message);
        }
        
    } catch (error) {
        console.error('Error generating hourly summary:', error.message);
    }
}

function scheduleHourlySummary() {
    if (hourlySummaryJob) {
        hourlySummaryJob.cancel();
    }
    
    hourlySummaryJob = schedule.scheduleJob('*/30 * * * *', async () => {
        if (isShuttingDown) return;
        console.log(`⏰ Sending global hourly summaries at ${formatTimeUTC(new Date())} UTC...`);
        await sendHourlySummary();
    });
    
    console.log('✅ Global half-hourly summary scheduler started');
}

// ==========================================
// 🛑 GRACEFUL SHUTDOWN
// ==========================================

function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log(`🛑 ${signal} received, stopping bot gracefully...`);
    
    // Cancel all scheduled jobs
    for (const [taskId, schedule] of activeSchedules) {
        try {
            if (schedule.startJob) schedule.startJob.cancel();
            if (schedule.interval) clearInterval(schedule.interval);
        } catch (e) {
            console.error(`Error cleaning up task ${taskId}:`, e.message);
        }
    }
    
    if (hourlySummaryJob) {
        try { hourlySummaryJob.cancel(); } catch (e) {}
    }
    
    if (autoCompleteJob) {
        try { autoCompleteJob.cancel(); } catch (e) {}
    }
    
    bot.stop(signal).catch(e => console.error('Error stopping bot:', e.message));
    
    if (client) {
        client.close().catch(e => console.error('Error closing MongoDB:', e.message));
    }
    
    console.log('👋 Bot stopped gracefully');
    process.exit(0);
}

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
    console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the application
start();
