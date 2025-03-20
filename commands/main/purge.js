const config = require('../../config.json');

module.exports = {
    name: 'purge',
    description: 'Delete a specified number of messages.',
    purgeroleids: config.purgeroleids,
  usage: 'purge <1 / above>',

    execute: async (message, args, usedPrefix) => {
        // Check if the user has the purge role
        if (!message.member.roles.cache.some(role => module.exports.purgeroleids.includes(role.id))) {
            return message.reply('You do not have the necessary permissions to use this command.');
        }

        // Check if the number of messages to delete is provided
        const deleteCount = parseInt(args[0], 10);

        // Check if the deleteCount is a valid number
        if (isNaN(deleteCount) || deleteCount <= 0) {
            return message.reply('Please provide a valid number of messages to delete.');
        }

        try {
            // Fetch messages and delete them
            const fetched = await message.channel.messages.fetch({ limit: deleteCount + 1 });
            await message.channel.bulkDelete(fetched, true);

            // Provide a confirmation message
            message.channel.send(`Deleted ${deleteCount} messages.`).then(msg => {
                // Automatically delete the confirmation message after 5 seconds
                setTimeout(() => {
                    msg.delete();
                }, 5000);
            });
        } catch (error) {
            console.error(error);
            return message.reply('An error occurred while trying to delete messages.');
        }
    },
};
