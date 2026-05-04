const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongo;

const connectInMemoryDB = async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  // Ensure each model's declared indexes (incl. compound ones like the
  // (name, state_id) unique on City) are realised in the in-memory db
  // before any test relies on them.
  await Promise.all(
    Object.values(mongoose.models).map((m) => m.syncIndexes())
  );
};

const disconnectInMemoryDB = async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
};

const clearCollections = async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
};

// Mint a JWT in the same shape as auth.controller.js does on login.
// `user` may be a Mongoose doc, a plain object with `_id`, or omitted (test-only id).
const tokenFor = (user, { isAdmin = false } = {}) => {
  const { secretKey } = require('../config/config');
  const payload = {
    user: {
      _id: user ? String(user._id) : new mongoose.Types.ObjectId().toString(),
      email: (user && user.email) || 'u@x.com',
      isAdmin,
    },
  };
  return jwt.sign(payload, secretKey, { expiresIn: '1h' });
};

// 1x1 valid PNG, used by upload-related tests.
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6300010000000500010d0a2db40000000049454e44ae426082',
  'hex'
);

module.exports = {
  connectInMemoryDB,
  disconnectInMemoryDB,
  clearCollections,
  tokenFor,
  TINY_PNG,
};
