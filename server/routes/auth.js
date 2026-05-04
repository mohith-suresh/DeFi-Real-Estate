const express = require('express');

const authC = require('../controllers/auth.controller');
const { requireAuth, requireAdmin } = require('../middleware/requireAuth');

const router = express.Router();

router.post('/user/login', authC.userLogin);
router.post('/user/register', authC.userRegistration);
router.get('/admin/userList', requireAuth, requireAdmin, authC.userList);
router.put('/admin/changePass', requireAuth, authC.changePass);

module.exports = router;
