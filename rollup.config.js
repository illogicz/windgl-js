import pkg from './package.json'
import commonjs from 'rollup-plugin-commonjs'
import resolve from 'rollup-plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import path from 'path'
import fs from 'fs'

//import fg from 'fast-glob';

import * as GLSLX from 'glslx'
import { dirname } from 'path'
import { createFilter } from 'rollup-pluginutils'

function makeGLSL(userOptions = {}) {
  const u_globals = ['u_tex_a', 'u_tex_0', 'u_tex_1', ...(userOptions.globals ?? [])]
  const regexp = new RegExp(`(\\W)(${u_globals.join('|')})_\\d{5,}(\\W)`, 'gm')
  const preserveGlobals = [
    (file, content, opts) => {
      return content.replaceAll(regexp, '$1$2$3')
    },
    { post: true }
  ]

  const options = Object.assign(
    {
      include: ['**/*.vs', '**/*.fs', '**/*.vert', '**/*.frag', '**/*.glsl', '**/*.glslx'],
      transform: [preserveGlobals]
    },
    userOptions
  )

  const filter = createFilter(options.include, options.exclude)
  const outputs = {}

  return {
    transform(code, id) {
      if (!filter(id)) return

      options.basedir = options.basedir || dirname(id)

      //const codeWithDeps = glslify(code, options).replace('#define GLSLIFY 1\n', '')

      const compiled = GLSLX.compile(code, {
        disableRewriting: true,
        format: 'json',
        keepSymbols: false,
        prettyPrint: true,
        renaming: 'internal-only',
        fileAccess: p => fs.readFileSync(path.join(dirname(id), p)).toString()
      })

      if (compiled.log) {
        return this.error(compiled.log.replace('<stdin>', id))
      }

      const program = JSON.parse(compiled.output)

      const { fragmentShaders, vertexShaders, otherShaders } = program.shaders.reduce(
        (obj, shader) => {
          if (shader.name.endsWith('Fragment')) {
            obj.fragmentShaders[shader.name.replace(/Fragment$/, '')] = shader.contents
          } else if (shader.name.endsWith('Vertex')) {
            obj.vertexShaders[shader.name.replace(/Vertex$/, '')] = shader.contents
          } else {
            obj.otherShaders[shader.name] = shader.contents
          }
          return obj
        },
        { fragmentShaders: {}, vertexShaders: {}, otherShaders: {} }
      )

      const programs = []
      const assembledShaders = []
      Object.keys(vertexShaders).forEach(key => {
        if (fragmentShaders[key]) {
          programs.push(key)
          assembledShaders.push(`
export const ${key}Vertex = \`${vertexShaders[key]}\`;
export const ${key}Fragment = \`${fragmentShaders[key]}\`;
export const ${key} = gl => createProgram(gl, ${key}Vertex, ${key}Fragment);
`)
          delete fragmentShaders[key]
          delete vertexShaders[key]
        } else {
          assembledShaders.push(`export const ${key}Vertex = ${JSON.stringify(vertexShaders[key])};`)
        }
      })

      Object.keys(fragmentShaders).forEach(key => {
        assembledShaders.push(`export const ${key}Fragment = ${JSON.stringify(fragmentShaders[key])};`)
      })

      Object.keys(otherShaders).forEach(key => {
        if (key === 'main') {
          assembledShaders.push(`export default ${JSON.stringify(otherShaders[key])};`)
        } else {
          assembledShaders.push(`export const ${key} = ${JSON.stringify(otherShaders[key])};`)
        }
      })
      var utilPath = path.relative(path.dirname(id), path.join(process.cwd(), 'src/util')).replace(/\\/g, '/')
      var glslPath = path.relative(path.join(process.cwd(), options.basedir), id).replace(/\\/g, '/')

      outputs[glslPath] = {
        fileName: glslPath,
        programs,
        symbols: Object.values(program.renaming)
      }

      var utilPath = path.relative(path.dirname(id), path.join(process.cwd(), 'src/util')).replace(/\\/g, '/')

      return {
        code: `import {createProgram} from "${utilPath}";

        ${assembledShaders.join('\n\n')}`,
        map: { mappings: '' }
      }
    },
    renderStart(error) {
      const output =
        `
declare type GlslProgram<Props extends string = string> = { program: WebGLProgram } & Record<Props, any>
` +
        Object.values(outputs)
          .map(
            o => `
declare module "*/${o.fileName}" {
    type Props = ${o.symbols.map(s => `"${s}"`).join(' | ')};
    ${o.programs
      .map(p => {
        const typeName = p.charAt(0).toUpperCase() + p.slice(1) + 'Program'
        return `
    export const ${p}Vertex: string;
    export const ${p}Fragment: string;
    export type ${typeName} = GlslProgram<Props>;
    export const ${p}: (gl: WebGLRenderingContext) => ${typeName};`
      })
      .join('')}
}
`
          )
          .join('')
      fs.writeFileSync(options.typingsFile, output)
    }
  }
}

const plugins = [
  // {
  //   name: 'watch-external',
  //   async buildStart() {
  //     const files = await fg('src/**/*');
  //     for (let file of files) {
  //       console.log(file);
  //       this.addWatchFile(file);
  //     }
  //   }
  // },
  makeGLSL({
    include: './src/shaders/**/*.glsl*',
    typingsFile: './src/typings/shaders.d.ts',
    basedir: './src/shaders/'
  }),
  resolve(),
  commonjs(),
  typescript({
    watch: true,
    sourceMap: true,
    noEmitOnError: false
  })
]

export default [
  {
    input: 'src/index.ts',
    watch: {
      clearScreen: true,
      include: 'src/**/*'
    },
    output: [
      {
        file: pkg.main,
        format: 'es',
        sourcemap: true
      }
    ],
    external: ['@maplibre/maplibre-gl-style-spec', 'gl-matrix'],
    plugins
  }
]
