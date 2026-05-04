const notFound = (req, res, next) => {
  const err = new Error('Route Not Found');
  err.status = 404;
  next(err);
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const status = err && err.status ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    message: (err && err.message) || 'Internal Server Error',
  });
};

module.exports = { notFound, errorHandler };
