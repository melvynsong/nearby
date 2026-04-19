export function buildGroupInviteMessage(groupName: string, groupPasscode: string): string {
  return [
    `You\'re invited to join ${groupName} on Nearby.`,
    'This is a private group.',
    '',
    `Passcode: ${groupPasscode}`,
    '',
    'Use your registered phone number in Nearby.',
    'Only invited numbers can join this private group.',
    '',
    'https://togostory.com/nearby',
  ].join('\n')
}
