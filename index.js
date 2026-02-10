const { Telegraf, session } = require('telegraf');
const { MongoClient } = require('mongodb');
const schedule = require('node-schedule');
require('dotenv').config();

// Initialize bot
const BOT_TOKEN = process.env.BOT_TOKEN || '8365287371:AAHBks0ToDhlNOU1LPvWlY7PW59qAtKcwG8';
const bot = new Telegraf(BOT_TOKEN);

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://sandip:9E9AISFqTfU3VI5i@cluster0.p8irtov.mongodb.net/two_telegram_bot';
let db, client;

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
        console.log('✅ Connected to MongoDB');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
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
            ...options 
        });
    } catch (error) {
        console.error('Error sending message:', error.message);
        // Try without options
        return await ctx.reply(text);
    }
}

// Store scheduled jobs
const scheduledJobs = new Map();

// Convert IST to UTC (IST is UTC+5:30)
function istToUTC(hours, minutes) {
    let utcHours = hours - 5;
    let utcMinutes = minutes - 30;
    
    // Handle minute overflow
    if (utcMinutes < 0) {
        utcMinutes += 60;
        utcHours -= 1;
    }
    
    // Handle hour overflow
    if (utcHours < 0) {
        utcHours += 24;
    }
    
    return { utcHours, utcMinutes };
}

// ==========================================
// COMMAND HANDLERS
// ==========================================

// /start command
bot.command('start', async (ctx) => {
    try {
        const welcomeMessage = `👋 Welcome to the Notification Bot!

Available commands:
• /time - Schedule notifications before a specific time
• /settime - Schedule interval notifications
• /note - Save a note
• /notes - View your notes
• /clearnotes - Delete all notes
• /stop - Stop all notifications
• /status - Check active notifications
• /help - Show help guide

Note: Only admin can use these commands.`;

        await safeSendMessage(ctx, welcomeMessage);
    } catch (error) {
        console.error('Start command error:', error);
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.');
    }
});

// /help command
bot.command('help', async (ctx) => {
    try {
        const helpMessage = `📋 Help Guide:

1. /time
   - Enter target time in HH:MM (24-hour, IST)
   - Bot will send 10 notifications per minute starting 10 minutes before target time
   - Example: Enter "14:30" → notifications at 14:20, 14:21, ..., 14:29

2. /settime
   - Enter interval in format: minutes/times
   - Example: "5/10" = every 5 minutes, 10 times
   - First notification starts immediately

3. /note
   - Save a text note (max 1000 characters)
   - Notes are stored in database

4. /notes
   - View your last 10 notes

5. /clearnotes
   - Delete all your notes

6. /stop
   - Stop all active notifications

7. /status
   - Check status of active notifications

All times are in IST (Indian Standard Time).`;

        await safeSendMessage(ctx, helpMessage);
    } catch (error) {
        console.error('Help command error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// /time command - Schedule notifications before a specific time
bot.command('time', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return await safeSendMessage(ctx, '❌ You are not authorized to use this command.');
        }
        
        await safeSendMessage(ctx, 'Enter the target time in HH:MM format (24-hour, IST):\n\nExample: 14:30 for 2:30 PM\n\nType "cancel" to cancel.');
        
        ctx.session.waitingForTime = true;
    } catch (error) {
        console.error('Time command error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// /settime command - Schedule interval notifications
bot.command('settime', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return await safeSendMessage(ctx, '❌ You are not authorized to use this command.');
        }
        
        await safeSendMessage(ctx, 'Enter interval and number of times in format: minutes/times\n\nExample: 5/10 (every 5 minutes, 10 times)\n\nType "cancel" to cancel.');
        
        ctx.session.waitingForSetTime = true;
    } catch (error) {
        console.error('Settime command error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// /note command - Save a note
bot.command('note', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return await safeSendMessage(ctx, '❌ You are not authorized to use this command.');
        }
        
        await safeSendMessage(ctx, 'Enter your note (max 1000 characters):\n\nType "cancel" to cancel.');
        
        ctx.session.waitingForNote = true;
    } catch (error) {
        console.error('Note command error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// /notes command - List all notes
bot.command('notes', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return await safeSendMessage(ctx, '❌ You are not authorized to use this command.');
        }
        
        const notes = await db.collection('notes')
            .find({ userId: ctx.from.id })
            .sort({ createdAt: -1 })
            .limit(10)
            .toArray();
        
        if (notes.length === 0) {
            await safeSendMessage(ctx, '📝 No notes found.');
            return;
        }
        
        let notesText = '📝 Your Notes:\n\n';
        notes.forEach((note, index) => {
            const date = new Date(note.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
            const contentPreview = note.content.length > 50 ? note.content.substring(0, 50) + '...' : note.content;
            notesText += `${index + 1}. ${contentPreview}\n   📅 ${date} IST\n\n`;
        });
        
        await safeSendMessage(ctx, notesText);
    } catch (error) {
        console.error('Error fetching notes:', error);
        await safeSendMessage(ctx, '❌ Failed to fetch notes.');
    }
});

// /clearnotes command - Delete all notes
bot.command('clearnotes', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return await safeSendMessage(ctx, '❌ You are not authorized to use this command.');
        }
        
        const result = await db.collection('notes').deleteMany({ userId: ctx.from.id });
        await safeSendMessage(ctx, `✅ Deleted ${result.deletedCount} notes.`);
    } catch (error) {
        console.error('Error clearing notes:', error);
        await safeSendMessage(ctx, '❌ Failed to clear notes.');
    }
});

// /stop command - Stop all notifications
bot.command('stop', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return await safeSendMessage(ctx, '❌ You are not authorized to use this command.');
        }
        
        const userId = ctx.from.id;
        
        if (scheduledJobs.has(userId)) {
            const job = scheduledJobs.get(userId);
            
            // Cancel scheduled job
            if (job.job) {
                job.job.cancel();
            }
            
            // Clear interval if exists
            if (job.intervalId) {
                clearInterval(job.intervalId);
            }
            
            scheduledJobs.delete(userId);
            
            await safeSendMessage(ctx, '✅ All scheduled notifications stopped.');
        } else {
            await safeSendMessage(ctx, '❌ No active notifications found.');
        }
    } catch (error) {
        console.error('Stop command error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// /status command - Check active notifications
bot.command('status', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return await safeSendMessage(ctx, '❌ You are not authorized to use this command.');
        }
        
        const userId = ctx.from.id;
        
        if (scheduledJobs.has(userId)) {
            const job = scheduledJobs.get(userId);
            const now = new Date();
            
            let statusMessage = '📊 Active Notifications:\n\n';
            
            if (job.type === 'time') {
                const timeLeft = Math.max(0, Math.floor((job.startTime - now) / 1000));
                const minutesLeft = Math.floor(timeLeft / 60);
                const secondsLeft = timeLeft % 60;
                
                // Convert UTC target time back to IST for display
                const targetTimeIST = new Date(job.targetTime);
                targetTimeIST.setUTCHours(targetTimeIST.getUTCHours() + 5);
                targetTimeIST.setUTCMinutes(targetTimeIST.getUTCMinutes() + 30);
                
                statusMessage += `Type: Time-based notifications\n`;
                statusMessage += `Target time: ${targetTimeIST.getHours()}:${targetTimeIST.getMinutes().toString().padStart(2, '0')} IST\n`;
                
                if (timeLeft > 0) {
                    statusMessage += `Starts in: ${minutesLeft}m ${secondsLeft}s\n`;
                } else {
                    statusMessage += `Status: Running (${job.count || 0}/${job.totalMessages} sent)\n`;
                }
                
            } else if (job.type === 'interval') {
                statusMessage += `Type: Interval notifications\n`;
                statusMessage += `Interval: ${job.intervalMinutes} minutes\n`;
                statusMessage += `Progress: ${job.count || 0}/${job.totalTimes}\n`;
                statusMessage += `Status: Active\n`;
            }
            
            await safeSendMessage(ctx, statusMessage);
        } else {
            await safeSendMessage(ctx, '❌ No active notifications.');
        }
    } catch (error) {
        console.error('Status command error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// ==========================================
// TEXT MESSAGE HANDLER
// ==========================================

bot.on('text', async (ctx) => {
    try {
        // Handle time command input
        if (ctx.session?.waitingForTime) {
            if (ctx.message.text.toLowerCase() === 'cancel') {
                delete ctx.session.waitingForTime;
                await safeSendMessage(ctx, '❌ Time scheduling cancelled.');
                return;
            }
            
            const timeInput = ctx.message.text.trim();
            
            // Validate time format
            const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
            if (!timeRegex.test(timeInput)) {
                await safeSendMessage(ctx, '❌ Invalid time format. Please use HH:MM (24-hour format).\n\nExample: 14:30 for 2:30 PM');
                return;
            }
            
            const [hours, minutes] = timeInput.split(':').map(Number);
            
            // Schedule notifications starting 10 minutes before target time
            await scheduleTimeNotifications(ctx, hours, minutes);
            
            delete ctx.session.waitingForTime;
            return;
        }
        
        // Handle settime command input
        if (ctx.session?.waitingForSetTime) {
            if (ctx.message.text.toLowerCase() === 'cancel') {
                delete ctx.session.waitingForSetTime;
                await safeSendMessage(ctx, '❌ Interval scheduling cancelled.');
                return;
            }
            
            const input = ctx.message.text.trim();
            
            // Validate format: minutes/times
            const match = input.match(/^(\d+)\/(\d+)$/);
            if (!match) {
                await safeSendMessage(ctx, '❌ Invalid format. Please use: minutes/times\n\nExample: 5/10 (every 5 minutes, 10 times)');
                return;
            }
            
            const intervalMinutes = parseInt(match[1]);
            const totalTimes = parseInt(match[2]);
            
            if (intervalMinutes < 1 || intervalMinutes > 1440) {
                await safeSendMessage(ctx, '❌ Interval must be between 1 and 1440 minutes.');
                return;
            }
            
            if (totalTimes < 1 || totalTimes > 100) {
                await safeSendMessage(ctx, '❌ Number of times must be between 1 and 100.');
                return;
            }
            
            // Schedule interval notifications
            await scheduleIntervalNotifications(ctx, intervalMinutes, totalTimes);
            
            delete ctx.session.waitingForSetTime;
            return;
        }
        
        // Handle note command input
        if (ctx.session?.waitingForNote) {
            if (ctx.message.text.toLowerCase() === 'cancel') {
                delete ctx.session.waitingForNote;
                await safeSendMessage(ctx, '❌ Note creation cancelled.');
                return;
            }
            
            const noteContent = ctx.message.text.trim();
            
            if (noteContent.length > 1000) {
                await safeSendMessage(ctx, '❌ Note is too long. Maximum 1000 characters.');
                return;
            }
            
            // Save note to database
            try {
                await db.collection('notes').insertOne({
                    userId: ctx.from.id,
                    content: noteContent,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                
                await safeSendMessage(ctx, `✅ Note saved successfully!\n\nContent: ${noteContent}`);
            } catch (error) {
                console.error('Error saving note:', error);
                await safeSendMessage(ctx, '❌ Failed to save note.');
            }
            
            delete ctx.session.waitingForNote;
            return;
        }
        
    } catch (error) {
        console.error('Error handling text input:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// ==========================================
// SCHEDULING FUNCTIONS
// ==========================================

// Schedule time-based notifications
async function scheduleTimeNotifications(ctx, targetHours, targetMinutes) {
    try {
        const userId = ctx.from.id;
        
        // Clear any existing job for this user
        if (scheduledJobs.has(userId)) {
            const job = scheduledJobs.get(userId);
            if (job.job) job.job.cancel();
            if (job.intervalId) clearInterval(job.intervalId);
            scheduledJobs.delete(userId);
        }
        
        // Convert IST to UTC
        const { utcHours: targetUtcHours, utcMinutes: targetUtcMinutes } = istToUTC(targetHours, targetMinutes);
        
        // Create target time for today
        const now = new Date();
        const targetTime = new Date(now);
        targetTime.setUTCHours(targetUtcHours, targetUtcMinutes, 0, 0);
        
        // If target time is in the past, schedule for tomorrow
        if (targetTime <= now) {
            targetTime.setUTCDate(targetTime.getUTCDate() + 1);
        }
        
        // Calculate start time (10 minutes before target)
        const startTime = new Date(targetTime);
        startTime.setUTCMinutes(startTime.getUTCMinutes() - 10);
        
        // Create job data
        const jobData = {
            type: 'time',
            targetTime: targetTime,
            startTime: startTime,
            count: 0,
            totalMessages: 10,
            userId: userId
        };
        
        // Schedule the job using node-schedule
        const job = schedule.scheduleJob(startTime, async function() {
            await executeTimeNotifications(jobData);
        });
        
        jobData.job = job;
        scheduledJobs.set(userId, jobData);
        
        // Calculate time until start
        const timeUntilStart = Math.max(0, startTime - now);
        const minutesUntilStart = Math.floor(timeUntilStart / (1000 * 60));
        const secondsUntilStart = Math.floor((timeUntilStart % (1000 * 60)) / 1000);
        
        // Convert start time back to IST for display
        const startTimeIST = new Date(startTime);
        startTimeIST.setUTCHours(startTimeIST.getUTCHours() + 5);
        startTimeIST.setUTCMinutes(startTimeIST.getUTCMinutes() + 30);
        
        await safeSendMessage(ctx, 
            `✅ Scheduled time notifications!\n\n` +
            `Target time: ${targetHours}:${targetMinutes.toString().padStart(2, '0')} IST\n` +
            `Start time: ${startTimeIST.getHours()}:${startTimeIST.getMinutes().toString().padStart(2, '0')} IST\n` +
            `Notifications will start in: ${minutesUntilStart}m ${secondsUntilStart}s\n` +
            `Total notifications: 10 (one per minute)`
        );
    } catch (error) {
        console.error('Schedule time notifications error:', error);
        await safeSendMessage(ctx, '❌ Failed to schedule notifications.');
    }
}

// Execute time notifications
async function executeTimeNotifications(jobData) {
    try {
        const { userId, targetTime, totalMessages } = jobData;
        
        // Create interval for notifications
        const intervalId = setInterval(async () => {
            try {
                jobData.count++;
                
                const now = new Date();
                const timeLeft = Math.max(0, Math.floor((targetTime - now) / 1000));
                const minutesLeft = Math.floor(timeLeft / 60);
                const secondsLeft = timeLeft % 60;
                
                // Convert current time to IST
                const istTime = now.toLocaleTimeString('en-IN', { 
                    timeZone: 'Asia/Kolkata',
                    hour12: false 
                });
                
                const message = `⏰ Notification ${jobData.count}/${totalMessages}\n` +
                               `Current time: ${istTime} IST\n` +
                               `Time until target: ${minutesLeft}m ${secondsLeft}s`;
                
                await bot.telegram.sendMessage(userId, message);
                
                // Stop after 10 messages or when target time is reached
                if (jobData.count >= totalMessages || now >= targetTime) {
                    clearInterval(intervalId);
                    
                    // Update job data
                    jobData.intervalId = null;
                    scheduledJobs.set(userId, jobData);
                    
                    if (now >= targetTime) {
                        await bot.telegram.sendMessage(userId, '🎯 Target time reached! Notifications stopped.');
                    } else {
                        await bot.telegram.sendMessage(userId, `✅ Completed ${totalMessages} notifications!`);
                    }
                }
            } catch (error) {
                console.error('Error in notification interval:', error);
            }
        }, 60 * 1000); // Every minute
        
        jobData.intervalId = intervalId;
        scheduledJobs.set(userId, jobData);
        
        // Send first notification immediately
        jobData.count++;
        const now = new Date();
        const timeLeft = Math.max(0, Math.floor((targetTime - now) / 1000));
        const minutesLeft = Math.floor(timeLeft / 60);
        const secondsLeft = timeLeft % 60;
        
        // Convert current time to IST
        const istTime = now.toLocaleTimeString('en-IN', { 
            timeZone: 'Asia/Kolkata',
            hour12: false 
        });
        
        const firstMessage = `⏰ Notification 1/${totalMessages}\n` +
                            `Current time: ${istTime} IST\n` +
                            `Time until target: ${minutesLeft}m ${secondsLeft}s\n` +
                            `Notifications will continue every minute.`;
        
        await bot.telegram.sendMessage(userId, firstMessage);
        
    } catch (error) {
        console.error('Execute time notifications error:', error);
    }
}

// Schedule interval notifications
async function scheduleIntervalNotifications(ctx, intervalMinutes, totalTimes) {
    try {
        const userId = ctx.from.id;
        
        // Clear any existing job for this user
        if (scheduledJobs.has(userId)) {
            const job = scheduledJobs.get(userId);
            if (job.job) job.job.cancel();
            if (job.intervalId) clearInterval(job.intervalId);
            scheduledJobs.delete(userId);
        }
        
        // Create job data
        const jobData = {
            type: 'interval',
            intervalMinutes: intervalMinutes,
            count: 0,
            totalTimes: totalTimes,
            userId: userId
        };
        
        // Schedule immediate start
        const job = schedule.scheduleJob(new Date(Date.now() + 1000), async function() {
            await executeIntervalNotifications(jobData);
        });
        
        jobData.job = job;
        scheduledJobs.set(userId, jobData);
        
        await safeSendMessage(ctx,
            `✅ Scheduled interval notifications!\n\n` +
            `Interval: ${intervalMinutes} minutes\n` +
            `Total messages: ${totalTimes}\n` +
            `First message will arrive in 1 second.`
        );
    } catch (error) {
        console.error('Schedule interval notifications error:', error);
        await safeSendMessage(ctx, '❌ Failed to schedule interval notifications.');
    }
}

// Execute interval notifications
async function executeIntervalNotifications(jobData) {
    try {
        const { userId, intervalMinutes, totalTimes } = jobData;
        
        // Create interval
        const intervalId = setInterval(async () => {
            try {
                jobData.count++;
                
                const now = new Date();
                const istTime = now.toLocaleTimeString('en-IN', { 
                    timeZone: 'Asia/Kolkata',
                    hour12: false 
                });
                
                const message = `🔄 Interval Notification ${jobData.count}/${totalTimes}\n` +
                               `Interval: ${intervalMinutes} minutes\n` +
                               `Sent at: ${istTime} IST`;
                
                await bot.telegram.sendMessage(userId, message);
                
                // Stop after reaching total times
                if (jobData.count >= totalTimes) {
                    clearInterval(intervalId);
                    jobData.intervalId = null;
                    scheduledJobs.set(userId, jobData);
                    
                    await bot.telegram.sendMessage(userId, `✅ Completed ${totalTimes} interval notifications!`);
                }
            } catch (error) {
                console.error('Error in interval notification:', error);
            }
        }, intervalMinutes * 60 * 1000);
        
        jobData.intervalId = intervalId;
        scheduledJobs.set(userId, jobData);
        
        // Send first notification immediately
        jobData.count++;
        const now = new Date();
        const istTime = now.toLocaleTimeString('en-IN', { 
            timeZone: 'Asia/Kolkata',
            hour12: false 
        });
        
        const firstMessage = `🔄 Interval Notification 1/${totalTimes}\n` +
                            `Interval: ${intervalMinutes} minutes\n` +
                            `Sent at: ${istTime} IST\n` +
                            `Next notification in ${intervalMinutes} minutes.`;
        
        await bot.telegram.sendMessage(userId, firstMessage);
        
    } catch (error) {
        console.error('Execute interval notifications error:', error);
    }
}

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
        await db.collection('notes').createIndex({ userId: 1 });
        await db.collection('notes').createIndex({ createdAt: -1 });
        
        console.log('✅ Bot initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Error initializing bot:', error);
        return false;
    }
}

async function startBot() {
    try {
        // Connect to database
        const dbConnected = await connectDB();
        if (!dbConnected) {
            console.error('❌ Failed to connect to database');
            setTimeout(startBot, 5000);
            return;
        }
        
        // Initialize bot
        await initBot();
        
        // Start bot
        await bot.launch({
            dropPendingUpdates: true,
            allowedUpdates: ['message']
        });
        console.log('🤖 Bot is running...');
        
        // Send startup message to admin
        try {
            const now = new Date();
            const istTime = now.toLocaleTimeString('en-IN', { 
                timeZone: 'Asia/Kolkata',
                hour12: false 
            });
            
            await bot.telegram.sendMessage(ADMIN_IDS[0], 
                `🤖 Notification Bot started successfully!\n` +
                `Time: ${istTime} IST\n` +
                `Scheduler is ready.`
            );
            console.log('✅ Startup message sent to admin');
        } catch (error) {
            console.log('⚠️ Could not send startup message:', error.message);
        }
        
        // Graceful shutdown
        process.once('SIGINT', () => {
            console.log('🛑 SIGINT received, shutting down gracefully...');
            
            // Cancel all scheduled jobs
            for (const [userId, job] of scheduledJobs) {
                if (job.job) job.job.cancel();
                if (job.intervalId) clearInterval(job.intervalId);
            }
            
            bot.stop('SIGINT');
            if (client) client.close();
            process.exit(0);
        });
        
        process.once('SIGTERM', () => {
            console.log('🛑 SIGTERM received, shutting down gracefully...');
            
            // Cancel all scheduled jobs
            for (const [userId, job] of scheduledJobs) {
                if (job.job) job.job.cancel();
                if (job.intervalId) clearInterval(job.intervalId);
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
console.log('🚀 Bot Starting...');

// Railway deployment support
const PORT = process.env.PORT || 3000;
if (process.env.RAILWAY_ENVIRONMENT || process.env.PORT) {
    const http = require('http');
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Notification Bot is running with AP Scheduler...');
    });
    
    server.listen(PORT, () => {
        console.log(`🚂 Server listening on port ${PORT}`);
    });
}
