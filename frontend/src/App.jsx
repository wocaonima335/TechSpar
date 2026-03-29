import { BrowserRouter, Route, Routes } from "react-router-dom";

import AdminRoute from "./components/AdminRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import Header from "./components/Header";
import ProtectedRoute from "./components/ProtectedRoute";
import Graph from "./pages/Graph";
import History from "./pages/History";
import Home from "./pages/Home";
import Interview from "./pages/Interview";
import Knowledge from "./pages/Knowledge";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import Review from "./pages/Review";
import TopicDetail from "./pages/TopicDetail";
import AdminContent from "./pages/admin/AdminContent";
import AdminUsers from "./pages/admin/AdminUsers";

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
        <Header />
        <Routes>
          <Route path="/login" element={<Login />} />
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
