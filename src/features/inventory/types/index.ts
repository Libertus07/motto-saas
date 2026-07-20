export type Material = {
    id: string
    name: string
    unit: string
    price_per_unit: number
    stock_quantity: number
    critical_stock_level: number
}

export type Movement = {
    id: string
    material_id: string
    movement_type: string
    quantity: number
    unit_price: number
    note: string
    created_at: string
    materials?: { name: string; unit: string }
}

export type MovementFormState = {
    material_id: string
    movement_type: string
    quantity: string
    unit_price: string
    note: string
}

export type InlineFormState = {
    quantity: string
    unit_price: string
    note: string
}

export type InventoryTab = 'stok' | 'hareket' | 'sayim' | 'zayi'

export type MovementDateFilter = 'bugun' | 'bu_hafta' | 'bu_ay' | 'custom' | 'tumu'
export type MovementTypeFilter = 'tumu' | 'giris' | 'cikis' | 'fire' | 'sayim'

export type ZayiDateFilter = 'bugun' | 'bu_hafta' | 'bu_ay' | 'tumu'
export type ZayiSortBy = 'tarih_yeni' | 'tarih_eski' | 'tutar_yuksek' | 'tutar_dusuk'
