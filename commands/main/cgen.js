const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const config = require('../../config.json');
const stockMonitor = require('../../utils/stockMonitor');
const security = require('../../utils/security');

const generated = new Set();

module.exports = {
    name: 'cgen',
    description: 'Generate a specified service if stocked (cookies)',
    usage: 'cgen <service>',

    execute(message, args, usedPrefix) {
        // First check if the channel exists
        const cgenChannel = message.client.channels.cache.get(config.cgenChannel);
        if (!cgenChannel) {
            console.error('cgenChannel not found:', config.cgenChannel);
            if (config.command.error_message === true) {
                return message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Error occurred!')
                            .setDescription('Not a valid cgen channel specified!')
                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                            .setTimestamp()
                    ]
                });
            }
            return;
        }

        if (message.channel.id === config.cgenChannel) {
            // Check if user is rate limited or blocked by security system
            const rateLimitInfo = security.isRateLimited(message.author.id, 'cgen');
            if (rateLimitInfo) {
                return message.channel.send({
                    embeds: [security.generateRateLimitEmbed(rateLimitInfo)]
                });
            }
            
            // Check legacy cooldown system
            if (generated.has(message.author.id)) {
                return message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Cooldown!')
                            .setDescription(`Please wait **${config.genCooldown}m** before executing that command again!`)
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
            const serviceKey = `cookies_${service.toLowerCase()}`;
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

            // Make sure the cookies directory exists
            const cookiesDir = `${__dirname}/../../cookies`;
            if (!fs.existsSync(cookiesDir)) {
                fs.mkdirSync(cookiesDir, { recursive: true });
            }

            const filePath = `${cookiesDir}/${service}.txt`;

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
                                    .setDescription(`I do not find the \`${service}\` service in my cookies stock!`)
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
                        .setDescription('**Follow these steps to redeem your code:**\nStep 1: Click on this [LINK](https://linkvertise.com/1095610/veify-to-claim-rewards?o=sharing) , complete some steps and register with your Discord nickname.\nStep 2: Go to the Ticket channel\nStep 3: Click on Redeem a code\nStep 4: Send this code to staff:')
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
                        fs.appendFileSync(redeemFilePath, `${generatedCode} - ${service} in cookies category\n`);

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

                                // Record this usage in the security system
                                security.markCommandUsage(message.author.id, 'cgen');
                                
                                // Legacy cooldown system
                                generated.add(message.author.id);
                                setTimeout(() => {
                                    generated.delete(message.author.id);
                                }, config.genCooldown * 60 * 1000);
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
                        .setDescription(`You cannot use the \`cgen\` command in this channel! Try it in <#${config.cgenChannel}>!`)
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            });
        }
    },
};