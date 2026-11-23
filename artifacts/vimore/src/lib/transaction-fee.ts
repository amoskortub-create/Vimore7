export function calculatePlatformFee(amount: number): number {
  const n = Math.floor(Number(amount) || 0);
  if (n <= 0) return 0;
  return Math.max(1, Math.floor(n * 0.1));
}
