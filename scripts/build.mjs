import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, existsSync, cpSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dirname, '..');
const src = join(root, 'src');
const dist = join(root, 'dist');
const templates = join(src, 'templates');

// Clean dist to prevent stale files
if (existsSync(dist)) {
    rmSync(dist, { recursive: true });
}
mkdirSync(dist);

// ---- Step 1: Bundle JS ----
console.log('Bundling JS...');
await esbuild.build({
    entryPoints: [join(src, 'app.js')],
    bundle: true,
    outfile: join(dist, 'app.js'),
    format: 'esm',
    keepNames: true,
});
console.log('  -> dist/app.js');

// ---- Step 2: Bundle CSS ----
console.log('Bundling CSS...');
await esbuild.build({
    entryPoints: [join(src, 'styles.css')],
    bundle: true,
    outfile: join(dist, 'styles.css'),
});
console.log('  -> dist/styles.css');

// ---- Step 3: Assemble HTML from template partials ----
console.log('Assembling HTML...');
let html = readFileSync(join(src, 'index.html'), 'utf-8');

const includeRegex = /<!--\s*INCLUDE:\s*templates\/([^>]+?)\s*-->/g;
html = html.replace(includeRegex, (match, filename) => {
    const templatePath = join(templates, filename.trim());
    if (!existsSync(templatePath)) {
        console.error(`  WARNING: Template not found: ${templatePath}`);
        return `<!-- Template not found: ${filename} -->`;
    }
    console.log(`  + templates/${filename.trim()}`);
    return readFileSync(templatePath, 'utf-8');
});
writeFileSync(join(dist, 'index.html'), html);
console.log('  -> dist/index.html');

// ---- Step 4: Copy static assets ----
console.log('Copying static assets...');
const statics = ['sw.js', 'manifest.json', 'icon.svg'];
for (const file of statics) {
    const srcPath = join(src, file);
    const dstPath = join(dist, file);
    if (existsSync(srcPath)) {
        cpSync(srcPath, dstPath);
        console.log(`  -> dist/${file}`);
    } else {
        console.log(`  SKIP: ${file} (not yet created)`);
    }
}

console.log('\nBuild complete!');
