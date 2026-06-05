import { Perfil } from '@prisma/client'
import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface User {
    id: string
    perfil: Perfil
  }
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      perfil: Perfil
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    perfil: Perfil
  }
}
