import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface Owner {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  token: string | null;
  owner: Owner | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "agentpass_token";
const OWNER_KEY = "agentpass_owner";
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3846";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    token: null,
    owner: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Validate token and fetch owner info
  const validateToken = async (token: string): Promise<Owner | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return {
        id: data.owner_id,
        email: data.email,
        name: data.name,
      };
    } catch (error) {
      console.error("Token validation failed:", error);
      return null;
    }
  };

  // Initialize auth state from localStorage
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);

      if (!storedToken) {
        setState({
          token: null,
          owner: null,
          isAuthenticated: false,
          isLoading: false,
        });
        return;
      }

      // Restore cached owner info immediately (no network request)
      const cachedOwner = localStorage.getItem(OWNER_KEY);
      if (cachedOwner) {
        try {
          const owner = JSON.parse(cachedOwner) as Owner;
          setState({
            token: storedToken,
            owner,
            isAuthenticated: true,
            isLoading: false,
          });
          // Validate in background — if token expired, logout on next API call via onUnauthorized
          validateToken(storedToken).then((freshOwner) => {
            if (freshOwner) {
              localStorage.setItem(OWNER_KEY, JSON.stringify(freshOwner));
            }
            // Don't logout on background validation failure — let onUnauthorized handle it
          });
          return;
        } catch {
          // Corrupted cache — fall through to network validation
        }
      }

      // No cached owner — must validate via network
      const owner = await validateToken(storedToken);

      if (owner) {
        localStorage.setItem(OWNER_KEY, JSON.stringify(owner));
        setState({
          token: storedToken,
          owner,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(OWNER_KEY);
        setState({
          token: null,
          owner: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Login failed" }));
      throw new Error(error.error || "Invalid email or password");
    }

    const data = await response.json();
    const owner: Owner = {
      id: data.owner_id,
      email: data.email,
      name: data.name,
    };

    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(OWNER_KEY, JSON.stringify(owner));

    setState({
      token: data.token,
      owner,
      isAuthenticated: true,
      isLoading: false,
    });
  };

  const register = async (email: string, password: string, name: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Registration failed" }));
      throw new Error(error.error || "Registration failed");
    }

    const data = await response.json();
    const owner: Owner = {
      id: data.owner_id,
      email: data.email,
      name,
    };

    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(OWNER_KEY, JSON.stringify(owner));

    setState({
      token: data.token,
      owner,
      isAuthenticated: true,
      isLoading: false,
    });
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(OWNER_KEY);
    setState({
      token: null,
      owner: null,
      isAuthenticated: false,
      isLoading: false,
    });
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
