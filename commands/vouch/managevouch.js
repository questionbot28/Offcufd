// commands/vouch/managevouch.js
const Discord = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('vouches.db');
const config = require('../../config.json');

module.exports = {
    name: 'managevouch',
    description: 'Manage vouches for a user.',
   usage: 'managevouch <@user> <-number / +number>',
    execute(message, args, prefix) {
        // Check if the command is used in the specified vouch channel
        if (message.channel.id !== config.vouchChannelId) {
            return message.channel.send(`This command can only be used in <#${config.vouchChannelId}>.`);
        }

        if (!message.mentions.users.size || args.length < 2) {
            return message.channel.send(`Usage: ${prefix}managevouch @user {integer(+/-)}`);
        }

        const mentionedUser = message.mentions.users.first();
        const vouchChange = parseInt(args[1]);

        if (isNaN(vouchChange)) {
            return message.channel.send(`Please provide a valid integer for vouch change.`);
        }

        // Check if the user exists in the vouches table
        db.get('SELECT * FROM vouches WHERE user_id = ?', [mentionedUser.id], (err, row) => {
            if (err) {
                console.error('Error checking vouches:', err);
                return;
            }

            if (!row) {
                return message.channel.send(`The user ${mentionedUser.tag} does not have any vouches.`);
            }

            const newVouchCount = Math.max(0, row.vouches + vouchChange);

            // Update the vouch information
            db.run(`UPDATE vouches SET vouches = ? WHERE user_id = ?`, [newVouchCount, mentionedUser.id], (updateError) => {
                if (updateError) {
                    console.error('Error updating vouches:', updateError);
                    return;
                }

                const vouchEmbed = new Discord.MessageEmbed()
                    .setColor('#00ff00')
                    .setTitle('Vouch Management')
                    .setDescription(`Vouches for ${mentionedUser.tag} have been updated. New vouch count: ${newVouchCount}`);

                message.channel.send(vouchEmbed);
            });
        });
    },
};
