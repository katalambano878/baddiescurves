import { NextRequest, NextResponse } from 'next/server';

function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return null;
}

function isPublicIp(ip: string): boolean {
  if (!ip || ip === '::1' || ip === '127.0.0.1') return false;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('127.')) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return false;
  return true;
}

/**
 * Resolve visitor country for Ghana (Moolre) vs international (PayPal).
 * Coolify/Traefik usually has no CF-IPCountry, so we look up by IP.
 */
export async function GET(req: NextRequest) {
  const headerCountry = (
    req.headers.get('cf-ipcountry') ||
    req.headers.get('x-vercel-ip-country') ||
    req.headers.get('x-country-code') ||
    req.headers.get('cloudfront-viewer-country') ||
    ''
  )
    .trim()
    .toUpperCase();

  if (headerCountry && headerCountry !== 'XX' && /^[A-Z]{2}$/.test(headerCountry)) {
    const res = NextResponse.json({ country: headerCountry, source: 'header' });
    res.cookies.set('country', headerCountry, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'lax',
    });
    return res;
  }

  const ip = clientIp(req);
  let country = 'US';
  let source = 'default';

  if (ip && isPublicIp(ip)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const geoRes = await fetch(
        `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code`,
        { signal: controller.signal }
      ).finally(() => clearTimeout(timer));
      if (geoRes.ok) {
        const data = await geoRes.json();
        const code = String(data?.country_code || '')
          .trim()
          .toUpperCase();
        if (data?.success !== false && /^[A-Z]{2}$/.test(code)) {
          country = code;
          source = 'ip';
        }
      }
    } catch (err) {
      console.warn('[geo] IP lookup failed:', (err as Error)?.message);
    }
  }

  const res = NextResponse.json({ country, source, ip: ip && isPublicIp(ip) ? ip : undefined });
  res.cookies.set('country', country, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
  });
  return res;
}
