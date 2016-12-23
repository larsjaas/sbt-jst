sbt-jst
=======

[sbt-web](https://github.com/sbt/sbt-web) plugin that precompiles [Underscore](http://underscorejs.org) templates to JST files.

Based on [sbt-jst](http://github.com/matthewrennie/sbt-jst) by Matthew Rennie, which was based on [grunt-contrib-jst](https://www.npmjs.org/package/grunt-contrib-jst).


To use my version from Github, add the following to the `project/plugins.sbt` of your project:

```scala
    lazy val root = project.in(file(".")).dependsOn(sbtJst)
    lazy val sbtJst = uri("git://github.com/larsjaas/sbt-jst")
```

Your project's build file also needs to enable sbt-web plugins. For example with build.sbt:

```scala
    lazy val root = (project in file(".")).enablePlugins(SbtWeb)
```

The following option are supported:

Option              | Description
--------------------|------------
separator           | Concatenated files will be joined on this string.
namespace           | The namespace in which the precompiled templates will be assigned.
interpolate         | The interpolate setting passed to underscore when compiling templates.
prettify            | easy-to-read format that has one line per template.
amd                 | Wraps the output file with an AMD define function.
outputPath          | The target relative url path for jst output.
aggregate           | Read in the output file to aggregate templates.
gzipOptions         | To add gzip-compression to the template generation.

The following sbt code illustrates how to wrap an output file with an AMD define function

```scala
JstKeys.amd in Assets := true
```

To aggregate all html files into the jst template file, and gzip-compress the file afterwards, use

```scala
JstKeys.aggregate in Assets := true
JstKeys.gzipOptions in Assets := "-9kf"
```

To include all html files for precompilation, use:

```scala
includeFilter in (Assets, JstKeys.jst) := "*.html"
```

Dependencies
============

If you get problems with dependencies in node, try the commands below that look relevant:

```sh
npm install underscore --save
npm install promise --save
```

Plans
=====

I figure the 'amd' option will be removed in the not too long future and just enforced,
and the options 'separator' and 'namespace' will be removed in the same go as they do not
make much sense in the amd:=true setting.  The 'aggregate' option might also just
disappear and always be on.

