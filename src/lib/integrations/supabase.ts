import { createClient } from '@supabase/supabase-js'

const BUCKET = 'anexos'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function uploadAnexoStorage(
  reservaId: string,
  file: Buffer,
  nomeArquivo: string,
  mimeType: string
): Promise<string> {
  const supabase = getSupabaseAdmin()
  const path = `${reservaId}/${Date.now()}-${nomeArquivo.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: mimeType,
    upsert: false,
  })

  if (error) throw new Error(`Falha no upload: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export { BUCKET }
