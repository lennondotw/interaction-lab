import { useCallback, useEffect, useRef, useState } from 'react';
import tickSoundUrl from '../assets/clock-ticker-single.wav';

export function useTickSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const rawBufferRef = useRef<ArrayBuffer | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const isMutedRef = useRef(true); // Ref for stable access in playTick

  // Keep ref in sync with state
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Preload audio buffer (without creating AudioContext yet)
  useEffect(() => {
    fetch(tickSoundUrl)
      .then((res) => res.arrayBuffer())
      .then((buffer) => {
        rawBufferRef.current = buffer;
      })
      .catch((error: unknown) => {
        console.error('Failed to prefetch tick sound:', error);
      });
  }, []);

  // Unmute - initialize AudioContext on user interaction
  const unmute = useCallback(async () => {
    if (audioContextRef.current) {
      isMutedRef.current = false;
      setIsMuted(false);
      return;
    }

    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Decode the prefetched buffer
      const rawBuffer = rawBufferRef.current;
      if (rawBuffer) {
        const audioBuffer = await audioContext.decodeAudioData(rawBuffer.slice(0));
        audioBufferRef.current = audioBuffer;
      }

      isMutedRef.current = false;
      setIsMuted(false);
    } catch (error) {
      console.error('Failed to initialize audio:', error);
    }
  }, []);

  // Mute
  const mute = useCallback(() => {
    isMutedRef.current = true;
    setIsMuted(true);
  }, []);

  // Play tick sound - uses ref to always get latest muted state
  const playTick = useCallback(() => {
    // Check ref for latest muted state
    if (isMutedRef.current) return;

    const audioContext = audioContextRef.current;
    const audioBuffer = audioBufferRef.current;

    if (!audioContext || !audioBuffer) return;

    // Create a new source node for each playback
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;

    // Add random volume variation (0.7 - 1.0)
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.7 + Math.random() * 0.3;

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(0);
  }, []);

  return { playTick, isMuted, unmute, mute };
}
