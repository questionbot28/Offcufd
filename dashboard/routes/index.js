/**
 * Main route handler for Discord Bot Admin Dashboard
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const passport = require('passport');
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');

// Home/index route - redirect to dashboard if authenticated, login if not
router.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

// Login page
router.get('/login', (req, res) => {
  // If already logged in, redirect to dashboard
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  
  res.render('login', {
    success_msg: req.flash('success_msg'),
    error_msg: req.flash('error_msg'),
    error: req.flash('error')
  });
});

// Login form submission
router.post('/login', (req, res, next) => {
  passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/login',
    failureFlash: true
  })(req, res, next);
});

// Logout
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Error during logout:', err);
      return next(err);
    }
    req.flash('success_msg', 'You are logged out');
    res.redirect('/login');
  });
});

// Dashboard
router.get('/dashboard', ensureAuthenticated, (req, res) => {
  try {
    // Get bot status
    const botStatus = req.app.get('client').ws.status === 0 ? 'Online' : 'Offline';
    const botPing = Math.round(req.app.get('client').ws.ping);
    const client = req.app.get('client');
    
    // Count total accounts
    let totalAccounts = 0;
    const stockFolders = ['basicstock', 'bstock', 'extreme', 'fstock'];
    
    for (const folder of stockFolders) {
      if (fs.existsSync(folder)) {
        const files = fs.readdirSync(folder);
        
        for (const file of files) {
          if (file.endsWith('.txt')) {
            const filePath = path.join(folder, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const accounts = content.split('\n').filter(line => line.trim() !== '');
            totalAccounts += accounts.length;
          }
        }
      }
    }
    
    res.render('dashboard', {
      title: 'Dashboard',
      user: req.user,
      botStatus,
      botPing,
      totalAccounts,
      client,
      activeRoute: '/dashboard'
    });
  } catch (err) {
    console.error('Error rendering dashboard:', err);
    req.flash('error_msg', 'An error occurred while loading the dashboard');
    res.redirect('/');
  }
});

// Stock management
router.get('/stock', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const stockData = {};
    const stockFolders = ['basicstock', 'bstock', 'extreme', 'fstock'];
    
    for (const folder of stockFolders) {
      if (fs.existsSync(folder)) {
        const files = fs.readdirSync(folder);
        stockData[folder] = [];
        
        for (const file of files) {
          if (file.endsWith('.txt')) {
            const filePath = path.join(folder, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const accounts = content.split('\n').filter(line => line.trim() !== '');
            
            stockData[folder].push({
              name: file,
              count: accounts.length
            });
          }
        }
      }
    }
    
    res.render('stock', {
      title: 'Stock Management',
      user: req.user,
      stockData,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg'),
      activeRoute: '/stock'
    });
  } catch (err) {
    console.error('Error rendering stock page:', err);
    req.flash('error_msg', 'An error occurred while loading the stock page');
    res.redirect('/dashboard');
  }
});

// View specific stock file
router.get('/stock/:folder/:file', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { folder, file } = req.params;
    const filePath = path.join(folder, file);
    
    if (!fs.existsSync(filePath)) {
      req.flash('error_msg', 'File not found');
      return res.redirect('/stock');
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const accounts = content.split('\n')
      .filter(line => line.trim() !== '')
      .map(line => line.trim());
    
    res.render('view-accounts', {
      title: `${file} Accounts`,
      folder,
      file,
      accounts,
      accountCount: accounts.length,
      user: req.user,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg'),
      activeRoute: '/stock'
    });
  } catch (err) {
    console.error('Error viewing accounts:', err);
    req.flash('error_msg', 'An error occurred while loading the accounts');
    res.redirect('/stock');
  }
});

// Download stock file
router.get('/stock/:folder/:file/download', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { folder, file } = req.params;
    const filePath = path.join(folder, file);
    
    if (!fs.existsSync(filePath)) {
      req.flash('error_msg', 'File not found');
      return res.redirect('/stock');
    }
    
    res.download(filePath);
  } catch (err) {
    console.error('Error downloading file:', err);
    req.flash('error_msg', 'An error occurred while downloading the file');
    res.redirect('/stock');
  }
});

// Add accounts to a stock file
router.post('/stock/:folder/:file/add', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { folder, file } = req.params;
    const { accounts } = req.body;
    const filePath = path.join(folder, file);
    
    if (!fs.existsSync(filePath)) {
      req.flash('error_msg', 'File not found');
      return res.redirect('/stock');
    }
    
    if (!accounts || accounts.trim() === '') {
      req.flash('error_msg', 'No accounts provided');
      return res.redirect(`/stock/${folder}/${file}`);
    }
    
    // Append accounts to the file
    const newAccounts = accounts.split('\n')
      .filter(line => line.trim() !== '')
      .map(line => line.trim())
      .join('\n');
    
    const currentContent = fs.readFileSync(filePath, 'utf8');
    const updatedContent = currentContent.trim() + (currentContent.trim() ? '\n' : '') + newAccounts + '\n';
    fs.writeFileSync(filePath, updatedContent);
    
    req.flash('success_msg', 'Accounts added successfully');
    res.redirect(`/stock/${folder}/${file}`);
  } catch (err) {
    console.error('Error adding accounts:', err);
    req.flash('error_msg', 'An error occurred while adding accounts');
    res.redirect('/stock');
  }
});

// Remove specific account from file
router.post('/stock/:folder/:file/remove', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { folder, file } = req.params;
    const { account } = req.body;
    
    // Validate folder and file
    const allowedFolders = ['basicstock', 'bstock', 'extreme', 'fstock'];
    if (!allowedFolders.includes(folder)) {
      req.flash('error_msg', 'Invalid folder');
      return res.redirect('/stock');
    }
    
    const filePath = path.join(folder, file);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      req.flash('error_msg', 'File not found');
      return res.redirect('/stock');
    }
    
    // Read current content
    let content = fs.readFileSync(filePath, 'utf8');
    const accounts = content.split('\n').filter(line => line.trim() !== '');
    
    // Remove account
    const updatedAccounts = accounts.filter(acc => acc !== account);
    
    // Write back to file
    fs.writeFileSync(filePath, updatedAccounts.join('\n') + (updatedAccounts.length > 0 ? '\n' : ''));
    
    req.flash('success_msg', 'Account removed successfully');
    res.redirect(`/stock/${folder}/${file}`);
  } catch (error) {
    console.error('Error removing account:', error);
    req.flash('error_msg', 'An error occurred while removing the account');
    res.redirect(`/stock/${req.params.folder}/${req.params.file}`);
  }
});

// Clear all accounts from file
router.post('/stock/:folder/:file/clear', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { folder, file } = req.params;
    
    // Validate folder and file
    const allowedFolders = ['basicstock', 'bstock', 'extreme', 'fstock'];
    if (!allowedFolders.includes(folder)) {
      req.flash('error_msg', 'Invalid folder');
      return res.redirect('/stock');
    }
    
    const filePath = path.join(folder, file);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      req.flash('error_msg', 'File not found');
      return res.redirect('/stock');
    }
    
    // Clear file
    fs.writeFileSync(filePath, '');
    
    req.flash('success_msg', 'All accounts cleared successfully');
    res.redirect(`/stock/${folder}/${file}`);
  } catch (error) {
    console.error('Error clearing accounts:', error);
    req.flash('error_msg', 'An error occurred while clearing the accounts');
    res.redirect(`/stock/${req.params.folder}/${req.params.file}`);
  }
});

// Create a new stock file
router.post('/stock/:folder/create', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { folder } = req.params;
    const { filename } = req.body;
    
    // Validate folder
    const allowedFolders = ['basicstock', 'bstock', 'extreme', 'fstock'];
    if (!allowedFolders.includes(folder)) {
      req.flash('error_msg', 'Invalid folder');
      return res.redirect('/stock');
    }
    
    if (!filename || filename.trim() === '') {
      req.flash('error_msg', 'No filename provided');
      return res.redirect('/stock');
    }
    
    // Validate filename (only allow alphanumeric, underscore, and hyphen)
    if (!/^[a-zA-Z0-9_-]+$/.test(filename)) {
      req.flash('error_msg', 'Invalid filename. Only letters, numbers, underscores, and hyphens are allowed');
      return res.redirect('/stock');
    }
    
    const filePath = path.join(folder, filename + '.txt');
    
    if (fs.existsSync(filePath)) {
      req.flash('error_msg', 'File already exists');
      return res.redirect('/stock');
    }
    
    // Create an empty file
    fs.writeFileSync(filePath, '');
    
    req.flash('success_msg', 'Stock file created successfully');
    res.redirect('/stock');
  } catch (err) {
    console.error('Error creating stock file:', err);
    req.flash('error_msg', 'An error occurred while creating the stock file');
    res.redirect('/stock');
  }
});

// Delete a stock file
router.post('/stock/:folder/:file', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { folder, file } = req.params;
    
    // Validate folder
    const allowedFolders = ['basicstock', 'bstock', 'extreme', 'fstock'];
    if (!allowedFolders.includes(folder)) {
      req.flash('error_msg', 'Invalid folder');
      return res.redirect('/stock');
    }
    
    const filePath = path.join(folder, file);
    
    if (!fs.existsSync(filePath)) {
      req.flash('error_msg', 'File not found');
      return res.redirect('/stock');
    }
    
    fs.unlinkSync(filePath);
    
    req.flash('success_msg', 'Stock file deleted successfully');
    res.redirect('/stock');
  } catch (err) {
    console.error('Error deleting stock file:', err);
    req.flash('error_msg', 'An error occurred while deleting the stock file');
    res.redirect('/stock');
  }
});

// User Management
router.get('/users', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    // Get users from the database
    // For demonstration, we'll create some sample users
    const users = [
      { userID: '123456789012345678', username: 'Admin User', positive: 5, negative: 0, isVerified: true },
      { userID: '876543210987654321', username: 'Regular User', positive: 3, negative: 1, isVerified: true },
      { userID: '246813579135792468', username: 'New User', positive: 0, negative: 0, isVerified: false }
    ];
    
    res.render('users', {
      title: 'User Management',
      user: req.user,
      users,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg'),
      activeRoute: '/users'
    });
  } catch (err) {
    console.error('Error loading users:', err);
    req.flash('error_msg', 'An error occurred while loading users');
    res.redirect('/dashboard');
  }
});

// Logs & Analytics
router.get('/logs', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    res.render('logs', {
      title: 'Logs & Analytics',
      user: req.user,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg'),
      activeRoute: '/logs'
    });
  } catch (err) {
    console.error('Error loading logs:', err);
    req.flash('error_msg', 'An error occurred while loading logs');
    res.redirect('/dashboard');
  }
});

// Settings
router.get('/settings', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    // Get bot config
    const config = req.app.get('config');
    
    res.render('settings', {
      title: 'Bot Settings',
      user: req.user,
      config,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg'),
      activeRoute: '/settings'
    });
  } catch (err) {
    console.error('Error loading settings:', err);
    req.flash('error_msg', 'An error occurred while loading settings');
    res.redirect('/dashboard');
  }
});

// Update settings
router.post('/settings', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { welcomeChannelId, helpPrefix } = req.body;
    const config = req.app.get('config');
    
    // Update config
    if (welcomeChannelId) config.welcomeChannelId = welcomeChannelId;
    if (helpPrefix) config.helpPrefix = helpPrefix;
    
    // Save updated config
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
    
    req.flash('success_msg', 'Settings updated successfully');
    res.redirect('/settings');
  } catch (err) {
    console.error('Error updating settings:', err);
    req.flash('error_msg', 'An error occurred while updating settings');
    res.redirect('/settings');
  }
});

// Update bot token
router.post('/settings/token', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { botToken } = req.body;
    
    if (!botToken || botToken === '•••••••••••••••••••••••••') {
      req.flash('error_msg', 'No token provided or token unchanged');
      return res.redirect('/settings');
    }
    
    // Read current .env file
    let envContent = '';
    try {
      envContent = fs.readFileSync('.env', 'utf8');
    } catch (err) {
      // If .env doesn't exist, create it
      envContent = '';
    }
    
    // Update TOKEN line or add it
    const tokenRegex = /^TOKEN=.*/m;
    if (tokenRegex.test(envContent)) {
      envContent = envContent.replace(tokenRegex, `TOKEN=${botToken}`);
    } else {
      envContent += `\nTOKEN=${botToken}\n`;
    }
    
    // Write updated .env file
    fs.writeFileSync('.env', envContent);
    
    req.flash('success_msg', 'Bot token updated successfully. Restart the bot for changes to take effect');
    res.redirect('/settings');
  } catch (err) {
    console.error('Error updating bot token:', err);
    req.flash('error_msg', 'An error occurred while updating the bot token');
    res.redirect('/settings');
  }
});

// Backup
router.get('/settings/backup', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    // This would typically create a ZIP file of the entire project or specific folders
    // For simplicity, we'll just redirect back to settings
    req.flash('error_msg', 'Backup functionality will be implemented in a future update');
    res.redirect('/settings');
  } catch (err) {
    console.error('Error creating backup:', err);
    req.flash('error_msg', 'An error occurred while creating the backup');
    res.redirect('/settings');
  }
});

module.exports = router;