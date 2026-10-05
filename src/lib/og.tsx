// The Open Graph card: a cinema screen with the page's title on it, lit in the page's aesthetic
// colours (or the site's own). Rendered by next/og at build time.
import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };

export function ogCard({
  title,
  kicker,
  colors = { bg: '#F3ECDF', fg: '#15120F', accent: '#FFB547' },
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
        background: '#0B0A09',
        padding: 48,
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 70,
          background: 'linear-gradient(90deg,#2d070a,#6b1119)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 70,
          background: 'linear-gradient(270deg,#2d070a,#6b1119)',
        }}
      />
      <div
        style={{
          flex: 1,
          margin: '0 60px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 56,
          background: colors.bg,
          color: colors.fg,
          borderRadius: 8,
          boxShadow: '0 0 120px rgba(255,205,140,0.35)',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 26,
            letterSpacing: 4,
            textTransform: 'uppercase',
            opacity: 0.7,
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: title.length > 48 ? 64 : 80,
            fontWeight: 800,
            lineHeight: 1,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 28 }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: colors.accent }} />
          PromoReel · free, in your browser
        </div>
      </div>
    </div>,
    OG_SIZE,
  );
}
