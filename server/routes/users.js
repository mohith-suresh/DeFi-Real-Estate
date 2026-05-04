const express = require('express');

const userController = require('../controllers/users.controller');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/:userId', requireAuth, userController.getUserDetails);

module.exports = router;
