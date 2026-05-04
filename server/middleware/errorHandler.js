const multer = require('multer');

const notFound = (req, res, next) => {
  const err = new Error('Route Not Found');
  err.status = 404;
  next(err);
};

const MULTER_STATUS = {
  LIMIT_FILE_SIZE: 413,
  LIMIT_FILE_COUNT: 413,
  LIMIT_FIELD_COUNT: 400,
  LIMIT_FIELD_SIZE: 400,
  LIMIT_PART_COUNT: 400,
  LIMIT_UNEXPECTED_FILE: 400,
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const status = MULTER_STATUS[err.code] || 400;
    return res.status(status).json({ message: err.message, code: err.code });
  }
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message });
  }
  if (err && err.name === 'CastError') {
    return res.status(400).json({ message: `Invalid ${err.path || 'id'}` });
  }
  if (err && err.code === 11000) {
    return res.status(409).json({ message: 'Duplicate key' });
  }

  const status = err && err.status ? err.status : 500;
  if (status >= 500) console.error(err);
  return res.status(status).json({
    message: (err && err.message) || 'Internal Server Error',
  });
};

module.exports = { notFound, errorHandler };
