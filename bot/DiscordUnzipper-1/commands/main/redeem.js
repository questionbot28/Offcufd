const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const config = require('../../config.json');

module.exports = {
    name: 'redeem',
    description: 'Redeem a code',
    usage: 'redeem <code>',
    execute: async (message, args, usedPrefix) => {
        try {
            // Check if the user has the staff role
            if (!config.staffRoleIds.some((roleId) => message.member.roles.cache.has(roleId))) {
                return message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Insufficient Permissions!')
                            .setDescription('You do not have the necessary permissions to use this command.')
                            .setFooter({ 
                                text: message.author.tag, 
                                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                            })
                            .setTimestamp()
                    ]
                });
            }

            const codeToRedeem = args[0];

            // Check if the code parameter is missing
            if (!codeToRedeem) {
                return message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Missing parameters!')
                            .setDescription('You need to provide a code to redeem.')
                            .setFooter({ 
                                text: message.author.tag, 
                                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                            })
                            .setTimestamp()
                    ]
                });
            }

            // Make sure the redeemcodes directory exists
            const redeemDir = `${__dirname}/../../redeemcodes`;
            if (!fs.existsSync(redeemDir)) {
                fs.mkdirSync(redeemDir, { recursive: true });
            }

            const redeemFilePath = `${redeemDir}/redeemcodes.txt`;

            // Create the file if it doesn't exist
            if (!fs.existsSync(redeemFilePath)) {
                fs.writeFileSync(redeemFilePath, '', 'utf8');
            }

            // Read the contents of redeemcodes.txt file
            const data = await fs.promises.readFile(redeemFilePath, 'utf8');
            const lines = data.split('\n');

            // Check if the code exists in any line
            const foundLineIndex = lines.findIndex((line) => 
                line.trim().toLowerCase().startsWith(`${codeToRedeem.trim().toLowerCase()} - `)
            );

            if (foundLineIndex !== -1) {
                // Extract the content after the code
                const redeemedContent = lines[foundLineIndex].substring(`${codeToRedeem} - `.length);

                // Remove the redeemed line from the array
                lines.splice(foundLineIndex, 1);

                // Join the remaining lines
                const updatedData = lines.join('\n');

                // Write the updated content back to redeemcodes.txt
                await fs.promises.writeFile(redeemFilePath, updatedData, 'utf8');

                // Send the success message after deleting the line
                return message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.green)
                            .setTitle('REDEEMED CODE SUCCESSFULLY')
                            .setDescription(`The code has been redeemed successfully for:\n**${redeemedContent}**`)
                            .setFooter({ 
                                text: message.author.tag, 
                                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                            })
                            .setTimestamp()
                    ]
                });
            } else {
                return message.channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('REDEEM CODE INVALID')
                            .setDescription('The provided code is invalid.')
                            .setFooter({ 
                                text: message.author.tag, 
                                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                            })
                            .setTimestamp()
                    ]
                });
            }
        } catch (error) {
            console.error('Error in redeem command:', error);
            return message.channel.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('An error occurred!')
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