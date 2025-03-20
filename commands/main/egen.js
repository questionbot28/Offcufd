const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const config = require('../../config.json');

const egenChannel = config.egenChannel; // Add your egenChannel ID in the config.json file
const extremechannelId = config.extremechannelId; // Add your extreme server channel ID in the config.json file
const providerRoleId = config.providerRoleId; // Add your provider role ID in the config.json file
const generated = new Set();
const cooldowns = new Map();

module.exports = {
    name: 'egen',
    description: 'Generate a specified service if stocked (extreme)',
    usage: 'egen <service>',

    execute(message, args, usedPrefix) {
        try {
            message.client.channels.cache.get(egenChannel).id;
        } catch (error) {
            if (error) {
                console.error(error);
            }

            if (config.command.error_message === true) {
                return message.channel.send({
                    embeds: [new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Error occurred!')
                        .setDescription('Not a valid egen channel specified!')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
                        .setTimestamp()]
                });
            } else {
                return;
            }
        }

        // Check if the command is used in the correct channel
        if (message.channel.id !== egenChannel) {
            return message.channel.send({
                embeds: [new MessageEmbed()
                    .setColor(config.color.red)
                    .setTitle('Wrong command usage!')
                    .setDescription(`You cannot use the \`egen\` command in this channel! Try it in <#${egenChannel}>!`)
                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
                    .setTimestamp()]
            });
        }

        const service = args[0];

        if (!service) {
            return message.channel.send({
                embeds: [new MessageEmbed()
                    .setColor(config.color.red)
                    .setTitle('Missing parameters!')
                    .setDescription('You need to give a service name!')
                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
                    .setTimestamp()]
            });
        }

        // Check if user is on cooldown for the egen command
        const cooldownKey = `${message.author.id}-egen`;
        let cooldownTime = 24 * 60 * 60 * 1000; // Default cooldown set to 24 hours (in milliseconds)

        // Check user's role and assign cooldown accordingly
        const userRole1 = message.member.roles.cache.find(role => role.id === '1213414633633751050'); // Role ID with 1-hour cooldown
        const userRole2 = message.member.roles.cache.find(role => role.id === '1200663200329371666'); // Role ID with 24-hour cooldown

        if (userRole1 && userRole1.id === '1213414633633751050') { // If the user has the role with 1-hour cooldown
            cooldownTime = 1 * 60 * 60 * 1000; // Cooldown set to 1 hour (in milliseconds)
        } else if (userRole2 && userRole2.id === '1200663200329371666') { // If the user has the role with 24-hour cooldown
            cooldownTime = 24 * 60 * 60 * 1000; // Cooldown set to 24 hours (in milliseconds)
        }

        if (cooldowns.has(cooldownKey)) {
            const remainingCooldown = cooldowns.get(cooldownKey) - Date.now();
            if (remainingCooldown > 0) {
                const hours = Math.floor(remainingCooldown / (60 * 60 * 1000)); // Convert remaining milliseconds to hours
                const minutes = Math.floor((remainingCooldown % (60 * 60 * 1000)) / (60 * 1000)); // Convert remaining milliseconds to minutes

                return message.channel.send({
                    embeds: [new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Cooldown!')
                        .setDescription(`You are on cooldown! Please wait ${hours} hours and ${minutes} minutes before using the command again.`)
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
                        .setTimestamp()]
                });
            } else {
                cooldowns.delete(cooldownKey); // Cooldown expired, remove it
            }
        }

        // Set cooldown for the egen command
        cooldowns.set(cooldownKey, Date.now() + cooldownTime);
        setTimeout(() => {
            cooldowns.delete(cooldownKey);
        }, cooldownTime);

        const filePath = `${__dirname}/../../extreme/${service}.txt`; // Update the folder path to extreme

        fs.readFile(filePath, function (error, data) {
            if (!error) {
                data = data.toString();

                const position = data.indexOf('\n');
                const firstLine = data.split('\n')[0];

                if (position === -1) {
                    return message.channel.send({
                        embeds: [new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Generator error!')
                            .setDescription(`I do not find the \`${service}\` service in my extreme stock!`)
                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
                            .setTimestamp()]
                    });
                }

                const generatedCode = firstLine; // Save the generated code

                const currentTime = new Date();
                const formattedTime = `${currentTime.getFullYear()}-${(currentTime.getMonth() + 1)
                    .toString()
                    .padStart(2, '0')}-${currentTime.getDate().toString().padStart(2, '0')} ${
                    currentTime.getHours().toString().padStart(2, '0')
                }:${currentTime.getMinutes().toString().padStart(2, '0')}:${currentTime.getSeconds().toString().padStart(2, '0')}`;

                const redemptionEmbed = new MessageEmbed()
                        .setColor(config.color.green)
                        .setTitle(`${service} Account Generated`)
                        .setDescription(`You have generated a \`\`\`${service}\`\`\` account.\nPlease wait till the BOT sends your account, this may take time so wait calmly.`)
                        .setFooter({ text: `Generated by WRECKED G3N • ${formattedTime}` });

                // DM the user with the embed
                message.author.send({ embeds: [redemptionEmbed] }).catch((err) => {
                    console.error(`Failed to send DM to ${message.author.tag}: ${err}`);
                });

                // Save the code to extremegive.txt with the username - service
                const extremegiveFilePath = `${__dirname}/../../extremegive/extremegive.txt`;
                fs.appendFileSync(extremegiveFilePath, `${message.author.username} - ${service}\n`);

                // Send a message in the extreme server channel if it's in a different server
                if (extremechannelId && providerRoleId) {
                    const extremechannel = message.client.channels.cache.get(extremechannelId);
                    if (extremechannel) {
                        const providerRole = extremechannel.guild.roles.cache.get(providerRoleId);
                        if (providerRole) {
                            extremechannel.send({
                                content: `<@&${providerRoleId}>`,
                                embeds: [
                                    new MessageEmbed()
                                        .setColor(config.color.blue)
                                        .setTitle('New Account Request')
                                        .setDescription(`User ${message.author} has requested an account. Please provide the account details to them as soon as possible.`)
                                        .addFields({ name: 'Account', value: `\`\`\`${service}\`\`\`` })
                                        .setFooter({ text: formattedTime })
                                ]
                            });
                        }
                    }
                }

                if (position !== -1) {
                    data = data.substr(position + 1);

                    fs.writeFile(filePath, data, function (error) {
                        if (error) {
                            console.error(error);
                            return message.channel.send({
                                embeds: [new MessageEmbed()
                                    .setColor(config.color.red)
                                    .setTitle('Generator error!')
                                    .setDescription('An error occurred while updating the service file.')
                                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
                                    .setTimestamp()]
                            });
                        }

                        message.channel.send({
                            embeds: [new MessageEmbed()
                                .setColor(config.color.green)
                                .setTitle('Account generated successfully!')
                                .setDescription(
                                    `Check your private messages, ${message.author}! If you do not receive the message, please unlock your private messages.`
                                )
                                .setImage(config.gif) // Use the URL from config.json
                                .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
                                .setTimestamp()]
                        });

                        generated.add(message.author.id);
                    });
                } else {
                    return message.channel.send({
                        embeds: [new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Generator error!')
                            .setDescription(`The \`${service}\` service is empty in the extreme folder!`)
                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
                            .setTimestamp()]
                    });
                }
            } else {
                return message.channel.send({
                    embeds: [new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Generator error!')
                        .setDescription(`Service \`${service}\` does not exist in the extreme folder!`)
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
                        .setTimestamp()]
                });
            }
        });
    },
};