const express = require('express');
const multer = require('multer');

const router = express.Router();
const propertyController = require('../controllers/property.controller');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/type', propertyController.propertyTypeList);
router.post('/type', propertyController.addPropertyType);

router.post('/new', upload.array("propImages"), propertyController.addNewProperty);
router.get('/list/:userId', propertyController.getUserList);
router.get('/list/', propertyController.getFullList);
router.get('/single/:propertySlug', propertyController.getSingleProperty);
router.get('/showGFSImage/:filename', propertyController.showGFSImage);
router.post('/markAsSold/:propertySlug', propertyController.markAsSold);

router.get('/filter', propertyController.filterProperties);

module.exports = router;