const HOME = 'C:\\Users\\stark';
const DESKTOP = `${HOME}\\Desktop`;

const TREE = {
  [HOME]: ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music', 'Projects', 'AppData', 'OneDrive', 'Saved Games', 'Contacts'],
  [DESKTOP]: ['Systems', 'Backup', 'Backup_IO', 'Shipping_LS', 'Vault', 'CONFIDENTIAL_SECTOR_16'],
};

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function parentOf(dir) {
  const index = dir.lastIndexOf('\\');
  if (index <= 2) return dir.length > 3 ? `${dir.slice(0, 2)}\\` : null;
  return dir.slice(0, index);
}

function ancestry(dir) {
  const chain = [];
  let current = dir;
  while (current) {
    const name = current.length <= 3 ? current : current.slice(current.lastIndexOf('\\') + 1);
    chain.unshift({ name, path: current });
    current = parentOf(current);
  }
  return chain;
}

function childrenOf(dir) {
  if (TREE[dir]) return TREE[dir];
  const count = 3 + (hash(dir) % 7);
  return Array.from({ length: count }, (_, i) =>
    i === 1 ? `CONFIDENTIAL_SECTOR_${(hash(dir) % 90) + 10}` : `SECTOR_${String((hash(dir + i) % 900) + 1).padStart(3, '0')}`
  );
}

const SAMPLE_FILES = [
  ['MK_III_ARMOR_SCHEMATIC.png', 'image'],
  ['BILL_OF_LADING_0094542088.pdf', 'pdf'],
  ['JERICHO_TEST_FOOTAGE.mp4', 'video'],
  ['README.md', 'doc'],
  ['arc_reactor.py', 'code'],
  ['repulsor_calibration.json', 'code'],
  ['SHIPPING_MANIFEST.txt', 'doc'],
  ['HUD_overlay.tsx', 'code'],
  ['SATELLITE_RECON.jpg', 'image'],
];

const SNIPPETS = {
  doc: `# CONFIDENTIAL — SECTOR 004

Shipper: Super Hero File Manager
10880 Malibu Point

## Manifest
- Jericho missile system (x12)
- Repulsor test rig
- Arc reactor housing, palladium core

PLACE OF ISSUE: Long Beach, California
PAYABLE AT: Destination

Said to contain: munitions, classified.
Carrier assumes no liability for contents.`,
  code: `import numpy as np

CORE_OUTPUT_GJ = 3.0
PALLADIUM_DECAY = 0.0172

class ArcReactor:
    def __init__(self, core='palladium'):
        self.core = core
        self.output = CORE_OUTPUT_GJ

    def stabilize(self, field):
        flux = np.clip(field, 0, 1)
        return flux * self.output

    def toxicity(self, hours):
        return 1 - np.exp(-PALLADIUM_DECAY * hours)

if __name__ == '__main__':
    r = ArcReactor()
    print(r.stabilize(0.82))`,
};

function mockPicture(name) {
  const h = hash(name);
  const hue = h % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='560' height='420'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue},35%,62%)'/><stop offset='1' stop-color='hsl(${(hue + 60) % 360},40%,22%)'/></linearGradient></defs><rect width='560' height='420' fill='url(#g)'/><g fill='none' stroke='rgba(255,255,255,.55)' stroke-width='2'><circle cx='280' cy='210' r='${60 + (h % 60)}'/><circle cx='280' cy='210' r='${20 + (h % 30)}'/><path d='M40 380 L${200 + (h % 120)} ${120 + (h % 90)} L520 380'/></g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function createMockBridge() {
  const listeners = new Set();
  const transferListeners = new Set();
  const searchListeners = new Set();
  const shellListeners = new Set();
  let cancelMock = null;

  return {
    bootstrap: async () => ({
      home: HOME,
      desktop: DESKTOP,
      drives: [],
      common: ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos'].map((name) => ({ name, path: `${HOME}\\${name}` })),
    }),
    probeLocks: async () => [],
    statPaths: async (paths) =>
      paths.map((p) => ({ path: p, exists: true, type: /\.\w{2,4}$/.test(p) ? 'file' : 'dir', name: p.split('\\').pop() })),
    search: async (root, query) => {
      const id = Date.now();
      const q = query.toLowerCase();
      setTimeout(() => {
        const batch = [];
        for (const dir of [root, `${root}\\Documents`, `${root}\\Projects\\SECTOR_016`]) {
          for (const name of [...childrenOf(dir), ...SAMPLE_FILES.map(([n]) => n)]) {
            if (!name.toLowerCase().includes(q)) continue;
            const isFile = name.includes('.');
            const kind = SAMPLE_FILES.find(([n]) => n === name)?.[1];
            batch.push({ name, path: `${dir}\\${name}`, type: isFile ? 'file' : 'dir', where: dir.slice(root.length + 1), kind, ext: isFile ? name.split('.').pop() : undefined, size: isFile ? (hash(name) % 9000) * 1024 : undefined });
          }
        }
        searchListeners.forEach((fn) => fn({ id, batch, done: true, scanned: 3 }));
      }, 250);
      return { ok: true, id };
    },
    cancelSearch: async () => true,
    shellRun: async ({ id, command }) => {
      const text = String(command || '').trim();
      setTimeout(() => {
        shellListeners.forEach((fn) =>
          fn({
            id,
            stream: 'err',
            chunk: text ? 'Commands run when Super Hero File Manager is open in Electron.\n' : '',
            done: true,
            code: 1,
          })
        );
      }, 80);
      return { ok: true, id };
    },
    shellCancel: async () => true,
    onShell: (fn) => {
      shellListeners.add(fn);
      return () => shellListeners.delete(fn);
    },
    onSearch: (fn) => {
      searchListeners.add(fn);
      return () => searchListeners.delete(fn);
    },
    showInFolder: async () => ({ ok: true }),
    copyText: async () => ({ ok: true }),
    rename: async () => ({ ok: false, message: 'Rename needs the Electron app.' }),
    trash: async () => ({ ok: false, message: 'Delete needs the Electron app.' }),
    volumes: async () => [
      { id: 'C:', path: 'C:\\', label: 'Systems', type: 'fixed', size: 512e9, free: 141e9, system: true, connected: true },
      { id: 'D:', path: 'D:\\', label: 'Backup', type: 'fixed', size: 2e12, free: 1.2e12, system: false, connected: true },
      { id: 'E:', path: 'E:\\', label: 'Backup_IO', type: 'removable', size: 64e9, free: 51e9, system: false, connected: true },
      { id: 'Z:', path: 'Z:\\', label: '', type: 'network', size: null, free: null, system: false, remote: '\\\\obadiah\\vault', connected: false },
      { id: 'F:', path: 'F:\\', label: '', type: 'network', size: null, free: null, system: false, remote: '\\\\tenrings\\sector', connected: false },
    ],
    readText: async (file) => {
      if (/locked/i.test(file)) return { ok: false, message: 'LOCKED' };
      return { ok: true, text: (/\.(md|txt)$/i.test(file) ? SNIPPETS.doc : SNIPPETS.code).repeat(3), truncated: false };
    },
    subtitles: async (file) =>
      /footage/i.test(file)
        ? [{ label: 'EN', lang: 'en', vtt: 'WEBVTT\n\n00:00.000 --> 00:05.000\nThe price on your head is so high.' }]
        : [],
    fileUrl: () => null,
    startTransfer: async ({ sources, volumeId }) => {
      const id = Date.now();
      const total = 1.6e9;
      let copied = 0;
      const timer = setInterval(() => {
        copied = Math.min(total, copied + total / 40);
        const done = copied >= total;
        transferListeners.forEach((fn) =>
          fn({ id, phase: done ? 'done' : 'copying', copied, total, filesDone: Math.round((copied / total) * 48), fileCount: 48, failed: 0, current: sources[0].split('\\').pop(), dest: `${volumeId}\\SUPERHERO_TRANSFER`, label: volumeId })
        );
        if (done) clearInterval(timer);
      }, 150);
      cancelMock = () => {
        clearInterval(timer);
        transferListeners.forEach((fn) => fn({ id, phase: 'cancelled', copied, total, filesDone: 0, fileCount: 48, failed: 0, dest: '', label: volumeId }));
      };
      return { ok: true, id };
    },
    cancelTransfer: async () => cancelMock?.(),
    onTransfer: (fn) => {
      transferListeners.add(fn);
      return () => transferListeners.delete(fn);
    },
    listDirectory: async (dir) => {
      const base = dir.endsWith('\\') ? dir : dir.replace(/\\+$/g, '');
      const join = (name) => (base.endsWith('\\') ? `${base}${name}` : `${base}\\${name}`);
      return {
        ok: true,
        path: base,
        name: base.length <= 3 ? base : base.slice(base.lastIndexOf('\\') + 1),
        parent: parentOf(base),
        ancestry: ancestry(base),
        folders: childrenOf(base).map((name) => ({ name, path: join(name) })),
        files: SAMPLE_FILES.slice(0, 2 + (hash(base) % (SAMPLE_FILES.length - 1))).map(([name, kind], i) => ({
          name,
          path: join(name),
          kind,
          ext: name.split('.').pop().toLowerCase(),
          size: (hash(base + name) % 9000) * 1024 * 40,
          modified: Date.now() - i * 86400000,
          readonly: i === 3,
          locked: i === 5,
        })),
        fileCount: hash(base) % 40,
        directFileBytes: (hash(base) % 900) * 1024 * 1024,
      };
    },
    openInExplorer: async () => ({ ok: true }),
    openFile: async () => ({ ok: true }),
    previewFolder: async (dir) => {
      const count = 3 + (hash(dir) % (SAMPLE_FILES.length - 2));
      const files = SAMPLE_FILES.slice(0, count).map(([name, kind], i) => ({
        name,
        kind,
        ext: name.split('.').pop(),
        path: `${dir}\\${name}`,
        size: (hash(dir + name) % 9000) * 1024,
        modified: Date.now() - i * 86400000,
        snippet: SNIPPETS[kind],
      }));
      return { ok: true, path: dir, files, total: count + (hash(dir) % 30), folderCount: 3, counts: {} };
    },
    thumbnail: async (file) => {
      await new Promise((r) => setTimeout(r, 150));
      return /\.(png|jpg|mp4|pdf)$/i.test(file) ? mockPicture(file) : null;
    },
    measure: ({ token, kind, folders }) => {
      folders.forEach((folder, i) => {
        const error = folder.name === 'Vault';
        const bytes = error ? 0 : (hash(folder.path) % 4000) * 1024 * 1024 * (1 + (hash(folder.name) % 9));
        const shallow = Math.round(bytes * 0.35);
        setTimeout(() => {
          listeners.forEach((fn) => fn({ token, kind, path: folder.path, bytes: shallow, error, partial: true, done: false }));
        }, 30 + i * 18);
        setTimeout(() => {
          listeners.forEach((fn) => fn({ token, kind, path: folder.path, bytes, error, partial: false, done: false }));
        }, 90 + i * 24);
      });
      setTimeout(() => listeners.forEach((fn) => fn({ token, kind, done: true })), 120 + folders.length * 24);
    },
    onMeasure: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
