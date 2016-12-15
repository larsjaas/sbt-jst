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
    return {
      namespace: curPath,
      declaration: output.join('\n')
    };

  };

  function parseDone() {
    if (--sourcesToProcess === 0)
      writeOutput()
  }

  function writeDone() {
    console.log("\u0010" + JSON.stringify({
      results: results,
      problems: problems
    }));
  }

  function throwIfErr(e) {
    if (e) throw e;
  }

  function writeOutput() {

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

      fs.writeFile(outputFile, output.join(options.separator), "utf8", function(e) {
        throwIfErr(e);

        writeDone();

      });
    })
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

        compiled = _.template(contents, false, templateOptions).source;
        if (!options.prettify) {
          compiled = compiled.replace(/\n/g, '');
        }

        output.push(nsInfo.namespace + '[' + JSON.stringify(filename) + '] = ' + compiled + ';')

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

      parseDone()

    })

  });

})()
