import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import AdminRoute from "./components/AdminRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import Header from "./components/Header";
import ProtectedRoute from "./components/ProtectedRoute";

const AdminContent = lazy(() => import("./pages/admin/AdminContent"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const Graph = lazy(() => import("./pages/Graph"));
const History = lazy(() => import("./pages/History"));
const Home = lazy(() => import("./pages/Home"));
const Interview = lazy(() => import("./pages/Interview"));
const Knowledge = lazy(() => import("./pages/Knowledge"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Profile = lazy(() => import("./pages/Profile"));
const Review = lazy(() => import("./pages/Review"));
const TopicDetail = lazy(() => import("./pages/TopicDetail"));

function RouteFallback() {
  return (
    <div className="ts-page-narrow py-16">
      <div className="ts-empty-state">正在加载 TechSpar 页面...</div>
    </div>
  );
}

function ProtectedPage({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

function AdminPage({ children }) {
  return <AdminRoute>{children}</AdminRoute>;
}

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <div className="min-h-screen bg-[radial-gradient(circle_at_18%_0%,rgba(59,130,246,0.16),transparent_28%),radial-gradient(circle_at_84%_8%,rgba(45,212,191,0.10),transparent_24%),linear-gradient(180deg,var(--bg),var(--bg-soft))] text-text">
          <Header />
          <main className="relative z-10">
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/" element={<ProtectedPage><Home /></ProtectedPage>} />
                <Route path="/interview/:sessionId" element={<ProtectedPage><Interview /></ProtectedPage>} />
                <Route path="/review/:sessionId" element={<ProtectedPage><Review /></ProtectedPage>} />
                <Route path="/history" element={<ProtectedPage><History /></ProtectedPage>} />
                <Route path="/profile" element={<ProtectedPage><Profile /></ProtectedPage>} />
                <Route path="/profile/topic/:topic" element={<ProtectedPage><TopicDetail /></ProtectedPage>} />
                <Route path="/knowledge" element={<ProtectedPage><Knowledge /></ProtectedPage>} />
                <Route path="/graph" element={<ProtectedPage><Graph /></ProtectedPage>} />
                <Route path="/admin/users" element={<AdminPage><AdminUsers /></AdminPage>} />
                <Route path="/admin/content" element={<AdminPage><AdminContent /></AdminPage>} />
                <Route path="/admin/settings" element={<AdminPage><AdminSettings /></AdminPage>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
