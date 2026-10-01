const axios = require('axios');

function cleanEnv(value) {
  const text = String(value || '').trim();
  if (text === '+1234567890') return '';
  if (!text || /^(your_|replace_|add_|enter_|msg91_|twilio_)/i.test(text)) return '';
  return text;
}

function getTwilioConfig() {
  return {
    accountSid: cleanEnv(process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID),
    authToken: cleanEnv(process.env.TWILIO_AUTH_TOKEN),
    fromPhone: cleanEnv(process.env.TWILIO_FROM_PHONE || process.env.TWILIO_PHONE),
    messagingServiceSid: cleanEnv(process.env.TWILIO_MESSAGING_SERVICE_SID),
    timeoutMs: Number(process.env.TWILIO_TIMEOUT_MS || 8000),
    voiceTimeout: Number(process.env.TWILIO_VOICE_TIMEOUT_SECONDS || 20)
  };
}

function getMsg91Config() {
  return {
    authKey: cleanEnv(process.env.MSG91_AUTH_KEY || process.env.MSG91_AUTHKEY),
    flowId: cleanEnv(process.env.MSG91_FLOW_ID || process.env.MSG91_TEMPLATE_ID),
    senderId: cleanEnv(process.env.MSG91_SENDER_ID),
    route: cleanEnv(process.env.MSG91_ROUTE),
    unicode: String(process.env.MSG91_UNICODE || '1').trim(),
    timeoutMs: Number(process.env.MSG91_TIMEOUT_MS || 8000),
    messageVar: cleanEnv(process.env.MSG91_MESSAGE_VAR) || 'MESSAGE',
    locationVar: cleanEnv(process.env.MSG91_LOCATION_VAR) || 'LOCATION',
    latitudeVar: cleanEnv(process.env.MSG91_LATITUDE_VAR) || 'LATITUDE',
    longitudeVar: cleanEnv(process.env.MSG91_LONGITUDE_VAR) || 'LONGITUDE',
    patientNameVar: cleanEnv(process.env.MSG91_PATIENT_NAME_VAR) || 'PATIENT_NAME'
  };
}

function getFast2SmsConfig() {
  return {
    apiKey: cleanEnv(process.env.FAST2SMS_API_KEY || process.env.FAST2SMS_AUTHORIZATION_KEY),
    route: String(process.env.FAST2SMS_ROUTE || 'q').trim(),
    language: String(process.env.FAST2SMS_LANGUAGE || 'english').trim(),
    flash: String(process.env.FAST2SMS_FLASH || '0').trim(),
    timeoutMs: Number(process.env.FAST2SMS_TIMEOUT_MS || 8000),
    retries: Number(process.env.FAST2SMS_RETRIES || 1)
  };
}

function normalizeIndianMobile(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 10) return digits;
  return '';
}

function normalizeRecipients(to) {
  const values = Array.isArray(to) ? to : String(to || '').split(',');
  return [...new Set(values.map(normalizeIndianMobile).filter(Boolean))];
}

function toE164IndianMobile(phone) {
  const clean = normalizeIndianMobile(phone);
  return clean ? `+91${clean}` : '';
}

function twilioAuth(config) {
  return {
    username: config.accountSid,
    password: config.authToken
  };
}

function twilioForm(data) {
  const form = new URLSearchParams();
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
  });
  return form;
}

function escapeXml(value) {
  return String(value || '').replace(/[<>&'"]/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;'
  }[char]));
}

async function sendTwilioSms({ to, message }) {
  const recipients = normalizeRecipients(to);
  const text = String(message || '').trim();
  const config = getTwilioConfig();

  if (!recipients.length || !text) {
    return { success: false, provider: 'twilio', status: 'failed', message: 'Valid Indian mobile number(s) and SMS message are required.' };
  }

  if (!config.accountSid || !config.authToken || (!config.fromPhone && !config.messagingServiceSid)) {
    return {
      success: false,
      provider: 'twilio',
      status: 'not_configured',
      message: 'Twilio account SID, auth token, and sender phone or messaging service SID are not configured.'
    };
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`;
  const attempts = await Promise.all(recipients.map(async (phone) => {
    const toPhone = toE164IndianMobile(phone);
    const body = twilioForm({
      To: toPhone,
      From: config.messagingServiceSid ? '' : config.fromPhone,
      MessagingServiceSid: config.messagingServiceSid,
      Body: text
    });

    try {
      const response = await axios.post(endpoint, body, {
        auth: twilioAuth(config),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: Number.isFinite(config.timeoutMs) ? config.timeoutMs : 8000,
        validateStatus: () => true
      });
      const payload = response.data || {};
      const accepted = response.status >= 200 && response.status < 300 && payload.sid;
      return {
        success: Boolean(accepted),
        to: phone,
        e164: toPhone,
        sid: payload.sid,
        status: accepted ? payload.status || 'queued' : 'failed',
        httpStatus: response.status,
        message: accepted ? 'SMS accepted by Twilio.' : payload.message || 'Twilio SMS request failed.',
        response: payload
      };
    } catch (error) {
      const payload = error.response?.data;
      return {
        success: false,
        to: phone,
        e164: toPhone,
        status: error.code === 'ECONNABORTED' ? 'timeout' : 'failed',
        httpStatus: error.response?.status,
        message: payload?.message || (error.code === 'ECONNABORTED' ? 'Twilio SMS request timed out.' : error.message),
        response: payload
      };
    }
  }));

  const accepted = attempts.filter((item) => item.success);
  const failed = attempts.filter((item) => !item.success);
  return {
    success: accepted.length > 0,
    provider: 'twilio',
    status: accepted.length === attempts.length ? 'sent' : accepted.length ? 'partial' : 'failed',
    requestId: accepted.map((item) => item.sid).filter(Boolean).join(','),
    to: recipients,
    count: accepted.length,
    failedCount: failed.length,
    message: accepted.length
      ? `Twilio accepted ${accepted.length} of ${attempts.length} emergency SMS alert(s).`
      : failed[0]?.message || 'Twilio SMS request failed.',
    response: attempts
  };
}

async function placeTwilioVoiceCall({ to, message }) {
  const toPhone = toE164IndianMobile(to);
  const text = String(message || 'Emergency alert. User needs urgent help. Please check the SMS location and respond immediately.').trim();
  const config = getTwilioConfig();

  if (!toPhone) {
    return { success: false, provider: 'twilio', status: 'skipped', message: 'No valid emergency contact phone number is available for the voice call.' };
  }

  if (!config.accountSid || !config.authToken || !config.fromPhone) {
    return {
      success: false,
      provider: 'twilio',
      status: 'not_configured',
      message: 'Twilio account SID, auth token, and voice caller phone are not configured.'
    };
  }

  const twiml = `<Response><Say voice="alice" language="en-IN">${escapeXml(text)}</Say></Response>`;
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Calls.json`;

  try {
    const response = await axios.post(endpoint, twilioForm({
      To: toPhone,
      From: config.fromPhone,
      Twiml: twiml,
      Timeout: Number.isFinite(config.voiceTimeout) ? config.voiceTimeout : 20
    }), {
      auth: twilioAuth(config),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: Number.isFinite(config.timeoutMs) ? config.timeoutMs : 8000,
      validateStatus: () => true
    });
    const payload = response.data || {};
    const accepted = response.status >= 200 && response.status < 300 && payload.sid;
    return {
      success: Boolean(accepted),
      provider: 'twilio',
      status: accepted ? payload.status || 'queued' : 'failed',
      requestId: payload.sid,
      to: toPhone,
      message: accepted ? 'Emergency voice call queued by Twilio.' : payload.message || 'Twilio voice call request failed.',
      response: payload
    };
  } catch (error) {
    const payload = error.response?.data;
    return {
      success: false,
      provider: 'twilio',
      status: error.code === 'ECONNABORTED' ? 'timeout' : 'failed',
      httpStatus: error.response?.status,
      to: toPhone,
      message: payload?.message || (error.code === 'ECONNABORTED' ? 'Twilio voice call request timed out.' : error.message),
      response: payload
    };
  }
}

function toMsg91Mobile(phone) {
  const clean = normalizeIndianMobile(phone);
  return clean ? `91${clean}` : '';
}

function parseMessageContext(message, context = {}) {
  const text = String(message || '').trim();
  const locationMatch = text.match(/https:\/\/maps\.google\.com\/\?q=([-\d.]+),([-\d.]+)/i);
  const latitude = context.latitude ?? context.location?.latitude ?? locationMatch?.[1] ?? '';
  const longitude = context.longitude ?? context.location?.longitude ?? locationMatch?.[2] ?? '';
  const location = context.locationUrl
    || context.mapsUrl
    || context.location?.mapsUrl
    || (latitude !== '' && longitude !== '' ? `https://maps.google.com/?q=${latitude},${longitude}` : '');

  return {
    message: text,
    location,
    latitude: latitude === null ? '' : String(latitude),
    longitude: longitude === null ? '' : String(longitude),
    patientName: String(context.patientName || context.userName || '').trim()
  };
}

async function sendMsg91Sms({ to, message, context = {} }) {
  const recipients = normalizeRecipients(to);
  const text = String(message || '').trim();
  const config = getMsg91Config();

  if (!recipients.length || !text) {
    return { success: false, provider: 'msg91', status: 'failed', message: 'Valid Indian mobile number(s) and SMS message are required.' };
  }

  if (!config.authKey || !config.flowId) {
    return {
      success: false,
      provider: 'msg91',
      status: 'not_configured',
      message: 'MSG91 auth key and flow ID are not configured.'
    };
  }

  const variables = parseMessageContext(text, context);
  const body = {
    flow_id: config.flowId,
    recipients: recipients.map((phone) => ({
      mobiles: toMsg91Mobile(phone),
      [config.messageVar]: variables.message,
      [config.locationVar]: variables.location,
      [config.latitudeVar]: variables.latitude,
      [config.longitudeVar]: variables.longitude,
      [config.patientNameVar]: variables.patientName
    }))
  };

  if (config.senderId) body.sender = config.senderId;
  if (config.route) body.route = config.route;
  if (config.unicode) body.unicode = config.unicode;

  try {
    const response = await axios.post(
      'https://api.msg91.com/api/v5/flow/',
      body,
      {
        headers: {
          authkey: config.authKey,
          'Content-Type': 'application/json'
        },
        timeout: Number.isFinite(config.timeoutMs) ? config.timeoutMs : 8000,
        validateStatus: () => true
      }
    );
    const payload = response.data || {};
    const providerStatus = String(payload.type || payload.status || '').toLowerCase();
    const accepted = response.status >= 200 && response.status < 300 && providerStatus !== 'error';

    if (!accepted) {
      return {
        success: false,
        provider: 'msg91',
        status: response.status === 408 ? 'timeout' : 'failed',
        httpStatus: response.status,
        to: recipients,
        count: 0,
        message: payload.message || 'MSG91 request failed.',
        response: payload
      };
    }

    return {
      success: true,
      provider: 'msg91',
      status: 'sent',
      requestId: payload.message || payload.request_id,
      to: recipients,
      count: recipients.length,
      message: 'Emergency SMS accepted by MSG91.',
      response: payload
    };
  } catch (error) {
    const payload = error.response?.data;
    return {
      success: false,
      provider: 'msg91',
      status: error.code === 'ECONNABORTED' ? 'timeout' : 'failed',
      httpStatus: error.response?.status,
      to: recipients,
      count: 0,
      message: payload?.message || (error.code === 'ECONNABORTED' ? 'MSG91 request timed out.' : error.message),
      response: payload
    };
  }
}

async function sendFast2Sms({ to, message }) {
  const recipients = normalizeRecipients(to);
  const text = String(message || '').trim();
  const config = getFast2SmsConfig();

  if (!recipients.length || !text) {
    return { success: false, provider: 'fast2sms', status: 'failed', message: 'Valid Indian mobile number(s) and SMS message are required.' };
  }

  if (!config.apiKey) {
    return { success: false, provider: 'fast2sms', status: 'not_configured', message: 'Fast2SMS API key is not configured.' };
  }

  const body = {
    route: config.route || 'q',
    message: text,
    numbers: recipients.join(',')
  };
  if (config.language) body.language = config.language;
  if (config.flash === '1') body.flash = '1';

  const maxAttempts = Math.max(1, Number.isFinite(config.retries) ? config.retries + 1 : 2);
  let lastResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await axios.post(
        'https://www.fast2sms.com/dev/bulkV2',
        body,
        {
          headers: {
            authorization: config.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: Number.isFinite(config.timeoutMs) ? config.timeoutMs : 8000,
          validateStatus: () => true
        }
      );
      const payload = response.data || {};

      if (response.status >= 200 && response.status < 300 && payload.return !== false) {
        return {
          success: true,
          provider: 'fast2sms',
          status: 'sent',
          requestId: payload.request_id,
          to: recipients,
          count: recipients.length,
          attempts: attempt,
          message: Array.isArray(payload.message) ? payload.message.join(' ') : payload.message || 'Message sent successfully.',
          response: payload
        };
      }

      lastResult = {
        success: false,
        provider: 'fast2sms',
        status: 'failed',
        httpStatus: response.status,
        to: recipients,
        attempts: attempt,
        message: Array.isArray(payload.message) ? payload.message.join(' ') : payload.message || 'Fast2SMS request failed.',
        response: payload
      };
    } catch (error) {
      const payload = error.response?.data;
      lastResult = {
        success: false,
        provider: 'fast2sms',
        status: error.code === 'ECONNABORTED' ? 'timeout' : 'failed',
        httpStatus: error.response?.status,
        to: recipients,
        attempts: attempt,
        message: payload?.message
          ? Array.isArray(payload.message) ? payload.message.join(' ') : payload.message
          : error.code === 'ECONNABORTED' ? 'Fast2SMS request timed out.' : error.message,
        response: payload
      };
    }

    if (attempt < maxAttempts) {
      console.warn(`Fast2SMS attempt ${attempt} failed; retrying SOS SMS...`, lastResult.message);
    }
  }

  return lastResult;
}

async function sendSMS({ to, message, context }) {
  try {
    const recipients = normalizeRecipients(to);
    const text = String(message || '').trim();

    if (!recipients.length || !text) {
      return { success: false, status: 'failed', message: 'Phone number and SMS message are required.' };
    }

    const twilioConfig = getTwilioConfig();
    if (twilioConfig.accountSid || twilioConfig.authToken || twilioConfig.fromPhone || twilioConfig.messagingServiceSid) {
      const twilioResult = await sendTwilioSms({ to: recipients, message: text, context });
      if (twilioResult.success || twilioResult.status !== 'not_configured') return twilioResult;
    }

    const msg91Config = getMsg91Config();
    if (msg91Config.authKey || msg91Config.flowId) {
      const msg91Result = await sendMsg91Sms({ to: recipients, message: text, context });
      if (msg91Result.success || msg91Result.status !== 'not_configured') return msg91Result;
    }

    return sendFast2Sms({ to: recipients, message: text });
  } catch (error) {
    console.error('PulseMD - Virtual Clinic SMS failed:', error.message);
    return {
      success: false,
      status: 'failed',
      message: error.message
    };
  }
}

module.exports = {
  sendSMS,
  sendSms: sendSMS,
  sendTwilioSms,
  placeTwilioVoiceCall,
  sendMsg91Sms,
  sendFast2Sms,
  getTwilioConfig,
  getMsg91Config,
  getFast2SmsConfig,
  normalizeIndianMobile,
  normalizeRecipients,
  toE164IndianMobile,
  toMsg91Mobile
};
