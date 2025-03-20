const bcrypt = require('bcrypt');

async function generateHash() {
  try {
    const saltRounds = 10;
    const password = 'admin123';
    const hash = await bcrypt.hash(password, saltRounds);
    console.log('Password:', password);
    console.log('Generated hash:', hash);
  } catch (error) {
    console.error('Error generating hash:', error);
  }
}

generateHash();