const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const config = require('../../config.json');
const stockMonitor = require('../../utils/stockMonitor');

const generated = new Set();

module.exports = {
    name: 'fgen',
    description: 'Generate a specified service if stocked (free)',
    usage: 'fgen <service>',
    execute(message, args, usedPrefix) {
        // First check if the channel exists
        const fgenChannel = message.client.channels.cache.get(config.fgenChannel);
        if (!fgenChannel) {
            console.error('fgenChannel not found:', config.fgenChannel);
            if (config.command.error_message === true) {
                return message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Error occurred!')
                            .setDescription('Not a valid fgen channel specified!')
                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                            .setTimestamp()
                    ]
                });
            }
            return;
        }

        if (message.channel.id === config.fgenChannel) {
            if (generated.has(message.author.id)) {
                return message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Cooldown!')
                            .setDescription(`Please wait **${config.fgenCooldown}m** before executing that command again!`)
                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                            .setTimestamp()
                    ]
                });
            }

            const service = args[0];
            if (!service) {
                return message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Missing parameters!')
                            .setDescription('You need to give a service name!')
                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                            .setTimestamp()
                    ]
                });
            }
            
            // Check if service is disabled due to low stock
            const serviceKey = `free_${service.toLowerCase()}`;
            if (!stockMonitor.isServiceEnabled(serviceKey)) {
                return message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Service unavailable!')
                            .setDescription(`The \`${service}\` service is currently unavailable due to low or no stock. Please try again later.`)
                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                            .setTimestamp()
                    ]
                });
            }

            // Make sure the fstock directory exists
            const fstockDir = `${__dirname}/../../fstock`;
            if (!fs.existsSync(fstockDir)) {
                fs.mkdirSync(fstockDir, { recursive: true });
            }

            const filePath = `${fstockDir}/${service}.txt`;

            fs.readFile(filePath, function (error, data) {
                if (!error) {
                    data = data.toString();
                    const position = data.toString().indexOf('\n');
                    const firstLine = data.split('\n')[0];

                    if (position === -1) {
                        return message.channel.send({
                            embeds: [
                                new MessageEmbed()
                                    .setColor(config.color.red)
                                    .setTitle('Generator error!')
                                    .setDescription(`I do not find the \`${service}\` service in my fstock!`)
                                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                    .setTimestamp()
                            ]
                        });
                    }

                    const generatedCode = firstLine;
                    const currentTime = new Date();
                    const formattedTime = `${currentTime.getFullYear()}-${(currentTime.getMonth() + 1)
                        .toString()
                        .padStart(2, '0')}-${currentTime.getDate().toString().padStart(2, '0')} ${
                        currentTime.getHours().toString().padStart(2, '0')
                    }:${currentTime.getMinutes().toString().padStart(2, '0')}:${currentTime.getSeconds().toString().padStart(2, '0')}`;

                    const redemptionEmbed = new MessageEmbed()
                        .setColor(config.color.green)
                        .setTitle('NEXUS G3N')
                        .setDescription('**Follow these steps to redeem your code:**\nStep 1: Click on this [LINK](https://link-center.net/1317305/wrecked-gen), complete some steps and register with your Discord nickname.\nStep 2: Go to the Ticket channel\nStep 3: Click on Redeem a code\nStep 4: Send this code to staff:')
                        .addField('Code', `\`\`\`${generatedCode}\`\`\``)
                        .setFooter(`Generated by NEXUS G3N • ${formattedTime}`);

                    // Make sure the redeemcodes directory exists
                    const redeemDir = `${__dirname}/../../redeemcodes`;
                    if (!fs.existsSync(redeemDir)) {
                        fs.mkdirSync(redeemDir, { recursive: true });
                    }

                    // DM the user with the embed
                    message.author.send({ embeds: [redemptionEmbed] }).then(() => {
                        // Save the code to redeemcodes.txt
                        const redeemFilePath = `${redeemDir}/redeemcodes.txt`;
                        fs.appendFileSync(redeemFilePath, `${generatedCode} - ${service} in free category\n`);

                        if (position !== -1) {
                            data = data.substr(position + 1);
                            fs.writeFile(filePath, data, function (error) {
                                if (error) {
                                    console.error('Error updating service file:', error);
                                    return message.channel.send({
                                        embeds: [
                                            new MessageEmbed()
                                                .setColor(config.color.red)
                                                .setTitle('Generator error!')
                                                .setDescription('An error occurred while updating the service file.')
                                                .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                                .setTimestamp()
                                        ]
                                    });
                                }

                                message.channel.send({
                                    embeds: [
                                        new MessageEmbed()
                                            .setColor(config.color.green)
                                            .setTitle('Account generated successfully!')
                                            .setDescription(`Check your private messages ${message.author}! If you do not receive the message, please unlock your private messages.`)
                                            .setImage(config.gif)
                                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                            .setTimestamp()
                                    ]
                                });

                                generated.add(message.author.id);
                                setTimeout(() => {
                                    generated.delete(message.author.id);
                                }, config.fgenCooldown * 60 * 1000);
                            });
                        }
                    }).catch((err) => {
                        console.error(`Failed to send DM to ${message.author.tag}:`, err);
                        message.channel.send({
                            embeds: [
                                new MessageEmbed()
                                    .setColor(config.color.red)
                                    .setTitle('Error!')
                                    .setDescription('Could not send you a DM. Please enable direct messages from server members.')
                                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                    .setTimestamp()
                            ]
                        });
                    });
                } else {
                    return message.channel.send({
                        embeds: [
                            new MessageEmbed()
                                .setColor(config.color.red)
                                .setTitle('Generator error!')
                                .setDescription(`Service \`${service}\` does not exist!`)
                                .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                .setTimestamp()
                        ]
                    });
                }
            });
        } else {
            message.channel.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Wrong command usage!')
                        .setDescription(`You cannot use the \`fgen\` command in this channel! Try it in <#${config.fgenChannel}>!`)
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            });
        }
    },
};