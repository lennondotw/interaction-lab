import { cn } from '@monorepo/utils';
import { ComponentType, Fragment, ReactNode } from 'react';

type InferComponentProps<T> = T extends ComponentType<infer P> ? P : T extends (props: infer P) => unknown ? P : never;

interface ComponentPropsContext<
  TMatrix extends Record<string, readonly unknown[]>,
  TSections extends Record<string, readonly unknown[]>,
> {
  matrixProps: CartesianProduct<TMatrix>;
  sectionProps: CartesianProduct<TSections>;
  cellIndex: number;
  sectionIndex: number;
}

type ComponentPropsValue<
  TComponent extends ComponentType<Record<string, unknown>>,
  TMatrix extends Record<string, readonly unknown[]>,
  TSections extends Record<string, readonly unknown[]>,
> =
  | {
      [K in keyof InferComponentProps<TComponent>]?:
        | InferComponentProps<TComponent>[K]
        | ((context: ComponentPropsContext<TMatrix, TSections>) => InferComponentProps<TComponent>[K]);
    }
  | ((context: ComponentPropsContext<TMatrix, TSections>) => Partial<InferComponentProps<TComponent>>);

type MatrixDefinition<TComponent extends ComponentType<Record<string, unknown>>> = {
  [K in keyof InferComponentProps<TComponent>]?: readonly InferComponentProps<TComponent>[K][];
} & Record<string, readonly unknown[]>;

// Explicit mapping to ensure type inference works
type SectionsDefinition<TComponent extends ComponentType<Record<string, unknown>>> = {
  [K in keyof InferComponentProps<TComponent>]?: readonly InferComponentProps<TComponent>[K][];
} & Record<string, readonly unknown[]>;

interface MatrixProps<
  TComponent extends ComponentType<Record<string, unknown>>,
  TMatrix extends MatrixDefinition<TComponent>,
  TSections extends SectionsDefinition<TComponent>,
> {
  component: TComponent;
  matrix: TMatrix;
  sections?: TSections;
  componentProps?: ComponentPropsValue<TComponent, TMatrix, TSections>;
  render?: (props: Expand<CartesianProduct<TMatrix> & CartesianProduct<TSections>>) => ReactNode;
  className?: string;
  classNames?: {
    matrix?: string;
    section?: string;
  };
  matrixGridSize?: {
    column?: 'identical' | 'fit';
    row?: 'identical' | 'fit';
  };
  sectionsLayout?: 'vertical' | 'horizontal';
}

type CartesianProduct<T extends Record<string, readonly unknown[]>> = {
  [K in keyof T]: T[K][number];
};

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

function cartesianProduct<T extends Record<string, readonly unknown[]>>(obj: T): CartesianProduct<T>[] {
  const keys = Object.keys(obj) as (keyof T)[];

  if (keys.length === 0) return [{}] as CartesianProduct<T>[];

  const values = keys.map((key) => obj[key]);

  function generate(index: number, current: Partial<CartesianProduct<T>>): CartesianProduct<T>[] {
    if (index === keys.length) {
      return [current as CartesianProduct<T>];
    }

    const result: CartesianProduct<T>[] = [];
    const key = keys[index];
    const currentValues = values[index];

    if (key && currentValues) {
      for (const value of currentValues) {
        result.push(...generate(index + 1, { ...current, [key as string]: value }));
      }
    }

    return result;
  }

  return generate(0, {});
}

// eslint-disable-next-line react-refresh/only-export-components
export function createMatrixFor<TComponent extends ComponentType<Record<string, unknown>>>(component: TComponent) {
  return function <TMatrix extends MatrixDefinition<TComponent>, TSections extends SectionsDefinition<TComponent>>(
    props: Omit<MatrixProps<TComponent, TMatrix, TSections>, 'component'>
  ) {
    return Matrix({ ...props, component });
  };
}

export function Matrix<
  TComponent extends ComponentType<Record<string, unknown>>,
  TMatrix extends MatrixDefinition<TComponent>,
  TSections extends SectionsDefinition<TComponent>,
>({
  component: Component,
  matrix,
  sections = {} as TSections,
  componentProps = {},
  render,
  className,
  classNames,
  matrixGridSize = {
    column: 'identical',
    row: 'fit',
  },
  sectionsLayout = 'vertical',
}: MatrixProps<TComponent, TMatrix, TSections>) {
  const matrixKeys = Object.keys(matrix);
  const [firstKey, secondKey, ...otherKeys] = matrixKeys;

  if (matrixKeys.length < 1) {
    throw new Error('Matrix requires at least 1 prop dimension');
  }

  if (otherKeys.length > 0) {
    const dimensionCount = matrixKeys.length === 1 ? 1 : 2;
    console.warn(
      `Matrix only uses first ${dimensionCount} props for grid layout. Additional props [${otherKeys.join(', ')}] will be applied to all cells.`
    );
  }

  if (!firstKey) {
    throw new Error('Matrix requires at least 1 prop dimension');
  }

  const firstValues = matrix[firstKey];
  const secondValues = secondKey ? matrix[secondKey] : [null]; // Single dimension case
  const baseProps = otherKeys.reduce<Partial<CartesianProduct<TMatrix>>>(
    (acc, key) => ({ ...acc, [key]: matrix[key]?.[0] }),
    {}
  );

  const sectionCombinations = cartesianProduct(sections);

  if (sectionCombinations.length === 0) {
    sectionCombinations.push({} as CartesianProduct<TSections>);
  }

  return (
    <div
      className={cn(
        'w-full contain-inline-size',
        sectionsLayout === 'vertical' && 'flex flex-col items-stretch justify-start gap-4',
        sectionsLayout === 'horizontal' && 'flex flex-row items-center justify-center-safe gap-4',
        className
      )}
    >
      {sectionCombinations.map((sectionProps, sectionIndex) => {
        const sectionTitle = Object.entries(sectionProps)
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join(', ');

        return (
          <div
            key={sectionIndex}
            className={cn(
              'flex flex-col items-stretch gap-2',
              sectionsLayout === 'horizontal' && 'min-w-max',
              sectionsLayout === 'vertical' && 'min-w-0',
              classNames?.section
            )}
          >
            {Object.keys(sectionProps).length > 0 && sectionTitle && (
              <h3 className="self-center font-mono text-xs">{sectionTitle}</h3>
            )}

            <div
              className={cn(
                'grid place-items-center gap-2 self-center-safe rounded-sm border-[0.5px] border-neutral-500/40 p-2',
                `
                  bg-[repeating-linear-gradient(45deg,rgba(127,127,127,0.03)_0,rgba(127,127,127,0.03)_10px,transparent_10px,transparent_20px)]
                `,
                classNames?.matrix
              )}
              style={{
                gridTemplateColumns:
                  matrixGridSize.column === 'identical'
                    ? `repeat(${secondKey ? (secondValues?.length ?? 0) : (firstValues?.length ?? 0)}, 1fr)`
                    : `repeat(${secondKey ? (secondValues?.length ?? 0) : (firstValues?.length ?? 0)}, auto)`,
                gridTemplateRows:
                  matrixGridSize.row === 'identical'
                    ? `repeat(${secondKey ? (firstValues?.length ?? 0) : 1}, 1fr)`
                    : `repeat(${secondKey ? (firstValues?.length ?? 0) : 1}, auto)`,
              }}
            >
              {firstValues?.map((firstValue, firstIndex: number) =>
                secondValues?.map((secondValue, secondIndex: number) => {
                  const cellIndex = firstIndex * secondValues.length + secondIndex;
                  const matrixProps = {
                    ...baseProps,
                    [firstKey]: firstValue,
                    ...(secondKey && { [secondKey]: secondValue }),
                  } as CartesianProduct<TMatrix>;

                  // Resolve component props (support both object and function modes)
                  const context = {
                    matrixProps,
                    sectionProps: sectionProps,
                    cellIndex,
                    sectionIndex,
                  };

                  let resolvedComponentProps: Partial<InferComponentProps<TComponent>>;

                  if (typeof componentProps === 'function') {
                    // Function mode: componentProps is a function that returns the entire props object
                    resolvedComponentProps = componentProps(context);
                  } else {
                    // Object mode: componentProps is an object with individual prop values or functions
                    resolvedComponentProps = Object.entries(componentProps).reduce<
                      Partial<InferComponentProps<TComponent>>
                    >((acc, [key, value]) => {
                      if (typeof value === 'function') {
                        const resolvedValue = (
                          value as (
                            context: ComponentPropsContext<TMatrix, TSections>
                          ) => InferComponentProps<TComponent>[keyof InferComponentProps<TComponent>]
                        )(context);
                        acc[key as keyof InferComponentProps<TComponent>] = resolvedValue;
                      } else {
                        acc[key as keyof InferComponentProps<TComponent>] =
                          value as InferComponentProps<TComponent>[keyof InferComponentProps<TComponent>];
                      }
                      return acc;
                    }, {});
                  }

                  const cellProps = {
                    ...matrixProps,
                    ...sectionProps,
                    ...resolvedComponentProps,
                  } as InferComponentProps<TComponent> &
                    Expand<CartesianProduct<TMatrix> & CartesianProduct<TSections>>;

                  const cellKey = secondKey ? `${String(firstValue)}-${String(secondValue)}` : String(firstValue);

                  if (render) {
                    return <Fragment key={cellKey}>{render(cellProps)}</Fragment>;
                  }

                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  return <Component key={cellKey} {...(cellProps as any)} />;
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
