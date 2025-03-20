const { MessageEmbed } = require('discord.js');
const fs = require('fs').promises;
const config = require('../../config.json');

module.exports = {
  name: 'stock',
  description: 'Display the server stock.',
  usage: 'stock',

  execute: async (message, args) => {
    try {
      const freeStock = await readDirectory(`${__dirname}/../../fstock/`);
      const premiumStock = await readDirectory(`${__dirname}/../../stock/`);
      const boosterStock = await readDirectory(`${__dirname}/../../bstock/`);
      const basicStock = await readDirectory(`${__dirname}/../../basicstock/`);

      const embed = new MessageEmbed()
        .setColor(config.color.default)
        .setTitle(`${message.guild.name} Service Stock`)
        .addField('FREE STOCK', freeStock.join('\n') || 'No services', true)
        .addField('PREMIUM STOCK', premiumStock.join('\n') || 'No services', true)
        .addField('BOOSTER STOCK', boosterStock.join('\n') || 'No services', true)
        .addField('BASIC STOCK', basicStock.join('\n') || 'No services', true);

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error in stock command:', error);
      await message.channel.send('An error occurred while processing the stock command.');
    }
  },
};

async function readDirectory(directoryPath) {
  try {
    const files = await fs.readdir(directoryPath);
    const stock = [];

    for (const file of files) {
      if (file.endsWith('.txt')) {
        const acc = await fs.readFile(`${directoryPath}/${file}`, 'utf-8');
        const lines = acc.split(/\r?\n/).filter(Boolean);
        if (lines.length > 0) {  // Only add if file has content
          stock.push(`${file.replace('.txt', '')} (${lines.length})`);
        }
      }
    }

    return stock;
  } catch (error) {
    console.error(`Unable to read directory ${directoryPath}:`, error);
    return [];
  }
}