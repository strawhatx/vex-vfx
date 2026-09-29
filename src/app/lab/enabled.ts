// Whether the Preset Lab is part of this build: always while developing; on a deployed site only
// when it's built with FLARECUT_LAB=on (a private test site), so the public one doesn't have it.
// Read on the server only: nothing about it reaches the browser.
export const labOn = () => process.env.NODE_ENV !== 'production' || process.env.FLARECUT_LAB === 'on';
