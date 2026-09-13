// Ambient module declarations for what the compiler resolves but TypeScript cannot infer. Reference
// this file once from an application: `/// <reference types="effective-rsc/types" />`.

// A stylesheet import carries no value; Rspack emits and orders the stylesheet itself.
declare module '*.css' {}

// An asset import resolves to the content-addressed URL `ersc build` serves from the framework
// asset namespace.
declare module '*.apng' {
  const source: string;
  export default source;
}
declare module '*.avif' {
  const source: string;
  export default source;
}
declare module '*.bmp' {
  const source: string;
  export default source;
}
declare module '*.cur' {
  const source: string;
  export default source;
}
declare module '*.gif' {
  const source: string;
  export default source;
}
declare module '*.ico' {
  const source: string;
  export default source;
}
declare module '*.jfif' {
  const source: string;
  export default source;
}
declare module '*.jpeg' {
  const source: string;
  export default source;
}
declare module '*.jpg' {
  const source: string;
  export default source;
}
declare module '*.jxl' {
  const source: string;
  export default source;
}
declare module '*.pjp' {
  const source: string;
  export default source;
}
declare module '*.pjpeg' {
  const source: string;
  export default source;
}
declare module '*.png' {
  const source: string;
  export default source;
}
declare module '*.svg' {
  const source: string;
  export default source;
}
declare module '*.tif' {
  const source: string;
  export default source;
}
declare module '*.tiff' {
  const source: string;
  export default source;
}
declare module '*.webp' {
  const source: string;
  export default source;
}
declare module '*.eot' {
  const source: string;
  export default source;
}
declare module '*.otf' {
  const source: string;
  export default source;
}
declare module '*.ttc' {
  const source: string;
  export default source;
}
declare module '*.ttf' {
  const source: string;
  export default source;
}
declare module '*.woff' {
  const source: string;
  export default source;
}
declare module '*.woff2' {
  const source: string;
  export default source;
}
declare module '*.aac' {
  const source: string;
  export default source;
}
declare module '*.flac' {
  const source: string;
  export default source;
}
declare module '*.m4a' {
  const source: string;
  export default source;
}
declare module '*.mov' {
  const source: string;
  export default source;
}
declare module '*.mp3' {
  const source: string;
  export default source;
}
declare module '*.mp4' {
  const source: string;
  export default source;
}
declare module '*.ogg' {
  const source: string;
  export default source;
}
declare module '*.opus' {
  const source: string;
  export default source;
}
declare module '*.vtt' {
  const source: string;
  export default source;
}
declare module '*.wav' {
  const source: string;
  export default source;
}
declare module '*.webm' {
  const source: string;
  export default source;
}
