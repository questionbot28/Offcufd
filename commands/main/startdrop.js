const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const config = require('../../config.json');

module.exports = {
  name: 'startdrop',
  description: 'Start a drop session',
  usage: 'startdrop',
  async execute(message) {
    // Check if the command is used in the allowed channel
    const allowedChannelId = config.dropChannelId;
    if (message.channel.id !== allowedChannelId) {
      const channelErrorEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription(`This command can only be used in <#${allowedChannelId}>.`);
      await message.channel.send({ embeds: [channelErrorEmbed] });
      return;
    }

    // Check if the user has admin or staff permissions
    const adminUserIds = config.adminUserIds || [];
    const staffRoleIds = config.staffRoleIds || [];
    
    // Check if user is in the admin list
    const isAdmin = adminUserIds.includes(message.author.id);
    
    // Check if user has staff role
    const hasStaffRole = message.member.roles.cache.some(role => staffRoleIds.includes(role.id));
    
    // For debugging - log the user's ID
    console.log(`User ${message.author.tag} (ID: ${message.author.id}) attempted to start a drop`);
    console.log(`Admin IDs:`, adminUserIds);
    console.log(`Staff Role IDs:`, staffRoleIds);
    
    if (!isAdmin && !hasStaffRole) {
      const roleErrorEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription('You do not have permission to use this command.');

      await message.channel.send({ embeds: [roleErrorEmbed] });
      return;
    }

    // Check if drop session is already active
    if (config.dropSessionActive) {
      const errorEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription('A drop session is already in progress.');

      await message.channel.send({ embeds: [errorEmbed] });
      return;
    }

    // Check cooldown and total drop limit
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
      console.error('Error reading/creating cooldown file:', error);
      cooldownData = {
        startdrop: 0,
        totalDrops: 0,
        lastReset: Date.now()
      };
      fs.writeFileSync(cooldownFile, JSON.stringify(cooldownData, null, 2));
    }

    // Reset totalDrops if 24 hours have passed since lastReset
    const resetDuration = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    if (Date.now() - cooldownData.lastReset > resetDuration) {
      cooldownData.totalDrops = 0;
      cooldownData.lastReset = Date.now();
    }

    const cooldownDuration = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
    const elapsedTime = Date.now() - cooldownData.startdrop;

    if (cooldownData.startdrop && elapsedTime < cooldownDuration) {
      const remainingTime = cooldownDuration - elapsedTime;
      const hours = Math.floor(remainingTime / (60 * 60 * 1000));
      const minutes = Math.floor((remainingTime % (60 * 60 * 1000)) / (60 * 1000));

      const cooldownErrorEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('Cooldown Active')
        .setDescription(`Cooldown in effect. Please wait for ${hours} hours and ${minutes} minutes before starting another drop session.`);

      await message.channel.send({ embeds: [cooldownErrorEmbed] });
      return; // Return without throwing error
    }

    // Check total drop limit (4 drops per 24-hour period)
    if (cooldownData.totalDrops >= 3) {
      const limitErrorEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('Drop Limit Reached')
        .setDescription('The maximum limit of 4 drops has been reached for the 24-hour period.');

      await message.channel.send({ embeds: [limitErrorEmbed] });
      return; // Return without throwing error
    }

    // Update dropSessionActive status to true in config.json
    config.dropSessionActive = true;
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));

    // Update cooldown timestamp and totalDrops count for startdrop
    cooldownData.startdrop = Date.now();
    cooldownData.totalDrops += 1;
    fs.writeFileSync(cooldownFile, JSON.stringify(cooldownData, null, 2));

    // Send success message
    const successEmbed = new MessageEmbed()
      .setColor('#00FF00')
      .setTitle('🎁 Drop Started!')
      .setDescription('A new drop session has started! Hurry up and get the drops!!')
      .addField('Available Tiers', 'basic (b), premium (p), extreme (e), free (f), cookie (c)')
      .addField('Example', '`.drop basic` or `.drop b`')
      .setFooter({ text: 'Hurry! First come, first served!' });

    // Mention the drop role if it exists in config
    const dropRoleId = config.dropRoleId || '1200669551168340068';
    await message.channel.send(`<@&${dropRoleId}>`);
    await message.channel.send({ embeds: [successEmbed] });
  }
};
