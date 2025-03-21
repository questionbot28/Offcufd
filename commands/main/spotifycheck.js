// commands/main/spotifycheck.js
const { MessageEmbed, MessageAttachment } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../../config.json');
const https = require('https');
const { createWriteStream } = require('fs');
const progressUtils = require('../../utils/progressBar');

module.exports = {
    name: 'spotifycheck',
    description: 'Check Spotify cookies in uploaded files',
    usage: 'spotifycheck [threads] (attach a .txt, .zip, or .rar file)',
    
    async execute(message, args) {
        // Check if user specified a thread count
        let threadCount = 500; // Default to 500 threads for optimal performance
        if (args.length > 0 && !isNaN(args[0])) {
            threadCount = Math.min(2000, Math.max(1, parseInt(args[0]))); // Limit between 1-2000
        }
        // Create necessary directories
        const tempDir = path.join(__dirname, '../../temp');
        const cookiesDir = path.join(__dirname, '../../cookies');
        const workingCookiesDir = path.join(__dirname, '../../working_cookies');
        
        [tempDir, cookiesDir, workingCookiesDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
        
        // Check if a file is attached
        if (message.attachments.size === 0) {
            return message.channel.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Missing File')
                        .setDescription('Please attach a file containing Spotify cookies (.txt, .zip, or .rar).')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            });
        }
        
        const attachment = message.attachments.first();
        const fileExtension = path.extname(attachment.name).toLowerCase();
        
        // Check if file extension is supported
        if (!['.txt', '.zip', '.rar'].includes(fileExtension)) {
            return message.channel.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Unsupported File Type')
                        .setDescription('Please upload a .txt, .zip, or .rar file containing Spotify cookies.')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            });
        }
        
        // Send initial processing message
        const processingEmbed = new MessageEmbed()
            .setColor(config.color.blue)
            .setTitle('Processing Spotify Cookies')
            .setDescription('Your file is being downloaded and processed. This might take a moment...')
            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTimestamp();
            
        const processingMessage = await message.channel.send({ embeds: [processingEmbed] });
        
        try {
            // Download the file
            const filePath = path.join(tempDir, attachment.name);
            await downloadFile(attachment.url, filePath);
            
            // Update the processing message with status
            await processingMessage.edit({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.blue)
                        .setTitle('Processing Spotify Cookies')
                        .setDescription('File downloaded successfully. Starting cookie check process...')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            });
            
            // Run the Python script to check cookies with a timeout
            console.log(`Starting Python process to check: ${filePath} with ${threadCount} threads`);
            const scriptPath = path.join(__dirname, '../../spotify_cookie_checker.py');
            const pythonProcess = spawn('/nix/store/wqhkxzzlaswkj3gimqign99sshvllcg6-python-wrapped-0.1.0/bin/python', 
                [scriptPath, filePath, '--threads', threadCount.toString()]);
            
            // Add a timeout to prevent hanging
            const timeoutMs = 300000; // 5 minutes
            const timeout = setTimeout(() => {
                console.log('Python process timed out - killing process');
                pythonProcess.kill();
                
                processingMessage.edit({
                    embeds: [
                        new MessageEmbed()
                            .setColor(config.color.red)
                            .setTitle('Processing Timeout')
                            .setDescription('The cookie checking process took too long and was terminated. The file may be too large or contain too many nested archives.')
                            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                            .setTimestamp()
                    ]
                });
            }, timeoutMs);
            
            let stdoutData = '';
            let stderrData = '';
            
            const startTime = Date.now();  // Track processing time
            
            pythonProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdoutData += output;
                console.log(`[Spotify Checker] ${output.trim()}`);
                
                // Try to update the message with progress information
                try {
                    const lines = output.split('\n');
                    for (const line of lines) {
                        if (line.includes('Progress:') || line.includes('SPOTIFY PROGRESS REPORT')) {
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
                            
                            // Extract current progress
                            const progressMatch = line.match(/Progress: (\d+)\/(\d+)/) || line.match(/Processed: (\d+)\/(\d+)/) || stdoutData.match(/Checked: (\d+) cookies/);
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
                            
                            processingMessage.edit({ embeds: [embed] }).catch(error => 
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
            
            pythonProcess.on('close', async (code) => {
                console.log(`Python process exited with code ${code}`);
                
                // Clear the timeout
                clearTimeout(timeout);
                
                // Clean up all temporary files and directories
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`Removed temporary file: ${filePath}`);
                }
                
                // Clean cookies and working_cookies directories to save space
                const cookiesDir = path.join(__dirname, '../../cookies');
                const workingCookiesDir = path.join(__dirname, '../../working_cookies');
                
                // Function to recursively remove directories
                const cleanupDirectory = (dirPath) => {
                    if (fs.existsSync(dirPath)) {
                        try {
                            const items = fs.readdirSync(dirPath);
                            
                            // Process all files and subdirectories
                            for (const item of items) {
                                const itemPath = path.join(dirPath, item);
                                const stats = fs.statSync(itemPath);
                                
                                if (stats.isDirectory()) {
                                    // Recursively clean subdirectories
                                    cleanupDirectory(itemPath);
                                    // Remove the empty directory
                                    fs.rmdirSync(itemPath);
                                    console.log(`Removed directory: ${itemPath}`);
                                } else {
                                    // Remove files
                                    fs.unlinkSync(itemPath);
                                    console.log(`Removed file: ${itemPath}`);
                                }
                            }
                        } catch (error) {
                            console.error(`Error cleaning directory ${dirPath}: ${error.message}`);
                        }
                    }
                };
                
                // Clean both directories but maintain the root folders
                try {
                    const cleanCookiesDir = () => {
                        if (fs.existsSync(cookiesDir)) {
                            const items = fs.readdirSync(cookiesDir);
                            for (const item of items) {
                                const itemPath = path.join(cookiesDir, item);
                                if (fs.statSync(itemPath).isDirectory()) {
                                    cleanupDirectory(itemPath);
                                    fs.rmdirSync(itemPath);
                                } else {
                                    fs.unlinkSync(itemPath);
                                }
                            }
                        }
                    };
                    
                    const cleanWorkingCookiesDir = () => {
                        if (fs.existsSync(workingCookiesDir)) {
                            const items = fs.readdirSync(workingCookiesDir);
                            for (const item of items) {
                                const itemPath = path.join(workingCookiesDir, item);
                                if (fs.statSync(itemPath).isDirectory()) {
                                    cleanupDirectory(itemPath);
                                    fs.rmdirSync(itemPath);
                                } else {
                                    fs.unlinkSync(itemPath);
                                }
                            }
                        }
                    };
                    
                    // Clean directories if valid results exist
                    if (code === 0) {
                        cleanCookiesDir();
                        cleanWorkingCookiesDir();
                        console.log("Cleaned up all temporary cookie directories");
                    }
                } catch (error) {
                    console.error(`Error during cleanup: ${error.message}`);
                }
                
                if (code !== 0) {
                    // Script failed
                    await processingMessage.edit({
                        embeds: [
                            new MessageEmbed()
                                .setColor(config.color.red)
                                .setTitle('Error Processing Cookies')
                                .setDescription(`The cookie checker encountered an error:\n\`\`\`${stderrData}\`\`\``)
                                .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                .setTimestamp()
                        ]
                    });
                    return;
                }
                
                // Read the results
                const resultsPath = path.join(__dirname, '../../cookie_check_results.json');
                if (!fs.existsSync(resultsPath)) {
                    await processingMessage.edit({
                        embeds: [
                            new MessageEmbed()
                                .setColor(config.color.red)
                                .setTitle('Results Not Found')
                                .setDescription('The cookie checker did not generate any results.')
                                .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                .setTimestamp()
                        ]
                    });
                    return;
                }
                
                const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
                
                // Check for duplicate cookies
                const duplicatesFound = [];
                const spotifyDir = path.join(__dirname, '../../spotify');
                const uniqueIdentifiers = new Set();
                
                if (fs.existsSync(spotifyDir) && results.valid > 0) {
                    // Create a map of existing cookies by ID/email
                    const existingFiles = fs.readdirSync(spotifyDir);
                    
                    existingFiles.forEach(file => {
                        if (file === '.gitkeep' || file.startsWith('.')) return;
                        
                        const filePath = path.join(spotifyDir, file);
                        if (fs.statSync(filePath).isDirectory()) return;
                        
                        try {
                            const content = fs.readFileSync(filePath, 'utf8');
                            
                            // Extract email or username from file name or content
                            let identifier = '';
                            
                            // Try to extract from file name first
                            if (file.includes('@')) {
                                identifier = file.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] || '';
                            } 
                            
                            // If not found in filename, try content
                            if (!identifier) {
                                identifier = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] || '';
                            }
                            
                            // If still not found, use a hash of the content
                            if (!identifier) {
                                const hash = require('crypto').createHash('md5').update(content).digest('hex');
                                identifier = hash;
                            }
                            
                            uniqueIdentifiers.add(identifier);
                        } catch (err) {
                            console.error(`Error processing file ${file}:`, err);
                        }
                    });
                    
                    // Now check new cookies for duplicates
                    let duplicateCount = 0;
                    
                    for (const cookiePath of results.valid_cookies) {
                        if (fs.existsSync(cookiePath)) {
                            try {
                                const content = fs.readFileSync(cookiePath, 'utf8');
                                const fileName = path.basename(cookiePath);
                                
                                // Extract identifier
                                let identifier = '';
                                
                                // Try to extract from file name first
                                if (fileName.includes('@')) {
                                    identifier = fileName.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] || '';
                                } 
                                
                                // If not found in filename, try content
                                if (!identifier) {
                                    identifier = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] || '';
                                }
                                
                                // If still not found, use a hash of the content
                                if (!identifier) {
                                    const hash = require('crypto').createHash('md5').update(content).digest('hex');
                                    identifier = hash;
                                }
                                
                                if (uniqueIdentifiers.has(identifier)) {
                                    duplicateCount++;
                                    duplicatesFound.push(fileName);
                                }
                            } catch (err) {
                                console.error(`Error checking for duplicates in ${cookiePath}:`, err);
                            }
                        }
                    }
                    
                    // Add duplicate info to results
                    results.duplicates = duplicateCount;
                }
                
                // Create results embed
                const resultsEmbed = new MessageEmbed()
                    .setColor(config.color.green)
                    .setTitle('Spotify Cookie Check Results')
                    .setDescription(`Results for file: \`${attachment.name}\``)
                    .addField('Summary', 
                        `Total Checked: ${results.total_checked}\n` +
                        `Valid Accounts: ${results.valid}\n` +
                        `Invalid Accounts: ${results.invalid}\n` +
                        `Errors: ${results.errors}\n` +
                        `Duplicates Found: ${results.duplicates || 0}\n` +
                        `Files Processed: ${results.files_processed}\n` +
                        `Archives Processed: ${results.archives_processed}`
                    )
                    .addField('Account Types', 
                        `Premium: ${results.premium}\n` +
                        `Family: ${results.family}\n` +
                        `Duo: ${results.duo}\n` +
                        `Student: ${results.student}\n` +
                        `Free: ${results.free}\n` +
                        `Unknown: ${results.unknown}`
                    )
                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                    .setTimestamp();
                
                await processingMessage.edit({ embeds: [resultsEmbed] });
                
                // If we have valid cookies, send them as attachments
                if (results.valid > 0 && results.valid_cookies.length > 0) {
                    // Create a zip file of all valid cookies
                    const archiver = require('archiver');
                    const zipPath = path.join(tempDir, `spotify_valid_cookies_${Date.now()}.zip`);
                    const output = fs.createWriteStream(zipPath);
                    const archive = archiver('zip', { zlib: { level: 9 } });
                    
                    output.on('close', async () => {
                        // Send the zip file
                        try {
                            const attachment = new MessageAttachment(zipPath, 'valid_spotify_cookies.zip');
                            await message.channel.send({ 
                                content: `Valid cookies (${results.valid}) from ${attachment.name}:`,
                                files: [attachment] 
                            });
                            
                            // Clean up
                            if (fs.existsSync(zipPath)) {
                                fs.unlinkSync(zipPath);
                            }
                        } catch (err) {
                            console.error('Error sending valid cookies:', err);
                            await message.channel.send({
                                embeds: [
                                    new MessageEmbed()
                                        .setColor(config.color.red)
                                        .setTitle('Error Sending Cookies')
                                        .setDescription('Found valid cookies but couldn\'t send them due to an error.')
                                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                                        .setTimestamp()
                                ]
                            });
                        }
                    });
                    
                    archive.on('error', (err) => {
                        console.error('Error creating archive:', err);
                    });
                    
                    archive.pipe(output);
                    
                    // Add each valid cookie file to the archive
                    for (const cookiePath of results.valid_cookies) {
                        if (fs.existsSync(cookiePath)) {
                            const fileName = path.basename(cookiePath);
                            const folderName = path.basename(path.dirname(cookiePath));
                            archive.file(cookiePath, { name: `${folderName}/${fileName}` });
                        }
                    }
                    
                    archive.finalize();
                }
                
                // Log the check
                if (config.logsChannelId) {
                    const logsChannel = message.guild.channels.cache.get(config.logsChannelId);
                    if (logsChannel) {
                        logsChannel.send({
                            embeds: [
                                new MessageEmbed()
                                    .setColor(config.color.blue)
                                    .setTitle('Spotify Cookie Check')
                                    .setDescription(
                                        `User: ${message.author.tag} (${message.author.id})\n` +
                                        `File: ${attachment.name}\n` +
                                        `Valid: ${results.valid}\n` +
                                        `Premium: ${results.premium}, Family: ${results.family}, Duo: ${results.duo}\n` +
                                        `Student: ${results.student}, Free: ${results.free}, Unknown: ${results.unknown}\n` +
                                        `Files Processed: ${results.files_processed}, Archives Processed: ${results.archives_processed}`
                                    )
                                    .setTimestamp()
                            ]
                        });
                    }
                }
            });
        } catch (error) {
            console.error('Error in Spotify cookie check:', error);
            await processingMessage.edit({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Error')
                        .setDescription(`An error occurred during processing: ${error.message}`)
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            });
        }
    }
};

// Helper function to download a file
function downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
        const file = createWriteStream(filePath);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(filePath, () => {}); // Delete the file if there's an error
            reject(err);
        });
    });
}