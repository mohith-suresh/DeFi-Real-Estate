const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const propertyController = require('../controllers/property.controller');
const { requireAuth, requireAdmin } = require('../middleware/requireAuth');
const { MIME_TO_EXT } = require('../providers/imageTypes');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'properties');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype];
    if (!ext) return cb(new Error('Unsupported file type'));
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (MIME_TO_EXT[file.mimetype]) return cb(null, true);
  const err = new Error('Only JPG/PNG/WEBP/GIF images are allowed');
  err.status = 415;
  cb(err);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
});

router.get('/type', propertyController.propertyTypeList);
router.post('/type', requireAuth, requireAdmin, propertyController.addPropertyType);

router.post('/new', requireAuth, upload.array('propImages'), propertyController.addNewProperty);
router.get('/list/:userId', propertyController.getUserList);
router.get('/list/', propertyController.getFullList);
router.get('/single/:propertySlug', propertyController.getSingleProperty);
router.get('/showGFSImage/:filename', propertyController.showGFSImage);
router.post('/markAsSold/:propertySlug', requireAuth, propertyController.markAsSold);

router.get('/filter', propertyController.filterProperties);

module.exports = router;
