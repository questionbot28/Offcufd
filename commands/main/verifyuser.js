const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const fsSync = require('fs');

// Function to add a username to verified.txt
async function addVerifiedUser(username) {
    try {
        // Make sure username is valid
        if (!username || typeof username !== 'string' || username.trim() === '') {
            console.error('Invalid username received:', username);
            return false;
        }
        
        // Clean username (remove special characters, etc.)
        const cleanUsername = username.trim();
        
        // Check if file exists, create it if not
        if (!fsSync.existsSync('./verified.txt')) {
            await fs.writeFile('./verified.txt', '', 'utf8');
            console.log('Created verified.txt file');
        }
        
        // Read current verified users
        const verifiedContent = await fs.readFile('./verified.txt', 'utf8');
        const verifiedUsers = verifiedContent.split('\n').filter(line => line.trim() !== '');
        
        // Check if user is already verified
        if (verifiedUsers.includes(cleanUsername)) {
            console.log(`User ${cleanUsername} is already verified`);
            return false;
        }
        
        // Add user to verified.txt
        verifiedUsers.push(cleanUsername);
        await fs.writeFile('./verified.txt', verifiedUsers.join('\n'), 'utf8');
        console.log(`Added ${cleanUsername} to verified users`);
        return true;
    } catch (error) {
        console.error('Error adding verified user:', error);
        return false;
    }
}

module.exports = {
    name: 'verifyuser',
    description: 'Verifies a user by sending their username to the verification webhook',
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
            return message.reply('Please provide a username to verify.');
        }

        // Get the username from arguments
        const username = args.join(' ');

        // Webhook URL
        const webhookUrl = 'https://canary.discord.com/api/webhooks/1349015725062230139/bMmLGN2nRQ7BybPYCNuNzqt3Lv2kUYD2M6Iycyr_0SPf_QZHGhbLGE6gwWscWqTDiRRt';

        try {
            // Send the username to the webhook
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: username,
                    username: 'Verification Bot'
                }),
            });

            if (!response.ok) {
                throw new Error(`Error sending to webhook: ${response.status} ${response.statusText}`);
            }

            // Add user to verified.txt directly as well (as backup)
            await addVerifiedUser(username);

            // Create success embed
            const embed = new MessageEmbed()
                .setColor(config.color?.green || '#00ff00')
                .setTitle('User Verified')
                .setDescription(`Successfully verified user: **${username}**\n\nThis user has been added to the verified list and can now use services.`)
                .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                .setTimestamp();

            message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error in verifyuser command:', error);
            message.reply(`Error verifying user: ${error.message}`);
        }
    }
};