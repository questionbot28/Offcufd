const Discord = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('vouches.db');
const cooldowns = new Map();
const config = require('../../config.json');

module.exports = {
    name: 'vouch',
    description: 'Vouch for a user.',
    usage: 'vouch <@user> {reason}',
    execute(message, args, prefix) {
        // Check if the command is used in the specified vouch channel
        if (message.channel.id !== config.vouchChannelId) {
            return message.channel.send(`This command can only be used in <#${config.vouchChannelId}>.`);
        }

        const mentionedUser = message.mentions.users.first();

        if (!mentionedUser) {
            return message.channel.send(`Usage: ${prefix}vouch @user {reason}`);
        }

        // Check cooldown
        const userId = message.author.id;
        const cooldownTime = 40 * 60 * 1000; // 40 minutes in milliseconds

        if (cooldowns.has(userId)) {
            const expirationTime = cooldowns.get(userId);
            if (Date.now() < expirationTime) {
                const timeLeft = Math.ceil((expirationTime - Date.now()) / (60 * 1000));
                return message.channel.send(`Please wait ${timeLeft} minutes before giving another vouch.`);
            }
        }

        // Set cooldown
        cooldowns.set(userId, Date.now() + cooldownTime);

        const reason = args.slice(1).join(' ');

        db.run(`INSERT OR IGNORE INTO vouches (user_id) VALUES (?)`, [mentionedUser.id]);
        db.run(`UPDATE vouches SET vouches = vouches + 1, todayvouches = todayvouches + 1, last3daysvouches = last3daysvouches + 1, lastweekvouches = lastweekvouches + 1 WHERE user_id = ?`, [mentionedUser.id]);
        db.run(`UPDATE vouches SET reasons = json_insert(reasons, '$[0]', ?) WHERE user_id = ?`, [reason, mentionedUser.id]);

        const vouchEmbed = new Discord.MessageEmbed()
            .setColor('#00ff00')
            .setTitle('✅ Positive Review')
            .setDescription(`Successfully vouched for ${mentionedUser.tag} ${reason ? `with reason: ${reason}` : ''}`);

        message.channel.send({ embeds: [vouchEmbed] });

        // Check for auto roles after vouch
        db.get('SELECT vouches FROM vouches WHERE user_id = ?', [mentionedUser.id], async (err, row) => {
            if (err) {
                console.error(`Error retrieving vouch count: ${err.message}`);
                return;
            }

            const autoRoleTiers = config.autoRoleTiers;
            for (const tier of autoRoleTiers) {
                if (row.vouches >= tier.threshold) {
                    const autoRole = message.guild.roles.cache.get(tier.roleID);
                    if (autoRole) {
                        try {
                            const member = message.guild.members.cache.get(mentionedUser.id);
                            if (member && !member.roles.cache.has(autoRole.id)) {
                                await member.roles.add(autoRole);
                                const promotionChannel = message.guild.channels.cache.get(config.promotionChannelId);
                                if (promotionChannel) {
                                    const promotionEmbed = new Discord.MessageEmbed()
                                        .setColor('#00ff00')
                                        .setTitle('🎉 Role Promotion')
                                        .setDescription(`${mentionedUser.tag} has received the ${autoRole.name} role for reaching ${row.vouches} vouches!`);
                                    promotionChannel.send({ embeds: [promotionEmbed] });
                                }
                            }
                        } catch (error) {
                            console.error('Error assigning auto role:', error);
                        }
                    }
                }
            }
        });
    }
};