import { mockUsers } from '../mock/users';

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
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-slate-800">User Management</h2>
        <button className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors">
          Add User
        </button>
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
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {mockUsers.map(user => (
              <tr key={user._id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">
                      {user.fullName.split(' ').map(n => n[0]).join('')}
                    </div>
                    <span className="font-semibold text-sm text-slate-800">{user.fullName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{user.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold capitalize ${getRoleBadge(user.role)}`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{user.lguCode}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 border border-slate-300 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
        <strong>Note:</strong> User management is restricted to Admin role. In production, registration is admin-only via the <code className="bg-amber-100 px-1 rounded">/api/auth/register</code> endpoint.
      </div>
    </div>
  );
}
