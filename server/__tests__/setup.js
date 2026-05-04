const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongo;

const connectInMemoryDB = async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
};

const disconnectInMemoryDB = async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
};

const clearCollections = async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
};

module.exports = { connectInMemoryDB, disconnectInMemoryDB, clearCollections };
