module.exports = {
  secretKey: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
  localDB: process.env.MONGO_URL || 'mongodb://localhost/realestatedb',
};
