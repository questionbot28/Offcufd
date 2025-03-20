const { MessageEmbed } = require('discord.js');

module.exports = {
  name: 'naturalchathelp',
  description: 'Shows help for natural conversation with the bot',
  usage: 'naturalchathelp',
  execute(message) {
    const embed = new MessageEmbed()
      .setColor('#0099ff')
      .setTitle('🗣️ Natural Conversation with Bot')
      .setDescription('This bot can now chat naturally with you without requiring commands! Here\'s how to use this feature:')
      .addFields(
        { 
          name: 'How to talk to the bot', 
          value: 'You can start a conversation with the bot in these ways:\n• Mention the bot: `@Bot Name hello there`\n• Ask a question: `how does the drop system work?`\n• Use keywords like "bot" or "help" in your message'
        },
        { 
          name: 'What the bot knows', 
          value: '• The bot was made by the "𝗪𝗥𝗘𝗖𝗞𝗘𝗗 𝗚𝟯𝗡" team\n• All available commands and how to use them\n• Details about account generation, stock, drops, etc.\n• Information about the vouching system'
        },
        {
          name: '💡 Tips for better conversations',
          value: '• Be clear and specific in your questions\n• For complex tasks, regular commands are still more reliable\n• The bot maintains context in conversations\n• In DMs, the bot will always respond to your messages'
        }
      )
      .setFooter({ text: 'Made by itsmeboi' });

    message.channel.send({ embeds: [embed] });
  }
};