const Discord = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../../config.json');

// Initialize database with proper path resolution
const dbPath = path.join(__dirname, '../../vouches.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to vouches database:', err);
    } else {
        console.log('Connected to vouches database');
        // Create table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS vouches (
            user_id TEXT PRIMARY KEY,
            vouches INTEGER DEFAULT 0,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`, (createError) => {
            if (createError) {
                console.error('Error creating vouches table:', createError);
            } else {
                console.log('Vouches table ready');
            }
        });
    }
});

module.exports = {
    name: 'managevouch',
    description: 'Manage vouches for a user.',
    usage: 'managevouch <@user> <-number / +number>',
    execute(message, args, prefix) {
        // Enhanced role checking with detailed logging
        const allowedRoles = config.vouchManagerRoles || [];
        console.log(`Checking roles for user ${message.author.tag}`);
        console.log(`Allowed roles:`, allowedRoles);
        console.log(`User roles:`, message.member.roles.cache.map(r => r.id));

        if (!message.member.roles.cache.some(role => allowedRoles.includes(role.id))) {
            console.log(`User ${message.author.tag} lacks required roles for vouch management`);
            return message.channel.send({
                embeds: [
                    new Discord.MessageEmbed()
                        .setColor('#ff0000')
                        .setTitle('Permission Denied')
                        .setDescription('You do not have permission to manage vouches.')
                ]
            });
        }

        // Check if the command is used in the specified vouch channel
        if (message.channel.id !== config.vouchChannelId) {
            return message.channel.send({
                embeds: [
                    new Discord.MessageEmbed()
                        .setColor('#ff0000')
                        .setTitle('Wrong Channel')
                        .setDescription(`This command can only be used in <#${config.vouchChannelId}>.`)
                ]
            });
        }

        // Validate command usage
        if (!message.mentions.users.size || args.length < 2) {
            return message.channel.send({
                embeds: [
                    new Discord.MessageEmbed()
                        .setColor('#ff0000')
                        .setTitle('Invalid Usage')
                        .setDescription(`Usage: ${prefix}managevouch @user {integer(+/-)}`)
                ]
            });
        }

        const mentionedUser = message.mentions.users.first();
        const vouchChange = parseInt(args[1]);

        // Validate vouch change value
        if (isNaN(vouchChange)) {
            return message.channel.send({
                embeds: [
                    new Discord.MessageEmbed()
                        .setColor('#ff0000')
                        .setTitle('Invalid Input')
                        .setDescription('Please provide a valid number for vouch change.')
                ]
            });
        }

        // Check if user exists in database
        db.get('SELECT * FROM vouches WHERE user_id = ?', [mentionedUser.id], (err, row) => {
            if (err) {
                console.error('Error checking vouches:', err);
                return message.channel.send({
                    embeds: [
                        new Discord.MessageEmbed()
                            .setColor('#ff0000')
                            .setTitle('Database Error')
                            .setDescription('An error occurred while checking vouches.')
                    ]
                });
            }

            // If user doesn't exist, create new entry
            if (!row) {
                db.run('INSERT INTO vouches (user_id, vouches) VALUES (?, 0)', [mentionedUser.id]);
                row = { vouches: 0 };
            }

            const newVouchCount = Math.max(0, row.vouches + vouchChange);

            // Update the vouch count
            db.run(
                'UPDATE vouches SET vouches = ?, last_updated = CURRENT_TIMESTAMP WHERE user_id = ?',
                [newVouchCount, mentionedUser.id],
                (updateError) => {
                    if (updateError) {
                        console.error('Error updating vouches:', updateError);
                        return message.channel.send({
                            embeds: [
                                new Discord.MessageEmbed()
                                    .setColor('#ff0000')
                                    .setTitle('Update Error')
                                    .setDescription('An error occurred while updating vouches.')
                            ]
                        });
                    }

                    // Send success message
                    const vouchEmbed = new Discord.MessageEmbed()
                        .setColor('#00ff00')
                        .setTitle('Vouch Management')
                        .setDescription(
                            `Successfully updated vouches for ${mentionedUser.tag}\n` +
                            `Previous count: ${row.vouches}\n` +
                            `Change: ${vouchChange > 0 ? '+' : ''}${vouchChange}\n` +
                            `New count: ${newVouchCount}`
                        )
                        .setTimestamp()
                        .setFooter({ 
                            text: `Updated by ${message.author.tag}`, 
                            iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                        });

                    message.channel.send({ embeds: [vouchEmbed] });
                }
            );
        });
    },
};