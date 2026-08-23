name: Crear EduGo APK

on:
  workflow_dispatch:
  push:
    paths:
      - 'EduGo_prototipo.html'
      - '.github/workflows/build-apk.yml'

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Descargar proyecto
        uses: actions/checkout@v4

      - name: Configurar Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Crear proyecto Android
        run: |
          mkdir -p app/src/main/java/com/edugo/app
          mkdir -p app/src/main/assets

          cp EduGo_prototipo.html app/src/main/assets/index.html

          cat > settings.gradle <<'EOF'
          pluginManagement {
              repositories {
                  google()
                  mavenCentral()
                  gradlePluginPortal()
              }
          }
          dependencyResolutionManagement {
              repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
              repositories {
                  google()
                  mavenCentral()
              }
          }
          rootProject.name = "EduGo"
          include(":app")
          EOF

          cat > build.gradle <<'EOF'
          plugins {
              id 'com.android.application' version '8.7.3' apply false
          }
          EOF

          cat > app/build.gradle <<'EOF'
          plugins {
              id 'com.android.application'
          }

          android {
              namespace 'com.edugo.app'
              compileSdk 35

              defaultConfig {
                  applicationId 'com.edugo.app'
                  minSdk 23
                  targetSdk 35
                  versionCode 1
                  versionName '1.0'
              }
          }
          EOF

          cat > app/src/main/AndroidManifest.xml <<'EOF'
          <manifest xmlns:android="http://schemas.android.com/apk/res/android">
              <uses-permission android:name="android.permission.INTERNET" />

              <application
                  android:theme="@style/AppTheme"
                  android:label="EduGo"
                  android:usesCleartextTraffic="true">
                  <activity
                      android:name=".MainActivity"
                      android:screenOrientation="portrait"
                      android:exported="true">
                      <intent-filter>
                          <action android:name="android.intent.action.MAIN" />
                          <category android:name="android.intent.category.LAUNCHER" />
                      </intent-filter>
                  </activity>
              </application>
          </manifest>
          EOF

          mkdir -p app/src/main/res/values

          cat > app/src/main/res/values/styles.xml <<'EOF'
          <resources>
              <style name="AppTheme" parent="android:style/Theme.Material.Light.NoActionBar">
                  <item name="android:fontFamily">sans</item>
                  <item name="android:colorAccent">#6750A4</item>
                  <item name="android:navigationBarColor">#000000</item>
                  <item name="android:statusBarColor">#6750A4</item>
              </style>
          </resources>
          EOF

          cat > app/src/main/java/com/edugo/app/MainActivity.java <<'EOF'
          package com.edugo.app;

          import android.app.Activity;
          import android.os.Bundle;
          import android.webkit.WebView;
          import android.webkit.WebSettings;

          public class MainActivity extends Activity {
              @Override
              protected void onCreate(Bundle savedInstanceState) {
                  super.onCreate(savedInstanceState);

                  WebView webView = new WebView(this);
                  WebSettings settings = webView.getSettings();

                  settings.setJavaScriptEnabled(true);
                  settings.setDomStorageEnabled(true);
                  settings.setAllowFileAccess(true);

                  webView.loadUrl("file:///android_asset/index.html");

                  setContentView(webView);
              }
          }
          EOF

          gradle wrapper --gradle-version 8.9

      - name: Compilar APK
        run: |
          chmod +x gradlew
          ./gradlew assembleDebug

      - name: Guardar EduGo APK
        uses: actions/upload-artifact@v4
        with:
          name: EduGo-APK
          path: app/build/outputs/apk/debug/app-debug.apk
