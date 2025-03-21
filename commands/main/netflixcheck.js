const { MessageEmbed } = require('discord.js');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../../config.json');
const progressUtils = require('../../utils/progressBar');

module.exports = {
    name: 'netflixcheck',
    description: 'Check Netflix cookies',
    usage: 'netflixcheck [threads]',
    async execute(message, args) {
        // Check if user specified a thread count
        let threadCount = 500; // Default to 500 threads for optimal performance
        if (args.length > 0 && !isNaN(args[0])) {
            threadCount = Math.min(2000, Math.max(1, parseInt(args[0]))); // Limit between 1-2000
        }
        // Check if the user has permission to use this command
        const allowedRoleIDs = config.cookieCheckRoles || []; // Use a specific role setting or an empty array if not set
        const userRoles = message.member.roles.cache.map(role => role.id);

        // If the user doesn't have the required roles, deny permission
        if (!userRoles.some(role => allowedRoleIDs.includes(role))) {
            return message.reply('You do not have permission to use this command.');
        }

        // Check if a file was attached to the message
        const attachment = message.attachments.first();
        if (!attachment) {
            return message.reply('Please attach a file containing Netflix cookies to check.');
        }

        // Make sure the netflix directory exists
        const netflixDir = path.join(__dirname, '..', '..', 'netflix');
        if (!fs.existsSync(netflixDir)) {
            fs.mkdirSync(netflixDir, { recursive: true });
        }

        // Create a status embed
        const statusEmbed = new MessageEmbed()
            .setColor(config.color?.blue || '#0099ff')
            .setTitle('Netflix Cookie Checker')
            .setDescription('Processing your Netflix cookies...')
            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTimestamp();

        const statusMessage = await message.channel.send({ embeds: [statusEmbed] });

        try {
            // Download the file
            const fileName = attachment.name;
            const filePath = path.join(netflixDir, fileName);

            // Create a write stream to save the file
            const writeStream = fs.createWriteStream(filePath);
            
            // Fetch the file content and pipe it to the write stream
            const response = await fetch(attachment.url);
            if (!response.ok) {
                throw new Error(`Failed to download file: ${response.statusText}`);
            }
            
            const fileStream = response.body;
            const streamPipeline = require('util').promisify(require('stream').pipeline);
            await streamPipeline(fileStream, writeStream);

            // Update status
            await statusMessage.edit({
                embeds: [
                    statusEmbed
                        .setDescription('File downloaded successfully. Starting cookie check process...')
                ]
            });

            // Update status with file extension information
            const fileExt = path.extname(fileName).toLowerCase();
            
            // Additional message for archive files
            if (fileExt === '.zip' || fileExt === '.rar') {
                await statusMessage.edit({
                    embeds: [
                        statusEmbed
                            .setDescription(`File downloaded successfully. ${fileExt.toUpperCase()} archive detected. Extracting and checking Netflix cookies... This may take longer.`)
                    ]
                });
            }
            
            // Store for later use
            const fileExtension = fileExt;
            
            // Run the Python script to check the uploaded file
            const scriptPath = path.join(__dirname, '../../netflix_cookie_checker.py');
            console.log(`Starting Netflix cookie check with ${threadCount} threads`);
            const pythonProcess = spawn('/nix/store/wqhkxzzlaswkj3gimqign99sshvllcg6-python-wrapped-0.1.0/bin/python', 
                [scriptPath, filePath, '--threads', threadCount.toString()]);

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