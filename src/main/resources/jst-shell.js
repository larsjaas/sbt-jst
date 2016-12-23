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

  var output = [];
  var namespace = "this[\"JST\"]"; // default
  var outputFile = path.join(target, options.outputPath);

  var results = [];
  var problems = [];

  var logSuccess = function(file) {
    var outputs = options.gzipOptions ? [outputFile, outputFile + ".gz"] : [outputFile];
    results.push({
      source: file,
      result: {
        filesRead: [file],
        filesWritten: outputs
      }
    });
  };

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

  var indent = options.amd ? "  " : "";
  var jst = {};
  var tmplnames = [];
  var tmplfullnames = [];
  var templates = [];

  var readTemplate = function(mapping) {
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
    return new Promise(function(resolve, reject) {
      mkdirp(path.dirname(outputFile), function(e) {
        if (e) reject(e);
        else {
          var lockOutput = function(iterations, delay) {
            if (iterations > 0) {
              fs.symlink('/dev/null', outputFile+".lock", function(e) { // FIXME: crossplatform?
                if (e && e.message.lastIndexOf("EEXIST",0) == 0) {
                  setTimeout(function(){lockOutput(iterations-1, delay);}, delay);
                } else if (e) {
                  console.log("symlink error: " + e);
                  setTimeout(function(){lockOutput(iterations-1, delay);}, delay);
                } else {
                  resolve();
                }
              });
            } else {
              logError(tmplnames[0], "could not acquire lock");
              reject("could not acquire lock");

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
                var idx = _.indexOf(tmplnames, key);
                jst[key] = templates[idx];
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
          if (e.message.lastIndexOf("ENOENT", 0) == 0) // this is ok
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
          template = template.replace(/\n/g, '\n' + indent);
          template = template.replace(/ *\n */, '');
          template = template.replace(/}\n *$/, '}');
        }
        return template;
    };
    return new Promise(function(resolve, reject) {
      var data = [];
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
      footer.push(indent + "return " + namespace + ";");
      footer.push("});");
      footer.push("");
      output.push(footer.join("\n"));
      resolve();
    });
  };

  var writeOutputFile = function() {
    return new Promise(function(resolve, reject) {
      mkdirp(path.dirname(outputFile), function(e) {
        if (e) reject(e);
        else {
          fs.truncate(outputFile, 0, function(e) {
            if (e) {
              if (e.message.lastIndexOf("ENOENT",0) != 0) {
                reject(e);
                return;
              }
            }
            fs.writeFile(outputFile, output.join(options.separator), "utf8", function(e) {
              if (e) {
                console.log("write error: " + e);
                reject(e);
              }
              else {
                tmplfullnames.forEach(function(fullname, idx) {
                  logSuccess(fullname);
                });
                resolve();
              }
            });
          });
        }
      });
    });
  };

  var compressOutputFile = function() {
    return new Promise(function(resolve, reject) {
      if (!options.gzipOptions) {
        resolve();
        return;
      }
      var exec = require('child_process').exec;
      var cmd = 'gzip -9fk ' + outputFile;
      exec(cmd, function(e, stdout, stderr) {
        if (e)
          reject(e);
        else
          resolve();
      });
    });
  };

  var releaseTargetLock = function() {
    return new Promise(function(resolve, reject) {
      fs.unlink(outputFile + ".lock", function(err) {
        if (err) reject(err.message); // should we just resolve regardless?
        else resolve();
      });
    });
  };

  var writeConsoleResults = function() {
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
      if (problems.length === 0)
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
    .then(writeOutputFile)
    .then(compressOutputFile).catch(enterThenChainAgain)
    .then(releaseTargetLock)
    .then(writeConsoleResults)
    .then(completed)
    .done();
})()
