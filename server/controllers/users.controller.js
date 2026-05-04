const users = require('../models/users');
const { ensureSelfOrAdmin } = require('../middleware/requireAuth');

module.exports = {
  getUserDetails: async (req, res, next) => {
    try {
      if (!ensureSelfOrAdmin(req, res, req.params.userId)) return;

      const result = await users
        .findOne({ _id: req.params.userId })
        .select('-password')
        .populate('city', 'name')
        .populate('state', 'name');
      if (!result) return res.status(404).json({ message: 'User not found' });
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  },
};
