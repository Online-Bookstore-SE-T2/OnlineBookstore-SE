jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

let nodemailer;
let config;
let dispatchOrderEvent;

describe('order e-mail delivery', () => {
  const order = {
    id: 'order-123',
    status: 'Paid',
    totalAmount: 99.5,
    payment: { status: 'Paid' },
  };
  const recipient = { email: 'buyer@example.test' };

  beforeEach(() => {
    jest.resetModules();
    nodemailer = require('nodemailer');
    config = require('../../src/config/env').config;
    dispatchOrderEvent = require('../../src/services/emailService').dispatchOrderEvent;
    config.smtp = {
      host: 'smtp.example.test',
      port: 587,
      user: 'user',
      pass: 'password',
      from: 'bookstore@example.test',
    };
    nodemailer.createTransport.mockReset();
  });

  test('uses STARTTLS on port 587 and retries transient failures', async () => {
    const sendMail = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('temporary disconnect'), { code: 'ECONNECTION' }))
      .mockResolvedValueOnce({});
    nodemailer.createTransport.mockReturnValue({ sendMail });

    await expect(dispatchOrderEvent('payment', order, recipient)).resolves.toBeUndefined();

    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      port: 587,
      secure: false,
      requireTLS: true,
    }));
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls[0][0]).toMatchObject({
      to: recipient.email,
      text: expect.stringContaining(order.id),
    });
  });

  test('logs permanent delivery failures without rejecting the caller', async () => {
    const sendMail = jest.fn().mockRejectedValue(Object.assign(new Error('recipient rejected'), { responseCode: 550 }));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    nodemailer.createTransport.mockReturnValue({ sendMail });

    await expect(dispatchOrderEvent('placed', order, recipient)).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Order e-mail delivery failed:', 'recipient rejected');
    log.mockRestore();
  });

  test('SASD 4.4.3: each e-mail that is finally not delivered is counted for monitoring', async () => {
    const { monitor } = require('../../src/monitoring/monitor');
    const sendMail = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('mailbox unavailable'), { responseCode: 550 }))
      .mockResolvedValueOnce({});
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    nodemailer.createTransport.mockReturnValue({ sendMail });

    await dispatchOrderEvent('placed', order, recipient);
    await dispatchOrderEvent('placed', order, recipient);
    expect(monitor.snapshot().totals.emailPermanentFailures).toBe(1);
    log.mockRestore();
  });

  test('SASD 4.4.3: an alert e-mail goes to ALERT_EMAIL only when it is set, and its failure is not counted', async () => {
    const { monitor } = require('../../src/monitoring/monitor');
    const { sendOperationalAlert } = require('../../src/services/emailService');
    const sendMail = jest.fn().mockResolvedValue({});
    nodemailer.createTransport.mockReturnValue({ sendMail });

    config.alertEmail = undefined;
    await expect(sendOperationalAlert('Alert', 'x')).resolves.toBe(false);
    expect(sendMail).not.toHaveBeenCalled();

    config.alertEmail = 'ops@example.test';
    await expect(sendOperationalAlert('[Online Bookstore] Alert: api5xxRate', 'api5xxRate value=3.0%')).resolves.toBe(true);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ops@example.test', subject: '[Online Bookstore] Alert: api5xxRate' }));

    sendMail.mockRejectedValueOnce(Object.assign(new Error('rejected'), { responseCode: 554 }));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(sendOperationalAlert('Alert', 'x')).resolves.toBe(false);
    expect(monitor.snapshot().totals.emailPermanentFailures).toBe(0);
    log.mockRestore();
  });
});
