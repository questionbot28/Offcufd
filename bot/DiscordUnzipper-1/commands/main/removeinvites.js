const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'removeinvites',
    description: 'Remove invites from a user',
    usage: 'removeinvites <@user> <amount>',
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
            const amount = parseInt(args[1]);

            if (!user || isNaN(amount)) {
                return message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Invalid Usage')
                            .setDescription('Please mention a user and specify the amount of invites to remove.')
                            .setFooter({ 
                                text: message.author.tag, 
                                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                            })
                            .setTimestamp()
                    ]
                });
            }

            // Update database
            message.client.db.run(
                'UPDATE invites SET total_invites = MAX(0, total_invites - ?), bonus_invites = MAX(0, bonus_invites - ?) WHERE user_id = ?',
                [amount, amount, user.id],
                (err) => {
                    if (err) {
                        console.error('Error removing invites:', err);
                        return message.channel.send({
                            embeds: [
                                new MessageEmbed()
                                    .setColor(config.color.red)
                                    .setTitle('Error')
                                    .setDescription('An error occurred while removing invites.')
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
                                .setTitle('Invites Removed')
                                .setDescription(`Removed ${amount} invites from ${user.tag}`)
                                .setFooter({ 
                                    text: message.author.tag, 
                                    iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                                })
                                .setTimestamp()
                        ]
                    });
                }
            );
        } catch (error) {
            console.error('Error in removeinvites command:', error);
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
