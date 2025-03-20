const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const config = require('../../config.json'); // Adjust the path based on your project structure

module.exports = {
  name: 'refresh',
  description: 'Refresh drop session statistics',
  usage: 'refresh',
  execute(message) {
    // Check if the user has the required role to use the command
    const refreshRoleIds = config.refreshRoleIds; // Replace with your actual refresh role IDs
    const hasRefreshRole = message.member.roles.cache.some(role => refreshRoleIds.includes(role.id));

    if (!hasRefreshRole) {
      const roleErrorEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription('You do not have permission to use this command.');

      return message.channel.send(roleErrorEmbed);
    }

    // Refresh stats
    const cooldownFile = './cooldown.json'; // Path to the cooldown file
    const cooldownData = {
      startdrop: 0,
      totalDrops: 0,
      lastReset: Date.now(),
    };

    fs.writeFileSync(cooldownFile, JSON.stringify(cooldownData, null, 2));

    // Send success message
    const successEmbed = new MessageEmbed()
      .setColor('#00FF00')
      .setTitle('Stats Refreshed')
      .setDescription('Drop session statistics have been refreshed.');

    message.channel.send(successEmbed);
  },
};
