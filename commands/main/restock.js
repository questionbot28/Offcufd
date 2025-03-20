// restock.js

const fs = require('fs');
const config = require('../../config.json');
const Discord = require('discord.js');

module.exports = {
    name: 'restock',
    description: 'Restock a service in the specified category',
  usage: 'restock <free/prem/boost/basic> <service name>',
    execute: async (message, args, usedPrefix) => {
        // Check if the user has admin permissions
        if (!config.adminUserIds.includes(message.author.id)) {
            return message.reply('You do not have the necessary permissions to use this command.');
        }

        // Check if the command has the correct number of arguments
        if (args.length !== 2) {
            return message.reply('Please provide the correct arguments. Usage: `restock (free/prem/boost/basic) [fileName]`.');
        }

        const keyword = args[0].toLowerCase();

          if (['free', 'premium', 'boost', 'basic', 'cookie', 'extreme'].includes(keyword)) {
            try {
                const folderType = getFolderType(keyword);
                const fileName = getFileName(args[1]);
                const content = generateRandomContent(10000);
                const filePath = `./${folderType}/${fileName}`;

                fs.appendFileSync(filePath, content);

                sendMessage(message, keyword, fileName);

                message.reply(`Service ${fileName} restocked successfully in the ${folderType} folder.`);
            } catch (error) {
                console.error(error);
                message.reply('An error occurred while restocking the service.');
            }
        } else {
            return message.channel.send(
                new Discord.MessageEmbed()
                    .setColor(config.color.red)
                    .setTitle('Invalid keyword!')
                    .setDescription('You need to specify a valid keyword ("free", "premium", "boost", or "basic").')
                    .setFooter(message.author.tag, message.author.displayAvatarURL({ dynamic: true, size: 64 }))
                    .setTimestamp()
            );
        }
    },
};
function getFolderType(keyword) {
    switch (keyword) {
        case 'free':
            return 'stock';
        case 'premium':
            return 'stock';
        case 'boost':
            return 'bstock';
        case 'basic':
            return 'basicstock';
        case 'cookie':
            return 'cookies';
        case 'extreme':
            return 'extreme';
        default:
            return '';
    }
}

function getFileName(userProvidedFileName) {
    return userProvidedFileName ? `${userProvidedFileName.toLowerCase()}.txt` : generateRandomFileName();
}

function generateRandomFileName() {
    const randomString = Math.random().toString(36).substring(2, 7);
    return `${randomString}.txt`;
}

function generateRandomContent(lines) {
    let content = '';
    for (let i = 0; i < lines; i++) {
        const randomString = Math.random().toString(36).substring(2, 7);
        content += `${randomString}\n`;
    }
    return content;
}

function sendMessage(message, keyword, fileName) {
    const channelID = config.stockid;
    const categoryChannel = message.guild.channels.cache.get(channelID);

    if (categoryChannel && categoryChannel instanceof Discord.TextChannel) {
        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Service Restocked!')
            .setDescription(`The service **${fileName.replace('.txt', '')}** has been restocked in the **${keyword}** category.`);

        categoryChannel.send(embed);
    } else {
        console.error(`Channel with ID ${channelID} not found or not a text channel.`);
    }
}
