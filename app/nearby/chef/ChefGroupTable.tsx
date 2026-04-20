// Group management table for Chef dashboard
import { supabase } from '@/lib/supabase'

export default async function ChefGroupTable() {
  const { data: groups, error } = await supabase
    .from('groups')
    .select('id, name, owner_id, created_at')
    .order('created_at', { ascending: false })
  if (error) {
    return <div className="text-red-400">Failed to load groups.</div>
  }
  if (!groups || groups.length === 0) {
    return <div className="text-neutral-400 py-8">No groups found.</div>
  }
  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold mb-2">Groups</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-neutral-50">
              <th className="px-3 py-2 text-left font-semibold">Name</th>
              <th className="px-3 py-2 text-left font-semibold">Owner</th>
              <th className="px-3 py-2 text-left font-semibold">Created</th>
              <th className="px-3 py-2 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g: any) => (
              <tr key={g.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{g.name}</td>
                <td className="px-3 py-2">{g.owner_id}</td>
                <td className="px-3 py-2">{new Date(g.created_at).toLocaleDateString()}</td>
                <td className="px-3 py-2">
                  <button className="text-blue-600 hover:underline">View</button>
                  {/* TODO: Edit/Delete actions with confirmation */}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
