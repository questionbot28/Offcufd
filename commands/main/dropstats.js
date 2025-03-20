// commands/main/dropstats.js
const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const config = require('../../config.json');

module.exports = {
  name: 'dropstats',
  description: 'Show current drop statistics',
  usage: 'dropstats',
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

    // Load cooldown data
    let cooldownData;
    const cooldownFile = './cooldown.json';
    
    try {
      if (!fs.existsSync(cooldownFile)) {
        cooldownData = {
          startdrop: 0,
          totalDrops: 0,
          lastReset: Date.now()
        };
        fs.writeFileSync(cooldownFile, JSON.stringify(cooldownData, null, 2));
      } else {
        cooldownData = JSON.parse(fs.readFileSync(cooldownFile, 'utf8'));
      }
    } catch (error) {
      console.error('Error reading cooldown file:', error);
      return message.channel.send({ 
        embeds: [
          new MessageEmbed()
            .setColor('#FF0000')
            .setTitle('Error')
            .setDescription('Failed to read drop statistics. Please try again later.')
        ] 
      });
    }

    // Calculate time until next drop is allowed
    const cooldownDuration = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
    const elapsedTime = Date.now() - cooldownData.startdrop;
    const cooldownActive = elapsedTime < cooldownDuration;
    
    let cooldownStatus = 'No active cooldown. Drops can be started now.';
    
    if (cooldownActive) {
      const remainingTime = cooldownDuration - elapsedTime;
      const hours = Math.floor(remainingTime / (60 * 60 * 1000));
      const minutes = Math.floor((remainingTime % (60 * 60 * 1000)) / (60 * 1000));
      cooldownStatus = `Cooldown active. Next drop available in ${hours} hours and ${minutes} minutes.`;
    }

    // Calculate time until drop count resets
    const resetDuration = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const timeUntilReset = resetDuration - (Date.now() - cooldownData.lastReset);
    
    const resetHours = Math.floor(timeUntilReset / (60 * 60 * 1000));
    const resetMinutes = Math.floor((timeUntilReset % (60 * 60 * 1000)) / (60 * 1000));

    // Calculate total accounts claimed
    const accountsClaimed = cooldownData.accountsClaimed || 0;
    const dropStats = cooldownData.dropStats || {
      accounts: 0
    };
    
    // Create embed with drop stats
    const statsEmbed = new MessageEmbed()
      .setColor('#0099ff')
      .setTitle('📊 Drop Statistics')
      .setDescription(`Current drop session status: ${config.dropSessionActive ? '**ACTIVE**' : '**INACTIVE**'}`)
      .addField('Drops Today', `${cooldownData.totalDrops}/4`, true)
      .addField('Drops Remaining', `${Math.max(0, 4 - cooldownData.totalDrops)}/4`, true)
      .addField('Drop Count Reset', `Resets in ${resetHours} hours and ${resetMinutes} minutes`)
      .addField('Cooldown Status', cooldownStatus)
      .addField('Total Accounts Claimed', `${accountsClaimed}`, true)
      .addField('Current Drop Folder', `${config.dropFolder || 'stock'}`)
      .setFooter({ text: `Last updated: ${new Date().toLocaleString()}` });

    message.channel.send({ embeds: [statsEmbed] });
  },
};