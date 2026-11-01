const TZ = 'America/Sao_Paulo'

export const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// "AAAA-MM-DD" no fuso da barbearia, com deslocamento opcional em dias.
export function diaISO(deslocamento = 0) {
  const d = new Date(Date.now() + deslocamento * 86400000)
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

export const statusAgendamento: Record<string, string> = {
  pending: 'Aguardando confirmação', confirmed: 'Confirmado', cancelled: 'Cancelado', done: 'Concluído'
}
export const statusPagamento: Record<string, string> = {
  awaiting: 'Aguardando pagamento', review: 'Em análise', paid: 'Pago', cancelled: 'Cancelado'
}

export function mensagemErro(msg: string | undefined) {
  if (msg?.includes('horario_indisponivel')) return 'Esse horário acabou de ser reservado. Escolha outro.'
  if (msg?.includes('servico_')) return 'Este serviço não está mais disponível.'
  if (msg?.includes('agendamento_invalido')) return 'Este agendamento não pode mais ser alterado.'
  return 'Não foi possível concluir. Verifique a conexão e tente de novo.'
}
