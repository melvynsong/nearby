// User/member management table for Chef dashboard
import { supabase } from '@/lib/supabase'

export default async function ChefUserTable() {
  const { data: members, error } = await supabase
    .from('members')
    .select('id, display_name, phone, created_at, user_id')
    .order('created_at', { ascending: false })
  if (error) {
    return <div className="text-red-400">Failed to load users.</div>
  }
  if (!members || members.length === 0) {
    return <div className="text-neutral-400 py-8">No users found.</div>
  }
  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold mb-2">Users & Members</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-neutral-50">
              <th className="px-3 py-2 text-left font-semibold">Name</th>
              <th className="px-3 py-2 text-left font-semibold">Phone</th>
              <th className="px-3 py-2 text-left font-semibold">Joined</th>
              <th className="px-3 py-2 text-left font-semibold">User ID</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m: any) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{m.display_name}</td>
                <td className="px-3 py-2">{m.phone ? `••••${m.phone.slice(-4)}` : '-'}</td>
                <td className="px-3 py-2">{new Date(m.created_at).toLocaleDateString()}</td>
                <td className="px-3 py-2">{m.user_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
