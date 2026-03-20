require('dotenv').config();
const { connectDB } = require('../lib/mongodb');

async function main() {
  try {
    const db = await connectDB();
    const collections = await db.listCollections().toArray();
    console.log('Connected to MongoDB!');
    console.log('Collections:', collections.map((c) => c.name).join(', ') || '(none yet)');
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  }
  process.exit(0);
}

main();
