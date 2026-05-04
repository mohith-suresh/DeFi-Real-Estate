const request = require('supertest');

process.env.JWT_SECRET = 'test-secret';

const { app } = require('../app');
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

describe('auth flow', () => {
  it('registers a new user', async () => {
    const res = await request(app).post('/api/auth/user/register').send(validUser);
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
  });

  it('logs in with the right password', async () => {
    await request(app).post('/api/auth/user/register').send(validUser);
    const res = await request(app)
      .post('/api/auth/user/login')
      .send({ emailPhone: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('rejects login with the wrong password', async () => {
    await request(app).post('/api/auth/user/register').send(validUser);
    const res = await request(app)
      .post('/api/auth/user/login')
      .send({ emailPhone: validUser.email, password: 'nope' });
    expect(res.status).toBe(401);
  });
});

describe('routing', () => {
  it('returns JSON 404 on unknown routes', async () => {
    const res = await request(app).get('/no-such-route');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });
});
