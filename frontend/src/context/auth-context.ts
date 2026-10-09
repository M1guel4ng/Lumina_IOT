import { createContext } from 'react'
import type { AuthUser } from '../services/authService'
export interface AuthContextValue { user: AuthUser | null; loading: boolean; login: (username: string, password: string, remember: boolean) => Promise<void>; logout: () => void }
export const AuthContext = createContext<AuthContextValue | null>(null)
