// Bundles the app into one self-contained HTML file that opens straight from
// disk (file://), for previewing without a web server. The real site stays
// as ES modules; this only rewrites imports/exports into a tiny registry.
//
// Usage: node tools/build-preview.mjs   → dist/cardmax.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
// Dependency order: each module only imports from ones above it.
const MODULES = ['rules.js', 'sms.js', 'art.js', 'engine.js', 'split.js', 'format.js', 'store.js', 'app.js'];

function wrap(name, src) {
  const exported = [];
  let code = src
    .replace(/^import \* as (\w+) from '\.\/([\w.]+)';$/gm, (_, ns, file) => `const ${ns} = __m['${file}'];`)
    .replace(/^import \{([^}]+)\} from '\.\/([\w.]+)';$/gm, (_, names, file) => `const {${names}} = __m['${file}'];`)
    .replace(/^export (const|function|async function) (\w+)/gm, (_, kind, id) => {
      exported.push(id);
      return `${kind} ${id}`;
    });
  if (/^\s*(import\s|export\s+(const|function|default|\{))/m.test(code)) throw new Error(`${name}: unsupported import/export syntax`);
  return `__m['${name}'] = (() => {\n${code}\nreturn { ${exported.join(', ')} };\n})();`;
}

const js = MODULES.map((m) => wrap(m, read(`js/${m}`))).join('\n\n');
const html = read('index.html')
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${read('styles.css')}\n</style>`)
  .replace('<script type="module" src="js/app.js"></script>', '')
  .replace('</body>', () => `<script>\nconst __m = {};\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>\n</body>`)
  .replace(/href="(icons\/[^"]+|manifest\.webmanifest)"/g, (_, p) => `href="../${p}"`);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/cardmax.html'), html);
console.log('wrote dist/cardmax.html');
