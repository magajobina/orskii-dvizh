import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { State, Story } from './engine';
import { shakeAnimation } from './shake';
import { audioURL } from '../content/audio';
import { AudioPool, storyAudioURLs } from './audioPool';

export function useMedia(story: Story, state: State, playing: boolean, stage: RefObject<HTMLDivElement | null>) {
  const latest = useRef(state); latest.current = state;
  const audioPool = useRef<AudioPool | null>(null);
  if (!audioPool.current) audioPool.current = new AudioPool();
  useEffect(() => {
    audioPool.current!.preload(storyAudioURLs(story, audioURL));
  }, [story]);
  useEffect(() => () => audioPool.current!.dispose(), []);
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
    const sound = audioPool.current!.get(url);
    let active = true;
    const retry = () => { void sound.play().catch(() => {}); };
    void sound.play().catch(error => {
      if (active && error.name === 'NotAllowedError') {
        window.addEventListener('pointerdown', retry, { once: true });
        window.addEventListener('keydown', retry, { once: true });
      }
    });
    return () => {
      active = false; sound.pause(); sound.currentTime = 0;
      window.removeEventListener('pointerdown', retry); window.removeEventListener('keydown', retry);
    };
  }, [story, state.current, playing]);
}
