import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '../types';

function getRoleBadge(role: string) {
  switch (role) {
    case 'admin': return 'bg-purple-100 text-purple-700';
    case 'engineer': return 'bg-blue-100 text-blue-700';
    case 'drrmo': return 'bg-teal-100 text-teal-700';
    case 'inspector': return 'bg-slate-100 text-slate-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      setUsers((data as User[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-slate-800">User Management</h2>
      </div>

      <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wider bg-slate-50">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">LGU Code</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">
                      {user.full_name
                        ? user.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)
                        : '?'}
                    </div>
                    <span className="font-semibold text-sm text-slate-800">{user.full_name || '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{user.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold capitalize ${getRoleBadge(user.role)}`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{user.lgu_code || '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <p className="text-lg font-semibold mb-1">No users found</p>
            <p className="text-sm">Users will appear here once they register.</p>
          </div>
        )}
      </div>
    </div>
  );
}
