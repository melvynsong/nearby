// Central helper for resolving auth and onboarding state in Nearby.
// Source of truth priority: Supabase session > public.users row > localStorage cache.

import { supabase } from '@/lib/supabase'
import { apiPath } from '@/lib/base-path'

export type OnboardingState = {
  authUserId: string | null
  resolvedUserId: string | null
  profileExists: boolean
  personalPasscodeSet: boolean
  hasGroup: boolean
  onboardingComplete: boolean
}

/** Fast path: check localStorage flag (no server round-trip). */
export function isPasscodeSetLocally(): boolean {
  try {
    return localStorage.getItem('nearby_passcode_set') === 'true'
  } catch {
    return false
  }
}

/** Mark passcode as set in localStorage after successful save. */
export function markPasscodeSet(): void {
  try {
    localStorage.setItem('nearby_passcode_set', 'true')
  } catch { /* ignore */ }
}

/** Clear passcode flag (e.g. on logout). */
export function clearPasscodeFlag(): void {
  try {
    localStorage.removeItem('nearby_passcode_set')
  } catch { /* ignore */ }
}

/**
 * Resolve the current user id from Supabase session, falling back to
 * the userId stored in nearby_register localStorage item.
 */
export async function resolveUserId(): Promise<{ authUserId: string | null; resolvedUserId: string | null }> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const authUserId = sessionData?.session?.user?.id ?? null

  if (sessionError) {
    console.warn('[Nearby][AuthGuard] getSession error:', sessionError)
  }

  let resolvedUserId: string | null = authUserId
  if (!resolvedUserId) {
    try {
      const raw = localStorage.getItem('nearby_register')
      if (raw) {
        const parsed = JSON.parse(raw)
        resolvedUserId = parsed?.userId ?? null
      }
    } catch { /* ignore */ }
  }

  return { authUserId, resolvedUserId }
}

/**
 * Full onboarding state: calls /api/auth/onboarding-state for profile and
 * passcode status, then merges with local session info.
 *
 * Logs reason for any blocked state so it appears in browser console.
 */
export async function resolveOnboardingState(): Promise<OnboardingState> {
  const { authUserId, resolvedUserId } = await resolveUserId()

  const hasGroup = !!(
    localStorage.getItem('nearby_session') ||
    localStorage.getItem('nearby_register')
  )

  console.log('[Nearby][AuthGuard] resolveOnboardingState input:', {
    authUserId,
    resolvedUserId,
    hasGroup,
  })

  const base: OnboardingState = {
    authUserId,
    resolvedUserId,
    profileExists: false,
    personalPasscodeSet: false,
    hasGroup,
    onboardingComplete: false,
  }

  if (!resolvedUserId) {
    console.warn('[Nearby][AuthGuard] no userId resolved — user is not signed in or registered')
    return base
  }

  const localPasscodeSet = isPasscodeSetLocally()

  try {
    const response = await fetch(apiPath('/api/auth/onboarding-state'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: resolvedUserId }),
    })

    if (!response.ok) {
      console.warn('[Nearby][AuthGuard] onboarding-state API failed, falling back to localStorage signal')
      return {
        ...base,
        profileExists: true,
        personalPasscodeSet: localPasscodeSet,
        onboardingComplete: localPasscodeSet,
      }
    }

    const result = await response.json()
    const passcodeSet = result.personalPasscodeSet ?? localPasscodeSet
    const profileExists = result.profileExists ?? true

    // Sync localStorage flag from server truth
    if (result.personalPasscodeSet) {
      markPasscodeSet()
    }

    const state: OnboardingState = {
      authUserId,
      resolvedUserId,
      profileExists,
      personalPasscodeSet: passcodeSet,
      hasGroup,
      onboardingComplete: profileExists && passcodeSet,
    }

    console.log('[Nearby][AuthGuard] onboarding state resolved:', {
      ...state,
      blockReason: !profileExists
        ? 'no-profile'
        : !passcodeSet
        ? 'passcode-not-set'
        : !hasGroup
        ? 'no-group'
        : null,
    })

    return state
  } catch (err) {
    console.error('[Nearby][AuthGuard] Failed to resolve onboarding state:', err)
    return {
      ...base,
      profileExists: true,
      personalPasscodeSet: localPasscodeSet,
      onboardingComplete: localPasscodeSet,
    }
  }
}
