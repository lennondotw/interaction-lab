import { useMemo } from 'react';

export const useRandomValue = () => {
  // eslint-disable-next-line react-hooks/purity
  const randomValue = useMemo(() => Math.random(), []);
  return randomValue;
};
