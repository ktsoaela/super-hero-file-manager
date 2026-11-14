'use client';

function shortPath(folder) {
  if (!folder) return '';
  const parts = folder.split(/[/\\]/).filter(Boolean);
  if (parts.length <= 2) return folder;
  const sep = folder.includes('\\') ? '\\' : '/';
  return `…${sep}${parts.slice(-2).join(sep)}`;
}

export function TermLog({ logRef, runs }) {
  return (
    <section className="term-log" ref={logRef} aria-label="Terminal output">
      {runs.length === 0 ? (
        <p className="term-empty">Commands run in the open folder. cd moves there. Ctrl+C stops a running command.</p>
      ) : (
        runs.map((run) => (
          <div key={run.id} className="term-run">
            <p className="term-cmd">
              <span className="term-cwd" title={run.cwd}>
                {shortPath(run.cwd)}
              </span>
              <span className="term-prompt">❯</span>
              {run.command}
            </p>
            {run.chunks.map((chunk, index) => (
              <pre key={index} className={chunk.stream === 'err' ? 'term-err' : 'term-out'}>
                {chunk.text}
              </pre>
            ))}
            {run.done && run.code !== 0 && run.code !== null && <p className="term-exit">exit {run.code}</p>}
            {run.stopped && <p className="term-exit">stopped</p>}
          </div>
        ))
      )}
    </section>
  );
}

export function TermPrompt({ cwd, draft, running, inputRef, onDraft, onKey, onCancel, onClose }) {
  return (
    <span className="term-line" role="group" aria-label="Terminal command">
      <span className={`term-tag${running ? ' is-run' : ''}`}>{running ? 'RUN' : 'TERM'}</span>
      <span className="term-cwd" title={cwd || ''}>
        {shortPath(cwd) || 'NO FOLDER'}
      </span>
      <input
        ref={inputRef}
        className="term-input"
        value={draft}
        placeholder={cwd ? 'command…' : 'open a folder first'}
        spellCheck={false}
        aria-label="Terminal command"
        disabled={!cwd}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={(event) => onKey(event, cwd)}
      />
      {running && (
        <button type="button" className="term-stop" title="Stop (Ctrl+C)" onClick={onCancel}>
          STOP
        </button>
      )}
      <button type="button" className="term-close" title="Close terminal (Esc)" onClick={onClose}>
        ✕
      </button>
    </span>
  );
}
