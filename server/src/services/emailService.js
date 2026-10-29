const nodemailer = require('nodemailer');
const { config } = require('../config/env');

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];
let transport;
let warnedMissingConfiguration = false;

function isConfigured() {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass && config.smtp.from);
}

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: false,
      requireTLS: true,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 8000,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transport;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function eventContent(event, order) {
  const status = order.status;
  const text = event === 'placed'
    ? `Your order ${order.id} has been placed.`
    : event === 'payment'
      ? `Payment for order ${order.id} is ${order.payment.status.toLowerCase()}.`
      : `Order ${order.id} status is now ${status}.`;
  return {
    subject: event === 'placed' ? 'Your bookstore order was placed' : `Order ${order.id} update`,
    text,
    html: `<p>${escapeHtml(text)}</p><p>Order total: INR ${Number(order.totalAmount).toFixed(2)}</p>`,
  };
}

function isTransient(error) {
  if (Number(error.responseCode) >= 400 && Number(error.responseCode) < 500) return true;
  return ['ETIMEDOUT', 'ECONNECTION', 'ECONNRESET', 'ESOCKET', 'EAI_AGAIN'].includes(error.code);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function sendWithTimeout(message) {
  let timeout;
  const activeTransport = getTransport();
  try {
    return await Promise.race([
      activeTransport.sendMail(message),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(Object.assign(new Error('SMTP delivery timed out.'), { code: 'ETIMEDOUT' }));
        }, 8000);
      }),
    ]);
  } catch (error) {
    if (error.code === 'ETIMEDOUT') {
      activeTransport.close();
      transport = null;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function deliver(event, order, recipient) {
  if (!isConfigured()) {
    if (!warnedMissingConfiguration) {
      console.warn('SMTP is not configured; order e-mails are disabled.');
      warnedMissingConfiguration = true;
    }
    return;
  }

  const content = eventContent(event, order);
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await sendWithTimeout({
        from: config.smtp.from,
        to: recipient.email,
        ...content,
      });
      return;
    } catch (error) {
      if (!isTransient(error) || attempt === RETRY_DELAYS_MS.length) {
        console.error('Order e-mail delivery failed:', error.message);
        return;
      }
      await delay(RETRY_DELAYS_MS[attempt]);
    }
  }
}

function dispatchOrderEvent(event, order, recipient) {
  return deliver(event, order, recipient).catch((error) => {
    console.error('Unexpected order e-mail delivery failure:', error.message);
  });
}

module.exports = { dispatchOrderEvent };
