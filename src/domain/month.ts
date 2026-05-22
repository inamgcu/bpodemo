const pad = (value: number) => String(value).padStart(2, "0");

export function formatMonth(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function getMaxReconciliationMonth(currentDate = new Date()) {
  return formatMonth(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
}

export function isAllowedReconciliationMonth(month: string, currentDate = new Date()) {
  return /^\d{4}-\d{2}$/.test(month) && month <= getMaxReconciliationMonth(currentDate);
}
