import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../context/useAuth";

export default function ProtectedRoute({ children }) {
  const { authLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (authLoading) {
    return <div className="text-center py-15 text-dim">加载登录态中...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
