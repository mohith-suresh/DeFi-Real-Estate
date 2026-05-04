const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

const helpers = require('../providers/helper');
const propertyType = require('../models/propertyTypes');
const Property = require('../models/property');
const { ensureSelfOrAdmin } = require('../middleware/requireAuth');
const { EXT_TO_MIME, sniffMime } = require('../providers/imageTypes');

const SNIFF_BYTES = 16;

const readHead = async (filePath) => {
  const fh = await fsp.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await fh.read(buf, 0, SNIFF_BYTES, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
};

const parseBool = (v) => v === true || v === 'true' || v === '1' || v === 1;

const unlinkUploads = (files) => {
  for (const f of files || []) {
    if (f && f.path) {
      fs.unlink(f.path, () => {});
    }
  }
};

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads', 'properties');

const populateProperty = (q, { withUser = false } = {}) => {
  const populated = q
    .populate('city', 'name')
    .populate('state', 'name')
    .populate('type', 'title');
  return withUser ? populated.populate('userId', 'fname lname email') : populated;
};

module.exports = {
  propertyTypeList: async (req, res, next) => {
    try {
      const result = await propertyType.find({ is_active: true });
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  },

  addPropertyType: async (req, res, next) => {
    try {
      const proptyp = new propertyType({
        title: req.body.title,
        type: req.body.type,
        createdOn: new Date(),
      });
      const result = await proptyp.save();
      return res.status(200).json({ message: 'Property type added successfully', id: result._id });
    } catch (err) {
      return next(err);
    }
  },

  addNewProperty: async (req, res, next) => {
    try {
      // The client-declared MIME (already filtered by multer) is forgeable.
      // Confirm each upload's bytes match its declared format before we accept
      // it. Bad files are deleted; the request fails with 415.
      const heads = await Promise.all((req.files || []).map((f) => readHead(f.path)));
      const mismatch = (req.files || []).find((f, i) => sniffMime(heads[i]) !== f.mimetype);
      if (mismatch) {
        unlinkUploads(req.files);
        return res.status(415).json({
          message: 'Uploaded file does not match its declared image type',
        });
      }

      const imgs = (req.files || []).map((f) => f.filename);
      const slug = await helpers.slugGenerator(req.body.title, 'title', 'property');
      const isSociety = parseBool(req.body.isSociety);

      const payload = {
        ...req.body,
        slug,
        cornrPlot: parseBool(req.body.cornrPlot),
        isSociety,
        images: imgs,
        imgPath: 'properties',
        userId: req.user._id,
      };
      if (!isSociety) {
        payload.flatNo = '';
        payload.societyName = '';
      }

      const result = await new Property(payload).save();
      if (!result || !result._id || !result.slug) {
        throw new Error('Failed to save property');
      }
      return res.status(200).json({ result, message: 'Your property has been successfully posted' });
    } catch (err) {
      unlinkUploads(req.files);
      return next(err);
    }
  },

  getUserList: async (req, res, next) => {
    try {
      const result = await populateProperty(
        Property.find({ isActive: true, userId: req.params.userId })
      );
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  },

  getSingleProperty: async (req, res, next) => {
    try {
      const result = await populateProperty(Property.findOne({ slug: req.params.propertySlug }));
      if (!result) return res.status(404).json({ message: 'Property not found' });
      return res.status(200).json({ result, files: result.images || [] });
    } catch (err) {
      return next(err);
    }
  },

  getFullList: async (req, res, next) => {
    try {
      const result = await populateProperty(Property.find({ isActive: true }), { withUser: true });
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  },

  markAsSold: async (req, res, next) => {
    try {
      const property = await Property.findOne({ slug: req.params.propertySlug });
      if (!property) return res.status(404).json({ message: 'Property not found' });
      if (!ensureSelfOrAdmin(req, res, property.userId)) return;

      property.status = req.body.status;
      await property.save();
      return res.status(200).json({ message: 'Property has been updated Successfully' });
    } catch (err) {
      return next(err);
    }
  },

  filterProperties: async (req, res, next) => {
    try {
      const query = { isActive: true };
      if (req.query.propertyFor) query.propertyFor = { $in: req.query.propertyFor.split(',') };
      if (req.query.type) query.type = { $in: req.query.type.split(',') };
      if (req.query.city) query.city = { $in: req.query.city.split(',') };
      if (req.query.userId) query.userId = req.query.userId;
      if (req.query.notUserId) query.userId = { $ne: req.query.notUserId };
      if (req.query.status) query.status = { $in: req.query.status.split(',') };

      const result = await populateProperty(Property.find(query), { withUser: true });
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  },

  showGFSImage: (req, res) => {
    const safeName = path.basename(req.params.filename || '');
    const ext = path.extname(safeName).toLowerCase();
    const mime = EXT_TO_MIME[ext];
    if (!safeName || !mime) return res.status(400).json({ message: 'Invalid filename' });

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(mime);
    return res.sendFile(path.join(UPLOADS_ROOT, safeName), (err) => {
      if (err && !res.headersSent) {
        const status = err.code === 'ENOENT' ? 404 : 500;
        res.status(status).json({ message: status === 404 ? 'No file exists' : 'Could not send file' });
      }
    });
  },
};
