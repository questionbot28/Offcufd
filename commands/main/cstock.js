const fs = require('fs');
const path = require('path');
const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'cstock',
    description: 'Shows cookie stock count',
    usage: 'cstock',

    execute: function (message, args) {
        try {
            const cookiesPath = path.join(__dirname, '../../cookies/');
            const services = [
                { name: 'Netflix', file: 'netflix.txt' },
                { name: 'Spotify', file: 'spotify.txt' },
                { name: 'Amazon Prime', file: 'amazonprime.txt' },
                { name: 'Gmail', file: 'gmail.txt' },
                { name: 'Instagram', file: 'instagram.txt' },
                { name: 'Phub', file: 'phub.txt' },
                { name: 'Steam', file: 'steam.txt' },
                { name: 'TikTok', file: 'tiktok.txt' },
                { name: 'Twitch', file: 'twitch.txt' }
            ];
            
            let totalCount = 0;
            let description = '';
            
            // Get the count of cookies for each service
            for (const service of services) {
                let count = 0;
                try {
                    const filePath = path.join(cookiesPath, service.file);
                    if (fs.existsSync(filePath)) {
                        const content = fs.readFileSync(filePath, 'utf8');
                        const lines = content.split('\n');
                        count = lines.filter(line => line.trim() !== '').length;
                        console.log(`${service.name} count: ${count}`);
                    } else {
                        console.log(`${service.name} cookie file not found`);
                    }
                } catch (error) {
                    console.error(`Error reading ${service.name} file:`, error);
                }
                
                totalCount += count;
                description += `**${service.name}**: \`${count}\` items\n`;
            }

            // Check family_premium folder if it exists
            try {
                const familyPath = path.join(cookiesPath, 'family_premium');
                if (fs.existsSync(familyPath) && fs.statSync(familyPath).isDirectory()) {
                    const familyFiles = fs.readdirSync(familyPath).filter(file => 
                        fs.statSync(path.join(familyPath, file)).isFile());
                    const familyCount = familyFiles.length;
                    totalCount += familyCount;
                    description += `**Family Premium**: \`${familyCount}\` items\n`;
                }
            } catch (error) {
                console.error('Error reading Family Premium folder:', error);
            }

            const embed = new MessageEmbed()
                .setColor(config.color.blue)
                .setTitle('🍪 Cookie Stock')
                .setDescription(`Total items: \`${totalCount}\`\n\n${description}`)
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