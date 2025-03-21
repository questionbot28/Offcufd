const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const fetch = require('node-fetch/lib/index.js');
const { spawn } = require('child_process');
const { MessageEmbed, MessageAttachment } = require('discord.js');
const config = require('../../config.json');
const progressUtils = require('../../utils/progressBar');

module.exports = {
    name: 'mscheck',
    description: 'Upload and check Microsoft accounts',
    usage: 'mscheck [threads] {.txt attachment}',

    execute: async (message, args, usedPrefix) => {
        // Create the necessary directories
        const tempDir = './temp';
        const microsoftDir = './microsoft';
        const resultsDir = './results';

        // Ensure all necessary directories exist
        for (const dir of [tempDir, microsoftDir, resultsDir]) {
            try {
                await fs.access(dir);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    await fs.mkdir(dir, { recursive: true });
                    console.log(`Created directory: ${dir}`);
                }
            }
        }

        // Role check - only allow specific roles to use this command
        const allowedRoles = [
            config.restockroleid, 
            ...config.cookieCheckRoles || [],
            ...config.staffRoleIds || [],
            ...config.refreshRoleIds || []
        ].filter(id => id); // Filter out undefined or empty IDs

        const hasPermission = message.member.roles.cache.some(role => 
            allowedRoles.includes(role.id)
        );

        if (!hasPermission) {
            return message.reply('You do not have the necessary permissions to use this command.');
        }

        // Check for file attachment
        if (message.attachments.size === 0) {
            return message.reply('Please attach a file (.txt) containing Microsoft accounts in email:password format.');
        }

        // Get the attached file
        const attachment = message.attachments.first();
        const fileExtension = path.extname(attachment.name).toLowerCase();
        
        // Check if file extension is supported
        if (fileExtension !== '.txt') {
            return message.reply('Please upload a .txt file containing Microsoft accounts in email:password format.');
        }

        // Check if user specified a thread count
        let threadCount = 100; // Default to 100 threads
        if (args.length > 0 && !isNaN(args[0])) {
            threadCount = Math.min(1000, Math.max(1, parseInt(args[0]))); // Limit between 1-1000
        }

        // Send initial processing message
        const processingEmbed = new MessageEmbed()
            .setColor(config.color?.blue || '#0099ff')
            .setTitle('Processing Microsoft Accounts')
            .setDescription('Your file is being downloaded and processed. This might take a moment...')
            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTimestamp();
            
        const processingMessage = await message.channel.send({ embeds: [processingEmbed] });

        try {
            // Download the file
            const filePath = path.join(tempDir, attachment.name);
            await downloadFile(attachment.url, filePath);
            
            // Update the processing message with download status
            await processingMessage.edit({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color?.blue || '#0099ff')
                        .setTitle('Processing Microsoft Accounts')
                        .setDescription('File downloaded successfully. Starting account check process...')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            });
            
            // Call the Microsoft account checker
            await checkMicrosoftAccounts(filePath, message, processingMessage, threadCount);
            
        } catch (error) {
            console.error(`Error in mscheck command: ${error.message}`);
            await processingMessage.edit({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color?.red || '#ff0000')
                        .setTitle('Error')
                        .setDescription(`An error occurred during processing: ${error.message}`)
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            });
        }
    },
};

// Function to download a file from a URL
function downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
        const file = fsSync.createWriteStream(filePath);
        fetch(url)
            .then(response => {
                response.body.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            })
            .catch(err => {
                fsSync.unlink(filePath, () => {}); // Delete the file if there's an error
                reject(err);
            });
    });
}

// Function to check Microsoft accounts
async function checkMicrosoftAccounts(filePath, message, statusMessage, threadCount = 100) {
    try {
        // Update status with file information
        await statusMessage.edit({
            embeds: [
                new MessageEmbed()
                    .setColor(config.color?.blue || '#0099ff')
                    .setTitle('Microsoft Account Checker')
                    .setDescription(`Starting Microsoft account check with ${threadCount} threads...`)
                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                    .setTimestamp()
            ]
        });
        
        // Run the Python script to check the uploaded file
        const scriptPath = path.join(__dirname, '../../microsoft_account_checker.py');
        console.log(`Starting Microsoft account check with ${threadCount} threads`);
        // Pass the command line argument to indicate this is being run from Discord
        const pythonProcess = spawn('/nix/store/wqhkxzzlaswkj3gimqign99sshvllcg6-python-wrapped-0.1.0/bin/python', 
            [scriptPath, filePath, '--threads', threadCount.toString(), '--discord']);

        let outputData = '';
        let errorData = '';
        
        // Prepare for status updates
        let processingStage = 'initializing';
        const processStartTime = Date.now();
        let startTime = processStartTime;

        pythonProcess.stdout.on('data', (data) => {
            const output = data.toString();
            outputData += output;
            console.log(`[MS Account Checker] ${output.trim()}`);
            
            // Try to update the message with progress information if progress data is found
            try {
                const lines = output.split('\n');
                for (const line of lines) {
                    if (line.includes('Progress:') || line.includes('PROGRESS REPORT')) {
                        // Parse the progress information
                        const progressData = {
                            current: 0,
                            total: 0,
                            valid: 0,
                            invalid: 0,
                            speed: 0,
                            threads: threadCount,
                            stage: processingStage,
                            extraInfo: {
                                twofa: 0,
                                validMail: 0,
                                sfa: 0,
                                mfa: 0,
                                xboxGP: 0,
                                xboxGPU: 0,
                                other: 0
                            }
                        };
                        
                        // Try to extract progress values using regex
                        const progressMatch = line.match(/Progress: (\d+)\/(\d+)/) || outputData.match(/Checked: (\d+) accounts/);
                        if (progressMatch) {
                            progressData.current = parseInt(progressMatch[1]) || 0;
                            progressData.total = parseInt(progressMatch[2]) || 0;
                        }
                        
                        // Extract hit count
                        const hitMatch = line.match(/Hits: (\d+)/) || outputData.match(/Hits: (\d+)/);
                        progressData.valid = hitMatch ? parseInt(hitMatch[1]) : 0;
                        
                        // Extract bad count
                        const badMatch = line.match(/Bad: (\d+)/) || outputData.match(/Bad accounts: (\d+)/);
                        progressData.invalid = badMatch ? parseInt(badMatch[1]) : 0;
                        
                        // Extract additional information
                        const twofaMatch = outputData.match(/2FA accounts: (\d+)/);
                        progressData.extraInfo.twofa = twofaMatch ? parseInt(twofaMatch[1]) : 0;
                        
                        const validMailMatch = outputData.match(/Valid mail accounts: (\d+)/);
                        progressData.extraInfo.validMail = validMailMatch ? parseInt(validMailMatch[1]) : 0;
                        
                        const sfaMatch = outputData.match(/SFA accounts: (\d+)/);
                        progressData.extraInfo.sfa = sfaMatch ? parseInt(sfaMatch[1]) : 0;
                        
                        const mfaMatch = outputData.match(/MFA accounts: (\d+)/);
                        progressData.extraInfo.mfa = mfaMatch ? parseInt(mfaMatch[1]) : 0;
                        
                        const xboxGPMatch = outputData.match(/Xbox Game Pass: (\d+)/);
                        progressData.extraInfo.xboxGP = xboxGPMatch ? parseInt(xboxGPMatch[1]) : 0;
                        
                        const xboxGPUMatch = outputData.match(/Xbox Game Pass Ultimate: (\d+)/);
                        progressData.extraInfo.xboxGPU = xboxGPUMatch ? parseInt(xboxGPUMatch[1]) : 0;
                        
                        const otherMatch = outputData.match(/Other products: (\d+)/);
                        progressData.extraInfo.other = otherMatch ? parseInt(otherMatch[1]) : 0;
                        
                        // Extract speed
                        const speedMatch = line.match(/Speed: ([\d.]+)/) || outputData.match(/speed: ([\d.]+)/);
                        progressData.speed = speedMatch ? parseFloat(speedMatch[1]) : 0;
                        
                        // Create enhanced embed with progress info
                        const embed = createMicrosoftProgressEmbed(progressData, processStartTime, config);
                        
                        // Add author to footer
                        embed.setFooter({ 
                            text: `${message.author.tag} • Processing Microsoft accounts`, 
                            iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                        });
                        
                        statusMessage.edit({ embeds: [embed] }).catch(error => 
                            console.error('Error updating progress message:', error)
                        );
                        break;
                    }
                }
            } catch (error) {
                console.error('Error processing progress data:', error);
            }
        });

        pythonProcess.stderr.on('data', (data) => {
            errorData += data.toString();
            console.error(`[MS Account Checker Error] ${data.toString().trim()}`);
        });

        return new Promise((resolve, reject) => {
            pythonProcess.on('close', (code) => {
                console.log(`Microsoft Account Checker process exited with code ${code}`);
                
                if (code !== 0) {
                    console.error(`Microsoft Account Checker failed with code ${code}`);
                    console.error(`Error output: ${errorData}`);
                    reject(new Error(`Process exited with code ${code}`));
                    return;
                }
                
                try {
                    // Parse the final stats from output
                    let statsSection = '';
                    let inStatsSection = false;
                    
                    const lines = outputData.split('\n');
                    for (const line of lines) {
                        if (line.includes('DISCORD_STATS_BEGIN')) {
                            inStatsSection = true;
                            continue;
                        } else if (line.includes('DISCORD_STATS_END')) {
                            inStatsSection = false;
                            break;
                        }
                        
                        if (inStatsSection) {
                            statsSection += line + '\n';
                        }
                    }
                    
                    if (statsSection) {
                        // Extract all stats from the stats section
                        const hitMatch = statsSection.match(/Hits: (\d+)/);
                        const badMatch = statsSection.match(/Bad accounts: (\d+)/);
                        const twofaMatch = statsSection.match(/2FA accounts: (\d+)/);
                        const validMailMatch = statsSection.match(/Valid mail accounts: (\d+)/);
                        const sfaMatch = statsSection.match(/SFA accounts: (\d+)/);
                        const mfaMatch = statsSection.match(/MFA accounts: (\d+)/);
                        const xboxGPMatch = statsSection.match(/Xbox Game Pass: (\d+)/);
                        const xboxGPUMatch = statsSection.match(/Xbox Game Pass Ultimate: (\d+)/);
                        const otherMatch = statsSection.match(/Other products: (\d+)/);
                        const totalMatch = statsSection.match(/Total checked: (\d+)/);
                        const successRateMatch = statsSection.match(/Success rate: ([\d.]+)/);
                        const timeMatch = statsSection.match(/Processing time: ([\d.]+)/);
                        const speedMatch = statsSection.match(/Processing speed: ([\d.]+)/);
                        
                        // Create a results embed based on the extracted stats
                        const resultsEmbed = new MessageEmbed()
                            .setColor(config.color?.green || '#00ff00')
                            .setTitle('Microsoft Account Check Results')
                            .setDescription(`Microsoft account check completed!`)
                            .addFields(
                                { name: 'Hits', value: hitMatch ? hitMatch[1] : '0', inline: true },
                                { name: 'Bad Accounts', value: badMatch ? badMatch[1] : '0', inline: true },
                                { name: '2FA Accounts', value: twofaMatch ? twofaMatch[1] : '0', inline: true },
                                { name: 'Valid Mail', value: validMailMatch ? validMailMatch[1] : '0', inline: true },
                                { name: 'SFA Accounts', value: sfaMatch ? sfaMatch[1] : '0', inline: true },
                                { name: 'MFA Accounts', value: mfaMatch ? mfaMatch[1] : '0', inline: true },
                                { name: 'Xbox Game Pass', value: xboxGPMatch ? xboxGPMatch[1] : '0', inline: true },
                                { name: 'Xbox Game Pass Ultimate', value: xboxGPUMatch ? xboxGPUMatch[1] : '0', inline: true },
                                { name: 'Other Products', value: otherMatch ? otherMatch[1] : '0', inline: true },
                                { name: 'Total Checked', value: totalMatch ? totalMatch[1] : '0', inline: true },
                                { name: 'Success Rate', value: successRateMatch ? `${successRateMatch[1]}%` : '0%', inline: true },
                                { name: 'Processing Time', value: timeMatch ? `${timeMatch[1]}s` : '0s', inline: true }
                            )
                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                            .setTimestamp();
                        
                        // Add processing speed if available
                        if (speedMatch) {
                            resultsEmbed.addField('Processing Speed', `${speedMatch[1]} accounts/sec`, true);
                        }
                        
                        statusMessage.edit({ embeds: [resultsEmbed] });
                    } else {
                        // If no stats section was found, show a simple completion message
                        statusMessage.edit({
                            embeds: [
                                new MessageEmbed()
                                    .setColor(config.color?.green || '#00ff00')
                                    .setTitle('Microsoft Account Check Completed')
                                    .setDescription('The account check has completed, but detailed statistics are not available.')
                                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                    .setTimestamp()
                            ]
                        });
                    }
                    
                    resolve();
                } catch (error) {
                    console.error('Error creating results embed:', error);
                    reject(error);
                }
            });
        });
    } catch (error) {
        console.error(`Error in checkMicrosoftAccounts: ${error.message}`);
        throw error;
    }
}

// Create a specialized progress embed for Microsoft account checking
function createMicrosoftProgressEmbed(progressData, startTime, config) {
    const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
    const percent = progressData.total > 0 ? Math.floor((progressData.current / progressData.total) * 100) : 0;
    
    // Create the progress bar
    const progressBarLength = 20;
    const filledLength = Math.floor((progressData.current / progressData.total) * progressBarLength) || 0;
    const progressBar = '█'.repeat(filledLength) + '░'.repeat(progressBarLength - filledLength);
    
    // Estimate time remaining
    let estimatedTimeRemaining = 'Calculating...';
    if (progressData.current > 0 && progressData.speed > 0) {
        const remainingItems = progressData.total - progressData.current;
        const secondsRemaining = Math.floor(remainingItems / progressData.speed);
        
        if (secondsRemaining < 60) {
            estimatedTimeRemaining = `${secondsRemaining}s`;
        } else if (secondsRemaining < 3600) {
            estimatedTimeRemaining = `${Math.floor(secondsRemaining / 60)}m ${secondsRemaining % 60}s`;
        } else {
            estimatedTimeRemaining = `${Math.floor(secondsRemaining / 3600)}h ${Math.floor((secondsRemaining % 3600) / 60)}m`;
        }
    }
    
    // Create the embed
    const embed = new MessageEmbed()
        .setColor(config.color?.blue || '#0099ff')
        .setTitle('Microsoft Account Checker - Progress')
        .setDescription(`Checking Microsoft accounts: [${progressData.current}/${progressData.total}]`)
        .addField('Progress', `${progressBar} ${percent}%`, false)
        .addField('Statistics', 
            `✅ Hits: ${progressData.valid}\n` +
            `❌ Bad: ${progressData.invalid}\n` +
            `🔒 2FA: ${progressData.extraInfo.twofa}\n` +
            `📧 Valid Mail: ${progressData.extraInfo.validMail}`, true)
        .addField('Account Details', 
            `🛡️ SFA: ${progressData.extraInfo.sfa}\n` +
            `🔑 MFA: ${progressData.extraInfo.mfa}\n` +
            `🎮 Game Pass: ${progressData.extraInfo.xboxGP}\n` +
            `🌟 Ultimate: ${progressData.extraInfo.xboxGPU}`, true)
        .addField('Processing Info', 
            `⏱️ Elapsed: ${elapsedTime}s\n` +
            `⏳ Remaining: ${estimatedTimeRemaining}\n` +
            `🚀 Speed: ${progressData.speed.toFixed(2)} accs/sec\n` +
            `🧵 Threads: ${progressData.threads}`, true)
        .setTimestamp();
    
    return embed;
}