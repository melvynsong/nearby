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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-yellow-50 via-pink-50 to-blue-50 backdrop-blur-md">
      <div className="animate-bounce mb-4 text-6xl md:text-7xl drop-shadow-lg">🍜</div>
      <div className="text-xl md:text-2xl font-extrabold text-yellow-500 mb-2 text-center drop-shadow">Loading Showcase…</div>
      <div className="text-base md:text-lg font-medium text-[#1f355d] mb-4 text-center max-w-xs">{message}</div>
      <div className="w-24 h-3 rounded-full bg-gradient-to-r from-[#fbbf24] via-[#f472b6] to-[#60a5fa] animate-pulse shadow-lg" />
    </div>
  )
}
