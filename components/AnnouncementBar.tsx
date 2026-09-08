'use client';

const MESSAGES = [
  'Waist trainers, shapewear, post-op & athleisure — look good, feel good',
  'USA orders ship via USPS Priority Mail',
  'Orders process in 3 days to 1 week',
  'Shop Shapewear, Waist Trainers, Post-Op & Gym Apparel',
  'Ghana · USA · Worldwide shipping available at checkout',
];

export default function AnnouncementBar() {
  const track = [...MESSAGES, ...MESSAGES];

  return (
    <div
      className="relative z-[60] overflow-hidden bg-[#0A0F1D] text-white border-b border-white/5"
      role="region"
      aria-label="Site announcements"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 w-10 sm:w-16 z-10 bg-gradient-to-r from-[#0A0F1D] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 sm:w-16 z-10 bg-gradient-to-l from-[#0A0F1D] to-transparent" />

      <div className="flex whitespace-nowrap py-2.5 announcement-marquee">
        {track.map((text, i) => (
          <span
            key={`${i}-${text.slice(0, 12)}`}
            className="inline-flex items-center text-[11px] sm:text-xs font-medium tracking-[0.12em] uppercase text-white/90"
          >
            <span>{text}</span>
            <span className="mx-5 sm:mx-8 text-blue-400/80" aria-hidden="true">
              ●
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
