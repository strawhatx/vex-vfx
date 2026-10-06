// The Open Graph card, in the site's style: a white page, a centred kicker and headline, and the
// page's aesthetic shown as a colour panel (or the site's mist). Rendered by next/og at build time.
import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };

export function ogCard({
  title,
  kicker,
  colors = { bg: '#F5F5F7', fg: '#1D1D1F', accent: '#0071E3' },
}: {
  title: string;
  kicker: string;
  colors?: { bg: string; fg: string; accent: string };
}) {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#FFFFFF',
        padding: '64px 72px 0',
        color: '#1D1D1F',
      }}
    >
      <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, color: '#6E6E73' }}>{kicker}</div>
      <div
        style={{
          display: 'flex',
          textAlign: 'center',
          fontSize: title.length > 44 ? 64 : 80,
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: -2,
          maxWidth: 1000,
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          height: 150,
          padding: '0 40px',
          borderRadius: '28px 28px 0 0',
          background: colors.bg,
          color: colors.fg,
          fontSize: 28,
          fontWeight: 600,
        }}
      >
        <div style={{ display: 'flex' }}>PromoReel</div>
        <div
          style={{
            display: 'flex',
            padding: '12px 26px',
            borderRadius: 999,
            background: '#0071E3',
            color: '#FFFFFF',
          }}
        >
          Make my video
        </div>
      </div>
    </div>,
    OG_SIZE,
  );
}
