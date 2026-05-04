const express = require('express');

const commonController = require('../controllers/common.controller');
const { requireAuth, requireAdmin } = require('../middleware/requireAuth');

const router = express.Router();

const adminOnly = [requireAuth, requireAdmin];

router
  .route('/state')
  .get(commonController.getStateList)
  .post(adminOnly, commonController.addState);

router
  .route('/cities')
  .get(commonController.getAllCities)
  .post(adminOnly, commonController.addCity);

router.get('/cities/:state_id', commonController.getCityList);
router.delete('/city/:cityId', adminOnly, commonController.removeCity);
router.get('/checkemail-availability/email/:email', commonController.checkemailAvailability);

module.exports = router;
