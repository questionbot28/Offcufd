const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'help',
    description: 'Display the command list.',
    usage: 'help',

    execute(message, usedPrefix) {
        const helpEmbed = new MessageEmbed()
            .setColor(config.color.default)
            .setTitle('Command List')
            .setDescription('Here are the available commands:')
            .addField('Account Generation', 
                `\`\`.bgen\`\`: Generate a specified basic service if stocked
\`\`.bsgen\`\`: Generate a specified booster service if stocked
\`\`.fgen\`\`: Generate a specified free service if stocked
\`\`.gen\`\`: Generate a specified premium service if stocked
\`\`.cgen\`\`: Generate a specified cookie if stocked
\`\`.egen\`\`: Generate a specified extreme service if stocked`)
            .addField('Stock Commands', 
                `\`\`.stock\`\`: Display all service stock
\`\`.bstock\`\`: Display basic stock
\`\`.fstock\`\`: Display free stock
\`\`.cstock\`\`: Display cookie stock
\`\`.estock\`\`: Display extreme stock`)
            .addField('Drop System', 
                `\`\`.drop <tier>\`\`: Claim an account during a drop session
\`\`.dropstats\`\`: Check drop statistics and timers
\`\`=drophelp\`\`: Show detailed help for the drop system`)
            .addField('Vouch System', 
                `\`\`+vouch @user\`\`: Add a positive vouch for a user
\`\`-vouch @user\`\`: Add a negative vouch for a user
\`\`+profile @user\`\`: View a user's vouch profile`)
            .addField('AI Chat System', 
                `\`\`.chat <message>\`\`: Chat with the AI in the current channel
\`\`.chatdm <message>\`\`: Start a private chat with the AI in DMs
\`\`=chathelp\`\`: Show detailed help for the AI chat features
\`\`=naturalchathelp\`\`: Learn how to talk to the bot naturally without commands`)
            .addField('Help Commands', 
                `\`\`=help\`\`: Display this command list
\`\`=cookie\`\`: Show cookie help
\`\`=spotifyhelp\`\`: Show Spotify checker help
\`\`=netflixhelp\`\`: Show Netflix checker help
\`\`=allhelp\`\`: Show detailed help for all commands`)
            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
            .setTimestamp();

        message.channel.send({ embeds: [helpEmbed] });
    },
};
