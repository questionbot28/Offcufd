
const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'verify',
    description: 'Shows verification instructions',
    execute(message, args) {
        const embed = new MessageEmbed()
            .setColor(config.color.default)
            .setDescription('🔒 Verify using this link:\n✅ Step 1: Click [here to verify](https://link-center.net/1317305/wrecked-gen)\n✅ Step 2: Choose "Free Access with Ads."\n✅ Step 3: You will be redirected to a Google Form.\n✅ Step 4: Enter your Discord username and submit the form!\n\n🌟 Congratulations, you\'re now verified and ready to enjoy our server to the fullest! If you encounter any issues, feel free to ask for assistance. We\'re here to help! 🔆')
            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) });

        message.channel.send({ embeds: [embed] });
    }
};
