const { 
    Client, 
    Intents, 
    MessageEmbed, 
    MessageButton, 
    MessageActionRow, 
    MessageSelectMenu, 
    Permissions, 
    Modal, 
    TextInputComponent
} = require('discord.js');
const Discord = require('discord.js');
const fs = require('fs');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');

// Load configuration early so it's available throughout the application
require('dotenv').config();
const config = require('./config.json');
const token = process.env.DISCORD_BOT_TOKEN || config.token;

const app = express();
const port = process.env.PORT || 3000;

// Initialize Discord client with all required intents
const client = new Discord.Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_MEMBERS,
        Intents.FLAGS.GUILD_INTEGRATIONS,
        Intents.FLAGS.GUILD_WEBHOOKS,
        Intents.FLAGS.GUILD_PRESENCES,
        Intents.FLAGS.DIRECT_MESSAGES,
        Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
        Intents.FLAGS.GUILD_INVITES
    ],
    partials: ['CHANNEL', 'MESSAGE', 'REACTION']
});

// Attach database to client before connecting
client.db = new sqlite3.Database('vouches.db', (err) => {
    if (err) {
        console.error('Error connecting to SQLite3 database:', err.message);
    } else {
        console.log('Connected to SQLite3 database');
        // Create tables if they don't exist
        client.db.serialize(() => {
            // Existing vouches table
            client.db.run(`CREATE TABLE IF NOT EXISTS vouches (
                user_id TEXT PRIMARY KEY,
                vouches INTEGER DEFAULT 0,
                negvouches INTEGER DEFAULT 0,
                reasons TEXT DEFAULT '[]',
                todayvouches INTEGER DEFAULT 0,
                last3daysvouches INTEGER DEFAULT 0,
                lastweekvouches INTEGER DEFAULT 0
            )`);

            // New invites table
            client.db.run(`CREATE TABLE IF NOT EXISTS invites (
                user_id TEXT PRIMARY KEY,
                total_invites INTEGER DEFAULT 0,
                regular_invites INTEGER DEFAULT 0,
                leaves INTEGER DEFAULT 0,
                bonus_invites INTEGER DEFAULT 0,
                fake_invites INTEGER DEFAULT 0,
                invite_codes TEXT DEFAULT '[]'
            )`);
        });
    }
});

// Cache for storing guild invites
const guildInvites = new Map();

// Event to cache invites when bot starts
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    client.user.setActivity(`${config.helpPrefix}help │ 𝗪𝗥𝗘𝗖𝗞𝗘𝗗 𝗚𝟯𝗡`);

    // Verify welcome channel
    const welcomeChannel = client.channels.cache.get(config.welcomeChannelId);
    if (welcomeChannel) {
        console.log(`Welcome channel found: #${welcomeChannel.name}`);
        const permissions = welcomeChannel.permissionsFor(client.user);
        if (permissions.has('SEND_MESSAGES') && permissions.has('VIEW_CHANNEL')) {
            console.log('Bot has correct permissions for welcome channel');
        } else {
            console.warn('Bot is missing required permissions in welcome channel');
        }
    } else {
        console.error(`Welcome channel not found with ID: ${config.welcomeChannelId}`);
    }

    // Cache all guild invites
    client.guilds.cache.forEach(async (guild) => {
        try {
            const firstInvites = await guild.invites.fetch();
            guildInvites.set(guild.id, new Map(firstInvites.map((invite) => [invite.code, invite.uses])));
        } catch (err) {
            console.error(`Error caching invites for guild ${guild.id}:`, err);
        }
    });
});

// Event to update invite cache when new invite is created
client.on('inviteCreate', async (invite) => {
    try {
        const invites = guildInvites.get(invite.guild.id);
        invites.set(invite.code, invite.uses);
        guildInvites.set(invite.guild.id, invites);
    } catch (err) {
        console.error('Error handling new invite:', err);
    }
});

// Event to track who used an invite
client.on('guildMemberAdd', async (member) => {
    try {
        const welcomeChannel = member.guild.channels.cache.get(config.welcomeChannelId);
        if (!welcomeChannel) {
            console.error(`Welcome channel ${config.welcomeChannelId} not found`);
            return;
        }

        const cachedInvites = guildInvites.get(member.guild.id);
        const newInvites = await member.guild.invites.fetch();

        const usedInvite = newInvites.find(invite => {
            const cachedUses = cachedInvites.get(invite.code) || 0;
            return invite.uses > cachedUses;
        });

        if (usedInvite) {
            try {
                const inviter = await client.users.fetch(usedInvite.inviter.id);

                // Get inviter's total invites
                client.db.get('SELECT total_invites FROM invites WHERE user_id = ?', [inviter.id], async (err, row) => {
                    if (err) {
                        console.error('Error checking inviter:', err);
                        return;
                    }

                    // Calculate the new total invite count
                    const newTotalInvites = row ? row.total_invites + 1 : 1;

                    // Update database first
                    if (!row) {
                        client.db.run('INSERT INTO invites (user_id, total_invites, regular_invites, invite_codes) VALUES (?, 1, 1, ?)',
                            [inviter.id, JSON.stringify([usedInvite.code])], async (dbError) => {
                                if (dbError) {
                                    console.error('Error creating inviter record:', dbError);
                                }
                                
                                // Send welcome message with new count after database is updated
                                try {
                                    await welcomeChannel.send(`${member.user} **joined**; invited by **${inviter.username}** (**${newTotalInvites}** invites)`);
                                } catch (sendError) {
                                    console.error('Error sending welcome message:', sendError);
                                }
                            });
                    } else {
                        const inviteCodes = JSON.parse(row.invite_codes || '[]');
                        inviteCodes.push(usedInvite.code);

                        client.db.run('UPDATE invites SET total_invites = total_invites + 1, regular_invites = regular_invites + 1, invite_codes = ? WHERE user_id = ?',
                            [JSON.stringify(inviteCodes), inviter.id], async (dbError) => {
                                if (dbError) {
                                    console.error('Error updating inviter record:', dbError);
                                }
                                
                                // Send welcome message with new count after database is updated
                                try {
                                    await welcomeChannel.send(`${member.user} **joined**; invited by **${inviter.username}** (**${newTotalInvites}** invites)`);
                                } catch (sendError) {
                                    console.error('Error sending welcome message:', sendError);
                                }
                            });
                    }
                });
            } catch (inviterError) {
                console.error('Error fetching inviter:', inviterError);
            }
        }

        // Update the cache with new uses
        guildInvites.set(member.guild.id, new Map(newInvites.map((invite) => [invite.code, invite.uses])));
    } catch (err) {
        console.error('Error handling member join:', err);
    }
});

// Event to track when members leave
client.on('guildMemberRemove', async (member) => {
    try {
        const welcomeChannel = member.guild.channels.cache.get(config.welcomeChannelId);
        if (!welcomeChannel) {
            console.error(`Welcome channel ${config.welcomeChannelId} not found`);
            return;
        }

        try {
            await welcomeChannel.send(`${member.user} **left**`);
        } catch (sendError) {
            console.error('Error sending leave message:', sendError);
        }

        // Update leaves count and decrement total invites for their inviter if we can find it
        client.db.all('SELECT * FROM invites WHERE invite_codes LIKE ?', [`%${member.user.id}%`], (err, rows) => {
            if (err) {
                console.error('Error checking inviter for leaving member:', err);
                return;
            }

            if (rows.length > 0) {
                const inviterId = rows[0].user_id;
                // Update leaves count and decrease total_invites by 1
                client.db.run('UPDATE invites SET leaves = leaves + 1, total_invites = total_invites - 1 WHERE user_id = ?', [inviterId], (dbError) => {
                    if (dbError) {
                        console.error('Error updating inviter stats for leaving member:', dbError);
                    } else {
                        console.log(`Updated invites for user ${inviterId}: incremented leaves count and decremented total invites`);
                    }
                });
            }
        });
    } catch (err) {
        console.error('Error handling member leave:', err);
    }
});

// Express and EJS setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'dashboard/views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(helmet({
  contentSecurityPolicy: false,
}));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'bot-owner-dashboard-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// Global response variables
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.user = req.user || null;
  next();
});

// Admin user for the dashboard
const adminUsers = [
  {
    id: '1',
    username: 'admin',
    // Default password: admin123 (you should change this)
    passwordHash: '$2b$10$NVSri28I6sFAqfUFmISIPO0FMKpMK7JxiPntOzS278z3FzhX3R3HC',
    isAdmin: true
  }
];

// Passport configuration
passport.use(new LocalStrategy(
  async (username, password, done) => {
    try {
      console.log(`Login attempt: Username=${username}`);
      const user = adminUsers.find(u => u.username === username);
      if (!user) {
        console.log('User not found');
        return done(null, false, { message: 'Incorrect username' });
      }
      
      console.log('Comparing password...');
      const isMatch = await bcrypt.compare(password, user.passwordHash);
      console.log(`Password match result: ${isMatch}`);
      
      if (!isMatch) {
        return done(null, false, { message: 'Incorrect password' });
      }
      
      console.log('Login successful');
      return done(null, user);
    } catch (err) {
      console.error('Login error:', err);
      return done(err);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  const user = adminUsers.find(u => u.id === id);
  done(null, user);
});

// Authentication middleware
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash('error_msg', 'Please log in to view this resource');
  res.redirect('/login');
}

function ensureAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.isAdmin) {
    return next();
  }
  req.flash('error_msg', 'You do not have permission to access this resource');
  res.redirect('/dashboard');
}

// Expose client to routes
app.use((req, res, next) => {
  req.discordClient = client;
  req.botConfig = config;
  next();
});

// Express routes
app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  res.render('index', { 
    title: 'Discord Bot Admin Panel',
    botUsername: client.user ? client.user.username : 'Bot'
  });
});

// Auth routes
app.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  res.render('login', { title: 'Login' });
});

app.post('/login', 
  passport.authenticate('local', { 
    failureRedirect: '/login',
    failureFlash: true
  }),
  (req, res) => {
    req.flash('success_msg', 'You are now logged in');
    res.redirect('/dashboard');
  }
);

app.get('/logout', (req, res) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    req.flash('success_msg', 'You are logged out');
    res.redirect('/login');
  });
});

// Dashboard routes
app.get('/dashboard', ensureAuthenticated, async (req, res) => {
  try {
    // Count accounts in stock
    const stockFolders = ['stock', 'basicstock', 'bstock', 'fstock', 'extreme'];
    let totalAccounts = 0;
    
    for (const folder of stockFolders) {
      try {
        const files = fs.readdirSync(`./${folder}`);
        for (const file of files) {
          if (file.endsWith('.txt')) {
            try {
              const content = fs.readFileSync(`./${folder}/${file}`, 'utf8');
              const lines = content.split('\n').filter(line => line.trim() !== '');
              totalAccounts += lines.length;
            } catch (err) {
              console.error(`Error reading file ${folder}/${file}:`, err);
            }
          }
        }
      } catch (err) {
        console.error(`Error reading folder ${folder}:`, err);
      }
    }
    
    res.render('dashboard', {
      title: 'Dashboard',
      botUsername: client.user ? client.user.username : 'Bot',
      botStatus: client.ws.status === 0 ? 'Online' : 'Offline',
      botPing: client.ws.ping,
      totalAccounts,
      user: req.user,
      activeRoute: '/dashboard'
    });
  } catch (err) {
    console.error('Error rendering dashboard:', err);
    req.flash('error_msg', 'An error occurred while loading the dashboard');
    res.redirect('/');
  }
});

// Stock Management routes
app.get('/stock', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const stockFolders = ['stock', 'basicstock', 'bstock', 'fstock', 'extreme'];
    const stockData = {};
    
    for (const folder of stockFolders) {
      try {
        stockData[folder] = [];
        const files = fs.readdirSync(`./${folder}`);
        for (const file of files) {
          if (file.endsWith('.txt')) {
            try {
              const content = fs.readFileSync(`./${folder}/${file}`, 'utf8');
              const lines = content.split('\n').filter(line => line.trim() !== '');
              stockData[folder].push({
                name: file,
                count: lines.length
              });
            } catch (err) {
              console.error(`Error reading file ${folder}/${file}:`, err);
            }
          }
        }
      } catch (err) {
        console.error(`Error reading folder ${folder}:`, err);
      }
    }
    
    res.render('stock', {
      title: 'Stock Management',
      stockData,
      user: req.user,
      activeRoute: '/stock'
    });
  } catch (err) {
    console.error('Error rendering stock page:', err);
    req.flash('error_msg', 'An error occurred while loading the stock page');
    res.redirect('/dashboard');
  }
});

// View accounts in a specific stock file
app.get('/stock/:folder/:file', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { folder, file } = req.params;
    const filePath = `./${folder}/${file}`;
    
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
      error_msg: req.flash('error_msg')
    });
  } catch (err) {
    console.error('Error viewing accounts:', err);
    req.flash('error_msg', 'An error occurred while loading the accounts');
    res.redirect('/stock');
  }
});

// Add accounts to a stock file
app.post('/stock/:folder/:file/add', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { folder, file } = req.params;
    const { accounts } = req.body;
    const filePath = `./${folder}/${file}`;
    
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
    
    fs.appendFileSync(filePath, '\n' + newAccounts);
    
    req.flash('success_msg', 'Accounts added successfully');
    res.redirect(`/stock/${folder}/${file}`);
  } catch (err) {
    console.error('Error adding accounts:', err);
    req.flash('error_msg', 'An error occurred while adding accounts');
    res.redirect('/stock');
  }
});

// Upload a file to add accounts
app.post('/stock/:folder/:file/upload', ensureAuthenticated, ensureAdmin, (req, res) => {
  // This would normally use multer for file uploads
  // For simplicity, we're using text input in this version
  req.flash('success_msg', 'File upload will be implemented in the next version');
  res.redirect(`/stock/${folder}/${file}`);
});

// Create a new stock file
app.post('/stock/:folder/create', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { folder } = req.params;
    const { filename } = req.body;
    
    if (!filename || filename.trim() === '') {
      req.flash('error_msg', 'No filename provided');
      return res.redirect('/stock');
    }
    
    const filePath = `./${folder}/${filename}.txt`;
    
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

// Remove specific account from file
app.post('/stock/:folder/:file/remove', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { folder, file } = req.params;
    const { account } = req.body;
    
    // Validate folder and file
    const allowedFolders = ['basicstock', 'bstock', 'extreme', 'fstock'];
    if (!allowedFolders.includes(folder)) {
      req.flash('error_msg', 'Invalid folder');
      return res.redirect('/stock');
    }
    
    const filePath = `./${folder}/${file}`;
    
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
app.post('/stock/:folder/:file/clear', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { folder, file } = req.params;
    
    // Validate folder and file
    const allowedFolders = ['basicstock', 'bstock', 'extreme', 'fstock'];
    if (!allowedFolders.includes(folder)) {
      req.flash('error_msg', 'Invalid folder');
      return res.redirect('/stock');
    }
    
    const filePath = `./${folder}/${file}`;
    
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

// Delete a stock file
app.delete('/stock/:folder/:file', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { folder, file } = req.params;
    const filePath = `./${folder}/${file}`;
    
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

// User Management routes
app.get('/users', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    // Read all users from the vouches database
    let users = [];
    
    client.db.all('SELECT * FROM vouches', (err, rows) => {
      if (err) {
        console.error('Error fetching users:', err);
        req.flash('error_msg', 'An error occurred while fetching users');
        return res.redirect('/dashboard');
      }
      
      users = rows;
      
      res.render('users', {
        title: 'User Management',
        users,
        user: req.user,
        activeRoute: '/users'
      });
    });
  } catch (err) {
    console.error('Error rendering users page:', err);
    req.flash('error_msg', 'An error occurred while loading the users page');
    res.redirect('/dashboard');
  }
});

// Bot Settings routes
app.get('/settings', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    res.render('settings', {
      title: 'Bot Settings',
      config,
      client,
      botUsername: client.user ? client.user.username : 'Bot',
      botStatus: client.ws.status === 0 ? 'Online' : 'Offline',
      botPing: client.ws.ping,
      user: req.user,
      activeRoute: '/settings'
    });
  } catch (err) {
    console.error('Error rendering settings page:', err);
    req.flash('error_msg', 'An error occurred while loading the settings page');
    res.redirect('/dashboard');
  }
});

// Update general settings
app.post('/settings/general', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { botToken, genCooldown, egenCooldownHours, gif } = req.body;
    const adminUserIds = Array.isArray(req.body['adminUserIds[]']) 
      ? req.body['adminUserIds[]'].filter(id => id.trim() !== '') 
      : (req.body['adminUserIds[]'] ? [req.body['adminUserIds[]']] : []);
    
    // Update config
    if (botToken && botToken !== '••••••••••••••••••••••••••') {
      config.token = botToken;
    }
    
    if (genCooldown) config.genCooldown = parseInt(genCooldown) || config.genCooldown;
    if (egenCooldownHours) config.egenCooldownHours = parseInt(egenCooldownHours) || config.egenCooldownHours;
    if (gif) config.gif = gif;
    if (adminUserIds.length > 0) config.adminUserIds = adminUserIds;
    
    // Save updated config
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
    
    req.flash('success_msg', 'General settings updated successfully');
    res.redirect('/settings');
  } catch (err) {
    console.error('Error updating general settings:', err);
    req.flash('error_msg', 'An error occurred while updating general settings');
    res.redirect('/settings');
  }
});

// Update channel settings
app.post('/settings/channels', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { 
      welcomeChannelId, genChannel, fgenChannel, bgenChannel, 
      egenChannel, cgenChannel, vouchChannelId, logsChannelId, 
      dropChannelId, stockid 
    } = req.body;
    
    // Update config
    if (welcomeChannelId) config.welcomeChannelId = welcomeChannelId;
    if (genChannel) config.genChannel = genChannel;
    if (fgenChannel) config.fgenChannel = fgenChannel;
    if (bgenChannel) config.bgenChannel = bgenChannel;
    if (egenChannel) config.egenChannel = egenChannel;
    if (cgenChannel) config.cgenChannel = cgenChannel;
    if (vouchChannelId) config.vouchChannelId = vouchChannelId;
    if (logsChannelId) config.logsChannelId = logsChannelId;
    if (dropChannelId) config.dropChannelId = dropChannelId;
    if (stockid) config.stockid = stockid;
    
    // Save updated config
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
    
    req.flash('success_msg', 'Channel settings updated successfully');
    res.redirect('/settings');
  } catch (err) {
    console.error('Error updating channel settings:', err);
    req.flash('error_msg', 'An error occurred while updating channel settings');
    res.redirect('/settings');
  }
});

// Update role settings
app.post('/settings/roles', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { providorRole, dropRoleId, restockroleid } = req.body;
    
    const staffRoleIds = Array.isArray(req.body['staffRoleIds[]']) 
      ? req.body['staffRoleIds[]'].filter(id => id.trim() !== '') 
      : (req.body['staffRoleIds[]'] ? [req.body['staffRoleIds[]']] : []);
      
    const cookiesendroles = Array.isArray(req.body['cookiesendroles[]']) 
      ? req.body['cookiesendroles[]'].filter(id => id.trim() !== '') 
      : (req.body['cookiesendroles[]'] ? [req.body['cookiesendroles[]']] : []);
    
    // Update config
    if (providorRole) config.providorRole = providorRole;
    if (dropRoleId) config.dropRoleId = dropRoleId;
    if (restockroleid) config.restockroleid = restockroleid;
    if (staffRoleIds.length > 0) config.staffRoleIds = staffRoleIds;
    if (cookiesendroles.length > 0) config.cookiesendroles = cookiesendroles;
    
    // Save updated config
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
    
    req.flash('success_msg', 'Role settings updated successfully');
    res.redirect('/settings');
  } catch (err) {
    console.error('Error updating role settings:', err);
    req.flash('error_msg', 'An error occurred while updating role settings');
    res.redirect('/settings');
  }
});

// Update command settings
app.post('/settings/commands', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { 
      mainPrefix, helpPrefix, vouchPrefix, negVouchPrefix,
      extremePrefix, basicPrefix, freePrefix, cookiePrefix
    } = req.body;
    
    // Update config
    if (mainPrefix) config.mainPrefix = mainPrefix;
    if (helpPrefix) config.helpPrefix = helpPrefix;
    if (vouchPrefix) config.vouchPrefix = vouchPrefix;
    if (negVouchPrefix) config.negVouchPrefix = negVouchPrefix;
    if (extremePrefix) config.extremePrefix = extremePrefix;
    if (basicPrefix) config.basicPrefix = basicPrefix;
    if (freePrefix) config.freePrefix = freePrefix;
    if (cookiePrefix) config.cookiePrefix = cookiePrefix;
    
    // Save updated config
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
    
    req.flash('success_msg', 'Command settings updated successfully');
    res.redirect('/settings');
  } catch (err) {
    console.error('Error updating command settings:', err);
    req.flash('error_msg', 'An error occurred while updating command settings');
    res.redirect('/settings');
  }
});

// Update feature settings
app.post('/settings/features', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { error_message, notfound_message, dropSessionActive } = req.body;
    
    const ticketcategories = Array.isArray(req.body['ticketcategories[]']) 
      ? req.body['ticketcategories[]'].filter(id => id.trim() !== '') 
      : (req.body['ticketcategories[]'] ? [req.body['ticketcategories[]']] : []);
    
    // Update config
    config.command.error_message = error_message === 'on';
    config.command.notfound_message = notfound_message === 'on';
    config.dropSessionActive = dropSessionActive === 'on';
    if (ticketcategories.length > 0) config.ticketcategories = ticketcategories;
    
    // Save updated config
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
    
    req.flash('success_msg', 'Feature settings updated successfully');
    res.redirect('/settings');
  } catch (err) {
    console.error('Error updating feature settings:', err);
    req.flash('error_msg', 'An error occurred while updating feature settings');
    res.redirect('/settings');
  }
});

// Update appearance settings
app.post('/settings/appearance', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    const { 
      colorDefault, colorGreen, colorRed, colorYellow, colorBlue, footerGif
    } = req.body;
    
    // Update config
    if (colorDefault) config.color.default = colorDefault;
    if (colorGreen) config.color.green = colorGreen;
    if (colorRed) config.color.red = colorRed;
    if (colorYellow) config.color.yellow = colorYellow;
    if (colorBlue) config.color.blue = colorBlue;
    if (footerGif) config.gif = footerGif;
    
    // Save updated config
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
    
    req.flash('success_msg', 'Appearance settings updated successfully');
    res.redirect('/settings');
  } catch (err) {
    console.error('Error updating appearance settings:', err);
    req.flash('error_msg', 'An error occurred while updating appearance settings');
    res.redirect('/settings');
  }
});

// Logs & Analytics routes
app.get('/logs', ensureAuthenticated, ensureAdmin, (req, res) => {
  try {
    // For a full implementation, you would track logs in a database
    // This is a simplified version for demonstration purposes
    res.render('logs', {
      title: 'Logs & Analytics',
      user: req.user,
      activeRoute: '/logs'
    });
  } catch (err) {
    console.error('Error rendering logs page:', err);
    req.flash('error_msg', 'An error occurred while loading the logs page');
    res.redirect('/dashboard');
  }
});

// Error handling for express server
const server = app.listen(port, '0.0.0.0', () => {
    console.log('Server is listening on port ' + port);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} is already in use. Trying alternative port...`);
        server.listen(0); // Let the OS assign an available port
    } else {
        console.error('Server error:', err);
    }
});

client.commands = new Discord.Collection();

if (!token) {
    console.warn('No Discord bot token provided! Using development mode for dashboard.');
    // Create mock client properties needed for the dashboard
    client.user = { 
        username: 'Development Bot',
        tag: 'DevelopmentBot#0000'
    };
    client.ws = {
        status: 0,
        ping: 42
    };
}

// Load commands
const commandFolders = fs.readdirSync('./commands');
for (const folder of commandFolders) {
    const commandFiles = fs.readdirSync(`./commands/${folder}`).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(`./commands/${folder}/${file}`);
        let prefix = config[`${folder}Prefix`] || config.mainPrefix;
        command.prefix = prefix;
        console.log(`Loaded command: ${prefix}${command.name} `);
        client.commands.set(command.name, command);
    }
}

// Handle commands
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // First check for natural conversation
    try {
        const naturalChat = require('./commands/main/naturalchat');
        const handledByNaturalChat = await naturalChat.processMessage(message, client);
        
        // If natural chat handled the message, we're done
        if (handledByNaturalChat) return;
    } catch (naturalChatError) {
        console.error('Error in natural chat processing:', naturalChatError);
        // Continue with command processing even if natural chat fails
    }

    // Continue with command processing if the message wasn't handled by natural chat
    const prefixes = [
        config.vouchPrefix,
        config.negVouchPrefix,
        config.mainPrefix,
        config.helpPrefix,
        config.basicPrefix,
        config.freePrefix,
        config.boostPrefix,
        config.premiumPrefix,
        config.cookiePrefix,
        config.extremePrefix
    ];

    let usedPrefix = null;
    for (const prefix of prefixes) {
        if (message.content.startsWith(prefix)) {
            usedPrefix = prefix;
            break;
        }
    }

    if (!usedPrefix) return;

    const args = message.content.slice(usedPrefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    if (!client.commands.has(commandName)) {
        if (config.command.notfound_message) {
            await message.channel.send({
                embeds: [
                    new Discord.MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('Unknown command :(')
                        .setDescription(`Sorry, but I cannot find the \`${commandName}\` command!`)
                        .setFooter({
                            text: message.author.tag,
                            iconURL: message.author.displayAvatarURL({ dynamic: true })
                        })
                        .setTimestamp()
                ]
            });
        }
        return;
    }

    try {
        const command = client.commands.get(commandName);
        if (command.prefix === usedPrefix) {
            // Add special handling for startdrop command
            if (commandName === 'startdrop') {
                try {
                    await command.execute(message, args, usedPrefix);
                } catch (cmdError) {
                    console.error('Error executing startdrop command:', cmdError);
                    // Don't show error message for startdrop as it handles its own errors
                }
            } else {
                // Normal handling for other commands
                await command.execute(message, args, usedPrefix);
            }
        }
    } catch (error) {
        console.error('Error executing command:', error);
        await message.channel.send({
            embeds: [
                new Discord.MessageEmbed()
                    .setColor(config.color.red)
                    .setTitle('Error')
                    .setDescription('There was an error executing that command!')
                    .setFooter({
                        text: message.author.tag,
                        iconURL: message.author.displayAvatarURL({ dynamic: true })
                    })
                    .setTimestamp()
            ]
        });
    }
});

// Handle ticket creation
async function handleTicketCreation(interaction, category) {
    const guild = interaction.guild;
    console.log('Attempting to create ticket with category:', category);
    
    // Check if this is a code redemption ticket
    if (category === 'Code') {
        // Read verified users from file
        const verifiedContent = fs.readFileSync('verified.txt', 'utf8').split('\n');
        const isVerified = verifiedContent.some(line => line.includes(interaction.user.username));
        
        if (!isVerified) {
            return interaction.reply({ 
                content: '❌ You must be verified to create a code redemption ticket! Please verify first.',
                ephemeral: true 
            });
        }
    }

    console.log('Available ticket categories:', config.ticketcategories);
    const ticketCategory = guild.channels.cache.get(config.ticketcategories[0]);

    if (!ticketCategory) {
        await interaction.reply({ content: 'Ticket category not found! Please check category IDs in config.', ephemeral: true });
        console.error('Ticket category not found. Available categories:', config.ticketcategories);
        console.error('Guild channels:', Array.from(guild.channels.cache.map(c => `${c.name}: ${c.id}`)));
        return;
    }

    try {
        console.log('Creating ticket channel in category:', ticketCategory.name);
        // Create a ticket channel with the category name included
        const channelName = category === 'Code' ? 
            `code-${interaction.user.username}` : 
            `ticket-${interaction.user.username}`;
            
        const ticketChannel = await guild.channels.create(channelName, {
            type: 'GUILD_TEXT',
            parent: ticketCategory,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [Discord.Permissions.FLAGS.VIEW_CHANNEL],
                },
                {
                    id: interaction.user.id,
                    allow: [
                        Discord.Permissions.FLAGS.VIEW_CHANNEL,
                        Discord.Permissions.FLAGS.SEND_MESSAGES,
                        Discord.Permissions.FLAGS.READ_MESSAGE_HISTORY
                    ],
                },
                {
                    id: client.user.id,
                    allow: [
                        Discord.Permissions.FLAGS.VIEW_CHANNEL,
                        Discord.Permissions.FLAGS.SEND_MESSAGES,
                        Discord.Permissions.FLAGS.READ_MESSAGE_HISTORY
                    ],
                },
            ],
        });

        // For Code Redemption tickets, show a form to enter the code
        if (category === 'Code') {
            const codeEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Code Redemption Form')
                .setDescription(`Welcome ${interaction.user}!\nPlease enter your redemption code in the form below.`)
                .setFooter({ text: 'Made by itsmeboi' })
                .setTimestamp();

            // Create a modal button for code redemption
            const modalButton = new Discord.MessageActionRow()
                .addComponents(
                    new Discord.MessageButton()
                        .setCustomId('open_code_form')
                        .setLabel('Enter Redemption Code')
                        .setStyle('PRIMARY')
                        .setEmoji('🔑')
                );

            const closeButton = new Discord.MessageActionRow()
                .addComponents(
                    new Discord.MessageButton()
                        .setCustomId('close_ticket')
                        .setLabel('Close Ticket')
                        .setStyle('DANGER')
                        .setEmoji('🔒')
                );

            await ticketChannel.send({ embeds: [codeEmbed], components: [modalButton, closeButton] });
        } else if (category === 'Redeem') {
            // For Redeem tickets, show AI greeting and service selection
            const redeemEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Invite Redemption')
                .setDescription(`Hello ${interaction.user}! 👋\n\nWelcome to the Invite Redemption center! I'll help you redeem your invites for various services.\n\nPlease select a service category from the dropdown menu below to see what's available:`)
                .setFooter({ text: 'Made by itsmeboi' })
                .setTimestamp();

            // Load services from services.json
            const servicesData = require('./services.json');
            
            // Create category selection dropdown
            const categoryRow = new Discord.MessageActionRow()
                .addComponents(
                    new Discord.MessageSelectMenu()
                        .setCustomId('service_category_menu')
                        .setPlaceholder('Select Service Category')
                        .setMinValues(1)
                        .setMaxValues(1)
                        .addOptions([
                            {
                                label: 'Streaming Services',
                                description: 'Netflix, Disney+, etc.',
                                value: 'streaming',
                                emoji: '📺'
                            },
                            {
                                label: 'VPN Services',
                                description: 'NordVPN, IPVanish, etc.',
                                value: 'vpn',
                                emoji: '🔒'
                            },
                            {
                                label: 'Gaming',
                                description: 'Steam, Roblox, etc.',
                                value: 'gaming',
                                emoji: '🎮'
                            },
                            {
                                label: 'Entertainment',
                                description: 'DAZN and more',
                                value: 'entertainment',
                                emoji: '🎭'
                            },
                            {
                                label: 'Education',
                                description: 'Duolingo+ and more',
                                value: 'education',
                                emoji: '📚'
                            }
                        ])
                );

            const closeRow = new Discord.MessageActionRow()
                .addComponents(
                    new Discord.MessageButton()
                        .setCustomId('close_ticket')
                        .setLabel('Close Ticket')
                        .setStyle('DANGER')
                        .setEmoji('🔒')
                );

            await ticketChannel.send({ embeds: [redeemEmbed], components: [categoryRow, closeRow] });
        } else {
            // For other ticket types, show the regular support message
            const embed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle(`${category} Support Ticket`)
                .setDescription(`Welcome ${interaction.user}!\nSupport will be with you shortly.\n\nCategory: ${category}`)
                .setFooter({ text: 'Made by itsmeboi' })
                .setTimestamp();

            const row = new Discord.MessageActionRow()
                .addComponents(
                    new Discord.MessageButton()
                        .setCustomId('close_ticket')
                        .setLabel('Close Ticket')
                        .setStyle('DANGER')
                        .setEmoji('🔒')
                );

            await ticketChannel.send({ embeds: [embed], components: [row] });
        }

        return interaction.reply({ content: `Ticket created! Please check ${ticketChannel}`, ephemeral: true });
    } catch (error) {
        console.error('Error creating ticket channel:', error);
        return interaction.reply({ content: `Error creating ticket: ${error.message}`, ephemeral: true });
    }
}

// Handle invite redemption
async function handleInviteRedemption(interaction, serviceData) {
    try {
        const userId = interaction.user.id;

        // Fetch user invites
        const inviteResult = await new Promise((resolve, reject) => {
            client.db.get('SELECT * FROM invites WHERE user_id = ?', [userId], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(row);
            });
        });

        const userInvites = inviteResult ? inviteResult.total_invites : 0;
        
        // Check if user has enough invites
        if (userInvites < serviceData.cost) {
            return interaction.reply({
                embeds: [
                    new Discord.MessageEmbed()
                        .setColor('#ff0000')
                        .setTitle('Insufficient Invites')
                        .setDescription(`You need **${serviceData.cost}** invites to redeem this service. You currently have **${userInvites}** invites.`)
                        .setFooter({ text: 'Made by itsmeboi' })
                        .setTimestamp()
                ],
                ephemeral: true
            });
        }

        // Deduct invites from user
        await new Promise((resolve, reject) => {
            client.db.run('UPDATE invites SET total_invites = total_invites - ? WHERE user_id = ?',
                [serviceData.cost, userId], (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                });
        });

        // Rename channel to indicate service type
        try {
            const channel = interaction.channel;
            if (channel.name.startsWith('ticket-')) {
                await channel.setName(`${serviceData.category}-${interaction.user.username}`);
            }
        } catch (error) {
            console.error('Error updating channel name:', error);
        }

        // Send success message
        return interaction.reply({
            embeds: [
                new Discord.MessageEmbed()
                    .setColor('#00ff00')
                    .setTitle('Service Redeemed Successfully')
                    .setDescription(`You have successfully redeemed **${serviceData.name}** for **${serviceData.cost}** invites!\n\nA staff member will assist you shortly.`)
                    .setFooter({ text: 'Made by itsmeboi' })
                    .setTimestamp()
            ]
        });
    } catch (error) {
        console.error('Error in invite redemption:', error);
        return interaction.reply({
            embeds: [
                new Discord.MessageEmbed()
                    .setColor('#ff0000')
                    .setTitle('Error')
                    .setDescription('An error occurred while processing your redemption. Please try again later.')
                    .setFooter({ text: 'Made by itsmeboi' })
                    .setTimestamp()
            ],
            ephemeral: true
        });
    }
}

// Handle code redemption
async function handleCodeRedemption(interaction, code) {
    try {
        // Check if code is valid
        if (!code || code.trim() === '') {
            return interaction.reply({ 
                content: 'Please provide a valid redemption code.', 
                ephemeral: true 
            });
        }

        // Make sure the redeemcodes directory exists
        const redeemDir = './redeemcodes';
        if (!fs.existsSync(redeemDir)) {
            fs.mkdirSync(redeemDir, { recursive: true });
        }

        const redeemFilePath = `${redeemDir}/redeemcodes.txt`;

        // Create the file if it doesn't exist
        if (!fs.existsSync(redeemFilePath)) {
            fs.writeFileSync(redeemFilePath, '', 'utf8');
        }

        // Read the contents of redeemcodes.txt file
        const data = await fs.promises.readFile(redeemFilePath, 'utf8');
        const lines = data.split('\n');

        // Check if the code exists in any line
        const foundLineIndex = lines.findIndex((line) => line.startsWith(`${code} - `));

        if (foundLineIndex !== -1) {
            // Extract the content after the code
            const redeemedContent = lines[foundLineIndex].substring(`${code} - `.length);

            // Remove the redeemed line from the array
            lines.splice(foundLineIndex, 1);

            // Join the remaining lines
            const updatedData = lines.join('\n');

            // Write the updated content back to redeemcodes.txt
            await fs.promises.writeFile(redeemFilePath, updatedData, 'utf8');

            // Update the channel name with the service type
            try {
                // Extract service name (take the first word or full string if no spaces)
                const serviceName = redeemedContent.split(' ')[0].toLowerCase();
                const channel = interaction.channel;
                
                // Only rename if we're in a ticket channel
                if (channel.name.startsWith('code-')) {
                    await channel.setName(`${serviceName}-${interaction.user.username}`);
                }
                
                // Send the success message
                const successEmbed = new Discord.MessageEmbed()
                    .setColor(config.color.green)
                    .setTitle('REDEEMED CODE SUCCESSFULLY')
                    .setDescription(`The code has been redeemed successfully for:\n**${redeemedContent}**`)
                    .setFooter({ 
                        text: `Redeemed by ${interaction.user.tag}`, 
                        iconURL: interaction.user.displayAvatarURL({ dynamic: true }) 
                    })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [successEmbed] });
            } catch (error) {
                console.error('Error updating channel name:', error);
                // Still send success message even if renaming fails
                const successEmbed = new Discord.MessageEmbed()
                    .setColor(config.color.green)
                    .setTitle('REDEEMED CODE SUCCESSFULLY')
                    .setDescription(`The code has been redeemed successfully for:\n**${redeemedContent}**`)
                    .setFooter({ 
                        text: `Redeemed by ${interaction.user.tag}`, 
                        iconURL: interaction.user.displayAvatarURL({ dynamic: true }) 
                    })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [successEmbed] });
            }
        } else {
            // Code not found
            return interaction.reply({ 
                embeds: [
                    new Discord.MessageEmbed()
                        .setColor(config.color.red)
                        .setTitle('REDEEM CODE INVALID')
                        .setDescription('The provided code is invalid.')
                        .setFooter({ 
                            text: interaction.user.tag, 
                            iconURL: interaction.user.displayAvatarURL({ dynamic: true }) 
                        })
                        .setTimestamp()
                ],
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Error in code redemption:', error);
        return interaction.reply({ 
            embeds: [
                new Discord.MessageEmbed()
                    .setColor(config.color.red)
                    .setTitle('An error occurred!')
                    .setDescription('An error occurred while processing the redemption.')
                    .setFooter({ 
                        text: interaction.user.tag, 
                        iconURL: interaction.user.displayAvatarURL({ dynamic: true }) 
                    })
                    .setTimestamp()
            ],
            ephemeral: true
        });
    }
}

// Handle interactions (buttons, dropdowns, and modals)
client.on('interactionCreate', async interaction => {
    // Handle giveaway button interactions
    if (interaction.isButton() && interaction.customId.startsWith('gw_join_')) {
        try {
            const gwCommand = require('./commands/main/gw');
            await gwCommand.handleButtonInteraction(interaction);
        } catch (error) {
            console.error('Error handling giveaway button interaction:', error);
            await interaction.reply({ 
                content: 'An error occurred while processing your entry. Please try again later.',
                ephemeral: true 
            });
        }
        return;
    }

    // Handle ticket menu selection
    if (interaction.isSelectMenu() && interaction.customId === 'ticket_menu') {
        await handleTicketCreation(interaction, interaction.values[0]);
        await interaction.message.edit({
            components: [interaction.message.components[0]]
        });
    }

    // Handle close ticket button
    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        const channel = interaction.channel;
        await interaction.reply('Closing ticket in 5 seconds...');
        setTimeout(() => channel.delete(), 5000);
    }

    // Handle code redemption form button
    if (interaction.isButton() && interaction.customId === 'open_code_form') {
        const modal = new Discord.Modal()
            .setCustomId('code_redemption_modal')
            .setTitle('Code Redemption');
        
        const codeInput = new Discord.TextInputComponent()
            .setCustomId('redemption_code')
            .setLabel('Enter your redemption code')
            .setStyle('SHORT')
            .setRequired(true)
            .setPlaceholder('Example: ABC123DEF456');
        
        const firstActionRow = new Discord.MessageActionRow().addComponents(codeInput);
        modal.addComponents(firstActionRow);
        
        await interaction.showModal(modal);
    }
    
    // Handle code redemption modal submission
    if (interaction.isModalSubmit() && interaction.customId === 'code_redemption_modal') {
        const code = interaction.fields.getTextInputValue('redemption_code');
        await handleCodeRedemption(interaction, code);
    }

    // Handle service category selection
    if (interaction.isSelectMenu() && interaction.customId === 'service_category_menu') {
        const selectedCategory = interaction.values[0];
        const servicesData = require('./services.json');
        
        if (!servicesData[selectedCategory] || servicesData[selectedCategory].length === 0) {
            return interaction.reply({
                content: 'No services available in this category at the moment.',
                ephemeral: true
            });
        }

        // Create service options array for the dropdown
        const serviceOptions = servicesData[selectedCategory].map(service => ({
            label: `${service.name} (${service.cost} invites)`,
            description: `Costs ${service.cost} invites to redeem`,
            value: JSON.stringify({
                name: service.name,
                cost: service.cost,
                category: service.category
            }),
            emoji: getCategoryEmoji(service.category)
        }));

        // Create service selection dropdown
        const serviceRow = new Discord.MessageActionRow()
            .addComponents(
                new Discord.MessageSelectMenu()
                    .setCustomId('service_selection_menu')
                    .setPlaceholder('Select a Service to Redeem')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(serviceOptions)
            );

        // Create category embed
        const categoryEmbed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle(`${getCategoryName(selectedCategory)} Services`)
            .setDescription(`Please select a service to redeem with your invites:`)
            .setFooter({ text: 'Made by itsmeboi' })
            .setTimestamp();

        return interaction.reply({ 
            embeds: [categoryEmbed], 
            components: [serviceRow],
            ephemeral: false
        });
    }

    // Handle service selection
    if (interaction.isSelectMenu() && interaction.customId === 'service_selection_menu') {
        try {
            const selectedServiceData = JSON.parse(interaction.values[0]);
            
            // Get user's current invites
            const userId = interaction.user.id;
            client.db.get('SELECT total_invites FROM invites WHERE user_id = ?', [userId], async (err, row) => {
                if (err) {
                    console.error('Error checking invites:', err);
                    return interaction.reply({
                        content: 'An error occurred while checking your invites. Please try again later.',
                        ephemeral: true
                    });
                }

                const userInvites = row ? row.total_invites : 0;
                
                // Check if user has enough invites
                if (userInvites < selectedServiceData.cost) {
                    return interaction.reply({
                        embeds: [
                            new Discord.MessageEmbed()
                                .setColor('#ff0000')
                                .setTitle('Insufficient Invites')
                                .setDescription(`You need **${selectedServiceData.cost}** invites to redeem **${selectedServiceData.name}**. You currently have **${userInvites}** invites.`)
                                .setFooter({ text: 'Made by itsmeboi' })
                                .setTimestamp()
                        ],
                        ephemeral: true
                    });
                }

                // Ask for confirmation
                const confirmEmbed = new Discord.MessageEmbed()
                    .setColor('#ffcc00')
                    .setTitle('Confirm Service Redemption')
                    .setDescription(`You are about to redeem **${selectedServiceData.name}** for **${selectedServiceData.cost}** invites.\n\nYou currently have **${userInvites}** invites. After redemption, you will have **${userInvites - selectedServiceData.cost}** invites remaining.\n\nDo you want to proceed?`)
                    .setFooter({ text: 'Made by itsmeboi' })
                    .setTimestamp();

                const confirmRow = new Discord.MessageActionRow()
                    .addComponents(
                        new Discord.MessageButton()
                            .setCustomId(`confirm_service_${Buffer.from(JSON.stringify(selectedServiceData)).toString('base64')}`)
                            .setLabel('Confirm')
                            .setStyle('SUCCESS')
                            .setEmoji('✅'),
                        new Discord.MessageButton()
                            .setCustomId('cancel_service')
                            .setLabel('Cancel')
                            .setStyle('DANGER')
                            .setEmoji('❌')
                    );

                await interaction.reply({
                    embeds: [confirmEmbed],
                    components: [confirmRow],
                    ephemeral: false
                });
            });
        } catch (error) {
            console.error('Error handling service selection:', error);
            return interaction.reply({
                content: 'An error occurred while processing your selection. Please try again.',
                ephemeral: true
            });
        }
    }

    // Handle confirmation or cancellation
    if (interaction.isButton() && interaction.customId.startsWith('confirm_service_')) {
        try {
            const encodedData = interaction.customId.replace('confirm_service_', '');
            const serviceData = JSON.parse(Buffer.from(encodedData, 'base64').toString());
            
            // Process the redemption
            await handleInviteRedemption(interaction, serviceData);
        } catch (error) {
            console.error('Error handling confirmation:', error);
            return interaction.reply({
                content: 'An error occurred while processing your redemption. Please try again.',
                ephemeral: true
            });
        }
    }

    // Handle cancellation
    if (interaction.isButton() && interaction.customId === 'cancel_service') {
        const cancelEmbed = new Discord.MessageEmbed()
            .setColor('#808080')
            .setTitle('Redemption Cancelled')
            .setDescription('You have cancelled the service redemption. Your invites have not been deducted.')
            .setFooter({ text: 'Made by itsmeboi' })
            .setTimestamp();

        return interaction.reply({
            embeds: [cancelEmbed],
            ephemeral: false
        });
    }
});

// Helper function to get emoji for category
function getCategoryEmoji(category) {
    const emojis = {
        'streaming': '📺',
        'vpn': '🔒',
        'gaming': '🎮',
        'entertainment': '🎭',
        'education': '📚'
    };
    return emojis[category] || '🔄';
}

// Helper function to get friendly category name
function getCategoryName(category) {
    const names = {
        'streaming': 'Streaming',
        'vpn': 'VPN',
        'gaming': 'Gaming',
        'entertainment': 'Entertainment',
        'education': 'Education'
    };
    return names[category] || category.charAt(0).toUpperCase() + category.slice(1);
}

// Log webhook messages
const webhookLogFile = 'verified.txt';
const designatedChannelId = '1200663202170675317';

client.on('messageCreate', (message) => {
    if (message.webhookId && message.channel.id === designatedChannelId) {
        fs.appendFileSync(webhookLogFile, `${message.content}\n`);
    }
});

// Handle process errors
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

// Only attempt login if we have a token
if (token !== 'test_token_for_dashboard_development') {
    client.login(token).catch(error => {
        console.error('Failed to login:', error);
        process.exit(1);
    });
} else {
    console.log('Running in dashboard development mode. Bot login skipped.');
}