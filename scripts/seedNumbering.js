// scripts/seedNumbering.js
require('dotenv').config();
const mongoose = require('mongoose');
const NumberingSettings = require('../src/models/NumberingSettings.model');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const existing = await NumberingSettings.findOne({ key: 'global' });
  if (!existing) {
    await NumberingSettings.create({ key: 'global' });
    console.log('✅ Seeded NumberingSettings singleton');
  } else {
    console.log('ℹ️  Already exists');
  }
  await mongoose.disconnect();
})();