'use client'

type Props = {
  onAllow: () => void
  onDecline: () => void
}

export default function ShowcaseLocationPrompt({ onAllow, onDecline }: Props) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>📍</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-neutral-900">See what's near you</p>
          <p className="mt-0.5 text-xs leading-relaxed text-neutral-600">
            Allow location access to highlight nearby spots and show walking distances.
            We don't store or share your location.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={onAllow}
              className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-neutral-700"
            >
              Allow location
            </button>
            <button
              onClick={onDecline}
              className="rounded-full border border-neutral-300 px-4 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
