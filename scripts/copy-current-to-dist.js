import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';

const root = process.cwd();
const dist = join(root, 'dist');

// manifest.json is emitted by Vite from public/manifest.json. Copying the root
// (vanilla) manifest here would overwrite it and drop sidePanel permissions.
const files = [
  'contentScript.js',
  'contentScript.css',
  'lib/pdf-processor.js',
];

const dirs = ['lib/pdfjs/build'];

// Create dist directory
if (!existsSync(dist)) {
  mkdirSync(dist, { recursive: true });
}

// Copy files
files.forEach(file => {
  const src = join(root, file);
  const dest = join(dist, file);
  if (existsSync(src)) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    console.log(`Copied ${file}`);
  }
});

// Copy directories
dirs.forEach(dir => {
  const src = join(root, dir);
  const dest = join(dist, dir);
  if (existsSync(src)) {
    mkdirSync(dest, { recursive: true });
    readdirSync(src).forEach(file => {
      copyFileSync(join(src, file), join(dest, file));
    });
    console.log(`Copied ${dir}`);
  }
});

console.log('Done copying current files to dist/');
