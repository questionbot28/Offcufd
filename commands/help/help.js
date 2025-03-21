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
            .addFields(
                {
                    name: 'Account Generation', 
                    value: `\`\`.bgen\`\`: Generate a specified basic service if stocked
\`\`.bsgen\`\`: Generate a specified booster service if stocked
\`\`.fgen\`\`: Generate a specified free service if stocked
\`\`.gen\`\`: Generate a specified premium service if stocked
\`\`.cgen\`\`: Generate a specified cookie if stocked
\`\`.egen\`\`: Generate a specified extreme service if stocked`
                },
                {
                    name: 'Stock Commands', 
                    value: `\`\`.stock\`\`: Display all service stock
\`\`.bstock\`\`: Display basic stock
\`\`.fstock\`\`: Display free stock
\`\`.cstock\`\`: Display cookie stock
\`\`.estock\`\`: Display extreme stock`
                },
                {
                    name: 'Verification System',
                    value: `\`\`=verify\`\`: Shows how to verify your account
\`\`.checkverify [username]\`\`: Check if a user is verified
\`\`.verifyuser <username>\`\`: (Staff only) Manually verify a user
\`\`.unverify <username>\`\`: (Staff only) Remove a user from verified list
\`\`.verifiedlist\`\`: (Staff only) View all verified users`
                },
                {
                    name: 'Drop System', 
                    value: `\`\`.drop <tier>\`\`: Claim an account during a drop session
\`\`.dropstats\`\`: Check drop statistics and timers
\`\`=drophelp\`\`: Show detailed help for the drop system`
                },
                {
                    name: 'Vouch System', 
                    value: `\`\`+vouch @user\`\`: Add a positive vouch for a user
\`\`-vouch @user\`\`: Add a negative vouch for a user
\`\`+profile @user\`\`: View a user's vouch profile`
                },
                {
                    name: 'AI Chat System', 
                    value: `\`\`.chat <message>\`\`: Chat with the AI in the current channel
\`\`.chatdm <message>\`\`: Start a private chat with the AI in DMs
\`\`=chathelp\`\`: Show detailed help for the AI chat features
\`\`=naturalchathelp\`\`: Learn how to talk to the bot naturally without commands`
                },
                {
                    name: 'Cookie & File Management',
                    value: `\`\`.c-upload\`\`: Upload and check cookie files
\`\`.checkcookie\`\`: Check all cookies in the database
\`\`.netflixcheck\`\`: Run the Netflix cookie checker
\`\`.spotifycheck\`\`: Run the Spotify cookie checker
\`\`=cookie\`\`: Show cookie help`
                },
                {
                    name: 'Account Checking',
                    value: `\`\`.mscheck\`\`: Check Microsoft accounts for Minecraft, Xbox Game Pass, etc.
\`\`=mshelp\`\`: Show Microsoft account checker help`
                },
                {
                    name: 'Help Commands', 
                    value: `\`\`=help\`\`: Display this command list
\`\`=spotifyhelp\`\`: Show Spotify checker help
\`\`=netflixhelp\`\`: Show Netflix checker help
\`\`=mshelp\`\`: Show Microsoft account checker help
\`\`=allhelp\`\`: Show detailed help for all commands`
                }
            )
            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
            .setTimestamp();

        message.channel.send({ embeds: [helpEmbed] });
    },
};
