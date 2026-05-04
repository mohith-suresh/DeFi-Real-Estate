const request = require('supertest');
const fs = require('fs');
const path = require('path');

process.env.JWT_SECRET = 'test-secret';

const { app } = require('../app');
const Property = require('../models/property');
const propertyType = require('../models/propertyTypes');
const userM = require('../models/users');
const {
  connectInMemoryDB,
  disconnectInMemoryDB,
  clearCollections,
  tokenFor,
  TINY_PNG,
} = require('./setup');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads', 'properties');

beforeAll(connectInMemoryDB);
afterAll(disconnectInMemoryDB);
afterEach(async () => {
  await clearCollections();
  if (fs.existsSync(UPLOADS_ROOT)) {
    for (const f of fs.readdirSync(UPLOADS_ROOT)) {
      try {
        fs.unlinkSync(path.join(UPLOADS_ROOT, f));
      } catch (_) {
        // best-effort cleanup
      }
    }
  }
});

const seedUser = (overrides = {}) =>
  userM.create({
    fname: 'Owner',
    lname: 'One',
    email: `${Math.random().toString(36).slice(2)}@x.com`,
    phoneNo: String(Math.floor(Math.random() * 1e12)),
    password: 'hash',
    ...overrides,
  });

const seedProperty = async (overrides = {}) => {
  const owner = overrides.owner || (await seedUser());
  delete overrides.owner;
  return Property.create({
    title: 'Cosy Cottage',
    propertyFor: 'sell',
    locality: 'Downtown',
    length: 30,
    breadth: 40,
    address: '1 Main St',
    email: 'lister@example.com',
    phoneNo: '5550001111',
    pincode: '12345',
    userId: owner._id,
    slug: 'cosy-cottage',
    ...overrides,
  });
};

describe('POST /api/property/type (admin only)', () => {
  it('rejects unauthenticated with 401', async () => {
    const res = await request(app).post('/api/property/type').send({ title: 'House', type: 'residential' });
    expect(res.status).toBe(401);
  });

  it('rejects non-admin with 403', async () => {
    const user = await seedUser();
    const res = await request(app)
      .post('/api/property/type')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ title: 'House', type: 'residential' });
    expect(res.status).toBe(403);
  });

  it('rejects when required `type` is missing (admin → 400)', async () => {
    const admin = await seedUser();
    const res = await request(app)
      .post('/api/property/type')
      .set('Authorization', `Bearer ${tokenFor(admin, { isAdmin: true })}`)
      .send({ title: 'House' });
    expect(res.status).toBe(400);
  });

  it('rejects values outside the enum (admin → 400)', async () => {
    const admin = await seedUser();
    const res = await request(app)
      .post('/api/property/type')
      .set('Authorization', `Bearer ${tokenFor(admin, { isAdmin: true })}`)
      .send({ title: 'Foo', type: 'industrial' });
    expect(res.status).toBe(400);
  });

  it('persists a valid type when called by an admin', async () => {
    const admin = await seedUser();
    const res = await request(app)
      .post('/api/property/type')
      .set('Authorization', `Bearer ${tokenFor(admin, { isAdmin: true })}`)
      .send({ title: 'House', type: 'residential' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
  });

  it('rejects when title is missing with 400 (admin)', async () => {
    const admin = await seedUser();
    const res = await request(app)
      .post('/api/property/type')
      .set('Authorization', `Bearer ${tokenFor(admin, { isAdmin: true })}`)
      .send({ type: 'residential' });
    expect(res.status).toBe(400);
    expect(await propertyType.countDocuments()).toBe(0);
  });
});

describe('GET /api/property/single/:slug', () => {
  it('returns 404 on a missing slug', async () => {
    const res = await request(app).get('/api/property/single/no-such-slug');
    expect(res.status).toBe(404);
  });

  it('returns the property and its image filenames when it exists', async () => {
    await seedProperty({ images: ['abc.png'] });
    const res = await request(app).get('/api/property/single/cosy-cottage');
    expect(res.status).toBe(200);
    expect(res.body.result.title).toBe('Cosy Cottage');
    expect(res.body.files).toEqual(['abc.png']);
  });
});

describe('POST /api/property/markAsSold/:slug', () => {
  it('rejects unauthenticated requests with 401', async () => {
    await seedProperty();
    const res = await request(app)
      .post('/api/property/markAsSold/cosy-cottage')
      .send({ status: 'sold' });
    expect(res.status).toBe(401);
  });

  it('returns 404 on a missing slug', async () => {
    const owner = await seedUser();
    const res = await request(app)
      .post('/api/property/markAsSold/no-such-slug')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ status: 'sold' });
    expect(res.status).toBe(404);
  });

  it('rejects non-owner non-admin with 403', async () => {
    const owner = await seedUser();
    await seedProperty({ owner });
    const stranger = await seedUser();
    const res = await request(app)
      .post('/api/property/markAsSold/cosy-cottage')
      .set('Authorization', `Bearer ${tokenFor(stranger)}`)
      .send({ status: 'sold' });
    expect(res.status).toBe(403);
    const after = await Property.findOne({ slug: 'cosy-cottage' });
    expect(after.status).toBe('available');
  });

  it('allows the owner to update', async () => {
    const owner = await seedUser();
    await seedProperty({ owner });
    const res = await request(app)
      .post('/api/property/markAsSold/cosy-cottage')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ status: 'sold' });
    expect(res.status).toBe(200);
    const after = await Property.findOne({ slug: 'cosy-cottage' });
    expect(after.status).toBe('sold');
  });

  it('allows an admin to update someone else\'s listing', async () => {
    const owner = await seedUser();
    await seedProperty({ owner });
    const admin = await seedUser();
    const res = await request(app)
      .post('/api/property/markAsSold/cosy-cottage')
      .set('Authorization', `Bearer ${tokenFor(admin, { isAdmin: true })}`)
      .send({ status: 'sold' });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/property/filter', () => {
  it('hides inactive listings by default', async () => {
    await seedProperty();
    await seedProperty({ slug: 'second', title: 'Second', isActive: false });
    const res = await request(app).get('/api/property/filter');
    expect(res.status).toBe(200);
    expect(res.body.map((p) => p.slug)).toEqual(['cosy-cottage']);
  });

  it('filters by status with comma-separated values', async () => {
    await seedProperty({ slug: 'a', title: 'A', status: 'sold' });
    await seedProperty({ slug: 'b', title: 'B', status: 'available' });
    await seedProperty({ slug: 'c', title: 'C', status: 'rented' });
    await seedProperty({ slug: 'd', title: 'D', status: 'sold', isActive: false });
    const res = await request(app).get('/api/property/filter?status=sold,rented');
    expect(res.status).toBe(200);
    expect(res.body.map((p) => p.slug).sort()).toEqual(['a', 'c']);
  });
});

describe('GET /api/property/list/:userId', () => {
  it('returns only that user\'s active properties', async () => {
    const owner = await seedUser();
    await seedProperty({ owner });
    const res = await request(app).get(`/api/property/list/${owner._id}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /api/property/type', () => {
  it('returns only active types', async () => {
    await propertyType.create([
      { title: 'House', type: 'residential', is_active: true },
      { title: 'Old', type: 'commercial', is_active: false },
    ]);
    const res = await request(app).get('/api/property/type');
    expect(res.status).toBe(200);
    expect(res.body.map((t) => t.title)).toEqual(['House']);
  });
});

describe('property image upload + retrieval', () => {
  const PNG = TINY_PNG;

  it('rejects unauthenticated POST /new with 401', async () => {
    const res = await request(app)
      .post('/api/property/new')
      .field('title', 'Pixel Place')
      .attach('propImages', PNG, 'tiny.png');
    expect(res.status).toBe(401);
  });

  it('round-trips an image upload through GET /single and /showGFSImage', async () => {
    const owner = await seedUser();
    const token = tokenFor(owner);

    const post = await request(app)
      .post('/api/property/new')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Pixel Place')
      .field('propertyFor', 'sell')
      .field('locality', 'L')
      .field('length', '5')
      .field('breadth', '5')
      .field('address', 'addr')
      .field('email', 'e@e.com')
      .field('phoneNo', '1')
      .field('pincode', '1')
      .attach('propImages', PNG, 'tiny.png');
    expect(post.status).toBe(200);
    expect(post.body.result.images).toHaveLength(1);
    expect(post.body.result.images[0]).toMatch(/\.png$/);
    expect(String(post.body.result.userId)).toBe(String(owner._id));

    const filename = post.body.result.images[0];
    expect(fs.existsSync(path.join(UPLOADS_ROOT, filename))).toBe(true);

    const single = await request(app).get(`/api/property/single/${post.body.result.slug}`);
    expect(single.status).toBe(200);
    expect(single.body.files).toEqual([filename]);

    const img = await request(app).get(`/api/property/showGFSImage/${filename}`);
    expect(img.status).toBe(200);
    expect(img.body).toEqual(PNG);
  });

  it('persists the property type when the client sends `type`', async () => {
    const owner = await seedUser();
    const ptype = await propertyType.create({ title: 'House', type: 'residential' });

    const post = await request(app)
      .post('/api/property/new')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .field('title', 'Typed Plot')
      .field('propertyFor', 'sell')
      .field('locality', 'L')
      .field('length', '5')
      .field('breadth', '5')
      .field('address', 'addr')
      .field('email', 'e@e.com')
      .field('phoneNo', '1')
      .field('pincode', '1')
      .field('type', String(ptype._id))
      .attach('propImages', PNG, 'tiny.png');
    expect(post.status).toBe(200);
    expect(String(post.body.result.type)).toBe(String(ptype._id));

    const single = await request(app).get(`/api/property/single/${post.body.result.slug}`);
    expect(single.status).toBe(200);
    // populated by getSingleProperty, so .type is the populated doc {_id, title}
    expect(single.body.result.type.title).toBe('House');
  });

  it('returns 404 for a missing file', async () => {
    const res = await request(app).get('/api/property/showGFSImage/does-not-exist.png');
    expect(res.status).toBe(404);
  });

  it('rejects requests with the wrong file field name (LIMIT_UNEXPECTED_FILE → 400)', async () => {
    const owner = await seedUser();
    const res = await request(app)
      .post('/api/property/new')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .field('title', 'Wrong Field')
      .attach('wrongFieldName', PNG, 'tiny.png');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('LIMIT_UNEXPECTED_FILE');
  });

  it('rejects more than the per-request file count limit (LIMIT_FILE_COUNT → 413)', async () => {
    const owner = await seedUser();
    const req = request(app)
      .post('/api/property/new')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .field('title', 'Too Many');
    for (let i = 0; i < 11; i++) req.attach('propImages', PNG, `t${i}.png`);
    const res = await req;
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('LIMIT_FILE_COUNT');
  });

  it('rejects an oversize file (LIMIT_FILE_SIZE → 413)', async () => {
    const owner = await seedUser();
    const big = Buffer.alloc(11 * 1024 * 1024, 0); // 11 MB > 10 MB cap
    const res = await request(app)
      .post('/api/property/new')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .field('title', 'Too Big')
      .attach('propImages', big, { filename: 'huge.png', contentType: 'image/png' });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('LIMIT_FILE_SIZE');
  });

  it('blocks path-traversal attempts', async () => {
    const res = await request(app).get('/api/property/showGFSImage/..%2F..%2Fapp.js');
    expect([400, 404]).toContain(res.status);
  });

  it('rejects forged MIME — bytes that do not match the declared image type (415)', async () => {
    const owner = await seedUser();
    const filesBefore = fs.readdirSync(UPLOADS_ROOT).length;
    // HTML bytes labelled as image/png. Multer's MIME whitelist alone would
    // accept this; the magic-byte sniff is what catches it.
    const htmlBytes = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');
    const res = await request(app)
      .post('/api/property/new')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .field('title', 'Forged Bytes')
      .field('propertyFor', 'sell')
      .field('locality', 'L')
      .field('length', '5')
      .field('breadth', '5')
      .field('address', 'addr')
      .field('email', 'e@e.com')
      .field('phoneNo', '1')
      .field('pincode', '1')
      .attach('propImages', htmlBytes, { filename: 'evil.png', contentType: 'image/png' });
    expect(res.status).toBe(415);
    expect(res.body.message).toMatch(/declared image type/i);
    expect(fs.readdirSync(UPLOADS_ROOT).length).toBe(filesBefore);
  });

  it('rejects non-image MIMEs (415)', async () => {
    const owner = await seedUser();
    const filesBefore = fs.readdirSync(UPLOADS_ROOT).length;
    const res = await request(app)
      .post('/api/property/new')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .field('title', 'Bad upload')
      .field('propertyFor', 'sell')
      .field('locality', 'L')
      .field('length', '5')
      .field('breadth', '5')
      .field('address', 'addr')
      .field('email', 'e@e.com')
      .field('phoneNo', '1')
      .field('pincode', '1')
      .attach('propImages', Buffer.from('<script>alert(1)</script>', 'utf8'), {
        filename: 'evil.html',
        contentType: 'text/html',
      });
    expect([400, 415]).toContain(res.status);
    expect(fs.readdirSync(UPLOADS_ROOT).length).toBe(filesBefore);
  });

  it('cleans up orphan files when Property.save() fails (validation error)', async () => {
    const owner = await seedUser();
    const filesBefore = fs.readdirSync(UPLOADS_ROOT).length;
    // Skip required `address` to trigger Mongoose validation failure post-multer.
    const res = await request(app)
      .post('/api/property/new')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .field('title', 'Orphan Risk')
      .field('propertyFor', 'sell')
      .field('locality', 'L')
      .field('length', '5')
      .field('breadth', '5')
      .field('email', 'e@e.com')
      .field('phoneNo', '1')
      .field('pincode', '1')
      .attach('propImages', PNG, 'tiny.png');
    expect(res.status).toBe(400);
    // give the fire-and-forget unlink a tick
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.readdirSync(UPLOADS_ROOT).length).toBe(filesBefore);
  });

  it('parses string "false" form fields as boolean false', async () => {
    const owner = await seedUser();
    const res = await request(app)
      .post('/api/property/new')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .field('title', 'Plot Plain')
      .field('propertyFor', 'sell')
      .field('locality', 'L')
      .field('length', '5')
      .field('breadth', '5')
      .field('address', 'addr')
      .field('email', 'e@e.com')
      .field('phoneNo', '1')
      .field('pincode', '1')
      .field('cornrPlot', 'false')
      .field('isSociety', 'false')
      .field('societyName', 'IGNORED')
      .field('flatNo', 'IGNORED')
      .attach('propImages', PNG, 'tiny.png');
    expect(res.status).toBe(200);
    expect(res.body.result.cornrPlot).toBe(false);
    expect(res.body.result.isSociety).toBe(false);
    expect(res.body.result.societyName).toBe('');
    expect(res.body.result.flatNo).toBe('');
  });

  it('parses string "true" form fields as boolean true and keeps society fields', async () => {
    const owner = await seedUser();
    const res = await request(app)
      .post('/api/property/new')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .field('title', 'Society Living')
      .field('propertyFor', 'sell')
      .field('locality', 'L')
      .field('length', '5')
      .field('breadth', '5')
      .field('address', 'addr')
      .field('email', 'e@e.com')
      .field('phoneNo', '1')
      .field('pincode', '1')
      .field('cornrPlot', 'true')
      .field('isSociety', 'true')
      .field('societyName', 'Sunset Towers')
      .field('flatNo', '12B')
      .attach('propImages', PNG, 'tiny.png');
    expect(res.status).toBe(200);
    expect(res.body.result.cornrPlot).toBe(true);
    expect(res.body.result.isSociety).toBe(true);
    expect(res.body.result.societyName).toBe('Sunset Towers');
    expect(res.body.result.flatNo).toBe('12B');
  });

  it('refuses client-supplied userId — JWT subject wins', async () => {
    const owner = await seedUser();
    const other = await seedUser();
    const post = await request(app)
      .post('/api/property/new')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .field('title', 'Hijack Attempt')
      .field('propertyFor', 'sell')
      .field('locality', 'L')
      .field('length', '5')
      .field('breadth', '5')
      .field('address', 'addr')
      .field('email', 'e@e.com')
      .field('phoneNo', '1')
      .field('pincode', '1')
      .field('userId', String(other._id));
    expect(post.status).toBe(200);
    expect(String(post.body.result.userId)).toBe(String(owner._id));
  });
});
