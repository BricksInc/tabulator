import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";

import license from 'rollup-plugin-license';
import {globbySync} from 'globby';
import fs from 'fs-extra';

import postcss from "rollup-plugin-postcss";

export default class Bundler{
	
	constructor(version, env){
		this.bundles = [];
		
		this.env = env;
		this.version = "/* Tabulator v" + version + " (c) Oliver Folkerd <%= moment().format('YYYY') %> */";
	}
	
	_suppressUnnecessaryWarnings(warn, defaultHandler){
		const ignoredCodes = {
			"FILE_NAME_CONFLICT": true,
		};
		
		var suppressed = false, 
		codeHandler = ignoredCodes[warn.code];
		
		if(codeHandler){
			suppressed = typeof codeHandler === "function" ? codeHandler(warn) : codeHandler;
		}
		
		if(!suppressed){
			defaultHandler(warn);
		}
	}
	
	_suppressCircularDependencyWarnings(warn){
		const ignoredCircularFiles = [
			"Column.js",
			"Tabulator.js",
		];

		return ignoredCircularFiles.some(file => warn.importer.includes(file));
	}

	_getEOLPlugin(){
		return {
			name: 'eol-plugin',
			generateBundle(options, bundle) {
				for (const fileName in bundle) {
					if (bundle[fileName].type === 'asset' || bundle[fileName].type === 'chunk') {
						if (bundle[fileName].code) {
							bundle[fileName].code = bundle[fileName].code.replace(/\r\n/g, '\n');
						}
						if (bundle[fileName].source && typeof bundle[fileName].source === 'string') {
							bundle[fileName].source = bundle[fileName].source.replace(/\r\n/g, '\n');
						}
					}
				}
			}
		};
	}
	
	bundle(){
		if(this.env){
			this.watch(this.env);
		}else{
			this.build();
		}
		
		return this.bundles;
	}
	
	watch(env){
		console.log("Building Dev Package Bundles: ", env);
		switch(env){
			case "css":
				this.bundleCSS(false);
				break;
			
			case "esm":
				this.bundleESM(false);
				break;
			
			case "umd":
				this.bundleUMD(false);
				break;
			
			case "wrappers":
				this.buildWrappers();
				break;
			
			default:
				this.bundleCSS(false);
				this.bundleESM(false);
				break;
		}
	}
	
	build(){
		console.log("Clearing Dist Files");
		
		this.clearDist();
		
		console.log("Building Wrappers");
		
		this.buildWrappers();
		
		console.log("Building Production Package Bundles");
		
		this.bundleCSS(false);
		this.bundleCSS(true);
		
		this.bundleESM(false);
		this.bundleESM(true);
		
		this.bundleUMD(false);
		this.bundleUMD(true);
	}
	
	clearDist(){
		fs.emptyDirSync("./dist");
	}
	
	buildWrappers(){
		var builds = ["jquery_wrapper.js"];
		
		builds.forEach((build) => {
			let content = fs.readFileSync("./src/js/builds/" + build, "utf8");
			content = content.replace(/\r\n/g, '\n');
			fs.outputFileSync("./dist/js/" + build, content);
		});
	}
	
	bundleCSS(minify){
		this.bundles = this.bundles.concat(globbySync("./src/scss/**/tabulator*.scss").map(inputFile => {
			
			var file = inputFile.split("/");
			file = file.pop().replace(".scss", (minify ? ".min" : "") + ".css");
			
			return {
				input: inputFile,
				output: {
					file: "./dist/css/" + file,
					format: "es",
				},
				plugins: [
					postcss({
						modules: false,
						extract: true,
						minimize: minify,
						sourceMap: true,
						plugins: [require('postcss-prettify')]
					}),
					this._getEOLPlugin(),
				],
				onwarn:this._suppressUnnecessaryWarnings.bind(this),
			};
		}));
	}
	
	bundleESM(minify){
		this.bundles.push({
			input:"src/js/builds/esm.js",
			plugins: [
				nodeResolve(),
				minify ? terser() : null,
				license({
					banner: {
						commentStyle:"none",
						content:this.version,
					},
				}),
				this._getEOLPlugin(),
			],
			output: [
				{
					file: "dist/js/tabulator_esm" + (minify ? ".min" : "") + ".js",
					format: "esm",
					exports: "named",
					sourcemap: true,
				},
				{
					file: "dist/js/tabulator_esm" + (minify ? ".min" : "") + ".mjs",
					format: "esm",
					exports: "named",
					sourcemap: true,
				},
			],
			onwarn:this._suppressUnnecessaryWarnings.bind(this),
		});
	}
	
	bundleUMD(minify){
		this.bundles.push({
			input:"src/js/builds/usd.js",
			plugins: [
				nodeResolve(),
				minify ? terser() : null,
				license({
					banner: {
						commentStyle:"none",
						content:this.version,
					},
				}),
				this._getEOLPlugin(),
			],
			output: {
				file: "dist/js/tabulator" + (minify ? ".min" : "") + ".js",
				format: "umd",
				name: "Tabulator",
				esModule: false,
				exports: "default",
				sourcemap: true,
			},
			onwarn:this._suppressUnnecessaryWarnings.bind(this),
		});
	}
}