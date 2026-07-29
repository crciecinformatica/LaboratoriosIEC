import axios, { AxiosError, isAxiosError } from 'axios'
import axiosRetry from 'axios-retry'
import * as fs from 'fs'
import * as https from 'https'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CscPayload {
  CatalogoServicosid: number
  Descricao: string
  LoginSolicitante: string
  flexfield103: number
  Token: string
}

export interface CscResposta {
  protocolo: string
  raw: unknown
}

export class CscApiError extends Error {
  constructor(
    message: string,
    public statusHttp?: number,
    public responseBody?: unknown
  ) {
    super(message)
    this.name = 'CscApiError'
  }
}

// ─── Cliente CSC ──────────────────────────────────────────────────────────────

const criarClienteCSC = () => {
  // Configurar HTTPS agent com suporte a certificados customizados
  const agentOptions: https.AgentOptions = {
    rejectUnauthorized: process.env.CSC_REJECT_UNAUTHORIZED !== 'false',
  }

  // Se houver arquivo de CA certificate customizado, carregar
  if (process.env.CSC_CA_CERT_PATH) {
    try {
      const ca = fs.readFileSync(process.env.CSC_CA_CERT_PATH, 'utf-8')
      agentOptions.ca = ca
    } catch (err) {
      console.warn(`[CSC] Falha ao carregar CSC_CA_CERT_PATH: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const httpsAgent = new https.Agent(agentOptions)

  const client = axios.create({
    timeout: 45000,
    httpsAgent,
  })

  // Configurar retry: 2 tentativas, apenas em erros de rede
  axiosRetry(client, {
    retries: 2,
    retryDelay: (retryCount) => {
      return retryCount * 1000 // 1s, 2s
    },
    retryCondition: (error) => {
      // Tentar apenas em erros de rede, não em 4xx/5xx
      return !isAxiosError(error) || error.response === undefined
    },
  })

  return client
}

const clienteCSC = criarClienteCSC()

/**
 * Abre um chamado no CSC via API
 * Fluxo:
 * 1. POST para AbrirChamado -> retorna código do chamado
 * 2. GET para RetornaDetalhesChamados -> extrai o protocolo
 * @param payload Dados do chamado (descricao, loginSolicitante, flexField103)
 * @returns { protocolo, raw } - número do protocolo e resposta bruta
 * @throws CscApiError em caso de falha
 */
export async function abrirChamadoCSC(payload: {
  descricao: string
  loginSolicitante: string
  flexField103: string
}): Promise<CscResposta> {
  // Validar variáveis de ambiente
  const cscUrl = process.env.CSC_API_URL
  const cscToken = process.env.CSC_TOKEN
  const cscCatalogoId = process.env.CSC_CATALOGO_ID

  if (!cscUrl || !cscToken || !cscCatalogoId) {
    throw new CscApiError(
      'Variáveis de ambiente CSC não configuradas. Verifique CSC_API_URL, CSC_TOKEN, CSC_CATALOGO_ID'
    )
  }

  if (!payload.flexField103) {
    throw new CscApiError(
      'flexField103 é obrigatório para abrir chamado CSC'
    )
  }

  // Montar body do chamado
  const body: CscPayload = {
    CatalogoServicosid: Number(cscCatalogoId),
    Descricao: payload.descricao,
    LoginSolicitante: payload.loginSolicitante,
    flexfield103: Number(payload.flexField103),
    Token: cscToken,
  }

  try {
    // PASSO 1: Abrir chamado (retorna código do chamado)
    const responseAbrir = await clienteCSC.post<string | { protocolo?: string }>(cscUrl, body)
    
    // A resposta pode ser:
    // - Uma string com o código (ex: '930629')
    // - Um objeto com protocolo (ex: { protocolo: '...' })
    let codigoChamado = ''
    
    if (typeof responseAbrir.data === 'string') {
      codigoChamado = responseAbrir.data.trim()
    } else if (responseAbrir.data?.protocolo) {
      // Se já retornar protocolo, usar diretamente
      return {
        protocolo: responseAbrir.data.protocolo,
        raw: responseAbrir.data,
      }
    } else {
      throw new CscApiError(
        'CSC retornou resposta inesperada (não é string nem tem protocolo)',
        responseAbrir.status,
        responseAbrir.data
      )
    }

    // PASSO 2: Buscar detalhes do chamado para obter protocolo
    if (!codigoChamado) {
      throw new CscApiError(
        'CSC retornou código de chamado vazio',
        responseAbrir.status,
        responseAbrir.data
      )
    }

    const detalhesChamadoUrl = `${process.env.CSC_DETALHES_URL || cscUrl.replace('AbrirChamado', 'RetornaDetalhesChamados')}?CodigoChamado=${codigoChamado}&Token=${encodeURIComponent(cscToken)}`
    
    const responseDetalhes = await clienteCSC.get<any>(detalhesChamadoUrl)
    
    // Extrair protocolo dos detalhes
    // A resposta pode ser um array ou um objeto com protocolo
    let protocolo = ''
    
    if (Array.isArray(responseDetalhes.data) && responseDetalhes.data.length > 0) {
      protocolo = responseDetalhes.data[0]?.Protocolo || responseDetalhes.data[0]?.protocolo || ''
    } else if (responseDetalhes.data?.Protocolo) {
      protocolo = responseDetalhes.data.Protocolo
    } else if (responseDetalhes.data?.protocolo) {
      protocolo = responseDetalhes.data.protocolo
    }

    if (!protocolo) {
      console.warn('[CSC] Protocolo não encontrado nos detalhes:', JSON.stringify(responseDetalhes.data))
      // Usar o código do chamado como fallback
      protocolo = codigoChamado
    }

    return {
      protocolo,
      raw: {
        codigoChamado,
        detalhes: responseDetalhes.data,
      },
    }
  } catch (err) {
    // Se for CscApiError que já foi lançado acima, repassar
    if (err instanceof CscApiError) {
      throw err
    }

    // Erro com resposta HTTP (4xx, 5xx)
    if (isAxiosError(err) && err.response) {
      throw new CscApiError(
        `CSC retornou erro HTTP ${err.response.status}: ${err.message}`,
        err.response.status,
        err.response.data
      )
    }

    // Erro de rede ou timeout
    if (isAxiosError(err)) {
      const errorMsg = err.message || String(err)
      const isCertificateError = errorMsg.includes('certificate') || errorMsg.includes('CERTIFICATE') || errorMsg.includes('SELF_SIGNED_CERT_IN_CHAIN')
      
      let detailedMsg = `Erro ao chamar CSC (rede/timeout): ${errorMsg}`
      
      if (isCertificateError) {
        detailedMsg += '\n\n[DICA] Erro de certificado SSL/TLS detectado. Soluções:\n'
        detailedMsg += '1. Opção rápida (desenvolvimento): Defina CSC_REJECT_UNAUTHORIZED=false\n'
        detailedMsg += '2. Opção recomendada (produção): Defina NODE_EXTRA_CA_CERTS=/caminho/para/ca.pem\n'
        detailedMsg += '3. Ou execute: node --use-system-ca npm run dev'
      }
      
      throw new CscApiError(detailedMsg, undefined, errorMsg)
    }

    // Erro desconhecido
    throw new CscApiError(
      `Erro desconhecido ao chamar CSC: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      err
    )
  }
}