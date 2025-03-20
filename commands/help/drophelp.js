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
      .setDescription(`The drop system allows admins to run special drop events in <#${config.dropChannelId}>.`)
      .addField('For Users', `
• \`.drop\` - Check if a drop session is active
• \`.dropstats\` - Check drop statistics
      `)
      .addField('For Staff', `
• \`.startdrop\` - Start a new drop session (staff only)
• \`.stopdrop\` - End the current drop session (staff only)
      `)
      .setFooter({ text: 'Watch for drop announcements in the channel!' });

    message.channel.send({ embeds: [helpEmbed] });
  },
};