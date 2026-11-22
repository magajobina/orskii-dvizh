import { defineConfig } from 'vite';
import { storyEditorPlugin } from './dev/editor-plugin';

// Relative assets also work at https://username.github.io/repository/.
export default defineConfig({ base: './', plugins: [storyEditorPlugin()] });
