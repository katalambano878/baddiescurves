'use client';

import { useEffect } from 'react';

const SITE_NAME = "BADDIECURVES";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title
      ? `${title} | ${SITE_NAME}`
      : `${SITE_NAME} | Waist trainers, shapewear & athleisure for every curve. Look good, feel good.`;
  }, [title]);
}
