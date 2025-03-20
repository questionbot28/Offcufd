const Discord = require('discord.js');

module.exports = {
    name: 'ticket',
    description: 'Creates a ticket panel with dropdown menu',
    async execute(message, args) {
        // Check if user has permission to create ticket panel
        if (!message.member.permissions.has(Discord.Permissions.FLAGS.ADMINISTRATOR)) {
            return message.reply({ content: 'You do not have permission to use this command.' });
        }

        const embed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('🎫 Create a Support Ticket')
            .setDescription('Please select a category from the dropdown menu below to create a ticket.')
            .setFooter({ text: 'Made by itsmeboi' });

        // Create selection menu
        const row = new Discord.MessageActionRow()
            .addComponents(
                new Discord.MessageSelectMenu()
                    .setCustomId('ticket_menu')
                    .setPlaceholder('Select ticket category')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions([
                        {
                            label: 'Event',
                            description: 'Event-related inquiries',
                            value: 'Event',
                            emoji: '🎉'
                        },
                        {
                            label: 'Reward',
                            description: 'Exchange invites for rewards',
                            value: 'Reward',
                            emoji: '🎁'
                        },
                        {
                            label: 'Code',
                            description: 'Redeem your generated codes',
                            value: 'Code',
                            emoji: '🔑'
                        },
                        {
                            label: 'Support',
                            description: 'General support and assistance',
                            value: 'Support',
                            emoji: '❓'
                        }
                    ])
            );

        try {
            const panel = await message.channel.send({ embeds: [embed], components: [row] });

            // Create a collector for the dropdown menu
            const collector = panel.createMessageComponentCollector({
                componentType: 'SELECT_MENU',
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (interaction) => {
                const value = interaction.values[0];

                // Handle different ticket types
                let ticketName;
                let ticketEmbed;
                let categoryId;

                switch(value) {
                    case 'Event':
                        ticketName = `event-${interaction.user.username}`;
                        categoryId = interaction.client.config.eventCategory;
                        ticketEmbed = new Discord.MessageEmbed()
                            .setColor('#0099ff')
                            .setTitle('🎉 Event Ticket')
                            .setDescription('Please describe your event-related inquiry, and a staff member will assist you shortly.')
                            .setFooter({ text: `Requested by ${interaction.user.tag}` });
                        break;

                    case 'Reward':
                        ticketName = `reward-${interaction.user.username}`;
                        categoryId = interaction.client.config.rewardCategory;
                        ticketEmbed = new Discord.MessageEmbed()
                            .setColor('#0099ff')
                            .setTitle('🎁 Reward Ticket')
                            .setDescription('Welcome to the reward system! Here are the available categories:\n\n' +
                                '**Gaming Accounts**\n' +
                                '• Steam Account (10 invites)\n' +
                                '• Epic Games Account (8 invites)\n' +
                                '• Origin Account (12 invites)\n\n' +
                                '**Streaming Services**\n' +
                                '• Netflix Account (15 invites)\n' +
                                '• Disney+ Account (12 invites)\n' +
                                '• Spotify Premium (8 invites)\n\n' +
                                '**Software & Tools**\n' +
                                '• Windows 10 Key (20 invites)\n' +
                                '• Office 365 (15 invites)\n' +
                                '• VPN Service (10 invites)\n\n' +
                                'Please specify which reward you would like to claim.')
                            .setFooter({ text: `Requested by ${interaction.user.tag}` });
                        break;

                    case 'Code':
                        ticketName = `code-${interaction.user.username}`;
                        categoryId = interaction.client.config.codeCategory;
                        ticketEmbed = new Discord.MessageEmbed()
                            .setColor('#0099ff')
                            .setTitle('🔑 Code Redemption')
                            .setDescription('Please provide your generated code for redemption. A staff member will assist you shortly.')
                            .setFooter({ text: `Requested by ${interaction.user.tag}` });
                        break;

                    case 'Support':
                        ticketName = `support-${interaction.user.username}`;
                        categoryId = interaction.client.config.supportCategory;
                        ticketEmbed = new Discord.MessageEmbed()
                            .setColor('#0099ff')
                            .setTitle('❓ Support Ticket')
                            .setDescription('Please describe your issue, and a staff member will assist you shortly.')
                            .setFooter({ text: `Requested by ${interaction.user.tag}` });
                        break;
                }

                // Create the ticket channel in the appropriate category
                try {
                    if (!categoryId) {
                        throw new Error(`Category ID not found for ${value} tickets. Please run the setup command first.`);
                    }

                    const ticketChannel = await interaction.guild.channels.create(ticketName, {
                        type: 'GUILD_TEXT',
                        parent: categoryId,
                        permissionOverwrites: [
                            {
                                id: interaction.guild.id,
                                deny: [Discord.Permissions.FLAGS.VIEW_CHANNEL]
                            },
                            {
                                id: interaction.user.id,
                                allow: [
                                    Discord.Permissions.FLAGS.VIEW_CHANNEL,
                                    Discord.Permissions.FLAGS.SEND_MESSAGES,
                                    Discord.Permissions.FLAGS.READ_MESSAGE_HISTORY
                                ]
                            },
                            {
                                id: interaction.client.user.id,
                                allow: [
                                    Discord.Permissions.FLAGS.VIEW_CHANNEL,
                                    Discord.Permissions.FLAGS.SEND_MESSAGES,
                                    Discord.Permissions.FLAGS.MANAGE_CHANNELS
                                ]
                            }
                        ]
                    });

                    await ticketChannel.send({ embeds: [ticketEmbed] });
                    await interaction.reply({ content: `Ticket created! Please check ${ticketChannel}`, ephemeral: true });
                } catch (err) {
                    console.error('Error creating ticket channel:', err);
                    await interaction.reply({ content: 'There was an error creating your ticket! Make sure to run the setup command first.', ephemeral: true });
                }
            });

            collector.on('end', collected => {
                if (panel.editable) {
                    panel.components[0].components[0].setDisabled(true);
                    panel.edit({ components: panel.components });
                }
            });

        } catch (error) {
            console.error('Error sending ticket menu:', error);
            message.reply({ content: 'There was an error creating the ticket menu.' });
        }
    }
};