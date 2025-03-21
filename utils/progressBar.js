/**
 * Utility functions for displaying progress in Discord embeds
 */
const { MessageEmbed } = require('discord.js');

/**
 * Creates a text-based progress bar
 * @param {number} current - Current progress value
 * @param {number} total - Total progress value
 * @param {number} length - Length of the progress bar in characters
 * @returns {string} Text-based progress bar
 */
function createProgressBar(current, total, length = 20) {
    // Ensure total is valid to prevent division by zero and NaN/Infinity results
    if (!total || total <= 0) {
        total = 1; // Avoid division by zero
    }
    
    // Ensure current is valid and within range
    current = Math.max(0, Math.min(current || 0, total));
    
    // Calculate progress with bounds checking
    const progressRatio = current / total;
    const progress = Math.min(length, Math.max(0, Math.floor(progressRatio * length)));
    
    // Create the bar segments with safety checks
    const filled = '█'.repeat(Math.min(progress, 1000)); // Cap at 1000 to prevent excessive memory usage
    const empty = '░'.repeat(Math.min(length - progress, 1000)); // Cap at 1000 to prevent excessive memory usage
    
    // Calculate percentage with bounds check
    const percentage = Math.min(100, Math.max(0, Math.floor(progressRatio * 100)));
    
    return `${filled}${empty} ${percentage}%`;
}

/**
 * Estimates time remaining based on progress
 * @param {number} current - Current progress value
 * @param {number} total - Total progress value
 * @param {number} elapsedTime - Time elapsed so far in seconds
 * @returns {string} Estimated time remaining in seconds
 */
function estimateTimeRemaining(current, total, elapsedTime) {
    if (current <= 0 || elapsedTime <= 0) return 'calculating...';
    
    const rate = current / elapsedTime; // items per second
    const remaining = (total - current) / rate;
    
    if (remaining < 60) {
        return `${remaining.toFixed(1)}s`;
    } else if (remaining < 3600) {
        return `${(remaining / 60).toFixed(1)}m`;
    } else {
        return `${(remaining / 3600).toFixed(1)}h`;
    }
}

/**
 * Creates a progress embed for cookie checking
 * @param {Object} progressData - Progress data object
 * @param {number} startTime - Timestamp when processing started
 * @param {string} serviceType - Type of service (netflix/spotify)
 * @param {Object} config - Bot configuration
 * @returns {MessageEmbed} Discord embed with progress visualization
 */
function createProgressEmbed(progressData, startTime, serviceType, config) {
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const current = progressData.current || 0;
    const total = progressData.total || 100;
    const valid = progressData.valid || 0;
    const invalid = progressData.invalid || 0;
    const speed = progressData.speed || 0;
    
    // Create progress bar
    const progressBar = createProgressBar(current, total);
    
    // Estimate time remaining
    const remaining = estimateTimeRemaining(current, total, parseFloat(elapsedTime));
    
    // Determine service-specific emoji and color
    const emoji = serviceType.toLowerCase() === 'netflix' ? '🎬' : '🎵';
    const color = serviceType.toLowerCase() === 'netflix' ? (config.color?.red || '#E50914') : (config.color?.green || '#1DB954');
    
    // Calculate percentage
    const percentComplete = total > 0 ? Math.floor((current / total) * 100) : 0;
    
    // Create detailed progress description with more visual elements
    const progressDescription = [
        `${progressBar} **${percentComplete}%**`,
        `${emoji} **Processed:** ${current}/${total} cookies`,
        `✅ **Valid:** ${valid} | ❌ **Invalid:** ${invalid} | 📊 **Ratio:** ${total > 0 ? ((valid / total) * 100).toFixed(1) : 0}%`,
        `⏱️ **Elapsed:** ${elapsedTime}s | ⏳ **Remaining:** ~${remaining}`,
        `⚡ **Speed:** ${speed.toFixed(2)} cookies/sec | 🧵 **Threads:** ${progressData.threads || 'N/A'}`
    ].join('\n');
    
    // Create embed with more visually engaging layout
    return new MessageEmbed()
        .setColor(color)
        .setTitle(`${serviceType} Cookie Checker - Live Progress`)
        .setDescription(progressDescription)
        .setFooter({ 
            text: `Processing stage: ${progressData.stage || 'Analyzing'} • Updated: ${new Date().toLocaleTimeString()}`
        })
        .setTimestamp();
}

/**
 * Creates a results embed for cookie checking
 * @param {Object} results - Results data object
 * @param {number} startTime - Timestamp when processing started
 * @param {string} serviceType - Type of service (netflix/spotify)
 * @param {Object} config - Bot configuration
 * @returns {MessageEmbed} Discord embed with results visualization
 */
function createResultsEmbed(results, startTime, serviceType, config) {
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const speed = results.total > 0 ? (results.total / elapsedTime).toFixed(2) : 0;
    
    // Determine service-specific emoji and color
    const emoji = serviceType.toLowerCase() === 'netflix' ? '🎬' : '🎵';
    const color = results.valid > 0 
        ? (config.color?.green || '#00ff00') 
        : (config.color?.red || '#ff0000');
    
    // Calculate success ratio
    const successRatio = results.total > 0 ? ((results.valid / results.total) * 100).toFixed(1) : 0;
    
    // Create a mini progress bar for visual representation
    const miniBar = createProgressBar(results.valid, results.total, 10);
    
    // Build enhanced description with more visual elements
    let description = [
        `${emoji} **Processing Complete** ${emoji}`,
        '',
        `${miniBar} **${successRatio}%** success rate`,
        '',
        `✅ **Valid cookies:** ${results.valid}`,
        `❌ **Invalid cookies:** ${results.invalid}`,
        `📂 **Total processed:** ${results.total}`,
        `⏱️ **Processing time:** ${elapsedTime}s`,
        `⚡ **Average speed:** ${speed} cookies/sec`
    ];
    
    // Add service-specific section with better formatting
    if (serviceType.toLowerCase() === 'netflix' && results.premium !== undefined) {
        description.push('', '**📊 Netflix Account Types:**');
        description.push(`🔰 **Premium accounts:** ${results.premium}`);
        if (results.unsubscribed !== undefined) {
            description.push(`⚠️ **Unsubscribed accounts:** ${results.unsubscribed}`);
        }
    } else if (serviceType.toLowerCase() === 'spotify') {
        description.push('', '**📊 Spotify Account Types:**');
        if (results.premium !== undefined) description.push(`🔰 **Premium:** ${results.premium}`);
        if (results.family !== undefined) description.push(`👨‍👩‍👧‍👦 **Family:** ${results.family}`);
        if (results.duo !== undefined) description.push(`👥 **Duo:** ${results.duo}`);
        if (results.student !== undefined) description.push(`🎓 **Student:** ${results.student}`);
        if (results.free !== undefined) description.push(`🆓 **Free:** ${results.free}`);
    }
    
    // Create a more detailed and visual embed
    return new MessageEmbed()
        .setColor(color)
        .setTitle(`${serviceType} Cookie Checker - Results`)
        .setDescription(description.join('\n'))
        .setFooter({ 
            text: `${results.valid > 0 ? 'All working cookies have been saved and are ready to use!' : 'No valid cookies found.'}`
        })
        .setTimestamp();
}

module.exports = {
    createProgressBar,
    estimateTimeRemaining,
    createProgressEmbed,
    createResultsEmbed
};