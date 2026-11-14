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
