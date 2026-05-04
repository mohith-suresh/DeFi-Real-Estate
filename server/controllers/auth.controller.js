const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const userM = require("../models/users");
const { secretKey } = require("../config/config");

module.exports = {
  userLogin: async (req, res) => {
    try {
      const { emailPhone, password } = req.body || {};
      if (!emailPhone || !password) {
        return res.status(400).json({ message: "Provide all Credentials" });
      }
      const loginType = isNaN(emailPhone) ? "email" : "phoneNo";
      const data = await userM.findOne({ [loginType]: emailPhone });
      if (!data) return res.status(401).json({ message: "Invalid Credentials" });

      const passMatch = await bcrypt.compare(password, data.password);
      if (!passMatch) return res.status(401).json({ message: "Invalid Credentials" });

      const jwtData = {
        _id: data._id,
        fname: data.fname,
        lname: data.lname,
        email: data.email,
        isAdmin: data.isAdmin,
      };
      const token = jwt.sign({ user: jwtData }, secretKey);
      return res.status(200).json({ message: "Login Successful", token });
    } catch (err) {
      return res.status(400).send(err);
    }
  },

  userRegistration: async (req, res) => {
    try {
      const hash = await bcrypt.hash(req.body.password, 10);
      const user = new userM();
      user.fname = req.body.fname;
      user.lname = req.body.lname;
      user.email = req.body.email;
      user.phoneNo = req.body.phoneNo;
      user.state = req.body.state;
      user.city = req.body.city;
      user.pincode = req.body.pincode;
      user.userType = req.body.user_type;
      user.password = hash;
      user.createdOn = new Date();

      const data = await user.save();
      return res.status(200).json({ message: "User Added Successfully", id: data._id });
    } catch (err) {
      return res.status(400).send(err);
    }
  },

  userList: (req, res) => {
    userM.find().exec((err, data) => {
      if (err)
        res.status(400).json({ message: "Something Went Wrong", data: err });
      else res.status(200).json({ message: "Success", data });
    });
  },
  changePass: (req, res) => {
    userM.findOne({ _id: req.body._id }).exec((err, resp) => {
      if (err)
        res.status(400).json({ message: "Something Went Wrong", data: err });
      else {
        bcrypt.hash(req.body.password, 10, (err, hash) => {
          if (err) res.status(400).send(err);
          else {
            userM
              .updateOne({ _id: req.body._id }, { password: hash })
              .exec((err, resp) => {
                if (err)
                  res
                    .status(400)
                    .json({ message: "Something Went Wrong", data: err });
                else
                  res
                    .status(200)
                    .json({
                      message: "Password Changed Successfully",
                      id: resp
                    });
              });
          }
        });
      }
    });
  }
};
