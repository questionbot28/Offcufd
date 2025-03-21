const { MessageEmbed } = require('discord.js');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../../config.json');
const progressUtils = require('../../utils/progressBar');
const axios = require('axios');

module.exports = {
    name: 'netflixcheck',
    description: 'Check Netflix cookies with optimized performance',
    usage: 'netflixcheck [URL or file attachment] [threads]',
    async execute(message, args) {
        // Process arguments
        let threadCount = 2000; // Default to 2000 threads for maximum performance with optimized version
        let url = null;
        let filePath = null;
        
        // Parse arguments to handle both URL and thread count
        for (const arg of args) {
            if (!isNaN(arg)) {
                // This is a number, treat as thread count
                threadCount = Math.min(5000, Math.max(1, parseInt(arg))); // Limit between 1-5000
            } else if (arg.startsWith('http://') || arg.startsWith('https://')) {
                // This is a URL
                url = arg;
            }
        }
        
        // Check if the user has permission to use this command
        const allowedRoleIDs = config.cookieCheckRoles || config.commandAccess?.netflixcheck || []; 
        const userRoles = message.member.roles.cache.map(role => role.id);
        const isAdmin = message.member.roles.cache.some(role => 
            role.name.toLowerCase() === 'owner' || 
            role.name.toLowerCase() === 'admin');

        // If the user doesn't have the required roles, deny permission
        if (!isAdmin && !userRoles.some(role => allowedRoleIDs.includes(role))) {
            return message.reply('You do not have permission to use this command.');
        }

        // Get cookie file from message attachment or URL
        const attachment = message.attachments.first();
        if (attachment) {
            url = attachment.url;
        } else if (!url) {
            return message.reply('Please attach a file or provide a URL containing Netflix cookies to check.');
        }

        // Make sure directories exist
        const netflixDir = path.join(__dirname, '..', '..', 'netflix');
        const cookiesDir = path.join(__dirname, '..', '..', 'cookies');
        const tempDir = path.join(netflixDir, 'temp');
        
        [netflixDir, cookiesDir, tempDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });

        // Create a status embed
        const statusEmbed = new MessageEmbed()
            .setColor(config.color?.blue || '#0099ff')
            .setTitle('Netflix Cookie Checker (Optimized)')
            .setDescription('Processing your Netflix cookies...')
            .addField('Thread Count', `${threadCount} threads`, true)
            .addField('Optimization Level', 'Ultra-High Speed', true)
            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTimestamp();

        const statusMessage = await message.channel.send({ embeds: [statusEmbed] });

        try {
            // Generate a file name if it's a URL without a clear filename
            let fileName;
            if (attachment) {
                fileName = attachment.name;
            } else {
                // Extract filename from URL or generate one
                const urlParts = url.split('/');
                fileName = urlParts[urlParts.length - 1] || `netflix_cookies_${Date.now()}.txt`;
                
                // Ensure it has a .txt extension for consistency
                if (!fileName.endsWith('.txt') && !fileName.endsWith('.zip')) {
                    fileName += '.txt';
                }
            }
            
            // Set file path where we'll save the downloaded content
            filePath = path.join(cookiesDir, fileName);
            
            // Download the file
            await statusMessage.edit({
                embeds: [
                    statusEmbed
                        .setDescription(`Downloading file from ${url}...`)
                ]
            });
            
            try {
                await downloadFile(url, filePath);
                
                await statusMessage.edit({
                    embeds: [
                        statusEmbed
                            .setDescription('File downloaded successfully. Starting Netflix cookie check...')
                    ]
                });
            } catch (error) {
                console.error('Error downloading file:', error);
                return statusMessage.edit({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color?.red || '#ff0000')
                            .setTitle('Netflix Cookie Checker - Error')
                            .setDescription(`Failed to download file: ${error.message}`)
                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                    ]
                });
            }
            
            // Update status with file extension information
            const fileExt = path.extname(fileName).toLowerCase();
            
            // Additional message for archive files
            if (fileExt === '.zip' || fileExt === '.rar') {
                await statusMessage.edit({
                    embeds: [
                        statusEmbed
                            .setDescription(`File downloaded successfully. ${fileExt.toUpperCase()} archive detected. Using optimized archive handling...`)
                    ]
                });
            }
            
            // Run the optimized Python script to check the uploaded file
            const scriptPath = path.join(__dirname, '../../netflix_cookie_checker_optimized.py');
            console.log(`Starting Netflix cookie check with ${threadCount} threads using optimized checker`);
            const pythonProcess = spawn('python3', 
                [scriptPath, '--check', filePath, '--threads', threadCount.toString()]);

            let outputData = '';
            let errorData = '';
            
            // Track start time for performance metrics
            const processStartTime = Date.now();

            pythonProcess.stdout.on('data', (data) => {
                const output = data.toString();
                outputData += output;
                console.log(`[Netflix Checker] ${output.trim()}`);
                
                // Try to update the message with progress information
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
                            
                            // Extract progress values using regex
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
                                text: `${message.author.tag} • Processing stage: ${processingStage || 'Analyzing'}`, 
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

            // Prepare for more detailed status updates
            let processingStage = 'initializing';
            let startTime = Date.now();
            // Use the fileExtension we already defined above
            const isArchive = fileExtension === '.zip' || fileExtension === '.rar';
            
            // Update status periodically with more detailed information
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
                
                // Create appropriate status message based on stage
                switch (processingStage) {
                    case 'extracting':
                        statusDescription = `Extracting files from ${fileExtension.toUpperCase()} archive... (${elapsedTime}s elapsed)`;
                        break;
                    case 'found_files':
                        const foundMatch = outputData.match(/Found (\d+) Netflix cookie files to check/);
                        const fileCount = foundMatch ? foundMatch[1] : 'multiple';
                        statusDescription = `Found ${fileCount} cookie files to check. Processing... (${elapsedTime}s elapsed)`;
                        break;
                    case 'processing':
                        statusDescription = `Checking Netflix cookies... This might take a few minutes. (${elapsedTime}s elapsed)`;
                        break;
                    default:
                        statusDescription = `Analyzing ${isArchive ? fileExtension.toUpperCase() + ' archive' : 'cookie file'}... (${elapsedTime}s elapsed)`;
                }
                
                const updatedEmbed = new MessageEmbed()
                    .setColor(config.color?.blue || '#0099ff')
                    .setTitle('Netflix Cookie Checker')
                    .setDescription(statusDescription)
                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                    .setTimestamp();
                
                await statusMessage.edit({ embeds: [updatedEmbed] });
            }, 5000); // Update every 5 seconds for more responsive updates

            // Look for JSON result data
            let jsonResultData = null;
            
            // Process JSON output when the process exits
            pythonProcess.on('close', async (code) => {
                clearInterval(updateInterval);
                
                // Look for any JSON results in the output
                try {
                    // Try to extract JSON data from the output
                    const resultMatch = outputData.match(/Result: ({.*})/);
                    if (resultMatch && resultMatch[1]) {
                        try {
                            // Convert single quotes to double quotes for JSON parsing
                            const resultText = resultMatch[1].replace(/'/g, '"');
                            jsonResultData = JSON.parse(resultText);
                            console.log("Parsed JSON result:", jsonResultData);
                        } catch (jsonError) {
                            console.error("Error parsing JSON result:", jsonError);
                        }
                    }
                } catch (error) {
                    console.error("Error extracting JSON result:", error);
                }

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
                    return;
                }
                
                // First try to get stats from JSON result which is more accurate
                const stats = {
                    total: jsonResultData?.stats?.total || 0,
                    working: jsonResultData?.stats?.valid || 0,
                    unsubscribed: jsonResultData?.stats?.unsubscribed || 0,
                    failed: jsonResultData?.stats?.invalid || 0,
                    broken: jsonResultData?.stats?.errors || 0,
                    premium: jsonResultData?.stats?.premium || 0,
                    standard: jsonResultData?.stats?.standard || 0,
                    basic: jsonResultData?.stats?.basic || 0,
                    speed: jsonResultData?.stats?.speed || 0,
                };
                
                // If JSON data wasn't found, try to extract from text output
                if (!jsonResultData) {
                    stats.total = parseInt((outputData.match(/Total checked: (\d+)/i) || [])[1] || '0');
                    stats.working = parseInt((outputData.match(/Working cookies: (\d+)/i) || [])[1] || '0');
                    stats.unsubscribed = parseInt((outputData.match(/Unsubscribed accounts: (\d+)/i) || [])[1] || '0');
                    stats.failed = parseInt((outputData.match(/Failed cookies: (\d+)/i) || [])[1] || '0');
                    stats.broken = parseInt((outputData.match(/Broken cookies: (\d+)/i) || [])[1] || '0');
                    
                    // Try to extract plan stats if available
                    const premiumMatch = outputData.match(/Premium: (\d+)/i);
                    const standardMatch = outputData.match(/Standard: (\d+)/i);
                    const basicMatch = outputData.match(/Basic: (\d+)/i);
                    
                    if (premiumMatch) stats.premium = parseInt(premiumMatch[1]);
                    if (standardMatch) stats.standard = parseInt(standardMatch[1]);
                    if (basicMatch) stats.basic = parseInt(basicMatch[1]);
                    
                    // Try to extract speed
                    const speedMatch = outputData.match(/Speed: ([\d.]+) cookies\/sec/i);
                    if (speedMatch) stats.speed = parseFloat(speedMatch[1]);
                }

                // Check if working cookies directory exists and has premium cookies
                const workingDir = path.join(__dirname, '..', '..', 'working_cookies', 'netflix', 'premium');
                let workingFiles = [];
                
                if (fs.existsSync(workingDir)) {
                    workingFiles = fs.readdirSync(workingDir).filter(file => file.endsWith('.txt'));
                }
                
                // Check for duplicates
                let duplicateCount = 0;
                const netflixDir = path.join(__dirname, '../../netflix');
                
                if (fs.existsSync(netflixDir) && Number(stats.working) > 0) {
                    const uniqueIdentifiers = new Set();
                    const existingFiles = fs.readdirSync(netflixDir).filter(file => 
                        !file.startsWith('.') && 
                        !fs.statSync(path.join(netflixDir, file)).isDirectory() &&
                        file.endsWith('.txt')
                    );
                    
                    // First gather all existing Netflix cookie identifiers
                    existingFiles.forEach(file => {
                        const filePath = path.join(netflixDir, file);
                        try {
                            const content = fs.readFileSync(filePath, 'utf8');
                            
                            // Extract Netflix profile ID or session ID
                            let identifier = '';
                            const profileMatch = content.match(/NetflixId=([a-f0-9-]+)/i);
                            
                            if (profileMatch && profileMatch[1]) {
                                identifier = profileMatch[1];
                            } else {
                                // Try to extract session ID as fallback
                                const sessionMatch = content.match(/netflix-session-id=([a-f0-9-]+)/i);
                                if (sessionMatch && sessionMatch[1]) {
                                    identifier = sessionMatch[1];
                                } else {
                                    // If all else fails, use a hash of the content
                                    const hash = require('crypto').createHash('md5').update(content).digest('hex');
                                    identifier = hash;
                                }
                            }
                            
                            if (identifier) {
                                uniqueIdentifiers.add(identifier);
                            }
                        } catch (err) {
                            console.error(`Error processing file ${file}:`, err);
                        }
                    });
                    
                    // Now check newly created files for duplicates
                    const newFilesDir = path.join(__dirname, '../../working_cookies/netflix/premium');
                    if (fs.existsSync(newFilesDir)) {
                        const newFiles = fs.readdirSync(newFilesDir).filter(file => file.endsWith('.txt'));
                        
                        newFiles.forEach(file => {
                            const filePath = path.join(newFilesDir, file);
                            try {
                                const content = fs.readFileSync(filePath, 'utf8');
                                
                                // Extract Netflix profile ID or session ID
                                let identifier = '';
                                const profileMatch = content.match(/NetflixId=([a-f0-9-]+)/i);
                                
                                if (profileMatch && profileMatch[1]) {
                                    identifier = profileMatch[1];
                                } else {
                                    // Try to extract session ID as fallback
                                    const sessionMatch = content.match(/netflix-session-id=([a-f0-9-]+)/i);
                                    if (sessionMatch && sessionMatch[1]) {
                                        identifier = sessionMatch[1];
                                    } else {
                                        // If all else fails, use a hash of the content
                                        const hash = require('crypto').createHash('md5').update(content).digest('hex');
                                        identifier = hash;
                                    }
                                }
                                
                                if (identifier && uniqueIdentifiers.has(identifier)) {
                                    duplicateCount++;
                                }
                            } catch (err) {
                                console.error(`Error checking for duplicates in ${file}:`, err);
                            }
                        });
                    }
                }
                
                // Calculate total processing time and metrics
                const endTime = Date.now();
                const elapsedSeconds = (endTime - processStartTime) / 1000;
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
                    speed: parseFloat(stats.speed) || 0,
                    duplicates: duplicateCount || 0
                };
                
                // Use our utility to create a nicely formatted results embed
                const resultsEmbed = progressUtils.createResultsEmbed(resultsData, processStartTime, 'Netflix', config);
                
                // Add additional fields for more detailed statistics
                resultsEmbed.addFields([
                    { name: 'Broken Cookies', value: stats.broken || '0', inline: true },
                    { name: 'Duplicates Found', value: String(duplicateCount), inline: true },
                    { name: 'Processing Time', value: `${stats.elapsedTime} seconds`, inline: true }
                ]);
                
                // Add Netflix branding image
                resultsEmbed.setImage('https://cdn.discordapp.com/attachments/1263458101886193725/1349031252216250503/350kb.gif');
                
                // Add author to footer
                resultsEmbed.setFooter({
                    text: `${message.author.tag} • File: ${fileName}`,
                    iconURL: message.author.displayAvatarURL({ dynamic: true })
                });
                
                // Update the status message with the results
                await statusMessage.edit({ embeds: [resultsEmbed] });
                
                // Send a simple summary of working cookies if any
                if (workingFiles.length > 0) {
                    // Create a summary message without detailed cookie info
                    const workingSummary = new MessageEmbed()
                        .setColor(config.color?.green || '#00ff00')
                        .setTitle('Working Netflix Cookies')
                        .setDescription(`Found ${workingFiles.length} working Netflix cookies! Use \`.csend @user netflix\` to send them and see detailed information.`)
                        .setImage('https://cdn.discordapp.com/attachments/1263458101886193725/1349031252216250503/350kb.gif')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp();
                    
                    await message.channel.send({ embeds: [workingSummary] });
                }
                
                // Clean up - delete the original file
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        } catch (error) {
            console.error('Error in netflixcheck command:', error);
            await statusMessage.edit({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color?.red || '#ff0000')
                        .setTitle('Netflix Cookie Checker - Error')
                        .setDescription(`An error occurred: ${error.message}`)
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            });
        }
    },
};

// Helper function to download a file from a URL
async function downloadFile(url, filePath) {
    return new Promise(async (resolve, reject) => {
        try {
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'stream'
            });
            
            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);
            
            writer.on('finish', () => resolve(filePath));
            writer.on('error', reject);
        } catch (error) {
            reject(error);
        }
    });
}