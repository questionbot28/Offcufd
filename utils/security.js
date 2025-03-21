/**
 * Security and anti-abuse system for the Discord Bot
 * Implements rate limiting, fraud detection, and user behavior tracking
 */
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { MessageEmbed } = require('discord.js');
const config = require('../config.json');

// Data structures for rate limiting and tracking
const commandUsage = new Map(); // Tracks command usage { userId: { command: { count, timestamp } } }
const cookieAttempts = new Map(); // Tracks failed cookie uploads { userId: { count, timestamp } }
const suspiciousActivity = new Map(); // Tracks suspicious activities { userId: { type, count, timestamp } }
const blockedUsers = new Map(); // Temporarily blocked users { userId: { until, reason } }
const securityLogs = []; // Simple log for security events

// Rate limit settings
const RATE_LIMITS = {
  gen: { windowMs: 60000, maxRequests: 3 }, // 3 requests per minute
  fgen: { windowMs: 120000, maxRequests: 2 }, // 2 requests per 2 minutes
  bgen: { windowMs: 300000, maxRequests: 2 }, // 2 requests per 5 minutes
  egen: { windowMs: 600000, maxRequests: 1 }, // 1 request per 10 minutes
  cgen: { windowMs: 180000, maxRequests: 2 }, // 2 requests per 3 minutes
  default: { windowMs: 30000, maxRequests: 5 } // Default 5 requests per 30 seconds
};

/**
 * Check if a user is rate limited for a specific command
 * @param {string} userId - Discord user ID
 * @param {string} command - Command name
 * @returns {boolean|object} False if not rate limited, otherwise an object with rate limit info
 */
function isRateLimited(userId, command) {
  // Check if user is blocked
  if (blockedUsers.has(userId)) {
    const blockInfo = blockedUsers.get(userId);
    if (Date.now() < blockInfo.until) {
      return {
        blocked: true,
        reason: blockInfo.reason,
        timeLeft: Math.ceil((blockInfo.until - Date.now()) / 1000) // in seconds
      };
    } else {
      // Unblock if time has expired
      blockedUsers.delete(userId);
    }
  }

  // Get rate limit settings for this command
  const rateLimit = RATE_LIMITS[command] || RATE_LIMITS.default;
  
  // Initialize user's command usage if not exists
  if (!commandUsage.has(userId)) {
    commandUsage.set(userId, {});
  }
  
  const userUsage = commandUsage.get(userId);
  
  // Initialize command usage if not exists
  if (!userUsage[command]) {
    userUsage[command] = {
      count: 0,
      timestamp: Date.now()
    };
    return false; // Not rate limited
  }
  
  const commandData = userUsage[command];
  
  // Check if the window has passed, reset if so
  if (Date.now() - commandData.timestamp > rateLimit.windowMs) {
    commandData.count = 0;
    commandData.timestamp = Date.now();
    return false; // Not rate limited
  }
  
  // Check if user has exceeded max requests
  if (commandData.count >= rateLimit.maxRequests) {
    // Calculate time left in rate limit window
    const timeLeft = Math.ceil((rateLimit.windowMs - (Date.now() - commandData.timestamp)) / 1000);
    
    // Record potential abuse if they try to use the command while rate limited
    if (commandData.count > rateLimit.maxRequests + 2) {
      markSuspiciousActivity(userId, 'rate_limit_abuse');
    }
    
    return {
      limited: true,
      timeLeft: timeLeft, // in seconds
      maxRequests: rateLimit.maxRequests,
      windowMs: rateLimit.windowMs
    };
  }
  
  // Increment count
  commandData.count++;
  return false; // Not rate limited
}

/**
 * Mark a user's command usage
 * @param {string} userId - Discord user ID
 * @param {string} command - Command name
 */
function markCommandUsage(userId, command) {
  if (!commandUsage.has(userId)) {
    commandUsage.set(userId, {});
  }
  
  const userUsage = commandUsage.get(userId);
  
  if (!userUsage[command]) {
    userUsage[command] = {
      count: 1,
      timestamp: Date.now()
    };
  } else {
    userUsage[command].count++;
    // Don't update timestamp to maintain the rate limit window
  }
}

/**
 * Mark suspicious activity for a user
 * @param {string} userId - Discord user ID
 * @param {string} activityType - Type of suspicious activity 
 */
function markSuspiciousActivity(userId, activityType) {
  if (!suspiciousActivity.has(userId)) {
    suspiciousActivity.set(userId, {});
  }
  
  const userActivity = suspiciousActivity.get(userId);
  
  if (!userActivity[activityType]) {
    userActivity[activityType] = {
      count: 1,
      timestamp: Date.now()
    };
  } else {
    userActivity[activityType].count++;
    
    // Check thresholds for different activity types
    if (activityType === 'rate_limit_abuse' && userActivity[activityType].count >= 5) {
      // Temporarily block user for 30 minutes
      blockUser(userId, 'Excessive command spam detected', 30 * 60 * 1000);
      logSecurityEvent('BLOCK', userId, 'Blocked for 30 minutes due to command spam');
    } else if (activityType === 'cookie_upload_failure' && userActivity[activityType].count >= 3) {
      // Require additional verification for 2 hours
      blockUser(userId, 'Multiple invalid cookie uploads', 2 * 60 * 60 * 1000);
      logSecurityEvent('BLOCK', userId, 'Additional verification required due to multiple invalid cookie uploads');
    } else if (activityType === 'sudden_invite_spike' && userActivity[activityType].count >= 2) {
      // Flag account for review for 24 hours
      blockUser(userId, 'Suspicious invite activity detected', 24 * 60 * 60 * 1000);
      logSecurityEvent('FLAG', userId, 'Account flagged due to suspicious invite activity');
    }
  }
}

/**
 * Block a user for a specified time
 * @param {string} userId - Discord user ID
 * @param {string} reason - Reason for blocking
 * @param {number} duration - Duration in milliseconds
 */
function blockUser(userId, reason, duration) {
  blockedUsers.set(userId, {
    until: Date.now() + duration,
    reason: reason
  });
}

/**
 * Check if a user has suspicious invite activity
 * @param {string} userId - Discord user ID
 * @param {number} currentInvites - Current invite count
 * @param {number} previousInvites - Previous invite count
 * @returns {boolean} - Whether the user has suspicious invite activity
 */
function checkInviteSurge(userId, currentInvites, previousInvites) {
  // If invites increased by more than 20 in a short period, flag as suspicious
  if (previousInvites > 0 && (currentInvites - previousInvites) > 20) {
    markSuspiciousActivity(userId, 'sudden_invite_spike');
    logSecurityEvent('ALERT', userId, `Possible invite abuse: ${previousInvites} → ${currentInvites}`);
    return true;
  }
  return false;
}

/**
 * Record a failed cookie upload attempt
 * @param {string} userId - Discord user ID
 */
function recordFailedCookieUpload(userId) {
  if (!cookieAttempts.has(userId)) {
    cookieAttempts.set(userId, {
      count: 1,
      timestamp: Date.now()
    });
  } else {
    const attempts = cookieAttempts.get(userId);
    
    // Reset counter if more than 1 hour since last attempt
    if (Date.now() - attempts.timestamp > 60 * 60 * 1000) {
      attempts.count = 1;
      attempts.timestamp = Date.now();
    } else {
      attempts.count++;
      
      // Mark as suspicious if 3 or more failures in an hour
      if (attempts.count >= 3) {
        markSuspiciousActivity(userId, 'cookie_upload_failure');
      }
    }
  }
}

/**
 * Log security events to the security log
 * @param {string} eventType - Event type (BLOCK, ALERT, INFO)
 * @param {string} userId - Discord user ID
 * @param {string} message - Log message
 */
function logSecurityEvent(eventType, userId, message) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    eventType,
    userId,
    message
  };
  
  securityLogs.push(logEntry);
  
  // Keep log at reasonable size
  if (securityLogs.length > 1000) {
    securityLogs.shift();
  }
  
  // Also log to console for monitoring
  console.log(`[SECURITY ${eventType}] ${timestamp} - User ${userId}: ${message}`);
  
  // For critical events, save to disk
  if (eventType === 'BLOCK' || eventType === 'ALERT') {
    saveSecurityLogs().catch(err => {
      console.error('Failed to save security logs:', err);
    });
  }
}

/**
 * Save security logs to disk
 */
async function saveSecurityLogs() {
  try {
    const logsDir = path.join(__dirname, '../logs');
    
    // Ensure logs directory exists
    try {
      await fs.mkdir(logsDir, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    
    // Save logs to file
    await fs.writeFile(
      path.join(logsDir, 'security.log'),
      securityLogs.map(log => `[${log.timestamp}] [${log.eventType}] User ${log.userId}: ${log.message}`).join('\n'),
      'utf8'
    );
  } catch (err) {
    console.error('Error saving security logs:', err);
  }
}

/**
 * Encrypt sensitive data
 * @param {string} data - Data to encrypt
 * @returns {string} - Encrypted data
 */
function encryptData(data) {
  try {
    // Get encryption key from config or generate one
    const secretKey = config.encryption?.key || 
                       process.env.ENCRYPTION_KEY || 
                       crypto.randomBytes(32).toString('hex');
    
    // Use AES-256-GCM for authenticated encryption
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(secretKey, 'hex'), iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get auth tag
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Return IV + Auth Tag + Encrypted Data
    return iv.toString('hex') + ':' + authTag + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    return null;
  }
}

/**
 * Decrypt sensitive data
 * @param {string} encryptedData - Encrypted data
 * @returns {string} - Decrypted data
 */
function decryptData(encryptedData) {
  try {
    // Get encryption key from config or environment
    const secretKey = config.encryption?.key || process.env.ENCRYPTION_KEY;
    
    if (!secretKey) {
      throw new Error('Encryption key not found');
    }
    
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(secretKey, 'hex'), iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

/**
 * Generate a response embed for rate limited users
 * @param {object} rateLimitInfo - Rate limit information
 * @returns {MessageEmbed} - Discord embed message
 */
function generateRateLimitEmbed(rateLimitInfo) {
  let embed = new MessageEmbed()
    .setColor(config.color.red)
    .setTimestamp();
  
  if (rateLimitInfo.blocked) {
    embed.setTitle('Account Temporarily Restricted')
      .setDescription(`Your account has been temporarily restricted due to suspicious activity.\n\nReason: ${rateLimitInfo.reason}\n\nRestriction will be lifted in ${formatTimeLeft(rateLimitInfo.timeLeft)}.`);
  } else {
    embed.setTitle('Command Cooldown')
      .setDescription(`Please wait **${formatTimeLeft(rateLimitInfo.timeLeft)}** before using this command again.\n\nYou can use this command ${rateLimitInfo.maxRequests} time(s) per ${rateLimitInfo.windowMs / 1000} seconds.`);
  }
  
  return embed;
}

/**
 * Format time left in a human-readable format
 * @param {number} seconds - Time left in seconds
 * @returns {string} - Formatted time
 */
function formatTimeLeft(seconds) {
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  } else if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else if (seconds < 86400) {
    const hours = Math.ceil(seconds / 3600);
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else {
    const days = Math.ceil(seconds / 86400);
    return `${days} day${days !== 1 ? 's' : ''}`;
  }
}

/**
 * Clear expired entries from tracking maps (maintenance function)
 * Should be called periodically to prevent memory leaks
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  
  // Clean command usage data
  for (const [userId, commands] of commandUsage.entries()) {
    let shouldDelete = true;
    
    for (const [cmd, data] of Object.entries(commands)) {
      const rateLimit = RATE_LIMITS[cmd] || RATE_LIMITS.default;
      if (now - data.timestamp < rateLimit.windowMs * 2) {
        shouldDelete = false;
      } else {
        delete commands[cmd];
      }
    }
    
    if (shouldDelete || Object.keys(commands).length === 0) {
      commandUsage.delete(userId);
    }
  }
  
  // Clean cookie attempts data
  for (const [userId, data] of cookieAttempts.entries()) {
    if (now - data.timestamp > 2 * 60 * 60 * 1000) { // 2 hours
      cookieAttempts.delete(userId);
    }
  }
  
  // Clean suspicious activity data
  for (const [userId, activities] of suspiciousActivity.entries()) {
    let shouldDelete = true;
    
    for (const [activity, data] of Object.entries(activities)) {
      if (now - data.timestamp < 24 * 60 * 60 * 1000) { // 24 hours
        shouldDelete = false;
      } else {
        delete activities[activity];
      }
    }
    
    if (shouldDelete || Object.keys(activities).length === 0) {
      suspiciousActivity.delete(userId);
    }
  }
  
  // Clean blocked users
  for (const [userId, data] of blockedUsers.entries()) {
    if (now > data.until) {
      blockedUsers.delete(userId);
    }
  }
}

// Setup regular cleanup
setInterval(cleanupExpiredEntries, 60 * 60 * 1000); // Run every hour

// Export all functions needed elsewhere
module.exports = {
  isRateLimited,
  markCommandUsage,
  markSuspiciousActivity,
  checkInviteSurge,
  recordFailedCookieUpload,
  logSecurityEvent,
  encryptData,
  decryptData,
  generateRateLimitEmbed,
  blockUser
};