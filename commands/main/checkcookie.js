// commands/main/checkcookie.js
const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const config = require('../../config.json');

module.exports = {
    name: 'checkcookie',
    description: 'Check all cookies and remove duplicates (Owner/Co-owner only)',
    usage: 'checkcookie',
    
    async execute(message) {
        // Check if user has permission (owner or co-owner only)
        const ownerRoleId = '1348251264336527416';
        const coownerRoleId = '1348251264336527414';
        
        const hasPermission = message.member.roles.cache.some(role => 
            role.name.toLowerCase() === 'owner' || 
            role.name.toLowerCase() === 'cowner' ||
            role.id === ownerRoleId || 
            role.id === coownerRoleId
        );
        
        if (!hasPermission) {
            return message.channel.send({
                embeds: [
                    new MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Permission Denied')
                        .setDescription('You must be an Owner or Co-owner to use this command.')
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            });
        }
        
        // Send initial message
        const statusMessage = await message.channel.send({
            embeds: [
                new MessageEmbed()
                    .setColor(config.color.blue)
                    .setTitle('Cookie Verification Process')
                    .setDescription('Starting cookie verification...\nThis may take some time depending on the number of cookies.')
                    .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                    .setTimestamp()
            ]
        });
        
        // Create function to update status message
        const updateStatus = async (title, description, color = config.color.blue) => {
            await statusMessage.edit({
                embeds: [
                    new MessageEmbed()
                        .setColor(color)
                        .setTitle(title)
                        .setDescription(description)
                        .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                        .setTimestamp()
                ]
            });
        };
        
        try {
            // First check Spotify cookies
            await updateStatus('Cookie Verification Process', 'Checking Spotify cookies...');
            
            // Run the Spotify cookie checker script
            const spotifyResults = await checkSpotifyCookies(updateStatus);
            
            // Next check Netflix cookies
            await updateStatus('Cookie Verification Process', 'Checking Netflix cookies...');
            
            // Run the Netflix cookie checker script
            const netflixResults = await checkNetflixCookies(updateStatus);
            
            // Combine results and send final status
            const totalResults = {
                spotify: spotifyResults,
                netflix: netflixResults
            };
            
            const finalEmbed = new MessageEmbed()
                .setColor(config.color.green)
                .setTitle('Cookie Verification Complete')
                .addField('Spotify Cookies', 
                    `Total: ${spotifyResults.total}\n` +
                    `Working: ${spotifyResults.working}\n` +
                    `Invalid: ${spotifyResults.invalid}\n` +
                    `Duplicates Removed: ${spotifyResults.duplicatesRemoved}\n` +
                    `Families: ${spotifyResults.families}\n` +
                    `Individual: ${spotifyResults.individual}\n` +
                    `Student: ${spotifyResults.student}`,
                    true
                )
                .addField('Netflix Cookies', 
                    `Total: ${netflixResults.total}\n` +
                    `Working: ${netflixResults.working}\n` +
                    `Invalid: ${netflixResults.invalid}\n` +
                    `Duplicates Removed: ${netflixResults.duplicatesRemoved}\n` +
                    `Premium: ${netflixResults.premium}\n` +
                    `Standard: ${netflixResults.standard}\n` +
                    `Basic: ${netflixResults.basic}`,
                    true
                )
                .addField('Performance Metrics', 
                    `Spotify: ${spotifyResults.speed} cookies/sec (${spotifyResults.elapsedTime}s)\n` +
                    `Netflix: ${netflixResults.speed} cookies/sec (${netflixResults.elapsedTime}s)`,
                    false
                )
                .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                .setTimestamp();
                
            await statusMessage.edit({ embeds: [finalEmbed] });
            
        } catch (error) {
            console.error('Error in checkcookie command:', error);
            await updateStatus('Error', `An error occurred during cookie verification:\n${error.message}`, config.color.red);
        }
    }
};

// Function to check Spotify cookies
async function checkSpotifyCookies(updateStatus) {
    return new Promise((resolve, reject) => {
        const results = {
            total: 0,
            working: 0,
            invalid: 0,
            duplicatesRemoved: 0,
            families: 0,
            individual: 0,
            student: 0
        };

        // Get a list of all Spotify cookie files
        const spotifyDir = path.join(__dirname, '../../spotify');
        
        if (!fs.existsSync(spotifyDir)) {
            resolve(results);
            return;
        }
        
        const files = fs.readdirSync(spotifyDir);
        results.total = files.length;
        
        // Create a set to track unique cookies by email/username
        const uniqueCookies = new Set();
        const duplicateFiles = [];
        
        // First pass: identify duplicates
        files.forEach(file => {
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
                
                // Check if we've seen this cookie before
                if (uniqueCookies.has(identifier)) {
                    duplicateFiles.push(filePath);
                    results.duplicatesRemoved++;
                } else {
                    uniqueCookies.add(identifier);
                    
                    // Count by type
                    if (file.includes('Family')) {
                        results.families++;
                    } else if (file.includes('Student')) {
                        results.student++;
                    } else {
                        results.individual++;
                    }
                    
                    // All non-duplicate cookies are considered valid for now
                    results.working++;
                }
            } catch (err) {
                console.error(`Error processing file ${file}:`, err);
                results.invalid++;
            }
        });
        
        // Remove duplicate files
        duplicateFiles.forEach(file => {
            try {
                fs.unlinkSync(file);
                console.log(`Removed duplicate Spotify cookie: ${file}`);
            } catch (err) {
                console.error(`Error removing duplicate file ${file}:`, err);
            }
        });
        
        // Now run the actual checker script to validate working cookies
        updateStatus('Cookie Verification Process', `Removed ${results.duplicatesRemoved} duplicate Spotify cookies.\nNow validating remaining cookies...`);
        
        // Start timing for performance metrics
        const startTime = Date.now();
        
        // Set up a status update interval while the Python script runs
        let stdout = '';
        const statusUpdateInterval = setInterval(async () => {
            // Try to read progress from logs or temp file
            try {
                const logLines = stdout.split('\n');
                const progressLine = logLines.reverse().find(line => line.includes('Progress:'));
                if (progressLine) {
                    const elapsedSecs = ((Date.now() - startTime) / 1000).toFixed(2);
                    const speedMatch = progressLine.match(/Speed: ([\d.]+) cookies\/sec/);
                    const speed = speedMatch ? speedMatch[1] : '0.00';
                    const validMatch = progressLine.match(/Valid: (\d+)/);
                    const valid = validMatch ? validMatch[1] : '0';
                    
                    const progressDescription = [
                        `${progressLine}`,
                        `Elapsed time: ${elapsedSecs}s`,
                        `Performance: ${speed} cookies/sec`
                    ].join('\n');
                    
                    await updateStatus('Spotify Cookie Validation Progress', progressDescription);
                }
            } catch (e) {
                // Ignore errors in status updates
                console.error('Error updating status:', e);
            }
        }, 500); // Update every 500ms
        
        const scriptPath = path.join(__dirname, '../../spotify_cookie_checker.py');
        // Use improved script with thread count for better performance
        const threadCount = Math.min(1000, Math.max(200, Math.floor(results.total / 2)));
        const childProcess = exec(`python3 ${scriptPath} --all_cookies --threads ${threadCount}`);
        
        // Capture stdout in real-time
        childProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        childProcess.on('close', async (code, signal) => {
            // Clear the status update interval
            clearInterval(statusUpdateInterval);
            
            const error = code !== 0;
            const stderr = '';
            
            // Calculate performance metrics
            const endTime = Date.now();
            const elapsedSeconds = (endTime - startTime) / 1000;
            results.elapsedTime = elapsedSeconds.toFixed(2);
            results.speed = (results.total / elapsedSeconds).toFixed(2);
            
            if (error) {
                console.error(`Error running Spotify cookie checker: ${error}`);
                if (stderr) console.error(`stderr: ${stderr}`);
                
                // Still return the basic results even if the validation fails
                resolve(results);
                return;
            }
            
            // Try to parse more accurate results from the script output
            try {
                const outputLines = stdout.split('\n');
                let validCount = 0;
                let invalidCount = 0;
                
                outputLines.forEach(line => {
                    if (line.includes('✔ Login successful')) {
                        validCount++;
                    } else if (line.includes('✘ Login failed')) {
                        invalidCount++;
                    }
                });
                
                // Update our results with more accurate counts if available
                if (validCount > 0 || invalidCount > 0) {
                    results.working = validCount;
                    results.invalid = invalidCount;
                }
            } catch (parseErr) {
                console.error('Error parsing Spotify checker output:', parseErr);
            }
            
            resolve(results);
        });
    });
}

// Function to check Netflix cookies
async function checkNetflixCookies(updateStatus) {
    return new Promise((resolve, reject) => {
        const results = {
            total: 0,
            working: 0,
            invalid: 0,
            duplicatesRemoved: 0,
            premium: 0,
            standard: 0,
            basic: 0
        };

        // Get a list of all Netflix cookie files
        const netflixDir = path.join(__dirname, '../../netflix');
        
        if (!fs.existsSync(netflixDir)) {
            resolve(results);
            return;
        }
        
        const files = fs.readdirSync(netflixDir).filter(file => 
            !file.startsWith('.') && 
            !fs.statSync(path.join(netflixDir, file)).isDirectory()
        );
        
        results.total = files.length;
        
        // Create a set to track unique cookies by profile ID or content hash
        const uniqueCookies = new Set();
        const duplicateFiles = [];
        
        // First pass: identify duplicates
        files.forEach(file => {
            if (file === '.gitkeep' || file.startsWith('.')) return;
            
            const filePath = path.join(netflixDir, file);
            if (fs.statSync(filePath).isDirectory()) return;
            
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                
                // Extract Netflix profile ID or use content hash
                let identifier = '';
                
                // Try to extract Netflix profile ID
                const profileMatch = content.match(/NetflixId=([a-f0-9-]+)/i);
                if (profileMatch && profileMatch[1]) {
                    identifier = profileMatch[1];
                } else {
                    // Use a hash of the content as identifier
                    const hash = require('crypto').createHash('md5').update(content).digest('hex');
                    identifier = hash;
                }
                
                // Check if we've seen this cookie before
                if (uniqueCookies.has(identifier)) {
                    duplicateFiles.push(filePath);
                    results.duplicatesRemoved++;
                } else {
                    uniqueCookies.add(identifier);
                    
                    // Count by type (approximation based on filename)
                    if (file.includes('Premium')) {
                        results.premium++;
                    } else if (file.includes('Standard')) {
                        results.standard++;
                    } else {
                        results.basic++;
                    }
                    
                    // All non-duplicate cookies are considered valid for now
                    results.working++;
                }
            } catch (err) {
                console.error(`Error processing file ${file}:`, err);
                results.invalid++;
            }
        });
        
        // Remove duplicate files
        duplicateFiles.forEach(file => {
            try {
                fs.unlinkSync(file);
                console.log(`Removed duplicate Netflix cookie: ${file}`);
            } catch (err) {
                console.error(`Error removing duplicate file ${file}:`, err);
            }
        });
        
        // Now run the actual checker script to validate working cookies
        updateStatus('Cookie Verification Process', `Removed ${results.duplicatesRemoved} duplicate Netflix cookies.\nNow validating remaining cookies...`);
        
        // Start timing for performance metrics
        const startTime = Date.now();
        
        // Set up a status update interval while the Python script runs
        let stdout = '';
        const statusUpdateInterval = setInterval(async () => {
            // Try to read progress from logs or temp file
            try {
                const logLines = stdout.split('\n');
                const progressLine = logLines.reverse().find(line => line.includes('Progress:'));
                if (progressLine) {
                    const elapsedSecs = ((Date.now() - startTime) / 1000).toFixed(2);
                    const speedMatch = progressLine.match(/Speed: ([\d.]+) cookies\/sec/);
                    const speed = speedMatch ? speedMatch[1] : '0.00';
                    const validMatch = progressLine.match(/Valid: (\d+)/);
                    const valid = validMatch ? validMatch[1] : '0';
                    
                    const progressDescription = [
                        `${progressLine}`,
                        `Elapsed time: ${elapsedSecs}s`, 
                        `Performance: ${speed} cookies/sec`
                    ].join('\n');
                    
                    await updateStatus('Netflix Cookie Validation Progress', progressDescription);
                }
            } catch (e) {
                // Ignore errors in status updates
                console.error('Error updating status:', e);
            }
        }, 500); // Update every 500ms
        
        const scriptPath = path.join(__dirname, '../../netflix_cookie_checker.py');
        // Use improved script with thread count for better performance
        const threadCount = Math.min(1000, Math.max(200, Math.floor(results.total / 2)));
        const childProcess = exec(`python3 ${scriptPath} --all_cookies --threads ${threadCount}`);
        
        // Capture stdout in real-time
        childProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        childProcess.on('close', async (code, signal) => {
            // Clear the status update interval
            clearInterval(statusUpdateInterval);
            
            const error = code !== 0;
            const stderr = '';
            
            // Calculate performance metrics
            const endTime = Date.now();
            const elapsedSeconds = (endTime - startTime) / 1000;
            results.elapsedTime = elapsedSeconds.toFixed(2);
            results.speed = (results.total / elapsedSeconds).toFixed(2);
            
            if (error) {
                console.error(`Error running Netflix cookie checker: ${error}`);
                if (stderr) console.error(`stderr: ${stderr}`);
                
                // Still return the basic results even if the validation fails
                resolve(results);
                return;
            }
            
            // Try to parse more accurate results from the script output
            try {
                const outputLines = stdout.split('\n');
                let validCount = 0;
                let invalidCount = 0;
                
                outputLines.forEach(line => {
                    if (line.includes('✔ Login successful')) {
                        validCount++;
                    } else if (line.includes('✘ Login failed')) {
                        invalidCount++;
                    }
                });
                
                // Update our results with more accurate counts if available
                if (validCount > 0 || invalidCount > 0) {
                    results.working = validCount;
                    results.invalid = invalidCount;
                }
            } catch (parseErr) {
                console.error('Error parsing Netflix checker output:', parseErr);
            }
            
            resolve(results);
        });
    });
}