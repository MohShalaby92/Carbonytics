import React from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { Navbar } from './components/layout/Navbar';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { CalculationPage } from './pages/calculations/CalculationPage';
import { LoginPage } from './components/auth/LoginPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { ImportExportPage } from './pages/ImportExportPage';
import { SettingsPage } from './pages/settings/SettingsPage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <main>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              } />
              <Route path="/calculations" element={
                <ProtectedRoute>
                  <CalculationPage />
                </ProtectedRoute>
              } />
              <Route path="/import-export" element={
                <ProtectedRoute>
                  <ImportExportPage />
                </ProtectedRoute>
              } />
              <Route path="/settings" element={
              <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              } />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
