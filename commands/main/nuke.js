const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'nuke',
    description: 'Delete all messages in the channel.',
    nukeroleids: config.nukeroleids,
  usage: 'nuke>',
    execute: async (message, args, usedPrefix) => {
        // Check if the user is an admin
        if (!message.member.roles.cache.some(role => module.exports.nukeroleids.includes(role.id))) {
            return message.reply('You do not have the necessary permissions to use this command.');
        }

        try {
            // Fetch messages in the channel and delete them
            const messages = await message.channel.messages.fetch();
            await message.channel.bulkDelete(messages);

            // Announce the channel nuke with the user who initiated it
            const nukeEmbed = new MessageEmbed()
                .setColor('#ff0000')
                .setDescription(`🚀 Channel nuked by ${message.author}! 💣`);
            return message.channel.send(nukeEmbed);

        } catch (error) {
            console.error(error);

            // Handle specific errors
            if (error.code === 10003) {
                return message.reply('Unable to find the channel. Please make sure the channel exists and try again.');
            } else {
                return message.reply('An error occurred while deleting messages.');
            }
        }
    },
};
