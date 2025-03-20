const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const config = require('../../config.json');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('vouches.db');

module.exports = {
    name: 'refresh',
    description: 'Refresh role assignments and drop session statistics',
    usage: 'refresh',
    async execute(message) {
        // Check if the user has the required role
        const refreshRoleIds = config.refreshRoleIds;
        const hasRefreshRole = message.member.roles.cache.some(role => refreshRoleIds.includes(role.id));

        if (!hasRefreshRole) {
            return message.reply({
                embeds: [new MessageEmbed()
                    .setColor('#FF0000')
                    .setTitle('Permission Error')
                    .setDescription('You need a staff role to use this command.')]
            });
        }

        try {
            // First check if bot has proper permissions
            if (!message.guild.me.permissions.has('MANAGE_ROLES')) {
                return message.reply({
                    embeds: [new MessageEmbed()
                        .setColor('#FF0000')
                        .setTitle('Bot Permission Error')
                        .setDescription('Bot lacks required permissions to manage roles.')]
                });
            }

            // Get promotion channel first to verify access
            const promotionChannel = message.guild.channels.cache.get(config.promotionChannelId);
            if (!promotionChannel) {
                return message.reply({
                    embeds: [new MessageEmbed()
                        .setColor('#FF0000')
                        .setTitle('Channel Error')
                        .setDescription(`Promotion channel (${config.promotionChannelId}) not found!`)]
                });
            }

            // Verify bot permissions in promotion channel
            const botPermissions = promotionChannel.permissionsFor(message.guild.me);
            if (!botPermissions.has('SEND_MESSAGES') || !botPermissions.has('VIEW_CHANNEL')) {
                return message.reply({
                    embeds: [new MessageEmbed()
                        .setColor('#FF0000')
                        .setTitle('Bot Permission Error')
                        .setDescription('Bot lacks required permissions in promotion channel.')]
                });
            }

            // First refresh drop stats
            const cooldownFile = './cooldown.json';
            const cooldownData = {
                startdrop: 0,
                totalDrops: 0,
                lastReset: Date.now()
            };
            fs.writeFileSync(cooldownFile, JSON.stringify(cooldownData, null, 2));

            // Get all users with vouches
            const rows = await new Promise((resolve, reject) => {
                db.all('SELECT user_id, vouches FROM vouches WHERE vouches >= 20', (err, rows) => {
                    if (err) {
                        console.error('Error fetching vouch data:', err);
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            });

            console.log(`Found ${rows.length} users with 20+ vouches to process`);

            let updatedUsers = 0;
            let promotionsMade = 0;
            let errors = [];
            let skippedUsers = [];

            const promotionTiers = [
                { threshold: 20, roleID: "1200663200358727714" },  // First promotion at 20 vouches
                { threshold: 60, roleID: "1200663200358727715" },  // Second promotion at 60 vouches
                { threshold: 100, roleID: "1200663200358727716" }  // Third promotion at 100 vouches
            ];

            // Process each user
            for (const row of rows) {
                try {
                    console.log(`Processing user ${row.user_id} with ${row.vouches} vouches`);
                    const member = await message.guild.members.fetch(row.user_id).catch(() => null);

                    if (!member) {
                        skippedUsers.push(row.user_id);
                        continue;
                    }

                    let userPromoted = false;

                    // Check each promotion tier
                    for (const tier of promotionTiers) {
                        if (row.vouches >= tier.threshold) {
                            const role = message.guild.roles.cache.get(tier.roleID);
                            if (!role) {
                                console.error(`Role ${tier.roleID} not found!`);
                                errors.push(`Role ${tier.roleID} not found`);
                                continue;
                            }

                            // Check if user already has the role
                            if (!member.roles.cache.has(tier.roleID)) {
                                console.log(`Assigning role ${role.name} to ${member.user.tag}`);
                                try {
                                    await member.roles.add(role);
                                    promotionsMade++;
                                    userPromoted = true;

                                    // Send promotion announcement
                                    const promotionEmbed = new MessageEmbed()
                                        .setColor('#00ff00')
                                        .setTitle('🎉 Role Promotion')
                                        .setDescription(`${member.user.tag} has received the ${role.name} role!`)
                                        .addFields([
                                            { name: 'Achievement', value: `Reached ${row.vouches} vouches` },
                                            { name: 'New Role', value: role.name }
                                        ])
                                        .setTimestamp();

                                    await promotionChannel.send({ embeds: [promotionEmbed] });
                                    console.log(`Successfully promoted ${member.user.tag} to ${role.name}`);
                                } catch (roleError) {
                                    console.error(`Failed to assign role to ${member.user.tag}:`, roleError);
                                    errors.push(`Failed to assign role to ${member.user.tag}`);
                                }
                            }
                        }
                    }

                    if (userPromoted) {
                        updatedUsers++;
                    }
                } catch (userError) {
                    console.error(`Error processing user ${row.user_id}:`, userError);
                    errors.push(`Error processing user ${row.user_id}: ${userError.message}`);
                }
            }

            // Send success message
            const successEmbed = new MessageEmbed()
                .setColor('#00FF00')
                .setTitle('Refresh Complete')
                .setDescription(`Successfully refreshed ${updatedUsers} users and made ${promotionsMade} role promotions.`)
                .addFields([
                    { name: 'Drop Stats', value: 'Drop session statistics have been reset.' },
                    { name: 'Role Updates', value: `${promotionsMade} role promotions processed` }
                ])
                .setTimestamp();

            // Add skipped users field if any were skipped
            if (skippedUsers.length > 0) {
                successEmbed.addField('Skipped Users', 
                    `${skippedUsers.length} user(s) were skipped (no longer in server)`);
            }

            // Add errors field if there were any
            if (errors.length > 0) {
                successEmbed.addField('Errors', 
                    errors.slice(0, 3).join('\n') + (errors.length > 3 ? '\n...' : ''));
            }

            await message.reply({ embeds: [successEmbed] });
        } catch (error) {
            console.error('Error in refresh command:', error);
            message.reply({
                embeds: [new MessageEmbed()
                    .setColor('#FF0000')
                    .setTitle('Error')
                    .setDescription('An error occurred while executing the refresh command.')
                    .addField('Error Details', error.message)]
            });
        }
    },
};