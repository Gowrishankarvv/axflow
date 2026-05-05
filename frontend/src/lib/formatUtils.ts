
export function formatDecimalHours(hours: number | string): string {
    const val = typeof hours === 'string' ? parseFloat(hours) : hours;
    if (isNaN(val) || val === 0) return '0h 0m';

    const h = Math.floor(val);
    const m = Math.round((val - h) * 60);

    if (h === 0 && m === 0) return '0h 0m';

    // Handle case where rounding minutes up might result in 60m
    if (m === 60) {
        return `${h + 1}h 0m`;
    }

    return `${h}h ${m}m`;
}
