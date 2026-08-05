import { FC } from 'react';

export const SvgClipPath: FC = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <svg className="absolute" width="0" height="0" viewBox="0 0 1 1">
        <defs>
          <clipPath id="clip-path-user" clipPathUnits="userSpaceOnUse">
            <path
              d="
              M0 0 H10 V10 H0 Z
              M 12 5
              m -6 0
              a 6 6 0 1 0 12 0
              a 6 6 0 1 0 -12 0
              "
              fillRule="evenodd"
            />
          </clipPath>

          <clipPath id="clip-path-object" clipPathUnits="objectBoundingBox">
            <path
              d="
              M0 0 H1 V1 H0 Z
              M 1.2 0.5
              m -0.6 0
              a 0.6 0.6 0 1 0 1.2 0
              a 0.6 0.6 0 1 0 -1.2 0
              "
              fillRule="evenodd"
            />
          </clipPath>
        </defs>
      </svg>

      <svg className="size-20 border" viewBox="0 0 20 20">
        <rect x="0" y="0" width="20" height="20" fill="red" clipPath="url(#clip-path-object)" />
      </svg>

      <svg className="size-20 border" viewBox="0 0 20 20">
        <rect x="0" y="0" width="20" height="20" fill="red" clipPath="url(#clip-path-user)" />
      </svg>

      <div className="size-20 border">
        <div className={`size-full bg-red-200 [clip-path:url(#clip-path-object)]`}></div>
      </div>

      <div className="size-20 border">
        <div className={`size-full bg-red-200 [clip-path:url(#clip-path-user)]`}></div>
      </div>
    </div>
  );
};
