// commands/help/gwhelp.js
const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'gwhelp',
    description: 'Display giveaway help information',
    usage: 'gwhelp',
    
    execute(message) {
        const embed = new MessageEmbed()
            .setColor(config.color.blue)
            .setTitle('🎉 Giveaway System Help')
            .setDescription('The giveaway system allows staff members to create and manage giveaways for accounts.')
            .addField('For Staff Members', 
                '`.gw create <account_name> <time_in_minutes>` - Create a new giveaway\n' +
                '`.addacc <giveaway_id> <account_details>` - Add account details to a giveaway'
            )
            .addField('For Members', 
                '- Click the "Join Giveaway" button to enter a giveaway\n' +
                '`.claim <claim_code>` - Claim a prize you\'ve won'
            )
            .addField('How It Works',
                '1. Staff creates a giveaway with `.gw create`\n' +
                '2. Staff receives a giveaway ID via DM\n' +
                '3. Staff adds account details with `.addacc`\n' +
                '4. Members join by clicking the button\n' +
                '5. When the giveaway ends, a winner is randomly chosen\n' +
                '6. The winner receives a claim code via DM\n' +
                '7. The winner can claim their prize with `.claim`'
            )
            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTimestamp();
            
        message.channel.send({ embeds: [embed] });
    }
};