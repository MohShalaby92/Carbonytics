import { useState, useEffect, useContext, createContext, ReactNode } from 'react';
import { User } from '../types';
import { apiService } from '../services/api';
import { API_ENDPOINTS } from '../constants';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => void;
  updateProfile: (userData: Partial<User>) => Promise<void>;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  organizationName: string;
  industry: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        const response = await apiService.get<User>(API_ENDPOINTS.AUTH.PROFILE);
        if (response.success && response.data) {
          setUser(response.data);
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await apiService.post<{
      user: User;
      accessToken: string;
      refreshToken: string;
    }>(API_ENDPOINTS.AUTH.LOGIN, { email, password });

    if (response.success && response.data) {
      const { user, accessToken, refreshToken } = response.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      setUser(user);
    }
  };

  const register = async (userData: RegisterData) => {
    const response = await apiService.post<{
      user: User;
      accessToken: string;
      refreshToken: string;
    }>(API_ENDPOINTS.AUTH.REGISTER, userData);

    if (response.success && response.data) {
      const { user, accessToken, refreshToken } = response.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      setUser(user);
    }
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
    // Optional: Call logout endpoint
    apiService.post(API_ENDPOINTS.AUTH.LOGOUT);
  };

  const updateProfile = async (userData: Partial<User>) => {
    const response = await apiService.put<User>(API_ENDPOINTS.AUTH.PROFILE, userData);
    if (response.success && response.data) {
      setUser(response.data);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      register,
      logout,
      updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
