import { setScheduling, execution, fetchUrl, sendMail } from '../src/Code';

// ---- helpers to reset mocks between tests ----

function resetMocks() {
  const triggerBuilder = {
    timeBased: jest.fn().mockReturnThis(),
    everyMinutes: jest.fn().mockReturnThis(),
    create: jest.fn(),
  };

  const scriptProps = {
    getProperties: jest.fn().mockReturnValue({}),
    getProperty: jest.fn().mockReturnValue(null),
    setProperty: jest.fn(),
  };

  const response = {
    getResponseCode: jest.fn().mockReturnValue(200),
  };

  (global as any).ScriptApp = {
    getProjectTriggers: jest.fn().mockReturnValue([]),
    deleteTrigger: jest.fn(),
    newTrigger: jest.fn().mockReturnValue(triggerBuilder),
  };

  (global as any).PropertiesService = {
    getScriptProperties: jest.fn().mockReturnValue(scriptProps),
  };

  (global as any).UrlFetchApp = {
    fetch: jest.fn().mockReturnValue(response),
  };

  (global as any).MailApp = {
    sendEmail: jest.fn(),
  };

  return { triggerBuilder, scriptProps, response };
}

// ---- setScheduling ----

describe('setScheduling', () => {
  it('deletes all existing triggers', () => {
    const { triggerBuilder } = resetMocks();
    const trigger1 = {};
    const trigger2 = {};
    (global as any).ScriptApp.getProjectTriggers.mockReturnValue([trigger1, trigger2]);

    setScheduling();

    expect((global as any).ScriptApp.deleteTrigger).toHaveBeenCalledTimes(2);
    expect((global as any).ScriptApp.deleteTrigger).toHaveBeenCalledWith(trigger1);
    expect((global as any).ScriptApp.deleteTrigger).toHaveBeenCalledWith(trigger2);
  });

  it('works when there are no existing triggers', () => {
    resetMocks();
    (global as any).ScriptApp.getProjectTriggers.mockReturnValue([]);

    setScheduling();

    expect((global as any).ScriptApp.deleteTrigger).not.toHaveBeenCalled();
  });

  it('creates a new trigger named "execution"', () => {
    const { triggerBuilder } = resetMocks();

    setScheduling();

    expect((global as any).ScriptApp.newTrigger).toHaveBeenCalledWith('execution');
  });

  it('creates a time-based trigger running every 1 minute', () => {
    const { triggerBuilder } = resetMocks();

    setScheduling();

    expect(triggerBuilder.timeBased).toHaveBeenCalled();
    expect(triggerBuilder.everyMinutes).toHaveBeenCalledWith(1);
    expect(triggerBuilder.create).toHaveBeenCalled();
  });
});

// ---- execution ----

describe('execution', () => {
  it('calls fetchUrl for each property key starting with "http"', () => {
    const { scriptProps } = resetMocks();
    scriptProps.getProperties.mockReturnValue({
      'http://example.com': '200',
      'https://example.org': '200',
    });
    // stub UrlFetchApp response to match expected so sendMail is not triggered
    (global as any).UrlFetchApp.fetch.mockReturnValue({ getResponseCode: () => 200 });

    execution();

    expect((global as any).UrlFetchApp.fetch).toHaveBeenCalledTimes(2);
    expect((global as any).UrlFetchApp.fetch).toHaveBeenCalledWith(
      'http://example.com',
      { muteHttpExceptions: true }
    );
    expect((global as any).UrlFetchApp.fetch).toHaveBeenCalledWith(
      'https://example.org',
      { muteHttpExceptions: true }
    );
  });

  it('ignores property keys that do not start with "http"', () => {
    const { scriptProps } = resetMocks();
    scriptProps.getProperties.mockReturnValue({
      to: 'admin@example.com',
      debug: 'true',
    });

    execution();

    expect((global as any).UrlFetchApp.fetch).not.toHaveBeenCalled();
  });

  it('does nothing when properties are empty', () => {
    const { scriptProps } = resetMocks();
    scriptProps.getProperties.mockReturnValue({});

    execution();

    expect((global as any).UrlFetchApp.fetch).not.toHaveBeenCalled();
    expect((global as any).MailApp.sendEmail).not.toHaveBeenCalled();
  });

  it('processes http keys and skips non-http keys in mixed properties', () => {
    const { scriptProps } = resetMocks();
    scriptProps.getProperties.mockReturnValue({
      to: 'admin@example.com',
      'http://example.com': '200',
      debug: 'false',
      'https://example.org': '200',
    });
    (global as any).UrlFetchApp.fetch.mockReturnValue({ getResponseCode: () => 200 });

    execution();

    expect((global as any).UrlFetchApp.fetch).toHaveBeenCalledTimes(2);
  });
});

// ---- fetchUrl ----

describe('fetchUrl', () => {
  it('does not send mail when status code matches expected', () => {
    const { scriptProps } = resetMocks();
    (global as any).UrlFetchApp.fetch.mockReturnValue({ getResponseCode: () => 200 });

    fetchUrl('http://example.com', '200');

    expect((global as any).MailApp.sendEmail).not.toHaveBeenCalled();
    expect(scriptProps.setProperty).not.toHaveBeenCalled();
  });

  it('sends mail and updates property when status code differs from expected', () => {
    const { scriptProps } = resetMocks();
    scriptProps.getProperty.mockReturnValue('admin@example.com');
    (global as any).UrlFetchApp.fetch.mockReturnValue({ getResponseCode: () => 500 });

    fetchUrl('http://example.com', '200');

    expect(scriptProps.setProperty).toHaveBeenCalledWith('http://example.com', '500');
    expect((global as any).MailApp.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('sets statusCode to 999 and sends mail when fetch throws an error', () => {
    const { scriptProps } = resetMocks();
    scriptProps.getProperty.mockReturnValue('admin@example.com');
    (global as any).UrlFetchApp.fetch.mockImplementation(() => {
      throw new Error('Network error');
    });

    fetchUrl('http://example.com', '200');

    expect(scriptProps.setProperty).toHaveBeenCalledWith('http://example.com', '999');
    expect((global as any).MailApp.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('does not send mail when fetch throws and expected code is 999', () => {
    resetMocks();
    (global as any).UrlFetchApp.fetch.mockImplementation(() => {
      throw new Error('Network error');
    });

    fetchUrl('http://example.com', '999');

    expect((global as any).MailApp.sendEmail).not.toHaveBeenCalled();
  });

  it('fetches the URL with muteHttpExceptions option', () => {
    resetMocks();
    (global as any).UrlFetchApp.fetch.mockReturnValue({ getResponseCode: () => 200 });

    fetchUrl('http://example.com', '200');

    expect((global as any).UrlFetchApp.fetch).toHaveBeenCalledWith(
      'http://example.com',
      { muteHttpExceptions: true }
    );
  });

  it('handles 3xx redirect responses correctly', () => {
    const { scriptProps } = resetMocks();
    scriptProps.getProperty.mockReturnValue('admin@example.com');
    (global as any).UrlFetchApp.fetch.mockReturnValue({ getResponseCode: () => 301 });

    fetchUrl('http://example.com', '200');

    expect(scriptProps.setProperty).toHaveBeenCalledWith('http://example.com', '301');
    expect((global as any).MailApp.sendEmail).toHaveBeenCalledTimes(1);
  });
});

// ---- sendMail ----

describe('sendMail', () => {
  it('uses "OK" state for 2xx status codes', () => {
    const { scriptProps } = resetMocks();
    scriptProps.getProperty.mockReturnValue('admin@example.com');

    sendMail('http://example.com', 200);

    const [, subject, body] = (global as any).MailApp.sendEmail.mock.calls[0];
    expect(subject).toContain('[OK]');
    expect(body).toContain('OK');
  });

  it('uses "OK" state for 201 status code', () => {
    const { scriptProps } = resetMocks();
    scriptProps.getProperty.mockReturnValue('admin@example.com');

    sendMail('http://example.com', 201);

    const [, subject] = (global as any).MailApp.sendEmail.mock.calls[0];
    expect(subject).toContain('[OK]');
  });

  it('uses "ALARM" state for 4xx status codes', () => {
    const { scriptProps } = resetMocks();
    scriptProps.getProperty.mockReturnValue('admin@example.com');

    sendMail('http://example.com', 404);

    const [, subject, body] = (global as any).MailApp.sendEmail.mock.calls[0];
    expect(subject).toContain('[ALARM]');
    expect(body).toContain('ALARM');
  });

  it('uses "ALARM" state for 5xx status codes', () => {
    const { scriptProps } = resetMocks();
    scriptProps.getProperty.mockReturnValue('admin@example.com');

    sendMail('http://example.com', 500);

    const [, subject] = (global as any).MailApp.sendEmail.mock.calls[0];
    expect(subject).toContain('[ALARM]');
  });

  it('uses "ALARM" state for error code 999', () => {
    const { scriptProps } = resetMocks();
    scriptProps.getProperty.mockReturnValue('admin@example.com');

    sendMail('http://example.com', 999);

    const [, subject] = (global as any).MailApp.sendEmail.mock.calls[0];
    expect(subject).toContain('[ALARM]');
  });

  it('formats the subject with the correct prefix, state, status code and URL', () => {
    const { scriptProps } = resetMocks();
    scriptProps.getProperty.mockReturnValue('admin@example.com');

    sendMail('http://example.com', 200);

    const [, subject] = (global as any).MailApp.sendEmail.mock.calls[0];
    expect(subject).toBe('[gas-health-check] [OK] 200: http://example.com');
  });

  it('formats the body with state, status code, and URL on separate lines', () => {
    const { scriptProps } = resetMocks();
    scriptProps.getProperty.mockReturnValue('admin@example.com');

    sendMail('http://example.com', 200);

    const [, , body] = (global as any).MailApp.sendEmail.mock.calls[0];
    expect(body).toBe('OK\n200\nhttp://example.com');
  });

  it('sends email to the "to" address from script properties', () => {
    const { scriptProps } = resetMocks();
    scriptProps.getProperty.mockReturnValue('recipient@example.com');

    sendMail('http://example.com', 200);

    const [to] = (global as any).MailApp.sendEmail.mock.calls[0];
    expect(to).toBe('recipient@example.com');
    expect(scriptProps.getProperty).toHaveBeenCalledWith('to');
  });

  it('formats ALARM subject correctly for a failing URL', () => {
    const { scriptProps } = resetMocks();
    scriptProps.getProperty.mockReturnValue('ops@example.com');

    sendMail('https://api.example.com/health', 503);

    const [to, subject, body] = (global as any).MailApp.sendEmail.mock.calls[0];
    expect(to).toBe('ops@example.com');
    expect(subject).toBe('[gas-health-check] [ALARM] 503: https://api.example.com/health');
    expect(body).toBe('ALARM\n503\nhttps://api.example.com/health');
  });
});
