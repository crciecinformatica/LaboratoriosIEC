import { transicaoValida, transicoesValidas } from '@/types'

describe('Máquina de estados — transições', () => {
  it('CRIADA só pode ir para AGUARDANDO_CONFIRMACAO', () => {
    expect(transicaoValida('CRIADA', 'AGUARDANDO_CONFIRMACAO')).toBe(true)
    expect(transicaoValida('CRIADA', 'CONFIRMADA')).toBe(false)
    expect(transicaoValida('CRIADA', 'REJEITADA')).toBe(false)
  })

  it('AGUARDANDO_CONFIRMACAO pode ir para CONFIRMADA, CONFLITO ou REJEITADA', () => {
    expect(transicaoValida('AGUARDANDO_CONFIRMACAO', 'CONFIRMADA')).toBe(true)
    expect(transicaoValida('AGUARDANDO_CONFIRMACAO', 'CONFLITO_DE_DATAS')).toBe(true)
    expect(transicaoValida('AGUARDANDO_CONFIRMACAO', 'REJEITADA')).toBe(true)
    expect(transicaoValida('AGUARDANDO_CONFIRMACAO', 'CRIADA')).toBe(false)
  })

  it('CONFLITO_DE_DATAS pode voltar para AGUARDANDO ou ir para REJEITADA', () => {
    expect(transicaoValida('CONFLITO_DE_DATAS', 'AGUARDANDO_CONFIRMACAO')).toBe(true)
    expect(transicaoValida('CONFLITO_DE_DATAS', 'REJEITADA')).toBe(true)
    expect(transicaoValida('CONFLITO_DE_DATAS', 'CONFIRMADA')).toBe(false)
  })

  it('CONFIRMADA e REJEITADA são estados terminais', () => {
    expect(transicoesValidas['CONFIRMADA']).toHaveLength(0)
    expect(transicoesValidas['REJEITADA']).toHaveLength(0)
  })
})
