const fs = require('fs');
const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'estock',
    description: 'EXTREME stock',
    usage: 'estock',

    execute: function (message, args, usedPrefix) {
        const folderType = 'extreme';
        const folderPath = `${__dirname}/../../${folderType}/`;

        try {
            const fileNames = fs.readdirSync(folderPath)
                .filter(file => file.endsWith('.txt'))
                .map(file => file.slice(0, -4)); // Remove the '.txt' extension

            if (fileNames.length > 0) {
                const embed = new MessageEmbed()
                    .setColor(config.color.blue)
                    .setTitle(`List of Services in ${folderType} Category`)
                    .setDescription(fileNames.join('\n'))
                    .setFooter(message.author.tag, message.author.displayAvatarURL({ dynamic: true, size: 64 }))
                    .setTimestamp();

                message.channel.send(embed);
            } else {
                message.channel.send(
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('No Services Found!')
                        .setDescription(`There are no services in the ${folderType} category.`)
                        .setFooter(message.author.tag, message.author.displayAvatarURL({ dynamic: true, size: 64 }))
                        .setTimestamp()
                );
            }
        } catch (error) {
            console.error(error);
            message.channel.send(
                new MessageEmbed()
                    .setColor(config.color.red)
                    .setTitle('An error occurred!')
                    .setDescription('An error occurred while processing the command.')
                    .setFooter(message.author.tag, message.author.displayAvatarURL({ dynamic: true, size: 64 }))
                    .setTimestamp()
            );
        }
    },
};
