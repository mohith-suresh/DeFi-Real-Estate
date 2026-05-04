const request = require('supertest');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'test-secret';

const { app } = require('../app');
const stateModel = require('../models/state');
const cityModel = require('../models/city');
const {
  connectInMemoryDB,
  disconnectInMemoryDB,
  clearCollections,
  tokenFor,
} = require('./setup');

beforeAll(connectInMemoryDB);
afterAll(disconnectInMemoryDB);
afterEach(clearCollections);

const adminToken = () => tokenFor(null, { isAdmin: true });
const userToken = () => tokenFor(null);

describe('GET /api/common/state', () => {
  it('returns only active states', async () => {
    await stateModel.create([
      { name: 'Active', is_active: true },
      { name: 'Inactive', is_active: false },
    ]);
    const res = await request(app).get('/api/common/state');
    expect(res.status).toBe(200);
    expect(res.body.map((s) => s.name)).toEqual(['Active']);
  });
});

describe('POST /api/common/state (admin only)', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).post('/api/common/state').send({ name: 'California' });
    expect(res.status).toBe(401);
  });

  it('rejects non-admin with 403', async () => {
    const res = await request(app)
      .post('/api/common/state')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ name: 'California' });
    expect(res.status).toBe(403);
  });

  it('persists when called by an admin (and proves body-parser is mounted)', async () => {
    const res = await request(app)
      .post('/api/common/state')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'California' });
    expect(res.status).toBe(200);
    expect(await stateModel.findOne({ name: 'California' })).not.toBeNull();
  });

  it('rejects empty / missing name with 400 (Mongoose ValidationError)', async () => {
    const res = await request(app)
      .post('/api/common/state')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(await stateModel.countDocuments()).toBe(0);
  });
});

describe('POST /api/common/cities (admin only)', () => {
  it('rejects non-admin with 403', async () => {
    const state = await stateModel.create({ name: 'CA' });
    const res = await request(app)
      .post('/api/common/cities')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ name: 'San Mateo', state_id: state._id });
    expect(res.status).toBe(403);
  });

  it('persists when called by an admin', async () => {
    const state = await stateModel.create({ name: 'CA' });
    const res = await request(app)
      .post('/api/common/cities')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'San Mateo', state_id: state._id });
    expect(res.status).toBe(200);
    expect(await cityModel.findOne({ name: 'San Mateo' })).not.toBeNull();
  });

  it('rejects when name is missing with 400', async () => {
    const state = await stateModel.create({ name: 'CA' });
    const res = await request(app)
      .post('/api/common/cities')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ state_id: state._id });
    expect(res.status).toBe(400);
  });

  it('rejects when state_id is missing with 400', async () => {
    const res = await request(app)
      .post('/api/common/cities')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Orphan City' });
    expect(res.status).toBe(400);
    expect(await cityModel.countDocuments()).toBe(0);
  });

  it('rejects a well-formed but unknown state_id with 400', async () => {
    const phantomState = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post('/api/common/cities')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Ghost', state_id: phantomState });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/state/i);
    expect(await cityModel.countDocuments()).toBe(0);
  });

  it('allows the same city name in two different states', async () => {
    const il = await stateModel.create({ name: 'IL' });
    const mo = await stateModel.create({ name: 'MO' });
    const auth = `Bearer ${adminToken()}`;

    const a = await request(app)
      .post('/api/common/cities')
      .set('Authorization', auth)
      .send({ name: 'Springfield', state_id: il._id });
    const b = await request(app)
      .post('/api/common/cities')
      .set('Authorization', auth)
      .send({ name: 'Springfield', state_id: mo._id });

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await cityModel.countDocuments()).toBe(2);
  });

  it('rejects a duplicate city name within the same state with 409', async () => {
    const il = await stateModel.create({ name: 'IL' });
    const auth = `Bearer ${adminToken()}`;

    const a = await request(app)
      .post('/api/common/cities')
      .set('Authorization', auth)
      .send({ name: 'Springfield', state_id: il._id });
    const b = await request(app)
      .post('/api/common/cities')
      .set('Authorization', auth)
      .send({ name: 'Springfield', state_id: il._id });

    expect(a.status).toBe(200);
    expect(b.status).toBe(409);
    expect(await cityModel.countDocuments()).toBe(1);
  });
});

describe('DELETE /api/common/city/:cityId (admin only)', () => {
  it('rejects unauthenticated', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).delete(`/api/common/city/${fakeId}`);
    expect(res.status).toBe(401);
  });

  it('rejects non-admin with 403', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/common/city/${fakeId}`)
      .set('Authorization', `Bearer ${userToken()}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for an admin deleting a non-existent city', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/common/city/${fakeId}`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });

  it('rejects malformed id with 400 (CastError)', async () => {
    const res = await request(app)
      .delete('/api/common/city/not-an-id')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });
});

describe('cities reads', () => {
  it('rejects malformed state_id on GET cities/:state_id with 400', async () => {
    const res = await request(app).get('/api/common/cities/not-an-id');
    expect(res.status).toBe(400);
  });
});

describe('404 handler', () => {
  it('returns JSON 404 on unknown routes', async () => {
    const res = await request(app).get('/no-such-route');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });
});

describe('email availability', () => {
  it('returns false when email is unused', async () => {
    const res = await request(app).get('/api/common/checkemail-availability/email/no@one.com');
    expect(res.status).toBe(200);
    expect(res.body.response).toBe(false);
  });
});
