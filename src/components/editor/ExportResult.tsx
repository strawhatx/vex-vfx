// The finished export: a preview of it, and a button to save it.
import type { UiState } from './player';

export function ExportResult({
  result,
  onClose,
}: {
  result: NonNullable<UiState['result']>;
  onClose(): void;
}) {
  return (
    <div className="result" role="dialog" aria-label="Your clip is ready">
      <div className="result-card">
        <video src={result.url} controls playsInline autoPlay />
        <h2>Your clip is ready</h2>
        {!result.hasAudio && <p>This recording has no sound.</p>}
        <div className="row">
          <button type="button" onClick={onClose}>
            Back to edit
          </button>
          <a className="btn primary" href={result.url} download={`flarecut.${result.ext}`}>
            Save video
          </a>
        </div>
      </div>
    </div>
  );
}
