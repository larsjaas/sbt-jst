sbt-jst
========

[sbt-web](https://github.com/sbt/sbt-web) plugin that precompiles [Underscore](http://underscorejs.org) templates to JST files. Based on [grunt-contrib-jst](https://www.npmjs.org/package/grunt-contrib-jst).

To use the latest version from Github, add the following to the `project/plugins.sbt` of your project:

```scala
    lazy val root = project.in(file(".")).dependsOn(sbtJst)
    lazy val sbtJst = uri("git://github.com/matthewrennie/sbt-jst")
```scala

Your project's build file also needs to enable sbt-web plugins. For example with build.sbt:

```scala
    lazy val root = (project in file(".")).enablePlugins(SbtWeb)
```scala

The following option are supported:

Option              | Description
--------------------|------------
separator           | Concatenated files will be joined on this string.
namespace           | The namespace in which the precompiled templates will be assigned.
interpolate         | The interpolate setting passed to underscore when compiling templates.
prettify            | easy-to-read format that has one line per template.
amd                 | Wraps the output file with an AMD define function.
outputPath          | The target relative url path for jst output.
    
The following sbt code illustrates how to wrap an output file with an AMD define function

```scala
JstKeys.amd in Assets := true
```

To include all html files for precompilation, use:

```scala
includeFilter in (Assets, JstKeys.jst) := "*.html"
```