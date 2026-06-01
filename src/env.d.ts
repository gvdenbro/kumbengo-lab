declare module '*.yaml' {
  const value: any;
  export default value;
}

declare module 'superdough' {
  export function superdough(...args: any[]): any;
}

declare module '@strudel/webaudio' {
  export function getAudioContext(): AudioContext;
  export function initAudioOnFirstClick(): Promise<void>;
  export function samples(...args: any[]): any;
  export function registerSynthSounds(...args: any[]): any;
  export function getSampleInfo(...args: any[]): any;
  export const soundMap: any;
  export function loadBuffer(...args: any[]): any;
}
