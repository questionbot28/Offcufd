const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const config = require('../../config.json');

module.exports = {
  name: 'stopdrop',
  description: 'Stop the current drop session',
  usage: 'stopdrop',
  execute(message) {
    // Check if the command is used in the allowed channel
    const allowedChannelId = config.dropChannelId;
    if (message.channel.id !== allowedChannelId) {
      const channelErrorEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription(`This command can only be used in <#${allowedChannelId}>.`);

      return message.channel.send({ embeds: [channelErrorEmbed] });
    }

    // Check if the user has admin or staff permissions
    const adminUserIds = config.adminUserIds || [];
    const staffRoleIds = config.staffRoleIds || [];
    
    // Check if user is in the admin list
    const isAdmin = adminUserIds.includes(message.author.id);
    
    // Check if user has staff role
    const hasStaffRole = message.member.roles.cache.some(role => staffRoleIds.includes(role.id));
    
    // For debugging - log the user's ID
    console.log(`User ${message.author.tag} (ID: ${message.author.id}) attempted to stop a drop`);
    
    if (!isAdmin && !hasStaffRole) {
      const roleErrorEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription('You do not have permission to use this command.');

      return message.channel.send({ embeds: [roleErrorEmbed] });
    }

    // Check if drop session is active
    if (!config.dropSessionActive) {
      const errorEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription('No drop session is currently active.');

      return message.channel.send({ embeds: [errorEmbed] });
    }

    // Update dropSessionActive status to false in config.json
    config.dropSessionActive = false;
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));

    // Update cooldown timestamp for startdrop
    let cooldownData;
    const cooldownFile = './cooldown.json';
    
    try {
      if (!fs.existsSync(cooldownFile)) {
        cooldownData = {
          startdrop: Date.now(),
          totalDrops: 1,
          lastReset: Date.now()
        };
      } else {
        cooldownData = JSON.parse(fs.readFileSync(cooldownFile, 'utf8'));
        cooldownData.startdrop = Date.now();
      }
      fs.writeFileSync(cooldownFile, JSON.stringify(cooldownData, null, 2));
    } catch (error) {
      console.error('Error reading/updating cooldown file:', error);
      cooldownData = {
        startdrop: Date.now(),
        totalDrops: 1,
        lastReset: Date.now()
      };
      fs.writeFileSync(cooldownFile, JSON.stringify(cooldownData, null, 2));
    }

    // Send success message
    const successEmbed = new MessageEmbed()
      .setColor('#00FF00')
      .setTitle('🛑 Drop Stopped')
      .setDescription('The drop session has stopped.')
      .addField('Cooldown', 'Limited to 4 drop sessions per 24 hours with 2-hour cooldown between drops.')
      .setFooter({ text: 'Thank you for participating!' });

    message.channel.send({ embeds: [successEmbed] });
  },
};
