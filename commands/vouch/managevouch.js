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
    }
});

module.exports = {
    name: 'managevouch',
    description: 'Manage vouches for a user',
    usage: '+managevouch <@user> <-number / +number>',
    examples: [
        '+managevouch @user +1',    // Add 1 vouch
        '+managevouch @user -1',    // Remove 1 vouch
        '+managevouch @user +5',    // Add 5 vouches
    ],
    async execute(message, args) {
        try {
            // Enhanced role checking with detailed logging
            const allowedRoleIDs = [
                '1348251264336527414', // Co-owner
                '1348251264336527416'  // Owner
            ];

            // Check if user has required role
            if (!message.member.roles.cache.some(role => allowedRoleIDs.includes(role.id))) {
                return message.reply({
                    embeds: [
                        new Discord.MessageEmbed()
                            .setColor('#ff0000')
                            .setTitle('Permission Denied')
                            .setDescription('You must have Co-owner or Owner role to use this command.')
                    ]
                });
            }

            // Validate command usage
            if (!message.mentions.users.size || args.length < 2) {
                const exampleEmbed = new Discord.MessageEmbed()
                    .setColor('#ff9900')
                    .setTitle('Vouch Management Usage')
                    .setDescription('How to use the vouch management command:')
                    .addFields([
                        { name: 'Format', value: '`+managevouch @user <+/- number>`' },
                        { name: 'Examples', value: this.examples.join('\n') },
                        { name: 'Notes', value: '- You must have Co-owner or Owner role\n- The number can be positive or negative\n- Vouches cannot go below 0' }
                    ]);
                return message.reply({ embeds: [exampleEmbed] });
            }

            const mentionedUser = message.mentions.users.first();
            const vouchChange = parseInt(args[1]);

            if (isNaN(vouchChange)) {
                return message.reply({
                    embeds: [
                        new Discord.MessageEmbed()
                            .setColor('#ff0000')
                            .setTitle('Invalid Input')
                            .setDescription('Please provide a valid number for vouch change.')
                    ]
                });
            }

            try {
                // First ensure the user exists in the database
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

                // Get current vouches
                const row = await new Promise((resolve, reject) => {
                    db.get('SELECT vouches FROM vouches WHERE user_id = ?', [mentionedUser.id], (err, row) => {
                        if (err) reject(err);
                        else resolve(row || { vouches: 0 });
                    });
                });

                const currentVouches = row.vouches;
                const newVouchCount = Math.max(0, currentVouches + vouchChange);

                // Update the vouch count
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE vouches SET vouches = ?, last_updated = datetime("now") WHERE user_id = ?',
                        [newVouchCount, mentionedUser.id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                // Send success message
                const vouchEmbed = new Discord.MessageEmbed()
                    .setColor('#00ff00')
                    .setTitle('Vouch Management')
                    .setDescription(
                        `Successfully updated vouches for ${mentionedUser.tag}\n` +
                        `Previous count: ${currentVouches}\n` +
                        `Change: ${vouchChange > 0 ? '+' : ''}${vouchChange}\n` +
                        `New count: ${newVouchCount}`
                    )
                    .setTimestamp()
                    .setFooter({ 
                        text: `Updated by ${message.author.tag}`, 
                        iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                    });

                await message.reply({ embeds: [vouchEmbed] });

                // Check for promotions
                const promotionTiers = [
                    { threshold: 20, roleID: "1200663200358727714" },  // First promotion at 20 vouches
                    { threshold: 60, roleID: "1200663200358727715" },  // Second promotion at 60 vouches
                    { threshold: 100, roleID: "1200663200358727716" }  // Third promotion at 100 vouches
                ];

                for (const tier of promotionTiers) {
                    if (newVouchCount >= tier.threshold) {
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
                                                { name: 'Achievement', value: `Reached ${newVouchCount} vouches` },
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
            console.error('Error in managevouch command:', error);
            message.reply('An unexpected error occurred while managing vouches.');
        }
    }
};