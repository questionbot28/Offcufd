
const Discord = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('vouches.db');
const fs = require('fs');

module.exports = {
    name: 'profile',
    description: 'View vouch profile',
    async execute(message, args) {
        const target = message.mentions.users.first() || message.author;
        
        // Check if user is verified
        const verifiedUsers = fs.readFileSync('verified.txt', 'utf8').split('\n');
        const isVerified = verifiedUsers.some(user => 
            user.toLowerCase().trim() === target.username.toLowerCase().trim()
        );

        if (!isVerified) {
            return message.reply('This user is not verified. They need to use `.verify` command first.');
        }

        db.get('SELECT vouches, negvouches, todayvouches, last3daysvouches, lastweekvouches FROM vouches WHERE user_id = ?', [target.id], (err, row) => {
            if (err) {
                console.error(err);
                return message.reply('An error occurred while fetching the profile.');
            }

            const embed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle(`Vouch Profile - ${target.tag}`)
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .addField('✅ Positive Vouches', row ? row.vouches.toString() : '0', true)
                .addField('❌ Negative Vouches', row ? row.negvouches.toString() : '0', true)
                .addField('\u200B', '\u200B', true)
                .addField('Today\'s Vouches', row ? row.todayvouches.toString() : '0', true)
                .addField('Last 3 Days', row ? row.last3daysvouches.toString() : '0', true)
                .addField('Last Week', row ? row.lastweekvouches.toString() : '0', true)
                .setFooter({ text: `✓ Verified User` })
                .setTimestamp();

            message.channel.send({ embeds: [embed] });
        });
    },
};
