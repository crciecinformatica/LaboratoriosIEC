type TeamsNotificacaoPayload = {
    titulo: string
    reservaId: string
    solicitante: string
    professor: string
    turma: string
    modalidade: 'PRESENCIAL' | 'REMOTO' | 'RAS'
    softwares: string
    numeroAlunos: number
    datas: { dataInicio: Date; dataFim: Date }[]
    laboratorio?: string
    evento: 'CRIACAO' | 'CONFIRMACAO' | 'REJEICAO'
    motivoRejeicao?: string
    cscProtocolo?: string
}