'use client'

interface Ponto { dia: string; total: number }

interface Props {
  pontos: Ponto[]
  altura?: number
}

export function EvolucaoChart({ pontos, altura = 80 }: Props) {
  if (pontos.length === 0) {
    return (
      <div className="card p-5 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-foreground">Evolução diária de reservas</h3>
        <p className="text-sm text-muted-foreground py-4 text-center">Sem dados no período</p>
      </div>
    )
  }

  const max    = Math.max(...pontos.map((p) => p.total), 1)
  const largura = 600
  const padX   = 8
  const padY   = 8
  const W      = largura - padX * 2
  const H      = altura - padY * 2

  // Coordenadas SVG para cada ponto
  const coords = pontos.map((p, i) => ({
    x: padX + (i / Math.max(pontos.length - 1, 1)) * W,
    y: padY + (1 - p.total / max) * H,
    ...p,
  }))

  // Polyline path
  const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ')

  // Área preenchida
  const area = [
    `M${coords[0].x},${padY + H}`,
    ...coords.map((c) => `L${c.x},${c.y}`),
    `L${coords[coords.length - 1].x},${padY + H}`,
    'Z',
  ].join(' ')

  // Exibe só alguns labels de datas para não poluir
  const step   = Math.ceil(pontos.length / 6)
  const labels = coords.filter((_, i) => i % step === 0 || i === pontos.length - 1)

  return (
    <div className="card p-5 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">Evolução diária de reservas</h3>
      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${largura} ${altura + 20}`}
          className="w-full"
          style={{ height: altura + 20 }}
        >
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="var(--primary)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0"    />
            </linearGradient>
          </defs>

          {/* Área */}
          <path d={area} fill="url(#grad)" />

          {/* Linha */}
          <polyline
            points={polyline}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Pontos */}
          {coords.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r="3" fill="var(--primary)" />
          ))}

          {/* Labels de datas */}
          {labels.map((c, i) => {
            const [, mes, dia] = c.dia.split('-')
            return (
              <text
                key={i}
                x={c.x}
                y={altura + 16}
                textAnchor="middle"
                fontSize="9"
                fill="var(--muted-foreground)"
              >
                {dia}/{mes}
              </text>
            )
          })}
        </svg>
      </div>
    </div>
  )
}