import { Button } from '#src/components/button/button.js';
import { FpsIndicator } from '#src/components/fps-indicator/fps-indicator.js';
import { useMeasure } from '@react-hookz/web';
import { FC, useCallback, useState } from 'react';

const COMMA = '，';
const HASH = '#';

const numberFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export const CommaLayoutPerformance: FC = () => {
  const [count, setCount] = useState(1000);
  const [type, setType] = useState<'comma' | 'hash'>('comma');
  const char = type === 'comma' ? COMMA : HASH;
  const [measures, ref] = useMeasure<HTMLDivElement>(true);

  const handleAdd = useCallback(() => {
    setCount((c) => c + 10000);
  }, [setCount]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-start gap-4 py-4">
      <div className="flex flex-row gap-2">
        <Button
          size="sm"
          onClick={() => setType((prev) => (prev === 'comma' ? 'hash' : 'comma'))}
          allPossibleContents={['Switch to hash', 'Switch to comma']}
        >
          Switch to {type === 'comma' ? 'hash' : 'comma'}
        </Button>
        <Button size="sm" onClick={handleAdd} allPossibleContents={['Add 10,000 commas', 'Add 10,000 hashes']}>
          Add {numberFormatter.format(10000)} {type === 'comma' ? 'commas' : 'hashes'}
        </Button>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="font-mono text-xs">Length: {numberFormatter.format(count)}</div>
        <div className="font-mono text-xs">
          Width: {numberFormatter.format(measures?.width ?? 0)} | Height:{' '}
          {numberFormatter.format(measures?.height ?? 0)} | Area:{' '}
          {numberFormatter.format((measures?.width ?? 0) * (measures?.height ?? 0))}
        </div>
        <div className="flex h-lh w-[1ch] flex-row justify-center text-xs contain-layout">
          <div ref={ref} className="h-fit w-[100ch] shrink-0 text-center wrap-break-word">
            {char.repeat(count)}
          </div>
        </div>
      </div>
      <FpsIndicator className="fixed bottom-0 left-0" />
    </div>
  );
};
