// Showcase landing page with pills, search, and premium UI
import { Suspense } from 'react'
import ShowcaseLanding from './ShowcaseLanding'
import ShowcaseLandingSkeleton from './ShowcaseLandingSkeleton'

export default function ShowcasePage() {
  return (
    <Suspense fallback={<ShowcaseLandingSkeleton />}>
      <ShowcaseLanding />
    </Suspense>
  )
}
