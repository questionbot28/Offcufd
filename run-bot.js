// This script runs the Discord bot directly

// Change directory to the bot directory and run the bot
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the bot directory
const botPath = path.join(__dirname, 'bot', 'DiscordUnzipper-1');

// Command to run the bot
const botProcess = spawn('node', ['index.js'], {
  cwd: botPath,
  stdio: 'inherit',
  env: { ...process.env }
});

// Log when the process exits
botProcess.on('exit', (code) => {
  console.log(`Bot process exited with code ${code}`);
});

// Handle errors
botProcess.on('error', (err) => {
  console.error('Failed to start bot process:', err);
});