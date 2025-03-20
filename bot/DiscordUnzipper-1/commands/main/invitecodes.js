const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'invitecodes',
    description: 'Show all invite codes used by a user',
    usage: 'invitecodes [@user]',
    execute: async (message, args) => {
        try {
            const user = message.mentions.users.first() || message.author;
            
            message.client.db.get('SELECT invite_codes FROM invites WHERE user_id = ?', [user.id], (err, row) => {
                if (err) {
                    console.error('Error fetching invite codes:', err);
                    return message.channel.send({
                        embeds: [
                            new MessageEmbed()
                                .setColor(config.color.red)
                                .setTitle('Error')
                                .setDescription('An error occurred while fetching invite codes.')
                                .setFooter({ 
                                    text: message.author.tag, 
                                    iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                                })
                                .setTimestamp()
                        ]
                    });
                }

                const inviteCodes = row ? JSON.parse(row.invite_codes) : [];
                
                const embed = new MessageEmbed()
                    .setColor(config.color.default)
                    .setTitle(`Invite Codes for ${user.tag}`)
                    .setDescription(inviteCodes.length > 0 ? inviteCodes.join('\n') : 'No invite codes found.')
                    .setFooter({ 
                        text: message.author.tag, 
                        iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                    })
                    .setTimestamp();

                message.channel.send({ embeds: [embed] });
            });
        } catch (error) {
            console.error('Error in invitecodes command:', error);
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
