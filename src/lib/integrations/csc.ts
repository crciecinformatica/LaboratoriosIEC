// Tipos
type CscPayload = {
    CatalogoServicosid: number
    Descricao: string
    LoginSolicitante: string
    flexfield103: number
    Token: string
}
  
type CscResposta = {
    protocolo: string   // número do chamado retornado pelo CSC
    raw: unknown        // body completo para log
}
  
class CscApiError extends Error {
    constructor(
      message: string,
      public statusHttp?: number,
      public responseBody?: unknown
    ) { super(message) }
}