'use client';

import { useState, createElement, type ElementType, type ReactNode } from 'react';
import { cssToStyle } from '@/lib/style';

/**
 * Reproduces the original design's "style-hover" attribute: a base CSS
 * string that always applies, plus a second CSS string that's merged in
 * on top while the pointer is over the element. The original dc-runtime
 * did this by swapping styles on pointer enter/leave — this is the same
 * idea as a small reusable primitive.
 */
export function Hover({
  as = 'div',
  base,
  hover,
  children,
  style,
  ...rest
}: {
  as?: ElementType;
  base: string;
  hover: string;
  children?: ReactNode;
  style?: React.CSSProperties;
  [key: string]: any;
}) {
  const [isHovered, setIsHovered] = useState(false);

  const merged = {
    ...cssToStyle(base),
    ...(isHovered ? cssToStyle(hover) : {}),
    ...style,
  };

  return createElement(
    as,
    {
      ...rest,
      style: merged,
      onMouseEnter: (e: React.MouseEvent) => {
        setIsHovered(true);
        rest.onMouseEnter?.(e);
      },
      onMouseLeave: (e: React.MouseEvent) => {
        setIsHovered(false);
        rest.onMouseLeave?.(e);
      },
    },
    children
  );
}
