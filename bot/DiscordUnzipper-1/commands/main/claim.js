// commands/main/claim.js
const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../../config.json');

// Giveaways database file
const GIVEAWAYS_DB = path.join(__dirname, '../../giveaways.json');

// Helper function to read giveaways database
function readGiveawaysDB() {
    if (!fs.existsSync(GIVEAWAYS_DB)) {
        fs.writeFileSync(GIVEAWAYS_DB, JSON.stringify({
            activeGiveaways: {},
            claimCodes: {}
        }, null, 2));
    }
    return JSON.parse(fs.readFileSync(GIVEAWAYS_DB, 'utf8'));
}

// Helper function to write to giveaways database
function writeGiveawaysDB(data) {
    fs.writeFileSync(GIVEAWAYS_DB, JSON.stringify(data, null, 2));
}

module.exports = {
    name: 'claim',
    description: 'Claim a giveaway prize with a claim code',
    usage: 'claim <claim_code>',
    
    async execute(message, args) {
        // Delete the user's message to protect the claim code
        try {
            await message.delete();
        } catch (error) {
            console.error('Failed to delete message:', error);
        }
        
        // Check if a claim code is provided
        if (!args.length) {
            return message.author.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Missing Claim Code')
                        .setDescription('Please provide a claim code to claim your prize.')
                        .addField('Usage', '`.claim <claim_code>`')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            }).catch(err => {
                console.error('Failed to send DM:', err);
            });
        }
        
        const claimCode = args[0];
        
        // Read the database
        const db = readGiveawaysDB();
        
        // Check if the claim code exists
        if (!db.claimCodes || !db.claimCodes[claimCode]) {
            return message.author.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Invalid Claim Code')
                        .setDescription('The claim code you provided is invalid or has expired.')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            }).catch(err => {
                console.error('Failed to send DM:', err);
            });
        }
        
        const claimData = db.claimCodes[claimCode];
        
        // Check if the claim code has already been claimed
        if (claimData.claimed) {
            return message.author.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Already Claimed')
                        .setDescription('This claim code has already been used.')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            }).catch(err => {
                console.error('Failed to send DM:', err);
            });
        }
        
        // Check if the user is the actual winner
        if (claimData.winnerId !== message.author.id) {
            return message.author.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Not Authorized')
                        .setDescription('This claim code belongs to someone else. You cannot claim this prize.')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            }).catch(err => {
                console.error('Failed to send DM:', err);
            });
        }
        
        // Get the giveaway data
        const giveaway = db.activeGiveaways[claimData.giveawayId];
        
        if (!giveaway) {
            return message.author.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Giveaway Not Found')
                        .setDescription('The giveaway associated with this claim code no longer exists.')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            }).catch(err => {
                console.error('Failed to send DM:', err);
            });
        }
        
        // Check if account details exist
        if (!giveaway.accountDetails || !fs.existsSync(giveaway.accountDetails)) {
            return message.author.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Account Details Not Found')
                        .setDescription('The account details for this giveaway could not be found. Please contact the giveaway creator.')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            }).catch(err => {
                console.error('Failed to send DM:', err);
            });
        }
        
        // Read the account details
        const accountDetails = fs.readFileSync(giveaway.accountDetails, 'utf8');
        
        // Mark the claim code as claimed
        claimData.claimed = true;
        giveaway.claimed = true;
        writeGiveawaysDB(db);
        
        // Send the account details to the winner
        return message.author.send({
            embeds: [
                new MessageEmbed()
                    .setColor(config.color.green)
                    .setTitle('🎉 Prize Claimed Successfully! 🎉')
                    .setDescription(`You have claimed your prize for the **${giveaway.accountName}** giveaway.`)
                    .addField('Account Details', '```' + accountDetails + '```')
                    .setFooter({ text: 'Enjoy your prize! Thank you for participating.' })
                    .setTimestamp()
            ]
        }).catch(err => {
            console.error('Failed to send DM:', err);
            // Reset the claim status since we couldn't send the account
            claimData.claimed = false;
            giveaway.claimed = false;
            writeGiveawaysDB(db);
            
            // Try to notify user in the channel
            message.channel.send({
                content: `<@${message.author.id}>`,
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('DM Failed')
                        .setDescription('I could not send you the account details via DM. Please enable DMs from server members and try again.')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            }).catch(channelErr => {
                console.error('Failed to send channel message:', channelErr);
            });
        });
    }
};