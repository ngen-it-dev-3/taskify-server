const Counter = require('../../models/rfq/Counter');

async function generateRfqNumber() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const key = `rfq-${yy}${mm}${dd}`;

  const counter = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return `${yy}${mm}${dd}-${counter.seq}`;
}

module.exports = { generateRfqNumber };