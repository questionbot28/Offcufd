const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const fetch = require('node-fetch/lib/index.js');
const { spawn } = require('child_process');
const { MessageEmbed, MessageAttachment } = require('discord.js');
const config = require('../../config.json');
const progressUtils = require('../../utils/progressBar');

module.exports = {
    name: 'c-upload',
    description: 'Upload, check and store working cookies',
    usage: 'c-upload <netflix/spotify> [threads] {.zip attachment}',

    execute: async (message, args, usedPrefix) => {
        // Check if we have a valid service type
        if (!args[0] || !['netflix', 'spotify'].includes(args[0].toLowerCase())) {
            return message.reply({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color?.red || '#ff0000')
                        .setTitle('Invalid Usage')
                        .setDescription(`Please specify either 'netflix' or 'spotify' as the service type.\nUsage: \`${usedPrefix}c-upload <netflix/spotify> [threads] {.zip attachment}\``)
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            });
        }
        
        // Get service type
        const serviceType = args[0].toLowerCase();
        
        // Check if user specified a thread count
        let threadCount = 500; // Default to 500 threads for optimal performance
        if (args.length > 1 && !isNaN(args[1])) {
            threadCount = Math.min(2000, Math.max(1, parseInt(args[1]))); // Limit between 1-2000
        }
        // Create the necessary directories
        const tempDir = './temp';
        const netflixDir = './netflix';
        const spotifyDir = './spotify';
        const workingCookiesDir = './working_cookies';

        // Ensure all necessary directories exist
        for (const dir of [tempDir, netflixDir, spotifyDir, workingCookiesDir]) {
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
            return message.reply('Please attach a file (.zip, .rar, or .txt) containing cookies to upload.');
        }

        // Get the attached file
        const attachment = message.attachments.first();
        const fileExtension = path.extname(attachment.name).toLowerCase();
        
        // Check if file extension is supported
        if (!['.txt', '.zip', '.rar'].includes(fileExtension)) {
            return message.reply('Please upload a .txt, .zip, or .rar file containing cookies.');
        }

        // Extract service type from command argument
        const service = args[0]?.toLowerCase();
        
        // Check if the service is valid
        if (!['netflix', 'spotify'].includes(service)) {
            return message.reply('Invalid service. Please specify either "netflix" or "spotify".');
        }

        // Send initial processing message
        const processingEmbed = new MessageEmbed()
            .setColor(config.color?.blue || '#0099ff')
            .setTitle(`Processing ${service.charAt(0).toUpperCase() + service.slice(1)} Cookies`)
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
                        .setTitle(`Processing ${service.charAt(0).toUpperCase() + service.slice(1)} Cookies`)
                        .setDescription('File downloaded successfully. Starting cookie check process...')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            });
            
            // Call appropriate checker based on service type
            if (service === 'netflix') {
                await checkNetflixCookies(filePath, message, processingMessage, threadCount);
            } else if (service === 'spotify') {
                await checkSpotifyCookies(filePath, message, processingMessage, threadCount);
            }
            
        } catch (error) {
            console.error(`Error in c-upload command: ${error.message}`);
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

// Function to check Netflix cookies
async function checkNetflixCookies(filePath, message, statusMessage, threadCount = 5000) {
    try {
        // Update status with file extension information
        const fileExt = path.extname(filePath).toLowerCase();
        
        // Additional message for archive files
        if (fileExt === '.zip' || fileExt === '.rar') {
            await statusMessage.edit({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color?.blue || '#0099ff')
                        .setTitle('Netflix Cookie Checker')
                        .setDescription(`${fileExt.toUpperCase()} archive detected. Extracting and checking Netflix cookies... This may take longer.`)
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            });
        }
        
        // Run the Python script to check the uploaded file
        const scriptPath = path.join(__dirname, '../../netflix_cookie_checker_fixed.py');
        console.log(`Starting Netflix cookie check with ${threadCount} threads`);
        // Pass the command line argument to indicate this is being run from Discord
        const pythonProcess = spawn('/nix/store/wqhkxzzlaswkj3gimqign99sshvllcg6-python-wrapped-0.1.0/bin/python', 
            [scriptPath, filePath, '--threads', threadCount.toString(), '--discord']);

        let outputData = '';
        let errorData = '';
        
        // Prepare for status updates
        let processingStage = 'initializing';
        const processStartTime = Date.now();
        let startTime = processStartTime;
        const isArchive = fileExt === '.zip' || fileExt === '.rar';

        pythonProcess.stdout.on('data', (data) => {
            const output = data.toString();
            outputData += output;
            console.log(`[Netflix Checker] ${output.trim()}`);
            
            // Use output to determine processing stage
            if (output.includes('Extracting archive')) {
                processingStage = 'extracting';
            } else if (output.includes('Found') && output.includes('Netflix cookie files to check')) {
                processingStage = 'found_files';
            } else if (output.includes('Processing')) {
                processingStage = 'processing';
            }
            
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
                            stage: processingStage
                        };
                        
                        // Try to extract progress values using regex
                        const progressMatch = line.match(/Progress: (\d+)\/(\d+)/) || outputData.match(/Checked: (\d+) cookies/);
                        if (progressMatch) {
                            progressData.current = parseInt(progressMatch[1]) || 0;
                            if (progressMatch[2]) {
                                progressData.total = parseInt(progressMatch[2]) || 100;
                            } else {
                                // If total not found in current line, try to find it elsewhere in output
                                const totalMatch = outputData.match(/Found (\d+) Netflix cookie files/);
                                progressData.total = totalMatch ? parseInt(totalMatch[1]) : 100;
                            }
                        }
                        
                        // Extract valid count
                        const validMatch = line.match(/Valid: (\d+)/) || outputData.match(/Working cookies: (\d+)/);
                        progressData.valid = validMatch ? parseInt(validMatch[1]) : 0;
                        
                        // Extract invalid count
                        const invalidMatch = line.match(/Failed: (\d+)/) || outputData.match(/Failed cookies: (\d+)/);
                        progressData.invalid = invalidMatch ? parseInt(invalidMatch[1]) : 0;
                        
                        // Extract speed
                        const speedMatch = line.match(/Speed: ([\d.]+)/) || outputData.match(/Speed: ([\d.]+)/);
                        progressData.speed = speedMatch ? parseFloat(speedMatch[1]) : 0;
                        
                        // Create enhanced embed with visual progress bar
                        const embed = progressUtils.createProgressEmbed(progressData, processStartTime, 'Netflix', config);
                        
                        // Add author to footer
                        embed.setFooter({ 
                            text: `${message.author.tag} • Processing stage: ${processingStage}`, 
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
            console.error(`[Netflix Checker Error] ${data.toString().trim()}`);
        });
        
        // Update status periodically (every 200ms for near real-time updates)
        const updateInterval = setInterval(async () => {
            const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
            let statusDescription = 'Checking your Netflix cookies...';
            
            // Use output to determine processing stage
            if (outputData.includes('Extracting archive')) {
                processingStage = 'extracting';
            } else if (outputData.includes('Found') && outputData.includes('Netflix cookie files to check')) {
                processingStage = 'found_files';
            } else if (outputData.includes('Processing')) {
                processingStage = 'processing';
            }
            
            // Try to extract performance metrics if available
            let speedInfo = '';
            const speedMatch = outputData.match(/Speed: ([\d.]+) cookies\/sec/);
            if (speedMatch) {
                speedInfo = `\nPerformance: ${speedMatch[1]} cookies/sec`;
            }
            
            // Create appropriate status message based on stage
            switch (processingStage) {
                case 'extracting':
                    statusDescription = `Extracting files from ${fileExt.toUpperCase()} archive... (${elapsedTime}s elapsed)${speedInfo}`;
                    break;
                case 'found_files':
                    const foundMatch = outputData.match(/Found (\d+) Netflix cookie files to check/);
                    const fileCount = foundMatch ? foundMatch[1] : 'multiple';
                    statusDescription = `Found ${fileCount} cookie files to check. Processing... (${elapsedTime}s elapsed)${speedInfo}`;
                    break;
                case 'processing':
                    // Try to extract progress info for more detailed status - match new format
                    const progressMatch = outputData.match(/PROGRESS REPORT \| Progress: (\d+)\/(\d+)/);
                    if (progressMatch) {
                        const [_, current, total] = progressMatch;
                        const percent = Math.floor((parseInt(current) / parseInt(total)) * 100);
                        const validMatch = outputData.match(/PROGRESS REPORT \| Progress: \d+\/\d+ \| Valid: (\d+)/);
                        const valid = validMatch ? parseInt(validMatch[1]) : 0;
                        const speedMatch = outputData.match(/PROGRESS REPORT \| Progress: \d+\/\d+ \| Valid: \d+ \| Failed: \d+ \| Speed: ([\d.]+)/);
                        const speed = speedMatch ? parseFloat(speedMatch[1]).toFixed(2) : '0.00';
                        
                        statusDescription = `Checking Netflix cookies: ${current}/${total} (${percent}%)\n` +
                            `Valid: ${valid} | Speed: ${speed} cookies/sec\n` +
                            `Elapsed time: ${elapsedTime}s | Threads: ${threadCount}`;
                    } else {
                        statusDescription = `Checking Netflix cookies... This might take a few minutes. (${elapsedTime}s elapsed)${speedInfo}`;
                    }
                    break;
                default:
                    statusDescription = `Analyzing ${isArchive ? fileExt.toUpperCase() + ' archive' : 'cookie file'}... (${elapsedTime}s elapsed)${speedInfo}`;
            }
            
            await statusMessage.edit({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color?.blue || '#0099ff')
                        .setTitle('Netflix Cookie Checker')
                        .setDescription(statusDescription)
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            }).catch(error => console.error('Error updating status message:', error));
        }, 200);

        // Handle process completion
        return new Promise((resolve, reject) => {
            pythonProcess.on('close', async (code) => {
                clearInterval(updateInterval);

                if (code !== 0 || errorData.includes('Error')) {
                    console.error(`Netflix cookie checker exited with code ${code}`);
                    await statusMessage.edit({
                        embeds: [
                            new MessageEmbed()
                                .setColor(config.color?.red || '#ff0000')
                                .setTitle('Netflix Cookie Checker - Error')
                                .setDescription(`An error occurred while checking the cookies: \n\`\`\`${errorData || 'Unknown error'}\`\`\``)
                                .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                .setTimestamp()
                        ]
                    });
                    reject(new Error('Netflix cookie check failed'));
                    return;
                }

                // Try to gather statistics from the output - look for our special formatted section
                let stats = {
                    total: '0',
                    working: '0',
                    unsubscribed: '0',
                    failed: '0',
                    broken: '0'
                };
                
                // Check if our special Discord format data is present
                if (outputData.includes('DISCORD_STATS_BEGIN') && outputData.includes('DISCORD_STATS_END')) {
                    const statsBlock = outputData.split('DISCORD_STATS_BEGIN')[1].split('DISCORD_STATS_END')[0];
                    
                    // Extract all stats from the formatted block
                    stats.total = (statsBlock.match(/Total checked: (\d+)/i) || [])[1] || '0';
                    stats.working = (statsBlock.match(/Working cookies: (\d+)/i) || [])[1] || '0';
                    stats.unsubscribed = (statsBlock.match(/Unsubscribed accounts: (\d+)/i) || [])[1] || '0';
                    stats.failed = (statsBlock.match(/Failed cookies: (\d+)/i) || [])[1] || '0';
                    stats.broken = (statsBlock.match(/Broken cookies: (\d+)/i) || [])[1] || '0';
                } else {
                    // Fallback to looking throughout the complete output
                    stats.total = (outputData.match(/Total [Cc]hecked: (\d+)/i) || [])[1] || '0';
                    stats.working = (outputData.match(/Total Working: (\d+)/i) || [])[1] || '0';
                    stats.unsubscribed = (outputData.match(/Total Unsubscribed: (\d+)/i) || [])[1] || '0';
                    stats.failed = (outputData.match(/Total Failed: (\d+)/i) || [])[1] || '0';
                    stats.broken = (outputData.match(/Total Broken\/Invalid: (\d+)/i) || [])[1] || '0';
                }
                
                // Get speed metrics (cookies per second)
                const endTime = Date.now();
                const elapsedSeconds = (endTime - startTime) / 1000;
                const cookiesPerSecond = parseInt(stats.total) / elapsedSeconds;
                stats.speed = cookiesPerSecond.toFixed(2);
                stats.elapsedTime = elapsedSeconds.toFixed(2);

                // Create enhanced results data for our utility function
                const resultsData = {
                    total: parseInt(stats.total) || 0,
                    valid: parseInt(stats.working) || 0,
                    invalid: parseInt(stats.failed) || 0,
                    premium: parseInt(stats.working) || 0,
                    unsubscribed: parseInt(stats.unsubscribed) || 0,
                    broken: parseInt(stats.broken) || 0,
                    speed: parseFloat(stats.speed) || 0
                };
                
                // Use our utility to create a nicely formatted results embed
                const resultsEmbed = progressUtils.createResultsEmbed(resultsData, startTime, 'Netflix', config);
                
                // Add additional fields for more detailed statistics
                resultsEmbed.addFields([
                    { name: 'Broken Cookies', value: stats.broken || '0', inline: true },
                    { name: 'Processing Time', value: `${stats.elapsedTime} seconds`, inline: true }
                ]);
                
                // Add author to footer
                resultsEmbed.setFooter({
                    text: `${message.author.tag} • All working cookies have been saved`,
                    iconURL: message.author.displayAvatarURL({ dynamic: true })
                });
                
                // Update the status message with the results
                await statusMessage.edit({ embeds: [resultsEmbed] });
                
                // Let the user know if working cookies were found
                if (parseInt(stats.working) > 0) {
                    await message.channel.send({ 
                        embeds: [
                            new MessageEmbed()
                                .setColor(config.color?.green || '#00ff00')
                                .setTitle('Working Netflix Cookies')
                                .setDescription(`Found ${stats.working} working Netflix cookies! They've been stored and are ready for use.\n\n**Performance:** Processed ${stats.total} cookies in ${stats.elapsedTime}s (${stats.speed} cookies/sec)`)
                                .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                .setTimestamp()
                        ]
                    });
                }
                
                // Clean up - delete the original file
                if (fsSync.existsSync(filePath)) {
                    fsSync.unlinkSync(filePath);
                }
                
                resolve();
            });
        });
    } catch (error) {
        console.error('Error in checkNetflixCookies:', error);
        throw error;
    }
}

// Function to check Spotify cookies
async function checkSpotifyCookies(filePath, message, statusMessage, threadCount = 500) {
    try {
        // Start timing for performance metrics
        const startTime = Date.now();
        
        // Run the optimized Python script to check cookies
        console.log(`Starting optimized Python process to check: ${filePath} with ${threadCount} threads`);
        const scriptPath = path.join(__dirname, '../../spotify_cookie_checker_optimized.py');
        const pythonProcess = spawn('/nix/store/wqhkxzzlaswkj3gimqign99sshvllcg6-python-wrapped-0.1.0/bin/python', 
            [scriptPath, filePath, '--threads', threadCount.toString()]);
        
        // Add a timeout to prevent hanging
        const timeoutMs = 300000; // 5 minutes
        const timeout = setTimeout(() => {
            console.log('Python process timed out - killing process');
            pythonProcess.kill();
            
            statusMessage.edit({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color?.red || '#ff0000')
                        .setTitle('Processing Timeout')
                        .setDescription('The cookie checking process took too long and was terminated. The file may be too large or contain too many nested archives.')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            });
        }, timeoutMs);
        
        let stdoutData = '';
        let stderrData = '';
        
        pythonProcess.stdout.on('data', (data) => {
            const output = data.toString();
            stdoutData += output;
            console.log(`[Spotify Checker] ${output.trim()}`);
            
            // Try to update the message with progress information if progress data is found
            try {
                const lines = output.split('\n');
                for (const line of lines) {
                    if (line.includes('Progress:') || line.includes('SPOTIFY PROGRESS REPORT') || line.includes('PROGRESS REPORT')) {
                        // Parse the progress information 
                        const progressData = {
                            current: 0,
                            total: 0,
                            valid: 0,
                            invalid: 0,
                            speed: 0,
                            threads: threadCount,
                            stage: 'processing'
                        };
                        
                        // Extract current progress - prioritize the standardized format
                        const progressMatch = line.match(/PROGRESS REPORT \| Progress: (\d+)\/(\d+)/) || 
                                           line.match(/Progress: (\d+)\/(\d+)/) || 
                                           line.match(/Processed: (\d+)\/(\d+)/) || 
                                           stdoutData.match(/Checked: (\d+) cookies/);
                        if (progressMatch) {
                            progressData.current = parseInt(progressMatch[1]) || 0;
                            if (progressMatch[2]) {
                                progressData.total = parseInt(progressMatch[2]) || 100;
                            } else {
                                // If we don't have total, try to find it elsewhere
                                const totalMatch = stdoutData.match(/Found (\d+) Spotify cookie files/);
                                progressData.total = totalMatch ? parseInt(totalMatch[1]) : 100;
                            }
                        }
                        
                        // Extract valid count
                        const validMatch = line.match(/Valid: (\d+)/) || stdoutData.match(/hits: (\d+)/) || 
                                       stdoutData.match(/Working cookies: (\d+)/);
                        progressData.valid = validMatch ? parseInt(validMatch[1]) : 0;
                        
                        // Extract invalid count
                        const invalidMatch = line.match(/Failed: (\d+)/) || stdoutData.match(/bad: (\d+)/) ||
                                         stdoutData.match(/Failed cookies: (\d+)/);
                        progressData.invalid = invalidMatch ? parseInt(invalidMatch[1]) : 0;
                        
                        // Extract speed
                        const speedMatch = line.match(/Speed: ([\d.]+)/) || stdoutData.match(/Speed: ([\d.]+)/);
                        progressData.speed = speedMatch ? parseFloat(speedMatch[1]) : 0;
                        
                        // Extract thread count (if available)
                        const threadMatch = line.match(/Threads: (\d+)/);
                        if (threadMatch) {
                            progressData.threads = parseInt(threadMatch[1]);
                        }
                        
                        // Determine processing stage
                        let processingStage = 'analyzing';
                        if (stdoutData.includes('Extracting archive')) {
                            processingStage = 'extracting';
                        } else if (stdoutData.includes('Found') && stdoutData.includes('cookie files')) {
                            processingStage = 'processing_files';
                        } else if (line.includes('Progress:')) {
                            processingStage = 'checking_cookies';
                        }
                        progressData.stage = processingStage;
                        
                        // Create enhanced embed with visual progress bar
                        const embed = progressUtils.createProgressEmbed(progressData, startTime, 'Spotify', config);
                        
                        // Add author to footer
                        embed.setFooter({ 
                            text: `${message.author.tag} • Processing file: ${path.basename(filePath)}`, 
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
            const error = data.toString();
            stderrData += error;
            console.error(`Python stderr: ${error}`);
        });
        
        // Handle process completion
        return new Promise((resolve, reject) => {
            pythonProcess.on('close', async (code) => {
                console.log(`Python process exited with code ${code}`);
                
                // Clear the timeout
                clearTimeout(timeout);
                
                // Clean up the file
                if (fsSync.existsSync(filePath)) {
                    fsSync.unlinkSync(filePath);
                    console.log(`Removed temporary file: ${filePath}`);
                }
                
                if (code !== 0) {
                    // Script failed
                    await statusMessage.edit({
                        embeds: [
                            new MessageEmbed()
                                .setColor(config.color?.red || '#ff0000')
                                .setTitle('Error Processing Cookies')
                                .setDescription(`The cookie checker encountered an error:\n\`\`\`${stderrData}\`\`\``)
                                .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                .setTimestamp()
                        ]
                    });
                    reject(new Error('Spotify cookie check failed'));
                    return;
                }
                
                // Read the results
                const resultsPath = path.join(__dirname, '../../cookie_check_results.json');
                if (!fsSync.existsSync(resultsPath)) {
                    await statusMessage.edit({
                        embeds: [
                            new MessageEmbed()
                                .setColor(config.color?.red || '#ff0000')
                                .setTitle('Results Not Found')
                                .setDescription('The cookie checker did not generate any results.')
                                .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                .setTimestamp()
                        ]
                    });
                    reject(new Error('No results generated'));
                    return;
                }
                
                const results = JSON.parse(fsSync.readFileSync(resultsPath, 'utf8'));
                
                // Calculate total processing time and speed
                const endTime = Date.now();
                const elapsedSeconds = (endTime - startTime) / 1000;
                const cookiesPerSecond = results.total > 0 ? results.total / elapsedSeconds : 0;
                
                // Create enhanced results data 
                const resultsData = {
                    total: results.total || 0,
                    valid: results.valid || 0,
                    invalid: (results.total - results.valid) || 0,
                    premium: results.premium || 0,
                    family: results.family || 0,
                    duo: results.duo || 0,
                    free: results.free || 0,
                    student: results.student || 0,
                    speed: cookiesPerSecond,
                    duplicates: results.duplicates || 0
                };
                
                // Use our utility to create a nicely formatted results embed
                const resultsEmbed = progressUtils.createResultsEmbed(resultsData, startTime, 'Spotify', config);
                
                // Add additional fields for more detailed statistics
                resultsEmbed.addFields([
                    { name: 'Processing Time', value: `${elapsedSeconds.toFixed(2)} seconds`, inline: true },
                    { name: 'Duplicates Found', value: String(results.duplicates || 0), inline: true }
                ]);
                
                // Add author to footer
                resultsEmbed.setFooter({
                    text: `${message.author.tag} • All working cookies have been saved`,
                    iconURL: message.author.displayAvatarURL({ dynamic: true })
                });
                
                // Update the status message with the results
                await statusMessage.edit({ embeds: [resultsEmbed] });
                
                // Let the user know if working cookies were found
                if (results.valid > 0) {
                    const planBreakdown = [];
                    if (results.premium) planBreakdown.push(`Premium: ${results.premium}`);
                    if (results.family) planBreakdown.push(`Family: ${results.family}`);
                    if (results.duo) planBreakdown.push(`Duo: ${results.duo}`);
                    if (results.student) planBreakdown.push(`Student: ${results.student}`);
                    if (results.free) planBreakdown.push(`Free: ${results.free}`);
                    
                    const planDetails = planBreakdown.length > 0 ? `\n\n**Plans:**\n${planBreakdown.join('\n')}` : '';
                    
                    await message.channel.send({
                        embeds: [
                            new MessageEmbed()
                                .setColor(config.color?.green || '#00ff00')
                                .setTitle('Working Spotify Cookies')
                                .setDescription(`Found ${results.valid} working Spotify cookies! They've been stored and are ready for use.\n\n**Performance:** Processed ${results.total} cookies in ${elapsedSeconds.toFixed(2)}s (${cookiesPerSecond.toFixed(2)} cookies/sec)${planDetails}`)
                                .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                .setTimestamp()
                        ]
                    });
                }
                
                resolve();
            });
        });
    } catch (error) {
        console.error('Error in checkSpotifyCookies:', error);
        throw error;
    }
}