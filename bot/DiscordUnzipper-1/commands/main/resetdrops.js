// commands/main/resetdrops.js
const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const config = require('../../config.json');

module.exports = {
  name: 'resetdrops',
  description: 'Reset drop statistics and cooldowns',
  usage: 'resetdrops',
  execute(message) {
    // Check if the user has admin or staff permissions
    const adminUserIds = config.adminUserIds || [];
    const staffRoleIds = config.staffRoleIds || [];
    
    // Check if user is in the admin list
    const isAdmin = adminUserIds.includes(message.author.id);
    
    // Check if user has staff role
    const hasStaffRole = message.member.roles.cache.some(role => staffRoleIds.includes(role.id));
    
    // For debugging - log the user's ID
    console.log(`User ${message.author.tag} (ID: ${message.author.id}) attempted to reset drops`);
    
    if (!isAdmin && !hasStaffRole) {
      const roleErrorEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription('You do not have permission to use this command.');

      return message.channel.send({ embeds: [roleErrorEmbed] });
    }

    // Reset the cooldown file with default values
    const cooldownFile = './cooldown.json';
    const resetData = {
      startdrop: 0,
      totalDrops: 0,
      lastReset: Date.now(),
      accountsClaimed: 0,
      dropStats: {
        basic: 0,
        premium: 0,
        extreme: 0,
        free: 0,
        cookie: 0
      }
    };

    try {
      fs.writeFileSync(cooldownFile, JSON.stringify(resetData, null, 2));
      
      // End any active drop session
      if (config.dropSessionActive) {
        config.dropSessionActive = false;
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
      }

      // Send success message
      const successEmbed = new MessageEmbed()
        .setColor('#00FF00')
        .setTitle('🔄 Drop System Reset')
        .setDescription('All drop statistics and cooldowns have been reset.')
        .addField('Reset Details', 'The following were reset:\n• Drop session status\n• Cooldown timers\n• Total drop count\n• Account claim statistics')
        .setFooter({ text: `Reset by ${message.author.tag} at ${new Date().toLocaleString()}` });

      message.channel.send({ embeds: [successEmbed] });
    } catch (error) {
      console.error('Error resetting drop system:', error);
      
      const errorEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription('An error occurred while resetting the drop system. Please try again later.');

      message.channel.send({ embeds: [errorEmbed] });
    }
  },
};