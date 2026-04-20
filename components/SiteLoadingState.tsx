import React, { useState, useEffect, useRef } from 'react';

const DEFAULT_MESSAGES = [
  { icon: '🍳', get: () => 'Chef is plating this for you...' },
  { icon: '🔥', get: () => 'Bringing out the wok hei...' },
  { icon: '🍜', get: () => 'Simmering the broth...' },
  { icon: '🥢', get: () => 'Picking the best bites nearby...' },
  { icon: '🍽️', get: () => 'Setting the table...' },
  { icon: '🌶️', get: () => 'Adding a little extra flavour...' },
  { icon: '👨‍🍳', get: () => 'Chef is cooking something good...' },
  { icon: '⭐', get: () => 'Gathering the crowd favourites...' },
  { icon: '📍', get: () => 'Finding good places near you...' },
  { icon: '🫶', get: () => 'Curating spots people really love...' },
];

const DISH_MESSAGES = [
  { match: /prawn noodles/i, icon: '🦐', get: () => 'Simmering the prawn broth...' },
  { match: /grilled ribeye/i, icon: '🥩', get: () => 'Searing the best picks...' },
  { match: /chicken rice/i, icon: '🍗', get: () => 'Poaching the favourites...' },
  { match: /laksa/i, icon: '🌶️', get: () => 'Waking up the laksa broth...' },
];

export function getLoadingMessages(context: any) {
  if (context?.dish) {
    const found = DISH_MESSAGES.find((m) => m.match.test(context.dish));
    if (found) return [{ icon: found.icon, get: found.get }].concat(DEFAULT_MESSAGES);
  }
  if (context?.type === 'saving') {
    return [
      { icon: '🍽️', get: () => 'Saving your spot...' },
      ...DEFAULT_MESSAGES,
    ];
  }
  if (context?.type === 'analyzing') {
    return [
      { icon: '👨‍🍳', get: () => 'Studying the dish...' },
      ...DEFAULT_MESSAGES,
    ];
  }
  if (context?.type === 'fetching') {
    return [
      { icon: '📍', get: () => 'Looking for good places nearby...' },
      ...DEFAULT_MESSAGES,
    ];
  }
  return DEFAULT_MESSAGES;
}

export default function SiteLoadingState({ context }: { context?: any }) {
  const messages = getLoadingMessages(context);
  const [idx, setIdx] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setIdx((i) => (i + 1) % messages.length);
    }, 1200 + Math.random() * 600);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [idx, messages.length]);
  const msg = messages[idx];
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] w-full animate-fade-in">
      <div className="text-6xl md:text-7xl drop-shadow-lg animate-bounce-slow mb-4" aria-hidden>{msg.icon}</div>
      <div className="text-xl md:text-2xl font-extrabold text-yellow-500 mb-2 text-center drop-shadow animate-pulse">
        {msg.get()}
      </div>
      <div className="w-24 h-3 rounded-full bg-gradient-to-r from-yellow-300 via-pink-200 to-blue-200 animate-pulse shadow-lg mb-4" />
    </div>
  );
}
