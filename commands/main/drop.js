// commands/main/drop.js
const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../../config.json');

module.exports = {
  name: 'drop',
  description: 'Claim a random account from the current drop',
  usage: 'drop',
  async execute(message, args) {
    // Check if the command is used in the allowed channel
    const allowedChannelId = config.dropChannelId;
    if (message.channel.id !== allowedChannelId) {
      const channelErrorEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription(`This command can only be used in <#${allowedChannelId}>.`);

      return message.channel.send({ embeds: [channelErrorEmbed] });
    }

    // Check if a drop session is active
    if (!config.dropSessionActive) {
      const errorEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('No Drop Active')
        .setDescription('No drop session is currently active.');

      return message.channel.send({ embeds: [errorEmbed] });
    }
    
    // Get drop status info
    const infoEmbed = new MessageEmbed()
      .setColor('#0099ff')
      .setTitle('🎁 Drop Status')
      .setDescription('A drop session is currently active!')
      .setFooter({ text: 'Drop session is running' });
    
    message.channel.send({ embeds: [infoEmbed] });
  },
};