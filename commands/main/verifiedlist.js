const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');
const fsSync = require('fs');
const fs = require('fs').promises;

module.exports = {
    name: 'verifiedlist',
    description: 'Shows the list of verified users',
    async execute(message, args) {
        // Check if user has admin permission
        if (!message.member.permissions.has('ADMINISTRATOR') && 
            !message.member.roles.cache.some(role => 
                config.staffRoleIds && config.staffRoleIds.includes(role.id)
            )) {
            return message.reply('You do not have permission to use this command.');
        }

        try {
            // Check if verified.txt exists
            if (!fsSync.existsSync('./verified.txt')) {
                return message.reply('There are no verified users yet.');
            }
            
            const content = await fs.readFile('./verified.txt', 'utf8');
            const verifiedUsers = content.split('\n').filter(line => line.trim() !== '');
            
            if (verifiedUsers.length === 0) {
                return message.reply('There are no verified users yet.');
            }
            
            // Format the list with numbers
            const formattedList = verifiedUsers.map((user, index) => `${index + 1}. ${user}`).join('\n');
            
            // Split into chunks if too long
            const chunks = [];
            let currentChunk = '';
            
            for (const line of formattedList.split('\n')) {
                if (currentChunk.length + line.length + 1 > 2000) {
                    chunks.push(currentChunk);
                    currentChunk = line;
                } else {
                    currentChunk += (currentChunk ? '\n' : '') + line;
                }
            }
            
            if (currentChunk) {
                chunks.push(currentChunk);
            }
            
            // Create embeds for each chunk
            const embeds = chunks.map((chunk, index) => {
                return new MessageEmbed()
                    .setColor(config.color?.blue || '#0099ff')
                    .setTitle(`Verified Users (${verifiedUsers.length})${chunks.length > 1 ? ` - Part ${index + 1}/${chunks.length}` : ''}`)
                    .setDescription(chunk)
                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                    .setTimestamp();
            });
            
            // Send each embed
            for (const embed of embeds) {
                await message.channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error fetching verified users:', error);
            message.reply(`Error fetching verified users: ${error.message}`);
        }
    }
};