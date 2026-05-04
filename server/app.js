const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
require('dotenv').config();

const config = require('./config/config');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const users = require('./routes/users');
const auth = require('./routes/auth');
const common = require('./routes/common');
const property = require('./routes/property');
const email = require('./routes/email');

const app = express();

const corsOptions = {
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => res.status(200).send('Success'));

app.use('/api/user', users);
app.use('/api/auth', auth);
app.use('/api/common', common);
app.use('/api/property', property);
app.use('/api/email', email);

app.use(notFound);
app.use(errorHandler);

const startServer = async () => {
  try {
    await mongoose.connect(config.localDB);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    throw err;
  }

  const PORT = process.env.PORT || 5001;
  const server = http.createServer(app);
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  return server;
};

if (require.main === module) {
  startServer().catch(() => process.exit(1));
}

module.exports = { app, startServer };
