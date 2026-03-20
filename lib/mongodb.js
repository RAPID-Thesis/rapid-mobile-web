const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const client = new MongoClient(uri);

/**
 * Connect to MongoDB and return the database.
 * @param {string} [dbName='rapid'] - Database name
 * @returns {Promise<import('mongodb').Db>}
 */
async function connectDB(dbName = 'rapid') {
  await client.connect();
  return client.db(dbName);
}

module.exports = { client, connectDB };
