const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'invites',
    description: 'Check user invites',
    usage: 'invites [@user]',
    execute: async (message, args) => {
        try {
            // Get the target user (mentioned user or message author)
            const user = message.mentions.users.first() || message.author;
            
            // Query the database
            message.client.db.get('SELECT * FROM invites WHERE user_id = ?', [user.id], (err, row) => {
                if (err) {
                    console.error('Error fetching invites:', err);
                    return message.channel.send({
                        embeds: [
                            new MessageEmbed()
                                .setColor(config.color.red)
                                .setTitle('Error')
                                .setDescription('An error occurred while fetching invites.')
                                .setFooter({ 
                                    text: message.author.tag, 
                                    iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                                })
                                .setTimestamp()
                        ]
                    });
                }

                const inviteData = row || { 
                    total_invites: 0, 
                    regular_invites: 0, 
                    leaves: 0, 
                    bonus_invites: 0, 
                    fake_invites: 0 
                };

                const embed = new MessageEmbed()
                    .setColor(config.color.default)
                    .setTitle(`Invite Information for ${user.tag}`)
                    .addField('Total Invites', `${inviteData.total_invites}`, true)
                    .addField('Regular Invites', `${inviteData.regular_invites}`, true)
                    .addField('Bonus Invites', `${inviteData.bonus_invites}`, true)
                    .addField('Fake Invites', `${inviteData.fake_invites}`, true)
                    .addField('Leaves', `${inviteData.leaves}`, true)
                    .setFooter({ 
                        text: message.author.tag, 
                        iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                    })
                    .setTimestamp();

                message.channel.send({ embeds: [embed] });
            });
        } catch (error) {
            console.error('Error in invites command:', error);
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
