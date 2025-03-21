const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'mshelp',
    description: 'Displays help information for Microsoft account checker',
    usage: 'mshelp',

    execute(message) {
        const embed = new MessageEmbed()
            .setColor(config.color?.primary || '#0099ff')
            .setTitle('Microsoft Account Checker Commands')
            .setDescription('Commands to check and validate Microsoft accounts.')
            .addFields(
                { 
                    name: '.mscheck [threads] {.txt attachment}', 
                    value: 'Upload and check Microsoft accounts for Minecraft, Xbox Game Pass, and more.\n' +
                           'Attach a .txt file with email:password combinations.\n' +
                           'Optionally specify number of threads (default: 100)'
                },
                {
                    name: 'What can it find?',
                    value: '• Valid Microsoft accounts\n' +
                           '• Microsoft accounts with valid email access\n' +
                           '• Minecraft accounts\n' +
                           '• Xbox Game Pass subscriptions\n' +
                           '• Xbox Game Pass Ultimate subscriptions\n' +
                           '• Hypixel information (if available)\n' +
                           '• Name change eligibility\n' +
                           '• Minecraft capes'
                },
                {
                    name: 'Examples',
                    value: '`.mscheck` - Check with attachment using default threads\n' +
                           '`.mscheck 200` - Check with attachment using 200 threads'
                }
            )
            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    },
};