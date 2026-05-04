const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';

const { app } = require('../app');
const { secretKey } = require('../config/config');
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

describe('POST /api/auth/user/register', () => {
  it('creates a user when body is valid', async () => {
    const res = await request(app).post('/api/auth/user/register').send(validUser);
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    const stored = await userM.findOne({ email: validUser.email });
    expect(stored).not.toBeNull();
    expect(stored.password).not.toBe(validUser.password); // hashed
  });

  it('rejects when required fields are missing', async () => {
    const res = await request(app).post('/api/auth/user/register').send({ email: 'x@y.com' });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate email with 409', async () => {
    await request(app).post('/api/auth/user/register').send(validUser);
    const res = await request(app)
      .post('/api/auth/user/register')
      .send({ ...validUser, phoneNo: '9999999999' });
    expect(res.status).toBe(409);
  });

  it('rejects duplicate phone with 409', async () => {
    await request(app).post('/api/auth/user/register').send(validUser);
    const res = await request(app)
      .post('/api/auth/user/register')
      .send({ ...validUser, email: 'other@example.com' });
    expect(res.status).toBe(409);
  });

  it('reports the first missing field by name', async () => {
    const res = await request(app)
      .post('/api/auth/user/register')
      .send({ fname: 'A' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/lname/);
  });
});

describe('POST /api/auth/user/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/user/register').send(validUser);
  });

  it('returns a JWT on correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/user/login')
      .send({ emailPhone: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();

    const decoded = jwt.verify(res.body.token, secretKey);
    expect(decoded.user.email).toBe(validUser.email);
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/user/login')
      .send({ emailPhone: validUser.email, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when credentials are missing', async () => {
    const res = await request(app).post('/api/auth/user/login').send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 for an unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/user/login')
      .send({ emailPhone: 'nobody@nowhere.com', password: 'x' });
    expect(res.status).toBe(401);
  });

  it('logs in with phoneNo when emailPhone is numeric', async () => {
    const res = await request(app)
      .post('/api/auth/user/login')
      .send({ emailPhone: validUser.phoneNo, password: validUser.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });
});

describe('admin endpoints', () => {
  it('rejects unauthenticated /admin/userList', async () => {
    const res = await request(app).get('/api/auth/admin/userList');
    expect(res.status).toBe(401);
  });

  it('rejects non-admin token on /admin/userList', async () => {
    await request(app).post('/api/auth/user/register').send(validUser);
    const login = await request(app)
      .post('/api/auth/user/login')
      .send({ emailPhone: validUser.email, password: validUser.password });
    const res = await request(app)
      .get('/api/auth/admin/userList')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(403);
  });

  it('changePass scopes the update to the authenticated user', async () => {
    const reg = await request(app).post('/api/auth/user/register').send(validUser);
    const login = await request(app)
      .post('/api/auth/user/login')
      .send({ emailPhone: validUser.email, password: validUser.password });

    const res = await request(app)
      .put('/api/auth/admin/changePass')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ _id: 'someone-else-id', password: 'new-passphrase' });
    expect(res.status).toBe(200);

    // verify the change applied to the original user (not "someone-else-id")
    const relogin = await request(app)
      .post('/api/auth/user/login')
      .send({ emailPhone: validUser.email, password: 'new-passphrase' });
    expect(relogin.status).toBe(200);
    expect(reg.body.id).toBeDefined();
  });
});
