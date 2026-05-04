const state_model = require('../models/state');
const city_model = require('../models/city');
const users = require('../models/users');

module.exports = {
  getStateList: async (req, res, next) => {
    try {
      const data = await state_model.find({ is_active: true });
      return res.status(200).json(data);
    } catch (err) {
      return next(err);
    }
  },

  addState: async (req, res, next) => {
    try {
      const state = new state_model({ name: (req.body || {}).name });
      await state.save();
      return res.status(200).json({ message: 'State added successfully' });
    } catch (err) {
      return next(err);
    }
  },

  getAllCities: async (req, res, next) => {
    try {
      const data = await city_model.find({ is_active: true }).populate('state_id', 'name');
      return res.status(200).json(data);
    } catch (err) {
      return next(err);
    }
  },

  getCityList: async (req, res, next) => {
    try {
      const data = await city_model
        .find({ state_id: req.params.state_id, is_active: true })
        .populate('state_id', 'name');
      return res.status(200).json(data);
    } catch (err) {
      return next(err);
    }
  },

  addCity: async (req, res, next) => {
    try {
      const { state_id } = req.body || {};
      if (state_id) {
        const stateExists = await state_model.exists({ _id: state_id });
        if (!stateExists) {
          return res.status(400).json({ message: 'Referenced state does not exist' });
        }
      }
      const city = new city_model(req.body);
      const result = await city.save();
      return res.status(200).json({ message: 'City added successfully', id: result._id });
    } catch (err) {
      return next(err);
    }
  },

  removeCity: async (req, res, next) => {
    try {
      const result = await city_model.deleteOne({ _id: req.params.cityId });
      if (result.deletedCount === 0) {
        return res.status(404).json({ message: 'City not found' });
      }
      return res.status(200).json({ message: 'City removed successfully' });
    } catch (err) {
      return next(err);
    }
  },

  checkemailAvailability: async (req, res, next) => {
    try {
      const exists = await users.exists({ email: req.params.email });
      return res.status(200).json({ response: Boolean(exists) });
    } catch (err) {
      return next(err);
    }
  },
};
