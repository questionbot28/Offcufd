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
        // Create table with all required columns
        db.run(`CREATE TABLE IF NOT EXISTS vouches (
            user_id TEXT PRIMARY KEY,
            vouches INTEGER DEFAULT 0,
            negvouches INTEGER DEFAULT 0,
            todayvouches INTEGER DEFAULT 0,
            last3daysvouches INTEGER DEFAULT 0,
            lastweekvouches INTEGER DEFAULT 0,
            reasons TEXT DEFAULT '[]',
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating vouches table:', err);
            } else {
                console.log('Vouches table created successfully');
            }
        });
    }
});

module.exports = {
    name: 'vouch',
    description: 'Vouch for a user.',
    usage: 'vouch <@user> {reason}',
    async execute(message, args, prefix) {
        try {
            // Check if the command is used in the specified vouch channel
            if (message.channel.id !== config.vouchChannelId) {
                return message.reply({
                    embeds: [
                        new Discord.MessageEmbed()
                            .setColor('#ff0000')
                            .setTitle('Wrong Channel')
                            .setDescription(`This command can only be used in <#${config.vouchChannelId}>.`)
                    ]
                });
            }

            const mentionedUser = message.mentions.users.first();
            if (!mentionedUser) {
                return message.reply({
                    embeds: [
                        new Discord.MessageEmbed()
                            .setColor('#ff0000')
                            .setTitle('Invalid Usage')
                            .setDescription(`Usage: ${prefix}vouch @user {reason}`)
                    ]
                });
            }

            const reason = args.slice(1).join(' ') || 'No reason provided';

            try {
                // First, ensure the user exists in the database
                await new Promise((resolve, reject) => {
                    db.run(`INSERT OR IGNORE INTO vouches (
                        user_id, vouches, negvouches, todayvouches, 
                        last3daysvouches, lastweekvouches, reasons, last_updated
                    ) VALUES (?, 0, 0, 0, 0, 0, '[]', datetime('now'))`, 
                    [mentionedUser.id], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                // Update the vouch count and other metrics
                await new Promise((resolve, reject) => {
                    db.run(`
                        UPDATE vouches 
                        SET vouches = vouches + 1,
                            todayvouches = todayvouches + 1,
                            last3daysvouches = last3daysvouches + 1,
                            lastweekvouches = lastweekvouches + 1,
                            reasons = json_array(COALESCE(json_extract(reasons, '$'), '[]'), ?),
                            last_updated = datetime('now')
                        WHERE user_id = ?
                    `, [reason, mentionedUser.id], (err) => {
                        if (err) {
                            console.error('Error updating vouches:', err);
                            reject(err);
                        } else resolve();
                    });
                });

                // Get updated vouch count
                const row = await new Promise((resolve, reject) => {
                    db.get('SELECT vouches FROM vouches WHERE user_id = ?', [mentionedUser.id], (err, row) => {
                        if (err) reject(err);
                        else resolve(row || { vouches: 1 });
                    });
                });

                // Send success message
                const vouchEmbed = new Discord.MessageEmbed()
                    .setColor('#00ff00')
                    .setTitle('✅ Positive Review')
                    .setDescription(`Successfully vouched for ${mentionedUser.tag} ${reason ? `with reason: ${reason}` : ''}`);

                await message.reply({ embeds: [vouchEmbed] });

                // Check for role promotions
                const promotionTiers = [
                    { threshold: 20, roleID: "1348251264299044920" },  // Trial role at 20 vouches
                    { threshold: 60, roleID: "1348251264299044921" },  // Second promotion at 60 vouches
                    { threshold: 100, roleID: "1348251264299044922" }, // Third promotion at 100 vouches
                    { threshold: 400, roleID: "1348251264299044923" }  // Fourth promotion at 400 vouches
                ];

                for (const tier of promotionTiers) {
                    if (row.vouches >= tier.threshold) {
                        const promotionRole = message.guild.roles.cache.get(tier.roleID);
                        if (promotionRole) {
                            try {
                                const member = await message.guild.members.fetch(mentionedUser.id);
                                if (member && !member.roles.cache.has(promotionRole.id)) {
                                    await member.roles.add(promotionRole);

                                    // Send promotion announcement
                                    const promotionChannel = message.guild.channels.cache.get(config.promotionChannelId);
                                    if (promotionChannel) {
                                        const promotionEmbed = new Discord.MessageEmbed()
                                            .setColor('#00ff00')
                                            .setTitle('🎉 Role Promotion')
                                            .setDescription(`${mentionedUser.tag} has received the ${promotionRole.name} role!`)
                                            .addFields([
                                                { name: 'Achievement', value: `Reached ${row.vouches} vouches` },
                                                { name: 'New Role', value: promotionRole.name }
                                            ])
                                            .setTimestamp();

                                        await promotionChannel.send({ embeds: [promotionEmbed] });
                                    }
                                }
                            } catch (roleError) {
                                console.error('Error assigning promotion role:', roleError);
                            }
                        }
                    }
                }
            } catch (dbError) {
                console.error('Database error:', dbError);
                return message.reply('An error occurred while updating vouches. Please try again.');
            }
        } catch (error) {
            console.error('Error in vouch command:', error);
            message.reply('An unexpected error occurred while processing your vouch.');
        }
    }
};