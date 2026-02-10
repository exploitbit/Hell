const { Telegraf, session } = require('telegraf');
const { MongoClient } = require('mongodb');
require('dotenv').config();

// Initialize bot
const BOT_TOKEN = process.env.BOT_TOKEN || '8365287371:AAHBks0ToDhlNOU1LPvWlY7PW59qAtKcwG8';
const bot = new Telegraf(BOT_TOKEN);

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://sandip:9E9AISFqTfU3VI5i@cluster0.p8irtov.mongodb.net/two_telegram_bot';
let db, client;

async function connectDB() {
    try {
        client = new MongoClient(mongoUri);
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
        return await ctx.reply(text, options);
    } catch (error) {
        console.error('Error sending message:', error.message);
        return await ctx.reply(text);
    }
}

// ==========================================
// TIME NOTIFICATION FEATURE
// ==========================================

// Store scheduled jobs
const scheduledJobs = new Map();

// /time command - Schedule notifications before a specific time
bot.command('time', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return safeSendMessage(ctx, '❌ You are not authorized to use this command.');
    }
    
    await safeSendMessage(ctx, 'Enter the target time in HH:MM format (24-hour, IST):\n\nExample: 14:30 for 2:30 PM\n\nType "cancel" to cancel.');
    
    ctx.session.waitingForTime = true;
});

// Handle time input
bot.on('text', async (ctx) => {
    try {
        // Handle time command input
        if (ctx.session.waitingForTime) {
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
            
            // Calculate time in IST (assuming server is in UTC)
            const now = new Date();
            const nowUTC = new Date(now.toISOString());
            
            // Create target time for today in IST (UTC+5:30)
            const targetTime = new Date(nowUTC);
            targetTime.setUTCHours(hours - 5); // Adjust for IST (UTC+5:30)
            targetTime.setUTCMinutes(minutes - 30);
            targetTime.setUTCSeconds(0);
            targetTime.setUTCMilliseconds(0);
            
            // If target time is in the past, set it for tomorrow
            if (targetTime <= nowUTC) {
                targetTime.setUTCDate(targetTime.getUTCDate() + 1);
            }
            
            // Calculate when to start notifications (10 minutes before target)
            const startTime = new Date(targetTime);
            startTime.setUTCMinutes(startTime.getUTCMinutes() - 10);
            
            // Clear any existing job for this user
            if (scheduledJobs.has(ctx.from.id)) {
                clearInterval(scheduledJobs.get(ctx.from.id).interval);
                scheduledJobs.delete(ctx.from.id);
            }
            
            // Calculate time difference
            const timeDiff = startTime - nowUTC;
            
            if (timeDiff <= 0) {
                // Start immediately if we're already within 10 minutes of target
                await startNotifications(ctx, targetTime);
            } else {
                // Schedule the start
                await safeSendMessage(ctx, `✅ Scheduled!\n\nWill start notifications at ${hours}:${minutes.toString().padStart(2, '0')} IST (10 minutes before target time).`);
                
                const timeoutId = setTimeout(() => {
                    startNotifications(ctx, targetTime);
                }, timeDiff);
                
                // Store the job
                scheduledJobs.set(ctx.from.id, {
                    timeout: timeoutId,
                    targetTime: targetTime
                });
            }
            
            delete ctx.session.waitingForTime;
            return;
        }
        
        // Handle settime command input
        if (ctx.session.waitingForSetTime) {
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
            
            // Clear any existing job for this user
            if (scheduledJobs.has(ctx.from.id)) {
                const job = scheduledJobs.get(ctx.from.id);
                if (job.interval) clearInterval(job.interval);
                if (job.timeout) clearTimeout(job.timeout);
                scheduledJobs.delete(ctx.from.id);
            }
            
            // Start the interval notifications
            await startIntervalNotifications(ctx, intervalMinutes, totalTimes);
            
            delete ctx.session.waitingForSetTime;
            return;
        }
        
        // Handle note command input
        if (ctx.session.waitingForNote) {
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

// Start notifications 10 minutes before target time
async function startNotifications(ctx, targetTime) {
    try {
        const userId = ctx.from.id;
        let count = 0;
        const totalMessages = 10;
        
        await safeSendMessage(ctx, `🔔 Starting notifications! You'll receive ${totalMessages} messages until the target time.`);
        
        // Function to send notification
        const sendNotification = async () => {
            count++;
            const nowUTC = new Date();
            const timeLeft = Math.max(0, Math.floor((targetTime - nowUTC) / 1000));
            const minutesLeft = Math.floor(timeLeft / 60);
            const secondsLeft = timeLeft % 60;
            
            const message = `Notification ${count}/${totalMessages}\nTime until target: ${minutesLeft}m ${secondsLeft}s`;
            
            try {
                await bot.telegram.sendMessage(userId, message);
            } catch (error) {
                console.error('Error sending notification:', error);
            }
            
            // Stop after 10 messages or when target time is reached
            if (count >= totalMessages || nowUTC >= targetTime) {
                clearInterval(intervalId);
                scheduledJobs.delete(userId);
                
                if (nowUTC >= targetTime) {
                    await bot.telegram.sendMessage(userId, '🎯 Target time reached! Notifications stopped.');
                } else {
                    await bot.telegram.sendMessage(userId, `✅ Completed ${totalMessages} notifications!`);
                }
            }
        };
        
        // Send first notification immediately
        await sendNotification();
        
        // Calculate interval (every minute for 10 minutes)
        const intervalMs = 60 * 1000; // 1 minute
        
        // Schedule subsequent notifications
        const intervalId = setInterval(sendNotification, intervalMs);
        
        // Store the job
        scheduledJobs.set(userId, {
            interval: intervalId,
            targetTime: targetTime
        });
        
    } catch (error) {
        console.error('Error starting notifications:', error);
        await safeSendMessage(ctx, '❌ Failed to start notifications.');
    }
}

// Start interval notifications
async function startIntervalNotifications(ctx, intervalMinutes, totalTimes) {
    try {
        const userId = ctx.from.id;
        let count = 0;
        
        await safeSendMessage(ctx, `✅ Scheduled interval notifications!\n\nInterval: ${intervalMinutes} minutes\nTotal messages: ${totalTimes}\n\nNotifications will start now.`);
        
        // Function to send interval notification
        const sendIntervalNotification = async () => {
            count++;
            const message = `Interval Notification ${count}/${totalTimes}\nInterval: ${intervalMinutes} minutes\nSent at: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;
            
            try {
                await bot.telegram.sendMessage(userId, message);
            } catch (error) {
                console.error('Error sending interval notification:', error);
            }
            
            // Stop after reaching total times
            if (count >= totalTimes) {
                clearInterval(intervalId);
                scheduledJobs.delete(userId);
                await bot.telegram.sendMessage(userId, `✅ Completed ${totalTimes} interval notifications!`);
            }
        };
        
        // Send first notification immediately
        await sendIntervalNotification();
        
        // Calculate interval in milliseconds
        const intervalMs = intervalMinutes * 60 * 1000;
        
        // Schedule subsequent notifications
        const intervalId = setInterval(sendIntervalNotification, intervalMs);
        
        // Store the job
        scheduledJobs.set(userId, {
            interval: intervalId,
            count: count,
            totalTimes: totalTimes,
            intervalMinutes: intervalMinutes
        });
        
    } catch (error) {
        console.error('Error starting interval notifications:', error);
        await safeSendMessage(ctx, '❌ Failed to start interval notifications.');
    }
}

// /settime command - Schedule interval notifications
bot.command('settime', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return safeSendMessage(ctx, '❌ You are not authorized to use this command.');
    }
    
    await safeSendMessage(ctx, 'Enter interval and number of times in format: minutes/times\n\nExample: 5/10 (every 5 minutes, 10 times)\n\nType "cancel" to cancel.');
    
    ctx.session.waitingForSetTime = true;
});

// /note command - Save a note
bot.command('note', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return safeSendMessage(ctx, '❌ You are not authorized to use this command.');
    }
    
    await safeSendMessage(ctx, 'Enter your note (max 1000 characters):\n\nType "cancel" to cancel.');
    
    ctx.session.waitingForNote = true;
});

// /stop command - Stop all notifications
bot.command('stop', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return safeSendMessage(ctx, '❌ You are not authorized to use this command.');
    }
    
    const userId = ctx.from.id;
    
    if (scheduledJobs.has(userId)) {
        const job = scheduledJobs.get(userId);
        if (job.interval) clearInterval(job.interval);
        if (job.timeout) clearTimeout(job.timeout);
        scheduledJobs.delete(userId);
        
        await safeSendMessage(ctx, '✅ All scheduled notifications stopped.');
    } else {
        await safeSendMessage(ctx, '❌ No active notifications found.');
    }
});

// /status command - Check active notifications
bot.command('status', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return safeSendMessage(ctx, '❌ You are not authorized to use this command.');
    }
    
    const userId = ctx.from.id;
    
    if (scheduledJobs.has(userId)) {
        const job = scheduledJobs.get(userId);
        let statusMessage = '📊 Active Notifications:\n\n';
        
        if (job.targetTime) {
            // For /time command jobs
            const now = new Date();
            const timeLeft = Math.max(0, Math.floor((job.targetTime - now) / 1000));
            const minutesLeft = Math.floor(timeLeft / 60);
            const secondsLeft = timeLeft % 60;
            
            statusMessage += `Type: Time-based notifications\n`;
            statusMessage += `Target time: ${job.targetTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST\n`;
            statusMessage += `Time left: ${minutesLeft}m ${secondsLeft}s\n`;
        } else if (job.intervalMinutes) {
            // For /settime command jobs
            statusMessage += `Type: Interval notifications\n`;
            statusMessage += `Interval: ${job.intervalMinutes} minutes\n`;
            statusMessage += `Progress: ${job.count || 0}/${job.totalTimes}\n`;
        }
        
        await safeSendMessage(ctx, statusMessage);
    } else {
        await safeSendMessage(ctx, '❌ No active notifications.');
    }
});

// /notes command - List all notes
bot.command('notes', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return safeSendMessage(ctx, '❌ You are not authorized to use this command.');
    }
    
    try {
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
    if (!isAdmin(ctx.from.id)) {
        return safeSendMessage(ctx, '❌ You are not authorized to use this command.');
    }
    
    try {
        const result = await db.collection('notes').deleteMany({ userId: ctx.from.id });
        await safeSendMessage(ctx, `✅ Deleted ${result.deletedCount} notes.`);
    } catch (error) {
        console.error('Error clearing notes:', error);
        await safeSendMessage(ctx, '❌ Failed to clear notes.');
    }
});

// /start command
bot.start(async (ctx) => {
    const welcomeMessage = `👋 Welcome to the Notification Bot!

Available commands:
• /time - Schedule notifications before a specific time
• /settime - Schedule interval notifications
• /note - Save a note
• /notes - View your notes
• /clearnotes - Delete all notes
• /stop - Stop all notifications
• /status - Check active notifications

Note: Only admin can use these commands.`;

    await safeSendMessage(ctx, welcomeMessage);
});

// /help command
bot.command('help', async (ctx) => {
    const helpMessage = `📋 Help Guide:

1. /time
   - Enter target time in HH:MM (24-hour, IST)
   - Bot will send 10 notifications per minute starting 10 minutes before target time

2. /settime
   - Enter interval in format: minutes/times
   - Example: 5/10 = every 5 minutes, 10 times

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
});

// Error handling
bot.catch((error, ctx) => {
    console.error('Bot error:', error);
    
    try {
        if (ctx.message) {
            safeSendMessage(ctx, '❌ An error occurred. Please try again.');
        }
    } catch (e) {
        console.error('Error in error handler:', e);
    }
});

// Initialize database and start bot
async function startBot() {
    try {
        // Connect to database
        const dbConnected = await connectDB();
        if (!dbConnected) {
            console.error('❌ Failed to connect to database');
            setTimeout(startBot, 5000);
            return;
        }
        
        // Create collections if they don't exist
        await db.collection('notes').createIndex({ userId: 1 });
        await db.collection('notes').createIndex({ createdAt: -1 });
        
        // Start bot
        await bot.launch({
            dropPendingUpdates: true,
            allowedUpdates: ['message', 'callback_query']
        });
        console.log('🤖 Bot is running...');
        
        // Send startup message to admin
        try {
            await bot.telegram.sendMessage(ADMIN_IDS[0], '🤖 Notification Bot started successfully!\n\nBot is ready to schedule notifications.');
            console.log('✅ Startup message sent to admin');
        } catch (error) {
            console.log('⚠️ Could not send startup message');
        }
        
        // Graceful shutdown
        process.once('SIGINT', () => {
            console.log('🛑 SIGINT received, shutting down gracefully...');
            bot.stop('SIGINT');
            if (client) client.close();
            process.exit(0);
        });
        
        process.once('SIGTERM', () => {
            console.log('🛑 SIGTERM received, shutting down gracefully...');
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
        res.end('Notification Bot is running...');
    });
    
    server.listen(PORT, () => {
        console.log(`🚂 Server listening on port ${PORT}`);
    });
}
