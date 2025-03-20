const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'netflixhelp',
    description: 'Displays usage information for the Netflix cookie checker',
    usage: 'netflixhelp',
    execute(message) {
        // Create an embed message with help information
        const helpEmbed = new MessageEmbed()
            .setColor(config.color?.red || '#FF0000')  // Netflix red color
            .setTitle('Netflix Cookie Checker - Help Guide')
            .setDescription('Learn how to use the Netflix cookie checker commands')
            .addFields(
                { 
                    name: '`.netflixcheck`',
                    value: 'Upload a file containing Netflix cookies to check.\n' +
                          'The checker will verify each cookie, categorize as premium/free/broken, and save valid cookies for future use.' 
                },
                {
                    name: '`.csend @user netflix`', 
                    value: 'Send a working Netflix cookie to a user.\n' +
                          'The bot will automatically select a valid cookie from premium accounts first.'
                },
                {
                    name: 'File Format',
                    value: 'The checker supports:\n' +
                          '• Netscape cookie format (`.txt`)\n' +
                          '• JSON cookie format (`.json`)\n' +
                          'Cookies are categorized by their plan (Premium, Standard, Basic) and saved in appropriate folders.'
                },
                {
                    name: 'Results',
                    value: 'After checking, you\'ll see:\n' +
                           '• Total cookies checked\n' +
                           '• Working premium cookies\n' +
                           '• Free/unsubscribed accounts\n' +
                           '• Failed/expired cookies\n' +
                           '• Details of found working accounts'
                }
            )
            .setFooter({ text: 'Netflix Cookie Checker by WRECKED G3N', iconURL: message.client.user.displayAvatarURL() })
            .setTimestamp();

        // Send the embed message
        message.channel.send({ embeds: [helpEmbed] });
    },
};