const { Telegraf, session, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');
const schedule = require('node-schedule');
require('dotenv').config();

// Initialize bot
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const bot = new Telegraf(BOT_TOKEN);

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://sandip:9E9AISFqTfU3VI5i@cluster0.p8irtov.mongodb.net/two_telegram_bot';
let db, client;
let isDbConnected = false;

async function connectDB() {
    try {
        client = new MongoClient(mongoUri, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
            maxPoolSize: 10,
            minPoolSize: 1
        });
        await client.connect();
        db = client.db();
        isDbConnected = true;
        console.log('✅ Connected to MongoDB');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        isDbConnected = false;
        return false;
    }
}

// Initialize session
bot.use(session());

// Admin configuration
const ADMIN_IDS = [8469993808];

// Check if user is admin
function isAdmin(userId) {
    return ADMIN_IDS.includes(Number(userId));
}

// Helper function to safely send messages
async function safeSendMessage(ctx, text, options = {}) {
    try {
        return await ctx.reply(text, { 
            ...options,
            parse_mode: 'Markdown',
            disable_web_page_preview: true 
        });
    } catch (error) {
        console.error('Error sending message:', error.message);
        try {
            return await ctx.reply(text);
        } catch (e) {
            console.error('Failed to send fallback message:', e);
        }
    }
}

// Helper function to safely edit messages
async function safeEditMessage(ctx, text, options = {}) {
    try {
        return await ctx.editMessageText(text, { 
            ...options,
            parse_mode: 'Markdown',
            disable_web_page_preview: true 
        });
    } catch (error) {
        console.error('Error editing message:', error.message);
        try {
            return await ctx.editMessageText(text);
        } catch (e) {
            console.error('Failed to edit message:', e);
        }
    }
}

// Generate unique IDs
function generateTaskId() {
    return Math.random().toString(36).substring(2, 12).toUpperCase();
}

function generateNoteId() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Store scheduled jobs
const scheduledJobs = new Map();

// ==========================================
// DATABASE FUNCTIONS
// ==========================================

async function getTodayStats(userId) {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const tasks = await db.collection('tasks').find({
            userId: userId,
            startDate: { $gte: today, $lt: tomorrow },
            status: { $ne: 'deleted' }
        }).toArray();
        
        const completedTasks = tasks.filter(task => task.status === 'completed');
        const pendingTasks = tasks.filter(task => task.status === 'pending');
        
        return {
            total: tasks.length,
            completed: completedTasks.length,
            pending: pendingTasks.length
        };
    } catch (error) {
        console.error('Error getting today stats:', error);
        return { total: 0, completed: 0, pending: 0 };
    }
}

async function saveTask(taskData) {
    try {
        await db.collection('tasks').insertOne(taskData);
        return { success: true, taskId: taskData.taskId };
    } catch (error) {
        console.error('Error saving task:', error);
        return { success: false, error: error.message };
    }
}

async function saveNote(noteData) {
    try {
        await db.collection('notes').insertOne(noteData);
        return { success: true, noteId: noteData.noteId };
    } catch (error) {
        console.error('Error saving note:', error);
        return { success: false, error: error.message };
    }
}

async function getPaginatedTasks(userId, page = 1, limit = 10) {
    try {
        const skip = (page - 1) * limit;
        
        const tasks = await db.collection('tasks')
            .find({ 
                userId: userId, 
                status: { $ne: 'deleted' }
            })
            .sort({ startDate: 1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        const totalTasks = await db.collection('tasks').countDocuments({ 
            userId: userId, 
            status: { $ne: 'deleted' }
        });
        
        const totalPages = Math.ceil(totalTasks / limit);
        
        return {
            tasks,
            page,
            totalPages,
            totalTasks,
            hasNext: page < totalPages,
            hasPrev: page > 1
        };
    } catch (error) {
        console.error('Error getting paginated tasks:', error);
        return { tasks: [], page: 1, totalPages: 0, totalTasks: 0, hasNext: false, hasPrev: false };
    }
}

async function getTaskById(taskId) {
    try {
        return await db.collection('tasks').findOne({ taskId: taskId });
    } catch (error) {
        console.error('Error getting task:', error);
        return null;
    }
}

async function updateTask(taskId, updateData) {
    try {
        const result = await db.collection('tasks').updateOne(
            { taskId: taskId },
            { $set: { ...updateData, updatedAt: new Date() } }
        );
        return { success: result.modifiedCount > 0 };
    } catch (error) {
        console.error('Error updating task:', error);
        return { success: false, error: error.message };
    }
}

async function deleteTask(taskId) {
    try {
        const result = await db.collection('tasks').updateOne(
            { taskId: taskId },
            { $set: { status: 'deleted', deletedAt: new Date() } }
        );
        return { success: result.modifiedCount > 0 };
    } catch (error) {
        console.error('Error deleting task:', error);
        return { success: false, error: error.message };
    }
}

async function getPaginatedNotes(userId, page = 1, limit = 10) {
    try {
        const skip = (page - 1) * limit;
        
        const notes = await db.collection('notes')
            .find({ userId: userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        const totalNotes = await db.collection('notes').countDocuments({ userId: userId });
        const totalPages = Math.ceil(totalNotes / limit);
        
        return {
            notes,
            page,
            totalPages,
            totalNotes,
            hasNext: page < totalPages,
            hasPrev: page > 1
        };
    } catch (error) {
        console.error('Error getting paginated notes:', error);
        return { notes: [], page: 1, totalPages: 0, totalNotes: 0, hasNext: false, hasPrev: false };
    }
}

async function getNoteById(noteId) {
    try {
        return await db.collection('notes').findOne({ noteId: noteId });
    } catch (error) {
        console.error('Error getting note:', error);
        return null;
    }
}

async function getPaginatedHistoryDates(userId, page = 1, limit = 10) {
    try {
        const skip = (page - 1) * limit;
        
        const pipeline = [
            { 
                $match: { 
                    userId: userId, 
                    status: 'completed',
                    completedAt: { $exists: true, $ne: null }
                } 
            },
            {
                $project: {
                    date: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$completedAt"
                        }
                    }
                }
            },
            { $group: { _id: "$date" } },
            { $sort: { _id: -1 } },
            { $skip: skip },
            { $limit: limit }
        ];
        
        const dates = await db.collection('tasks').aggregate(pipeline).toArray();
        
        const datesWithCount = [];
        for (const dateObj of dates) {
            const date = new Date(dateObj._id);
            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);
            
            const count = await db.collection('tasks').countDocuments({
                userId: userId,
                status: 'completed',
                completedAt: { $gte: date, $lt: nextDay }
            });
            
            datesWithCount.push({
                date: date,
                count: count,
                displayDate: date.toLocaleDateString('en-IN', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                })
            });
        }
        
        const totalDatesResult = await db.collection('tasks').aggregate([
            { 
                $match: { 
                    userId: userId, 
                    status: 'completed',
                    completedAt: { $exists: true, $ne: null }
                } 
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$completedAt"
                        }
                    }
                }
            },
            { $count: "total" }
        ]).toArray();
        
        const totalDates = totalDatesResult.length > 0 ? totalDatesResult[0].total : 0;
        const totalPages = Math.ceil(totalDates / limit);
        
        return {
            dates: datesWithCount,
            page,
            totalPages,
            totalDates,
            hasNext: page < totalPages,
            hasPrev: page > 1
        };
    } catch (error) {
        console.error('Error getting paginated history dates:', error);
        return { dates: [], page: 1, totalPages: 0, totalDates: 0, hasNext: false, hasPrev: false };
    }
}

async function getPaginatedTasksByDate(userId, date, page = 1, limit = 10) {
    try {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);
        
        const skip = (page - 1) * limit;
        
        const tasks = await db.collection('tasks')
            .find({
                userId: userId,
                status: 'completed',
                completedAt: { $gte: startOfDay, $lt: endOfDay }
            })
            .sort({ completedAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        const totalTasks = await db.collection('tasks').countDocuments({
            userId: userId,
            status: 'completed',
            completedAt: { $gte: startOfDay, $lt: endOfDay }
        });
        
        const totalPages = Math.ceil(totalTasks / limit);
        
        return {
            tasks,
            page,
            totalPages,
            totalTasks,
            hasNext: page < totalPages,
            hasPrev: page > 1
        };
    } catch (error) {
        console.error('Error getting paginated tasks by date:', error);
        return { tasks: [], page: 1, totalPages: 0, totalTasks: 0, hasNext: false, hasPrev: false };
    }
}

// ==========================================
// SCHEDULING FUNCTIONS
// ==========================================

function scheduleTaskNotifications(task) {
    try {
        const userId = task.userId;
        const taskId = task.taskId;
        
        if (scheduledJobs.has(`${userId}_${taskId}`)) {
            const job = scheduledJobs.get(`${userId}_${taskId}`);
            if (job) job.cancel();
            scheduledJobs.delete(`${userId}_${taskId}`);
        }
        
        const startTime = new Date(task.startDate);
        const notificationStartTime = new Date(startTime);
        notificationStartTime.setMinutes(notificationStartTime.getMinutes() - 10);
        
        if (notificationStartTime > new Date()) {
            const job = schedule.scheduleJob(notificationStartTime, async function() {
                await executeTaskNotifications(task);
            });
            
            scheduledJobs.set(`${userId}_${taskId}`, job);
            console.log(`✅ Scheduled notifications for task ${taskId} at ${notificationStartTime}`);
        } else {
            console.log(`⚠️ Cannot schedule notifications for past task ${taskId}`);
        }
    } catch (error) {
        console.error('Error scheduling task notifications:', error);
    }
}

async function executeTaskNotifications(task) {
    try {
        const userId = task.userId;
        const taskId = task.taskId;
        const startTime = new Date(task.startDate);
        let count = 0;
        const totalMessages = 10;
        
        count++;
        const now = new Date();
        const timeLeft = Math.max(0, Math.floor((startTime - now) / 1000));
        const minutesLeft = Math.floor(timeLeft / 60);
        const secondsLeft = timeLeft % 60;
        
        const istTime = now.toLocaleTimeString('en-IN', { 
            timeZone: 'Asia/Kolkata',
            hour12: false 
        });
        
        const firstMessage = `🔔 Task Reminder 1/${totalMessages}\n\n` +
                           `*Task:* ${task.title}\n` +
                           `*Starts at:* ${new Date(task.startDate).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST\n` +
                           `*Time left:* ${minutesLeft}m ${secondsLeft}s\n` +
                           `*Current time:* ${istTime} IST\n\n` +
                           `Notifications will continue every minute.`;
        
        await bot.telegram.sendMessage(userId, firstMessage, { parse_mode: 'Markdown' });
        
        const intervalId = setInterval(async () => {
            try {
                count++;
                
                const now = new Date();
                const timeLeft = Math.max(0, Math.floor((startTime - now) / 1000));
                const minutesLeft = Math.floor(timeLeft / 60);
                const secondsLeft = timeLeft % 60;
                
                const istTime = now.toLocaleTimeString('en-IN', { 
                    timeZone: 'Asia/Kolkata',
                    hour12: false 
                });
                
                const message = `🔔 Task Reminder ${count}/${totalMessages}\n\n` +
                               `*Task:* ${task.title}\n` +
                               `*Starts at:* ${new Date(task.startDate).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST\n` +
                               `*Time left:* ${minutesLeft}m ${secondsLeft}s\n` +
                               `*Current time:* ${istTime} IST`;
                
                await bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
                
                if (count >= totalMessages || now >= startTime) {
                    clearInterval(intervalId);
                    
                    if (now >= startTime) {
                        await bot.telegram.sendMessage(userId, `⏰ Task "${task.title}" has started!`);
                    } else {
                        await bot.telegram.sendMessage(userId, `✅ Task "${task.title}" notifications completed!`);
                    }
                    
                    scheduledJobs.delete(`${userId}_${taskId}_interval`);
                }
            } catch (error) {
                console.error('Error in task notification interval:', error);
            }
        }, 60 * 1000);
        
        scheduledJobs.set(`${userId}_${taskId}_interval`, intervalId);
        
    } catch (error) {
        console.error('Error executing task notifications:', error);
    }
}

// ==========================================
// MAIN MENU
// ==========================================

bot.command('start', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const username = ctx.from.username || ctx.from.first_name || 'User';
        
        const stats = await getTodayStats(userId);
        
        const message = `👋 Hello, ${username}!\n\n` +
                       `📊 *Today's Task Overview:*\n` +
                       `📋 *Total Tasks:* ${stats.total}\n` +
                       `✅ *Completed:* ${stats.completed}\n` +
                       `⏳ *Pending:* ${stats.pending}\n\n` +
                       `Select an option below:`;
        
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('➕ Add Tasks', 'add_tasks'),
                Markup.button.callback('📝 Add Notes', 'add_notes')
            ],
            [
                Markup.button.callback('📋 View All Tasks', 'view_tasks_1'),
                Markup.button.callback('📜 View History', 'view_history_1')
            ],
            [
                Markup.button.callback('🗒️ View Notes', 'view_notes_1'),
                Markup.button.callback('📥 Download Data', 'download_data')
            ],
            [
                Markup.button.callback('🗑️ Delete All Data', 'delete_data'),
                Markup.button.callback('🆘 Help', 'help')
            ]
        ]);
        
        await safeSendMessage(ctx, message, keyboard);
    } catch (error) {
        console.error('Start command error:', error);
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.');
    }
});

bot.action('back_to_menu', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        await bot.command('start')(ctx);
    } catch (error) {
        console.error('Back to menu error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// ==========================================
// ADD TASKS FLOW
// ==========================================

bot.action('add_tasks', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return await ctx.answerCbQuery('❌ You are not authorized.');
        }
        
        ctx.session = ctx.session || {};
        ctx.session.taskData = {
            step: 'title',
            taskId: generateTaskId(),
            userId: ctx.from.id,
            status: 'pending',
            createdAt: new Date()
        };
        
        await safeEditMessage(ctx, '✏️ *Add New Task*\n\nEnter the title of your task (e.g., "Workout Session"):\n\nType "cancel" to cancel.', {
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
            ])
        });
    } catch (error) {
        console.error('Add tasks error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// Handle text messages for task creation
bot.on('text', async (ctx) => {
    try {
        const messageText = ctx.message.text.trim();
        const userId = ctx.from.id;
        
        if (!ctx.session) {
            ctx.session = {};
        }
        
        if (ctx.session.taskData) {
            const taskData = ctx.session.taskData;
            
            if (messageText.toLowerCase() === 'cancel') {
                delete ctx.session.taskData;
                await safeSendMessage(ctx, '❌ Task creation cancelled.');
                await bot.command('start')(ctx);
                return;
            }
            
            switch (taskData.step) {
                case 'title':
                    if (messageText.length > 50) {
                        await safeSendMessage(ctx, '❌ Title too long. Maximum 50 characters. Please enter a shorter title:');
                        return;
                    }
                    taskData.title = messageText;
                    taskData.step = 'description';
                    await safeSendMessage(ctx, '📝 Enter task description (max 100 words):\n\nType "skip" to leave description empty.', {
                        reply_markup: Markup.inlineKeyboard([
                            [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
                        ])
                    });
                    break;
                    
                case 'description':
                    if (messageText.toLowerCase() !== 'skip') {
                        if (messageText.split(' ').length > 100) {
                            await safeSendMessage(ctx, '❌ Description too long. Maximum 100 words. Please enter a shorter description:');
                            return;
                        }
                        taskData.description = messageText;
                    } else {
                        taskData.description = '';
                    }
                    taskData.step = 'start_time';
                    await safeSendMessage(ctx, '⏰ Enter start time in HH:MM format (24-hour, IST):\n\nExample: 14:30 for 2:30 PM', {
                        reply_markup: Markup.inlineKeyboard([
                            [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
                        ])
                    });
                    break;
                    
                case 'start_time':
                    const startTimeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
                    if (!startTimeRegex.test(messageText)) {
                        await safeSendMessage(ctx, '❌ Invalid time format. Please use HH:MM (24-hour format).\n\nExample: 14:30 for 2:30 PM');
                        return;
                    }
                    
                    const [startHours, startMinutes] = messageText.split(':').map(Number);
                    const now = new Date();
                    const startDate = new Date(now);
                    startDate.setHours(startHours, startMinutes, 0, 0);
                    
                    if (startDate <= now) {
                        startDate.setDate(startDate.getDate() + 1);
                    }
                    
                    taskData.startDate = startDate;
                    taskData.startTime = messageText;
                    taskData.step = 'end_time';
                    await safeSendMessage(ctx, '⏰ Enter end time in HH:MM format (must be after start time):\n\nExample: 15:30 for 3:30 PM', {
                        reply_markup: Markup.inlineKeyboard([
                            [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
                        ])
                    });
                    break;
                    
                case 'end_time':
                    const endTimeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
                    if (!endTimeRegex.test(messageText)) {
                        await safeSendMessage(ctx, '❌ Invalid time format. Please use HH:MM (24-hour format).');
                        return;
                    }
                    
                    const [endHours, endMinutes] = messageText.split(':').map(Number);
                    const endDate = new Date(taskData.startDate);
                    endDate.setHours(endHours, endMinutes, 0, 0);
                    
                    if (endDate <= taskData.startDate) {
                        await safeSendMessage(ctx, '❌ End time must be after start time. Please enter a later time:');
                        return;
                    }
                    
                    const maxEndTime = new Date(taskData.startDate);
                    maxEndTime.setHours(23, 59, 0, 0);
                    
                    if (endDate > maxEndTime) {
                        await safeSendMessage(ctx, '❌ End time cannot exceed 23:59. Please enter a time within the same day:');
                        return;
                    }
                    
                    taskData.endDate = endDate;
                    taskData.endTime = messageText;
                    taskData.step = 'repeat_type';
                    
                    const keyboard = Markup.inlineKeyboard([
                        [
                            Markup.button.callback('🔁 Daily', 'repeat_daily'),
                            Markup.button.callback('📅 Weekly', 'repeat_weekly')
                        ],
                        [
                            Markup.button.callback('❌ None', 'repeat_none'),
                            Markup.button.callback('🔙 Back to Menu', 'back_to_menu')
                        ]
                    ]);
                    
                    await safeSendMessage(ctx, '🔄 Select repeat type:\n\n• Daily: Task repeats every day\n• Weekly: Task repeats every week on same day\n• None: Task doesn\'t repeat', keyboard);
                    break;
                    
                case 'repeat_end_date':
                    if (messageText.toLowerCase() === 'none') {
                        taskData.repeatEndDate = null;
                    } else {
                        const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
                        const match = messageText.match(dateRegex);
                        
                        if (!match) {
                            await safeSendMessage(ctx, '❌ Invalid date format. Please use DD/MM/YYYY.\n\nExample: 12/03/2026\n\nType "none" for no end date.');
                            return;
                        }
                        
                        const [_, day, month, year] = match;
                        const repeatEndDate = new Date(year, month - 1, day);
                        
                        if (isNaN(repeatEndDate.getTime())) {
                            await safeSendMessage(ctx, '❌ Invalid date. Please enter a valid date.');
                            return;
                        }
                        
                        if (repeatEndDate < taskData.startDate) {
                            await safeSendMessage(ctx, '❌ Repeat end date must be after task start date. Please enter a later date:');
                            return;
                        }
                        
                        taskData.repeatEndDate = repeatEndDate;
                    }
                    
                    await saveAndScheduleTask(ctx);
                    break;
                    
                default:
                    delete ctx.session.taskData;
                    await safeSendMessage(ctx, '❌ Invalid step. Task creation cancelled.');
                    await bot.command('start')(ctx);
            }
            return;
        }
        
        if (ctx.session.noteData) {
            const noteData = ctx.session.noteData;
            
            if (messageText.toLowerCase() === 'cancel') {
                delete ctx.session.noteData;
                await safeSendMessage(ctx, '❌ Note creation cancelled.');
                await bot.command('start')(ctx);
                return;
            }
            
            switch (noteData.step) {
                case 'title':
                    if (messageText.length > 50) {
                        await safeSendMessage(ctx, '❌ Title too long. Maximum 50 characters. Please enter a shorter title:');
                        return;
                    }
                    noteData.title = messageText;
                    noteData.step = 'content';
                    await safeSendMessage(ctx, '📝 Enter note content (max 400 words):\n\nType "skip" to leave empty.', {
                        reply_markup: Markup.inlineKeyboard([
                            [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
                        ])
                    });
                    break;
                    
                case 'content':
                    if (messageText.toLowerCase() !== 'skip') {
                        if (messageText.split(' ').length > 400) {
                            await safeSendMessage(ctx, '❌ Content too long. Maximum 400 words. Please enter shorter content:');
                            return;
                        }
                        noteData.content = messageText;
                    } else {
                        noteData.content = '';
                    }
                    
                    const noteToSave = {
                        noteId: noteData.noteId,
                        userId: noteData.userId,
                        title: noteData.title,
                        content: noteData.content || '',
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    
                    const saveResult = await saveNote(noteToSave);
                    
                    if (saveResult.success) {
                        await safeSendMessage(ctx, `✅ Note saved successfully!\n\n📌 *ID:* ${noteData.noteId}\n📝 *Title:* ${noteData.title}\n\nNote has been saved to your collection.`);
                        
                        setTimeout(async () => {
                            await bot.command('start')(ctx);
                        }, 1500);
                    } else {
                        await safeSendMessage(ctx, '❌ Failed to save note. Please try again.');
                    }
                    
                    delete ctx.session.noteData;
                    break;
            }
            return;
        }
        
    } catch (error) {
        console.error('Text handler error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Handle repeat type selection
bot.action('repeat_daily', async (ctx) => {
    try {
        if (!ctx.session?.taskData) {
            return await ctx.answerCbQuery('❌ Session expired.');
        }
        
        ctx.session.taskData.repeatType = 'daily';
        ctx.session.taskData.step = 'repeat_end_date';
        
        await safeEditMessage(ctx, '📅 Enter end date for daily repetition (DD/MM/YYYY):\n\nExample: 12/03/2026\n\nType "none" for no end date.', {
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
            ])
        });
        
        await ctx.answerCbQuery('✅ Set to repeat daily');
    } catch (error) {
        console.error('Repeat daily error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

bot.action('repeat_weekly', async (ctx) => {
    try {
        if (!ctx.session?.taskData) {
            return await ctx.answerCbQuery('❌ Session expired.');
        }
        
        ctx.session.taskData.repeatType = 'weekly';
        ctx.session.taskData.step = 'repeat_end_date';
        
        await safeEditMessage(ctx, '📅 Enter end date for weekly repetition (DD/MM/YYYY):\n\nExample: 12/03/2026\n\nType "none" for no end date.', {
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
            ])
        });
        
        await ctx.answerCbQuery('✅ Set to repeat weekly');
    } catch (error) {
        console.error('Repeat weekly error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

bot.action('repeat_none', async (ctx) => {
    try {
        if (!ctx.session?.taskData) {
            return await ctx.answerCbQuery('❌ Session expired.');
        }
        
        ctx.session.taskData.repeatType = 'none';
        ctx.session.taskData.repeatEndDate = null;
        
        await saveAndScheduleTask(ctx);
        
        await ctx.answerCbQuery('✅ No repetition set');
    } catch (error) {
        console.error('Repeat none error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

async function saveAndScheduleTask(ctx) {
    try {
        const taskData = ctx.session.taskData;
        
        const taskToSave = {
            taskId: taskData.taskId,
            userId: taskData.userId,
            title: taskData.title,
            description: taskData.description || '',
            startDate: taskData.startDate,
            endDate: taskData.endDate,
            startTime: taskData.startTime,
            endTime: taskData.endTime,
            repeatType: taskData.repeatType,
            repeatEndDate: taskData.repeatEndDate,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        const saveResult = await saveTask(taskToSave);
        
        if (saveResult.success) {
            scheduleTaskNotifications(taskToSave);
            
            const startTimeStr = new Date(taskData.startDate).toLocaleTimeString('en-IN', { 
                timeZone: 'Asia/Kolkata',
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const endTimeStr = new Date(taskData.endDate).toLocaleTimeString('en-IN', { 
                timeZone: 'Asia/Kolkata',
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });
            
            let message = `✅ *Task saved successfully!*\n\n` +
                         `📌 *ID:* ${taskData.taskId}\n` +
                         `📝 *Title:* ${taskData.title}\n` +
                         `⏰ *Start:* ${startTimeStr} IST\n` +
                         `⏰ *End:* ${endTimeStr} IST\n` +
                         `🔄 *Repeat:* ${taskData.repeatType === 'none' ? 'No repetition' : taskData.repeatType}\n\n`;
            
            if (taskData.repeatEndDate) {
                message += `📅 *Repeat until:* ${taskData.repeatEndDate.toLocaleDateString('en-IN')}\n\n`;
            }
            
            message += `🔔 Notifications will start 10 minutes before task start time.`;
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
                ])
            });
            
            delete ctx.session.taskData;
            
        } else {
            await ctx.reply('❌ Failed to save task. Please try again.', {
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
                ])
            });
        }
    } catch (error) {
        console.error('Save task error:', error);
        await ctx.reply('❌ Failed to save task.', {
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
            ])
        });
    }
}

// ==========================================
// ADD NOTES FLOW
// ==========================================

bot.action('add_notes', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return await ctx.answerCbQuery('❌ You are not authorized.');
        }
        
        ctx.session = ctx.session || {};
        ctx.session.noteData = {
            step: 'title',
            noteId: generateNoteId(),
            userId: ctx.from.id
        };
        
        await safeEditMessage(ctx, '✏️ *Add New Note*\n\nEnter the title of your note:\n\nType "cancel" to cancel.', {
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
            ])
        });
    } catch (error) {
        console.error('Add notes error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// ==========================================
// VIEW TASKS WITH PAGINATION
// ==========================================

bot.action(/^view_tasks_(\d+)$/, async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return await ctx.answerCbQuery('❌ You are not authorized.');
        }
        
        const page = parseInt(ctx.match[1]);
        await showTasksPage(ctx, page);
        
    } catch (error) {
        console.error('View tasks error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

async function showTasksPage(ctx, page) {
    try {
        const userId = ctx.from.id;
        const tasksData = await getPaginatedTasks(userId, page, 10);
        const tasks = tasksData.tasks;
        
        if (tasks.length === 0) {
            await safeEditMessage(ctx, '📭 *No tasks found.*\n\nUse "Add Tasks" to create new tasks.', {
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Add Tasks', 'add_tasks')],
                    [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
                ])
            });
            return;
        }
        
        let tasksText = `📋 *Your Tasks (Page ${page}/${tasksData.totalPages})*\n\n`;
        
        const keyboard = [];
        
        tasks.forEach((task, index) => {
            const taskNum = (page - 1) * 10 + index + 1;
            const startDate = new Date(task.startDate);
            const startTimeStr = startDate.toLocaleTimeString('en-IN', { 
                timeZone: 'Asia/Kolkata',
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });
            
            tasksText += `${taskNum}. ${task.title}\n   ⏰ ${startTimeStr} IST | 📌 ${task.taskId}\n\n`;
            
            const buttonText = `📌 ${task.taskId} - ${task.title.substring(0, 20)}${task.title.length > 20 ? '...' : ''}`;
            keyboard.push([Markup.button.callback(buttonText, `task_detail_${task.taskId}`)]);
        });
        
        tasksText += `*Total:* ${tasksData.totalTasks} tasks`;
        
        const navRow = [];
        if (tasksData.hasPrev) {
            navRow.push(Markup.button.callback('◀️ Previous', `view_tasks_${page - 1}`));
        }
        navRow.push(Markup.button.callback(`📄 ${page}/${tasksData.totalPages}`, 'no_action'));
        if (tasksData.hasNext) {
            navRow.push(Markup.button.callback('Next ▶️', `view_tasks_${page + 1}`));
        }
        
        if (navRow.length > 0) {
            keyboard.push(navRow);
        }
        
        keyboard.push([Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]);
        
        await safeEditMessage(ctx, tasksText, {
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
        
    } catch (error) {
        console.error('Show tasks page error:', error);
        await safeEditMessage(ctx, '❌ Failed to load tasks.', {
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
            ])
        });
    }
}

bot.action('no_action', async (ctx) => {
    await ctx.answerCbQuery();
});

bot.action(/^task_detail_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const task = await getTaskById(taskId);
        
        if (!task) {
            return await ctx.answerCbQuery('❌ Task not found.');
        }
        
        const startDate = new Date(task.startDate);
        const startTimeStr = startDate.toLocaleTimeString('en-IN', { 
            timeZone: 'Asia/Kolkata',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const endDate = new Date(task.endDate);
        const endTimeStr = endDate.toLocaleTimeString('en-IN', { 
            timeZone: 'Asia/Kolkata',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const createdAt = new Date(task.createdAt);
        const createdAtStr = createdAt.toLocaleString('en-IN', { 
            timeZone: 'Asia/Kolkata',
            dateStyle: 'medium',
            timeStyle: 'short'
        });
        
        let message = `📋 *Task Details*\n\n` +
                     `📌 *ID:* ${task.taskId}\n` +
                     `📝 *Title:* ${task.title}\n` +
                     `📄 *Description:* ${task.description || 'No description'}\n` +
                     `⏰ *Start Time:* ${startTimeStr} IST\n` +
                     `⏰ *End Time:* ${endTimeStr} IST\n` +
                     `🔄 *Repeat:* ${task.repeatType === 'none' ? 'No repetition' : task.repeatType}\n` +
                     `📅 *Created:* ${createdAtStr}\n` +
                     `📊 *Status:* ${task.status === 'completed' ? '✅ Completed' : '⏳ Pending'}`;
        
        if (task.repeatEndDate) {
            message += `\n📅 *Repeat until:* ${new Date(task.repeatEndDate).toLocaleDateString('en-IN')}`;
        }
        
        if (task.completedAt) {
            const completedDate = new Date(task.completedAt);
            const completedStr = completedDate.toLocaleString('en-IN', { 
                timeZone: 'Asia/Kolkata',
                dateStyle: 'medium',
                timeStyle: 'short'
            });
            message += `\n✅ *Completed at:* ${completedStr}`;
        }
        
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ Mark Complete', `complete_task_${taskId}`),
                Markup.button.callback('✏️ Edit', `edit_task_${taskId}`)
            ],
            [
                Markup.button.callback('🗑️ Delete', `delete_task_${taskId}`),
                Markup.button.callback('↩️ Back to Tasks', 'view_tasks_1')
            ],
            [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
        ]);
        
        await safeEditMessage(ctx, message, {
            reply_markup: keyboard
        });
        
    } catch (error) {
        console.error('Task detail error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

bot.action(/^complete_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const task = await getTaskById(taskId);
        
        if (!task) {
            return await ctx.answerCbQuery('❌ Task not found.');
        }
        
        const updateResult = await updateTask(taskId, {
            status: 'completed',
            completedAt: new Date()
        });
        
        if (updateResult.success) {
            if (scheduledJobs.has(`${ctx.from.id}_${taskId}`)) {
                const job = scheduledJobs.get(`${ctx.from.id}_${taskId}`);
                if (job) job.cancel();
                scheduledJobs.delete(`${ctx.from.id}_${taskId}`);
            }
            
            if (scheduledJobs.has(`${ctx.from.id}_${taskId}_interval`)) {
                const interval = scheduledJobs.get(`${ctx.from.id}_${taskId}_interval`);
                if (interval) clearInterval(interval);
                scheduledJobs.delete(`${ctx.from.id}_${taskId}_interval`);
            }
            
            await ctx.answerCbQuery('✅ Task marked as complete!');
            
            await bot.action(`task_detail_${taskId}`)(ctx);
        } else {
            await ctx.answerCbQuery('❌ Failed to update task.');
        }
    } catch (error) {
        console.error('Complete task error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

bot.action(/^delete_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        
        const deleteResult = await deleteTask(taskId);
        
        if (deleteResult.success) {
            if (scheduledJobs.has(`${ctx.from.id}_${taskId}`)) {
                const job = scheduledJobs.get(`${ctx.from.id}_${taskId}`);
                if (job) job.cancel();
                scheduledJobs.delete(`${ctx.from.id}_${taskId}`);
            }
            
            if (scheduledJobs.has(`${ctx.from.id}_${taskId}_interval`)) {
                const interval = scheduledJobs.get(`${ctx.from.id}_${taskId}_interval`);
                if (interval) clearInterval(interval);
                scheduledJobs.delete(`${ctx.from.id}_${taskId}_interval`);
            }
            
            await ctx.answerCbQuery('✅ Task deleted!');
            
            await bot.action('view_tasks_1')(ctx);
        } else {
            await ctx.answerCbQuery('❌ Failed to delete task.');
        }
    } catch (error) {
        console.error('Delete task error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

bot.action(/^edit_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        
        await ctx.answerCbQuery('⚠️ Edit feature coming soon!');
        
        await bot.action(`task_detail_${taskId}`)(ctx);
        
    } catch (error) {
        console.error('Edit task error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// ==========================================
// VIEW HISTORY WITH PAGINATION
// ==========================================

bot.action(/^view_history_(\d+)$/, async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return await ctx.answerCbQuery('❌ You are not authorized.');
        }
        
        const page = parseInt(ctx.match[1]);
        await showHistoryPage(ctx, page);
        
    } catch (error) {
        console.error('View history error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

async function showHistoryPage(ctx, page) {
    try {
        const userId = ctx.from.id;
        const historyData = await getPaginatedHistoryDates(userId, page, 10);
        const dates = historyData.dates;
        
        if (dates.length === 0) {
            await safeEditMessage(ctx, '📭 *No history found.*\n\nComplete some tasks to see history here.', {
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('📋 View Tasks', 'view_tasks_1')],
                    [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
                ])
            });
            return;
        }
        
        let historyText = `📜 *Task History (Page ${page}/${historyData.totalPages})*\n\n`;
        
        const keyboard = [];
        
        dates.forEach((date, index) => {
            const dateNum = (page - 1) * 10 + index + 1;
            historyText += `${dateNum}. ${date.displayDate}\n   ✅ ${date.count} tasks completed\n\n`;
            
            const dateStr = date.date.toISOString().split('T')[0];
            const buttonText = `📅 ${date.displayDate.substring(0, 30)} (${date.count} tasks)`;
            keyboard.push([Markup.button.callback(buttonText, `history_date_${dateStr}_1`)]);
        });
        
        historyText += `*Total:* ${historyData.totalDates} days with completed tasks`;
        
        const navRow = [];
        if (historyData.hasPrev) {
            navRow.push(Markup.button.callback('◀️ Previous', `view_history_${page - 1}`));
        }
        navRow.push(Markup.button.callback(`📄 ${page}/${historyData.totalPages}`, 'no_action'));
        if (historyData.hasNext) {
            navRow.push(Markup.button.callback('Next ▶️', `view_history_${page + 1}`));
        }
        
        if (navRow.length > 0) {
            keyboard.push(navRow);
        }
        
        keyboard.push([Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]);
        
        await safeEditMessage(ctx, historyText, {
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
        
    } catch (error) {
        console.error('Show history page error:', error);
        await safeEditMessage(ctx, '❌ Failed to load history.', {
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
            ])
        });
    }
}

bot.action(/^history_date_(.+)_(\d+)$/, async (ctx) => {
    try {
        const [dateStr, pageStr] = [ctx.match[1], ctx.match[2]];
        const page = parseInt(pageStr);
        const userId = ctx.from.id;
        const date = new Date(dateStr);
        
        const tasksData = await getPaginatedTasksByDate(userId, date, page, 10);
        const tasks = tasksData.tasks;
        
        if (tasks.length === 0) {
            await safeEditMessage(ctx, `📭 No tasks found for ${date.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`, {
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('↩️ Back to History', 'view_history_1')],
                    [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
                ])
            });
            return;
        }
        
        const displayDate = date.toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        let message = `📅 *Tasks Completed on ${displayDate}*\n*Page ${page}/${tasksData.totalPages}*\n\n`;
        
        const keyboard = [];
        
        tasks.forEach((task, index) => {
            const taskNum = (page - 1) * 10 + index + 1;
            const completedAt = new Date(task.completedAt);
            const completedTimeStr = completedAt.toLocaleTimeString('en-IN', { 
                timeZone: 'Asia/Kolkata',
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });
            
            message += `${taskNum}. ${task.title}\n   ✅ ${completedTimeStr} IST | 📌 ${task.taskId}\n\n`;
            
            const buttonText = `📌 ${task.taskId} - ${task.title.substring(0, 20)}${task.title.length > 20 ? '...' : ''}`;
            keyboard.push([Markup.button.callback(buttonText, `task_detail_${task.taskId}`)]);
        });
        
        const navRow = [];
        if (tasksData.hasPrev) {
            navRow.push(Markup.button.callback('◀️ Previous', `history_date_${dateStr}_${page - 1}`));
        }
        navRow.push(Markup.button.callback(`📄 ${page}/${tasksData.totalPages}`, 'no_action'));
        if (tasksData.hasNext) {
            navRow.push(Markup.button.callback('Next ▶️', `history_date_${dateStr}_${page + 1}`));
        }
        
        if (navRow.length > 0) {
            keyboard.push(navRow);
        }
        
        keyboard.push([Markup.button.callback('📜 Back to History', 'view_history_1')]);
        keyboard.push([Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]);
        
        await safeEditMessage(ctx, message, {
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
        
    } catch (error) {
        console.error('History date error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// ==========================================
// VIEW NOTES WITH PAGINATION
// ==========================================

bot.action(/^view_notes_(\d+)$/, async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return await ctx.answerCbQuery('❌ You are not authorized.');
        }
        
        const page = parseInt(ctx.match[1]);
        await showNotesPage(ctx, page);
        
    } catch (error) {
        console.error('View notes error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

async function showNotesPage(ctx, page) {
    try {
        const userId = ctx.from.id;
        const notesData = await getPaginatedNotes(userId, page, 10);
        const notes = notesData.notes;
        
        if (notes.length === 0) {
            await safeEditMessage(ctx, '📭 *No notes found.*\n\nUse "Add Notes" to create new notes.', {
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('📝 Add Notes', 'add_notes')],
                    [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
                ])
            });
            return;
        }
        
        let notesText = `🗒️ *Your Notes (Page ${page}/${notesData.totalPages})*\n\n`;
        
        const keyboard = [];
        
        notes.forEach((note, index) => {
            const noteNum = (page - 1) * 10 + index + 1;
            const createdDate = new Date(note.createdAt);
            const dateStr = createdDate.toLocaleDateString('en-IN');
            
            notesText += `${noteNum}. ${note.title}\n   📌 ${note.noteId} | 📅 ${dateStr}\n\n`;
            
            const buttonText = `📌 ${note.noteId} - ${note.title.substring(0, 20)}${note.title.length > 20 ? '...' : ''}`;
            keyboard.push([Markup.button.callback(buttonText, `note_detail_${note.noteId}`)]);
        });
        
        notesText += `*Total:* ${notesData.totalNotes} notes`;
        
        const navRow = [];
        if (notesData.hasPrev) {
            navRow.push(Markup.button.callback('◀️ Previous', `view_notes_${page - 1}`));
        }
        navRow.push(Markup.button.callback(`📄 ${page}/${notesData.totalPages}`, 'no_action'));
        if (notesData.hasNext) {
            navRow.push(Markup.button.callback('Next ▶️', `view_notes_${page + 1}`));
        }
        
        if (navRow.length > 0) {
            keyboard.push(navRow);
        }
        
        keyboard.push([Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]);
        
        await safeEditMessage(ctx, notesText, {
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
        
    } catch (error) {
        console.error('Show notes page error:', error);
        await safeEditMessage(ctx, '❌ Failed to load notes.', {
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
            ])
        });
    }
}

bot.action(/^note_detail_(.+)$/, async (ctx) => {
    try {
        const noteId = ctx.match[1];
        const note = await getNoteById(noteId);
        
        if (!note) {
            return await ctx.answerCbQuery('❌ Note not found.');
        }
        
        const createdAt = new Date(note.createdAt);
        const createdAtStr = createdAt.toLocaleString('en-IN', { 
            timeZone: 'Asia/Kolkata',
            dateStyle: 'medium',
            timeStyle: 'short'
        });
        
        const updatedAt = new Date(note.updatedAt);
        const updatedAtStr = updatedAt.toLocaleString('en-IN', { 
            timeZone: 'Asia/Kolkata',
            dateStyle: 'medium',
            timeStyle: 'short'
        });
        
        let message = `🗒️ *Note Details*\n\n` +
                     `📌 *ID:* ${note.noteId}\n` +
                     `📝 *Title:* ${note.title}\n` +
                     `📄 *Content:*\n${note.content || 'No content'}\n\n` +
                     `📅 *Created:* ${createdAtStr}\n` +
                     `📅 *Updated:* ${updatedAtStr}`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Back to Notes', 'view_notes_1')],
            [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
        ]);
        
        await safeEditMessage(ctx, message, {
            reply_markup: keyboard
        });
        
    } catch (error) {
        console.error('Note detail error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// ==========================================
// DOWNLOAD DATA
// ==========================================

bot.action('download_data', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return await ctx.answerCbQuery('❌ You are not authorized.');
        }
        
        const userId = ctx.from.id;
        
        const tasks = await db.collection('tasks').find({ userId: userId }).toArray();
        const notes = await db.collection('notes').find({ userId: userId }).toArray();
        
        let message = `📥 *Your Data Summary*\n\n`;
        message += `📋 *Tasks:* ${tasks.length}\n`;
        message += `🗒️ *Notes:* ${notes.length}\n\n`;
        message += `Select what you want to download:`;
        
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('📋 Tasks JSON', 'download_tasks'),
                Markup.button.callback('🗒️ Notes JSON', 'download_notes')
            ],
            [
                Markup.button.callback('📦 All Data', 'download_all'),
                Markup.button.callback('🔙 Back to Menu', 'back_to_menu')
            ]
        ]);
        
        await safeEditMessage(ctx, message, {
            reply_markup: keyboard
        });
        
    } catch (error) {
        console.error('Download data error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

bot.action('download_tasks', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const tasks = await db.collection('tasks').find({ userId: userId }).toArray();
        
        const tasksJson = JSON.stringify(tasks, null, 2);
        
        await ctx.replyWithDocument({
            source: Buffer.from(tasksJson),
            filename: `tasks_${userId}_${Date.now()}.json`
        });
        
        await ctx.answerCbQuery('✅ Tasks data sent as file!');
        
    } catch (error) {
        console.error('Download tasks error:', error);
        await ctx.answerCbQuery('❌ Failed to download tasks.');
    }
});

bot.action('download_notes', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const notes = await db.collection('notes').find({ userId: userId }).toArray();
        
        const notesJson = JSON.stringify(notes, null, 2);
        
        await ctx.replyWithDocument({
            source: Buffer.from(notesJson),
            filename: `notes_${userId}_${Date.now()}.json`
        });
        
        await ctx.answerCbQuery('✅ Notes data sent as file!');
        
    } catch (error) {
        console.error('Download notes error:', error);
        await ctx.answerCbQuery('❌ Failed to download notes.');
    }
});

bot.action('download_all', async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        const tasks = await db.collection('tasks').find({ userId: userId }).toArray();
        const notes = await db.collection('notes').find({ userId: userId }).toArray();
        
        const allData = {
            tasks: tasks,
            notes: notes,
            exportedAt: new Date().toISOString(),
            userId: userId
        };
        
        const allDataJson = JSON.stringify(allData, null, 2);
        
        await ctx.replyWithDocument({
            source: Buffer.from(allDataJson),
            filename: `all_data_${userId}_${Date.now()}.json`
        });
        
        await ctx.answerCbQuery('✅ All data sent as file!');
        
    } catch (error) {
        console.error('Download all error:', error);
        await ctx.answerCbQuery('❌ Failed to download data.');
    }
});

// ==========================================
// DELETE DATA
// ==========================================

bot.action('delete_data', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return await ctx.answerCbQuery('❌ You are not authorized.');
        }
        
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ YES, DELETE ALL', 'confirm_delete_all'),
                Markup.button.callback('❌ NO, CANCEL', 'back_to_menu')
            ]
        ]);
        
        await safeEditMessage(ctx, '🚨 *DELETE ALL DATA*\n\n⚠️ **WARNING: This action cannot be undone!**\n\nThis will delete:\n• All your tasks\n• All your notes\n• All your history\n\nAre you absolutely sure?', {
            reply_markup: keyboard
        });
        
    } catch (error) {
        console.error('Delete data error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

bot.action('confirm_delete_all', async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        for (const [key, job] of scheduledJobs) {
            if (key.startsWith(`${userId}_`)) {
                if (job) {
                    if (typeof job.cancel === 'function') {
                        job.cancel();
                    } else if (typeof clearInterval === 'function') {
                        clearInterval(job);
                    }
                }
                scheduledJobs.delete(key);
            }
        }
        
        const tasksResult = await db.collection('tasks').deleteMany({ userId: userId });
        const notesResult = await db.collection('notes').deleteMany({ userId: userId });
        
        await safeEditMessage(ctx, `✅ *All data deleted successfully!*\n\n🗑️ Deleted:\n• ${tasksResult.deletedCount} tasks\n• ${notesResult.deletedCount} notes\n\nYour data has been permanently removed.`, {
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('🏠 Back to Menu', 'back_to_menu')]
            ])
        });
        
        await ctx.answerCbQuery('✅ All data deleted!');
        
    } catch (error) {
        console.error('Confirm delete error:', error);
        await ctx.answerCbQuery('❌ Failed to delete data.');
    }
});

// ==========================================
// HELP
// ==========================================

bot.action('help', async (ctx) => {
    try {
        const helpMessage = `🆘 *Task Manager Bot Help*\n\n` +
                          `*Available Features:*\n\n` +
                          `📋 *Task Management:*\n` +
                          `• Create tasks with start/end times\n` +
                          `• Set daily/weekly repetition\n` +
                          `• Get notifications 10 mins before tasks\n` +
                          `• Mark tasks as complete\n` +
                          `• Edit/Delete tasks\n\n` +
                          `🗒️ *Notes:*\n` +
                          `• Create and manage notes\n` +
                          `• View note history\n\n` +
                          `📊 *Statistics:*\n` +
                          `• Daily task overview\n` +
                          `• Completion history\n` +
                          `• Progress tracking\n\n` +
                          `📥 *Data Management:*\n` +
                          `• Download all data as JSON\n` +
                          `• Delete all data (with confirmation)\n\n` +
                          `*Tips:*\n` +
                          `• Use 24-hour format for times\n` +
                          `• Tasks automatically adjust for IST timezone\n` +
                          `• Notifications start 10 minutes before task start\n` +
                          `• Repeating tasks auto-create for next day/week`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Back to Menu', 'back_to_menu')]
        ]);
        
        await safeEditMessage(ctx, helpMessage, {
            reply_markup: keyboard
        });
        
    } catch (error) {
        console.error('Help error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// ==========================================
// ERROR HANDLING
// ==========================================

bot.catch((error, ctx) => {
    console.error('Bot error:', error);
    
    try {
        if (ctx.message) {
            ctx.reply('❌ An error occurred. Please try again.', {
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
                ])
            });
        }
    } catch (e) {
        console.error('Error in error handler:', e);
    }
});

// ==========================================
// INITIALIZE AND START BOT
// ==========================================

async function initBot() {
    try {
        if (isDbConnected && db) {
            await db.collection('tasks').createIndex({ userId: 1, taskId: 1 }, { unique: true });
            await db.collection('tasks').createIndex({ userId: 1, startDate: 1 });
            await db.collection('tasks').createIndex({ userId: 1, status: 1 });
            await db.collection('tasks').createIndex({ userId: 1, completedAt: 1 });
            
            await db.collection('notes').createIndex({ userId: 1, noteId: 1 }, { unique: true });
            await db.collection('notes').createIndex({ userId: 1, createdAt: -1 });
            
            console.log('✅ Database indexes created');
        }
        
        console.log('✅ Bot initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Error initializing bot:', error);
        return false;
    }
}

async function startBot() {
    try {
        console.log('🔗 Connecting to MongoDB...');
        const dbConnected = await connectDB();
        if (!dbConnected) {
            console.error('❌ Failed to connect to database');
            setTimeout(startBot, 5000);
            return;
        }
        
        await initBot();
        
        console.log('🚀 Starting bot...');
        await bot.launch({
            dropPendingUpdates: true,
            allowedUpdates: ['message', 'callback_query']
        });
        console.log('🤖 Bot is running...');
        
        try {
            const now = new Date();
            const istTime = now.toLocaleTimeString('en-IN', { 
                timeZone: 'Asia/Kolkata',
                hour12: false 
            });
            
            await bot.telegram.sendMessage(ADMIN_IDS[0], 
                `🤖 Task Manager Bot started successfully!\n` +
                `Time: ${istTime} IST\n` +
                `Task scheduler is ready.`
            );
            console.log('✅ Startup message sent to admin');
        } catch (error) {
            console.log('⚠️ Could not send startup message:', error.message);
        }
        
        process.once('SIGINT', () => {
            console.log('🛑 SIGINT received, shutting down gracefully...');
            
            for (const [key, job] of scheduledJobs) {
                if (job) {
                    if (typeof job.cancel === 'function') {
                        job.cancel();
                    } else if (typeof clearInterval === 'function') {
                        clearInterval(job);
                    }
                }
            }
            
            bot.stop('SIGINT');
            if (client) client.close();
            process.exit(0);
        });
        
        process.once('SIGTERM', () => {
            console.log('🛑 SIGTERM received, shutting down gracefully...');
            
            for (const [key, job] of scheduledJobs) {
                if (job) {
                    if (typeof job.cancel === 'function') {
                        job.cancel();
                    } else if (typeof clearInterval === 'function') {
                        clearInterval(job);
                    }
                }
            }
            
            bot.stop('SIGTERM');
            if (client) client.close();
            process.exit(0);
        });
        
    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        setTimeout(startBot, 10000);
    }
}

// Start the bot
startBot();
console.log('🚀 Task Manager Bot Starting...');

// Railway deployment support
const PORT = process.env.PORT || 3000;
if (process.env.RAILWAY_ENVIRONMENT || process.env.PORT) {
    const http = require('http');
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Task Manager Bot is running...');
    });
    
    server.listen(PORT, () => {
        console.log(`🚂 Server listening on port ${PORT}`);
    });
}
