'use client'

import { useState } from 'react'
import { Fragment } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { useLogsIntegracao } from '@/hooks/useApi'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function IntegracoesPage() {
  const [servico, setServico] = useState<string>('')
  const [apenasErros, setApenasErros] = useState(false)
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading, error } = useLogsIntegracao({
    servico: servico || undefined,
    erro: apenasErros,
    page,
    limit: 20,
  })

  const logs = data?.logs ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  return (
    <div className="flex-1 overflow-auto">
      <PageHeader
        title="Logs de Integração"
        subtitle="Histórico de chamadas ao CSC e notificações do Teams"
      />

      <div className="p-6 space-y-6">
        {/* Filtros */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Serviço:</span>
              <select
                value={servico}
                onChange={(e) => {
                  setServico(e.target.value)
                  setPage(1)
                }}
                className="px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Todos</option>
                <option value="CSC">CSC</option>
                <option value="TEAMS">Teams</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={apenasErros}
                  onChange={(e) => {
                    setApenasErros(e.target.checked)
                    setPage(1)
                  }}
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-sm font-medium text-muted-foreground">Apenas erros</span>
              </label>
            </div>
          </div>
        </div>

        {/* Tabela */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : error ? (
          <div className="text-center py-12 text-destructive">Erro ao carregar logs</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Nenhum log encontrado</div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted">
                  <TableHead className="w-24">Serviço</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-40">Data/Hora</TableHead>
                  <TableHead className="w-32">Erro</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <Fragment key={log.id}>
                    <TableRow key={log.id} className="hover:bg-accent/50 cursor-pointer">
                      <TableCell>
                        <Badge variant={log.servico === 'CSC' ? 'secondary' : 'default'}>
                          {log.servico}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-mono truncate">
                        {log.endpoint}
                      </TableCell>
                      <TableCell>
                                              {log.statusHttp ? (
                                                <Badge
                                                  variant={log.statusHttp >= 200 && log.statusHttp < 300 ? 'default' : 'error'}
                                                >
                                                  {log.statusHttp}
                                                </Badge>
                                              ) : (
                                                <span className="text-muted-foreground">—</span>
                                              )}
                                            </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(log.criadoEm), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        {log.erro ? (
                          <span className="text-xs text-destructive truncate max-w-[120px]">
                            {log.erro.substring(0, 60)}...
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <button
                          onClick={() =>
                            setExpandedId(expandedId === log.id ? null : log.id)
                          }
                          className="p-1 hover:bg-accent rounded"
                        >
                          {expandedId === log.id ? '▼' : '▶'}
                        </button>
                      </TableCell>
                    </TableRow>

                    {/* Linha expandida */}
                    {expandedId === log.id && (
                      <TableRow className="bg-muted border-t-0">
                        <TableCell colSpan={6} className="p-4">
                          <div className="space-y-4 text-sm">
                            {log.payload != null && (
                              <div>
                                <h4 className="font-semibold text-foreground mb-2">Payload:</h4>
                                <pre className="bg-slate-900 text-slate-100 p-3 rounded overflow-auto max-h-64 text-xs">
                                  {JSON.stringify(log.payload, null, 2)}
                                </pre>
                              </div>
                            )}

                            {log.resposta != null && (
                              <div>
                                <h4 className="font-semibold text-foreground mb-2">Resposta:</h4>
                                <pre className="bg-slate-900 text-slate-100 p-3 rounded overflow-auto max-h-64 text-xs">
                                  {JSON.stringify(log.resposta, null, 2)}
                                </pre>
                              </div>
                            )}

                            {log.erro && (
                              <div>
                                <h4 className="font-semibold text-destructive mb-2">Erro:</h4>
                                <div className="bg-destructive/10 border border-destructive/20 p-3 rounded text-destructive">
                                  {log.erro}
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Página {page} de {totalPages} ({total} registros)
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                variant="secondary"
                size="sm"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                variant="secondary"
                size="sm"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
