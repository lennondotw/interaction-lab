import type { Property } from 'csstype';
import { useEffect, useRef } from 'react';

type CursorId = symbol;

const activeCursors = new Map<CursorId, Property.Cursor>();

const applyBodyCursor = () => {
  if (typeof document === 'undefined') return;

  // Apply the last declared cursor
  const lastCursor = Array.from(activeCursors.values()).at(-1);
  document.body.style.cursor = lastCursor ?? '';
};

export const useBodyCursor = (cursorShape: Property.Cursor | null) => {
  const idRef = useRef<CursorId | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    // No cursor needed: if previously registered, unregister and apply
    if (cursorShape == null) {
      if (idRef.current) {
        activeCursors.delete(idRef.current);
        applyBodyCursor();
        idRef.current = null;
      }
      return;
    }

    // 有光标需求：初始化自己的 id
    idRef.current ??= Symbol('cursor');

    // 更新 / 注册当前实例的 cursor
    activeCursors.set(idRef.current, cursorShape);
    applyBodyCursor();

    // 卸载时自动清理
    return () => {
      if (idRef.current) {
        activeCursors.delete(idRef.current);
        applyBodyCursor();
        idRef.current = null;
      }
    };
  }, [cursorShape]);
};
