const Discord = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'setup',
    description: 'Sets up ticket system categories',
    async execute(message, args) {
        // Check if user has administrator permissions
        if (!message.member.permissions.has(Discord.Permissions.FLAGS.ADMINISTRATOR)) {
            return message.reply({ content: 'You do not have permission to use this command.' });
        }

        try {
            // Create ticket categories with emojis
            const categories = [
                { name: '🎉│Event Tickets', description: 'Event-related inquiries' },
                { name: '🎁│Reward Tickets', description: 'Exchange invites for rewards' },
                { name: '🔑│Code Tickets', description: 'Redeem your generated codes' },
                { name: '❓│Support Tickets', description: 'General support and assistance' }
            ];
            const createdCategories = [];
            const setupEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('🛠️ Ticket System Setup')
                .setDescription('Setting up ticket categories...');

            const setupMsg = await message.channel.send({ embeds: [setupEmbed] });

            for (const category of categories) {
                try {
                    const createdCategory = await message.guild.channels.create(category.name, {
                        type: 'GUILD_CATEGORY',
                        permissionOverwrites: [
                            {
                                id: message.guild.id,
                                deny: [Discord.Permissions.FLAGS.VIEW_CHANNEL]
                            },
                            {
                                id: message.client.user.id,
                                allow: [
                                    Discord.Permissions.FLAGS.VIEW_CHANNEL,
                                    Discord.Permissions.FLAGS.SEND_MESSAGES,
                                    Discord.Permissions.FLAGS.MANAGE_CHANNELS,
                                    Discord.Permissions.FLAGS.MANAGE_ROLES
                                ]
                            }
                        ]
                    });
                    createdCategories.push({
                        id: createdCategory.id,
                        name: category.name,
                        description: category.description,
                        type: category.name.split('│')[0].trim() // Store the emoji
                    });
                    console.log(`Created category: ${category.name} with ID: ${createdCategory.id}`);
                } catch (categoryError) {
                    console.error(`Error creating category ${category.name}:`, categoryError);
                    throw new Error(`Failed to create category ${category.name}: ${categoryError.message}`);
                }
            }

            // Update config.json with new category IDs
            const configPath = path.join(__dirname, '..', '..', 'config.json');
            console.log('Config path:', configPath);

            let config;
            try {
                const configData = fs.readFileSync(configPath, 'utf8');
                config = JSON.parse(configData);

                // Save full category information
                config.ticketCategories = createdCategories;

                // Save specific category IDs for easy access
                config.eventCategory = createdCategories[0].id;
                config.rewardCategory = createdCategories[1].id;
                config.codeCategory = createdCategories[2].id;
                config.supportCategory = createdCategories[3].id;

                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                console.log('Updated config.json with category IDs:', config.ticketCategories);
            } catch (fileError) {
                console.error('Error handling config file:', fileError);
                throw new Error(`Failed to update config file: ${fileError.message}`);
            }

            // Create success embed with category details
            const successEmbed = new Discord.MessageEmbed()
                .setColor('#00ff00')
                .setTitle('✅ Ticket System Setup Complete')
                .setDescription('All ticket categories have been created successfully!')
                .addFields(
                    createdCategories.map(cat => ({
                        name: cat.name,
                        value: `ID: ${cat.id}\nPurpose: ${cat.description}`,
                        inline: false
                    }))
                )
                .setFooter({ text: `Setup by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                .setTimestamp();

            await setupMsg.edit({ embeds: [successEmbed] });
            return message.reply({ content: 'Ticket system has been set up successfully! You can now use the `.ticket` command to create a ticket panel.' });

        } catch (error) {
            console.error('Error setting up ticket system:', error);
            return message.reply({ content: `There was an error setting up the ticket system: ${error.message}` });
        }
    }
};