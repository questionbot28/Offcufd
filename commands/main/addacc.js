// commands/main/addacc.js
const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../../config.json');

// Giveaways database file
const GIVEAWAYS_DB = path.join(__dirname, '../../giveaways.json');
const GIVEAWAYS_DIR = path.join(__dirname, '../../giveaways');

// Ensure giveaways directory exists
if (!fs.existsSync(GIVEAWAYS_DIR)) {
    fs.mkdirSync(GIVEAWAYS_DIR, { recursive: true });
}

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
    name: 'addacc',
    description: 'Add account details to a giveaway',
    usage: 'addacc <giveaway_id> <account_details>',
    
    async execute(message, args) {
        // Delete the user's message to protect sensitive information
        try {
            await message.delete();
        } catch (error) {
            console.error('Failed to delete message:', error);
        }
        
        // Check if the required arguments are provided
        if (args.length < 2) {
            return message.author.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Missing Parameters')
                        .setDescription('Usage: `.addacc <giveaway_id> <account_details>`')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            }).catch(err => {
                console.error('Failed to send DM:', err);
            });
        }
        
        const giveawayId = args[0];
        const accountDetails = args.slice(1).join(' ');
        
        // Read the giveaways database
        const db = readGiveawaysDB();
        
        // Check if the giveaway exists
        if (!db.activeGiveaways[giveawayId]) {
            return message.author.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Invalid Giveaway ID')
                        .setDescription('The giveaway ID you provided does not exist.')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            }).catch(err => {
                console.error('Failed to send DM:', err);
            });
        }
        
        const giveaway = db.activeGiveaways[giveawayId];
        
        // Check if the user is the creator of the giveaway
        if (giveaway.creatorId !== message.author.id) {
            return message.author.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Permission Denied')
                        .setDescription('You can only add account details to giveaways you created.')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            }).catch(err => {
                console.error('Failed to send DM:', err);
            });
        }
        
        // Check if account details are already added
        if (giveaway.accountDetails) {
            return message.author.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.yellow)
                        .setTitle('Account Already Added')
                        .setDescription('Account details have already been added to this giveaway.')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            }).catch(err => {
                console.error('Failed to send DM:', err);
            });
        }
        
        // Save account details to a file
        const accountFilePath = path.join(GIVEAWAYS_DIR, `${giveawayId}.txt`);
        fs.writeFileSync(accountFilePath, accountDetails);
        
        // Update the giveaway status
        giveaway.accountDetails = accountFilePath;
        writeGiveawaysDB(db);
        
        // Confirm to the user
        return message.author.send({
            embeds: [
                new MessageEmbed()
                    .setColor(config.color.green)
                    .setTitle('Account Added')
                    .setDescription(`Account details for **${giveaway.accountName}** giveaway have been saved.`)
                    .addField('Giveaway ID', giveawayId)
                    .addField('Status', 'The giveaway is now ready. The winner will be selected when the timer ends.')
                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                    .setTimestamp()
            ]
        }).catch(err => {
            console.error('Failed to send DM:', err);
        });
    }
};