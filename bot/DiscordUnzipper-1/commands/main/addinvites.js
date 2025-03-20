const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'addinvites',
    description: 'Add invites to a user',
    usage: 'addinvites <@user> <amount>',
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
                            .setDescription('Please mention a user and specify the amount of invites to add.')
                            .setFooter({ 
                                text: message.author.tag, 
                                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                            })
                            .setTimestamp()
                    ]
                });
            }

            // Update database
            message.client.db.get('SELECT * FROM invites WHERE user_id = ?', [user.id], (err, row) => {
                if (err) {
                    console.error('Error checking user invites:', err);
                    return message.channel.send({
                        embeds: [
                            new MessageEmbed()
                                .setColor(config.color.red)
                                .setTitle('Error')
                                .setDescription('An error occurred while checking user invites.')
                                .setFooter({ 
                                    text: message.author.tag, 
                                    iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                                })
                                .setTimestamp()
                        ]
                    });
                }

                if (!row) {
                    // Create new record
                    message.client.db.run('INSERT INTO invites (user_id, total_invites, bonus_invites) VALUES (?, ?, ?)',
                        [user.id, amount, amount], (err) => {
                            if (err) {
                                console.error('Error adding invites:', err);
                                return message.channel.send({
                                    embeds: [
                                        new MessageEmbed()
                                            .setColor(config.color.red)
                                            .setTitle('Error')
                                            .setDescription('An error occurred while adding invites.')
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
                                        .setTitle('Invites Added')
                                        .setDescription(`Added ${amount} invites to ${user.tag}`)
                                        .setFooter({ 
                                            text: message.author.tag, 
                                            iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                                        })
                                        .setTimestamp()
                                ]
                            });
                        });
                } else {
                    // Update existing record
                    message.client.db.run('UPDATE invites SET total_invites = total_invites + ?, bonus_invites = bonus_invites + ? WHERE user_id = ?',
                        [amount, amount, user.id], (err) => {
                            if (err) {
                                console.error('Error adding invites:', err);
                                return message.channel.send({
                                    embeds: [
                                        new MessageEmbed()
                                            .setColor(config.color.red)
                                            .setTitle('Error')
                                            .setDescription('An error occurred while adding invites.')
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
                                        .setTitle('Invites Added')
                                        .setDescription(`Added ${amount} invites to ${user.tag}`)
                                        .setFooter({ 
                                            text: message.author.tag, 
                                            iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                                        })
                                        .setTimestamp()
                                ]
                            });
                        });
                }
            });
        } catch (error) {
            console.error('Error in addinvites command:', error);
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
