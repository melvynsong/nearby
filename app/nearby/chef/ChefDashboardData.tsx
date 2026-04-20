// Fetches and renders admin dashboard metrics and management tables
import { supabase } from '@/lib/supabase'
import ChefGroupTable from './ChefGroupTable'
import ChefUserTable from './ChefUserTable'

export default async function ChefDashboardData() {
  // Fetch summary metrics
  const [{ data: groups }, { data: places }, { data: members }, { data: categories }] = await Promise.all([
    supabase.from('groups').select('id'),
    supabase.from('places').select('id'),
    supabase.from('members').select('id'),
    supabase.from('food_categories').select('id'),
  ])
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-xl bg-white shadow p-4">
          <div className="text-xs text-neutral-400 mb-1">Groups</div>
          <div className="text-2xl font-bold">{groups?.length ?? 0}</div>
        </div>
        <div className="rounded-xl bg-white shadow p-4">
          <div className="text-xs text-neutral-400 mb-1">Places</div>
          <div className="text-2xl font-bold">{places?.length ?? 0}</div>
        </div>
        <div className="rounded-xl bg-white shadow p-4">
          <div className="text-xs text-neutral-400 mb-1">Members</div>
          <div className="text-2xl font-bold">{members?.length ?? 0}</div>
        </div>
        <div className="rounded-xl bg-white shadow p-4">
          <div className="text-xs text-neutral-400 mb-1">Categories</div>
          <div className="text-2xl font-bold">{categories?.length ?? 0}</div>
        </div>
      </div>
      <ChefGroupTable />
      <ChefUserTable />
    </div>
  )
}
