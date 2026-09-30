import type { Metadata } from 'next';
import { LandingFooter, LandingNav, landingClass } from '@/components/landing/chrome';

export const metadata: Metadata = {
  title: 'Contact · FlareCut',
  description: 'Questions, bugs or an effect you want in FlareCut: get in touch.',
};

// how to reach the person building FlareCut
export default function Contact() {
  return (
    <div className={landingClass}>
      <LandingNav />
      <main className="contact">
        <div className="wrap">
          <p className="eyebrow">Contact</p>
          <h1>Say hi.</h1>
          <p className="lede">
            Found a bug, want an effect that isn&apos;t there yet, or made something with FlareCut? Send a
            message. I read every one.
          </p>
          <ul className="channels">
            <li>
              <a href="https://x.com/heynathanielj" target="_blank" rel="noopener noreferrer">
                <span>DM on X</span>
                <b>@heynathanielj</b>
              </a>
            </li>
          </ul>
          <p className="note">
            When you report a bug, say which browser and device you were on and what you tapped. Please
            don&apos;t send your clips: FlareCut never needs them.
          </p>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
