const fs = require('fs');
const path = require('path');
const { MessageAttachment, MessageEmbed } = require('discord.js');
const config = require('../../config.json');
const https = require('https');

module.exports = {
    name: 'csend',
    description: 'cookie send with verification',
    usage: 'csend <@user> <netflix/spotify>',
    async execute(message, args) {
        // Check if the command sender has the required role
        const allowedRoleIDs = config.cookiesendroles || []; // Assuming config.cookiesendroles is an array of role IDs

        const userRoles = message.member.roles.cache.map(role => role.id);

        if (!userRoles.some(role => allowedRoleIDs.includes(role))) {
            return message.reply('You do not have permission to use this command.');
        }
        
        // Check if the command has the correct number of arguments
        if (args.length !== 2) {
            return message.reply('Please provide the correct arguments. Usage: `csend <@user> <netflix/spotify>`.');
        }

        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) {
            return message.reply('Please mention a user to send the cookie to.');
        }
        
        const category = args[1].toLowerCase();

        // Check if the specified category is valid (netflix or spotify)
        if (!(category === 'netflix' || category === 'spotify')) {
            return message.reply('Please provide a valid category (netflix or spotify).');
        }

        // Processing message
        const processingEmbed = new MessageEmbed()
            .setColor(config.color.blue || '#0099ff')
            .setTitle(`Finding Valid ${category.charAt(0).toUpperCase() + category.slice(1)} Cookie`)
            .setDescription(`Looking for a valid cookie to send to ${mentionedUser.tag}. This may take a moment...`)
            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTimestamp();
            
        const processingMessage = await message.channel.send({ embeds: [processingEmbed] });

        try {
            let validCookie = null;
            let validCookieContent = null;
            let validCookieFilename = null;
            let validCookieDetails = null;
            
            if (category === 'spotify') {
                // For Spotify, check working_cookies directory first
                const workingCookiesDir = path.join(__dirname, '../../working_cookies');
                
                if (fs.existsSync(workingCookiesDir)) {
                    // Look for premium, then family, then duo, then student folders
                    const priorityFolders = ['premium', 'family', 'duo', 'student'];
                    
                    for (const folderName of priorityFolders) {
                        const folderPath = path.join(workingCookiesDir, folderName);
                        
                        if (fs.existsSync(folderPath)) {
                            const cookieFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.txt'));
                            
                            if (cookieFiles.length > 0) {
                                // Get a random file from this folder
                                const randomFile = cookieFiles[Math.floor(Math.random() * cookieFiles.length)];
                                const filePath = path.join(folderPath, randomFile);
                                
                                // Check if the cookie is valid
                                await processingMessage.edit({
                                    embeds: [
                                        new MessageEmbed()
                                            .setColor(config.color.blue || '#0099ff')
                                            .setTitle(`Checking Cookie`)
                                            .setDescription(`Checking ${folderName} cookie: ${randomFile}`)
                                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                            .setTimestamp()
                                    ]
                                });
                                
                                // Read the cookie file
                                const cookieContent = fs.readFileSync(filePath, 'utf8');
                                
                                // Extract cookie details from the file or folder name
                                let cookieDetails = {
                                    plan: folderName.charAt(0).toUpperCase() + folderName.slice(1),
                                    type: 'Unknown',
                                    country: 'Unknown',
                                    autopay: 'Unknown',
                                    trial: 'Unknown'
                                };
                                
                                // Try to parse details from the file content
                                try {
                                    // Look for plan, country, autopay, trial details in the content
                                    const planMatch = cookieContent.match(/PLAN\s*:\s*([^\r\n]+)/i);
                                    const countryMatch = cookieContent.match(/COUNTRY\s*:\s*([^\r\n]+)/i);
                                    const autopayMatch = cookieContent.match(/AutoPay\s*:\s*([^\r\n]+)/i);
                                    const trialMatch = cookieContent.match(/Trial\s*:\s*([^\r\n]+)/i);
                                    const emailMatch = cookieContent.match(/Email\s*:\s*([^\r\n]+)/i);
                                    
                                    if (planMatch && planMatch[1]) cookieDetails.plan = planMatch[1].trim();
                                    if (countryMatch && countryMatch[1]) cookieDetails.country = countryMatch[1].trim();
                                    if (autopayMatch && autopayMatch[1]) cookieDetails.autopay = autopayMatch[1].trim();
                                    if (trialMatch && trialMatch[1]) cookieDetails.trial = trialMatch[1].trim();
                                    if (emailMatch && emailMatch[1]) cookieDetails.email = emailMatch[1].trim();
                                    
                                    // Also try to extract from the filename
                                    if (randomFile.includes('Owner')) {
                                        cookieDetails.type = 'Owner';
                                    } else if (randomFile.includes('Member')) {
                                        cookieDetails.type = 'Member';
                                    } else if (randomFile.includes('Payment Pending')) {
                                        cookieDetails.type = 'Payment Pending';
                                    }
                                } catch (err) {
                                    console.error(`Error parsing cookie details: ${err.message}`);
                                }
                                
                                // We found a cookie!
                                validCookie = filePath;
                                validCookieContent = cookieContent;
                                validCookieFilename = randomFile;
                                validCookieDetails = cookieDetails;
                                break;
                            }
                        }
                    }
                }
                
                // If we didn't find a valid cookie in working_cookies, check the regular spotify directory
                if (!validCookie) {
                    const folderPath = `./${category}/`;
                    if (fs.existsSync(folderPath)) {
                        const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.txt'));
                        
                        if (files.length === 0) {
                            await processingMessage.edit({
                                embeds: [
                                    new MessageEmbed()
                                        .setColor(config.color.red || '#ff0000')
                                        .setTitle('No Files Found')
                                        .setDescription(`No files found in the ${category} category.`)
                                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                        .setTimestamp()
                                ]
                            });
                            return;
                        }
                        
                        // Try up to 5 random files
                        const maxAttempts = Math.min(5, files.length);
                        for (let i = 0; i < maxAttempts; i++) {
                            const randomIndex = Math.floor(Math.random() * files.length);
                            const randomFile = files[randomIndex];
                            const filePath = `${folderPath}${randomFile}`;
                            
                            // Check if file exists
                            if (!fs.existsSync(filePath)) {
                                continue;
                            }
                            
                            await processingMessage.edit({
                                embeds: [
                                    new MessageEmbed()
                                        .setColor(config.color.blue || '#0099ff')
                                        .setTitle(`Checking Cookie`)
                                        .setDescription(`Checking cookie: ${randomFile} (attempt ${i+1}/${maxAttempts})`)
                                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                        .setTimestamp()
                                ]
                            });
                            
                            // Read file content
                            const fileContent = fs.readFileSync(filePath, 'utf8');
                            
                            // Try to parse cookie details
                            let cookieDetails = {
                                plan: 'Unknown',
                                type: 'Unknown',
                                country: 'Unknown',
                                autopay: 'Unknown',
                                trial: 'Unknown'
                            };
                            
                            try {
                                // Look for plan, country, autopay, trial details in the content
                                const planMatch = fileContent.match(/PLAN\s*:\s*([^\r\n]+)/i);
                                const countryMatch = fileContent.match(/COUNTRY\s*:\s*([^\r\n]+)/i);
                                const autopayMatch = fileContent.match(/AutoPay\s*:\s*([^\r\n]+)/i);
                                const trialMatch = fileContent.match(/Trial\s*:\s*([^\r\n]+)/i);
                                const emailMatch = fileContent.match(/Email\s*:\s*([^\r\n]+)/i);
                                
                                if (planMatch && planMatch[1]) cookieDetails.plan = planMatch[1].trim();
                                if (countryMatch && countryMatch[1]) cookieDetails.country = countryMatch[1].trim();
                                if (autopayMatch && autopayMatch[1]) cookieDetails.autopay = autopayMatch[1].trim();
                                if (trialMatch && trialMatch[1]) cookieDetails.trial = trialMatch[1].trim();
                                if (emailMatch && emailMatch[1]) cookieDetails.email = emailMatch[1].trim();
                            } catch (err) {
                                console.error(`Error parsing cookie details: ${err.message}`);
                            }
                            
                            // We'll just use this cookie
                            validCookie = filePath;
                            validCookieContent = fileContent;
                            validCookieFilename = randomFile;
                            validCookieDetails = cookieDetails;
                            break;
                        }
                    }
                }
            } else if (category === 'netflix') {
                // For Netflix, check the working_cookies/netflix/premium directory first
                const workingCookiesDir = path.join(__dirname, '../../working_cookies/netflix/premium');
                
                if (fs.existsSync(workingCookiesDir)) {
                    const cookieFiles = fs.readdirSync(workingCookiesDir).filter(file => file.endsWith('.txt'));
                    
                    if (cookieFiles.length > 0) {
                        // Get a random file from this folder
                        const randomFile = cookieFiles[Math.floor(Math.random() * cookieFiles.length)];
                        const filePath = path.join(workingCookiesDir, randomFile);
                        
                        // Check if the cookie is valid
                        await processingMessage.edit({
                            embeds: [
                                new MessageEmbed()
                                    .setColor(config.color.blue || '#0099ff')
                                    .setTitle(`Checking Cookie`)
                                    .setDescription(`Checking Netflix cookie: ${randomFile}`)
                                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                    .setTimestamp()
                            ]
                        });
                        
                        // Read the cookie file
                        const cookieContent = fs.readFileSync(filePath, 'utf8');
                        
                        // Extract cookie details from the file
                        let cookieDetails = {
                            plan: 'Unknown',
                            country: 'Unknown',
                            maxStreams: 'Unknown',
                            extraMembers: 'Unknown',
                            memberSince: 'Unknown',
                            type: 'Netflix Premium'
                        };
                        
                        // Try to parse details from the file content
                        try {
                            // Look for plan, country, streams, members details in the content
                            const planMatch = cookieContent.match(/PLAN\s*:\s*([^\r\n]+)/i);
                            const countryMatch = cookieContent.match(/COUNTRY\s*:\s*([^\r\n]+)/i);
                            const streamsMatch = cookieContent.match(/MAX STREAMS\s*:\s*([^\r\n]+)/i);
                            const extraMembersMatch = cookieContent.match(/EXTRA MEMBERS\s*:\s*([^\r\n]+)/i);
                            const memberSinceMatch = cookieContent.match(/MEMBER SINCE\s*:\s*([^\r\n]+)/i);
                            
                            if (planMatch && planMatch[1]) cookieDetails.plan = planMatch[1].trim();
                            if (countryMatch && countryMatch[1]) cookieDetails.country = countryMatch[1].trim();
                            if (streamsMatch && streamsMatch[1]) cookieDetails.maxStreams = streamsMatch[1].trim();
                            if (extraMembersMatch && extraMembersMatch[1]) cookieDetails.extraMembers = extraMembersMatch[1].trim();
                            if (memberSinceMatch && memberSinceMatch[1]) cookieDetails.memberSince = memberSinceMatch[1].trim();
                        } catch (err) {
                            console.error(`Error parsing cookie details: ${err.message}`);
                        }
                        
                        // We found a cookie!
                        validCookie = filePath;
                        validCookieContent = cookieContent;
                        validCookieFilename = randomFile;
                        validCookieDetails = cookieDetails;
                    }
                }
                
                // If we didn't find a valid cookie in working_cookies, check the regular netflix directory
                if (!validCookie) {
                    const folderPath = `./${category}/`;
                    
                    if (!fs.existsSync(folderPath)) {
                        await processingMessage.edit({
                            embeds: [
                                new MessageEmbed()
                                    .setColor(config.color.red || '#ff0000')
                                    .setTitle('Folder Not Found')
                                    .setDescription(`The ${category} folder was not found.`)
                                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                    .setTimestamp()
                            ]
                        });
                        return;
                    }
                    
                    const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.txt'));
                    
                    if (files.length === 0) {
                        await processingMessage.edit({
                            embeds: [
                                new MessageEmbed()
                                    .setColor(config.color.red || '#ff0000')
                                    .setTitle('No Files Found')
                                    .setDescription(`No files found in the ${category} category.`)
                                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                    .setTimestamp()
                            ]
                        });
                        return;
                    }
                    
                    // Try up to 5 random files
                    const maxAttempts = Math.min(5, files.length);
                    for (let i = 0; i < maxAttempts; i++) {
                        const randomIndex = Math.floor(Math.random() * files.length);
                        const randomFile = files[randomIndex];
                        const filePath = `${folderPath}${randomFile}`;
                        
                        // Check if file exists
                        if (!fs.existsSync(filePath)) {
                            continue;
                        }
                        
                        await processingMessage.edit({
                            embeds: [
                                new MessageEmbed()
                                    .setColor(config.color.blue || '#0099ff')
                                    .setTitle(`Checking Cookie`)
                                    .setDescription(`Checking Netflix cookie: ${randomFile} (attempt ${i+1}/${maxAttempts})`)
                                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                    .setTimestamp()
                            ]
                        });
                        
                        // Read file content
                        const fileContent = fs.readFileSync(filePath, 'utf8');
                        
                        // Basic cookie details
                        let cookieDetails = {
                            plan: 'Unknown',
                            country: 'Unknown',
                            maxStreams: 'Unknown',
                            extraMembers: 'Unknown',
                            memberSince: 'Unknown',
                            type: 'Netflix'
                        };
                        
                        try {
                            // Try to extract details from the content
                            const planMatch = fileContent.match(/PLAN\s*:\s*([^\r\n]+)/i);
                            const countryMatch = fileContent.match(/COUNTRY\s*:\s*([^\r\n]+)/i);
                            const streamsMatch = fileContent.match(/MAX STREAMS\s*:\s*([^\r\n]+)/i);
                            const extraMembersMatch = fileContent.match(/EXTRA MEMBERS\s*:\s*([^\r\n]+)/i);
                            const memberSinceMatch = fileContent.match(/MEMBER SINCE\s*:\s*([^\r\n]+)/i);
                            
                            if (planMatch && planMatch[1]) cookieDetails.plan = planMatch[1].trim();
                            if (countryMatch && countryMatch[1]) cookieDetails.country = countryMatch[1].trim();
                            if (streamsMatch && streamsMatch[1]) cookieDetails.maxStreams = streamsMatch[1].trim();
                            if (extraMembersMatch && extraMembersMatch[1]) cookieDetails.extraMembers = extraMembersMatch[1].trim();
                            if (memberSinceMatch && memberSinceMatch[1]) cookieDetails.memberSince = memberSinceMatch[1].trim();
                        } catch (err) {
                            console.error(`Error parsing Netflix cookie details: ${err.message}`);
                        }
                        
                        validCookie = filePath;
                        validCookieContent = fileContent;
                        validCookieFilename = randomFile;
                        validCookieDetails = cookieDetails;
                        break;
                    }
                }
            }
            
            // If we didn't find a valid cookie
            if (!validCookie || !validCookieContent) {
                await processingMessage.edit({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red || '#ff0000')
                            .setTitle('No Valid Cookies')
                            .setDescription(`Could not find a valid ${category} cookie after multiple attempts.`)
                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                            .setTimestamp()
                    ]
                });
                return;
            }
            
            // Update status message with cookie details
            const statusEmbed = new MessageEmbed()
                .setColor(config.color.green || '#00ff00')
                .setTitle('Cookie Found')
                .setDescription(`Valid ${category} cookie found! Sending to ${mentionedUser.tag}...`)
                .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                .setTimestamp();
                
            // Add cookie details if available
            if (validCookieDetails) {
                if (category === 'spotify') {
                    statusEmbed.addFields([
                        {
                            name: 'Cookie Details',
                            value: `Plan: ${validCookieDetails.plan || 'Unknown'}\n` +
                                  `Type: ${validCookieDetails.type || 'Unknown'}\n` +
                                  `Country: ${validCookieDetails.country || 'Unknown'}\n` +
                                  `AutoPay: ${validCookieDetails.autopay || 'Unknown'}\n` +
                                  `Trial: ${validCookieDetails.trial || 'Unknown'}\n` +
                                  (validCookieDetails.email ? `Email: ${validCookieDetails.email}` : '')
                        }
                    ]);
                } else if (category === 'netflix') {
                    statusEmbed.addFields([
                        {
                            name: 'Cookie Details',
                            value: `Plan: ${validCookieDetails.plan || 'Unknown'}\n` +
                                  `Country: ${validCookieDetails.country || 'Unknown'}\n` +
                                  `Max Streams: ${validCookieDetails.maxStreams || 'Unknown'}\n` +
                                  `Extra Members: ${validCookieDetails.extraMembers || 'Unknown'}\n` +
                                  `Member Since: ${validCookieDetails.memberSince || 'Unknown'}`
                        }
                    ]);
                }
            }
            
            await processingMessage.edit({ embeds: [statusEmbed] });
            
            // Customize the embed based on the specified category
            const dmEmbed = new MessageEmbed()
                .setColor('#0099ff')
                .setTitle(`${category.charAt(0).toUpperCase() + category.slice(1)} Access`) // Capitalize the category
                .setDescription(`🌕 **WRECKED G3N** 🌕\n\n**Service**\n💻 Here is your ${category} access`)
                .addFields([{
                    name: 'Instructions', 
                    value: `Step 1: Make sure you are on a PC\nStep 2: Download the extension called Cookie Editor [link](https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm)\nStep 3: Go to the ${category} website and pin Cookie Editor\nStep 4: Delete all cookies (the bin icon) and then press import and copy the thing we gave you\nStep 5: After import, just click refresh on the whole page, and you should be logged in\nStep 6: Enjoy!!!\n\nEnjoy at ${category.charAt(0).toUpperCase() + category.slice(1)}!`
                }]);
            
            // Create the attachment with file content
            const fileBuffer = Buffer.from(validCookieContent);
            const fileAttachment = new MessageAttachment(fileBuffer, validCookieFilename);
            
            // Send the messages to the user
            try {
                await mentionedUser.send({ embeds: [dmEmbed] });
                await mentionedUser.send({ files: [fileAttachment] });
                
                // Success message in channel with cookie details
                const successEmbed = new MessageEmbed()
                    .setColor(config.color.green || '#00ff00')
                    .setTitle(`${category.charAt(0).toUpperCase() + category.slice(1)} Access Sent!`)
                    .setDescription(`Check ${mentionedUser.tag}'s private messages! If they do not receive the message, please ask them to unlock their private!`)
                    .setImage(config.gif) // Use the URL from config.json
                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                    .setTimestamp();
                
                // Add cookie details to success message
                if (validCookieDetails) {
                    if (category === 'spotify') {
                        successEmbed.addFields([
                            {
                                name: 'Cookie Details',
                                value: `Plan: ${validCookieDetails.plan || 'Unknown'}\n` +
                                      `Country: ${validCookieDetails.country || 'Unknown'}\n` +
                                      (validCookieDetails.email ? `Email: ${validCookieDetails.email}` : '')
                            }
                        ]);
                    } else if (category === 'netflix') {
                        successEmbed.addFields([
                            {
                                name: 'Cookie Details',
                                value: `Plan: ${validCookieDetails.plan || 'Unknown'}\n` +
                                      `Country: ${validCookieDetails.country || 'Unknown'}\n` +
                                      `Max Streams: ${validCookieDetails.maxStreams || 'Unknown'}\n` +
                                      `Extra Members: ${validCookieDetails.extraMembers || 'Unknown'}`
                            }
                        ]);
                    }
                }
                
                await processingMessage.edit({ embeds: [successEmbed] });
            } catch (err) {
                console.error(`Failed to send message to ${mentionedUser.tag}: ${err}`);
                await processingMessage.edit({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red || '#ff0000')
                            .setTitle('Failed to Send Message')
                            .setDescription(`Failed to send ${category} access to ${mentionedUser.tag}. Please check their privacy settings.`)
                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                            .setTimestamp()
                    ]
                });
            }
        } catch (err) {
            console.error(`Error in csend command: ${err}`);
            if (processingMessage) {
                await processingMessage.edit({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red || '#ff0000')
                            .setTitle('Error')
                            .setDescription(`An error occurred while processing this command: ${err.message}`)
                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                            .setTimestamp()
                    ]
                });
            }
        }
    }
};