const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userM = require('../models/users');
const helpers = require('../providers/helper');
const { secretKey } = require('../config/config');

const buildTokenPayload = (user) => ({
  _id: user._id,
  fname: user.fname,
  lname: user.lname,
  email: user.email,
  isAdmin: user.isAdmin,
});

module.exports = {
  userLogin: async (req, res, next) => {
    try {
      const { emailPhone, password } = req.body || {};
      if (!emailPhone || !password) {
        return res.status(400).json({ message: 'Provide all Credentials' });
      }

      const loginType = isNaN(emailPhone) ? 'email' : 'phoneNo';
      const user = await userM.findOne({ [loginType]: emailPhone });
      if (!user) return res.status(401).json({ message: 'Invalid Credentials' });

      const passMatch = await bcrypt.compare(password, user.password);
      if (!passMatch) return res.status(401).json({ message: 'Invalid Credentials' });

      const token = jwt.sign({ user: buildTokenPayload(user) }, secretKey, { expiresIn: '7d' });
      return res.status(200).json({ message: 'Login Successful', token });
    } catch (err) {
      return next(err);
    }
  },

  userRegistration: async (req, res, next) => {
    try {
      const body = req.body || {};
      const missing = helpers.isKeyMissing(body, ['fname', 'lname', 'email', 'phoneNo', 'password']);
      if (missing) return res.status(400).json({ message: `${missing} is required` });

      const hash = await bcrypt.hash(body.password, 10);
      const user = new userM({
        fname: body.fname,
        lname: body.lname,
        email: body.email,
        phoneNo: body.phoneNo,
        state: body.state,
        city: body.city,
        pincode: body.pincode,
        userType: body.user_type,
        password: hash,
        createdOn: new Date(),
      });

      const saved = await user.save();
      return res.status(200).json({ message: 'User Added Successfully', id: saved._id });
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ message: 'Email or phone already in use' });
      }
      return next(err);
    }
  },

  userList: async (req, res, next) => {
    try {
      const data = await userM.find().select('-password');
      return res.status(200).json({ message: 'Success', data });
    } catch (err) {
      return next(err);
    }
  },

  changePass: async (req, res, next) => {
    try {
      if (!req.user || !req.user._id) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      const { password } = req.body || {};
      if (!password) return res.status(400).json({ message: 'password is required' });

      const hash = await bcrypt.hash(password, 10);
      const result = await userM.updateOne({ _id: req.user._id }, { password: hash });
      if (result.matchedCount === 0) {
        return res.status(404).json({ message: 'User not found' });
      }
      return res.status(200).json({ message: 'Password Changed Successfully' });
    } catch (err) {
      return next(err);
    }
  },
};
