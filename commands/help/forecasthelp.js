const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
  name: 'forecasthelp',
  description: 'Get help about the AI stock forecasting system',
  execute(message) {
    const helpEmbed = new MessageEmbed()
      .setColor(config.color.blue)
      .setTitle('AI-Powered Stock Forecasting Help')
      .setDescription('The AI-powered stock forecasting system analyzes usage patterns to predict when stock will run out.')
      .addFields(
        { 
          name: 'How It Works', 
          value: 'The system tracks usage rates over time and uses advanced algorithms to predict when stocks will be depleted. Forecasts become more accurate as more data is collected.'
        },
        { 
          name: 'Commands', 
          value: '`.forecast` - Get a summary of all forecasts\n`.forecast [service_name]` - Get detailed forecast for a specific service' 
        },
        {
          name: 'Confidence Levels',
          value: '**HIGH** - Very reliable prediction based on consistent usage patterns\n**MEDIUM** - Moderately reliable prediction based on somewhat variable usage\n**LOW** - Preliminary prediction based on limited or highly variable data'
        },
        {
          name: 'Time Indicators',
          value: '🔴 Critical: Less than 3 days remaining\n🟠 Warning: Less than 7 days remaining\n🟢 Safe: More than 7 days remaining'
        },
        {
          name: 'Automated Notifications',
          value: 'The system automatically sends notifications when stock is predicted to run out soon. Notifications are sent to the configured alert channel and include @mentions based on urgency.'
        }
      )
      .setFooter({ text: 'AI-Powered Stock Forecasting System' })
      .setTimestamp();

    return message.channel.send({ embeds: [helpEmbed] });
  }
};