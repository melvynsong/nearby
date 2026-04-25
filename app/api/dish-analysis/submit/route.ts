import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// You may want to move these to env vars
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      user_id,
      place_id,
      uploaded_photo_url,
      ai_raw_result,
      suggested_dishes,
      confidence,
      final_selected_dish,
      was_confirmed,
    } = body;

    const { error } = await supabase.from('dish_analysis_events').insert([
      {
        user_id,
        place_id,
        uploaded_photo_url,
        ai_raw_result,
        suggested_dishes,
        final_selected_dish,
        was_confirmed,
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
