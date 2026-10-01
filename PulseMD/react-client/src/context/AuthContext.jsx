import axios from 'axios';
import { createContext, useContext, useMemo, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:7000/api';
const AuthContext = createContext(null);

export const api = axios.create({ baseURL: API_URL });

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('pulsemd_token') || '');
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('pulsemd_user') || 'null');
    } catch {
      return null;
    }
  });
  const [language, setLanguage] = useState(localStorage.getItem('pulsemd_lang') || 'en');

  api.interceptors.request.use((config) => {
    const saved = localStorage.getItem('pulsemd_token');
    if (saved) config.headers.Authorization = `Bearer ${saved}`;
    return config;
  });

  const value = useMemo(() => ({
    token,
    user,
    language,
    t: (en, hi) => (language === 'hi' ? hi || en : en),
    setLanguage: (next) => {
      localStorage.setItem('pulsemd_lang', next);
      setLanguage(next);
    },
    async login(payload) {
      const { data } = await api.post('/auth/login', payload);
      localStorage.setItem('pulsemd_token', data.token);
      localStorage.setItem('pulsemd_user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      return data.user;
    },
    async register(payload) {
      const { data } = await api.post('/auth/register', payload);
      localStorage.setItem('pulsemd_token', data.token);
      localStorage.setItem('pulsemd_user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      return data.user;
    },
    logout() {
      localStorage.removeItem('pulsemd_token');
      localStorage.removeItem('pulsemd_user');
      setToken('');
      setUser(null);
    }
  }), [token, user, language]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
