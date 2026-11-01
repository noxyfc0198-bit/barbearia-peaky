import { createClient } from '@supabase/supabase-js'

// A URL do projeto não é segredo. A chave PUBLICÁVEL (anon/publishable) também é pública por
// natureza: quem protege os dados são as regras RLS do banco. NUNCA coloque aqui a chave
// "service_role" ou "secret".
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://scbwmyylzdudnunkbtco.supabase.co'
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
  || (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)

export const supabaseUrl = url
export const supabaseConfigurado = Boolean(key)

export const supabase = createClient(url, key ?? 'sem-chave')
