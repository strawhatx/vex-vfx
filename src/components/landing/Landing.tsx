'use client';

// The landing page: what FlareCut does, with live effects on canvases, and the way into the editor
import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { LandingFooter, LandingNav, landingClass } from './chrome';
import { ACCENT, startEffects, type FxName } from './effects';

// the hero's switch, and the words the headline says for each
const HERO_FX: { fx: FxName; label: string; put: string }[] = [
  { fx: 'fire', label: 'Fire', put: 'Put fire' },
  { fx: 'lightning', label: 'Lightning', put: 'Put lightning' },
  { fx: 'aura', label: 'Aura', put: 'Put an aura' },
  { fx: 'sparks', label: 'Sparks', put: 'Put sparks' },
];

const CARDS: { fx: FxName; title: string; tag: string }[] = [
  { fx: 'fire', title: 'Fire', tag: 'Element' },
  { fx: 'lightning', title: 'Lightning', tag: 'Element' },
  { fx: 'aura', title: 'Aura', tag: 'Element' },
  { fx: 'rain', title: 'Rain', tag: 'Weather' },
  { fx: 'splash', title: 'Splash', tag: 'Impact' },
  { fx: 'hit', title: 'Hits & shockwaves', tag: 'Impact' },
  { fx: 'explosion', title: 'Explosions', tag: 'Impact' },
  { fx: 'pow', title: 'POW! BOOM! K.O.', tag: 'Impact' },
  { fx: 'neon', title: 'Neon outline', tag: 'Outline' },
  { fx: 'glitch', title: 'Glitch', tag: 'Glitch' },
  { fx: 'behind', title: 'Text behind you', tag: 'Text' },
  { fx: 'sparks', title: 'Sparks', tag: 'Particles' },
  { fx: 'trail', title: 'Motion trail', tag: 'Motion' },
];

const FEATURES: { title: string; text: string }[] = [
  {
    title: 'Follows a body part',
    text: 'Tap a person and pick the head, eyes, a hand, a foot or the whole body. The effect stays on it, frame by frame.',
  },
  {
    title: 'Or stays put',
    text: 'Explosions, splashes, titles and rain pin to a spot in the scene, or cover the whole frame, and stay there as the camera moves.',
  },
  {
    title: 'Impacts on the moment',
    text: 'Hits, shockwaves and comic words land on one frame with a camera jolt and a flash. Stretch one out for slow motion.',
  },
  {
    title: 'In front of you, or behind',
    text: 'Hide the background, put big words or an effect behind the person, and filter only the subject or only the scene.',
  },
  {
    title: 'Sound built in',
    text: 'Every effect and hit comes with its own sound, mixed under your clip. Turn each one up, down or off.',
  },
  {
    title: 'Stays on your device',
    text: 'Clips are tracked, edited and exported right in the browser. They never get uploaded anywhere.',
  },
];

const MARQUEE = [
  'Fire',
  'Lightning',
  'Aura',
  'Rain',
  'Glitch',
  'Neon',
  'Text behind you',
  'Explosions',
  'Shockwaves',
  'POW!',
  'One tap',
  'No After Effects',
];

export default function Landing() {
  const heroRef = useRef<HTMLElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const engine = useRef<ReturnType<typeof startEffects> | null>(null);
  const [effect, setEffect] = useState<FxName>('fire');

  useEffect(() => {
    const cards = [...cardsRef.current!.querySelectorAll<HTMLCanvasElement>('canvas[data-card]')];
    const fx = startEffects(heroRef.current!, fxRef.current!, cards);
    engine.current = fx;
    return () => {
      fx.stop();
      engine.current = null;
    };
  }, []);

  function pick(fx: FxName) {
    setEffect(fx);
    engine.current?.setEffect(fx);
  }

  return (
    <div className={landingClass} style={{ '--accent': ACCENT[effect] } as CSSProperties}>
      <LandingNav />

      <header className="hero" id="top" ref={heroRef}>
        <canvas id="fx" ref={fxRef} aria-hidden="true" />
        <span className="hint">Move your cursor · it follows you</span>
        <div className="wrap hero-inner">
          <h1>
            <span>{HERO_FX.find(h => h.fx === effect)?.put ?? 'Put fire'}</span>
            <span className="outline">on anything.</span>
          </h1>
          <div className="hero-row">
            <div>
              <p>
                Tap a hand, a body, a car. Pick fire, lightning, rain, a glitch, an explosion or words behind
                you. It tracks the whole clip for you. No keyframes. No masking. No After Effects.
              </p>
              <Link className="cta" href="/editor/new">
                Start a video
              </Link>
            </div>
            <div className="switch" role="group" aria-label="Try an effect">
              {HERO_FX.map(({ fx, label }) => (
                <button key={fx} type="button" aria-pressed={effect === fx} onClick={() => pick(fx)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="marquee" aria-hidden="true">
        <div>
          {[0, 1].flatMap(n =>
            MARQUEE.map(word => (
              <span key={`${n}-${word}`}>
                {word}
                <i>✦</i>
              </span>
            )),
          )}
        </div>
      </div>

      <section className="block" id="how">
        <div className="wrap">
          <p className="eyebrow">How it works</p>
          <h2>
            Raw clip to VFX shot.
            <br />
            Three taps.
          </h2>
          <ol className="steps">
            <li>
              <span className="n">01</span>
              <h3>Open a clip</h3>
              <p>
                Any short video, or record one with your camera. Punches, dances, trick shots, anything with a
                subject you can point at.
              </p>
            </li>
            <li>
              <span className="n">02</span>
              <h3>Tap where it goes</h3>
              <p>
                Tap a hand, a person, an object, or just a spot in the scene. FlareCut traces the outline and
                follows it through every frame, even as it moves and turns.
              </p>
            </li>
            <li>
              <span className="n">03</span>
              <h3>Pick it. Post it.</h3>
              <p>
                Choose an effect, dial in color, size and intensity, and export a clip with sound that&apos;s
                ready for TikTok and Reels.
              </p>
            </li>
          </ol>

          <div className="versus">
            <div className="old">
              <span className="tag">The old way</span>
              <ol>
                <li>
                  <s>Place motion trackers by hand</s>
                </li>
                <li>
                  <s>Link tracking to an invisible layer</s>
                </li>
                <li>
                  <s>Build the effect in a plugin</s>
                </li>
                <li>
                  <s>Mask everything that passes in front</s>
                </li>
                <li>
                  <s>Tweak until it blends</s>
                </li>
              </ol>
              <p className="foot">From hours to days. Per shot.</p>
            </div>
            <div className="new">
              <span className="tag">FlareCut</span>
              <ol>
                <li>Tap.</li>
                <li>Pick.</li>
                <li>Post.</li>
              </ol>
              <p className="foot">Built to take seconds.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="block" id="effects" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <p className="eyebrow">Effects</p>
          <h2>They stick to the action.</h2>
          <p className="lede">
            Elements that follow a body part. Impacts that land on the moment. Outlines, glitches and text
            that know where you are.
          </p>
          <div className="fx-grid" ref={cardsRef}>
            {CARDS.map(({ fx, title, tag }) => (
              <div key={fx} className="fx-card">
                <canvas data-card={fx} />
                <h3>{title}</h3>
                <span>{tag}</span>
              </div>
            ))}
            <Link className="fx-card more" href="/editor/new">
              <h3>And 120 more</h3>
              <span>Transitions, looks, titles →</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="block" id="more" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <p className="eyebrow">Not just effects</p>
          <h2>
            Made for the edit,
            <br />
            not the effect.
          </h2>
          <ul className="feats">
            {FEATURES.map(({ title, text }) => (
              <li key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="block" style={{ paddingTop: 0 }}>
        <div className="wrap story">
          <h2>
            Built in public.
            <br />
            By someone who hates 3-hour edits.
          </h2>
          <div>
            <p>
              I love VFX videos but hate how long they take, so I&apos;m building the tool I wanted. Follow
              along for the wins, the fails, and the first time the fire actually tracks a fist.
            </p>
            <a className="pill" href="https://x.com/heynathanielj" target="_blank" rel="noopener noreferrer">
              Follow @heynathanielj on X
            </a>
          </div>
        </div>
      </section>

      <section className="start" id="start">
        <div className="wrap">
          <p className="eyebrow">Free, in your browser</p>
          <h2>
            Set your videos
            <br />
            on fire.
          </h2>
          <Link className="cta big" href="/editor/new">
            Open the editor
          </Link>
          <p className="note">No sign-up. Your clips never leave your device.</p>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
