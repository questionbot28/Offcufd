// commands/help/spotifyhelp.js
const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'spotifyhelp',
    description: 'Display Spotify cookie checker help information',
    usage: 'spotifyhelp',
    
    execute(message) {
        const embed = new MessageEmbed()
            .setColor(config.color.blue)
            .setTitle('🎵 Spotify Cookie Checker Help')
            .setDescription('The Spotify cookie checker allows you to check the validity of Spotify cookies and determine their account types.')
            .addField('Commands', '`.spotifycheck` - Check Spotify cookies in an attached file')
            .addField('Supported File Types', '`.txt` - Text files containing Netscape cookies\n`.zip` - Zip archives containing cookie files\n`.rar` - RAR archives containing cookie files')
            .addField('How It Works',
                '1. Upload a file containing Spotify cookies with your command\n' +
                '2. The bot will download and process the file\n' +
                '3. The bot will recursively check all folders and nested archives\n' +
                '4. Valid cookies are categorized by account type (Premium, Family, etc.)\n' +
                '5. Results are displayed in the channel\n' +
                '6. Valid cookies are sent as a downloadable zip file'
            )
            .addField('Example', 'Type `.spotifycheck` and attach your cookie file')
            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTimestamp();
            
        message.channel.send({ embeds: [embed] });
    }
};