/* eslint-disable @typescript-eslint/no-explicit-any */

import type { JscTarget, Output, ParserConfig, ReactConfig } from '@swc/core';
import { transform } from '@swc/core';
import type { BuildOptions, Plugin, UserConfig } from 'vite';

export interface PreactPluginOptions {
  /**
   * Import Source for jsx.
   * @default "preact"
   */
  jsxImportSource?: string;

  /**
   * Enable TypeScript decorators. Requires experimentalDecorators in tsconfig.
   * @default false
   */
  tsDecorators?: boolean;

  /**
   * Use SWC plugins. Enable SWC at build time.
   */
  plugins?: [string, Record<string, any>][];

  /**
   * Set the target for SWC in dev. This can avoid to down-transpile private class method for example.
   * For production target, see https://vitejs.dev/config/build-options.html#build-target
   * @default "es2020"
   */
  devTarget?: JscTarget;

  /**
   * Override the default include list (.ts, .tsx, .mts, .jsx, .mdx).
   * This requires to redefine the config for any file you want to be included.
   * If you want to trigger fast refresh on compiled JS, use `jsx: true`.
   * Exclusion of node_modules should be handled by the function if needed.
   */
  parserConfig?: (id: string) => ParserConfig | undefined;
}

function preactPlugin(options: PreactPluginOptions = {}): Plugin[] {
  const {
    jsxImportSource = 'preact',
    tsDecorators = false,
    plugins = [],
    devTarget = 'es2020',
    parserConfig,
  } = options;

  let hmrDisabled = false;

  return [
    {
      name: 'vite:preact-swc',
      apply: 'serve',
      enforce: 'pre',
      config() {
        return {
          esbuild: { jsx: 'automatic', jsxImportSource },
          optimizeDeps: {
            include: ['preact/jsx-runtime', 'preact/jsx-dev-runtime'],
          },
        };
      },
      configResolved(config) {
        if (config.server.hmr === false) hmrDisabled = true;
        const mdxIndex = config.plugins.findIndex((p) => p.name === '@mdx-js/rollup');
        if (
          mdxIndex !== -1 &&
          mdxIndex > config.plugins.findIndex((p) => p.name === 'vite:react-swc')
        ) {
          throw new Error('[vite:react-swc] The MDX plugin should be placed before this plugin');
        }
      },
      async transform(code, url, transformOptions) {
        const id = url.split('?')[0];
        const refresh = !transformOptions?.ssr && !hmrDisabled;

        const result = await transformWithOptions(
          id,
          code,
          devTarget,
          {
            refresh,
            development: true,
            runtime: 'automatic',
            importSource: jsxImportSource,
          },
          [
            ...plugins,
            ...(refresh ? [['@swc/plugin-prefresh', {}] as [string, Record<string, any>]] : []),
          ],
          tsDecorators,
          parserConfig,
        );
        if (!result) return;
        if (!refresh) return result;

        const hasReg = /\$RefreshReg\$\(/.test(result.code);
        const hasSig = /\$RefreshSig\$\(/.test(result.code);

        if (!hasSig && !hasReg) return result;

        const prefreshCore = await this.resolve('@prefresh/core', __filename);
        const prefreshUtils = await this.resolve('@prefresh/utils', __filename);

        const prelude = `
          ${'import'} ${JSON.stringify(prefreshCore!.id)};
          ${'import'} { flush as flushUpdates } from ${JSON.stringify(prefreshUtils!.id)};

          let prevRefreshReg;
          let prevRefreshSig;

          if (import.meta.hot) {
            prevRefreshReg = self.$RefreshReg$ || (() => {});
            prevRefreshSig = self.$RefreshSig$ || (() => (type) => type);

            self.$RefreshReg$ = (type, id) => {
              self.__PREFRESH__.register(type, ${JSON.stringify(id)} + " " + id);
            };

            self.$RefreshSig$ = () => {
              let status = 'begin';
              let savedType;
              return (type, key, forceReset, getCustomHooks) => {
                if (!savedType) savedType = type;
                status = self.__PREFRESH__.sign(type || savedType, key, forceReset, getCustomHooks, status);
                return type;
              };
            };
          }
          `.replace(/\n+/g, '');

        if (hasSig && !hasReg) {
          return {
            code: `${prelude}${result.code}`,
            map: result.map,
          };
        }

        return {
          code: `${prelude}${result.code}

          if (import.meta.hot) {
            self.$RefreshReg$ = prevRefreshReg;
            self.$RefreshSig$ = prevRefreshSig;
            import.meta.hot.accept((m) => {
              try {
                flushUpdates();
              } catch (e) {
                self.location.reload();
              }
            });
          }
        `,
          map: result.map,
        };
      },
    },
    plugins.length > 0
      ? {
          name: 'vite:react-swc',
          apply: 'build',
          enforce: 'pre', // Run before esbuild
          config(userConfig) {
            return {
              build: silenceUseClientWarning(userConfig),
            };
          },
          transform: (code, id) =>
            transformWithOptions(
              id.split('?')[0],
              code,
              'esnext',
              {
                runtime: 'automatic',
                importSource: jsxImportSource,
              },
              plugins,
              tsDecorators,
              parserConfig,
            ),
        }
      : {
          name: 'vite:react-swc',
          apply: 'build',
          config(userConfig) {
            return {
              build: silenceUseClientWarning(userConfig),
              esbuild: {
                jsx: 'automatic',
                jsxImportSource,
                tsconfigRaw: {
                  compilerOptions: { useDefineForClassFields: true },
                },
              },
            };
          },
        },
  ];
}

async function transformWithOptions(
  id: string,
  code: string,
  target: JscTarget,
  reactConfig: ReactConfig,
  plugins: [string, Record<string, any>][],
  decorators: boolean,
  parserConfig?: (id: string) => ParserConfig | undefined,
): Promise<Output | undefined> {
  const parser: ParserConfig | undefined = parserConfig
    ? parserConfig(id)
    : id.endsWith('.tsx')
      ? { syntax: 'typescript', tsx: true, decorators }
      : id.endsWith('.ts') || id.endsWith('.mts')
        ? { syntax: 'typescript', tsx: false, decorators }
        : id.endsWith('.jsx')
          ? { syntax: 'ecmascript', jsx: true }
          : id.endsWith('.mdx')
            ? // JSX is required to trigger fast refresh transformations, even if MDX already transforms it
              { syntax: 'ecmascript', jsx: true }
            : undefined;
  if (!parser) return;

  let result: Output;
  try {
    result = await transform(code, {
      filename: id,
      swcrc: false,
      configFile: false,
      sourceMaps: true,
      jsc: {
        target,
        parser,
        experimental: { plugins },
        transform: {
          useDefineForClassFields: true,
          react: reactConfig,
        },
      },
    });
  } catch (e: any) {
    const message: string = e.message;
    const fileStartIndex = message.indexOf('╭─[');
    if (fileStartIndex !== -1) {
      const match = message.slice(fileStartIndex).match(/:(\d+):(\d+)\]/);
      if (match) {
        e.line = match[1];
        e.column = match[2];
      }
    }
    throw e;
  }

  return result;
}

function silenceUseClientWarning(userConfig: UserConfig): BuildOptions {
  return {
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) {
          return;
        }
        if (userConfig.build?.rollupOptions?.onwarn) {
          userConfig.build.rollupOptions.onwarn(warning, defaultHandler);
        } else {
          defaultHandler(warning);
        }
      },
    },
  };
}

export default preactPlugin;
