
const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'verify',
    description: 'Shows verification instructions',
    execute(message, args) {
        const embed = new MessageEmbed()
            .setColor(config.color.default)
            .setTitle('🔒 Discord Verification System')
            .setDescription('**How to Verify Your Account:**\n\n✅ Step 1: Click [here to verify](https://direct-link.net/1317305/wrecked-verification)\n✅ Step 2: Choose "Free Access with Ads"\n✅ Step 3: Complete the steps and you\'ll be redirected to a Google Form\n✅ Step 4: Enter your **exact** Discord username and submit!\n\n⚠️ **IMPORTANT:** Your username must match exactly what appears in Discord\n\n🌟 Once verified, you\'ll have access to all services. If you open a ticket, your verification will be consumed and you\'ll need to verify again.\n\n🆘 Need help? Contact a staff member for assistance!')
            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    }
};
