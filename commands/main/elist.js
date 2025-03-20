const fs = require('fs').promises;
const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'elist',
    description: 'Show all users and their services in extremegive',
    usage: 'elist',
    async execute(message) {
        try {
            // Read the content of extremegive.txt
            const filePath = `${__dirname}/../../extremegive/extremegive.txt`;
            const data = await fs.readFile(filePath, 'utf8');

            // Split the data into lines
            const lines = data.split('\n');

            // Create an embed to display user services
            const embed = new MessageEmbed()
                .setColor(config.color.blue)
                .setTitle('Extreme Give User List')
                .setDescription('List of users and their services in extremegive');

            // Create fields array for the embed
            const fields = [];
            
            // Add each user and their service to the fields array
            lines.forEach((line) => {
                const trimmedLine = line.trim();
                if (trimmedLine !== '') {
                    const parts = trimmedLine.split(' - ');
                    if (parts.length === 2) {
                        const username = parts[0].trim();
                        const service = parts[1].trim();
                        fields.push({ name: username, value: service, inline: true });
                    }
                }
            });
            
            // Add fields to the embed
            embed.addFields(fields);

            // Send the embed to the channel
            message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error(`Error processing the command: ${error}`);
            return message.channel.send('Error processing the command.');
        }
    },
};
