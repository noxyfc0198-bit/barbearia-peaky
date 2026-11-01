// Identificação do cliente sem senha: um código secreto aleatório gerado pelo
// servidor, guardado só neste aparelho. O banco guarda apenas o hash dele.
const chave = (slug: string) => `peaky:token:${slug}`
const nomeChave = (slug: string) => `peaky:nome:${slug}`

export const lerToken = (slug: string) => localStorage.getItem(chave(slug))
export const lerNome = (slug: string) => localStorage.getItem(nomeChave(slug))
export function salvarSessao(slug: string, token: string, nome: string) {
  localStorage.setItem(chave(slug), token)
  localStorage.setItem(nomeChave(slug), nome)
}
export function sairCliente(slug: string) {
  localStorage.removeItem(chave(slug))
  localStorage.removeItem(nomeChave(slug))
}
