// commands/help/drophelp.js
const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
  name: 'drophelp',
  description: 'Show help for drop commands',
  usage: 'drophelp',
  execute(message) {
    // Create embed with drop command help
    const helpEmbed = new MessageEmbed()
      .setColor('#0099ff')
      .setTitle('🎁 Drop System Commands')
      .setDescription(`The drop system allows users to claim accounts during special drop events in <#${config.dropChannelId}>.`)
      .addField('For Users', `
• \`.drop <tier>\` - Claim an account during an active drop session
• \`.dropstats\` - Check drop statistics and cooldowns
      `)
      .addField('Available Tiers', '• basic (b)\n• premium (p)\n• extreme (e)\n• free (f)\n• cookie (c)')
      .addField('For Staff', `
• \`.startdrop\` - Start a new drop session (staff only)
• \`.stopdrop\` - End the current drop session (staff only)
      `)
      .addField('Cooldown Rules', '• 2-hour cooldown between drops\n• Maximum 4 drops per 24-hour period')
      .setFooter({ text: 'Type .drop <tier> during active drop sessions to claim accounts!' });

    message.channel.send({ embeds: [helpEmbed] });
  },
};