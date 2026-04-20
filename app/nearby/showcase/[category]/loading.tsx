// Route-level loading overlay for showcase detail
import { useMemo } from 'react'

const MESSAGES = [
  "Don't be hangry – we're plating this up...",
  'Wok hei in progress...',
  'Simmering the best picks nearby...',
  'Seasoning your shortlist...',
  'Steaming up something tasty...',
  'Just a dash more flavor...',
  'Rolling out the noodles...',
  'Polishing the chopsticks...'
]

function getRandomMessage() {
  return MESSAGES[Math.floor(Math.random() * MESSAGES.length)]
}

export default function ShowcaseDetailLoading() {
  const message = useMemo(getRandomMessage, [])
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
      <div className="animate-bounce mb-4 text-5xl">🍜</div>
      <div className="text-lg font-medium text-[#1f355d] mb-2">{message}</div>
      <div className="w-16 h-2 rounded-full bg-gradient-to-r from-[#fbbf24] via-[#f472b6] to-[#60a5fa] animate-pulse" />
    </div>
  )
}
