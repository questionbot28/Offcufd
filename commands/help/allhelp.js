
const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'allhelp',
    description: 'Display the all command list.',
    usage: 'allhelp',
    execute(message) {
        const embed = new MessageEmbed()
            .setColor('#0099ff')
            .setTitle('📜 All Available Commands')
            .setDescription('Here is a list of all available commands:');

        // Get all command folders
        const commandFolders = fs.readdirSync('./commands');
        
        // Process each folder
        for (const folder of commandFolders) {
            const commandFiles = fs.readdirSync(`./commands/${folder}`).filter(file => file.endsWith('.js'));
            let folderCommands = [];

            for (const file of commandFiles) {
                const command = require(`../${folder}/${file}`);
                if (command.name && command.usage) {
                    folderCommands.push(`**${command.prefix || ''}${command.name}**: ${command.description || 'No description available'}\nUsage: ${command.prefix || ''}${command.usage}`);
                }
            }

            if (folderCommands.length > 0) {
                embed.addField(`# ${folder} Commands:`, folderCommands.join('\n\n'));
            }
        }

        message.channel.send({ embeds: [embed] });
    }
};
