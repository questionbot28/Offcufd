const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const config = require('../../config.json');

module.exports = {
    name: 'startdrop',
    description: 'Start a drop session',
    usage: 'startdrop',
    async execute(message) {
        // Check if user has required roles
        const adminUserIds = config.adminUserIds || [];
        const staffRoleIds = config.staffRoleIds || [];

        const isAdmin = adminUserIds.includes(message.author.id);
        const hasStaffRole = message.member.roles.cache.some(role => staffRoleIds.includes(role.id));

        if (!isAdmin && !hasStaffRole) {
            return message.channel.send({
                embeds: [
                    new MessageEmbed()
                        .setColor('#FF0000')
                        .setTitle('Error')
                        .setDescription('You do not have permission to use this command.')
                ]
            });
        }

        // Check if drop session is already active
        if (config.dropSessionActive) {
            return message.channel.send({
                embeds: [
                    new MessageEmbed()
                        .setColor('#FF0000')
                        .setTitle('Error')
                        .setDescription('A drop session is already in progress.')
                ]
            });
        }

        // Update dropSessionActive status
        config.dropSessionActive = true;
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));

        // Send success message
        const successEmbed = new MessageEmbed()
            .setColor('#00FF00')
            .setTitle('🎁 Drop Started!')
            .setDescription('A new drop session has started! Hurry up and get the drops!!')
            .addField('Available Tiers', 'basic (b), premium (p), extreme (e), free (f), cookie (c)')
            .addField('Example', '`.drop basic` or `.drop b`')
            .setFooter({ text: 'Hurry! First come, first served!' });

        // Mention the drop role if it exists
        const dropRoleId = config.dropRoleId;
        if (dropRoleId) {
            await message.channel.send(`<@&${dropRoleId}>`);
        }
        await message.channel.send({ embeds: [successEmbed] });
    }
};