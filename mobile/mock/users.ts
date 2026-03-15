import { User } from '../types';

export const mockUsers: User[] = [
  {
    _id: 'u1',
    email: 'juan.delacruz@lgu.gov.ph',
    fullName: 'Juan Dela Cruz',
    role: 'inspector',
    lguCode: 'TAAL-BTG',
    createdAt: '2026-01-15T08:00:00Z',
    updatedAt: '2026-01-15T08:00:00Z',
  },
  {
    _id: 'u2',
    email: 'maria.santos@lgu.gov.ph',
    fullName: 'Engr. Maria Santos',
    role: 'engineer',
    lguCode: 'TAAL-BTG',
    createdAt: '2026-01-10T08:00:00Z',
    updatedAt: '2026-01-10T08:00:00Z',
  },
  {
    _id: 'u3',
    email: 'pedro.reyes@lgu.gov.ph',
    fullName: 'Pedro Reyes',
    role: 'drrmo',
    lguCode: 'TAAL-BTG',
    createdAt: '2026-01-12T08:00:00Z',
    updatedAt: '2026-01-12T08:00:00Z',
  },
  {
    _id: 'u4',
    email: 'admin@lgu.gov.ph',
    fullName: 'System Admin',
    role: 'admin',
    lguCode: 'TAAL-BTG',
    createdAt: '2026-01-01T08:00:00Z',
    updatedAt: '2026-01-01T08:00:00Z',
  },
];

export const currentUser = mockUsers[0];
