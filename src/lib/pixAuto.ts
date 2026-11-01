import { supabase } from './supabase'

export type Cobranca = { copia_cola: string; qr_base64: string; expira_em: string; valor_cents: number }
export type Resultado = { ok: true; pago: boolean; cobranca?: Cobranca } | { ok: false; codigo: string }

// Pede ao servidor uma cobrança Pix dinâmica. O valor é calculado no servidor.
export async function criarCobranca(token: string, appointmentId: string): Promise<Resultado> {
  const { data, error } = await supabase.functions.invoke('criar-cobranca-pix', { body: { token, appointment_id: appointmentId } })
  if (!error) return data?.status === 'paid' ? { ok: true, pago: true } : { ok: true, pago: false, cobranca: data as Cobranca }
  let codigo = 'erro'
  try { codigo = (await (error as unknown as { context: Response }).context.json()).erro ?? 'erro' } catch { /* sem detalhe */ }
  return { ok: false, codigo }
}

export async function credenciais(corpo: Record<string, string>) {
  const { data, error } = await supabase.functions.invoke('salvar-credenciais-pix', { body: corpo })
  let codigo = ''
  if (error) { try { codigo = (await (error as unknown as { context: Response }).context.json()).erro ?? 'erro' } catch { codigo = 'erro' } }
  return { data: data as { conectado?: boolean; conta?: string | null } | null, codigo }
}
