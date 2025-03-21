const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');
const stockForecasting = require('../../utils/stockForecasting');
const security = require('../../utils/security');

module.exports = {
  name: 'forecast',
  description: 'Get AI-powered stock forecasts',
  async execute(message, args) {
    // Admin check - This command is only for admins
    if (message.author.id !== config.ownerId && message.author.id !== config.coOwnerId) {
      return message.channel.send({
        embeds: [new MessageEmbed()
          .setColor(config.color.red)
          .setTitle('Permission Denied')
          .setDescription('Only server owner and co-owner can use this command.')
          .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
          .setTimestamp()]
      });
    }

    // Security check - rate limiting
    const rateLimited = security.isRateLimited(message.author.id, 'forecast');
    if (rateLimited) {
      const embed = security.generateRateLimitEmbed(rateLimited);
      return message.channel.send({ embeds: [embed] });
    }

    // Mark command usage in security system
    security.markCommandUsage(message.author.id, 'forecast');

    try {
      // Get all forecasts
      const allForecasts = stockForecasting.getAllForecasts();
      
      if (!allForecasts || allForecasts.length === 0) {
        return message.channel.send({
          embeds: [new MessageEmbed()
            .setColor(config.color.yellow)
            .setTitle('No Stock Forecasts Available')
            .setDescription('The forecasting system needs more data to generate accurate predictions. Please check back later.')
            .setFooter({ text: 'AI-Powered Stock Forecasting', iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
            .setTimestamp()]
        });
      }

      // If a specific service was requested
      if (args.length > 0) {
        const requestedService = args.join('_').toLowerCase();
        const forecast = stockForecasting.getForecast(requestedService);
        
        if (!forecast) {
          return message.channel.send({
            embeds: [new MessageEmbed()
              .setColor(config.color.red)
              .setTitle('Forecast Not Found')
              .setDescription(`No forecast data found for service: ${requestedService}`)
              .setFooter({ text: 'AI-Powered Stock Forecasting', iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
              .setTimestamp()]
          });
        }
        
        // Create and send the embed for the specific service
        const embed = stockForecasting.createForecastEmbed(forecast, config);
        return message.channel.send({ embeds: [embed] });
      }
      
      // If no specific service was requested, show a summary of all services
      // Sort forecasts by urgency (days until depletion)
      const sortedForecasts = [...allForecasts].sort((a, b) => a.daysUntilDepletion - b.daysUntilDepletion);
      
      // Create a summary embed
      const summaryEmbed = new MessageEmbed()
        .setColor(config.color.blue)
        .setTitle('AI Stock Forecasting Summary')
        .setDescription('Here are the latest stock forecasts for all services, sorted by urgency:')
        .setFooter({ text: 'AI-Powered Stock Forecasting', iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
        .setTimestamp();
      
      // Add each forecast as a field
      for (const forecast of sortedForecasts.slice(0, 25)) { // Discord limits embeds to 25 fields
        let statusEmoji = '🟢'; // Green for safe
        if (forecast.daysUntilDepletion < 3) {
          statusEmoji = '🔴'; // Red for critical
        } else if (forecast.daysUntilDepletion < 7) {
          statusEmoji = '🟠'; // Orange for warning
        }
        
        // Format the time remaining
        let timeRemaining;
        if (forecast.daysUntilDepletion < 1) {
          const hours = Math.max(1, Math.round(forecast.daysUntilDepletion * 24));
          timeRemaining = `~${hours} hours`;
        } else {
          timeRemaining = `~${forecast.daysUntilDepletion.toFixed(1)} days`;
        }
        
        summaryEmbed.addField(
          `${statusEmoji} ${forecast.serviceType}`,
          `Stock: ${forecast.currentStock} | Usage: ${forecast.dailyUsageRate.toFixed(1)}/day | Time Left: ${timeRemaining} | Confidence: ${forecast.confidenceLevel.toUpperCase()}`,
          false
        );
      }
      
      // Add tip for detailed view
      if (sortedForecasts.length > 0) {
        summaryEmbed.addField(
          'Get Detailed Forecast',
          'Use `.forecast [service_name]` to see detailed predictions for a specific service.',
          false
        );
      }
      
      return message.channel.send({ embeds: [summaryEmbed] });
      
    } catch (error) {
      console.error('Error generating forecasts:', error);
      return message.channel.send({
        embeds: [new MessageEmbed()
          .setColor(config.color.red)
          .setTitle('Forecast Error')
          .setDescription('An error occurred while generating stock forecasts.')
          .setFooter({ text: 'AI-Powered Stock Forecasting', iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
          .setTimestamp()]
      });
    }
  }
};