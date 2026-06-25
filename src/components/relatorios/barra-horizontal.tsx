'use client'

interface Item {
  label:    string
  valor:    number
  sublabel?: string
}

interface Props {
  titulo:    string
  itens:     Item[]
  cor?:      string  // classe Tailwind ex: 'bg-blue-500'
  vazio?:    string
}

export function BarraHorizontal({ titulo, itens, cor = 'bg-blue-500', vazio = 'Sem dados' }: Props) {
  const max = Math.max(...itens.map((i) => i.valor), 1)

  return (
    <div className="card p-5 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
      {itens.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">{vazio}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {itens.map((item, i) => (
            <li key={i} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700 font-medium truncate max-w-[200px]" title={item.label}>
                  {item.label}
                </span>
                <span className="text-slate-500 ml-2 flex-shrink-0">{item.valor}</span>
              </div>
              {item.sublabel && (
                <p className="text-[10px] text-slate-400 -mt-0.5">{item.sublabel}</p>
              )}
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${cor} transition-all duration-500`}
                  style={{ width: `${(item.valor / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}