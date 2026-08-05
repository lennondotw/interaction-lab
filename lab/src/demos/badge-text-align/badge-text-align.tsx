import { FC } from 'react';

export const BadgeTextAlign: FC = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <div className="bg-neutral-500/20 px-12 py-8 text-start text-6xl font-bold">
        <span className="bg-red-500/20">NEM</span>
      </div>
      <div className="bg-neutral-500/20 px-12 py-8 text-center text-6xl font-bold">
        <span className="bg-red-500/20">NEM</span>
      </div>
    </div>
  );
};
