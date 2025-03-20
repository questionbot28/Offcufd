
const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const config = require('../../config.json');

module.exports = {
    name: 'check',
    description: 'Check if a user is verified',
    usage: 'check <@user>',
    execute(message, args, usedPrefix) {
        try {
            // Check if the user has mentioned someone
            const targetUser = message.mentions.users.first();

            if (!targetUser) {
                return message.reply({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setDescription('Please mention a user to check.')
                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                    ]
                });
            }

            // Read the contents of the log file
            const logPath = 'verified.txt';
            if (!fs.existsSync(logPath)) {
                fs.writeFileSync(logPath, '', 'utf8');
            }

            const logContent = fs.readFileSync(logPath, 'utf8').split('\n');
            const isVerified = logContent.some(line => line.includes(targetUser.username));

            const embed = new MessageEmbed()
                .setColor(isVerified ? config.color.green : config.color.red)
                .setTitle(`Verification Status for ${targetUser.tag}`)
                .setDescription(isVerified ? '✅ User is verified' : '❌ User is not verified')
                .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) });

            message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error in check command:', error);
            message.channel.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setDescription('An error occurred while checking verification status.')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                ]
            });
        }
    },
};
