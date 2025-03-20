// commands/vouch/top.js
const Discord = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('vouches.db');
const config = require('../../config.json');

module.exports = {
    name: 'top',
    description: 'Display the top users with the most vouches.',
    execute(message) {
        // Retrieve the top ten users with the most vouches from the database
        db.all('SELECT user_id, vouches FROM vouches ORDER BY vouches DESC LIMIT 10', [], (err, rows) => {
            if (err) {
                console.error(`Error retrieving top users: ${err.message}`);
                return;
            }

            // Create an embed to display the top users
            const embed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Top 10 Users with Most Vouches')
                .setDescription('Here are the top 10 users with the most vouches:')
                .addField('Rank', rows.map((row, index) => `#${index + 1}`), true)
                .addField('User', rows.map(row => `<@${row.user_id}>`), true)
                .addField('Vouches', rows.map(row => row.vouches), true)
                .setTimestamp();

            message.channel.send(embed);
        });
    },
};
