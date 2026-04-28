import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, isApprovedProfile } from '../../context/AuthContext';

interface Props {
  allowedRoles?: string[];
}

export default function ProtectedRoute({ allowedRoles }: Props) {
  const { session, profile, loading, profileLoading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && session && profile && !isApprovedProfile(profile)) {
      void signOut();
    }
  }, [loading, session, profile, signOut]);

  if (loading || (session && profileLoading && !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (profile && !isApprovedProfile(profile)) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ message: 'Your account is still pending admin approval.' }}
      />
    );
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
