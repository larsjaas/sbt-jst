package net.matthewrennie.sbt.jst

import sbt._
import sbt.Keys._
import com.typesafe.sbt.web._
import com.typesafe.sbt.jse.SbtJsTask
import spray.json._


object Import {

  object JstKeys {
    val jst = TaskKey[Seq[File]]("jst", "Invoke the underscore template compiler")

    val separator = SettingKey[String]("jst-separator", "Concatenated files will be joined on this string. Default: linefeed + linefeed")
    val namespace = SettingKey[String]("jst-namespace", "The namespace in which the precompiled templates will be assigned. Default: JST")
    val interpolate = SettingKey[String]("jst-interpolate", "The interpolate setting passed to underscore when compiling templates. Default: null")
    val prettify = SettingKey[Boolean]("jst-prettify", "easy-to-read format that has one line per template. Default: false")
    val amd = SettingKey[Boolean]("jst-amd", "Wraps the output file with an AMD define function. Default: false")
    val outputPath = SettingKey[String]("jst-output", "The target relative url path for jst output. Defaults to ./templates.js")

  }

}

object SbtJst extends AutoPlugin {

  override def requires = SbtJsTask

  override def trigger = AllRequirements

  val autoImport = Import

  import SbtWeb.autoImport._
  import WebKeys._
  import SbtJsTask.autoImport.JsTaskKeys._
  import autoImport.JstKeys._

  val jstUnscopedSettings = Seq(
    includeFilter := GlobFilter("*.html"),

    jsOptions := JsObject(   
      "separator" -> JsString(separator.value),
      "namespace" -> JsString(namespace.value),
      "interpolate" -> JsString(interpolate.value),
      "prettify" -> JsBoolean(prettify.value),      
      "amd" -> JsBoolean(amd.value),
      "outputPath" -> JsString(outputPath.value)
    ).toString()
  )

  override def projectSettings = Seq(
    separator := "\n\n",
    namespace := "JST",
    interpolate := "",
    prettify := false,
    amd := false,
    outputPath := "./templates.js"

  ) ++ inTask(jst) (
    SbtJsTask.jsTaskSpecificUnscopedSettings ++
      inConfig(Assets)(jstUnscopedSettings) ++
      inConfig(TestAssets)(jstUnscopedSettings) ++
      Seq(
        moduleName := "jst",
        shellFile := getClass.getClassLoader.getResource("jst-shell.js"),

        taskMessage in Assets := "Jst compiling",
        taskMessage in TestAssets := "Jst test compiling"
      )
  ) ++ SbtJsTask.addJsSourceFileTasks(jst) ++ Seq(
    jst in Assets := (jst in Assets).dependsOn(webModules in Assets).value,
    jst in TestAssets := (jst in TestAssets).dependsOn(webModules in TestAssets).value
  )

}