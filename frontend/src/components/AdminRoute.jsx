import { Navigate } from "react-router-dom";

import { useAuth } from "../context/useAuth";

export default function AdminRoute({ children }) {
  const { authLoading, currentUser, isAuthenticated } = useAuth();

  if (authLoading) {
    return <div className="text-center py-15 text-dim">校验权限中...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (currentUser?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}
