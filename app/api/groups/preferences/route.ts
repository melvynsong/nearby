import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/server-supabase'

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const mode = body.mode === 'set' ? 'set' : 'list'
    const requesterUserId = typeof body.requesterUserId === 'string' ? body.requesterUserId : ''

    if (!requesterUserId) {
      return NextResponse.json({ ok: false, message: 'Missing requester.' }, { status: 400 })
    }

    const supabase = getServerSupabaseClient()

    if (mode === 'list') {
      const listResult = await supabase
        .from('group_user_preferences')
        .select('group_id, is_hidden')
        .eq('individual_id', requesterUserId)
        .eq('is_hidden', true)

      if (listResult.error?.code === '42P01' || listResult.error?.code === '42703' || listResult.error?.code === 'PGRST204') {
        return NextResponse.json({ ok: true, hiddenGroupIds: [] })
      }

      if (listResult.error) {
        console.error('[GroupVisibility] list failed:', listResult.error)
        return NextResponse.json({ ok: false, message: 'Could not load hidden groups.' }, { status: 500 })
      }

      const hiddenGroupIds = (listResult.data ?? []).map((row) => row.group_id).filter(Boolean)
      return NextResponse.json({ ok: true, hiddenGroupIds })
    }

    const groupId = typeof body.groupId === 'string' ? body.groupId : ''
    const isHidden = !!body.isHidden

    if (!groupId) {
      return NextResponse.json({ ok: false, message: 'Missing group.' }, { status: 400 })
    }

    const upsertResult = await supabase
      .from('group_user_preferences')
      .upsert(
        {
          group_id: groupId,
          individual_id: requesterUserId,
          is_hidden: isHidden,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'group_id,individual_id' },
      )

    if (upsertResult.error?.code === '42P01' || upsertResult.error?.code === '42703' || upsertResult.error?.code === 'PGRST204') {
      return NextResponse.json({ ok: false, message: 'Group visibility preferences are not configured yet.' }, { status: 500 })
    }

    if (upsertResult.error) {
      console.error('[GroupVisibility] set failed:', upsertResult.error)
      return NextResponse.json({ ok: false, message: 'Could not update visibility.' }, { status: 500 })
    }

    console.log('[GroupVisibility]', {
      group_id: groupId,
      individual_id: requesterUserId,
      action: isHidden ? 'hide' : 'unhide',
    })

    return NextResponse.json({ ok: true, groupId, isHidden })
  } catch (error) {
    console.error('[GroupVisibility] unexpected error:', error)
    return NextResponse.json({ ok: false, message: 'Could not process visibility request.' }, { status: 500 })
  }
}
