const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'inviteinfo',
    description: 'Get details about a specific invite code',
    usage: 'inviteinfo <code>',
    execute: async (message, args) => {
        try {
            const code = args[0];
            if (!code) {
                return message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Missing Parameters')
                            .setDescription('Please provide an invite code to check.')
                            .setFooter({ 
                                text: message.author.tag, 
                                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                            })
                            .setTimestamp()
                    ]
                });
            }

            try {
                const invite = await message.guild.invites.fetch(code);
                if (!invite) throw new Error('Invite not found');

                const embed = new MessageEmbed()
                    .setColor(config.color.default)
                    .setTitle('Invite Information')
                    .addField('Code', invite.code, true)
                    .addField('Created By', invite.inviter ? invite.inviter.tag : 'Unknown', true)
                    .addField('Channel', invite.channel ? `#${invite.channel.name}` : 'Unknown', true)
                    .addField('Uses', invite.uses?.toString() || '0', true)
                    .addField('Max Uses', invite.maxUses ? invite.maxUses.toString() : 'Unlimited', true)
                    .addField('Expires', invite.maxAge ? `${invite.maxAge / 60 / 60} hours` : 'Never', true)
                    .addField('Created At', invite.createdAt.toLocaleString(), true)
                    .setFooter({ 
                        text: message.author.tag, 
                        iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                    })
                    .setTimestamp();

                message.channel.send({ embeds: [embed] });
            } catch (err) {
                message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Invalid Invite')
                            .setDescription('The provided invite code does not exist or has expired.')
                            .setFooter({ 
                                text: message.author.tag, 
                                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                            })
                            .setTimestamp()
                    ]
                });
            }
        } catch (error) {
            console.error('Error in inviteinfo command:', error);
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
