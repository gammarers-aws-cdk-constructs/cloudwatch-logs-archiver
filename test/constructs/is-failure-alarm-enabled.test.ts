import { isFailureAlarmEnabled } from '../../src/constructs/is-failure-alarm-enabled';

describe('isFailureAlarmEnabled', () => {
  it.each([
    { name: 'undefined failure alarm options', failureAlarm: undefined, expected: false },
    { name: 'empty failure alarm options', failureAlarm: {}, expected: false },
    { name: 'enabled false', failureAlarm: { enabled: false }, expected: false },
    { name: 'enabled true', failureAlarm: { enabled: true }, expected: true },
    { name: 'notification topic only', failureAlarm: { notificationTopic: { topicArn: 'arn:aws:sns:us-east-1:123:ops' } }, expected: true },
    { name: 'enabled false with topic', failureAlarm: { enabled: false, notificationTopic: { topicArn: 'arn:aws:sns:us-east-1:123:ops' } }, expected: true },
    { name: 'enabled true with topic', failureAlarm: { enabled: true, notificationTopic: { topicArn: 'arn:aws:sns:us-east-1:123:ops' } }, expected: true },
  ])('$name', ({ failureAlarm, expected }) => {
    expect(isFailureAlarmEnabled(failureAlarm)).toBe(expected);
  });
});
