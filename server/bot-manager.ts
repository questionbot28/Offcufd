import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createReadStream } from 'fs';
import * as unzipper from 'unzipper';
import { storage } from './storage';
import { type BotDeployment, type UpdateBotDeployment } from '@shared/schema';

// Store running bot processes
const runningBots = new Map<number, ChildProcess>();

export async function createTempDir(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-bot-'));
  return tempDir;
}

// Update deployment with logs
async function appendLog(deploymentId: number, log: string): Promise<void> {
  const deployment = await storage.getBotDeployment(deploymentId);
  if (!deployment) return;
  
  const update: UpdateBotDeployment = {
    logs: deployment.logs + log + '\n',
  };
  
  await storage.updateBotDeployment(deploymentId, update);
}

export async function extractZip(zipPath: string, deploymentId: number): Promise<string> {
  try {
    const extractPath = await createTempDir();
    await appendLog(deploymentId, `Extracting ZIP file to ${extractPath}...`);
    
    return new Promise((resolve, reject) => {
      createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: extractPath }))
        .on('close', () => {
          appendLog(deploymentId, 'Extraction complete.');
          resolve(extractPath);
        })
        .on('error', (err) => {
          appendLog(deploymentId, `Extraction error: ${err.message}`);
          reject(err);
        });
    });
  } catch (error: any) {
    await appendLog(deploymentId, `Extraction error: ${error.message}`);
    throw error;
  }
}

async function findMainFile(extractPath: string): Promise<string | null> {
  // Check for index.js in the root
  if (await fileExists(path.join(extractPath, 'index.js'))) {
    return path.join(extractPath, 'index.js');
  }
  
  // Look for package.json to find main file
  if (await fileExists(path.join(extractPath, 'package.json'))) {
    const packageJsonPath = path.join(extractPath, 'package.json');
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent);
    
    if (packageJson.main && await fileExists(path.join(extractPath, packageJson.main))) {
      return path.join(extractPath, packageJson.main);
    }
  }
  
  // Check for any .js files in the root
  const files = await fs.readdir(extractPath);
  for (const file of files) {
    if (file.endsWith('.js')) {
      return path.join(extractPath, file);
    }
  }
  
  // Check subdirectories for index.js or any js file
  const dirs = await fs.readdir(extractPath, { withFileTypes: true });
  for (const dir of dirs) {
    if (dir.isDirectory()) {
      const dirPath = path.join(extractPath, dir.name);
      // Check for index.js in the directory
      if (await fileExists(path.join(dirPath, 'index.js'))) {
        return path.join(dirPath, 'index.js');
      }
      
      // Check for package.json in the directory
      if (await fileExists(path.join(dirPath, 'package.json'))) {
        const packageJsonPath = path.join(dirPath, 'package.json');
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageJsonContent);
        
        if (packageJson.main && await fileExists(path.join(dirPath, packageJson.main))) {
          return path.join(dirPath, packageJson.main);
        }
      }
      
      // Check for any .js files in the directory
      const dirFiles = await fs.readdir(dirPath);
      for (const file of dirFiles) {
        if (file.endsWith('.js')) {
          return path.join(dirPath, file);
        }
      }
    }
  }
  
  // No main file found
  return null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function installDependencies(extractPath: string, deploymentId: number): Promise<boolean> {
  try {
    // Look for package.json
    const packageJsonPath = path.join(extractPath, 'package.json');
    
    if (!await fileExists(packageJsonPath)) {
      // Check subdirectories for package.json
      const dirs = await fs.readdir(extractPath, { withFileTypes: true });
      for (const dir of dirs) {
        if (dir.isDirectory()) {
          const dirPackageJsonPath = path.join(extractPath, dir.name, 'package.json');
          if (await fileExists(dirPackageJsonPath)) {
            await appendLog(deploymentId, `Found package.json in subdirectory: ${dir.name}`);
            return installDependenciesInDir(path.join(extractPath, dir.name), deploymentId);
          }
        }
      }
      
      await appendLog(deploymentId, 'No package.json found. Skipping dependency installation.');
      return true;
    }
    
    return installDependenciesInDir(extractPath, deploymentId);
  } catch (error: any) {
    await appendLog(deploymentId, `Error installing dependencies: ${error.message}`);
    return false;
  }
}

async function installDependenciesInDir(dir: string, deploymentId: number): Promise<boolean> {
  return new Promise(async (resolve) => {
    await appendLog(deploymentId, `Installing dependencies in ${dir}...`);
    
    const npmInstall = spawn('npm', ['install'], { cwd: dir });
    
    npmInstall.stdout.on('data', async (data) => {
      await appendLog(deploymentId, data.toString());
    });
    
    npmInstall.stderr.on('data', async (data) => {
      await appendLog(deploymentId, data.toString());
    });
    
    npmInstall.on('close', async (code) => {
      if (code === 0) {
        await appendLog(deploymentId, 'Dependencies installed successfully.');
        resolve(true);
      } else {
        await appendLog(deploymentId, `npm install exited with code ${code}`);
        resolve(false);
      }
    });
  });
}

export async function startBot(extractPath: string, mainFile: string, deploymentId: number): Promise<number | null> {
  try {
    const mainFilePath = mainFile;
    const mainFileDir = path.dirname(mainFilePath);
    
    await appendLog(deploymentId, `Starting bot from ${mainFilePath}...`);
    
    const botProcess = spawn('node', [mainFilePath], { cwd: mainFileDir });
    const pid = botProcess.pid;
    
    if (!pid) {
      await appendLog(deploymentId, 'Failed to get process ID');
      return null;
    }
    
    runningBots.set(deploymentId, botProcess);
    
    botProcess.stdout.on('data', async (data) => {
      await appendLog(deploymentId, data.toString());
    });
    
    botProcess.stderr.on('data', async (data) => {
      await appendLog(deploymentId, data.toString());
    });
    
    botProcess.on('close', async (code) => {
      await appendLog(deploymentId, `Bot process exited with code ${code}`);
      runningBots.delete(deploymentId);
      
      await storage.updateBotDeployment(deploymentId, {
        isRunning: false,
        status: 'stopped',
      });
    });
    
    await storage.updateBotDeployment(deploymentId, {
      pid,
      isRunning: true,
      status: 'running',
    });
    
    return pid;
  } catch (error: any) {
    await appendLog(deploymentId, `Error starting bot: ${error.message}`);
    await storage.updateBotDeployment(deploymentId, {
      status: 'error',
      error: error.message,
    });
    return null;
  }
}

export async function stopBot(deploymentId: number): Promise<boolean> {
  const botProcess = runningBots.get(deploymentId);
  
  if (!botProcess) {
    return false;
  }
  
  try {
    botProcess.kill();
    runningBots.delete(deploymentId);
    
    await storage.updateBotDeployment(deploymentId, {
      isRunning: false,
      status: 'stopped',
    });
    
    return true;
  } catch (error) {
    return false;
  }
}

export async function deployBot(zipPath: string, deploymentId: number): Promise<void> {
  try {
    // Update status to extracting
    await storage.updateBotDeployment(deploymentId, {
      status: 'extracting',
    });
    
    // Extract the ZIP file
    const extractPath = await extractZip(zipPath, deploymentId);
    
    // Update status to installing
    await storage.updateBotDeployment(deploymentId, {
      status: 'installing',
    });
    
    // Install dependencies
    const installSuccess = await installDependencies(extractPath, deploymentId);
    
    if (!installSuccess) {
      await storage.updateBotDeployment(deploymentId, {
        status: 'error',
        error: 'Failed to install dependencies',
      });
      return;
    }
    
    // Update status to starting
    await storage.updateBotDeployment(deploymentId, {
      status: 'starting',
    });
    
    // Find the main file
    const mainFile = await findMainFile(extractPath);
    
    if (!mainFile) {
      await storage.updateBotDeployment(deploymentId, {
        status: 'error',
        error: 'Could not find main bot file',
      });
      return;
    }
    
    await storage.updateBotDeployment(deploymentId, {
      mainFile,
    });
    
    // Start the bot
    const pid = await startBot(extractPath, mainFile, deploymentId);
    
    if (!pid) {
      await storage.updateBotDeployment(deploymentId, {
        status: 'error',
        error: 'Failed to start bot',
      });
    }
  } catch (error: any) {
    await storage.updateBotDeployment(deploymentId, {
      status: 'error',
      error: error.message,
    });
  }
}
