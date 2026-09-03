/**
 * Whether failure CloudWatch Alarms should be created.
 * Alarms are created when `enabled` is true, or when a notification topic is provided.
 *
 * @param failureAlarm - Optional failure-alarm configuration from construct props.
 * @returns `true` when failure alarms should be created.
 */
export const isFailureAlarmEnabled = (failureAlarm: {
  readonly enabled?: boolean;
  readonly notificationTopic?: object;
} | undefined): boolean => {
  if (failureAlarm === undefined) {
    return false;
  }
  if (failureAlarm.enabled === true) {
    return true;
  }
  return failureAlarm.notificationTopic !== undefined;
};
