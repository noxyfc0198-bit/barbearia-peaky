export const formatarReais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// "35,50" -> 3550. Retorna null se o texto não for um valor válido.
export function paraCentavos(texto: string): number | null {
  const n = Number(texto.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}
