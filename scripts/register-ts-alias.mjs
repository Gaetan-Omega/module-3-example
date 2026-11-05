// Lets a plain `node` script import the app's TypeScript files, including
// paths that start with "@/" (the same shortcut the app uses).
import { register } from "node:module";

register("./ts-alias-hooks.mjs", import.meta.url);
