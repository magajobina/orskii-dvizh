import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { State, Story } from './engine';
import { shakeAnimation } from './shake';
import { audioURL } from '../content/audio';
import { AudioPool, storyAudioURLs } from './audioPool';
import { imageURL } from '../content/assets';
import { ImagePreloader, storyImageURLs } from './imagePreloader';

export function useMedia(story: Story, state: State, playing: boolean, stage: RefObject<HTMLDivElement | null>) {
  const latest = useRef(state); latest.current = state;
  const audioPool = useRef<AudioPool | null>(null);
  if (!audioPool.current) audioPool.current = new AudioPool();
  const images = useRef<ImagePreloader | null>(null);
  if (!images.current) images.current = new ImagePreloader();
  useEffect(() => {
    audioPool.current!.preload(storyAudioURLs(story, audioURL, playing ? state.current : story.entry));
  }, [story, state.current, playing]);
  useEffect(() => () => audioPool.current!.dispose(), []);
  useEffect(() => {
    // Begin on the title screen too. Every route update reprioritizes its lookahead.
    images.current!.preload(storyImageURLs(story, playing ? state.current : story.entry, imageURL));
    return () => images.current!.pause();
  }, [story, state.current, state.scene, playing]);
  useEffect(() => () => images.current!.dispose(), []);
  useEffect(() => {
    if (!playing || !stage.current) return;
    const scene = latest.current.sceneNode ? story.nodes[latest.current.sceneNode] : undefined;
    const animation = shakeAnimation(stage.current, scene?.type === 'scene' ? scene.shake : undefined);
    return () => animation?.cancel();
  }, [story, state.sceneNode, state.sceneEvent, playing, stage]);
  useEffect(() => {
    const node = story.nodes[state.current];
    const url = playing && node.type === 'text' && node.audio ? audioURL(node.audio) : undefined;
    if (!url) return;
    let sound: HTMLAudioElement | undefined;
    let active = true;
    const retry = () => { if (active) void sound?.play().catch(() => {}); };
    void audioPool.current!.prepare(url).then(ready => {
      if (!active) return;
      sound = ready;
      void sound.play().catch(error => {
        if (active && error.name === 'NotAllowedError') {
          window.addEventListener('pointerdown', retry, { once: true });
          window.addEventListener('keydown', retry, { once: true });
        }
      });
    }).catch(() => { /* A disposed pool must not start a late sound. */ });
    return () => {
      active = false;
      if (sound) { sound.pause(); sound.currentTime = 0; }
      window.removeEventListener('pointerdown', retry); window.removeEventListener('keydown', retry);
    };
  }, [story, state.current, playing]);
}
