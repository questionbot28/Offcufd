/**
 * Stock Monitoring System for Discord Bot
 * Automatically monitors stock levels and sends alerts when stocks are running low
 */
const fs = require('fs');
const path = require('path');
const Discord = require('discord.js');

// Cache for storing current stock levels to avoid unnecessary notifications
const stockCache = new Map();
// Cache for storing disabled services to avoid re-disabling
const disabledServices = new Set();

/**
 * Counts items in a text file
 * @param {string} filePath - Path to the file
 * @returns {Promise<number>} - Number of non-empty lines
 */
async function countItems(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return 0;
        }
        
        const content = await fs.promises.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim().length > 0);
        return lines.length;
    } catch (error) {
        console.error(`Error counting items in ${filePath}:`, error);
        return 0;
    }
}

/**
 * Calculates the percentage of stock remaining
 * @param {number} currentCount - Current stock count
 * @param {number} maxCount - Maximum stock count or initial stock count
 * @returns {number} - Percentage of stock remaining
 */
function calculatePercentage(currentCount, maxCount) {
    if (maxCount <= 0) return 0;
    return Math.floor((currentCount / maxCount) * 100);
}

/**
 * Gets the total initial stock amount for a service from cache or config
 * @param {string} serviceType - Type of service (e.g., 'netflix', 'spotify')
 * @param {string} stockPath - Path to the stock file
 * @param {object} config - Bot configuration
 * @returns {number} - Initial or max stock amount
 */
function getInitialStock(serviceType, stockPath, config) {
    const serviceConfig = config.services && config.services[serviceType];
    
    // If we have a configured max stock, use that
    if (serviceConfig && serviceConfig.maxStock) {
        return serviceConfig.maxStock;
    }
    
    // Otherwise use the cache if available
    if (stockCache.has(`${serviceType}_max`)) {
        return stockCache.get(`${serviceType}_max`);
    }
    
    // Default to 100 if no other information available
    return 100;
}

/**
 * Sends a stock alert to the notification channel
 * @param {object} client - Discord client
 * @param {string} serviceType - Type of service
 * @param {number} stockCount - Current stock count
 * @param {number} percentage - Percentage of stock remaining
 * @param {object} config - Bot configuration
 */
async function sendStockAlert(client, serviceType, stockCount, percentage, config) {
    try {
        // Get notification channel
        const alertChannel = client.channels.cache.get(config.alertChannelId);
        if (!alertChannel) {
            console.error(`Alert channel not found: ${config.alertChannelId}`);
            return;
        }
        
        // Create alert embed
        const alertEmbed = new Discord.MessageEmbed()
            .setColor(percentage <= 5 ? '#ff0000' : percentage <= 10 ? '#ff9900' : '#ffcc00')
            .setTitle(`⚠️ Stock Alert: ${serviceType.toUpperCase()} Running Low`)
            .setDescription(`Current stock level is critically low!`)
            .addFields(
                { name: 'Service', value: serviceType, inline: true },
                { name: 'Remaining', value: stockCount.toString(), inline: true },
                { name: 'Percentage', value: `${percentage}%`, inline: true }
            )
            .setFooter({ text: 'Auto-Stock Monitoring System' })
            .setTimestamp();
        
        // Mention configuration
        let mentionContent = '';
        if (percentage <= 5) {
            // Critical alert - mention owner and co-owners
            mentionContent = `<@${config.ownerId}> <@${config.coOwnerId}> **CRITICAL ALERT**: ${serviceType.toUpperCase()} stock is almost depleted!`;
        } else if (percentage <= 10) {
            // High alert - mention owner
            mentionContent = `<@${config.ownerId}> **ALERT**: ${serviceType.toUpperCase()} stock is running very low!`;
        } else {
            // Warning - no mention
            mentionContent = `**WARNING**: ${serviceType.toUpperCase()} stock is running low.`;
        }
        
        // Send alert
        await alertChannel.send({ 
            content: mentionContent,
            embeds: [alertEmbed] 
        });
        
        console.log(`Sent stock alert for ${serviceType}: ${stockCount} items (${percentage}%)`);
    } catch (error) {
        console.error('Error sending stock alert:', error);
    }
}

/**
 * Toggle a generation command for a specific service
 * @param {boolean} enable - Whether to enable or disable the command
 * @param {string} serviceType - Type of service
 * @param {object} client - Discord client
 * @param {object} config - Bot configuration
 */
async function toggleServiceCommand(enable, serviceType, client, config) {
    try {
        // Get notification channel
        const alertChannel = client.channels.cache.get(config.alertChannelId);
        
        if (enable) {
            // If we're enabling a service that was disabled
            if (disabledServices.has(serviceType)) {
                disabledServices.delete(serviceType);
                
                // Notify about re-enabling
                if (alertChannel) {
                    const enabledEmbed = new Discord.MessageEmbed()
                        .setColor('#00ff00')
                        .setTitle(`✅ Service Re-enabled: ${serviceType.toUpperCase()}`)
                        .setDescription(`The ${serviceType} service has been automatically re-enabled.`)
                        .setFooter({ text: 'Auto-Stock Monitoring System' })
                        .setTimestamp();
                    
                    await alertChannel.send({ 
                        content: `<@${config.ownerId}> ${serviceType.toUpperCase()} has been automatically re-enabled.`,
                        embeds: [enabledEmbed] 
                    });
                }
                console.log(`Re-enabled service: ${serviceType}`);
            }
        } else {
            // If we're disabling a service that wasn't already disabled
            if (!disabledServices.has(serviceType)) {
                disabledServices.add(serviceType);
                
                // Notify about disabling
                if (alertChannel) {
                    const disabledEmbed = new Discord.MessageEmbed()
                        .setColor('#ff0000')
                        .setTitle(`❌ Service Disabled: ${serviceType.toUpperCase()}`)
                        .setDescription(`The ${serviceType} service has been automatically disabled due to low or no stock.`)
                        .setFooter({ text: 'Auto-Stock Monitoring System' })
                        .setTimestamp();
                    
                    await alertChannel.send({ 
                        content: `<@${config.ownerId}> ${serviceType.toUpperCase()} has been automatically disabled due to insufficient stock.`,
                        embeds: [disabledEmbed] 
                    });
                }
                console.log(`Disabled service: ${serviceType}`);
            }
        }
    } catch (error) {
        console.error(`Error toggling service ${serviceType}:`, error);
    }
}

/**
 * Check if a service should be enabled or disabled based on stock
 * @param {string} serviceType - Type of service
 * @returns {boolean} - Whether the service is enabled
 */
function isServiceEnabled(serviceType) {
    return !disabledServices.has(serviceType);
}

/**
 * Monitor stock levels for all services
 * @param {object} client - Discord client
 * @param {object} config - Bot configuration
 */
async function monitorStockLevels(client, config) {
    try {
        console.log('Running stock level monitoring...');
        
        // Directory paths for different service tiers
        const stockPaths = {
            basic: './basicstock',
            free: './fstock',
            boost: './bstock',
            premium: './stock',
            extreme: './extreme'
        };
        
        // Process each stock directory
        for (const [tier, dirPath] of Object.entries(stockPaths)) {
            if (!fs.existsSync(dirPath)) {
                console.log(`Directory does not exist: ${dirPath}`);
                continue;
            }
            
            const files = fs.readdirSync(dirPath);
            
            for (const file of files) {
                if (!file.endsWith('.txt')) continue;
                
                const filePath = path.join(dirPath, file);
                const serviceType = file.replace('.txt', '').toLowerCase();
                const serviceKey = `${tier}_${serviceType}`;
                
                // Get current stock count
                const currentStock = await countItems(filePath);
                
                // Get initial or max stock count
                const initialStock = getInitialStock(serviceType, filePath, config);
                
                // Store max stock value when we first see a service with stock
                if (!stockCache.has(`${serviceKey}_max`) && currentStock > 0) {
                    stockCache.set(`${serviceKey}_max`, currentStock);
                }
                
                // Use the larger of our stored max or the current value
                const maxStock = Math.max(
                    stockCache.get(`${serviceKey}_max`) || 0,
                    initialStock
                );
                
                // Calculate percentage
                const percentage = calculatePercentage(currentStock, maxStock);
                
                // Determine if alert needed based on stock level change and thresholds
                const previousStock = stockCache.get(serviceKey) || 0;
                const previousPercentage = calculatePercentage(previousStock, maxStock);
                
                // Update cache with current stock
                stockCache.set(serviceKey, currentStock);
                
                // Check if we need to send alerts
                const thresholds = [20, 10, 5];
                for (const threshold of thresholds) {
                    // Send alert if stock drops below a threshold and we haven't alerted for this threshold yet
                    if (percentage <= threshold && previousPercentage > threshold) {
                        await sendStockAlert(client, `${tier} ${serviceType}`, currentStock, percentage, config);
                        break; // Only send one alert at a time
                    }
                }
                
                // Disable service if out of stock or critically low
                if (currentStock <= 2) {
                    await toggleServiceCommand(false, serviceKey, client, config);
                } 
                // Re-enable service if stock is replenished
                else if (currentStock > 5 && !isServiceEnabled(serviceKey)) {
                    await toggleServiceCommand(true, serviceKey, client, config);
                }
            }
        }
    } catch (error) {
        console.error('Error monitoring stock levels:', error);
    }
}

/**
 * Initialize stock monitoring system
 * @param {object} client - Discord client
 * @param {object} config - Bot configuration
 */
function initializeStockMonitoring(client, config) {
    console.log('Initializing stock monitoring system...');
    
    // Set a default check interval (every 5 minutes)
    const checkInterval = config.stockCheckInterval || 5 * 60 * 1000;
    
    // Initial stock check after bot is ready
    setTimeout(() => {
        monitorStockLevels(client, config);
    }, 10000); // Wait 10 seconds after initialization
    
    // Set up regular interval checks
    setInterval(() => {
        monitorStockLevels(client, config);
    }, checkInterval);
    
    console.log(`Stock monitoring initialized: checking every ${checkInterval / 60000} minutes`);
}

module.exports = {
    monitorStockLevels,
    initializeStockMonitoring,
    isServiceEnabled,
    toggleServiceCommand
};