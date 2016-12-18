/*
 * Copyright (c) 2012 Tyler Kellen, contributors
 * Licensed under the MIT license.
 *
 * https://github.com/gruntjs/grunt-lib-contrib
 *
 * Copyright (c) 2014 Tim Branyen, contributors
 * Licensed under the MIT license.
 *
 * https://github.com/gruntjs/grunt-contrib-jst
 */

(function() {
  "use strict";

  var args = process.argv,
    fs = require("fs"),
    _ = require("underscore"),
    mkdirp = require("mkdirp"),
    Promise = require("promise"),
    path = require("path");

  var SOURCE_FILE_MAPPINGS_ARG = 2;
  var TARGET_ARG = 3;
  var OPTIONS_ARG = 4;

  var sourceFileMappings = JSON.parse(args[SOURCE_FILE_MAPPINGS_ARG]);
  var target = args[TARGET_ARG];
  var options = JSON.parse(args[OPTIONS_ARG]);

  var sourcesToProcess = sourceFileMappings.length;
  var results = [];
  var problems = [];
  var output = [];
  var namespace = "this[\"JST\"]";
  var outputFile = path.join(target, options.outputPath);

  var jst = {};
  var tmplnames = [];
  var tmplfullnames = [];
  var templates = [];

  var readTemplate = function(mapping) {
    // console.log("readTemplate");
    var logError = function(file, message) {
      problems.push({
        message: message,
        severity: "error",
        source: file
      });
      results.push({
        source: file,
        result: null
      });
    };

    var input = mapping[0], filename = mapping[1];
    return new Promise(function(resolve, reject) {
      fs.readFile(input, "utf-8", function(err, contents) {
        if (err) {
          reject(err);
        } else {
          try {
            var templateOptions = {};
            if (options.interpolate !== "")
              templateOptions.interpolate = options.interpolate;

            var compiled = _.template(contents, null, templateOptions).source;
            if (!options.prettify) {
              compiled = compiled.replace(/ *\n */g, '');
            }
            resolve(compiled);
          } catch (err) {
            logError(input, filename + " failed to compile");
            reject(err.message);
          }
        }
      });
    });
  };

  var acquireTargetLock = function() {
    // console.log("acquireTargetLock");
    return new Promise(function(resolve, reject) {
      // console.log("mkdirp " + path.dirname(outputFile));
      mkdirp(path.dirname(outputFile), function(e) {
        if (e) reject(e);
        else {
          var lockOutput = function(iterations, delay) {
            if (iterations > 0) {
              fs.symlink('/dev/null', outputFile+".lock", function(e) { // FIXME: platforms
                if (e && e.message.lastIndexOf("EEXIST",0) == 0) {
                  setTimeout(function(){lockOutput(iterations-1, delay);}, delay);
                } else if (e) {
                  console.log("symlink error: " + e);
                  setTimeout(function(){lockOutput(iterations-1, delay);}, delay);
                } else {
                  // console.log("acquired lock the new way");
                  resolve();
                }
              });
            } else {
              // FIXME: push onto problems[]
              reject("could not aquire lock");
            }
          }
          lockOutput(100, 50);
        }
      });
    });
  };

  var readTargetTemplates = function() {
    return new Promise(function(resolve, reject) {
      if (!options.aggregate || !options.amd) {
        resolve();
        return;
      }
      fs.readFile(outputFile, "utf8", function(e, contents) {
        if (!e) {
          try {
            var define = define || function(arg1, arg2) { return arg2; }
            var preset = eval(contents)();
            _.keys(preset).forEach(function(key) {
              if (_.includes(tmplnames, key)) {
                jst[key] = templates[0]; // FIXME: index
              }
              else {
                jst[key] = preset[key];
              }
            });
            resolve();
          }
          catch(e) {
            console.log("readFile eval() error: " + e.message);
            reject(e.message);
          }
        } else {
          if (e.message.lastIndexOf("ENOENT",0) == 0) // this is ok
            resolve();
          else
            reject(e.message);
        }
      });
    });
  };

  var composeHeader = function() {
    return new Promise(function(resolve, reject) {
      var header = [];
      var indent = options.amd ? "  " : "";
      if (options.amd) {
        header.push("define([],function(){");
      }
      var curPath = 'this';
      var ns = options.namespace;
      if (ns !== 'this') {
        var nsParts = ns.split('.');
        nsParts.forEach(function(curPart, index) {
          if (curPart !== 'this') {
            curPath += '[' + JSON.stringify(curPart) + ']';
            header.push(indent + curPath + ' = ' + curPath + ' || {};');
          }
        });
      }
      namespace = curPath;
      output.push(header.join('\n'));
      resolve();
    });
  };

  var composeTemplates = function() {
    var prettify = function(template) {
        if (!options.prettify) {
          template = template.replace(/ *\n */g, '');
        } else {
          template = template.replace(/\n/g, '\n  ');
          template = template.replace(/ *\n */, '');
          template = template.replace(/}\n *$/, '}');
        }
        return template;
    };

    return new Promise(function(resolve, reject) {
      var data = [];
      var indent = options.amd ? "  " : "";
      _.keys(jst).forEach(function(key, idx) {
        var template = prettify(jst[key].toString());
        data.push(indent + namespace + '["' + key + '"] = ' + template + ';');
        data.push('');
      });
      tmplnames.forEach(function(key, idx) {
        var template = prettify(eval(templates[idx].toString()).toString());
        data.push(indent + namespace + '["' + key + '"] = ' + template + ';');
        data.push('');
      });
      data.pop();
      output.push(data.join('\n'));
      resolve();
    });
  };

  var composeFooter = function() {
    return new Promise(function(resolve, reject) {
      if (!options.amd) {
        resolve();
        return;
      }
      var footer = [];
      footer.push("  return " + namespace + ";");
      footer.push("});");
      footer.push("");
      output.push(footer.join("\n"));
      resolve();
    });
  };

  var writeOutputFile = function() {
    return new Promise(function(resolve, reject) {
      // console.log("mkdirp " + path.dirname(outputFile));
      mkdirp(path.dirname(outputFile), function(e) {
        if (e) reject(e);
        else {
          // console.log("truncate " + outputFile);
          fs.truncate(outputFile, 0, function(e) {
            if (e) {
              if (e.message.lastIndexOf("ENOENT",0) != 0) {
                reject(e);
                return;
              }
            }
            // console.log("writeFile " + outputFile);
            fs.writeFile(outputFile, output.join(options.separator), "utf8", function(e) {
              if (e) {
                console.log("write error: " + e);
                reject(e);
              }
              else {
                // console.log("wrote " + outputFile);
                results.push({ // FIXME: forEach
                  source: tmplfullnames[0],
                  result: {
                    filesRead: [tmplfullnames[0]],
                    filesWritten: [outputFile]
                  }
                });
                resolve();
              }
            });
          });
        }
      });
    });
  };

  var releaseTargetLock = function() {
    // console.log("releaseTargetLock");
    return new Promise(function(resolve, reject) {
      // console.log("unlocking");
      fs.unlink(outputFile + ".lock", function(err) {
        if (err) reject(err.message);
        else resolve();
      });
    });
  };

  var writeConsoleResults = function() {
    // console.log("writeConsoleResults");
    return new Promise(function(resolve, reject) {
      console.log("\u0010" + JSON.stringify({
        results: results,
        problems: problems
      }));
      resolve();
    });
  };

  var completed = function() {
    return new Promise(function(resolve, reject) {
      console.log("compiled underscore template for " + tmplnames[0]);
      resolve();
    });
  };

  var enterThenChainAgain = function() {
    return Promise.resolve();
  };

  tmplfullnames = sourceFileMappings.map(function(mapping){return mapping[0];});
  tmplnames = sourceFileMappings.map(function(mapping){return mapping[1];});

  templates = sourceFileMappings.map(readTemplate);

  Promise.all(templates)
    .then(function(v) { templates=v; return Promise.resolve(); })
    .then(acquireTargetLock)
    .then(readTargetTemplates)
    .then(composeHeader)
    .then(composeTemplates)
    .then(composeFooter)
    .then(writeOutputFile).catch(enterThenChainAgain)
    .then(releaseTargetLock)
    .then(writeConsoleResults)
    .then(completed)
    .done();

})()
