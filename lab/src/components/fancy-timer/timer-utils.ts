export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return '00:00.00';

  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  const sign = seconds < 0 ? '-' : '';
  const s = Math.abs(seconds);

  const totalCenti = Math.round(s * 100);
  const totalSeconds = Math.floor(totalCenti / 100);
  const centi = totalCenti % 100;

  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  return `${sign}${pad2(minutes)}:${pad2(secs)}.${pad2(centi)}`;
};
