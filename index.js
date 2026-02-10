const { Telegraf, session, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');
const schedule = require('node-schedule');
require('dotenv').config();

// Initialize bot
const BOT_TOKEN = process.env.BOT_TOKEN || 'your_bot_token_here';
const bot = new Telegraf(BOT_TOKEN);

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/task_manager_bot';
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

// Helper function to safely send messages
async function safeSendMessage(ctx, text, options = {}) {
    try {
        return await ctx.reply(text, { 
            parse_mode: 'HTML',
            ...options 
        });
    } catch (error) {
        console.error('Error sending message:', error.message);
        return await ctx.reply(text);
    }
}

// Helper function to safely edit messages
async function safeEditMessage(ctx, text, options = {}) {
    try {
        return await ctx.editMessageText(text, { 
            parse_mode: 'HTML',
            ...options 
        });
    } catch (error) {
        console.error('Error editing message:', error.message);
        return await ctx.editMessageText(text, options);
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
        
        // Get today's tasks
        const tasks = await db.collection('tasks').find({
            userId: userId,
            startDate: { $gte: today, $lt: tomorrow },
            status: { $ne: 'deleted' }
        }).toArray();
        
        // Get completed tasks
        const completedTasks = tasks.filter(task => task.status === 'completed');
        
        // Get pending tasks
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
        const result = await db.collection('tasks').insertOne(taskData);
        return { success: true, taskId: taskData.taskId };
    } catch (error) {
        console.error('Error saving task:', error);
        return { success: false, error: error.message };
    }
}

async function saveNote(noteData) {
    try {
        const result = await db.collection('notes').insertOne(noteData);
        return { success: true, noteId: noteData.noteId };
    } catch (error) {
        console.error('Error saving note:', error);
        return { success: false, error: error.message };
    }
}

async function getTasks(userId, page = 1, limit = 10, filter = {}) {
    try {
        const skip = (page - 1) * limit;
        const query = { userId: userId, status: { $ne: 'deleted' }, ...filter };
        
        const tasks = await db.collection('tasks')
            .find(query)
            .sort({ startDate: 1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        const totalTasks = await db.collection('tasks').countDocuments(query);
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
        console.error('Error getting tasks:', error);
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

async function getNotes(userId, page = 1, limit = 10) {
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
        console.error('Error getting notes:', error);
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

async function getHistoryDates(userId, page = 1, limit = 10) {
    try {
        const skip = (page - 1) * limit;
        
        // Get unique completion dates
        const dates = await db.collection('tasks').aggregate([
            { $match: { userId: userId, status: 'completed' } },
            { $group: { 
                _id: { 
                    year: { $year: "$completedAt" },
                    month: { $month: "$completedAt" },
                    day: { $dayOfMonth: "$completedAt" }
                },
                date: { $first: "$completedAt" },
                count: { $sum: 1 }
            }},
            { $sort: { date: -1 } },
            { $skip: skip },
            { $limit: limit }
        ]).toArray();
        
        const totalDates = await db.collection('tasks').distinct('completedAt', { 
            userId: userId, 
            status: 'completed' 
        });
        
        const totalPages = Math.ceil(totalDates.length / limit);
        
        return {
            dates: dates.map(d => ({
                date: d.date,
                count: d.count,
                displayDate: new Date(d.date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                })
            })),
            page,
            totalPages,
            totalDates: totalDates.length,
            hasNext: page < totalPages,
            hasPrev: page > 1
        };
    } catch (error) {
        console.error('Error getting history dates:', error);
        return { dates: [], page: 1, totalPages: 0, totalDates: 0, hasNext: false, hasPrev: false };
    }
}

async function getTasksByDate(userId, date, page = 1, limit = 10) {
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
        console.error('Error getting tasks by date:', error);
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
        
        // Clear any existing job for this task
        if (scheduledJobs.has(`${userId}_${taskId}`)) {
            const job = scheduledJobs.get(`${userId}_${taskId}`);
            if (job) job.cancel();
            scheduledJobs.delete(`${userId}_${taskId}`);
        }
        
        // Schedule notifications starting 10 minutes before task
        const startTime = new Date(task.startDate);
        const notificationStartTime = new Date(startTime);
        notificationStartTime.setMinutes(notificationStartTime.getMinutes() - 10);
        
        const job = schedule.scheduleJob(notificationStartTime, async function() {
            await executeTaskNotifications(task);
        });
        
        scheduledJobs.set(`${userId}_${taskId}`, job);
        
        console.log(`✅ Scheduled notifications for task ${taskId} at ${notificationStartTime}`);
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
        
        // Create interval for notifications
        const intervalId = setInterval(async () => {
            try {
                count++;
                
                const now = new Date();
                const timeLeft = Math.max(0, Math.floor((startTime - now) / 1000));
                const minutesLeft = Math.floor(timeLeft / 60);
                const secondsLeft = timeLeft % 60;
                
                const message = `🔔 Task Reminder ${count}/${totalMessages}\n\n` +
                               `Task: ${task.title}\n` +
                               `Starts at: ${new Date(task.startDate).toLocaleTimeString()}\n` +
                               `Time left: ${minutesLeft}m ${secondsLeft}s\n` +
                               `Current time: ${now.toLocaleTimeString()}`;
                
                await bot.telegram.sendMessage(userId, message);
                
                // Stop after 10 messages or when task starts
                if (count >= totalMessages || now >= startTime) {
                    clearInterval(intervalId);
                    
                    if (now >= startTime) {
                        await bot.telegram.sendMessage(userId, `⏰ Task "${task.title}" has started!`);
                    } else {
                        await bot.telegram.sendMessage(userId, `✅ Task "${task.title}" notifications completed!`);
                    }
                }
            } catch (error) {
                console.error('Error in task notification interval:', error);
            }
        }, 60 * 1000); // Every minute
        
        // Send first notification immediately
        count++;
        const now = new Date();
        const timeLeft = Math.max(0, Math.floor((startTime - now) / 1000));
        const minutesLeft = Math.floor(timeLeft / 60);
        const secondsLeft = timeLeft % 60;
        
        const firstMessage = `🔔 Task Reminder 1/${totalMessages}\n\n` +
                           `Task: ${task.title}\n` +
                           `Starts at: ${new Date(task.startDate).toLocaleTimeString()}\n` +
                           `Time left: ${minutesLeft}m ${secondsLeft}s\n` +
                           `Current time: ${now.toLocaleTimeString()}\n\n` +
                           `Notifications will continue every minute.`;
        
        await bot.telegram.sendMessage(userId, firstMessage);
        
    } catch (error) {
        console.error('Error executing task notifications:', error);
    }
}

// ==========================================
// MAIN MENU
// ==========================================

// /start command
bot.command('start', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const username = ctx.from.username || ctx.from.first_name || 'User';
        
        // Get today's stats
        const stats = await getTodayStats(userId);
        
        const message = `👋 Hello, ${username}!\n\n` +
                       `📊 Today's Task Overview:\n` +
                       `📋 Total Tasks: ${stats.total}\n` +
                       `✅ Completed: ${stats.completed}\n` +
                       `⏳ Pending: ${stats.pending}\n\n` +
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

// ==========================================
// ADD TASKS FLOW
// ==========================================

bot.action('add_tasks', async (ctx) => {
    try {
        // Initialize task data in session
        ctx.session.taskData = {
            step: 'title',
            taskId: generateTaskId(),
            userId: ctx.from.id,
            status: 'pending',
            createdAt: new Date()
        };
        
        await ctx.editMessageText('✏️ *Add New Task*\n\nEnter the title of your task (e.g., "Workout Session"):\n\nType "cancel" to cancel.', {
            parse_mode: 'Markdown'
        });
    } catch (error) {
        console.error('Add tasks error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// Handle task creation steps
bot.on('text', async (ctx) => {
    try {
        const messageText = ctx.message.text;
        const userId = ctx.from.id;
        
        // Check if we're in task creation flow
        if (ctx.session?.taskData) {
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
                    await safeSendMessage(ctx, '📝 Enter task description (max 100 words):\n\nType "skip" to leave description empty.');
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
                    await safeSendMessage(ctx, '⏰ Enter start time in HH:MM format (24-hour):\n\nExample: 14:30 for 2:30 PM');
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
                    
                    // If start time is in the past, schedule for tomorrow
                    if (startDate <= now) {
                        startDate.setDate(startDate.getDate() + 1);
                    }
                    
                    taskData.startDate = startDate;
                    taskData.startTime = messageText;
                    taskData.step = 'end_time';
                    await safeSendMessage(ctx, '⏰ Enter end time in HH:MM format (must be after start time):\n\nExample: 15:30 for 3:30 PM');
                    break;
                    
                case 'end_time':
                    const endTimeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
                    if (!endTimeRegex.test(messageText)) {
                        await safeSendMessage(ctx, '❌ Invalid time format. Please use HH:MM (24-hour format).');
                        return;
                    }
                    
                    const [endHours, endMinutes] = messageText.split(':').map(Number);
                    
                    // Validate end time is after start time
                    const endDate = new Date(taskData.startDate);
                    endDate.setHours(endHours, endMinutes, 0, 0);
                    
                    if (endDate <= taskData.startDate) {
                        await safeSendMessage(ctx, '❌ End time must be after start time. Please enter a later time:');
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
                            Markup.button.callback('↩️ Back', 'task_back')
                        ]
                    ]);
                    
                    await safeSendMessage(ctx, '🔄 Select repeat type:\n\n• Daily: Task repeats every day\n• Weekly: Task repeats every week on same day\n• None: Task doesn\'t repeat', keyboard);
                    break;
                    
                default:
                    delete ctx.session.taskData;
                    await safeSendMessage(ctx, '❌ Invalid step. Task creation cancelled.');
                    await bot.command('start')(ctx);
            }
            return;
        }
        
        // Check if we're in note creation flow
        if (ctx.session?.noteData) {
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
                    await safeSendMessage(ctx, '📝 Enter note content (max 400 words):\n\nType "skip" to leave empty.');
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
                    
                    // Save note
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
                        await safeSendMessage(ctx, `✅ Note saved successfully!\n\n📌 ID: ${noteData.noteId}\n📝 Title: ${noteData.title}\n\nNote has been saved to your collection.`);
                        
                        // Return to main menu
                        setTimeout(async () => {
                            await bot.command('start')(ctx);
                        }, 1000);
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
        
        await ctx.editMessageText('📅 Enter end date for daily repetition (DD/MM/YYYY):\n\nExample: 12/03/2026\n\nType "none" for no end date.', {
            parse_mode: 'Markdown'
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
        
        await ctx.editMessageText('📅 Enter end date for weekly repetition (DD/MM/YYYY):\n\nExample: 12/03/2026\n\nType "none" for no end date.', {
            parse_mode: 'Markdown'
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
        
        // Save the task
        await saveAndScheduleTask(ctx);
        
        await ctx.answerCbQuery('✅ No repetition set');
    } catch (error) {
        console.error('Repeat none error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

bot.action('task_back', async (ctx) => {
    try {
        if (!ctx.session?.taskData) {
            return await ctx.answerCbQuery('❌ Session expired.');
        }
        
        // Go back one step
        switch (ctx.session.taskData.step) {
            case 'repeat_type':
                ctx.session.taskData.step = 'end_time';
                await ctx.editMessageText('⏰ Enter end time in HH:MM format (must be after start time):\n\nExample: 15:30 for 3:30 PM');
                break;
            default:
                delete ctx.session.taskData;
                await ctx.editMessageText('❌ Task creation cancelled.');
                await bot.command('start')(ctx);
        }
        
        await ctx.answerCbQuery('↩️ Back');
    } catch (error) {
        console.error('Task back error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// Handle date input for task creation
bot.on('text', async (ctx) => {
    try {
        // Check for repeat end date input
        if (ctx.session?.taskData && ctx.session.taskData.step === 'repeat_end_date') {
            const messageText = ctx.message.text;
            
            if (messageText.toLowerCase() === 'cancel') {
                delete ctx.session.taskData;
                await safeSendMessage(ctx, '❌ Task creation cancelled.');
                await bot.command('start')(ctx);
                return;
            }
            
            if (messageText.toLowerCase() !== 'none') {
                const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
                const match = messageText.match(dateRegex);
                
                if (!match) {
                    await safeSendMessage(ctx, '❌ Invalid date format. Please use DD/MM/YYYY.\n\nExample: 12/03/2026');
                    return;
                }
                
                const [_, day, month, year] = match;
                const repeatEndDate = new Date(year, month - 1, day);
                
                if (isNaN(repeatEndDate.getTime())) {
                    await safeSendMessage(ctx, '❌ Invalid date. Please enter a valid date.');
                    return;
                }
                
                ctx.session.taskData.repeatEndDate = repeatEndDate;
            } else {
                ctx.session.taskData.repeatEndDate = null;
            }
            
            // Save the task
            await saveAndScheduleTask(ctx);
            return;
        }
        
    } catch (error) {
        console.error('Date input error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

async function saveAndScheduleTask(ctx) {
    try {
        const taskData = ctx.session.taskData;
        
        // Prepare task object
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
        
        // Save to database
        const saveResult = await saveTask(taskToSave);
        
        if (saveResult.success) {
            // Schedule notifications
            scheduleTaskNotifications(taskToSave);
            
            let message = `✅ Task saved successfully!\n\n` +
                         `📌 ID: ${taskData.taskId}\n` +
                         `📝 Title: ${taskData.title}\n` +
                         `⏰ Start: ${new Date(taskData.startDate).toLocaleTimeString()}\n` +
                         `⏰ End: ${new Date(taskData.endDate).toLocaleTimeString()}\n` +
                         `🔄 Repeat: ${taskData.repeatType === 'none' ? 'No repetition' : taskData.repeatType}\n\n`;
            
            if (taskData.repeatEndDate) {
                message += `📅 Repeat until: ${taskData.repeatEndDate.toLocaleDateString()}\n\n`;
            }
            
            message += `🔔 Notifications will start 10 minutes before task start time.`;
            
            await safeSendMessage(ctx, message);
            
            // Clear session
            delete ctx.session.taskData;
            
            // Return to main menu
            setTimeout(async () => {
                await bot.command('start')(ctx);
            }, 2000);
        } else {
            await safeSendMessage(ctx, '❌ Failed to save task. Please try again.');
        }
    } catch (error) {
        console.error('Save task error:', error);
        await safeSendMessage(ctx, '❌ Failed to save task.');
    }
}

// ==========================================
// ADD NOTES FLOW
// ==========================================

bot.action('add_notes', async (ctx) => {
    try {
        // Initialize note data in session
        ctx.session.noteData = {
            step: 'title',
            noteId: generateNoteId(),
            userId: ctx.from.id
        };
        
        await ctx.editMessageText('✏️ *Add New Note*\n\nEnter the title of your note:\n\nType "cancel" to cancel.', {
            parse_mode: 'Markdown'
        });
    } catch (error) {
        console.error('Add notes error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// ==========================================
// VIEW TASKS
// ==========================================

bot.action(/^view_tasks_(\d+)$/, async (ctx) => {
    try {
        const page = parseInt(ctx.match[1]);
        const userId = ctx.from.id;
        
        const tasksData = await getTasks(userId, page);
        
        if (tasksData.tasks.length === 0) {
            await ctx.editMessageText('📭 No tasks found.\n\nUse "Add Tasks" to create new tasks.', {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Add Tasks', 'add_tasks')],
                    [Markup.button.callback('↩️ Back to Menu', 'back_to_menu')]
                ])
            });
            return;
        }
        
        let message = `📋 *Your Tasks (Page ${page}/${tasksData.totalPages})*\n\n`;
        
        tasksData.tasks.forEach((task, index) => {
            const taskIndex = (page - 1) * 10 + index + 1;
            const startTime = new Date(task.startDate).toLocaleTimeString();
            message += `${taskIndex}. ${task.title}\n   ⏰ ${startTime} | 📌 ${task.taskId}\n\n`;
        });
        
        message += `Total: ${tasksData.totalTasks} tasks`;
        
        const keyboard = [];
        
        // Add task buttons (10 per page)
        tasksData.tasks.forEach((task) => {
            keyboard.push([Markup.button.callback(`📌 ${task.taskId} - ${task.title.substring(0, 20)}`, `task_detail_${task.taskId}`)]);
        });
        
        // Add navigation buttons
        const navButtons = [];
        if (tasksData.hasPrev) {
            navButtons.push(Markup.button.callback('◀️ Previous', `view_tasks_${page - 1}`));
        }
        navButtons.push(Markup.button.callback('🏠 Menu', 'back_to_menu'));
        if (tasksData.hasNext) {
            navButtons.push(Markup.button.callback('Next ▶️', `view_tasks_${page + 1}`));
        }
        keyboard.push(navButtons);
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
        
    } catch (error) {
        console.error('View tasks error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// Task detail view
bot.action(/^task_detail_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const task = await getTaskById(taskId);
        
        if (!task) {
            return await ctx.answerCbQuery('❌ Task not found.');
        }
        
        let message = `📋 *Task Details*\n\n` +
                     `📌 ID: ${task.taskId}\n` +
                     `📝 Title: ${task.title}\n` +
                     `📄 Description: ${task.description || 'No description'}\n` +
                     `⏰ Start Time: ${new Date(task.startDate).toLocaleTimeString()}\n` +
                     `⏰ End Time: ${new Date(task.endDate).toLocaleTimeString()}\n` +
                     `🔄 Repeat: ${task.repeatType === 'none' ? 'No repetition' : task.repeatType}\n` +
                     `📅 Created: ${new Date(task.createdAt).toLocaleString()}\n` +
                     `📊 Status: ${task.status === 'completed' ? '✅ Completed' : '⏳ Pending'}`;
        
        if (task.repeatEndDate) {
            message += `\n📅 Repeat until: ${new Date(task.repeatEndDate).toLocaleDateString()}`;
        }
        
        if (task.completedAt) {
            message += `\n✅ Completed at: ${new Date(task.completedAt).toLocaleString()}`;
        }
        
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ Mark Complete', `complete_task_${taskId}`),
                Markup.button.callback('✏️ Edit', `edit_task_${taskId}`)
            ],
            [
                Markup.button.callback('🗑️ Delete', `delete_task_${taskId}`),
                Markup.button.callback('↩️ Back', `view_tasks_1`)
            ]
        ]);
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
        
    } catch (error) {
        console.error('Task detail error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// Mark task as complete
bot.action(/^complete_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const task = await getTaskById(taskId);
        
        if (!task) {
            return await ctx.answerCbQuery('❌ Task not found.');
        }
        
        // Update task status
        const updateResult = await updateTask(taskId, {
            status: 'completed',
            completedAt: new Date()
        });
        
        if (updateResult.success) {
            // Cancel scheduled notifications
            if (scheduledJobs.has(`${ctx.from.id}_${taskId}`)) {
                const job = scheduledJobs.get(`${ctx.from.id}_${taskId}`);
                if (job) job.cancel();
                scheduledJobs.delete(`${ctx.from.id}_${taskId}`);
            }
            
            await ctx.answerCbQuery('✅ Task marked as complete!');
            
            // Refresh task detail view
            await bot.action(`task_detail_${taskId}`)(ctx);
        } else {
            await ctx.answerCbQuery('❌ Failed to update task.');
        }
    } catch (error) {
        console.error('Complete task error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// Delete task
bot.action(/^delete_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        
        const deleteResult = await deleteTask(taskId);
        
        if (deleteResult.success) {
            // Cancel scheduled notifications
            if (scheduledJobs.has(`${ctx.from.id}_${taskId}`)) {
                const job = scheduledJobs.get(`${ctx.from.id}_${taskId}`);
                if (job) job.cancel();
                scheduledJobs.delete(`${ctx.from.id}_${taskId}`);
            }
            
            await ctx.answerCbQuery('✅ Task deleted!');
            
            // Go back to tasks list
            await bot.action('view_tasks_1')(ctx);
        } else {
            await ctx.answerCbQuery('❌ Failed to delete task.');
        }
    } catch (error) {
        console.error('Delete task error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// Edit task
bot.action(/^edit_task_(.+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const task = await getTaskById(taskId);
        
        if (!task) {
            return await ctx.answerCbQuery('❌ Task not found.');
        }
        
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('📝 Title', `edit_task_title_${taskId}`),
                Markup.button.callback('📄 Description', `edit_task_desc_${taskId}`)
            ],
            [
                Markup.button.callback('⏰ Start Time', `edit_task_start_${taskId}`),
                Markup.button.callback('⏰ End Time', `edit_task_end_${taskId}`)
            ],
            [
                Markup.button.callback('🔄 Repeat', `edit_task_repeat_${taskId}`),
                Markup.button.callback('↩️ Back', `task_detail_${taskId}`)
            ]
        ]);
        
        await ctx.editMessageText('✏️ *Edit Task*\n\nSelect what you want to edit:', {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
        
    } catch (error) {
        console.error('Edit task error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// ==========================================
// VIEW HISTORY
// ==========================================

bot.action(/^view_history_(\d+)$/, async (ctx) => {
    try {
        const page = parseInt(ctx.match[1]);
        const userId = ctx.from.id;
        
        const historyData = await getHistoryDates(userId, page);
        
        if (historyData.dates.length === 0) {
            await ctx.editMessageText('📭 No history found.\n\nComplete some tasks to see history here.', {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('📋 View Tasks', 'view_tasks_1')],
                    [Markup.button.callback('↩️ Back to Menu', 'back_to_menu')]
                ])
            });
            return;
        }
        
        let message = `📜 *Task History (Page ${page}/${historyData.totalPages})*\n\n`;
        
        historyData.dates.forEach((date, index) => {
            const dateIndex = (page - 1) * 10 + index + 1;
            message += `${dateIndex}. ${date.displayDate}\n   ✅ ${date.count} tasks completed\n\n`;
        });
        
        message += `Total: ${historyData.totalDates} days with completed tasks`;
        
        const keyboard = [];
        
        // Add date buttons
        historyData.dates.forEach((date) => {
            const dateStr = date.date.toISOString().split('T')[0];
            keyboard.push([Markup.button.callback(`📅 ${date.displayDate} (${date.count} tasks)`, `history_date_${dateStr}_1`)]);
        });
        
        // Add navigation buttons
        const navButtons = [];
        if (historyData.hasPrev) {
            navButtons.push(Markup.button.callback('◀️ Previous', `view_history_${page - 1}`));
        }
        navButtons.push(Markup.button.callback('🏠 Menu', 'back_to_menu'));
        if (historyData.hasNext) {
            navButtons.push(Markup.button.callback('Next ▶️', `view_history_${page + 1}`));
        }
        keyboard.push(navButtons);
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
        
    } catch (error) {
        console.error('View history error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// View tasks for specific date
bot.action(/^history_date_(.+)_(\d+)$/, async (ctx) => {
    try {
        const [dateStr, pageStr] = [ctx.match[1], ctx.match[2]];
        const page = parseInt(pageStr);
        const userId = ctx.from.id;
        const date = new Date(dateStr);
        
        const tasksData = await getTasksByDate(userId, date, page);
        
        if (tasksData.tasks.length === 0) {
            await ctx.editMessageText(`📭 No tasks found for ${date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('↩️ Back to History', 'view_history_1')]
                ])
            });
            return;
        }
        
        const displayDate = date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        let message = `📅 *Tasks Completed on ${displayDate}*\nPage ${page}/${tasksData.totalPages}\n\n`;
        
        tasksData.tasks.forEach((task, index) => {
            const taskIndex = (page - 1) * 10 + index + 1;
            message += `${taskIndex}. ${task.title}\n   ✅ ${new Date(task.completedAt).toLocaleTimeString()} | 📌 ${task.taskId}\n\n`;
        });
        
        const keyboard = [];
        
        // Add task buttons
        tasksData.tasks.forEach((task) => {
            keyboard.push([Markup.button.callback(`📌 ${task.taskId} - ${task.title.substring(0, 20)}`, `task_detail_${task.taskId}`)]);
        });
        
        // Add navigation buttons
        const navButtons = [];
        if (tasksData.hasPrev) {
            navButtons.push(Markup.button.callback('◀️ Previous', `history_date_${dateStr}_${page - 1}`));
        }
        navButtons.push(Markup.button.callback('📜 Back to History', 'view_history_1'));
        if (tasksData.hasNext) {
            navButtons.push(Markup.button.callback('Next ▶️', `history_date_${dateStr}_${page + 1}`));
        }
        keyboard.push(navButtons);
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
        
    } catch (error) {
        console.error('History date error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// ==========================================
// VIEW NOTES
// ==========================================

bot.action(/^view_notes_(\d+)$/, async (ctx) => {
    try {
        const page = parseInt(ctx.match[1]);
        const userId = ctx.from.id;
        
        const notesData = await getNotes(userId, page);
        
        if (notesData.notes.length === 0) {
            await ctx.editMessageText('📭 No notes found.\n\nUse "Add Notes" to create new notes.', {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('📝 Add Notes', 'add_notes')],
                    [Markup.button.callback('↩️ Back to Menu', 'back_to_menu')]
                ])
            });
            return;
        }
        
        let message = `🗒️ *Your Notes (Page ${page}/${notesData.totalPages})*\n\n`;
        
        notesData.notes.forEach((note, index) => {
            const noteIndex = (page - 1) * 10 + index + 1;
            message += `${noteIndex}. ${note.title}\n   📌 ${note.noteId} | 📅 ${new Date(note.createdAt).toLocaleDateString()}\n\n`;
        });
        
        message += `Total: ${notesData.totalNotes} notes`;
        
        const keyboard = [];
        
        // Add note buttons
        notesData.notes.forEach((note) => {
            keyboard.push([Markup.button.callback(`📌 ${note.noteId} - ${note.title.substring(0, 20)}`, `note_detail_${note.noteId}`)]);
        });
        
        // Add navigation buttons
        const navButtons = [];
        if (notesData.hasPrev) {
            navButtons.push(Markup.button.callback('◀️ Previous', `view_notes_${page - 1}`));
        }
        navButtons.push(Markup.button.callback('🏠 Menu', 'back_to_menu'));
        if (notesData.hasNext) {
            navButtons.push(Markup.button.callback('Next ▶️', `view_notes_${page + 1}`));
        }
        keyboard.push(navButtons);
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
        
    } catch (error) {
        console.error('View notes error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

// Note detail view
bot.action(/^note_detail_(.+)$/, async (ctx) => {
    try {
        const noteId = ctx.match[1];
        const note = await getNoteById(noteId);
        
        if (!note) {
            return await ctx.answerCbQuery('❌ Note not found.');
        }
        
        let message = `🗒️ *Note Details*\n\n` +
                     `📌 ID: ${note.noteId}\n` +
                     `📝 Title: ${note.title}\n` +
                     `📄 Content:\n${note.content || 'No content'}\n\n` +
                     `📅 Created: ${new Date(note.createdAt).toLocaleString()}\n` +
                     `📅 Updated: ${new Date(note.updatedAt).toLocaleString()}`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Back to Notes', 'view_notes_1')]
        ]);
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
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
        const userId = ctx.from.id;
        
        // Get all data
        const tasks = await db.collection('tasks').find({ userId: userId }).toArray();
        const notes = await db.collection('notes').find({ userId: userId }).toArray();
        
        // Format data for display
        let message = `📥 *Your Data Summary*\n\n`;
        message += `📋 Tasks: ${tasks.length}\n`;
        message += `🗒️ Notes: ${notes.length}\n\n`;
        message += `Select what you want to download:`;
        
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('📋 Tasks JSON', 'download_tasks'),
                Markup.button.callback('🗒️ Notes JSON', 'download_notes')
            ],
            [
                Markup.button.callback('📦 All Data', 'download_all'),
                Markup.button.callback('↩️ Back', 'back_to_menu')
            ]
        ]);
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
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
        
        // Convert to JSON string
        const tasksJson = JSON.stringify(tasks, null, 2);
        
        // Send as file if too long, otherwise as message
        if (tasksJson.length > 4000) {
            await ctx.replyWithDocument({
                source: Buffer.from(tasksJson),
                filename: 'tasks.json'
            });
            await ctx.answerCbQuery('✅ Tasks data sent as file!');
        } else {
            await ctx.editMessageText(`📋 *Your Tasks Data*\n\n\`\`\`json\n${tasksJson}\n\`\`\``, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('↩️ Back to Downloads', 'download_data')]
                ])
            });
        }
        
    } catch (error) {
        console.error('Download tasks error:', error);
        await ctx.answerCbQuery('❌ Failed to download tasks.');
    }
});

bot.action('download_notes', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const notes = await db.collection('notes').find({ userId: userId }).toArray();
        
        // Convert to JSON string
        const notesJson = JSON.stringify(notes, null, 2);
        
        // Send as file if too long, otherwise as message
        if (notesJson.length > 4000) {
            await ctx.replyWithDocument({
                source: Buffer.from(notesJson),
                filename: 'notes.json'
            });
            await ctx.answerCbQuery('✅ Notes data sent as file!');
        } else {
            await ctx.editMessageText(`🗒️ *Your Notes Data*\n\n\`\`\`json\n${notesJson}\n\`\`\``, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('↩️ Back to Downloads', 'download_data')]
                ])
            });
        }
        
    } catch (error) {
        console.error('Download notes error:', error);
        await ctx.answerCbQuery('❌ Failed to download notes.');
    }
});

bot.action('download_all', async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        // Get all data
        const tasks = await db.collection('tasks').find({ userId: userId }).toArray();
        const notes = await db.collection('notes').find({ userId: userId }).toArray();
        
        // Create combined data object
        const allData = {
            tasks: tasks,
            notes: notes,
            exportDate: new Date().toISOString(),
            userId: userId
        };
        
        // Convert to JSON string
        const allDataJson = JSON.stringify(allData, null, 2);
        
        // Send as file
        await ctx.replyWithDocument({
            source: Buffer.from(allDataJson),
            filename: 'all_data.json'
        });
        
        await ctx.answerCbQuery('✅ All data sent as file!');
        
    } catch (error) {
        console.error('Download all error:', error);
        await ctx.answerCbQuery('❌ Failed to download all data.');
    }
});

// ==========================================
// DELETE DATA
// ==========================================

bot.action('delete_data', async (ctx) => {
    try {
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ YES, DELETE ALL', 'confirm_delete_all'),
                Markup.button.callback('❌ NO, CANCEL', 'back_to_menu')
            ]
        ]);
        
        await ctx.editMessageText('🚨 *DELETE ALL DATA*\n\n⚠️ **WARNING: This action cannot be undone!**\n\nThis will delete:\n• All your tasks\n• All your notes\n• All your history\n\nAre you absolutely sure?', {
            parse_mode: 'Markdown',
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
        
        // Cancel all scheduled jobs
        for (const [key, job] of scheduledJobs) {
            if (key.startsWith(`${userId}_`)) {
                if (job) job.cancel();
            }
        }
        
        // Delete all user data
        const tasksResult = await db.collection('tasks').deleteMany({ userId: userId });
        const notesResult = await db.collection('notes').deleteMany({ userId: userId });
        
        await ctx.editMessageText(`✅ *All data deleted successfully!*\n\n🗑️ Deleted:\n• ${tasksResult.deletedCount} tasks\n• ${notesResult.deletedCount} notes\n\nYour data has been permanently removed.`, {
            parse_mode: 'Markdown',
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
// HELPER ACTIONS
// ==========================================

bot.action('back_to_menu', async (ctx) => {
    try {
        await bot.command('start')(ctx);
    } catch (error) {
        console.error('Back to menu error:', error);
        await ctx.answerCbQuery('❌ An error occurred.');
    }
});

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
                          `• Tasks automatically adjust if time is in the past\n` +
                          `• Notifications start 10 minutes before task start\n` +
                          `• Repeating tasks auto-create for next day/week`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Back to Menu', 'back_to_menu')]
        ]);
        
        await ctx.editMessageText(helpMessage, {
            parse_mode: 'Markdown',
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
            ctx.reply('❌ An error occurred. Please try again.');
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
        // Create indexes
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
        // Connect to database
        const dbConnected = await connectDB();
        if (!dbConnected) {
            console.error('❌ Failed to connect to database');
            setTimeout(startBot, 5000);
            return;
        }
        
        // Initialize bot
        await initBot();
        
        console.log('🚀 Starting bot...');
        // Start bot
        await bot.launch({
            dropPendingUpdates: true,
            allowedUpdates: ['message', 'callback_query']
        });
        console.log('🤖 Bot is running...');
        
        // Graceful shutdown
        process.once('SIGINT', () => {
            console.log('🛑 SIGINT received, shutting down gracefully...');
            
            // Cancel all scheduled jobs
            for (const [key, job] of scheduledJobs) {
                if (job) job.cancel();
            }
            
            bot.stop('SIGINT');
            if (client) client.close();
            process.exit(0);
        });
        
        process.once('SIGTERM', () => {
            console.log('🛑 SIGTERM received, shutting down gracefully...');
            
            // Cancel all scheduled jobs
            for (const [key, job] of scheduledJobs) {
                if (job) job.cancel();
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
