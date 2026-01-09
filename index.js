
// ==========================================
// ADMIN FEATURES - EDIT CHANNELS
// ==========================================

bot.action('admin_edit_channels', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        
        if (channels.length === 0) {
            await safeSendMessage(ctx, '❌ No channels to edit.');
            return;
        }
        
        let text = '<b>✏️ Edit Channels</b>\n\n';
        text += 'Select a channel to edit:\n\n';
        
        const keyboard = [];
        
        channels.forEach((channel, index) => {
            const type = channel.type === 'private' ? '🔒' : '🔓';
            keyboard.push([{ 
                text: `${index + 1}. ${type} ${channel.buttonLabel || channel.title}`, 
                callback_data: `edit_channel_select_${index}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Edit channels menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action(/^edit_channel_select_(\d+)$/, async (ctx) => {
    try {
        const selectedIndex = parseInt(ctx.match[1]);
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = config?.channels || [];
        
        if (selectedIndex < 0 || selectedIndex >= channels.length) {
            await ctx.answerCbQuery('❌ Invalid selection');
            return;
        }
        
        const channel = channels[selectedIndex];
        
        // Store channel info in session
        ctx.session.editChannel = {
            index: selectedIndex,
            channel: channel
        };
        
        // Display channel details
        let text = '<b>✏️ Edit Channel</b>\n\n';
        text += '<b>Channel Details:</b>\n';
        text += `• <b>Button Name:</b> ${channel.buttonLabel || channel.title}\n`;
        text += `• <b>Channel ID:</b> <code>${channel.id}</code>\n`;
        text += `• <b>Link:</b> ${channel.link}\n`;
        text += `• <b>Type:</b> ${channel.type === 'private' ? '🔒 Private' : '🔓 Public'}\n`;
        if (channel.type === 'private') {
            const autoAccept = channel.autoAccept !== false; // Default true
            text += `• <b>Auto Accept:</b> ${autoAccept ? '✅ Enabled' : '❌ Disabled'}\n`;
        }
        text += `• <b>Title:</b> ${channel.title}\n`;
        text += `• <b>Added:</b> ${new Date(channel.addedAt).toLocaleDateString()}\n`;
        
        const keyboard = [
            [{ text: '✏️ Change Button Name', callback_data: 'edit_channel_name' }],
            [{ text: '🔗 Change Link', callback_data: 'edit_channel_link' }],
            [{ text: '🆔 Change Channel ID', callback_data: 'edit_channel_id' }]
        ];

        // Add auto accept toggle for private channels
        if (channel.type === 'private') {
            const autoAccept = channel.autoAccept !== false; // Default true
            keyboard.push([{ 
                text: autoAccept ? '✅ Auto Accept: ON' : '❌ Auto Accept: OFF', 
                callback_data: 'edit_channel_auto_accept' 
            }]);
        }

        keyboard.push(
            [{ text: '🔙 Back to Channels', callback_data: 'admin_edit_channels' }],
            [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
        );
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML'
        });
        
    } catch (error) {
        console.error('Select channel for edit error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Edit channel name
bot.action('edit_channel_name', async (ctx) => {
    try {
        if (!ctx.session.editChannel) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            return;
        }
        
        const channel = ctx.session.editChannel.channel;
        
        await safeSendMessage(ctx, `Current button name: <b>${channel.buttonLabel || channel.title}</b>\n\nEnter new button name:\n\nType "cancel" to cancel.`, {
            parse_mode: 'HTML'
        });
        
        // Enter scene for editing name
        await ctx.scene.enter('edit_channel_details_scene');
        
    } catch (error) {
        console.error('Edit channel name error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Edit channel link
bot.action('edit_channel_link', async (ctx) => {
    try {
        if (!ctx.session.editChannel) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            return;
        }
        
        const channel = ctx.session.editChannel.channel;
        
        await safeSendMessage(ctx, `Current link: <code>${channel.link}</code>\n\nEnter new channel link:\n\n<i>Must start with https://t.me/</i>\n\nType "cancel" to cancel.`, {
            parse_mode: 'HTML'
        });
        
        // Set editing mode in session
        ctx.session.editChannel.mode = 'link';
        await ctx.scene.enter('edit_channel_details_scene');
        
    } catch (error) {
        console.error('Edit channel link error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Edit channel ID
bot.action('edit_channel_id', async (ctx) => {
    try {
        if (!ctx.session.editChannel) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            return;
        }
        
        const channel = ctx.session.editChannel.channel;
        
        await safeSendMessage(ctx, `Current channel ID: <code>${channel.id}</code>\n\nEnter new channel ID:\n\n<i>Format: @username or -1001234567890</i>\n\nType "cancel" to cancel.`, {
            parse_mode: 'HTML'
        });
        
        // Set editing mode in session
        ctx.session.editChannel.mode = 'id';
        await ctx.scene.enter('edit_channel_details_scene');
        
    } catch (error) {
        console.error('Edit channel ID error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Edit channel auto accept
bot.action('edit_channel_auto_accept', async (ctx) => {
    try {
        if (!ctx.session.editChannel) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            return;
        }
        
        const channelIndex = ctx.session.editChannel.index;
        const channel = ctx.session.editChannel.channel;
        
        if (channel.type !== 'private') {
            await ctx.answerCbQuery('❌ Only private channels have auto accept');
            return;
        }
        
        const currentSetting = channel.autoAccept !== false; // Default true
        const newSetting = !currentSetting;
        
        // Get current config
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = [...config.channels];
        
        // Update channel
        channels[channelIndex].autoAccept = newSetting;
        
        // Save to database
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { channels: channels, updatedAt: new Date() } }
        );
        
        // Update session
        ctx.session.editChannel.channel = channels[channelIndex];
        
        await ctx.answerCbQuery(`✅ Auto accept ${newSetting ? 'enabled' : 'disabled'}`);
        
        // Refresh the edit view
        await bot.action(`edit_channel_select_${channelIndex}`)(ctx);
        
    } catch (error) {
        console.error('Edit channel auto accept error:', error);
        await ctx.answerCbQuery('❌ Failed to update');
    }
});

// Handle channel edits
scenes.editChannelDetails.on('text', async (ctx) => {
    try {
        if (!ctx.session.editChannel) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            return;
        }
        
        if (ctx.message.text.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Edit cancelled.');
            delete ctx.session.editChannel.mode;
            await ctx.scene.leave();
            await bot.action('admin_edit_channels')(ctx);
            return;
        }
        
        const channelIndex = ctx.session.editChannel.index;
        const oldChannel = ctx.session.editChannel.channel;
        const editingMode = ctx.session.editChannel.mode || 'name';
        const newValue = ctx.message.text.trim();
        
        // Get current config
        const config = await db.collection('admin').findOne({ type: 'config' });
        const channels = [...config.channels];
        const channelToUpdate = { ...channels[channelIndex] };
        
        let updateMessage = '';
        
        if (editingMode === 'name') {
            // Update button name
            channelToUpdate.buttonLabel = newValue;
            updateMessage = `✅ Button name updated to: <b>${newValue}</b>`;
            
        } else if (editingMode === 'link') {
            // Update link and detect type
            if (!newValue.startsWith('https://t.me/')) {
                await safeSendMessage(ctx, '❌ Invalid link. Must start with https://t.me/');
                return;
            }
            
            channelToUpdate.link = newValue;
            
            // Try to detect if it's a private channel link
            if (newValue.includes('joinchat/') || newValue.includes('+')) {
                channelToUpdate.type = 'private';
            } else {
                channelToUpdate.type = 'public';
            }
            
            updateMessage = `✅ Link updated to: <code>${newValue}</code>\n\nType detected as: ${channelToUpdate.type === 'private' ? '🔒 Private' : '🔓 Public'}`;
            
        } else if (editingMode === 'id') {
            // Update channel ID and try to get info
            try {
                const chat = await ctx.telegram.getChat(newValue);
                channelToUpdate.id = chat.id;
                channelToUpdate.title = chat.title || 'Unknown Channel';
                
                // Check type
                if (chat.type === 'channel' || chat.type === 'supergroup') {
                    if (String(chat.id).startsWith('-100')) {
                        channelToUpdate.type = 'private';
                    } else {
                        channelToUpdate.type = 'public';
                    }
                }
                
                updateMessage = `✅ Channel ID updated to: <code>${chat.id}</code>\n\nTitle: ${chat.title || 'Unknown'}\nType: ${channelToUpdate.type === 'private' ? '🔒 Private' : '🔓 Public'}`;
                
            } catch (error) {
                await safeSendMessage(ctx, '❌ Cannot access this channel. Make sure:\n1. The bot is added to the channel\n2. Channel ID is correct');
                return;
            }
        }
        
        // Update the channel in array
        channels[channelIndex] = channelToUpdate;
        
        // Save to database
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { channels: channels, updatedAt: new Date() } }
        );
        
        // Update session with new channel data
        ctx.session.editChannel.channel = channelToUpdate;
        delete ctx.session.editChannel.mode;
        
        await safeSendMessage(ctx, updateMessage, {
            parse_mode: 'HTML'
        });
        
        await ctx.scene.leave();
        
        // Return to edit view
        setTimeout(async () => {
            await bot.action(`edit_channel_select_${channelIndex}`)(ctx);
        }, 1000);
        
    } catch (error) {
        console.error('Edit channel details error:', error);
        await safeSendMessage(ctx, '❌ Failed to update channel.');
        await ctx.scene.leave();
    }
});

// ==========================================
// ADMIN FEATURES - EDIT APPS
// ==========================================

bot.action('admin_edit_apps', async (ctx) => {
    if (!await isAdmin(ctx.from.id)) return;
    
    try {
        const config = await db.collection('admin').findOne({ type: 'config' });
        const apps = config?.apps || [];
        
        if (apps.length === 0) {
            await safeSendMessage(ctx, '❌ No apps to edit.');
            return;
        }
        
        let text = '<b>✏️ Edit Apps</b>\n\n';
        text += 'Select an app to edit:\n\n';
        
        const keyboard = [];
        
        apps.forEach((app, index) => {
            keyboard.push([{ 
                text: `${index + 1}. ${app.name}`, 
                callback_data: `edit_app_select_${index}` 
            }]);
        });
        
        keyboard.push([{ text: '🔙 Back', callback_data: 'admin_back' }]);
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Edit apps menu error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

bot.action(/^edit_app_select_(\d+)$/, async (ctx) => {
    try {
        const selectedIndex = parseInt(ctx.match[1]);
        const config = await db.collection('admin').findOne({ type: 'config' });
        const apps = config?.apps || [];
        
        if (selectedIndex < 0 || selectedIndex >= apps.length) {
            await ctx.answerCbQuery('❌ Invalid selection');
            return;
        }
        
        const app = apps[selectedIndex];
        
        // Store app info in session
        ctx.session.editApp = {
            index: selectedIndex,
            app: app
        };
        
        // Display app details
        let text = '<b>✏️ Edit App</b>\n\n';
        text += '<b>App Details:</b>\n';
        text += `• <b>Name:</b> ${app.name}\n`;
        text += `• <b>Code Count:</b> ${app.codeCount || 1}\n`;
        text += `• <b>Prefix:</b> ${app.codePrefixes?.[0] || 'None'}\n`;
        text += `• <b>Code Length:</b> ${app.codeLengths?.[0] || 8}\n`;
        text += `• <b>Image:</b> ${app.image === 'none' ? 'None' : 'Set'}\n`;
        text += `• <b>Overlay:</b> ${app.hasOverlay ? 'Yes' : 'No'}\n`;
        text += `• <b>Created:</b> ${new Date(app.createdAt).toLocaleDateString()}\n`;
        
        const keyboard = [
            [{ text: '✏️ Change Name', callback_data: 'edit_app_name' }],
            [{ text: '🖼️ Change Logo', callback_data: 'edit_app_logo' }],
            [{ text: '🔤 Change Prefix', callback_data: 'edit_app_prefix' }],
            [{ text: '🔢 Change Code Length', callback_data: 'edit_app_length' }],
            [{ text: '🔢 Change Code Count', callback_data: 'edit_app_count' }],
            [{ text: '🔙 Back to Apps', callback_data: 'admin_edit_apps' }],
            [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
        ];
        
        await safeEditMessage(ctx, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'HTML'
        });
        
    } catch (error) {
        console.error('Select app for edit error:', error);
        await ctx.answerCbQuery('❌ Error');
    }
});

// Edit app name
bot.action('edit_app_name', async (ctx) => {
    try {
        if (!ctx.session.editApp) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            return;
        }
        
        const app = ctx.session.editApp.app;
        
        await safeSendMessage(ctx, `Current app name: <b>${app.name}</b>\n\nEnter new app name:\n\nType "cancel" to cancel.`, {
            parse_mode: 'HTML'
        });
        
        // Set editing mode
        ctx.session.editApp.mode = 'name';
        await ctx.scene.enter('edit_app_details_scene');
        
    } catch (error) {
        console.error('Edit app name error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Edit app logo
bot.action('edit_app_logo', async (ctx) => {
    try {
        if (!ctx.session.editApp) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            return;
        }
        
        const app = ctx.session.editApp.app;
        
        await safeSendMessage(ctx, `Current logo: ${app.image === 'none' ? 'None' : 'Set'}\n\nSend new image URL or photo (or send "none" for no image):\n\nType "cancel" to cancel.`);
        
        // Set editing mode
        ctx.session.editApp.mode = 'logo';
        await ctx.scene.enter('edit_app_details_scene');
        
    } catch (error) {
        console.error('Edit app logo error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Edit app prefix
bot.action('edit_app_prefix', async (ctx) => {
    try {
        if (!ctx.session.editApp) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            return;
        }
        
        const app = ctx.session.editApp.app;
        
        await safeSendMessage(ctx, `Current prefix: <b>${app.codePrefixes?.[0] || 'None'}</b>\n\nEnter new prefix (or "none" to remove prefix):\n\n<i>All codes will use this single prefix</i>\n\nType "cancel" to cancel.`, {
            parse_mode: 'HTML'
        });
        
        // Set editing mode
        ctx.session.editApp.mode = 'prefix';
        await ctx.scene.enter('edit_app_details_scene');
        
    } catch (error) {
        console.error('Edit app prefix error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Edit app code length
bot.action('edit_app_length', async (ctx) => {
    try {
        if (!ctx.session.editApp) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            return;
        }
        
        const app = ctx.session.editApp.app;
        
        await safeSendMessage(ctx, `Current code length: <b>${app.codeLengths?.[0] || 8}</b>\n\nEnter new code length (minimum 6):\n\n<i>All codes will use this length</i>\n\nType "cancel" to cancel.`, {
            parse_mode: 'HTML'
        });
        
        // Set editing mode
        ctx.session.editApp.mode = 'length';
        await ctx.scene.enter('edit_app_details_scene');
        
    } catch (error) {
        console.error('Edit app length error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Edit app code count
bot.action('edit_app_count', async (ctx) => {
    try {
        if (!ctx.session.editApp) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            return;
        }
        
        const app = ctx.session.editApp.app;
        
        await safeSendMessage(ctx, `Current code count: <b>${app.codeCount || 1}</b>\n\nEnter new code count (1-10):\n\nType "cancel" to cancel.`, {
            parse_mode: 'HTML'
        });
        
        // Set editing mode
        ctx.session.editApp.mode = 'count';
        await ctx.scene.enter('edit_app_details_scene');
        
    } catch (error) {
        console.error('Edit app count error:', error);
        await safeSendMessage(ctx, '❌ An error occurred.');
    }
});

// Handle app edits
scenes.editAppDetails.on(['text', 'photo'], async (ctx) => {
    try {
        if (!ctx.session.editApp) {
            await safeSendMessage(ctx, '❌ Session expired. Please start again.');
            await ctx.scene.leave();
            return;
        }
        
        if (ctx.message.text?.toLowerCase() === 'cancel') {
            await safeSendMessage(ctx, '❌ Edit cancelled.');
            delete ctx.session.editApp.mode;
            await ctx.scene.leave();
            await bot.action('admin_edit_apps')(ctx);
            return;
        }
        
        const appIndex = ctx.session.editApp.index;
        const oldApp = ctx.session.editApp.app;
        const editingMode = ctx.session.editApp.mode;
        
        // Get current config
        const config = await db.collection('admin').findOne({ type: 'config' });
        const apps = [...config.apps];
        const appToUpdate = { ...apps[appIndex] };
        
        let updateMessage = '';
        
        if (editingMode === 'name') {
            // Update app name
            const newName = ctx.message.text.trim();
            appToUpdate.name = newName;
            updateMessage = `✅ App name updated to: <b>${newName}</b>`;
            
        } else if (editingMode === 'logo') {
            // Update app logo
            if (ctx.message.text && ctx.message.text.toLowerCase() === 'none') {
                appToUpdate.image = 'none';
                updateMessage = '✅ App logo removed';
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
                const overlaySettings = config?.imageOverlaySettings || { appImages: true };
                
                if (overlaySettings.appImages) {
                    cloudinaryUrl = cloudinaryUrl.replace('/upload/', '/upload/l_text:Stalinist%20One_140_bold:{name},co_rgb:00e5ff,g_center/');
                }
                
                appToUpdate.image = cloudinaryUrl;
                appToUpdate.cloudinaryId = result.public_id;
                appToUpdate.hasOverlay = overlaySettings.appImages;
                
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
                                appName: appToUpdate.name
                            }
                        }
                    }
                );
                
                updateMessage = '✅ App logo updated';
                
            } else if (ctx.message.text) {
                const url = ctx.message.text.trim();
                
                // Check if URL is valid image
                const isValid = await isValidImageUrl(url);
                if (!isValid) {
                    await safeSendMessage(ctx, '⚠️ The URL does not appear to be a valid image.\n\nDo you still want to use it?', {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '✅ Yes, use anyway', callback_data: `edit_app_confirm_logo_${encodeURIComponent(url)}` }],
                                [{ text: '❌ No, cancel', callback_data: `edit_app_select_${appIndex}` }]
                            ]
                        }
                    });
                    return;
                }
                
                appToUpdate.image = url;
                appToUpdate.hasOverlay = hasNameVariable(url);
                updateMessage = '✅ App logo updated';
            }
            
        } else if (editingMode === 'prefix') {
            // Update app prefix
            const newPrefix = ctx.message.text.trim().toLowerCase() === 'none' ? '' : ctx.message.text.trim();
            
            // Single prefix for all codes
            const codeCount = appToUpdate.codeCount || 1;
            const newPrefixes = Array(codeCount).fill(newPrefix);
            
            appToUpdate.codePrefixes = newPrefixes;
            updateMessage = `✅ Prefix updated to: <b>${newPrefix || 'None'}</b>`;
            
        } else if (editingMode === 'length') {
            // Update app code length
            const newLength = parseInt(ctx.message.text.trim());
            
            if (isNaN(newLength) || newLength < 6) {
                await safeSendMessage(ctx, '❌ Please enter a valid number (minimum 6).');
                return;
            }
            
            // Single length for all codes
            const codeCount = appToUpdate.codeCount || 1;
            const newLengths = Array(codeCount).fill(newLength);
            
            appToUpdate.codeLengths = newLengths;
            updateMessage = `✅ Code length updated to: <b>${newLength}</b>`;
            
        } else if (editingMode === 'count') {
            // Update app code count
            const newCount = parseInt(ctx.message.text.trim());
            
            if (isNaN(newCount) || newCount < 1 || newCount > 10) {
                await safeSendMessage(ctx, '❌ Please enter a number between 1 and 10.');
                return;
            }
            
            const oldCount = appToUpdate.codeCount || 1;
            appToUpdate.codeCount = newCount;
            
            // Update prefixes array
            const currentPrefix = appToUpdate.codePrefixes?.[0] || '';
            appToUpdate.codePrefixes = Array(newCount).fill(currentPrefix);
            
            // Update lengths array
            const currentLength = appToUpdate.codeLengths?.[0] || 8;
            appToUpdate.codeLengths = Array(newCount).fill(currentLength);
            
            updateMessage = `✅ Code count updated to: <b>${newCount}</b>`;
        }
        
        // Update the app in array
        apps[appIndex] = appToUpdate;
        
        // Save to database
        await db.collection('admin').updateOne(
            { type: 'config' },
            { $set: { apps: apps, updatedAt: new Date() } }
        );
        
        // Update session with new app data
        ctx.session.editApp.app = appToUpdate;
        delete ctx.session.editApp.mode;
        
        await safeSendMessage(ctx, updateMessage, {
            parse_mode: 'HTML'
        });
        
        await ctx.scene.leave();
        
        // Return to edit view
        setTimeout(async () => {
            await bot.action(`edit_app_select_${appIndex}`)(ctx);
        }, 1000);
        
    } catch (error) {
        console.error('Edit app details error:', error);
        await safeSendMessage(ctx, '❌ Failed to update app.');
        await ctx.scene.leave();
    }
});

// Handle confirmation for bad logo URLs
bot.action(/^edit_app_confirm_logo_(.+)$/, async (ctx) => {
    try {
        const url = decodeURIComponent(ctx.match[1]);
        
        if (ctx.session.editApp) {
            const appIndex = ctx.session.editApp.index;
            
            // Get current config
            const config = await db.collection('admin').findOne({ type: 'config' });
            const apps = [...config.apps];
            const appToUpdate = { ...apps[appIndex] };
            
            appToUpdate.image = url;
            appToUpdate.hasOverlay = hasNameVariable(url);
            
            // Update the app in array
            apps[appIndex] = appToUpdate;
            
            // Save to database
            await db.collection('admin').updateOne(
                { type: 'config' },
                { $set: { apps: apps, updatedAt: new Date() } }
            );
            
            // Update session
            ctx.session.editApp.app = appToUpdate;
            delete ctx.session.editApp.mode;
            
            await ctx.deleteMessage().catch(() => {});
            await safeSendMessage(ctx, '✅ App logo updated');
            await ctx.scene.leave();
            
            // Return to edit view
            setTimeout(async () => {
                await bot.action(`edit_app_select_${appIndex}`)(ctx);
            }, 1000);
        }
    } catch (error) {
        console.error('Confirm app logo error:', error);
        await safeSendMessage(ctx, '❌ Failed to update logo.');
    }
});


// ==========================================
// ADMIN ERROR RESET COMMAND
// ==========================================

bot.command('reseterrors', async (ctx) => {
    try {
        if (!await isAdmin(ctx.from.id)) {
            return safeSendMessage(ctx, '❌ You are not authorized to use this command.');
        }
        
        // Clear all error cooldowns
        errorCooldowns.clear();
        
        // Also clear any stuck sessions
        if (ctx.session) {
            delete ctx.session.lastError;
            delete ctx.session.contactUser;
            delete ctx.session.replyToAdmin;
            delete ctx.session.editChannel;
            delete ctx.session.editApp;
            delete ctx.session.reorderChannel;
            delete ctx.session.reorderApp;
            delete ctx.session.uploadingImageType;
            delete ctx.session.uploadingImage;
            delete ctx.session.editingDisabledMessage;
        }
        
        await safeSendMessage(ctx, '✅ All error cooldowns and sessions have been reset!\n\nBot should respond normally now.');
        
    } catch (error) {
        console.error('Reset errors command error:', error);
        await safeSendMessage(ctx, '❌ Failed to reset errors.');
    }
});

bot.command('status', async (ctx) => {
    try {
        if (!await isAdmin(ctx.from.id)) {
            return safeSendMessage(ctx, '❌ You are not authorized to use this command.');
        }
        
        let statusText = '🤖 <b>Bot Status Report</b>\n\n';
        
        // Error cooldowns count
        statusText += `📊 <b>Error Cooldowns Active:</b> ${errorCooldowns.size}\n`;
        
        // Bot responsiveness check
        statusText += `⚡ <b>Bot Responsive:</b> ✅ Yes\n`;
        
        // Database connection
        try {
            const config = await db.collection('admin').findOne({ type: 'config' });
            statusText += `🗄️ <b>Database:</b> ✅ Connected\n`;
            statusText += `👑 <b>Admins:</b> ${config?.admins?.length || 0}\n`;
            statusText += `👥 <b>Users:</b> ${await db.collection('users').countDocuments()}\n`;
        } catch (dbError) {
            statusText += `🗄️ <b>Database:</b> ❌ Error: ${dbError.message}\n`;
        }
        
        await safeSendMessage(ctx, statusText, { parse_mode: 'HTML' });
        
    } catch (error) {
        console.error('Status command error:', error);
        await safeSendMessage(ctx, '❌ Failed to get bot status.');
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
// GLOBAL ERROR PROTECTION
// ==========================================

let errorCount = 0;
const MAX_ERRORS_BEFORE_RESTART = 10;
const ERROR_RESET_INTERVAL = 60000; // 1 minute

// Monitor error frequency
const originalErrorHandler = bot.catch;
bot.catch = (error, ctx) => {
    errorCount++;
    console.error(`🔴 Global Error #${errorCount}:`, error.message);
    
    // Reset error count periodically
    setTimeout(() => {
        if (errorCount > 0) errorCount--;
    }, ERROR_RESET_INTERVAL);
    
    // If too many errors, suggest restart
    if (errorCount >= MAX_ERRORS_BEFORE_RESTART) {
        console.error('🚨 CRITICAL: Too many errors, bot may be stuck');
        
        // Notify admins
        notifyAdmin(`🚨 <b>Bot Error Alert</b>\n\nToo many errors detected (${errorCount}).\nBot may be stuck in error loop.\n\nUse /reseterrors to clear errors or restart the bot.`);
    }
    
    // Call original handler
    if (originalErrorHandler) {
        originalErrorHandler(error, ctx);
    }
};

// Reset error count on successful admin command
const originalIsAdmin = isAdmin;
isAdmin = async (userId) => {
    const result = await originalIsAdmin(userId);
    if (result) {
        errorCount = 0; // Reset error count when admin successfully accesses
    }
    return result;
};
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

// Handle Railway port bin
startBot();
console.log('Bot Starting...');
