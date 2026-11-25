import { defineConfig } from 'vite';
import { storyEditorPlugin } from './dev/editor-plugin';
import { gameImages } from './dev/game-images';

// Relative assets also work at https://username.github.io/repository/.
export default defineConfig({ base: './', plugins: [gameImages(), storyEditorPlugin()] });
