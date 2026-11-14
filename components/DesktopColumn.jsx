'use client';

import { CubeGlyph } from './Glyphs';
import { formatBytes, samePath } from '../lib/format';

export default function DesktopColumn({ folders, measuring, currentPath, onOpen }) {
  return (
    <section className="col col-desk" aria-label="Desktop folders">
      <p className="desk-title">DESKTOP{measuring ? ' · …' : ''}</p>
      <div className="desk-scroll">
        {folders === null && <p className="col-empty light">READING…</p>}
        {folders?.length === 0 && <p className="col-empty light">NO_FOLDERS</p>}
        {folders?.map((folder, index) => {
          const largest = index === 0 && folder.bytes > 0 && !folder.error;
          const detail = folder.error ? 'NO ACCESS' : folder.bytes == null ? 'measuring…' : formatBytes(folder.bytes);
          return (
            <button
              key={folder.path}
              type="button"
              className={`desk-item${samePath(folder.path, currentPath) ? ' is-current' : ''}`}
              title={folder.path}
              onClick={() => onOpen(folder.path)}
            >
              <CubeGlyph tone={largest ? 'blue' : 'grey'} crossed={folder.error} />
              <span className="desk-text">
                <span className="desk-name">{folder.name}</span>
                <span className="desk-size">{detail}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
