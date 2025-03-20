const { MessageEmbed, MessageActionRow, MessageSelectMenu } = require('discord.js');
const config = require('../../config.json');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Reward categories and their costs
const REWARD_CATEGORIES = {
    Gaming: {
        name: "Gaming Accounts",
        options: {
            "Steam Account": 15,
            "Epic Games Account": 10,
            "Origin Account": 12
        }
    },
    Streaming: {
        name: "Streaming Services",
        options: {
            "Netflix Premium": 20,
            "Disney+ Account": 18,
            "Spotify Premium": 15
        }
    },
    Software: {
        name: "Software Licenses",
        options: {
            "Windows Key": 25,
            "Office 365": 30,
            "Adobe Creative Cloud": 40
        }
    }
};

module.exports = {
    name: 'rewards',
    description: 'Exchange invites for rewards',
    usage: 'rewards',
    execute: async (message, args) => {
        try {
            // Get user's current invites
            message.client.db.get('SELECT total_invites FROM invites WHERE user_id = ?', [message.author.id], async (err, row) => {
                if (err) {
                    console.error('Error checking invites:', err);
                    return message.reply('An error occurred while checking your invites.');
                }

                const userInvites = row ? row.total_invites : 0;

                // Create AI interaction for personalized greeting
                const model = genAI.getGenerativeModel({ model: "gemini-pro" });
                const prompt = `Create a friendly greeting for a user who has ${userInvites} invites and wants to exchange them for rewards. Be brief and enthusiastic.`;
                const result = await model.generateContent(prompt);
                const greeting = result.response.text();

                // Create category selection menu
                const categoryMenu = new MessageActionRow()
                    .addComponents(
                        new MessageSelectMenu()
                            .setCustomId('reward_category')
                            .setPlaceholder('Select a reward category')
                            .addOptions(Object.entries(REWARD_CATEGORIES).map(([id, category]) => ({
                                label: category.name,
                                value: id,
                                description: `View ${category.name} rewards`,
                            })))
                    );

                // Send initial message with greeting and category selection
                const embed = new MessageEmbed()
                    .setColor(config.color.default)
                    .setTitle('🎁 Reward Exchange System')
                    .setDescription(`${greeting}\n\nYou currently have **${userInvites} invites**.\nPlease select a reward category below.`)
                    .setFooter({ 
                        text: message.author.tag, 
                        iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                    })
                    .setTimestamp();

                const response = await message.reply({
                    embeds: [embed],
                    components: [categoryMenu]
                });

                // Create collector for category selection
                const filter = i => i.user.id === message.author.id;
                const collector = response.createMessageComponentCollector({ filter, time: 60000 });

                collector.on('collect', async interaction => {
                    if (interaction.customId === 'reward_category') {
                        const category = interaction.values[0];
                        const rewards = REWARD_CATEGORIES[category];

                        // Create rewards selection menu
                        const rewardMenu = new MessageActionRow()
                            .addComponents(
                                new MessageSelectMenu()
                                    .setCustomId('reward_selection')
                                    .setPlaceholder('Select a reward')
                                    .addOptions(Object.entries(rewards.options).map(([name, cost]) => ({
                                        label: name,
                                        value: `${category}:${name}`,
                                        description: `Cost: ${cost} invites`,
                                        disabled: userInvites < cost
                                    })))
                            );

                        const rewardEmbed = new MessageEmbed()
                            .setColor(config.color.default)
                            .setTitle(`🎁 ${rewards.name}`)
                            .setDescription(`Select a reward to exchange your invites for:\nYou have **${userInvites} invites**`)
                            .addFields(
                                Object.entries(rewards.options).map(([name, cost]) => ({
                                    name: name,
                                    value: `Cost: ${cost} invites${userInvites < cost ? ' (Not enough invites)' : ''}`,
                                    inline: true
                                }))
                            )
                            .setFooter({ 
                                text: message.author.tag, 
                                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                            })
                            .setTimestamp();

                        await interaction.update({
                            embeds: [rewardEmbed],
                            components: [rewardMenu]
                        });
                    }
                });

                collector.on('end', collected => {
                    if (collected.size === 0) {
                        const timeoutEmbed = new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('❌ Time Expired')
                            .setDescription('The reward selection has timed out. Please try again.')
                            .setFooter({ 
                                text: message.author.tag, 
                                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                            })
                            .setTimestamp();

                        response.edit({
                            embeds: [timeoutEmbed],
                            components: []
                        });
                    }
                });
            });
        } catch (error) {
            console.error('Error in rewards command:', error);
            message.reply('An error occurred while processing the rewards command.');
        }
    }
};
