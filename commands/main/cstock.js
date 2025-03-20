const fs = require('fs');
const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'cstock',
    description: 'Shows cookie stock count',
    usage: 'cstock',

    execute: function (message, args) {
        try {
            const cookiesPath = `${__dirname}/../../cookies/`;
            let netflixCount = 0;
            let spotifyCount = 0;

            // Read the Netflix and Spotify files if they exist
            try {
                if (fs.existsSync(`${cookiesPath}netflix.txt`)) {
                    const netflixContent = fs.readFileSync(`${cookiesPath}netflix.txt`, 'utf8');
                    netflixCount = netflixContent.split('\n').filter(line => line.trim() !== '').length;
                }
            } catch (error) {
                console.error('Error reading Netflix file:', error);
            }

            try {
                if (fs.existsSync(`${cookiesPath}spotify.txt`)) {
                    const spotifyContent = fs.readFileSync(`${cookiesPath}spotify.txt`, 'utf8');
                    spotifyCount = spotifyContent.split('\n').filter(line => line.trim() !== '').length;
                }
            } catch (error) {
                console.error('Error reading Spotify file:', error);
            }

            const totalCount = netflixCount + spotifyCount;

            const embed = new MessageEmbed()
                .setColor(config.color.blue)
                .setTitle('🍪 Cookie Stock')
                .setDescription(`Total items: \`${totalCount}\`\n\n**Netflix**: \`${netflixCount}\` items\n**Spotify**: \`${spotifyCount}\` items`)
                .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                .setTimestamp();

            message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error in cstock command:', error);
            message.channel.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Error')
                        .setDescription('An error occurred while checking the cookie stock.')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                ]
            });
        }
    },
};