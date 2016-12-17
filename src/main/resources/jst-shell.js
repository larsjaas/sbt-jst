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
    _ = require('underscore'),
    mkdirp = require("mkdirp"),
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
  var nsInfo = getNamespaceDeclaration(options.namespace);
  var outputFile = path.join(target, options.outputPath);

  function getNamespaceDeclaration(ns) {
    var output = [];
    var curPath = 'this';
    if (ns !== 'this') {
      var nsParts = ns.split('.');
      nsParts.forEach(function(curPart, index) {
        if (curPart !== 'this') {
          curPath += '[' + JSON.stringify(curPart) + ']';
          output.push(curPath + ' = ' + curPath + ' || {};');
        }
      });
    }
    output.push('  var _ns = ' + curPath + ';');
    output.push('');
    output.push('  var _instate = function(n,args){');
    output.push('    var f = _ns[n+"_s"];');
    output.push('    try{eval("_ns[n]="+f);}catch(e){console.log("error:"+e.message);return "";}');
    output.push('    return _ns[n].apply(this,args);');
    output.push('  };');
    return {
      namespace: curPath,
      declaration: output.join('\n')
    };

  };

  function parseDone(filename) {
    if (--sourcesToProcess === 0) {
      writeOutput(filename)
    }
  }

  function throwIfErr(e) {
    if (e) throw e;
  }

  function doUnlock() {
    //fs.unlink(options.outputPath+".lck");
    fs.unlink("file.lck");
  }

  function writeDone(path) {
    console.log("\u0010" + JSON.stringify({
      results: results,
      problems: problems
    }));
    doUnlock(path);
  }


  function lockOutput(currentFile, then, count) {
    if (!count) count = 1;
    //fs.symlink(options.outputPath+".lck", options.outputPath, function(e) {
    fs.symlink("file", "file.lck", function(e) {
      if (e) {
          if (count > 60) {
              console.log("failed lock-acquiring 60 times");
              throw "unable to symlink file.lck: " + e.message;
          }
          setTimeout( function() { lockOutput(currentFile, then, count + 1); }, 200);
      }
      else {
          console.log("jst: updating " + currentFile);
          then(currentFile);
      }
    });
  }

  function writeOutput(currentFile) {
    lockOutput(currentFile, writeOutputAfterLocked);
  }

  function writeOutputAfterLocked(filename) {
    var outputFile = path.join(target, options.outputPath);
    var jst = {};
    fs.readFile(outputFile, "utf8", function(e, contents) {
      if (!e) {
        try {
          var define = define || function(arg) { return arg; }
          var jst = eval(contents);
          jst = jst();
          writeOutputAfterLockedWithJST(filename, jst);
        }
        catch(e) {
          console.log("readFile eval() error: " + e.message);
          writeOutputAfterLockedWithJST(filename, {});
        }
      } else {
        if (e.message.indexOf("ENOENT") != 0)
          console.log("read error: " + e.message);
        writeOutputAfterLockedWithJST(filename, {});
      }
    });
  }

  function writeOutputAfterLockedWithJST(filename, jst) {

    _.forEach(_.keys(jst), function(key) {
        if (key != filename && key.indexOf("_s") != -1) {
          var name = key.substring(0, key.length-7);
          output.push(nsInfo.namespace + '[' + JSON.stringify(key) + '] = ' + JSON.stringify(jst[key]) + ';');
          output.push(nsInfo.namespace + '[' + JSON.stringify(name) + '] = ' + instateTemplate(name) + ';');
        }
    });

    output.unshift(nsInfo.declaration);

    if (options.amd) {
      if (options.prettify) {
        output.forEach(function(line, index) {
          output[index] = "  " + line;
        });
      }
      output.unshift("define(function(){");
      output.push("  return " + nsInfo.namespace + ";");
      output.push("});");
    }

    mkdirp(path.dirname(outputFile), function(e) {
      fs.truncate(outputFile,0,function(e) {
          // throwIfErr(e);
          fs.writeFile(outputFile, output.join(options.separator), "utf8", function(e) {
            throwIfErr(e);
            writeDone(filename);
          });
      });
    });
  }

  function instateTemplate(name) {
    return "function(){return _instate('" + name + "',arguments);}";
  }

  sourceFileMappings.forEach(function(sourceFileMapping) {

    var inputFile = sourceFileMapping[0];
    var filename = sourceFileMapping[1];
    var compiled;

    fs.readFile(inputFile, "utf8", function(e, contents) {
      throwIfErr(e);

      try {

        var templateOptions

        if (options.interpolate !== "")
          templateOptions = {
            interpolate: options.interpolate
          };
        else
          templateOptions = {};

        compiled = _.template(contents, null, templateOptions).source;
        if (!options.prettify) {
          compiled = compiled.replace(/\n/g, '');
        }

        output.push(nsInfo.namespace + '[' + JSON.stringify(filename) + '] = ' + instateTemplate(filename) + ';');
        output.push(nsInfo.namespace + '[' + JSON.stringify(filename+"_s") + '] = ' + JSON.stringify(compiled) + ';');

        results.push({
          source: inputFile,
          result: {
            filesRead: [inputFile],
            filesWritten: [outputFile]
          }
        });

      } catch (e) {

        problems.push({
          message: inputFile + " failed to compile",
          severity: "error",
          source: inputFile
        });

        results.push({
          source: inputFile,
          result: null
        });

      }

      parseDone(filename);

    });

  });

})()
