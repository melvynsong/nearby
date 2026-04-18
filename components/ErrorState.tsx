type ErrorStateProps = {
  title?: string
  message?: string
  primaryLabel?: string
  onPrimary: () => void
  secondaryLabel?: string
  onSecondary?: () => void
}

export default function ErrorState({
  title = 'Something did not go through',
  message = 'We could not complete this just now. Please try again.',
  primaryLabel = 'Try Again',
  onPrimary,
  secondaryLabel,
  onSecondary,
}: ErrorStateProps) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-600">
        !
      </div>
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      <p className="mt-1 text-sm text-neutral-600">{message}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onPrimary}
          className="rounded-xl bg-[#1f355d] px-4 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.02] hover:bg-[#162746] active:scale-[0.99]"
        >
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  )
}
