export function buildGroupInviteMessage(groupName: string, groupPasscode: string): string {
  return [
    '🎉 You\'re invited!',
    '',
    `👥 Group: ${groupName}`,
    `🔐 Passcode: ${groupPasscode}`,
    '',
    'Join:',
    'https://togostory.com/nearby',
  ].join('\n')
}
