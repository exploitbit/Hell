// ==========================================
// TELEGRAM BOT - COMPLETE FIXED SOLUTION
// ==========================================
// Fixed: All bugs, proper flow, pagination, contact system
// Added: Name overlay option for images
// ==========================================

const { Telegraf, Scenes, session, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const fetch = require('node-fetch');
require('dotenv').config();

// Cloudinary configuration
cloudinary.config({
  cloud_name: 'dneusgyzc',
  api_key: '474713292161728',
  api_secret: 'DHJmvD784FEVmeOt1-K8XeNhCQQ'
});

// Initialize bot
const BOT_TOKEN = process.env.BOT_TOKEN || '8316963643:AAFkrHxY_Nmzx1Yy7blZzeDEN4aVCMnM-vs' ;
const bot = new Telegraf(BOT_TOKEN);

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://sandip102938:Q1g2Fbn7ewNqEvuK@test.ebvv4hf.mongodb.net/two_telegram_bot';
let db;

async function connectDB() {
    try {
        const client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db();
        console.log('✅ Connected to MongoDB');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        return false;
    }
}

// Initialize scenes and session
const stage = new Scenes.Stage([]);
bot.use(session());
bot.use(stage.middleware());

// Scene handler factory
function createScene(sceneId) {
    return new Scenes.BaseScene(sceneId);
}

// SCENE DEFINITIONS
const scenes = {
    // Broadcast scene
    broadcast: createScene('broadcast_scene'),
    
    // Channel scenes
    addChannelType: createScene('add_channel_type_scene'),
    addPublicChannelName: createScene('add_public_channel_name_scene'),
    addPublicChannelId: createScene('add_public_channel_id_scene'),
    addPublicChannelLink: createScene('add_public_channel_link_scene'),
    addPrivateChannelName: createScene('add_private_channel_name_scene'),
    addPrivateChannelId: createScene('add_private_channel_id_scene'),
    addPrivateChannelLink: createScene('add_private_channel_link_scene'),
    
    // App scenes
    addAppName: createScene('add_app_name_scene'),
    addAppImage: createScene('add_app_image_scene'),
    addAppCodeCount: createScene('add_app_code_count_scene'),
    addAppCodePrefixes: createScene('add_app_code_prefixes_scene'),
    addAppCodeLengths: createScene('add_app_code_lengths_scene'),
    addAppCodeMessage: createScene('add_app_code_message_scene'),
    
    // Contact user scenes
    contactUserMessage: createScene('contact_user_message_scene'),
    
    // Edit scenes
    editStartImage: createScene('edit_start_image_scene'),
    editStartMessage: createScene('edit_start_message_scene'),
    editMenuImage: createScene('edit_menu_image_scene'),
    editMenuMessage: createScene('edit_menu_message_scene'),
    
    // Timer scene
    editTimer: createScene('edit_timer_scene'),
    
    // Report to admin scene
    reportToAdmin: createScene('report_to_admin_scene'),
    
    // Admin scenes
    addAdmin: createScene('add_admin_scene'),
    
    // Manage images scene
    manageImages: createScene('manage_images_scene'),
    
    // Image overlay scene
    imageOverlay: createScene('image_overlay_scene')
};

// Register all scenes
Object.values(scenes).forEach(scene => stage.register(scene));

// 🔐 ADMIN CONFIGURATION
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [8435248854, 8567719155 ];

// Default configurations
const DEFAULT_CONFIG = {
    startImage: 'https://res.cloudinary.com/dneusgyzc/image/upload/l_text:Stalinist%20One_140_bold:{name},co_rgb:00e5ff,g_center/fl_preserve_transparency/v1763670359/1000106281_cfg1ke.jpg',
    startMessage: '👋 *Welcome! We are Premium Agents.*\n\n⚠️ _Access Denied_\nTo access our exclusive agent list, you must join our affiliate channels below:',
    menuImage: 'https://res.cloudinary.com/dneusgyzc/image/upload/l_text:Stalinist%20One_140_bold:{name},co_rgb:00e5ff,g_center/fl_preserve_transparency/v1763670359/1000106281_cfg1ke.jpg',
    menuMessage: '🎉 *Welcome to the Agent Panel!*\n\n✅ _Verification Successful_\nSelect an app below to generate codes:',
    codeTimer: 7200 // 2 hours in seconds
};

// ==========================================
// DATABASE INITIALIZATION
// ==========================================

async function initBot() {
    try {
        // Check if config exists
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        if (!config) {
            // Create new config
            await db.collection('admin').insertOne({
                type: 'config',
                admins: ADMIN_IDS,
                startImage: DEFAULT_CONFIG.startImage,
                startMessage: DEFAULT_CONFIG.startMessage,
                menuImage: DEFAULT_CONFIG.menuImage,
                menuMessage: DEFAULT_CONFIG.menuMessage,
                codeTimer: DEFAULT_CONFIG.codeTimer,
                channels: [],
                apps: [],
                uploadedImages: [],
                imageOverlaySettings: {
                    startImage: true,
                    menuImage: true,
                    appImages: true
                },
                createdAt: new Date(),
                updatedAt: new Date()
            });
            console.log('✅ Created new bot configuration');
        } else {
            console.log('✅ Loaded existing bot configuration');
        }
        
        // Create indexes
        await db.collection('users').createIndex({ userId: 1 }, { unique: true });
        await db.collection('admin').createIndex({ type: 1 }, { unique: true });
        
        console.log(`✅ Bot initialized with ${ADMIN_IDS.length} admins`);
        return true;
    } catch (error) {
        console.error('❌ Error initializing bot:', error);
        return false;
    }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Escape markdown characters
function escapeMarkdown(text) {
    if (!text) return '';
    return text.toString()
        .replace(/\_/g, '\\_')
        .replace(/\*/g, '\\*')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/\~/g, '\\~')
        .replace(/\`/g, '\\`')
        .replace(/\>/g, '\\>')
        .replace(/\#/g, '\\#')
        .replace(/\+/g, '\\+')
        .replace(/\-/g, '\\-')
        .replace(/\=/g, '\\=')
        .replace(/\|/g, '\\|')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
        .replace(/\./g, '\\.')
        .replace(/\!/g, '\\!');
}

// Safe send message with HTML parse mode
async function safeSendMessage(ctx, text, options = {}) {
    try {
        return await ctx.reply(text, { 
            parse_mode: 'HTML',
            ...options 
        });
    } catch (error) {
        console.error('Error sending message:', error.message);
        // Try without HTML parsing
        return await ctx.reply(text, options);
    }
}

// Safe edit message with HTML parse mode
async function safeEditMessage(ctx, text, options = {}) {
    try {
        return await ctx.editMessageText(text, { 
            parse_mode: 'HTML',
            ...options 
        });
    } catch (error) {
        console.error('Error editing message:', error.message);
        // Try without HTML parsing
        return await ctx.editMessageText(text, options);
    }
}

// Notify ALL Admins
async function notifyAdmin(text) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const allAdmins = config?.admins || ADMIN_IDS;
        
        for (const adminId of allAdmins) {
            try {
                await bot.telegram.sendMessage(adminId, text, { parse_mode: 'HTML' });
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`Failed to notify admin ${adminId}:`, error.message);
            }
        }
    } catch (error) {
        console.error('Error in notifyAdmin:', error);
    }
}

// Smart Name Logic - FIXED: Handle special characters, emojis
function getSmartName(user) {
    try {
        let firstName = user.first_name || '';
        let username = user.username || '';
        let lastName = user.last_name || '';
        
        let finalName = 'Agent';
        
        if (firstName && firstName.length <= 20) {
            finalName = firstName;
        } else if (username) {
            finalName = username;
        } else if (lastName) {
            finalName = lastName;
        }
        
        if (finalName.length > 15) {
            finalName = finalName.substring(0, 14) + '...';
        }
        
        return finalName;
    } catch (error) {
        return 'Agent';
    }
}

// Clean name for image display (remove emojis, special chars)
function cleanNameForImage(text) {
    if (!text) return 'Agent';
    // Remove emojis and special characters but keep basic ones
    return text.replace(/[^\w\s\-\.]/gi, '').trim() || 'Agent';
}

// Check Admin Status
async function isAdmin(userId) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        if (!config || !config.admins) return ADMIN_IDS.includes(Number(userId));
        
        return config.admins.some(id => String(id) === String(userId));
    } catch (error) {
        console.error('Error checking admin:', error);
        return ADMIN_IDS.includes(Number(userId));
    }
}

// Get Unjoined Channels - FIXED: Handle private channels with join requests
async function getUnjoinedChannels(userId) {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        if (!config || !config.channels || config.channels.length === 0) return [];
        
        const unjoined = [];
        
        for (const channel of config.channels) {
            try {
                // Try to get member status
                const member = await bot.telegram.getChatMember(channel.id, userId);
                if (member.status === 'left' || member.status === 'kicked') {
                    unjoined.push(channel);
                }
            } catch (error) {
                // If we can't check (bot not admin or private channel), assume not joined
                // For private channels with join requests, we'll still show the button
                unjoined.push(channel);
            }
        }
        
        return unjoined;
    } catch (error) {
        console.error('Error in getUnjoinedChannels:', error);
        return [];
    }
}

// Generate Random Code - FIXED: Proper code generation
function generateCode(prefix = '', length = 8) {
    try {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = prefix.toUpperCase(); // Ensure prefix is uppercase
        
        // Generate random characters for remaining length
        for (let i = code.length; i < length; i++) {
            code += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        
        return code;
    } catch (error) {
        // Fallback code generation
        return prefix.toUpperCase() + Math.random().toString(36).substr(2, length - prefix.length).toUpperCase();
    }
}

// Format Time Remaining
function formatTimeRemaining(seconds) {
    try {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        return `${hours}h ${minutes}m ${secs}s`;
    } catch (error) {
        return 'Error';
    }
}

// Replace Variables in Text - FIXED: Keep emojis and special chars for text
function replaceVariables(text, variables) {
    try {
        let result = text;
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\{${key}\\}`, 'gi');
            result = result.replace(regex, value || '');
        }
        return result;
    } catch (error) {
        return text;
    }
}

// Get User Variables - FIXED: Keep original names with emojis for text
function getUserVariables(user) {
    try {
        const smartName = getSmartName(user);
        const firstName = user.first_name || '';
        const lastName = user.last_name || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        
        return {
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            username: user.username ? `@${user.username}` : '',
            name: smartName // Clean name for images
        };
    } catch (error) {
        return {
            first_name: '',
            last_name: '',
            full_name: '',
            username: '',
            name: 'Agent'
        };
    }
}

// Upload to Cloudinary
async function uploadToCloudinary(fileBuffer, folder = 'bot_images') {
    try {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { 
                    folder: folder,
                    resource_type: 'auto'
                },
                (error, result) => {
                    if (error) {
                        console.error('Cloudinary upload error:', error);
                        reject(error);
                    } else {
                        resolve(result);
                    }
                }
            );
            
            if (!fileBuffer || fileBuffer.length === 0) {
                reject(new Error('Empty file buffer'));
                return;
            }
            
            uploadStream.end(fileBuffer);
        });
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw error;
    }
}

// Get Cloudinary URL with name - FIXED: Check overlay settings
async function getCloudinaryUrlWithName(originalUrl, name, imageType = 'startImage') {
    try {
        if (!originalUrl.includes('cloudinary.com')) return originalUrl;
        
        // Get overlay settings
        const config = await db.collection('admin').findOne({ type: 'config' });
        const overlaySettings = config?.imageOverlaySettings || {
            startImage: true,
            menuImage: true,
            appImages: true
        };
        
        // Check if overlay should be applied
        let shouldAddOverlay = false;
        if (imageType === 'startImage') {
            shouldAddOverlay = overlaySettings.startImage;
        } else if (imageType === 'menuImage') {
            shouldAddOverlay = overlaySettings.menuImage;
        } else if (imageType === 'appImage') {
            shouldAddOverlay = overlaySettings.appImages;
        }
        
        if (!shouldAddOverlay) {
            // Remove any existing {name} overlay from URL
            const cleanUrl = originalUrl.replace(/l_text:[^\/]+\/[^\/]+\//, '');
            return cleanUrl;
        }
        
        // Always add name overlay for cloudinary URLs
        const cleanName = cleanNameForImage(name);
        const encodedName = encodeURIComponent(cleanName);
        
        // Check if URL already has transformations
        if (originalUrl.includes('/upload/')) {
            const parts = originalUrl.split('/upload/');
            if (parts.length === 2) {
                // Check if already has overlay
                if (originalUrl.includes('l_text:')) {
                    // Replace existing overlay
                    const urlWithoutOverlay = originalUrl.replace(/\/l_text:[^\/]+\/[^\/]+\//, '/');
                    return `${urlWithoutOverlay.split('/upload/')[0]}/upload/l_text:Stalinist%20One_140_bold:{name},co_rgb:00e5ff,g_center/${urlWithoutOverlay.split('/upload/')[1]}`;
                } else {
                    // Insert name overlay transformation
                    return `${parts[0]}/upload/l_text:Stalinist%20One_140_bold:{name},co_rgb:00e5ff,g_center/${parts[1]}`;
                }
            }
        }
        
        return originalUrl;
    } catch (error) {
        console.error('Error in getCloudinaryUrlWithName:', error);
        return originalUrl;
    }
}

// Save to Database Helper
async function saveToDatabase(collection, query, update, options = {}) {
    try {
        const result = await db.collection(collection).updateOne(
            query,
            update,
            { upsert: true, ...options }
        );
        return result;
    } catch (error) {
        console.error(`Database error in ${collection}:`, error);
        throw error;
    }
}

// Get paginated users - FIXED: 40 users per page, 2 per line
async function getPaginatedUsers(page = 1, limit = 40) {
    try {
        const skip = (page - 1) * limit;
        const users = await db.collection('users')
            .find({})
            .sort({ joinedAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        const totalUsers = await db.collection('users').countDocuments();
        const totalPages = Math.ceil(totalUsers / limit);
        
        return {
            users,
            page,
            totalPages,
            totalUsers,
            hasNext: page < totalPages,
            hasPrev: page > 1
        };
    } catch (error) {
        console.error('Error getting paginated users:', error);
        return { users: [], page: 1, totalPages: 0, totalUsers: 0, hasNext: false, hasPrev: false };
    }
}

// Format message for display (remove escaping)
function formatMessageForDisplay(text) {
    if (!text) return '';
    // Remove markdown escaping but keep the actual content
    return text.replace(/\\([\\_*[\]()~`>#+\-=|{}.!-])/g, '$1');
}

// Check if URL contains {name} variable
function hasNameVariable(url) {
    return url && url.includes('{name}');
}

// Check if image URL is valid
async function isValidImageUrl(url) {
    try {
        if (!url.startsWith('http')) return false;
        const response = await fetch(url, { method: 'HEAD' });
        const contentType = response.headers.get('content-type');
        return contentType && contentType.startsWith('image/');
    } catch (error) {
        return false;
    }
}

// ==========================================
// USER FLOW - START COMMAND
// ==========================================

bot.start(async (ctx) => {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        // Save or update user
        await saveToDatabase('users', 
            { userId: userId },
            {
                $set: {
                    firstName: user.first_name,
                    lastName: user.last_name,
                    username: user.username,
                    lastActive: new Date()
                },
                $setOnInsert: {
                    joinedAll: false,
                    joinedAt: new Date(),
                    codeTimestamps: {}
                }
            }
        );
        
        // Check if new user
        const existingUser = await db.collection('users').findOne({ userId: userId });
        if (!existingUser.joinedAt) {
            const userLink = user.username ? `@${user.username}` : user.first_name || 'Unknown';
            await notifyAdmin(`🆕 <b>New User Joined</b>\n\nID: <code>${userId}</code>\nUser: ${escapeMarkdown(userLink)}`);
        }
        
        // Always show start screen first
        await showStartScreen(ctx);
    } catch (error) {
        console.error('Start command error:', error);
        // Store error for reporting
        ctx.session.lastError = {
            command: '/start',
            error: error.message,
            stack: error.stack
        };
        
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.', {
            reply_markup: {
                inline_keyboard: [[
                    { text: '📞 Contact Admin', callback_data: 'contact_admin' },
                    { text: '🔄 Try Again', callback_data: 'back_to_start' }
                ]]
            }
        });
    }
});

// Show Start Screen
async function showStartScreen(ctx) {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        // Get unjoined channels
        const unjoinedChannels = await getUnjoinedChannels(userId);
        
        // Get configuration
        const config = await db.collection('admin').findOne({ type: 'config' });
        
        // Prepare user variables
        const userVars = getUserVariables(user);
        
        // Prepare image URL with name
        let startImage = config?.startImage || DEFAULT_CONFIG.startImage;
        startImage = await getCloudinaryUrlWithName(startImage, userVars.name, 'startImage');
        
        // Prepare message
        let startMessage = config?.startMessage || DEFAULT_CONFIG.startMessage;
        startMessage = replaceVariables(startMessage, userVars);
        
        // Create buttons
        const buttons = [];
        
        // Add channel buttons if there are unjoined channels
        if (unjoinedChannels.length > 0) {
            unjoinedChannels.forEach(channel => {
                const buttonText = channel.buttonLabel || `Join ${channel.title}`;
                buttons.push([{ text: buttonText, url: channel.link }]);
            });
            
            // Add verify button
            buttons.push([{ text: '✅ Check Joined', callback_data: 'check_joined' }]);
        } else {
            // All channels joined - show menu button
            buttons.push([{ text: '🎮 Go to Menu', callback_data: 'go_to_menu' }]);
        }
        
        // Add contact admin button
        buttons.push([{ text: '📞 Contact Admin', callback_data: 'contact_admin' }]);
        
        await ctx.replyWithPhoto(startImage, {
            caption: startMessage,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons }
        });
        
    } catch (error) {
        console.error('Show start screen error:', error);
        // Store error for reporting
        ctx.session.lastError = {
            function: 'showStartScreen',
            error: error.message,
            stack: error.stack
        };
        
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.', {
            reply_markup: {
                inline_keyboard: [[
                    { text: '📞 Contact Admin', callback_data: 'contact_admin' },
                    { text: '🔄 Try Again', callback_data: 'back_to_start' }
                ]]
            }
        });
    }
}

// Contact Admin button
bot.action('contact_admin', async (ctx) => {
    try {
        const user = ctx.from;
        const userInfo = user.username ? `@${user.username}` : user.first_name || `User ${user.id}`;
        
        // If there's a stored error, send it
        let errorReport = '';
        if (ctx.session?.lastError) {
            const error = ctx.session.lastError;
            errorReport = `⚠️ <b>ERROR REPORT</b>\n\n`;
            errorReport += `<b>Command/Function:</b> ${error.command || error.function || 'Unknown'}\n`;
            errorReport += `<b>User:</b> ${userInfo}\n`;
            errorReport += `<b>User ID:</b> <code>${user.id}</code>\n`;
            errorReport += `<b>Error:</b> <code>${escapeMarkdown(error.error)}</code>\n`;
            
            // Clear stored error
            delete ctx.session.lastError;
        } else {
            errorReport = `📞 <b>User wants to contact admin</b>\n\n`;
            errorReport += `<b>User:</b> ${userInfo}\n`;
            errorReport += `<b>User ID:</b> <code>${user.id}</code>\n`;
            errorReport += `<b>Message:</b> User clicked "Contact Admin" button`;
        }
        
        await notifyAdmin(errorReport + `\n\n<pre>Click below to reply:</pre>`);
        
        // Send reply button to all admins
        const config = await db.collection('admin').findOne({ type: 'config' });
        const allAdmins = config?.admins || ADMIN_IDS;
        
        for (const adminId of allAdmins) {
            try {
                await bot.telegram.sendMessage(
                    adminId,
                    errorReport,
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '💬 Reply to User', callback_data: `contact_user_${user.id}` }
                            ]]
                        }
                    }
                );
            } catch (error) {
                console.error(`Failed to notify admin ${adminId}:`, error.message);
            }
        }
        
        await ctx.answerCbQuery('✅ Message sent to admin team!');
        
    } catch (error) {
        console.error('Contact admin error:', error);
        await ctx.answerCbQuery('❌ Failed to contact admin');
    }
});

// Check Joined
bot.action('check_joined', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        await showStartScreen(ctx);
    } catch (error) {
        console.error('Check joined error:', error);
        await ctx.answerCbQuery('❌ Error checking channels');
    }
});

// Go to Menu
bot.action('go_to_menu', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Go to menu error:', error);
        await ctx.answerCbQuery('❌ Error loading menu');
    }
});

// ==========================================
// MAIN MENU
// ==========================================

async function showMainMenu(ctx) {
    try {
        const user = ctx.from;
        const userId = user.id;
        
        // First check if user has joined all channels
        const unjoinedChannels = await getUnjoinedChannels(userId);
        if (unjoinedChannels.length > 0) {
            // Update user status
            await db.collection('users').updateOne(
                { userId: userId },
                { $set: { joinedAll: false } }
            );
            
            await safeSendMessage(ctx, '⚠️ Please join all channels first!', {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Start', callback_data: 'back_to_start' }
                    ]]
                }
            });
            return;
        }
        
        // Update user status to joined all
        await db.collection('users').updateOne(
            { userId: userId },
            { $set: { joinedAll: true } }
        );
        
        // Get configuration
        const config = await db.collection('admin').findOne({ type: 'config' });
        const apps = config?.apps || [];
        
        // Prepare user variables
        const userVars = getUserVariables(user);
        
        // Prepare image URL with name
        let menuImage = config?.menuImage || DEFAULT_CONFIG.menuImage;
        menuImage = await getCloudinaryUrlWithName(menuImage, userVars.name, 'menuImage');
        
        // Prepare message
        let menuMessage = config?.menuMessage || DEFAULT_CONFIG.menuMessage;
        menuMessage = replaceVariables(menuMessage, userVars);
        
        // Create app buttons (2 per row)
        const keyboard = [];
        
        if (apps.length === 0) {
            keyboard.push([{ text: '📱 No Apps Available', callback_data: 'no_apps' }]);
        } else {
            // Group apps 2 per row
            for (let i = 0; i < apps.length; i += 2) {
                const row = [];
                row.push({ text: apps[i].name, callback_data: `app_${apps[i].id}` });
                
                if (i + 1 < apps.length) {
                    row.push({ text: apps[i + 1].name, callback_data: `app_${apps[i + 1].id}` });
                }
                
                keyboard.push(row);
            }
        }
        
        // Add back button
        keyboard.push([{ text: '🔙 Back to Start', callback_data: 'back_to_start' }]);
        
        // Add contact admin button
        keyboard.push([{ text: '📞 Contact Admin', callback_data: 'contact_admin' }]);
        
        await ctx.replyWithPhoto(menuImage, {
            caption: menuMessage,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Show main menu error:', error);
        // Store error for reporting
        ctx.session.lastError = {
            function: 'showMainMenu',
            error: error.message,
            stack: error.stack
        };
        
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.', {
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Start', callback_data: 'back_to_start' },
                    { text: '📞 Contact Admin', callback_data: 'contact_admin' }
                ]]
            }
        });
    }
}

// Back to Start
bot.action('back_to_start', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        await showStartScreen(ctx);
    } catch (error) {
        console.error('Back to start error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// No Apps Available
bot.action('no_apps', async (ctx) => {
    await ctx.answerCbQuery('No apps available yet. Please check back later.');
});

// ==========================================
// APP CODE GENERATION - FIXED
// ==========================================

bot.action(/^app_(.+)$/, async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        
        const appId = ctx.match[1];
        const userId = ctx.from.id;
        
        // Get app details
        const config = await db.collection('admin').findOne({ type: 'config' });
        const app = config?.apps?.find(a => a.id === appId);
        
        if (!app) {
            await safeSendMessage(ctx, '❌ App not found.');
            await showMainMenu(ctx);
            return;
        }
        
        // Get user data
        const userData = await db.collection('users').findOne({ userId: userId });
        const codeTimer = config?.codeTimer || DEFAULT_CONFIG.codeTimer;
        
        // Check cooldown
        const lastGenerated = userData?.codeTimestamps?.[appId];
        const now = Math.floor(Date.now() / 1000);
        
        if (lastGenerated && (now - lastGenerated) < codeTimer) {
            const remaining = codeTimer - (now - lastGenerated);
            const timeStr = formatTimeRemaining(remaining);
            
            await safeSendMessage(ctx, 
                `⏰ <b>Please Wait</b>\n\nYou can generate new codes for <b>${escapeMarkdown(app.name)}</b> in:\n<code>${timeStr}</code>`
            );
            
            await safeSendMessage(ctx, '🔙 Back to Menu', {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back', callback_data: 'back_to_menu' }
                    ]]
                }
            });
            return;
        }
        
        // Generate codes - FIXED: Proper generation
        const codes = [];
        const codeCount = app.codeCount || 1;
        const codePrefixes = app.codePrefixes || [];
        const codeLengths = app.codeLengths || [];
        
        for (let i = 0; i < codeCount; i++) {
            const prefix = codePrefixes[i] || '';
            const length = codeLengths[i] || 8;
            const code = generateCode(prefix, length);
            codes.push(code);
        }
        
        // Prepare variables
        const userVars = getUserVariables(ctx.from);
        const appVars = {
            app_name: app.name,
            button_name: app.name
        };
        
        // Add code variables
        codes.forEach((code, index) => {
            appVars[`code${index + 1}`] = `<code>${code}</code>`;
        });
        
        // Replace variables in message
        let message = app.codeMessage || 'Your code: {code1}';
        message = replaceVariables(message, userVars);
        message = replaceVariables(message, appVars);
        
        // Format codes nicely
        let formattedCodes = '';
        codes.forEach((code, index) => {
            formattedCodes += `• <code>${code}</code>\n`;
        });
        
        // Add formatted codes to message
        if (!message.includes('{code')) {
            message += `\n\n${formattedCodes}`;
        }
        
        // Send app image if available
        if (app.image && app.image !== 'none') {
            // Add name overlay to app image
            let appImage = app.image;
            if (appImage.includes('cloudinary.com')) {
                appImage = await getCloudinaryUrlWithName(appImage, userVars.name, 'appImage');
            }
            
            await ctx.replyWithPhoto(appImage, {
                caption: message,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                    ]]
                }
            });
        } else {
            await safeSendMessage(ctx, message, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back to Menu', callback_data: 'back_to_menu' }
                    ]]
                }
            });
        }
        
        // Update user's cooldown
        await db.collection('users').updateOne(
            { userId: userId },
            { $set: { [`codeTimestamps.${appId}`]: now } }
        );
        
        // Log code generation
        console.log(`✅ Generated ${codes.length} codes for user ${userId}: ${codes.join(', ')}`);
        
    } catch (error) {
        console.error('App selection error:', error);
        // Store error for reporting
        ctx.session.lastError = {
            function: 'app_code_generation',
            appId: ctx.match[1],
            error: error.message,
            stack: error.stack
        };
        
        await safeSendMessage(ctx, '❌ An error occurred while generating codes. Please try again.', {
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔙 Back to Menu', callback_data: 'back_to_menu' },
                    { text: '📞 Contact Admin', callback_data: 'contact_admin' }
                ]]
            }
        });
    }
});

// Back to Menu
bot.action('back_to_menu', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        await showMainMenu(ctx);
    } catch (error) {
        console.error('Back to menu error:', error);
    }
});

// ==========================================
// 🛡️ ADMIN PANEL - FIXED
// ==========================================

// Admin command - FIXED: Only works with /admin command
bot.command('admin', async (ctx) => {
    try {
        if (!await isAdmin(ctx.from.id)) {
            return safeSendMessage(ctx, '❌ You are not authorized to use this command.');
        }
        
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Admin command error:', error);
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.');
    }
});

async function showAdminPanel(ctx) {
    try {
        const text = '👮‍♂️ <b>Admin Control Panel</b>\n\nSelect an option below:';
        const keyboard = [
            [{ text: '📢 Broadcast', callback_data: 'admin_broadcast' }, { text: '👥 User Stats', callback_data: 'admin_userstats' }],
            [{ text: '🖼️ Start Image', callback_data: 'admin_startimage' }, { text: '📝 Start Message', callback_data: 'admin_startmessage' }],
            [{ text: '🖼️ Menu Image', callback_data: 'admin_menuimage' }, { text: '📝 Menu Message', callback_data: 'admin_menumessage' }],
            [{ text: '⏰ Code Timer', callback_data: 'admin_timer' }, { text: '📺 Manage Channels', callback_data: 'admin_channels' }],
            [{ text: '📱 Manage Apps', callback_data: 'admin_apps' }, { text: '👑 Manage Admins', callback_data: 'admin_manage_admins' }],
            [{ text: '⚙️ Image Overlay Settings', callback_data: 'admin_image_overlay' }, { text: '🗑️ Delete Data', callback_data: 'admin_deletedata' }],
            [{ text: '🖼️ Manage Images', callback_data: 'admin_manage_images' }]
        ];
        
        if (ctx.callbackQuery) {
            await safeEditMessage(ctx, text, {
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await safeSendMessage(ctx, text, {
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } catch (error) {
        console.error('Show admin panel error:', error);
        await safeSendMessage(ctx, '❌ An error occurred. Please try again.');
    }
}

// Back to Admin Panel
bot.action('admin_back', async (ctx) => {
    await showAdminPanel(ctx);
});

// ==========================================
// ADMIN FEATURES - BROADCAST (HTML support)
// ==========================================

bot.action('admin_broadcast', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await safeEditMessage(ctx, '📢 <b>Broadcast Message</b>\n\nSend the message you want to broadcast to all users.\n\n<i>Supports HTML formatting</i>\n\nType "cancel" to cancel.');
    await ctx.scene.enter('broadcast_scene');
});

scenes.broadcast.on('message', async (ctx) => {
    try {
        if (ctx.message.text?.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Broadcast cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const users = await db.collection('users').find({}).toArray();
        const totalUsers = users.length;
        let successful = 0;
        let failed = 0;
        
        await safeSendMessage(ctx, `🚀 Broadcasting to ${totalUsers} users...`);
        
        for (const user of users) {
            try {
                if (ctx.message.photo) {
                    await ctx.telegram.sendPhoto(
                        user.userId,
                        ctx.message.photo[ctx.message.photo.length - 1].file_id,
                        {
                            caption: ctx.message.caption,
                            parse_mode: 'HTML'
                        }
                    );
                } else if (ctx.message.document) {
                    await ctx.telegram.sendDocument(
                        user.userId,
                        ctx.message.document.file_id,
                        {
                            caption: ctx.message.caption,
                            parse_mode: 'HTML'
                        }
                    );
                } else if (ctx.message.text) {
                    await ctx.telegram.sendMessage(
                        user.userId,
                        ctx.message.text,
                        { parse_mode: 'HTML' }
                    );
                }
                
                successful++;
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (error) {
                failed++;
            }
        }
        
        await safeSendMessage(ctx,
            `✅ <b>Broadcast Complete</b>\n\n📊 <b>Statistics:</b>\n• Total: ${totalUsers}\n• ✅ Successful: ${successful}\n• ❌ Failed: ${failed}`,
            { parse_mode: 'HTML' }
        );
        
    } catch (error) {
        console.error('Broadcast error:', error);
        await safeSendMessage(ctx, '❌ Broadcast failed.');
    }
    
    await ctx.scene.leave();
    await showAdminPanel(ctx);
});

// ==========================================
// ADMIN FEATURES - USER STATS WITH PAGINATION (FIXED)
// ==========================================

bot.action('admin_userstats', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await showUserStatsPage(ctx, 1);
});

async function showUserStatsPage(ctx, page) {
    try {
        const userData = await getPaginatedUsers(page, 40); // 40 users per page
        const users = userData.users;
        const totalUsers = userData.totalUsers;
        const verifiedUsers = users.filter(u => u.joinedAll).length;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const activeToday = users.filter(u => u.lastActive && new Date(u.lastActive) >= today).length;
        
        let usersText = `<b>📊 User Statistics</b>\n\n`;
        usersText += `• <b>Total Users:</b> ${totalUsers}\n`;
        usersText += `• <b>Verified Users:</b> ${verifiedUsers}\n`;
        usersText += `• <b>Active Today:</b> ${activeToday}\n\n`;
        usersText += `<b>👥 Users (Page ${page}/${userData.totalPages}):</b>\n\n`;
        
        // Create keyboard with 2 users per row
        const keyboard = [];
        
        // Group users 2 per row
        for (let i = 0; i < users.length; i += 2) {
            const row = [];
            
            // First user in row
            const user1 = users[i];
            const userNum1 = (page - 1) * 40 + i + 1;
            row.push({ 
                text: `${userNum1}. ${user1.userId}`, 
                callback_data: `user_detail_${user1.userId}` 
            });
            
            // Second user in row if exists
            if (i + 1 < users.length) {
                const user2 = users[i + 1];
                const userNum2 = (page - 1) * 40 + i + 2;
                row.push({ 
                    text: `${userNum2}. ${user2.userId}`, 
                    callback_data: `user_detail_${user2.userId}` 
                });
            }
            
            keyboard.push(row);
        }
        
        // Navigation buttons at the end
        if (userData.hasPrev || userData.hasNext) {
            const navRow = [];
            if (userData.hasPrev) {
                navRow.push({ text: '◀️ Previous', callback_data: `users_page_${page - 1}` });
            }
            navRow.push({ text: `📄 ${page}/${userData.totalPages}`, callback_data: 'no_action' });
            if (userData.hasNext) {
                navRow.push({ text: 'Next ▶️', callback_data: `users_page_${page + 1}` });
            }
            keyboard.push(navRow);
        }
        
        keyboard.push([{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]);
        
        if (ctx.callbackQuery) {
            await safeEditMessage(ctx, usersText, {
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await safeSendMessage(ctx, usersText, {
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } catch (error) {
        console.error('User stats error:', error);
        await safeSendMessage(ctx, '❌ Failed to get user statistics.');
    }
}

// No action callback
bot.action('no_action', async (ctx) => {
    await ctx.answerCbQuery();
});

// User detail view - FIXED: Removed code generation history
bot.action(/^user_detail_(\d+)$/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        const user = await db.collection('users').findOne({ userId: Number(userId) });
        
        if (!user) {
            await ctx.answerCbQuery('❌ User not found');
            return;
        }
        
        const username = user.username ? `@${user.username}` : 'No username';
        const firstName = user.firstName || 'No first name';
        const lastName = user.lastName || 'No last name';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || 'No name';
        const joinedAt = user.joinedAt ? new Date(user.joinedAt).toLocaleString() : 'Unknown';
        const lastActive = user.lastActive ? new Date(user.lastActive).toLocaleString() : 'Never';
        const isVerified = user.joinedAll ? '✅ Verified' : '❌ Not Verified';
        
        let userDetail = `<b>👤 User Details</b>\n\n`;
        userDetail += `• <b>ID:</b> <code>${userId}</code>\n`;
        userDetail += `• <b>Username:</b> <code>${escapeMarkdown(username)}</code>\n`;
        userDetail += `• <b>First Name:</b> <code>${escapeMarkdown(firstName)}</code>\n`;
        userDetail += `• <b>Last Name:</b> <code>${escapeMarkdown(lastName)}</code>\n`;
        userDetail += `• <b>Full Name:</b> <code>${escapeMarkdown(fullName)}</code>\n`;
        userDetail += `• <b>Status:</b> ${isVerified}\n`;
        userDetail += `• <b>Joined:</b> <code>${joinedAt}</code>\n`;
        userDetail += `• <b>Last Active:</b> <code>${lastActive}</code>\n`;
        
        const keyboard = [
            [{ text: '💬 Send Message/Photo', callback_data: `contact_user_${userId}` }],
            [{ text: '🔙 Back to Users', callback_data: 'admin_userstats' }],
            [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, userDetail, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('User detail error:', error);
        await ctx.answerCbQuery('❌ Error loading user details');
    }
});

// Pagination handlers
bot.action(/^users_page_(\d+)$/, async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const page = parseInt(ctx.match[1]);
    await showUserStatsPage(ctx, page);
});

// Handle contact from user stats
bot.action(/^contact_user_(\d+)$/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        
        // Store user ID in session
        ctx.session.contactUser = {
            userId: userId
        };
        
        await safeSendMessage(ctx, `Now send the message or photo to user ID: <code>${userId}</code>\n\n<i>You can send text, photo with caption, or just photo</i>\n\nType "cancel" to cancel.`, {
            parse_mode: 'HTML'
        });
        await ctx.scene.enter('contact_user_message_scene');
    } catch (error) {
        console.error('Contact user error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Contact user message scene - FIXED: Accept both text and photos
scenes.contactUserMessage.on(['text', 'photo'], async (ctx) => {
    try {
        if (!ctx.session.contactUser) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const targetUserId = ctx.session.contactUser.userId;
        
        if (ctx.message.text?.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Contact cancelled.');
            delete ctx.session.contactUser;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        // Try to send message
        try {
            if (ctx.message.photo) {
                await ctx.telegram.sendPhoto(
                    targetUserId,
                    ctx.message.photo[ctx.message.photo.length - 1].file_id,
                    {
                        caption: ctx.message.caption || '',
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '📩 Reply to Admin', callback_data: `reply_to_admin_${ctx.from.id}` }
                            ]]
                        }
                    }
                );
            } else if (ctx.message.text) {
                await ctx.telegram.sendMessage(
                    targetUserId,
                    ctx.message.text,
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '📩 Reply to Admin', callback_data: `reply_to_admin_${ctx.from.id}` }
                            ]]
                        }
                    }
                );
            }
            
            await safeSendMessage(ctx, `✅ Message sent to user ID: <code>${targetUserId}</code>`, {
                parse_mode: 'HTML'
            });
            
        } catch (error) {
            await safeSendMessage(ctx, `❌ Failed to send message: ${error.message}`);
        }
        
        // Clear session
        delete ctx.session.contactUser;
        
    } catch (error) {
        console.error('Contact user message error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
    
    await ctx.scene.leave();
    await showAdminPanel(ctx);
});

// Handle reply to admin
bot.action(/^reply_to_admin_(.+)$/, async (ctx) => {
    try {
        const adminId = ctx.match[1];
        
        // Store admin ID in session
        ctx.session.replyToAdmin = {
            adminId: adminId
        };
        
        await safeSendMessage(ctx, 'Type your reply to the admin:\n\n<i>You can send text or photo with caption</i>\n\nType "cancel" to cancel.', {
            parse_mode: 'HTML'
        });
    } catch (error) {
        console.error('Reply to admin error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Handle user reply messages
bot.on('message', async (ctx) => {
    try {
        if (ctx.session?.replyToAdmin && !ctx.message.text?.startsWith('/')) {
            const adminId = ctx.session.replyToAdmin.adminId;
            const fromUser = ctx.from;
            const userInfo = fromUser.username ? `@${fromUser.username}` : fromUser.first_name || `User ${fromUser.id}`;
            
            if (ctx.message.text?.toLowerCase() === 'cancel') {
                await safeSendMessage(ctx, '❌ Reply cancelled.');
                delete ctx.session.replyToAdmin;
                return;
            }
            
            // Send to admin
            try {
                if (ctx.message.photo) {
                    await ctx.telegram.sendPhoto(
                        adminId,
                        ctx.message.photo[ctx.message.photo.length - 1].file_id,
                        {
                            caption: `<b>📩 Reply from user</b>\n\n<b>From:</b> ${escapeMarkdown(userInfo)}\n<b>ID:</b> <code>${fromUser.id}</code>\n\n${ctx.message.caption || ''}`,
                            parse_mode: 'HTML',
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '💬 Reply Back', callback_data: `contact_user_${fromUser.id}` }
                                ]]
                            }
                        }
                    );
                } else if (ctx.message.text) {
                    await ctx.telegram.sendMessage(
                        adminId,
                        `<b>📩 Reply from user</b>\n\n<b>From:</b> ${escapeMarkdown(userInfo)}\n<b>ID:</b> <code>${fromUser.id}</code>\n\n${ctx.message.text}`,
                        {
                            parse_mode: 'HTML',
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '💬 Reply Back', callback_data: `contact_user_${fromUser.id}` }
                                ]]
                            }
                        }
                    );
                }
                
                await safeSendMessage(ctx, '✅ Your reply has been sent to the admin.');
                delete ctx.session.replyToAdmin;
                
            } catch (error) {
                await safeSendMessage(ctx, '❌ Failed to send reply. The admin may have blocked the bot.');
                delete ctx.session.replyToAdmin;
            }
        }
    } catch (error) {
        console.error('Handle user reply error:', error);
    }
});

// ==========================================
// ADMIN FEATURES - START IMAGE (FIXED: {name} tag support with option)
// ==========================================

bot.action('admin_startimage', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentImage = config?.startImage || DEFAULT_CONFIG.startImage;
        const overlaySettings = config?.imageOverlaySettings || { startImage: true };
        const hasOverlay = hasNameVariable(currentImage) || overlaySettings.startImage;
        
        const text = `<b>🖼️ Start Image Management</b>\n\nCurrent Image:\n<code>${currentImage}</code>\n\nOverlay: ${hasOverlay ? '✅ ON' : '❌ OFF'}\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit URL', callback_data: 'admin_edit_startimage_url' }, { text: '📤 Upload', callback_data: 'admin_upload_startimage' }],
            [{ text: '🔄 Reset', callback_data: 'admin_reset_startimage' }, { text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Start image menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action('admin_edit_startimage_url', async (ctx) => {
    await safeSendMessage(ctx, 'Enter the new image URL:\n\n<i>Use {name} variable for user name overlay (optional)</i>\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    await ctx.scene.enter('edit_start_image_scene');
});

scenes.editStartImage.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Edit cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const newUrl = ctx.message.text.trim();
        
        if (!newUrl.startsWith('http')) {
            await safeSendMessage(ctx, '❌ Invalid URL. Must start with http:// or https://');
            return;
        }
        
        // Check if URL is valid image
        const isValid = await isValidImageUrl(newUrl);
        if (!isValid) {
            await safeSendMessage(ctx, '⚠️ The URL does not appear to be a valid image.\n\nDo you still want to use it?', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Yes, use anyway', callback_data: `confirm_bad_url_start_${encodeURIComponent(newUrl)}` }],
                        [{ text: '❌ No, cancel', callback_data: 'admin_startimage' }]
                    ]
                }
            });
            return;
        }
        
        // Update database
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    startImage: newUrl, 
                    updatedAt: new Date(),
                    'imageOverlaySettings.startImage': hasNameVariable(newUrl)
                } 
            }
        );
        
        await safeSendMessage(ctx, '✅ Start image URL updated!');
        await ctx.scene.leave();
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Edit start image error:', error);
        await safeSendMessage(ctx, '❌ Failed to update image.');
        await ctx.scene.leave();
    }
});

// Handle confirmation for bad URLs
bot.action(/^confirm_bad_url_start_(.+)$/, async (ctx) => {
    try {
        const url = decodeURIComponent(ctx.match[1]);
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    startImage: url, 
                    updatedAt: new Date(),
                    'imageOverlaySettings.startImage': hasNameVariable(url)
                } 
            }
        );
        
        await ctx.deleteMessage().catch(() => {});
        await safeSendMessage(ctx, '✅ Start image URL updated!');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Confirm bad URL error:', error);
        await safeSendMessage(ctx, '❌ Failed to update image.');
    }
});

bot.action('admin_upload_startimage', async (ctx) => {
    // Store that we're uploading start image
    ctx.session.uploadingImageType = 'startImage';
    await safeSendMessage(ctx, 'Send the image you want to upload:\n\nType "cancel" to cancel.');
    await ctx.scene.enter('image_overlay_scene');
});

// Image overlay scene for asking about name overlay
scenes.imageOverlay.on('photo', async (ctx) => {
    try {
        if (!ctx.session.uploadingImageType) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        // Store photo in session
        ctx.session.uploadingImage = ctx.message.photo[ctx.message.photo.length - 1];
        
        // Ask if they want name overlay
        await safeSendMessage(ctx, 'Do you want to show {name} overlay on this image?\n\n<i>This will display the user\'s name in the middle of the image</i>', {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Yes, show name', callback_data: 'overlay_yes' }],
                    [{ text: '❌ No, plain image', callback_data: 'overlay_no' }],
                    [{ text: '🚫 Cancel', callback_data: 'overlay_cancel' }]
                ]
            }
        });
    } catch (error) {
        console.error('Image overlay scene error:', error);
        await safeSendMessage(ctx, '❌ Error processing image.');
        await ctx.scene.leave();
        await showAdminPanel(ctx);
    }
});

// Handle overlay decision
bot.action('overlay_yes', async (ctx) => {
    await processImageUpload(ctx, true);
});

bot.action('overlay_no', async (ctx) => {
    await processImageUpload(ctx, false);
});

bot.action('overlay_cancel', async (ctx) => {
    try {
        await ctx.deleteMessage().catch(() => {});
        await safeSendMessage(ctx, '❌ Upload cancelled.');
        delete ctx.session.uploadingImageType;
        delete ctx.session.uploadingImage;
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Cancel overlay error:', error);
    }
});

async function processImageUpload(ctx, addOverlay) {
    try {
        if (!ctx.session.uploadingImageType || !ctx.session.uploadingImage) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            return;
        }
        
        const imageType = ctx.session.uploadingImageType;
        const photo = ctx.session.uploadingImage;
        const fileLink = await ctx.telegram.getFileLink(photo.file_id);
        const response = await fetch(fileLink);
        
        if (!response.ok) throw new Error('Failed to fetch image');
        
        const buffer = await response.buffer();
        
        // Upload to Cloudinary
        const result = await uploadToCloudinary(buffer, `${imageType}_images`);
        
        let cloudinaryUrl = result.secure_url;
        
        // Add overlay if requested
        if (addOverlay && imageType !== 'appImage') {
            cloudinaryUrl = cloudinaryUrl.replace('/upload/', '/upload/l_text:Stalinist%20One_140_bold:{name},co_rgb:00e5ff,g_center/');
        }
        
        // Update database based on image type
        let updateField = {};
        let imageTypeForDb = '';
        
        if (imageType === 'startImage') {
            updateField = { startImage: cloudinaryUrl };
            imageTypeForDb = 'start_image';
        } else if (imageType === 'menuImage') {
            updateField = { menuImage: cloudinaryUrl };
            imageTypeForDb = 'menu_image';
        }
        
        // Store uploaded image info
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    ...updateField, 
                    updatedAt: new Date(),
                    [`imageOverlaySettings.${imageType}`]: addOverlay
                },
                $push: { 
                    uploadedImages: {
                        url: cloudinaryUrl,
                        publicId: result.public_id,
                        type: imageTypeForDb,
                        hasOverlay: addOverlay,
                        uploadedAt: new Date()
                    }
                }
            }
        );
        
        await ctx.deleteMessage().catch(() => {});
        await safeSendMessage(ctx, `✅ Image uploaded and set as ${imageType.replace('Image', ' image')}!\n\nOverlay: ${addOverlay ? '✅ Yes' : '❌ No'}`);
        
        // Clear session
        delete ctx.session.uploadingImageType;
        delete ctx.session.uploadingImage;
        
    } catch (error) {
        console.error('Process image upload error:', error);
        await safeSendMessage(ctx, '❌ Failed to upload image.');
    }
    
    await showAdminPanel(ctx);
}

bot.action('admin_reset_startimage', async (ctx) => {
    try {
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    startImage: DEFAULT_CONFIG.startImage, 
                    updatedAt: new Date(),
                    'imageOverlaySettings.startImage': true
                } 
            }
        );
        
        await ctx.answerCbQuery('✅ Start image reset to default');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Reset start image error:', error);
        await ctx.answerCbQuery('❌ Failed to reset image');
    }
});

// ==========================================
// ADMIN FEATURES - START MESSAGE (HTML support) - FIXED: Display issue
// ==========================================

bot.action('admin_startmessage', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentMessage = config?.startMessage || DEFAULT_CONFIG.startMessage;
        
        // Use formatMessageForDisplay to show message properly
        const displayMessage = formatMessageForDisplay(currentMessage);
        
        const text = `<b>📝 Start Message Management</b>\n\nCurrent Message:\n<code>${escapeMarkdown(displayMessage)}</code>\n\nAvailable variables: {first_name}, {last_name}, {full_name}, {username}, {name}\n\nSupports HTML formatting\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit', callback_data: 'admin_edit_startmessage' }, { text: '🔄 Reset', callback_data: 'admin_reset_startmessage' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Start message menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action('admin_edit_startmessage', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentMessage = config?.startMessage || DEFAULT_CONFIG.startMessage;
        
        await safeSendMessage(ctx, `Current message:\n<code>${escapeMarkdown(formatMessageForDisplay(currentMessage))}</code>\n\nEnter the new start message:\n\n<i>Supports HTML formatting</i>\n\nType "cancel" to cancel.`, {
            parse_mode: 'HTML'
        });
        await ctx.scene.enter('edit_start_message_scene');
    } catch (error) {
        console.error('Edit start message error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

scenes.editStartMessage.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Edit cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { startMessage: ctx.message.text, updatedAt: new Date() } }
        );
        
        await safeSendMessage(ctx, '✅ Start message updated!');
        await ctx.scene.leave();
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Edit start message error:', error);
        await safeSendMessage(ctx, '❌ Failed to update message.');
        await ctx.scene.leave();
    }
});

bot.action('admin_reset_startmessage', async (ctx) => {
    try {
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { startMessage: DEFAULT_CONFIG.startMessage, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery('✅ Start message reset to default');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Reset start message error:', error);
        await ctx.answerCbQuery('❌ Failed to reset message');
    }
});

// ==========================================
// ADMIN FEATURES - MENU IMAGE (FIXED: {name} tag support with option)
// ==========================================

bot.action('admin_menuimage', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentImage = config?.menuImage || DEFAULT_CONFIG.menuImage;
        const overlaySettings = config?.imageOverlaySettings || { menuImage: true };
        const hasOverlay = hasNameVariable(currentImage) || overlaySettings.menuImage;
        
        const text = `<b>🖼️ Menu Image Management</b>\n\nCurrent Image:\n<code>${currentImage}</code>\n\nOverlay: ${hasOverlay ? '✅ ON' : '❌ OFF'}\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit URL', callback_data: 'admin_edit_menuimage_url' }, { text: '📤 Upload', callback_data: 'admin_upload_menuimage' }],
            [{ text: '🔄 Reset', callback_data: 'admin_reset_menuimage' }, { text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Menu image menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action('admin_edit_menuimage_url', async (ctx) => {
    await safeSendMessage(ctx, 'Enter the new image URL:\n\n<i>Use {name} variable for user name overlay (optional)</i>\n\nType "cancel" to cancel.', {
        parse_mode: 'HTML'
    });
    await ctx.scene.enter('edit_menu_image_scene');
});

scenes.editMenuImage.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Edit cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const newUrl = ctx.message.text.trim();
        
        if (!newUrl.startsWith('http')) {
            await safeSendMessage(ctx, '❌ Invalid URL. Must start with http:// or https://');
            return;
        }
        
        // Check if URL is valid image
        const isValid = await isValidImageUrl(newUrl);
        if (!isValid) {
            await safeSendMessage(ctx, '⚠️ The URL does not appear to be a valid image.\n\nDo you still want to use it?', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Yes, use anyway', callback_data: `confirm_bad_url_menu_${encodeURIComponent(newUrl)}` }],
                        [{ text: '❌ No, cancel', callback_data: 'admin_menuimage' }]
                    ]
                }
            });
            return;
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    menuImage: newUrl, 
                    updatedAt: new Date(),
                    'imageOverlaySettings.menuImage': hasNameVariable(newUrl)
                } 
            }
        );
        
        await safeSendMessage(ctx, '✅ Menu image URL updated!');
        await ctx.scene.leave();
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Edit menu image error:', error);
        await safeSendMessage(ctx, '❌ Failed to update image.');
        await ctx.scene.leave();
    }
});

// Handle confirmation for bad URLs
bot.action(/^confirm_bad_url_menu_(.+)$/, async (ctx) => {
    try {
        const url = decodeURIComponent(ctx.match[1]);
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    menuImage: url, 
                    updatedAt: new Date(),
                    'imageOverlaySettings.menuImage': hasNameVariable(url)
                } 
            }
        );
        
        await ctx.deleteMessage().catch(() => {});
        await safeSendMessage(ctx, '✅ Menu image URL updated!');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Confirm bad URL error:', error);
        await safeSendMessage(ctx, '❌ Failed to update image.');
    }
});

bot.action('admin_upload_menuimage', async (ctx) => {
    // Store that we're uploading menu image
    ctx.session.uploadingImageType = 'menuImage';
    await safeSendMessage(ctx, 'Send the image you want to upload:\n\nType "cancel" to cancel.');
    await ctx.scene.enter('image_overlay_scene');
});

bot.action('admin_reset_menuimage', async (ctx) => {
    try {
        await db.collection('admin').updateOne(
            { type: 'config' },
            { 
                $set: { 
                    menuImage: DEFAULT_CONFIG.menuImage, 
                    updatedAt: new Date(),
                    'imageOverlaySettings.menuImage': true
                } 
            }
        );
        
        await ctx.answerCbQuery('✅ Menu image reset to default');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Reset menu image error:', error);
        await ctx.answerCbQuery('❌ Failed to reset image');
    }
});

// ==========================================
// ADMIN FEATURES - MENU MESSAGE (HTML support) - FIXED: Display issue
// ==========================================

bot.action('admin_menumessage', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentMessage = config?.menuMessage || DEFAULT_CONFIG.menuMessage;
        
        // Use formatMessageForDisplay to show message properly
        const displayMessage = formatMessageForDisplay(currentMessage);
        
        const text = `<b>📝 Menu Message Management</b>\n\nCurrent Message:\n<code>${escapeMarkdown(displayMessage)}</code>\n\nAvailable variables: {first_name}, {last_name}, {full_name}, {username}, {name}\n\nSupports HTML formatting\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '✏️ Edit', callback_data: 'admin_edit_menumessage' }, { text: '🔄 Reset', callback_data: 'admin_reset_menumessage' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Menu message menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action('admin_edit_menumessage', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentMessage = config?.menuMessage || DEFAULT_CONFIG.menuMessage;
        
        await safeSendMessage(ctx, `Current message:\n<code>${escapeMarkdown(formatMessageForDisplay(currentMessage))}</code>\n\nEnter the new menu message:\n\n<i>Supports HTML formatting</i>\n\nType "cancel" to cancel.`, {
            parse_mode: 'HTML'
        });
        await ctx.scene.enter('edit_menu_message_scene');
    } catch (error) {
        console.error('Edit menu message error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

scenes.editMenuMessage.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Edit cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { menuMessage: ctx.message.text, updatedAt: new Date() } }
        );
        
        await safeSendMessage(ctx, '✅ Menu message updated!');
        await ctx.scene.leave();
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Edit menu message error:', error);
        await safeSendMessage(ctx, '❌ Failed to update message.');
        await ctx.scene.leave();
    }
});

bot.action('admin_reset_menumessage', async (ctx) => {
    try {
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { menuMessage: DEFAULT_CONFIG.menuMessage, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery('✅ Menu message reset to default');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Reset menu message error:', error);
        await ctx.answerCbQuery('❌ Failed to reset message');
    }
});

// ==========================================
// ADMIN FEATURES - IMAGE OVERLAY SETTINGS
// ==========================================

bot.action('admin_image_overlay', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const overlaySettings = config?.imageOverlaySettings || {
            startImage: true,
            menuImage: true,
            appImages: true
        };
        
        const text = `<b>⚙️ Image Overlay Settings</b>\n\nConfigure whether to show {name} overlay on images:\n\n• Start Image: ${overlaySettings.startImage ? '✅ ON' : '❌ OFF'}\n• Menu Image: ${overlaySettings.menuImage ? '✅ ON' : '❌ OFF'}\n• App Images: ${overlaySettings.appImages ? '✅ ON' : '❌ OFF'}\n\nSelect an option:`;
        
        const keyboard = [
            [
                { text: overlaySettings.startImage ? '✅ Start Image' : '❌ Start Image', callback_data: 'toggle_start_overlay' },
                { text: overlaySettings.menuImage ? '✅ Menu Image' : '❌ Menu Image', callback_data: 'toggle_menu_overlay' }
            ],
            [
                { text: overlaySettings.appImages ? '✅ App Images' : '❌ App Images', callback_data: 'toggle_app_overlay' }
            ],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Image overlay menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Toggle overlay settings
bot.action('toggle_start_overlay', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentSettings = config?.imageOverlaySettings || {
            startImage: true,
            menuImage: true,
            appImages: true
        };
        
        currentSettings.startImage = !currentSettings.startImage;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { imageOverlaySettings: currentSettings, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery(`✅ Start image overlay ${currentSettings.startImage ? 'enabled' : 'disabled'}`);
        await bot.action('admin_image_overlay')(ctx);
    } catch (error) {
        console.error('Toggle start overlay error:', error);
        await ctx.answerCbQuery('❌ Failed to update setting');
    }
});

bot.action('toggle_menu_overlay', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentSettings = config?.imageOverlaySettings || {
            startImage: true,
            menuImage: true,
            appImages: true
        };
        
        currentSettings.menuImage = !currentSettings.menuImage;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { imageOverlaySettings: currentSettings, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery(`✅ Menu image overlay ${currentSettings.menuImage ? 'enabled' : 'disabled'}`);
        await bot.action('admin_image_overlay')(ctx);
    } catch (error) {
        console.error('Toggle menu overlay error:', error);
        await ctx.answerCbQuery('❌ Failed to update setting');
    }
});

bot.action('toggle_app_overlay', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentSettings = config?.imageOverlaySettings || {
            startImage: true,
            menuImage: true,
            appImages: true
        };
        
        currentSettings.appImages = !currentSettings.appImages;
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { imageOverlaySettings: currentSettings, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery(`✅ App image overlay ${currentSettings.appImages ? 'enabled' : 'disabled'}`);
        await bot.action('admin_image_overlay')(ctx);
    } catch (error) {
        console.error('Toggle app overlay error:', error);
        await ctx.answerCbQuery('❌ Failed to update setting');
    }
});

// ==========================================
// ADMIN FEATURES - MANAGE IMAGES
// ==========================================

bot.action('admin_manage_images', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const images = config?.uploadedImages || [];
        
        let text = `<b>🖼️ Manage Uploaded Images</b>\n\n`;
        
        if (images.length === 0) {
            text += `No images uploaded yet.\n`;
        } else {
            text += `Total uploaded images: ${images.length}\n`;
            text += `\n<i>Images not currently in use can be deleted</i>\n`;
        }
        
        const keyboard = [];
        
        if (images.length > 0) {
            keyboard.push([{ text: '🗑️ Delete Unused Images', callback_data: 'delete_unused_images' }]);
            keyboard.push([{ text: '📋 List All Images', callback_data: 'list_all_images' }]);
        }
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Manage images menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action('delete_unused_images', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const images = config?.uploadedImages || [];
        const currentStartImage = config?.startImage;
        const currentMenuImage = config?.menuImage;
        const apps = config?.apps || [];
        
        // Get all images currently in use
        const usedImages = new Set();
        usedImages.add(currentStartImage);
        usedImages.add(currentMenuImage);
        apps.forEach(app => {
            if (app.image && app.image !== 'none') {
                usedImages.add(app.image);
            }
        });
        
        // Find unused images
        const unusedImages = images.filter(img => !usedImages.has(img.url));
        
        if (unusedImages.length === 0) {
            await ctx.answerCbQuery('❌ No unused images found');
            return;
        }
        
        // Delete from Cloudinary
        let deletedCount = 0;
        for (const img of unusedImages) {
            try {
                await cloudinary.uploader.destroy(img.publicId);
                deletedCount++;
            } catch (error) {
                console.error(`Failed to delete image ${img.publicId}:`, error);
            }
        }
        
        // Remove from database
        const updatedImages = images.filter(img => usedImages.has(img.url));
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { uploadedImages: updatedImages, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery(`✅ Deleted ${deletedCount} unused images`);
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Delete unused images error:', error);
        await ctx.answerCbQuery('❌ Failed to delete images');
    }
});

bot.action('list_all_images', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const images = config?.uploadedImages || [];
        
        if (images.length === 0) {
            await ctx.answerCbQuery('❌ No images found');
            return;
        }
        
        let text = `<b>📋 All Uploaded Images</b>\n\n`;
        images.forEach((img, index) => {
            text += `${index + 1}. <code>${img.url}</code>\n`;
            text += `   Type: ${img.type || 'unknown'}\n`;
            text += `   Overlay: ${img.hasOverlay ? '✅ Yes' : '❌ No'}\n`;
            text += `   Uploaded: ${new Date(img.uploadedAt).toLocaleDateString()}\n\n`;
        });
        
        const keyboard = [
            [{ text: '🗑️ Delete Unused', callback_data: 'delete_unused_images' }],
            [{ text: '🔙 Back', callback_data: 'admin_manage_images' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('List images error:', error);
        await ctx.answerCbQuery('❌ Failed to list images');
    }
});

// ==========================================
// ADMIN FEATURES - CODE TIMER
// ==========================================

bot.action('admin_timer', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentTimer = config?.codeTimer || DEFAULT_CONFIG.codeTimer;
        const hours = Math.floor(currentTimer / 3600);
        
        const text = `<b>⏰ Code Timer Settings</b>\n\nCurrent timer: <b>${hours} hours</b>\n\nSelect an option:`;
        
        const keyboard = [
            [{ text: '2 Hours', callback_data: 'timer_2' }, { text: '4 Hours', callback_data: 'timer_4' }],
            [{ text: '6 Hours', callback_data: 'timer_6' }, { text: '12 Hours', callback_data: 'timer_12' }],
            [{ text: '24 Hours', callback_data: 'timer_24' }, { text: '✏️ Custom', callback_data: 'timer_custom' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Timer menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Timer handlers
['2', '4', '6', '12', '24'].forEach(hours => {
    bot.action(`timer_${hours}`, async (ctx) => {
        try {
            const seconds = parseInt(hours) * 3600;
            await db.collection('admin').updateOne(
                { type: 'config' },
                { $set: { codeTimer: seconds, updatedAt: new Date() } }
            );
            
            await ctx.answerCbQuery(`✅ Timer set to ${hours} hours`);
            await showAdminPanel(ctx);
        } catch (error) {
            console.error(`Set timer ${hours} error:`, error);
            await ctx.answerCbQuery('❌ Failed to set timer');
        }
    });
});

bot.action('timer_custom', async (ctx) => {
    await safeSendMessage(ctx, 'Enter timer in hours (e.g., 3 for 3 hours):\n\nType "cancel" to cancel.');
    await ctx.scene.enter('edit_timer_scene');
});

scenes.editTimer.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Edit cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const hours = parseInt(ctx.message.text);
        if (isNaN(hours) || hours < 1) {
            await safeSendMessage(ctx, '❌ Please enter a valid number of hours (minimum 1).');
            return;
        }
        
        const seconds = hours * 3600;
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { codeTimer: seconds, updatedAt: new Date() } }
        );
        
        await safeSendMessage(ctx, `✅ Timer set to ${hours} hours`);
        await ctx.scene.leave();
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Edit timer error:', error);
        await safeSendMessage(ctx, '❌ Failed to set timer.');
        await ctx.scene.leave();
    }
});

// ==========================================
// ADMIN FEATURES - CHANNEL MANAGEMENT (FIXED: Separate public/private)
// ==========================================

bot.action('admin_channels', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        
        let text = '<b>📺 Manage Channels</b>\n\n';
        
        if (channels.length === 0) {
            text += 'No channels added yet.\n';
        } else {
            channels.forEach((channel, index) => {
                const type = channel.type === 'private' ? '🔒' : '🔓';
                text += `${index + 1}. ${type} ${channel.buttonLabel || channel.title} (${channel.type || 'public'})\n`;
            });
        }
        
        text += '\nSelect an option:';
        
        const keyboard = [
            [{ text: '➕ Add Channel', callback_data: 'admin_add_channel' }],
            channels.length > 0 ? [{ text: '🗑️ Delete Channel', callback_data: 'admin_delete_channel' }] : [],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ].filter(row => row.length > 0);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Channels menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Add Channel - Ask for type first
bot.action('admin_add_channel', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const text = '<b>➕ Add Channel</b>\n\nSelect channel type:';
    const keyboard = [
        [{ text: '🔓 Public Channel', callback_data: 'add_public_channel' }],
        [{ text: '🔒 Private Channel', callback_data: 'add_private_channel' }],
        [{ text: '🔙 Back', callback_data: 'admin_channels' }]
    ];
    
    await safeEditMessage(ctx, text, {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Add Public Channel
bot.action('add_public_channel', async (ctx) => {
    await safeSendMessage(ctx, 'Enter channel button name (e.g., "Join Main Channel"):\n\nType "cancel" to cancel.');
    await ctx.scene.enter('add_public_channel_name_scene');
});

scenes.addPublicChannelName.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Add cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        // Store button label in session
        ctx.session.channelData = {
            buttonLabel: ctx.message.text,
            type: 'public'
        };
        
        await safeSendMessage(ctx, 'Now send the channel ID (e.g., @channelusername or -1001234567890):\n\nType "cancel" to cancel.');
        await ctx.scene.leave();
        await ctx.scene.enter('add_public_channel_id_scene');
    } catch (error) {
        console.error('Add public channel name error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
        await ctx.scene.leave();
    }
});

scenes.addPublicChannelId.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Add cancelled.');
            delete ctx.session.channelData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        if (!ctx.session.channelData) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const channelIdentifier = ctx.message.text.trim();
        let channelId, channelTitle;
        
        try {
            // Try to get chat info
            const chat = await ctx.telegram.getChat(channelIdentifier);
            channelId = chat.id;
            channelTitle = chat.title || 'Unknown Channel';
            
            // Check if it's a channel/supergroup
            if (chat.type !== 'channel' && chat.type !== 'supergroup') {
                await safeSendMessage(ctx, '❌ This is not a channel or supergroup.');
                return;
            }
            
        } catch (error) {
            await safeSendMessage(ctx, '❌ Cannot access this channel. Make sure:\n1. The bot is added to the channel\n2. Channel ID is correct\n3. For private channels, use the -100 format');
            return;
        }
        
        ctx.session.channelData.id = channelId;
        ctx.session.channelData.title = channelTitle;
        
        await safeSendMessage(ctx, 'Now send the public channel link (e.g., https://t.me/channelusername):\n\nType "cancel" to cancel.');
        await ctx.scene.leave();
        await ctx.scene.enter('add_public_channel_link_scene');
    } catch (error) {
        console.error('Add public channel ID error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
        await ctx.scene.leave();
    }
});

scenes.addPublicChannelLink.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Add cancelled.');
            delete ctx.session.channelData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        if (!ctx.session.channelData) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const link = ctx.message.text.trim();
        
        // Validate link
        if (!link.startsWith('https://t.me/')) {
            await safeSendMessage(ctx, '❌ Invalid Telegram link. Must start with https://t.me/');
            return;
        }
        
        const channelData = ctx.session.channelData;
        
        // Create channel object
        const newChannel = {
            id: channelData.id,
            title: channelData.title,
            buttonLabel: channelData.buttonLabel,
            link: link,
            type: 'public',
            addedAt: new Date()
        };
        
        // Add to database
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $push: { channels: newChannel } }
        );
        
        await safeSendMessage(ctx, `✅ <b>Public channel added successfully!</b>\n\n• <b>Name:</b> ${channelData.buttonLabel}\n• <b>Title:</b> ${channelData.title}\n• <b>ID:</b> <code>${channelData.id}</code>\n• <b>Link:</b> ${link}`, {
            parse_mode: 'HTML'
        });
        
        // Clear session
        delete ctx.session.channelData;
        
    } catch (error) {
        console.error('Add public channel error:', error);
        await safeSendMessage(ctx, `❌ Error: ${error.message}\n\nPlease try again.`);
        delete ctx.session.channelData;
    }
    
    await ctx.scene.leave();
    await showAdminPanel(ctx);
});

// Add Private Channel
bot.action('add_private_channel', async (ctx) => {
    await safeSendMessage(ctx, 'Enter channel button name (e.g., "Join Private Group"):\n\nType "cancel" to cancel.');
    await ctx.scene.enter('add_private_channel_name_scene');
});

scenes.addPrivateChannelName.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Add cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        // Store button label in session
        ctx.session.channelData = {
            buttonLabel: ctx.message.text,
            type: 'private'
        };
        
        await safeSendMessage(ctx, 'Now send the private channel ID (e.g., -1001234567890):\n\nType "cancel" to cancel.');
        await ctx.scene.leave();
        await ctx.scene.enter('add_private_channel_id_scene');
    } catch (error) {
        console.error('Add private channel name error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
        await ctx.scene.leave();
    }
});

scenes.addPrivateChannelId.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Add cancelled.');
            delete ctx.session.channelData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        if (!ctx.session.channelData) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const channelId = ctx.message.text.trim();
        
        // Validate channel ID format
        if (!channelId.startsWith('-100')) {
            await safeSendMessage(ctx, '❌ Invalid private channel ID. Must start with -100');
            return;
        }
        
        ctx.session.channelData.id = channelId;
        ctx.session.channelData.title = `Private Channel ${channelId}`;
        
        await safeSendMessage(ctx, 'Now send the private channel invite link (e.g., https://t.me/joinchat/xxxxxx):\n\n<i>Note: Bot will automatically accept join requests for this channel</i>\n\nType "cancel" to cancel.', {
            parse_mode: 'HTML'
        });
        await ctx.scene.leave();
        await ctx.scene.enter('add_private_channel_link_scene');
    } catch (error) {
        console.error('Add private channel ID error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
        await ctx.scene.leave();
    }
});

scenes.addPrivateChannelLink.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Add cancelled.');
            delete ctx.session.channelData;
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        if (!ctx.session.channelData) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const link = ctx.message.text.trim();
        
        // Validate link
        if (!link.startsWith('https://t.me/')) {
            await safeSendMessage(ctx, '❌ Invalid Telegram link. Must start with https://t.me/');
            return;
        }
        
        const channelData = ctx.session.channelData;
        
        // Create channel object
        const newChannel = {
            id: channelData.id,
            title: channelData.title,
            buttonLabel: channelData.buttonLabel,
            link: link,
            type: 'private',
            addedAt: new Date()
        };
        
        // Add to database
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $push: { channels: newChannel } }
        );
        
        await safeSendMessage(ctx, `✅ <b>Private channel added successfully!</b>\n\n• <b>Name:</b> ${channelData.buttonLabel}\n• <b>ID:</b> <code>${channelData.id}</code>\n• <b>Link:</b> ${link}\n\n<i>Note: Users will need to join via link. Bot will accept join requests automatically.</i>`, {
            parse_mode: 'HTML'
        });
        
        // Clear session
        delete ctx.session.channelData;
        
    } catch (error) {
        console.error('Add private channel error:', error);
        await safeSendMessage(ctx, `❌ Error: ${error.message}\n\nPlease try again.`);
        delete ctx.session.channelData;
    }
    
    await ctx.scene.leave();
    await showAdminPanel(ctx);
});

// Delete Channel
bot.action('admin_delete_channel', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        
        if (channels.length === 0) {
            await ctx.answerCbQuery('No channels to delete.');
            return;
        }
        
        let text = '<b>🗑️ Delete Channel</b>\n\nSelect a channel to delete:';
        const keyboard = [];
        
        channels.forEach((channel, index) => {
            const type = channel.type === 'private' ? '🔒' : '🔓';
            keyboard.push([{ 
                text: `${index + 1}. ${type} ${channel.buttonLabel || channel.title}`, 
                callback_data: `delete_channel_${channel.id}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_channels' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Delete channel menu error:', error);
        await ctx.answerCbQuery('❌ Failed to load channels');
    }
});

bot.action(/^delete_channel_(.+)$/, async (ctx) => {
    try {
        const channelId = ctx.match[1];
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        
        const newChannels = channels.filter(channel => String(channel.id) !== String(channelId));
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { channels: newChannels, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery('✅ Channel deleted');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Delete channel error:', error);
        await ctx.answerCbQuery('❌ Failed to delete channel');
    }
});

// ==========================================
// ADMIN FEATURES - APP MANAGEMENT (FIXED: {name} tag for app images with option)
// ==========================================

bot.action('admin_apps', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const apps = config?.apps || [];
        
        let text = '<b>📱 Manage Apps</b>\n\n';
        
        if (apps.length === 0) {
            text += 'No apps added yet.\n';
        } else {
            apps.forEach((app, index) => {
                text += `${index + 1}. ${app.name} (${app.codeCount || 1} codes)\n`;
            });
        }
        
        text += '\nSelect an option:';
        
        const keyboard = [
            [{ text: '➕ Add App', callback_data: 'admin_add_app' }],
            apps.length > 0 ? [{ text: '🗑️ Delete App', callback_data: 'admin_delete_app' }] : [],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ].filter(row => row.length > 0);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Apps menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Add App
bot.action('admin_add_app', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    await safeSendMessage(ctx, 'Enter app name (e.g., "WhatsApp Agents"):\n\nType "cancel" to cancel.');
    await ctx.scene.enter('add_app_name_scene');
});

scenes.addAppName.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Add cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        // Store app data in session
        ctx.session.appData = {
            name: ctx.message.text
        };
        
        await safeSendMessage(ctx, 'Send app image URL or photo (or send "none" for no image):\n\nType "cancel" to cancel.');
        await ctx.scene.leave();
        await ctx.scene.enter('add_app_image_scene');
    } catch (error) {
        console.error('Add app name error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
        await ctx.scene.leave();
    }
});

scenes.addAppImage.on(['text', 'photo'], async (ctx) => {
    try {
        if (!ctx.session.appData) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        if (ctx.message.text && ctx.message.text.toLowerCase() === 'none') {
            ctx.session.appData.image = 'none';
        } else if (ctx.message.photo) {
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            const fileLink = await ctx.telegram.getFileLink(photo.file_id);
            const response = await fetch(fileLink);
            
            if (!response.ok) throw new Error('Failed to fetch image');
            
            const buffer = await response.buffer();
            
            // Upload to Cloudinary
            const result = await uploadToCloudinary(buffer, 'app_images');
            
            let cloudinaryUrl = result.secure_url;
            
            // Check overlay settings
            const config = await db.collection('admin').findOne({ type: 'config' });
            const overlaySettings = config?.imageOverlaySettings || { appImages: true };
            
            if (overlaySettings.appImages) {
                cloudinaryUrl = cloudinaryUrl.replace('/upload/', '/upload/l_text:Stalinist%20One_140_bold:{name},co_rgb:00e5ff,g_center/');
            }
            
            ctx.session.appData.image = cloudinaryUrl;
            ctx.session.appData.cloudinaryId = result.public_id;
            ctx.session.appData.hasOverlay = overlaySettings.appImages;
            
            // Store uploaded image info
            await db.collection('admin').updateOne(
                { type: 'config' },
                { 
                    $push: { 
                        uploadedImages: {
                            url: cloudinaryUrl,
                            publicId: result.public_id,
                            type: 'app_image',
                            hasOverlay: overlaySettings.appImages,
                            uploadedAt: new Date(),
                            appName: ctx.session.appData.name
                        }
                    }
                }
            );
        } else if (ctx.message.text) {
            const url = ctx.message.text.trim();
            
            // Check if URL is valid image
            const isValid = await isValidImageUrl(url);
            if (!isValid) {
                await safeSendMessage(ctx, '⚠️ The URL does not appear to be a valid image.\n\nDo you still want to use it?', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Yes, use anyway', callback_data: `confirm_bad_url_app_${encodeURIComponent(url)}` }],
                            [{ text: '❌ No, cancel', callback_data: 'admin_apps' }]
                        ]
                    }
                });
                return;
            }
            
            ctx.session.appData.image = url;
            ctx.session.appData.hasOverlay = hasNameVariable(url);
        } else {
            await safeSendMessage(ctx, '❌ Please send an image or "none".');
            return;
        }
        
        await safeSendMessage(ctx, 'How many codes to generate? (1-10):');
        await ctx.scene.leave();
        await ctx.scene.enter('add_app_code_count_scene');
    } catch (error) {
        console.error('Add app image error:', error);
        await safeSendMessage(ctx, '❌ Failed to process image. Please try again.');
        await ctx.scene.leave();
    }
});

// Handle confirmation for bad app image URLs
bot.action(/^confirm_bad_url_app_(.+)$/, async (ctx) => {
    try {
        const url = decodeURIComponent(ctx.match[1]);
        
        if (ctx.session.appData) {
            ctx.session.appData.image = url;
            ctx.session.appData.hasOverlay = hasNameVariable(url);
            
            await ctx.deleteMessage().catch(() => {});
            await safeSendMessage(ctx, 'How many codes to generate? (1-10):');
            await ctx.scene.enter('add_app_code_count_scene');
        }
    } catch (error) {
        console.error('Confirm bad app URL error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

scenes.addAppCodeCount.on('text', async (ctx) => {
    try {
        if (!ctx.session.appData) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const count = parseInt(ctx.message.text);
        if (isNaN(count) || count < 1 || count > 10) {
            await safeSendMessage(ctx, '❌ Please enter a number between 1 and 10.');
            return;
        }
        
        ctx.session.appData.codeCount = count;
        
        await safeSendMessage(ctx, 'Enter prefixes for each code (separated by commas):\nExample: XY,AB,CD\nLeave empty for no prefixes.');
        await ctx.scene.leave();
        await ctx.scene.enter('add_app_code_prefixes_scene');
    } catch (error) {
        console.error('Add app code count error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
        await ctx.scene.leave();
    }
});

scenes.addAppCodePrefixes.on('text', async (ctx) => {
    try {
        if (!ctx.session.appData) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const prefixes = ctx.message.text.split(',').map(p => p.trim()).filter(p => p);
        ctx.session.appData.codePrefixes = prefixes;
        
        await safeSendMessage(ctx, 'Enter code lengths for each code (separated by commas, min 6):\nExample: 8,10,12\nDefault is 8 for all codes.');
        await ctx.scene.leave();
        await ctx.scene.enter('add_app_code_lengths_scene');
    } catch (error) {
        console.error('Add app prefixes error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
        await ctx.scene.leave();
    }
});

scenes.addAppCodeLengths.on('text', async (ctx) => {
    try {
        if (!ctx.session.appData) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const lengths = ctx.message.text.split(',').map(l => parseInt(l.trim())).filter(l => !isNaN(l) && l >= 6);
        ctx.session.appData.codeLengths = lengths;
        
        await safeSendMessage(ctx, 'Enter the code message template:\n\n<b>Available variables:</b>\n{first_name}, {last_name}, {full_name}, {username}, {name}\n{app_name}, {button_name}\n{code1}, {code2}, ... {code10}\n\n<i>Supports HTML formatting</i>\n\nExample: "Your codes for {app_name} are:\n{code1}\n{code2}"', {
            parse_mode: 'HTML'
        });
        await ctx.scene.leave();
        await ctx.scene.enter('add_app_code_message_scene');
    } catch (error) {
        console.error('Add app lengths error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
        await ctx.scene.leave();
    }
});

scenes.addAppCodeMessage.on('text', async (ctx) => {
    try {
        if (!ctx.session.appData) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const appData = ctx.session.appData;
        
        // Create app object
        const app = {
            id: `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: appData.name,
            image: appData.image || 'none',
            codeCount: appData.codeCount || 1,
            codePrefixes: appData.codePrefixes || [],
            codeLengths: appData.codeLengths || Array(appData.codeCount || 1).fill(8),
            codeMessage: ctx.message.text || 'Your code: {code1}',
            cloudinaryId: appData.cloudinaryId,
            hasOverlay: appData.hasOverlay || false,
            createdAt: new Date()
        };
        
        // Ensure arrays have correct length
        while (app.codePrefixes.length < app.codeCount) {
            app.codePrefixes.push('');
        }
        
        while (app.codeLengths.length < app.codeCount) {
            app.codeLengths.push(8);
        }
        
        // Add to database
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $push: { apps: app } }
        );
        
        await safeSendMessage(ctx, `✅ <b>App "${app.name}" added successfully!</b>\n\n• <b>Codes:</b> ${app.codeCount}\n• <b>Image:</b> ${app.image === 'none' ? 'None' : 'Set'}\n• <b>Overlay:</b> ${app.hasOverlay ? 'Yes' : 'No'}\n• <b>Prefixes:</b> ${app.codePrefixes.filter(p => p).join(', ') || 'None'}\n• <b>Lengths:</b> ${app.codeLengths.join(', ')}`, {
            parse_mode: 'HTML'
        });
        
        // Clear session
        delete ctx.session.appData;
        
    } catch (error) {
        console.error('Add app message error:', error);
        await safeSendMessage(ctx, '❌ Failed to add app. Please try again.');
    }
    
    await ctx.scene.leave();
    await showAdminPanel(ctx);
});

// Delete App
bot.action('admin_delete_app', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const apps = config?.apps || [];
        
        if (apps.length === 0) {
            await ctx.answerCbQuery('No apps to delete.');
            return;
        }
        
        let text = '<b>🗑️ Delete App</b>\n\nSelect an app to delete:';
        const keyboard = [];
        
        apps.forEach((app, index) => {
            keyboard.push([{ 
                text: `${index + 1}. ${app.name}`, 
                callback_data: `delete_app_${app.id}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_apps' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Delete app menu error:', error);
        await ctx.answerCbQuery('❌ Failed to load apps');
    }
});

bot.action(/^delete_app_(.+)$/, async (ctx) => {
    try {
        const appId = ctx.match[1];
        const config = await db.collection('admin').findOne({ type: 'config' });
        const apps = config?.apps || [];
        
        // Find app to get cloudinary ID
        const appToDelete = apps.find(app => app.id === appId);
        
        // Delete from Cloudinary if exists
        if (appToDelete?.cloudinaryId) {
            try {
                await cloudinary.uploader.destroy(appToDelete.cloudinaryId);
                
                // Remove from uploaded images
                await db.collection('admin').updateOne(
                    { type: 'config' },
                    { $pull: { uploadedImages: { publicId: appToDelete.cloudinaryId } } }
                );
            } catch (error) {
                console.error('Failed to delete from Cloudinary:', error);
            }
        }
        
        const newApps = apps.filter(app => app.id !== appId);
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { apps: newApps, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery('✅ App deleted');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Delete app error:', error);
        await ctx.answerCbQuery('❌ Failed to delete app');
    }
});

// ==========================================
// ADMIN FEATURES - MANAGE ADMINS
// ==========================================

bot.action('admin_manage_admins', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const admins = config?.admins || ADMIN_IDS;
        
        let text = '<b>👑 Manage Admins</b>\n\nCurrent Admins:\n';
        
        admins.forEach((adminId, index) => {
            text += `${index + 1}. <code>${adminId}</code>\n`;
        });
        
        text += '\nSelect an option:';
        
        const keyboard = [
            [{ text: '➕ Add Admin', callback_data: 'admin_add_admin' }, { text: '🗑️ Remove Admin', callback_data: 'admin_remove_admin' }],
            [{ text: '🔙 Back', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Manage admins menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Add Admin
bot.action('admin_add_admin', async (ctx) => {
    await safeSendMessage(ctx, 'Send the user ID of the new admin:\n\nType "cancel" to cancel.');
    await ctx.scene.enter('add_admin_scene');
});

scenes.addAdmin.on('text', async (ctx) => {
    try {
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Add cancelled.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const newAdminId = parseInt(ctx.message.text);
        if (isNaN(newAdminId)) {
            await safeSendMessage(ctx, '❌ Invalid user ID. Please enter a numeric ID.');
            return;
        }
        
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentAdmins = config?.admins || ADMIN_IDS;
        
        if (currentAdmins.includes(newAdminId)) {
            await safeSendMessage(ctx, '❌ This user is already an admin.');
            await ctx.scene.leave();
            await showAdminPanel(ctx);
            return;
        }
        
        const updatedAdmins = [...currentAdmins, newAdminId];
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { admins: updatedAdmins, updatedAt: new Date() } }
        );
        
        await safeSendMessage(ctx, `✅ Admin added successfully!\n\nNew admin ID: <code>${newAdminId}</code>`, {
            parse_mode: 'HTML'
        });
        
    } catch (error) {
        console.error('Add admin error:', error);
        await safeSendMessage(ctx, '❌ Failed to add admin.');
    }
    
    await ctx.scene.leave();
    await showAdminPanel(ctx);
});

// Remove Admin
bot.action('admin_remove_admin', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const admins = config?.admins || ADMIN_IDS;
        
        if (admins.length <= 1) {
            await ctx.answerCbQuery('❌ Cannot remove last admin.');
            return;
        }
        
        let text = '<b>🗑️ Remove Admin</b>\n\nSelect an admin to remove:';
        const keyboard = [];
        
        admins.forEach((adminId, index) => {
            // Don't allow removing yourself
            if (String(adminId) !== String(ctx.from.id)) {
                keyboard.push([{ 
                    text: `${index + 1}. ${adminId}`, 
                    callback_data: `remove_admin_${adminId}` 
                }]);
            }
        });
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_manage_admins' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Remove admin menu error:', error);
        await ctx.answerCbQuery('❌ Failed to load admins');
    }
});

bot.action(/^remove_admin_(.+)$/, async (ctx) => {
    try {
        const adminId = parseInt(ctx.match[1]);
        
        // Prevent removing yourself
        if (String(adminId) === String(ctx.from.id)) {
            await ctx.answerCbQuery('❌ Cannot remove yourself.');
            return;
        }
        
        const config = await db.collection('admin').findOne({ type: 'config' });
        const currentAdmins = config?.admins || ADMIN_IDS;
        
        const updatedAdmins = currentAdmins.filter(id => id !== adminId);
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { admins: updatedAdmins, updatedAt: new Date() } }
        );
        
        await ctx.answerCbQuery('✅ Admin removed');
        await showAdminPanel(ctx);
    } catch (error) {
        console.error('Remove admin error:', error);
        await ctx.answerCbQuery('❌ Failed to remove admin');
    }
});

// ==========================================
// ADMIN FEATURES - DELETE DATA
// ==========================================

bot.action('admin_deletedata', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    const text = '<b>⚠️ DANGER ZONE - DATA DELETION</b>\n\nSelect what you want to delete:\n\n<b>WARNING: These actions cannot be undone!</b>';
    
    const keyboard = [
        [{ text: '🗑️ Delete All Users', callback_data: 'delete_all_users' }, { text: '🗑️ Delete All Channels', callback_data: 'delete_all_channels' }],
        [{ text: '🗑️ Delete All Apps', callback_data: 'delete_all_apps' }, { text: '🔥 DELETE EVERYTHING', callback_data: 'delete_everything' }],
        [{ text: '🔙 Back', callback_data: 'admin_back' }]
    ];
    
    await safeEditMessage(ctx, text, {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Delete All Users
bot.action('delete_all_users', async (ctx) => {
    const keyboard = [
        [{ text: '✅ YES, DELETE ALL USERS', callback_data: 'confirm_delete_users' }],
        [{ text: '❌ NO, CANCEL', callback_data: 'admin_deletedata' }]
    ];
    
    await safeEditMessage(ctx,
        '<b>⚠️ CONFIRMATION REQUIRED</b>\n\nAre you sure you want to delete ALL users?\n\nThis will remove all user data.\n\n<b>This action cannot be undone!</b>',
        {
            reply_markup: { inline_keyboard: keyboard }
        }
    );
});

bot.action('confirm_delete_users', async (ctx) => {
    try {
        const result = await db.collection('users').deleteMany({});
        await safeEditMessage(ctx, `✅ Deleted ${result.deletedCount} users.`, {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    } catch (error) {
        console.error('Delete users error:', error);
        await safeEditMessage(ctx, '❌ Failed to delete users.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    }
});

// Delete All Channels
bot.action('delete_all_channels', async (ctx) => {
    const keyboard = [
        [{ text: '✅ YES, DELETE ALL CHANNELS', callback_data: 'confirm_delete_channels' }],
        [{ text: '❌ NO, CANCEL', callback_data: 'admin_deletedata' }]
    ];
    
    await safeEditMessage(ctx,
        '<b>⚠️ CONFIRMATION REQUIRED</b>\n\nAre you sure you want to delete ALL channels?\n\nThis will remove all channel data.\n\n<b>This action cannot be undone!</b>',
        {
            reply_markup: { inline_keyboard: keyboard }
        }
    );
});

bot.action('confirm_delete_channels', async (ctx) => {
    try {
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { channels: [], updatedAt: new Date() } }
        );
        
        await safeEditMessage(ctx, '✅ All channels deleted.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    } catch (error) {
        console.error('Delete channels error:', error);
        await safeEditMessage(ctx, '❌ Failed to delete channels.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    }
});

// Delete All Apps
bot.action('delete_all_apps', async (ctx) => {
    const keyboard = [
        [{ text: '✅ YES, DELETE ALL APPS', callback_data: 'confirm_delete_apps' }],
        [{ text: '❌ NO, CANCEL', callback_data: 'admin_deletedata' }]
    ];
    
    await safeEditMessage(ctx,
        '<b>⚠️ CONFIRMATION REQUIRED</b>\n\nAre you sure you want to delete ALL apps?\n\nThis will remove all app data.\n\n<b>This action cannot be undone!</b>',
        {
            reply_markup: { inline_keyboard: keyboard }
        }
    );
});

bot.action('confirm_delete_apps', async (ctx) => {
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const apps = config?.apps || [];
        
        // Delete images from Cloudinary
        for (const app of apps) {
            if (app.cloudinaryId) {
                try {
                    await cloudinary.uploader.destroy(app.cloudinaryId);
                    
                    // Remove from uploaded images
                    await db.collection('admin').updateOne(
                        { type: 'config' },
                        { $pull: { uploadedImages: { publicId: app.cloudinaryId } } }
                    );
                } catch (error) {
                    console.error('Failed to delete image:', error);
                }
            }
        }
        
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { apps: [], updatedAt: new Date() } }
        );
        
        await safeEditMessage(ctx, '✅ All apps deleted.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    } catch (error) {
        console.error('Delete apps error:', error);
        await safeEditMessage(ctx, '❌ Failed to delete apps.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    }
});

// Delete Everything
bot.action('delete_everything', async (ctx) => {
    const keyboard = [
        [{ text: '🔥 YES, DELETE EVERYTHING', callback_data: 'confirm_delete_everything' }],
        [{ text: '❌ NO, CANCEL', callback_data: 'admin_deletedata' }]
    ];
    
    await safeEditMessage(ctx,
        '<b>🚨 EXTREME DANGER</b>\n\nAre you absolutely sure you want to DELETE EVERYTHING?\n\nThis will remove ALL data and reset the bot.\n\n<b>COMPLETE RESET - IRREVERSIBLE!</b>',
        {
            reply_markup: { inline_keyboard: keyboard }
        }
    );
});

bot.action('confirm_delete_everything', async (ctx) => {
    try {
        // Delete users
        await db.collection('users').deleteMany({});
        
        // Delete config
        await db.collection('admin').deleteOne({ type: 'config' });
        
        // Reinitialize
        await initBot();
        
        await safeEditMessage(ctx, '<b>🔥 COMPLETE RESET DONE!</b>\n\nBot has been reset to factory settings.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    } catch (error) {
        console.error('Delete everything error:', error);
        await safeEditMessage(ctx, '❌ Failed to reset bot.', {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]]
            }
        });
    }
});

// ==========================================
// ERROR HANDLING - FIXED: Better error reporting
// ==========================================

bot.catch((error, ctx) => {
    console.error('Bot error:', error);
    
    // Store error for reporting
    if (ctx.session) {
        ctx.session.lastError = {
            command: ctx.message?.text || 'Unknown',
            error: error.message,
            stack: error.stack
        };
    }
    
    try {
        if (ctx.message) {
            safeSendMessage(ctx, '❌ An error occurred.', {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '📞 Contact Admin', callback_data: 'contact_admin' },
                        { text: '🔄 Try Again', callback_data: 'back_to_start' }
                    ]]
                }
            });
        }
    } catch (e) {
        console.error('Error in error handler:', e);
    }
});

// ==========================================
// START BOT
// ==========================================

async function startBot() {
    try {
        // Connect to database
        const dbConnected = await connectDB();
        if (!dbConnected) {
            console.error('❌ Failed to connect to database');
            process.exit(1);
        }
        
        // Initialize bot settings
        await initBot();
        
        // Start bot
        await bot.launch();
        console.log('🤖 Bot is running...');
        
        // Enable graceful stop
        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));
        
    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        process.exit(1);
    }
}

// Handle Railway port binding
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV === 'production') {
    const express = require('express');
    const app = express();
    
    app.get('/', (req, res) => {
        res.send('Telegram Bot is running!');
    });
    
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        startBot();
    });
} else {
    startBot();
}

console.log('Bot Starting...');
