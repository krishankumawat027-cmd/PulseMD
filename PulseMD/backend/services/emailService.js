const nodemailer = require('nodemailer');

function getEmailConfig() {
  const user = String(process.env.EMAIL_USER || '').trim();
  const pass = String(process.env.EMAIL_PASS || process.env.EMAIL_APP_PASSWORD || '').trim();
  const from = process.env.EMAIL_FROM || `PulseMD - Virtual Clinic Support <${user || 'no-reply@caremitra.local'}>`;

  return { user, pass, from };
}

function createTransporter() {
  const { user, pass } = getEmailConfig();
  if (!user || !pass) {
    throw new Error('Email service is not configured. Set EMAIL_USER and EMAIL_PASS in .env.');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    auth: { user, pass }
  });
}

async function sendEmail({ to, subject, text = '', html = '' }) {
  try {
    if (!to || !subject || (!text && !html)) {
      return {
        success: false,
        message: 'Email recipient, subject, and content are required.'
      };
    }

    const transporter = createTransporter();
    const { from } = getEmailConfig();
    const info = await transporter.sendMail({ from, to, subject, text, html });

    return {
      success: true,
      messageId: info.messageId,
      response: info.response
    };
  } catch (error) {
    console.error('PulseMD - Virtual Clinic email send failed:', error.message);
    return {
      success: false,
      message: error.message
    };
  }
}

module.exports = { sendEmail, getEmailConfig };
