/*
 * Equation Ordinal — 构建脚本
 *
 * 用法:
 *   npm run dev      开发构建（带 inline sourcemap）
 *   npm run build    生产构建（无 sourcemap，tree-shaking）
 *
 * 产物默认写在仓库根，直接提交即可被 BRAT / 手动安装使用。
 * 如果你的 vault 里也在开发这个插件，用 VAULT_PLUGIN_DIR 指定插件装载目录：
 *   VAULT_PLUGIN_DIR="<vault>/.obsidian/plugins/equation-ordinal" npm run build
 */

import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = process.env.VAULT_PLUGIN_DIR || __dirname;
const prod = process.argv[2] === "production";

await esbuild.build({
	entryPoints: [path.join(__dirname, "src", "main.ts")],
	bundle: true,
	external: ["obsidian"],
	format: "cjs",
	target: "es2020",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: path.join(OUTPUT_DIR, "main.js"),
});

// 静态文件跟着产物一起走；源与目标是同一文件时跳过
for (const name of ["styles.css", "manifest.json"]) {
	const from = path.resolve(__dirname, name);
	const to = path.resolve(OUTPUT_DIR, name);
	if (from !== to) fs.copyFileSync(from, to);
}

console.log(prod ? `生产构建完成 → ${OUTPUT_DIR}` : `开发构建完成 → ${OUTPUT_DIR}`);
