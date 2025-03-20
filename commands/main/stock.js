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

      // Count total items in each stock category
      const freeCount = await countTotalItems(`${__dirname}/../../fstock/`);
      const premiumCount = await countTotalItems(`${__dirname}/../../stock/`);
      const boosterCount = await countTotalItems(`${__dirname}/../../bstock/`);
      const basicCount = await countTotalItems(`${__dirname}/../../basicstock/`);
      
      // Function to format stock entries with total count
      const formatStockField = (title, count, stockItems) => {
        const stockText = stockItems.length > 0 ? `\n${stockItems.join('\n')}` : '';
        return { name: title, value: `Total Items: ${count}${stockText}`, inline: true };
      };
      
      const embed = new MessageEmbed()
        .setColor(config.color.default)
        .setTitle(`${message.guild.name} Service Stock`)
        .addFields([
          formatStockField('FREE STOCK', freeCount, freeStock),
          formatStockField('PREMIUM STOCK', premiumCount, premiumStock),
          formatStockField('BOOSTER STOCK', boosterCount, boosterStock),
          formatStockField('BASIC STOCK', basicCount, basicStock)
        ]);

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

/**
 * Count the total number of non-empty lines across all .txt files in a directory
 * @param {string} directoryPath - Path to the directory containing .txt files
 * @returns {number} - Total count of items
 */
async function countTotalItems(directoryPath) {
  try {
    const files = await fs.readdir(directoryPath);
    let totalCount = 0;

    for (const file of files) {
      if (file.endsWith('.txt')) {
        const content = await fs.readFile(`${directoryPath}/${file}`, 'utf-8');
        const lines = content.split(/\r?\n/).filter(Boolean);
        totalCount += lines.length;
      }
    }

    return totalCount;
  } catch (error) {
    console.error(`Unable to count items in directory ${directoryPath}:`, error);
    return 0;
  }
}