/**
 * AI-Powered Stock Forecasting System for Discord Bot
 * Analyzes usage patterns to predict stock depletion and provides advance warnings
 */

const fs = require('fs');
const path = require('path');
const { MessageEmbed } = require('discord.js');
const config = require('../config.json');

// Store usage history for each service
const usageHistory = new Map();
// Store the last stock level for calculating usage rates
const lastStockLevels = new Map();
// Store forecasted depletion dates
const depletionForecasts = new Map();
// Track when usage data started to be collected
const trackingStartTime = new Map();

/**
 * Initialize the forecasting system for a service
 * @param {string} serviceType - The service type (e.g., 'netflix', 'spotify')
 * @param {string} stockPath - Path to the stock file
 * @param {number} currentCount - Current stock count
 */
function initializeForecasting(serviceType, stockPath, currentCount) {
    if (!usageHistory.has(serviceType)) {
        usageHistory.set(serviceType, []);
    }
    
    if (!trackingStartTime.has(serviceType)) {
        trackingStartTime.set(serviceType, Date.now());
    }
    
    lastStockLevels.set(serviceType, currentCount);
}

/**
 * Record usage data for a service
 * @param {string} serviceType - The service type (e.g., 'netflix', 'spotify')
 * @param {string} stockPath - Path to the stock file
 * @param {number} currentCount - Current stock count
 */
function recordUsageData(serviceType, stockPath, currentCount) {
    const lastCount = lastStockLevels.get(serviceType);
    if (lastCount === undefined) {
        lastStockLevels.set(serviceType, currentCount);
        return;
    }
    
    // Calculate stock used since last check
    const used = Math.max(0, lastCount - currentCount);
    if (used > 0) {
        // Record timestamp and amount used
        usageHistory.get(serviceType).push({
            timestamp: Date.now(),
            used: used
        });
        
        // Keep only the last 30 days of data for analysis
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        usageHistory.set(
            serviceType, 
            usageHistory.get(serviceType).filter(record => record.timestamp >= thirtyDaysAgo)
        );
        
        // Update last stock level
        lastStockLevels.set(serviceType, currentCount);
        
        // Generate forecast with new data
        generateForecast(serviceType, currentCount);
    }
}

/**
 * Generate a forecast for when the stock will be depleted
 * @param {string} serviceType - The service type (e.g., 'netflix', 'spotify')
 * @param {number} currentCount - Current stock count
 * @returns {Object} - Forecast data
 */
function generateForecast(serviceType, currentCount) {
    const history = usageHistory.get(serviceType);
    if (!history || history.length < 3) {
        // Need at least 3 data points for a meaningful prediction
        return null;
    }
    
    // Calculate average usage rate per day
    const totalUsed = history.reduce((sum, record) => sum + record.used, 0);
    const trackingDuration = (Date.now() - trackingStartTime.get(serviceType)) / (24 * 60 * 60 * 1000); // in days
    
    // Use a minimum tracking duration of 1 day to avoid division by zero or unrealistic rates
    const effectiveDuration = Math.max(1, trackingDuration);
    const dailyUsageRate = totalUsed / effectiveDuration;
    
    // Calculate days until depletion
    const daysUntilDepletion = dailyUsageRate > 0 ? currentCount / dailyUsageRate : 999;
    
    // Create forecast data
    const forecast = {
        serviceType,
        currentStock: currentCount,
        dailyUsageRate,
        daysUntilDepletion,
        depletionDate: new Date(Date.now() + (daysUntilDepletion * 24 * 60 * 60 * 1000)),
        dataPoints: history.length,
        confidenceLevel: calculateConfidenceLevel(history)
    };
    
    // Store the forecast
    depletionForecasts.set(serviceType, forecast);
    
    return forecast;
}

/**
 * Calculate confidence level based on data consistency
 * @param {Array} history - Usage history data
 * @returns {string} - Confidence level (high, medium, low)
 */
function calculateConfidenceLevel(history) {
    if (history.length < 5) return "low";
    
    // Calculate standard deviation of usage rates
    const usageRates = [];
    for (let i = 1; i < history.length; i++) {
        const timeDiff = (history[i].timestamp - history[i-1].timestamp) / (24 * 60 * 60 * 1000); // in days
        if (timeDiff > 0) {
            usageRates.push(history[i].used / timeDiff);
        }
    }
    
    if (usageRates.length < 3) return "low";
    
    const mean = usageRates.reduce((sum, rate) => sum + rate, 0) / usageRates.length;
    const variance = usageRates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / usageRates.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Calculate coefficient of variation (CV)
    const cv = mean > 0 ? standardDeviation / mean : 999;
    
    // Determine confidence level based on CV
    if (cv < 0.3) return "high";
    if (cv < 0.7) return "medium";
    return "low";
}

/**
 * Get forecasts for all services
 * @returns {Array} - Array of forecasts
 */
function getAllForecasts() {
    return Array.from(depletionForecasts.values());
}

/**
 * Get forecast for a specific service
 * @param {string} serviceType - The service type
 * @returns {Object} - Forecast data
 */
function getForecast(serviceType) {
    return depletionForecasts.get(serviceType);
}

/**
 * Creates an embed message with forecast information
 * @param {Object} forecast - Forecast data
 * @param {Object} config - Bot configuration
 * @returns {MessageEmbed} - Discord embed with forecast
 */
function createForecastEmbed(forecast, config) {
    // Format the depletion date
    const dateOptions = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    const formattedDate = forecast.depletionDate.toLocaleDateString('en-US', dateOptions);
    
    // Choose color based on urgency
    let color = config.color?.green || '#00ff00';
    if (forecast.daysUntilDepletion < 3) {
        color = config.color?.red || '#ff0000';
    } else if (forecast.daysUntilDepletion < 7) {
        color = config.color?.yellow || '#ffff00';
    }
    
    // Format days until depletion more precisely
    let timeUntilDepletion;
    if (forecast.daysUntilDepletion < 1) {
        const hoursRemaining = forecast.daysUntilDepletion * 24;
        timeUntilDepletion = `${hoursRemaining.toFixed(1)} hours`;
    } else {
        timeUntilDepletion = `${forecast.daysUntilDepletion.toFixed(1)} days`;
    }
    
    // Create the embed
    const embed = new MessageEmbed()
        .setColor(color)
        .setTitle(`Stock Forecast: ${forecast.serviceType}`)
        .setDescription(`Based on usage patterns, I've analyzed when this service will run out of stock.`)
        .addFields(
            { name: 'Current Stock', value: `${forecast.currentStock}`, inline: true },
            { name: 'Daily Usage Rate', value: `${forecast.dailyUsageRate.toFixed(2)}/day`, inline: true },
            { name: 'Time Until Empty', value: timeUntilDepletion, inline: true },
            { name: 'Estimated Depletion Date', value: formattedDate, inline: false },
            { name: 'Forecast Confidence', value: `${forecast.confidenceLevel.toUpperCase()} (based on ${forecast.dataPoints} data points)`, inline: false }
        )
        .setFooter({ text: 'AI-Powered Stock Forecasting' })
        .setTimestamp();
    
    return embed;
}

/**
 * Checks forecasts and sends warnings if stocks are running low
 * @param {Object} client - Discord client
 * @param {Object} config - Bot configuration
 */
async function checkAndSendForecasts(client, config) {
    // Get forecasts that meet warning criteria
    const forecasts = getAllForecasts();
    const warningForecasts = forecasts.filter(forecast => {
        // Warn if stock will deplete within 7 days and confidence is medium or high
        return forecast.daysUntilDepletion < 7 && 
               forecast.confidenceLevel !== "low" &&
               forecast.currentStock > 0;
    });
    
    if (warningForecasts.length === 0) return;
    
    try {
        // Get notification channel
        const notificationChannel = client.channels.cache.get(config.stockNotificationChannel);
        if (!notificationChannel) {
            console.error('Stock notification channel not found');
            return;
        }
        
        // Send each forecast that requires attention
        for (const forecast of warningForecasts) {
            const embed = createForecastEmbed(forecast, config);
            
            // Add mentions based on urgency
            let content = '';
            if (forecast.daysUntilDepletion < 3) {
                // High urgency - ping owner and co-owner
                content = `<@${config.ownerId}> <@${config.coOwnerId}> **URGENT:** Stock is critically low!`;
            } else if (forecast.daysUntilDepletion < 5) {
                // Medium urgency - ping owner
                content = `<@${config.ownerId}> Stock will run out soon!`;
            }
            
            await notificationChannel.send({ content, embeds: [embed] });
        }
    } catch (error) {
        console.error('Error sending stock forecasts:', error);
    }
}

/**
 * Save forecasting data to disk
 */
function saveForecastingData() {
    const data = {
        usageHistory: Object.fromEntries(usageHistory),
        lastStockLevels: Object.fromEntries(lastStockLevels),
        trackingStartTime: Object.fromEntries(trackingStartTime),
        lastUpdated: Date.now()
    };
    
    try {
        fs.writeFileSync(
            path.join(__dirname, '../forecasting_data.json'), 
            JSON.stringify(data, null, 2)
        );
    } catch (error) {
        console.error('Error saving forecasting data:', error);
    }
}

/**
 * Load forecasting data from disk
 */
function loadForecastingData() {
    try {
        const filePath = path.join(__dirname, '../forecasting_data.json');
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            // Restore data structures
            Object.entries(data.usageHistory || {}).forEach(([key, value]) => {
                usageHistory.set(key, value);
            });
            
            Object.entries(data.lastStockLevels || {}).forEach(([key, value]) => {
                lastStockLevels.set(key, value);
            });
            
            Object.entries(data.trackingStartTime || {}).forEach(([key, value]) => {
                trackingStartTime.set(key, value);
            });
            
            console.log(`Loaded forecasting data last updated: ${new Date(data.lastUpdated).toLocaleString()}`);
        }
    } catch (error) {
        console.error('Error loading forecasting data:', error);
    }
}

/**
 * Initialize the forecasting system
 */
function initializeForecasting() {
    loadForecastingData();
    
    // Save data periodically (every hour)
    setInterval(() => {
        saveForecastingData();
    }, 60 * 60 * 1000);
}

module.exports = {
    initializeForecasting,
    recordUsageData,
    generateForecast,
    getForecast,
    getAllForecasts,
    createForecastEmbed,
    checkAndSendForecasts,
    saveForecastingData,
    loadForecastingData
};