export function computeSessionHardeningScore(ttlSeconds, idleTimeoutSeconds) {
  if (ttlSeconds <= 0 || idleTimeoutSeconds <= 0) return 0;
  const ratio = idleTimeoutSeconds / ttlSeconds;
  if (ratio <= 0.25) return 90;
  if (ratio <= 0.5) return 75;
  if (ratio <= 0.75) return 60;
  return 45;
}
