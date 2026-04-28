'use client'

import type { BeAChefClue } from '@/components/showcase/BeAChefSheet'

type Props = {
  /** 'scanning' shows the dim + sweep. 'results' shows AI-grounded markers. */
  phase: 'scanning' | 'results' | 'idle'
  clues?: BeAChefClue[]
  /** Limit on how many grounded markers to render. Defaults to 4. */
  max?: number
  className?: string
}

const DEFAULT_MAX = 4

export default function ChefScanOverlay({
  phase,
  clues = [],
  max = DEFAULT_MAX,
  className = '',
}: Props) {
  if (phase === 'idle') return null

  const grounded = clues
    .filter((c) => c.x !== null && c.y !== null && c.label)
    .slice(0, max) as Array<BeAChefClue & { x: number; y: number }>

  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`}>
      {phase === 'scanning' && (
        <>
          <div className="absolute inset-0 bg-black/15" />
          <div className="absolute inset-y-0 -left-1/3 w-1/3 beachef-sweep bg-gradient-to-r from-transparent via-white/40 to-transparent mix-blend-screen" />
        </>
      )}

      {phase === 'results' && grounded.length > 0 && grounded.map((clue, i) => {
        const cx = Math.max(0.06, Math.min(0.94, clue.x))
        const cy = Math.max(0.06, Math.min(0.94, clue.y))
        const align: 'left' | 'right' = cx < 0.5 ? 'right' : 'left'
        return (
          <div
            key={i}
            className="absolute beachef-fade-up"
            style={{
              top: `${cy * 100}%`,
              left: `${cx * 100}%`,
              animationDelay: `${i * 120}ms`,
            }}
          >
            <div className="relative">
              <div className="beachef-marker absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-7 w-7 rounded-full border-2 border-amber-300 shadow-[0_0_0_4px_rgba(251,191,36,0.25)]" />
              <div
                className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm"
                style={
                  align === 'right'
                    ? { left: '22px', maxWidth: '55%' }
                    : { right: '22px', maxWidth: '55%' }
                }
              >
                {clue.label}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
