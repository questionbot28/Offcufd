const { MessageEmbed } = require('discord.js');

module.exports = {
  name: 'chathelp',
  description: 'Shows help for the AI chat commands',
  usage: 'chathelp',
  execute(message) {
    const embed = new MessageEmbed()
      .setColor('#0099ff')
      .setTitle('🤖 AI Chat Commands')
      .setDescription('This bot is equipped with Google\'s Gemini AI to have natural conversations. Here\'s how to use the chat features:')
      .addFields(
        { 
          name: '`.chat <message>`', 
          value: 'Talk with the AI in a channel. The bot will respond publicly in the same channel.\nExample: `.chat Tell me a joke about programming`' 
        },
        { 
          name: '`.chatdm <message>`', 
          value: 'Start a private conversation with the AI in your DMs. This allows for a more personal interaction.\nExample: `.chatdm What are the best programming languages to learn?`' 
        },
        {
          name: '💡 Tips for better conversations',
          value: '• Be specific in your questions for better answers\n• The AI maintains context in DM conversations\n• You can ask follow-up questions in DMs and the AI will remember previous messages'
        }
      )
      .setFooter({ text: 'Made by itsmeboi' });

    message.channel.send({ embeds: [embed] });
  }
};