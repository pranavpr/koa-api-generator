#!/usr/bin/env node

var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');
var program = require('commander');
var readline = require('readline');

var MODE_0666 = parseInt('0666', 8);
var MODE_0755 = parseInt('0755', 8);

var _exit = process.exit;
var pkg = require('../package.json');

var version = pkg.version;

// Re-assign process.exit because of commander
// TODO: Switch to a different command framework
process.exit = exit;

// CLI

/**
 * Install an around function; AOP.
 */

function around(obj, method, fn) {
  var old = obj[method];

  obj[method] = function() {
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) args[i] = arguments[i];
    return fn.call(this, old, args);
  };
}

/**
 * Install a before function; AOP.
 */

function before(obj, method, fn) {
  var old = obj[method];

  obj[method] = function() {
    fn.call(this);
    old.apply(this, arguments);
  };
}

/**
 * Prompt for confirmation on STDOUT/STDIN
 */

function confirm(msg, callback) {
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question(msg, function(input) {
    rl.close();
    callback(/^y|yes|ok|true$/i.test(input));
  });
}

around(program, 'optionMissingArgument', function(fn, args) {
  program.outputHelp();
  fn.apply(this, args);
  return { args: [], unknown: [] };
});

before(program, 'outputHelp', function() {
  // track if help was shown for unknown option
  this._helpShown = true;
});

before(program, 'unknownOption', function() {
  // allow unknown options if help was shown, to prevent trailing error
  this._allowUnknownOption = this._helpShown;

  // show help if not yet shown
  if (!this._helpShown) {
    program.outputHelp();
  }
});

program
  .name('koa-api')
  .version(version, '    --version')
  .usage('[options] [dir]')
  .option('    --git', 'add .gitignore')
  .option('-f, --force', 'force on non-empty directory')
  .parse(process.argv);

if (!exit.exited) {
  main();
}
/**
 * Create application at the given directory `path`.
 *
 * @param {String} path
 */

function createApplication(name, path) {
  var wait = 3;

  console.log();
  function complete() {
    if (--wait) return;
    var prompt = launchedFromCmd() ? '>' : '$';

    console.log();
    console.log('   install dependencies:');
    console.log('     %s cd %s && npm install', prompt, path);
    console.log();
    console.log('   run the app:');

    if (launchedFromCmd()) {
      console.log('     %s SET DEBUG=koa* & npm start', prompt, name);
    } else {
      console.log('     %s DEBUG=%s:* npm start', prompt, name);
    }

    console.log();
  }

  // JavaScript
  var app = loadTemplate('js/app.js');
  var index = loadTemplate('js/index.js');
  var routes = loadTemplate('js/routes.js');
  var tests = loadTemplate('js/routes.test.js');

  mkdir(path, function() {
    mkdir(path + '/src', function() {
      write(path + '/src/index.js', index);
      write(path + '/src/app.js', app);
      write(path + '/src/routes.js', routes);
      complete();
    });

    mkdir(path + '/test', function() {
      write(path + '/test/routes.test.js', tests);
      complete();
    });

    // package.json
    var pkg = {
      name: name,
      version: '1.0.0',
      private: true,
      main: 'dist/index.js',
      engines: {
        node: '~8.5.0',
        npm: '>=5.3.0'
      },
      scripts: {
        prestart: 'npm run -s build',
        start: 'node dist/index.js',
        dev:
          'nodemon src/index.js --exec "node -r dotenv/config -r babel-register"',
        clean: 'rimraf dist',
        build: 'npm run clean && mkdir -p dist && babel src -s -D -d dist',
        test: 'jest',
        lint: 'esw -w src test'
      },
      dependencies: {
        '@koa/cors': '2',
        'babel-cli': '^6.26.0',
        'babel-plugin-transform-object-rest-spread': '^6.26.0',
        'babel-preset-env': '^1.6.0',
        koa: '^2.3.0',
        'koa-bodyparser': '^4.2.0',
        'koa-morgan': '^1.0.1',
        'koa-router': '^7.2.1',
        rimraf: '^2.6.2'
      },
      devDependencies: {
        'babel-eslint': '^8.0.0',
        'babel-jest': '^21.0.2',
        'babel-register': '^6.26.0',
        dotenv: '^4.0.0',
        eslint: '^4.7.2',
        'eslint-plugin-import': '^2.7.0',
        'eslint-plugin-jest': '^21.1.0',
        'eslint-watch': '^3.1.2',
        jest: '^21.1.0',
        nodemon: '^1.12.1',
        supertest: '^3.0.0'
      },
      babel: {
        presets: [
          [
            'env',
            {
              targets: {
                node: 'current'
              }
            }
          ]
        ],
        plugins: ['transform-object-rest-spread'],
        sourceMaps: true,
        retainLines: true
      },
      eslintConfig: {
        parser: 'babel-eslint',
        plugins: ['import', 'jest'],
        parserOptions: {
          ecmaVersion: 2017,
          sourceType: 'module'
        },
        env: {
          node: true,
          jest: true,
          es6: true
        },
        extends: ['eslint:recommended'],
        rules: {
          'jest/no-focused-tests': 2,
          'jest/no-identical-title': 2
        }
      },
      jest: {
        testEnvironment: 'node'
      },
      directories: {
        test: 'test'
      }
    };

    // write files
    write(path + '/package.json', JSON.stringify(pkg, null, 2));

    if (program.git) {
      write(
        path + '/.gitignore',
        fs.readFileSync(__dirname + '/../template/gitignore', 'utf-8')
      );
    }

    write(
      path + '/.env.example',
      fs.readFileSync(__dirname + '/../template/env.example', 'utf-8')
    );

    write(
      path + '/.editorconfig',
      fs.readFileSync(__dirname + '/../template/editorconfig', 'utf-8')
    );

    complete();
  });
}

/**
 * Create an app name from a directory path, fitting npm naming requirements.
 *
 * @param {String} pathName
 */

function createAppName(pathName) {
  return path
    .basename(pathName)
    .replace(/[^A-Za-z0-9.()!~*'-]+/g, '-')
    .replace(/^[-_.]+|-+$/g, '')
    .toLowerCase();
}

/**
 * Check if the given directory `path` is empty.
 *
 * @param {String} path
 * @param {Function} fn
 */

function emptyDirectory(path, fn) {
  fs.readdir(path, function(err, files) {
    if (err && 'ENOENT' != err.code) throw err;
    fn(!files || !files.length);
  });
}

/**
 * Graceful exit for async STDIO
 */

function exit(code) {
  // flush output for Node.js Windows pipe bug
  // https://github.com/joyent/node/issues/6247 is just one bug example
  // https://github.com/visionmedia/mocha/issues/333 has a good discussion
  function done() {
    if (!draining--) _exit(code);
  }

  var draining = 0;
  var streams = [process.stdout, process.stderr];

  exit.exited = true;

  streams.forEach(function(stream) {
    // submit empty write request and wait for completion
    draining += 1;
    stream.write('', done);
  });

  done();
}

/**
 * Determine if launched from cmd.exe
 */

function launchedFromCmd() {
  return process.platform === 'win32' && process.env._ === undefined;
}

/**
 * Load template file.
 */

function loadTemplate(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'template', name), 'utf-8');
}

/**
 * Main program.
 */

function main() {
  // Path
  var destinationPath = program.args.shift() || '.';

  // App name
  var appName = createAppName(path.resolve(destinationPath)) || 'koa-api';

  // Generate application
  emptyDirectory(destinationPath, function(empty) {
    if (empty || program.force) {
      createApplication(appName, destinationPath);
    } else {
      confirm('destination is not empty, continue? [y/N] ', function(ok) {
        if (ok) {
          process.stdin.destroy();
          createApplication(appName, destinationPath);
        } else {
          console.error('aborting');
          exit(1);
        }
      });
    }
  });
}

/**
 * Mkdir -p.
 *
 * @param {String} path
 * @param {Function} fn
 */

function mkdir(path, fn) {
  mkdirp(path, MODE_0755, function(err) {
    if (err) throw err;
    console.log('   \x1b[36mcreate\x1b[0m : ' + path);
    fn && fn();
  });
}

/**
 * echo str > path.
 *
 * @param {String} path
 * @param {String} str
 */

function write(path, str, mode) {
  fs.writeFileSync(path, str, { mode: mode || MODE_0666 });
  console.log('   \x1b[36mcreate\x1b[0m : ' + path);
}
