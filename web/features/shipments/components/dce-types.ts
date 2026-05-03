// Tipos, constantes e estilos compartilhados entre os sub-componentes do DCE.

export type ParteState = {
  person_id: string | null
  person_address_id: string | null
  document: string
  name: string
  zip_code: string
  address: string
  number: string
  complement: string
  neighborhood: string
  contact_phone: string
  uf: string
  city_id: string | null
}

export type ItemState = {
  id: string
  product_id: string | null
  x_prod: string
  ncm: string
  q_com: string
  v_un_com: string
}

export const PARTE_EMPTY: ParteState = {
  person_id: null,
  person_address_id: null,
  document: '',
  name: '',
  zip_code: '',
  address: '',
  number: '',
  complement: '',
  neighborhood: '',
  contact_phone: '',
  uf: '',
  city_id: null,
}

export const newItem = (): ItemState => ({
  id: crypto.randomUUID(),
  product_id: null,
  x_prod: '',
  ncm: '',
  q_com: '',
  v_un_com: '',
})

export const TRANSPORT_MODES = [
  { value: 1, label: 'Rodoviário' },
  { value: 2, label: 'Aéreo' },
  { value: 3, label: 'Aquaviário' },
  { value: 4, label: 'Ferroviário' },
  { value: 5, label: 'Postal' },
]

// Estilos Tailwind reutilizados nos sub-componentes do formulário DCE
export const inp =
  'h-8 rounded-lg border-muted-foreground/20 focus-visible:ring-primary/20 text-sm disabled:text-foreground disabled:opacity-100 disabled:bg-muted/30 disabled:cursor-not-allowed'
export const sel =
  'h-8 rounded-lg border-muted-foreground/20 text-sm dark:bg-input/30 shadow-none focus-visible:ring-primary/20 disabled:text-foreground disabled:opacity-100 disabled:bg-muted/30 disabled:cursor-not-allowed'
export const lbl =
  'text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1'

export const AMBIENT_LIST = [
  { value: 1, label: 'Produção' },
  { value: 2, label: 'Homologação' },
  { value: 3, label: 'Simulado' },
]
