const HOME = 'C:\\Users\\stark';
const DESKTOP = `${HOME}\\Desktop`;

const TREE = {
  [HOME]: ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music', 'Projects', 'AppData', 'OneDrive', 'Saved Games', 'Contacts'],
  [DESKTOP]: ['Systems', 'Backup', 'Backup_IO', 'Shipping_LS', 'Vault'],
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
  return Array.from({ length: count }, (_, i) => `SECTOR_${String((hash(dir + i) % 900) + 1).padStart(3, '0')}`);
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

Shipper: Stark Industries, Inc.
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

  return {
    bootstrap: async () => ({ home: HOME, desktop: DESKTOP, drives: ['C:\\', 'D:\\'] }),
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
        setTimeout(() => {
          const error = folder.name === 'Vault';
          const bytes = error ? 0 : (hash(folder.path) % 4000) * 1024 * 1024 * (1 + (hash(folder.name) % 9));
          listeners.forEach((fn) => fn({ token, kind, path: folder.path, bytes, error, done: false }));
        }, 200 + i * 140);
      });
      setTimeout(() => listeners.forEach((fn) => fn({ token, kind, done: true })), 300 + folders.length * 140);
    },
    onMeasure: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
