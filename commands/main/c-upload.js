const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const fetch = require('node-fetch/lib/index.js');
const { spawn } = require('child_process');
const { MessageEmbed, MessageAttachment } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'c-upload',
    description: 'Upload, check and store working cookies',
    usage: 'c-upload <netflix/spotify> {.zip attachment}',

    execute: async (message, args, usedPrefix) => {
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
                await checkNetflixCookies(filePath, message, processingMessage);
            } else if (service === 'spotify') {
                await checkSpotifyCookies(filePath, message, processingMessage);
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
async function checkNetflixCookies(filePath, message, statusMessage) {
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
        const scriptPath = path.join(__dirname, '../../netflix_cookie_checker.py');
        const pythonProcess = spawn('/nix/store/wqhkxzzlaswkj3gimqign99sshvllcg6-python-wrapped-0.1.0/bin/python', [scriptPath, filePath]);

        let outputData = '';
        let errorData = '';

        pythonProcess.stdout.on('data', (data) => {
            outputData += data.toString();
            console.log(`[Netflix Checker] ${data.toString().trim()}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            errorData += data.toString();
            console.error(`[Netflix Checker Error] ${data.toString().trim()}`);
        });

        // Prepare for status updates
        let processingStage = 'initializing';
        let startTime = Date.now();
        const isArchive = fileExt === '.zip' || fileExt === '.rar';
        
        // Update status periodically
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
                    statusDescription = `Extracting files from ${fileExt.toUpperCase()} archive... (${elapsedTime}s elapsed)`;
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
                    statusDescription = `Analyzing ${isArchive ? fileExt.toUpperCase() + ' archive' : 'cookie file'}... (${elapsedTime}s elapsed)`;
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
            });
        }, 5000);

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

                // Try to gather statistics from the output
                const stats = {
                    total: (outputData.match(/Total checked: (\d+)/i) || [])[1] || '0',
                    working: (outputData.match(/Working cookies: (\d+)/i) || [])[1] || '0',
                    unsubscribed: (outputData.match(/Unsubscribed accounts: (\d+)/i) || [])[1] || '0',
                    failed: (outputData.match(/Failed cookies: (\d+)/i) || [])[1] || '0',
                    broken: (outputData.match(/Broken cookies: (\d+)/i) || [])[1] || '0'
                };

                // Create success embed with results
                const resultsEmbed = new MessageEmbed()
                    .setColor(config.color?.green || '#00ff00')
                    .setTitle('Netflix Cookie Checker - Results')
                    .setDescription(`Check completed! Here are the results:`)
                    .addFields([
                        { name: 'Total Checked', value: stats.total, inline: true },
                        { name: 'Working Cookies', value: stats.working, inline: true },
                        { name: 'Unsubscribed', value: stats.unsubscribed, inline: true },
                        { name: 'Failed Cookies', value: stats.failed, inline: true },
                        { name: 'Broken Cookies', value: stats.broken, inline: true }
                    ])
                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                    .setTimestamp();
                
                // Update the status message with the results
                await statusMessage.edit({ embeds: [resultsEmbed] });
                
                // Let the user know if working cookies were found
                if (parseInt(stats.working) > 0) {
                    await message.channel.send({ 
                        embeds: [
                            new MessageEmbed()
                                .setColor(config.color?.green || '#00ff00')
                                .setTitle('Working Netflix Cookies')
                                .setDescription(`Found ${stats.working} working Netflix cookies! They've been stored and are ready for use.`)
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
async function checkSpotifyCookies(filePath, message, statusMessage) {
    try {
        // Run the Python script to check cookies
        console.log(`Starting Python process to check: ${filePath}`);
        const scriptPath = path.join(__dirname, '../../spotify_cookie_checker.py');
        const pythonProcess = spawn('/nix/store/wqhkxzzlaswkj3gimqign99sshvllcg6-python-wrapped-0.1.0/bin/python', [scriptPath, filePath]);
        
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
            console.log(`Python stdout: ${output}`);
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
                const resultsPath = path.join('./cookie_check_results.json');
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
                    reject(new Error('No results found'));
                    return;
                }
                
                const results = JSON.parse(fsSync.readFileSync(resultsPath, 'utf8'));
                
                // Check for duplicates and prevent adding them
                let duplicateCount = 0;
                if (results.valid > 0 && results.valid_cookies.length > 0) {
                    // Track existing cookies by identifier
                    const uniqueIdentifiers = new Set();
                    const existingFiles = fsSync.readdirSync(spotifyDir).filter(file => 
                        !file.startsWith('.') && 
                        !fsSync.statSync(path.join(spotifyDir, file)).isDirectory()
                    );
                    
                    // First, collect identifiers from existing cookies
                    existingFiles.forEach(file => {
                        const filePath = path.join(spotifyDir, file);
                        try {
                            const content = fsSync.readFileSync(filePath, 'utf8');
                            
                            // Extract email or username
                            let identifier = '';
                            
                            // Try from filename first
                            if (file.includes('@')) {
                                identifier = file.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] || '';
                            }
                            
                            // If not in filename, try content
                            if (!identifier) {
                                identifier = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] || '';
                            }
                            
                            // If still not found, use content hash
                            if (!identifier) {
                                const hash = require('crypto').createHash('md5').update(content).digest('hex');
                                identifier = hash;
                            }
                            
                            if (identifier) {
                                uniqueIdentifiers.add(identifier);
                            }
                        } catch (err) {
                            console.error(`Error processing file ${file}:`, err);
                        }
                    });
                    
                    // Now check each valid cookie and prevent duplicates
                    const filteredCookies = [];
                    
                    for (const cookiePath of results.valid_cookies) {
                        if (fsSync.existsSync(cookiePath)) {
                            try {
                                const content = fsSync.readFileSync(cookiePath, 'utf8');
                                const fileName = path.basename(cookiePath);
                                
                                // Extract identifier
                                let identifier = '';
                                
                                // Try from filename first
                                if (fileName.includes('@')) {
                                    identifier = fileName.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] || '';
                                }
                                
                                // If not in filename, try content
                                if (!identifier) {
                                    identifier = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] || '';
                                }
                                
                                // If still not found, use content hash
                                if (!identifier) {
                                    const hash = require('crypto').createHash('md5').update(content).digest('hex');
                                    identifier = hash;
                                }
                                
                                // If it's a duplicate, don't add it to the final spotify folder
                                if (identifier && uniqueIdentifiers.has(identifier)) {
                                    duplicateCount++;
                                    console.log(`Skipping duplicate Spotify cookie: ${fileName}`);
                                    
                                    // The file should be kept in the working_cookies directory but not copied to spotify dir
                                } else {
                                    filteredCookies.push(cookiePath);
                                    
                                    // Add to our tracked identifiers to prevent duplicates within this batch
                                    if (identifier) {
                                        uniqueIdentifiers.add(identifier);
                                    }
                                    
                                    // Also copy to the spotify folder (primary storage)
                                    const destPath = path.join(spotifyDir, fileName);
                                    fsSync.copyFileSync(cookiePath, destPath);
                                    console.log(`Copied working cookie to: ${destPath}`);
                                }
                            } catch (err) {
                                console.error(`Error checking for duplicates in ${cookiePath}:`, err);
                            }
                        }
                    }
                    
                    // Update results with filtered cookies and duplicate count
                    results.valid_cookies = filteredCookies;
                    results.duplicates = duplicateCount;
                    results.valid = results.valid_cookies.length;
                }
                
                // Create results embed
                const resultsEmbed = new MessageEmbed()
                    .setColor(config.color?.green || '#00ff00')
                    .setTitle('Spotify Cookie Check Results')
                    .setDescription(`Results for file: \`${path.basename(filePath)}\``)
                    .addFields([
                        { name: 'Total Checked', value: results.total_checked.toString(), inline: true },
                        { name: 'Valid Accounts', value: results.valid.toString(), inline: true },
                        { name: 'Invalid Accounts', value: results.invalid.toString(), inline: true },
                        { name: 'Duplicates Found', value: (results.duplicates || 0).toString(), inline: true },
                        { name: 'Errors', value: results.errors.toString(), inline: true },
                        { name: 'Files Processed', value: results.files_processed.toString(), inline: true },
                        { name: 'Archives Processed', value: results.archives_processed.toString(), inline: true }
                    ])
                    .addFields([
                        { name: 'Premium', value: results.premium.toString(), inline: true },
                        { name: 'Family', value: results.family.toString(), inline: true },
                        { name: 'Duo', value: results.duo.toString(), inline: true },
                        { name: 'Student', value: results.student.toString(), inline: true },
                        { name: 'Free', value: results.free.toString(), inline: true },
                        { name: 'Unknown', value: results.unknown.toString(), inline: true }
                    ])
                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                    .setTimestamp();
                
                await statusMessage.edit({ embeds: [resultsEmbed] });
                
                // Let the user know if working cookies were found
                if (results.valid > 0) {
                    await message.channel.send({ 
                        embeds: [
                            new MessageEmbed()
                                .setColor(config.color?.green || '#00ff00')
                                .setTitle('Working Spotify Cookies')
                                .setDescription(`Found ${results.valid} working Spotify cookies! They've been stored and are ready for use.`)
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
