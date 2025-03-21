const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');
const stockForecasting = require('../../utils/stockForecasting');
const security = require('../../utils/security');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'testforecast',
  description: 'Generate test data to demonstrate the AI forecasting system',
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
    const rateLimited = security.isRateLimited(message.author.id, 'testforecast');
    if (rateLimited) {
      const embed = security.generateRateLimitEmbed(rateLimited);
      return message.channel.send({ embeds: [embed] });
    }

    try {
      // Send initial response
      const loadingEmbed = new MessageEmbed()
        .setColor(config.color.blue)
        .setTitle('Generating Test Forecast Data')
        .setDescription('Please wait while I generate test data to demonstrate the AI forecasting system...')
        .setFooter({ text: 'AI-Powered Stock Forecasting' })
        .setTimestamp();
      
      const statusMessage = await message.channel.send({ embeds: [loadingEmbed] });

      // Sample service to generate test data for
      const serviceToSimulate = args[0]?.toLowerCase() || 'netflix';
      const currentStock = parseInt(args[1]) || 100;
      
      // Create test forecasting data
      await generateTestData(serviceToSimulate, currentStock);
      
      // Get the forecast
      const forecast = stockForecasting.getForecast(`premium_${serviceToSimulate}`);
      
      if (!forecast) {
        return statusMessage.edit({
          embeds: [new MessageEmbed()
            .setColor(config.color.red)
            .setTitle('Test Failed')
            .setDescription('Failed to generate test forecast. Please try again.')
            .setFooter({ text: 'AI-Powered Stock Forecasting', iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
            .setTimestamp()]
        });
      }
      
      // Create and send the embed
      const embed = stockForecasting.createForecastEmbed(forecast, config);
      embed.setTitle(`📊 Test Forecast: ${serviceToSimulate}`);
      embed.setDescription(`This is a **test forecast** to demonstrate the AI prediction system.\n\nIn a real scenario, the system would collect data over time to make these predictions.`);
      
      return statusMessage.edit({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error in test forecast:', error);
      return message.channel.send({
        embeds: [new MessageEmbed()
          .setColor(config.color.red)
          .setTitle('Test Forecast Error')
          .setDescription('An error occurred while generating test forecast data.')
          .setFooter({ text: 'AI-Powered Stock Forecasting', iconURL: message.author.displayAvatarURL({ dynamic: true, size: 64 }) })
          .setTimestamp()]
      });
    }
  }
};

/**
 * Generate test data for forecasting demonstration
 * @param {string} serviceType - Type of service to simulate
 * @param {number} currentStock - Current stock level to simulate
 */
async function generateTestData(serviceType, currentStock) {
  // Create a simulated history with decreasing stock levels over time
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000; // milliseconds in a day
  const usageHistory = [];
  
  // Initialize forecasting for the service
  const serviceKey = `premium_${serviceType}`;
  const filePath = path.join(__dirname, `../../stock/${serviceType}.txt`);
  
  stockForecasting.initializeForecasting(serviceKey, filePath, currentStock);
  
  // Generate history data points over the last 14 days
  // with a consistent usage rate around 5-15 items per day with some variance
  const baseUsageRate = Math.floor(Math.random() * 10) + 5; // 5-15 items per day
  let remainingStock = currentStock + (baseUsageRate * 14); // Start with enough stock for history
  
  for (let i = 14; i >= 1; i--) {
    // Add some randomness to the usage
    const variance = Math.random() * 4 - 2; // -2 to +2 variance
    const usage = Math.max(1, Math.round(baseUsageRate + variance));
    
    // Record the usage
    usageHistory.push({
      timestamp: now - (i * day),
      used: usage
    });
    
    remainingStock -= usage;
  }
  
  // Add the history to the forecasting system
  const history = stockForecasting.usageHistory.get(serviceKey) || [];
  stockForecasting.usageHistory.set(serviceKey, [...history, ...usageHistory]);
  stockForecasting.lastStockLevels.set(serviceKey, currentStock);
  
  if (!stockForecasting.trackingStartTime.has(serviceKey)) {
    stockForecasting.trackingStartTime.set(serviceKey, now - (14 * day));
  }
  
  // Generate the forecast
  stockForecasting.generateForecast(serviceKey, currentStock);
  
  return true;
}