
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
                // Make sure the value doesn't exceed 1024 characters (Discord's limit)
                const value = folderCommands.join('\n\n');
                if (value.length <= 1024) {
                    embed.addFields([{ name: `# ${folder} Commands:`, value: value }]);
                } else {
                    // Split into multiple fields if too long
                    const chunks = [];
                    let currentChunk = "";
                    
                    for (const cmd of folderCommands) {
                        if ((currentChunk + "\n\n" + cmd).length > 1024) {
                            chunks.push(currentChunk);
                            currentChunk = cmd;
                        } else {
                            currentChunk += (currentChunk ? "\n\n" : "") + cmd;
                        }
                    }
                    
                    if (currentChunk) {
                        chunks.push(currentChunk);
                    }
                    
                    // Add the first chunk with the folder name
                    embed.addFields([{ name: `# ${folder} Commands:`, value: chunks[0] }]);
                    
                    // Add any additional chunks with continuation names
                    for (let i = 1; i < chunks.length; i++) {
                        embed.addFields([{ name: `# ${folder} Commands (continued ${i}):`, value: chunks[i] }]);
                    }
                }
            }
        }

        message.channel.send({ embeds: [embed] });
    }
};
