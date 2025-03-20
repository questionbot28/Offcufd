const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');
const fs = require('fs').promises;
const fsSync = require('fs');

// Function to remove a username from verified.txt
async function removeVerifiedUser(username) {
    try {
        // Check if file exists
        if (!fsSync.existsSync('./verified.txt')) {
            console.log('verified.txt does not exist, nothing to remove');
            return false;
        }
        
        // Make sure username is valid
        if (!username || typeof username !== 'string' || username.trim() === '') {
            console.error('Invalid username for removal:', username);
            return false;
        }
        
        // Clean username
        const cleanUsername = username.trim();
        
        // Read current verified users
        const verifiedContent = await fs.readFile('./verified.txt', 'utf8');
        const verifiedUsers = verifiedContent.split('\n').filter(line => line.trim() !== '');
        
        // Check if user is in the verified list
        if (!verifiedUsers.includes(cleanUsername)) {
            console.log(`User ${cleanUsername} is not in verified list`);
            return false;
        }
        
        // Remove user from verified.txt
        const updatedList = verifiedUsers.filter(user => user !== cleanUsername);
        await fs.writeFile('./verified.txt', updatedList.join('\n'), 'utf8');
        console.log(`Removed ${cleanUsername} from verified users`);
        return true;
    } catch (error) {
        console.error('Error removing verified user:', error);
        return false;
    }
}

module.exports = {
    name: 'unverify',
    description: 'Removes a user from the verified list',
    async execute(message, args) {
        // Check if user has admin permission
        if (!message.member.permissions.has('ADMINISTRATOR') && 
            !message.member.roles.cache.some(role => 
                config.staffRoleIds && config.staffRoleIds.includes(role.id)
            )) {
            return message.reply('You do not have permission to use this command.');
        }

        // Check if a username was provided
        if (!args.length) {
            return message.reply('Please provide a username to unverify.');
        }

        // Get the username from arguments
        const username = args.join(' ');
        
        try {
            const removed = await removeVerifiedUser(username);
            
            if (removed) {
                const embed = new MessageEmbed()
                    .setColor(config.color?.green || '#00ff00')
                    .setTitle('User Unverified')
                    .setDescription(`Successfully removed **${username}** from the verified list.`)
                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                    .setTimestamp();
                    
                message.channel.send({ embeds: [embed] });
            } else {
                const embed = new MessageEmbed()
                    .setColor(config.color?.red || '#ff0000')
                    .setTitle('Unverify Failed')
                    .setDescription(`Could not remove **${username}** from the verified list. They may not be verified.`)
                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                    .setTimestamp();
                    
                message.channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error unverifying user:', error);
            message.reply(`Error unverifying user: ${error.message}`);
        }
    }
};