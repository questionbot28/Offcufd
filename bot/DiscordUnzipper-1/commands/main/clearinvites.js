const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'clearinvites',
    description: 'Clear all invites in the server',
    usage: 'clearinvites',
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

            // Ask for confirmation
            const confirmationEmbed = await message.channel.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.yellow)
                        .setTitle('⚠️ Confirmation Required')
                        .setDescription('Are you sure you want to clear ALL invites in the server? This action cannot be undone.\nReact with ✅ to confirm or ❌ to cancel.')
                        .setFooter({ 
                            text: message.author.tag, 
                            iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                        })
                        .setTimestamp()
                ]
            });

            await confirmationEmbed.react('✅');
            await confirmationEmbed.react('❌');

            const filter = (reaction, user) => {
                return ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
            };

            const collected = await confirmationEmbed.awaitReactions({ filter, max: 1, time: 30000 });
            const reaction = collected.first();

            if (reaction && reaction.emoji.name === '✅') {
                // Clear all invites from database
                message.client.db.run('DELETE FROM invites', (err) => {
                    if (err) {
                        console.error('Error clearing invites:', err);
                        return message.channel.send({
                            embeds: [
                                new MessageEmbed()
                                    .setColor(config.color.red)
                                    .setTitle('Error')
                                    .setDescription('An error occurred while clearing invites.')
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
                                .setTitle('Invites Cleared')
                                .setDescription('All invites have been cleared from the database.')
                                .setFooter({ 
                                    text: message.author.tag, 
                                    iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                                })
                                .setTimestamp()
                        ]
                    });
                });
            } else {
                message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.blue)
                            .setTitle('Action Cancelled')
                            .setDescription('Invite clear operation has been cancelled.')
                            .setFooter({ 
                                text: message.author.tag, 
                                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                            })
                            .setTimestamp()
                    ]
                });
            }
        } catch (error) {
            console.error('Error in clearinvites command:', error);
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
