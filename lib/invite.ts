export function buildGroupInviteMessage(groupName: string, groupPasscode: string): string {
  return [
    `Group Invite - ${groupName}`,
    '',
    'You are invited to join my group on Nearby.',
    '',
    'How to join:',
    '',
    '1. Open the Nearby app',
    '2. Go to Join Group',
    `3. Enter this passcode: ${groupPasscode}`,
    '',
    'Before joining:',
    '',
    '* Create your account',
    '',
    'See you inside.',
  ].join('\n')
}
