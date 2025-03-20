const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'inviteleaderboard',
    aliases: ['invitetop', 'topinvites'],
    description: 'Show top 10 inviters',
    usage: 'inviteleaderboard',
    execute: async (message, args) => {
        try {
            message.client.db.all(`
                SELECT user_id, total_invites 
                FROM invites 
                ORDER BY total_invites DESC 
                LIMIT 10
            `, async (err, rows) => {
                if (err) {
                    console.error('Error fetching leaderboard:', err);
                    return message.channel.send({
                        embeds: [
                            new MessageEmbed()
                                .setColor(config.color.red)
                                .setTitle('Error')
                                .setDescription('An error occurred while fetching the leaderboard.')
                                .setFooter({ 
                                    text: message.author.tag, 
                                    iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                                })
                                .setTimestamp()
                        ]
                    });
                }

                const leaderboard = await Promise.all(rows.map(async (row, index) => {
                    const user = await message.client.users.fetch(row.user_id).catch(() => null);
                    return user ? 
                        `${index + 1}. ${user.tag} - ${row.total_invites} invites` :
                        `${index + 1}. Unknown User - ${row.total_invites} invites`;
                }));

                const embed = new MessageEmbed()
                    .setColor(config.color.default)
                    .setTitle('Top 10 Inviters')
                    .setDescription(leaderboard.join('\n') || 'No invites recorded yet.')
                    .setFooter({ 
                        text: message.author.tag, 
                        iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                    })
                    .setTimestamp();

                message.channel.send({ embeds: [embed] });
            });
        } catch (error) {
            console.error('Error in inviteleaderboard command:', error);
            message.channel.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Error')
                        .setDescription('An error occurred while processing the command.')
                        .setFooter({ 
                            text: message.author.tag, 
                            iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                        })
                        .setTimestamp()
                ]
            });
        }
    },
};
