# vite-plugin-preact-swc

*Experimental*

Develop your Preact apps with [Vite](https://vitejs.dev/) and [SWC](https://swc.rs/).

A port of [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) for Preact, the options and caveats are basically the same.

## Additional caveats

SWC is extremely strict with versions. For reference, @swc/plugin-prefresh 2.0.8 and 2.0.9 works with @swc/core 1.7.x and @swc/plugin-prefresh 2.0.7 works with @swc/core 1.6.x. Please override versions as needed.

See https://swc.rs/docs/plugin/selecting-swc-core for more.

## Features

- Transform Preact components with SWC at dev time (or at build time if swc plugins are used)
- Fast-refresh with [@swc/plugin-prefresh](https://github.com/swc-project/plugins/tree/main/packages/prefresh)

## Installation

```sh
npm i -D vite-plugin-preact-swc
```

## Usage

```ts
import { defineConfig } from "vite";
import preact from "vite-plugin-preact-swc";

export default defineConfig({
  plugins: [preact()],
});
```

## Credits

- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc)
- [@prefresh/vite](https://github.com/preactjs/prefresh/tree/main/packages/vite)
- [@preact/preset-vite](https://github.com/preactjs/preset-vite)
- Demo code from [create-vite](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-preact-ts)
