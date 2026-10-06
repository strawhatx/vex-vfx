import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Privacy: your video is made in your browser',
  description:
    'PromoReel makes your video on your device and saves your project there. Here is exactly what is sent where, and what we keep.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <div className="page wrap">
      <header className="page-head">
        <Breadcrumbs items={[{ name: 'Privacy', path: '/privacy' }]} />
        <h1>Privacy</h1>
        <p className="answer">
          Your video is made in your browser. PromoReel draws and encodes every frame on your device, and
          saves your project there. We never receive your logo, music or videos.
        </p>
      </header>
      <div className="prose">
        <h2>What stays on your device</h2>
        <ul>
          <li>
            Your project (the plan, your text and numbers, and your logo), saved in this browser’s storage.
            Music and the videos you make exist only in your browser tab.
          </li>
          <li>
            Your Anthropic API key, if you use one. It’s kept in memory, or in your browser’s storage only if
            you tick “Remember it”.
          </li>
          <li>Your email, remembered in your browser so you don’t retype it.</li>
        </ul>
        <h2>What is sent, and where</h2>
        <ul>
          <li>
            <strong>Your email</strong>, when you download, goes to our server and on to our newsletter
            provider (Buttondown) so we can send occasional product updates. Every email has an unsubscribe
            link.
          </li>
          <li>
            <strong>Nothing else, for now.</strong> AI scripting isn’t live yet. When it is, it will use your
            own Gemini or Claude key, and your browser will send your product description straight to the
            provider you choose, never through our servers.
          </li>
          <li>
            <strong>Anonymous page statistics</strong> (Cloudflare Web Analytics: pages viewed and load times,
            no cookies, no personal data).
          </li>
        </ul>
        <h2>What we don’t do</h2>
        <ul>
          <li>No accounts, no tracking cookies, no ad pixels.</li>
          <li>No selling or sharing your email.</li>
          <li>No training on your content. We never have it.</li>
        </ul>
        <h2>Questions or deletion</h2>
        <p>
          Unsubscribing from any email removes you from the list. To ask anything else, reply to any of our
          emails.
        </p>
      </div>
    </div>
  );
}
