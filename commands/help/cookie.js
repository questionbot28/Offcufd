
const { MessageEmbed } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    name: 'cookie',
    description: 'Shows cookie usage instructions',
    execute(message, args) {
        const embed = new MessageEmbed()
            .setColor(config.color.default)
            .setDescription('How to Use a Cookie:\nStep 1: Make sure you are on a PC\nStep 2: Download the extension called Cookie Editor [link](https://cookie-editor.com/)\nStep 3: Go to the Netflix website and pin Cookie Editor\nStep 4: Delete all cookies (the bin icon) and then press import and copy the thing we gave you\nStep 5: After import, just click refresh on the whole page, and you should be logged in\nStep 6: Enjoy!!!')
            .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) });

        message.channel.send({ embeds: [embed] });
    }
};
