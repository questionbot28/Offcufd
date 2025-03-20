const fs = require('fs');
const config = require('../../config.json');
const Discord = require('discord.js');

module.exports = {
    name: 'create',
    description: 'Create a service in the specified category',
    usage: 'create <free/basic/boost/premium/cookie/extreme> <servicename>',

    execute: async (message, args, usedPrefix) => {
        // Check if the user has the restock role
        const restockRoleId = config.restockroleid;
        if (!message.member.roles.cache.has(restockRoleId) && !message.member.permissions.has('ADMINISTRATOR')) {
            return message.reply('You do not have the necessary permissions to use this command.');
        }

        // Check if the command has the correct number of arguments
        if (args.length < 1 || args.length > 2) {
            return message.reply('Please provide the correct arguments. Usage: `create (free/prem/boost/basic/cookie/extreme) [fileName]`.');
        }

        const keyword = args[0].toLowerCase();

        if (['free', 'premium', 'boost', 'basic', 'cookie', 'extreme'].includes(keyword)) {
            try {
                const folderType = getFolderType(keyword);
                const fileName = getFileName(args[1]);
                const content = generateRandomContent(10000);
                const filePath = `./${folderType}/${fileName}`;

                fs.writeFileSync(filePath, content);

                sendMessage(message, keyword, fileName);

                // Use a private ephemeral message that only the command user can see
                message.author.send(`File ${fileName} created successfully in the ${folderType} folder.`).catch(e => {
                    console.error('Could not send DM to user:', e);
                });
                
                // Delete the original command message if possible
                if (message.deletable) {
                    await message.delete().catch(e => console.error('Could not delete command message:', e));
                }
            } catch (error) {
                console.error(error);
                
                // Send error via DM to keep it private
                message.author.send('An error occurred while creating the file.').catch(e => {
                    console.error('Could not send DM to user:', e);
                });
                
                // Delete the original command message if possible
                if (message.deletable) {
                    await message.delete().catch(e => console.error('Could not delete command message:', e));
                }
            }
        } else {
            // Send error via DM to keep it private
            message.author.send({
                embeds: [
                    new Discord.MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Invalid keyword!')
                        .setDescription('You need to specify a valid keyword ("free", "premium", "boost", "basic", "cookie", or "extreme").')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
                        .setTimestamp()
                ]
            }).catch(e => {
                console.error('Could not send DM to user:', e);
            });
            
            // Delete the original command message if possible
            if (message.deletable) {
                await message.delete().catch(e => console.error('Could not delete command message:', e));
            }
            
            return;
        }
    },
};

function getFolderType(keyword) {
    switch (keyword) {
        case 'free':
            return 'fstock';
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
            .setTitle('Service Created!')
            .setDescription(`The service **${fileName.replace('.txt', '')}** has been created in the **${keyword}** category.`);

        categoryChannel.send({ embeds: [embed] });
    } else {
        console.error(`Channel with ID ${channelID} not found or not a text channel.`);
    }
}
