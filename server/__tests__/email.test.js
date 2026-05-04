const request = require('supertest');

process.env.JWT_SECRET = 'test-secret';

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn().mockResolvedValue([{ statusCode: 202 }]),
}));

const sgMail = require('@sendgrid/mail');
const { app } = require('../app');
const { tokenFor } = require('./setup');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SENDGRID_API_KEY = 'key';
  process.env.SENDGRID_TEMPLATE_ID = 'tpl';
  process.env.SENDGRID_FROM = 'noreply@example.com';
  process.env.CONTACT_TO = 'support@example.com';
});

describe('POST /api/email/github-pages', () => {
  it('rejects unauthenticated callers with 401', async () => {
    const res = await request(app)
      .post('/api/email/github-pages')
      .send({ name: 'a', email: 'a@a.com', message: 'hi' });
    expect(res.status).toBe(401);
    expect(sgMail.send).not.toHaveBeenCalled();
  });

  it('rejects when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/email/github-pages')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ name: 'a' });
    expect(res.status).toBe(400);
  });

  it('returns 503 when sendgrid env is not configured', async () => {
    delete process.env.SENDGRID_FROM;
    const res = await request(app)
      .post('/api/email/github-pages')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ name: 'a', email: 'a@a.com', message: 'hi' });
    expect(res.status).toBe(503);
    expect(sgMail.send).not.toHaveBeenCalled();
  });

  it('forces server-controlled `to` and `from` (ignores client-supplied values)', async () => {
    const res = await request(app)
      .post('/api/email/github-pages')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({
        name: 'Eve',
        email: 'eve@evil.com',
        message: 'hi',
        toEmail: 'victim@target.com', // attempted spam recipient
        fromEmail: 'spoof@bank.com', // attempted sender spoof
      });
    expect(res.status).toBe(200);
    expect(sgMail.send).toHaveBeenCalledTimes(1);
    const sent = sgMail.send.mock.calls[0][0];
    expect(sent.to).toBe('support@example.com');
    expect(sent.from).toBe('noreply@example.com');
    expect(sent.dynamic_template_data.name).toBe('Eve');
  });
});
