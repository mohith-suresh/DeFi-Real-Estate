const request = require('supertest');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'test-secret';

const { app } = require('../app');
const userM = require('../models/users');
const { connectInMemoryDB, disconnectInMemoryDB, clearCollections } = require('./setup');

beforeAll(connectInMemoryDB);
afterAll(disconnectInMemoryDB);
afterEach(clearCollections);

const validUser = {
  fname: 'Ada',
  lname: 'Lovelace',
  email: 'ada@example.com',
  phoneNo: '5551234567',
  password: 'analytical-engine',
};

async function registerAndLogin() {
  await request(app).post('/api/auth/user/register').send(validUser);
  const login = await request(app).post('/api/auth/user/login').send({
    emailPhone: validUser.email,
    password: validUser.password,
  });
  return login.body.token;
}

describe('GET /api/user/:userId', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get(`/api/user/${new mongoose.Types.ObjectId()}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 on a malformed ObjectId (auth check fires first)', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .get('/api/user/not-a-valid-id')
      .set('Authorization', `Bearer ${token}`);
    // auth runs before any DB lookup, so a non-owner sees 403, not a CastError leak.
    expect(res.status).toBe(403);
  });

  it('returns 403 for any other user\'s id (self-or-admin guard)', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .get(`/api/user/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns the user without the password hash', async () => {
    const token = await registerAndLogin();
    const stored = await userM.findOne({ email: validUser.email });
    const res = await request(app)
      .get(`/api/user/${stored._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(validUser.email);
    expect(res.body.password).toBeUndefined();
  });

  it('user-A cannot read user-B\'s profile', async () => {
    const tokenA = await registerAndLogin();
    const userB = await userM.create({
      fname: 'B', lname: 'B', email: 'b@x.com', phoneNo: '999', password: 'h',
    });
    const res = await request(app)
      .get(`/api/user/${userB._id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(403);
  });

  it('admin can read any user\'s profile', async () => {
    await request(app).post('/api/auth/user/register').send(validUser);
    const stored = await userM.findOne({ email: validUser.email });
    const target = await userM.create({
      fname: 'T', lname: 'T', email: 't@x.com', phoneNo: '888', password: 'h',
    });
    const jwt = require('jsonwebtoken');
    const { secretKey } = require('../config/config');
    const adminToken = jwt.sign(
      { user: { _id: stored._id, email: validUser.email, isAdmin: true } },
      secretKey,
      { expiresIn: '1h' }
    );
    const res = await request(app)
      .get(`/api/user/${target._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('t@x.com');
  });

  it('admin can read a well-formed but unknown ObjectId — and gets 404', async () => {
    const jwt = require('jsonwebtoken');
    const { secretKey } = require('../config/config');
    await request(app).post('/api/auth/user/register').send(validUser);
    const stored = await userM.findOne({ email: validUser.email });
    const adminToken = jwt.sign(
      { user: { _id: stored._id, email: validUser.email, isAdmin: true } },
      secretKey,
      { expiresIn: '1h' }
    );
    const res = await request(app)
      .get(`/api/user/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('JWT integrity', () => {
  it('rejects a tampered token', async () => {
    const token = await registerAndLogin();
    const tampered = token.slice(0, -1) + (token.slice(-1) === 'A' ? 'B' : 'A');
    const res = await request(app)
      .put('/api/auth/admin/changePass')
      .set('Authorization', `Bearer ${tampered}`)
      .send({ password: 'new' });
    expect(res.status).toBe(401);
  });

  it('rejects a non-Bearer Authorization header', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .put('/api/auth/admin/changePass')
      .set('Authorization', `Basic ${token}`)
      .send({ password: 'new' });
    expect(res.status).toBe(401);
  });

  it('rejects an empty Authorization header', async () => {
    const res = await request(app)
      .put('/api/auth/admin/changePass')
      .set('Authorization', '')
      .send({ password: 'new' });
    expect(res.status).toBe(401);
  });
});
