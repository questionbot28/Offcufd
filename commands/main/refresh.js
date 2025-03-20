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
        // Check if user has required role
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
                console.error('Bot lacks MANAGE_ROLES permission');
                throw new Error('Bot lacks required permissions to manage roles.');
            }

            // Get promotion channel first to verify access
            const promotionChannel = message.guild.channels.cache.get(config.promotionChannelId);
            if (!promotionChannel) {
                console.error(`Promotion channel ${config.promotionChannelId} not found!`);
                throw new Error('Promotion channel (#『🎭』promotion) not found!');
            }

            // Verify bot permissions in promotion channel
            const botPermissions = promotionChannel.permissionsFor(message.guild.me);
            if (!botPermissions.has('SEND_MESSAGES') || !botPermissions.has('VIEW_CHANNEL')) {
                console.error('Bot lacks required permissions in promotion channel!');
                throw new Error('Bot lacks required permissions in promotion channel.');
            }

            // Get all users with vouches >= 20
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
            let skippedUsers = new Set();

            const promotionTiers = [
                { threshold: 20, roleID: "1348251264299044920", name: "Trial" },      // Trial role at 20 vouches
                { threshold: 60, roleID: "1348251264299044921", name: "Second" },     // Second promotion at 60 vouches
                { threshold: 100, roleID: "1348251264299044922", name: "Third" },     // Third promotion at 100 vouches
                { threshold: 400, roleID: "1348251264299044923", name: "Fourth" }     // Fourth promotion at 400 vouches
            ];

            // Process each user
            for (const row of rows) {
                try {
                    console.log(`Processing user ${row.user_id} with ${row.vouches} vouches`);
                    const member = await message.guild.members.fetch(row.user_id).catch(() => {
                        skippedUsers.add(row.user_id);
                        return null;
                    });

                    if (!member) {
                        console.log(`Could not find member ${row.user_id} in guild - skipped`);
                        continue;
                    }

                    let userUpdated = false;

                    // Check each promotion tier
                    for (const tier of promotionTiers) {
                        if (row.vouches >= tier.threshold) {
                            const role = message.guild.roles.cache.get(tier.roleID);
                            if (!role) {
                                console.error(`Role ${tier.roleID} (${tier.name}) not found!`);
                                errors.push(`Role ${tier.name} (${tier.roleID}) not found`);
                                continue;
                            }

                            // Check if user already has the role
                            if (!member.roles.cache.has(tier.roleID)) {
                                console.log(`Assigning ${tier.name} role to ${member.user.tag}`);
                                try {
                                    await member.roles.add(role);
                                    promotionsMade++;
                                    userUpdated = true;

                                    // Send promotion announcement
                                    const promotionEmbed = new MessageEmbed()
                                        .setColor('#00ff00')
                                        .setTitle('🎉 Role Promotion')
                                        .setDescription(`${member.user.tag} has received the ${tier.name} role!`)
                                        .addFields([
                                            { name: 'Achievement', value: `Reached ${row.vouches} vouches` },
                                            { name: 'New Role', value: `${tier.name} (${role.name})` }
                                        ])
                                        .setTimestamp();

                                    await promotionChannel.send({ embeds: [promotionEmbed] });
                                    console.log(`Successfully promoted ${member.user.tag} to ${tier.name} role`);
                                } catch (roleError) {
                                    console.error(`Failed to assign role to ${member.user.tag}:`, roleError);
                                    errors.push(`Failed to assign ${tier.name} role to ${member.user.tag}`);
                                }
                            } else {
                                console.log(`User ${member.user.tag} already has ${tier.name} role`);
                            }
                        }
                    }

                    if (userUpdated) {
                        updatedUsers++;
                    }
                } catch (userError) {
                    console.error(`Error processing user ${row.user_id}:`, userError);
                    errors.push(`Error processing user ${row.user_id}: ${userError.message}`);
                }
            }

            // Reset drop stats
            const cooldownFile = './cooldown.json';
            const cooldownData = {
                startdrop: 0,
                totalDrops: 0,
                lastReset: Date.now()
            };
            fs.writeFileSync(cooldownFile, JSON.stringify(cooldownData, null, 2));

            // Send success message
            const successEmbed = new MessageEmbed()
                .setColor('#00FF00')
                .setTitle('Refresh Complete')
                .setDescription(`Successfully refreshed ${updatedUsers} users and made ${promotionsMade} role promotions.`)
                .addFields([
                    { name: 'Drop Stats', value: 'Drop session statistics have been reset.' },
                    { name: 'Role Updates', value: `${promotionsMade} role promotions processed` },
                    { 
                        name: 'Roles Checked', 
                        value: promotionTiers.map(tier => 
                            `${tier.name} Role (${tier.threshold}+ vouches)`
                        ).join('\n'),
                        inline: false
                    }
                ])
                .setTimestamp();

            // Add skipped users summary if any
            if (skippedUsers.size > 0) {
                successEmbed.addField(
                    'Skipped Users', 
                    `${skippedUsers.size} user(s) were skipped because they are no longer in the server.`
                );
            }

            // Add errors field if there were any (group similar errors)
            if (errors.length > 0) {
                const uniqueErrors = [...new Set(errors)];
                successEmbed.addField(
                    'Errors',
                    uniqueErrors.slice(0, 3).join('\n') + 
                    (uniqueErrors.length > 3 ? `\n...and ${uniqueErrors.length - 3} more errors` : '')
                );
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