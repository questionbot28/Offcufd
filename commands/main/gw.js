// commands/main/gw.js
const { MessageEmbed, MessageActionRow, MessageButton } = require('discord.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../../config.json');

// Extract giveaway channel IDs from config
const GIVEAWAY_CHANNEL_IDS = Object.values(config.giveawayChannels);

// Ensure giveaways directory exists
const GIVEAWAYS_DIR = path.join(__dirname, '../../giveaways');
if (!fs.existsSync(GIVEAWAYS_DIR)) {
    fs.mkdirSync(GIVEAWAYS_DIR, { recursive: true });
}

// Database file for giveaways
const GIVEAWAYS_DB = path.join(__dirname, '../../giveaways.json');

// Initialize giveaways database if it doesn't exist
if (!fs.existsSync(GIVEAWAYS_DB)) {
    fs.writeFileSync(GIVEAWAYS_DB, JSON.stringify({
        activeGiveaways: {},
        claimCodes: {}
    }, null, 2));
}

// Helper function to read giveaways database
function readGiveawaysDB() {
    return JSON.parse(fs.readFileSync(GIVEAWAYS_DB, 'utf8'));
}

// Helper function to write to giveaways database
function writeGiveawaysDB(data) {
    fs.writeFileSync(GIVEAWAYS_DB, JSON.stringify(data, null, 2));
}

// Helper function to generate a unique ID
function generateUniqueId(length = 8) {
    return crypto.randomBytes(length).toString('hex');
}

// Helper function to check if user is staff
function isStaff(member) {
    return config.staffRoleIds.some(roleId => member.roles.cache.has(roleId));
}

module.exports = {
    name: 'gw',
    description: 'Giveaway command to create and manage giveaways',
    usage: 'gw create <account_name> <time_in_minutes>',
    
    async execute(message, args) {
        // Check if user is a staff member
        if (!isStaff(message.member)) {
            return message.channel.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Permission Denied')
                        .setDescription('You need to be a staff member to use this command.')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            });
        }

        // No arguments provided, show help
        if (!args.length) {
            return message.channel.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.blue)
                        .setTitle('Giveaway Commands')
                        .setDescription('Available giveaway commands:')
                        .addField('.gw create <account_name> <time_in_minutes>', 'Create a new giveaway')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            });
        }

        const subCommand = args[0]?.toLowerCase();

        // Create giveaway
        if (subCommand === 'create') {
            // Check if the required arguments are provided
            if (args.length < 3) {
                return message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Missing Parameters')
                            .setDescription('Usage: `.gw create <account_name> <time_in_minutes>`')
                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                            .setTimestamp()
                    ]
                });
            }

            const accountName = args[1];
            const timeInMinutes = parseInt(args[2]);

            // Validate time
            if (isNaN(timeInMinutes) || timeInMinutes <= 0) {
                return message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Invalid Time')
                            .setDescription('Time must be a positive number of minutes.')
                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                            .setTimestamp()
                    ]
                });
            }

            // Generate a unique giveaway ID
            const giveawayId = generateUniqueId();
            
            // Calculate end time
            const endTime = Date.now() + (timeInMinutes * 60 * 1000);
            
            // Create giveaway entry
            const giveawayData = {
                id: giveawayId,
                accountName: accountName,
                creatorId: message.author.id,
                endTime: endTime,
                participants: [],
                messageId: null,
                channelId: null,
                status: 'pending', // pending, active, ended
                winner: null,
                accountDetails: null
            };
            
            // Save to database
            const db = readGiveawaysDB();
            db.activeGiveaways[giveawayId] = giveawayData;
            writeGiveawaysDB(db);
            
            // DM the creator with the giveaway ID
            try {
                await message.author.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.green)
                            .setTitle('Giveaway Created')
                            .setDescription(`Your giveaway for **${accountName}** has been created.`)
                            .addField('Giveaway ID', giveawayId)
                            .addField('Next Step', 'Use `.addacc ' + giveawayId + ' <account_details>` to add the account details.')
                            .setFooter({ text: 'This ID is private. Do not share it with others.' })
                            .setTimestamp()
                    ]
                });
            } catch (error) {
                console.error('Failed to send DM:', error);
                return message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Error')
                            .setDescription('Unable to send you a DM. Please make sure your DMs are open.')
                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                            .setTimestamp()
                    ]
                });
            }
            
            // Create the giveaway message with a join button
            const row = new MessageActionRow()
                .addComponents(
                    new MessageButton()
                        .setCustomId(`gw_join_${giveawayId}`)
                        .setLabel('Join Giveaway')
                        .setStyle('PRIMARY')
                        .setEmoji('🎉')
                );
            
            // Send giveaway announcement
            let giveawayChannel;
            
            // Check if we're in one of the dedicated giveaway channels
            const currentChannelId = message.channel.id;
            
            // Check if the current channel is one of our designated giveaway channels
            if (GIVEAWAY_CHANNEL_IDS.includes(currentChannelId)) {
                giveawayChannel = message.channel;
            } 
            // If we're not in a giveaway channel, randomly select one from our list
            else {
                // Get a random channel ID from our list
                const randomChannelId = GIVEAWAY_CHANNEL_IDS[Math.floor(Math.random() * GIVEAWAY_CHANNEL_IDS.length)];
                giveawayChannel = message.guild.channels.cache.get(randomChannelId);
                
                // If for some reason the channel isn't found, use the first available giveaway channel
                if (!giveawayChannel) {
                    for (const channelId of GIVEAWAY_CHANNEL_IDS) {
                        const channel = message.guild.channels.cache.get(channelId);
                        if (channel) {
                            giveawayChannel = channel;
                            break;
                        }
                    }
                }
            }
            
            // Fallback to the current channel if no giveaway channel is found
            if (!giveawayChannel) {
                giveawayChannel = message.channel;
                console.warn('No giveaway channel found. Using the current channel as fallback.');
            }
            
            const giveawayMessage = await giveawayChannel.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.blue)
                        .setTitle('🎉 GIVEAWAY 🎉')
                        .setDescription(`A giveaway for **${accountName}** has started!`)
                        .addField('Duration', `${timeInMinutes} minute${timeInMinutes !== 1 ? 's' : ''}`)
                        .addField('Ends At', `<t:${Math.floor(endTime / 1000)}:R>`)
                        .addField('Hosted By', `<@${message.author.id}>`)
                        .setImage('https://cdn.discordapp.com/attachments/1263458101886193725/1349031252216250503/350kb.gif?ex=67dcd382&is=67db8202&hm=819b12370cf47cf8e4f9ca413f31212080bbfd344c9a6dac2f264a89848e8aeb&')
                        .setFooter({ text: 'Click the button below to enter!' })
                        .setTimestamp()
                ],
                components: [row]
            });
            
            // Update database with message and channel IDs
            db.activeGiveaways[giveawayId].messageId = giveawayMessage.id;
            db.activeGiveaways[giveawayId].channelId = giveawayChannel.id;
            db.activeGiveaways[giveawayId].status = 'active';
            writeGiveawaysDB(db);
            
            // Set a timeout to end the giveaway
            setTimeout(() => endGiveaway(message.client, giveawayId), timeInMinutes * 60 * 1000);
            
            // Only send a private DM to the creator with the giveaway ID
            try {
                await message.author.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.green)
                            .setTitle('Giveaway Started')
                            .setDescription(`Giveaway for **${accountName}** has been started successfully.\nGiveaway ID: \`${giveawayId}\``)
                            .setFooter({ text: 'This message is only visible to you' })
                            .setTimestamp()
                    ]
                });
                
                // Delete the original command message if possible
                if (message.deletable) {
                    await message.delete().catch(e => console.error('Could not delete command message:', e));
                }
                
                // No public confirmation - completely silent to others
                return;
            } catch (err) {
                console.error('Error sending giveaway confirmation DM:', err);
                // If DM fails, we still don't want to reveal anything in the channel
                // Just delete the command and return silently
                if (message.deletable) {
                    await message.delete().catch(e => console.error('Could not delete command message:', e));
                }
                return;
            }
        }
    }
};

// Function to end a giveaway
async function endGiveaway(client, giveawayId) {
    const db = readGiveawaysDB();
    const giveaway = db.activeGiveaways[giveawayId];
    
    if (!giveaway || giveaway.status !== 'active') {
        return;
    }
    
    try {
        // Mark giveaway as ended
        giveaway.status = 'ended';
        
        // Get the channel and message
        const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
        if (!channel) {
            console.error(`Channel ${giveaway.channelId} not found`);
            return;
        }
        
        const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (!message) {
            console.error(`Message ${giveaway.messageId} not found`);
            return;
        }
        
        // Check if there are participants
        if (giveaway.participants.length === 0) {
            await message.edit({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.yellow)
                        .setTitle('🎉 GIVEAWAY ENDED 🎉')
                        .setDescription(`No one entered the giveaway for **${giveaway.accountName}**`)
                        .addField('Hosted By', `<@${giveaway.creatorId}>`)
                        .setImage('https://cdn.discordapp.com/attachments/1263458101886193725/1349031252216250503/350kb.gif?ex=67dcd382&is=67db8202&hm=819b12370cf47cf8e4f9ca413f31212080bbfd344c9a6dac2f264a89848e8aeb&')
                        .setFooter({ text: 'Better luck next time!' })
                        .setTimestamp()
                ],
                components: []
            });
            
            return;
        }
        
        // Randomly select a winner
        const winnerIndex = Math.floor(Math.random() * giveaway.participants.length);
        const winnerId = giveaway.participants[winnerIndex];
        giveaway.winner = winnerId;
        
        // Generate a claim code
        const claimCode = generateUniqueId(12);
        db.claimCodes[claimCode] = {
            giveawayId: giveawayId,
            winnerId: winnerId,
            claimed: false
        };
        
        // Update the database
        writeGiveawaysDB(db);
        
        // Update the giveaway message
        await message.edit({
            embeds: [
                new MessageEmbed()
                    .setColor(config.color.green)
                    .setTitle('🎉 GIVEAWAY ENDED 🎉')
                    .setDescription(`The giveaway for **${giveaway.accountName}** has ended!`)
                    .addField('Winner', `<@${winnerId}>`)
                    .addField('Hosted By', `<@${giveaway.creatorId}>`)
                    .setImage('https://cdn.discordapp.com/attachments/1263458101886193725/1349031252216250503/350kb.gif?ex=67dcd382&is=67db8202&hm=819b12370cf47cf8e4f9ca413f31212080bbfd344c9a6dac2f264a89848e8aeb&')
                    .setFooter({ text: 'Thanks for participating!' })
                    .setTimestamp()
            ],
            components: []
        });
        
        // DM the winner with the claim code
        try {
            const winner = await client.users.fetch(winnerId);
            await winner.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.green)
                        .setTitle('🎉 Congratulations! You Won a Giveaway! 🎉')
                        .setDescription(`You have won the giveaway for **${giveaway.accountName}**!`)
                        .addField('Claim Code', `\`${claimCode}\``)
                        .addField('How to Claim', `Use \`.claim ${claimCode}\` in the server to claim your prize.`)
                        .setFooter({ text: 'This code is only valid for you and will expire if not claimed.' })
                        .setTimestamp()
                ]
            });
        } catch (error) {
            console.error('Failed to DM winner:', error);
            // Announce in channel that the winner needs to claim
            await channel.send({
                content: `<@${winnerId}>`,
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.yellow)
                        .setTitle('Winner Notification')
                        .setDescription(`Congratulations <@${winnerId}>! You won the giveaway for **${giveaway.accountName}**.\nI couldn't DM you the claim code, so here it is: \`${claimCode}\`\nUse \`.claim ${claimCode}\` to claim your prize.`)
                        .setFooter({ text: 'This code is only valid for you.' })
                        .setTimestamp()
                ]
            });
        }
        
    } catch (error) {
        console.error('Error ending giveaway:', error);
    }
}

// Handle button interactions for giveaway
module.exports.handleButtonInteraction = async (interaction) => {
    if (!interaction.isButton()) return;
    
    const customId = interaction.customId;
    if (!customId.startsWith('gw_join_')) return;
    
    const giveawayId = customId.replace('gw_join_', '');
    const db = readGiveawaysDB();
    const giveaway = db.activeGiveaways[giveawayId];
    
    if (!giveaway) {
        return interaction.reply({
            content: 'This giveaway no longer exists.',
            ephemeral: true
        });
    }
    
    if (giveaway.status !== 'active') {
        return interaction.reply({
            content: 'This giveaway has already ended.',
            ephemeral: true
        });
    }
    
    // Check if user has already joined
    if (giveaway.participants.includes(interaction.user.id)) {
        return interaction.reply({
            content: 'You have already joined this giveaway.',
            ephemeral: true
        });
    }
    
    // Add user to participants
    giveaway.participants.push(interaction.user.id);
    writeGiveawaysDB(db);
    
    return interaction.reply({
        content: 'You have successfully entered the giveaway! Good luck!',
        ephemeral: true
    });
};