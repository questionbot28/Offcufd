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
        .setTitle('Error')
        .setDescription('No drop session is currently active. Ask a staff member to start a drop session.');

      return message.channel.send({ embeds: [errorEmbed] });
    }
    
    // Use the configured drop folder or default to stock
    const folderPath = config.dropFolder || 'stock';

    // Get list of files in the folder
    try {
      const files = fs.readdirSync(folderPath);
      
      // Filter out only text files
      const textFiles = files.filter(file => file.endsWith('.txt'));
      
      if (textFiles.length === 0) {
        const noStockEmbed = new MessageEmbed()
          .setColor('#FF0000')
          .setTitle('No Stock Available')
          .setDescription(`There are no accounts available in the ${folderPath} tier.`);

        return message.channel.send({ embeds: [noStockEmbed] });
      }
      
      // Select a random file
      const randomFile = textFiles[Math.floor(Math.random() * textFiles.length)];
      const filePath = path.join(folderPath, randomFile);
      
      // Read the file content
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const lines = fileContent.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length === 0) {
        const emptyFileEmbed = new MessageEmbed()
          .setColor('#FF0000')
          .setTitle('Empty File')
          .setDescription(`The selected file (${randomFile}) is empty. Please try again or contact a staff member.`);

        return message.channel.send({ embeds: [emptyFileEmbed] });
      }
      
      // Get a random account
      const randomAccount = lines[Math.floor(Math.random() * lines.length)];
      
      // Remove the account from the file to prevent duplicates
      const updatedLines = lines.filter(line => line !== randomAccount);
      fs.writeFileSync(filePath, updatedLines.join('\n'), 'utf8');
      
      // Update drop statistics
      try {
        const cooldownFile = './cooldown.json';
        let cooldownData = JSON.parse(fs.readFileSync(cooldownFile, 'utf8'));
        
        // Increment total accounts claimed
        cooldownData.accountsClaimed = (cooldownData.accountsClaimed || 0) + 1;
        
        // Initialize dropStats if it doesn't exist
        if (!cooldownData.dropStats) {
          cooldownData.dropStats = {
            accounts: 0
          };
        }
        
        // Increment the accounts counter
        cooldownData.dropStats.accounts = (cooldownData.dropStats.accounts || 0) + 1;
        
        // Save updated statistics
        fs.writeFileSync(cooldownFile, JSON.stringify(cooldownData, null, 2));
        
        // Send the account as a DM to the user
        const dmEmbed = new MessageEmbed()
          .setColor('#00FF00')
          .setTitle(`Drop - ${randomFile.replace('.txt', '')}`)
          .setDescription(`Here's your account:\n\`\`\`\n${randomAccount}\n\`\`\``)
          .setFooter({ text: 'Dropped at ' + new Date().toLocaleString() });

        await message.author.send({ embeds: [dmEmbed] });
        
        // Send confirmation in the channel
        const successEmbed = new MessageEmbed()
          .setColor('#00FF00')
          .setTitle('🎉 Drop Claimed!')
          .setDescription(`${message.author.tag} has claimed an account!\nCheck your DMs for the account details.`)
          .setFooter({ text: 'Type .drop to claim an account' });

        message.channel.send({ embeds: [successEmbed] });
        
      } catch (error) {
        console.error('Error sending DM:', error);
        
        const dmErrorEmbed = new MessageEmbed()
          .setColor('#FF0000')
          .setTitle('Error')
          .setDescription('Could not send you a DM. Please make sure your DMs are open and try again.');

        message.channel.send({ embeds: [dmErrorEmbed] });
      }
      
    } catch (error) {
      console.error('Error in drop command:', error);
      
      const errorEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription('An error occurred while processing your request. Please try again later or contact a staff member.');

      message.channel.send({ embeds: [errorEmbed] });
    }
  },
};