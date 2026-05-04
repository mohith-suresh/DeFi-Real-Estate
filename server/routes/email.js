const express = require('express');
const sgMail = require('@sendgrid/mail');

const helpers = require('../providers/helper');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

// Contact-form relay. The client supplies the message body only — the
// recipient and the sender are server-controlled to prevent the route
// from being abused as an open mail relay or sender-spoofer. Only
// authenticated users can hit it.
router.post('/github-pages', requireAuth, async (req, res, next) => {
  const missing = helpers.isKeyMissing(req.body || {}, ['name', 'email', 'message']);
  if (missing) return res.status(400).json({ message: `${missing} is missing` });

  const apiKey = process.env.SENDGRID_API_KEY;
  const templateId = process.env.SENDGRID_TEMPLATE_ID;
  const fromAddress = process.env.SENDGRID_FROM;
  const toAddress = process.env.CONTACT_TO;
  if (!apiKey || !templateId || !fromAddress || !toAddress) {
    return res.status(503).json({ message: 'Email service is not configured' });
  }

  sgMail.setApiKey(apiKey);

  try {
    await sgMail.send({
      to: toAddress,
      from: fromAddress,
      template_id: templateId,
      dynamic_template_data: {
        name: req.body.name,
        email: req.body.email,
        message: req.body.message,
      },
    });
    return res.status(200).json({ message: 'Email sent successfully' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
