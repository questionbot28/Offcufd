const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');
const fsSync = require('fs');
const fs = require('fs').promises;

// Function to check if a username is verified
async function isVerified(username) {
    try {
        // Check if verified.txt exists
        if (!fsSync.existsSync('./verified.txt')) {
            console.log('verified.txt does not exist, no verified users');
            return false;
        }
        
        const content = await fs.readFile('./verified.txt', 'utf8');
        const verifiedUsers = content.split('\n').filter(line => line.trim() !== '');
        
        return verifiedUsers.includes(username.trim());
    } catch (error) {
        console.error('Error checking if user is verified:', error);
        return false;
    }
}

module.exports = {
    name: 'checkverify',
    description: 'Checks if a user is verified',
    async execute(message, args) {
        // Check if a username was provided
        if (!args.length) {
            // If no args, check the message author
            const verified = await isVerified(message.author.username);
            
            const embed = new MessageEmbed()
                .setColor(verified ? (config.color?.green || '#00ff00') : (config.color?.red || '#ff0000'))
                .setTitle('Verification Status')
                .setDescription(`User **${message.author.username}** is ${verified ? '✅ verified' : '❌ not verified'}.`)
                .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                .setTimestamp();
                
            return message.channel.send({ embeds: [embed] });
        }
        
        // If args provided, check if user has staff permission
        if (!message.member.permissions.has('ADMINISTRATOR') && 
            !message.member.roles.cache.some(role => 
                config.staffRoleIds && config.staffRoleIds.includes(role.id)
            )) {
            return message.reply('You do not have permission to check verification status of other users.');
        }

        // Get the username from arguments
        const username = args.join(' ');
        
        try {
            const verified = await isVerified(username);
            
            const embed = new MessageEmbed()
                .setColor(verified ? (config.color?.green || '#00ff00') : (config.color?.red || '#ff0000'))
                .setTitle('Verification Status')
                .setDescription(`User **${username}** is ${verified ? '✅ verified' : '❌ not verified'}.`)
                .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                .setTimestamp();
                
            message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error checking verification status:', error);
            message.reply(`Error checking verification status: ${error.message}`);
        }
    }
};