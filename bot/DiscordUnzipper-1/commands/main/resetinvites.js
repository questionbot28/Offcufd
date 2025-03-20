const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'resetinvites',
    description: 'Reset invites for a user',
    usage: 'resetinvites <@user>',
    execute: async (message, args) => {
        try {
            // Check if user has admin permission
            if (!message.member.permissions.has('ADMINISTRATOR')) {
                return message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Permission Denied')
                            .setDescription('You need Administrator permission to use this command.')
                            .setFooter({ 
                                text: message.author.tag, 
                                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                            })
                            .setTimestamp()
                    ]
                });
            }

            const user = message.mentions.users.first();

            if (!user) {
                return message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Invalid Usage')
                            .setDescription('Please mention a user to reset their invites.')
                            .setFooter({ 
                                text: message.author.tag, 
                                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                            })
                            .setTimestamp()
                    ]
                });
            }

            // Reset invites in database
            message.client.db.run(`
                UPDATE invites 
                SET total_invites = 0, 
                    regular_invites = 0, 
                    bonus_invites = 0, 
                    fake_invites = 0, 
                    leaves = 0,
                    invite_codes = '[]'
                WHERE user_id = ?
            `, [user.id], (err) => {
                if (err) {
                    console.error('Error resetting invites:', err);
                    return message.channel.send({
                        embeds: [
                            new MessageEmbed()
                                .setColor(config.color.red)
                                .setTitle('Error')
                                .setDescription('An error occurred while resetting invites.')
                                .setFooter({ 
                                    text: message.author.tag, 
                                    iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                                })
                                .setTimestamp()
                        ]
                    });
                }

                message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.green)
                            .setTitle('Invites Reset')
                            .setDescription(`Reset all invites for ${user.tag}`)
                            .setFooter({ 
                                text: message.author.tag, 
                                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                            })
                            .setTimestamp()
                    ]
                });
            });
        } catch (error) {
            console.error('Error in resetinvites command:', error);
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
