// O barbeiro entra só com a senha. O e-mail é fixo por barbearia (cadastrado no Supabase Auth)
// e a senha é conferida pelo servidor do Supabase (hash bcrypt), nunca comparada no celular.
// O prefixo existe só porque o Supabase exige senhas com pelo menos 6 caracteres.
export const emailDoBarbeiro = (slug: string) => `barbeiro-${slug}@example.com`
export const senhaParaServidor = (digitada: string) => `peaky-${digitada}`
