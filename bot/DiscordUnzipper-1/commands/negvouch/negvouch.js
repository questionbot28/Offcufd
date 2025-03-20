// commands/negvouch/negvouch.js
const Discord = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('vouches.db');
const config = require('../../config.json');

module.exports = {
    name: 'negvouch',
    description: 'Negative vouch a user.',
    usage: 'negvouch <@user> {reason}',
    execute(message, args, prefix) {
        // Check if the command is used in the specified vouch channel
        if (message.channel.id !== config.vouchChannelId) {
            return message.channel.send(`This command can only be used in <#${config.vouchChannelId}>.`);
        }

        if (!message.mentions.users.size) {
            return message.channel.send(`Usage: ${prefix}negvouch @user {reason}`);
        }

        const mentionedUser = message.mentions.users.first();
        const reason = args.slice(1).join(' ');

        db.run(`INSERT OR IGNORE INTO vouches (user_id) VALUES (?)`, [mentionedUser.id]);
        db.run(`UPDATE vouches SET negvouches = negvouches + 1, todayvouches = todayvouches + 1, last3daysvouches = last3daysvouches + 1, lastweekvouches = lastweekvouches + 1 WHERE user_id = ?`, [mentionedUser.id]);
        db.run(`UPDATE vouches SET reasons = json_insert(reasons, '$[0]', ?) WHERE user_id = ?`, [reason, mentionedUser.id]);

        const ouchEmbed = new Discord.MessageEmbed()
            .setColor('#ff0000')
            .setTitle('❌ Negative Review')
            .setDescription(`Successfully left a negative review for ${mentionedUser.tag} ${reason ? `with reason: ${reason}` : ''}`);

        message.channel.send(ouchEmbed);
    },
};