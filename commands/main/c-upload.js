const fs = require('fs').promises;
const fetch = require('node-fetch/lib/index.js');
const config = require('../../config.json');
// ... (existing imports)

module.exports = {
    name: 'c-upload',
    description: 'Cookie restock',
usage: 'c-upload <netflix/spotify> {.zip attachment}',

    execute: async (message, usedPrefix, args) => {
        // Create the temp directory if it doesn't exist
        const tempDir = './temp';

        try {
            await fs.access(tempDir); // Use fs.promises.access
        } catch (err) {
            // Handle error or create the directory
            if (err.code === 'ENOENT') {
                await fs.mkdir(tempDir);
            } else {
                console.error('Error accessing temp directory:', err.message);
                return message.reply('An error occurred while accessing the temp directory.');
            }
        }

        // Check if the user has the restock role
        const restockRoleId = config.restockroleid;
        if (!message.member.roles.cache.has(restockRoleId)) {
            return message.reply('You do not have the necessary permissions to use this command.');
        }

        // Check if a zip file is attached
        if (message.attachments.size !== 1 || !message.attachments.first().name.endsWith('.zip')) {
            return message.reply('Please attach a single .zip file.');
        }

        // Get the attached zip file
        const attachment = message.attachments.first();
        const zipFilePath = `${tempDir}/${attachment.name}`;

        // Extract target folder from the message content
        const targetFolderOption = message.content.toLowerCase().split(' ')[1];

        // Check if the target folder is valid
        if (!['netflix', 'spotify'].includes(targetFolderOption)) {
            return message.reply('Invalid target folder. Please specify either "netflix" or "spotify".');
        }

        try {
            // Download the zip file
            const response = await fetch(attachment.url);
            const buffer = await response.buffer();

            // Save the buffer to the file
            await fs.writeFile(zipFilePath, buffer);

            // Extract and copy text files to the target folder
            await extractAndCopyTextFiles(zipFilePath, targetFolderOption);

            message.reply(`Text files from the zip have been copied to the ${targetFolderOption} folder successfully.`);
        } catch (error) {
            console.error(error);
            message.reply('An error occurred while processing the zip file.');
        } finally {
            // Remove the temporary zip file
            await fs.unlink(zipFilePath);
        }
    },
};

// ... (existing functions)

async function extractAndCopyTextFiles(zipFilePath, targetFolder) {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipFilePath);

    // Iterate over each entry in the zip file
    zip.getEntries().forEach(async (entry) => {
        // Check if the entry is a file (not a directory) and has a .txt extension
        if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.txt')) {
            // Read the content of the text file
            const textContent = zip.readAsText(entry);

            // Write the text content to the target folder with its entry name
            const entryName = entry.entryName.split('/').pop(); // Get the entry name without any directory structure
            const targetFilePath = `./${targetFolder}/${entryName}`;
            await fs.writeFile(targetFilePath, textContent);
        }
    });
}
