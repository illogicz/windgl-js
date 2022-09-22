//import buble from "rollup-plugin-buble";
import pkg from "./package.json";
import commonjs from "rollup-plugin-commonjs";
import resolve from "rollup-plugin-node-resolve";
import path from "path"
import fs from "fs"

import { compile as glslify } from "glslify";
import * as GLSLX from "glslx";
import { dirname } from "path";
import { createFilter } from "rollup-pluginutils";

function makeGLSL(userOptions = {}) {
  const options = Object.assign(
    {
      include: [
        "**/*.vs",
        "**/*.fs",
        "**/*.vert",
        "**/*.frag",
        "**/*.glsl",
        "**/*.glslx"
      ]
    },
    userOptions
  );

  const filter = createFilter(options.include, options.exclude);

  return {
    transform(code, id) {
      if (!filter(id)) return;

      options.basedir = options.basedir || dirname(id);

      const codeWithDeps = glslify(code, options).replace(
        "#define GLSLIFY 1\n",
        ""
      );

      const compiled = GLSLX.compile(codeWithDeps, {
        disableRewriting: false,
        format: "json",
        keepSymbols: false,
        prettyPrint: false,
        renaming: "internal-only"
      });

      if (compiled.log) {
        return this.error(compiled.log.replace("<stdin>", id));
      }

      const program = JSON.parse(compiled.output);

      const {
        fragmentShaders,
        vertexShaders,
        otherShaders
      } = program.shaders.reduce(
        (obj, shader) => {
          if (shader.name.endsWith("Fragment")) {
            obj.fragmentShaders[shader.name.replace(/Fragment$/, "")] =
              shader.contents;
          } else if (shader.name.endsWith("Vertex")) {
            obj.vertexShaders[shader.name.replace(/Vertex$/, "")] =
              shader.contents;
          } else {
            obj.otherShaders[shader.name] = shader.contents;
          }
          return obj;
        },
        { fragmentShaders: {}, vertexShaders: {}, otherShaders: {} }
      );

      const assembledShaders = [];
      Object.keys(vertexShaders).forEach(key => {
        if (fragmentShaders[key]) {
          assembledShaders.push(
            `export const ${key} = gl => createProgram(gl, ${JSON.stringify(
              vertexShaders[key]
            )}, ${JSON.stringify(fragmentShaders[key])});`
          );
          delete fragmentShaders[key];
          delete vertexShaders[key];
        } else {
          assembledShaders.push(
            `export const ${key}Vertex = ${JSON.stringify(vertexShaders[key])};`
          );
        }
      });

      Object.keys(fragmentShaders).forEach(key => {
        assembledShaders.push(
          `export const ${key}Fragment = ${JSON.stringify(
            fragmentShaders[key]
          )};`
        );
      });

      Object.keys(otherShaders).forEach(key => {
        if (key === "main") {
          assembledShaders.push(
            `export default ${JSON.stringify(otherShaders[key])};`
          );
        } else {
          assembledShaders.push(
            `export const ${key} = ${JSON.stringify(otherShaders[key])};`
          );
        }
      });

      return {
        code: `import {createProgram} from "../util";

        ${assembledShaders.join("\n\n")}`,
        map: { mappings: "" }
      };
    }
  };
}



function copyFiles(from, to, overwrite = false) {
	return {
		name: 'copy-files',
		generateBundle() {
			const log = msg => console.log('\x1b[36m%s\x1b[0m', msg)
			log(`copy files: ${from} → ${to}`)
			fs.readdirSync(from).forEach(file => {
				const fromFile = `${from}/${file}`
				const toFile = `${to}/${file}`
				if (fs.existsSync(toFile) && !overwrite)
					return
				log(`• ${fromFile} → ${toFile}`)
				fs.copyFileSync(
					path.resolve(fromFile),
					path.resolve(toFile)
				)
			})
		}
	}
}

const plugins = [
  copyFiles("./src/shaders", "./dist/esm/shaders"),
  copyFiles("./src/typings", "./dist/types"),
  makeGLSL({ include: "./dist/esm/shaders/*.glsl" }),
  resolve(),
  commonjs({
    namedExports: {
      "node_modules/mapbox-gl/dist/style-spec/index.js": ["expression"]
    }
  }),
];

export default [
  // {
  //   input: "demo.ts",
  //   output: [{ file: "docs/index.js", format: "iife" }],
  //   plugins
  // },
  {
    input: "dist/esm/index.js",
    output: [{ file: pkg.browser, format: "umd", name: "windGL" }],
    plugins
  },
  {
    input: "dist/esm/index.js",
    output: [
      {
        file: pkg.main,
        format: "cjs"
      },
      {
        file: pkg.module,
        format: "es"
      }
    ],
    external: ["mapbox-gl/dist/style-spec"],
    plugins
  }
];
