const Discord = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../../config.json');

// Initialize database with proper path resolution
const dbPath = path.join(__dirname, '../../vouches.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to vouches database:', err);
    } else {
        console.log('Connected to vouches database');
        // Create table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS vouches (
            user_id TEXT PRIMARY KEY,
            vouches INTEGER DEFAULT 0,
            negvouches INTEGER DEFAULT 0,
            todayvouches INTEGER DEFAULT 0,
            last3daysvouches INTEGER DEFAULT 0,
            lastweekvouches INTEGER DEFAULT 0,
            reasons TEXT DEFAULT '[]',
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`, (createError) => {
            if (createError) {
                console.error('Error creating vouches table:', createError);
            } else {
                console.log('Vouches table ready');
            }
        });
    }
});

module.exports = {
    name: 'managevouch',
    description: 'Shows cookie stock count',
    usage: '+managevouch <@user> <-number / +number>',
    examples: [
        '+managevouch @user +1',    // Add 1 vouch
        '+managevouch @user -1',    // Remove 1 vouch
        '+managevouch @user +5',    // Add 5 vouches
    ],

    execute: function (message, args) {
        try {
            // Enhanced role checking with detailed logging
            const allowedRoleIDs = [
                '1348251264336527414', // Co-owner
                '1348251264336527416'  // Owner
            ];
            console.log(`Checking roles for user ${message.author.tag}`);
            console.log(`Allowed roles:`, allowedRoleIDs);
            console.log(`User roles:`, message.member.roles.cache.map(r => r.id));

            // Check if user has required role
            if (!message.member.roles.cache.some(role => allowedRoleIDs.includes(role.id))) {
                return message.reply({
                    embeds: [
                        new Discord.MessageEmbed()
                            .setColor('#ff0000')
                            .setTitle('Permission Denied')
                            .setDescription(`You don't have permission to manage vouches. Required roles: ${allowedRoleIDs.map(roleId => `<@&${roleId}>`).join(', ')}`)
                    ]
                });
            }

            // Validate command usage
            if (!message.mentions.users.size || args.length < 2) {
                const exampleEmbed = new Discord.MessageEmbed()
                    .setColor('#ff9900')
                    .setTitle('Vouch Management Usage')
                    .setDescription('How to use the vouch management command:')
                    .addFields([
                        { name: 'Format', value: '`+managevouch @user <+/- number>`' },
                        { name: 'Examples', value: this.examples.join('\n') },
                        { name: 'Notes', value: '- You must have the required roles\n- The number can be positive or negative\n- Vouches cannot go below 0' }
                    ]);
                return message.reply({ embeds: [exampleEmbed] });
            }

            const mentionedUser = message.mentions.users.first();
            const vouchChange = parseInt(args[1]);

            // Validate vouch change value
            if (isNaN(vouchChange)) {
                return message.reply({
                    embeds: [
                        new Discord.MessageEmbed()
                            .setColor('#ff0000')
                            .setTitle('Invalid Input')
                            .setDescription('Please provide a valid number for vouch change.')
                    ]
                });
            }

            console.log(`Attempting to update vouches for user ${mentionedUser.tag}`);
            console.log(`Vouch change requested: ${vouchChange}`);

            // Check if user exists in database
            db.get('SELECT * FROM vouches WHERE user_id = ?', [mentionedUser.id], (err, row) => {
                if (err) {
                    console.error('Error checking vouches:', err);
                    return message.reply({
                        embeds: [
                            new Discord.MessageEmbed()
                                .setColor('#ff0000')
                                .setTitle('Database Error')
                                .setDescription('An error occurred while checking vouches.')
                        ]
                    });
                }

                // If user doesn't exist, create new entry
                if (!row) {
                    console.log(`Creating new vouch entry for user ${mentionedUser.tag}`);
                    db.run('INSERT INTO vouches (user_id, vouches) VALUES (?, 0)', [mentionedUser.id]);
                    row = { vouches: 0 };
                }

                const newVouchCount = Math.max(0, row.vouches + vouchChange);
                console.log(`Current vouches: ${row.vouches}, New vouch count: ${newVouchCount}`);

                // Update the vouch count
                db.run(
                    'UPDATE vouches SET vouches = ?, last_updated = CURRENT_TIMESTAMP WHERE user_id = ?',
                    [newVouchCount, mentionedUser.id],
                    (updateError) => {
                        if (updateError) {
                            console.error('Error updating vouches:', updateError);
                            return message.reply({
                                embeds: [
                                    new Discord.MessageEmbed()
                                        .setColor('#ff0000')
                                        .setTitle('Update Error')
                                        .setDescription('An error occurred while updating vouches.')
                                ]
                            });
                        }

                        console.log(`Successfully updated vouches for ${mentionedUser.tag}`);

                        // Send success message
                        const vouchEmbed = new Discord.MessageEmbed()
                            .setColor('#00ff00')
                            .setTitle('Vouch Management')
                            .setDescription(
                                `Successfully updated vouches for ${mentionedUser.tag}\n` +
                                `Previous count: ${row.vouches}\n` +
                                `Change: ${vouchChange > 0 ? '+' : ''}${vouchChange}\n` +
                                `New count: ${newVouchCount}`
                            )
                            .setTimestamp()
                            .setFooter({ 
                                text: `Updated by ${message.author.tag}`, 
                                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                            });

                        message.reply({ embeds: [vouchEmbed] });
                    }
                );
            });
        } catch (error) {
            console.error('Error in managevouch command:', error);
            message.reply({
                embeds: [
                    new Discord.MessageEmbed()
                        .setColor('#ff0000')
                        .setTitle('Error')
                        .setDescription('An unexpected error occurred while managing vouches.')
                ]
            });
        }
    },
};