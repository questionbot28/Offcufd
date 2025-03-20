const fs = require('fs').promises;
const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'egive',
    description: 'Give a service to a user (extreme)',
    usage: 'egive <service> anything1:anything2',
    async execute(message, args) {
        const targetServerId = '1200663200329371658';
        const providerRoleId = config.providorRole; // Replace with your actual provider role ID

        // Check if the command is used in a DM
        if (!message.guild) {
            const service = args[0];
            const details = args.slice(1).join(' ');

            if (!service || !details) {
                return message.channel.send('Please provide a service and details.');
            }

            try {
                // Check if the user has the "provider" role in any server where the bot is present
                let hasProviderRole = false;
                for (const [, guild] of message.client.guilds.cache) {
                    const member = await guild.members.fetch(message.author.id);
                    if (member && member.roles && member.roles.cache.has(providerRoleId)) {
                        hasProviderRole = true;
                        break;
                    }
                }

                if (!hasProviderRole) {
                    return message.channel.send('You do not have the required role to use this command.');
                }

                // Read the content of extremegive.txt
                const filePath = `${__dirname}/../../extremegive/extremegive.txt`;
                const data = await fs.readFile(filePath, 'utf8');

                // Use regex to match the username and service
                const regex = new RegExp(`(.+?) - ${service}`, 'i');
                const match = data.match(regex);

                if (!match) {
                    return message.channel.send(`No receiver found for the service ${service}. Please make sure the service exists in the receiver list.`);
                }

                const receiverUsername = match[1].trim();
                const targetServer = message.client.guilds.cache.get(targetServerId);
                const receiver = targetServer.members.cache.find((m) => m.user.username === receiverUsername);

                if (!receiver) {
                    return message.channel.send(`Receiver ${receiverUsername} not found in the server.`);
                }

                // Send DM to the receiver
                const receiverUser = targetServer.members.cache.find((m) => m.user.username === receiverUsername);
                if (receiverUser) {
                    const giverUser = targetServer.members.cache.find((m) => m.user.id === message.author.id);
 
                     receiverUser.send(`
How to get on your own mail?:
1. Go to temp-mail.io
2. On the top menus, you will see forwarding, click that.
3. Now enter the first part of the mail and in the drop-down, select the part after @ (don't include @).
4. Now, enter your real mail, which should not be registered with the service you generated.
5. Submit and go to the account we gave, change the mail, and you will get the change mail to the real mail you provided. Change the password also the same.
`).catch((err) => {
    console.error(`Failed to send DM to ${receiverUser.user.tag}: ${err}`);
});


                    // Create an embed for the receiver's DM
                    const receiverEmbed = new MessageEmbed()
                        .setColor(config.color.blue)
                        .setTitle(`Your ${service}`)
                        .addFields([
                            { name: 'Giver', value: giverUser.user.tag, inline: true },
                            { name: 'Service', value: service, inline: true },
                            { name: 'Account', value: details }
                        ])
                        .setFooter({ text: 'Service provided by the bot' });

                    // Send DM to the receiver
                    receiverUser.send({ embeds: [receiverEmbed] }).catch((err) => {
                        console.error(`Failed to send DM to ${receiverUser.user.tag}: ${err}`);
                    });

                    // Create an embed for the extreme channel
                    const extremeEmbed = new MessageEmbed()
                        .setColor(config.color.blue)
                        .setTitle(`Service Sent: ${service}`)
                        .addFields([
                            { name: 'Giver', value: giverUser.user.tag, inline: true },
                            { name: 'Receiver', value: receiverUser.user.tag, inline: true },
                            { name: 'Service', value: service, inline: true }
                        ])
                        .setFooter({ text: 'Service provided by the bot' });

                    // Send message to the extreme channel
                    const extremechannelId = config.extremechannelId;
                    if (extremechannelId) {
                        const extremechannel = message.client.channels.cache.get(extremechannelId);
                        if (extremechannel) {
                            extremechannel.send({ embeds: [extremeEmbed] });
                        }
                    }

                    // Update user database
                    const userDbPath = `${__dirname}/../../user_database.txt`;
                    const userData = await fs.readFile(userDbPath, 'utf8');
                    let userDatabase = {};

                    try {
                        userDatabase = JSON.parse(userData);
                    } catch (parseError) {
                        console.error(`Error parsing user database JSON: ${parseError}`);
                        return message.channel.send('Error processing the command.');
                    }

                    // Update user count
                    userDatabase[message.author.id] = (userDatabase[message.author.id] || 0) + 1;

                    // Write updated user database back to file
                    await fs.writeFile(userDbPath, JSON.stringify(userDatabase, null, 2), 'utf8');

                    // Remove the line from extremegive.txt
                    const updatedData = data.replace(match[0], '');
                    await fs.writeFile(filePath, updatedData, 'utf8');

                    return message.channel.send(`Service successfully given to ${receiverUser.user.tag}.`);
                } else {
                    return message.channel.send(`Receiver ${receiverUsername} not found in the server.`);
                }
            } catch (error) {
                console.error(`Error processing the command: ${error}`);
                return message.channel.send('Error processing the command.');
            }
        } else {
            // Command used outside DM, ignore or send a message indicating it's not allowed here
            return message.channel.send('This command can only be used in DMs.');
        }
    },
};
