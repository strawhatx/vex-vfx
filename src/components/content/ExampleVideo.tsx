import type { Example } from '@/domain/video/content/examples';
import { exampleFiles } from '@/lib/examples';
import { JsonLd } from '@/lib/seo/JsonLd';
import { videoObject } from '@/lib/seo/schema';

// An example video: lazy (nothing loads until play), a poster, no autoplay or sound, the words on
// screen as a transcript, and VideoObject structured data.
export function ExampleVideo({ example, headingLevel = 3 }: { example: Example; headingLevel?: 2 | 3 }) {
  const f = exampleFiles(example);
  const H = `h${headingLevel}` as 'h2' | 'h3';
  const tall = example.aspect === '9:16';
  return (
    <figure className={`example ${tall ? 'tall' : 'wide'}`}>
      <JsonLd
        data={videoObject({
          name: example.title,
          description: example.description,
          thumbnail: f.poster,
          contentPath: f.video,
          seconds: example.seconds,
          uploadDate: example.uploadDate,
          transcript: example.transcript,
        })}
      />
      <video
        controls
        muted
        playsInline
        preload="none"
        poster={f.poster}
        width={tall ? 1080 : 1920}
        height={tall ? 1920 : 1080}
        aria-describedby={`tr-${example.slug}`}
      >
        <source src={f.video} type="video/mp4" />
      </video>
      <figcaption>
        <H>{example.title}</H>
        <p className="muted">{example.description}</p>
        <details>
          <summary>Transcript</summary>
          <p id={`tr-${example.slug}`}>{example.transcript}</p>
        </details>
      </figcaption>
    </figure>
  );
}
