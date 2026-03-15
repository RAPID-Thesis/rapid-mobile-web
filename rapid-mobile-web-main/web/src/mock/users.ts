import type { User } from '../types';

export const mockUsers: User[] = [
  {
    id: 'u1',
    email: 'juan.delacruz@lgu.gov.ph',
    full_name: 'Juan Dela Cruz',
    role: 'inspector',
    lgu_code: 'TAAL-BTG',
    avatar_url: null,
    created_at: '2026-01-15T08:00:00Z',
    updated_at: '2026-01-15T08:00:00Z',
  },
  {
    id: 'u2',
    email: 'maria.santos@lgu.gov.ph',
    full_name: 'Engr. Maria Santos',
    role: 'engineer',
    lgu_code: 'TAAL-BTG',
    avatar_url: null,
    created_at: '2026-01-10T08:00:00Z',
    updated_at: '2026-01-10T08:00:00Z',
  },
  {
    id: 'u3',
    email: 'pedro.reyes@lgu.gov.ph',
    full_name: 'Pedro Reyes',
    role: 'drrmo',
    lgu_code: 'TAAL-BTG',
    avatar_url: null,
    created_at: '2026-01-12T08:00:00Z',
    updated_at: '2026-01-12T08:00:00Z',
  },
  {
    id: 'u4',
    email: 'admin@lgu.gov.ph',
    full_name: 'System Admin',
    role: 'admin',
    lgu_code: 'TAAL-BTG',
    avatar_url: null,
    created_at: '2026-01-01T08:00:00Z',
    updated_at: '2026-01-01T08:00:00Z',
  },
];

export const currentUser = mockUsers[1];
