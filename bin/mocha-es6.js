#! /usr/bin/env node

require("systemjs")

var modules   = require("lively.modules")
var parseArgs = require('minimist');
var glob      = require('glob');
var mochaEs6  = require("../mocha-es6.js")
var path      = require("path");
var fs        = require("fs");
var dir       = process.cwd();
var mochaDir  = path.join(__dirname, "..");
var step      = 1;
var args;

lively.lang.promise.chain([
  () => { // prep
    modules.System.trace = true
    cacheMocha(fileUri(mochaDir));
    modules.unwrapModuleLoad();
    readProcessArgs();
  },
  () => console.log(`${step++}. Linking node_modules to local projects`),
  () => require("./link-node_modules-into-packages.js")(dir),
  () => runPreScript(),
  () => console.log(`${step++}. Looking for test files via globs ${args.files.join(", ")}`),
  () => findTestFiles(args.files),
  (files, state) => state.testFiles = files,
  (_, state) => console.log(`${step++}. Running tests in\n  ${state.testFiles.join("\n  ")}`),
  (_, state) => {
    lively.modules.changeSystem(lively.modules.getSystem("system-for-test"), true);
    cacheMocha(fileUri(mochaDir));
    mochaEs6.installSystemInstantiateHook();
    return mochaEs6.runTestFiles(state.testFiles, {package: fileUri(dir)});
  },
  failureCount => process.exit(failureCount)
]).catch(err => {
  console.error(err.stack || err);
  process.exit(1);
})

// path must be absolute
function fileUri(path) {
  if (process.platform == 'win32') {
    path = '/' + path.replace(/\\/g, '/');
  }
  return 'file://' + path;
}

function readProcessArgs() {
  args = parseArgs(process.argv.slice(2), {
    alias: {}
  });
  args.files = args._;
}

function runPreScript() {
  var scriptPath = args["pre-script"];
  if (!scriptPath) return;
  if (!path.isAbsolute(scriptPath))
    scriptPath = path.join(process.cwd(), scriptPath);
  console.log(`${step++}. Running pre-script ${scriptPath}`);
  return require(scriptPath)
}

function findTestFiles(files) {
  return Promise.resolve()
    .then(() => {
      if (!files || !files.length)
        throw new Error("No test files specfied!");
      return Promise.all(files.map(f =>
        new Promise((resolve, reject) =>
          glob(f, {nodir: true, cwd: dir}, (err, files) =>
            err ? reject(err) : resolve(files))))); })
    .then(allFiles => allFiles.reduce((all, files) => all.concat(files)))
    .then(files => files.map(f => fileUri(path.join(dir, f))))
}

function cacheMocha(mochaDirURL) {
  if (typeof System !== "undefined" && !System.get(mochaDirURL + "/mocha-es6.js")) {
    System.config({
      map: {
        "mocha-es6": mochaDirURL,
        "mocha": mochaDirURL + "/dist/mocha.js",
        "chai": mochaDirURL + "/dist/chai.js"
      }
    });
    System.set(mochaDirURL + "/node_modules/lively.modules/dist/lively.modules.js", System.newModule(modules));
    System.set(mochaDirURL + "/index.js", System.newModule(mochaEs6));
    System.set(mochaDirURL + "/mocha-es6.js", System.newModule(mochaEs6));
    System.set(mochaDirURL + "/dist/mocha.js", System.newModule(mochaEs6.mocha));
    System.set(mochaDirURL + "/dist/chai.js", System.newModule(mochaEs6.chai));
  }
}
