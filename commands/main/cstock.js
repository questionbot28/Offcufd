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
            // Check for cookie files in main Netflix and Spotify directories
            const rootPath = path.join(__dirname, '../../');
            const services = [
                { name: 'Netflix', dir: 'netflix' },
                { name: 'Spotify', dir: 'spotify' }
            ];
            
            let totalCount = 0;
            let description = '';
            
            // Count .txt files in each service directory
            for (const service of services) {
                let count = 0;
                try {
                    const servicePath = path.join(rootPath, service.dir);
                    if (fs.existsSync(servicePath) && fs.statSync(servicePath).isDirectory()) {
                        const getAllFiles = function(dirPath, arrayOfFiles) {
                            const files = fs.readdirSync(dirPath);
                            
                            arrayOfFiles = arrayOfFiles || [];
                            
                            files.forEach(function(file) {
                                const filePath = path.join(dirPath, file);
                                if (fs.statSync(filePath).isDirectory()) {
                                    arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
                                } else if (file.endsWith('.txt')) {
                                    arrayOfFiles.push(filePath);
                                }
                            });
                            
                            return arrayOfFiles;
                        };
                        
                        const cookieFiles = getAllFiles(servicePath);
                        count = cookieFiles.length;
                        console.log(`${service.name} cookie count: ${count}`);
                    } else {
                        console.log(`${service.name} directory not found`);
                    }
                } catch (error) {
                    console.error(`Error reading ${service.name} directory:`, error);
                }
                
                totalCount += count;
                description += `**${service.name}**: \`${count}\` cookies\n`;
            }

            const embed = new MessageEmbed()
                .setColor(config.color.blue)
                .setTitle('🍪 Cookie Stock')
                .setDescription(`Total cookies: \`${totalCount}\`\n\n${description}`)
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