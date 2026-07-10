export function formatCurrency(value: number | undefined | null, currency: string = 'TRY'): string {
    return new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
    }).format(value ?? 0);
}

export function formatDate(
    date: string | Date | undefined | null,
    options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }
): string {
    if (!date) return '-';
    return new Intl.DateTimeFormat('tr-TR', options).format(new Date(date));
}

export function formatPercent(value: number | undefined | null): string {
    if (value === null || value === undefined) return '%0.0';
    return `%${value.toFixed(1)}`;
}
